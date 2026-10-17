/* =========================================================================================
   COPIA DIARIA HOJA → SUPABASE — se pega como un ARCHIVO NUEVO del proyecto de Apps Script de la
   hoja REAL «Finanzas AL3D — Ventas y Comisiones», junto a Código.gs. No cambia nada de Código.gs.

   Para qué. Decidido por Elías el 2026-10-16: el equipo sigue capturando directo en la hoja, así que
   cada madrugada esta hoja se copia ENTERA a la base de Supabase (la nube) y se cuadra. Cuando
   Ajustes diga 7 días seguidos cuadrando, Elías decide el día: última copia, la hoja a solo lectura
   y el equipo pasa a la plataforma. Hasta ese día la hoja sigue mandando: lo que la nube tenga
   distinto se pisa con lo de la hoja en la copia siguiente.

   Qué hace copiarHojaASupabase(): lee las pestañas que necesita el importador (las mismas que
   puente/volcado-para-importar.gs, con getValues() y las fechas como {$fecha, $hora, $ms}), comprueba
   AQUÍ la firma de cada fila de «Autorizaciones» con la clave del sello (que nunca sale del script: al
   volcado va solo el veredicto; ver «las firmas, comprobadas aquí»), arma el
   volcado EN MEMORIA —no crea ningún archivo en Drive— y lo manda por HTTPS a la función
   `importar-diario` de Supabase con el secreto en una cabecera. La función lo pasa a la base en una
   sola transacción, cuadra por folio y anota el resultado (Ajustes → Supabase lo enseña). Esta hoja
   NO se escribe: solo se lee, con el candado del puente puesto mientras se lee (para no leer una
   subida a medias) y soltado antes de mandar.

   Lo que deja en el registro (Ejecuciones): una línea con cuentas —aplicada o no, cuadra o no,
   cuántas ventas, diferencias y conflictos—. Nunca un nombre, un teléfono ni un importe.

   CÓMO SE INSTALA (una vez; los pasos completos están en supabase/README.md, «La copia diaria»):
     1. Extensiones → Apps Script → «+» → Secuencia de comandos, nómbrala «Copia diaria» y pega
        este archivo entero. Guardar.
     2. Configuración del proyecto (el engrane) → Propiedades de la secuencia de comandos → agregar:
          IMPORTAR_URL      https://<ref del proyecto>.supabase.co/functions/v1/importar-diario
          IMPORTAR_SECRETO  el mismo valor que se puso en los Secrets de la función (32+ caracteres)
     3. Elige copiarHojaASupabase y «Ejecutar» una vez (la primera vez pide permiso para conectarse
        a un servicio externo). El registro dice cómo salió.
     4. Elige instalarCopiaDiaria y «Ejecutar»: queda programada todos los días entre 3 y 4 de la
        mañana, hora de México. quitarCopiaDiaria la quita.
   Si falta una propiedad, no hace nada y lo dice. Los nombres de aquí empiezan con «copia» o
   «Copia» para no chocar con nada de Código.gs (pruebas/supabase-importar-diario.mjs lo vigila).
   ========================================================================================= */

var COPIA_PROP_SECRETO = 'IMPORTAR_SECRETO';
var COPIA_PROP_URL = 'IMPORTAR_URL';
var COPIA_SECRETO_MIN = 32;
var COPIA_FUNCION = 'copiarHojaASupabase';
var COPIA_HORA = 3;                       // de 3 a 4 de la mañana (Google la corre en algún momento de esa hora)
var COPIA_ZONA = 'America/Mexico_City';
var COPIA_CABECERA = 'x-importar-secreto';
/* Las mismas pestañas que VOLCADO_PESTANAS de volcado-para-importar.gs (la prueba vigila que sigan iguales). */
var COPIA_PESTANAS = ['Ventas', 'Abonos comisión', 'Accesos', 'Autorizaciones', 'Solicitudes de autorización',
  'Almacén', 'Catálogo de material', 'Listas de compra', 'Bitácora del puente', 'Ventas (respaldo)',
  'Ventas (antes de realinear)'];

/** La copia: arma el volcado y lo manda. La llama el disparador diario y se puede correr a mano. */
function copiarHojaASupabase() {
  var conf = copiaConfiguracion_();
  if (!conf.ok) return copiaAnotar_('no se hizo nada: ' + conf.mensaje);

  var candado = LockService.getScriptLock();
  try { candado.waitLock(60000); }
  catch (e) { return copiaAnotar_('no se hizo nada: la hoja estuvo ocupada con otra escritura más de un minuto. Córrela a mano en un rato.'); }
  var volcado;
  try { volcado = copiaArmarVolcado_(); }
  finally { candado.releaseLock(); }

  var ventas = Math.max(0, ((volcado.pestanas['Ventas'] || []).length) - 1);
  var cabeceras = {};
  cabeceras[COPIA_CABECERA] = conf.secreto;
  var inicio = Date.now(), r;
  try {
    r = UrlFetchApp.fetch(conf.url, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(volcado),
      headers: cabeceras, muteHttpExceptions: true, followRedirects: false
    });
  } catch (e) {
    return copiaAnotar_('la función no contestó (' + String((e && e.message) || e).slice(0, 80) + '). Se vuelve a intentar mañana, o córrela a mano.');
  }
  var segundos = Math.round((Date.now() - inicio) / 100) / 10;
  var codigo = r.getResponseCode(), c = null;
  try { c = JSON.parse(r.getContentText()); } catch (e) { c = null; }
  return copiaAnotar_(copiaLinea_(codigo, c, ventas, segundos));
}

/** Programa la copia todos los días entre 3 y 4 de la mañana, hora de México. Si ya estaba, la deja una sola vez. */
function instalarCopiaDiaria() {
  var conf = copiaConfiguracion_();
  if (!conf.ok) return copiaAnotar_('no se programó: ' + conf.mensaje + ' Ponlas primero y vuelve a correr esto.');
  copiaQuitarDisparadores_();
  ScriptApp.newTrigger(COPIA_FUNCION).timeBased().atHour(COPIA_HORA).everyDays(1).inTimezone(COPIA_ZONA).create();
  return copiaAnotar_('programada: todos los días entre las ' + COPIA_HORA + ' y las ' + (COPIA_HORA + 1) + ' de la mañana (hora de México).');
}

/** Quita la copia programada (solo la suya: los demás disparadores de la hoja no se tocan). */
function quitarCopiaDiaria() {
  var n = copiaQuitarDisparadores_();
  return copiaAnotar_(n ? 'ya no está programada (' + n + ' disparador' + (n === 1 ? '' : 'es') + ' quitado' + (n === 1 ? '' : 's') + ').' : 'no estaba programada.');
}

/* ---------------------------------------------------------------- ayudantes */

function copiaConfiguracion_() {
  var props = PropertiesService.getScriptProperties();
  var secreto = String(props.getProperty(COPIA_PROP_SECRETO) || '');
  var url = String(props.getProperty(COPIA_PROP_URL) || '').trim();
  var faltan = [];
  if (!copiaUrlValida_(url)) faltan.push(COPIA_PROP_URL + ' (https://<proyecto>.supabase.co/functions/v1/importar-diario)');
  if (secreto.length < COPIA_SECRETO_MIN) faltan.push(COPIA_PROP_SECRETO + ' (' + COPIA_SECRETO_MIN + ' caracteres o más)');
  if (faltan.length) return { ok: false, mensaje: 'falta o no sirve en las propiedades del script: ' + faltan.join(', ') + '.' };
  return { ok: true, url: url, secreto: secreto };
}

/* Solo la función de un proyecto de Supabase: el volcado lleva todos los datos de la hoja y no sale a ningún otro lado. */
function copiaUrlValida_(url) {
  return /^https:\/\/[a-z0-9]{10,40}\.supabase\.co\/functions\/v1\/importar-diario$/.test(String(url || ''));
}

/** El volcado, como volcarParaImportar (puente/volcado-para-importar.gs) pero sin pasar por Drive, y con la comprobación de
 *  las firmas de «Autorizaciones» hecha aquí (copiaComprobarAutorizaciones_). Solo lee. */
function copiaArmarVolcado_() {
  var libro = SpreadsheetApp.getActive();
  var zona = libro.getSpreadsheetTimeZone();
  var pestanas = {}, autorizaciones = [];
  COPIA_PESTANAS.forEach(function (nombre) {
    var h = libro.getSheetByName(nombre);
    if (!h) return;
    var filas = h.getLastRow(), cols = h.getLastColumn();
    if (filas < 1 || cols < 1) { pestanas[nombre] = []; return; }
    var valores = h.getRange(1, 1, filas, cols).getValues();
    if (nombre === COPIA_PESTANA_AUT) autorizaciones = valores;     // las celdas TAL CUAL, antes de volverlas JSON: así las lee /verificar
    pestanas[nombre] = valores.map(function (fila) {
      return fila.map(function (v) { return copiaCelda_(v, zona); });
    });
  });
  var props = PropertiesService.getScriptProperties();
  return {
    formato: 'al3d-volcado', version: 1,
    hecho: new Date().toISOString(),
    zona: zona,
    libro: libro.getName(),
    puente_version: (typeof PUENTE_VERSION === 'string') ? PUENTE_VERSION : '',
    almacen_secuencia: Number(props.getProperty('ALMACEN_SECUENCIA') || 0) || 0,
    pestanas: pestanas,
    autorizaciones_comprobadas: copiaComprobarAutorizaciones_(autorizaciones)
  };
}

/* ---------------------------------------------------------------- las firmas, comprobadas aquí
   Decidido el 2026-10-17 para que Elías no tenga que mover secretos: la CLAVE DEL SELLO (propiedad SELLO_AUTORIZACION) no sale
   de este script. Cada fila de «Autorizaciones» se comprueba AQUÍ, con la clave, y al volcado va solo el veredicto:
       { fila, firma_ok: true,  codificacion: 'ascii-?', canon: <el texto que se firmó> }
       { fila, firma_ok: false, motivo: 'firma_no_coincide' | 'codigo_no_coincide' | 'no_se_pudo_comprobar' }
   NUNCA la clave. La función importar-diario lo cree (solo ella, con el secreto comprobado) y el importador guarda la fila tal
   cual se firmó: entra solo si `canon` es EXACTAMENTE el texto que sale de la fila que va a la base.

   Con qué se comprueba: con las MISMAS funciones de Código.gs que usa /verificar (rutaVerificar_), llamadas desde aquí porque en
   Apps Script todos los archivos de un proyecto comparten el ámbito global (el guion bajo final solo las esconde del menú
   «Ejecutar» y de google.script.run, no de otro archivo): registroDeFila(v) → firmar(r, secretoDelSello_(false)), y las dos
   comparaciones de rutaVerificar_ (la firma guardada, y el código impreso contra el de la firma). No se llama rutaVerificar_
   misma porque gasta el cupo público de /verificar, busca por folio y código (el ÚLTIMO renglón que coincide, no esta fila) y no
   dice por qué no cuadra. secretoDelSello_(false): si no hay clave NO se crea una (crearla es cosa de autorizar).
   La codificación siempre es 'ascii-?': firmar() llama Utilities.computeHmacSha256Signature con dos String, que pasa texto y
   clave a US-ASCII con un «?» por cada carácter que no lo sea (hecho comprobado el 2026-10-10, pruebas/datos/
   hmac-apps-script-real.json). Toda fila de esta pestaña la escribió autorizar() de Código.gs, así que no se prueba UTF-8. */
var COPIA_PESTANA_AUT = 'Autorizaciones';
var COPIA_CODIFICACION = 'ascii-?';

function copiaComprobarAutorizaciones_(valores) {
  var out = { version: 1, filas: [] };
  if (!copiaHayNotario_()) { out.sin = 'codigo'; return out; }
  var secreto = secretoDelSello_(false);
  if (!secreto) { out.sin = 'clave'; return out; }
  for (var i = 1; i < (valores || []).length; i++) {
    var v = valores[i];
    var folio = v[A_FOLIO];
    if (folio === '' || folio === null || folio === undefined) continue;    // como el importador: sin folio no es una autorización
    out.filas.push(copiaVeredicto_(v, i + 1, secreto));
  }
  return out;
}

/* Una fila: lo que contestaría rutaVerificar_ a quien trae el papel de ESTA fila. Nada de la clave ni de la firma recalculada sale de aquí. */
function copiaVeredicto_(v, fila, secreto) {
  try {
    var r = registroDeFila(v);
    var firma = firmar(r, secreto);
    if (firma !== String(v[A_FIRMA])) return { fila: fila, firma_ok: false, motivo: 'firma_no_coincide' };
    if (normalizarCodigo(codigoDe(firma)) !== normalizarCodigo(v[A_CODIGO])) return { fila: fila, firma_ok: false, motivo: 'codigo_no_coincide' };
    return { fila: fila, firma_ok: true, codificacion: COPIA_CODIFICACION, canon: canonDe(r) };
  } catch (e) {
    return { fila: fila, firma_ok: false, motivo: 'no_se_pudo_comprobar' };
  }
}

/* ¿Está Código.gs en este proyecto? Sin él (por ejemplo, este archivo pegado en otra hoja) no se comprueba nada y se dice. */
function copiaHayNotario_() {
  return typeof registroDeFila === 'function' && typeof firmar === 'function' && typeof secretoDelSello_ === 'function' &&
    typeof codigoDe === 'function' && typeof normalizarCodigo === 'function' && typeof canonDe === 'function' &&
    typeof A_FOLIO === 'number' && typeof A_FIRMA === 'number' && typeof A_CODIGO === 'number';
}

function copiaCelda_(v, zona) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return { $fecha: Utilities.formatDate(v, zona, 'yyyy-MM-dd'), $hora: Utilities.formatDate(v, zona, 'HH:mm'), $ms: v.getTime() };
  }
  return v;
}

/* La línea del registro: solo cuentas y códigos. Lo que contestó la función se lee campo por campo, nunca se copia entero. */
function copiaLinea_(codigo, c, ventas, segundos) {
  var n = function (x) { return (typeof x === 'number' && isFinite(x)) ? x : 0; };
  if (codigo === 200 && c && c.ok === true) {
    var partes = [c.aplicado ? 'aplicada' : 'NO se aplicó (el plan trae conflictos o filas que no entran: lo decide una persona)',
      c.cuadra ? 'CUADRA' : 'no cuadra', n(c.ventas) + ' ventas', n(c.diferencias) + ' diferencias', n(c.conflictos) + ' conflictos'];
    if (n(c.rechazos)) partes.push(n(c.rechazos) + ' filas que no entran');
    var a = (c.autorizaciones && typeof c.autorizaciones === 'object') ? c.autorizaciones : null;
    if (a) partes.push(n(a.comprobadas) + ' autorizaciones con firma buena' + (n(a.no_entran) ? ' (' + n(a.no_entran) + ' no entran: sus filas, en cuadre_diario)' : ''));
    return partes.join(' · ') + ' · ' + segundos + ' s. El detalle, en Ajustes → Supabase.';
  }
  var cod = (c && typeof c.codigo === 'string' && /^[A-Z_]{2,40}$/.test(c.codigo)) ? ' ' + c.codigo : '';
  var pista = codigo === 401 ? ' El secreto no coincide con el de la función.'
    : codigo === 503 ? ' A la función le falta su configuración (IMPORTAR_SECRETO o la base).'
    : codigo === 409 ? ' Ya había otra copia corriendo.'
    : codigo === 404 ? ' La dirección no es la de la función (¿ya está desplegada?).' : '';
  return 'la función contestó ' + codigo + cod + ' (' + ventas + ' ventas mandadas, ' + segundos + ' s).' + pista;
}

function copiaAnotar_(texto) {
  var linea = 'Copia diaria (' + Utilities.formatDate(new Date(), COPIA_ZONA, 'yyyy-MM-dd HH:mm') + '): ' + texto;
  Logger.log(linea);
  return linea;
}

function copiaQuitarDisparadores_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === COPIA_FUNCION) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}
