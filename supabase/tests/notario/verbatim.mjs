// Texto VERBATIM y firma — A.md §10.12, casos VB-01 a VB-06.
//
// Un PDF ya impreso no se reimprime: si cambia un solo byte de lo firmado, todos los que hay en la calle dicen «No auténtica». Por eso la base guarda los textos
// firmados en `text` (nunca jsonb, timestamptz ni numeric) y esta prueba exige que salgan idénticos AL BYTE. La firma la calcula `supabase/functions/_shared/sello.js`
// (el único módulo que la conoce) con una clave FALSA; la base nunca tiene la clave.
//
// CODIFICACIÓN. Se comprobó en Apps Script real (2026-10-10) que `Utilities.computeHmacSha256Signature(String, String)` codifica texto y clave como US-ASCII con un «?»
// por cada carácter no ASCII. Por eso los sellos nuevos se firman con 'ascii-?' (valor por omisión) y los vectores se prueban con las DOS codificaciones: la de los
// sellos nuevos ('ascii-?') y la fuerte ('utf-8', la que supuso el mapa 04), cada una con su código impreso.
import { createHmac } from 'node:crypto';
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { sql, crearUsuarioAuth, como, rpcT } from '../comun/semilla.js';
import { crearBaseNotario, sello, aut, CLAVE_DEL_MAPA } from '../comun/notario.js';
import * as Sello from '../../functions/_shared/sello.js';

const UID_ELIAS = '00000000-0000-4000-8000-0000000000e5';
const plantilla = dato(async () => {
  const db = await crearBaseNotario();
  const elias = await crearUsuarioAuth(db, { uid: UID_ELIAS, correo: 'elias@al3d.mx', verificado: true });
  await sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id, reclamado_en) values ('al3d', $1, 'direccion', 'activo', $2, now())`, [elias.correo, elias.uid]);
  db.u.elias = { ...elias, clave: 'elias' };
  return db;
}, { limpiar: db => db.close() });
const SR = db => como(db, { rol: 'service_role' });

/** Los argumentos de registrar_autorizacion para un registro de sello.js (con los nombres del .gs) y su sello. */
const argumentos = (r, s, o = {}) => ({
  p_empresa: 'al3d', p_usuario: UID_ELIAS, p_folio_global: r.folio, p_ts_iso: r.ts, p_proyecto: r.proyecto, p_cliente: 'Juan', p_sub_calc_txt: Sello.dinero2(r.subCalc), p_precio_auth_txt: Sello.dinero2(r.precioAuth),
  p_total_txt: Sello.dinero2(r.total), p_ajuste_pct: null, p_items_auth: r.itemsAuth, p_huella: r.huella, p_autorizo: r.correo, p_codigo: s.codigo, p_firma: s.firma, p_nota: '', p_renglones: r.renglones, p_codificacion: s.codificacion, ...o,
});
/** Los argumentos de una decisión cualquiera de Elías (la firma es de mentira: aquí solo se prueba lo que la base guarda). */
const deElias = (db, o = {}) => aut(db, { p_usuario: UID_ELIAS, p_autorizo: 'elias@al3d.mx', ...o });
/** HMAC-SHA256 con node:crypto y la conversión US-ASCII con «?» de Apps Script (independiente del WebCrypto de sello.js). */
const asciiInterr = t => Uint8Array.from([...String(t)].map(c => (c.codePointAt(0) < 128 ? c.codePointAt(0) : 63)));
const hmacIndependiente = (texto, clave, cod) => (cod === 'utf-8'
  ? createHmac('sha256', Buffer.from(clave, 'utf8')).update(Buffer.from(texto, 'utf8')).digest('hex')
  : createHmac('sha256', asciiInterr(clave)).update(asciiInterr(texto)).digest('hex'));

const HUELLA_TACOS = 'c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~';
const BASE_TACOS = { folio: 'COT-0042-B@K7QM', huella: HUELLA_TACOS, subCalc: 11310, precioAuth: 12500, itemsAuth: '', total: 12500, proyecto: 'Tacos El Güero', correo: 'elias@al3d.mx',
                     ts: '2026-10-01T04:30:15.123Z', renglones: '[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]' };
/** Los cinco vectores de M04 §1.8 con la clave FALSA: el código impreso con 'ascii-?' (el del Apps Script real) y con 'utf-8' (lo que supuso el mapa 04). V1 es todo ASCII: igual con las dos. */
const VECTORES = [
  { nombre: 'V1', r: { folio: 'COT-0007-B@K7QM', huella: 'c|1:letras~al-paint~recta~true~40~8~~~~~~~~', subCalc: 11310, precioAuth: 0, itemsAuth: '', total: 13119.6, proyecto: 'Tacos de Antes',
                       correo: 'elias@al3d.mx', ts: '2026-09-26T17:00:00.000Z', renglones: '' }, ascii: '6C3B-AA7B-1964', utf8: '6C3B-AA7B-1964' },
  { nombre: 'E2E-A', r: BASE_TACOS, ascii: 'F771-D7A2-C4CF', utf8: '1031-54B3-55D4' },
  { nombre: 'E2E-B', r: { ...BASE_TACOS, folio: 'COT-0041-B@K7QM', precioAuth: 14000, itemsAuth: '2:1500.00', total: 14000, renglones: '[["Letras «TACOS»",8,10438],["Bastidor",1,1630.97]]' }, ascii: '094D-3BD2-FC3E', utf8: '280B-5AB3-5179' },
  { nombre: 'E2E-C', r: { ...BASE_TACOS, folio: 'COT-0043-B@K7QM', precioAuth: 0, total: 13119.6 }, ascii: '744F-2DBB-F5B7', utf8: 'CF18-8179-9DD0' },
  { nombre: 'V5', r: { folio: 'COT-0001-A@ABCD', huella: 's|7:manual~~~~~~~~~~~~2~1234.56', subCalc: 2469.12, precioAuth: 0, itemsAuth: '', total: 2469.12, proyecto: 'Tacos "El Güero" | Ñandú',
                      correo: 'elias@al3d.mx', ts: '2026-10-09T23:59:59.999Z', renglones: '[["Pieza",2,2469.12]]' }, ascii: '9BBA-8985-7CC4', utf8: '76F4-C52C-2BC6' },
];

describir('VB-01 a VB-04 la base guarda los textos firmados tal cual', () => {
  const RARO = 'Tacos "El Güero" | Ñandú «x» \\   😀';
  const RENGLONES = '[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]';
  prueba('VB-01 proyecto con comillas, barra, Ñ, «», U+2028 y emoji: guardado y leído, BYTES idénticos (convert_to UTF8), también por autorizacion_para_verificar', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      await rpcT(t, 'registrar_autorizacion', deElias(db, { p_proyecto: RARO }));
      const fila = (await t.query(`select proyecto, encode(convert_to(proyecto, 'UTF8'), 'hex') as h, octet_length(proyecto) as bytes, length(proyecto) as letras from public.autorizaciones`))[0];
      const v = await rpcT(t, 'autorizacion_para_verificar', { p_folio: 'COT-0042-B@K7QM', p_codigo: 'ABCD-EF01-2345' });
      return { fila, v };
    });
    igual(x.fila.proyecto, RARO);
    igual(x.fila.h, Buffer.from(RARO, 'utf8').toString('hex'), 'los bytes UTF-8 son los mismos');
    igual([x.fila.bytes, x.fila.letras], [Buffer.byteLength(RARO, 'utf8'), [...RARO].length]);
    igual(x.v.filas[0].proyecto, RARO, 'y por la RPC que lee /verificar');
  });
  prueba('VB-02 renglones = [["Letras «TACOS»",8,9600],["Bastidor",1,1710]]: texto idéntico (sin espacios añadidos, mismo orden y escapes) y NO jsonb; un renglón con espacios y escapes raros también', async () => {
    const db = await plantilla();
    const raros = '[ ["a \\"b\\"" , 1 ,2.50 ],["\\u00f1",3,4.0] ]';
    const x = await SR(db).transaccion(async t => {
      await rpcT(t, 'registrar_autorizacion', deElias(db, { p_renglones: RENGLONES }));
      await rpcT(t, 'registrar_autorizacion', deElias(db, { p_folio_global: 'COT-0043-B@K7QM', p_renglones: raros, ...sello(0x4300) }));
      return (await t.query(`select folio_global, renglones, pg_typeof(renglones)::text as tipo, formato from public.autorizaciones order by id`));
    });
    igual(x.map(f => [f.renglones, f.tipo, f.formato]), [[RENGLONES, 'text', 'v2'], [raros, 'text', 'v2']]);
  });
  prueba('VB-03 ts_iso, huella (con ~ , |) e items_auth («1:8500.00,10:5.00,2:1500.00»: orden de TEXTO) idénticos; los tipos son text', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      await rpcT(t, 'registrar_autorizacion', deElias(db, { p_huella: HUELLA_TACOS, p_items_auth: '1:8500.00,10:5.00,2:1500.00', p_ts_iso: '2026-10-09T23:59:59.999Z' }));
      return (await t.query(`select ts_iso, huella, items_auth, pg_typeof(ts_iso)::text as t1, pg_typeof(huella)::text as t2, pg_typeof(items_auth)::text as t3 from public.autorizaciones`))[0];
    });
    igual([x.ts_iso, x.huella, x.items_auth, x.t1, x.t2, x.t3], ['2026-10-09T23:59:59.999Z', HUELLA_TACOS, '1:8500.00,10:5.00,2:1500.00', 'text', 'text', 'text']);
  });
  prueba('VB-04 importes 12500.00, 0.00 y 13119.60 tal cual; las columnas generadas (sub_calc, precio_auth, total) salen de ese texto: 12500.00, 0.00, 13119.60', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      await rpcT(t, 'registrar_autorizacion', deElias(db, { p_sub_calc_txt: '12500.00', p_precio_auth_txt: '0.00', p_total_txt: '13119.60' }));
      return (await t.query(`select sub_calc_txt, precio_auth_txt, total_txt, sub_calc::text as sc, precio_auth::text as pa, total::text as tt from public.autorizaciones`))[0];
    });
    igual([x.sub_calc_txt, x.precio_auth_txt, x.total_txt, x.sc, x.pa, x.tt], ['12500.00', '0.00', '13119.60', '12500.00', '0.00', '13119.60']);
  });
});

describir('VB-05 los vectores del mapa 04, ida y vuelta por la base', () => {
  for (const cod of ['ascii-?', 'utf-8']) {
    for (const v of VECTORES) {
      prueba(`VB-05 ${v.nombre} (${cod}): se firma con la clave FALSA, se guarda, se lee con autorizacion_para_verificar y VERIFICA; el código impreso es ${cod === 'utf-8' ? v.utf8 : v.ascii}`, async () => {
        const db = await plantilla();
        const s = await Sello.sellar(v.r, CLAVE_DEL_MAPA, { codificacion: cod });
        igual([s.codigo, s.codificacion, s.formato], [cod === 'utf-8' ? v.utf8 : v.ascii, cod, v.r.renglones ? 'AL3D-AUTH-v2' : 'AL3D-AUTH-v1']);
        const fila = await SR(db).transaccion(async t => {
          const r = await rpcT(t, 'registrar_autorizacion', argumentos(v.r, s));
          if (!r.ok) throw new Error('registrar_autorizacion: ' + JSON.stringify(r));
          const p = await rpcT(t, 'autorizacion_para_verificar', { p_folio: v.r.folio, p_codigo: s.codigo });
          return p.filas[0];
        });
        cierto(fila, 'la fila se encontró por folio y código');
        igual([fila.firma, fila.codigo, fila.codificacion, fila.estado], [s.firma, s.codigo, cod, 'vigente'], 'lo que se guardó es lo que se firmó');
        const veredicto = await Sello.verificar(fila, CLAVE_DEL_MAPA);
        igual([veredicto.valida, veredicto.motivo, veredicto.formato], [true, 'ok', v.r.renglones ? 'AL3D-AUTH-v2' : 'AL3D-AUTH-v1']);
        igual(hmacIndependiente(Sello.canonDe(Sello.registroDeFila(fila)), CLAVE_DEL_MAPA, cod), fila.firma, 'node:crypto, sin pasar por sello.js, da la misma firma tras el viaje');
        igual(Sello.codigoDe(fila.firma), fila.codigo);
        if (v.nombre !== 'V1') {      // con la OTRA codificación NO cuadra (la fila trae la suya y verificar() usa SOLO esa): la prueba no es una tautología
          const otra = cod === 'utf-8' ? 'ascii-?' : 'utf-8';
          igual((await Sello.verificar({ ...fila, codificacion: otra }, CLAVE_DEL_MAPA)).valida, false);
        }
        igual((await Sello.verificar(fila, 'FALSO-otra-clave')).valida, false, 'con otra clave no cuadra');
      });
    }
  }
  prueba('VB-05 texto raro de punta a punta: un negocio con comillas, «», U+2028 y emoji se firma, viaja por la base y VERIFICA con las dos codificaciones', async () => {
    const db = await plantilla();
    const r = { ...BASE_TACOS, folio: 'COT-0099-B@K7QM', proyecto: 'Tacos "El Güero" | Ñandú «x» \\   😀', itemsAuth: '1:8500.00,10:5.00,2:1500.00' };
    for (const cod of ['ascii-?', 'utf-8']) {
      const s = await Sello.sellar(r, CLAVE_DEL_MAPA, { codificacion: cod });
      const fila = await SR(db).transaccion(async t => {
        const x = await rpcT(t, 'registrar_autorizacion', argumentos(r, s));
        if (!x.ok) throw new Error(JSON.stringify(x));
        return (await rpcT(t, 'autorizacion_para_verificar', { p_folio: 'COT-0099-B', p_codigo: s.codigo })).filas[0];
      });
      igual(fila.proyecto, r.proyecto);
      igual([cod, (await Sello.verificar(fila, CLAVE_DEL_MAPA)).valida], [cod, true]);
    }
  });
  prueba('VB-05 si la base cambiara UN byte de lo firmado, NO cuadraría: cada campo firmado alterado en la fila hace fallar la verificación', async () => {
    const db = await plantilla();
    const v = VECTORES[2], s = await Sello.sellar(v.r, CLAVE_DEL_MAPA);
    const fila = await SR(db).transaccion(async t => {
      await rpcT(t, 'registrar_autorizacion', argumentos(v.r, s));
      return (await rpcT(t, 'autorizacion_para_verificar', { p_folio: v.r.folio, p_codigo: s.codigo })).filas[0];
    });
    igual((await Sello.verificar(fila, CLAVE_DEL_MAPA)).valida, true);
    for (const [col, malo] of [['folio_global', 'COT-0041-B@K7QX'], ['ts_iso', '2026-10-01T04:30:15.124Z'], ['proyecto', 'Tacos El Güero '], ['sub_calc', '11310.01'], ['precio_auth', '14000.01'], ['total', '14000.01'],
                               ['items_auth', '2:1500.01'], ['huella', fila.huella + 'x'], ['autorizo', 'otro@al3d.mx'], ['renglones', fila.renglones.replace('10438', '10439')]]) {
      igual([col, (await Sello.verificar({ ...fila, [col]: malo }, CLAVE_DEL_MAPA)).valida], [col, false]);
    }
  });
});

describir('VB-06 una fila v2 sin renglones', () => {
  prueba('VB-06 una fila v2 con renglones vacíos se verifica como v1 y FALLA A PROPÓSITO: la base no la «arregla» (se guarda tal cual y su formato generado es v1)', async () => {
    const db = await plantilla();
    const v = VECTORES[1], s = await Sello.sellar(v.r, CLAVE_DEL_MAPA);            // la firma es la de la v2 (con renglones)
    const fila = await SR(db).transaccion(async t => {
      const r = await rpcT(t, 'registrar_autorizacion', argumentos(v.r, s, { p_renglones: '' }));       // pero a la celda le vaciaron los renglones
      if (!r.ok) throw new Error(JSON.stringify(r));
      return { f: (await rpcT(t, 'autorizacion_para_verificar', { p_folio: v.r.folio, p_codigo: s.codigo })).filas[0], tabla: (await t.query(`select renglones, formato from public.autorizaciones`))[0] };
    });
    igual([fila.tabla.renglones, fila.tabla.formato, fila.f.renglones], ['', 'v1', '']);
    const veredicto = await Sello.verificar(fila.f, CLAVE_DEL_MAPA);
    igual([veredicto.valida, veredicto.motivo, veredicto.formato], [false, 'firma_no_coincide', 'AL3D-AUTH-v1']);
  });
});

await resumen();
