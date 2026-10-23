#!/bin/sh
# Regenera js/datos/catalogo-precios.js desde el catálogo del cotizador (js/cotizador/catalogo.js).
#
# La plataforma es su propio documento: se puede abrir sin que cotizador.html se haya cargado
# nunca en esa pestaña, así que no puede contar con que MATERIALES exista en window. Pero
# el catálogo tiene UN dueño —js/cotizador/catalogo.js, que se edita a mano cuando sube el aluminio— y
# esto lo copia en vez de transcribirlo, que es donde se cuelan los errores de un dígito.
#
# Uso:
#   herramientas/extraer-catalogo.sh          regenera
#   herramientas/extraer-catalogo.sh --diff   solo enseña el diff
set -e
cd "$(dirname "$0")/.."
DEST=js/datos/catalogo-precios.js
TMP=$(mktemp)

bloque() {  # bloque <nombre>  ->  el interior del array, sin la línea de apertura ni el ];
  sed -n "/^const $1 = \[/,/^\];/p" js/cotizador/catalogo.js | sed '1d;$d'
}

cat > "$TMP" <<'CAB'
/* ============================================================================
   Copia del catálogo de precios del cotizador.

   GENERADA. No la edites aquí: el catálogo vive en js/cotizador/catalogo.js y se edita allá.
   Corre herramientas/extraer-catalogo.sh para regenerarla.

   Existe por un caso concreto: la plataforma se puede abrir sin que cotizador.html se haya
   cargado nunca en esa pestaña —es su propio documento—, así que no puede contar con que
   MATERIALES exista en window. Y necesita el catálogo para dos cosas que NO son dinero:
   poner la etiqueta legible de un material y derivar de qué está hecha una partida.

   LA REGLA, y es la que importa: con esto NO se recalcula dinero. Nunca. El importe de una
   partida vendida ya viene congelado en `_lt` dentro de la entrada del historial, y el del
   proyecto en `itemsAuth`. El cotizador congela esos números justo para que subir el precio
   del aluminio no reescriba hacia atrás lo que un cliente ya firmó; recalcular aquí sería
   deshacer esa protección desde otro archivo.
   ============================================================================ */

CAB
{
  echo "export const MATERIALES = ["; bloque MATERIALES; echo "];"
  echo "export const COMPLEJIDAD = ["; bloque COMPLEJIDAD; echo "];"
  echo "export const CAJAS = ["; bloque CAJAS; echo "];"
  echo "/* Recorte de acrílico: precio por cm de altura × pieza (igual que letras) */"
  echo "export const RECORTES = ["; bloque RECORTES; echo "];"
  grep '^let RECORTE_COMP_EXTRA' js/cotizador/catalogo.js | sed 's/^let /export let /'
  echo "/* Bastidores: precio por metro cuadrado */"
  echo "export const BASTIDORES = ["; bloque BASTIDORES; echo "];"
  grep '^const TIPO_NOMBRE=' js/cotizador/catalogo.js | sed 's/^const /export const /'
  grep '^const TIPO_CORTO ' js/cotizador/catalogo.js | sed 's/^const /export const /'
} >> "$TMP"

cat >> "$TMP" <<'PIE'

/* Se cobra un mínimo de 1 m² en caja de luz y en bastidor. Va aquí porque la derivación de
   material tiene que saber que ESTE número es de precio y no de geometría: una caja de
   0.3 m² se COBRA como 1 m² y se FABRICA con 0.3. Comprar material por el área cobrada es
   comprar tres veces lo que se necesita. */
export const M2_MINIMO = 1;

export const matOf  = k => MATERIALES.find(m => m.key === k) || null;
export const compOf = k => COMPLEJIDAD.find(c => c.key === k) || null;
export const recOf  = k => RECORTES.find(r => r.key === k) || null;
export const basOf  = k => BASTIDORES.find(b => b.key === k) || null;
export const cajaOf = (t, k) => (k && CAJAS.find(c => c.key === k)) || CAJAS.find(c => c.tarifa === Number(t)) || null;
/* De qué se fabrica una entrada: la de fábrica es ella misma; una agregada desde «Precios y
   materiales» del cotizador dice `como`. La derivación de material decide con esta clave. */
export const baseDe = e => e ? (e.como || e.key) : '';

/* Los precios y materiales que Dirección cambió desde el cotizador (js/cotizador/tarifas.js).
   Aquí no se cobra nada —ver arriba—, pero un material agregado tiene que tener nombre en la
   plataforma y saber de qué se fabrica para derivar su material. El cotizador guarda la última
   tabla de la hoja en este mismo origen (`al3d_tarifas`); se lee de ahí, con la misma regla que
   allá: una tabla a la que le falta algo de fábrica no se aplica. */
function aplicarGuardadas() {
  let t = null;
  try { t = JSON.parse(localStorage.getItem('al3d_tarifas') || 'null'); } catch (_) { return; }
  if (!t || !Array.isArray(t.filas)) return;
  const fab = { material: MATERIALES, complejidad: COMPLEJIDAD, recorte: RECORTES, bastidor: BASTIDORES, caja: CAJAS };
  const L = { material: [], complejidad: [], recorte: [], bastidor: [], caja: [] };
  let extra = RECORTE_COMP_EXTRA;
  for (const f of t.filas) {
    if (!f || typeof f !== 'object' || !isFinite(Number(f.precio))) return;
    if (f.grupo === 'recorte-extra') { if (f.clave === 'sandwich') extra = Number(f.precio); continue; }
    const lista = fab[f.grupo]; if (!lista) continue;
    const base = lista.find(e => e.key === f.clave) || lista.find(e => e.key === f.como);
    if (!base || L[f.grupo].some(e => e.key === f.clave)) continue;
    const e = Object.assign({}, base, { key: String(f.clave), label: String(f.nombre || base.label) });
    if (e.key !== base.key) e.como = base.key;
    if (f.visible === false) e.oculto = true;
    const p = Number(f.precio);
    if (f.grupo === 'complejidad') e.extra = p; else if (f.grupo === 'material' || f.grupo === 'recorte') e.precio = p; else e.tarifa = p;
    L[f.grupo].push(e);
  }
  for (const g in fab) if (!fab[g].every(b => L[g].some(e => e.key === b.key))) return;
  for (const g in fab) fab[g].splice(0, fab[g].length, ...L[g]);
  RECORTE_COMP_EXTRA = extra;
}
if (typeof localStorage !== 'undefined') aplicarGuardadas();

export function catalogos() {
  return { MATERIALES, COMPLEJIDAD, RECORTES, BASTIDORES, CAJAS,
           RECORTE_COMP_EXTRA, TIPO_NOMBRE, TIPO_CORTO, M2_MINIMO };
}
PIE

# Cordón: si algún bloque salió vacío, el archivo quedaría sintácticamente válido y
# semánticamente catastrófico —cero materiales significa cero material derivado, en
# silencio—. Se cuenta antes de escribir.
for n in MATERIALES COMPLEJIDAD CAJAS RECORTES BASTIDORES; do
  if ! grep -q "export const $n = \[" "$TMP" || [ "$(bloque $n | grep -c "key:")" -lt 2 ]; then
    echo "El bloque $n salió vacío o incompleto. ¿Cambió el formato de js/cotizador/catalogo.js?" >&2
    rm -f "$TMP"; exit 1
  fi
done

if [ "$1" = "--diff" ]; then
  diff -u "$DEST" "$TMP" && echo "$DEST está al día." || true
  rm -f "$TMP"; exit 0
fi
if [ -f "$DEST" ] && cmp -s "$DEST" "$TMP"; then
  echo "$DEST ya estaba al día."; rm -f "$TMP"; exit 0
fi
mv "$TMP" "$DEST"
echo "$DEST regenerado desde js/cotizador/catalogo.js."
