#!/usr/bin/env node
/* ============================================================================
   SEMILLA DEL ALMACÉN — el catálogo de materiales y las constantes del taller, de `datos/semilla.json` a una empresa.

   Qué hace. Lee `datos/semilla.json` (19 materiales y 20 constantes), los lleva al vocabulario de la base con las MISMAS reglas que `filaDesdeSemilla` de
   `js/datos/material.js` y los inserta con `ON CONFLICT DO NOTHING`:
     · IDEMPOTENTE: correrlo dos veces no cambia nada;
     · NO PISA lo que alguien ya editó (una fila que ya existe se queda como está) y no resucita nada: en la plataforma un material no se borra, se da de baja
       con `activo = false`, y esa fila sigue existiendo;
     · cada campo sale con el sello MÁS VIEJO posible (1) y `_editado = 1`: lo sembrado no lo editó nadie, así que cualquier edición de verdad gana por la compuerta
       de sellos (R3). Con «ahora» el catálogo recién sembrado le ganaría a la corrección que Dirección hizo ayer en su teléfono.

   Qué NO hace. No toca costos (la semilla no trae ninguno; el costo vive en `almacen_costos`, solo Dirección) ni la fila `_semilla` del cliente (el CHECK de
   `constantes` la prohíbe: esa lista era del teléfono). No inventa nada: lo que la semilla trae de más (grupo, título de una constante) no tiene columna.

   Cómo se corre. SIN argumentos solo MUESTRA lo que haría (no toca la red). Para escribir hace falta `--aplicar` y dos variables de entorno, que nunca se
   escriben en un archivo ni se imprimen:
       AL3D_SUPABASE_URL            https://<proyecto>.supabase.co
       AL3D_SUPABASE_SERVICE_ROLE   la llave service_role del proyecto (o la de pruebas)
       node supabase/opcional/semilla_materiales.mjs                     # simulacro: cuántas filas y qué avisos
       node supabase/opcional/semilla_materiales.mjs --aplicar           # siembra de verdad (empresa al3d)
       node supabase/opcional/semilla_materiales.mjs --empresa otra --semilla ruta/a/otra.json --aplicar
   Escribe por PostgREST (`POST /rest/v1/<tabla>?on_conflict=…` con `Prefer: resolution=ignore-duplicates`) usando los GRANT de `service_role` sobre
   `materiales` y `constantes` (que dan las migraciones 0005): no necesita nada más.

   Lo que NO se probó contra el servicio de verdad: la llamada HTTP. Las filas que arma (`construirFilas`) SÍ se prueban en PGlite
   (`supabase/tests/almacen/semilla.mjs`, AL-20): pasan todos los CHECK de las tablas, la segunda siembra no cambia nada y no pisa una edición.
   ============================================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const UNIDADES_COMPRA = Object.freeze(['unidad', 'bolsa', 'caja', 'lamina', 'litro', 'metro']);
export const UNIDADES_CONSUMO = Object.freeze(['m2', 'm', 'cm', 'pieza', 'litro']);
/** La semilla escribe unidades bonitas («m²», «m de cordón», «m² limpiados») y el esquema congela cinco valores: el matiz no se pierde, vive en `factor_origen`. */
export const NORM_CONSUMO = Object.freeze({ 'm²': 'm2', 'm2': 'm2', 'm² limpiados': 'm2', 'm de cordón': 'm', 'm de cordon': 'm', 'm': 'm', 'cm': 'cm', 'pieza': 'pieza', 'piezas': 'pieza', 'litro': 'litro' });
/** Los campos de `materiales` que llevan sello (los que `almacen_aplicar` compara al actualizar). */
export const COLUMNAS_SELLADAS = Object.freeze(['nombre', 'familia', 'unidad_compra', 'unidad_consumo', 'medida', 'factor', 'factor_origen', 'largo_cm', 'ancho_cm', 'espesor', 'merma_pct',
  'fraccionable', 'min_compra', 'min_stock', 'proveedor', 'tel_proveedor', 'activo']);
export const VERSION_BASE = 'c-2026-08';
const RE_CLAVE = /^[A-Za-z0-9_]{1,64}$/;
const ORIGEN_RESPALDO = 'Valor de respaldo: la semilla no trae el origen de este factor.';

const num = (x, def) => { const v = Number(x); return Number.isFinite(v) ? v : def; };          // nn() de material.js
const normConsumo = u => NORM_CONSUMO[String(u ?? '').trim()] ?? String(u ?? '').trim();

/**
 * De la semilla a las filas de `materiales` y `constantes` de UNA empresa. Pura: no lee archivos ni la red.
 * Lanza si la semilla no tiene la forma esperada (`materiales` y `constantes` como listas). Una fila que la base rechazaría (factor ≤ 0, merma fuera de 0..0.99,
 * mínimos negativos, id vacío o repetido, clave de constante inválida) NO se incluye y queda en `avisos`: nunca se manda basura.
 * @param {{materiales: object[], constantes: object[], version?: string, version_constantes?: string}} semilla
 * @param {string} [empresa]
 */
export function construirFilas(semilla, empresa = 'al3d') {
  if (!semilla || !Array.isArray(semilla.materiales) || !Array.isArray(semilla.constantes)) throw new Error('La semilla no tiene la forma esperada: materiales y constantes tienen que ser listas.');
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(String(empresa))) throw new Error('La empresa «' + empresa + '» no es un id válido (minúsculas, dígitos y guion bajo).');
  const avisos = [], materiales = [], constantes = [], ids = new Set(), claves = new Set();
  for (const s of semilla.materiales) {
    const id = String(s?.id ?? '').trim();
    if (!id || id.length > 200) { avisos.push('Un material sin id válido se omitió.'); continue; }
    if (ids.has(id)) { avisos.push(`El material «${id}» está repetido: se siembra el primero.`); continue; }
    const um = normConsumo(s.unidad_consumo);
    if (!UNIDADES_CONSUMO.includes(um)) avisos.push(`«${id}»: la unidad de consumo «${s.unidad_consumo}» no existe en el vocabulario; se usó «pieza».`);
    if (!UNIDADES_COMPRA.includes(s.unidad_compra)) avisos.push(`«${id}»: la unidad de compra «${s.unidad_compra}» no existe en el vocabulario; se usó «unidad».`);
    const fila = {
      empresa_id: empresa, id, nombre: String(s.nombre || id), familia: String(s.familia || 'sin_familia'),
      unidad_compra: UNIDADES_COMPRA.includes(s.unidad_compra) ? s.unidad_compra : 'unidad', unidad_consumo: UNIDADES_CONSUMO.includes(um) ? um : 'pieza',
      medida: String(s.medida || ''), factor: num(s.factor, 1), factor_origen: String(s.factor_origen || ORIGEN_RESPALDO),
      largo_cm: s.largo_cm === null || s.largo_cm === undefined ? null : num(s.largo_cm, null), ancho_cm: s.ancho_cm === null || s.ancho_cm === undefined ? null : num(s.ancho_cm, null),
      espesor: String(s.espesor || ''), merma_pct: num(s.merma_pct !== undefined ? s.merma_pct : s.merma, 0),      // la semilla escribe `merma`; el esquema, `merma_pct`
      fraccionable: !!s.fraccionable, min_compra: num(s.min_compra, 1), min_stock: num(s.min_stock, 0), proveedor: String(s.proveedor || ''), tel_proveedor: String(s.tel_proveedor || ''),
      activo: s.activo === undefined ? true : !!s.activo,
    };
    // lo que la base rechazaría (CHECK de la tabla): no se manda
    if (!(fila.factor > 0)) { avisos.push(`«${id}»: el factor tiene que ser mayor que cero; se omitió.`); continue; }
    if (!(fila.merma_pct >= 0 && fila.merma_pct < 1)) { avisos.push(`«${id}»: la merma va de 0 a 0.99; se omitió.`); continue; }
    if (fila.min_compra < 0 || fila.min_stock < 0) { avisos.push(`«${id}»: un mínimo no puede ser negativo; se omitió.`); continue; }
    // `costo_compra` no es una columna de `materiales`: el costo vive en `almacen_costos` (solo Dirección). La semilla no trae ninguno; si algún día lo trae, se avisa y no se siembra.
    if (s.costo_compra !== undefined && s.costo_compra !== null) avisos.push(`«${id}»: trae costo_compra; el costo no se siembra aquí (vive en almacen_costos, solo Dirección).`);
    fila.sellos = { ...Object.fromEntries(COLUMNAS_SELLADAS.map(c => [c, 1])), _editado: 1 };
    ids.add(id); materiales.push(fila);
  }
  const version = String(semilla.version_constantes || VERSION_BASE);
  for (const c of semilla.constantes) {
    const clave = String(c?.clave ?? '').trim();
    if (!clave || clave.startsWith('_')) continue;                      // las internas (`_semilla`) no se migran
    if (!RE_CLAVE.test(clave) || claves.has(clave)) { avisos.push(`La constante «${clave}» tiene una clave inválida o repetida; se omitió.`); continue; }
    const valor = Number(c.valor);
    if (!Number.isFinite(valor)) { avisos.push(`La constante «${clave}» no trae un valor numérico; se omitió.`); continue; }
    claves.add(clave);
    constantes.push({ empresa_id: empresa, clave, valor, unidad: String(c.unidad || ''), nota: String(c.origen || c.nota || ''), version, actualizado_por: '' });
  }
  return { materiales, constantes, version, avisos };
}

/**
 * Manda las filas a PostgREST con `ignore-duplicates` (ON CONFLICT DO NOTHING) y cuenta las que de verdad entraron. `fetchImpl` se puede inyectar (pruebas).
 * La llave viaja solo en las cabeceras; nunca se imprime ni se guarda.
 */
export async function sembrar({ url, llave, filas, fetchImpl = globalThis.fetch }) {
  if (!url || !llave) throw new Error('Faltan AL3D_SUPABASE_URL y AL3D_SUPABASE_SERVICE_ROLE (en el entorno, nunca en un archivo).');
  const base = String(url).replace(/\/+$/, '');
  const enviar = async (tabla, conflicto, lista) => {
    if (!lista.length) return { nuevas: 0, ya_estaban: 0 };
    const res = await fetchImpl(`${base}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
      method: 'POST',
      headers: { apikey: llave, Authorization: 'Bearer ' + llave, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(lista),
    });
    if (!res.ok) throw new Error(`PostgREST respondió ${res.status} al sembrar ${tabla}.`);        // sin cuerpo: podría repetir datos
    const devueltas = await res.json();
    const nuevas = Array.isArray(devueltas) ? devueltas.length : 0;
    return { nuevas, ya_estaban: lista.length - nuevas };
  };
  return { materiales: await enviar('materiales', 'empresa_id,id', filas.materiales), constantes: await enviar('constantes', 'empresa_id,clave', filas.constantes) };
}

/* ------------------------------ la línea de comandos ------------------------------ */
function argumento(args, nombre, defecto) {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defecto;
}

async function principal(args) {
  const empresa = argumento(args, '--empresa', 'al3d');
  const ruta = resolve(argumento(args, '--semilla', fileURLToPath(new URL('../../datos/semilla.json', import.meta.url))));
  let semilla;
  try { semilla = JSON.parse(readFileSync(ruta, 'utf8')); }
  catch (e) { console.error('No pude leer la semilla (' + ruta + '): ' + (e && e.message ? e.message.split('\n')[0] : e)); return 1; }
  let filas;
  try { filas = construirFilas(semilla, empresa); }
  catch (e) { console.error(e.message); return 1; }
  console.log(`Semilla ${filas.version}: ${filas.materiales.length} materiales y ${filas.constantes.length} constantes para la empresa «${empresa}».`);
  for (const a of filas.avisos) console.log('  aviso: ' + a);
  if (!args.includes('--aplicar')) { console.log('Simulacro: no se escribió nada. Con --aplicar (y las variables de entorno) se siembra.'); return 0; }
  const url = process.env.AL3D_SUPABASE_URL, llave = process.env.AL3D_SUPABASE_SERVICE_ROLE;
  if (!url || !llave) { console.error('Faltan AL3D_SUPABASE_URL y AL3D_SUPABASE_SERVICE_ROLE en el entorno. No se escribió nada.'); return 1; }
  try {
    const r = await sembrar({ url, llave, filas });
    console.log(`Listo. Materiales: ${r.materiales.nuevas} nuevos, ${r.materiales.ya_estaban} ya estaban. Constantes: ${r.constantes.nuevas} nuevas, ${r.constantes.ya_estaban} ya estaban.`);
    return 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  principal(process.argv.slice(2)).then(c => { process.exitCode = c; });
}
