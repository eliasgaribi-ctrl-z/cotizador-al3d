/* LAS IMÁGENES DE LAS COTIZACIONES EN LA NUBE (Supabase Storage, APAGADO) — js/datos/supa-imagenes.js,
 * su enchufe (js/datos/supa-enchufe.js) y lo que cambió en js/cotizador/imagenes.js.
 *
 * Lo que se vigila:
 *   · APAGADO NO PIDE NADA. El cotizador DE VERDAD (js/cotizador/imagenes.js, en un contexto aparte con
 *     un IndexedDB de mentiras) sin la ventanilla `AL3D_NUBE`: una imagen que no está en el teléfono se
 *     da por perdida como siempre, sin una sola petición; y leyendo el código: nadie importa el módulo
 *     nuevo de forma estática, la ventanilla solo la pone la lectura en vivo y solo a Dirección o Pagos;
 *   · el plan: qué se sube y a qué carpeta (<empresa>/<folio_global>/<id>.jpg), una vez por id aunque
 *     dos cotizaciones la compartan, sin las entradas sin aparato;
 *   · subir: idempotente por id (lo subido no se vuelve a mandar; «ya existe» cuenta como subida), con
 *     reintento que no bloquea (la red o la sesión paran la vuelta y se sigue en la siguiente), lo
 *     definitivo se aparta, pocas por vuelta, un tope por aparato;
 *   · Pagos solo sube lo de SUS cotizaciones que ya están en la base; Fabricación ni sube ni baja;
 *   · bajar: URL firmada de 60 s, busca en las carpetas que la comparten, no repite lo que no encontró;
 *   · Q-02 bis (decidido por Elías el 2026-10-16): la imagen que comparte una duplicada GANADA se copia a
 *     la carpeta de la ganada; Fabricación (y Dirección) ven en la ficha las imágenes de una obra
 *     ganada, por la ventanilla `obra`, y las de una no ganada o cancelada no se piden.
 *
 * No toca Supabase: el cliente de supabase-js y la red son dobles. Se corre con pruebas/correr.sh. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { idbConIndices } from './comun/base-de-mentiras.mjs';
import * as I from '../js/datos/supa-imagenes.js';
import { almacenEnMemoria } from '../js/datos/supa-sombra.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const espera = (ms = 5) => new Promise(r => setTimeout(r, ms));
/** Espera a que `cond()` se cumpla (el IndexedDB de mentiras va de setTimeout en setTimeout), hasta 3 s. */
const hasta = async cond => { for (let i = 0; i < 300 && !cond(); i++) await espera(10); };

/* ── Imágenes de mentiras: JPEG «de verdad» (los bytes que sean, con su data URL) ───────────────── */
const jpeg = (n, semilla = 1) => {
  const b = new Uint8Array(n); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  for (let i = 3; i < n; i++) b[i] = (i * 31 + semilla * 17) & 0xff;
  return b;
};
const dataUrl = (bytes, tipo = 'image/jpeg') => 'data:' + tipo + ';base64,' + Buffer.from(bytes).toString('base64');

/* ── El doble de supabase-js: storage.from(b).upload / createSignedUrl, y from('cotizaciones') ──── */
function nube(o = {}) {
  const objetos = new Map();              // ruta → {bytes, tipo}
  const llamadas = [];
  let clientes = 0;
  const cliente = {
    storage: {
      from: bucket => ({
        async upload(ruta, blob, opts) {
          llamadas.push(['subir', bucket, ruta, opts && opts.upsert, blob.type, blob.size]);
          const g = o.subir && o.subir(ruta, llamadas.length);
          if (g) { if (g.lanza) throw g.lanza; return g; }
          if (objetos.has(ruta)) return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '409', message: 'The resource already exists' } };
          objetos.set(ruta, { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: blob.type, opts });
          return { data: { path: ruta }, error: null };
        },
        async copy(de, a) {
          llamadas.push(['copiar', bucket, de, a]);
          const g = o.copiar && o.copiar(de, a);
          if (g) { if (g.lanza) throw g.lanza; return g; }
          if (!objetos.has(de)) return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '404', message: 'Object not found' } };
          if (objetos.has(a)) return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '409', message: 'The resource already exists' } };
          objetos.set(a, { ...objetos.get(de) });
          return { data: { path: a }, error: null };
        },
        async createSignedUrl(ruta, segundos) {
          llamadas.push(['firmar', bucket, ruta, segundos]);
          const g = o.firmar && o.firmar(ruta);
          if (g) return g;
          if (!objetos.has(ruta)) return { data: null, error: { name: 'StorageApiError', status: 400, statusCode: '404', message: 'Object not found' } };
          return { data: { signedUrl: 'https://nube.test/storage/v1/object/sign/' + bucket + '/' + ruta + '?token=t' + segundos }, error: null };
        },
      }),
    },
    from(tabla) {
      const q = { tabla, filtros: [] };
      const b = {
        select(c) { q.select = c; return b; },
        eq(c, v) { q.filtros.push(['eq', c, v]); return b; },
        in(c, v) { q.filtros.push(['in', c, v]); llamadas.push(['consulta', tabla, JSON.parse(JSON.stringify(q))]); return Promise.resolve(o.consulta ? o.consulta(q) : { data: [], error: null }); },
      };
      return b;
    },
  };
  /* La red de la URL firmada: sirve lo que haya en `objetos`. */
  const red = [];
  const fetch = async url => {
    red.push(url);
    if (o.red) { const g = o.red(url); if (g) { if (g.lanza) throw g.lanza; return g; } }
    const m = /\/object\/sign\/[^/]+\/(.+)\?token=/.exec(url);
    const x = m && objetos.get(decodeURIComponent(m[1]));
    if (!x) return { ok: false, status: 400, headers: { get: () => 'application/json' }, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, headers: { get: h => (h.toLowerCase() === 'content-type' ? x.tipo : null) }, arrayBuffer: async () => x.bytes.slice().buffer };
  };
  return { cliente: async () => { clientes++; return cliente; }, objetos, llamadas, red, fetch, clientes: () => clientes };
}

/** Un teléfono: su historial, sus imágenes locales y su registro de la sombra. */
function telefono({ historial, locales = {}, area = 'direccion', n, ahora = () => 5000 }) {
  const almacen = almacenEnMemoria();
  const leidas = [];
  const im = I.crearImagenes({
    cliente: n.cliente, almacen, area: () => area, empresa: 'al3d', historial: () => historial, fetch: n.fetch, ahora, enLinea: () => true,
    leerLocal: async id => { leidas.push(id); return locales[id] || null; },
  });
  return { im, almacen, leidas, reg: async () => (await almacen.listar('imagenes')).sort((a, b) => (a.id < b.id ? -1 : 1)) };
}

/* El historial de siempre: A es la original (la más vieja), B la duplicó (comparte plano y render) y
   agrega su propuesta, C es una entrada vieja sin aparato. */
const A = { folio: 'COT-0001', disp: 'K7QM', ts: 1000, items: [{ id: 1, plano: 'img-a' }, { id: 2 }], renders: ['img-r1'], propuesta: [] };
const Bd = { folio: 'COT-0002', disp: 'K7QM', ts: 2000, items: [{ id: 1, plano: 'img-a' }], renders: ['img-r1'], propuesta: ['img-p1'] };
const C = { folio: 'COT-0003', ts: 500, items: [], renders: ['img-x'] };
const HIST = [Bd, A, C];                    // el cotizador guarda la más nueva arriba
const BYTES = { 'img-a': jpeg(3000, 1), 'img-r1': jpeg(2000, 2), 'img-p1': jpeg(1500, 3), 'img-x': jpeg(1000, 4) };
const LOCALES = Object.fromEntries(Object.entries(BYTES).map(([id, b]) => [id, { id, url: dataUrl(b), w: 1800, h: 1200, ts: 1 }]));
const R = (fg, id) => 'al3d/' + fg + '/' + id + '.jpg';

try {
  console.log('\nLO PURO: el plan, las data URL y los errores de Storage');
  {
    eq('folio global = folio@aparato; sin aparato, nada', [I.folioGlobalDe(A), I.folioGlobalDe(C), I.folioGlobalDe({ folio: 'COT 1', disp: 'K7QM' })], ['COT-0001@K7QM', '', '']);
    eq('los ids: el plano de cada partida, los renders y la propuesta (sin repetir, sin basura)',
      I.idsDe({ items: [{ plano: 'img-a' }, { plano: 'img-a' }, { plano: 7 }, null], renders: ['img-r1', '../x'], propuesta: ['img-p1'] }), ['img-a', 'img-r1', 'img-p1']);
    const p = I.planDeSubida(HIST, { empresa: 'al3d' });
    eq('cada imagen va UNA vez, en la carpeta de la cotización más vieja que la usa', [...p.imagenes.values()].map(x => [x.id, x.ruta]),
      [['img-a', R('COT-0001@K7QM', 'img-a')], ['img-r1', R('COT-0001@K7QM', 'img-r1')], ['img-p1', R('COT-0002@K7QM', 'img-p1')]]);
    eq('y recuerda las demás carpetas que la usan (ahí se busca al bajarla)', p.imagenes.get('img-a').candidatos, [R('COT-0001@K7QM', 'img-a'), R('COT-0002@K7QM', 'img-a')]);
    eq('la entrada sin aparato no se sube: se cuenta', p.sinAparato, 1);
    const q = I.planDeSubida(HIST, { empresa: 'al3d', permitidos: new Set(['COT-0002@K7QM']) });
    eq('con carpetas permitidas (Pagos), la imagen compartida va a la permitida', [...q.imagenes.values()].map(x => x.ruta),
      [R('COT-0002@K7QM', 'img-a'), R('COT-0002@K7QM', 'img-r1'), R('COT-0002@K7QM', 'img-p1')]);
    const b = jpeg(70000, 9);
    const ida = I.bytesDeDataUrl(dataUrl(b));
    eq('data URL → bytes → data URL, igual', [ida.tipo, ida.bytes.length, I.dataUrlDeBytes(ida.bytes, ida.tipo) === dataUrl(b)], ['image/jpeg', 70000, true]);
    eq('lo que pesa sin decodificar', [I.bytesAprox(dataUrl(b)), I.bytesAprox(dataUrl(jpeg(1001)))], [70000, 1001]);
    eq('una data URL que no es base64 o no es data URL: null', [I.bytesDeDataUrl('data:image/jpeg,abc'), I.bytesDeDataUrl('https://x/y.jpg')], [null, null]);
    const L = e => I.leerError(e).caso;
    eq('Storage: ya existe / no existe / sin permiso / pesada / tipo / sesión / red / sin bucket', [
      L({ statusCode: '409', status: 400, message: 'The resource already exists' }), L({ statusCode: '404', message: 'Object not found' }),
      L({ statusCode: '403', message: 'new row violates row-level security policy' }), L({ statusCode: '413', message: 'The object exceeded the maximum allowed size' }),
      L({ statusCode: '415', message: 'mime type image/gif is not supported' }), L({ statusCode: '400', message: 'jwt expired' }),
      L({ name: 'StorageUnknownError', message: 'Failed to fetch' }), L({ statusCode: '404', message: 'Bucket not found' })],
      ['ya_estaba', 'no_esta', 'rechazada', 'rechazada', 'rechazada', 'reintentar', 'reintentar', 'reintentar']);
    eq('la ruta del diseño', I.rutaDe('al3d', 'COT-0042-B@K7QM', 'img-x1'), 'al3d/COT-0042-B@K7QM/img-x1.jpg');
    eq('solo Dirección y Pagos', ['direccion', 'pagos', 'fabricacion', '', null].map(I.puedeImagenes), [true, true, false, false, false]);
    eq('las de una obra ganada en la ficha (Q-02 bis): Dirección y Fabricación, no Pagos', ['direccion', 'pagos', 'fabricacion', '', null].map(I.puedeVerObra),
      [true, false, true, false, false]);
    const g = { folio_global: 'COT-0042@K7QM', folio_hoja: 'V-042', etapa: 'armado', deleted_at: null };
    eq('ganada = la regla de la política: V-###, no cancelada, no borrada (y con folio de cotización)', [
      I.esGanada(g), I.esGanada({ ...g, etapa: 'garantia' }), I.esGanada({ ...g, etapa: 'cancelado' }), I.esGanada({ ...g, folio_hoja: null }),
      I.esGanada({ ...g, deleted_at: '2026-10-16T00:00:00Z' }), I.esGanada({ ...g, folio_global: null }), I.esGanada({ ...g, etapa: null }), I.esGanada(null)],
      [true, true, false, false, false, false, false, false]);
    eq('las imágenes de una obra: el plano de cada partida, los renders y la propuesta, con su rótulo, sin repetir ni basura',
      I.imagenesDeObra({ items: [{ plano: 'img-a' }, null, { plano: 'img-b' }, { plano: 'img-a' }], renders: ['img-r1', 7], propuesta: ['img-p1', '../x', 'img-b'], precio: 9 }),
      [{ id: 'img-a', que: 'Plano · partida 1' }, { id: 'img-b', que: 'Plano · partida 3' }, { id: 'img-r1', que: 'Render 1' }, { id: 'img-p1', que: 'Propuesta 1' }]);
    eq('sin origen de obra, ninguna', [I.imagenesDeObra(null), I.imagenesDeObra('x'), I.imagenesDeObra({})], [[], [], []]);
    const reg = new Map([['img-a', { id: 'img-a', ruta: R('COT-0001@K7QM', 'img-a'), estado: 'subida' }], ['img-r1', { id: 'img-r1', ruta: R('COT-0001@K7QM', 'img-r1'), estado: 'apartada' }],
                         [I.claveCopia(R('COT-0002@K7QM', 'img-x')), { estado: 'copiada' }]]);
    eq('copias posibles: solo de lo que ya está en la nube, a las OTRAS carpetas que la usan, y no las ya hechas', I.copiasPosibles(p.imagenes, reg),
      [{ id: 'img-a', de: R('COT-0001@K7QM', 'img-a'), ruta: R('COT-0002@K7QM', 'img-a'), folio_global: 'COT-0002@K7QM' }]);
    reg.set(I.claveCopia(R('COT-0002@K7QM', 'img-a')), { estado: 'copiada' });
    eq('y una vez copiada, ya no', I.copiasPosibles(p.imagenes, reg), []);
  }

  console.log('\nSUBIR (Dirección): una vez por id, idempotente');
  const N = nube();
  {
    const t = telefono({ historial: HIST, locales: LOCALES, n: N });
    const r = await t.im.subir();
    eq('sube las tres que tiene y no la de la entrada sin aparato', [r.motivo, r.subidas, r.ya_estaban, r.apartadas], ['ok', 3, 0, 0]);
    eq('a sus carpetas, sin sobrescribir nunca (upsert: false), como JPEG y con su peso real', N.llamadas.filter(x => x[0] === 'subir').map(x => x.slice(2)), [
      [R('COT-0001@K7QM', 'img-a'), false, 'image/jpeg', 3000], [R('COT-0001@K7QM', 'img-r1'), false, 'image/jpeg', 2000], [R('COT-0002@K7QM', 'img-p1'), false, 'image/jpeg', 1500]]);
    eq('al bucket privado de storage.sql', [...new Set(N.llamadas.filter(x => x[0] === 'subir').map(x => x[1]))], ['cotizacion-imagenes']);
    eq('y pregunta UNA vez si la duplicada (COT-0002) es una obra ganada; no lo es: no copia nada', N.llamadas.filter(x => x[0] !== 'subir').map(x => [x[0], x[1], x[2].filtros]),
      [['consulta', 'proyectos', [['eq', 'empresa_id', 'al3d'], ['in', 'folio_global', ['COT-0002@K7QM']]]]]);
    eq('ni lo cuenta como copia', r.copiadas, 0);
    eq('lo que llegó a la nube son los MISMOS bytes', [...N.objetos.entries()].map(([k, v]) => [k, Buffer.from(v.bytes).equals(Buffer.from(BYTES[k.split('/')[2].replace('.jpg', '')]))]),
      [[R('COT-0001@K7QM', 'img-a'), true], [R('COT-0001@K7QM', 'img-r1'), true], [R('COT-0002@K7QM', 'img-p1'), true]]);
    eq('con sus medidas en los metadatos del objeto', N.objetos.get(R('COT-0001@K7QM', 'img-a')).opts.metadata, { w: 1800, h: 1200, ts: 1 });
    eq('y lo anota en la base local de la sombra', (await t.reg()).map(x => [x.id, x.estado, x.bytes]), [['img-a', 'subida', 3000], ['img-p1', 'subida', 1500], ['img-r1', 'subida', 2000]]);
    const antes = N.llamadas.length;
    const r2 = await t.im.subir();
    eq('IDEMPOTENTE: la segunda vuelta no manda nada', [r2.motivo, N.llamadas.length - antes], ['nada', 0]);
    const e = await t.im.estado();
    eq('Ajustes: 3 subidas (6500 bytes), nada por subir, 1 entrada sin aparato', [e.subidas, e.bytes, e.porSubir, e.sinAparato, e.apartadas], [3, 6500, 0, 1, 0]);

    /* Otro teléfono (o este mismo después de un respaldo) que no tiene el registro: la nube ya las tiene. */
    const t2 = telefono({ historial: HIST, locales: LOCALES, n: N });
    const r3 = await t2.im.subir();
    eq('si la nube ya la tiene («ya existe»), cuenta como subida y no se vuelve a intentar', [r3.motivo, r3.subidas, r3.ya_estaban], ['ok', 0, 3]);
    eq('y queda anotada como «ya estaba»', (await t2.reg()).map(x => x.estado), ['ya_estaba', 'ya_estaba', 'ya_estaba']);
    const antes2 = N.llamadas.length;
    await t2.im.subir();
    eq('tampoco la vuelve a mandar', N.llamadas.length - antes2, 0);
  }

  console.log('\nREINTENTO SIN BLOQUEAR NADA');
  {
    let cae = true;
    const n = nube({ subir: () => (cae ? { lanza: Object.assign(new Error('Failed to fetch'), { name: 'StorageUnknownError' }) } : null) });
    const t = telefono({ historial: HIST, locales: LOCALES, n });
    const r = await t.im.subir();
    eq('sin red: se para en la primera, no anota nada y NO lanza', [r.motivo, r.subidas, (await t.reg()).length, n.llamadas.length], ['parada', 0, 0, 1]);
    cae = false;
    const r2 = await t.im.subir();
    eq('la vuelta siguiente las sube todas', [r2.motivo, r2.subidas], ['ok', 3]);

    const sesion = nube({ subir: (ruta, k) => (k === 1 ? { data: null, error: { status: 400, statusCode: '400', message: 'jwt expired' } } : null) });
    const ts = telefono({ historial: HIST, locales: LOCALES, n: sesion });
    const r3 = await ts.im.subir();
    eq('sesión vencida: se reintenta (no se aparta)', [r3.motivo, r3.codigo, (await ts.reg()).length], ['parada', 'SIN_SESION', 0]);
    eq('y el estado lo dice', (await ts.im.estado()).ultimo_error, 'La sesión de la base venció: se reintenta al renovarse.');

    const rls = nube({ subir: ruta => (ruta.endsWith('img-r1.jpg') ? { data: null, error: { status: 400, statusCode: '403', message: 'new row violates row-level security policy' } } : null) });
    const tr = telefono({ historial: HIST, locales: LOCALES, n: rls });
    const r4 = await tr.im.subir();
    eq('la base no la deja: se APARTA con su motivo y la vuelta sigue con las demás', [r4.motivo, r4.subidas, r4.apartadas], ['ok', 2, 1]);
    eq('apartada', (await tr.reg()).filter(x => x.estado === 'apartada').map(x => [x.id, x.codigo]), [['img-r1', 'SIN_PERMISO']]);
    const antes = rls.llamadas.length;
    await tr.im.subir();
    eq('lo apartado no se vuelve a intentar solo', rls.llamadas.length - antes, 0);
    eq('«Reintentar las rechazadas» la devuelve a la fila', await tr.im.reintentarApartadas(), 1);
    await tr.im.subir();
    eq('y se vuelve a intentar', rls.llamadas.slice(antes).map(x => x[2]), [R('COT-0001@K7QM', 'img-r1')]);

    const pesada = nube();
    const tp = telefono({ historial: [{ ...A, renders: ['img-g'], items: [] }], locales: { 'img-g': { id: 'img-g', url: dataUrl(jpeg(2 * 1024 * 1024 + 1)) } }, n: pesada });
    const r5 = await tp.im.subir();
    eq('una de más de 2 MB (el tope del bucket) se aparta SIN mandarla', [r5.apartadas, pesada.llamadas.length, (await tp.reg())[0].codigo], [1, 0, 'DEMASIADO_GRANDE']);
    const tq = telefono({ historial: [{ ...A, renders: ['img-q'], items: [] }], locales: { 'img-q': { id: 'img-q', url: 'data:text/html;base64,PGgxPg==' } }, n: pesada });
    eq('una que no es imagen, igual', [(await tq.im.subir()).apartadas, pesada.llamadas.length], [1, 0]);

    const muchas = { folio: 'COT-0009', disp: 'K7QM', ts: 9, items: [], renders: [], propuesta: Array.from({ length: 10 }, (_, i) => 'img-m' + i) };
    const nm = nube();
    const tm = telefono({ historial: [muchas], locales: Object.fromEntries(muchas.propuesta.map((id, i) => [id, { id, url: dataUrl(jpeg(100, i)) }])), n: nm });
    const r6 = await tm.im.subir();
    eq('pocas por vuelta: ' + I.POR_VUELTA + ' y avisa que hay más', [r6.subidas, r6.hay_mas], [I.POR_VUELTA, true]);
    const r7 = await tm.im.subir();
    eq('la siguiente sube el resto', [r7.subidas, r7.hay_mas], [10 - I.POR_VUELTA, false]);

    const nt = nube();
    const tt = telefono({ historial: HIST, locales: LOCALES, n: nt });
    await tt.almacen.poner('imagenes', { id: 'img-vieja', ruta: 'al3d/X@K7QM/img-vieja.jpg', estado: 'subida', bytes: I.TOPE_APARATO - 100 });
    const r8 = await tt.im.subir();
    eq('el tope del aparato: se para antes de mandar y lo dice', [r8.motivo, r8.codigo, nt.llamadas.length, (await tt.im.estado()).tope], ['parada', 'TOPE', 0, true]);

    const sinLocal = nube();
    const tl = telefono({ historial: HIST, locales: {}, n: sinLocal });
    const r9 = await tl.im.subir();
    eq('lo que no está en ESTE teléfono no se sube ni se anota (la sube el que la tenga)', [r9.subidas, sinLocal.llamadas.length, (await tl.reg()).length], [0, 0, 0]);
  }

  console.log('\nPAGOS: solo lo de SUS cotizaciones que ya están en la base');
  {
    const n = nube({ consulta: q => ({ data: q.filtros.find(f => f[0] === 'in')[2].filter(fg => fg === 'COT-0002@K7QM').map(folio_global => ({ folio_global })), error: null }) });
    const t = telefono({ historial: HIST, locales: LOCALES, n, area: 'pagos' });
    const r = await t.im.subir();
    eq('pregunta a la base cuáles son suyas (la RLS solo le enseña las suyas)', n.llamadas.filter(x => x[0] === 'consulta').map(x => [x[1], x[2].select, x[2].filtros]),
      [['cotizaciones', 'folio_global', [['eq', 'empresa_id', 'al3d'], ['in', 'folio_global', ['COT-0001@K7QM', 'COT-0002@K7QM']]]]]);
    eq('y sube solo a la suya (COT-0002), también lo que comparte con la de otro', n.llamadas.filter(x => x[0] === 'subir').map(x => x[2]),
      [R('COT-0002@K7QM', 'img-a'), R('COT-0002@K7QM', 'img-r1'), R('COT-0002@K7QM', 'img-p1')]);
    eq('ok', [r.motivo, r.subidas], ['ok', 3]);
    const nada = nube();
    const t2 = telefono({ historial: HIST, locales: LOCALES, n: nada, area: 'pagos' });
    const r2 = await t2.im.subir();
    eq('sin ninguna cotización suya en la base, espera sin subir nada', [r2.motivo, nada.llamadas.filter(x => x[0] === 'subir').length], ['esperan_cotizacion', 0]);
    const cae = nube({ consulta: () => ({ data: null, error: { message: 'Failed to fetch' } }) });
    const t3 = telefono({ historial: HIST, locales: LOCALES, n: cae, area: 'pagos' });
    eq('si la base no contesta, se para y se reintenta', [(await t3.im.subir()).motivo, cae.llamadas.filter(x => x[0] === 'subir').length], ['parada', 0]);
  }

  console.log('\nFABRICACIÓN NO SUBE NI BAJA (Q-02: las cotizaciones llevan precios)');
  {
    const n = nube();
    for (const [area, motivo] of [['fabricacion', 'sin_permiso'], ['', 'sin_area']]) {
      const t = telefono({ historial: HIST, locales: LOCALES, n, area });
      eq('«' + area + '»: no sube', (await t.im.subir()).motivo, motivo);
      eq('«' + area + '»: no baja', await t.im.bajar(['img-a']), {});
    }
    eq('y no pidió NADA: ni el cliente de Supabase, ni la red, ni leyó una imagen', [n.clientes(), n.llamadas.length, n.red.length], [0, 0, 0]);
  }

  console.log('\nBAJAR (lectura en vivo): URL firmada de 60 s');
  {
    /* La nube ya tiene lo de Dirección (N). Un teléfono nuevo con el historial restaurado y sin imágenes. */
    const t = telefono({ historial: HIST, locales: {}, n: N });
    const antes = N.llamadas.length;
    const r = await t.im.bajar(['img-a', 'img-p1', 'img-zz', 'img-a']);
    eq('trae las que están, con los mismos bytes', Object.keys(r).sort(), ['img-a', 'img-p1']);
    eq('como data URL', [r['img-a'] === dataUrl(BYTES['img-a']), r['img-p1'] === dataUrl(BYTES['img-p1'])], [true, true]);
    eq('cada una con una URL firmada de ' + I.SEGUNDOS_URL + ' s, buscando en la carpeta de la más vieja', N.llamadas.slice(antes).map(x => [x[0], x[2], x[3]]),
      [['firmar', R('COT-0001@K7QM', 'img-a'), 60], ['firmar', R('COT-0002@K7QM', 'img-p1'), 60]]);
    eq('la que no está en ninguna carpeta del historial ni se busca', N.red.every(u => !/img-zz/.test(u)), true);
    const antes2 = N.llamadas.length;
    eq('lo que no se encontró no se vuelve a pedir en 10 minutos', [await t.im.bajar(['img-zz']), N.llamadas.length - antes2], [{}, 0]);

    /* Una imagen compartida que se subió en la carpeta de B (Pagos sube a la suya): se busca en A, no está, y se sigue a B. */
    const nb = nube();
    nb.objetos.set(R('COT-0002@K7QM', 'img-a'), { bytes: BYTES['img-a'], tipo: 'image/jpeg' });
    const tb = telefono({ historial: HIST, locales: {}, n: nb });
    eq('si no está en la carpeta de la más vieja, la busca en las demás que la usan', [Object.keys(await tb.im.bajar(['img-a'])), nb.llamadas.map(x => x[2])],
      [['img-a'], [R('COT-0001@K7QM', 'img-a'), R('COT-0002@K7QM', 'img-a')]]);

    const raro = nube({ red: () => ({ ok: true, headers: { get: () => 'text/html' }, arrayBuffer: async () => new Uint8Array([60, 104, 49]).buffer }) });
    raro.objetos.set(R('COT-0001@K7QM', 'img-a'), { bytes: BYTES['img-a'], tipo: 'image/jpeg' });
    eq('lo que no es imagen no se devuelve', await telefono({ historial: HIST, locales: {}, n: raro }).im.bajar(['img-a']), {});

    let cae = true;
    const sinRed = nube({ firmar: () => (cae ? { data: null, error: { name: 'StorageUnknownError', message: 'Failed to fetch' } } : null) });
    sinRed.objetos.set(R('COT-0001@K7QM', 'img-a'), { bytes: BYTES['img-a'], tipo: 'image/jpeg' });
    const ts = telefono({ historial: HIST, locales: {}, n: sinRed });
    eq('sin red: no devuelve nada, no lanza', await ts.im.bajar(['img-a', 'img-p1']), {});
    eq('y se para en la primera', sinRed.llamadas.length, 1);
    cae = false;
    eq('y como no fue «no está», la próxima vez sí la pide', Object.keys(await ts.im.bajar(['img-a'])), ['img-a']);
  }

  /* La base de mentiras de las obras: COT-0002 (la duplicada Bd) está GANADA, con su copia sin precios. */
  const OBRA_B = { items: [{ id: 1, plano: 'img-a' }], renders: ['img-r1'], propuesta: ['img-p1'] };
  const ganadaB = q => ({ data: q.tabla !== 'proyectos' ? [] : q.filtros.find(f => f[0] === 'in')[2].filter(fg => fg === 'COT-0002@K7QM')
    .map(folio_global => ({ folio_global, folio_hoja: 'V-042', etapa: 'en_diseno', deleted_at: null, origen_obra: OBRA_B })), error: null });

  console.log('\nQ-02 BIS · LA DUPLICADA GANADA: la imagen que comparte se COPIA a la carpeta de la ganada');
  {
    const n = nube({ consulta: ganadaB });
    const t = telefono({ historial: HIST, locales: LOCALES, n });
    const r = await t.im.subir();
    eq('sube las tres y copia las DOS que comparte (el plano y el render) a COT-0002, que la base dice ganada', [r.motivo, r.subidas, r.copiadas], ['ok', 3, 2]);
    eq('con una copia de Storage (no se vuelven a subir), de la carpeta de la más vieja a la de la ganada', n.llamadas.filter(x => x[0] === 'copiar').map(x => x.slice(1)), [
      ['cotizacion-imagenes', R('COT-0001@K7QM', 'img-a'), R('COT-0002@K7QM', 'img-a')], ['cotizacion-imagenes', R('COT-0001@K7QM', 'img-r1'), R('COT-0002@K7QM', 'img-r1')]]);
    eq('y se anotan aparte («copia:<ruta>»), sin tocar lo subido', (await t.reg()).map(x => [x.id, x.estado]), [
      ['copia:' + R('COT-0002@K7QM', 'img-a'), 'copiada'], ['copia:' + R('COT-0002@K7QM', 'img-r1'), 'copiada'], ['img-a', 'subida'], ['img-p1', 'subida'], ['img-r1', 'subida']]);
    const e = await t.im.estado();
    eq('Ajustes: 3 subidas y 2 copias', [e.subidas, e.copias, e.porSubir], [3, 2, 0]);
    const k = n.llamadas.length;
    eq('IDEMPOTENTE: la vuelta siguiente no copia ni pregunta nada', [(await t.im.subir()).motivo, n.llamadas.length - k], ['nada', 0]);
    const t2 = telefono({ historial: HIST, locales: LOCALES, n });
    const r2 = await t2.im.subir();
    eq('otro teléfono con el mismo historial: «ya existe» también en la copia, y cuenta como hecha', [r2.ya_estaban, r2.copiadas], [3, 2]);

    const f = telefono({ historial: [], locales: {}, n, area: 'fabricacion' });
    const o = await f.im.deObra('COT-0002@K7QM');
    eq('y Fabricación, que solo sabe el folio de la obra, encuentra las TRES en su carpeta (sin la copia, le faltaban el plano y el render)',
      [o.estado, o.imagenes.map(x => [x.id, x.que, x.url === dataUrl(BYTES[x.id])]), o.faltan],
      ['ok', [['img-a', 'Plano · partida 1', true], ['img-r1', 'Render 1', true], ['img-p1', 'Propuesta 1', true]], 0]);

    let gana = false, reloj = 5000;
    const nv = nube({ consulta: q => (gana ? ganadaB(q) : { data: [], error: null }) });
    const tv = telefono({ historial: HIST, locales: LOCALES, n: nv, ahora: () => reloj });
    eq('sin obra ganada no copia nada', (await tv.im.subir()).copiadas, 0);
    gana = true;
    const k2 = nv.llamadas.length;
    eq('lo que no estaba ganado no se vuelve a preguntar antes de 10 minutos', [(await tv.im.subir()).motivo, nv.llamadas.length - k2], ['nada', 0]);
    reloj += I.MS_NO_REPETIR;
    eq('a los 10 minutos se pregunta otra vez; ya ganada, se copia', (await tv.im.subir()).copiadas, 2);

    const nr = nube({ consulta: ganadaB, copiar: (de, a) => (a.endsWith('img-r1.jpg') ? { data: null, error: { status: 400, statusCode: '403', message: 'new row violates row-level security policy' } } : null) });
    const tr = telefono({ historial: HIST, locales: LOCALES, n: nr });
    const rr = await tr.im.subir();
    eq('una copia que la base no deja se APARTA con su motivo, y la otra sí se hace', [rr.copiadas, rr.apartadas, (await tr.reg()).filter(x => x.estado === 'apartada').map(x => [x.id, x.codigo])],
      [1, 1, [['copia:' + R('COT-0002@K7QM', 'img-r1'), 'SIN_PERMISO']]]);
    let cae = true;
    const nc = nube({ consulta: ganadaB, copiar: () => (cae ? { lanza: Object.assign(new Error('Failed to fetch'), { name: 'StorageUnknownError' }) } : null) });
    const tc = telefono({ historial: HIST, locales: LOCALES, n: nc });
    const rc = await tc.im.subir();
    eq('sin red al copiar: se para, no anota la copia y no lanza', [rc.motivo, rc.subidas, rc.copiadas, (await tc.reg()).filter(x => x.id.startsWith('copia:')).length], ['parada', 3, 0, 0]);
    cae = false;
    eq('la vuelta siguiente las copia', (await tc.im.subir()).copiadas, 2);
    const nq = nube({ consulta: q => (q.tabla === 'proyectos' ? { data: null, error: { message: 'Failed to fetch' } } : { data: [], error: null }) });
    const rq = await telefono({ historial: HIST, locales: LOCALES, n: nq }).im.subir();
    eq('si la base no contesta cuáles están ganadas: se para (sin copiar) y se reintenta', [rq.motivo, rq.subidas, rq.copiadas, nq.llamadas.filter(x => x[0] === 'copiar').length], ['parada', 3, 0, 0]);
    const np = nube({ consulta: q => (q.tabla === 'cotizaciones' ? { data: q.filtros.find(f => f[0] === 'in')[2].map(folio_global => ({ folio_global })), error: null } : ganadaB(q)) });
    eq('Pagos también copia, cuando las dos cotizaciones son suyas y están en la base', (await telefono({ historial: HIST, locales: LOCALES, n: np, area: 'pagos' }).im.subir()).copiadas, 2);
  }

  console.log('\nQ-02 BIS · LA FICHA: las imágenes de una OBRA GANADA (ventanilla `obra`, con la lectura en vivo)');
  {
    const OBRA = { items: [{ id: 1, plano: 'img-a' }, { id: 2 }, { id: 3, plano: 'img-a' }], renders: ['img-r1', 'img-falta'], propuesta: ['img-p1', '../x'] };
    const fila = (extra = {}) => ({ folio_global: 'COT-0042@K7QM', folio_hoja: 'V-042', etapa: 'armado', deleted_at: null, origen_obra: OBRA, ...extra });
    let filas = [fila()];
    const n = nube({ consulta: q => ({ data: q.tabla === 'proyectos' ? filas.filter(x => q.filtros.find(f => f[0] === 'in')[2].includes(x.folio_global)) : [], error: null }) });
    for (const id of ['img-a', 'img-r1', 'img-p1']) n.objetos.set(R('COT-0042@K7QM', id), { bytes: BYTES[id], tipo: 'image/jpeg' });
    const f = telefono({ historial: [], locales: {}, n, area: 'fabricacion' });
    const r = await f.im.deObra('COT-0042@K7QM');
    eq('Fabricación: el plano de cada partida, los renders y la propuesta, en ese orden, sin repetir, con su rótulo', [r.estado, r.imagenes.map(x => [x.id, x.que])],
      ['ok', [['img-a', 'Plano · partida 1'], ['img-r1', 'Render 1'], ['img-p1', 'Propuesta 1']]]);
    eq('con los mismos bytes, como data URL', r.imagenes.every(x => x.url === dataUrl(BYTES[x.id])), true);
    eq('la que la obra dice y la nube todavía no tiene, se cuenta', [r.faltan, r.total], [1, 4]);
    eq('lee la fila de proyectos (con origen_obra, sin precios) por su folio', n.llamadas.filter(x => x[0] === 'consulta').map(x => [x[1], x[2].select, x[2].filtros]),
      [['proyectos', 'folio_global, folio_hoja, etapa, deleted_at, origen_obra', [['eq', 'empresa_id', 'al3d'], ['in', 'folio_global', ['COT-0042@K7QM']]]]]);
    eq('y firma cada una por ' + I.SEGUNDOS_URL + ' s, SOLO en la carpeta de la obra', n.llamadas.filter(x => x[0] === 'firmar').map(x => [x[2], x[3]]),
      [[R('COT-0042@K7QM', 'img-a'), 60], [R('COT-0042@K7QM', 'img-r1'), 60], [R('COT-0042@K7QM', 'img-falta'), 60], [R('COT-0042@K7QM', 'img-p1'), 60]]);
    eq('nada se escribe en el teléfono (ni en el registro de la sombra)', (await f.reg()).length, 0);
    const k = n.llamadas.length;
    const r2 = await f.im.deObra('COT-0042@K7QM');
    eq('reabrir la ficha: lo bajado sale de memoria y lo que no estaba no se vuelve a pedir en 10 minutos (solo se relee la fila)',
      [r2.imagenes.length, r2.faltan, n.llamadas.slice(k).map(x => x[0])], [3, 1, ['consulta']]);

    const k3 = n.llamadas.length;
    const casos = [];
    for (const [que, x] of [['cancelada', fila({ etapa: 'cancelado' })], ['«No se dio» (lápida)', fila({ folio_hoja: null, etapa: 'cancelado' })],
                            ['borrada', fila({ deleted_at: '2026-10-16T00:00:00Z' })]]) {
      filas = [x];
      const o = await f.im.deObra('COT-0042@K7QM');
      casos.push([que, o.estado, o.imagenes.length]);
    }
    filas = [];
    const o0 = await f.im.deObra('COT-0042@K7QM');
    casos.push(['sin obra', o0.estado, o0.imagenes.length]);
    eq('cancelada, «No se dio» o borrada: no_ganada y ninguna imagen, ni las que estaban en memoria; sin obra en la base: sin_obra', casos,
      [['cancelada', 'no_ganada', 0], ['«No se dio» (lápida)', 'no_ganada', 0], ['borrada', 'no_ganada', 0], ['sin obra', 'sin_obra', 0]]);
    eq('y en esos casos no se firmó nada', n.llamadas.slice(k3).filter(x => x[0] !== 'consulta').length, 0);

    filas = [fila()];
    const d = telefono({ historial: [], locales: {}, n, area: 'direccion' });
    eq('Dirección también la ve', (await d.im.deObra('COT-0042@K7QM')).imagenes.length, 3);
    const n0 = nube();
    const vacias = [];
    for (const area of ['pagos', '']) vacias.push((await telefono({ historial: [], locales: {}, n: n0, area }).im.deObra('COT-0042@K7QM')).estado);
    vacias.push((await telefono({ historial: [], locales: {}, n: n0, area: 'fabricacion' }).im.deObra('../COT-0042')).estado);
    eq('Pagos y sin área: sin_permiso; un folio que no es folio: sin_obra; y sin pedir NADA (ni el cliente)', [vacias, n0.clientes(), n0.llamadas.length],
      [['sin_permiso', 'sin_permiso', 'sin_obra'], 0, 0]);
    const nb = nube({ consulta: () => ({ data: null, error: { message: 'Failed to fetch' } }) });
    eq('si la base no contesta: sin_red, sin firmar nada', [(await telefono({ historial: [], locales: {}, n: nb, area: 'fabricacion' }).im.deObra('COT-0042@K7QM')).estado,
      nb.llamadas.filter(x => x[0] === 'firmar').length], ['sin_red', 0]);
    const ns = nube({ consulta: () => ({ data: [fila()], error: null }), firmar: () => ({ data: null, error: { name: 'StorageUnknownError', message: 'Failed to fetch' } }) });
    const os = await telefono({ historial: [], locales: {}, n: ns, area: 'fabricacion' }).im.deObra('COT-0042@K7QM');
    eq('si se cae la red al firmar: sin_red, se para en la primera y no lanza', [os.estado, os.sin_red, ns.llamadas.filter(x => x[0] === 'firmar').length], ['sin_red', true, 1]);
  }

  console.log('\nAPAGADO: EL COTIZADOR DE VERDAD, SIN LA VENTANILLA, NO PIDE NADA');
  {
    /* js/cotizador/imagenes.js es un guion clásico: se corre entero en un contexto aparte, con un IndexedDB de mentiras. */
    const fuente = leer('js/cotizador/imagenes.js');
    const montar = () => {
      const idb = idbConIndices(), abiertas = [], red = [];
      const ctx = vm.createContext({
        setTimeout, clearTimeout, structuredClone, console,
        indexedDB: { open: (n, v) => { abiertas.push(n); return idb.open(n, v); } },
        fetch: async u => { red.push(String(u)); throw new TypeError('Failed to fetch'); },
        Image: class { set src(v) { this._s = v; setTimeout(() => { this.naturalWidth = 40; this.naturalHeight = 30; if (this.onload) this.onload(); }, 0); } },
        toast() {}, saveState() {}, guardarEnHistorial() {}, getHistorial: () => [], $: () => null, ico: () => '', urlImagenSegura: u => u,
        Q: { items: [{ id: 1, plano: 'img-esta' }], renders: ['img-falta'], propuesta: [], estado: 'autorizada' },
      });
      vm.runInContext('globalThis.window = globalThis; globalThis.parent = globalThis; globalThis.repintados = 0; globalThis.renderItems = () => { repintados++; };', ctx);
      vm.runInContext(fuente, ctx, { filename: 'imagenes.js' });
      return { ctx, abiertas, red, idb, en: c => vm.runInContext(c, ctx) };
    };
    const off = montar();
    await off.en(`_imgTx('readwrite', st => st.put({ id: 'img-esta', url: 'data:image/jpeg;base64,/9j/', w: 1, h: 1, ts: 1 }))`);
    off.en('imgAsegurar()');
    await hasta(() => off.en('repintados') > 0);
    eq('la que está en el teléfono se carga; la que no, se da por perdida («No está en este dispositivo»)',
      [off.en(`imgUrl('img-esta') !== ''`), off.en(`_imgNoHay.has('img-falta')`), off.en('repintados')], [true, true, 1]);
    eq('sin una sola petición a la red', off.red, []);
    eq('y la única base local que se abrió es la de las imágenes, como siempre', [...new Set(off.abiertas)], ['al3d_cot_imgs']);
    off.en(`_imgNoHay.clear(); _imgCache.clear(); globalThis.listo = 0; imgFaltanParaPdf(() => { listo++; })`);
    await hasta(() => off.en('listo') > 0);
    eq('antes del PDF, tampoco: carga lo que hay, da por perdido lo demás y sigue', [off.red, off.en('listo'), off.en(`_imgNoHay.has('img-falta')`)], [[], 1, true]);

    console.log('\nENCENDIDO: CON LA VENTANILLA, EL COTIZADOR PIDE LO QUE FALTA Y LO GUARDA ÉL');
    const on = montar();
    const pedidas = [];
    const URL_OK = dataUrl(jpeg(500, 7));
    on.ctx.AL3D_NUBE = { imagenes: async ids => { pedidas.push(ids); return { 'img-falta': URL_OK, 'img-mala': 'javascript:alert(1)' }; } };
    await on.en(`_imgTx('readwrite', st => st.put({ id: 'img-esta', url: 'data:image/jpeg;base64,/9j/', w: 1, h: 1, ts: 1 }))`);
    on.en(`Q.propuesta = ['img-mala']`);
    on.en('imgAsegurar()');
    await hasta(() => on.en('_imgPidiendo') === false && on.en('repintados') > 0);
    eq('pide a la ventanilla SOLO las que no están en el teléfono, una vez', pedidas, [['img-falta', 'img-mala']]);
    eq('la que llegó queda en memoria y en el teléfono con su id y sus medidas', [on.en(`imgUrl('img-falta') === ${JSON.stringify(URL_OK)}`), on.en(`_imgNoHay.has('img-falta')`)], [true, false]);
    const guardada = await on.en(`_imgTx('readonly', st => st.get('img-falta'))`);
    eq('guardada', [guardada && guardada.url === URL_OK, guardada && guardada.w, guardada && guardada.h], [true, 40, 30]);
    eq('lo que no es una data URL de imagen no se guarda y se da por perdido', [on.en(`imgUrl('img-mala')`), on.en(`_imgNoHay.has('img-mala')`)], ['', true]);
    on.en(`_imgNoHay.clear(); repintados = 0`); on.en('imgAsegurar()');
    await hasta(() => on.en('repintados') > 0);
    eq('y no se vuelve a pedir en la misma sesión', pedidas.length, 1);
    eq('la red la pone la plataforma, no el cotizador', on.red, []);
    const sobra = montar();
    sobra.ctx.AL3D_NUBE = { imagenes: async () => { throw new Error('la nube se cayó'); } };
    sobra.en('imgAsegurar()');
    await hasta(() => sobra.en('repintados') > 0);
    eq('si la ventanilla truena, el cotizador sigue como siempre', [sobra.en(`_imgNoHay.has('img-falta')`), sobra.en('repintados')], [true, 1]);
    const taller = montar();
    let pidioObra = 0;
    taller.ctx.AL3D_NUBE = { obra: async () => { pidioObra++; return { estado: 'ok', imagenes: [] }; } };
    taller.en('imgAsegurar()');
    await hasta(() => taller.en('repintados') > 0);
    eq('con la ventanilla de Fabricación (solo `obra`, sin `imagenes`) el cotizador no pide nada: es como apagado',
      [taller.en(`_imgNoHay.has('img-falta')`), pidioObra, taller.red], [true, 0, []]);
  }

  console.log('\nQ-02 BIS · LA FICHA DE VERDAD (js/mod/proyectos.js): el hueco de las imágenes');
  {
    const fuente = leer('js/mod/proyectos.js');
    const sin = sinComentarios(fuente);
    /* La función que pinta el hueco, sacada del archivo tal cual y corrida en un contexto aparte. */
    const trozo = (re, que) => { const m = re.exec(fuente); if (!m) throw new Error('no encontré ' + que + ' en js/mod/proyectos.js'); return m[0]; };
    const ctx = vm.createContext({ esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') });
    vm.runInContext(trozo(/const URL_IMAGEN = [^\n]+\n/, 'URL_IMAGEN') + trozo(/function htmlImagenesNube\(r\) \{[\s\S]*?\n\}\n/, 'htmlImagenesNube') +
      'globalThis.h = htmlImagenesNube;', ctx);
    const h = r => ctx.h(r);
    const U = dataUrl(jpeg(300, 5));
    const ok = h({ estado: 'ok', imagenes: [{ id: 'img-a', que: 'Plano · partida 1', url: U }, { id: 'img-x', que: 'Render 1', url: 'javascript:alert(1)' },
                                            { id: 'img-y', que: '<b>', url: 'https://otro.sitio/a.jpg' }], faltan: 0 });
    eq('pinta cada imagen con su rótulo; lo que no es una data URL de imagen NO se pinta', [(ok.match(/<img /g) || []).length, ok.includes(U), /javascript:|otro\.sitio/.test(ok)], [1, true, false]);
    cierto('con su texto alternativo', ok.includes('alt="Plano · partida 1"'));
    const avisos = {
      no_ganada: h({ estado: 'no_ganada', imagenes: [] }), sin_obra: h({ estado: 'sin_obra', imagenes: [] }), sin_red: h({ estado: 'sin_red', imagenes: [] }),
      nulo: h(null), ninguna: h({ estado: 'ok', imagenes: [], faltan: 0 }), falta: h({ estado: 'ok', imagenes: [{ id: 'img-a', que: 'P', url: U }], faltan: 2 }),
    };
    eq('cada estado dice lo suyo, sin pintar imágenes donde no las hay', [
      /no está ganada/.test(avisos.no_ganada), /todavía no está en la base/.test(avisos.sin_obra), /no se pudo preguntar/.test(avisos.sin_red), /no se pudo preguntar/.test(avisos.nulo),
      /no traía plano/.test(avisos.ninguna), /2 imágenes todavía no están en la nube/.test(avisos.falta) && (avisos.falta.match(/<img /g) || []).length === 1],
      [true, true, true, true, true, true]);
    cierto('APAGADO: el hueco sale solo con la ventanilla `obra`, con folio de cotización y si la obra no está cancelada',
      /if \(nubeObra\(\) && p\.folio_global && p\.etapa !== 'cancelado'\) \{\s*b\.push\('<section class="pj-imagenes" id="pj-imagenes"/.test(sin));
    cierto('la ventanilla se busca con `obra` como función, y sin ella no hay nada', /function nubeObra\(\) \{\s*try \{ const n = globalThis\.AL3D_NUBE; return n && typeof n\.obra === 'function' \? n : null; \}/.test(sin));
    cierto('se llena al abrir y al repintar la ficha, como la carpeta', /pintarCarpeta\(\);\s*pintarImagenesNube\(\);/.test(sin));
    cierto('y no pide nada sin la ventanilla', /async function pintarImagenesNube\(\) \{\s*const nube = nubeObra\(\);\s*if \(!\$\('pj-imagenes'\) \|\| !nube \|\| !fichaId\) return;/.test(sin));
    cierto('la ficha no habla con Supabase ni importa el módulo de las imágenes', !/supabase|supa-imagenes|createSignedUrl|\.storage\b/i.test(sin));
  }

  console.log('\nEL CÓDIGO: apagado no carga el módulo y la ventanilla solo la pone la lectura en vivo');
  {
    const todos = [];
    const recorrer = d => { for (const f of readdirSync(join(RAIZ, d), { withFileTypes: true })) {
      if (f.isDirectory()) recorrer(d + '/' + f.name); else if (f.name.endsWith('.js')) todos.push(d + '/' + f.name); } };
    recorrer('js');
    eq('solo el enchufe importa supa-imagenes.js (y el enchufe solo se carga con los dos interruptores)',
      todos.filter(f => /^\s*import[^;(]*supa-imagenes\.js/m.test(leer(f))), ['js/datos/supa-enchufe.js']);
    const en = sinComentarios(leer('js/datos/supa-enchufe.js'));
    cierto('la ventanilla se pone al encender la lectura en vivo', /Puente\.fuenteDeLectura\(_fuente\);\s*ponerVentanilla\(\);/.test(en));
    cierto('solo a quien puede: `imagenes` a Dirección o Pagos, `obra` a Dirección o Fabricación (Q-02 bis); a nadie más',
      /function ponerVentanilla\(\) \{\s*if \(!puedeImagenes\(_area\) && !puedeVerObra\(_area\)\) \{ quitarVentanilla\(\); return; \}\s*const v = \{\};\s*if \(puedeImagenes\(_area\)\) v\.imagenes = ids => imagenes\(\)\.bajar\(ids\);\s*if \(puedeVerObra\(_area\)\) v\.obra = folioGlobal => imagenes\(\)\.deObra\(folioGlobal\);\s*globalThis\.AL3D_NUBE = Object\.freeze\(v\);/.test(en));
    cierto('y se quita al apagarla (y apagar() apaga la lectura en vivo)', /function apagarVivo\(\) \{\s*Puente\.fuenteDeLectura\(null\);\s*quitarVentanilla\(\);/.test(en) &&
      /export function apagar\(\) \{[\s\S]*?apagarVivo\(\);/.test(en));
    eq('nadie más la pone', todos.filter(f => /AL3D_NUBE\s*=/.test(sinComentarios(leer(f)))), ['js/datos/supa-enchufe.js']);
    cierto('las subidas solo con la sombra encendida', /export async function subirImagenes\(forzar = false\) \{\s*if \(!sombraEncendida\(\)\) return \{ motivo: 'apagada' \};/.test(en));
    const cot = sinComentarios(leer('js/cotizador/imagenes.js'));
    cierto('el cotizador solo habla con la ventanilla (no con la red)', !/fetch\(|supabase/i.test(cot));
    cierto('y sin ella imgDeLaNube no hace nada', /async function imgDeLaNube\(ids\)\{\s*const nube=_imgNube\(\); if\(!nube\) return 0;/.test(cot));
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(leer('cotizador.html'))[1];
    cierto('la CSP del cotizador sigue sin Supabase (la red de la nube es de la plataforma)', !/supabase/.test(csp));
    const sw = leer('sw.js');
    cierto('el service worker lleva el módulo en el conjunto versionado', sw.includes("'./js/datos/supa-imagenes.js'"));
    cierto('el registro de lo subido vive en la base de la sombra, que la baja de acceso ya borra', /BASES_LOCALES = \[[^\]]*'al3d_sombra'[^\]]*\]/.test(leer('js/nucleo/supa.js')));
  }
} catch (e) {
  mal++;
  console.log('  FALLA (excepción) ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
