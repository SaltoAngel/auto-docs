#!/bin/bash

# Salir inmediatamente si un comando falla de forma inesperada
set -e

# Colores para la terminal
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo -e "${CYAN}🚀 Arrancando Laravel Auditor Pro...${NC}"

# Capturar la raíz dinámica desde donde se ejecuta el script
RAIZ_PROYECTO=$(pwd)

# ==========================================
# PRE-VERIFICACIONES
# ==========================================

# Verificar que exista la carpeta del Frontend
if [ ! -d "$RAIZ_PROYECTO/web-auditor" ]; then
    echo -e "${RED}❌ ERROR: No se encontró la carpeta 'web-auditor'.${NC}"
    echo "Asegúrate de estar ejecutando este script desde la raíz del proyecto."
    exit 1
fi

# Verificar si npm está instalado
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ ERROR: 'npm' no está instalado en el sistema o no está en el PATH.${NC}"
    exit 1
fi


# ==========================================
# PASO 0: LIMPIEZA DE PUERTOS
# ==========================================
echo -e "${GREEN}[0/3] Limpiando procesos antiguos...${NC}"
fuser -k 8000/tcp 3000/tcp 2>/dev/null || true


# ==========================================
# PASO 1: VALIDAR / CREAR ENTORNO VIRTUAL
# ==========================================
echo -e "${GREEN}[1/3] Verificando entorno de Python...${NC}"

# Ruta dinámica al ejecutable de Python del venv
PYTHON_VENV="$RAIZ_PROYECTO/venv/bin/python"

if [ -f "$PYTHON_VENV" ]; then
    echo -e "${CYAN}📦 Entorno virtual (venv) detectado.${NC}"
else
    echo -e "${YELLOW}🔍 Venv no encontrado. Intentando crear uno nuevo...${NC}"

    # Verificar si Python3 global existe para poder crearlo
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ ERROR: No se puede crear el venv porque 'python3' no está instalado en el sistema.${NC}"
        exit 1
    fi

    echo -e "${CYAN}🛠️  Creando entorno virtual en '$RAIZ_PROYECTO/venv'...${NC}"
    python3 -m venv "$RAIZ_PROYECTO/venv"

    echo -e "${CYAN}📥 Instalando y actualizando dependencias (requirements.txt)...${NC}"
    "$PYTHON_VENV" -m pip install --upgrade pip &> /dev/null

    if [ -f "$RAIZ_PROYECTO/requirements.txt" ]; then
        "$PYTHON_VENV" -m pip install -r "$RAIZ_PROYECTO/requirements.txt"
    else
        echo -e "${YELLOW}⚠️  Aviso: No se encontró el archivo 'requirements.txt' en la raíz.${NC}"
    fi
    echo -e "${GREEN}✨ Entorno virtual configurado con éxito.${NC}"
fi


# ==========================================
# PASO 2: INICIAR BACKEND (PYTHON)
# ==========================================
echo -e "${GREEN}[2/3] Iniciando Motor Python (Puerto 8000)...${NC}"
"$PYTHON_VENV" "$RAIZ_PROYECTO/server.py" &
BACKEND_PID=$!


# ==========================================
# PASO 3: INICIAR FRONTEND (NEXT.JS)
# ==========================================
echo -e "${GREEN}[3/3] Iniciando Interfaz Web (Puerto 3000)...${NC}"
cd "$RAIZ_PROYECTO/web-auditor"
npm run dev &
FRONTEND_PID=$!


# ==========================================
# MANEJO DE SALIDA
# ==========================================
echo -e "${CYAN}--------------------------------------------------${NC}"
echo -e "${CYAN}✨ ¡Aplicación lista! Abre http://localhost:3000 en tu navegador.${NC}"
echo -e "${CYAN}🛑 Presiona Ctrl+C para detener ambos servicios.${NC}"
echo -e "${CYAN}--------------------------------------------------${NC}"

# Esperar y cerrar ambos procesos hijos al presionar Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
