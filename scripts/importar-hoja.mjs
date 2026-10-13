#!/usr/bin/env node
/* ============================================================================
   IMPORTAR LA HOJA (y los teléfonos) A SUPABASE — fase 2 de docs/PLAN-SUPABASE.md.

   Solo LEE: el volcado de la hoja y los respaldos de los teléfonos. No se conecta a ninguna base
   ni escribe en la hoja. Deja en la carpeta de salida:
     reporte.md     para leerse: qué entraría, qué no y por qué, y los conflictos que hay que
                    decidir a mano (el script no decide: DECISIONES-SUPABASE.md, Q-14)
     reporte.json   lo mismo, completo, con la tabla de remapeo de ids
     ensayo.sql     la misma carga, pero se deshace sola al final: para probarla sin escribir nada
     importar.sql   la carga, idempotente (ver scripts/importador/sql.mjs)
     cuadre.sql     la comparación por folio contra la hoja
   La carpeta de salida tiene que estar FUERA del repositorio: el repositorio es público y los
   reportes llevan nombres, teléfonos e importes de clientes (Q-18). Si no, se niega.

   Uso:
     node scripts/importar-hoja.mjs --volcado <al3d-volcado-….json> --salida <carpeta fuera del repo>
          [--telefono <respaldo.json>]… [--telefono K7QM=<respaldo.json>]…
   La clave del sello, para importar «Autorizaciones», se lee de la variable de entorno
   AL3D_SELLO_CLAVE. Nunca se pide, se imprime ni se escribe.
   Más detalle: scripts/importador/LEEME.md.
   ============================================================================ */

import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planear } from './importador/plan.mjs';
import { sqlDeImportacion, sqlDeCuadre } from './importador/sql.mjs';

export const RAIZ_DEL_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** La ruta real de una carpeta aunque todavía no exista (la de su primer pariente que sí). */
function real(ruta) {
  let p = resolve(ruta);
  const resto = [];
  while (!existsSync(p)) { const padre = dirname(p); if (padre === p) break; resto.unshift(basename(p)); p = padre; }
  return resolve(realpathSync.native(p), ...resto);
}

/** ¿Esta carpeta cae dentro del repositorio? (con enlaces simbólicos resueltos) */
export function dentroDelRepo(carpeta, raiz = RAIZ_DEL_REPO) {
  const caja = p => (process.platform === 'win32' ? p.toLowerCase() : p);   // en Windows las rutas no distinguen mayúsculas
  const r = relative(caja(real(raiz)), caja(real(carpeta)));
  const sube = r === '..' || r.startsWith('..' + sep);   // «..reportes» es una carpeta de adentro que empieza con dos puntos, no un «subir»
  return r === '' || (!sube && !isAbsolute(r));
}

function argumentos(argv) {
  const a = { telefonos: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--volcado') { a.volcado = v; i++; }
    else if (k === '--salida') { a.salida = v; i++; }
    else if (k === '--telefono') {
      const m = /^([A-Za-z0-9_-]{1,24})=(.+)$/.exec(v || '');
      a.telefonos.push(m && !existsSync(v) ? { disp: m[1], archivo: m[2] } : { archivo: v });
      i++;
    } else if (k === '--ayuda' || k === '-h') a.ayuda = true;
    else throw new Error(`No entiendo «${k}». Usa --ayuda.`);
  }
  return a;
}

const AYUDA = `Uso: node scripts/importar-hoja.mjs --volcado <volcado.json> --salida <carpeta fuera del repo> [--telefono [DISP=]<respaldo.json>]…
La clave del sello (para importar «Autorizaciones») se lee de AL3D_SELLO_CLAVE. Ver scripts/importador/LEEME.md.`;

/**
 * Corre el importador. Devuelve { ok, mensaje, plan? }. No llama a process.exit (para poder probarlo).
 * @param {string[]} argv
 * @param {Record<string,string|undefined>} env
 */
export async function correr(argv, env = {}) {
  let a;
  try { a = argumentos(argv); } catch (e) { return { ok: false, mensaje: e.message }; }
  if (a.ayuda) return { ok: true, mensaje: AYUDA };
  if (!a.volcado || !a.salida) return { ok: false, mensaje: 'Faltan --volcado y --salida.\n' + AYUDA };
  if (dentroDelRepo(a.salida)) {
    return { ok: false, mensaje: `Me niego a escribir en «${a.salida}»: está dentro del repositorio, que es público, y los reportes llevan datos de clientes. Elige una carpeta fuera (por ejemplo en Documentos).` };
  }
  const leer = (archivo, que) => {
    try { return JSON.parse(readFileSync(archivo, 'utf8')); }
    catch (e) { throw new Error(`No pude leer ${que} «${archivo}»: ${e.message}`); }
  };
  let plan;
  try {
    const volcado = leer(a.volcado, 'el volcado');
    const telefonos = a.telefonos.map((t, i) => ({ etiqueta: t.disp || basename(t.archivo).replace(/\.json$/i, '') || 'telefono-' + (i + 1), disp: t.disp, respaldo: leer(t.archivo, 'el respaldo') }));
    plan = await planear({ volcado, telefonos, clave: env.AL3D_SELLO_CLAVE || null });
  } catch (e) { return { ok: false, mensaje: e.message }; }

  const hecho = new Date().toISOString();
  mkdirSync(a.salida, { recursive: true });
  const { reporte } = plan;
  writeFileSync(resolve(a.salida, 'reporte.json'), JSON.stringify({ hecho, volcado: basename(a.volcado), contadores: plan.contadores, remapeo: plan.remapeo, ...reporte }, null, 2));
  writeFileSync(resolve(a.salida, 'reporte.md'), reporteLegible(plan, hecho));
  writeFileSync(resolve(a.salida, 'importar.sql'), sqlDeImportacion(plan, { hecho }));
  writeFileSync(resolve(a.salida, 'ensayo.sql'), sqlDeImportacion(plan, { hecho, ensayo: true }));
  writeFileSync(resolve(a.salida, 'cuadre.sql'), sqlDeCuadre(plan));
  const r = reporte.resumen;
  return {
    ok: true, plan,
    mensaje: `Listo. ${r.proyectos} proyectos (${r.historicas} históricos, ${r.con_cotizacion} con cotización), ${r.abonos} abonos, ` +
      `${reporte.rechazos.length} filas que no entran, ${reporte.conflictos.length} conflictos por revisar. Los archivos están en ${resolve(a.salida)}.`,
  };
}

/** El reporte para una persona: corto arriba, el detalle abajo. */
export function reporteLegible(plan, hecho = '') {
  const r = plan.reporte, s = r.resumen;
  const L = [];
  L.push('# Reporte de importación', '', `Hecho: ${hecho}. **Contiene datos de clientes: no lo subas al repositorio ni lo mandes por chat.**`, '');
  L.push('## En corto', '');
  L.push(`- Proyectos: **${s.proyectos}** (${s.historicas} históricos, ${s.con_cotizacion} unidos a una cotización de teléfono).`);
  L.push(`- Abonos de comisión: **${s.abonos}**. Accesos: **${s.miembros}** (todos como invitados).`);
  L.push(`- Citas: ${s.instalaciones}. Material: ${s.materiales} materiales, ${s.requerimientos} requerimientos, ${s.almacen_movimientos} movimientos.`);
  L.push(`- Cotizaciones: ${s.cotizaciones}. Autorizaciones: ${s.autorizaciones}.`);
  L.push(`- **${r.rechazos.length}** filas que no entran, **${r.conflictos.length}** conflictos por decidir, ${r.avisos.length} avisos, ${r.fuera.length} proyectos de teléfono fuera del libro.`);
  for (const x of r.no_importado) L.push(`- No se importa: **${x.que}** (${x.n} filas): ${x.por}.`);
  L.push('', 'Contadores que se siembran: ' + plan.contadores.map(c => `${c.clave} = ${c.n}`).join(', ') + '.', '');
  L.push('Teléfonos: ' + (s.telefonos.length ? s.telefonos.map(t => `${t.etiqueta} (aparato ${t.disp || '¿?'}${t.disp_inferido ? ', deducido' : ''}; ${t.proyectos} proyectos, ${t.cotizaciones} cotizaciones)`).join('; ') : 'ninguno') + '.', '');
  const tabla = (titulo, filas, cols) => {
    L.push(`## ${titulo} (${filas.length})`, '');
    if (!filas.length) { L.push('Nada.', ''); return; }
    L.push('| ' + cols.map(c => c[1]).join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|');
    for (const f of filas) L.push('| ' + cols.map(c => String(f[c[0]] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |');
    L.push('');
  };
  tabla('Conflictos: los decides tú', r.conflictos, [['tema', 'Tema'], ['que', 'Qué'], ['detalle', 'Detalle']]);
  tabla('Filas que no entran', r.rechazos, [['donde', 'Dónde'], ['fila', 'Fila'], ['que', 'Qué'], ['por', 'Por qué']]);
  tabla('Proyectos de teléfono fuera del libro', r.fuera, [['telefono', 'Teléfono'], ['id', 'Id'], ['nombre', 'Nombre'], ['marca', 'Qué pasa'], ['valor', 'Valor']]);
  tabla('Avisos', r.avisos, [['donde', 'Dónde'], ['fila', 'Fila'], ['que', 'Qué'], ['por', 'Detalle']]);
  L.push('## Qué sigue', '', '1. Revisa los conflictos y las filas que no entran; lo que se arregle en la hoja se arregla volviendo a sacar el volcado.',
    '2. `ensayo.sql` primero: se pega en el Editor SQL de Supabase y termina con un error a propósito que dice lo que habría hecho, sin escribir nada.',
    '3. `importar.sql` después (o con psql). Se puede correr las veces que haga falta.',
    '4. `cuadre.sql` al final: la primera consulta tiene que salir vacía.', '');
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await correr(process.argv.slice(2), process.env);
  (r.ok ? console.log : console.error)(r.mensaje);
  process.exit(r.ok ? 0 : 1);
}
