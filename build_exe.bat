@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo 📦 CONSTRUCTOR DE EJECUTABLE PORTABLE
echo ==========================================

:: 1. Compilar Frontend
echo [1/3] Compilando Interfaz Web (Next.js)...
cd web-auditor
call npm install
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ Error al compilar el frontend.
    pause
    exit /b %ERRORLEVEL%
)
cd ..

:: 2. Instalar dependencias de Python
echo [2/3] Instalando dependencias de Python...
call venv\Scripts\pip.exe install -r requirements.txt
call venv\Scripts\pip.exe install pyinstaller

:: 3. Crear Ejecutable
echo [3/3] Creando archivo EXE único...
:: Usamos --add-data para meter la web y las plantillas dentro del EXE
:: Formato: "origen;destino"
call venv\Scripts\pyinstaller --onefile --noconsole ^
    --add-data "web-auditor/out;web-auditor/out" ^
    --add-data "templates;templates" ^
    --collect-all uvicorn ^
    --collect-all fastapi ^
    --name "LaravelAuditorPro" ^
    server.py

if %ERRORLEVEL% neq 0 (
    echo ❌ Error al crear el ejecutable.
    pause
    exit /b %ERRORLEVEL%
)

echo ==========================================
echo ✨ ¡ÉXITO! Tu ejecutable está en: dist\LaravelAuditorPro.exe
echo ==========================================
pause
