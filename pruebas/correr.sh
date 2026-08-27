#!/bin/sh
# Todas las pruebas de la plataforma. Sin dependencias: node y nada más.
#
# El cotizador nunca tuvo pruebas y se auditó a mano, pantalla por pantalla. Eso funciona
# para una interfaz; no funciona para la aritmética de material ni para un generador de
# iCalendar, donde un error no se ve —sale un número plausible— y se descubre cuando
# fabricación compró de menos o cuando el evento se duplicó en el teléfono de tres
# personas. Estas pruebas cubren justo lo que no se puede revisar mirando.
#
# Uso: pruebas/correr.sh
set -e
cd "$(dirname "$0")"
fallos=0
for f in *.mjs; do
  [ -f "$f" ] || continue
  echo ""
  echo "── $f ─────────────────────────────────────────"
  if node "$f"; then :; else fallos=$((fallos+1)); fi
done
echo ""
if [ "$fallos" -gt 0 ]; then
  echo "$fallos archivo(s) de prueba con fallos."
  exit 1
fi
echo "Todas las pruebas de node pasan."

# ----- Las de navegador -----
# Viven en pruebas/navegador/ y no entran arriba a propósito: piden Chromium y un servidor,
# y este archivo es de node puro. El problema era que entonces no las corría NADIE, y así se
# quedaron dos fallos esperando durante una auditoría entera. Ahora hay una puerta: se
# piden con --navegador y, si no se piden, al menos se dice que existen.
if [ "$1" = "--navegador" ] || [ "$NAVEGADOR" = "1" ]; then
  PUERTO=${PUERTO:-8814}
  echo ""
  echo "── navegador (Chromium en :$PUERTO) ────────────────"
  ( cd .. && npx --yes http-server -p "$PUERTO" -c-1 --silent >/dev/null 2>&1 & echo $! > /tmp/al3d-srv.pid )
  sleep 3
  # `puente.mjs` LEVANTA SU PROPIO servidor —se inventa respuestas del Worker— así que no
  # puede recibir el puerto del de aquí: chocaría contra sí mismo con EADDRINUSE. Las otras
  # dos sí consumen este. Se supo corriéndolas juntas por primera vez.
  for f in navegador/*.mjs; do
    [ -f "$f" ] || continue
    echo ""
    echo "── $f ─────────────────────────────────────────"
    case "$f" in
      *puente.mjs) ok=0; node "$f" || ok=1 ;;
      *)           ok=0; PUERTO="$PUERTO" node "$f" || ok=1 ;;
    esac
    [ "$ok" -eq 0 ] || fallos=$((fallos+1))
  done
  [ -f /tmp/al3d-srv.pid ] && kill "$(cat /tmp/al3d-srv.pid)" 2>/dev/null
  rm -f /tmp/al3d-srv.pid
  echo ""
  if [ "$fallos" -gt 0 ]; then
    echo "$fallos archivo(s) de prueba con fallos."
    exit 1
  fi
  echo "Todas las pruebas pasan, las de navegador incluidas."
else
  echo ""
  echo "Faltan las 3 de navegador (camino-completo, puente, service-worker)."
  echo "Piden Chromium y un servidor:  pruebas/correr.sh --navegador"
fi
