/* ============================================================================
   EL CUADRE DIARIO — la hoja contra Supabase, desde fuera de la app. APAGADO por omisión.

   Lo corre el flujo .github/workflows/cuadre-diario.yml (que no hace nada sin la variable
   CUADRE_DIARIO=encendido) o una persona a mano:

       PUENTE_URL=… PUENTE_TOKEN=… SUPABASE_URL=… SUPABASE_SECRETA=… node scripts/cuadre-diario.mjs

   Qué hace: baja las filas de la hoja por el puente (/jalar, con el token de dispositivo de un
   aparato de Dirección: así trae el dinero), lee `ventas_calculadas` de la base con la llave secreta
   (service_role: la vista no tiene RLS para ella) y compara con la MISMA cuenta que la tarjeta de
   Ajustes (js/datos/supa-cuadre.js). Sale con 0 si cuadra y con 1 si no: GitHub avisa por correo.

   Lo que NO imprime, a propósito: ni nombres, ni importes, ni folios. El repositorio es público y la
   bitácora de un flujo de GitHub en un repositorio público la ve cualquiera. Solo dice si cuadra y
   CUÁNTAS diferencias hay de cada tipo. El detalle se ve en Ajustes → «Cuadrar ahora», o con
   `--detalle <archivo>` corrido a mano, que lo escribe FUERA del repositorio (se niega dentro).

   Sin las cuatro variables, dice que está apagado y termina bien.
   ============================================================================ */

import { writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cuadrar } from '../js/datos/supa-cuadre.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLS = 'a_folio,folio_global,g_subtotal,h_neto,i_anticipo,j_liquidacion,k_saldo,r_comision,s_abonado,t_restante';

/** Los renglones de la hoja como los ve la app (`ventaDeHoja`), bajados por el puente. */
async function filasDeLaHoja(env, fetchar) {
  const { ventaDeHoja } = await import('../js/datos/puente.js');
  const r = await fetchar(env.PUENTE_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ruta: 'jalar', token: env.PUENTE_TOKEN }) });
  const c = await r.json();
  if (!c || c.ok === false) throw new Error('la hoja no contestó: ' + ((c && c.codigo) || 'sin respuesta'));
  return (Array.isArray(c.registros) ? c.registros : []).map(f => ventaDeHoja((f && f.datos) || null)).filter(Boolean);
}

/** `ventas_calculadas` entera, de 500 en 500 (PostgREST trunca a 1000 sin avisar). */
async function filasDeLaBase(env, fetchar) {
  const base = String(env.SUPABASE_URL).replace(/\/+$/, '');
  const empresa = env.EMPRESA || 'al3d';
  const out = [];
  for (let desde = 0; desde < 200000; desde += 500) {
    const r = await fetchar(base + '/rest/v1/ventas_calculadas?select=' + COLS + '&empresa_id=eq.' + encodeURIComponent(empresa) + '&order=a_folio',
      { headers: { apikey: env.SUPABASE_SECRETA, Authorization: 'Bearer ' + env.SUPABASE_SECRETA, Range: desde + '-' + (desde + 499) } });
    if (r.status >= 400) throw new Error('la base contestó ' + r.status);
    const l = await r.json();
    if (!Array.isArray(l)) throw new Error('la base no devolvió una lista');
    out.push(...l);
    if (l.length < 500) break;
  }
  return out;
}

/**
 * @param {{env:Object, fetch?:function, log?:function, detalle?:string}} o
 * @returns {Promise<number>} el código de salida
 */
export async function correr(o = {}) {
  const env = o.env || {};
  const log = o.log || (x => console.log(x));
  const fetchar = o.fetch || globalThis.fetch;
  const faltan = ['PUENTE_URL', 'PUENTE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRETA'].filter(k => !env[k]);
  if (faltan.length) { log('Cuadre diario apagado: faltan ' + faltan.join(', ') + '. No se hizo nada.'); return 0; }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(String(env.SUPABASE_URL))) { log('SUPABASE_URL no es la dirección de un proyecto de Supabase.'); return 1; }
  let hoja, base;
  try { hoja = await filasDeLaHoja(env, fetchar); } catch (e) { log('No cuadra: ' + e.message); return 1; }
  try { base = await filasDeLaBase(env, fetchar); } catch (e) { log('No cuadra: ' + e.message); return 1; }
  const r = cuadrar(hoja, base);
  log((r.cuadra ? 'CUADRA' : 'NO CUADRA') + ': ' + r.hoja.filas + ' ventas en la hoja, ' + r.base.filas + ' en la base; ' +
    r.totales.length + ' totales distintos, ' + r.solo_hoja.n + ' solo en la hoja, ' + r.solo_base.n + ' solo en la base, ' +
    r.distintos.n + ' diferencias por folio, ' + r.folio_distinto.n + ' con otro V-### en la base.');
  if (o.detalle) {
    const destino = resolve(o.detalle);
    const rel = relative(RAIZ, destino);
    if (!rel.startsWith('..') && !isAbsolute(rel)) { log('El detalle lleva datos del negocio: escríbelo FUERA del repositorio.'); return 1; }
    writeFileSync(destino, JSON.stringify(r, null, 2));
    log('Detalle en ' + destino);
  }
  return r.cuadra ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const i = process.argv.indexOf('--detalle');
  correr({ env: process.env, detalle: i > 0 ? process.argv[i + 1] : '' }).then(c => process.exit(c));
}
