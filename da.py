import os
import sys
import time
import argparse
import json
import google.generativeai as genai
from rich.console import Console
from pygments import highlight
from pygments.lexers import get_lexer_by_name
from pygments.formatters import ImageFormatter

console = Console()

MODELS = {
    "flash": "gemini-1.5-flash",
    "pro": "gemini-1.5-pro"
}

def renderizar_codigo_a_imagen(codigo, filename, output_path):
    try:
        lexer = get_lexer_by_name("php", stripall=True)
        formatter = ImageFormatter(font_name="DejaVu Sans Mono", font_size=20, line_numbers=True, style="monokai")
        with open(output_path, "wb") as f:
            f.write(highlight(codigo, lexer, formatter))
        return True
    except Exception as e:
        console.print(f"[red]Error al renderizar imagen: {e}[/red]")
        return False

def append_to_docx(doc_obj, text):
    text = "".join(c for c in text if c.isprintable() or c in "\n\r\t")
    lineas = text.split('\n')
    for linea in lineas:
        if linea.startswith('# '):
            doc_obj.add_heading(linea[2:], level=1)
        elif linea.startswith('## '):
            doc_obj.add_heading(linea[3:], level=2)
        elif linea.startswith('### '):
            doc_obj.add_heading(linea[4:], level=3)
        elif linea.startswith('- ') or linea.startswith('* '):
            doc_obj.add_paragraph(linea[2:], style='List Bullet')
        else:
            doc_obj.add_paragraph(linea)

def generar_doc_yield(path, modelo_alias, formato='md', provider='gemini', api_key=None, template=None, custom_prompt=None, resume=True):
    start_time = time.time()
    nombre_proyecto = os.path.basename(os.path.abspath(path))
    
    # 1. Escaneo Inicial
    archivos_totales = []
    ignorar_dirs = ['vendor', 'node_modules', 'storage', 'public', 'tests', 'database', 'dist', 'build', '.git']
    ignorar_files = ['webpack.mix.js', 'tailwind.config.js', 'package-lock.json']
    
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignorar_dirs and not d.startswith('.')]
        for file in files:
            # Filtro por extensión
            if file.endswith(('.php', '.js', '.vue')):
                # No analizar archivos minificados o bundles comunes
                if file.endswith('.min.js') or file in ignorar_files:
                    continue
                
                full_p = os.path.join(root, file)
                rel_path = os.path.relpath(full_p, path)
                
                try:
                    with open(full_p, "r", encoding="utf-8", errors="ignore") as f:
                        lineas = f.readlines()
                        
                    # ⚠️ FILTRO DE ORO: Si tiene más de 1000 líneas, probablemente no sea código "humano" de este proyecto
                    if len(lineas) > 1000:
                        continue
                        
                    archivos_totales.append((rel_path, full_p))
                except: continue

    total_bloques = 0
    for _, full_p in archivos_totales:
        try:
            with open(full_p, "r", encoding="utf-8", errors="ignore") as f:
                total_bloques += (len(f.readlines()) // 100) + 1
        except: continue

    yield {"status": "Iniciando...", "progress": 5, "total_bloques": total_bloques}
    
    # Checkpoint
    checkpoint_file = os.path.join(path, ".auditor_state.json")
    last_state = None
    if resume and os.path.exists(checkpoint_file):
        try:
            with open(checkpoint_file, "r") as f:
                last_state = json.load(f)
            yield {"log": f"🔄 Reanudando desde {last_state.get('idx_arch', 0)}"}
        except: pass

    # Configurar Clientes
    if provider == 'openrouter':
        from openai import OpenAI
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    else:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(MODELS.get(modelo_alias, modelo_alias))

    os.makedirs("docs_laravel", exist_ok=True)
    out_file = f"docs_laravel/auditoria_{nombre_proyecto.lower()}.{formato}"
    doc_obj = None
    if formato == 'docx':
        from docx import Document
        doc_obj = Document(os.path.join("templates", template)) if template and os.path.exists(os.path.join("templates", template)) else Document()
    
    bloques_procesados = 0

    # 2. Bucle Principal
    for idx_arch, (rel_path, full_path) in enumerate(archivos_totales):
        if last_state and idx_arch < last_state.get('idx_arch', 0):
            # Contar bloques de archivos saltados para el progreso
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    bloques_procesados += (len(f.readlines()) // 100) + 1
            except: pass
            continue
            
        yield {"log": f"📖 Analizando {rel_path}..."}
        
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                lineas = f.readlines()
        except: continue

        for i in range(0, len(lineas), 100):
            if last_state and idx_arch == last_state.get('idx_arch', 0) and i <= last_state.get('block_idx', -1):
                bloques_procesados += 1
                continue

            bloque_codigo = "".join(lineas[i:i+100])
            num_bloque = (i // 100) + 1
            bloques_procesados += 1
            
            # 📸 CAPTURA DE CÓDIGO (Solo para DOCX)
            img_path = None
            if formato == 'docx':
                img_path = f"temp_{idx_arch}_{num_bloque}.png"
                renderizar_codigo_a_imagen(bloque_codigo, rel_path, img_path)

            # Reintentos
            intentos = 0
            exito = False
            texto_explicacion = ""
            while intentos < 3 and not exito:
                try:
                    p = custom_prompt.replace("{{CODE}}", bloque_codigo).replace("{{PROJECT}}", nombre_proyecto).replace("{{FILE}}", rel_path).replace("{{RANGE}}", f"{i+1}-{i+len(lineas[i:i+100])}") if custom_prompt else f"Analiza: {bloque_codigo}"
                    
                    if provider == 'openrouter':
                        res = client.chat.completions.create(
                            model=modelo_alias, 
                            messages=[{"role": "user", "content": p}],
                            timeout=60 # Límite de 60 segundos por bloque
                        )
                        if res and res.choices and len(res.choices) > 0:
                            texto_explicacion = res.choices[0].message.content or "Sin respuesta del modelo."
                            exito = True
                        else:
                            raise Exception("OpenRouter devolvió una respuesta vacía.")
                    else:
                        res = model.generate_content(p)
                        if res and res.text:
                            texto_explicacion = res.text
                            exito = True
                        else:
                            raise Exception("Gemini devolvió una respuesta vacía.")
                            
                except (KeyboardInterrupt, GeneratorExit):
                    raise
                except Exception as e:
                    intentos += 1
                    yield {"log": f"⚠️ Intento {intentos}/3: {str(e)}"}
                    time.sleep(5 * intentos) # Espera un poco más entre reintentos

            if not exito:
                yield {"error": "Error fatal. Reintenta más tarde.", "fatal": True}
                return

            # Guardar
            if formato == 'docx':
                from docx.shared import Inches
                doc_obj.add_heading(f"Archivo: {rel_path} (Bloque {num_bloque})", level=2)
                if img_path and os.path.exists(img_path):
                    doc_obj.add_picture(img_path, width=Inches(6))
                    os.remove(img_path)
                append_to_docx(doc_obj, texto_explicacion)
                doc_obj.save(out_file)
            else:
                with open(out_file, "a", encoding="utf-8") as f:
                    f.write(f"## {rel_path} - Bloque {num_bloque}\n\n{texto_explicacion}\n\n")

            # Checkpoint
            with open(checkpoint_file, "w") as f:
                json.dump({"idx_arch": idx_arch, "block_idx": i}, f)
            
            yield {"progress": int(10 + (bloques_procesados/total_bloques)*88), "log": f"✅ {rel_path} B{num_bloque} OK"}

    # Limpiar checkpoint al finalizar
    if os.path.exists(checkpoint_file): os.remove(checkpoint_file)
    yield {"status": "Completado", "progress": 100, "file": out_file}

def generar_doc_proyecto(path, modelo_alias, formato='md', provider='gemini', api_key=None):
    for update in generar_doc_yield(path, modelo_alias, formato, provider=provider, api_key=api_key):
        if "log" in update: print(update['log'])

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    args = parser.parse_args()
    generar_doc_proyecto(args.path, "pro")