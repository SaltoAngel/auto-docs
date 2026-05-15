from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
import os
from da import generar_doc_yield
from tkinter import filedialog, Tk
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Servir carpetas de plantillas para las previsualizaciones
os.makedirs("templates", exist_ok=True)
app.mount("/templates-static", StaticFiles(directory="templates"), name="templates")

def open_folder_picker():
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder_path = filedialog.askdirectory()
    root.destroy()
    return folder_path

# Configurar CORS para que el frontend Next.js pueda conectar
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import google.generativeai as genai

@app.get("/select-folder")
async def select_folder():
    path = open_folder_picker()
    return {"path": path}

import httpx

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
                return {"valid": False, "error": "Llave rechazada por OpenRouter"}
        else:
            # Para Google, validamos intentando listar modelos (petición gratuita)
            try:
                genai.configure(api_key=api_key)
                genai.list_models()
                return {
                    "valid": True,
                    "label": "Google Gemini API Key",
                    "balance": "Ilimitado (Free/Pay)",
                    "is_free": True # Google no da balance exacto por API key
                }
            except Exception as e:
                return {"valid": False, "error": str(e)}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.get("/models")
async def list_models(api_key: str = Query(...), provider: str = "gemini"):
    try:
        if provider == "openrouter":
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {api_key}"}
                response = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                data = response.json()
                models = [{"id": m["id"], "label": m["name"]} for m in data.get("data", [])]
                return {"models": models}
        else:
            genai.configure(api_key=api_key)
            models = []
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    name = m.name.split('/')[-1]
                    models.append({"id": name, "label": m.display_name})
            return {"models": models}
    except Exception as e:
        return {"error": str(e)}

@app.get("/templates")
async def list_templates():
    files = os.listdir("templates")
    templates = []
    for f in files:
        if f.endswith(".docx"):
            name = f.replace(".docx", "")
            # Buscar si hay imagen con el mismo nombre
            preview = None
            for ext in [".jpg", ".png", ".jpeg"]:
                if f"{name}{ext}" in files:
                    preview = f"http://localhost:8000/templates-static/{name}{ext}"
                    break
            templates.append({"id": f, "name": name, "preview": preview})
    return {"templates": templates}


@app.get("/audit")
async def audit(request: Request, path: str, model: str, format: str, api_key: str = Query(None), provider: str = "gemini", template: str = Query(None)):
    async def event_generator():
        try:
            # Consumir el generador de da.py con el nuevo parámetro de plantilla
            for update in generar_doc_yield(path, model, format, provider=provider, api_key=api_key, template=template):
                # Verificar si el cliente se ha desconectado (botón detener o cierre de pestaña)
                if await request.is_disconnected():
                    print("🚫 Cliente desconectado. Deteniendo auditoría...")
                    break
                
                yield {
                    "data": json.dumps(update)
                }
                await asyncio.sleep(0.1)
        except Exception as e:
            yield {
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
