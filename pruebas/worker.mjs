/* EL WORKER, CORRIENDO DE VERDAD. Contra una Notion falsa, en node y sin cuenta.

   `puente/worker.js` es el único archivo del proyecto que no se publica con el sitio: se
   pega a mano en el editor de Cloudflare. Eso lo dejaba sin ninguna prueba, y es justo el
   archivo donde vive la frontera de permisos del sistema y las cuatro validaciones que
   impiden que Notion CREE una opción inventada en una base con tres años encima.

   Aquí se importa tal cual —es un módulo ES estándar— y se le contesta con una Notion de
   mentiras interceptando `fetch`. Lo que se prueba es lo que no se puede revisar mirando:
   que un token desconocido rebote, que fabricación no pueda tocar el anticipo, que un
   estatus inventado se rechace en vez de crearse, y que un reintento después de una
   respuesta perdida no acabe en dos ventas.

   Se corre con pruebas/correr.sh, como todas. */

import worker from '../puente/worker.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);

/* ---------------------------------------------------------------------------
   LA NOTION DE MENTIRAS

   Solo lo que el Worker usa. Guarda las páginas en memoria y devuelve la forma exacta de
   la API: `properties` con su `type`, que es de donde `aplanar()` saca todo.
   --------------------------------------------------------------------------- */
const DS = 'ds-prueba';
let PAGINAS = [];
let SIGUIENTE = 1;

/* Con forma de UUID porque el Worker valida el formato del id ANTES de pegarlo a la ruta de
   la API de Notion, y esa validación es justo lo que impide que el cliente elija a qué
   endpoint del workspace le pega el Worker con el token que puede escribirlo todo. Un id
   como ID1 ya no viaja, así que la Notion de mentiras tiene que inventar ids de verdad. */
const ID_BASE = '00000000-0000-4000-8000-';
const ID1 = ID_BASE + '000000000001';
let ESQUEMA_COMPLETO = false;
let LLAMADAS = [];

const PROPS_BASE = {
  'Proyecto': { type: 'title' }, 'Precio Subtotal': { type: 'number' },
  'IVA': { type: 'checkbox' }, 'Precio Neto ': { type: 'formula' },
  'Anticipo': { type: 'number' }, 'Liquidacion': { type: 'number' },
  'Abono Comision': { type: 'number' }, 'Pago Pendiente': { type: 'formula' },
  'Comisiones': { type: 'formula' }, 'Comision Restante': { type: 'formula' },
  'Fecha Comision': { type: 'formula' }, 'Estatus': { type: 'status' },
  'Cuenta ': { type: 'select' }, 'Fecha Anticipo e Instalacion': { type: 'date' },
  'Fecha Liquidacion': { type: 'date' },
};
const PROPS_NUEVAS = {
  'Folio cotizacion': { type: 'rich_text' }, 'Etapa de obra': { type: 'select' },
  'Fecha instalacion': { type: 'date' }, 'Hora instalacion': { type: 'rich_text' },
  'Ubicacion': { type: 'rich_text' }, 'Direccion': { type: 'rich_text' },
  'Tipo de trabajo': { type: 'multi_select' },
};

const propsDelDs = () => ESQUEMA_COMPLETO ? { ...PROPS_BASE, ...PROPS_NUEVAS } : { ...PROPS_BASE };

/* Notion GUARDA en una forma y DEVUELVE en otra: lo que se escribe es
   `{title:[{text:{content}}]}` y lo que se lee trae además `type` y `plain_text`. La
   mentira tiene que hacer esa conversión o la prueba de /jalar pasaría con un `aplanar()`
   roto, que es exactamente el error que no se puede revisar mirando. */
function comoLoDevuelveNotion(valor) {
  if (!valor || typeof valor !== 'object') return valor;
  const k = Object.keys(valor)[0];
  if (k === 'title' || k === 'rich_text') {
    return { type: k, [k]: (valor[k] || []).map(t => ({ ...t, plain_text: t.text.content })) };
  }
  return { type: k, ...valor };
}

/** El texto plano de una propiedad guardada, para poder filtrar por folio. */
const plano = pag => {
  const p = pag.properties['Folio cotizacion'];
  return p && p.rich_text && p.rich_text[0] ? p.rich_text[0].plain_text : '';
};

/* Las cinco fórmulas. No se escriben nunca —el Worker las rechaza— pero SÍ se leen, y son
   la mitad de lo que el espejo del dinero viene a buscar. */
const FORMULAS_CALCULADAS = {
  'Precio Neto ':      { type: 'formula', formula: { type: 'number', number: 13920 } },
  'Pago Pendiente':    { type: 'formula', formula: { type: 'number', number: 7920 } },
  'Comisiones':        { type: 'formula', formula: { type: 'number', number: 1200 } },
  'Comision Restante': { type: 'formula', formula: { type: 'number', number: 1200 } },
  'Fecha Comision':    { type: 'formula', formula: { type: 'date', date: { start: '2026-09-15' } } },
};

const jsonResp = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  LLAMADAS.push((opciones.method || 'GET') + ' ' + u);

  if (!u.startsWith('https://api.notion.com/v1')) return new Response('', { status: 404 });

  const ruta = u.slice('https://api.notion.com/v1'.length);
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  const met = opciones.method || 'GET';

  if (ruta === '/data_sources/' + DS && met === 'GET') {
    return jsonResp({ id: DS, properties: propsDelDs() });
  }

  if (ruta === '/data_sources/' + DS + '/query' && met === 'POST') {
    /* El filtro por folio solo funciona si la propiedad existe: si no, Notion contesta 400,
       y ese caso es justo el que el Worker tiene que sobrevivir. */
    if (cuerpo && cuerpo.filter) {
      if (!ESQUEMA_COMPLETO) return jsonResp({ message: 'Could not find property' }, 400);
      const q = cuerpo.filter.rich_text.equals;
      return jsonResp({ results: PAGINAS.filter(p => plano(p) === q), has_more: false, next_cursor: null });
    }
    return jsonResp({ results: PAGINAS.slice(), has_more: false, next_cursor: null });
  }

  if (ruta === '/pages' && met === 'POST') {
    for (const nombre of Object.keys(cuerpo.properties || {})) {
      if (!propsDelDs()[nombre]) return jsonResp({ message: nombre + ' is not a property that exists' }, 400);
    }
    const props = { ...FORMULAS_CALCULADAS };
    for (const [n, v] of Object.entries(cuerpo.properties || {})) props[n] = comoLoDevuelveNotion(v);
    const pag = { id: ID_BASE + String(SIGUIENTE++).padStart(12, '0'), url: 'https://notion.so/x',
                  last_edited_time: '2026-08-24T10:00:00.000Z', properties: props };
    PAGINAS.push(pag);
    return jsonResp(pag);
  }

  const mPag = /^\/pages\/([^/]+)$/.exec(ruta);
  if (mPag) {
    const pag = PAGINAS.find(p => p.id === mPag[1]);
    if (!pag) return jsonResp({ message: 'Could not find page' }, 404);
    if (met === 'GET') return jsonResp(pag);
    if (met === 'PATCH') {
      /* Un PATCH de Notion es POR PROPIEDAD: lo que no viene, no se toca. Es la razón
         entera de que el relevo no mande `esperado`, así que la mentira lo respeta. */
      for (const [n, v] of Object.entries(cuerpo.properties || {})) {
        pag.properties[n] = comoLoDevuelveNotion(v);
      }
      pag.last_edited_time = '2026-08-24T11:00:00.000Z';
      return jsonResp(pag);
    }
  }

  return jsonResp({ message: 'ruta no simulada: ' + met + ' ' + ruta }, 404);
};

/* ---------------------------------------------------------------------------
   El entorno del Worker, y el atajo para pedirle algo
   --------------------------------------------------------------------------- */
const TOK = { dir: 'tok-direccion', fab: 'tok-fabricacion', pag: 'tok-pagos' };
const ENV = {
  NOTION_TOKEN: 'ntn_secreto',
  DS_VENTAS: DS,
  TOKENS: JSON.stringify({ [TOK.dir]: 'direccion', [TOK.fab]: 'fabricacion', [TOK.pag]: 'pagos' }),
  ORIGENES: 'https://ejemplo.mx,https://otro.mx',
};
const ORIGEN = 'https://ejemplo.mx';

async function pedir(ruta, { token = TOK.dir, metodo = 'GET', cuerpo = null, origen = ORIGEN, env = ENV } = {}) {
  const req = new Request('https://puente-al3d.workers.dev' + ruta, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(origen ? { Origin: origen } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const r = await worker.fetch(req, env);
  let json = null;
  try { json = await r.json(); } catch (_) {}
  return { estado: r.status, cuerpo: json || {}, cabeceras: r.headers };
}

const empujar = (datos, extra = {}, opts = {}) =>
  pedir('/empujar', { metodo: 'POST', cuerpo: { ops: [{ id: 'op-1', datos, ...extra }] }, ...opts });

/* ---------------------------------------------------------------------------
   LAS PRUEBAS
   --------------------------------------------------------------------------- */

console.log('\nLA PUERTA: el token es la única frontera de permisos del sistema');
{
  const sinTok = await pedir('/salud', { token: '' });
  eq('sin token, 401', sinTok.estado, 401);
  eq('y lo dice en español, no «unauthorized»', sinTok.cuerpo.codigo, 'ROL_SIN_PERMISO');

  const inventado = await pedir('/salud', { token: 'el-que-yo-quiera' });
  eq('un token que no está en TOKENS, 401', inventado.estado, 401);

  const conEspacio = await pedir('/salud', { token: TOK.dir + ' ' });
  eq('un token con un espacio pegado del portapapeles SÍ entra', conEspacio.estado, 200);

  const sinSecretos = await pedir('/salud', { env: { TOKENS: ENV.TOKENS } });
  eq('sin NOTION_TOKEN, 500 y con la variable nombrada', sinSecretos.estado, 500);
  cierto('dice qué revisar', /NOTION_TOKEN/.test(sinSecretos.cuerpo.mensaje));
}

console.log('\nCORS: el origen concreto, nunca un comodín');
{
  const r = await pedir('/salud');
  eq('contesta con el origen que pidió', r.cabeceras.get('Access-Control-Allow-Origin'), ORIGEN);
  cierto('y varía por origen, para que no se cachee mal', /Origin/i.test(r.cabeceras.get('Vary') || ''));

  const otro = await pedir('/salud', { origen: 'https://el-malo.com' });
  eq('un origen que no está en la lista NO recibe su propio origen',
     otro.cabeceras.get('Access-Control-Allow-Origin') === 'https://el-malo.com', false);
  eq('y nunca se contesta con comodín, que con Authorization sería una invitación abierta',
     otro.cabeceras.get('Access-Control-Allow-Origin') === '*', false);

  const pre = await worker.fetch(new Request('https://x.workers.dev/empujar',
    { method: 'OPTIONS', headers: { Origin: ORIGEN } }), ENV);
  eq('el preflight contesta 204 SIN pedir token', pre.status, 204);
}

console.log('\n/salud: lo que este teléfono puede escribir sale del TOKEN, no de lo que pida');
{
  const dir = await pedir('/salud', { token: TOK.dir });
  eq('dirección se reconoce', dir.cuerpo.rol, 'direccion');
  cierto('y puede escribir el anticipo', dir.cuerpo.escribibles.includes('Anticipo'));

  const fab = await pedir('/salud', { token: TOK.fab });
  eq('fabricación se reconoce', fab.cuerpo.rol, 'fabricacion');
  eq('y NO puede escribir el anticipo, aunque su teléfono diga «Dirección»',
     fab.cuerpo.escribibles.includes('Anticipo'), false);
  cierto('sí mueve la obra', fab.cuerpo.escribibles.includes('Etapa de obra'));

  const pag = await pedir('/salud', { token: TOK.pag });
  eq('pagos cobra', pag.cuerpo.escribibles.includes('Estatus'), true);
  eq('y NO mueve la obra', pag.cuerpo.escribibles.includes('Etapa de obra'), false);
}

console.log('\n/esquema: DETECTA lo que falta y NO lo crea');
{
  ESQUEMA_COMPLETO = false;
  const r = await pedir('/esquema');
  eq('faltan las siete', r.cuerpo.faltan.length, 7);
  eq('la primera es el folio', r.cuerpo.faltan[0].nombre, 'Folio cotizacion');
  cierto('cada una trae su tipo exacto', r.cuerpo.faltan.every(f => !!f.tipo));
  cierto('la etapa trae sus ocho opciones',
    r.cuerpo.faltan.find(f => f.nombre === 'Etapa de obra').opciones.length === 8);
  cierto('la nota dice que se crean a mano y por qué', /a mano/i.test(r.cuerpo.nota));
  eq('y NO tocó el esquema: la base sigue igual', Object.keys(propsDelDs()).length, 15);

  ESQUEMA_COMPLETO = true;
  const ya = await pedir('/esquema');
  eq('con las siete puestas, no falta nada', ya.cuerpo.faltan.length, 0);
}

console.log('\nEL ALTA DE UNA VENTA, DE PUNTA A PUNTA');
const VENTA = {
  'Proyecto': 'Ale - Parentesis (Letras Luz)',
  'Precio Subtotal': 12000, 'IVA': true, 'Anticipo': 6000,
  'Estatus': 'FABRICACION', 'Cuenta ': 'Elias BBVA',
  'Folio cotizacion': 'COT-0042@K7QM',
  'Etapa de obra': 'Ganado',
  'Fecha Anticipo e Instalacion': '2026-09-01', 'Fecha instalacion': '2026-09-01',
  'Hora instalacion': '10:00',
  'Ubicacion': '20.6736,-103.344', 'Direccion': 'Av. Vallarta 1234',
  'Tipo de trabajo': ['Letras 3D con iluminacion'],
};
{
  PAGINAS = []; SIGUIENTE = 1;
  const r = await empujar(VENTA, { tipo: 'crear' });
  eq('se creó', r.cuerpo.resultados[0].ok, true);
  eq('una fila, no dos', PAGINAS.length, 1);

  const p = PAGINAS[0].properties;
  eq('el título es el nombre derivado', p['Proyecto'].title[0].plain_text, 'Ale - Parentesis (Letras Luz)');
  eq('el subtotal es número, no texto', p['Precio Subtotal'].number, 12000);
  eq('el IVA es casilla', p['IVA'].checkbox, true);
  eq('el estatus es status, no select', p['Estatus'].status.name, 'FABRICACION');
  eq('la cuenta es select', p['Cuenta '].select.name, 'Elias BBVA');
  eq('la fecha es date, no texto en es-MX', p['Fecha Anticipo e Instalacion'].date.start, '2026-09-01');
  eq('el tipo de trabajo es multi', p['Tipo de trabajo'].multi_select.map(o => o.name), ['Letras 3D con iluminacion']);
  eq('LA DIRECCIÓN LLEGÓ: es el hueco de las 199 filas', p['Direccion'].rich_text[0].plain_text, 'Av. Vallarta 1234');
  eq('y la ubicación también', p['Ubicacion'].rich_text[0].plain_text, '20.6736,-103.344');

  eq('el relevo recibe el id de la página para no volver a crearla',
     r.cuerpo.resultados[0].remoto.id_notion, ID1);
}

console.log('\nLA FILA DUPLICADA: el reintento después de una respuesta perdida');
{
  /* El caso real: el teléfono manda el alta, Notion la crea, la respuesta se pierde en un
     elevador, y la bandeja reintenta. Sin la búsqueda por folio serían dos ventas. */
  const r = await empujar(VENTA, { tipo: 'crear' });
  eq('el reintento contesta ok', r.cuerpo.resultados[0].ok, true);
  eq('y NO hay una segunda venta en el libro mayor', PAGINAS.length, 1);
  eq('actualizó la que ya estaba', r.cuerpo.resultados[0].remoto.id_notion, ID1);
}

console.log('\nLO QUE NOTION CREARÍA EN SILENCIO, Y AQUÍ REBOTA');
{
  const est = await empujar({ 'Estatus': 'ANTICIPO' }, { id_notion: ID1 });
  eq('un estatus inventado no se escribe', est.cuerpo.resultados[0].ok, false);
  cierto('y se devuelve NOMBRADO, no descartado en silencio',
    est.cuerpo.resultados[0].rechazadas.some(x => x.nombre === 'Estatus'));
  cierto('con la razón: pegarlo lo crearía',
    /crearía/.test(est.cuerpo.resultados[0].rechazadas[0].por));

  const cta = await empujar({ 'Cuenta ': 'Otra' }, { id_notion: ID1 });
  eq('una cuenta que no existe tampoco', cta.cuerpo.resultados[0].ok, false);

  const eta = await empujar({ 'Etapa de obra': 'en_diseno' }, { id_notion: ID1 });
  eq('una etapa con el vocabulario interno del cliente rebota', eta.cuerpo.resultados[0].ok, false);
  const eta2 = await empujar({ 'Etapa de obra': 'En diseño' }, { id_notion: ID1 });
  eq('y con el nombre de la base, pasa', eta2.cuerpo.resultados[0].ok, true);

  const tip = await empujar({ 'Tipo de trabajo': ['Letras 3D con iluminacion', 'Neón flex'] },
                            { id_notion: ID1 });
  eq('un tipo que no está en los siete rebota el campo entero', tip.cuerpo.resultados[0].ok, false);
  cierto('y nombra cuál', /Neón flex/.test(tip.cuerpo.resultados[0].rechazadas[0].por));
  eq('y NO se coló a medias en la base',
     PAGINAS[0].properties['Tipo de trabajo'].multi_select.length, 1);
}

console.log('\nLAS FÓRMULAS: se leen, no se escriben');
{
  for (const f of ['Precio Neto ', 'Pago Pendiente', 'Comisiones', 'Comision Restante', 'Fecha Comision']) {
    const r = await empujar({ [f]: 999 }, { id_notion: ID1 });
    eq('«' + f.trim() + '» rebota', r.cuerpo.resultados[0].ok, false);
    cierto('  y dice que es una fórmula',
      /fórmula/.test((r.cuerpo.resultados[0].rechazadas[0] || {}).por || ''));
  }
}

console.log('\nLA FRONTERA DE VERDAD: fabricación no toca el dinero');
{
  const r = await empujar({ 'Anticipo': 1, 'Etapa de obra': 'Cortado' },
                          { id_notion: ID1 }, { token: TOK.fab });
  eq('la operación pasa, porque sí traía algo que puede escribir', r.cuerpo.resultados[0].ok, true);
  eq('la etapa se movió', PAGINAS[0].properties['Etapa de obra'].select.name, 'Cortado');
  eq('EL ANTICIPO NO SE TOCÓ', PAGINAS[0].properties['Anticipo'].number, 6000);
  cierto('y el rechazo viene nombrado, no callado',
    r.cuerpo.resultados[0].rechazadas.some(x => x.nombre === 'Anticipo'));

  const solo = await empujar({ 'Anticipo': 1 }, { id_notion: ID1 }, { token: TOK.fab });
  eq('si NADA de lo que mandó puede escribir, la operación falla', solo.cuerpo.resultados[0].ok, false);
  eq('con el código del rol', solo.cuerpo.resultados[0].codigo, 'ROL_SIN_PERMISO');

  const pagos = await empujar({ 'Etapa de obra': 'Armado', 'Estatus': 'COBRANDO' },
                              { id_notion: ID1 }, { token: TOK.pag });
  eq('pagos cobra', PAGINAS[0].properties['Estatus'].status.name, 'COBRANDO');
  eq('y NO mueve la obra', PAGINAS[0].properties['Etapa de obra'].select.name, 'Cortado');
  cierto('dicho', pagos.cuerpo.resultados[0].rechazadas.some(x => x.nombre === 'Etapa de obra'));
}

console.log('\nLAS FECHAS: solo YYYY-MM-DD, y el vacío que sí es una respuesta');
{
  const mala = await empujar({ 'Fecha instalacion': '01/09/2026' }, { id_notion: ID1 });
  eq('DD/MM/YYYY rebota', mala.cuerpo.resultados[0].ok, false);
  const esmx = await empujar({ 'Fecha instalacion': '22 ago 2026' }, { id_notion: ID1 });
  eq('«22 ago 2026» rebota: es el error que ya se arregló del otro lado', esmx.cuerpo.resultados[0].ok, false);
  const vacia = await empujar({ 'Fecha instalacion': '' }, { id_notion: ID1 });
  eq('vacío SÍ pasa: es «se desagendó», no un error', vacia.cuerpo.resultados[0].ok, true);
  eq('y deja la fecha en null', PAGINAS[0].properties['Fecha instalacion'].date, null);
}

/* Esta prueba cambió de pregunta, y el motivo importa más que las líneas. Antes comprobaba
   que `/jalar` devolviera la fila ENTERA bien aplanada. Devolverla entera era el problema:
   con el token de fabricación —el rol que este Worker presume de que no toca el dinero— un
   `curl` se bajaba el subtotal, el anticipo, las comisiones y la cuenta de cobro de todas
   las ventas. Había lista blanca de escritura y no de lectura.

   Así que ahora `/jalar` manda SOLO lo que el cliente consume. La lista no salió de una
   opinión: `deNotion` (js/datos/puente.js) usa seis campos y `bajar` añade `editado` para el
   sello, y nada más. Lo demás cruzaba la red para que el navegador lo tirara.

   El aplanado sigue cubierto: `/empujar` devuelve `remoto` sin recortar para dirección, y
   ahí se comprueban los cinco tipos de propiedad. */
console.log('\n/jalar: solo lo que el espejo usa, y nada del dinero crudo');
{
  const r = await pedir('/jalar');
  eq('trae la fila', r.cuerpo.registros.length, 1);
  const d = r.cuerpo.registros[0].datos;
  eq('va al almacén de proyectos', r.cuerpo.registros[0].almacen, 'proyectos');

  /* Los seis que el espejo necesita. Si falta uno, la cobranza se apaga en los teléfonos. */
  eq('el folio, que es la llave que ata la fila', d['Folio cotizacion'], 'COT-0042@K7QM');
  eq('el id de la página, que es lo que evita la segunda fila', typeof d.id_notion, 'string');
  eq('el status como su nombre', d['Estatus'], 'COBRANDO');
  eq('el pago pendiente baja de la fórmula de Notion', d['Pago Pendiente'], 7920);
  eq('la comisión restante también', d['Comision Restante'], 1200);
  eq('y trae el sello de edición, que es lo que ata el espejo',
     d.editado, '2026-08-24T11:00:00.000Z');

  /* Y los que ya no salen de Notion. Ninguno lo lee el cliente: se comprobó leyendo
     `deNotion`, no suponiéndolo. */
  for (const fuera of ['Precio Subtotal', 'Anticipo', 'Liquidacion', 'Abono Comision',
                       'Precio Neto ', 'Comisiones', 'Fecha Comision', 'Proyecto',
                       'Direccion', 'Tipo de trabajo']) {
    eq('«' + fuera.trim() + '» ya no sale por /jalar', d[fuera], undefined);
  }
}

console.log('\nY LO MISMO CON EL TOKEN DE FABRICACIÓN');
{
  const r = await pedir('/jalar', { token: TOK.fab });
  const d = r.cuerpo.registros[0].datos;
  eq('el filtro no depende del rol: es el mismo para los tres', d['Anticipo'], undefined);
  eq('y el espejo le sigue llegando completo', d['Pago Pendiente'], 7920);
}


console.log('\nEL id DE PÁGINA SE PEGA A LA RUTA DE LA API, así que tiene que ser un id');
{
  /* `op.id_notion` se concatena a `/pages/` sin más, y `fetch` normaliza el `..` del camino.
     Sin esta validación, un token de FABRICACIÓN —el rol que no toca el dinero— mandaba el
     PATCH a otro objeto del workspace, y por la vía del control de concurrencia hacía un GET
     a cualquier página que la integración pudiera ver, devuelta al cliente en `conflicto`. */
  for (const malo of ['../databases/56fa21d8-8e7d-4e16-b874-455fd6c65643',
                      'pag-1', '../../users', 'no-es-un-uuid']) {
    const r = await empujar({ 'Etapa de obra': 'Cortado' }, { id_notion: malo });
    eq('«' + malo.slice(0, 26) + '» no se pega a la ruta', r.cuerpo.resultados[0].codigo, 'DATO_INVALIDO');
  }
  /* Y se DICE en vez de callarse: un id malo silenciado dejaría `idPagina` en null y la fila
     se crearía otra vez, con su anticipo y su comisión sumando en las siete vistas. */
  const r = await empujar({ 'Etapa de obra': 'Cortado' }, { id_notion: '../databases/x' });
  eq('y la operación no se convierte en un alta', r.cuerpo.resultados[0].ok, false);
  eq('el id con guiones sí pasa', (await empujar({ 'Etapa de obra': 'Armado' },
     { id_notion: ID1 })).cuerpo.resultados[0].ok, true);
}

console.log('\nDAR DE ALTA UNA VENTA SALE DEL TELÉFONO DE DIRECCIÓN, y eso se decide aquí');
{
  /* El candado vivía SOLO en el cliente, o sea que no era un candado: era un aviso, y un
     aviso del lado del navegador lo salta un `curl`. */
  const fab = await pedir('/empujar', { token: TOK.fab, metodo: 'POST', cuerpo: { ops: [{
    id: 'op-alta', tipo: 'crear',
    datos: { 'Etapa de obra': 'Ganado', 'Direccion': 'Av. Vallarta 100' } }] } });
  eq('fabricación no puede crear la fila', fab.cuerpo.resultados[0].ok, false);
  eq('con el código del rol', fab.cuerpo.resultados[0].codigo, 'ROL_SIN_PERMISO');

  /* Y el caso que de verdad va a pasar, que no es el malicioso: un CAMBIO de una fila que el
     teléfono cree que existe y que aquí no aparece por su folio. Crearla sería inventar una
     venta a partir de un cambio parcial: una fila con la etapa movida y sin precio. */
  const act = await pedir('/empujar', { metodo: 'POST', cuerpo: { ops: [{
    id: 'op-act', tipo: 'actualizar',
    datos: { 'Folio cotizacion': 'COT-9999@NADA', 'Etapa de obra': 'Cortado' } }] } });
  eq('un cambio sin fila que cambiar no inventa una venta', act.cuerpo.resultados[0].ok, false);
  eq('y lo dice con el código correcto', act.cuerpo.resultados[0].codigo, 'NO_ENCONTRADO');
}

console.log('\nLOS IMPORTES TIENEN RANGO');
{
  const neg = await empujar({ 'Anticipo': -5000 }, { id_notion: ID1 });
  eq('un anticipo negativo rebota', neg.cuerpo.resultados[0].ok, false);
  cierto('  y dice por qué', /negativo/.test((neg.cuerpo.resultados[0].rechazadas[0] || {}).por || ''));
  const enorme = await empujar({ 'Liquidacion': 1e21 }, { id_notion: ID1 });
  eq('1e21 rebota: Number lo acepta feliz y Notion lo guardaría', enorme.cuerpo.resultados[0].ok, false);
  const normal = await empujar({ 'Liquidacion': 6000 }, { id_notion: ID1 });
  eq('y un importe de verdad sigue pasando', normal.cuerpo.resultados[0].ok, true);
}

console.log('\nTOKENS MAL PEGADO YA NO ES UN 401 MUDO');
{
  /* Era el paso que más se rompe del montaje: una coma de más, o una comilla curva del
     teclado del celular, y el Worker contestaba 401 a los tres teléfonos sin poder decir por
     qué — que es exactamente el mensaje que manda a tres personas a re-pegar tres tokens que
     estaban bien. */
  const roto = await pedir('/salud', { env: { ...ENV, TOKENS: '{"a":"direccion",}' } });
  eq('un JSON roto da 500, no 401', roto.estado, 500);
  cierto('  y nombra el problema', /TOKENS/.test(roto.cuerpo.mensaje || ''));
  cierto('  y dice qué mirar', /comas|comillas/.test(roto.cuerpo.mensaje || ''));

  /* Un rol mal escrito es OTRA cosa, y la diferencia es la que evita un desastre: se contesta
     SOLO a quien trae ese token. Rechazar el mapa entero apagaría los tres teléfonos, y sería
     justo en el momento en que menos se puede permitir — el runbook de revocar un teléfono
     perdido dice «borra su renglón, o cámbiale el rol», y la segunda variante habría dejado
     sin sincronizar a las otras dos personas en el mismo Deploy. */
  const CON_UNO_MALO = JSON.stringify({ [TOK.dir]: 'direccion', [TOK.fab]: 'Fabricacion', [TOK.pag]: 'pagos' });
  const suyo = await pedir('/salud', { token: TOK.fab, env: { ...ENV, TOKENS: CON_UNO_MALO } });
  eq('el del rol mal escrito recibe 401, no un 500 global', suyo.estado, 401);
  cierto('  y se le nombra el rol que está mal', /Fabricacion/.test(suyo.cuerpo.mensaje || ''));
  cierto('  con los tres que sí valen', /fabricacion/.test(suyo.cuerpo.mensaje || ''));

  const otro = await pedir('/salud', { token: TOK.dir, env: { ...ENV, TOKENS: CON_UNO_MALO } });
  eq('Y LOS OTROS DOS SIGUEN SINCRONIZANDO', otro.estado, 200);
  eq('con su rol de siempre', otro.cuerpo.rol, 'direccion');

  /* Y la forma limpia de revocar —borrar el renglón— sigue dando el 401 de siempre. */
  const sinEl = JSON.stringify({ [TOK.dir]: 'direccion', [TOK.pag]: 'pagos' });
  const borrado = await pedir('/salud', { token: TOK.fab, env: { ...ENV, TOKENS: sinEl } });
  eq('un token borrado del JSON queda fuera', borrado.estado, 401);
  eq('y los demás no se enteran',
     (await pedir('/salud', { token: TOK.pag, env: { ...ENV, TOKENS: sinEl } })).estado, 200);
}

console.log('\nEL ORIGEN QUE NO ESTÁ EN LA LISTA SE NIEGA, NO SE SUSTITUYE');
{
  /* Contestar con `lista[0]` no dejaba que nadie leyera la respuesta —el navegador la
     bloquea igual— pero hacía indistinguible un dominio mal escrito de una falla de red: el
     teléfono decía «puede que no haya señal» y un curl de diagnóstico contestaba con unas
     cabeceras que se veían bien. */
  const ajeno = await pedir('/salud', { origen: 'https://sitio-ajeno.mx' });
  eq('no se le manda ninguna cabecera de origen', ajeno.cabeceras.get('access-control-allow-origin'), null);
  const bueno = await pedir('/salud', { origen: 'https://otro.mx' });
  eq('y al segundo de la lista sí, con SU dominio', bueno.cabeceras.get('access-control-allow-origin'), 'https://otro.mx');
  cierto('varía también por Authorization: la respuesta depende del token',
    /Authorization/i.test(bueno.cabeceras.get('vary') || ''));
}

console.log('\nEL PREFLIGHT DE UN ORIGEN AJENO SE NIEGA CON UN NÚMERO QUE SE LEE');
{
  /* El navegador bloquea igual por la ausencia de la cabecera; esto es para la persona que
     está diagnosticando con curl por qué un teléfono no sincroniza. Un 204 con las cabeceras
     «casi bien» se lee como que todo está en orden. */
  const ajeno = await pedir('/salud', { metodo: 'OPTIONS', origen: 'https://sitio-ajeno.mx' });
  eq('403 al preflight de un origen que no está en la lista', ajeno.estado, 403);
  const propio = await pedir('/salud', { metodo: 'OPTIONS' });
  eq('204 al de un origen permitido', propio.estado, 204);
  /* Sin cabecera Origin no es el preflight de nadie: un curl a secas sigue siendo 204. */
  const sinOrigen = await pedir('/salud', { metodo: 'OPTIONS', origen: '' });
  eq('204 sin cabecera Origin, que no es el preflight de nadie', sinOrigen.estado, 204);
}

console.log('\nUNA OPERACIÓN QUE REVIENTA NO SE LLEVA EL ACUSE DE LAS DEMÁS');
{
  /* Sin el try/catch por operación, una excepción a mitad del lote se llevaba `resultados`
     entero y la bandeja perdía el acuse de las que SÍ se escribieron. */
  const r = await pedir('/empujar', { metodo: 'POST', cuerpo: { ops: [
    { id: 'op-a', tipo: 'crear', datos: { ...VENTA } },
    /* `datos` no es un objeto: `Object.entries(null)` lanza dentro del bucle. */
    { id: 'op-b', datos: 7 },
    { id: 'op-c', tipo: 'crear', datos: { ...VENTA, 'Folio cotizacion': 'COT-0777@ZZZZ' } },
  ] } });
  eq('vuelven las tres, no una', r.cuerpo.resultados.length, 3);
  eq('la primera se escribió', r.cuerpo.resultados[0].ok, true);
  eq('la tercera también, pese a la de en medio', r.cuerpo.resultados[2].ok, true);
  eq('y la que reventó vuelve nombrada', r.cuerpo.resultados[1].id, 'op-b');
  eq('con un código que la bandeja entiende', r.cuerpo.resultados[1].ok, false);
}

console.log('\nPOR AQUÍ SALE DINERO: que no se quede guardado en ningún lado');
{
  const r = await pedir('/jalar');
  eq('no-store en la respuesta', r.cabeceras.get('cache-control'), 'no-store');
  eq('y nosniff', r.cabeceras.get('x-content-type-options'), 'nosniff');
}

console.log('\n/expandir YA NO EXISTE');
{
  /* Se borró en vez de blindarse: no lo llamaba nadie y era un `fetch` con `redirect:follow`
     donde un tercero elegía los otros veinte saltos, sin tope y sin reloj. */
  const r = await pedir('/expandir?u=' + encodeURIComponent('https://maps.app.goo.gl/abc123'));
  eq('404, como cualquier camino que no existe', r.estado, 404);
}

console.log('\nLO QUE NO EXISTE');
{
  const r = await pedir('/loquesea');
  eq('un camino que no existe, 404', r.estado, 404);
  const sinOps = await pedir('/empujar', { metodo: 'POST', cuerpo: { ops: [] } });
  eq('empujar sin operaciones no revienta', sinOps.estado, 200);
  const sinId = await pedir('/empujar', { metodo: 'POST', cuerpo: { ops: [{ datos: VENTA }] } });
  eq('una operación sin id se nombra', sinId.cuerpo.resultados[0].ok, false);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
