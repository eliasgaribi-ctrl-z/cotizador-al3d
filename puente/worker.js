/* ============================================================================
   El puente a Notion. Cloudflare Worker. FASE 3.

   ESTE ARCHIVO NO SE PUBLICA CON EL SITIO. Se pega en el editor de Cloudflare. No hay
   node, no hay wrangler, no hay terminal: es un archivo, se copia, se guarda. El runbook
   está en puente/README.md.

   ── Por qué existe ─────────────────────────────────────────────────────────────
   Porque desde el navegador es imposible, y no por una restricción tonta:
     1. La API de Notion no manda `Access-Control-Allow-Origin`. El navegador bloquea
        toda petición cross-origin (dos issues abiertos en su propio SDK por esto).
     2. `Notion-Version` es una cabecera no simple, así que dispararía preflight.
     3. Y la de fondo: `Authorization: Bearer secret_…` es un token de ESCRITURA TOTAL
        sobre el workspace. Aunque Notion arreglara CORS mañana, ese token no puede vivir
        en un HTML publicado en GitHub Pages.
   El puente no es un rodeo al CORS. Es DONDE VIVE EL SECRETO.

   ── Y la parte que de verdad importa ───────────────────────────────────────────
   Aquí vive la única frontera de permisos real del sistema. El token de dispositivo mapea
   a un rol y a una lista blanca de propiedades escribibles. Cambiar el segmento de rol en
   la pantalla de Ajustes da otro tablero, NO da permisos: el token de FABRICACIÓN puede
   escribir etapa de obra y movimientos, y este Worker le rechaza `Anticipo` con 403 aunque
   el teléfono diga «Dirección».

   ── Y la lista de LECTURA, que es la que faltaba ───────────────────────────────
   Durante un tiempo aquí solo hubo lista blanca de ESCRITURA, y en la base del dinero la que
   importa es la otra: `/jalar` devolvía la fila entera a cualquier rol, así que con el token
   de fabricación un `curl` de una línea se bajaba el subtotal, el anticipo, las comisiones y
   la cuenta de cobro de todas las ventas. Ahora `/jalar` manda solo lo que el espejo del
   cliente consume —seis campos y el sello— y los importes crudos no salen de Notion por
   ninguno de los tres tokens.

   ── Cuatro cosas que este Worker NO hace, y no es descuido ─────────────────────
   1. NO altera el esquema de Notion. `/esquema` DETECTA lo que falta y devuelve la lista
      con nombre y tipo exactos para que una persona la cree a mano. Es la única garantía
      de que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años
      y $3.7M encima.
   2. NO recalcula ninguna fórmula de Notion. `Precio Neto `, `Pago Pendiente`,
      `Comisiones`, `Comision Restante` y `Fecha Comision` se LEEN. Dos implementaciones de
      la misma fórmula divergen en semanas y el sistema empieza a dar dos respuestas.
   3. NO escribe en propiedades que no estén en la lista blanca del rol, ni siquiera si el
      cliente las manda.
   4. NO acepta un valor inventado en NINGÚN campo de lista. Estatus, Cuenta, Etapa de obra
      y Tipo de trabajo se validan contra la lista real de la base, porque pegar un valor
      inexistente en un *select*, un *status* o un *multi_select* NO FALLA: Notion LO CREA.
      Así se ensucia un esquema, una venta a la vez, hasta que las vistas dejan de cuadrar.

   ── Secretos (Settings → Variables → Encrypt) ──────────────────────────────────
   NOTION_TOKEN   el token de la integración interna (empieza con ntn_ o secret_)
   DS_VENTAS      id del data source de «Ventas - AL3D»
                  por omisión: 56fa21d8-8e7d-4e16-b874-455fd6c65643
   TOKENS         JSON: {"<token largo>":"direccion","<otro>":"fabricacion","<otro>":"pagos"}
                  Se generan con  crypto.randomUUID()  y se pegan uno en cada teléfono.
   ORIGENES       opcional. Lista separada por comas de orígenes permitidos, sin barra final.
                  por omisión: https://eliasgaribi-ctrl-z.github.io
                  AL MUDAR DE DOMINIO: pon los DOS —el viejo y el nuevo— antes de mover a
                  nadie, y redespliega (guardar la variable no basta). Un origen que no está
                  en la lista ya no recibe cabecera de CORS, así que el diagnóstico existe:
                  si la respuesta no trae `Access-Control-Allow-Origin`, es esto y no la red.
   ============================================================================ */

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const VERSION = 'puente-2';
const DS_VENTAS_POR_OMISION = '56fa21d8-8e7d-4e16-b874-455fd6c65643';

/* La forma de un id de página de Notion. Existe porque ese id se PEGA a la ruta de la API:
   sin esto, quien tenga cualquiera de los tres tokens elige a qué endpoint del workspace le
   pega el Worker con el token que puede escribirlo todo. Y `fetch` normaliza el `..` del
   camino, así que un `id_notion` de `../databases/<otra>` convertía un PATCH de fila en un
   PATCH contra otro objeto, y el GET del control de concurrencia en una lectura de cualquier
   página que la integración vea, devuelta al cliente dentro de `conflicto`. Los ids
   legítimos salen siempre de Notion —`aplanar()` los toma de `pagina.id`—, así que exigirles
   forma de UUID no le quita nada a nadie. */
const ID_NOTION = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

/* ── Los nombres REALES de las propiedades ──────────────────────────────────────
   Con el espacio final incluido donde lo tienen. No son erratas: `Precio Neto ` y
   `Cuenta ` se llaman así en la base, y escribir la versión «limpia» crearía propiedades
   nuevas y vacías al lado de las que ya tienen tres años de datos. */
const P = {
  proyecto:   'Proyecto',
  subtotal:   'Precio Subtotal',
  iva:        'IVA',
  neto:       'Precio Neto ',          // fórmula: solo lectura
  anticipo:   'Anticipo',
  liquidacion:'Liquidacion',
  abonoCom:   'Abono Comision',
  pendiente:  'Pago Pendiente',        // fórmula: solo lectura
  comisiones: 'Comisiones',            // fórmula: solo lectura
  comRestante:'Comision Restante',     // fórmula: solo lectura
  fechaCom:   'Fecha Comision',        // fórmula: solo lectura
  estatus:    'Estatus',
  cuenta:     'Cuenta ',               // con espacio final
  fecha:      'Fecha Anticipo e Instalacion',
  fechaLiq:   'Fecha Liquidacion',
};

/* Las fórmulas. Están listadas para poder RECHAZAR una escritura contra ellas con un
   mensaje que explique por qué, en vez de dejar que Notion devuelva un 400 opaco. */
const FORMULAS = new Set([P.neto, P.pendiente, P.comisiones, P.comRestante, P.fechaCom]);

/* Los cuatro valores que de verdad existen en la propiedad Estatus. Se validan aquí porque
   pegar un valor inexistente en una propiedad de tipo *status* NO falla: Notion LA CREA, y
   cada venta ensuciaría el esquema en silencio hasta que las vistas dejaran de cuadrar. */
const ESTATUS = new Set(['REPARANDO', 'COBRANDO', 'FABRICACION', 'LIQUIDADO']);
const CUENTAS = new Set(['Moni MPago', 'Rul HSBC', 'Tatis BNT', 'Constru BNT', 'Elias BBVA']);

/* Las ocho etapas de obra, con el nombre que se lee en el tablero de Notion. Van validadas
   por lo mismo que el estatus, y el riesgo es idéntico: un *select* acepta cualquier cosa y
   la CREA. La diferencia es que aquí nadie lo escribe a mano —lo manda la plataforma— así
   que un cambio de vocabulario del lado del cliente ensuciaría el esquema en silencio, una
   venta a la vez, hasta que el tablero tuviera doce columnas y ninguna cuadrara.
   Esta lista y el mapa ETAPA_A_NOTION de js/datos/puente.js tienen que decir lo mismo. */
const ETAPAS = ['Ganado', 'En diseño', 'Cortado', 'Armado', 'Listo para instalar',
                'Instalado', 'En garantía', 'No se dio'];
const ETAPAS_SET = new Set(ETAPAS);

/* Los siete tipos de trabajo. Un *multi_select* tiene el mismo defecto que un *select*:
   crea la opción que no conoce. Y este campo es el criterio de éxito número 1 del proyecto
   —el que murió en la copia OMAR con 0 filas llenas de 142— así que se valida. */
const TIPOS = ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion',
               'Letras 3D con iluminacion', 'Letras 3D sin iluminacion',
               'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'];
const TIPOS_SET = new Set(TIPOS);

/* Las siete propiedades que la plataforma necesita y que la base todavía no tiene.
   /esquema devuelve las que falten, con su tipo, para que una persona las cree a mano. */
const PROPIEDADES_NUEVAS = [
  { nombre: 'Folio cotizacion', tipo: 'rich_text', para: 'atar la fila al folio del cotizador (COT-0042@K7QM)' },
  { nombre: 'Etapa de obra',    tipo: 'select',    para: 'en qué va la obra, que NO es el Estatus: ese es de dinero',
    opciones: ETAPAS },
  { nombre: 'Fecha instalacion',tipo: 'date',      para: 'la instalación de VERDAD, separada del anticipo' },
  { nombre: 'Hora instalacion', tipo: 'rich_text', para: 'HH:MM, o vacío si todavía no se sabe' },
  { nombre: 'Ubicacion',        tipo: 'rich_text', para: 'lat,lng resueltos del link de Maps' },
  { nombre: 'Direccion',        tipo: 'rich_text', para: 'la dirección como la mandó el cliente' },
  { nombre: 'Tipo de trabajo',  tipo: 'multi_select', para: 'derivado de las partidas, no capturado',
    opciones: TIPOS },
];

/* ── La lista blanca por rol ────────────────────────────────────────────────────
   Esto es el permiso. No la interfaz. */
const ESCRIBIBLES = {
  direccion: [P.proyecto, P.subtotal, P.iva, P.anticipo, P.liquidacion, P.abonoCom,
              P.estatus, P.cuenta, P.fecha, P.fechaLiq,
              'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
              'Ubicacion', 'Direccion', 'Tipo de trabajo'],
  /* Fabricación mueve la obra y el almacén. NO toca dinero: ni el anticipo, ni la
     liquidación, ni la cuenta, ni el estatus de cobranza. */
  fabricacion: ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion'],
  /* Pagos cobra. NO mueve la obra ni el almacén. */
  pagos: [P.anticipo, P.liquidacion, P.abonoCom, P.estatus, P.cuenta, P.fechaLiq],
};

/* ── Y la lista blanca de LECTURA ───────────────────────────────────────────────
   `/jalar` devolvía la fila ENTERA a cualquier rol. Con el token de fabricación —el que la
   cabecera de este archivo presume de que no puede tocar el dinero— un `curl` de una línea
   se bajaba el subtotal, el anticipo, la liquidación, las comisiones y la cuenta de cobro de
   todas las ventas. El permiso de escritura estaba; el de lectura no existía. En la base del
   dinero el que importa es el de lectura.

   La lista de `/jalar` no salió de una opinión sobre qué debería ver cada quien: salió de
   leer qué CONSUME el cliente. `deNotion` (js/datos/puente.js:230-247) usa seis campos y
   `bajar` (js/datos/puente.js:535-545) añade `editado` para el sello. Nada más. Todo lo
   demás cruzaba la red para que el navegador lo tirara. Por eso el filtro es el mismo para
   los tres roles y no cambia una sola pantalla: los importes crudos simplemente dejan de
   salir de Notion.

   OJO con `Folio cotizacion`: sin él `deNotion` devuelve null y la fila entera se descarta,
   o sea que se apagaría el espejo. Y sin `id_notion` se pierde lo único que evita la segunda
   fila en la base del dinero. Las dos son llaves, no datos. */
const LEGIBLES_JALAR = new Set([
  'id_notion', 'editado',
  'Folio cotizacion', P.estatus, P.cuenta, P.pendiente, P.comRestante,
]);

/* Para `remoto` y `conflicto` la cuenta es otra. Esos dos alimentan la pantalla que enseña
   las dos versiones de una fila para que una persona elija, así que recortarlos de más deja
   a alguien decidiendo a ciegas. Dirección y pagos ven todo —es su base y su trabajo—; a
   fabricación se le da lo que puede escribir más lo que necesita para fabricar, que es
   exactamente sobre lo que puede tener un conflicto. `null` significa «todo». */
const LEGIBLES = {
  direccion: null,
  fabricacion: new Set(['id_notion', 'url', 'editado',
    'Folio cotizacion', P.proyecto, 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
    'Ubicacion', 'Direccion', 'Tipo de trabajo', P.fecha]),
  pagos: null,
};
const soloLegibles = (datos, permitidas) => (!permitidas ? datos
  : Object.fromEntries(Object.entries(datos).filter(([k]) => permitidas.has(k))));

/* ── CORS ───────────────────────────────────────────────────────────────────────
   Se responde con el origen concreto, no con `*`: con Authorization de por medio,
   un comodín es una invitación abierta a que cualquier página del mundo use este token. */
function origenPermitido(req, env) {
  const lista = String(env.ORIGENES || 'https://eliasgaribi-ctrl-z.github.io')
    .split(',').map(s => s.trim()).filter(Boolean);
  const o = req.headers.get('Origin') || '';
  /* Si el origen no está en la lista NO se contesta con otro. Devolver `lista[0]` no dejaba
     que nadie leyera la respuesta —el navegador la bloquea igual— pero hacía indistinguible
     un dominio mal escrito de una falla de red: el teléfono decía «puede que no haya señal»
     (js/datos/puente.js:283-285) y un `curl -X OPTIONS` de diagnóstico contestaba 204 con
     unas cabeceras que se veían bien. Vacío significa vacío, y así el diagnóstico existe. */
  return lista.includes(o) ? o : '';
}
function cabecerasCors(origen) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    /* Varía por Authorization además de por Origin: la respuesta DEPENDE del token — el rol,
       los escribibles, y ahora hasta qué columnas se devuelven. */
    'Vary': 'Origin, Authorization',
  };
  /* Sin origen permitido, ninguna cabecera de CORS. Nunca `*`: con Authorization de por
     medio, un comodín es una invitación abierta a que cualquier página del mundo use este
     token desde el navegador de alguien del taller. */
  if (origen) h['Access-Control-Allow-Origin'] = origen;
  return h;
}
const json = (cuerpo, estado, origen, extra) => new Response(JSON.stringify(cuerpo), {
  status: estado || 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    /* Por aquí sale el dinero y las direcciones de los clientes. Que no se guarde en ningún
       lado: ni en el borde de Cloudflare el día que alguien encienda una Cache Rule sobre un
       dominio propio, ni en el Cache Storage del service worker si el puente acaba viviendo
       en el mismo dominio — sw.js solo descarta lo de OTRO origen, así que ese día este
       `no-store` es lo único que separa las dos cosas. */
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...cabecerasCors(origen), ...(extra || {}),
  },
});

/** Lee TOKENS y dice qué tiene de malo, en español. Va aparte del token a propósito: antes
 *  «tu token no está» y «el JSON de TOKENS está roto» eran el mismo 401 mudo, y el segundo
 *  manda a tres personas a re-pegar tres tokens que estaban bien. Es el paso que más se
 *  rompe de los doce del montaje: una coma de más, o una comilla curva del teclado del
 *  celular, y el Worker contestaba 401 a todo sin poder decir por qué. */
function revisarTokens(env) {
  let mapa;
  try { mapa = JSON.parse(env.TOKENS || ''); } catch (_) {
    return { error: 'El JSON de TOKENS en Cloudflare está roto: revisa las comas y que las comillas sean rectas, no curvas. Ningún teléfono va a poder entrar hasta arreglarlo.' };
  }
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) {
    return { error: 'TOKENS tiene que ser un objeto {"<token>":"<rol>"}, y es otra cosa.' };
  }
  /* Y el otro error de pegar desde el teclado del celular, que también daba el 401 mudo: un
     rol mal escrito. Se nombra el que está mal. */
  for (const rol of Object.values(mapa)) {
    if (!ESCRIBIBLES[rol]) {
      return { error: 'TOKENS tiene un rol que no existe: «' + rol + '». Los tres válidos son direccion, fabricacion y pagos, en minúsculas y sin acento.' };
    }
  }
  return { mapa };
}

/* Comparación que no se corta en la primera diferencia. Seamos honestos con lo que compra:
   contra un ataque de tiempo por internet, casi nada — el token es un UUID de 122 bits y el
   ruido de la red tapa mil veces lo que se mediría. Está por dos razones concretas: cuesta
   cinco líneas, y quita el `mapa[t]` de antes, que buscaba en la cadena de prototipos (un
   `Authorization: Bearer constructor` llegaba hasta Object.prototype). Hoy no se colaba
   nadie por ahí —la guarda de ESCRIBIBLES lo atajaba— pero era una trampa puesta para el
   siguiente que tocara estas líneas. */
function igualExacto(a, b) {
  if (a.length !== b.length) return false;   // el largo de un UUID no es un secreto
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** El token de dispositivo → rol. Devuelve null si no lo conoce. */
function rolDe(req, mapa) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t) return null;
  let encontrado = null;
  /* Sin `return` dentro del bucle: se recorren los tres siempre, para que el tiempo de
     respuesta tampoco diga CUÁL de los tres acertó. */
  for (const [tok, rol] of Object.entries(mapa)) {
    if (igualExacto(t, tok) && ESCRIBIBLES[rol]) encontrado = rol;
  }
  return encontrado;
}

async function notion(env, ruta, opciones) {
  const r = await fetch(NOTION + ruta, {
    ...opciones,
    headers: {
      'Authorization': 'Bearer ' + env.NOTION_TOKEN,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...((opciones && opciones.headers) || {}),
    },
  });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch (_) { cuerpo = { message: texto }; }
  return { estado: r.status, cuerpo, reintentar: r.headers.get('Retry-After') };
}

/**
 * La fila que ya tiene ese folio, si existe. Devuelve su id de página o null.
 *
 * Es lo único que hay contra la fila duplicada, y hace falta porque Notion NO TIENE
 * restricciones de unicidad: no se le puede pedir «crea esta fila solo si no está». El
 * caso real no es raro —el teléfono manda el alta, Notion la crea, la respuesta se pierde
 * en un elevador, la bandeja reintenta— y el resultado sería la misma venta dos veces en
 * la base del dinero, con dos anticipos y dos comisiones sumando en las siete vistas.
 *
 * No cierra la ventana del todo: dos altas simultáneas del mismo folio desde dos teléfonos
 * seguirían pasando las dos. La estrecha de «cada reintento duplica» a «solo un empate
 * exacto», que con tres personas y un alta por venta es otra cosa.
 *
 * Si la propiedad todavía no existe, Notion contesta 400 y esto devuelve null: se sigue
 * como antes y el alta va a fallar igual, diciendo cuál falta.
 */
async function buscarPorFolio(env, ds, folio) {
  const r = await notion(env, '/data_sources/' + ds + '/query', {
    method: 'POST',
    body: JSON.stringify({ page_size: 1,
      filter: { property: 'Folio cotizacion', rich_text: { equals: String(folio) } } }),
  });
  if (r.estado >= 400) return null;
  const res = (r.cuerpo && r.cuerpo.results) || [];
  return res.length ? res[0].id : null;
}

/* Los mensajes salen de aquí ya escritos en español, porque el cliente los pinta tal cual
   en un aviso y «Notion API error 429» no le dice nada a nadie. */
function traducir(estado, cuerpo) {
  if (estado === 401 || estado === 403)
    return { codigo: 'ROL_SIN_PERMISO', mensaje: 'El puente no tiene acceso a esa página de Notion. Compártele la base a la integración.' };
  if (estado === 404)
    return { codigo: 'NO_ENCONTRADO', mensaje: 'Esa fila ya no existe en Notion, o la integración no la puede ver.' };
  if (estado === 409)
    return { codigo: 'CONFLICTO', mensaje: 'Alguien más cambió esa fila al mismo tiempo.' };
  if (estado === 429)
    return { codigo: 'SIN_RED', mensaje: 'Notion está limitando las peticiones. Se vuelve a intentar solo.' };
  if (estado >= 500)
    return { codigo: 'SIN_RED', mensaje: 'Notion no está respondiendo. Lo que hiciste quedó guardado en el teléfono y se manda cuando vuelva.' };
  const m = (cuerpo && (cuerpo.message || cuerpo.mensaje)) || '';
  /* El detalle crudo va TAMBIÉN al log, no en vez de a la pantalla. Los informes pedían
     dejar de devolverlo al cliente, y no: ese texto —«property does not exist», «is expected
     to be status»— es la única pista de quien está montando el esquema, y el runbook de
     puente/README.md depende literalmente de leerlo. Quien lo ve ya tiene un token válido, y
     con un token válido ya se lee la base. */
  if (m) console.log('notion-rechazo', m);
  return { codigo: 'DESCONOCIDO', mensaje: m ? 'Notion rechazó el cambio: ' + m : 'Notion rechazó el cambio y no dijo por qué.' };
}

/* ── Construir propiedades, filtrando por la lista blanca ───────────────────────
   Lo que no está permitido no se ignora en silencio: se devuelve en `rechazadas`, porque
   una escritura que se descarta sin decirlo es la peor clase de falla — el usuario cree
   que guardó. */
function armarPropiedades(datos, rol) {
  const permitidas = new Set(ESCRIBIBLES[rol] || []);
  const props = {};
  const rechazadas = [];
  for (const [nombre, valor] of Object.entries(datos || {})) {
    if (FORMULAS.has(nombre)) { rechazadas.push({ nombre, por: 'es una fórmula de Notion: se lee, no se escribe' }); continue; }
    if (!permitidas.has(nombre)) { rechazadas.push({ nombre, por: 'el rol ' + rol + ' no puede escribir esta propiedad' }); continue; }
    if (nombre === P.estatus) {
      if (!ESTATUS.has(valor)) { rechazadas.push({ nombre, por: '«' + valor + '» no es un estatus de la base; pegarlo lo crearía' }); continue; }
      props[nombre] = { status: { name: valor } };
    } else if (nombre === P.cuenta) {
      if (!CUENTAS.has(valor)) { rechazadas.push({ nombre, por: '«' + valor + '» no es una cuenta de la base' }); continue; }
      props[nombre] = { select: { name: valor } };
    } else if (nombre === P.iva) {
      props[nombre] = { checkbox: !!valor };
    } else if (nombre === P.proyecto) {
      props[nombre] = { title: [{ text: { content: String(valor || '').slice(0, 2000) } }] };
    } else if ([P.subtotal, P.anticipo, P.liquidacion, P.abonoCom].includes(nombre)) {
      const n = Number(valor);
      if (!isFinite(n)) { rechazadas.push({ nombre, por: 'no es un número' }); continue; }
      /* Un importe negativo no es un cobro: es una resta silenciosa en la base del dinero, y
         las cinco fórmulas la propagan a las siete vistas sin que se vea de dónde salió. El
         tope de arriba no le estorba a un negocio con $3.7M acumulados, y ataja las dos
         formas reales de meter basura: el dedo gordo —un cero de más son $60,000— y el
         1e21 que `Number` acepta feliz y Notion guarda. */
      if (n < 0) { rechazadas.push({ nombre, por: 'un importe no puede ser negativo' }); continue; }
      if (n > 10000000) { rechazadas.push({ nombre, por: 'ese importe está fuera de rango; si es correcto, captúralo en Notion a mano' }); continue; }
      props[nombre] = { number: n };
    } else if ([P.fecha, P.fechaLiq, 'Fecha instalacion'].includes(nombre)) {
      /* Solo YYYY-MM-DD. Una fecha en es-MX aquí es el error que ya se arregló del otro
         lado y no se vuelve a colar por la puerta de atrás. */
      if (valor === null || valor === '') { props[nombre] = { date: null }; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) { rechazadas.push({ nombre, por: 'la fecha tiene que venir como YYYY-MM-DD' }); continue; }
      props[nombre] = { date: { start: String(valor) } };
    } else if (nombre === 'Etapa de obra') {
      if (!ETAPAS_SET.has(valor)) { rechazadas.push({ nombre, por: '«' + valor + '» no es una etapa de la base; pegarla la crearía' }); continue; }
      props[nombre] = { select: { name: String(valor) } };
    } else if (nombre === 'Tipo de trabajo') {
      const arr = (Array.isArray(valor) ? valor : [valor]).filter(Boolean).map(String);
      const malos = arr.filter(v => !TIPOS_SET.has(v));
      if (malos.length) { rechazadas.push({ nombre, por: 'no son tipos de la base y pegarlos los crearía: ' + malos.join(', ') }); continue; }
      props[nombre] = { multi_select: arr.map(v => ({ name: v })) };
    } else {
      props[nombre] = { rich_text: [{ text: { content: String(valor == null ? '' : valor).slice(0, 2000) } }] };
    }
  }
  return { props, rechazadas };
}

/** Aplana una fila de Notion a algo que el cliente pueda espejar sin conocer su forma. */
function aplanar(pagina) {
  const out = { id_notion: pagina.id, url: pagina.url, editado: pagina.last_edited_time };
  for (const [nombre, p] of Object.entries(pagina.properties || {})) {
    if (!p) continue;
    switch (p.type) {
      case 'title':      out[nombre] = (p.title || []).map(t => t.plain_text).join(''); break;
      case 'rich_text':  out[nombre] = (p.rich_text || []).map(t => t.plain_text).join(''); break;
      case 'number':     out[nombre] = p.number; break;
      case 'checkbox':   out[nombre] = !!p.checkbox; break;
      case 'select':     out[nombre] = p.select ? p.select.name : null; break;
      case 'status':     out[nombre] = p.status ? p.status.name : null; break;
      case 'multi_select': out[nombre] = (p.multi_select || []).map(o => o.name); break;
      case 'date':       out[nombre] = p.date ? p.date.start : null; break;
      case 'formula': {
        const f = p.formula || {};
        out[nombre] = f.type === 'number' ? f.number
          : f.type === 'string' ? f.string
          : f.type === 'date' ? (f.date ? f.date.start : null)
          : f.type === 'boolean' ? f.boolean : null;
        break;
      }
      default: break;   // relation, rollup, files: no se espejan
    }
  }
  return out;
}

export default {
  async fetch(req, env) {
    const origen = origenPermitido(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecerasCors(origen) });

    const url = new URL(req.url);
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    const ds = env.DS_VENTAS || DS_VENTAS_POR_OMISION;

    if (!env.NOTION_TOKEN || !env.TOKENS) {
      return json({ ok: false, codigo: 'DESCONOCIDO',
        mensaje: 'Al puente le faltan sus secretos. Revisa NOTION_TOKEN y TOKENS en Cloudflare.' }, 500, origen);
    }

    /* TOKENS roto no es un token malo: es una variable mal pegada. Un 500 que lo dice es la
       diferencia entre una tarde perdida y dos minutos. */
    const revision = revisarTokens(env);
    if (revision.error) {
      return json({ ok: false, codigo: 'DESCONOCIDO', mensaje: revision.error }, 500, origen);
    }

    const rol = rolDe(req, revision.mapa);
    if (!rol) {
      return json({ ok: false, codigo: 'ROL_SIN_PERMISO',
        mensaje: 'Este teléfono no tiene un token válido del puente. Pégalo otra vez en Ajustes.' }, 401, origen);
    }

    try {
      /* ── /salud ── */
      if (ruta === '/salud' && req.method === 'GET') {
        const r = await notion(env, '/data_sources/' + ds, { method: 'GET' });
        if (r.estado >= 400) {
          const t = traducir(r.estado, r.cuerpo);
          return json({ ok: false, ...t, version: VERSION, rol }, r.estado === 429 ? 429 : 503, origen);
        }
        return json({ ok: true, ts: Date.now(), version: VERSION, rol,
                      escribibles: ESCRIBIBLES[rol] }, 200, origen);
      }

      /* ── /esquema ── detecta lo que falta; NO lo crea ── */
      if (ruta === '/esquema' && req.method === 'GET') {
        const r = await notion(env, '/data_sources/' + ds, { method: 'GET' });
        if (r.estado >= 400) { const t = traducir(r.estado, r.cuerpo); return json({ ok: false, ...t }, 503, origen); }
        const hay = new Set(Object.keys((r.cuerpo && r.cuerpo.properties) || {}));
        const faltan = PROPIEDADES_NUEVAS.filter(p => !hay.has(p.nombre));
        return json({ ok: true, faltan,
          /* El mensaje va aquí, listo para pintar, porque esta es la única pantalla del
             sistema donde se le pide a una persona que abra Notion y cree algo a mano. */
          nota: faltan.length
            ? 'Créalas a mano en la base «Ventas - AL3D». La plataforma no toca el esquema a propósito: es la única forma de garantizar que no se rompan sus vistas ni sus fórmulas.'
            : 'La base ya tiene las siete propiedades que la plataforma necesita.' }, 200, origen);
      }

      /* ── /jalar ── */
      if (ruta === '/jalar' && req.method === 'GET') {
        const cursor = url.searchParams.get('cursor') || undefined;
        const cuerpo = { page_size: 50 };
        if (cursor) cuerpo.start_cursor = cursor;
        /* Ordenado por última edición: así el cursor es una marca de agua y una
           sincronización interrumpida se retoma donde se quedó. */
        cuerpo.sorts = [{ timestamp: 'last_edited_time', direction: 'ascending' }];
        const r = await notion(env, '/data_sources/' + ds + '/query',
          { method: 'POST', body: JSON.stringify(cuerpo) });
        if (r.estado >= 400) {
          const t = traducir(r.estado, r.cuerpo);
          return json({ ok: false, ...t }, r.estado === 429 ? 429 : 503, origen,
            r.reintentar ? { 'Retry-After': r.reintentar } : undefined);
        }
        const registros = (r.cuerpo.results || [])
          .map(p => ({ almacen: 'proyectos', datos: soloLegibles(aplanar(p), LEGIBLES_JALAR) }));
        return json({ ok: true, registros, cursor: r.cuerpo.next_cursor || null,
                      hay_mas: !!r.cuerpo.has_more }, 200, origen);
      }

      /* ── /empujar ── */
      if (ruta === '/empujar' && req.method === 'POST') {
        let entrada;
        try { entrada = await req.json(); } catch (_) {
          return json({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo no es JSON.' }, 400, origen);
        }
        const ops = Array.isArray(entrada && entrada.ops) ? entrada.ops.slice(0, 25) : [];
        const resultados = [];
        for (const op of ops) {
          if (!op || !op.id) { resultados.push({ id: (op && op.id) || '?', ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Operación sin id.' }); continue; }
          const { props, rechazadas } = armarPropiedades(op.datos, rol);
          if (!Object.keys(props).length) {
            resultados.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
              mensaje: rechazadas.length
                ? 'Este teléfono no puede escribir: ' + rechazadas.map(x => x.nombre).join(', ')
                : 'No había nada que escribir.',
              rechazadas });
            continue;
          }
          /* Antes de crear, se busca. Ver `buscarPorFolio`: un reintento después de una
             respuesta perdida no puede costar una venta duplicada en la base del dinero. */
          /* Si venía algo y no tiene forma de id de Notion, se DICE. Silenciarlo lo
             convertiría en un alta duplicada: `idPagina` quedaría en null y la fila se
             crearía otra vez, con su anticipo y su comisión sumando en las siete vistas. */
          if (op.id_notion && !ID_NOTION.test(String(op.id_notion))) {
            resultados.push({ id: op.id, ok: false, codigo: 'DATO_INVALIDO',
              mensaje: 'Ese id de página de Notion no tiene forma de id de Notion.' });
            continue;
          }
          let idPagina = op.id_notion || null;
          if (!idPagina) {
            const folio = String((op.datos && op.datos['Folio cotizacion']) || '').trim();
            if (folio) idPagina = await buscarPorFolio(env, ds, folio);
          }

          let r;
          if (!idPagina) {
            /* Primero el caso que va a pasar de verdad, que no es el malicioso: el cliente
               mandó un CAMBIO de una fila que cree que existe y aquí no se encontró por su
               folio. Crearla sería inventar una venta a partir de un cambio parcial — una
               fila con la etapa movida y sin precio. El cliente ya manda `tipo`
               (js/datos/puente.js) y hasta hoy el Worker lo tiraba a la basura. */
            if (op.tipo === 'actualizar') {
              resultados.push({ id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
                mensaje: 'No encontré esa venta en Notion por su folio. Revisa que la fila siga ahí.', rechazadas });
              continue;
            }
            /* Y el candado de verdad. Vivía SOLO en el cliente, o sea que no era un candado:
               era un aviso anticipado, y un aviso del lado del navegador lo salta un `curl`.
               Dar de alta una venta es escribir una fila nueva en la base del dinero, y eso
               sale del teléfono de Dirección. Aquí es donde se decide; allá, donde se avisa. */
            if (!ESCRIBIBLES[rol].includes(P.proyecto) || !props[P.proyecto]) {
              resultados.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
                mensaje: 'Este teléfono no puede dar de alta ventas: eso sale del de Dirección.', rechazadas });
              continue;
            }
            r = await notion(env, '/pages', { method: 'POST',
              body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: ds }, properties: props }) });
          } else {
            /* El `esperado` es el control de concurrencia: si la fila cambió en Notion desde
               que este teléfono la leyó, no se pisa — se devuelve el registro remoto para que
               la pantalla de conflictos tenga qué comparar. Sin el remoto en la respuesta solo
               se podría decir «no se pudo», que no sirve para decidir. */
            if (op.esperado && op.esperado.editado) {
              const act = await notion(env, '/pages/' + idPagina, { method: 'GET' });
              if (act.estado < 400 && act.cuerpo && act.cuerpo.last_edited_time !== op.esperado.editado) {
                resultados.push({ id: op.id, ok: false, codigo: 'CONFLICTO',
                  mensaje: 'Esa fila cambió en Notion desde la última vez que este teléfono la vio.',
                  conflicto: soloLegibles(aplanar(act.cuerpo), LEGIBLES[rol]) });
                continue;
              }
            }
            r = await notion(env, '/pages/' + idPagina, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
          }
          /* Lo único que hay para saber qué teléfono escribió qué: en Notion toda escritura
             aparece firmada por la integración, sin distinguir de quién vino. Se ve en el
             panel (Workers → Logs). Van los NOMBRES de las propiedades y NUNCA sus valores
             —con los valores acabas con los importes de los clientes guardados en el panel de
             Cloudflare— y nunca, bajo ninguna circunstancia, el token. */
          console.log(JSON.stringify({ rol, op: op.id, pagina: idPagina || 'nueva',
                                       props: Object.keys(props), estado: r.estado }));
          if (r.estado >= 400) {
            const t = traducir(r.estado, r.cuerpo);
            resultados.push({ id: op.id, ok: false, ...t, rechazadas });
            /* Un 429 corta la vuelta entera: seguir pegándole es cómo se pasa de un límite
               temporal a un bloqueo. Lo que queda se reintenta en la siguiente. */
            if (r.estado === 429) {
              return json({ ok: true, resultados }, 429, origen,
                r.reintentar ? { 'Retry-After': r.reintentar } : { 'Retry-After': '30' });
            }
            continue;
          }
          resultados.push({ id: op.id, ok: true, remoto: soloLegibles(aplanar(r.cuerpo), LEGIBLES[rol]), rechazadas });
        }
        return json({ ok: true, resultados }, 200, origen);
      }

      /* Aquí vivía `/expandir`, que resolvía un link corto de Google Maps. Se borró y no se
         sustituyó por nada. No lo llamaba NADIE —una definición en js/datos/puente.js y cero
         invocaciones; js/mod/mapa.js resuelve el link por el otro camino, pidiéndole a la
         persona que lo abra y copie— así que era riesgo sin función: un `fetch` con
         `redirect: 'follow'` donde un tercero elegía los otros veinte saltos, sin tope y sin
         reloj, alcanzable con cualquiera de los tres tokens.

         Y se borró en vez de blindarse a propósito. La validación del PRIMER salto era
         correcta y no hay que aflojarla nunca; lo que no se puede validar bien es el destino,
         porque Google mueve sus cortos entre google.com/maps, maps.google.com y hosts
         regionales, y una lista blanca de destino acabaría rechazando un pin legítimo
         delante del cliente con un 422 que miente. Escribir validaciones para un endpoint
         muerto es trabajo que solo puede salir mal. */

      return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Ese camino no existe en el puente.' }, 404, origen);
    } catch (e) {
      /* Nunca se devuelve una excepción cruda: el cliente pinta `mensaje` tal cual. */
      return json({ ok: false, codigo: 'DESCONOCIDO',
        mensaje: 'El puente falló: ' + (e && e.message ? e.message : 'sin detalle') }, 500, origen);
    }
  },
};
