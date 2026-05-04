import os
import sys
import argparse
import google.generativeai as genai
import time

# Configuración de API (Preservado)
genai.configure(api_key=os.getenv("GEMINI_API_KEY", "AIzaSyASnIUYkecWi3ZMhDaw_j2VdgC0fTChKhk"))

MODELS = {"flash": "gemini-1.5-flash", "pro": "gemini-3.1-flash-lite-preview"}

# Directorios a ignorar completamente
EXCLUDE_DIRS = {'vendor', 'node_modules', 'storage', 'public', '.git', 'tests', 'bootstrap'}
# Extensiones de archivos que nos interesan
INCLUDE_EXTENSIONS = {'.php', '.env', '.json', '.blade.php'}

def leer_archivo_con_lineas(ruta):
    """Lee un archivo y le añade números de línea."""
    if os.path.exists(ruta):
        try:
            with open(ruta, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                return "".join([f"{i+1}: {l}" for i, l in enumerate(lines)])
        except Exception as e:
            return f"Error al leer {ruta}: {str(e)}"
    return None

def escanear_proyecto(base_path):
    base_path = os.path.abspath(base_path)
    archivos_por_categoria = {
        "Configuración": [],
        "Modelos": [],
        "Controladores": [],
        "Migraciones": [],
        "Rutas": [],
        "Vistas": [],
        "Lógica Adicional (Jobs/Services/Observers)": []
    }

    print(f"[*] Escaneando proyecto en: {base_path}...")
    
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            if any(file.endswith(ext) for ext in INCLUDE_EXTENSIONS):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, base_path)
                
                if rel_path.startswith('app/Models'):
                    archivos_por_categoria["Modelos"].append(rel_path)
                elif rel_path.startswith('app/Http/Controllers'):
                    archivos_por_categoria["Controladores"].append(rel_path)
                elif rel_path.startswith('database/migrations'):
                    archivos_por_categoria["Migraciones"].append(rel_path)
                elif rel_path.startswith('routes/'):
                    archivos_por_categoria["Rutas"].append(rel_path)
                elif rel_path.startswith('resources/views'):
                    archivos_por_categoria["Vistas"].append(rel_path)
                elif rel_path.startswith('config/') or file in ['.env', 'composer.json']:
                    archivos_por_categoria["Configuración"].append(rel_path)
                elif any(x in rel_path for x in ['app/Jobs', 'app/Services', 'app/Observers', 'app/Policies']):
                    archivos_por_categoria["Lógica Adicional (Jobs/Services/Observers)"].append(rel_path)

    return archivos_por_categoria

def append_to_docx(doc, texto):
    """Añade texto markdown formateado a un objeto Document de python-docx."""
    for line in texto.split('\n'):
        clean_line = line.strip()
        if not clean_line:
            continue
        
        if clean_line.startswith('###'):
            doc.add_heading(clean_line.replace('###', '').strip(), level=1)
        elif clean_line.startswith('##'):
            doc.add_heading(clean_line.replace('##', '').strip(), level=2)
        elif clean_line.startswith('**') and clean_line.endswith('**'):
            p = doc.add_paragraph()
            p.add_run(clean_line.replace('**', '').strip()).bold = True
        elif clean_line.startswith('-'):
            doc.add_paragraph(clean_line, style='List Bullet')
        else:
            doc.add_paragraph(clean_line)

def modo_interactivo():
    print("\n🚀 LARAVEL AUDITOR CLI - MODO INTERACTIVO")
    print("="*45)
    
    # 1. Ruta del proyecto
    path = input("\n📂 Ruta del proyecto (Enter para './'): ").strip() or "./"
    if not os.path.isdir(path):
        print(f"❌ Error: '{path}' no es un directorio válido.")
        return None, None, None

    # 2. Selección de Modelo
    print("\n🤖 Selecciona el Modelo de IA:")
    print("1) Gemini 1.5 Flash (Veloz)")
    print("2) Gemini 3.1 Flash Lite (Tu configurado)")
    choice_m = input("Selección (1/2, default 1): ").strip() or "1"
    model = "flash" if choice_m == "1" else "pro"

    # 3. Selección de Formato
    print("\n📄 Selecciona el Formato de Salida:")
    print("1) Markdown (.md)")
    print("2) Word (.docx)")
    choice_f = input("Selección (1/2, default 1): ").strip() or "1"
    format = "md" if choice_f == "1" else "docx"
    
    print("\n" + "="*45)
    return path, model, format

def generar_doc_proyecto(path, modelo_alias, formato='md'):
    start_time = time.time()
    nombre_proyecto = os.path.basename(os.path.abspath(path))
    
    categorias = escanear_proyecto(path)
    
    # 1. Aplanar lista de archivos
    lista_archivos = []
    for cat, archivos in categorias.items():
        for rel_path in archivos:
            full_path = os.path.join(path, rel_path)
            if os.path.getsize(full_path) > 150 * 1024:
                continue
            lista_archivos.append((cat, rel_path, full_path))
    
    total_archivos = len(lista_archivos)
    if total_archivos == 0:
        print("⚠️ No se encontraron archivos para procesar.")
        return

    # 2. Configurar salida incremental
    os.makedirs("docs_laravel", exist_ok=True)
    out_file = f"docs_laravel/auditoria_{nombre_proyecto.lower()}.{formato}"
    
    doc_obj = None
    if formato == 'docx':
        try:
            from docx import Document
            doc_obj = Document()
            doc_obj.add_heading(f'Auditoría Técnica: {nombre_proyecto}', 0)
        except ImportError:
            print("\n[!] 'python-docx' no instalado. Usando Markdown por defecto.")
            formato = 'md'
            out_file = out_file.replace('.docx', '.md')

    # Limpiar archivo previo si existe (Markdown)
    if formato == 'md':
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(f"# Auditoría Técnica: {nombre_proyecto}\n\n")

    # 3. Procesar lotes
    BATCH_SIZE = 15
    total_lotes = (total_archivos + BATCH_SIZE - 1) // BATCH_SIZE
    
    print(f"🤖 Procesando {total_archivos} archivos en {total_lotes} lotes.")
    print(f"📄 Los resultados se guardarán incrementalmente en: {out_file}")

    model = genai.GenerativeModel(MODELS[modelo_alias])

    for i in range(total_lotes):
        inicio = i * BATCH_SIZE
        fin = min(inicio + BATCH_SIZE, total_archivos)
        lote = lista_archivos[inicio:fin]
        
        print(f"\n📦 [Lote {i+1}/{total_lotes}] Procesando archivos {inicio+1} al {fin}...")
        
        contexto_lote = ""
        for cat, rel_path, full_path in lote:
            contenido = leer_archivo_con_lineas(full_path)
            if contenido:
                contexto_lote += f"\n\n{'='*10} CATEGORÍA: {cat} {'='*10}\n"
                contexto_lote += f"--- ARCHIVO: {rel_path} ---\n{contenido}"

        prompt = f"""
        Actúa como un Arquitecto de Software Senior y Auditor de Seguridad especializado en Laravel.
        Proyecto: {nombre_proyecto.upper()} (Lote {i+1} de {total_lotes})

        TU MISIÓN:
        Realiza una auditoría técnica DETALLADA de cada archivo.

        FORMATO OBLIGATORIO:
        ### [Ruta del Archivo]
        **Descripción General:** Resumen.
        **Explicación del Código:**
        - **Líneas X-Y:** Detalle técnico.

        REGLA:
        NO agregar notas si el código es  incorrecto o puede ser mejorado, el objetivo es hacer un manual de sistema para futuros desarroladores que toquen el sistema. OJO NO ES UNA AUDITORIA DE SEGURIDAD, ES UN MANUAL TECNICO DEL SISTEMA.
        
        CÓDIGO:
        {contexto_lote}
        """

        try:
            response = model.generate_content(prompt)
            texto_lote = response.text
            
            # Guardado incremental
            if formato == 'docx':
                append_to_docx(doc_obj, texto_lote)
                doc_obj.save(out_file)
            else:
                with open(out_file, "a", encoding="utf-8") as f:
                    f.write(texto_lote + "\n\n")
            
            print(f"💾 Avance del lote {i+1} guardado en disco.")
            
            if i < total_lotes - 1:
                time.sleep(10)
                
        except Exception as e:
            print(f"❌ Error en el Lote {i+1}: {str(e)}")
            if "429" in str(e):
                print("⏳ Esperando 30s por límite de cuota...")
                time.sleep(30)
                # Reintento simple
                try:
                    response = model.generate_content(prompt)
                    if formato == 'docx':
                        append_to_docx(doc_obj, response.text)
                        doc_obj.save(out_file)
                    else:
                        with open(out_file, "a", encoding="utf-8") as f:
                            f.write(response.text + "\n\n")
                except: pass

    end_time = time.time()
    print(f"\n✅ Auditoría finalizada en {end_time - start_time:.2f}s")
    print(f"📂 Archivo final: {out_file}")

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # Modo interactivo si no hay argumentos
        path, model, format = modo_interactivo()
        if path:
            generar_doc_proyecto(path, model, format)
    else:
        # Modo tradicional por parámetros
        parser = argparse.ArgumentParser()
        parser.add_argument("path", help="Ruta de la carpeta del proyecto Laravel")
        parser.add_argument("-m", "--model", choices=["flash", "pro"], default="pro")
        parser.add_argument("-f", "--format", choices=["md", "docx"], default="md", help="Formato de salida")
        args = parser.parse_args()
        
        if os.path.isdir(args.path):
            generar_doc_proyecto(args.path, args.model, args.format)
        else:
            print(f"❌ Error: '{args.path}' no es un directorio válido.")