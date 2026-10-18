/* ============================================================================
   verificar.js · el guion de verificar.html

   Vivía en línea, dentro de un <script type="module"> de la página. Se mudó aquí en octubre de
   2026 para que la política de verificar.html pudiera quitar 'unsafe-inline' de script-src (M6
   de la auditoría técnica): un guion en línea solo corre con 'unsafe-inline' o con su huella
   sha256 en la política, y la huella de cuatrocientas líneas cambia con el fin de línea —la
   copia de trabajo de Windows guarda CRLF y el sitio publica LF—, así que la vista local y la
   publicada no podían tener la misma. Un archivo de 'self' no tiene ese problema.
   No cambió una línea de lógica; solo la ruta del import, que ahora es relativa a js/.
   ============================================================================ */

import { URL_PUENTE } from './datos/prefs.js';

const P = window.Piezas || {};
const $ = id => document.getElementById(id);
const dinero = n => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const sinMovimiento = () => (P.sinMovimiento ? P.sinMovimiento() : false);

/* El cuarto valor es el título que pasa al <h1> (A2): la página deja de preguntar y contesta.
   El quinto es el estado del glifo de la pieza 24, y nunca va solo: al lado siempre está la
   palabra, porque el color no se puede leer a contraluz ni lo ve todo el mundo igual. */
const ESTADOS = {
  autentica:    ['ok',  'Auténtica',      'AL3D autorizó esta cotización con estos datos.', 'Auténtica.', 'ok'],
  superada:     ['av',  'Ya no vigente',  'Esta cotización se volvió a autorizar con otro precio u otros renglones. Pide a AL3D la versión más reciente.', 'Ya no vigente.', 'av'],
  revocada:     ['mal', 'Revocada',       'AL3D retiró esta autorización. Ya no vale como cotización.', 'Revocada.', 'mal'],
  no_autentica: ['mal', 'No auténtica',   'No hay una cotización de AL3D con ese folio y ese código. Revisa que los copiaste completos; si te la mandaron así, confírmala directo con AL3D.', 'No auténtica.', 'mal'],
};
const TITULO_PREGUNTA = '¿Esta cotización es auténtica?';

/* ------------------------------------------------------------------ el folio tal como viene
   El PDF imprime «COT-0042»; la liga del QR trae «COT-0042@K7QM». Los dos valen, y desde el
   arreglo de la falla 1 la hoja también los acepta a los dos (folioDePapel_). Lo único que se
   normaliza aquí es la caja de la parte corta —siempre es COT y dígitos— y los espacios que
   deja el copiar y pegar. La parte del aparato se respeta tal cual: ahí las minúsculas y las
   mayúsculas sí significan cosas distintas. */
function folioDelPapel(bruto) {
  const s = String(bruto == null ? '' : bruto).trim().replace(/\s+/g, '');
  const i = s.indexOf('@');
  return i < 0 ? s.toLocaleUpperCase('es-MX') : s.slice(0, i).toLocaleUpperCase('es-MX') + s.slice(i);
}
const folioSeVe = f => /^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$/.test(f);

/* --------------------------------------------------------------- el renglón del veredicto
   Tres momentos, y en cada uno una sola cosa se mueve:
     esperando  · las tres manchas de los azules del logo (pieza 25, ficha A23). Reemplazan al
                  anillo gris que era igual en toda la app, también en la única pantalla que
                  ve alguien de fuera.
     contestó   · las manchas se juntan en la forma del logo y se quedan quietas —eso es
                  terminar()— y en su lugar entra el glifo del veredicto, 44 px, que dibuja su
                  trazo una vez (pieza 24, ficha A2).
     el título  · se cruza con un fundido corto a la respuesta.

   Van uno detrás de otro y no a la vez: dos glifos al mismo tiempo en un renglón de una línea
   se leen como que la página se atoró. Con menos movimiento no hay espera entre los dos. */
let cargaViva = null, relevo = 0;

/* El renglón es una caja flexible con dos hijos —el glifo y la frase— y no tres. Con el <b> y
   el texto sueltos, cada uno era un elemento flexible por su cuenta y el «·» se iba solo al
   siguiente renglón: «Auténtica» arriba y «· AL3D autorizó…» debajo, como si fueran dos
   cosas. Envuelta, la frase se parte por donde se parten las frases. */
function frase(encabezado, texto) {
  const s = document.createElement('span');
  s.className = 'ver-est-tx';
  const b = document.createElement('b'); b.textContent = encabezado;
  s.append(b, ' · ' + texto);
  return s;
}

function limpiarRenglon() {
  clearTimeout(relevo);
  if (cargaViva) { try { cargaViva.destruir(); } catch (_) {} cargaViva = null; }
  $('ver-est').textContent = '';
}

function esperando(texto) {
  limpiarRenglon();
  $('ver').className = 'ver-caja';
  const e = $('ver-est');
  if (P.cargaLogo) cargaViva = P.cargaLogo(e, { etiqueta: 'Consultando el registro de AL3D' });
  e.append(frase('Consultando', texto));
  titulo(TITULO_PREGUNTA, false);
}

function veredicto(clase, encabezado, texto, tituloNuevo, glifo) {
  const e = $('ver-est');
  $('ver').className = 'ver-caja ' + clase;
  const ponerGlifo = () => {
    if (cargaViva) { try { cargaViva.destruir(); } catch (_) {} cargaViva = null; }
    e.textContent = '';
    if (P.marcaEstado) P.marcaEstado(e, glifo, { tam: 44 });
    e.append(frase(encabezado, texto));
  };
  if (cargaViva && !sinMovimiento()) {
    /* Las manchas se juntan primero (A23) y el glifo entra cuando ya están quietas. */
    try { cargaViva.terminar(glifo === 'ok' ? 'ok' : 'mal', encabezado); } catch (_) {}
    clearTimeout(relevo);
    relevo = setTimeout(ponerGlifo, 420);
  } else {
    clearTimeout(relevo);
    ponerGlifo();
  }
  titulo(tituloNuevo, true);
}

/* El <h1> no es una región viva, y no debe serlo: el renglón de arriba ya anuncia el
   veredicto, y con los dos el lector lo diría dos veces. El fundido es puro adorno. */
function titulo(texto, cambia) {
  const h = $('ver-titulo');
  if (h.textContent === texto) return;
  h.textContent = texto;
  if (!cambia || sinMovimiento()) return;
  h.classList.remove('ver-titulo-cambia');
  void h.offsetWidth;
  h.classList.add('ver-titulo-cambia');
}

/* --------------------------------------------------------------------------- A3 · el sello */
function pintarSello(estado, cuando) {
  const caja = $('ver-sello-caja');
  $('ver-sello').textContent = '';
  if (!P.sello || estado === 'no_autentica') { caja.hidden = true; return; }
  const bueno = estado === 'autentica';
  const rotulo = bueno ? 'COTIZACIÓN AUTÉNTICA' : (estado === 'revocada' ? 'AUTORIZACIÓN RETIRADA' : 'YA NO VIGENTE');
  P.sello('ver-sello', {
    texto: 'AL3D · ' + rotulo + ' · ' + location.host + ' · CONSULTADA ' + cuando + ' ·',
    sub: bueno ? 'AUTÉNTICA' : (estado === 'revocada' ? 'REVOCADA' : 'NO VIGENTE'),
    gris: !bueno,
    etiqueta: 'Sello de AL3D: ' + rotulo.toLocaleLowerCase('es-MX'),
  });
  caja.hidden = false;
}

/* --------------------------------------------- A14 · comparar con el papel, renglón a renglón
   Cada dato lleva sus dos botones. Marcar «Coincide» dibuja la palomita de la pieza 6 y deja
   el renglón con su filete verde —filete y palomita, no `opacity`: atenuar el texto de un
   renglón es decir el estado con transparencia, y el sistema de diseño lo prohíbe sobre
   bloques con texto (§4.3)—. Con los cuatro marcados sale la frase de abajo.

   Un solo «No coincide» pesa más que tres «Coincide»: la tarjeta se vuelve el aviso de
   documento alterado, con el correo de AL3D ya redactado. Nada de esto se guarda: quien
   recargue la página vuelve a empezar, que es lo correcto para una ayuda de lectura. */
/* Los cuatro de siempre y, si el sello los firmó, uno por partida: la lista se arma en
   armarCotejo() con lo que de verdad hay en la tarjeta. */
let RENGLONES = ['folio', 'fecha', 'negocio', 'total'];
let cotejo = {}, folioActual = '';
/* Lo que la hoja contestó, para poder volver a ello si quien comparaba se equivocó de botón, y
   si la tarjeta está enseñando el aviso de «alterado» en vez del veredicto de la hoja. */
let contestado = null, enAlterado = false;

function armarCotejo() {
  cotejo = {};
  RENGLONES = [...$('ver-datos').querySelectorAll('.ver-reng')].map(d => d.dataset.reng);
  for (const div of $('ver-datos').querySelectorAll('.ver-reng')) {
    const cual = div.dataset.reng, dato = div.querySelector('dt').textContent;
    const caja = div.querySelector('.ver-cotejo');
    div.classList.remove('coincide', 'no-coincide');
    caja.textContent = '';
    for (const [valor, rotulo] of [['si', 'Coincide'], ['no', 'No coincide']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ver-cot ver-cot-' + valor;
      b.setAttribute('aria-pressed', 'false');
      /* El nombre accesible lleva el dato: cuatro botones «Coincide» seguidos no se
         distinguen de oídas, y este es el renglón por el que se navega con teclado. */
      b.setAttribute('aria-label', rotulo + ' · ' + dato);
      const t = document.createElement('span'); t.className = 'ver-cot-tx'; t.textContent = rotulo;
      const ico = document.createElement('span'); ico.className = 'ver-cot-ico';
      b.append(ico, t);
      b.addEventListener('click', () => marcarRenglon(div, cual, valor, b));
      caja.append(b);
    }
  }
  $('ver-cotejo-fin').hidden = true;
  $('ver-cotejo-fin').textContent = '';
  $('ver-alterado').hidden = true;
  enAlterado = false;
}

function marcarRenglon(div, cual, valor, boton) {
  const antes = cotejo[cual];
  const nuevo = antes === valor ? null : valor;      // volver a tocarlo lo desmarca
  cotejo[cual] = nuevo;
  for (const b of div.querySelectorAll('.ver-cot')) {
    const suyo = b.classList.contains('ver-cot-si') ? 'si' : 'no';
    b.setAttribute('aria-pressed', String(suyo === nuevo));
    const ico = b.querySelector('.ver-cot-ico');
    /* La palomita se dibuja solo cuando nace: si se repintara en cada toque, el renglón de
       al lado volvería a dibujar la suya sin que nadie la haya tocado. */
    if (suyo === 'si' && nuevo === 'si') { if (!ico.firstChild && P.palomita) P.palomita(ico); }
    else if (suyo === 'si') ico.textContent = '';
  }
  div.classList.toggle('coincide', nuevo === 'si');
  div.classList.toggle('no-coincide', nuevo === 'no');
  contarCotejo();
  /* El correo se rearma con lo que está marcado ahora mismo. Se hace aquí y no con un oyente
     sobre la lista: la lista se repinta en cada consulta y los oyentes se iban acumulando. */
  armarContacto(folioActual, RENGLONES.filter(k => cotejo[k] === 'no'));
}

/* Un solo «No coincide» pesa más que tres «Coincide»: la TARJETA cambia al aviso de documento
   alterado —rojo, con su ✕ y su palabra— y el sello se va. Dejar un «Auténtica» verde con su sello
   de goma encima de un renglón que dice «no coincide» era mostrar en la misma pantalla las dos
   cosas, y el sello es justo lo que alguien se llevaría en una captura. Si quien comparaba se
   equivocó de botón y lo suelta, la tarjeta vuelve a decir lo que la hoja contestó. */
function contarCotejo() {
  const hayNo = RENGLONES.some(k => cotejo[k] === 'no');
  const todos = RENGLONES.every(k => cotejo[k] === 'si');
  $('ver-alterado').hidden = !hayNo;
  const fin = $('ver-cotejo-fin');
  if (hayNo && !enAlterado && contestado) {
    enAlterado = true;
    veredicto('mal', 'No coincide con tu papel', 'Lo que dice tu papel no es lo que AL3D tiene autorizado: ese documento se modificó.', 'Documento alterado.', 'mal');
    $('ver-sello-caja').hidden = true;
  } else if (!hayNo && enAlterado && contestado) {
    enAlterado = false;
    veredicto(contestado.clase, contestado.encabezado, contestado.texto, contestado.titulo, contestado.glifo);
    pintarSello(contestado.estado, contestado.hora);
  }
  if (hayNo) { fin.hidden = true; fin.textContent = ''; return; }
  fin.textContent = todos ? 'Todo coincide con tu papel.' : '';
  fin.hidden = !todos;
}

/* El correo lleva el folio ya puesto: quien escribe desde el teléfono de la calle no tiene
   que copiar nada, y del lado de AL3D llega con qué buscar. El contacto es el de AL3D y no el
   del cliente, porque esta página promete no enseñar datos de nadie. */
function armarContacto(folio, cuales) {
  const a = $('ver-escribir');
  const asunto = 'Cotización ' + (folio || 'sin folio') + ': un dato no coincide';
  const cuerpo = 'Hola, estoy verificando la cotización ' + (folio || '(sin folio)') + '.\n'
    + 'En mi papel no coincide: ' + (cuales.length ? cuales.join(', ') : '(escribe aquí qué dato)') + '.\n\n'
    + 'Consultado en ' + location.host + '.';
  a.href = 'mailto:eliasgaribi@gmail.com?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
}

/* ------------------------------------------------------------------------- la consulta */
let consultando = false;

async function verificar(f, c) {
  if (consultando) return;
  consultando = true;
  contestado = null; enAlterado = false;
  $('ver-datos').hidden = true;
  $('ver-sello-caja').hidden = true;
  $('ver-alterado').hidden = true;
  $('ver-cotejo-fin').hidden = true;
  $('ver-ren-nota').hidden = true;
  esperando('el registro de AL3D…');
  const boton = $('ver-enviar');
  /* El botón se apaga mientras pregunta: dos toques mandaban dos consultas. */
  if (boton) boton.disabled = true;
  try { await consultar(f, c); }
  finally { consultando = false; if (boton) boton.disabled = false; }
}

async function consultar(f, c) {
  let r;
  try {
    const res = await fetch(URL_PUENTE, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ruta: 'verificar', f, c }),
    });
    r = await res.json();
  } catch (_) {
    veredicto('av', 'Sin respuesta', 'No se pudo consultar el registro. Revisa tu conexión: se vuelve a intentar solo en cuanto haya señal.', TITULO_PREGUNTA, 'av');
    reintentarConSenal(f, c);
    return;
  }
  if (!r || r.ok !== true) {
    veredicto('av', 'Espera un momento', (r && r.mensaje) || 'El registro no contestó.', TITULO_PREGUNTA, 'av');
    return;
  }
  const [clase, encabezado, texto, tit, glifo] = ESTADOS[r.estado] || ESTADOS.no_autentica;
  veredicto(clase, encabezado, texto, tit, glifo);

  /* El lavado verde de las casillas cuando la hoja confirmó, y el vaciado en cascada cuando
     dice que no hay nada con ese código. «Sin respuesta» y «espera un momento» no vacían: el
     código no tuvo la culpa y borrarlo obligaría a teclearlo otra vez. */
  if (casillas) {
    if (r.estado === 'autentica') casillas.marcar('ok');
    else if (r.estado === 'no_autentica') casillas.marcar('mal');
    else casillas.marcar(null);
  }

  if (r.estado === 'no_autentica') {
    pintarSello(r.estado);
    /* Quien llegó por el QR con el formulario plegado y recibió «No auténtica» lo necesita: es
       la única forma de probar con otro folio o con el código bien copiado. */
    $('ver-form-caja').open = true;
    return;
  }
  $('ver-folio').textContent = r.folio || '—';
  $('ver-fecha').textContent = r.fecha || '—';
  $('ver-proy').textContent = r.proyecto || '—';
  $('ver-total').textContent = Number.isFinite(Number(r.total)) ? dinero(r.total) : '—';
  pintarRenglones(r.renglones);
  armarCotejo();
  folioActual = r.folio || '';
  armarContacto(folioActual, []);
  $('ver-datos').hidden = false;
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  contestado = { estado: r.estado, clase, encabezado, texto, titulo: tit, glifo, hora };
  pintarSello(r.estado, hora);
}

/* ------------------------------------------------------ puente-sheets-8 · los renglones
   Lo que la hoja firmó por cada partida —descripción, piezas e importe— entra a la misma lista
   que el folio y el total, cada uno con sus dos botones: un renglón que no coincide pesa igual
   que un total distinto. Todo con textContent: la descripción la tecleó un vendedor y aquí es
   un dato, no HTML. Sin `renglones` —un sello de antes de que la hoja los guardara, o una hoja
   que todavía no se actualiza— no se pinta ninguno, y la nota dice con honestidad hasta dónde
   llega ese sello: callarlo haría creer que los renglones también se comprobaron. */
function pintarRenglones(renglones) {
  const lista = $('ver-datos'), nota = $('ver-ren-nota');
  for (const viejo of lista.querySelectorAll('.ver-reng-partida')) viejo.remove();
  nota.hidden = false;
  if (!Array.isArray(renglones) || !renglones.length) {
    nota.textContent = 'Este sello es de antes de que AL3D guardara los renglones: garantiza el folio, '
      + 'la fecha, el negocio y el total, no cada renglón. Si dudas de alguno, confírmalo directo con AL3D.';
    return;
  }
  nota.textContent = 'Compara cada renglón con tu PDF; si alguno no coincide, el PDF fue alterado. '
    + 'Los importes son antes de I.V.A. y de cualquier descuento. Si tu PDF junta partidas en '
    + '«Conceptos adicionales», ese importe es la suma de las de aquí que allá no aparecen.';
  renglones.forEach((x, i) => {
    const div = document.createElement('div');
    div.className = 'ver-reng ver-reng-partida';
    /* La llave es la que sale en el correo de «no coincide»: «renglón 2» se encuentra en el papel. */
    div.dataset.reng = 'renglón ' + (i + 1);
    const dt = document.createElement('dt');
    dt.textContent = 'Renglón ' + (i + 1) + ' · ' + (String((x && x.descripcion) || '') || 'sin descripción');
    const dd = document.createElement('dd');
    const valor = document.createElement('span');
    valor.className = 'ver-valor ver-num';
    const cant = Number(x && x.cantidad), imp = Number(x && x.importe);
    valor.textContent = (Number.isFinite(cant) ? cant.toLocaleString('es-MX') : '—') + ' pzas. · '
      + (Number.isFinite(imp) ? dinero(imp) : '—');
    const caja = document.createElement('span');
    caja.className = 'ver-cotejo';
    dd.append(valor, caja);
    div.append(dt, dd);
    lista.append(div);
  });
}

/* A2 · «Sin respuesta» se reintenta sola al volver la señal: el caso típico es el cliente en
   la banqueta con una raya de red. Un solo reintento por caída, y el oyente se quita al
   dispararse para que no se acumulen. */
let esperandoSenal = null;
function reintentarConSenal(f, c) {
  if (esperandoSenal) removeEventListener('online', esperandoSenal);
  esperandoSenal = () => {
    removeEventListener('online', esperandoSenal);
    esperandoSenal = null;
    verificar(f, c);
  };
  addEventListener('online', esperandoSenal);
}

/* ------------------------------------------------------- A1 · el código en doce casillas
   Tres grupos de cuatro. La pieza 19 envuelve el <input> que ya está en el HTML: el campo de
   verdad se queda debajo, transparente, con el foco, el pegado y el lector; las casillas son
   dibujo y la zona táctil es la fila entera.

   El alfabeto es el de la hoja (normalizarCodigo: 0-9 y A-F) y con él van las equivalencias
   que importan al copiar de un papel impreso: la O se lee 0, la I y la L se leen 1. Sin eso,
   quien escribe «O» donde hay un cero recibe «No auténtica» con la cotización buena en la
   mano, que es exactamente la falla que esta ficha vino a cerrar.

   Al completar los doce se consulta sola, si ya hay folio: en un teléfono eso es un toque
   menos, y el toque que se ahorra es el de un botón que estaba fuera de la pantalla. */
let casillas = null;
if (P.casillasCodigo) {
  casillas = P.casillasCodigo('f-c', {
    ...P.codigo.HEX,
    textoRechazo: 'El código solo lleva números del 0 al 9 y letras de la A a la F',
    alCompletar: () => { if ($('f-f').value.trim()) enviar(); },
  });
}
const codigoTecleado = () => (casillas ? casillas.valor() : String($('f-c').value || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12));

function enviar() {
  const nf = folioDelPapel($('f-f').value);
  const nc = codigoTecleado();
  if (!nf || !folioSeVe(nf)) {
    veredicto('av', 'Falta el folio', 'Escribe el folio como sale en tu cotización, por ejemplo COT-0042.', TITULO_PREGUNTA, 'av');
    $('f-f').focus();
    return;
  }
  if (nc.length !== 12) {
    veredicto('av', 'Falta el código', 'El código son doce caracteres, del 0 al 9 y de la A a la F.', TITULO_PREGUNTA, 'av');
    const caja = document.getElementById('f-c'); if (caja) caja.focus();
    return;
  }
  $('f-f').value = nf;
  history.replaceState(null, '', '?f=' + encodeURIComponent(nf) + '&c=' + encodeURIComponent(nc));
  verificar(nf, nc);
}

$('ver-form').addEventListener('submit', ev => { ev.preventDefault(); enviar(); });
/* Que el folio quede normalizado en cuanto se sale del campo, para que lo que se ve sea lo
   que se va a mandar. */
$('f-f').addEventListener('blur', () => { const v = folioDelPapel($('f-f').value); if (v) $('f-f').value = v; });

/* --------------------------------------------------------------------- arranque */
const q = new URLSearchParams(location.search);
const f = folioDelPapel(q.get('f') || ''), c = (q.get('c') || '').trim();
$('f-f').value = f;
if (casillas) casillas.fijar(c); else if ($('f-c')) $('f-c').value = c;

if (f && c) {
  /* Llegó por el QR: el formulario se queda plegado. */
  $('ver-form-caja').open = false;
  verificar(f, c);
} else {
  $('ver-form-caja').open = true;
  veredicto('', 'Falta el código', 'Escanea el QR de la cotización, o escribe abajo el folio y el código.', TITULO_PREGUNTA, 'espera');
}
