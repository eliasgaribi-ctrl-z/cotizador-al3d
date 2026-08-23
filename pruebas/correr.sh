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
echo "Todas las pruebas pasan."
