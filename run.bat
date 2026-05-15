@echo off
setlocal

echo 🚀 Arrancando Laravel Auditor Pro para Windows...

:: 1. Limpiar puertos 8000 y 3000 si están ocupados
echo [0/2] Limpiando procesos antiguos...
FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :8000') DO taskkill /F /PID %%P >nul 2>&1
FOR /F "tokens=5" %%P IN ('netstat -a -n -o ^| findstr :3000') DO taskkill /F /PID %%P >nul 2>&1

:: 2. Iniciar Backend (Motor Python)
echo [1/2] Iniciando Motor Python (Puerto 8000)...
start /B "" "venv\Scripts\python.exe" "server.py"

:: 3. Iniciar Frontend (Next.js)
echo [2/2] Iniciando Interfaz Web (Puerto 3000)...
cd web-auditor
start /B "" npm run dev

echo ✨ App lista! Abre http://localhost:3000 en tu navegador.
echo Presiona Ctrl+C en esta ventana para cerrar todo.

:: Mantener la ventana abierta y esperar
pause
