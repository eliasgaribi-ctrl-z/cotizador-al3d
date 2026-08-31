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
  # Algunas LEVANTAN SU PROPIO servidor —puente.mjs se inventa respuestas del Worker, y la
  # de actualización necesita decidir qué archivo devuelve 404—, así que no pueden recibir
  # el puerto del de aquí: chocarían contra sí mismas con EADDRINUSE. Se pregunta al archivo
  # en vez de mantener una lista de nombres: la lista se olvida de actualizar y el fallo que
  # produce —EADDRINUSE en mitad de la tanda— no se parece en nada a su causa.
  for f in navegador/*.mjs; do
    [ -f "$f" ] || continue
    echo ""
    echo "── $f ─────────────────────────────────────────"
    ok=0
    if grep -q "createServer" "$f"; then node "$f" || ok=1
    else PUERTO="$PUERTO" node "$f" || ok=1; fi
    [ "$ok" -eq 0 ] || fallos=$((fallos+1))
  done
  # El `&&` de aquí hacía MENTIR a la tanda entera. Con `set -e`, si el servidor ya se había
  # ido —lo mata una de las pruebas que levanta el suyo, o se cayó solo—, `kill` devuelve 1, la
  # cadena entera devuelve 1 y el script SALE en ese punto: con todas las pruebas en verde y sin
  # llegar a imprimir el resumen, devolvía código 1. Costó un rato porque el síntoma —«falló
  # algo»— no aparece por ningún lado en la salida.
  if [ -f /tmp/al3d-srv.pid ]; then
    kill "$(cat /tmp/al3d-srv.pid)" 2>/dev/null || true
    rm -f /tmp/al3d-srv.pid
  fi
  echo ""
  if [ "$fallos" -gt 0 ]; then
    echo "$fallos archivo(s) de prueba con fallos."
    exit 1
  fi
  echo "Todas las pruebas pasan, las de navegador incluidas."
else
  echo ""
  # La lista escrita a mano se quedó en cuatro cuando ya eran seis. Se cuentan.
  echo "Faltan las $(ls navegador/*.mjs 2>/dev/null | wc -l | tr -d ' ') de navegador: $(ls navegador/*.mjs 2>/dev/null | xargs -n1 basename | sed 's/\.mjs$//' | tr '\n' ',' | sed 's/,$//;s/,/, /g')."
  echo "Piden Chromium y un servidor:  pruebas/correr.sh --navegador"
fi
