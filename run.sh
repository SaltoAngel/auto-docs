#!/bin/bash

# Colores para la terminal
CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${CYAN}🚀 Arrancando Laravel Auditor Pro...${NC}"

# Limpiar puertos antes de arrancar para evitar errores
fuser -k 8000/tcp 3000/tcp 2>/dev/null || true

# 1. Iniciar Backend en segundo plano
echo -e "${GREEN}[1/2] Iniciando Motor Python (Puerto 8000)...${NC}"
"/opt/development/github/auto docs/venv/bin/python" "/opt/development/github/auto docs/server.py" &
BACKEND_PID=$!

# 2. Iniciar Frontend
echo -e "${GREEN}[2/2] Iniciando Interfaz Web (Puerto 3000)...${NC}"
cd "/opt/development/github/auto docs/web-auditor" && npm run dev &
FRONTEND_PID=$!

echo -e "${CYAN}✨ App lista! Abre http://localhost:3000 en tu navegador.${NC}"
echo -e "Presiona Ctrl+C para detener ambos servicios."

# Esperar y cerrar ambos al salir
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
