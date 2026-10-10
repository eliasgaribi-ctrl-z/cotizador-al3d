// Fixture del notario (A.md §5.10-§5.12 y §10.11-§10.12). Módulo de AYUDA: es `.js` y no `.mjs` para que correr.sh no lo lance como prueba.
//
//   import { crearBaseNotario, cot, sol, sello, aut, insertarAutorizacion } from '../comun/notario.js';
//
// Todo lo que hay aquí es FALSO: correos en `@al3d.test`, folios inventados, firmas que son solo 64 hexadecimales con la forma correcta
// (la base NO tiene la clave y no puede recomputar el HMAC; el que sí firma de verdad es `supabase/functions/_shared/sello.js`, que usa
// la prueba de verbatim con una clave FALSA).
import { crearBaseDePruebas, sembrarUsuarios, crearUsuarioAuth, sql } from './semilla.js';

/** La clave del segundo Pagos (para NO-02 «otro Pagos»). */
export const UID_PAG2 = '00000000-0000-4000-8000-0000000000a2';

/**
 * Base nueva con TODAS las migraciones, los usuarios de `sembrarUsuarios` y un segundo Pagos (`pag2`, activo en `al3d`).
 * No siembra proyectos ni dinero: el notario no los necesita.
 */
export async function crearBaseNotario() {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  const pag2 = await crearUsuarioAuth(db, { uid: UID_PAG2, correo: 'pag2@al3d.test', verificado: true });
  await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id, reclamado_en) values ('al3d', $1, 'pagos', 'activo', $2, now())`, [pag2.correo, pag2.uid]);
  db.u.pag2 = { ...pag2, clave: 'pag2' };
  return db;
}

/** Una cotización para `solicitar` (la entrada de `limpiar_cotizacion`): trae un campo ajeno `ajeno` que la base debe eliminar. */
export const cot = (n = 1, extra = {}) => ({
  proyecto: 'Tacos ' + n, cliente: 'Juan', iva: true, subtotal: 12500,
  items: [{ id: 1, tipo: 'Letras', n: 8, pu: 1500, tarifa: 3900, ajeno: 'borrar', desc: 'x' }], ...extra,
});

/** El `p_op` de `solicitar` para un folio global. */
export const sol = (fg, o = {}) => ({ folio_global: fg, cotizacion: cot(1), huella: 'c|1:x', ...o });

/** Un `{p_codigo, p_firma}` coherente (el código son los doce primeros hexadecimales de la firma) a partir de un número. Distinto n, distinta firma. */
export function sello(n) {
  const hex = n.toString(16).padStart(12, '0');
  return { p_codigo: (hex.slice(0, 4) + '-' + hex.slice(4, 8) + '-' + hex.slice(8, 12)).toUpperCase(), p_firma: hex + '0'.repeat(52) };
}

/** Los argumentos de `registrar_autorizacion` de una decisión típica de Dirección (`db.u.dir`); `o` pisa lo que se quiera. */
export function aut(db, o = {}) {
  return {
    p_empresa: 'al3d', p_usuario: db.u.dir.uid, p_folio_global: 'COT-0042-B@K7QM', p_ts_iso: '2026-10-01T04:30:15.123Z', p_proyecto: 'Tacos "El Güero"', p_cliente: 'Juan',
    p_sub_calc_txt: '12500.00', p_precio_auth_txt: '0.00', p_total_txt: '14500.00', p_ajuste_pct: null, p_items_auth: '', p_huella: 'c|1:x', p_autorizo: db.u.dir.correo,
    ...sello(0xabcdef012345), p_nota: '', p_renglones: '[["Letras",8,12500]]', ...o,
  };
}

/**
 * Inserta una autorización como SUPERUSUARIO (sin pasar por la RPC): para armar el estado de un caso sin depender de lo que se prueba.
 * `o` pisa cualquier columna; devuelve el id.
 */
export async function insertarAutorizacion(db, o = {}) {
  const c = {
    empresa_id: 'al3d', folio_global: 'COT-0042-B@K7QM', huella: 'c|1:x', sub_calc_txt: '12500.00', precio_auth_txt: '0.00', items_auth: '', total_txt: '14500.00',
    proyecto: 'Tacos', autorizo: 'dir@al3d.test', ts_iso: '2026-10-01T04:30:15.123Z', renglones: '[["Letras",8,12500]]', cliente: 'Juan', solicito: 'pag@al3d.test',
    codigo: sello(0xabcdef012345).p_codigo, firma: sello(0xabcdef012345).p_firma, estado: 'vigente', ...o,
  };
  const cols = Object.keys(c);
  const r = await sql(db, `insert into public.autorizaciones (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) returning id`, cols.map(k => c[k]));
  return r[0].id;
}

/** La clave FALSA del mapa 04 §1.8 (126 caracteres, marcada FALSO): sirve para reproducir los vectores de firma. No es un secreto: la clave real NO existe en este repositorio. */
export const CLAVE_DEL_MAPA = 'FALSO-0000aaaa-1111-2222-3333-444455556666FALSO-0000bbbb-1111-2222-3333-444455556666FALSO-0000cccc-1111-2222-3333-444455556666';
