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
  # El `|| true` no es adorno y costó encontrarlo. Este archivo corre con `set -e`, y la
  # regla de POSIX es que -e se ignora dentro de una lista `&&` SALVO en su último comando.
  # Aquí el último era el `kill`: cuando el servidor ya se había ido solo —`npx` termina y
  # deja huérfano al servidor, así que el pid guardado apunta a un proceso muerto— el kill
  # devolvía 1, `set -e` mataba el guion en esa línea, y la tanda salía con código 1 SIN
  # imprimir «Todas las pruebas pasan» y sin una sola prueba fallida.
  #
  # Lo que lo hacía caro es que dependía de si al servidor le daba tiempo de morirse: la
  # misma tanda, con las mismas pruebas en verde, unas veces decía que sí y otras que no.
  # Un runner que reporta fallo cuando todo pasó es peor que uno que no reporta nada,
  # porque enseña a ignorar el código de salida — y el código de salida es lo único que
  # mira quien corre esto antes de publicar.
  if [ -f /tmp/al3d-srv.pid ]; then kill "$(cat /tmp/al3d-srv.pid)" 2>/dev/null || true; fi
  rm -f /tmp/al3d-srv.pid
  echo ""
  if [ "$fallos" -gt 0 ]; then
    echo "$fallos archivo(s) de prueba con fallos."
    exit 1
  fi
  echo "Todas las pruebas pasan, las de navegador incluidas."
else
  echo ""
  # El número se cuenta, no se escribe: decía «4» cuando ya eran seis, y un recordatorio que
  # miente sobre cuántas faltan es un recordatorio que se deja de leer.
  n=$(ls navegador/*.mjs 2>/dev/null | wc -l | tr -d ' ')
  echo "Faltan las $n de navegador: $(ls navegador/*.mjs 2>/dev/null | sed 's|navegador/||;s|\.mjs||' | tr '\n' ' ')"
  echo "Piden Chromium y un servidor:  pruebas/correr.sh --navegador"
fi
