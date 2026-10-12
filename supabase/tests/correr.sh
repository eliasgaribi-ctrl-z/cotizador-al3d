#!/bin/sh
# Todas las pruebas de base de datos de AL3D (migraciones, RLS y RPC de Supabase sobre PGlite).
# Sin Docker, sin red y sin la CLI de Supabase: node y npm, nada más.
#
# Qué hace:
#   1. Entra a su propia carpeta, así que se puede lanzar desde cualquier lado.
#   2. Si falta node_modules, instala lo del package-lock.json con `npm ci` (versión exacta de
#      PGlite; es lo único que baja de la red, y solo la primera vez).
#   3. Corre, una por una, todas las pruebas: cada *.mjs de esta carpeta y, después, el de sus
#      subcarpetas de un nivel (cada grupo en orden alfabético), MENOS arnes/ (el arnés: son
#      ayudantes, no pruebas) y node_modules/. La autoprueba del propio arnés
#      (autoprueba.mjs) entra como cualquier otra.
#   4. Suma los archivos que fallaron y sale con 1 si hubo alguno (o si no encontró ninguna
#      prueba: un correr.sh que no corre nada y dice «todo bien» es la peor mentira posible).
#
# Uso:
#   sh supabase/tests/correr.sh                 todas
#   sh supabase/tests/correr.sh autoprueba      solo las que tengan «autoprueba» en la ruta
#
# Cada prueba es un script de node suelto que termina con un código de salida, como las de
# pruebas/ en la raíz del repo: ver README.md para escribir una.
#
# Los archivos se recorren con globs y no con `find` | `sort`: en Windows, bajo Git Bash, un
# PATH mal ordenado resuelve `find` y `sort` a los de System32, que son otra cosa.
set -u
cd "$(dirname "$0")" || exit 1

filtro="${1:-}"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta node (se usa la v24). Instálalo y vuelve a correr esto." >&2
  exit 1
fi

# El paquete, y no solo la carpeta: un node_modules a medio instalar (una descarga que se cortó)
# existe y no sirve, y el error que da después no se parece en nada a la causa.
if [ ! -f node_modules/@electric-sql/pglite/package.json ]; then
  echo "── instalando dependencias (npm ci) ──────────────────────────"
  if ! command -v npm >/dev/null 2>&1; then
    echo "Falta npm. Viene con node." >&2
    exit 1
  fi
  npm ci --no-audit --no-fund || { echo "npm ci falló." >&2; exit 1; }
fi

echo "node $(node --version) · PGlite $(node -p "require('./node_modules/@electric-sql/pglite/package.json').version")"

inicio=$(date +%s)
total=0
fallos=0
for f in *.mjs */*.mjs; do
  [ -f "$f" ] || continue                  # un glob sin coincidencias se queda como texto literal
  case "$f" in
    arnes/*|node_modules/*) continue ;;
  esac
  if [ -n "$filtro" ]; then
    case "$f" in
      *"$filtro"*) ;;
      *) continue ;;
    esac
  fi
  total=$((total + 1))
  echo ""
  echo "── $f ─────────────────────────────────────────"
  if node "$f"; then :; else fallos=$((fallos + 1)); fi
done
fin=$(date +%s)

echo ""
if [ "$total" -eq 0 ]; then
  if [ -n "$filtro" ]; then
    echo "Ninguna prueba coincide con «$filtro»." >&2
  else
    echo "No encontré ninguna prueba (*.mjs) en $(pwd)." >&2
  fi
  exit 1
fi
if [ "$fallos" -gt 0 ]; then
  echo "$fallos de $total archivo(s) de prueba con fallos. ($((fin - inicio)) s)"
  exit 1
fi
echo "Todas las pruebas de base de datos pasan: $total archivo(s). ($((fin - inicio)) s)"
