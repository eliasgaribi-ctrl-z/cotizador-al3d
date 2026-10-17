/* =========================================================================================
   COPIA DIARIA HOJA → SUPABASE — se pega como un ARCHIVO NUEVO del proyecto de Apps Script de la
   hoja REAL «Finanzas AL3D — Ventas y Comisiones», junto a Código.gs. No cambia nada de Código.gs.

   Para qué. Decidido por Elías el 2026-10-16: el equipo sigue capturando directo en la hoja, así que
   cada madrugada esta hoja se copia ENTERA a la base de Supabase (la nube) y se cuadra. Cuando
   Ajustes diga 7 días seguidos cuadrando, Elías decide el día: última copia, la hoja a solo lectura
   y el equipo pasa a la plataforma. Hasta ese día la hoja sigue mandando: lo que la nube tenga
   distinto se pisa con lo de la hoja en la copia siguiente.

   Qué hace copiarHojaASupabase(): lee las pestañas que necesita el importador (las mismas que
   puente/volcado-para-importar.gs, con getValues() y las fechas como {$fecha, $hora, $ms}), arma el
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

/** El volcado, como volcarParaImportar (puente/volcado-para-importar.gs) pero sin pasar por Drive. Solo lee. */
function copiaArmarVolcado_() {
  var libro = SpreadsheetApp.getActive();
  var zona = libro.getSpreadsheetTimeZone();
  var pestanas = {};
  COPIA_PESTANAS.forEach(function (nombre) {
    var h = libro.getSheetByName(nombre);
    if (!h) return;
    var filas = h.getLastRow(), cols = h.getLastColumn();
    if (filas < 1 || cols < 1) { pestanas[nombre] = []; return; }
    pestanas[nombre] = h.getRange(1, 1, filas, cols).getValues().map(function (fila) {
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
    pestanas: pestanas
  };
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
