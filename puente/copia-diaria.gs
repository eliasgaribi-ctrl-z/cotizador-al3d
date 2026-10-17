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
     5. Elige instalarRespaldoSemanal y «Ejecutar» una vez: el respaldo semanal de la base a Drive (abajo, «EL
        RESPALDO SEMANAL»). Hace el primero en ese momento; si Google pide permiso de Drive, aceptarlo.
   Si falta una propiedad, no hace nada y lo dice. Los nombres de aquí empiezan con «copia» o «Copia» (o son las
   seis que se eligen en el editor) para no chocar con nada de Código.gs (pruebas/supabase-importar-diario.mjs lo
   vigila). Las funciones del sello sí son las de Código.gs, a propósito (ver «las firmas, comprobadas aquí»).
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

function copiaQuitarDisparadores_(funcion) {
  var n = 0, cual = funcion || COPIA_FUNCION;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === cual) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/* =========================================================================================
   EL RESPALDO SEMANAL DE LA BASE → DRIVE (decidido el 2026-10-17 para que Elías no tenga que mover secretos)

   Lo de arriba solo LEE la hoja y no toca Drive. Esto es otra cosa: no lee la hoja; le pide a la función
   `importar-diario` la base entera de Supabase y la guarda como un archivo JSON en Drive. Antes lo iba a subir
   la función `respaldo` con una cuenta de servicio de Google, que Elías tendría que crear y cargar; así, con el
   MISMO secreto de la copia (IMPORTAR_URL e IMPORTAR_SECRETO, ya puestos) y el permiso de Drive que la hoja ya
   tiene (Código.gs ya usa DriveApp para «Trabajos Pendientes»), no hay que crear nada.

   respaldarSemanal(): pide el respaldo (POST con el secreto en la cabecera y { formato: 'al3d-pedir-respaldo' }),
   comprueba que llegó entero (los bytes y la huella sha256 que manda la función, y que empieza como un respaldo),
   lo guarda en la carpeta «AL3D Respaldos» y deja ahí los 8 más recientes: los demás que ESTE script creó (nombre
   al3d-respaldo-AAAA-MM-DDTHHMMSSZ.json Y la descripción COPIA_RESPALDO_MARCA) van a la PAPELERA de Drive (se
   recuperan ahí; en una unidad compartida se vacía sola a los 30 días). Un archivo que alguien dejó a mano en la
   carpeta, aunque se llame igual, no se toca.

   La carpeta, por nombre (no hay que pegar ningún id): primero una UNIDAD COMPARTIDA que se llame «AL3D Respaldos»
   (la que creó Elías; se busca con la API de Drive y el permiso de la hoja), si no, una carpeta con ese nombre en
   cualquier unidad, y si no hay ninguna, se crea una carpeta «AL3D Respaldos» en Mi unidad (y el registro lo dice).

   El respaldo lleva datos de clientes: NUNCA va al registro. Al registro va una línea con el nombre del archivo,
   cuántos KB y filas, dónde quedó y cuántos fueron a la papelera.
   Tamaño: UrlFetchApp no recibe más de 50 MB y un Blob tampoco pasa de ahí; la función se niega arriba de 45 MB
   (RESPALDO_GRANDE) y ese día toca la alternativa de la cuenta de servicio (supabase/README.md). Hoy son KB.

   CÓMO SE INSTALA: elegir instalarRespaldoSemanal y «Ejecutar» una vez. Programa el respaldo los domingos entre
   5 y 6 de la mañana (hora de México; la copia diaria corre de 3 a 4) y hace el primero en ese momento, para ver
   que funciona. Si Google pide permiso de Drive, aceptarlo. quitarRespaldoSemanal lo quita (solo el suyo).
   ========================================================================================= */

var COPIA_RESPALDO_FUNCION = 'respaldarSemanal';
var COPIA_RESPALDO_HORA = 5;                  // de 5 a 6 de la mañana, los domingos (la copia diaria es de 3 a 4)
var COPIA_RESPALDO_CARPETA = 'AL3D Respaldos';
var COPIA_RESPALDO_CONSERVAR = 8;             // decidido por Elías el 2026-10-16: los 8 más recientes
var COPIA_RESPALDO_PATRON = /^al3d-respaldo-\d{4}-\d{2}-\d{2}T\d{6}Z\.json$/;
var COPIA_RESPALDO_MARCA = 'al3d-respaldo-semanal: lo creó puente/copia-diaria.gs (respaldarSemanal); la rotación solo toca los que llevan esta marca';
var COPIA_RESPALDO_TOPE = 45 * 1024 * 1024;
var COPIA_RESPALDO_INICIO = '{"formato":"al3d-respaldo-1"';
var COPIA_RESPALDO_PERMISOS = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/script.external_request'];
var COPIA_DRIVE_API = 'https://www.googleapis.com/drive/v3/';

/** El respaldo de la semana. Lo llama el disparador de los domingos y se puede correr a mano. */
function respaldarSemanal() {
  return copiaRespaldar_();
}

/** Programa el respaldo los domingos de 5 a 6 de la mañana (hora de México) y hace el primero ahora. */
function instalarRespaldoSemanal() {
  var conf = copiaConfiguracion_();
  if (!conf.ok) return copiaRespaldoAnotar_('no se programó: ' + conf.mensaje + ' Ponlas primero y vuelve a correr esto.');
  /* Con la pantalla de permisos por casillas, Google solo vuelve a preguntar si se lo piden (como autorizarDrive de Código.gs). Si ya
     están, no hace nada; si falta uno, Google enseña la pantalla de permisos y hay que volver a correr esto. Sin try: es lo que la abre. */
  if (typeof ScriptApp.requireScopes === 'function') ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, COPIA_RESPALDO_PERMISOS);
  copiaQuitarDisparadores_(COPIA_RESPALDO_FUNCION);
  ScriptApp.newTrigger(COPIA_RESPALDO_FUNCION).timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(COPIA_RESPALDO_HORA).inTimezone(COPIA_ZONA).create();
  var primero = copiaRespaldar_();
  return copiaRespaldoAnotar_('programado: los domingos entre las ' + COPIA_RESPALDO_HORA + ' y las ' + (COPIA_RESPALDO_HORA + 1) +
    ' de la mañana (hora de México). El de hoy: ' + primero.replace(/^Respaldo semanal \([^)]*\): /, ''));
}

/** Quita el respaldo programado (solo el suyo). */
function quitarRespaldoSemanal() {
  var n = copiaQuitarDisparadores_(COPIA_RESPALDO_FUNCION);
  return copiaRespaldoAnotar_(n ? 'ya no está programado (' + n + ' disparador' + (n === 1 ? '' : 'es') + ' quitado' + (n === 1 ? '' : 's') + ').' : 'no estaba programado.');
}

/* ---------------------------------------------------------------- ayudantes del respaldo */

function copiaRespaldar_() {
  var conf = copiaConfiguracion_();
  if (!conf.ok) return copiaRespaldoAnotar_('no se hizo: ' + conf.mensaje);
  var cab = {};
  cab[COPIA_CABECERA] = conf.secreto;
  var r;
  try {
    r = UrlFetchApp.fetch(conf.url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ formato: 'al3d-pedir-respaldo', version: 1 }),
      headers: cab, muteHttpExceptions: true, followRedirects: false });
  } catch (e) {
    return copiaRespaldoAnotar_('la función no contestó (' + String((e && e.message) || e).slice(0, 80) + '). Se vuelve a intentar el domingo, o córrelo a mano.');
  }
  var codigo = r.getResponseCode();
  if (codigo !== 200) {
    var c = null;
    try { c = JSON.parse(r.getContentText()); } catch (e) { c = null; }
    var cod = (c && typeof c.codigo === 'string' && /^[A-Z_]{2,40}$/.test(c.codigo)) ? ' ' + c.codigo : '';
    var pista = codigo === 401 ? ' El secreto no coincide con el de la función.'
      : codigo === 400 ? ' ¿Ya se pegó en el panel la versión de importar-diario que sabe dar el respaldo (2026-10-17)?'
      : codigo === 413 ? ' La base pasa de 45 MB: toca la alternativa de la función respaldo (supabase/README.md).'
      : codigo === 503 ? ' A la función le falta su configuración.' : '';
    return copiaRespaldoAnotar_('la función contestó ' + codigo + cod + ': no se guardó nada.' + pista);
  }

  /* Que llegó entero y que es un respaldo: los bytes y la huella que dice la función, y cómo empieza. Nada de su contenido sale de aquí. */
  var h = copiaCabeceras_(r.getHeaders());
  var bytes = r.getContent();
  var nombre = String(h['x-respaldo-nombre'] || '');
  if (!COPIA_RESPALDO_PATRON.test(nombre)) nombre = 'al3d-respaldo-' + new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '') + '.json';
  var problema = !bytes || !bytes.length ? 'llegó vacío'
    : bytes.length > COPIA_RESPALDO_TOPE ? 'pasa de 45 MB'
    : String(bytes.length) !== String(h['x-respaldo-bytes'] || '') ? 'no llegó entero (' + bytes.length + ' bytes de ' + String(h['x-respaldo-bytes'] || '?').slice(0, 12) + ')'
    : copiaHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== String(h['x-respaldo-sha256'] || '') ? 'su huella sha256 no coincide'
    : copiaInicio_(bytes, COPIA_RESPALDO_INICIO.length) !== COPIA_RESPALDO_INICIO ? 'no es un respaldo «al3d-respaldo-1»' : '';
  if (problema) return copiaRespaldoAnotar_('la función contestó 200 pero el archivo ' + problema + ': no se guardó nada.');

  var carpeta;
  try { carpeta = copiaRespaldoCarpeta_(); }
  catch (e) { return copiaRespaldoAnotar_('no se pudo abrir la carpeta «' + COPIA_RESPALDO_CARPETA + '» (' + String((e && e.message) || e).slice(0, 120) + '): no se guardó nada. ¿Falta el permiso de Drive? Corre instalarRespaldoSemanal a mano.'); }
  var archivo;
  try {
    archivo = carpeta.carpeta.createFile(Utilities.newBlob(bytes, 'application/json', nombre));
    archivo.setDescription(COPIA_RESPALDO_MARCA);
  } catch (e) { return copiaRespaldoAnotar_('Drive no aceptó el archivo (' + String((e && e.message) || e).slice(0, 120) + ').'); }

  var rot = copiaRespaldoRotar_(carpeta.carpeta, archivo.getId(), nombre);
  var filas = Number(h['x-respaldo-filas']);
  return copiaRespaldoAnotar_('guardado ' + nombre + ' en «' + COPIA_RESPALDO_CARPETA + '» (' + carpeta.donde + ') · ' + Math.max(1, Math.round(bytes.length / 1024)) + ' KB · ' +
    (isFinite(filas) ? filas : '?') + ' filas · ' + rot);
}

/* La carpeta «AL3D Respaldos»: la unidad compartida con ese nombre; si no, una carpeta con ese nombre (en cualquier unidad); si no, se crea
   en Mi unidad. Si Drive no deja buscar, lanza (y no se crea nada: una búsqueda que falla no es «no existe»). */
function copiaRespaldoCarpeta_() {
  var token = ScriptApp.getOAuthToken();
  var nombre = COPIA_RESPALDO_CARPETA.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var unidades = copiaDriveLista_(COPIA_DRIVE_API + 'drives?pageSize=10&fields=' + encodeURIComponent('drives(id,name)') +
    '&q=' + encodeURIComponent("name = '" + nombre + "'"), token, 'drives');
  if (unidades.length) {
    return { carpeta: DriveApp.getFolderById(unidades[0].id), donde: 'unidad compartida' + (unidades.length > 1 ? ', la primera de ' + unidades.length + ' con ese nombre' : '') };
  }
  var carpetas = copiaDriveLista_(COPIA_DRIVE_API + 'files?pageSize=10&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=' +
    encodeURIComponent('files(id,name,driveId)') + '&q=' + encodeURIComponent("name = '" + nombre + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"), token, 'files');
  if (carpetas.length) {
    return { carpeta: DriveApp.getFolderById(carpetas[0].id), donde: carpetas[0].driveId ? 'carpeta dentro de una unidad compartida' : 'carpeta de Mi unidad' };
  }
  return { carpeta: DriveApp.createFolder(COPIA_RESPALDO_CARPETA), donde: 'Mi unidad: no había una unidad compartida ni una carpeta con ese nombre, así que se creó' };
}

function copiaDriveLista_(url, token, campo) {
  var r = UrlFetchApp.fetch(url, { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true, followRedirects: false });
  var codigo = r.getResponseCode(), d = null;
  try { d = JSON.parse(r.getContentText()); } catch (e) { d = null; }
  if (codigo !== 200 || !d || !Array.isArray(d[campo])) throw new Error('Drive contestó ' + codigo + ' al buscarla');
  return d[campo].filter(function (x) { return x && typeof x.id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(x.id); });
}

/* Deja los COPIA_RESPALDO_CONSERVAR más recientes de los que creó este script (nombre con su patrón Y su marca); el recién guardado siempre
   se queda. Lo que sobra va a la papelera. Nunca lanza: si falla, el respaldo ya está guardado y se dice. */
function copiaRespaldoRotar_(carpeta, idNuevo, nombreNuevo) {
  try {
    var nuestros = [], it = carpeta.getFiles(), vistos = 0;
    while (it.hasNext() && vistos < 5000) {
      var f = it.next(); vistos++;
      if (f.getId() === idNuevo || f.isTrashed()) continue;
      if (!COPIA_RESPALDO_PATRON.test(f.getName()) || f.getDescription() !== COPIA_RESPALDO_MARCA) continue;
      nuestros.push(f);
    }
    nuestros.sort(function (a, b) { return a.getName() < b.getName() ? 1 : a.getName() > b.getName() ? -1 : 0; });   // del más nuevo al más viejo
    var sobran = nuestros.slice(Math.max(0, COPIA_RESPALDO_CONSERVAR - 1)), fallos = 0;
    sobran.forEach(function (f) { try { f.setTrashed(true); } catch (e) { fallos++; } });
    return 'se quedan ' + Math.min(COPIA_RESPALDO_CONSERVAR, nuestros.length + 1) + ' respaldos; a la papelera: ' + (sobran.length - fallos) +
      (fallos ? ' (' + fallos + ' no se dejaron mandar)' : '') + '.';
  } catch (e) {
    return 'el respaldo quedó guardado, pero no se pudo revisar la carpeta para mandar los viejos a la papelera (' + String((e && e.message) || e).slice(0, 80) + ').';
  }
}

/* Las cabeceras de la respuesta, con el nombre en minúsculas (Apps Script las da como vienen). Solo las del respaldo. */
function copiaCabeceras_(h) {
  var o = {};
  Object.keys(h || {}).forEach(function (k) { if (/^x-respaldo-/i.test(k)) o[k.toLowerCase()] = String(h[k]); });
  return o;
}

/* Bytes con signo (como los da Apps Script) a hexadecimal en minúsculas. */
function copiaHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = (bytes[i] + 256) % 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}

/* Los primeros n bytes como texto ASCII (para ver que empieza como un respaldo, sin leer lo demás). */
function copiaInicio_(bytes, n) {
  var s = '';
  for (var i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode((bytes[i] + 256) % 256);
  return s;
}

function copiaRespaldoAnotar_(texto) {
  var linea = 'Respaldo semanal (' + Utilities.formatDate(new Date(), COPIA_ZONA, 'yyyy-MM-dd HH:mm') + '): ' + texto;
  Logger.log(linea);
  return linea;
}
