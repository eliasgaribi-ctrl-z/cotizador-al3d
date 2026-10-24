/* ============================================================================
   VOLCADO PARA IMPORTAR — se pega en la COPIA de la hoja, nunca en la original.

   Qué hace. Lee con getValues() las pestañas que el importador necesita y deja en tu Drive un
   archivo «al3d-volcado-<fecha>.json». No escribe nada en la hoja. Después ese archivo se le da a
   scripts/importar-hoja.mjs (ver scripts/importador/LEEME.md).

   Cómo se usa (una vez, en la copia):
     1. En la COPIA de «Finanzas AL3D»: Extensiones → Apps Script → «+» → Secuencia de comandos,
        nómbrala «Volcado» y pega este archivo.
     2. Elige la función volcarParaImportar y dale «Ejecutar». La primera vez pide permiso para
        crear un archivo en tu Drive.
     3. El registro de ejecución dice el nombre del archivo que dejó.

   Por qué getValues() y no la API de Sheets. Devuelve los números crudos (la API en modo
   formateado devuelve «$1,234.50» y eso rompe los importes firmados) y las fechas como fechas.
   Las fechas se escriben en la zona de la hoja como {$fecha, $hora, $ms}: JSON no tiene fechas.

   No lee ninguna llave: de las propiedades del script solo saca ALMACEN_SECUENCIA (un número) y
   la versión del puente, para sembrar los contadores.
   ============================================================================ */

var VOLCADO_PESTANAS = ['Ventas', 'Abonos comisión', 'Accesos', 'Autorizaciones', 'Solicitudes de autorización',
  'Almacén', 'Catálogo de material', 'Listas de compra', 'Bitácora del puente', 'Ventas (respaldo)',
  'Ventas (antes de realinear)', 'Tarifas', 'Gastos'];

function volcarParaImportar() {
  var libro = SpreadsheetApp.getActive();
  var zona = libro.getSpreadsheetTimeZone();
  var pestanas = {};
  VOLCADO_PESTANAS.forEach(function (nombre) {
    var h = libro.getSheetByName(nombre);
    if (!h) return;
    var filas = h.getLastRow(), cols = h.getLastColumn();
    if (filas < 1 || cols < 1) { pestanas[nombre] = []; return; }
    pestanas[nombre] = h.getRange(1, 1, filas, cols).getValues().map(function (fila) {
      return fila.map(function (v) { return volcadoCelda_(v, zona); });
    });
  });
  var props = PropertiesService.getScriptProperties();
  var volcado = {
    formato: 'al3d-volcado', version: 1,
    hecho: new Date().toISOString(),
    zona: zona,
    libro: libro.getName(),
    puente_version: (typeof PUENTE_VERSION === 'string') ? PUENTE_VERSION : '',
    almacen_secuencia: Number(props.getProperty('ALMACEN_SECUENCIA') || 0) || 0,
    pestanas: pestanas
  };
  var nombre = 'al3d-volcado-' + Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd-HHmm') + '.json';
  var archivo = DriveApp.createFile(nombre, JSON.stringify(volcado), 'application/json');
  Logger.log('Listo: «' + nombre + '» en tu Drive (' + archivo.getUrl() + ').');
  return nombre;
}

function volcadoCelda_(v, zona) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return { $fecha: Utilities.formatDate(v, zona, 'yyyy-MM-dd'), $hora: Utilities.formatDate(v, zona, 'HH:mm'), $ms: v.getTime() };
  }
  return v;
}
