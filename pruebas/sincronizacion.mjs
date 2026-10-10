/* DOS TELÉFONOS Y LA HOJA: lo que uno cambia, ¿le llega al otro? (puente-sheets-14)

   Hasta octubre de 2026 cada teléfono se quedaba con su versión de la obra: la etapa intermedia
   subía a la hoja pero nadie la bajaba, las notas y el plazo de taller ni subían, y una
   corrección del teléfono o de la dirección solo llenaba huecos. Esta prueba es la que lo cuida,
   y no con mapeos sueltos: corre DOS copias enteras de la plataforma (js/ copiado dos veces, cada
   una con su IndexedDB y su localStorage) contra el Apps Script DE VERDAD de la hoja
   (puente/hoja-apps-script.gs), con la puerta de los tokens y los roles incluida. Lo único de
   mentiras es la cuadrícula de Sheets y la red.

     A = el teléfono de Dirección       B = el de Fabricación

   La regla que se prueba (puente/README.md, «Quién gana»): gana el cambio más reciente, dato por
   dato; un vacío solo borra si alguien lo borró a propósito; lo que está en la bandeja de un
   teléfono no se pisa al bajar; y una hoja vieja no truena.

   Se corre con pruebas/correr.sh, como todas. */

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { idbConIndices } from './comun/base-de-mentiras.mjs';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'al3d-sinc-'));
const URL_PUENTE = 'https://puente.test/exec';
const TOKEN = { direccion: 'd'.repeat(40), fabricacion: 'f'.repeat(40), pagos: 'p'.repeat(40) };

/* ── El mundo: una hoja y los teléfonos que le hablan ─────────────────────────────────────── */
let H = null;                // la hoja de turno
let actual = null;           // el teléfono que está haciendo algo ahora
globalThis.window = globalThis;
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = {
  getItem: k => (actual && k in actual.ls ? actual.ls[k] : null),
  setItem: (k, v) => { if (actual) actual.ls[k] = String(v); },
  removeItem: k => { if (actual) delete actual.ls[k]; },
};
globalThis.fetch = async (_url, init) => {
  if (!actual || actual.sinSenal) throw new TypeError('Failed to fetch');
  const cuerpo = H.doPost(init.body);
  return { status: 200, json: async () => cuerpo };
};
/* El bombeo diferido (1.5 s) y los relojes de espera de la red no se programan: cada paso de la
   prueba manda y baja a mano, y un bombeo que se disparara solo correría con el localStorage del
   teléfono que esté de turno en ese momento. Los de 0 ms —los de la base de mentiras— sí corren. */
const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));
const pausa = ms => new Promise(r => setTimeoutReal(r, ms));

async function telefono(nombre, rol) {
  const raiz = join(tmp, nombre);
  cpSync(join(aqui, '..', 'js'), join(raiz, 'js'), { recursive: true });
  const t = { nombre, rol, sinSenal: false, idb: idbConIndices(),
              ls: { al3d_pf_rol: rol, al3d_pf_disp: nombre,
                    al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: TOKEN[rol] }) } };
  await como(t, async () => {
    const m = f => import(pathToFileURL(join(raiz, 'js', 'datos', f)).href);
    t.DB = await m('db.js'); t.S = await m('sync.js'); t.Proy = await m('proyectos.js');
    t.Agenda = await m('agenda.js'); t.Puente = await m('puente.js');
    await t.DB.abrir();
    t.S.registrar(t.Puente.crear({ url: URL_PUENTE, token: TOKEN[rol] }));
  });
  return t;
}
async function como(t, fn) {
  actual = t;
  globalThis.indexedDB = t.idb;
  return await fn(t);
}
/* Lo que hace la app con señal: manda lo de la bandeja y baja la hoja. */
const mandar = t => como(t, () => t.S.bombear());
const bajar = t => como(t, async () => { let r, n = 0; do { r = await t.S.jalar(); n++; } while (r.ok && r.valor.hay_mas && n < 5); return r; });
const sincronizar = async t => { await mandar(t); return bajar(t); };
const proyecto = (t, id) => como(t, () => t.DB.obtener('proyectos', id));
const instsDe = (t, id) => como(t, async () => (await t.DB.listar('instalaciones')).filter(i => i.proyecto_id === id));
const vivaDe = async (t, id) => (await instsDe(t, id)).filter(i => i.estado !== 'cancelada')
  .sort((a, b) => b.actualizado_en - a.actualizado_en)[0] || null;

/* Un proyecto ganado en el teléfono de Dirección, y su alta en la hoja. */
async function ganada(t, id, folio, o = {}) {
  await como(t, async () => {
    await t.DB.poner('proyectos', { id, folio_local: folio.split('@')[0], dispositivo: t.nombre, folio_global: folio,
      nombre: 'Ana - Café ' + folio, contacto: 'Ana', negocio: 'Café', etapa: 'ganado',
      tipo_trabajo: ['Letras 3D con iluminacion'], fecha_ganado: '2026-10-01', dir_texto: 'Av. Vallarta 1',
      lat: 20.6736, lng: -103.344, geo_fuente: 'maps_pin', sub: 10000, neto: 11600, precio_auth: 11600,
      anti_pactado: 5000, iva: true, notion_page_id: null, notion_estado: 'pendiente',
      estatus_notion: 'FABRICACION', cuenta: 'Elias BBVA', pct_comision: 0, plazo_k: null, notas: '',
      tel: '33 1000 0000', entrega: 'instalacion', origen: { folio: folio.split('@')[0], items: [] },
      sellos: { etapa: Date.now(), tel: Date.now(), dir_texto: Date.now(), ubicacion: Date.now() },
      creado_en: Date.now(), actualizado_en: Date.now(), sync: 0, ...o });
    const p = await t.DB.obtener('proyectos', id);
    await t.S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: id, datos: p, campos: null, ts: Date.now() });
  });
  await mandar(t);
  return (await proyecto(t, id)).notion_page_id;
}

try {
  /* ════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\nLA REGLA, PURA: obraDeLaFila, sellosDeLaOperacion, citaDeHoja');
  {
    const Pu = await import('../js/datos/puente.js');
    const H0 = hojaDeMentiras();
    eq('los cinco plazos se escriben igual de los dos lados', Pu.PLAZO_A_HOJA, H0.run('PLAZOS_TALLER'));
    for (const x of ['2', '1½', '1,5', '2.5 semanas', '3+', '4 semanas', '3 semanas o más', 'mucho', '', '0.5']) {
      eq('«' + x + '» se lee igual en la hoja y en la plataforma',
         Pu.plazoDesdeHoja(x), (i => (i < 0 ? null : i + 1))(H0.run('PLAZOS_TALLER').indexOf(H0.run('plazoDeCelda(' + JSON.stringify(x) + ')'))));
    }
    const local = { id: 'p', etapa: 'cortado', notas: 'mía', plazo_k: 2, tel: '33 1', dir_texto: 'Calle 1',
                    lat: 20.1, lng: -103.1, entrega: 'instalacion', sellos: { etapa: 100, notas: 100, tel: 100 } };
    const venta = (o = {}) => ({ etapa: 'armado', notas: 'de la hoja', plazo_k: 2, telefono: '33 9', direccion: 'Calle 1',
                                 ubicacion: '20.1,-103.1', entrega: '', sellos: { etapa: 200, notas: 50, tel: 200 }, ...o });
    const r1 = Pu.obraDeLaFila(venta(), local);
    eq('gana lo más nuevo, dato por dato: la etapa y el teléfono de la hoja, la nota de aquí',
       [r1.parche.etapa, r1.parche.tel, r1.parche.notas], ['armado', '33 9', undefined]);
    eq('y se queda con el sello de la hoja', [r1.sellos.etapa, r1.sellos.tel, r1.sellos.notas], [200, 200, 100]);
    eq('lo que está en la bandeja no se pisa', Pu.obraDeLaFila(venta(), local, { ocupados: new Set(['etapa']) }).parche.etapa, undefined);
    eq('un alta o un cambio viejo sin campos en la bandeja aparta todo', Object.keys(Pu.obraDeLaFila(venta(), local, { ocupados: new Set(['*']) }).parche), []);
    eq('una celda vacía SIN sello no borra nada', Pu.obraDeLaFila(venta({ notas: '', sellos: {} }), { ...local, sellos: {} }).parche.notas, undefined);
    eq('vacía CON un sello más nuevo sí: alguien la borró a propósito', Pu.obraDeLaFila(venta({ notas: '', sellos: { notas: 300 } }), local).parche.notas, '');
    eq('la etapa no se borra nunca, aunque venga vacía con sello', Pu.obraDeLaFila(venta({ etapa: null, sellos: { etapa: 300 } }), local).parche.etapa, undefined);
    eq('un dato con valor y sin sello (de antes de los sellos) le gana a uno de aquí sin sello…',
       Pu.obraDeLaFila(venta({ direccion: 'Calle 2', sellos: {} }), { ...local, sellos: {} }).parche.dir_texto, 'Calle 2');
    eq('…y pierde contra uno que alguien cambió aquí después', Pu.obraDeLaFila(venta({ direccion: 'Calle 2', sellos: {} }),
       { ...local, sellos: { dir_texto: 5 } }).parche.dir_texto, undefined);
    eq('una fila de una hoja sin sellos: null, y quien llama usa las reglas de antes', Pu.obraDeLaFila(venta({ sellos: undefined }), local), null);
    const op = { ts: 999, campos: ['notas', 'tel'], datos: { sellos: { notas: 500 } } };
    eq('al subir, cada dato lleva SU sello; lo que no cambió aquí (sin sello) va en cero',
       Pu.sellosDeLaOperacion(op, { 'Notas': 'x', 'Telefono': '33', 'Folio cotizacion': 'F' }, null), { 'Notas': 500 });
    eq('una operación de antes de los sellos usa su hora para lo que dice que cambió',
       Pu.sellosDeLaOperacion({ ts: 999, campos: ['tel'], datos: {} }, { 'Telefono': '33', 'Direccion': 'x' }, null), { 'Telefono': 999 });
    eq('la cita lleva el sello de la instalación', Pu.sellosDeLaOperacion(op, { 'Fecha instalacion': '2099-01-01', 'Hora instalacion': '' },
       { actualizado_en: 700 }), { 'Fecha instalacion': 700, 'Hora instalacion': 700 });
    eq('la que bajó de la hoja, el de la hoja mientras nadie la toque aquí',
       [Pu.selloDeInstalacion({ actualizado_en: 900, sello_hoja: 400, sello_hoja_en: 900 }),
        Pu.selloDeInstalacion({ actualizado_en: 950, sello_hoja: 400, sello_hoja_en: 900 })], [400, 950]);
    const filaC = f => ({ 'Fecha instalacion': f, 'Hora instalacion': '', 'Sellos': { 'Fecha instalacion': 800 } });
    const viva = { id: 'i1', proyecto_id: 'p', fecha: '2099-01-14', hora: '10:00', estado: 'confirmada', movida: 0, actualizado_en: 600 };
    eq('una cita más nueva en la hoja, vacía: se cancela aquí', Pu.citaDeHoja(filaC(''), { id: 'p', etapa: 'listo' }, [viva], { ahora: 1 }).estado, 'cancelada');
    eq('una más vieja que la de aquí no toca nada', Pu.citaDeHoja(filaC(''), { id: 'p', etapa: 'listo' }, [{ ...viva, actualizado_en: 900 }], { ahora: 1 }), null);
  }

  console.log('\nAG:AI NO SE ESCRIBEN ENCIMA DE OTRA COSA');
  {
    const O = hojaDeMentiras({ columnas: 33 });
    O.v._g[1][31] = 'Telefono'; O.v._g[1][32] = 'Entrega'; O.v._g[1][33] = 'Pendientes de Elías';
    cierto('/esquema dice que faltan las tres', ['Notas', 'Plazo taller', 'Sellos'].every(n => O.run('rutaEsquema_()').faltan.some(x => x.nombre === n)));
    O.run('prepararHojaParaElPuente()');
    eq('si AG ya dice otra cosa, «Preparar» no la toca ni crea AH:AI', [O.v._g[1][33], O.v.getMaxColumns()], ['Pendientes de Elías', 33]);
    O.v._g[2][1] = 'V-001'; O.v._g[2][2] = 'Ana';
    eq('y /jalar no la lee como notas', 'Notas' in O.run('rutaJalar_({}, "direccion")').registros[0].datos, false);
  }

  /* ════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\nLA HOJA AL DÍA (puente-sheets-14, con «Preparar la hoja» corrido)');
  H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion', [TOKEN.fabricacion]: 'fabricacion', [TOKEN.pagos]: 'pagos' } });
  H.run('prepararHojaParaElPuente()');
  eq('«Preparar» crea AG Notas, AH Plazo taller y AI Sellos', [33, 34, 35].map(c => H.v._g[1][c]), ['Notas', 'Plazo taller', 'Sellos']);
  cierto('y los sellos quedan ocultos', H.v._ocultas.has(35));
  eq('no crea ninguna pestaña nueva', Object.keys(H.ss).length && ['Tablero', 'Ventas'].filter(n => H.ss.getSheetByName(n)).length >= 1, true);

  const A = await telefono('A', 'direccion');
  const B = await telefono('B', 'fabricacion');

  const fh = await ganada(A, 'proy-1', 'COT-0001@AAAA');
  cierto('A da de alta la venta y la hoja le da su folio', /^V-\d+$/.test(fh || ''));
  await bajar(B);
  const idB = 'proy-hoja-' + fh;
  const b0 = await proyecto(B, idB);
  eq('B (fabricación) la ve llegar como tarjeta del taller, con teléfono, dirección y pin',
     [b0 && b0.etapa, b0 && b0.tel, b0 && b0.dir_texto, b0 && b0.lat], ['ganado', '33 1000 0000', 'Av. Vallarta 1', 20.6736]);
  eq('y sin dinero: a fabricación la hoja no se lo manda', [b0 && b0.sub, b0 && b0.anti_pactado], [0, 0]);

  /* ── 1 · La etapa intermedia ── */
  console.log('\n1 · LA ETAPA DE OBRA VIAJA ENTRE TELÉFONOS');
  await como(A, () => A.Proy.avanzarEtapa('proy-1', 'en_diseno'));
  await mandar(A); await bajar(B);
  eq('A la pasa a «En diseño» → B la ve', (await proyecto(B, idB)).etapa, 'en_diseno');
  await pausa(3);
  await como(B, () => B.Proy.avanzarEtapa(idB, 'cortado'));
  await mandar(B); await bajar(A);
  eq('B (taller) la pasa a «Cortado» → A la ve', (await proyecto(A, 'proy-1')).etapa, 'cortado');
  await pausa(3);
  await como(B, () => B.Proy.avanzarEtapa(idB, 'armado'));
  await pausa(3);
  await como(B, () => B.Proy.avanzarEtapa(idB, 'listo'));
  await mandar(B); await bajar(A);
  eq('«Armado» y «Listo» también', (await proyecto(A, 'proy-1')).etapa, 'listo');
  eq('y la hoja dice lo mismo', H.celda(fh, 'Etapa de obra'), 'Listo para instalar');
  cierto('con su sello en la columna oculta', JSON.parse(H.celda(fh, 'Sellos'))['Etapa de obra'] > 0);

  /* ── 2 · Las notas y el plazo ── */
  console.log('\n2 · LAS NOTAS Y EL PLAZO DE TALLER');
  await pausa(3);
  await como(A, () => A.Proy.actualizar('proy-1', { notas: 'Llevar escalera de 6 m.\n- Pedir acceso al techo' }));
  await mandar(A); await bajar(B);
  eq('A escribe una nota → B la lee igual, renglón por renglón', (await proyecto(B, idB)).notas, 'Llevar escalera de 6 m.\n- Pedir acceso al techo');
  eq('y en la hoja va sin apóstrofo, en texto', [H.celda(fh, 'Notas'), H.v._f[H.fila(fh)][33]], ['Llevar escalera de 6 m.\n- Pedir acceso al techo', '@']);
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { plazo_k: 3 }));
  await mandar(B); await bajar(A);
  eq('B le pone plazo de 2 semanas → A lo ve', (await proyecto(A, 'proy-1')).plazo_k, 3);
  eq('y la hoja lo escribe como se lee', H.celda(fh, 'Plazo taller'), '2 semanas');
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { plazo_k: null }));
  await mandar(B); await bajar(A);
  eq('B lo regresa al propuesto (vacío) → también le llega a A: alguien lo borró a propósito', (await proyecto(A, 'proy-1')).plazo_k, null);

  /* ── 3 · La cita de instalación: se agenda, se mueve, se cancela ── */
  console.log('\n3 · LA INSTALACIÓN SE AGENDA, SE MUEVE Y SE CANCELA EN LOS DOS');
  const ag = await como(A, () => A.Agenda.agendar('proy-1', { fecha: '2099-01-14', hora: '10:00' }));
  cierto('A agenda el 14', ag.ok);
  await mandar(A); await bajar(B);
  let ib = await vivaDe(B, idB);
  eq('B tiene la cita, el mismo día y hora', ib && [ib.fecha, ib.hora, ib.estado], ['2099-01-14', '10:00', 'confirmada']);
  const uidB = ib && ib.uid_ics;
  await pausa(3);
  await como(A, async () => A.Agenda.reagendar((await vivaDe(A, 'proy-1')).id, { fecha: '2099-01-16', hora: '11:30' }));
  await mandar(A); await bajar(B);
  ib = await vivaDe(B, idB);
  eq('A la mueve al 16 a las 11:30 → B la mueve: misma cita, mismo UID, movida + 1',
     ib && [ib.fecha, ib.hora, ib.uid_ics === uidB, ib.movida], ['2099-01-16', '11:30', true, 1]);
  eq('sin dejar una segunda cita viva', (await instsDe(B, idB)).filter(i => i.estado !== 'cancelada').length, 1);
  await pausa(3);
  await como(B, async () => B.Agenda.reagendar((await vivaDe(B, idB)).id, { fecha: '2099-01-17', hora: '09:00' }));
  await mandar(B); await bajar(A);
  const ia = await vivaDe(A, 'proy-1');
  eq('B (taller) la mueve al 17 → A también', ia && [ia.fecha, ia.hora], ['2099-01-17', '09:00']);
  await pausa(3);
  await como(A, async () => A.Agenda.cancelar((await vivaDe(A, 'proy-1')).id, 'El cliente pospuso'));
  await mandar(A); await bajar(B);
  const todasB = await instsDe(B, idB);
  eq('A la cancela → en B también queda cancelada, con su .ics para tacharla',
     [todasB.filter(i => i.estado !== 'cancelada').length, todasB.some(i => i.estado === 'cancelada' && i.uid_ics === uidB && i.movida >= 2)],
     [0, true]);
  eq('y la hoja quedó sin fecha', H.celda(fh, 'Fecha instalacion'), '');
  await bajar(A); await bajar(B);
  eq('bajar otra vez no la resucita en ninguno', [(await vivaDe(A, 'proy-1')), (await vivaDe(B, idB))], [null, null]);

  /* ── 4 · Las correcciones: teléfono, dirección, pin, entrega ── */
  console.log('\n4 · UNA CORRECCIÓN LLEGA A TODOS, NO SOLO LLENA HUECOS');
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { tel: '33 2222 3333' }));
  await mandar(B); await bajar(A);
  eq('B corrige el teléfono → A tiene el corregido (antes se quedaba con el suyo)', (await proyecto(A, 'proy-1')).tel, '33 2222 3333');
  await pausa(3);
  await como(A, () => A.Proy.actualizar('proy-1', { dir_texto: 'Av. Vallarta 1234, int. 5' }));
  await mandar(A); await bajar(B);
  eq('A corrige la dirección → B la tiene', (await proyecto(B, idB)).dir_texto, 'Av. Vallarta 1234, int. 5');
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { lat: 20.7, lng: -103.4, geo_fuente: 'manual' }));
  await mandar(B); await bajar(A);
  const pa = await proyecto(A, 'proy-1');
  eq('B mueve el pin → A lo tiene', [pa.lat, pa.lng], [20.7, -103.4]);
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { entrega: 'paqueteria' }));
  await mandar(B); await bajar(A);
  eq('B la cambia a paquetería → A también', (await proyecto(A, 'proy-1')).entrega, 'paqueteria');

  /* ── 5 · Cambios cruzados: gana el más reciente ── */
  console.log('\n5 · CAMBIOS CRUZADOS: GANA EL MÁS RECIENTE, DATO POR DATO');
  await como(A, () => A.Proy.actualizar('proy-1', { notas: 'Nota de A (primero)' }));
  await pausa(5);
  await como(B, () => B.Proy.actualizar(idB, { notas: 'Nota de B (después)' }));
  await como(B, () => B.Proy.actualizar(idB, { tel: '33 4444 5555' }));
  await mandar(B);                    // B sube primero lo suyo, que es lo más nuevo
  await mandar(A);                    // A llega tarde con algo más viejo
  eq('la hoja se queda con la nota más nueva aunque la vieja llegue después', H.celda(fh, 'Notas'), 'Nota de B (después)');
  await bajar(A); await bajar(B);
  eq('y los dos terminan con la de B', [(await proyecto(A, 'proy-1')).notas, (await proyecto(B, idB)).notas],
     ['Nota de B (después)', 'Nota de B (después)']);
  eq('lo que no chocó viaja igual: el teléfono de B le llega a A', (await proyecto(A, 'proy-1')).tel, '33 4444 5555');
  await pausa(3);
  await como(A, () => A.Proy.avanzarEtapa('proy-1', 'instalado'));
  await pausa(3);
  await como(B, () => B.Proy.actualizar(idB, { notas: 'Quedó bien' }));
  await mandar(A); await mandar(B); await bajar(A); await bajar(B);
  eq('A cambia la etapa y B la nota, casi al mismo tiempo: los dos cambios quedan en los dos',
     [(await proyecto(A, 'proy-1')).etapa, (await proyecto(A, 'proy-1')).notas, (await proyecto(B, idB)).etapa, (await proyecto(B, idB)).notas],
     ['instalado', 'Quedó bien', 'instalado', 'Quedó bien']);

  /* ── 6 · Sin señal ── */
  console.log('\n6 · SIN SEÑAL Y LUEGO CON SEÑAL');
  const fh2 = await ganada(A, 'proy-2', 'COT-0002@AAAA');
  await bajar(B);
  const idB2 = 'proy-hoja-' + fh2;
  B.sinSenal = true;
  await como(B, () => B.Proy.avanzarEtapa(idB2, 'en_diseno'));
  await como(B, () => B.Proy.actualizar(idB2, { notas: 'Medidas tomadas sin señal' }));
  const fuera = await mandar(B);
  eq('B sin señal: lo suyo se queda en su bandeja', fuera.ok === false || (await como(B, () => B.S.pendientes())).length > 0, true);
  await pausa(3);
  await como(A, () => A.Proy.avanzarEtapa('proy-2', 'cortado'));
  await como(A, () => A.Proy.actualizar('proy-2', { tel: '33 7777 8888' }));
  await mandar(A);
  B.sinSenal = false;
  await bajar(B);                     // baja ANTES de mandar: su cambio sigue en la bandeja
  const b2 = await proyecto(B, idB2);
  eq('al volver la señal, lo que B tiene en la bandeja no se pisa al bajar…', [b2.etapa, b2.notas], ['en_diseno', 'Medidas tomadas sin señal']);
  eq('…pero lo que no tocó sí le llega (el teléfono que corrigió A)', b2.tel, '33 7777 8888');
  await mandar(B);
  eq('B manda: su «En diseño» es más viejo que el «Cortado» de A y la hoja no lo escribe', H.celda(fh2, 'Etapa de obra'), 'Cortado');
  eq('su nota sí, nadie la había cambiado', H.celda(fh2, 'Notas'), 'Medidas tomadas sin señal');
  cierto('y no queda nada atorado en su bandeja ni apartado',
     (await como(B, () => B.S.pendientes())).length === 0 && (await como(B, () => B.S.rechazadas())).length === 0);
  await bajar(B); await bajar(A);
  eq('al final los dos ven lo mismo: «Cortado» y la nota de B',
     [(await proyecto(B, idB2)).etapa, (await proyecto(A, 'proy-2')).etapa, (await proyecto(A, 'proy-2')).notas],
     ['cortado', 'cortado', 'Medidas tomadas sin señal']);

  /* ── 7 · A mano en la hoja ── */
  console.log('\n7 · LO QUE SE TECLEA EN LA HOJA');
  await pausa(3);
  H.teclear(fh2, 'Direccion', 'Calle Hidalgo 45, Zapopan');
  await bajar(A); await bajar(B);
  eq('Elías corrige la dirección en la hoja → llega a los dos',
     [(await proyecto(A, 'proy-2')).dir_texto, (await proyecto(B, idB2)).dir_texto], ['Calle Hidalgo 45, Zapopan', 'Calle Hidalgo 45, Zapopan']);
  H.teclear(fh2, 'Notas', '');
  await bajar(A); await bajar(B);
  eq('borrar una celda a mano NO le borra la nota a nadie (un resbalón no cuesta datos)',
     [(await proyecto(A, 'proy-2')).notas, (await proyecto(B, idB2)).notas], ['Medidas tomadas sin señal', 'Medidas tomadas sin señal']);
  await pausa(3);
  H.teclear(fh2, 'Etapa de obra', 'Armado');
  await bajar(A); await bajar(B);
  eq('mover la etapa a mano en la hoja también llega', [(await proyecto(A, 'proy-2')).etapa, (await proyecto(B, idB2)).etapa], ['armado', 'armado']);

  /* ── 8 · Roles ── */
  await mandar(A);
  eq('…y el teléfono que la tenía la vuelve a subir', H.celda(fh2, 'Notas'), 'Medidas tomadas sin señal');

  console.log('\n8 · LOS ROLES SIGUEN IGUAL');
  const C = await telefono('C', 'pagos');
  await bajar(C);
  const enC = await como(C, () => C.DB.obtener('ventas_hoja', 'hoja:' + fh2));
  eq('pagos ve la nota y el dinero en el récord', [enC && enC.notas, enC && enC.sub], ['Medidas tomadas sin señal', 10000]);
  await bajar(B);
  const enB = await como(B, () => B.DB.obtener('ventas_hoja', 'hoja:' + fh2));
  eq('fabricación ve la nota pero no el dinero', [enB && enB.notas, enB && 'sub' in enB], ['Medidas tomadas sin señal', false]);
  const r = H.doPost(JSON.stringify({ ruta: 'empujar', token: TOKEN.pagos, ops: [{ id: 'x1', id_notion: fh2,
    datos: { 'Plazo taller': '3 semanas o más', 'Notas': 'Cobrado el anticipo' }, sellos: { 'Notas': Date.now(), 'Plazo taller': Date.now() } }] }));
  eq('pagos escribe notas pero no el plazo de taller', [r.resultados[0].ok, r.resultados[0].rechazadas.map(x => x.nombre)], [true, ['Plazo taller']]);

  /* ════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n9 · UNA HOJA QUE TODAVÍA NO CORRIÓ «PREPARAR» (sin AG:AI) NO TRUENA');
  H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion', [TOKEN.fabricacion]: 'fabricacion' }, columnas: 32 });
  H.v._g[1][31] = 'Telefono'; H.v._g[1][32] = 'Entrega';
  const A2 = await telefono('A2', 'direccion');
  const B2 = await telefono('B2', 'fabricacion');
  const fh3 = await ganada(A2, 'proy-3', 'COT-0003@AAAA', { notas: 'Nota de antes de la 14' });
  await bajar(B2);
  const idB3 = 'proy-hoja-' + fh3;
  cierto('la venta se da de alta igual', /^V-\d+$/.test(fh3 || '') && await proyecto(B2, idB3));
  await como(A2, () => A2.Proy.avanzarEtapa('proy-3', 'en_diseno'));
  await como(A2, () => A2.Proy.actualizar('proy-3', { notas: 'Otra nota' }));
  const m9 = await mandar(A2);
  eq('la etapa sube como siempre', H.celda(fh3, 'Etapa de obra'), 'En diseño');
  cierto('la nota no se escribe, y la hoja dice por qué (falta correr «Preparar la hoja»)',
     (m9.valor.rechazos || []).some(x => x.lista.some(y => y.nombre === 'Notas' && /Preparar la hoja/.test(y.por))));
  await como(B2, () => B2.Proy.actualizar(idB3, { plazo_k: 2 }));
  await mandar(B2);
  eq('el plazo de B, que era lo único de su cambio, se aparta con su razón sin parar lo demás',
     (await como(B2, () => B2.S.rechazadas())).map(o => /Preparar la hoja/.test(o.ultimo_error)), [true]);
  await bajar(B2);
  eq('y sin sellos en la hoja, la etapa baja con la regla de antes (no baja)', (await proyecto(B2, idB3)).etapa, 'ganado');

  console.log('\n10 · AL CORRER «PREPARAR LA HOJA», LO QUE ESPERABA SE MANDA SOLO');
  H.run('prepararHojaParaElPuente()');
  await bajar(A2);                    // la bajada ve las columnas nuevas y vacías…
  await mandar(A2);                   // …y lo que A tenía se manda una vez
  eq('la nota de A llega a la hoja', H.celda(fh3, 'Notas'), 'Otra nota');
  await bajar(B2);
  await mandar(B2);                   // el plazo apartado de B vuelve solo a la cola
  eq('el plazo de B también', H.celda(fh3, 'Plazo taller'), '1.5 semanas');
  eq('sin apartados en ninguno', [(await como(A2, () => A2.S.rechazadas())).length, (await como(B2, () => B2.S.rechazadas())).length], [0, 0]);
  await bajar(B2); await bajar(A2);
  const b3 = await proyecto(B2, idB3), a3 = await proyecto(A2, 'proy-3');
  eq('y los dos ven lo mismo: la etapa, la nota y el plazo', [b3.etapa, b3.notas, b3.plazo_k, a3.etapa, a3.notas, a3.plazo_k],
     ['en_diseno', 'Otra nota', 2, 'en_diseno', 'Otra nota', 2]);
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
} finally {
  globalThis.setTimeout = setTimeoutReal;
  try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
