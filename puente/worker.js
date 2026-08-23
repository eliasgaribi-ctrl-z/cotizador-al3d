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

   ── Tres cosas que este Worker NO hace, y no es descuido ───────────────────────
   1. NO altera el esquema de Notion. `/esquema` DETECTA lo que falta y devuelve la lista
      con nombre y tipo exactos para que una persona la cree a mano. Es la única garantía
      de que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años
      y $3.7M encima.
   2. NO recalcula ninguna fórmula de Notion. `Precio Neto `, `Pago Pendiente`,
      `Comisiones`, `Comision Restante` y `Fecha Comision` se LEEN. Dos implementaciones de
      la misma fórmula divergen en semanas y el sistema empieza a dar dos respuestas.
   3. NO escribe en propiedades que no estén en la lista blanca del rol, ni siquiera si el
      cliente las manda.

   ── Secretos (Settings → Variables → Encrypt) ──────────────────────────────────
   NOTION_TOKEN   el token de la integración interna (empieza con ntn_ o secret_)
   DS_VENTAS      id del data source de «Ventas - AL3D»
                  por omisión: 56fa21d8-8e7d-4e16-b874-455fd6c65643
   TOKENS         JSON: {"<token largo>":"direccion","<otro>":"fabricacion","<otro>":"pagos"}
                  Se generan con  crypto.randomUUID()  y se pegan uno en cada teléfono.
   ORIGENES       opcional. Lista separada por comas de orígenes permitidos.
                  por omisión: https://eliasgaribi-ctrl-z.github.io
   ============================================================================ */

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const VERSION = 'puente-1';
const DS_VENTAS_POR_OMISION = '56fa21d8-8e7d-4e16-b874-455fd6c65643';

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

/* Las siete propiedades que la plataforma necesita y que la base todavía no tiene.
   /esquema devuelve las que falten, con su tipo, para que una persona las cree a mano. */
const PROPIEDADES_NUEVAS = [
  { nombre: 'Folio cotizacion', tipo: 'rich_text', para: 'atar la fila al folio del cotizador (COT-0042@K7QM)' },
  { nombre: 'Etapa de obra',    tipo: 'select',    para: 'ganado / cortado / armado / listo / instalado / cerrado',
    opciones: ['ganado', 'cortado', 'armado', 'listo', 'instalado', 'cerrado'] },
  { nombre: 'Fecha instalacion',tipo: 'date',      para: 'la instalación de VERDAD, separada del anticipo' },
  { nombre: 'Hora instalacion', tipo: 'rich_text', para: 'HH:MM, o vacío si todavía no se sabe' },
  { nombre: 'Ubicacion',        tipo: 'rich_text', para: 'lat,lng resueltos del link de Maps' },
  { nombre: 'Direccion',        tipo: 'rich_text', para: 'la dirección como la mandó el cliente' },
  { nombre: 'Tipo de trabajo',  tipo: 'multi_select', para: 'derivado de las partidas, no capturado',
    opciones: ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion',
               'Letras 3D con iluminacion', 'Letras 3D sin iluminacion',
               'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'] },
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

/* ── CORS ───────────────────────────────────────────────────────────────────────
   Se responde con el origen concreto, no con `*`: con Authorization de por medio,
   un comodín es una invitación abierta a que cualquier página del mundo use este token. */
function origenPermitido(req, env) {
  const lista = String(env.ORIGENES || 'https://eliasgaribi-ctrl-z.github.io')
    .split(',').map(s => s.trim()).filter(Boolean);
  const o = req.headers.get('Origin') || '';
  return lista.includes(o) ? o : (lista[0] || '');
}
function cabecerasCors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (cuerpo, estado, origen, extra) => new Response(JSON.stringify(cuerpo), {
  status: estado || 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecerasCors(origen), ...(extra || {}) },
});

/** El token de dispositivo → rol. Devuelve null si no lo conoce. */
function rolDe(req, env) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t) return null;
  let mapa;
  try { mapa = JSON.parse(env.TOKENS || '{}'); } catch (_) { return null; }
  const rol = mapa[t];
  return (rol && ESCRIBIBLES[rol]) ? rol : null;
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
      props[nombre] = { number: n };
    } else if ([P.fecha, P.fechaLiq, 'Fecha instalacion'].includes(nombre)) {
      /* Solo YYYY-MM-DD. Una fecha en es-MX aquí es el error que ya se arregló del otro
         lado y no se vuelve a colar por la puerta de atrás. */
      if (valor === null || valor === '') { props[nombre] = { date: null }; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) { rechazadas.push({ nombre, por: 'la fecha tiene que venir como YYYY-MM-DD' }); continue; }
      props[nombre] = { date: { start: String(valor) } };
    } else if (nombre === 'Etapa de obra') {
      props[nombre] = { select: { name: String(valor) } };
    } else if (nombre === 'Tipo de trabajo') {
      const arr = Array.isArray(valor) ? valor : [valor];
      props[nombre] = { multi_select: arr.filter(Boolean).map(v => ({ name: String(v) })) };
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

    const rol = rolDe(req, env);
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
        const registros = (r.cuerpo.results || []).map(p => ({ almacen: 'proyectos', datos: aplanar(p) }));
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
          let r;
          if (op.tipo === 'crear' || !op.id_notion) {
            r = await notion(env, '/pages', { method: 'POST',
              body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: ds }, properties: props }) });
          } else {
            /* El `esperado` es el control de concurrencia: si la fila cambió en Notion desde
               que este teléfono la leyó, no se pisa — se devuelve el registro remoto para que
               la pantalla de conflictos tenga qué comparar. Sin el remoto en la respuesta solo
               se podría decir «no se pudo», que no sirve para decidir. */
            if (op.esperado && op.esperado.editado) {
              const act = await notion(env, '/pages/' + op.id_notion, { method: 'GET' });
              if (act.estado < 400 && act.cuerpo && act.cuerpo.last_edited_time !== op.esperado.editado) {
                resultados.push({ id: op.id, ok: false, codigo: 'CONFLICTO',
                  mensaje: 'Esa fila cambió en Notion desde la última vez que este teléfono la vio.',
                  conflicto: aplanar(act.cuerpo) });
                continue;
              }
            }
            r = await notion(env, '/pages/' + op.id_notion, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
          }
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
          resultados.push({ id: op.id, ok: true, remoto: aplanar(r.cuerpo), rechazadas });
        }
        return json({ ok: true, resultados }, 200, origen);
      }

      /* ── /expandir ── cuatro líneas que del lado del navegador son imposibles ── */
      if (ruta === '/expandir' && req.method === 'GET') {
        const u = url.searchParams.get('u') || '';
        if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(u)) {
          return json({ ok: false, mensaje: 'Eso no es un link corto de Google Maps.' }, 422, origen);
        }
        const r = await fetch(u, { redirect: 'follow' });
        if (!r.url || r.url === u) return json({ ok: false, mensaje: 'Ese link corto no llevó a ningún mapa.' }, 422, origen);
        return json({ ok: true, url: r.url }, 200, origen);
      }

      return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Ese camino no existe en el puente.' }, 404, origen);
    } catch (e) {
      /* Nunca se devuelve una excepción cruda: el cliente pinta `mensaje` tal cual. */
      return json({ ok: false, codigo: 'DESCONOCIDO',
        mensaje: 'El puente falló: ' + (e && e.message ? e.message : 'sin detalle') }, 500, origen);
    }
  },
};
