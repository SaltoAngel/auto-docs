@echo off
setlocal enabledelayedexpansion

:: Forzar codificaci�n UTF-8
chcp 65001 >nul

echo \U0001f680 Arrancando Laravel Auditor Pro para Windows...
echo --------------------------------------------------

:: ==========================================
:: PRE-VERIFICACIONES
:: ==========================================
if not exist "web-auditor\" echo \u274c ERROR: No se encontr� la carpeta 'web-auditor'. && goto :EXIT_ERROR

where npm >nul 2>&1
if !errorlevel! neq 0 echo \u274c ERROR: 'npm' no est� instalado en el PATH. && goto :EXIT_ERROR


:: ==========================================
:: PASO 0: LIMPIEZA DE PUERTOS
:: ==========================================
echo [0/3] Limpiando procesos antiguos (Puertos 8000 y 3000)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8000') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%P >nul 2>&1


:: ==========================================
:: PASO 1: VALIDAR / CREAR ENTORNO VIRTUAL
:: ==========================================
echo [1/3] Verificando entorno de Python...

:: Evitamos el bloque IF usando un salto directo si el archivo existe
if exist "venv\Scripts\python.exe" goto :START_BACKEND

:: Si no existe el venv, seguimos aqu� abajo de forma lineal
echo \U0001f50d Venv no encontrado. Intentando crear uno nuevo...

python --version >nul 2>&1
if !errorlevel! neq 0 goto :ERROR_NO_PYTHON_SYSTEM

echo \U0001f6e0\ufe0f  Creando entorno virtual en la carpeta venv...
python -m venv venv
if !errorlevel! neq 0 echo \u274c ERROR: Fall� la creaci�n del venv. && goto :EXIT_ERROR

echo \U0001f4e5 Instalando y actualizando dependencias (requirements.txt)...
"venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>&1
"venv\Scripts\python.exe" -m pip install -r requirements.txt
if !errorlevel! neq 0 goto :ERROR_DEPENDENCIAS

echo \u2728 Entorno virtual configurado con �xito.
goto :START_BACKEND


:: ==========================================
:: PASO 2: INICIAR BACKEND (PYTHON)
:: ==========================================
:START_BACKEND
echo \U0001f4e6 Entorno virtual listo. Iniciando Backend (server.py)...
start /B "" "venv\Scripts\python.exe" "server.py"


:: ==========================================
:: PASO 3: INICIAR NEXT.JS (FRONTEND)
:: ==========================================
:START_FRONTEND
echo [3/3] Iniciando Interfaz Web (Puerto 3000)...

cd web-auditor
start /B "" npm run dev
cd ..

echo --------------------------------------------------
echo \u2728 �Aplicaci�n lista!
echo \U0001f310 Abre http://localhost:3000 en tu navegador.
echo \U0001f6d1 Presiona Ctrl+C en esta ventana para cerrar los servicios.
echo --------------------------------------------------
pause
exit /b 0


:: ==========================================
:: SECCI�N DE ERRORES LIMPIOS (Sin par�ntesis trampa)
:: ==========================================

:ERROR_NO_PYTHON_SYSTEM
echo \u274c ERROR: No se puede crear el venv porque 'python' no est� instalado.
echo Por favor, instala Python desde python.org y marca la casilla "Add python.exe to PATH".
goto :EXIT_ERROR

:ERROR_DEPENDENCIAS
echo \u274c ERROR: Fall� la instalaci�n de las dependencias de Python.
echo Revisa si tu archivo 'requirements.txt' tiene alg�n problema.
goto :EXIT_ERROR

:EXIT_ERROR
echo --------------------------------------------------
echo \U0001f6d1 El script se detuvo debido a un error.
echo --------------------------------------------------
pause
exit /b 1