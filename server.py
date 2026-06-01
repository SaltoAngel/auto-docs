import sys
import os
import json
import time
import asyncio
import threading
import httpx
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from tkinter import filedialog, Tk
import google.generativeai as genai

# Importar motor
from da import generar_doc_yield

app = FastAPI()

# Almacén de tokens de cancelación
cancel_tokens: dict[str, threading.Event] = {}

# Configuración de carpetas (Compatible con PyInstaller)
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WEB_OUT_DIR = os.path.join(BASE_DIR, "web-auditor", "out")
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

os.makedirs("templates", exist_ok=True)

# Middleware CORS (Único y centralizado)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- UTILIDADES ---
def open_folder_picker():
    """Abre el selector de carpetas de forma segura y forzada al frente."""
    try:
        root = Tk()
        # Forzar que la ventana se registre en el sistema antes de ocultarla
        root.attributes('-topmost', True)
        root.withdraw()
        root.update()
        root.deiconify()
        root.lift()
        root.focus_force()
        root.withdraw()
        
        folder_selected = filedialog.askdirectory(title="Selecciona el proyecto Laravel")
        
        root.destroy()
        return folder_selected
    except Exception as e:
        print(f"❌ Error en selector: {e}")
        return ""

# --- ENDPOINTS ---

@app.get("/select-folder")
async def select_folder():
    # Ejecutar en un hilo separado para no bloquear el servidor FastAPI
    path = await asyncio.to_thread(open_folder_picker)
    print(f"📂 Carpeta seleccionada: {path}")
    return {"path": path}

@app.get("/key-status")
async def key_status(api_key: str = Query(...), provider: str = "gemini"):
    try:
        if provider == "openrouter":
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {api_key}"}
                response = await client.get("https://openrouter.ai/api/v1/key", headers=headers)
                if response.status_code == 200:
                    data = response.json().get("data", {})
                    return {
                        "valid": True,
                        "label": data.get("label", "Sin etiqueta"),
                        "balance": data.get("limit_remaining", 0),
                        "is_free": data.get("is_free_tier", False)
                    }
                if response.status_code == 429:
                    return {"valid": False, "error": "Límite de velocidad excedido (429). Espera unos segundos y vuelve a intentar."}
                return {"valid": False, "error": "Llave rechazada por OpenRouter"}
        else:
            genai.configure(api_key=api_key)
            genai.list_models()
            return {"valid": True, "label": "Google Gemini Key", "balance": "Free/Pay", "is_free": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.get("/models")
async def list_models(api_key: str = Query(...), provider: str = "gemini"):
    try:
        if provider == "openrouter":
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {api_key}"}
                response = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                if response.status_code != 200:
                    return {"error": f"OpenRouter respondió con código {response.status_code}"}
                data = response.json()
                models = [{"id": m["id"], "label": m["name"]} for m in data.get("data", [])]
                models.sort(key=lambda x: x['label'])
                return {"models": models}
        else:
            genai.configure(api_key=api_key)
            models = []
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    name = m.name.split('/')[-1]
                    models.append({"id": name, "label": m.display_name})
            models.sort(key=lambda x: x['label'])
            return {"models": models}
    except Exception as e:
        print(f"❌ Error al listar modelos: {e}")
        return {"error": str(e)}

@app.get("/project-files")
async def list_project_files(path: str = Query(...)):
    try:
        if not os.path.exists(path):
            return {"error": "La ruta no existe"}
        ignorar_dirs = {'vendor', 'node_modules', 'storage', 'public', 'tests', 'database', 'dist', 'build', '.git'}
        ignorar_files = {'webpack.mix.js', 'tailwind.config.js', 'package-lock.json'}
        extensiones = ('.php', '.js', '.vue', '.ts', '.tsx', '.blade.php', '.css', '.scss', '.py', '.go', '.rb', '.java', '.rs', '.kt', '.swift')
        archivos = []
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ignorar_dirs and not d.startswith('.')]
            for file in files:
                if not file.endswith(extensiones):
                    continue
                if file.endswith('.min.js') or file in ignorar_files:
                    continue
                full_p = os.path.join(root, file)
                rel = os.path.relpath(full_p, path)
                try:
                    size = os.path.getsize(full_p)
                    archivos.append({"path": rel.replace("\\", "/"), "size": size})
                except:
                    pass
        archivos.sort(key=lambda x: x["path"])
        # Construir árbol para el frontend
        tree = {}
        for a in archivos:
            parts = a["path"].split("/")
            node = tree
            for i, part in enumerate(parts):
                is_file = i == len(parts) - 1
                if part not in node:
                    node[part] = {"type": "file" if is_file else "dir", "size": a["size"] if is_file else 0, "children": {}}
                if is_file:
                    node[part]["size"] = a["size"]
                else:
                    node[part]["children"] = node[part].get("children", {})
                node = node[part]["children"] if not is_file else node
        return {"files": archivos, "tree": tree}
    except Exception as e:
        return {"error": str(e)}

@app.get("/templates")
async def list_templates():
    if not os.path.exists("templates"): return {"templates": []}
    files = os.listdir("templates")
    templates = []
    for f in files:
        if f.endswith(".docx"):
            name = f.replace(".docx", "")
            preview = None
            for ext in [".jpg", ".png", ".jpeg"]:
                if f"{name}{ext}" in files:
                    preview = f"http://localhost:8000/templates-static/{name}{ext}"
                    break
            templates.append({"id": f, "name": name, "preview": preview})
    return {"templates": templates}

@app.get("/audit")
async def audit(request: Request, path: str, model: str, format: str, api_key: str = Query(None), provider: str = "gemini", template: str = Query(None), custom_prompt: str = Query(None), resume: bool = Query(True), font_name: str = Query("Calibri"), font_size: int = Query(11), block_size: int = Query(100), diff_mode: bool = Query(False), structure_only: bool = Query(False), code_theme: str = Query("monokai"), exclude_patterns: str = Query("")):
    session_id = f"{path}_{model}_{format}_{time.time()}"
    cancel_event = threading.Event()
    cancel_tokens[session_id] = cancel_event
    async def event_generator():
        try:
            for update in generar_doc_yield(path, model, format, provider=provider, api_key=api_key, template=template, custom_prompt=custom_prompt, resume=resume, font_name=font_name, font_size=font_size, block_size=block_size, diff_mode=diff_mode, structure_only=structure_only, cancel_token=cancel_event, code_theme=code_theme, exclude_patterns=exclude_patterns):
                if await request.is_disconnected():
                    cancel_event.set()
                    break
                yield {"data": json.dumps(update)}
                await asyncio.sleep(0.01)
        except GeneratorExit:
            cancel_event.set()
            print("👋 Generador cerrado por el cliente.")
        except Exception as e:
            yield {"data": json.dumps({"error": str(e)})}
        finally:
            cancel_tokens.pop(session_id, None)
    return EventSourceResponse(event_generator())

@app.get("/cancel-audit")
async def cancel_audit(session_id: str = Query(...)):
    event = cancel_tokens.get(session_id)
    if event:
        event.set()
        return {"status": "cancelado"}
    return {"status": "no se encontró la sesión"}

@app.get("/download")
async def download_file(file: str = Query(...)):
    abs_path = os.path.join(os.getcwd(), file) if not os.path.isabs(file) else file
    if os.path.exists(abs_path):
        return FileResponse(abs_path, filename=os.path.basename(abs_path))
    return {"error": "Archivo no encontrado"}

# --- SERVIDO DE ARCHIVOS ESTÁTICOS ---

# Servir plantillas
app.mount("/templates-static", StaticFiles(directory=TEMPLATES_DIR), name="templates")

# Servir Frontend
if os.path.exists(WEB_OUT_DIR):
    app.mount("/_next", StaticFiles(directory=os.path.join(WEB_OUT_DIR, "_next")), name="nextjs")
    
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(WEB_OUT_DIR, "index.html"))

    @app.get("/{rest_of_path:path}")
    async def serve_static_files(rest_of_path: str):
        file_path = os.path.join(WEB_OUT_DIR, rest_of_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(WEB_OUT_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    import webbrowser
    print("🚀 Iniciando Laravel Auditor Pro en http://localhost:8000")
    # Solo abrir navegador si no estamos en modo debug o si es el proceso principal
    if os.environ.get("RUN_MAIN") != "true":
        webbrowser.open("http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
