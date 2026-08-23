#!/bin/sh
# Regenera css/sistema.css a partir del <style> de index.html.
#
# El sistema de diseño —los tokens, el barro, las seis capas de cascada— vive en el
# <style> de index.html porque el cotizador es un solo archivo y así se publica. La
# plataforma necesita el mismo sistema, y copiarlo a mano garantizaba que divergieran.
#
# Esto lo copia. No es la solución bonita: la bonita es que index.html apunte a este
# archivo con un <link>, y ese cambio está programado para la próxima vez que index.html
# se toque por otra razón. Reordenar seis capas de cascada donde gana la última regla, en
# un archivo de 10 000 líneas que está en producción, no es un cambio que se haga "de
# paso".
#
# Uso:
#   herramientas/extraer-estilo.sh          regenera y avisa si cambió
#   herramientas/extraer-estilo.sh --diff   solo enseña el diff, no escribe
set -e
cd "$(dirname "$0")/.."

INI=$(grep -n '^<style>$' index.html | head -1 | cut -d: -f1)
FIN=$(grep -n '^</style>$' index.html | head -1 | cut -d: -f1)
if [ -z "$INI" ] || [ -z "$FIN" ]; then
  echo "No encontré el bloque <style> de index.html. ¿Cambió el formato?" >&2
  exit 1
fi
INI=$((INI + 1)); FIN=$((FIN - 1))

TMP=$(mktemp)
cat > "$TMP" <<'CAB'
/* ============================================================================
   COPIA GENERADA de index.html — el bloque <style> completo.

   NO LA EDITES AQUÍ. Edítala en index.html y corre herramientas/extraer-estilo.sh.

   Existe para que la plataforma se vea de la misma app que el cotizador sin volver
   a decidir un solo token: los mismos azules muestreados del logotipo, el mismo
   barro, la misma escala de siete tamaños de letra, los mismos tres radios. Lo que
   se rompe si esto diverge no es la estética: es que la plataforma y el cotizador
   dejen de parecer el mismo producto, y de ahí sale la sensación de que uno de los
   dos está a medias.
   ============================================================================ */

CAB
sed -n "${INI},${FIN}p" index.html >> "$TMP"

if [ "$1" = "--diff" ]; then
  diff -u css/sistema.css "$TMP" && echo "css/sistema.css está al día." || true
  rm -f "$TMP"; exit 0
fi

if [ -f css/sistema.css ] && cmp -s css/sistema.css "$TMP"; then
  echo "css/sistema.css ya estaba al día ($((FIN - INI + 1)) líneas)."
  rm -f "$TMP"; exit 0
fi

mkdir -p css
mv "$TMP" css/sistema.css
echo "css/sistema.css regenerado desde index.html:${INI}-${FIN} ($((FIN - INI + 1)) líneas)."
