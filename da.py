import os
import sys
import argparse
import google.generativeai as genai
import time
import json
from pygments import highlight
from pygments.lexers import get_lexer_for_filename, TextLexer
from pygments.formatters import ImageFormatter
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table
from rich import print as rprint
from dotenv import load_dotenv

# Cargar variables desde archivo .env
load_dotenv()

# Configuración de estilos para las "capturas" de código en Word
STYLE = 'monokai'
FONT_SIZE = 12
LINE_NUMBERS = True

def renderizar_codigo_a_imagen(codigo, filename, output_path):
    """Convierte un bloque de código en una imagen PNG con resaltado de sintaxis."""
    try:
        try:
            lexer = get_lexer_for_filename(filename)
        except:
            lexer = TextLexer()
            
        formatter = ImageFormatter(
            style=STYLE,
            font_size=FONT_SIZE,
            line_numbers=LINE_NUMBERS,
            font_name='DejaVu Sans Mono'
        )
        
        with open(output_path, 'wb') as f:
            f.write(highlight(codigo, lexer, formatter))
        return True
    except Exception as e:
        console.print(f"[yellow]⚠️ No se pudo renderizar imagen para {filename}: {e}[/yellow]")
        return False

# Configuración de escaneo
EXCLUDE_DIRS = {'vendor', 'node_modules', 'storage', 'public', '.git', 'tests', 'bootstrap'}
MODELS = {"flash": "gemini-1.5-flash", "pro": "gemini-3.1-flash-lite-preview"}
INCLUDE_EXTENSIONS = {'.php', '.env', '.json', '.blade.php'}

console = Console()

def leer_archivo_con_lineas(ruta):
    if os.path.exists(ruta):
        try:
            with open(ruta, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                return "".join([f"{i+1}: {l}" for i, l in enumerate(lines)])
        except Exception as e:
            return f"Error al leer {ruta}: {str(e)}"
    return None

def obtener_contexto_composer(path):
    composer_path = os.path.join(path, 'composer.json')
    if os.path.exists(composer_path):
        try:
            with open(composer_path, 'r') as f:
                data = json.load(f)
                deps = {**data.get('require', {}), **data.get('require-dev', {})}
                return ", ".join([f"{k} ({v})" for k, v in deps.items() if '/' in k])
        except:
            return "No se pudo leer composer.json"
    return "No se encontró composer.json"

def obtener_entidad(rel_path):
    """Extrae el nombre de la entidad de una ruta (ej: UserController -> User)"""
    basename = os.path.basename(rel_path).split('.')[0]
    for suffix in ['Controller', 'Request', 'Resource', 'Observer', 'Policy', 'Job', 'Service', 'Table']:
        if suffix in basename and len(basename) > len(suffix):
            return basename.replace(suffix, '')
    return basename

def escanear_proyecto_flujos(base_path):
    base_path = os.path.abspath(base_path)
    entidades = {}
    miscelaneo = []

    with console.status("[bold green]Escaneando estructura del proyecto..."):
        for root, dirs, files in os.walk(base_path):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for file in files:
                if any(file.endswith(ext) for ext in INCLUDE_EXTENSIONS):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, base_path)
                    
                    if os.path.getsize(full_path) > 150 * 1024:
                        continue

                    entidad = obtener_entidad(rel_path)
                    
                    # Agrupar por entidad si parece ser parte de la lógica central
                    if any(x in rel_path for x in ['app/Models', 'app/Http/Controllers', 'app/Http/Requests']):
                        if entidad not in entidades: entidades[entidad] = []
                        entidades[entidad].append((rel_path, full_path))
                    else:
                        miscelaneo.append((rel_path, full_path))

    return entidades, miscelaneo

def append_to_docx(doc, texto):
    for line in texto.split('\n'):
        clean_line = line.strip()
        if not clean_line: continue
        if clean_line.startswith('###'):
            doc.add_heading(clean_line.replace('###', '').strip(), level=1)
        elif clean_line.startswith('##'):
            doc.add_heading(clean_line.replace('##', '').strip(), level=2)
        elif clean_line.startswith('**') and clean_line.endswith('**'):
            doc.add_paragraph().add_run(clean_line.replace('**', '').strip()).bold = True
        elif clean_line.startswith('-'):
            doc.add_paragraph(clean_line, style='List Bullet')
        else:
            doc.add_paragraph(clean_line)

def modo_interactivo():
    console.print(Panel.fit("[bold cyan]🚀 LARAVEL AUDITOR PRO[/bold cyan]\n[dim]Manual Técnico Inteligente[/dim]", border_style="blue"))
    
    path = console.input("\n[bold yellow]📂 Ruta del proyecto[/bold yellow] (Enter para './'): ").strip() or "./"
    if not os.path.isdir(path):
        console.print(f"[red]❌ Error: '{path}' no es un directorio válido.[/red]")
        return None, None, None

    table = Table(title="Modelos Disponibles", show_header=True, header_style="bold magenta")
    table.add_column("ID", style="dim")
    table.add_column("Nombre", style="bold")
    table.add_row("1", "Gemini 1.5 Flash (Veloz)")
    table.add_row("2", "Gemini 3.1 Flash Lite (Equilibrado)")
    console.print(table)
    
    choice_m = console.input("Selección (1/2, default 1): ").strip() or "1"
    model = "flash" if choice_m == "1" else "pro"

    choice_f = console.input("\n[bold yellow]📄 Formato[/bold yellow] (1: MD, 2: DOCX, default 1): ").strip() or "1"
    format = "md" if choice_f == "1" else "docx"
    
    return path, model, format

def generar_doc_yield(path, modelo_alias, formato='md', provider='gemini', api_key=None, template=None):
    """Versión generador con Análisis Global y ETA."""
    start_time = time.time()
    nombre_proyecto = os.path.basename(os.path.abspath(path))
    contexto_composer = obtener_contexto_composer(path)
    
    yield {"status": "Escaneando estructura global...", "progress": 2}
    entidades, miscelaneo = escanear_proyecto_flujos(path)
    
    # Generar Mapa del Proyecto (Tree)
    tree_text = ""
    total_bloques = 0
    for entidad, archivos in entidades.items():
        tree_text += f"\n[Flujo: {entidad}]\n"
        for rel, full in archivos:
            tree_text += f"  - {rel}\n"
            # Calcular bloques (estimado)
            try:
                with open(full, 'r', errors='ignore') as f:
                    total_bloques += (len(f.readlines()) // 100) + 1
            except: total_bloques += 1
            
    for i in range(0, len(miscelaneo), 10):
        for rel, full in miscelaneo[i:i+10]:
            tree_text += f"  - {rel}\n"
            try:
                with open(full, 'r', errors='ignore') as f:
                    total_bloques += (len(f.readlines()) // 100) + 1
            except: total_bloques += 1

    # Fase de Análisis Inicial (Contexto Global)
    yield {"status": "IA realizando análisis inicial...", "progress": 5, "log": "🧠 Generando visión global del proyecto..."}
    
    # Configurar Cliente
    client = None
    model = None
    if provider == 'openrouter':
        from openai import OpenAI
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    else:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(MODELS.get(modelo_alias, modelo_alias))

    initial_prompt = f"Analiza esta estructura de archivos de un proyecto Laravel y dame un resumen muy breve (2 párrafos) de su arquitectura y complejidad estimada:\n\n{tree_text}"
    resumen_inicial = ""
    try:
        if provider == 'openrouter':
            res = client.chat.completions.create(model=modelo_alias, messages=[{"role": "user", "content": initial_prompt}])
            resumen_inicial = res.choices[0].message.content
        else:
            res = model.generate_content(initial_prompt)
            resumen_inicial = res.text
        yield {"log": f"  [IA]: {resumen_inicial}", "streaming": True}
    except:
        resumen_inicial = "Análisis inicial no disponible."

    os.makedirs("docs_laravel", exist_ok=True)
    out_file = f"docs_laravel/auditoria_{nombre_proyecto.lower()}.{formato}"
    doc_obj = None
    if formato == 'docx':
        from docx import Document
        doc_obj = Document(os.path.join("templates", template)) if template and os.path.exists(os.path.join("templates", template)) else Document()
        doc_obj.add_heading(f'Auditoría Técnica: {nombre_proyecto}', 0)
        doc_obj.add_heading('Resumen de Arquitectura', level=1)
        doc_obj.add_paragraph(resumen_inicial)
    else:
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(f"# Auditoría Técnica: {nombre_proyecto}\n\n## Resumen de Arquitectura\n{resumen_inicial}\n\n")

    cola_procesamiento = []
    for entidad, archivos in entidades.items():
        cola_procesamiento.append((f"Flujo: {entidad}", archivos))
    for i in range(0, len(miscelaneo), 10):
        cola_procesamiento.append(("Archivos de Soporte", miscelaneo[i:i+10]))

    bloques_procesados = 0
    yield {"status": "Iniciando auditoría detallada...", "progress": 10, "total_bloques": total_bloques}
    
    for idx, (titulo, archivos) in enumerate(cola_procesamiento):
        for rel_path, full_path in archivos:
            yield {"log": f"📖 Analizando {rel_path}..."}
            
            # Leer archivo y dividir en bloques de 100 líneas
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    lineas = f.readlines()
            except:
                continue

            for i in range(0, len(lineas), 100):
                bloque_codigo = "".join(lineas[i:i+100])
                num_bloque = (i // 100) + 1
                bloques_procesados += 1
                
                # Calcular Progreso Real
                prog_actual = int(10 + (bloques_procesados / total_bloques) * 88)
                yield {"status": f"Procesando {os.path.basename(rel_path)}...", "progress": min(prog_actual, 99)}
                
                # 1. Renderizar imagen (solo para DOCX)
                img_path = None
                if formato == 'docx':
                    img_path = f"temp_block_{idx}_{num_bloque}.png"
                    renderizar_codigo_a_imagen(bloque_codigo, rel_path, img_path)
                
                # 2. Preparar Prompt para este bloque específico
                    prompt = f"""
                    Actúa como Arquitecto de Software Senior y Revisor de Código.
                    Proyecto: {nombre_proyecto}
                    Archivo: {rel_path}
                    Rango de líneas analizadas: {i+1} a {i+len(lineas[i:i+100])}

                    TAREA:
                    Realiza una explicación técnica exhaustiva "línea por línea" del código proporcionado. 
                    Debes agrupar las líneas por bloques lógicos (ej: una función, un ciclo, una validación) pero sin saltarte ninguna línea.

                    ESTRUCTURA DE RESPUESTA REQUERIDA:
                    Para cada bloque lógico, utiliza el siguiente formato:
                    - **[Líneas X - Y]**: [Nombre del componente/lógica]
                    - **Propósito**: Explicación breve de qué intenta resolver este segmento.
                    - **Análisis**: Explicación detallada de la lógica, mencionando variables clave y cómo interactúan.

                    REGLAS CRÍTICAS:
                    1. Si una función comienza en la línea 50 y termina en la 60, el bloque debe abarcar exactamente esas líneas y explicar la firma, el cuerpo y el retorno.
                    2. Identifica patrones de diseño de Laravel (Inyección de dependencias, Eloquent, Middlewares, etc.) donde aparezcan.
                    3. Sé técnico: habla de complejidad, tipos de datos y flujo de control.

                    CÓDIGO CON NÚMEROS DE LÍNEA:
                    {bloque_codigo}
                    """

                try:
                    # 3. Obtener respuesta de IA con STREAMING para ver "cómo piensa"
                    texto_explicacion = ""
                    yield {"log": f"🧠 IA Analizando bloque {num_bloque}..."}
                    
                    if provider == 'openrouter':
                        # Streaming para OpenRouter
                        response = client.chat.completions.create(
                            model=modelo_alias,
                            messages=[{"role": "user", "content": prompt}],
                            stream=True
                        )
                        for chunk in response:
                            content = chunk.choices[0].delta.content
                            if content:
                                texto_explicacion += content
                                # Enviamos el fragmento al log (limpiamos un poco el texto para el log)
                                yield {"log": f"  [IA]: {content.strip()}", "streaming": True}
                    else:
                        # Streaming para Gemini
                        response = model.generate_content(prompt, stream=True)
                        for chunk in response:
                            if chunk.text:
                                texto_explicacion += chunk.text
                                yield {"log": f"  [IA]: {chunk.text.strip()}", "streaming": True}

                    # 4. Insertar en el documento (una vez completado el stream)
                    if formato == 'docx':
                        from docx.shared import Inches
                        doc_obj.add_heading(f"Archivo: {rel_path} (Líneas {i+1}-{i+len(lineas[i:i+100])})", level=2)
                        if img_path and os.path.exists(img_path):
                            doc_obj.add_picture(img_path, width=Inches(6))
                            os.remove(img_path)
                        append_to_docx(doc_obj, texto_explicacion)
                        doc_obj.save(out_file)
                    else:
                        with open(out_file, "a", encoding="utf-8") as f:
                            f.write(f"## Archivo: {rel_path} (Líneas {i+1}-{i+len(lineas[i:i+100])})\n\n")
                            f.write("```php\n" + bloque_codigo + "\n```\n\n")
                            f.write(texto_explicacion + "\n\n")
                    
                    yield {"log": f"✅ Bloque {num_bloque} analizado correctamente."}
                    time.sleep(0.5)
                except Exception as e:
                    yield {"log": f"❌ Error en IA: {str(e)}"}

    yield {
        "status": "Completado", 
        "progress": 100, 
        "file": out_file,
        "log": f"✅ Manual finalizado en {time.time() - start_time:.2f}s"
    }

def generar_doc_proyecto(path, modelo_alias, formato='md', provider='gemini', api_key=None):
    """Versión para CLI que consume el generador."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console
    ) as progress:
        
        task = progress.add_task("[cyan]Iniciando...", total=100)
        
        for update in generar_doc_yield(path, modelo_alias, formato, provider=provider, api_key=api_key):
            if "status" in update:
                progress.update(task, description=f"[cyan]{update['status']}")
            if "progress" in update:
                progress.update(task, completed=update['progress'])
            if "log" in update:
                progress.console.print(update['log'])
            if "file" in update:
                console.print(Panel(f"[bold green]✅ Manual completado[/bold green]\n[dim]Ubicación: {update['file']}[/dim]", title="Resultado"))

if __name__ == "__main__":
    if len(sys.argv) == 1:
        path, model, format = modo_interactivo()
        if path: generar_doc_proyecto(path, model, format)
    else:
        parser = argparse.ArgumentParser()
        parser.add_argument("path")
        parser.add_argument("-m", "--model", choices=["flash", "pro"], default="pro")
        parser.add_argument("-f", "--format", choices=["md", "docx"], default="md")
        parser.add_argument("-p", "--provider", choices=["gemini", "openrouter"], default="gemini")
        args = parser.parse_args()
        
        if os.path.isdir(args.path):
            generar_doc_proyecto(args.path, args.model, args.format, provider=args.provider)
        else:
            console.print(f"[red]❌ Error: '{args.path}' no es un directorio válido.[/red]")