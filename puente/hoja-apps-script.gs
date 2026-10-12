/**
 * Finanzas AL3D — mejoras: tipo de producto, antigüedad de cobranza,
 * historial de abonos, gráficas, resumen semanal por correo y diseño.
 *
 * Ejecutar  mejorarTodo.  Es idempotente: se puede volver a correr sin romper nada.
 * Lee los datos de la propia hoja, no trae ninguna copia dentro.
 */

var FIN     = 310;
var MONEDA  = '"$"#,##0.00';
var FECHA   = 'dd/mm/yyyy';
var AZUL    = '#1c3d6e';
var AZULC   = '#dde6f4';
var SLATE   = '#5b7fa6';
var GRISF   = '#f7f9fc';
var FUENTE  = 'Roboto';
var CORREO  = 'eliasgaribi@gmail.com';
var ABONOS  = 'Abonos comisión';

var HEAD = ['Folio', 'Proyecto', 'Estatus', 'Cuenta', 'Tipo de trabajo', 'IVA', 'Subtotal',
            'Precio neto', 'Anticipo', 'Liquidación', 'Saldo por cobrar',
            'Fecha anticipo', 'Fecha instalación', 'Fecha liquidación', 'Días de cobro',
            'Días de antigüedad', 'Antigüedad', 'Comisión 10%', 'Abono comisión',
            'Comisión pendiente', 'Pagos de comisión', 'Año', 'Mes', 'Revisar'];

/* columnas calculadas: encabezado en otro tono para que se note que no se capturan */
var CALC = ['A', 'H', 'K', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'];

var CUENTAS = ['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
var COLOR_CUENTA = {          // [fondo, texto] del chip de cada cuenta
  'Elias BBVA':  ['#d7e3fc', '#1155cc'],
  'Constru BNT': ['#fce4e4', '#b10e1e'],
  'Moni MPago':  ['#ede3f7', '#6b3fa0'],
  'Rul HSBC':    ['#d9f0ec', '#0b6b63'],
  'Tatis BNT':   ['#ffebd1', '#9a5b00']
};
var ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];
var TIPOS   = ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion',
               'Letras 3D con iluminacion', 'Letras 3D sin iluminacion',
               'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'];
var RANGOS  = ['0-30 días', '31-60 días', '61-90 días', 'Más de 90 días'];

/* --- rangos --- */
function L(c) { return '$' + c + '$2:$' + c + '$' + FIN; }                 // dentro de Ventas
function V(c) { return 'Ventas!$' + c + '$2:$' + c + '$' + FIN; }          // desde otra hoja
var vA = V('A'), vB = V('B'), vC = V('D'), vD = V('C'), vE = V('E'), vG = V('G'),
    vH = V('H'), vI = V('I'), vJ = V('J'), vK = V('K'), vL = V('L'), vN = V('N'),
    vO = V('O'), vP = V('P'), vQ = V('Q'), vR = V('R'), vS = V('S'), vT = V('T'),
    vV = V('V'), vW = V('W');
var NOB = vB + ',"<>"';

/* ============================ PRINCIPAL ============================ */
function mejorarTodo() {
  var ss = SpreadsheetApp.getActive();
  var ventas = ss.getSheetByName('Ventas');
  if (!ventas) throw new Error('No encuentro la pestaña "Ventas".');

  /* Lo que toca los DATOS de Ventas va con el candado del puente: fijarFolios reparte folios
     de la misma marca que /empujar, y ordenarVentas mueve filas. Sin candado, una subida que
     llega a la mitad escribe en la fila que el reacomodo acaba de mover. El diseño y las
     vistas no mueven datos y van fuera, para no tener al puente esperando medio minuto. */
  conCandado(function () {
    /* La marca de folios se siembra ANTES de rehacer el respaldo: sembrada después, ya no
       veía las ventas borradas desde el respaldo anterior y podía repartir otra vez el folio
       más alto. */
    try {
      var pr = PropertiesService.getScriptProperties();
      if (!Number(pr.getProperty(PROP_FOLIO))) pr.setProperty(PROP_FOLIO, String(Math.max(0, marcaDeFolios(ventas))));
    } catch (e) { /* sin propiedades, fijarFolios siembra como antes */ }
    respaldar(ss, ventas);
    var historicos = leerAbonosViejos(ventas);
    fijarFolios(ventas);
    agregarColumnas(ventas);
    crearAbonos(ss, historicos);
    formulasVentas(ventas);
    clasificarTipos(ventas);
    normalizarIvaActivos(ventas);   // la cuenta manda el IVA: realinea lo que sigue abierto
    ordenarVentas(ventas);
  });
  disenoVentas(ventas);

  tablero(ss);
  vistas(ss);
  cobranza(ss);
  comisiones(ss);
  graficas(ss);
  instalarTriggers();   // el orden de las pestañas se deja como tú lo dejaste
  prepararHojaParaElPuente();
  try { onOpen(); } catch (e) { /* desde el editor no hay UI */ }

  SpreadsheetApp.flush();
  ss.toast('Listo: tipo de producto, antigüedad, abonos, gráficas y correo semanal',
           'Finanzas AL3D', 10);
}

/* ============================ VENTAS ============================ */
function respaldar(ss, ventas) {
  /* El respaldo se rehace en CADA corrida. Antes se creaba una sola vez y,
     si ya existia, la funcion se salia: el respaldo quedaba congelado y daba
     una falsa sensacion de seguridad justo en la operacion mas delicada. */
  var vieja = ss.getSheetByName('Ventas (respaldo)');
  if (vieja) ss.deleteSheet(vieja);
  var copia = ventas.copyTo(ss).setName('Ventas (respaldo)');
  copia.hideSheet();
}

function leerAbonosViejos(h) {
  // se lee ANTES de mover columnas: P = Abono comisión, R = Fecha abono
  if (h.getRange('S1').getValue() === 'Abono comisión') return null;  // ya migrado
  var n = FIN - 1;
  var folios = h.getRange(2, 1, n, 1).getValues();
  var proy   = h.getRange(2, 2, n, 1).getValues();
  var abono  = h.getRange(2, 16, n, 1).getValues();
  var fecha  = h.getRange(2, 18, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    if (proy[i][0] === '' || !abono[i][0]) continue;
    out.push([folios[i][0], abono[i][0], fecha[i][0] || '', 'Abono traído de Notion']);
  }
  return out;
}

function fijarFolios(h) {
  /* El folio no es formula: es el identificador que amarra los abonos.
     Como la hoja ahora se reacomoda sola, el folio NO puede depender de la
     posicion de la fila. Se respeta el que ya existe y solo se rellenan los
     que faltan, siguiendo el numero mas alto. */
  var n = FIN - 1;
  var proy = h.getRange(2, 2, n, 1).getValues();
  var fol  = h.getRange(2, 1, n, 1).getValues();
  var faltan = 0;
  for (var i = 0; i < n; i++) {
    if (String(proy[i][0]).trim() !== '' && !(numeroDeFolio(fol[i][0]) > 0)) faltan++;
  }
  /* Los que faltan salen de la MISMA marca que usa el puente (reservarFolios), no del más
     alto que se ve: el más alto que se ve baja cuando alguien borra la última venta, y su
     folio volvía a repartirse. */
  var nuevos = reservarFolios(h, faltan);
  var out = [];
  for (var j = 0; j < n; j++) {
    if (String(proy[j][0]).trim() === '') { out.push(['']); continue; }
    if (numeroDeFolio(fol[j][0]) > 0) { out.push([fol[j][0]]); continue; }
    out.push([nuevos.shift()]);
  }
  h.getRange(2, 1, n, 1).setValues(out);
}

function agregarColumnas(h) {
  /* Idempotente de verdad: solo inserta la columna que falte y, si encuentra un
     encabezado que no reconoce, se detiene sin mover nada. Antes comparaba E1
     contra 'Tipo' (nunca coincidia) e insertaba una columna en cada corrida,
     recorriendo todos los datos una posicion a la derecha. */
  var e1 = String(h.getRange('E1').getValue()).trim();
  if (e1 !== 'Tipo de trabajo') {
    if (e1 === 'IVA') h.insertColumnBefore(5);
    else throw new Error('La columna E dice "' + e1 + '" y esperaba "Tipo de trabajo". No se movio nada.');
  }
  var p1 = String(h.getRange('P1').getValue()).trim();
  if (p1 !== 'Días de antigüedad') {
    if (p1 === 'Comisión 10%') h.insertColumnsBefore(16, 2);
    else throw new Error('La columna P dice "' + p1 + '" y esperaba "Días de antigüedad". No se movio nada.');
  }
  // una columna insertada hereda la validacion de su vecina: hay que limpiarla
  ['E', 'P', 'Q'].forEach(function (c) {
    h.getRange(c + '2:' + c + FIN).clearDataValidations();
  });
  h.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
}

function formulasVentas(h) {
  var f = {
    H: '=ARRAYFORMULA(IF(' + L('B') + '="","",ROUND(' + L('G') + '*(1+IF(' + L('F') + '="Sí",16%,0)),2)))',
    K: '=ARRAYFORMULA(IFERROR(ROUND(' + L('H') + '-' + L('I') + '-' + L('J') + ',2),""))',
    O: '=ARRAYFORMULA(IF((' + L('L') + '="")+(' + L('N') + '="")>0,"",' + L('N') + '-' + L('L') + '))',
    P: '=ARRAYFORMULA(IF((' + L('B') + '="")+(' + L('L') + '="")+(' + L('C') +
       '="FABRICACION")>0,"",IF(' + L('K') +
       '>0.004,TODAY()-IF(' + L('M') + '="",' + L('L') + ',' + L('M') + '),"")))',
    Q: '=ARRAYFORMULA(IF(' + L('P') + '="","",IF(' + L('P') + '<=30,"' + RANGOS[0] +
       '",IF(' + L('P') + '<=60,"' + RANGOS[1] + '",IF(' + L('P') + '<=90,"' + RANGOS[2] +
       '","' + RANGOS[3] + '")))))',
    /* La comisión es FIJA: 10 % del SUBTOTAL, que es G. No del neto, así que el IVA no entra
       en el cálculo —es la regla del negocio, dicha por Elías, y por eso se deja escrita aquí
       y no solo en la fórmula—. La columna AD «Porcentaje comision» existe porque el puente
       la lleva y el cotizador la captura, pero la hoja NO la usa: si algún día la comisión se
       pactara por venta, este renglón es el único lugar que habría que cambiar. */
    R: '=ARRAYFORMULA(IF(' + L('B') + '="","",ROUND(' + L('G') + '*10%,2)))',
    S: "=ARRAYFORMULA(IF(" + L('B') + '="","",SUMIF(\'' + ABONOS + "'!$A$2:$A$2000," + L('A') +
       ",'" + ABONOS + "'!$C$2:$C$2000)))",
    T: '=ARRAYFORMULA(IFERROR(ROUND(' + L('R') + '-' + L('S') + ',2),""))',
    U: "=ARRAYFORMULA(IF(" + L('B') + '="","",COUNTIF(\'' + ABONOS + "'!$A$2:$A$2000," + L('A') + ")))",
    V: '=ARRAYFORMULA(IF((' + L('B') + '="")+(' + L('L') + '="")>0,"",YEAR(' + L('L') + ')))',
    W: '=ARRAYFORMULA(IF((' + L('B') + '="")+(' + L('L') + '="")>0,"",TEXT(' + L('L') + ',"yyyy-mm")))',
    /* «Folio repetido» va primero porque es el que más cuesta: dos filas con el mismo folio
       son, para el puente y para la pestaña de abonos, UNA venta. El puente escribe en la
       primera, la plataforma se queda con una de las dos y los abonos se suman en ambas.
       alEditar le da folio nuevo a la copia en cuanto se pega; esto es para la que se le
       escape (una edición que no pasó por la pantalla no dispara alEditar). */
    X: '=ARRAYFORMULA(IF(' + L('B') + '="","",' +
       'IF((' + L('A') + '<>"")*(COUNTIF(' + L('A') + ',' + L('A') + ')>1),"Folio repetido",' +
       'IF((' + L('D') + '<>"")*(' + L('F') + '<>IF(' + L('D') + '="' + CUENTA_SIN_FACTURA + '","No","Sí")),"IVA no corresponde a la cuenta",' +
       'IF(' + L('K') + '<-0.004,"Cobrado de más",' +
       'IF(' + L('T') + '<-0.004,"Comisión pagada de más",' +
       'IF((' + L('C') + '="LIQUIDADO")*(' + L('K') + '>0.004),"Liquidado con saldo",' +
       'IF((' + L('C') + '="LIQUIDADO")*(' + L('N') + '=""),"Falta fecha de liquidación",""))))))))'
  };
  Object.keys(f).forEach(function (c) {
    h.getRange(c + '3:' + c + FIN).clearContent();
    h.getRange(c + '2').setFormula(f[c]);
  });
}

function clasificarTipos(h) {
  /* Solo lo que el nombre dice sin lugar a dudas. Letras y cajas de luz NO se
     clasifican: el vocabulario de la plataforma las parte según lleven luz o no,
     y eso no se adivina desde el nombre del proyecto. */
  var reglas = [
    ['Rotulacion de vinil',          /vinil|rotulaci/i],
    ['Recorte acrilico',             /acr[íi]lic/i],
    ['Custome / Proyecto Especial',  /ne[oó]n|alucobond|panel|se[nñ]al[ée]?(tica|izaci|amiento)/i]
  ];
  var n = FIN - 1;
  var proy = h.getRange(2, 2, n, 1).getValues();
  var tipo = h.getRange(2, 5, n, 1).getValues();
  var cambios = 0;
  for (var i = 0; i < n; i++) {
    if (proy[i][0] === '' || tipo[i][0] !== '') continue;   // respeta lo que ya escribiste
    for (var j = 0; j < reglas.length; j++) {
      if (reglas[j][1].test(String(proy[i][0]))) { tipo[i][0] = reglas[j][0]; cambios++; break; }
    }
  }
  if (cambios) h.getRange(2, 5, n, 1).setValues(tipo);
}

function crearAbonos(ss, historicos) {
  var h = ss.getSheetByName(ABONOS);
  var nuevo = !h;
  if (nuevo) h = ss.insertSheet(ABONOS);

  h.getRange('A1:E1').setValues([['Folio', 'Proyecto', 'Importe', 'Fecha', 'Nota']]);
  h.getRange('B2').setFormula(
    '=ARRAYFORMULA(IF($A$2:$A$2000="","",IFERROR(VLOOKUP($A$2:$A$2000,Ventas!$A$2:$B$' +
    FIN + ',2,FALSE),"— folio no encontrado —")))');

  if (nuevo && historicos && historicos.length) {
    var filas = historicos.map(function (r) { return [r[0], r[1], r[2], r[3]]; });
    h.getRange(2, 1, filas.length, 1).setValues(filas.map(function (r) { return [r[0]]; }));
    h.getRange(2, 3, filas.length, 2).setValues(filas.map(function (r) { return [r[1], r[2]]; }));
    h.getRange(2, 5, filas.length, 1).setValues(filas.map(function (r) { return [r[3]]; }));
  }

  encabezado(h, 'A1:E1');
  h.getRange('C2:C2000').setNumberFormat(MONEDA);
  h.getRange('D2:D2000').setNumberFormat(FECHA);
  h.getRange('B2:B2000').setFontColor('#666666');
  anchos(h, [80, 280, 120, 115, 260]);
  h.setFrozenRows(1);
  h.getRange('G2').setValue('Para registrar un abono: escribe el folio, el importe y la fecha.')
      .setFontColor('#666666').setFontStyle('italic');
  h.getRange('G3').setValue('El proyecto y los totales de Ventas se actualizan solos.')
      .setFontColor('#666666').setFontStyle('italic');
  fuente(h);
}

/* ============================ DISEÑO DE VENTAS ============================ */
function disenoVentas(h) {
  var ult = HEAD.length;
  fuente(h);
  h.getRange(1, 1, 1, ult).setBackground(AZUL).setFontColor('#ffffff')
      .setFontWeight('bold').setFontSize(10).setVerticalAlignment('middle')
      .setWrap(true).setHorizontalAlignment('center');
  CALC.forEach(function (c) { h.getRange(c + '1').setBackground(SLATE); });
  h.setRowHeight(1, 44);
  h.setFrozenRows(1);
  h.setFrozenColumns(2);

  ['G', 'H', 'I', 'J', 'K', 'R', 'S', 'T'].forEach(function (c) {
    h.getRange(c + '2:' + c + FIN).setNumberFormat(MONEDA);
  });
  ['L', 'M', 'N'].forEach(function (c) {
    h.getRange(c + '2:' + c + FIN).setNumberFormat(FECHA);
  });
  ['O', 'P', 'U', 'V'].forEach(function (c) {
    h.getRange(c + '2:' + c + FIN).setNumberFormat('0').setHorizontalAlignment('center');
  });
  h.getRange('A2:A' + FIN).setHorizontalAlignment('center').setFontColor('#8a8a8a');
  h.getRange('F2:F' + FIN).setHorizontalAlignment('center');
  h.getRange('Q2:Q' + FIN).setHorizontalAlignment('center');
  h.getRange('B2:B' + FIN).setFontWeight('bold').setFontColor('#1a1a1a');

  anchos(h, [66, 250, 108, 118, 140, 46, 108, 112, 108, 108, 118, 104, 112, 112,
             74, 84, 112, 106, 112, 124, 74, 58, 76, 178]);

  h.getRange(2, 1, FIN - 1, ult).setVerticalAlignment('middle').setFontSize(10);
  bandas(h, h.getRange(2, 1, FIN - 1, ult));
  h.getRange(1, 1, FIN, ult).setBorder(false, false, false, false, false, false);
  h.getRange(1, 1, FIN, ult)
      .setBorder(true, true, true, true, null, true, '#c9d4e4', SpreadsheetApp.BorderStyle.SOLID);

  /* El filtro cubre TODAS las columnas, las del puente incluidas: un filtro ordena solo su
     rango, y uno de A:X dejaba Y:AD quietas al «Ordenar A→Z» desde el encabezado. */
  var f = h.getFilter(); if (f) f.remove();
  h.getRange(1, 1, FIN, Math.max(ult, Math.min(ULTIMA_COL, h.getMaxColumns()))).createFilter();

  desplegable(h, 'D', CUENTAS);
  desplegable(h, 'C', ESTATUS);
  desplegableAbierto(h, 'E', TIPOS);   // puede venir combinado desde la plataforma
  desplegable(h, 'F', ['Sí', 'No']);

  reglasVentas(h);
}

function reglasVentas(h) {
  var r = [];
  var col = function (c) { return h.getRange(c + '2:' + c + FIN); };
  var chip = function (rango, valor, fondo, texto) {
    r.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(valor).setBackground(fondo).setFontColor(texto)
        .setBold(true).setRanges([rango]).build());
  };
  chip(col('C'), 'FABRICACION', '#d7e7ff', '#124a9c');
  chip(col('C'), 'COBRANDO',    '#fff0c2', '#8a6100');
  chip(col('C'), 'REPARANDO',   '#ececec', '#555555');
  chip(col('C'), 'LIQUIDADO',   '#d8ecd9', '#1e6b2a');
  /* Los colores de las cuentas vivian en el desplegable de Sheets, que esta
     funcion recrea en cada corrida: por eso se perdian. Ahora son formato
     condicional, igual que los del estatus, y aguantan cada re-ejecucion. */
  CUENTAS.forEach(function (c) {
    var t = COLOR_CUENTA[c];
    if (t) chip(col('D'), c, t[0], t[1]);
  });
  chip(col('Q'), RANGOS[0], '#e6f4ea', '#1e6b2a');
  chip(col('Q'), RANGOS[1], '#fff2cc', '#8a6100');
  chip(col('Q'), RANGOS[2], '#ffe0c2', '#a34b00');
  chip(col('Q'), RANGOS[3], '#f8d7da', '#9c1c26');

  r.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"",$K2>0.004)')
      .setBackground('#fff8e1').setFontColor('#8a6100').setRanges([col('K')]).build());
  r.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"",$K2<-0.004)')
      .setBackground('#f8d7da').setFontColor('#9c1c26').setRanges([col('K')]).build());
  r.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"",$T2>0.004)')
      .setBackground('#fdeee0').setFontColor('#a34b00').setRanges([col('T')]).build());
  r.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$X2<>""')
      .setBackground('#fdecee').setFontColor('#9c1c26').setItalic(true)
      .setRanges([col('X')]).build());
  h.setConditionalFormatRules(r);
}

/* ============================ HELPERS DE FORMATO ============================ */
function fuente(h) { h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).setFontFamily(FUENTE); }
function anchos(h, arr) { arr.forEach(function (w, i) { h.setColumnWidth(i + 1, w); }); }
function encabezado(h, a1) {
  h.getRange(a1).setBackground(AZUL).setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
}
function seccion(h, a1) {
  h.getRange(a1).setBackground(AZULC).setFontColor(AZUL).setFontWeight('bold');
}
function bandas(h, rango) {
  h.getBandings().forEach(function (b) { b.remove(); });
  rango.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
}
function desplegableAbierto(h, col, opciones) {
  var regla = SpreadsheetApp.newDataValidation()
      .requireValueInList(opciones, true).setAllowInvalid(true).build();
  h.getRange(col + '2:' + col + FIN).setDataValidation(regla);
}
function desplegable(h, col, opciones) {
  var regla = SpreadsheetApp.newDataValidation()
      .requireValueInList(opciones, true).setAllowInvalid(false).build();
  h.getRange(col + '2:' + col + FIN).setDataValidation(regla);
}
function hojaLimpia(ss, nombre) {
  var h = ss.getSheetByName(nombre);
  if (!h) return ss.insertSheet(nombre);
  var f = h.getFilter(); if (f) f.remove();
  h.getCharts().forEach(function (c) { h.removeChart(c); });
  h.getBandings().forEach(function (b) { b.remove(); });
  h.clear();
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).breakApart();
  h.setConditionalFormatRules([]);
  h.setFrozenRows(0);
  return h;
}
function titulo(h, celda, texto, sub) {
  h.getRange(celda).setValue(texto).setFontSize(16).setFontWeight('bold').setFontColor(AZUL);
  if (sub) h.getRange(celda).offset(1, 0).setValue(sub)
      .setFontColor('#6b7684').setFontStyle('italic').setFontSize(10);
}
function tarjetas(h, fila, kpis, formatoPrimero) {
  kpis.forEach(function (k, i) {
    h.getRange(fila, i * 2 + 1, 1, 2).merge().setValue(k[0]);
    h.getRange(fila + 1, i * 2 + 1, 1, 2).merge().setFormula(k[1]);
  });
  var ancho = kpis.length * 2;
  h.getRange(fila, 1, 1, ancho).setFontWeight('bold').setFontSize(9)
      .setFontColor(AZUL).setBackground(AZULC).setHorizontalAlignment('center');
  h.getRange(fila + 1, 1, 1, ancho).setNumberFormat(MONEDA).setFontSize(14)
      .setFontWeight('bold').setHorizontalAlignment('center').setBackground(GRISF);
  h.setRowHeight(fila + 1, 34);
  if (formatoPrimero) h.getRange(fila + 1, 1).setNumberFormat(formatoPrimero);
}

/* ============================ TABLERO ============================ */
function tablero(ss) {
  var h = hojaLimpia(ss, 'Tablero');
  h.setHiddenGridlines(true);
  titulo(h, 'A1', 'TABLERO — FINANZAS AL3D',
         'Todo se calcula solo desde la pestaña Ventas.');

  var fila = 4;
  fila = bloque(h, fila, 'RESUMEN GENERAL', ['Concepto', 'Monto'], [
    ['Proyectos registrados',            '=COUNTA(' + vB + ')',            '0'],
    ['Venta subtotal (sin IVA)',         '=SUM(' + vG + ')'],
    ['Venta neta (con IVA)',             '=SUM(' + vH + ')'],
    ['Cobrado (anticipo + liquidación)', '=SUM(' + vI + ')+SUM(' + vJ + ')'],
    ['Saldo por cobrar',                 '=SUMIF(' + vK + ',">0")'],
    ['Cobrado de más',                   '=-SUMIF(' + vK + ',"<0")'],
    ['Ticket promedio (subtotal)',       '=IFERROR(AVERAGEIF(' + vG + ',">0"),"")'],
    ['Días promedio de cobro',           '=IFERROR(ROUND(AVERAGE(' + vO + '),1),"")', '0.0']
  ]);

  fila = bloque(h, fila, 'COMISIONES (10% del subtotal)', ['Concepto', 'Monto'], [
    ['Generadas',      '=SUM(' + vR + ')'],
    ['Pagadas',        '=SUM(' + vS + ')'],
    ['Pendientes',     '=SUMIF(' + vT + ',">0")'],
    ['Pagadas de más', '=-SUMIF(' + vT + ',"<0")']
  ]);

  // antigüedad
  var ini = fila + 1;
  h.getRange(fila, 1).setValue('ANTIGÜEDAD DE COBRANZA'); seccion(h, rangoA1(h, fila, 1, 3));
  h.getRange(fila + 1, 1, 1, 3).setValues([['Rango', 'Proyectos', 'Monto']]);
  seccion(h, rangoA1(h, fila + 1, 1, 3));
  RANGOS.forEach(function (rg, i) {
    var r = fila + 2 + i;
    h.getRange(r, 1).setValue(rg);
    h.getRange(r, 2).setFormula('=COUNTIFS(' + vQ + ',$A' + r + ')');
    h.getRange(r, 3).setFormula('=SUMIFS(' + vK + ',' + vQ + ',$A' + r + ')');
  });
  var fFab = fila + 2 + RANGOS.length;
  h.getRange(fFab, 1).setValue('En fabricación (aún no vence)').setFontStyle('italic');
  h.getRange(fFab, 2).setFormula('=COUNTIFS(' + vD + ',"FABRICACION",' + vK + ',">0.004")');
  h.getRange(fFab, 3).setFormula('=SUMIFS(' + vK + ',' + vD + ',"FABRICACION",' + vK + ',">0")');
  var fTot = fFab + 1;
  h.getRange(fTot, 1).setValue('TOTAL POR COBRAR');
  h.getRange(fTot, 2).setFormula('=COUNTIF(' + vK + ',">0.004")');
  h.getRange(fTot, 3).setFormula('=SUMIF(' + vK + ',">0")');
  h.getRange(fTot, 1, 1, 3).setFontWeight('bold').setBackground('#eef2fa');
  h.getRange(ini + 1, 2, RANGOS.length + 2, 1).setNumberFormat('0');
  h.getRange(ini + 1, 3, RANGOS.length + 2, 1).setNumberFormat(MONEDA);
  fila = fTot + 2;

  fila = tablaSimple(h, fila, 'POR TIPO DE TRABAJO',
    ['Tipo de trabajo', 'Proyectos', 'Subtotal', 'Comisión'], TIPOS.concat(['(sin clasificar)']),
    function (r, t) {
      var crit = (t === '(sin clasificar)') ? '""' : '$A' + r;
      return [
        '=COUNTIFS(' + vE + ',' + crit + ',' + NOB + ')',
        '=SUMIFS(' + vG + ',' + vE + ',' + crit + ',' + NOB + ')',
        '=SUMIFS(' + vR + ',' + vE + ',' + crit + ',' + NOB + ')'
      ];
    });

  fila = tablaSimple(h, fila, 'POR AÑO',
    ['Año', 'Proyectos', 'Subtotal', 'Cobrado', 'Saldo por cobrar', 'Comisión pendiente'],
    [2023, 2024, 2025, 2026, 2027, 2028, 2029],
    function (r) {
      return [
        '=IF(COUNTIFS(' + vV + ',$A' + r + ')=0,"",COUNTIFS(' + vV + ',$A' + r + '))',
        '=IF($B' + r + '="","",SUMIFS(' + vG + ',' + vV + ',$A' + r + '))',
        '=IF($B' + r + '="","",SUMIFS(' + vI + ',' + vV + ',$A' + r + ')+SUMIFS(' + vJ + ',' + vV + ',$A' + r + '))',
        '=IF($B' + r + '="","",SUMIFS(' + vK + ',' + vV + ',$A' + r + ',' + vK + ',">0"))',
        '=IF($B' + r + '="","",SUMIFS(' + vT + ',' + vV + ',$A' + r + ',' + vT + ',">0"))'
      ];
    }, true);

  fila = tablaSimple(h, fila, 'POR CUENTA DE COBRO',
    ['Cuenta', 'Proyectos', 'Subtotal', 'Cobrado', 'Saldo por cobrar'], CUENTAS,
    function (r) {
      return [
        '=COUNTIFS(' + vC + ',$A' + r + ')',
        '=SUMIFS(' + vG + ',' + vC + ',$A' + r + ')',
        '=SUMIFS(' + vI + ',' + vC + ',$A' + r + ')+SUMIFS(' + vJ + ',' + vC + ',$A' + r + ')',
        '=SUMIFS(' + vK + ',' + vC + ',$A' + r + ',' + vK + ',">0")'
      ];
    });

  fila = tablaSimple(h, fila, 'POR ESTATUS',
    ['Estatus', 'Proyectos', 'Subtotal', 'Saldo por cobrar'], ESTATUS,
    function (r) {
      return [
        '=COUNTIFS(' + vD + ',$A' + r + ')',
        '=SUMIFS(' + vG + ',' + vD + ',$A' + r + ')',
        '=SUMIFS(' + vK + ',' + vD + ',$A' + r + ',' + vK + ',">0")'
      ];
    });

  // por mes con selector
  h.getRange(fila, 1).setValue('POR MES'); seccion(h, rangoA1(h, fila, 1, 5));
  h.getRange(fila, 2).setValue('Año:');
  h.getRange(fila, 3).setFormula('=YEAR(TODAY())').setNumberFormat('0')
      .setBackground('#fff2cc').setFontWeight('bold').setHorizontalAlignment('center');
  var yr = '$C$' + fila;
  h.getRange(fila + 1, 1, 1, 5).setValues([['Mes', 'Proyectos', 'Subtotal', 'Cobrado', 'Comisión']]);
  seccion(h, rangoA1(h, fila + 1, 1, 5));
  for (var m = 1; m <= 12; m++) {
    var r = fila + 1 + m;
    var k = 'TEXT(DATE(' + yr + ',' + m + ',1),"yyyy-mm")';
    h.getRange(r, 1).setFormula('=TEXT(DATE(' + yr + ',' + m + ',1),"mmmm")');
    h.getRange(r, 2).setFormula('=COUNTIFS(' + vW + ',' + k + ')').setNumberFormat('0');
    h.getRange(r, 3).setFormula('=SUMIFS(' + vG + ',' + vW + ',' + k + ')').setNumberFormat(MONEDA);
    h.getRange(r, 4).setFormula('=SUMIFS(' + vI + ',' + vW + ',' + k + ')+SUMIFS(' + vJ + ',' + vW + ',' + k + ')').setNumberFormat(MONEDA);
    h.getRange(r, 5).setFormula('=SUMIFS(' + vR + ',' + vW + ',' + k + ')').setNumberFormat(MONEDA);
  }

  h.setColumnWidth(1, 240);
  for (var c = 2; c <= 6; c++) h.setColumnWidth(c, 132);
  fuente(h);
  h.setFrozenRows(2);
}

function rangoA1(h, fila, col, n) { return h.getRange(fila, col, 1, n).getA1Notation(); }

function bloque(h, fila, nombre, cabs, filas) {
  h.getRange(fila, 1).setValue(nombre); seccion(h, rangoA1(h, fila, 1, 2));
  filas.forEach(function (f, i) {
    var r = fila + 1 + i;
    h.getRange(r, 1).setValue(f[0]).setFontWeight('bold');
    h.getRange(r, 2).setFormula(f[1]).setNumberFormat(f[2] || MONEDA);
  });
  return fila + filas.length + 2;
}

function tablaSimple(h, fila, nombre, cabs, etiquetas, fn, conTotal) {
  var n = cabs.length;
  h.getRange(fila, 1).setValue(nombre); seccion(h, rangoA1(h, fila, 1, n));
  h.getRange(fila + 1, 1, 1, n).setValues([cabs]); seccion(h, rangoA1(h, fila + 1, 1, n));
  etiquetas.forEach(function (et, i) {
    var r = fila + 2 + i;
    h.getRange(r, 1).setValue(et);
    fn(r, et).forEach(function (f, j) {
      var celda = h.getRange(r, j + 2);
      celda.setFormula(f).setNumberFormat(j === 0 ? '0' : MONEDA);
    });
  });
  var fin = fila + 1 + etiquetas.length;
  if (conTotal) {
    var t = fin + 1;
    h.getRange(t, 1).setValue('TOTAL').setFontWeight('bold');
    h.getRange(t, 2).setFormula('=COUNTA(' + vB + ')').setNumberFormat('0');
    h.getRange(t, 3).setFormula('=SUM(' + vG + ')').setNumberFormat(MONEDA);
    h.getRange(t, 4).setFormula('=SUM(' + vI + ')+SUM(' + vJ + ')').setNumberFormat(MONEDA);
    h.getRange(t, 5).setFormula('=SUMIF(' + vK + ',">0")').setNumberFormat(MONEDA);
    h.getRange(t, 6).setFormula('=SUMIF(' + vT + ',">0")').setNumberFormat(MONEDA);
    h.getRange(t, 1, 1, n).setFontWeight('bold').setBackground('#eef2fa');
    fin = t;
  }
  return fin + 2;
}

/* ============================ VISTAS ============================ */
function cols() {
  var a = [];
  for (var i = 0; i < arguments.length; i++) a.push(V(arguments[i]));
  return a.join(',');
}

function vistas(ss) {
  var defs = [
    { nombre: 'Proyectos en Puerta',
      sub: 'Todo lo que sigue abierto: fabricación, reparando y cobrando.',
      kpis: [['Proyectos', '=COUNTIFS(' + vD + ',"<>LIQUIDADO",' + NOB + ')'],
             ['Valor neto', '=SUMIFS(' + vH + ',' + vD + ',"<>LIQUIDADO",' + NOB + ')'],
             ['Falta cobrar', '=SUMIFS(' + vK + ',' + vD + ',"<>LIQUIDADO",' + NOB + ',' + vK + ',">0")']],
      cabs: ['Folio', 'Proyecto', 'Cuenta', 'Estatus', 'Tipo', 'Precio neto', 'Anticipo', 'Saldo por cobrar', 'Fecha anticipo'],
      formula: '=IFERROR(SORT(FILTER({' + cols('A', 'B', 'D', 'C', 'E', 'H', 'I', 'K', 'L') + '},(' +
               vB + '<>"")*(' + vD + '<>"LIQUIDADO")),9,FALSE),"Sin proyectos abiertos")',
      anchos: [70, 250, 108, 118, 140, 115, 115, 125, 112],
      moneda: 'F:H', fechas: 'I:I', filas: 80, estatus: 'D' },

    { nombre: 'Vendidos del Mes',
      sub: 'Se filtra por la fecha de anticipo. Cambia el año o el mes para ver otro periodo.',
      selector: ['Año', '=YEAR(TODAY())', 'Mes', '=MONTH(TODAY())'],
      kpis: [['Proyectos', '=COUNTIFS(' + vW + ',clave())'],
             ['Venta neta', '=SUMIFS(' + vH + ',' + vW + ',clave())'],
             ['Cobrado', '=SUMIFS(' + vI + ',' + vW + ',clave())+SUMIFS(' + vJ + ',' + vW + ',clave())'],
             ['Comisión', '=SUMIFS(' + vR + ',' + vW + ',clave())']],
      cabs: ['Folio', 'Proyecto', 'Cuenta', 'Tipo', 'Precio neto', 'Fecha anticipo', 'Estatus', 'Saldo por cobrar', 'Fecha liquidación'],
      formula: '=IFERROR(SORT(FILTER({' + cols('A', 'B', 'D', 'E', 'H', 'L', 'C', 'K', 'N') + '},' +
               vW + '=clave()),6,FALSE),"Sin ventas en ese mes")',
      anchos: [70, 250, 108, 140, 115, 112, 118, 125, 125],
      moneda: 'E:E', moneda2: 'H:H', fechas: 'F:F', fechas2: 'I:I', filas: 60, estatus: 'G' },

    { nombre: 'Ventas del Año',
      sub: 'De la venta más grande a la más chica. Cambia el año para ver otro.',
      selector: ['Año', '=YEAR(TODAY())'],
      kpis: [['Proyectos', '=COUNTIFS(' + vV + ',$B$3)'],
             ['Venta neta', '=SUMIFS(' + vH + ',' + vV + ',$B$3)'],
             ['Venta subtotal', '=SUMIFS(' + vG + ',' + vV + ',$B$3)'],
             ['Comisión', '=SUMIFS(' + vR + ',' + vV + ',$B$3)']],
      cabs: ['Folio', 'Proyecto', 'Tipo', 'Precio neto', 'Subtotal', 'Fecha anticipo', 'Estatus'],
      formula: '=IFERROR(SORT(FILTER({' + cols('A', 'B', 'E', 'H', 'G', 'L', 'C') + '},' +
               vV + '=$B$3),4,FALSE),"Sin ventas en ese año")',
      anchos: [70, 260, 140, 120, 120, 112, 118],
      moneda: 'D:E', fechas: 'F:F', filas: 120, estatus: 'G' },

    { nombre: 'Récord de Ventas',
      sub: 'Todas las ventas de la historia, de la más grande a la más chica.',
      kpis: [['Proyectos', '=COUNTA(' + vB + ')'],
             ['Venta neta total', '=SUM(' + vH + ')'],
             ['Venta más grande', '=IFERROR(MAX(' + vH + '),"")'],
             ['Ticket promedio', '=IFERROR(AVERAGEIF(' + vG + ',">0"),"")']],
      cabs: ['#', 'Proyecto', 'Tipo', 'Precio neto', 'Subtotal', 'Fecha anticipo', 'Año', 'Cuenta'],
      formula: '=IFERROR(SORT(FILTER({' + cols('B', 'E', 'H', 'G', 'L', 'V', 'D') + '},' +
               vB + '<>""),3,FALSE),"Sin ventas")',
      rank: true,
      anchos: [52, 260, 140, 120, 120, 112, 70, 108],
      moneda: 'D:E', fechas: 'F:F', filas: 240 }
  ];
  defs.forEach(function (d) { construirVista(ss, d); });
}

function construirVista(ss, v) {
  var h = hojaLimpia(ss, v.nombre);
  h.setHiddenGridlines(true);
  var n = v.cabs.length;
  var fila = 3;
  titulo(h, 'A1', v.nombre.toUpperCase(), v.sub);

  var clave = '';
  if (v.selector) {
    h.getRange(fila, 1).setValue(v.selector[0]).setFontWeight('bold');
    h.getRange('B' + fila).setFormula(v.selector[1]).setNumberFormat('0')
        .setBackground('#fff2cc').setFontWeight('bold').setHorizontalAlignment('center');
    if (v.selector.length > 2) {
      h.getRange('C' + fila).setValue(v.selector[2]).setFontWeight('bold');
      h.getRange('D' + fila).setFormula(v.selector[3]).setNumberFormat('0')
          .setBackground('#fff2cc').setFontWeight('bold').setHorizontalAlignment('center');
      h.getRange('E' + fila).setFormula('=TEXT(DATE($B$' + fila + ',$D$' + fila + ',1),"mmmm yyyy")')
          .setFontColor('#6b7684').setFontStyle('italic');
      clave = '$B$' + fila + '&"-"&TEXT($D$' + fila + ',"00")';
    }
    fila += 2;
  }

  var kpis = v.kpis.map(function (k) {
    return [k[0], clave ? k[1].replace(/clave\(\)/g, clave) : k[1]];
  });
  tarjetas(h, fila, kpis, '0');

  var fh = fila + 3, fd = fh + 1, ff = fd + v.filas;
  h.getRange(fh, 1, 1, n).setValues([v.cabs]);
  encabezado(h, h.getRange(fh, 1, 1, n).getA1Notation());
  h.setRowHeight(fh, 32);

  var f = clave ? v.formula.replace(/clave\(\)/g, clave) : v.formula;
  if (v.rank) {
    h.getRange(fd, 2).setFormula(f);
    h.getRange(fd, 1).setFormula('=ARRAYFORMULA(IF($B$' + fd + ':$B$' + ff +
        '<>"",ROW($B$' + fd + ':$B$' + ff + ')-' + fh + ',""))');
    h.getRange(fd, 1, v.filas, 1).setHorizontalAlignment('center').setFontColor('#9aa3ae');
  } else {
    h.getRange(fd, 1).setFormula(f);
  }

  if (v.moneda)  rangoCols(h, v.moneda,  fd, ff).setNumberFormat(MONEDA);
  if (v.moneda2) rangoCols(h, v.moneda2, fd, ff).setNumberFormat(MONEDA);
  if (v.fechas)  rangoCols(h, v.fechas,  fd, ff).setNumberFormat(FECHA);
  if (v.fechas2) rangoCols(h, v.fechas2, fd, ff).setNumberFormat(FECHA);

  if (v.estatus) chipsEstatus(h, v.estatus, fd, ff);

  anchos(h, v.anchos);
  h.setFrozenRows(fh);
  bandas(h, h.getRange(fd, 1, v.filas, n));
  h.getRange(fd, 1, v.filas, n).setFontSize(10).setVerticalAlignment('middle');
  fuente(h);
}

function rangoCols(h, spec, a, b) {
  var p = spec.split(':');
  return h.getRange(p[0] + a + ':' + p[1] + b);
}

function chipsEstatus(h, col, a, b) {
  var r = h.getConditionalFormatRules();
  var rango = h.getRange(col + a + ':' + col + b);
  var pares = [['FABRICACION', '#d7e7ff', '#124a9c'], ['COBRANDO', '#fff0c2', '#8a6100'],
               ['REPARANDO', '#ececec', '#555555'], ['LIQUIDADO', '#d8ecd9', '#1e6b2a']];
  pares.forEach(function (p) {
    r.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(p[0])
        .setBackground(p[1]).setFontColor(p[2]).setBold(true).setRanges([rango]).build());
  });
  h.setConditionalFormatRules(r);
}

/* ============================ COBRANZA ============================ */
function cobranza(ss) {
  var h = hojaLimpia(ss, 'Cobranza');
  h.setHiddenGridlines(true);
  titulo(h, 'A1', 'COBRANZA POR ANTIGÜEDAD',
         'Los días se cuentan desde la instalación, o desde el anticipo si no hay fecha de instalación.');

  tarjetas(h, 3, [
    ['Proyectos con saldo', '=COUNTIF(' + vK + ',">0.004")'],
    ['Total por cobrar',    '=SUMIF(' + vK + ',">0")'],
    ['Antigüedad promedio', '=IFERROR(ROUND(AVERAGE(' + vP + '),0),"")'],
    ['El más atrasado',     '=IFERROR(MAX(' + vP + '),"")'],
    ['En fabricación (no vence)', '=SUMIFS(' + vK + ',' + vD + ',"FABRICACION",' + vK + ',">0")']
  ], '0');
  h.getRange('E4:H4').setNumberFormat('0');

  h.getRange(7, 5, 1, 3).setValues([['Rango', 'Proyectos', 'Monto']]);
  encabezado(h, 'E7:G7');
  RANGOS.forEach(function (rg, i) {
    var r = 8 + i;
    h.getRange(r, 5).setValue(rg);
    h.getRange(r, 6).setFormula('=COUNTIFS(' + vQ + ',$E' + r + ')').setNumberFormat('0');
    h.getRange(r, 7).setFormula('=SUMIFS(' + vK + ',' + vQ + ',$E' + r + ')').setNumberFormat(MONEDA);
  });
  var fFab = 8 + RANGOS.length;
  h.getRange(fFab, 5).setValue('En fabricación').setFontStyle('italic');
  h.getRange(fFab, 6).setFormula('=COUNTIFS(' + vD + ',"FABRICACION",' + vK + ',">0.004")').setNumberFormat('0');
  h.getRange(fFab, 7).setFormula('=SUMIFS(' + vK + ',' + vD + ',"FABRICACION",' + vK + ',">0")').setNumberFormat(MONEDA);
  var t = fFab + 1;
  h.getRange(t, 5).setValue('TOTAL');
  h.getRange(t, 6).setFormula('=COUNTIF(' + vK + ',">0.004")').setNumberFormat('0');
  h.getRange(t, 7).setFormula('=SUMIF(' + vK + ',">0")').setNumberFormat(MONEDA);
  h.getRange(t, 5, 1, 3).setFontWeight('bold').setBackground('#eef2fa');

  var fh = t + 3, fd = fh + 1, ff = fd + 80;
  var cabs = ['Días', 'Antigüedad', 'Folio', 'Proyecto', 'Cuenta', 'Estatus', 'Saldo por cobrar', 'Fecha anticipo'];
  h.getRange(fh, 1, 1, cabs.length).setValues([cabs]);
  encabezado(h, h.getRange(fh, 1, 1, cabs.length).getA1Notation());
  h.getRange(fd, 1).setFormula(
    '=IFERROR(SORT(FILTER({' + cols('P', 'Q', 'A', 'B', 'D', 'C', 'K', 'L') +
    '},ISNUMBER(' + vP + ')),1,FALSE),"Sin saldos por cobrar")');
  h.getRange('A' + fd + ':A' + ff).setNumberFormat('0').setHorizontalAlignment('center');
  h.getRange('G' + fd + ':G' + ff).setNumberFormat(MONEDA);
  h.getRange('H' + fd + ':H' + ff).setNumberFormat(FECHA);
  chipsEstatus(h, 'F', fd, ff);

  var r = h.getConditionalFormatRules();
  var rgQ = h.getRange('B' + fd + ':B' + ff);
  [[RANGOS[0], '#e6f4ea', '#1e6b2a'], [RANGOS[1], '#fff2cc', '#8a6100'],
   [RANGOS[2], '#ffe0c2', '#a34b00'], [RANGOS[3], '#f8d7da', '#9c1c26']].forEach(function (p) {
    r.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(p[0])
        .setBackground(p[1]).setFontColor(p[2]).setBold(true).setRanges([rgQ]).build());
  });
  h.setConditionalFormatRules(r);

  anchos(h, [66, 120, 70, 250, 108, 118, 128, 112]);
  h.setFrozenRows(fh);
  bandas(h, h.getRange(fd, 1, 80, cabs.length));
  fuente(h);
}

/* ============================ COMISIONES ============================ */
function comisiones(ss) {
  var h = hojaLimpia(ss, 'Comisiones');
  h.setHiddenGridlines(true);
  titulo(h, 'A1', 'COMISIONES', 'Pendientes, historial de abonos y récord, una junto a la otra.');

  tarjetas(h, 3, [
    ['Generadas',      '=SUM(' + vR + ')'],
    ['Pagadas',        '=SUM(' + vS + ')'],
    ['Pendientes',     '=SUMIF(' + vT + ',">0")'],
    ['Pagadas de más', '=-SUMIF(' + vT + ',"<0")']
  ]);

  var ft = 7, fh = 8, fd = 9, ff = 249;
  var bloques = [
    { col: 1, tit: 'PENDIENTES POR COBRAR',
      cabs: ['Folio', 'Proyecto', 'Comisión', 'Abonado', 'Pendiente', 'Pagos'],
      formula: '=IFERROR(SORT(FILTER({' + cols('A', 'B', 'R', 'S', 'T', 'U') +
               '},ISNUMBER(' + vT + ')*(' + vT + '>0.004)),5,FALSE),"Sin comisiones pendientes")',
      anchos: [70, 230, 110, 110, 110, 70], moneda: 'C:E', entero: 'F:F' },
    { col: 8, tit: 'HISTORIAL DE ABONOS',
      cabs: ['Proyecto', 'Importe', 'Fecha', 'Nota'],
      formula: "=IFERROR(SORT(FILTER({'" + ABONOS + "'!$B$2:$B$2000,'" + ABONOS +
               "'!$C$2:$C$2000,'" + ABONOS + "'!$D$2:$D$2000,'" + ABONOS +
               "'!$E$2:$E$2000},'" + ABONOS + "'!$A$2:$A$2000<>\"\"),3,FALSE),\"Sin abonos\")",
      anchos: [230, 110, 115, 200], moneda: 'I:I', fechas: 'J:J' },
    { col: 13, tit: 'RÉCORD DE COMISIONES',
      cabs: ['Proyecto', 'Comisión', 'Fecha anticipo'],
      formula: '=IFERROR(SORT(FILTER({' + cols('B', 'R', 'L') + '},' + vB + '<>""),2,FALSE),"Sin comisiones")',
      anchos: [230, 110, 115], moneda: 'N:N', fechas: 'O:O' }
  ];
  bloques.forEach(function (b) {
    var n = b.cabs.length;
    h.getRange(ft, b.col).setValue(b.tit);
    seccion(h, h.getRange(ft, b.col, 1, n).getA1Notation());
    h.getRange(fh, b.col, 1, n).setValues([b.cabs]);
    encabezado(h, h.getRange(fh, b.col, 1, n).getA1Notation());
    h.getRange(fd, b.col).setFormula(b.formula);
    if (b.moneda) rangoCols(h, b.moneda, fd, ff).setNumberFormat(MONEDA);
    if (b.fechas) rangoCols(h, b.fechas, fd, ff).setNumberFormat(FECHA);
    if (b.entero) rangoCols(h, b.entero, fd, ff).setNumberFormat('0').setHorizontalAlignment('center');
    b.anchos.forEach(function (w, i) { h.setColumnWidth(b.col + i, w); });
  });
  h.setColumnWidth(7, 28);
  h.setColumnWidth(12, 28);
  h.setFrozenRows(fh);
  fuente(h);
}

/* ============================ GRÁFICAS ============================ */
function graficas(ss) {
  var h = hojaLimpia(ss, 'Gráficas');
  h.setHiddenGridlines(true);
  titulo(h, 'A1', 'GRÁFICAS', 'Los datos de abajo alimentan las gráficas. Cambia el año para comparar otros.');

  h.getRange('A3').setValue('Año:').setFontWeight('bold');
  h.getRange('B3').setFormula('=YEAR(TODAY())').setNumberFormat('0')
      .setBackground('#fff2cc').setFontWeight('bold').setHorizontalAlignment('center');

  // 1) ventas por mes, año actual contra el anterior
  h.getRange('A5:C5').setValues([['Mes', '=TEXT($B$3,"0")', '=TEXT($B$3-1,"0")']]);
  for (var m = 1; m <= 12; m++) {
    var r = 5 + m;
    h.getRange(r, 1).setFormula('=TEXT(DATE($B$3,' + m + ',1),"mmm")');
    h.getRange(r, 2).setFormula('=SUMIFS(' + vH + ',' + vW + ',TEXT(DATE($B$3,' + m + ',1),"yyyy-mm"))');
    h.getRange(r, 3).setFormula('=SUMIFS(' + vH + ',' + vW + ',TEXT(DATE($B$3-1,' + m + ',1),"yyyy-mm"))');
  }
  // 2) por cuenta
  h.getRange('E5:F5').setValues([['Cuenta', 'Venta neta']]);
  CUENTAS.forEach(function (c, i) {
    var r = 6 + i;
    h.getRange(r, 5).setValue(c);
    h.getRange(r, 6).setFormula('=SUMIFS(' + vH + ',' + vC + ',$E' + r + ')');
  });
  // 3) por año
  h.getRange('H5:I5').setValues([['Año', 'Venta neta']]);
  [2023, 2024, 2025, 2026].forEach(function (y, i) {
    var r = 6 + i;
    h.getRange(r, 8).setValue(y);
    h.getRange(r, 9).setFormula('=SUMIFS(' + vH + ',' + vV + ',$H' + r + ')');
  });
  // 4) antigüedad
  h.getRange('K5:L5').setValues([['Antigüedad', 'Monto']]);
  RANGOS.forEach(function (rg, i) {
    var r = 6 + i;
    h.getRange(r, 11).setValue(rg);
    h.getRange(r, 12).setFormula('=SUMIFS(' + vK + ',' + vQ + ',$K' + r + ')');
  });
  // 5) por tipo
  h.getRange('N5:O5').setValues([['Tipo de trabajo', 'Venta neta']]);
  TIPOS.concat(['(sin clasificar)']).forEach(function (t, i) {
    var r = 6 + i;
    var crit = (t === '(sin clasificar)') ? '""' : '$N' + r;
    h.getRange(r, 14).setValue(t);
    h.getRange(r, 15).setFormula('=SUMIFS(' + vH + ',' + vE + ',' + crit + ',' + NOB + ')');
  });

  ['A5:C5', 'E5:F5', 'H5:I5', 'K5:L5', 'N5:O5'].forEach(function (a) { seccion(h, a); });
  h.getRange('B6:C17').setNumberFormat(MONEDA);
  h.getRange('F6:F10').setNumberFormat(MONEDA);
  h.getRange('I6:I9').setNumberFormat(MONEDA);
  h.getRange('L6:L9').setNumberFormat(MONEDA);
  h.getRange('O6:O14').setNumberFormat(MONEDA);
  anchos(h, [90, 120, 120, 30, 140, 120, 30, 80, 120, 30, 130, 120, 30, 150, 120]);

  h.insertChart(h.newChart().asColumnChart()
      .addRange(h.getRange('A5:C17')).setNumHeaders(1)
      .setPosition(20, 1, 0, 0).setOption('title', 'Ventas por mes — año actual vs. anterior')
      .setOption('width', 620).setOption('height', 340)
      .setOption('colors', ['#1c3d6e', '#9db8d8']).setOption('legend', { position: 'top' })
      .build());
  h.insertChart(h.newChart().asPieChart()
      .addRange(h.getRange('E5:F10')).setNumHeaders(1)
      .setPosition(20, 8, 0, 0).setOption('title', 'Venta neta por cuenta de cobro')
      .setOption('width', 420).setOption('height', 340).setOption('pieHole', 0.4)
      .setOption('legend', { position: 'right' })
      .build());
  h.insertChart(h.newChart().asColumnChart()
      .addRange(h.getRange('H5:I9')).setNumHeaders(1)
      .setPosition(40, 1, 0, 0).setOption('title', 'Venta neta por año')
      .setOption('width', 420).setOption('height', 320)
      .setOption('colors', ['#1c3d6e']).setOption('legend', { position: 'none' })
      .build());
  h.insertChart(h.newChart().asColumnChart()
      .addRange(h.getRange('K5:L9')).setNumHeaders(1)
      .setPosition(40, 6, 0, 0).setOption('title', 'Saldo por cobrar según antigüedad')
      .setOption('width', 420).setOption('height', 320)
      .setOption('colors', ['#c0603a']).setOption('legend', { position: 'none' })
      .build());
  h.insertChart(h.newChart().asBarChart()
      .addRange(h.getRange('N5:O14')).setNumHeaders(1)
      .setPosition(40, 12, 0, 0).setOption('title', 'Venta neta por tipo de trabajo')
      .setOption('width', 470).setOption('height', 320)
      .setOption('colors', ['#3c6e9e']).setOption('legend', { position: 'none' })
      .build());
  fuente(h);
}

/* ============================ DISPARADORES ============================ */
function instalarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'enviarResumen' || f === 'alEditar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarResumen').timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ScriptApp.newTrigger('alEditar').forSpreadsheet(SpreadsheetApp.getActive())
      .onEdit().create();
}

/* 
 * REGLA DE ORDEN Y REGLA DE IVA
 *
 * 1) La hoja Ventas se reacomoda sola: arriba lo que esta en FABRICACION,
 *    luego REPARANDO, luego COBRANDO y hasta abajo LIQUIDADO. Dentro de
 *    cada grupo, el folio mas nuevo primero.
 * 2) La cuenta manda el IVA. Elias BBVA es la unica que recibe sin factura,
 *    asi que cualquier otra cuenta deja el IVA en "Si".
 *
 * Se mueven TODAS las columnas que se capturan: A:G, I:J, L:N y las del puente,
 * Y:AF (folio de cotización, etapa de obra, hora, ubicación, dirección, % de
 * comisión, desde puente-sheets-11 el teléfono del cliente y desde la 12 la entrega). Las columnas
 * calculadas son ARRAYFORMULA que vive en la fila 2: no se tocan nunca.
 *
 * Hasta puente-sheets-5 este comentario decía «A:G, I:J, L:N» y el código hacía
 * justo eso: Y:AD se quedaban en su renglón mientras la venta se iba a otro. En
 * cada reacomodo el folio de cotización pasaba a ser de OTRA venta, y como
 * /empujar busca la fila por ese folio, la siguiente subida escribía el nombre y
 * el dinero de una venta encima de otra. Por eso Y:AD viajan con su fila, y por
 * eso la hoja que ya quedó revuelta se realinea una sola vez desde la bitácora
 * (ver realinearColumnasDelPuente, al final del puente).
 */

var CUENTA_SIN_FACTURA = 'Elias BBVA';
var ORDEN_ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];

function prioridadEstatus(v) {
  var k = String(v).trim().toUpperCase();
  for (var i = 0; i < ORDEN_ESTATUS.length; i++) {
    if (ORDEN_ESTATUS[i] === k) return i;
  }
  return ORDEN_ESTATUS.length;
}

/* Solo «V-» y dígitos. Con Number() a secas, «V-Infinity» o «V-1e999» daban Infinity, y un
   solo teléfono que preguntara por ese folio subía la marca para siempre: todas las ventas
   nuevas salían con el mismo folio. */
function numeroDeFolio(v) {
  var m = /^V-(\d{1,7})$/i.exec(String(v).trim());
  return m ? Number(m[1]) : -1;
}

function filaPorFolio(h, folio) {
  var folios = h.getRange(2, 1, FIN - 1, 1).getValues();
  for (var i = 0; i < folios.length; i++) {
    if (String(folios[i][0]).trim() === String(folio).trim()) return i + 2;
  }
  return 0;
}

/**
 * Las columnas que se CAPTURAN, en bloques [primera, última], recortadas a las que la hoja
 * tiene de verdad. Es una función y no una variable porque COL y ULTIMA_COL se declaran más
 * abajo, y porque una hoja anterior al puente tiene 24 columnas: pedirle la 30 truena. El
 * teléfono (AE) y la entrega (AF) entran en el último bloque y viajan con su fila como Y:AD;
 * `ancho` sale de anchoDelPuente, así que una hoja sin AE o sin AF se reacomoda igual, hasta
 * donde llegue.
 * Lo que no está aquí es fórmula (H, K, O:X) y no se escribe nunca.
 */
function bloquesCapturados(ancho) {
  var b = [[1, 7], [9, 10], [12, 14], [COL['Folio cotizacion'], ULTIMA_COL]];
  var out = [];
  for (var i = 0; i < b.length; i++) {
    if (b[i][0] <= ancho) out.push([b[i][0], Math.min(b[i][1], ancho)]);
  }
  return out;
}

/** Reacomoda Ventas. Es idempotente: correrla dos veces no cambia nada. */
function ordenarVentas(h) {
  if (modoEspejo_()) return;   // hoja espejo: el orden lo trae la base, no se reescribe nada (ver /espejo)
  h = h || SpreadsheetApp.getActive().getSheetByName('Ventas');
  if (!h) return;
  /* Mientras Y:AD no estén realineadas —o no se sepa—, no se reacomoda nada. Mover A:X sin
     Y:AD es justo lo que las revolvió (hasta puente-sheets-5), y moverlas todas antes de
     realinear borraría la pista de a quién es cada celda: el renglón de la bitácora. Quedarse
     quietas cuesta solo el orden por estatus, hasta que Dirección realinee. Una hoja sin las
     columnas del puente no tiene qué revolver y se ordena como siempre. */
  var tienePuente = h.getMaxColumns() >= COL['Folio cotizacion'];
  if (tienePuente && estadoDeAlineacion() !== true) return;
  var n = FIN - 1;
  var ancho = anchoDelPuente(h);
  var datos = h.getRange(2, 1, n, ancho).getValues();

  var llenas = [], vacias = [];
  for (var i = 0; i < n; i++) {
    if (String(datos[i][1]).trim() === '') vacias.push(datos[i]);
    else llenas.push(datos[i]);
  }

  llenas.sort(function (a, b) {
    var pa = prioridadEstatus(a[2]), pb = prioridadEstatus(b[2]);
    if (pa !== pb) return pa - pb;
    return numeroDeFolio(b[0]) - numeroDeFolio(a[0]);
  });

  var orden = llenas.concat(vacias);
  /* Si nada cambió de lugar no se escribe nada: cada /empujar termina aquí, y reescribir
     trescientas filas iguales es tiempo con el candado puesto. */
  var seMovio = false;
  for (var j = 0; j < n && !seMovio; j++) seMovio = orden[j] !== datos[j];
  if (!seMovio) return;

  /* Aquí la hoja ya está realineada (o no tiene columnas del puente): Y:AD viajan con su fila.
     La hora, como texto: getValues la trae como el Date en que Sheets la convirtió, y el
     renglón al que llega puede no tener el '@' (ver horaDeCelda). */
  horasATexto(h, orden);
  telefonosATexto(h, ancho);
  notasATexto_(h, ancho);
  var bloques = bloquesCapturados(ancho);
  bloques.forEach(function (b) {
    h.getRange(2, b[0], n, b[1] - b[0] + 1)
     .setValues(filasProtegidas(orden.map(function (r) { return r.slice(b[0] - 1, b[1]); }), b[0]));
  });
}

/** AE en texto sin formato antes de reescribirla, por lo mismo que AA: el formato no viaja con
 *  los valores, y «+52 1 33…» que el reacomodo baja a un renglón sin '@' se volvía número —o
 *  fórmula—. Solo si la hoja tiene la columna. */
function telefonosATexto(h, ancho) {
  if (ancho < COL['Telefono']) return;
  h.getRange(2, COL['Telefono'], FIN - 1, 1).setNumberFormat('@');
}

/** AG (notas) y AI (sellos) en texto sin formato antes de reescribirlas, por lo mismo que AE. */
function notasATexto_(h, ancho) {
  if (ancho < COL['Sellos']) return;
  h.getRange(2, COL['Notas'], FIN - 1, 1).setNumberFormat('@');
  h.getRange(2, COL['Sellos'], FIN - 1, 1).setNumberFormat('@');
}

/** Elias BBVA cobra sin factura; cualquier otra cuenta lleva IVA. */
function ivaDeCuenta(cuenta) {
  return String(cuenta).trim() === CUENTA_SIN_FACTURA ? 'No' : 'Sí';
}

/** Ajusta el IVA de una fila segun la cuenta que tenga. */
function aplicarIva(h, fila) {
  var cuenta = String(h.getRange(fila, 4).getValue()).trim();
  if (cuenta === '') return;
  var quiero = ivaDeCuenta(cuenta);
  var celda = h.getRange(fila, 6);
  if (String(celda.getValue()).trim() !== quiero) celda.setValue(quiero);
}

/** Revisa el IVA de lo que todavia no se liquida. No toca el historico. */
function normalizarIvaActivos(h) {
  if (modoEspejo_()) return;   // hoja espejo: el IVA ya viene resuelto por la base (ver /espejo)
  var n = FIN - 1;
  var d = h.getRange(2, 1, n, 6).getValues();
  for (var i = 0; i < n; i++) {
    var cuenta = String(d[i][3]).trim();
    if (String(d[i][1]).trim() === '' || cuenta === '') continue;
    if (String(d[i][2]).trim().toUpperCase() === 'LIQUIDADO') continue;
    var quiero = ivaDeCuenta(cuenta);
    if (String(d[i][5]).trim() !== quiero) h.getRange(i + 2, 6).setValue(quiero);
  }
}

/**
 * Folio automatico al escribir un proyecto nuevo, IVA automatico segun la
 * cuenta, y reacomodo de la hoja cuando cambia el estatus.
 */
function alEditar(e) {
  if (modoEspejo_()) return;   // hoja espejo: no pone folios, IVA, sellos ni reordena (ver /espejo)
  /* Con el candado del puente, como toda escritura sobre Ventas. Sin él, un reacomodo de
     aquí corría las filas en mitad de una subida —que ya había decidido en qué fila
     escribir— y un folio de aquí y uno del puente salían iguales. Si el puente no lo suelta
     en 25 segundos esta edición no se toca: el folio lo pone la siguiente, o mejorarTodo.
     Nunca se bloquea la captura esperando. */
  var candado = null;
  try {
    var h = e.range.getSheet();
    if (h.getName() !== 'Ventas') return;

    var col = e.range.getColumn();
    var colFin = col + e.range.getNumColumns() - 1;
    var ini = Math.max(e.range.getRow(), 2);
    var fin = e.range.getRow() + e.range.getNumRows() - 1;
    if (fin < 2) return;

    candado = LockService.getScriptLock();
    if (!candado.tryLock(25000)) { candado = null; return; }

    /* 1) folio nuevo cuando se escribe el proyecto (columna B), y folio nuevo para la COPIA
          de una fila que se pegó con todo y su folio (columna A). Dos filas con el mismo
          folio son una sola venta para el puente —escribe en la primera— y para los abonos
          —se suman en las dos—, y en la plataforma una de las dos desaparece. La que cambia
          es la que se acaba de pegar: la otra ya tenía ese folio y quizá abonos colgando. */
    var tocaA = col <= 1 && colFin >= 1;
    var tocaB = col <= 2 && colFin >= 2;
    if (tocaA || tocaB) {
      var hasta = Math.min(fin, FIN);
      var folios = h.getRange(2, 1, FIN - 1, 2).getValues();
      var fuera = {};
      for (var k = 0; k < folios.length; k++) {
        if (k + 2 >= ini && k + 2 <= hasta) continue;
        var s = String(folios[k][0]).trim();
        if (s) fuera[s] = true;
      }
      var vistos = {}, sinFolio = [], repetidas = [];
      for (var f = ini; f <= hasta; f++) {
        var proy = String(folios[f - 2][1]).trim();
        var fol = String(folios[f - 2][0]).trim();
        if (proy === '') continue;
        if (fol === '') { if (tocaB) sinFolio.push(f); continue; }
        if (tocaA && (fuera[fol] || vistos[fol])) repetidas.push({ fila: f, folio: fol });
        else vistos[fol] = true;
      }
      var nuevos = reservarFolios(h, sinFolio.length + repetidas.length);
      sinFolio.forEach(function (fila) { h.getRange(fila, 1).setValue(nuevos.shift()); });
      repetidas.forEach(function (r) {
        var otro = nuevos.shift();
        h.getRange(r.fila, 1).setValue(otro);
        /* La copia es otra venta: tampoco se queda con el «Folio cotizacion» de la original.
           Con él, las dos filas eran la misma venta para cada búsqueda del puente, y la copia
           (que ahora va arriba por su folio más alto) se llevaba los cambios de la original. */
        var fcCopia = '';
        if (h.getMaxColumns() >= COL['Folio cotizacion']) {
          var celdaFc = h.getRange(r.fila, COL['Folio cotizacion']);
          fcCopia = String(celdaFc.getValue()).trim();
          if (fcCopia) celdaFc.setValue('');
        }
        try {
          SpreadsheetApp.getActive().toast('La fila ' + r.fila + ' traía el folio ' + r.folio +
            ', que ya es de otra venta. Se le puso ' + otro + ' para no mezclarlas' +
            (fcCopia ? ', y se le quitó el folio de cotización ' + fcCopia : '') + '. Si la ' +
            'moviste en vez de copiarla, borra la original y regrésale ' + (fcCopia ? 'los dos folios.' : 'su folio.'),
            'Folio repetido', 15);
        } catch (_) { /* sin pantalla no hay aviso; el folio nuevo sí queda */ }
      });
    }

    /* 2) IVA segun la cuenta (columna D) */
    if (col <= 4 && colFin >= 4) {
      for (var g = ini; g <= fin; g++) aplicarIva(h, g);
    }

    /* 3) el sello de lo que se cambió a mano en las columnas de la obra (puente-sheets-14): lo
          tecleado aquí es un cambio como el de cualquier teléfono, y si es el más reciente gana
          en todos. Borrar a mano NO cuenta como cambio —se le quita el sello—: una celda que se
          vació por un resbalón no le borra el dato a ningún teléfono, y el teléfono que lo tiene
          lo vuelve a subir. Para borrar algo en todos, se borra en la plataforma. */
    if (colFin >= COL['Fecha instalacion'] && tieneColumnasDeObra(h)) {
      var tocadas = SELLADAS.filter(function (n) { return COL[n] >= col && COL[n] <= colFin; });
      if (tocadas.length) {
        var ahoraE = Date.now();
        var hastaE = Math.min(fin, FIN);
        for (var fe = ini; fe <= hastaE; fe++) {
          if (String(h.getRange(fe, COL['Proyecto']).getValue()).trim() === '') continue;
          var conDato = [], vacias = [];
          tocadas.forEach(function (n) {
            /* La hora va con la fecha: sin fecha no hay cita, y su sello es el de la fecha. */
            var c = n === 'Hora instalacion' ? COL['Fecha instalacion'] : COL[n];
            var x = h.getRange(fe, c).getValue();
            (x === '' || x === null ? vacias : conDato).push(n);
          });
          if (conDato.length) sellarFila_(h, fe, conDato, ahoraE);
          if (vacias.length) sellarFila_(h, fe, vacias, 0);
        }
      }
    }

    /* 4) arriba lo que esta en fabricacion (columna C) */
    if (col <= 3 && colFin >= 3) {
      SpreadsheetApp.flush();
      ordenarVentas(h);
    }
  } catch (err) { /* nunca bloquear la captura */ }
  finally { if (candado) candado.releaseLock(); }
}

/**
 * El candado de toda escritura sobre Ventas y sobre los abonos: el mismo que toma /empujar.
 * Lo usan los formularios del menú. Sin él, un formulario y una subida del puente que
 * caen en el mismo segundo toman la misma fila libre y el mismo folio.
 * Espera hasta 30 segundos —lo más que tarda /empujar con 25 operaciones— y si no, dice por qué.
 *
 * El cuerpo de cada formulario va aparte y con guion bajo al final (guardarVentaConCandado_):
 * Apps Script no deja llamar esas funciones desde un formulario ni las enseña en el selector
 * del editor, así que no hay manera de correrlas sin el candado.
 */
function conCandado(fn) {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(30000)) {
    throw new Error('La hoja está ocupada con otra escritura (una subida del puente o un formulario). Vuelve a intentarlo en un momento.');
  }
  try { return fn(); } finally { candado.releaseLock(); }
}

/** Resumen de los lunes. Se puede correr a mano para probarlo. */
function enviarResumen() {
  var ss = SpreadsheetApp.getActive();
  var v = ss.getSheetByName('Ventas');
  var n = FIN - 1;
  var d = v.getRange(2, 1, n, 24).getValues();
  var porCobrar = [], comis = [], totalS = 0, totalC = 0;
  d.forEach(function (r) {
    if (!r[1]) return;
    var saldo = Number(r[10]) || 0, dias = Number(r[15]) || 0;
    var pend = Number(r[19]) || 0;
    if (saldo > 0.004) { porCobrar.push([r[1], r[3], r[2], saldo, dias]); totalS += saldo; }
    if (pend > 0.004) { comis.push([r[1], pend]); totalC += pend; }
  });
  porCobrar.sort(function (a, b) { return b[4] - a[4]; });
  comis.sort(function (a, b) { return b[1] - a[1]; });

  var m = function (x) { return '$' + Utilities.formatString('%s', x.toFixed(2))
      .replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var html = '<div style="font-family:Roboto,Arial,sans-serif;color:#1a1a1a">' +
    '<h2 style="color:#1c3d6e;margin-bottom:4px">AL3D — pendientes de la semana</h2>' +
    '<p style="color:#6b7684;margin-top:0">' + Utilities.formatDate(new Date(),
      ss.getSpreadsheetTimeZone(), 'd \'de\' MMMM \'de\' yyyy') + '</p>' +
    '<h3>Por cobrar: ' + m(totalS) + ' en ' + porCobrar.length + ' proyectos</h3>' +
    tablaHtml(['Proyecto', 'Cuenta', 'Estatus', 'Saldo', 'Días'],
      porCobrar.slice(0, 15).map(function (r) {
        return [r[0], r[1], r[2], m(r[3]), r[4] ? String(r[4]) : '—'];
      })) +
    '<h3>Comisiones pendientes: ' + m(totalC) + ' en ' + comis.length + ' proyectos</h3>' +
    tablaHtml(['Proyecto', 'Pendiente'],
      comis.slice(0, 15).map(function (r) { return [r[0], m(r[1])]; })) +
    '<p style="margin-top:22px"><a href="' + ss.getUrl() +
    '" style="background:#1c3d6e;color:#fff;padding:10px 18px;border-radius:6px;' +
    'text-decoration:none">Abrir la hoja</a></p>' +
    '<p style="color:#9aa3ae;font-size:12px">Se envía los lunes a las 8 am. ' +
    'Para apagarlo: Extensiones › Apps Script › Activadores.</p></div>';

  MailApp.sendEmail({ to: CORREO, subject: 'AL3D — pendientes de la semana', htmlBody: html });
}

/* Las celdas van escapadas (escaparHtml, más abajo): el nombre del proyecto lo escribe
   cualquiera, y sin escapar un «<a href=…>» metido en él llegaba como liga al correo del dueño. */
function tablaHtml(cabs, filas) {
  if (!filas.length) return '<p style="color:#6b7684">Nada pendiente.</p>';
  var s = '<table style="border-collapse:collapse;font-size:13px"><tr>';
  cabs.forEach(function (c) {
    s += '<th style="background:#1c3d6e;color:#fff;padding:7px 12px;text-align:left">' + escaparHtml(c) + '</th>';
  });
  s += '</tr>';
  filas.forEach(function (f, i) {
    s += '<tr style="background:' + (i % 2 ? '#f7f9fc' : '#ffffff') + '">';
    f.forEach(function (c) {
      s += '<td style="padding:6px 12px;border-bottom:1px solid #e4e9f0">' + escaparHtml(c) + '</td>';
    });
    s += '</tr>';
  });
  return s + '</table>';
}

/* ==================================================================
   MENÚ Y FORMULARIOS — el equivalente al botón "Registrar Nuevo
   Proyecto" de Notion, más los que faltaban para no capturar a mano.
   ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚡ AL3D')
      .addItem('➕  Registrar nueva venta', 'dialogoVenta')
      .addItem('💵  Registrar un cobro', 'dialogoCobro')
      .addItem('🧾  Registrar abono de comisión', 'dialogoAbono')
      .addItem('🧮  Repartir un abono entre comisiones', 'dialogoReparto')
      .addSeparator()
      .addItem('🔑  Tokens del puente', 'dialogoTokens')
      .addItem('🤖  Llaves de IA', 'dialogoLlavesIA')
      .addItem('🔏  Preparar las autorizaciones selladas', 'configurarAutorizaciones')
      .addItem('📬  Mandarme el resumen ahora', 'enviarResumen')
      .addItem('🔄  Actualizar formato y vistas', 'mejorarTodo')
      .addItem('📅  Rehacer vista de comisiones por periodo', 'construirComisionesPorPeriodo')
      /* Los tres pasos de la actualización del puente, aquí y no en el selector de funciones
         del editor: ahí están uno encima del otro y es fácil correr el que no era. Van en
         orden; la realineación aplica solo lo que enseñó la vista previa (ver DESPLIEGUE). */
      .addSeparator()
      .addSubMenu(SpreadsheetApp.getUi().createMenu('🔧  Actualizar el puente')
          .addItem('1 · Revisar columnas Y–AD (vista previa, no escribe)', 'revisarColumnasDelPuente')
          .addItem('2 · Realinear columnas Y–AD', 'realinearColumnasDelPuente')
          .addItem('3 · Preparar la hoja para el puente', 'prepararHojaParaElPuente'))
      .addToUi();
}

/* ---------- estilos compartidos de los formularios ---------- */
function marco(cuerpo, alto) {
  var css =
    '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;margin:0;padding:18px 20px;color:#1a1a1a;font-size:13px}' +
    'h2{margin:0 0 2px;font-size:17px;color:#1c3d6e}' +
    'p.sub{margin:0 0 16px;color:#6b7684;font-size:12px}' +
    'label{display:block;margin:11px 0 3px;font-weight:500;color:#41506b}' +
    'input,select,textarea{width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid #cdd6e3;' +
    'border-radius:6px;font-size:13px;font-family:inherit;background:#fff}' +
    'input:focus,select:focus{outline:none;border-color:#1c3d6e}' +
    '.fila{display:flex;gap:10px}.fila>div{flex:1}' +
    '.pie{margin-top:20px;display:flex;gap:10px;align-items:center}' +
    'button{background:#1c3d6e;color:#fff;border:0;padding:10px 20px;border-radius:6px;' +
    'font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}' +
    'button:hover{background:#27528f}' +
    'button.gris{background:#eef1f6;color:#41506b}' +
    '.aviso{margin-top:12px;font-size:12px;padding:9px 11px;border-radius:6px;display:none}' +
    '.ok{background:#e6f4ea;color:#1e6b2a;display:block}' +
    '.mal{background:#fdecee;color:#9c1c26;display:block}' +
    '.dato{background:#f7f9fc;border:1px solid #e4e9f0;border-radius:6px;padding:9px 11px;' +
    'margin-top:10px;color:#41506b}' +
    'h3.sec{margin:18px 0 0;padding-top:12px;border-top:1px solid #e4e9f0;font-size:13px;color:#1c3d6e}' +
    '</style>';
  return HtmlService.createHtmlOutput(css + cuerpo).setWidth(430).setHeight(alto || 560);
}

/* ── Todo dato de la hoja que entra en un HTML, escapado ──────────────────────────────────
   Los diálogos del menú se arman pegando texto, y el nombre del proyecto (columna B) lo
   escribe cualquiera: un teléfono por el puente, un formulario, una celda a mano. armarCeldas
   solo le quita el = + - @ de adelante —lo que la hoja volvería fórmula—, no el «<». Un
   nombre como «x</option><img src=x onerror=…>» corría en la sesión del DUEÑO, dentro de
   HtmlService, donde google.script.run llama cualquier función global del script. Se escapa
   al pegar, también dentro de value="…" y data-*: el navegador lo desescapa al leerlo, así
   que el formulario sigue mandando el folio tal cual. */
function escaparHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function opciones(arr, sel) {
  return arr.map(function (o) {
    return '<option' + (o === sel ? ' selected' : '') + '>' + escaparHtml(o) + '</option>';
  }).join('');
}

function hoy() {
  return Utilities.formatDate(new Date(),
      SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function pesos(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fechaDe(s) {
  if (!s) return '';
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function hojaVentas() {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  if (!h) throw new Error('No encuentro la pestaña "Ventas".');
  return h;
}

/* ── El folio no se repite nunca, aunque se borre la fila ─────────────────────────────
   Hasta puente-sheets-5 el folio nuevo era «el más alto que se ve, más uno». Si alguien
   borraba la última venta, su folio volvía a repartirse a la siguiente, y el teléfono que
   todavía tenía el proyecto de la borrada —con ese folio como id de su fila— escribía su
   etapa y su dirección encima de la venta nueva, sin que nada fallara.

   Ahora la marca vive en las propiedades del script y solo sube. Se toca siempre con el
   candado puesto (lo tienen /empujar, alEditar, los formularios y mejorarTodo), porque dos
   que la leen a la vez sacarían el mismo número. La primera vez se siembra con todo lo que
   recuerda un folio que existió: la pestaña Ventas, su respaldo, la bitácora del puente y
   los abonos; un folio borrado antes de esta versión que no aparezca en ninguno de esos
   cuatro no se puede adivinar. */
var PROP_FOLIO = 'FOLIO_MAS_ALTO';

function folioDeNumero(n) {
  var s = String(n);
  return 'V-' + (s.length < 3 ? ('000' + s).slice(-3) : s);
}

function folioMasAltoEn(hoja, col) {
  if (!hoja) return 0;
  var n = hoja.getLastRow() - 1;
  if (n < 1) return 0;
  var max = 0;
  hoja.getRange(2, col, n, 1).getValues().forEach(function (r) {
    max = Math.max(max, numeroDeFolio(r[0]));
  });
  return max;
}

/** La marca guardada, sembrada la primera vez. Nunca por debajo de lo que la hoja ya tiene:
 *  un folio escrito a mano, o uno pegado, puede ir adelante de ella. */
function marcaDeFolios(h) {
  var ss = SpreadsheetApp.getActive();
  var alto = Number(PropertiesService.getScriptProperties().getProperty(PROP_FOLIO)) || 0;
  if (!alto) {
    alto = Math.max(folioMasAltoEn(ss.getSheetByName('Ventas (respaldo)'), 1),
                    folioMasAltoEn(ss.getSheetByName(BITACORA), 3),
                    folioMasAltoEn(ss.getSheetByName(ABONOS), 1));
  }
  h.getRange(2, 1, FIN - 1, 1).getValues().forEach(function (r) {
    alto = Math.max(alto, numeroDeFolio(r[0]));
  });
  return alto;
}

/** Reparte k folios nuevos y sube la marca. Hay que llamarla con el candado puesto. */
function reservarFolios(h, k) {
  if (!(k > 0)) return [];
  var alto = marcaDeFolios(h);
  var out = [];
  for (var i = 0; i < k; i++) { alto++; out.push(folioDeNumero(alto)); }
  PropertiesService.getScriptProperties().setProperty(PROP_FOLIO, String(alto));
  return out;
}

function siguienteFolio(h) { return reservarFolios(h, 1)[0]; }

/** Un teléfono que pregunta por un folio que la hoja ya no tiene prueba que ese folio
 *  existió: la marca no puede quedar por debajo de él, o se le daría a una venta nueva. */
function recordarFolio(h, folio) {
  var n = numeroDeFolio(folio);
  if (!(n > 0)) return;
  var alto = marcaDeFolios(h);
  /* Un folio muy por delante de la marca no es una venta que existió: es un dato malo. */
  if (n > alto + 1000) return;
  PropertiesService.getScriptProperties().setProperty(PROP_FOLIO, String(Math.max(alto, n)));
}

/* ================== 1. NUEVA VENTA ================== */
function dialogoVenta() {
  var c =
    '<h2>Registrar nueva venta</h2>' +
    '<p class="sub">Se agrega al final de la pestaña Ventas con folio nuevo.</p>' +
    '<label>Proyecto</label>' +
    '<input id="proyecto" placeholder="Cliente - Negocio" autofocus>' +
    '<div class="fila"><div><label>Cuenta de cobro</label>' +
    '<select id="cuenta">' + opciones(CUENTAS, 'Elias BBVA') + '</select></div>' +
    '<div><label>Estatus</label><select id="estatus">' + opciones(ESTATUS, 'FABRICACION') +
    '</select></div></div>' +
    '<div class="fila"><div><label>Tipo de trabajo</label>' +
    '<select id="tipo"><option value=""></option>' + opciones(TIPOS) + '</select></div>' +
    '<div><label>¿Lleva IVA?</label><select id="iva">' + opciones(['No', 'Sí']) +
    '</select></div></div>' +
    '<div class="fila"><div><label>Subtotal (sin IVA)</label>' +
    '<input id="subtotal" type="number" step="0.01" placeholder="0.00"></div>' +
    '<div><label>Anticipo recibido</label>' +
    '<input id="anticipo" type="number" step="0.01" placeholder="0.00"></div></div>' +
    '<div class="fila"><div><label>Fecha de anticipo</label>' +
    '<input id="fecha" type="date" value="' + hoy() + '"></div>' +
    '<div><label>Fecha de instalación</label><input id="instalacion" type="date"></div></div>' +
    /* Los datos para la entrega (puente-sheets-13). Hasta la 12 este formulario no los pedía, y
       la venta llegaba a los teléfonos sin teléfono ni dirección: el día de instalar había que
       sacarlos de WhatsApp. Teléfono y entrega son obligatorios, como en «Se ganó» de la
       plataforma; la dirección y el link, no —se pueden conseguir después, y la plataforma los
       pide en «Faltan datos» del Tablero—. */
    '<h3 class="sec">Datos para la entrega</h3>' +
    '<div class="fila"><div><label>Teléfono del cliente *</label>' +
    '<input id="telefono" type="tel" inputmode="tel" maxlength="30" placeholder="33 1234 5678"></div>' +
    '<div><label>Cómo se entrega *</label><select id="entrega">' + opciones(ENTREGAS, 'Instalación') +
    '</select></div></div>' +
    '<div id="conDir"><label id="dirL">Dirección</label>' +
    '<textarea id="direccion" rows="2" maxlength="400" placeholder="Calle y número, colonia, ciudad"></textarea></div>' +
    '<div id="conMaps"><label>Link de Maps (opcional; el de WhatsApp sirve)</label>' +
    '<input id="maps" inputmode="url" placeholder="https://maps.app.goo.gl/…"></div>' +
    '<p id="taller" class="sub" style="display:none;margin-top:8px">Lo recoge en el taller: no hace falta la dirección del cliente.</p>' +
    '<div class="pie"><button onclick="enviar()">Registrar</button>' +
    '<button class="gris" onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div id="msg" class="aviso"></div>' +
    '<script>' +
    /* Lo que se pide según la entrega, sin recargar: con instalación dirección y link; con
       paquetería el destino; con recolección nada. */
    'function pinta(){var e=entrega.value;' +
    ' conDir.style.display=e==="Recolección en taller"?"none":"";' +
    ' conMaps.style.display=e==="Instalación"?"":"none";' +
    ' taller.style.display=e==="Recolección en taller"?"":"none";' +
    ' dirL.textContent=e==="Paquetería"?"Destino del envío":"Dirección";}' +
    'entrega.addEventListener("change",pinta);pinta();' +
    'function enviar(){' +
    ' var e=entrega.value;' +
    ' var d={proyecto:proyecto.value.trim(),cuenta:cuenta.value,estatus:estatus.value,' +
    ' tipo:tipo.value,iva:iva.value,subtotal:subtotal.value,anticipo:anticipo.value,' +
    ' fecha:fecha.value,instalacion:instalacion.value,telefono:telefono.value.trim(),entrega:e,' +
    ' direccion:e==="Recolección en taller"?"":direccion.value.trim(),maps:e==="Instalación"?maps.value.trim():""};' +
    ' if(!d.proyecto){aviso("Falta el nombre del proyecto.",false);return;}' +
    ' if(!d.subtotal){aviso("Falta el subtotal.",false);return;}' +
    ' if((d.telefono.match(/\\d/g)||[]).length<10){aviso(d.telefono?"Ese teléfono no tiene los 10 dígitos.":"Falta el teléfono del cliente.",false);telefono.focus();return;}' +
    ' document.querySelector("button").disabled=true;' +
    ' if(d.maps)aviso("Leyendo el link de Maps…",true);' +
    ' google.script.run.withSuccessHandler(function(r){' +
    '   aviso("Listo: "+r.folio+" registrado en la fila "+r.fila+"."+(r.nota?" "+r.nota:""),true);' +
    '   setTimeout(google.script.host.close,r.nota?5200:1400);})' +
    '  .withFailureHandler(function(e){aviso(e.message,false);' +
    '   document.querySelector("button").disabled=false;})' +
    '  .guardarVenta(d);}' +
    'function aviso(t,ok){var m=document.getElementById("msg");' +
    ' m.textContent=t;m.className="aviso "+(ok?"ok":"mal");}' +
    '</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 760), 'Nueva venta');
}

function guardarVenta(d) {
  /* Los datos para la entrega se revisan y el link se lee ANTES del candado: seguir un link
     corto es salir a Google, y eso puede tardar un par de segundos que una subida del puente no
     tiene por qué esperar. Si falta el teléfono o la entrega, no se registra nada. */
  var entrega = datosDeEntregaDelDialogo_(d);
  /* Con candado: una subida del puente en el mismo segundo tomaría la misma fila libre. */
  return conCandado(function () { return guardarVentaConCandado_(d, entrega); });
}

/* ── Los datos para la entrega del diálogo (puente-sheets-13) ───────────────────────────────
   Las mismas reglas que «Se ganó» de la plataforma (js/datos/datos-de-entrega.js): teléfono con
   10 dígitos o más, limpio como lo limpia el puente (telefonoLimpio); la entrega, una de las
   tres de la lista (entregaDeCelda); la dirección solo si no es recolección; y el link solo si
   se instala, leído con ubicacionDeLiga_ —el mismo camino que /expandir—. Si el link no se pudo
   leer, la venta se registra igual y el link se queda en Ubicación: la plataforma lo vuelve a
   intentar en cada sincronización. */
function datosDeEntregaDelDialogo_(d) {
  var x = d || {};
  var tel = telefonoLimpio(x.telefono);
  if (!tel) throw new Error('Falta el teléfono del cliente.');
  if (tel.replace(/\D/g, '').length < 10) throw new Error('Ese teléfono no tiene los 10 dígitos.');
  var ent = entregaDeCelda(x.entrega);
  if (!ent) throw new Error('Falta decir cómo se entrega: Instalación, Paquetería o Recolección en taller.');
  var dir = ent === 'Recolección en taller' ? '' : String(x.direccion || '').trim().slice(0, 400);
  var ub = { ok: true, ubicacion: '' };
  if (ent === 'Instalación' && String(x.maps || '').trim()) ub = ubicacionDeLiga_(x.maps);
  return { telefono: tel, entrega: ent, direccion: dir, ubicacion: ub };
}

function guardarVentaConCandado_(d, entrega) {
  var h = hojaVentas();
  /* La misma fila libre que usa el puente, y limpia: una fila sin proyecto puede traer restos
     de otra venta en las columnas de dinero o del puente, y la venta nueva los heredaba. */
  var fila = primeraFilaLibre(h);
  if (!fila) throw new Error('Ya no hay filas libres antes de la ' + FIN +
      '. Amplía los rangos de las fórmulas.');
  limpiarFila(h, fila);

  var folio = siguienteFolio(h);
  h.getRange(fila, 1).setValue(folio);
  h.getRange(fila, 2).setValue(d.proyecto);
  h.getRange(fila, 4).setValue(d.cuenta);
  h.getRange(fila, 3).setValue(d.estatus);
  if (d.tipo) h.getRange(fila, 5).setValue(d.tipo);
  h.getRange(fila, 6).setValue(d.iva);
  h.getRange(fila, 7).setValue(Number(d.subtotal) || 0);
  if (d.anticipo) h.getRange(fila, 9).setValue(Number(d.anticipo));
  if (d.fecha) h.getRange(fila, 12).setValue(fechaDe(d.fecha));
  if (d.instalacion) h.getRange(fila, 13).setValue(fechaDe(d.instalacion));
  var nota = entrega ? escribirDatosDeEntrega_(h, fila, entrega) : '';

  SpreadsheetApp.getActive().setActiveSheet(h);
  aplicarIva(h, fila);
  SpreadsheetApp.flush();
  ordenarVentas(h);
  fila = filaPorFolio(h, folio) || fila;

  h.setActiveRange(h.getRange(fila, 2));
  return { folio: folio, fila: fila, nota: nota };
}

/* AC la dirección, AB la ubicación («lat,lng», o el link que no se pudo leer), AE el teléfono en
   texto sin formato —un «+52…» en una celda normal Sheets lo vuelve número— y AF la entrega. Una
   hoja sin AE o sin AF (falta correr «3 · Preparar la hoja para el puente») no truena: la venta
   se registra y la frase de vuelta dice qué no se guardó. Los textos libres llevan el apóstrofo
   de textoProtegido: una dirección que empieza con «=» sería una fórmula. */
function escribirDatosDeEntrega_(h, fila, x) {
  var falto = [], nota = [];
  if (x.direccion) h.getRange(fila, COL['Direccion']).setValue(textoProtegido(x.direccion));
  if (x.ubicacion && x.ubicacion.ubicacion) h.getRange(fila, COL['Ubicacion']).setValue(textoProtegido(x.ubicacion.ubicacion));
  if (tieneColumnaTelefono(h)) h.getRange(fila, COL['Telefono']).setNumberFormat('@').setValue(x.telefono);
  else falto.push('el teléfono');
  if (tieneColumnaEntrega(h)) h.getRange(fila, COL['Entrega']).setValue(x.entrega);
  else falto.push('la entrega');
  /* Lo que se escribió aquí es el dato más nuevo de esa venta (puente-sheets-14). */
  var escritas = [];
  if (x.direccion) escritas.push('Direccion');
  if (x.ubicacion && x.ubicacion.ubicacion) escritas.push('Ubicacion');
  if (tieneColumnaTelefono(h)) escritas.push('Telefono');
  if (tieneColumnaEntrega(h)) escritas.push('Entrega');
  if (escritas.length) sellarFila_(h, fila, escritas, Date.now());
  if (x.ubicacion && !x.ubicacion.ok) nota.push(x.ubicacion.mensaje);
  if (falto.length) nota.push('No se guardó ' + falto.join(' ni ') + ': falta correr ⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente.');
  return nota.join(' ');
}

/* ================== 2. COBRO / LIQUIDACIÓN ================== */
function listaSaldos() {
  var d = hojaVentas().getRange(2, 1, FIN - 1, 24).getValues();
  var out = [];
  d.forEach(function (r) {
    var saldo = Number(r[10]) || 0;
    /* El estatus es C (r[2]); D (r[3]) es la cuenta. */
    if (r[1] && saldo > 0.004) {
      out.push({ folio: r[0], nombre: r[1], saldo: saldo, estatus: r[2] });
    }
  });
  out.sort(function (a, b) { return b.saldo - a.saldo; });
  return out;
}

function dialogoCobro() {
  var lista = listaSaldos();
  if (!lista.length) {
    SpreadsheetApp.getUi().alert('No hay ningún proyecto con saldo por cobrar.');
    return;
  }
  var ops = lista.map(function (p) {
    return '<option value="' + escaparHtml(p.folio) + '" data-saldo="' + escaparHtml(p.saldo) + '">' +
           escaparHtml(p.folio) + ' · ' + escaparHtml(p.nombre) + ' — ' + pesos(p.saldo) + '</option>';
  }).join('');
  var c =
    '<h2>Registrar un cobro</h2>' +
    '<p class="sub">Suma el pago a la liquidación y actualiza el estatus.</p>' +
    '<label>Proyecto con saldo</label><select id="folio">' + ops + '</select>' +
    '<div id="info" class="dato"></div>' +
    '<div class="fila"><div><label>Monto cobrado</label>' +
    '<input id="monto" type="number" step="0.01"></div>' +
    '<div><label>Fecha del cobro</label>' +
    '<input id="fecha" type="date" value="' + hoy() + '"></div></div>' +
    '<label style="margin-top:14px"><input type="checkbox" id="liquidar" checked ' +
    'style="width:auto;margin-right:7px">Marcar el proyecto como LIQUIDADO</label>' +
    '<div class="pie"><button onclick="enviar()">Registrar cobro</button>' +
    '<button class="gris" onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div id="msg" class="aviso"></div>' +
    '<script>' +
    'function pinta(){var o=folio.options[folio.selectedIndex];' +
    ' var s=Number(o.dataset.saldo);monto.value=s.toFixed(2);' +
    ' info.textContent="Saldo pendiente: $"+s.toFixed(2);}' +
    'folio.addEventListener("change",pinta);pinta();' +
    'function enviar(){' +
    ' var d={folio:folio.value,monto:monto.value,fecha:fecha.value,liquidar:liquidar.checked};' +
    ' if(!Number(d.monto)){aviso("Falta el monto.",false);return;}' +
    ' document.querySelector("button").disabled=true;' +
    ' google.script.run.withSuccessHandler(function(r){' +
    '   aviso(r,true);setTimeout(google.script.host.close,1600);})' +
    '  .withFailureHandler(function(e){aviso(e.message,false);' +
    '   document.querySelector("button").disabled=false;})' +
    '  .guardarCobro(d);}' +
    'function aviso(t,ok){var m=document.getElementById("msg");' +
    ' m.textContent=t;m.className="aviso "+(ok?"ok":"mal");}' +
    '</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 430), 'Registrar un cobro');
}

function guardarCobro(d) {
  return conCandado(function () { return guardarCobroConCandado_(d); });
}

function guardarCobroConCandado_(d) {
  var h = hojaVentas();
  var folios = h.getRange(2, 1, FIN - 1, 1).getValues();
  var fila = 0;
  for (var i = 0; i < folios.length; i++) {
    if (folios[i][0] === d.folio) { fila = i + 2; break; }
  }
  if (!fila) throw new Error('No encontré el folio ' + d.folio + '.');

  var monto = Number(d.monto);
  var previo = Number(h.getRange(fila, 10).getValue()) || 0;
  h.getRange(fila, 10).setValue(previo + monto);
  if (d.fecha) h.getRange(fila, 14).setValue(fechaDe(d.fecha));
  /* En la columna del ESTATUS (C), no en la 4. La 4 es D, la cuenta: «Registrar un cobro»
     escribía LIQUIDADO encima de la cuenta, la venta seguía abierta y la siguiente subida de
     cualquier teléfono —normalizarIvaActivos corre en cada /empujar— le cambiaba el IVA a
     «Sí» porque «LIQUIDADO» no es Elias BBVA: un saldo fantasma del 16 % en una venta cobrada. */
  if (d.liquidar) h.getRange(fila, COL['Estatus']).setValue('LIQUIDADO');
  SpreadsheetApp.flush();

  var resta = Number(h.getRange(fila, 11).getValue()) || 0;
  /* Y se reacomoda, igual que cuando el estatus cambia a mano: liquidada se va con las
     liquidadas. */
  if (d.liquidar) ordenarVentas(h);
  return 'Cobro de ' + pesos(monto) + ' registrado en ' + d.folio + '. ' +
         (resta > 0.004 ? 'Todavía quedan ' + pesos(resta) + '.' : 'Queda en ceros.');
}

/* ================== 3. ABONO DE COMISIÓN ================== */
function listaPendientesComision() {
  var d = hojaVentas().getRange(2, 1, FIN - 1, 24).getValues();
  var out = [];
  d.forEach(function (r) {
    var pend = Number(r[19]) || 0;
    if (r[1] && pend > 0.004) out.push({ folio: r[0], nombre: r[1], pend: pend });
  });
  out.sort(function (a, b) { return b.pend - a.pend; });
  return out;
}

function dialogoAbono() {
  var lista = listaPendientesComision();
  if (!lista.length) {
    SpreadsheetApp.getUi().alert('No hay comisiones pendientes.');
    return;
  }
  var ops = lista.map(function (p) {
    return '<option value="' + escaparHtml(p.folio) + '" data-p="' + escaparHtml(p.pend) + '">' +
           escaparHtml(p.folio) + ' · ' + escaparHtml(p.nombre) + ' — ' + pesos(p.pend) + '</option>';
  }).join('');
  var c =
    '<h2>Registrar abono de comisión</h2>' +
    '<p class="sub">Cada abono queda como renglón propio en la pestaña de abonos.</p>' +
    '<label>Proyecto con comisión pendiente</label><select id="folio">' + ops + '</select>' +
    '<div id="info" class="dato"></div>' +
    '<div class="fila"><div><label>Importe del abono</label>' +
    '<input id="monto" type="number" step="0.01"></div>' +
    '<div><label>Fecha</label><input id="fecha" type="date" value="' + hoy() + '"></div></div>' +
    '<label>Nota (opcional)</label><input id="nota" placeholder="Transferencia, efectivo...">' +
    '<div class="pie"><button onclick="enviar()">Registrar abono</button>' +
    '<button class="gris" onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div id="msg" class="aviso"></div>' +
    '<script>' +
    'function pinta(){var o=folio.options[folio.selectedIndex];' +
    ' var p=Number(o.dataset.p);monto.value=p.toFixed(2);' +
    ' info.textContent="Comisión pendiente: $"+p.toFixed(2);}' +
    'folio.addEventListener("change",pinta);pinta();' +
    'function enviar(){' +
    ' var d={folio:folio.value,monto:monto.value,fecha:fecha.value,nota:nota.value};' +
    ' if(!Number(d.monto)){aviso("Falta el importe.",false);return;}' +
    ' document.querySelector("button").disabled=true;' +
    ' google.script.run.withSuccessHandler(function(r){' +
    '   aviso(r,true);setTimeout(google.script.host.close,1600);})' +
    '  .withFailureHandler(function(e){aviso(e.message,false);' +
    '   document.querySelector("button").disabled=false;})' +
    '  .guardarAbono(d);}' +
    'function aviso(t,ok){var m=document.getElementById("msg");' +
    ' m.textContent=t;m.className="aviso "+(ok?"ok":"mal");}' +
    '</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 460), 'Abono de comisión');
}

function guardarAbono(d) {
  /* Con candado: un abono que sube del puente en el mismo segundo tomaría el mismo renglón. */
  return conCandado(function () { return guardarAbonoConCandado_(d); });
}

function guardarAbonoConCandado_(d) {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(ABONOS);
  if (!h) throw new Error('No encuentro la pestaña "' + ABONOS + '".');
  var fila = filaLibreEnAbonos(h, 1);
  if (!fila) throw new Error('Ya no hay renglones libres en la pestaña de abonos.');

  h.getRange(fila, 1).setValue(d.folio);
  h.getRange(fila, 3).setValue(Number(d.monto));
  if (d.fecha) h.getRange(fila, 4).setValue(fechaDe(d.fecha));
  if (d.nota) h.getRange(fila, 5).setValue(d.nota);
  SpreadsheetApp.flush();
  return 'Abono de ' + pesos(Number(d.monto)) + ' registrado en ' + d.folio + '.';
}

/* ================== 4. TOKENS DEL PUENTE ================== */
function dialogoTokens() {
  var props = PropertiesService.getScriptProperties();
  var crudo = props.getProperty('PUENTE_TOKENS');
  if (!crudo) { configurarTokensDelPuente_(); crudo = props.getProperty('PUENTE_TOKENS'); }
  var mapa = JSON.parse(crudo);
  var porRol = {};
  Object.keys(mapa).forEach(function (t) { porRol[mapa[t]] = t; });

  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }

  var filas = ['direccion', 'fabricacion', 'pagos'].map(function (rol) {
    return '<label>' + rol.charAt(0).toUpperCase() + rol.slice(1) + '</label>' +
           '<input readonly value="' + escaparHtml(porRol[rol] || '') + '" onclick="this.select()">';
  }).join('');

  var c =
    '<h2>El puente</h2>' +
    '<p class="sub">Lo normal es entrar con Google: cada persona entra con su cuenta y su ' +
    'rol sale de la pestaña «Accesos». Estos tokens son la salida de emergencia, para el día ' +
    'que Google no conteste: se pegan en Ajustes &rsaquo; El puente.</p>' +
    '<label>Liga del puente</label>' +
    '<input readonly value="' + escaparHtml(url) + '" onclick="this.select()">' +
    (url ? '' : '<div class="aviso mal">Todavía no hay una implementación publicada. ' +
                'Ve a Extensiones &rsaquo; Apps Script &rsaquo; Implementar &rsaquo; ' +
                'Nueva implementación &rsaquo; Aplicación web.</div>') +
    '<div style="margin-top:16px"></div>' + filas +
    '<div class="dato">El token decide el rol, y el rol decide qué puede escribir ese ' +
    'teléfono. Fabricación mueve la obra pero no toca dinero; pagos cobra pero no mueve ' +
    'la obra; dirección puede todo.</div>' +
    '<div class="pie"><button class="gris" onclick="google.script.host.close()">Cerrar</button>' +
    '<button onclick="rotar()">Generar tokens nuevos</button></div>' +
    '<div id="msg" class="aviso"></div>' +
    '<script>' +
    'function rotar(){ if(!confirm("Los tokens de los tres teléfonos dejarán de servir ' +
    'hasta que pegues los nuevos. ¿Seguro?")) return;' +
    ' google.script.run.withSuccessHandler(function(){ google.script.host.close(); })' +
    '  .rotarTokensDelPuente(); }' +
    '</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 520), 'El puente a la hoja');
}

/* ============================================================================
   EL PUENTE — versión Google Sheets. Reemplaza al Worker de Cloudflare.

   Por qué ya no hace falta Cloudflare: el Worker existía porque el token de
   Notion era de escritura total sobre el workspace y no podía vivir en un HTML
   publicado en GitHub Pages. Este Web App corre DENTRO de la hoja, con los
   permisos de su dueño. No hay secreto que esconder, así que no hay dónde
   esconderlo. Lo único que viaja es un token de dispositivo, que solo sirve
   para decidir el rol.

   Habla los mismos caminos que hablaba el Worker, con las mismas formas de
   respuesta, para que la plataforma no note el cambio:
     /salud     estado y lista de lo que este rol puede escribir
     /esquema   qué columnas le faltan a la hoja (las detecta, no las crea)
     /jalar     el espejo del dinero, paginado
     /empujar   hasta 25 operaciones, filtradas por la lista blanca del rol
     /expandir  sigue una liga corta de Maps hasta la larga
     /empujar_almacen, /jalar_almacen   el almacén, el catálogo y las listas de compra (desde la 9)

   ── TODO ENTRA POR POST, Y ESO ES A PROPÓSITO ───────────────────────────────
   Apps Script no contesta el preflight de CORS —un Web App solo expone doGet y
   doPost— así que toda petición tiene que quedarse dentro de las «simples» de
   CORS. Eso deja dos caminos para el token: la URL, o el cuerpo de un POST con
   `text/plain`. Se eligió el cuerpo.

   Un token en la URL se queda escrito en el historial del navegador, en los
   registros de cualquier proxy que lo vea pasar, y se va en la cabecera
   `Referer` si la página navega a otro lado. En el cuerpo de un POST no le pasa
   nada de eso. Por eso `doGet` no atiende nada: si alguien llega por GET, no es
   la plataforma.
   ============================================================================ */

/* Sube con cada cambio de CONTRATO —qué columnas hay, qué signo lleva una cifra, qué puede
   escribir cada rol—. La plataforma la compara con la suya al «Probar» y lo dice si la hoja
   se quedó con una implementación vieja.
   puente-sheets-4: «Pago Pendiente» baja con el signo de la hoja (positivo = te deben), y
   entra la columna AD «Porcentaje comision» —que viaja, pero no cambia la comisión: la de
   AL3D es 10 % fijo del subtotal—.
   puente-sheets-5: el rol puede salir de la IDENTIDAD de Google además del token de
   dispositivo. La lista de quién es quién vive en la pestaña «Accesos» de esta hoja.
   puente-sheets-6 (23 de septiembre de 2026): Y:AD viajan con su fila al reacomodar; un
   cambio contra una venta que ya no está vuelve NO_ENCONTRADO en vez de crear una fila sin
   nombre; el folio no se reparte dos veces; «Folio cotizacion» no se pisa en un cambio;
   /empujar le devuelve a cada rol solo lo que puede ver; /jalar manda la hoja entera en una
   página; un tropiezo de Google al verificar la identidad ya no se guarda como un «no»; y la
   hora de instalación baja como «HH:MM» aunque Sheets la haya vuelto hora (AA va en '@').
   puente-sheets-7: el notario y la IA. Autorizar un precio se sella aquí —/autorizar, con la
   cuenta de Google de dirección y el catálogo recalculado— y se comprueba con /verificar, que
   es pública; las solicitudes viajan con /solicitar, /pendientes y /estado. Y las llaves de
   IA se mudaron de los teléfonos a las propiedades de este script: /ia llama por ellos.
   puente-sheets-8 (1 de octubre de 2026): el sello firma también los RENGLONES —descripción,
   cantidad e importe de cada partida, tal como los imprime el PDF—, que se guardan en la columna
   «Renglones» de «Autorizaciones»; /verificar los devuelve para compararlos con el papel. Un
   sello de antes, sin renglones guardados, sigue verificando y dice que solo responde del total.
   puente-sheets-9: el almacén, el catálogo de material y las listas de compra tienen pestaña
   («Almacén», «Catálogo de material», «Listas de compra») y viajan por /empujar_almacen y
   /jalar_almacen (ver la sección del almacén, al final). Hasta la 8 se quedaban apartados en
   cada teléfono.
   puente-sheets-10 (7 de octubre de 2026): /carpetas. La plataforma enseña, en la ficha de cada
   proyecto, su carpeta de «Trabajos Pendientes» en Drive —el PDF de órdenes de fabricación y los
   .cdr— para abrirlos desde cualquier teléfono; y /crear_carpeta, con la que el teléfono de
   Dirección le abre su carpeta al proyecto en fabricación que todavía no la tiene. Pide permiso
   de Drive: al pegar esta versión Google vuelve a pedir la autorización.
   puente-sheets-11 (9 de octubre de 2026): el teléfono del cliente, columna AE «Telefono». Hasta
   la 10 vivía solo en el teléfono que ganó la cotización: el instalador que tenía que llamar para
   confirmar y quien cobra por WhatsApp se lo tenían que pedir a Elías. Ahora viaja como las otras
   del puente, con su fila, y lo leen y escriben los tres roles. Una hoja que todavía no tiene la
   columna no truena: /jalar lee hasta donde haya y una escritura del teléfono se rechaza con su
   razón (ver anchoDelPuente). La crea «3 · Preparar la hoja para el puente».
   puente-sheets-12 (9 de octubre de 2026): cómo se entrega el trabajo, columna AF «Entrega», con
   lista cerrada «Instalación» / «Paquetería» / «Recolección en taller». Hasta la 11 todo se daba
   por instalado: AVIDA Market, que se manda por paquetería a Puerto Vallarta, salía en el mapa
   como «sin ubicar» y en el calendario como instalación. Vacía es Instalación, que es lo de
   siempre. La leen los tres roles y la escriben dirección y fabricación; pagos no decide cómo
   sale un trabajo del taller. Viaja con su fila como AE, y una hoja sin la columna no truena:
   se lee hasta donde haya y una escritura de la entrega se rechaza con su razón. La crea
   «3 · Preparar la hoja para el puente».
   puente-sheets-13 (9 de octubre de 2026): los datos para la entrega al registrar la venta.
   «⚡ AL3D → Registrar nueva venta» pide el teléfono del cliente y cómo se entrega
   (obligatorios), la dirección y el link de Maps; lee el link —el corto de WhatsApp también,
   con la misma lógica de /expandir (expandirLiga_)— y escribe «lat,lng» en Ubicación AB, la
   dirección en AC, el teléfono en AE (texto) y la entrega en AF. Hasta la 12 ese formulario no
   los pedía y las ventas registradas aquí llegaban a los teléfonos sin ellos. Ninguna columna
   nueva: no hace falta volver a correr «Preparar la hoja».
   puente-sheets-14 (10 de octubre de 2026): una sola sincronización para todo el equipo. Viajan
   en los dos sentidos la etapa de obra, las notas (AG, nueva), el plazo de taller (AH, nueva), la
   fecha y la hora de instalación —también cuando se mueven o se cancelan—, y las correcciones del
   teléfono, la dirección, la ubicación y la entrega. Quién gana: el cambio más reciente, dato por
   dato, con la hora de cada cambio guardada en «Sellos» (AI, nueva y oculta; ver SELLADAS). Lo
   que se teclea a mano en esas columnas también se sella (alEditar). Ninguna pestaña nueva. Una
   hoja sin AG:AI no truena: /jalar baja hasta AF y las notas y el plazo se rechazan con su razón.
   Las crea «3 · Preparar la hoja para el puente». */
var PUENTE_VERSION = 'puente-sheets-14';
var BITACORA = 'Bitácora del puente';

/* ── Entrar con Google ─────────────────────────────────────────────────────
   Las apps de las que este puente acepta un token. NO son secretos —viajan en cada petición
   y Google los diseñó públicos— pero sí son la comprobación que no se puede saltar: al
   verificar el token se exige que su AUDIENCIA sea una de éstas. Sin eso, un token que
   Google emitió para CUALQUIER otra app del mundo serviría para entrar aquí, porque todos
   los verifica el mismo Google, y esa otra app la registra cualquiera en dos minutos.

   Es una LISTA y no un solo valor porque cada plataforma necesita su propio identificador:
   hoy está el de la app web, y el día que exista la de Android se agrega el suyo aquí —un
   renglón— sin tocar nada más. Con un solo valor, esa app quedaría rechazada sin que el
   síntoma se pareciera a la causa.

   Lista vacía = entrar con Google apagado, y el puente sigue funcionando con los tokens de
   dispositivo de siempre. */
var PUENTE_CLIENT_IDS = [
  /* Aplicación web · orígenes https://eliasgaribi-ctrl-z.github.io y https://cotizador-al3d.pages.dev */
  '1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com'
];

/* Quién es quién. Una pestaña normal de esta hoja, con dos columnas: Correo y Rol. Es una
   pestaña y no un diálogo ni una constante del código por la razón de siempre en este
   sistema: la pantalla de administración es la Hoja. Agregar a alguien del equipo es
   escribir un renglón —sin tocar código, sin volver a implementar— y quitarle el acceso es
   borrarlo. Y queda a la vista de quien abra la hoja, que es lo que hace que alguien note
   un correo que no debería estar ahí. */
var HOJA_ACCESOS = 'Accesos';

/* Los nombres siguen siendo los de Notion a propósito: la plataforma los tiene
   escritos en su propio código y en los datos que ya guardó en los teléfonos.
   Cambiarlos aquí obligaría a una migración del lado del teléfono por puro
   gusto. Lo que cambió es dónde viven, no cómo se llaman. */
var COL = {
  'Proyecto':                      2,   // B
  'Cuenta ':                       4,   // D   (con espacio final, como en Notion)
  'Estatus':                       3,   // C
  'Tipo de trabajo':               5,   // E
  'IVA':                           6,   // F
  'Precio Subtotal':               7,   // G
  'Precio Neto ':                  8,   // H   fórmula
  'Anticipo':                      9,   // I
  'Liquidacion':                  10,   // J
  'Pago Pendiente':               11,   // K   fórmula (positivo = falta cobrar, igual que en la hoja)
  'Fecha Anticipo e Instalacion': 12,   // L
  'Fecha instalacion':            13,   // M
  'Fecha Liquidacion':            14,   // N
  'Comisiones':                   18,   // R   fórmula
  'Abono Comision':               19,   // S   fórmula: suma de la pestaña de abonos
  'Comision Restante':            20,   // T   fórmula
  'Folio cotizacion':             25,   // Y
  'Etapa de obra':                26,   // Z
  'Hora instalacion':             27,   // AA
  'Ubicacion':                    28,   // AB
  'Direccion':                    29,   // AC
  /* El % que el cotizador captura al registrar la venta, en puntos (10 = 10 %). Baja y sube
     por el puente para que el teléfono y la hoja guarden el mismo dato, pero la comisión de
     AL3D es fija —10 % del subtotal, sin IVA— y la fórmula R NO lee esta columna. Está aquí
     para el día que se pacte por venta, y ese día se cambia R. */
  'Porcentaje comision':          30,   // AD
  /* El teléfono del cliente (puente-sheets-11), como texto: «+52 1 33 1234 5678» tal cual,
     sin que Sheets lo vuelva número ni le coma el «+». No es dinero: lo ven los tres roles,
     porque el instalador llama para confirmar y quien cobra escribe por WhatsApp. */
  'Telefono':                     31,   // AE
  /* Cómo sale el trabajo del taller (puente-sheets-12): «Instalación», «Paquetería» o
     «Recolección en taller», de la lista ENTREGAS. Vacía es Instalación: es lo que eran todas
     las ventas antes de que existiera la columna. No es dinero: la ven los tres roles. */
  'Entrega':                      32,   // AF
  /* Las notas del proyecto (puente-sheets-14): lo que el taller, Pagos o Dirección le apuntan a
     la obra en la ficha. Texto libre; lo leen y lo escriben los tres roles. */
  'Notas':                        33,   // AG
  /* El plazo de taller (puente-sheets-14): cuánto se tarda el taller en hacerlo, uno de los cinco
     cubos de PLAZOS_TALLER («2 semanas»…). Vacío es «el que propone la plataforma». */
  'Plazo taller':                 34,   // AH
  /* Cuándo se cambió cada dato de la obra (puente-sheets-14), en JSON: {«Etapa de obra»: ms, …}.
     Es lo que decide quién gana cuando dos teléfonos cambian lo mismo: el cambio más reciente
     (ver SELLADAS). La escribe el puente y la pone al día alEditar; no se teclea. Oculta. */
  'Sellos':                       35    // AI
};

var COL_FOLIO = 1;                      // A — el id interno (V-001)
var ULTIMA_COL = 35;
/* Hasta dónde llega la realineación de una sola vez de Y:AD (ver realinearColumnasDelPuente).
   AE no entra —ni AF, que nació en la 12—: nació en puente-sheets-11, cuando ordenarVentas ya movía las columnas del puente
   con su fila, así que nunca estuvo revuelta y la bitácora no tiene nada que decir de ella. */
var ULTIMA_COL_REALINEABLE = 30;        // AD

/**
 * Hasta qué columna se lee y se mueve Ventas: ULTIMA_COL, recortada a las que la hoja tiene.
 * Una hoja que todavía no pasó por «Preparar la hoja para el puente» llega hasta AD, y pedirle
 * la AE truena («fuera de la hoja»): /jalar se caía entero y ningún teléfono bajaba nada. Y AE
 * cuenta solo si su encabezado dice «Telefono»: una AE que alguien usó para otra cosa antes de
 * la 11 no se lee como teléfono ni se escribe encima.
 */
function anchoDelPuente(h) {
  var ancho = Math.min(ULTIMA_COL, h.getMaxColumns());
  if (ancho >= COL['Telefono'] && !tieneColumnaTelefono(h)) ancho = COL['Telefono'] - 1;
  /* AF igual que AE (puente-sheets-12): cuenta solo con su encabezado «Entrega». Sin AE no se
     llega a preguntar: AF depende de que AE esté, y «Preparar la hoja» crea las dos juntas. */
  if (ancho >= COL['Entrega'] && !tieneColumnaEntrega(h)) ancho = COL['Entrega'] - 1;
  /* AG:AI (puente-sheets-14) van las tres juntas y cuentan solo con sus tres encabezados: una AG
     que alguien usaba para otra cosa no se lee como notas ni se escribe encima. */
  if (ancho >= COL['Notas'] && !tieneColumnasDeObra(h)) ancho = COL['Notas'] - 1;
  return ancho;
}
function tieneColumnasDeObra(h) {
  if (h.getMaxColumns() < COL['Sellos']) return false;
  var cab = h.getRange(1, COL['Notas'], 1, 3).getValues()[0].map(function (x) { return String(x).trim(); });
  return cab[0] === 'Notas' && cab[1] === 'Plazo taller' && cab[2] === 'Sellos';
}

/* ── Los cinco plazos de taller, como se leen en la columna AH (puente-sheets-14) ──────────────
   Son las etiquetas de PLAZOS de js/datos/taller.js, en el mismo orden (la plataforma guarda el
   número del cubo, 1 a 5; aquí se escribe lo que una persona entiende). pruebas/puente.mjs
   compara las dos listas. */
var PLAZOS_TALLER = ['1 semana', '1.5 semanas', '2 semanas', '2.5 semanas', '3 semanas o más'];
/* Lo tecleado a mano, a la etiqueta: «2», «2 sem», «1½», «1,5», «3+»… se leen en semanas. Lo que
   no es ninguno de los cinco sale vacío: no se inventa. La misma regla que `plazoDesdeHoja` del
   lado de la plataforma. */
function plazoDeCelda(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase().replace('½', '.5').replace(',', '.');
  if (!s) return '';
  var m = /^(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return '';
  var n = Number(m[1]);
  if (n >= 3) return PLAZOS_TALLER[4];
  for (var i = 0; i < 4; i++) if (n === [1, 1.5, 2, 2.5][i]) return PLAZOS_TALLER[i];
  return '';
}

/* ── Quién gana: el cambio más reciente, dato por dato (puente-sheets-14) ─────────────────────
   Estas son las columnas de la OBRA que cualquier teléfono puede cambiar y que todos tienen que
   ver igual. De cada una se guarda en «Sellos» (AI) CUÁNDO se cambió —la hora del teléfono en que
   la persona lo hizo, no la de llegada—, y un cambio que llega con una hora anterior a la que ya
   tiene la celda no la pisa: es el teléfono que estuvo sin señal y llega tarde con algo que otro
   ya cambió después. La fecha y la hora de instalación son UN dato (la cita) y comparten sello,
   el de «Fecha instalacion». El dinero no está aquí: de ése la hoja es la dueña y baja siempre. */
var SELLADAS = ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion',
                'Telefono', 'Entrega', 'Notas', 'Plazo taller'];
function claveDeSello_(nombre) { return nombre === 'Hora instalacion' ? 'Fecha instalacion' : nombre; }
/* Un sello del futuro (un teléfono con el reloj adelantado) ganaría para siempre. Lo más que se
   acepta es la hora de la hoja más diez minutos. */
var SELLO_HOLGURA_MS = 10 * 60 * 1000;
function selloValido_(x, ahora) {
  var n = Number(x);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), ahora + SELLO_HOLGURA_MS);
}
/** Los sellos de una fila como objeto ({} si no tiene, o si la celda no es JSON). */
function sellosDeCelda_(x) {
  var s = String(x == null ? '' : x).trim();
  if (!s) return {};
  try {
    var o = JSON.parse(s.charAt(0) === "'" ? s.slice(1) : s);
    if (!o || typeof o !== 'object') return {};
    var out = {};
    SELLADAS.forEach(function (k) { var n = Number(o[k]); if (isFinite(n) && n > 0) out[k] = Math.floor(n); });
    return out;
  } catch (e) { return {}; }
}
function sellosATexto_(o) {
  var out = {}, hay = false;
  SELLADAS.forEach(function (k) { if (o && Number(o[k]) > 0) { out[k] = Number(o[k]); hay = true; } });
  return hay ? JSON.stringify(out) : '';
}
/** Le pone a la fila el sello `ms` en esas columnas (o se lo quita, con ms = 0). Sin la columna
 *  AI no hace nada. Devuelve si escribió. */
function sellarFila_(h, fila, nombres, ms) {
  if (!tieneColumnasDeObra(h)) return false;
  var celda = h.getRange(fila, COL['Sellos']);
  var antes = sellosDeCelda_(celda.getValue());
  var s = {};
  for (var k in antes) s[k] = antes[k];
  nombres.forEach(function (n) {
    var c = claveDeSello_(n);
    if (ms > 0) s[c] = ms; else delete s[c];
  });
  var texto = sellosATexto_(s);
  if (texto === sellosATexto_(antes)) return false;
  celda.setNumberFormat('@').setValue(texto);
  return true;
}
function tieneColumnaEntrega(h) {
  if (h.getMaxColumns() < COL['Entrega']) return false;
  return String(h.getRange(1, COL['Entrega']).getValue()).trim() === 'Entrega';
}

/* Las tres maneras en que un trabajo sale del taller, EN EL ORDEN DEL DESPLEGABLE de AF. La
   plataforma tiene la misma lista (ENTREGA_A_HOJA en js/datos/puente.js) y pruebas/puente.mjs
   compara las dos: una opción escrita distinto de un lado es una celda que el otro no entiende. */
var ENTREGAS = ['Instalación', 'Paquetería', 'Recolección en taller'];
/* Lo que se teclea a mano, a la opción de la lista: sin acentos ni mayúsculas, «paqueteria» o
   «recoleccion» bastan. Lo que no es ninguna de las tres sale vacío —que se lee Instalación—,
   no se inventa. La misma regla que `entregaDesdeHoja` del lado de la plataforma. */
function entregaDeCelda(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i').replace(/[óò]/g, 'o').replace(/[úù]/g, 'u');
  if (!s) return '';
  if (/^paquet/.test(s)) return 'Paquetería';
  if (/^recole/.test(s)) return 'Recolección en taller';
  if (/^instala/.test(s)) return 'Instalación';
  return '';
}
function tieneColumnaTelefono(h) {
  if (h.getMaxColumns() < COL['Telefono']) return false;
  return String(h.getRange(1, COL['Telefono']).getValue()).trim() === 'Telefono';
}

/* Lo que se acepta como teléfono: dígitos, espacios, +, guiones y paréntesis, hasta 30. Lo
   demás —puntos, diagonales, letras— se vuelve espacio en vez de rechazar el número entero:
   «33.1234.5678» es un teléfono bueno escrito con puntos. Sin un solo dígito no es teléfono.
   La misma regla que `telefonoLimpio` en js/datos/proyectos.js; pruebas/puente.mjs las compara. */
var TEL_MAX = 30;
function telefonoLimpio(v) {
  var s = String(v == null ? '' : v).replace(/[^\d +()\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\d/.test(s)) return '';
  return s.slice(0, TEL_MAX).trim();
}

/* Se leen, no se escriben. Si llega una escritura contra ellas se rechaza con
   una razón, en vez de tragársela en silencio. */
var PUENTE_FORMULAS = {
  'Precio Neto ': 'la calcula la hoja: subtotal x IVA',
  'Pago Pendiente': 'la calcula la hoja: neto menos anticipo menos liquidación',
  'Comisiones': 'la calcula la hoja: 10% del subtotal, sin IVA',
  'Comision Restante': 'la calcula la hoja: comisión menos abonos',
  'Fecha Comision': 'ya no existe: la fecha de cada abono vive en la pestaña de abonos'
};

var ETAPAS_OBRA = ['Ganado', 'En diseño', 'Cortado', 'Armado', 'Listo para instalar',
                   'Instalado', 'En garantía', 'No se dio'];

var TIPOS_TRABAJO = ['Caja de luz con iluminacion', 'Caja de luz sin iluminacion',
                     'Letras 3D con iluminacion', 'Letras 3D sin iluminacion',
                     'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial'];

/* La única frontera de permisos real del sistema, igual que en el Worker:
   cambiar el rol en Ajustes da otro tablero, NO da permisos. */
var PUENTE_ROLES = {
  direccion: ['Proyecto', 'Precio Subtotal', 'IVA', 'Anticipo', 'Liquidacion', 'Abono Comision',
              'Estatus', 'Cuenta ', 'Fecha Anticipo e Instalacion', 'Fecha Liquidacion',
              'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
              'Ubicacion', 'Direccion', 'Tipo de trabajo', 'Porcentaje comision', 'Telefono',
              'Entrega', 'Notas', 'Plazo taller'],
  /* El teléfono, los tres (puente-sheets-11): fabricación llama al cliente para instalar y pagos
     le cobra por WhatsApp, y cualquiera de los dos puede ser quien se entera de que cambió. */
  /* La entrega (puente-sheets-12), dirección y fabricación: el taller es quien empaca o entrega en
     mostrador. Pagos la lee y no la escribe. */
  fabricacion: ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion',
                'Telefono', 'Entrega', 'Notas', 'Plazo taller'],
  /* Las notas, los tres (puente-sheets-14): son las mismas que cada rol ya escribía en la ficha. El
     plazo de taller, dirección y fabricación: lo decide quien hace el trabajo. */
  pagos: ['Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ', 'Fecha Liquidacion',
          'Porcentaje comision', 'Telefono', 'Notas']
};

/* ── Lo que cada rol puede LEER ─────────────────────────────────────────────
   Hasta la versión 2 los roles cerraban solo las escrituras: cualquier token
   bajaba el espejo del dinero completo, incluido el de fabricación, que no
   debería verlo. Se cierra aquí.

   Quitar campos no borra nada del teléfono: `deNotion` del cliente solo copia
   los que vienen (`hay(...)` antes de cada uno), así que el teléfono de
   fabricación simplemente no se entera del dinero.

   El estatus SÍ baja para todos: es una etiqueta de estado, no una cifra, y el
   tablero de obra la usa para saber qué ya se cobró y se puede cerrar. */
var CAMPOS_DE_DINERO = ['Precio Subtotal', 'Precio Neto ', 'Anticipo', 'Liquidacion',
                        'Pago Pendiente', 'Comisiones', 'Abono Comision',
                        'Comision Restante', 'Cuenta ', 'Fecha Liquidacion',
                        'Porcentaje comision'];
var VE_EL_DINERO = { direccion: true, pagos: true, fabricacion: false };

/* `/expandir` hace que el servidor salga a internet con una dirección que mandó
   quien llama. Sin esta lista, cualquiera con un token podría usar el puente
   como trampolín para tocar direcciones que él no alcanza. Solo Maps. */
var DOMINIOS_MAPS = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com',
                     'www.google.com', 'google.com', 'g.co'];

/* Un token robado no puede convertirse en un raspado de la hoja entera a
   velocidad de máquina. 60 peticiones por minuto es más de lo que tres
   teléfonos hacen trabajando, y muchísimo menos de lo que sirve para eso. */
var LIMITE_POR_MINUTO = 60;

/* ---------------------------------------------------------------- entradas */
function doGet() {
  /* A propósito: el token no viaja en la URL. Si alguien llega por GET, no es
     la plataforma. No se dice nada más para no confirmarle qué hay aquí. */
  return responder({ ok: false, codigo: 'DATO_INVALIDO',
    mensaje: 'Este puente solo atiende POST.' });
}

function doPost(e) {
  try {
    var cuerpo = {};
    var crudo = (e && e.postData && e.postData.contents) || '';
    /* 64 KB para todo menos para /ia, que lleva una imagen o un PDF dentro. Esto corre ANTES de
       saber quién llama —para eso hay que parsear—, así que el tope grande se gana con dos
       condiciones baratas y no con una búsqueda en quince megas de texto:

         · el cuerpo EMPIEZA por {"ruta":"ia" —el teléfono lo manda así (puente.js, notario.js)—.
           Una mención de "ruta":"ia" en cualquier otra parte ya no abre nada;
         · y hay cupo: un número acotado de cuerpos grandes por minuto, para todos juntos.
           Sin esto, cualquiera sin token podía mandar quince megas tras quince megas, y cada
           uno costaba un parseo antes de que el cupo por persona pudiera frenarlo.

       Y el husmeo sigue sin decidir nada: lo que enruta es el `ruta` del JSON ya parseado. */
    var tope = 65536;
    if (crudo.length > tope) {
      if (!/^\s*\{\s*"ruta"\s*:\s*"ia"\s*,/.test(crudo.slice(0, 80))) {
        return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
      }
      if (!cupoDeCuerposGrandes()) {
        return responder({ ok: false, codigo: 'SIN_RED', mensaje: 'La hoja está recibiendo demasiados archivos a la vez. Vuelve a intentarlo en un minuto.' });
      }
      tope = IA_MAX_CUERPO;
    }
    if (crudo.length > tope) {
      return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
    }
    try { cuerpo = JSON.parse(crudo); }
    catch (err) { return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo no es JSON.' }); }

    /* La ruta se decide UNA vez, aquí, y el tope grande se vuelve a pedir contra ELLA. El husmeo
       de arriba mira el principio del texto, y lo que enruta es otra cosa: un cuerpo de quince
       megas que empezaba con {"ruta":"ia","ruta":"empujar",…} (JSON.parse se queda con la última
       llave repetida), o uno que empezaba bien pero llegaba a /exec/empujar (pathInfo manda),
       pasaba el husmeo y llegaba entero a cualquier ruta. */
    var ruta = String((e && e.pathInfo) || (cuerpo && cuerpo.ruta) || '')
                 .replace(/^\/+|\/+$/g, '') || 'salud';
    if (crudo.length > 65536 && ruta !== 'ia') {
      return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
    }

    /* /verificar es la única ruta abierta al público, sin pedir quién eres: la abre el QR de un PDF desde el
       teléfono de un cliente. Va antes de las dos puertas, con su propio cupo. */
    if (ruta === 'verificar') {
      return responder(rutaVerificar_(cuerpo));
    }

    /* /espejo tampoco pide quién eres, y por una razón distinta: no la llama ningún teléfono ni
       ninguna persona, la llama la función `espejo` de la base de datos, y se presenta con un secreto
       compartido que rutaEspejo_ compara ella misma. Va antes de las dos puertas porque un token de
       dispositivo o una cuenta de Google no sirven aquí, y el secreto no sirve en ninguna otra ruta. */
    if (ruta === 'espejo') {
      return responder(rutaEspejo_(cuerpo));
    }

    /* Las dos puertas, en este orden. La identidad manda cuando viene: es la que sabe QUIÉN
       está del otro lado, mientras que el token solo sabe qué aparato es. El token queda de
       reserva para el día en que Google no conteste —una sesión caducada, un consentimiento
       que se cayó, un navegador que bloquea la ventana— y para los aparatos que todavía no
       han entrado. Las dos llegan en la misma petición: preguntar antes cuál usar costaría
       una vuelta de red por operación. */
    var gtok = String((cuerpo && cuerpo.google_token) || '');
    var token = String((cuerpo && cuerpo.token) || '');
    var ingreso = gtok ? identidadDelIngreso(gtok) : null;
    var rol = ingreso ? ingreso.rol : rolDelToken(token);
    if (!rol) {
      return responder({ ok: false, codigo: 'ROL_SIN_PERMISO',
        mensaje: gtok
          ? 'Entraste con Google, pero ese correo no está en la pestaña «Accesos» de la hoja. Pídele a Dirección que te agregue.'
          : 'Este teléfono no tiene un token válido del puente. Pégalo otra vez en Ajustes.' });
    }
    /* El cupo se cuenta por quien llama, y quien llama es el correo cuando se entró con
       Google: contarlo por token dejaría a los tres aparatos de una persona compartiendo
       cupo, y a dos personas del mismo aparato sin cupo propio. */
    if (!dentroDelLimite(ingreso ? 'g:' + ingreso.correo : token)) {
      return responder({ ok: false, codigo: 'SIN_RED',
        mensaje: 'Demasiadas peticiones seguidas desde este teléfono. Espera un minuto.' });
    }

    if (ruta === 'salud')    return responder(rutaSalud_(rol, ingreso ? 'google' : 'token', ingreso ? ingreso.correo : ''));
    if (ruta === 'esquema')  return responder(rutaEsquema_());
    if (ruta === 'jalar')    return responder(rutaJalar_(cuerpo, rol));
    if (ruta === 'empujar')  return responder(rutaEmpujar_(cuerpo, rol));
    if (ruta === 'expandir') return responder(rutaExpandir_(cuerpo));
    if (ruta === 'solicitar')  return responder(rutaSolicitar_(cuerpo, rol, ingreso));
    if (ruta === 'cancelar')   return responder(rutaCancelarSolicitud_(cuerpo, rol, ingreso));
    if (ruta === 'pendientes') return responder(rutaPendientes_(rol));
    if (ruta === 'estado')     return responder(rutaEstado_(cuerpo, rol, ingreso));
    if (ruta === 'autorizar')  return responder(rutaAutorizar_(cuerpo, rol, ingreso));
    if (ruta === 'rechazar')   return responder(rutaRechazar_(cuerpo, rol, ingreso));
    if (ruta === 'revocar')    return responder(rutaRevocar_(cuerpo, rol, ingreso));
    if (ruta === 'ia')         return responder(rutaIA_(cuerpo, ingreso ? 'g:' + ingreso.correo : 't:' + token));
    if (ruta === 'empujar_almacen') return responder(rutaEmpujarAlmacen_(cuerpo, rol, ingreso ? ingreso.correo : ''));
    if (ruta === 'jalar_almacen')   return responder(rutaJalarAlmacen_(cuerpo, rol));
    if (ruta === 'carpetas')        return responder(rutaCarpetas_());
    if (ruta === 'crear_carpeta')   return responder(rutaCrearCarpeta_(cuerpo, rol));

    return responder({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' });
  } catch (err) {
    /* El mensaje de una excepción puede traer pedazos de la hoja. Se anota del
       lado de acá y al de afuera se le dice que falló, sin detalles. */
    try { console.error('puente: ' + (err && err.stack || err)); } catch (_) {}
    return responder({ ok: false, codigo: 'DESCONOCIDO', mensaje: 'El puente falló procesando eso.' });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}

/* Los tokens se guardan en las propiedades del script, no en el código, para que
   no queden en el historial del repositorio.
   Se siembran desde ⚡ AL3D → Tokens del puente (configurarTokensDelPuente_). */
function rolDelToken(token) {
  if (!token || token.length < 30) return null;
  var crudo = PropertiesService.getScriptProperties().getProperty('PUENTE_TOKENS');
  if (!crudo) return null;
  var mapa;
  try { mapa = JSON.parse(crudo); } catch (e) { return null; }
  var rol = Object.prototype.hasOwnProperty.call(mapa, token) ? mapa[token] : null;
  return (rol && PUENTE_ROLES[rol]) ? rol : null;
}

/**
 * Verifica un token de acceso de Google y devuelve {correo, rol}, o null.
 *
 * Tres comprobaciones, y ninguna sobra:
 *   · Que Google lo reconozca (si no, no es un token).
 *   · Que su AUDIENCIA sea esta app. Sin esto, un token emitido para otra app cualquiera
 *     entraría aquí: los verifica el mismo Google y contestaría que es válido.
 *   · Que el correo esté verificado. Un correo sin verificar lo puede poner cualquiera.
 *
 * Se guarda en caché por lo que dura el token para no gastar una petición de red por cada
 * operación del bombeo: veinticinco operaciones serían veinticinco verificaciones idénticas.
 * La caché es del hash del token, no del token: lo que se guarda en la caché del script lo
 * puede leer cualquier otra función de este proyecto.
 */
function identidadDelIngreso(tok) {
  if (!tok || tok.length < 20 || !PUENTE_CLIENT_IDS.length) return null;
  var cache = CacheService.getScriptCache();
  var clave = 'ing_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok));
  var guardado = cache.get(clave);
  if (guardado) {
    if (guardado === '-') return null;
    var p = guardado.split('|');
    return { correo: p[0], rol: p[1] };
  }

  var correo = '';
  /* Un «no» se guarda solo cuando es un no DE VERDAD: Google dijo que el token no sirve
     (400/401), o que es de otra app, o que el correo no está verificado. Con
     `muteHttpExceptions` un 503 o un 429 de Google también llegaba aquí sin correo y se
     guardaba como «no» sesenta segundos con la misma llave: la segunda opinión de la puerta
     (puerta.js, cuatro segundos después) leía la caché, no a Google, y echaba a su dueño
     por un tropiezo. Un 5xx o un 429 no entra —la puerta sigue con llave— pero no se anota. */
  var definitivo = false;
  /* Mientras Google tropieza (5xx/429) no se le pregunta por cada token que llega: sin esto,
     cualquiera que mandara tokens inventados gastaba la cuota diaria de UrlFetch del script,
     y acabada la cuota nadie entraba con Google el resto del día. Un tropiezo suelto no pausa
     nada (la segunda opinión de puerta.js, segundos después, sí le vuelve a preguntar): cinco
     en un minuto sí, quince segundos. Y hay un tope de consultas por minuto. */
  if (Number(cache.get('ing_fallos') || 0) >= 5) return null;
  if (contarEnVentana(cache, 'ing_min', 60) > 120) return null;   // ventana fija: ver contarEnVentana
  try {
    var r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(tok),
      { muteHttpExceptions: true });
    var codigo = r.getResponseCode();
    if (codigo === 200) {
      var j = JSON.parse(r.getContentText());
      definitivo = true;
      if (PUENTE_CLIENT_IDS.indexOf(String(j.aud)) !== -1 && String(j.email_verified) === 'true') {
        correo = String(j.email || '').trim().toLowerCase();
      }
    } else if (codigo === 400 || codigo === 401) {
      definitivo = true;
    } else if (codigo === 429 || codigo >= 500) {
      cache.put('ing_fallos', String(Number(cache.get('ing_fallos') || 0) + 1), 15);
    }
  } catch (e) {
    /* Sin red del lado de la hoja no se puede verificar, y un token que no se pudo verificar
       NO entra: fallar abierto aquí sería dejar la puerta sin llave cuando falla la llave. */
    return null;
  }
  if (!correo) { if (definitivo) cache.put(clave, '-', 60); return null; }

  var rol = rolDelCorreo(correo);
  /* El no se guarda 60 segundos y el sí 300: quitarle el acceso a alguien tiene que surtir
     efecto en minutos, no en horas, y agregarlo tiene que verse casi luego. */
  cache.put(clave, rol ? (correo + '|' + rol) : '-', rol ? 300 : 60);
  return rol ? { correo: correo, rol: rol } : null;
}

/** El rol de un correo, según la pestaña «Accesos». Sin pestaña no entra nadie por Google. */
function rolDelCorreo(correo) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_ACCESOS);
  if (!h) return null;
  var n = h.getLastRow() - 1;
  if (n < 1) return null;
  var filas = h.getRange(2, 1, n, 2).getValues();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0]).trim().toLowerCase() !== correo) continue;
    var rol = String(filas[i][1]).trim().toLowerCase();
    return PUENTE_ROLES[rol] ? rol : null;
  }
  return null;
}

/** Crea la pestaña «Accesos» si no está, con el dueño de la hoja ya dentro como dirección.
 *  Idempotente: si ya existe no le toca un renglón. */
function crearHojaAccesos(ss) {
  var h = ss.getSheetByName(HOJA_ACCESOS);
  if (h) return h;
  h = ss.insertSheet(HOJA_ACCESOS);
  h.getRange('A1:C1').setValues([['Correo', 'Rol', 'Nota']]);
  h.getRange('A1:C1').setFontWeight('bold').setBackground(AZUL).setFontColor('#ffffff');
  h.setFrozenRows(1);
  h.setColumnWidth(1, 280); h.setColumnWidth(2, 130); h.setColumnWidth(3, 320);
  h.getRange(2, 2, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['direccion', 'fabricacion', 'pagos'], true)
      .setAllowInvalid(false).build());
  var yo = '';
  try { yo = Session.getEffectiveUser().getEmail() || ''; } catch (e) {}
  h.getRange('A2:C2').setValues([[yo, 'direccion', 'El dueño de la hoja. Se puso solo.']]);
  h.getRange('A4').setValue('Escribe aquí el correo de Google de cada persona y qué rol le toca. ' +
    'Entra con ese correo en la plataforma y ya: no hay que pegarle ningún token.');
  h.getRange('A4').setFontColor('#5b7fa6').setFontStyle('italic');
  return h;
}

/* ── Los cupos cuentan en ventanas FIJAS ──────────────────────────────────────────────────
   Hasta aquí cada cupo hacía «n = get() + 1; put(clave, n, 60)», y cada put le REINICIA la
   caducidad a la clave: con tráfico más seguido que el TTL el contador no volvía a cero nunca.
   Un teléfono que sincroniza cada 30 s —la app lo hace— llegaba a 60 en media hora y se quedaba
   fuera («Demasiadas peticiones seguidas») hasta pasar un minuto callado; y como el token de
   dispositivo es uno por rol, con él se quedaban fuera todos los teléfonos de ese rol. En los
   cupos de todos (ing_min, grandes, v__total) era peor: un anónimo los mantenía cerrados con
   una petición justo antes de que caducaran.
   Ahora la clave lleva el NÚMERO de ventana —Date.now() entre lo que dura— y cada ventana
   empieza en cero, pase lo que pase en la anterior. El put dura una ventana entera, que la
   cubre desde cualquier punto de ella. (En la frontera caben dos cupos seguidos: es el precio
   de la ventana fija, y sigue siendo un tope.) Devuelve la cuenta con ésta incluida. */
function contarEnVentana(cache, base, segundos) {
  var clave = base + '@' + Math.floor(Date.now() / (segundos * 1000));
  var n = Number(cache.get(clave) || 0) + 1;
  cache.put(clave, String(n), segundos);
  return n;
}

function dentroDelLimite(token) {
  try {
    var cache = CacheService.getScriptCache();
    /* La clave es el resumen del token, no el token: así no queda escrito en la
       caché de Google tal cual. */
    var clave = 'p_' + Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 24);
    return contarEnVentana(cache, clave, 60) <= LIMITE_POR_MINUTO;
  } catch (e) {
    return true;   // si la caché falla, no se deja fuera a los teléfonos
  }
}

/** Genera un token por rol y los guarda. Se corre desde ⚡ AL3D → Tokens del puente, que los
 *  enseña para pegarlos en cada teléfono.
 *
 *  Con guion bajo al final, como todo lo que devuelve un secreto (secretoDelSello_, iaLlaves_):
 *  google.script.run puede llamar CUALQUIER función global del script desde un diálogo, y una
 *  que contesta los tres tokens se los daba a cualquier guion que lograra correr en uno. El
 *  diálogo llama a rotarTokensDelPuente, que los cambia y no contesta nada. */
function rotarTokensDelPuente() { configurarTokensDelPuente_(); }
function configurarTokensDelPuente_() {
  var mapa = {}, salida = [];
  ['direccion', 'fabricacion', 'pagos'].forEach(function (rol) {
    var t = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
    mapa[t] = rol;
    salida.push(rol + ':  ' + t);
  });
  PropertiesService.getScriptProperties().setProperty('PUENTE_TOKENS', JSON.stringify(mapa));
  return salida;
}

/* ------------------------------------------------------------------ /salud */
function rutaSalud_(rol, via, correo) {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  if (!h) return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'La hoja no tiene pestaña "Ventas".' };
  return { ok: true, ts: Date.now(), version: PUENTE_VERSION, rol: rol,
           escribibles: PUENTE_ROLES[rol], destino: 'google-sheets',
           /* Para que Ajustes pueda decir «entraste como fulano@…» y no solo «Dirección»:
              con dos puertas, saber por cuál entraste es la mitad de poder arreglarlo. */
           via: via || 'token', correo: correo || '',
           /* Qué proveedores de IA tienen llave aquí. Solo si o no: la llave no sale nunca. */
           ia: iaEstado() };
}

/* ---------------------------------------------------------------- /esquema */
function rutaEsquema_() {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  var cabeceras = h.getRange(1, 1, 1, h.getMaxColumns()).getValues()[0]
      .map(function (x) { return String(x).trim(); });
  var necesarias = [
    { nombre: 'Folio cotizacion', tipo: 'texto', para: 'atar la fila al folio del cotizador (COT-0042@K7QM)' },
    { nombre: 'Etapa de obra', tipo: 'lista', para: 'en qué va la obra, que NO es el Estatus: ese es de dinero', opciones: ETAPAS_OBRA },
    { nombre: 'Fecha instalacion', tipo: 'fecha', para: 'la instalación de VERDAD, separada del anticipo' },
    { nombre: 'Hora instalacion', tipo: 'texto', para: 'HH:MM, o vacío si todavía no se sabe' },
    { nombre: 'Ubicacion', tipo: 'texto', para: 'lat,lng resueltos del link de Maps' },
    { nombre: 'Direccion', tipo: 'texto', para: 'la dirección como la mandó el cliente' },
    { nombre: 'Tipo de trabajo', tipo: 'lista', para: 'derivado de las partidas, no capturado', opciones: TIPOS_TRABAJO },
    { nombre: 'Porcentaje comision', tipo: 'número', para: 'el % que capturó el cotizador; la comisión de la hoja sigue siendo 10 % fijo' },
    { nombre: 'Telefono', tipo: 'texto', para: 'el teléfono del cliente, para llamarle o escribirle por WhatsApp (puente-sheets-11)' },
    { nombre: 'Entrega', tipo: 'lista', para: 'cómo sale el trabajo del taller; vacía es Instalación (puente-sheets-12)', opciones: ENTREGAS },
    { nombre: 'Notas', tipo: 'texto', para: 'las notas del proyecto, las mismas en todos los teléfonos (puente-sheets-14)' },
    { nombre: 'Plazo taller', tipo: 'lista', para: 'cuánto tarda el taller en hacerlo; vacío es el que propone la plataforma (puente-sheets-14)', opciones: PLAZOS_TALLER },
    { nombre: 'Sellos', tipo: 'texto', para: 'cuándo se cambió cada dato de la obra, para que gane el cambio más reciente; la escribe el puente (puente-sheets-14)' }
  ];
  var equivale = { 'Fecha instalacion': 'Fecha instalación' };
  var faltan = necesarias.filter(function (p) {
    return cabeceras.indexOf(p.nombre) === -1 && cabeceras.indexOf(equivale[p.nombre] || '(ninguna)') === -1;
  });
  /* La pestaña de accesos no es una columna, pero se revisa aquí por el mismo motivo: es lo
     que «Revisar el esquema» tiene que poder decir antes de que alguien intente entrar. */
  var sinAccesos = !SpreadsheetApp.getActive().getSheetByName(HOJA_ACCESOS);
  return { ok: true, faltan: faltan, accesos: !sinAccesos, cliente: PUENTE_CLIENT_IDS.length > 0,
    nota: faltan.length
      ? 'Córrele  prepararHojaParaElPuente()  en Apps Script y las crea con su validación.'
      : sinAccesos
        ? 'Las ' + necesarias.length + ' columnas están, pero falta la pestaña «Accesos»: sin ella nadie entra con Google. La crea  prepararHojaParaElPuente().'
        : 'La hoja ya tiene las ' + necesarias.length + ' columnas que la plataforma necesita, y la pestaña «Accesos».' };
}

/* ------------------------------------------------------------------ /jalar */
function rutaJalar_(cuerpo, rol) {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  var desde = Number((cuerpo && cuerpo.cursor) || 2);
  if (!isFinite(desde) || desde < 2) desde = 2;
  /* La hoja ENTERA en una sola página. Hasta puente-sheets-5 iba de 50 en 50 por número de
     fila, y la hoja se reacomoda sola con cada subida: una venta que pasaba de la fila 60 a
     la 40 entre la primera página y la segunda no salía en ninguna, y el teléfono, al cerrar
     el barrido, la borraba de su récord hasta el siguiente. Son 309 filas como mucho (FIN):
     cabe de sobra en una respuesta, y una sola lectura no puede ver una fila dos veces ni
     ninguna. El cursor se sigue aceptando para el teléfono que se quedó con uno a medias. */
  var tam = FIN - 1;
  var hasta = Math.min(desde + tam - 1, FIN);
  /* Hasta donde la hoja tenga: una sin AE (no ha corrido «Preparar la hoja» después de pegar la
     11) baja todo menos el teléfono, en vez de tronar. aplanarFila no le pone la llave. */
  var datos = h.getRange(desde, 1, hasta - desde + 1, anchoDelPuente(h)).getValues();
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();

  var registros = [];
  for (var i = 0; i < datos.length; i++) {
    if (!datos[i][1]) continue;                       // sin proyecto no hay fila
    registros.push({ almacen: 'proyectos', datos: sinLoQueNoLeToca(aplanarFila(datos[i], tz), rol) });
  }
  var hayMas = hasta < FIN;
  return { ok: true, registros: registros,
           cursor: hayMas ? String(hasta + 1) : null, hay_mas: hayMas };
}

function aplanarFila(fila, tz) {
  var v = function (nombre) { return fila[COL[nombre] - 1]; };
  var fecha = function (x) {
    if (!x || !(x instanceof Date)) return null;
    return Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  };
  var num = function (x) { return (x === '' || x === null) ? null : Number(x); };
  var saldo = num(v('Pago Pendiente'));

  var out = {
    id_notion: fila[COL_FOLIO - 1] || null,          // el folio interno hace de id estable
    editado: null,
    'Proyecto':                      String(v('Proyecto') || ''),
    'Cuenta ':                       String(v('Cuenta ') || '') || null,
    'Estatus':                       String(v('Estatus') || '') || null,
    'Tipo de trabajo':               desdeTexto(v('Tipo de trabajo')),
    'IVA':                           String(v('IVA')).trim() === 'Sí',
    'Precio Subtotal':               num(v('Precio Subtotal')),
    'Precio Neto ':                  num(v('Precio Neto ')),
    'Anticipo':                      num(v('Anticipo')),
    'Liquidacion':                   num(v('Liquidacion')),
    /* Con el signo de la hoja: positivo es lo que te deben. Hasta puente-sheets-3 se
       mandaba NEGADO «con el signo de Notion, para no cambiarle el significado a una cifra
       que la plataforma ya pinta» —y la plataforma nunca pintó ese signo: `saldoDe` hace
       Math.max(0, saldo), el aviso «instalado con saldo» pide saldo > 0 y el filtro de
       cobro también. Con el saldo negado la cartera entera se veía como cobrada. */
    'Pago Pendiente':                saldo,
    'Comisiones':                    num(v('Comisiones')),
    'Abono Comision':                num(v('Abono Comision')),
    'Comision Restante':             num(v('Comision Restante')),
    'Porcentaje comision':           num(v('Porcentaje comision')),
    'Fecha Anticipo e Instalacion':  fecha(v('Fecha Anticipo e Instalacion')),
    'Fecha instalacion':             fecha(v('Fecha instalacion')),
    'Fecha Liquidacion':             fecha(v('Fecha Liquidacion')),
    'Folio cotizacion':              String(v('Folio cotizacion') || ''),
    'Etapa de obra':                 String(v('Etapa de obra') || '') || null,
    /* Con String() a secas, la hora que Sheets ya había vuelto HORA llegaba a cada teléfono
       como «Sat Dec 30 1899 10:00:00 GMT-0636 …». Ver horaDeCelda. */
    'Hora instalacion':              horaDeCelda(v('Hora instalacion'), tz),
    'Ubicacion':                     String(v('Ubicacion') || ''),
    'Direccion':                     String(v('Direccion') || '')
  };
  /* El teléfono, SOLO si la fila llegó hasta AE. Sin la columna no se manda la llave —ni
     vacía—: una llave vacía es «alguien lo borró en la hoja», y una hoja que todavía no tiene
     la columna no borró nada. Un número tecleado a mano que Sheets volvió número llega como
     3312345678 y sale como texto. */
  if (fila.length >= COL['Telefono']) out['Telefono'] = telefonoLimpio(v('Telefono'));
  /* La entrega, con la misma regla (puente-sheets-12): sin AF no va la llave; con AF vacía va
     '' —que la plataforma lee como «la hoja no dice», no como «cámbialo a Instalación»—. Lo
     tecleado a mano sale ya como la opción de la lista (entregaDeCelda). */
  if (fila.length >= COL['Entrega']) out['Entrega'] = entregaDeCelda(v('Entrega'));
  /* Las notas, el plazo y los sellos (puente-sheets-14), con la misma regla: sin AG:AI no va
     ninguna de las tres llaves, y la plataforma sabe que esa fila no dice cuándo cambió nada —se
     queda con lo de antes—. Los sellos van como objeto, ya leídos. */
  if (fila.length >= COL['Sellos']) {
    out['Notas'] = String(v('Notas') == null ? '' : v('Notas'));
    out['Plazo taller'] = plazoDeCelda(v('Plazo taller'));
    out['Sellos'] = sellosDeCelda_(v('Sellos'));
  }
  return out;
}

/** Le quita al registro lo que ese rol no tiene por qué ver. */
function sinLoQueNoLeToca(fila, rol) {
  if (VE_EL_DINERO[rol]) return fila;
  CAMPOS_DE_DINERO.forEach(function (c) { delete fila[c]; });
  return fila;
}

function desdeTexto(x) {
  var s = String(x || '').trim();
  return s ? s.split(/\s*,\s*/).filter(Boolean) : [];
}

/* ── La hora de instalación, que Sheets quiere volver hora ─────────────────────────────
   AA guarda «HH:MM» como texto, pero Sheets convierte en HORA cualquier «10:00» que caiga en
   una celda que no esté en texto sin formato: el que escribía el puente con setValue, el que
   se teclea a mano y el que el reacomodo reescribe con setValues. getValues ya no devuelve
   «10:00» sino un Date del 30 de diciembre de 1899 —el día cero de Sheets— a las diez. Por eso
   las dos puntas:
     · al leer, horaDeCelda vuelve «HH:MM» lo que venga: el Date, el número (la fracción del
       día que queda si alguien pone en texto sin formato, a mano, una celda que ya era hora)
       y el texto «9:30» o «10:00:00»;
     · al escribir, la celda se pone en texto sin formato ('@') ANTES del valor, y el valor va
       ya normalizado: así la hoja guarda lo que mandó el teléfono (horasATexto, y el '@' de
       cada celda en unaOperacion).

   La zona es la de la HOJA, y no por costumbre: Apps Script arma ese Date con la zona de la
   hoja, y en 1899 México no tenía husos horarios, así que lleva la hora solar de la ciudad
   (LMT; −6:36:36 en la de México, de ahí el «GMT-0636»). Utilities.formatDate en esa MISMA
   zona le quita exactamente el desfase que le puso y da la hora que se ve en la celda.
   getHours() no sirve —usa la zona del proyecto de Apps Script, que puede ser otra—, y
   toISOString tampoco: dice 16:36.

   Los segundos llevan UNA regla, la de horaEscrita, venga la hora como Date, como fracción
   del día o como texto: se cortan, salvo a dos segundos o menos del minuto siguiente. Eso no
   es redondear, es tolerar el error de ida y vuelta —el pelo que pierde la fracción del día en
   coma flotante, un segundo del LMT—, que volvería 09:59 el 10:00 de la orden del instalador.
   Con el redondeo al minuto más cercano, el mismo «10:00:45» salía «10:01» si Sheets lo había
   vuelto hora y «10:00» si se quedó en texto, y el reacomodo dejaba escrito el «10:01». */

/** «HH:MM» de lo que mandó el teléfono o se tecleó: '' si viene vacío (todavía no se sabe),
 *  null si no es una hora. Acepta «9:30» y «10:00:00», como las teclea la gente; los segundos,
 *  con la regla de arriba. */
function horaEscrita(v) {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] || 0) > 59) return null;
  var min = (Number(m[1]) * 60 + Number(m[2]) + (Number(m[3] || 0) >= 58 ? 1 : 0)) % 1440;
  return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2);
}

/** La hora de una celda de AA como «HH:MM», sea lo que sea lo que guarde Sheets. El Date y la
 *  fracción se vuelven «H:MM:SS» y pasan por horaEscrita, para que los segundos lleven la misma
 *  regla que el texto. Un texto que no es hora se devuelve tal cual: es lo que alguien
 *  escribió y no se adivina. */
function horaDeCelda(x, tz) {
  if (x === '' || x === null || x === undefined) return '';
  if (esFecha(x)) return horaEscrita(Utilities.formatDate(x, tz, 'HH:mm:ss'));
  if (typeof x === 'number' && x >= 0 && x < 1) {
    /* Al segundo más cercano primero: 10/24 en coma flotante puede dar 35 999,9999 segundos. */
    var seg = Math.round(x * 86400) % 86400;
    return horaEscrita(Math.floor(seg / 3600) + ':' + ('0' + Math.floor(seg / 60) % 60).slice(-2) +
                       ':' + ('0' + seg % 60).slice(-2));
  }
  var s = String(x).trim(), escrita = horaEscrita(s);
  return escrita === null ? s : escrita;
}

/** Antes de reescribir AA con setValues: la columna en texto sin formato y, en `filas` —las
 *  que se van a escribir en 2..FIN, cada una empezando en la columna `desde`—, la hora como
 *  «HH:MM». El formato va primero porque con la celda en '@' Sheets guarda el texto como
 *  llega, y porque no viaja con los valores: la hora que el reacomodo bajaba a un renglón
 *  que nunca tuvo '@' se volvía hora ahí. Devuelve si cambió algún valor. */
function horasATexto(h, filas, desde) {
  var col = COL['Hora instalacion'], k = col - (desde || 1);
  if (h.getMaxColumns() < col || k < 0) return false;
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var cambio = false;
  filas.forEach(function (r) {
    if (k >= r.length) return;
    var x = horaDeCelda(r[k], tz);
    if (x !== r[k]) { r[k] = x; cambio = true; }
  });
  h.getRange(2, col, FIN - 1, 1).setNumberFormat('@');
  return cambio;
}

/* ---------------------------------------------------------------- /empujar */
function rutaEmpujar_(cuerpo, rol) {
  var ops = (cuerpo && Object.prototype.toString.call(cuerpo.ops) === '[object Array]')
    ? cuerpo.ops.slice(0, 25) : [];
  var candado = LockService.getScriptLock();
  try { candado.waitLock(20000); }
  catch (e) {
    return { ok: false, codigo: 'SIN_RED',
             mensaje: 'La hoja está ocupada con otra escritura. Se vuelve a intentar solo.' };
  }
  try {
    var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
    var resultados = [], anotaciones = [];
    /* La realineación de Y:AD NO se corre aquí. Se corría sola en la primera subida, y decide
       de quién es cada celda por el renglón que anotó la bitácora: si alguien borró o insertó
       una fila a mano después, esos renglones ya no dicen la verdad y la corrección, sin que
       nadie la viera, ponía el folio de cotización de una venta en otra. Ahora es un paso a
       mano con vista previa (revisarColumnasDelPuente → realinearColumnasDelPuente). Mientras
       no se haga, las subidas escriben por el folio de la hoja (columna A), que no se revuelve,
       y ordenarVentas no mueve filas. */
    for (var i = 0; i < ops.length; i++) resultados.push(unaOperacion(h, ops[i], rol, anotaciones));
    SpreadsheetApp.flush();
    anotar_(anotaciones);
    try { normalizarIvaActivos(h); ordenarVentas(h); } catch (e2) { /* el orden nunca tumba una escritura */ }
    return { ok: true, resultados: resultados };
  } finally {
    candado.releaseLock();
  }
}

function unaOperacion(h, op, rol, anotaciones) {
  if (!op || !op.id) {
    return { id: (op && op.id) || '?', ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Operación sin id.' };
  }
  var armado = armarCeldas(op.datos, rol);
  /* El teléfono contra una hoja que todavía no tiene AE: se rechaza con su razón y lo demás de
     la operación se escribe. Sin esto, escribir en la columna 31 de una hoja de 30 tronaba la
     subida entera —la etapa y la fecha que venían con él también se perdían—. */
  if (!tieneColumnaTelefono(h)) {
    armado.celdas = armado.celdas.filter(function (c) {
      if (c.col !== COL['Telefono']) return true;
      armado.rechazadas.push({ nombre: 'Telefono', sinColumna: true,
        por: 'la hoja todavía no tiene la columna AE «Telefono»: Dirección corre ⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente' });
      return false;
    });
  }
  /* Y la entrega contra una hoja sin AF (puente-sheets-12), igual: se rechaza sola, con su razón,
     y la etapa o la fecha que venían con ella sí se escriben. anchoDelPuente pide AE para contar
     AF, así que aquí también: sin AE, AF no se escribe aunque alguien la haya tecleado. */
  if (anchoDelPuente(h) < COL['Entrega']) {
    armado.celdas = armado.celdas.filter(function (c) {
      if (c.col !== COL['Entrega']) return true;
      armado.rechazadas.push({ nombre: 'Entrega', sinColumna: true,
        por: 'la hoja todavía no tiene la columna AF «Entrega»: falta correr Preparar la hoja (⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente)' });
      return false;
    });
  }
  /* Las notas y el plazo contra una hoja sin AG:AI (puente-sheets-14), igual que la entrega. */
  if (anchoDelPuente(h) < COL['Sellos']) {
    armado.celdas = armado.celdas.filter(function (c) {
      if (c.col !== COL['Notas'] && c.col !== COL['Plazo taller']) return true;
      armado.rechazadas.push({ nombre: nombreDeColumna(c.col), sinColumna: true,
        por: 'la hoja todavía no tiene las columnas AG:AI (notas, plazo y sellos): falta correr Preparar la hoja (⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente)' });
      return false;
    });
  }
  if (!armado.celdas.length && !armado.abono) {
    /* Si lo único que traía era el teléfono y la hoja no tiene su columna, eso es lo que se dice:
       «este teléfono no puede escribir: Telefono» mandaba a revisar el rol, que está bien. */
    var sinColumna = armado.rechazadas.length && armado.rechazadas.every(function (x) { return x.sinColumna; });
    return { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
             mensaje: sinColumna
               ? 'No se escribió ' + ({ 'Entrega': 'la entrega', 'Notas': 'la nota', 'Plazo taller': 'el plazo de taller' }[armado.rechazadas[0].nombre] || 'el teléfono') + ': ' + armado.rechazadas[0].por + '.'
               : armado.rechazadas.length
               ? 'Este teléfono no puede escribir: ' + armado.rechazadas.map(function (x) { return x.nombre; }).join(', ')
               : 'No había nada que escribir.',
             rechazadas: armado.rechazadas };
  }

  /* Antes de crear, se busca. Igual que el Worker: un reintento después de una
     respuesta perdida no puede costar una venta duplicada.
     El folio de cotización llega en los datos, o aparte en `folio_cotizacion`: el teléfono
     lo manda aparte para que sirva de identidad aunque su rol no pueda ESCRIBIR esa columna
     (fabricación no puede, y es la que más mueve la obra). */
  var fc = String((op.datos && op.datos['Folio cotizacion']) || op.folio_cotizacion || '').trim();
  var fila = 0, deOtra = '';
  if (op.id_notion) {
    fila = filaPorFolioInterno(h, String(op.id_notion));
    /* La fila con ese folio puede ser OTRA venta: un folio de una venta que se borró antes
       de que existiera la marca de folios (ver reservarFolios) pudo repartirse otra vez. Si
       la fila está atada a otro folio de cotización, no es la de este teléfono, y lo que
       manda no se escribe ahí. (Un folio de cotización igual al folio de la hoja es el que
       mandaba un proyecto importado antes de esta versión: ése no identifica nada.) */
    if (fila && fc && fc !== String(op.id_notion)) {
      var suyo = llaveDeCotizacion(h, fila);
      if (suyo && suyo !== fc) { deOtra = suyo; fila = 0; }
    }
  }
  /* Buscar por «Folio cotizacion» solo es de fiar con Y:AD ya realineadas: con la hoja
     revuelta, esa columna está en la fila de otra venta y el cambio se escribiría en ella. */
  if (deOtra && !columnasDelPuenteAlineadas()) {
    return { id: op.id, ok: false, codigo: 'ESPERA_REALINEAR',
             mensaje: 'La hoja todavía no tiene realineadas las columnas Y a AD, y la fila ' + op.id_notion +
               ' dice ser de otra cotización. Este cambio espera: Dirección tiene que correr la realineación (ver DESPLIEGUE).',
             rechazadas: armado.rechazadas };
  }
  if (!fila && fc && fc !== String(op.id_notion || '')) fila = filaPorFolioCotizacion(h, fc);
  var creada = false;
  if (!fila) {
    /* ── Se crea una fila SOLO para un alta de verdad ───────────────────────────────
       Hasta puente-sheets-5, si la búsqueda fallaba se creaba la fila con lo que viniera.
       Un cambio de etapa contra una venta que alguien borró en la hoja creaba una fila sin
       nombre —invisible para /jalar, que salta las filas sin proyecto— y la siguiente alta
       caía encima de ella heredando su estatus, su cuenta y su liquidación. Y el alta que
       manda PAGOS desde el cotizador, que no puede escribir el nombre, dejaba dinero en una
       fila sin nombre. Ahora:
         · con `id_notion` no se crea nunca: esa venta existió y ya no está, y escribir su
           cambio en otra fila sería escribirlo en la venta equivocada;
         · sin `id_notion`, solo si lo que se va a escribir trae el nombre del proyecto. */
    if (op.id_notion) {
      recordarFolio(h, String(op.id_notion));
      /* `motivo` es para la máquina: el teléfono marca el proyecto y le enseña a Dirección las
         dos salidas (volver a darla de alta o dejarla fuera). La frase se queda para las
         personas y para el teléfono que todavía la lee. El consejo de antes —«vuelve a
         registrarla desde el cotizador»— llevaba a DUPLICADO: esa cotización ya es proyecto. */
      return { id: op.id, ok: false, codigo: 'NO_ENCONTRADO', motivo: deOtra ? 'de_otra' : 'borrada',
               mensaje: (deOtra
                 ? 'La fila ' + op.id_notion + ' de la hoja ya es de otra venta (atada a ' + deOtra + ', y este cambio es de ' + fc + '). '
                 : 'La venta ' + op.id_notion + ' ya no está en la hoja: alguien borró su fila. ') +
                 'Este cambio no se escribió en ninguna otra. Si la venta sigue viva, Dirección la vuelve a dar de alta desde la ficha del proyecto en la plataforma.',
               rechazadas: armado.rechazadas };
    }
    /* Una cotización que «no se dio» no es una venta: su alta metía en el libro un
       subtotal, un anticipo que nunca se cobró y una comisión pendiente. */
    var noSeDio = armado.celdas.some(function (c) {
      return c.col === COL['Etapa de obra'] && String(c.valor).trim().toLowerCase() === 'no se dio';
    });
    if (noSeDio) {
      return { id: op.id, ok: false, codigo: 'DATO_INVALIDO',
               mensaje: 'Una cotización que no se dio no se da de alta en la hoja: no es una venta.',
               rechazadas: armado.rechazadas };
    }
    var conNombre = armado.celdas.some(function (c) {
      return c.col === COL['Proyecto'] && String(c.valor).trim() !== '';
    });
    if (!conNombre) {
      var sinPermiso = armado.rechazadas.some(function (x) { return x.nombre === 'Proyecto'; });
      return { id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
               mensaje: sinPermiso
                 ? 'Esta venta todavía no está en la hoja, y el rol de ' + rol + ' no puede darla de alta: no escribe el nombre del proyecto. ' +
                   'Dala de alta desde Dirección; después ya se puede mover desde aquí.'
                 : 'Esta venta todavía no está en la hoja y este cambio no trae el nombre del proyecto: sería una fila sin nombre en el libro del dinero. No se escribió nada.',
               rechazadas: armado.rechazadas };
    }
    fila = primeraFilaLibre(h);
    if (!fila) {
      return { id: op.id, ok: false, codigo: 'DESCONOCIDO',
               mensaje: 'Ya no hay filas libres antes de la ' + FIN + ' en la hoja.' };
    }
    /* Libre quiere decir sin proyecto, no vacía: puede traer restos de otra venta (de
       antes de esta versión) en el dinero o en las columnas del puente. Se limpian antes de
       escribir, o la venta nueva los hereda. */
    limpiarFila(h, fila);
    h.getRange(fila, COL_FOLIO).setValue(siguienteFolio(h));
    creada = true;
  } else {
    /* ── «Folio cotizacion» no se pisa en un cambio ─────────────────────────────────
       Es la llave que ata la fila a la cotización de un teléfono. Un proyecto que otro
       teléfono IMPORTÓ de la hoja no tiene cotización y mandaba su folio de hoja (V-100) en
       su lugar: el teléfono dueño de la cotización dejaba de reconocer su venta, la volvía a
       importar y Control la contaba dos veces. Si la fila ya trae uno, se queda; el que
       llega distinto se devuelve rechazado con su razón. Y el folio de la hoja no entra
       nunca en esa columna: es la huella de aquel defecto, no una llave. */
    var folioFila = String(h.getRange(fila, COL_FOLIO).getValue()).trim();
    var yaTiene = llaveDeCotizacion(h, fila);
    armado.celdas = armado.celdas.filter(function (c) {
      if (c.col !== COL['Folio cotizacion']) return true;
      var llega = String(c.valor).trim();
      if (llega === folioFila) {
        armado.rechazadas.push({ nombre: 'Folio cotizacion',
          por: llega + ' es el folio de la hoja, no uno de cotización: no se escribe ahí' });
        return false;
      }
      if (!yaTiene || llega === yaTiene) return true;
      armado.rechazadas.push({ nombre: 'Folio cotizacion',
        por: 'esta fila ya está atada al folio de cotización ' + yaTiene + ', y ése no se cambia desde un teléfono' });
      return false;
    });
  }

  /* El abono se revisa ANTES de escribir nada: sin pestaña de abonos, o con sus 1999 renglones
     llenos, registrarAbonoDesdePuente no escribía y la operación volvía ok. El teléfono daba el
     abono por registrado y la comisión seguía pendiente en la hoja, sin que nadie lo supiera.
     Ahora se rechaza esa propiedad con su razón, como armarCeldas rechaza las suyas; y si era lo
     único que traía la operación, la operación entera no sale bien. */
  if (armado.abono && !hayLugarParaUnAbono()) {
    armado.rechazadas.push({ nombre: 'Abono Comision',
      por: 'la pestaña «' + ABONOS + '» no existe o ya no tiene renglones libres: el abono no se registró' });
    armado.abono = null;
    if (!armado.celdas.length) {
      return { id: op.id, ok: false, codigo: 'DESCONOCIDO',
               mensaje: 'El abono de comisión no se registró: la pestaña «' + ABONOS + '» de la hoja no existe o está llena. Dirección tiene que hacerle lugar.',
               rechazadas: armado.rechazadas };
    }
  }

  /* ── Quién gana (puente-sheets-14) ─────────────────────────────────────────────────────
     De las columnas de la obra (SELLADAS) se escribe solo lo que llega con un sello igual o más
     nuevo que el que ya tiene la celda; lo más viejo se devuelve en `viejos` —no es un error: otro
     teléfono, o alguien en la hoja, lo cambió después, y gana—. Una operación sin `sellos` es de
     una versión anterior de la plataforma: se escribe como siempre y se sella con la hora de
     llegada. Un sello en cero es «no sé cuándo cambió» (un dato de antes de los sellos): se escribe
     solo donde la celda tampoco tiene sello. */
  var viejos = [], sellosNuevos = null;
  if (anchoDelPuente(h) >= COL['Sellos']) {
    var ahora = Date.now();
    var conSellos = !!(op.sellos && typeof op.sellos === 'object');
    var guardados = sellosDeCelda_(h.getRange(fila, COL['Sellos']).getValue());
    sellosNuevos = {};
    for (var kg in guardados) sellosNuevos[kg] = guardados[kg];
    armado.celdas = armado.celdas.filter(function (c) {
      var nombre = nombreDeColumna(c.col);
      if (SELLADAS.indexOf(nombre) === -1) return true;
      var clave = claveDeSello_(nombre);
      var llega = conSellos ? selloValido_(op.sellos[nombre] || op.sellos[clave], ahora) : ahora;
      var tiene = Number(guardados[clave]) || 0;
      if (tiene && llega < tiene) {
        viejos.push({ nombre: nombre, por: 'ya tenía un cambio más reciente' });
        return false;
      }
      if (llega > (Number(sellosNuevos[clave]) || 0)) sellosNuevos[clave] = llega;
      return true;
    });
    if (!armado.celdas.length && !armado.abono) {
      /* Todo lo que traía era más viejo que lo que ya hay: se contesta que sí —ya está, y lo que
         hay es más nuevo— para que el teléfono lo despache, y con la fila como quedó para que la
         baje. */
      var tzV = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
      var hoyV = aplanarFila(h.getRange(fila, 1, 1, anchoDelPuente(h)).getValues()[0], tzV);
      return { id: op.id, ok: true, creada: creada, remoto: sinLoQueNoLeToca(hoyV, rol),
               rechazadas: armado.rechazadas, viejos: viejos };
    }
  }

  armado.celdas.forEach(function (c) {
    var celda = h.getRange(fila, c.col);
    /* El formato ANTES del valor: puesto después, Sheets ya volvió hora el «10:00». */
    if (c.texto) celda.setNumberFormat('@');
    celda.setValue(c.valor);
  });
  if (sellosNuevos) {
    var textoSellos = sellosATexto_(sellosNuevos);
    var celdaS = h.getRange(fila, COL['Sellos']);
    if (textoSellos !== sellosATexto_(sellosDeCelda_(celdaS.getValue()))) celdaS.setNumberFormat('@').setValue(textoSellos);
  }
  if (armado.abono && !registrarAbonoDesdePuente(h, fila, armado.abono)) {
    armado.rechazadas.push({ nombre: 'Abono Comision', por: 'no se encontró renglón libre en «' + ABONOS + '»: el abono no se registró' });
    armado.abono = null;
  }
  SpreadsheetApp.flush();

  var folio = h.getRange(fila, COL_FOLIO).getValue();
  anotaciones.push({ rol: rol, folio: folio, fila: fila, creada: creada,
                     campos: armado.celdas.map(function (c) { return nombreDeColumna(c.col); }),
                     abono: armado.abono });

  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var datos = aplanarFila(h.getRange(fila, 1, 1, anchoDelPuente(h)).getValues()[0], tz);
  /* Lo que vuelve pasa por el mismo filtro que /jalar. Sin él, el teléfono de fabricación
     que movía una etapa recibía de vuelta el subtotal, el neto, el anticipo, la comisión y
     la cuenta de esa venta: la lectura cerrada en /jalar se abría por aquí. */
  return { id: op.id, ok: true, creada: creada, remoto: sinLoQueNoLeToca(datos, rol),
           rechazadas: armado.rechazadas, viejos: viejos };
}

function nombreDeColumna(col) {
  for (var n in COL) if (COL[n] === col) return n;
  return 'col ' + col;
}

function armarCeldas(datos, rol) {
  var permitidas = {};
  (PUENTE_ROLES[rol] || []).forEach(function (n) { permitidas[n] = true; });
  var celdas = [], rechazadas = [], abono = null;

  for (var nombre in (datos || {})) {
    if (!Object.prototype.hasOwnProperty.call(datos, nombre)) continue;
    var valor = datos[nombre];

    /* El abono de comisión es el caso especial de toda la migración: en Notion era
       una celda que se sobrescribía, y por eso solo sobrevivía el último pago. Aquí
       es la suma de la pestaña de abonos, así que escribirlo significa AGREGAR UN
       RENGLÓN. Se gana el historial de parcialidades sin que el teléfono se entere. */
    if (nombre === 'Abono Comision') {
      if (!permitidas[nombre]) { rechazadas.push({ nombre: nombre, por: 'el rol ' + rol + ' no puede escribir esta propiedad' }); continue; }
      /* Mayor a cero y razonable. Solo se rechazaba el cero: pagos mandaba −99 999 y quedaba un
         renglón negativo en «Abonos comisión» —la comisión pendiente SUBÍA, el tablero y el
         correo de los lunes la enseñaban, y el reparto FIFO la habría cubierto con dinero de
         verdad—. Un abono es un pago hecho: no hay abonos negativos, y una corrección se hace
         en la pestaña, a mano. La plataforma no manda este campo (js/datos/puente.js). */
      var m = Number(valor);
      if (!isFinite(m) || !(m > 0) || m > 1e7) { rechazadas.push({ nombre: nombre, por: 'un abono de comisión va en positivo y es de menos de $10,000,000' }); continue; }
      abono = m;
      continue;
    }

    if (PUENTE_FORMULAS[nombre]) { rechazadas.push({ nombre: nombre, por: PUENTE_FORMULAS[nombre] }); continue; }
    if (!permitidas[nombre]) { rechazadas.push({ nombre: nombre, por: 'el rol ' + rol + ' no puede escribir esta propiedad' }); continue; }
    if (!Object.prototype.hasOwnProperty.call(COL, nombre)) { rechazadas.push({ nombre: nombre, por: 'esa columna no existe en la hoja' }); continue; }

    var col = COL[nombre];
    if (nombre === 'Estatus') {
      if (ESTATUS.indexOf(valor) === -1) { rechazadas.push({ nombre: nombre, por: '«' + valor + '» no es un estatus de la hoja' }); continue; }
      celdas.push({ col: col, valor: valor });
    } else if (nombre === 'Cuenta ') {
      if (CUENTAS.indexOf(valor) === -1) { rechazadas.push({ nombre: nombre, por: '«' + valor + '» no es una cuenta de la hoja' }); continue; }
      celdas.push({ col: col, valor: valor });
    } else if (nombre === 'Etapa de obra') {
      if (ETAPAS_OBRA.indexOf(valor) === -1) { rechazadas.push({ nombre: nombre, por: '«' + valor + '» no es una etapa de obra' }); continue; }
      celdas.push({ col: col, valor: valor });
    } else if (nombre === 'Tipo de trabajo') {
      var arr = (Object.prototype.toString.call(valor) === '[object Array]' ? valor : [valor])
                  .filter(Boolean).map(String);
      var malos = arr.filter(function (t) { return TIPOS_TRABAJO.indexOf(t) === -1; });
      if (malos.length) { rechazadas.push({ nombre: nombre, por: 'no son tipos de la hoja: ' + malos.join(', ') }); continue; }
      celdas.push({ col: col, valor: arr.join(', ') });
    } else if (nombre === 'IVA') {
      celdas.push({ col: col, valor: valor ? 'Sí' : 'No' });
    } else if (['Precio Subtotal', 'Anticipo', 'Liquidacion'].indexOf(nombre) !== -1) {
      var n = Number(valor);
      if (!isFinite(n)) { rechazadas.push({ nombre: nombre, por: 'no es un número' }); continue; }
      /* Un anticipo o una liquidación negativos son dinero que «sale» de una venta: el saldo
         de la fórmula K sube y la venta parece deber lo que nunca facturó. */
      if (nombre !== 'Precio Subtotal' && n < 0) { rechazadas.push({ nombre: nombre, por: 'no puede ser negativo' }); continue; }
      celdas.push({ col: col, valor: n });
    } else if (nombre === 'Porcentaje comision') {
      /* En puntos, 0 a 100. Vacío o null borra la celda y la fórmula vuelve al 10 %. */
      if (valor === null || valor === '') { celdas.push({ col: col, valor: '' }); continue; }
      var pct = Number(valor);
      if (!isFinite(pct) || pct < 0 || pct > 100) { rechazadas.push({ nombre: nombre, por: 'el porcentaje va de 0 a 100' }); continue; }
      celdas.push({ col: col, valor: pct });
    } else if (['Fecha Anticipo e Instalacion', 'Fecha Liquidacion', 'Fecha instalacion'].indexOf(nombre) !== -1) {
      if (valor === null || valor === '') { celdas.push({ col: col, valor: '' }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) { rechazadas.push({ nombre: nombre, por: 'la fecha tiene que venir como YYYY-MM-DD' }); continue; }
      var p = String(valor).split('-');
      celdas.push({ col: col, valor: new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) });
    } else if (nombre === 'Entrega') {
      /* Vacía borra la celda, que se lee Instalación. Lo demás tiene que ser una de las tres
         opciones de la lista: la columna tiene validación cerrada, y una celda con otra cosa
         la dejaría marcada en rojo y sin significado para ningún teléfono. */
      if (valor === null || valor === undefined || String(valor).trim() === '') { celdas.push({ col: col, valor: '' }); continue; }
      var ent = entregaDeCelda(valor);
      if (!ent) { rechazadas.push({ nombre: nombre, por: 'la entrega es «Instalación», «Paquetería» o «Recolección en taller»' }); continue; }
      celdas.push({ col: col, valor: ent });
    } else if (nombre === 'Plazo taller') {
      /* Vacío vuelve al plazo que propone la plataforma. Lo demás, uno de los cinco cubos. */
      if (valor === null || valor === undefined || String(valor).trim() === '') { celdas.push({ col: col, valor: '' }); continue; }
      var pz = plazoDeCelda(valor);
      if (!pz) { rechazadas.push({ nombre: nombre, por: 'el plazo es uno de: ' + PLAZOS_TALLER.join(', ') }); continue; }
      celdas.push({ col: col, valor: pz });
    } else if (nombre === 'Notas') {
      /* Texto libre, como la dirección, pero largo: una nota cortada a 2000 bajaría cortada a
         todos los teléfonos y se comería el final de la de cada uno. Una celda aguanta 50 000. */
      /* En texto sin formato ('@', como el teléfono): ahí «10:00» no se vuelve hora ni «=…»
         fórmula, y por eso tampoco lleva apóstrofo, que se quedaría escrito en la nota. */
      celdas.push({ col: col, valor: String(valor == null ? '' : valor).slice(0, 40000), texto: true });
    } else if (nombre === 'Telefono') {
      /* Vacío borra la celda: es alguien corrigiendo. Lo demás se limpia con la regla de
         telefonoLimpio y, si no queda ni un dígito, se rechaza con su razón en vez de escribir
         basura. Va en texto sin formato ('@', como la hora): «+52 1 33…» en una celda normal
         Sheets lo lee como número —o como fórmula, por el «+»—. Y sin apóstrofo: con la celda en
         '@' no hace falta, y la limpieza ya dejó fuera el «=» y la «@». */
      if (valor === null || valor === undefined || String(valor).trim() === '') { celdas.push({ col: col, valor: '', texto: true }); continue; }
      var tel = telefonoLimpio(valor);
      if (!tel) { rechazadas.push({ nombre: nombre, por: 'un teléfono lleva dígitos: solo números, espacios, +, guiones y paréntesis' }); continue; }
      celdas.push({ col: col, valor: tel, texto: true });
    } else if (nombre === 'Hora instalacion') {
      /* «HH:MM», o vacía si todavía no se sabe: lo mismo que acepta la agenda del teléfono.
         Antes entraba como texto libre; lo que no es una hora tampoco lo entiende la agenda,
         así que se rechaza con su razón, como una fecha mal escrita. `texto` le pide a quien
         escribe la celda en '@' antes del valor (ver horaDeCelda). */
      var hora = horaEscrita(valor);
      if (hora === null) { rechazadas.push({ nombre: nombre, por: 'la hora va como HH:MM, o vacía si todavía no se sabe' }); continue; }
      celdas.push({ col: col, valor: hora, texto: true });
    } else {
      /* Texto libre. Se le quita el `=` de adelante: una celda que empieza con `=`
         es una FÓRMULA, y una fórmula metida desde afuera puede leer cualquier
         parte de la hoja o salir a internet con IMPORTXML. */
      var texto = String(valor == null ? '' : valor).slice(0, 2000);
      if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
      celdas.push({ col: col, valor: texto });
    }
  }
  return { celdas: celdas, rechazadas: rechazadas, abono: abono };
}

function hayLugarParaUnAbono() {
  var a = SpreadsheetApp.getActive().getSheetByName(ABONOS);
  return !!(a && filaLibreEnAbonos(a, 1));
}
/** Escribe el abono en su renglón. Devuelve si lo escribió: quien llama tiene que decirlo. */
function registrarAbonoDesdePuente(h, fila, importe) {
  var ss = SpreadsheetApp.getActive();
  var a = ss.getSheetByName(ABONOS);
  if (!a) return false;
  var folio = h.getRange(fila, COL_FOLIO).getValue();
  var libre = filaLibreEnAbonos(a, 1);
  if (!libre) return false;
  a.getRange(libre, 1).setValue(folio);
  a.getRange(libre, 3).setValue(importe);
  a.getRange(libre, 4).setValue(new Date());
  a.getRange(libre, 5).setValue('Registrado desde la plataforma');
  return true;
}

function filaPorFolioInterno(h, folio) {
  var col = h.getRange(2, COL_FOLIO, FIN - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === folio) return i + 2;
  return 0;
}
/** La llave de cotización de una fila, o '' si no tiene. Una «llave» igual al folio de la
 *  propia fila (V-100) no lo es: es lo que escribía un proyecto importado hasta
 *  puente-sheets-5, y tomarla por buena dejaría fuera al teléfono dueño de la cotización. */
function llaveDeCotizacion(h, fila) {
  var y = String(h.getRange(fila, COL['Folio cotizacion']).getValue()).trim();
  return (y && y === String(h.getRange(fila, COL_FOLIO).getValue()).trim()) ? '' : y;
}
function filaPorFolioCotizacion(h, fc) {
  var col = h.getRange(2, COL['Folio cotizacion'], FIN - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === fc) return i + 2;
  return 0;
}
/* La primera fila sin proyecto, prefiriendo una que de verdad esté vacía. Hasta
   puente-sheets-5 solo se miraba la columna B, y una fila sin nombre pero con dinero, con
   estatus o con las columnas del puente de otra venta pasaba por libre: la venta nueva
   heredaba lo que no escribía. Si ya no queda ninguna vacía se usa una con restos, y quien
   la toma la limpia antes (limpiarFila). */
function primeraFilaLibre(h) {
  var ancho = anchoDelPuente(h);
  var datos = h.getRange(2, 1, FIN - 1, ancho).getValues();
  var bloques = bloquesCapturados(ancho);
  var conRestos = 0;
  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][COL['Proyecto'] - 1]).trim() !== '') continue;
    if (filaSinNada(datos[i], bloques)) return i + 2;
    if (!conRestos) conRestos = i + 2;
  }
  return conRestos;
}

function filaSinNada(fila, bloques) {
  for (var b = 0; b < bloques.length; b++) {
    for (var c = bloques[b][0]; c <= bloques[b][1]; c++) {
      var v = fila[c - 1];
      if (v !== '' && v !== null && v !== undefined) return false;
    }
  }
  return true;
}

/** Deja en blanco lo que se captura en esa fila (no las fórmulas). Solo escribe si hay algo. */
function limpiarFila(h, fila) {
  var ancho = anchoDelPuente(h);
  var bloques = bloquesCapturados(ancho);
  if (filaSinNada(h.getRange(fila, 1, 1, ancho).getValues()[0], bloques)) return false;
  bloques.forEach(function (b) {
    var vacio = [];
    for (var c = b[0]; c <= b[1]; c++) vacio.push('');
    h.getRange(fila, b[0], 1, vacio.length).setValues([vacio]);
  });
  return true;
}

/* --------------------------------------------------------------- /expandir */
/**
 * Sigue una liga corta de Maps hasta la larga, que es la que trae las coordenadas.
 * El navegador no puede: la respuesta de maps.app.goo.gl no manda CORS.
 *
 * La lista blanca de dominios NO es paranoia de más: sin ella, quien tuviera un
 * token podría usar este puente para que un servidor de Google salga a tocar
 * cualquier dirección de internet en su nombre.
 */
function rutaExpandir_(cuerpo) {
  return expandirLiga_((cuerpo && cuerpo.u) || '');
}

/* Un salto: la dirección a la que manda la liga, o la misma si no manda a ningún lado. La usan
   /expandir (la plataforma) y «Registrar nueva venta» (ubicacionDeLiga_), para que la lista
   blanca de dominios sea una sola. */
function expandirLiga_(liga) {
  var u = String(liga || '').trim();
  /* El host solo puede ser letras, números, puntos y guiones, y lo que le sigue tiene que ser «/»,
     «?», «#» o el final. Con la expresión de antes (`[^\/:?#]+`) el host se cortaba en el primer
     «:», y «https://maps.google.com:x@evil.example/» daba «maps.google.com» —que está en la
     lista— mientras UrlFetchApp conectaba a lo que va después del «@»: evil.example. Ahora ni un
     usuario, ni una contraseña, ni un puerto pasan: el «:» y el «@» no caben en la clase, y detrás
     del host no puede venir nada más. La lista blanca de abajo es la misma de siempre. */
  var m = /^https?:\/\/([a-z0-9.-]+)(?=[\/?#]|$)/i.exec(u);
  var host = m ? m[1].toLowerCase() : '';
  if (!host || DOMINIOS_MAPS.indexOf(host) === -1) {
    return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' };
  }
  try {
    var r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true });
    var cab = r.getHeaders();
    var destino = cab['Location'] || cab['location'] || '';
    return { ok: true, url: destino || u };
  } catch (err) {
    return { ok: false, codigo: 'SIN_RED', mensaje: 'No se pudo seguir la liga.' };
  }
}

/* ── La coordenada de un link de Maps, del lado de la hoja (puente-sheets-13) ───────────────
   La MISMA lectura que `parseGmaps` de js/datos/geo.js, con las mismas reglas en el mismo orden
   —el par suelto, geo:, !3d!4d, q=/ll=…, /search/, /place/, la arroba de la cámara y los
   !2d!3d/!1d!2d volteados de dir/—, para que una venta registrada aquí y una ganada en el
   teléfono den el mismo pin con el mismo link. Apps Script no puede importar geo.js, así que es
   una copia, y pruebas/puente-hoja.mjs corre las dos con todos los casos de pruebas/geo.mjs:
   el día que una cambie sin la otra, truena. Contesta {lat, lng, exacta}, {corto:true} para el
   link de WhatsApp (hay que seguirlo), o null. */
var GEO_N = '-?\\d{1,3}(?:\\.\\d+)?';
var GEO_D = '-?\\d{1,3}\\.\\d+';
var GEO_REGLAS = [
  { re: new RegExp('^\\+?(' + GEO_D + ')\\s*,\\s*\\+?(' + GEO_D + ')$'), lnglat: false, exacta: true },
  { re: new RegExp('^geo:\\+?(' + GEO_N + ')\\s*,\\s*\\+?(' + GEO_N + ')', 'i'), lnglat: false, exacta: true },
  { re: new RegExp('!3d(' + GEO_N + ')!4d(' + GEO_N + ')'), lnglat: false, exacta: true },
  { re: new RegExp('[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(?:loc:)?[+\\s]*(' + GEO_N + ')\\s*,\\s*\\+?(' + GEO_N + ')', 'i'), lnglat: false, exacta: true },
  { re: new RegExp('/maps/search/(' + GEO_N + ')\\s*,\\s*\\+?(' + GEO_N + ')'), lnglat: false, exacta: true },
  { re: new RegExp('/maps/place/(' + GEO_N + ')\\s*,\\s*\\+?(' + GEO_N + ')'), lnglat: false, exacta: true },
  { re: new RegExp('@(' + GEO_N + '),(' + GEO_N + ')(?:,(?:\\d+(?:\\.\\d+)?)[zmayht])?'), lnglat: false, exacta: false },
  { re: new RegExp('!2d(' + GEO_N + ')!3d(' + GEO_N + ')'), lnglat: true, exacta: false },
  { re: new RegExp('!1d(' + GEO_N + ')!2d(' + GEO_N + ')'), lnglat: true, exacta: false }
];
function coordEnRango_(la, ln) {
  return isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
}
function coordenadasDeMaps_(texto) {
  var crudo = String(texto == null ? '' : texto).trim();
  if (!crudo) return null;
  if (/^(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(crudo)) return { corto: true };
  var textos = [];
  try { textos.push(decodeURIComponent(crudo)); } catch (e) { /* un % suelto: se prueba crudo */ }
  textos.push(crudo);
  for (var i = 0; i < GEO_REGLAS.length; i++) {
    for (var j = 0; j < textos.length; j++) {
      var m = GEO_REGLAS[i].re.exec(textos[j]);
      if (!m) continue;
      var la = parseFloat(m[1]), ln = parseFloat(m[2]), t;
      if (GEO_REGLAS[i].lnglat) { t = la; la = ln; ln = t; }
      if (!coordEnRango_(la, ln)) {
        if (!coordEnRango_(ln, la)) continue;
        t = la; la = ln; ln = t;
      }
      return { lat: la, lng: ln, exacta: GEO_REGLAS[i].exacta };
    }
  }
  return null;
}

/* Lo que va en la columna AB a partir de lo que alguien pegó: «lat,lng» si se pudo leer,
   siguiendo el link corto hasta tres saltos (los mismos que `resolverLink` de geo.js). Si no se
   pudo, `ok:false` con su frase y el link tal cual en `ubicacion`: la plataforma lo baja como
   link y lo vuelve a intentar (proyectos.ubicacionDeHoja). */
function ubicacionDeLiga_(liga) {
  var original = String(liga || '').trim();
  var u = original;
  var c = coordenadasDeMaps_(u);
  if (c && c.corto) {
    for (var i = 0; i < 3; i++) {
      var e = expandirLiga_(u);
      if (!e.ok || !e.url || e.url === u) break;
      u = e.url;
      c = coordenadasDeMaps_(u);
      if (c && !c.corto) break;
    }
  }
  if (c && !c.corto) return { ok: true, ubicacion: c.lat + ',' + c.lng, exacta: c.exacta };
  return { ok: false, ubicacion: original,
    mensaje: 'El link de Maps no se pudo leer aquí: quedó en Ubicación y la plataforma lo vuelve a intentar.' };
}

/* --------------------------------------------------------------- bitácora */
/**
 * Toda escritura que entra por el puente queda anotada: cuándo, qué rol, qué
 * folio y qué campos. Es lo que convierte «algo se movió» en «esto se movió, el
 * martes, desde el teléfono de pagos».
 *
 * Es una pestaña oculta y nadie más que tú entra a la hoja, así que no hace
 * falta más protección que esa.
 */
function anotar_(anotaciones) {
  if (!anotaciones || !anotaciones.length) return;
  try {
    var ss = SpreadsheetApp.getActive();
    var b = ss.getSheetByName(BITACORA);
    if (!b) {
      b = ss.insertSheet(BITACORA);
      b.getRange('A1:F1').setValues([['Cuándo', 'Rol', 'Folio', 'Fila', 'Qué escribió', 'Nota']]);
      b.getRange('A1:F1').setFontWeight('bold').setBackground(AZUL).setFontColor('#ffffff');
      b.setFrozenRows(1);
      b.setColumnWidth(1, 150); b.setColumnWidth(5, 380); b.setColumnWidth(6, 200);
      b.hideSheet();
    }
    var ahora = new Date();
    var filas = anotaciones.map(function (a) {
      var que = (a.campos || []).join(', ');
      if (a.abono) que += (que ? ' + ' : '') + 'abono de comisión ' + a.abono;
      return [ahora, a.rol, a.folio, a.fila, que || '(nada)',
              a.creada ? 'fila nueva' : (a.nota || '')];
    });
    b.getRange(b.getLastRow() + 1, 1, filas.length, 6).setValues(filas);
    b.getRange(2, 1, b.getLastRow(), 1).setNumberFormat('dd/mm/yyyy HH:mm:ss');

    /* No crece para siempre: se queda con los últimos 5000 renglones. */
    var sobran = b.getLastRow() - 5001;
    if (sobran > 0) b.deleteRows(2, sobran);
  } catch (e) {
    /* Que falle la bitácora no puede tumbar una escritura que ya entró. */
  }
}

/* ============================================================================
   EL NOTARIO — un precio autorizado se sella aquí, y solo aquí.

   Hasta puente-sheets-6 autorizar era un botón del teléfono: el rol «Autorizador» se
   escogía en un segmentado, el nombre de quien autorizaba era un campo de texto libre y
   el catálogo de precios vivía en un guion que cualquiera puede editar desde las
   herramientas del navegador. Nada de eso se podía comprobar después. Un PDF con folio,
   «Autorizada por Elías» y un precio de $1 salía idéntico a uno de verdad.

   Esto no lo arregla la app —lo que corre en un teléfono lo controla quien tiene el
   teléfono— sino esta hoja, que es lo único del sistema que no corre en el teléfono:

     · Solo SELLA una identidad de Google verificada cuyo correo está en «Accesos» como
       dirección. El token de dispositivo no basta: no trae un correo que firmar.
     · Recalcula el subtotal con SU copia del catálogo. Si el del teléfono no coincide —un
       catálogo alterado, o una copia vieja de la app— no sella, y lo dice.
     · Firma con HMAC-SHA256 lo que se autorizó: el folio, el trabajo (su huella), el
       calculado, el autorizado, el total, el negocio, quién y cuándo. La fecha la pone
       este reloj, no el del teléfono. El secreto vive en las propiedades del script.
     · Lo deja escrito en «Autorizaciones», y `/verificar` —pública, la que abre el QR del
       PDF— recalcula la firma desde ese renglón. Editar el renglón a mano para cambiar un
       total la rompe: el QR dice «no auténtica».
     · Desde puente-sheets-8 firma además los renglones del PDF —qué partida, cuántas piezas,
       qué importe— y /verificar los devuelve. Hasta entonces el QR solo respondía del total:
       un PDF con dos importes intercambiados, o con una partida cambiada por otra del mismo
       precio, pasaba por auténtico. Ver «Los renglones del papel», más abajo.

   Y la solicitud viaja: quien cotiza sin ser dirección la sube con `/solicitar`, a
   dirección le aparece en su teléfono con `/pendientes`, y el teléfono que la pidió
   pregunta con `/estado` hasta recibir el sello.

   El catálogo de abajo es una COPIA de js/cotizador/catalogo.js y de lineTotal() de
   js/cotizador/nucleo.js. pruebas/precio-servidor.mjs truena si dejan de coincidir: subir
   el precio del aluminio es cambiar los dos lados y volver a implementar.
   ============================================================================ */

var HOJA_AUTORIZACIONES = 'Autorizaciones';
var HOJA_SOLICITUDES = 'Solicitudes de autorización';
var FIRMA_VERSION = 'AL3D-AUTH-v1';
/* La firma con renglones. Es OTRA versión, y no la misma con un campo de más, a propósito: a un
   renglón v2 al que alguien le vacíe la celda «Renglones» se le comprueba la firma como v1, y
   como el prefijo es parte de lo firmado la cuenta ya no da: «no auténtica». Con el mismo
   prefijo, borrar los renglones sería una manera de quitarle al sello lo que garantiza. */
var FIRMA_VERSION_RENGLONES = 'AL3D-AUTH-v2';
var PROP_SECRETO = 'SELLO_AUTORIZACION';
var MAX_PARTIDAS = 80;

/* ----- El catálogo, copiado ----- */
var COT_MATERIALES = { 'al-paint': 30, 'al-brush': 35, 'acr-vol': 40, 'acr-vinil': 45, 'acero': 55 };
var COT_COMPLEJIDAD = { 'recta': 0, 'cursiva': 5, 'compleja': 10 };
var COT_RECORTES = { 'sencillo': 20, 'vinil': 25, 'sandwich': 55 };
var COT_RECORTE_COMP_EXTRA = 5;
var COT_BASTIDORES = { 'lamina': 950, 'alucobond': 1500 };
var COT_M2_MINIMO = 1;
var COT_IVA = 0.16;
/* Los campos de una partida que mueven el precio: los mismos, en el mismo orden, que
   `_CAMPOS_PRECIO` de nucleo.js. La huella se arma con ellos y tiene que salir idéntica. */
var COT_CAMPOS_PRECIO = ['tipo', 'material', 'comp', 'luz', 'altura', 'n', 'acab', 'recComp',
                         'bas', 'ancho', 'alto', 'tarifa', 'pz', 'pu'];

function cotPrecioDe(mapa, k) { return Object.prototype.hasOwnProperty.call(mapa, k) ? mapa[k] : 0; }
function cotFactorOf(it) { return cotPrecioDe(COT_MATERIALES, it.material) + cotPrecioDe(COT_COMPLEJIDAD, it.comp); }
function cotM2Total(tarifa, m2) { return (tarifa || 0) * Math.max(m2 || 0, COT_M2_MINIMO); }
/* Línea por línea lo mismo que lineTotalCrudo(): mismas multiplicaciones, en el mismo
   orden, con los mismos `|| 0`. El orden importa en flotante: 30*40*8 y 30*(40*8) no
   siempre dan el mismo último bit, y el redondeo a centavo de después lo puede notar. */
function cotLineTotalCrudo(it) {
  if (it.tipo === 'letras') {
    var p = cotFactorOf(it) * (it.altura || 0) * (it.n || 0);
    if (!it.luz) p *= 0.8;
    return p;
  }
  if (it.tipo === 'recorte') {
    var rate = cotPrecioDe(COT_RECORTES, it.acab);
    if (it.acab === 'sandwich' && it.recComp) rate += COT_RECORTE_COMP_EXTRA;
    return rate * (it.altura || 0) * (it.n || 0);
  }
  if (it.tipo === 'bastidor') {
    var m2b = (it.ancho || 0) * (it.alto || 0) / 10000;
    if (m2b <= 0) return 0;
    return cotM2Total(cotPrecioDe(COT_BASTIDORES, it.bas), m2b);
  }
  if (it.tipo === 'caja') {
    var m2c = (it.ancho || 0) * (it.alto || 0) / 10000;
    if (m2c <= 0) return 0;
    return cotM2Total(it.tarifa || 0, m2c);
  }
  return (it.pz || 0) * (it.pu || 0);
}
function cotLineTotal(it) { return Math.round(cotLineTotalCrudo(it) * 100) / 100; }
function cotSubtotal(items) {
  var s = 0;
  for (var i = 0; i < items.length; i++) s += cotLineTotal(items[i]);
  return s;
}
/* totals() del cotizador: el IVA es sub*0.16 y el neto su suma, sin redondear. */
function cotNeto(sub, iva) { return iva ? sub + sub * COT_IVA : sub; }
/* precioFinal() + desgloseFinal(): manda el autorizado cuando lo hay y es distinto del
   calculado; si no, el calculado. Redondeado con toFixed, como allá. */
function cotTotalFinal(subCalc, iva, precioAuth) {
  var neto = cotNeto(subCalc, iva);
  var fin = (precioAuth > 0 && Math.abs(precioAuth - neto) > 0.01) ? precioAuth : neto;
  return +fin.toFixed(2);
}
/* huellaTrabajo(): el trabajo, no su importe. Ordenada, porque el orden de las partidas no
   es parte del trabajo. */
function cotHuella(iva, items) {
  return (iva ? 'c' : 's') + '|' + items.map(function (it) {
    return it.id + ':' + COT_CAMPOS_PRECIO.map(function (k) {
      return it[k] === undefined ? '' : String(it[k]);
    }).join('~');
  }).sort().join(',');
}

/* ----- Los renglones del papel -----
   Lo que el PDF imprime en cada fila de la tabla: qué partida, cuántas piezas y qué importe. Es
   lo que el sello firma desde puente-sheets-8 y lo que /verificar devuelve para que quien tiene
   el papel lo compare fila por fila.

   El importe NO es el del catálogo: es el que ve el cliente —preciosCliente() de nucleo.js—, que
   lleva el ajuste por partida del autorizador y, si subió el total, su parte del aumento ya
   repartida. Por eso aquí va una COPIA de preciosCliente(), de itemPrecio() y de piezasDe(), con
   el mismo cuidado que el catálogo: pruebas/precio-servidor.mjs las compara contra nucleo.js con
   miles de cotizaciones al azar, porque si la hoja firmara un importe y el PDF imprimiera otro,
   quien verifica vería un renglón «alterado» en un papel legítimo.

   Se firman a partir de lo que la hoja ya comprobó —las partidas recalculadas con SU catálogo,
   los ajustes y el total que ella misma calculó—, nunca de importes que mande el teléfono. Lo
   único que viene del teléfono es la descripción corta, que es la misma que dirección leyó al
   revisar la solicitud. */
var RENGLON_DESC_MAX = 120;
/* piezasDe(): lo que imprime la columna «Pzas.». */
function cotPiezas(it) {
  if (it.tipo === 'letras' || it.tipo === 'recorte') return it.n || 0;
  if (it.tipo === 'bastidor' || it.tipo === 'caja') return 1;
  return it.pz || 1;
}
/* itemPrecio() de una cotización autorizada y vigente: el ajuste por partida si lo hay. */
function cotItemPrecio(it, ia) {
  var k = String(it.id);
  return Object.prototype.hasOwnProperty.call(ia || {}, k) ? ia[k] : cotLineTotal(it);
}
/* precioFinal() de una cotización autorizada, SIN redondear: es lo que ajusteAuth() le resta al
   neto ajustado, y redondearlo antes movería el umbral de un centavo en el que se decide si hubo
   aumento. `precioAuth` es el ya redondeado a centavo, que es el que el teléfono guarda. */
function cotPrecioFinal(subCalc, iva, precioAuth) {
  var neto = cotNeto(subCalc, iva);
  return (precioAuth > 0 && Math.abs(precioAuth - neto) > 0.01) ? precioAuth : neto;
}
/* preciosCliente(), línea por línea. `final` es cotPrecioFinal(): el precioFinal() del teléfono
   una vez autorizada. Devuelve {id: importe}. */
function cotPreciosCliente(items, iva, ia, final) {
  var out = {};
  items.forEach(function (it) { out[it.id] = cotItemPrecio(it, ia); });
  var subBase = items.reduce(function (s, it) { return s + cotItemPrecio(it, ia); }, 0);
  /* netoAjustado(), desgloseFinal().sub y ajusteAuth(), con sus mismos toFixed. */
  var netoAj = +((iva ? subBase * 1.16 : subBase)).toFixed(2);
  var neto = +Number(final).toFixed(2);
  var subFinal = +(iva ? neto / 1.16 : neto).toFixed(2);
  var ajuste = +(netoAj - final).toFixed(2);
  if (!(ajuste < -0.01 && subBase > 0.005)) return out;      // hayAumentoAuth()
  var factor = subFinal / subBase;
  var objetivo = Math.round(subFinal * 100);
  var rep = [], suma = 0;
  items.forEach(function (it) {
    var base = cotItemPrecio(it, ia);
    if (base <= 0.005) return;
    var pz = Math.max(1, cotPiezas(it));
    var exacto = base * factor * 100 / pz;
    var u = Math.floor(exacto);
    rep.push({ it: it, pz: pz, u: u, frac: exacto - u, base: base });
    suma += u * pz;
  });
  var resto = objetivo - suma;
  rep.sort(function (a, b) { return b.frac - a.frac || b.base - a.base; });
  var cupo = true;
  while (resto > 0 && cupo) {
    cupo = false;
    for (var i = 0; i < rep.length; i++) {
      var r = rep[i];
      if (r.pz > resto) continue;
      r.u++; resto -= r.pz; cupo = true;
      if (!resto) break;
    }
  }
  if (resto > 0 && rep.length > 1) {
    var porPrecio = rep.slice().sort(function (a, b) { return b.base - a.base; });
    buscar:
    for (var q = 0; q < porPrecio.length; q++) {
      var quita = porPrecio[q];
      if (quita.u < 1) continue;
      for (var p = 0; p < porPrecio.length; p++) {
        var pone = porPrecio[p];
        if (pone === quita) continue;
        var falta = resto + quita.pz;
        if (falta % pone.pz) continue;
        quita.u--; pone.u += falta / pone.pz; resto = 0;
        break buscar;
      }
    }
  }
  rep.forEach(function (r) { out[r.it.id] = +(r.u * r.pz / 100).toFixed(2); });
  if (resto !== 0 && rep.length) {
    var dest = rep.reduce(function (a, b) { return b.base > a.base ? b : a; });
    out[dest.it.id] = +(out[dest.it.id] + resto / 100).toFixed(2);
  }
  return out;
}
/* El texto que se firma y se guarda: un arreglo de [descripción, cantidad, importe] en el orden
   de las partidas, que es el orden del PDF. En JSON, por la misma razón que canonDe: una
   descripción con comas o comillas no puede correr la frontera con la de al lado.
   Van TODAS las partidas, también las que el vendedor ocultó del PDF: «ocultar» no está en la
   huella —se puede cambiar sin soltar el precio—, así que firmar solo las visibles haría que
   esconder una después de autorizar dejara el sello diciendo otra cosa que el papel. Lo que el
   PDF agrupa en «Conceptos adicionales» es la suma de las que no salen, y verificar.html lo dice. */
function renglonesDe(items, iva, ia, final) {
  var pc = cotPreciosCliente(items, iva, ia, final);
  return JSON.stringify(items.map(function (it) {
    var c = Number(cotPiezas(it));
    return [String(it.desc == null ? '' : it.desc).slice(0, RENGLON_DESC_MAX),
            isFinite(c) ? c : 0, +Number(pc[it.id]).toFixed(2)];
  }));
}
/* De la celda a lo que se enseña. null es «este sello no guardó renglones»: los de antes de
   puente-sheets-8. Un texto que no se entiende también es null, pero ése no llega a verse: la
   firma lo cubre, y uno alterado ya no verifica. */
function renglonesDeTexto(s) {
  if (!s) return null;
  var a;
  try { a = JSON.parse(String(s)); } catch (e) { return null; }
  if (Object.prototype.toString.call(a) !== '[object Array]') return null;
  return a.map(function (r) {
    return { descripcion: String(r && r[0] != null ? r[0] : ''), cantidad: Number(r && r[1]) || 0,
             importe: Number(r && r[2]) || 0 };
  });
}

/* ----- Lo que llega del teléfono, limpio -----
   Solo lo que el precio y la pantalla de revisión necesitan. Cualquier otra llave se tira:
   el renglón de «Solicitudes» guarda este objeto y no una copia de lo que alguien mandó. */
function limpiarCotizacion(c) {
  if (!c || typeof c !== 'object') return { error: 'Falta la cotización.' };
  var items = Object.prototype.toString.call(c.items) === '[object Array]' ? c.items : null;
  if (!items || !items.length) return { error: 'La cotización no trae partidas.' };
  if (items.length > MAX_PARTIDAS) return { error: 'Son demasiadas partidas para una cotización.' };
  var limpias = [], ids = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it !== 'object') return { error: 'Una partida no se entiende.' };
    var id = it.id;
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id).length > 40) return { error: 'Una partida no trae identificador.' };
    if (ids[String(id)]) return { error: 'Dos partidas con el mismo identificador.' };
    ids[String(id)] = true;
    var o = { id: id };
    for (var j = 0; j < COT_CAMPOS_PRECIO.length; j++) {
      var k = COT_CAMPOS_PRECIO[j];
      if (!Object.prototype.hasOwnProperty.call(it, k)) continue;
      var v = it[k];
      if (v !== null && typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') return { error: 'La partida ' + id + ' trae un dato raro en «' + k + '».' };
      if (typeof v === 'number' && !isFinite(v)) return { error: 'La partida ' + id + ' trae un número inválido en «' + k + '».' };
      if (typeof v === 'string' && v.length > 60) return { error: 'La partida ' + id + ' trae un texto demasiado largo en «' + k + '».' };
      o[k] = v;
    }
    o.desc = String(it.desc == null ? '' : it.desc).slice(0, 300);
    limpias.push(o);
  }
  var out = {
    proyecto: String(c.proyecto == null ? '' : c.proyecto).trim().slice(0, 140),
    cliente: String(c.cliente == null ? '' : c.cliente).trim().slice(0, 140),
    iva: !!c.iva,
    subtotal: Number(c.subtotal),
    items: limpias
  };
  /* Una celda de la hoja guarda 50 000 caracteres. La huella y la cotización se escriben cada
     una en la suya, y cortarlas en silencio era peor que decirlo: una solicitud truncada es JSON
     roto, /pendientes la saltaba, y quien la pidió esperaba para siempre una respuesta que no
     iba a llegar. Se rechaza aquí, con su razón. */
  if (cotHuella(out.iva, out.items).length > CELDA_MAX || JSON.stringify(out).length > CELDA_MAX) {
    return { error: 'La cotización es demasiado grande para guardarla en la hoja. Divídela en dos cotizaciones.' };
  }
  return out;
}
var CELDA_MAX = 45000;
function folioValido(f) {
  /* COT-0042@K7QM: el folio del teléfono y el aparato que lo emitió. El corto se repite entre
     teléfonos; con el aparato no. */
  return typeof f === 'string' && /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/.test(f);
}
/* ----- El folio como sale IMPRESO, y solo para /verificar -----
   Aquí estaba la falla 1 del paquete, y costaba clientes: el PDF imprime «COT-0042» en la
   cabecera y junto al QR pone nada más la dirección y el código. Quien no escanea y teclea lo
   que ve en el papel mandaba un folio sin «@», folioValido() lo rechazaba y la página le
   contestaba «No auténtica» —con una cotización buena y autorizada—. El peor error posible en
   la única pantalla que ve un tercero: dice que AL3D falsificó su propio documento.

   Por qué NO se aflojó folioValido() para todos: el comentario de arriba tiene razón, y la
   razón es de fondo. El folio corto SE REPITE entre teléfonos (cada aparato numera el suyo),
   así que en las rutas que escriben —autorizar, revocar, resolver una solicitud— un folio sin
   aparato es ambiguo y aceptarlo sería tocar el renglón de otra cotización. Ahí el rechazo es
   correcto y se queda.

   En /verificar no hay ambigüedad, porque el folio no es lo que identifica: lo que identifica
   es el código de doce hexadecimales, que son los primeros 48 bits del HMAC del renglón. Se
   busca por código, se confirma que el folio corto del renglón es el que se tecleó, y después
   la firma se RECALCULA entera desde el renglón (con su folio largo, el guardado). Un folio
   corto no le abre la puerta a nada: sin el código bueno no hay renglón, y sin la firma buena
   no hay respuesta. Por eso aquí sí se acepta, y solo aquí. */
function folioDePapel_(f) {
  return typeof f === 'string' && /^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$/.test(f);
}
/* «COT-0042@K7QM» → «COT-0042». Lo que va impreso y lo que se contesta. */
function folioCorto_(f) { return String(f == null ? '' : f).split('@')[0]; }
function limpiarItemsAuth(ia, items) {
  var ids = {};
  items.forEach(function (it) { ids[String(it.id)] = true; });
  var out = {};
  for (var k in (ia || {})) {
    if (!Object.prototype.hasOwnProperty.call(ia, k)) continue;
    if (!ids[k]) return { error: 'Un ajuste por partida apunta a una partida que no existe.' };
    var v = Number(ia[k]);
    if (!isFinite(v) || v < 0 || v > 1e8) return { error: 'Un ajuste por partida no es un importe válido.' };
    out[k] = v;
  }
  return { valor: out };
}

/* ----- La firma ----- */
function dinero2(n) { return (Math.round(Number(n || 0) * 100) / 100).toFixed(2); }
/* Los ajustes por partida, en un orden que no dependa de cómo los armó el objeto. */
function itemsAuthCanon(ia) {
  return Object.keys(ia || {}).sort().map(function (k) { return k + ':' + dinero2(ia[k]); }).join(',');
}
function itemsAuthDeCanon(s) {
  var out = {};
  String(s || '').split(',').filter(Boolean).forEach(function (par) {
    var i = par.lastIndexOf(':');
    if (i > 0) out[par.slice(0, i)] = Number(par.slice(i + 1));
  });
  return out;
}
/* Lo que se firma, como un arreglo en JSON y no unido con «|». Con separador, un negocio que
   trajera un «|» podía correr la frontera con el campo de al lado —«Tacos|x» + «y@al3d.mx» y
   «Tacos» + «x|y@al3d.mx» daban la misma cadena—, y quien tuviera la hoja abierta podía cambiar
   lo que dice el QR sin romper la firma. JSON escapa sus comillas: dos registros distintos no
   pueden dar el mismo texto. */
function canonDe(r) {
  var campos = [String(r.folio), String(r.huella), dinero2(r.subCalc),
    dinero2(r.precioAuth), String(r.itemsAuth), dinero2(r.total), String(r.proyecto),
    String(r.correo), String(r.ts)];
  /* Con renglones, la v2: los mismos nueve campos y el texto de los renglones TAL COMO quedó en
     su celda. Se firma el texto y no el arreglo vuelto a armar para que /verificar compruebe
     exactamente lo que la hoja guarda, sin depender de cómo se escriba un número al serializar.
     Sin renglones —los sellos de antes de puente-sheets-8—, la v1 de siempre, igual byte por
     byte: si cambiara, todos los PDF ya impresos dirían «no auténtica». */
  if (r.renglones) return FIRMA_VERSION_RENGLONES + JSON.stringify(campos.concat([String(r.renglones)]));
  return FIRMA_VERSION + JSON.stringify(campos);
}
function aHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    s += (b < 16 ? '0' : '') + b.toString(16);
  }
  return s;
}
/* Con guion bajo: devuelve el secreto con el que se firman TODOS los sellos, y sin él
   google.script.run lo entregaba a cualquier guion que corriera en un diálogo del menú. */
function secretoDelSello_(crear) {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty(PROP_SECRETO);
  if (!s && crear) {
    s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PROP_SECRETO, s);
  }
  return s || '';
}
function firmar(r, secreto) {
  return aHex(Utilities.computeHmacSha256Signature(canonDe(r), secreto));
}
/* Lo que va impreso: los primeros doce del HMAC en tres grupos. 48 bits: adivinarlo es
   imposible con el cupo de /verificar, y cabe dictado por teléfono. */
function codigoDe(firma) {
  var c = String(firma).slice(0, 12).toUpperCase();
  return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8, 12);
}
function normalizarCodigo(c) { return String(c || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12); }
/* Todo texto se escribe con el apóstrofo delante, empiece por lo que empiece. Por dos
   razones: un texto que empieza con = + - @ es una FÓRMULA para la hoja —y una fórmula
   metida desde afuera puede leer cualquier parte de ella o salir a internet—, y la hoja
   «ayuda»: un «2026-09-25T18:04:11.000Z» lo convierte en fecha y un «1:8500.00» en una
   hora, y al leerlos de vuelta ya no son el texto que se firmó. Con el apóstrofo se guarda
   como texto y se lee sin él, así que la firma se sigue pudiendo comprobar desde el renglón. */
function txt(s) { return "'" + String(s == null ? '' : s); }

/* ----- Las dos pestañas ----- */
var COLS_AUT = ['Cuándo (ISO)', 'Folio', 'Proyecto', 'Cliente', 'Subtotal calculado',
  'Precio autorizado (neto)', 'Total', 'Ajuste %', 'Ajustes por partida', 'Huella',
  'Autorizó', 'Solicitó', 'Código', 'Firma', 'Estado', 'Nota', 'Renglones'];
/* «Renglones» va AL FINAL, y no junto al total donde se leería mejor: una hoja preparada antes de
   puente-sheets-8 ya tiene dieciséis columnas con sellos escritos, y meter una en medio correría
   el Estado, la Nota y la Firma de todos ellos. Al final, los renglones viejos la tienen vacía,
   que es justo lo que los marca como sellos sin renglones (firma v1). */
var A_TS = 0, A_FOLIO = 1, A_PROY = 2, A_CLI = 3, A_SUB = 4, A_PRECIO = 5, A_TOTAL = 6,
    A_PCT = 7, A_ITEMS = 8, A_HUELLA = 9, A_AUTORIZO = 10, A_SOLICITO = 11, A_CODIGO = 12,
    A_FIRMA = 13, A_ESTADO = 14, A_NOTA = 15, A_RENGLONES = 16;
var COLS_SOL = ['Cuándo', 'Folio', 'Proyecto', 'Cliente', 'Subtotal', 'IVA', 'Huella',
  'Cotización', 'Solicitó', 'Estado', 'Resolvió', 'Cuándo se resolvió', 'Nota'];
var S_TS = 0, S_FOLIO = 1, S_PROY = 2, S_CLI = 3, S_SUB = 4, S_IVA = 5, S_HUELLA = 6,
    S_COT = 7, S_SOLICITO = 8, S_ESTADO = 9, S_RESOLVIO = 10, S_TSRES = 11, S_NOTA = 12;

function hojaConCabecera(nombre, cols, oculta) {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(nombre);
  if (h) return h;
  h = ss.insertSheet(nombre);
  h.getRange(1, 1, 1, cols.length).setValues([cols]);
  h.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground(AZUL).setFontColor('#ffffff');
  h.setFrozenRows(1);
  if (oculta) h.hideSheet();
  return h;
}
function hojaAutorizaciones() {
  var h = hojaConCabecera(HOJA_AUTORIZACIONES, COLS_AUT, true);
  /* La pestaña de una hoja preparada antes de puente-sheets-8 no tiene el título de la columna
     nueva. Para firmar y verificar no hace falta —se lee por posición—, pero quien abra la
     pestaña tiene que saber qué es ese texto largo de la columna Q. */
  var cab = h.getRange(1, A_RENGLONES + 1);
  if (String(cab.getValue() || '') === '') {
    cab.setValue(COLS_AUT[A_RENGLONES]);
    cab.setFontWeight('bold').setBackground(AZUL).setFontColor('#ffffff');
  }
  return h;
}
function hojaSolicitudes() { return hojaConCabecera(HOJA_SOLICITUDES, COLS_SOL, false); }
function filasDe(h, ncols) {
  var n = h.getLastRow() - 1;
  return n > 0 ? h.getRange(2, 1, n, ncols).getValues() : [];
}
/* El último renglón de ese folio que cumpla la condición, con su número de fila. */
function ultimaFila(filas, colFolio, folio, cond) {
  for (var i = filas.length - 1; i >= 0; i--) {
    if (String(filas[i][colFolio]) === folio && (!cond || cond(filas[i]))) return { fila: i + 2, v: filas[i] };
  }
  return null;
}
function registroDeFila(v) {
  return { folio: String(v[A_FOLIO]), huella: String(v[A_HUELLA]), subCalc: Number(v[A_SUB]),
           precioAuth: Number(v[A_PRECIO]), itemsAuth: String(v[A_ITEMS] || ''),
           total: Number(v[A_TOTAL]), proyecto: String(v[A_PROY]), correo: String(v[A_AUTORIZO]),
           ts: String(v[A_TS]), renglones: String(v[A_RENGLONES] || '') };
}
function selloDeFila(v) {
  var r = registroDeFila(v);
  return { codigo: String(v[A_CODIGO]), correo: r.correo, ts: r.ts, huella: r.huella,
           subCalc: r.subCalc, precioAuth: r.precioAuth, itemsAuth: itemsAuthDeCanon(r.itemsAuth),
           total: r.total, nota: String(v[A_NOTA] || ''), renglones: renglonesDeTexto(r.renglones) };
}
function quienSoy(rol, ingreso) { return ingreso ? ingreso.correo : 'token de ' + rol; }
function soloDireccionConGoogle(ingreso, que) {
  if (ingreso && ingreso.rol === 'direccion') return null;
  return { ok: false, codigo: 'ROL_SIN_PERMISO',
    mensaje: ingreso
      ? 'Solo una cuenta de Dirección puede ' + que + '. ' + ingreso.correo + ' está en «Accesos» como ' + ingreso.rol + '.'
      : 'Para ' + que + ' hay que entrar con la cuenta de Google de Dirección: el token del teléfono no dice quién eres.' };
}
/* El candado del notario. NO se llama conCandado: ése ya existe más arriba —el de los
   formularios, que LANZA para que el diálogo lo enseñe— y en Apps Script dos funciones con el
   mismo nombre no truenan: gana la última, en silencio. Éste contesta un {ok:false} que viaja
   al teléfono como cualquier otra respuesta del puente. */
function conCandadoNotario(fn) {
  var candado = LockService.getScriptLock();
  try { candado.waitLock(20000); }
  catch (e) { return { ok: false, codigo: 'SIN_RED', mensaje: 'La hoja está ocupada con otra escritura. Vuelve a intentarlo.' }; }
  try { return fn(); } finally { candado.releaseLock(); }
}

/* ---------------------------------------------------------------- /solicitar */
/* Cualquier rol reconocido: quien cotiza sin ser dirección tiene rol de pagos o de
   fabricación, y es justo quien más necesita pedir. */
function rutaSolicitar_(cuerpo, rol, ingreso) {
  var folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El folio no se entiende.' };
  var c = limpiarCotizacion(cuerpo.cotizacion);
  if (c.error) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: c.error };
  var sub = cotSubtotal(c.items);
  if (!isFinite(c.subtotal) || Math.abs(sub - c.subtotal) > 0.01) return descuadre(sub, c.subtotal);
  var nota = String((cuerpo && cuerpo.nota) || '').slice(0, 500);
  var yo = quienSoy(rol, ingreso);
  return conCandadoNotario(function () {
    var h = hojaSolicitudes();
    var filas = filasDe(h, COLS_SOL.length);
    var viva = ultimaFila(filas, S_FOLIO, folio, function (v) { return v[S_ESTADO] === 'pendiente'; });
    /* La pendiente de OTRA identidad no se pisa. Se sobrescribía sin mirar quién la hizo: un
       folio ajeno —fabricación los conoce todos por /jalar— se volvía «suyo», y /estado le daba
       después el precio que se autorizara. La propia sí se reemplaza (volvió a pedir con otras
       partidas), y dirección puede con cualquiera: es la que resuelve la cola. */
    if (viva && String(viva.v[S_SOLICITO]) !== yo && rol !== 'direccion') {
      return { ok: false, codigo: 'ROL_SIN_PERMISO',
               mensaje: 'Ese folio ya tiene una solicitud pendiente de otra persona. Espera a que Dirección la resuelva, o pídele que la cancele.' };
    }
    var fila = [new Date(), txt(folio), txt(c.proyecto), txt(c.cliente), sub, c.iva ? 'Sí' : 'No',
                txt(cotHuella(c.iva, c.items)), txt(JSON.stringify(c)), txt(yo),
                'pendiente', '', '', txt(nota)];
    if (viva) h.getRange(viva.fila, 1, 1, fila.length).setValues([fila]);
    else h.getRange(h.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
    return { ok: true, estado: 'pendiente' };
  });
}
function descuadre(sub, delTelefono) {
  return { ok: false, codigo: 'CATALOGO_DESINCRONIZADO',
    mensaje: 'El precio de este teléfono (' + dinero2(delTelefono) + ') no coincide con el catálogo de la hoja (' +
             dinero2(sub) + '). Actualiza la app y vuelve a intentarlo.',
    subtotal_hoja: +dinero2(sub) };
}

/* ---------------------------------------------------------------- /cancelar */
/* El teléfono que pidió reabrió la cotización para editarla: lo que pidió ya no es lo que
   hay. Se deja de ofrecer a dirección en vez de dejar que autorice un trabajo viejo. */
function rutaCancelarSolicitud_(cuerpo, rol, ingreso) {
  var folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El folio no se entiende.' };
  return conCandadoNotario(function () {
    var h = hojaSolicitudes();
    var viva = ultimaFila(filasDe(h, COLS_SOL.length), S_FOLIO, folio, function (v) { return v[S_ESTADO] === 'pendiente'; });
    if (!viva) return { ok: true, estado: null };
    /* Solo la cancela quien la pidió, o dirección. Cualquier rol cancelaba la de cualquiera:
       bastaba conocer el folio para sacarle a otro su solicitud de la cola de dirección. */
    if (String(viva.v[S_SOLICITO]) !== quienSoy(rol, ingreso) && rol !== 'direccion') {
      return { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Esa solicitud la hizo otra persona: solo ella o Dirección la pueden cancelar.' };
    }
    h.getRange(viva.fila, S_ESTADO + 1, 1, 3).setValues([['cancelada', txt(quienSoy(rol, ingreso)), new Date()]]);
    return { ok: true, estado: 'cancelada' };
  });
}

/* --------------------------------------------------------------- /pendientes */
function rutaPendientes_(rol) {
  if (rol !== 'direccion') return { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'La cola de autorizaciones es de Dirección.' };
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_SOLICITUDES);
  if (!h) return { ok: true, solicitudes: [] };
  var out = [];
  var filas = filasDe(h, COLS_SOL.length);
  for (var i = filas.length - 1; i >= 0 && out.length < 50; i--) {
    var v = filas[i];
    if (v[S_ESTADO] !== 'pendiente') continue;
    var cot = null;
    try { cot = JSON.parse(String(v[S_COT] || '')); } catch (e) { cot = null; }
    if (!cot) continue;
    out.push({ folio: String(v[S_FOLIO]), cuando: v[S_TS] instanceof Date ? v[S_TS].getTime() : null,
               solicito: String(v[S_SOLICITO] || ''), nota: String(v[S_NOTA] || ''), cotizacion: cot });
  }
  return { ok: true, solicitudes: out };
}

/* ------------------------------------------------------------------ /estado */
/* El teléfono que pidió pregunta por sus folios. Contesta lo que sabe de cada uno: si ya
   hay sello vigente, el sello; si no, en qué quedó la solicitud.

   Solo de los SUYOS. Un sello trae el precio autorizado, los ajustes por partida, quién
   autorizó y su nota; sin esta guarda, cualquier rol —fabricación incluido, que no ve dinero
   en ninguna otra parte— lo podía pedir de cualquier folio que conociera. «Suyo» es que la
   solicitud la hizo esta misma identidad (quienSoy: el correo de Google, o el rol del token).
   Dirección ve todos: es la que los autoriza.

   Y el sello que se entrega es el de ESA solicitud, no el vigente del folio. Hasta aquí «es
   tuya» se decidía con el último renglón del folio y se entregaba el sello vigente, fuera de
   quien fuera y de cuando fuera:
     · fabricación pedía sobre un folio ajeno y leía el precio autorizado de otro;
     · y con una autorización vigente de ANTES, pedir otra vez contestaba «autorizada» con el
       sello viejo: el teléfono que pidió re-autorizar recibía el precio de antes y se cerraba
       solo; si dirección rechazaba la nueva, seguía diciendo «autorizada» y el teléfono
       esperaba para siempre.
   Ahora, para quien no es dirección, la solicitud es la última de ESA identidad, y el sello
   vale solo si se emitió después de ella y para ella (A_SOLICITO). Para dirección, la última
   del folio, con el mismo «después». Si no vale, se contesta en qué quedó la solicitud. */
function msDe(x) { return esFecha(x) ? x.getTime() : Date.parse(String(x)); }
function selloDeLaSolicitud(aut, sol, yo, todos) {
  if (!aut) return false;
  if (!todos && String(aut.v[A_SOLICITO]) !== yo) return false;
  if (!sol) return todos;
  /* Una pendiente nunca tiene sello: autorizar resuelve la pendiente del folio, así que un
     vigente con una pendiente detrás es de antes. Sin fecha de por medio. */
  if (sol.v[S_ESTADO] === 'pendiente') return false;
  /* A_TS es el ISO en texto que se firmó; S_TS es la fecha que la hoja devuelve como Date.
     Cualquiera que no se entienda da NaN, y NaN no es «después»: sin sello. */
  return msDe(aut.v[A_TS]) >= msDe(sol.v[S_TS]);
}
function rutaEstado_(cuerpo, rol, ingreso) {
  var yo = quienSoy(rol, ingreso), todos = rol === 'direccion';
  var folios = (cuerpo && Object.prototype.toString.call(cuerpo.folios) === '[object Array]') ? cuerpo.folios.slice(0, 20) : [];
  var ss = SpreadsheetApp.getActive();
  var ha = ss.getSheetByName(HOJA_AUTORIZACIONES), hs = ss.getSheetByName(HOJA_SOLICITUDES);
  var fa = ha ? filasDe(ha, COLS_AUT.length) : [], fs = hs ? filasDe(hs, COLS_SOL.length) : [];
  var out = {};
  folios.forEach(function (f) {
    f = String(f || '');
    if (!folioValido(f)) return;
    var sol = ultimaFila(fs, S_FOLIO, f, todos ? null : function (v) { return String(v[S_SOLICITO]) === yo; });
    if (!todos && !sol) {
      out[f] = { estado: null, sello: null, resolvio: '', nota: '' };
      return;
    }
    var aut = ultimaFila(fa, A_FOLIO, f, function (v) { return v[A_ESTADO] === 'vigente'; });
    if (!selloDeLaSolicitud(aut, sol, yo, todos)) aut = null;
    out[f] = {
      estado: aut ? 'autorizada' : (sol ? String(sol.v[S_ESTADO]) : null),
      sello: aut ? selloDeFila(aut.v) : null,
      resolvio: sol ? String(sol.v[S_RESOLVIO] || '') : '',
      nota: sol ? String(sol.v[S_NOTA] || '') : ''
    };
  });
  return { ok: true, folios: out };
}

/* --------------------------------------------------------------- /autorizar */
function rutaAutorizar_(cuerpo, rol, ingreso) {
  var no = soloDireccionConGoogle(ingreso, 'autorizar un precio');
  if (no) return no;
  var folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El folio no se entiende.' };
  var c = limpiarCotizacion(cuerpo.cotizacion);
  if (c.error) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: c.error };
  var subCalc = cotSubtotal(c.items);
  if (!isFinite(c.subtotal) || Math.abs(subCalc - c.subtotal) > 0.01) return descuadre(subCalc, c.subtotal);
  if (!(subCalc > 0)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Una cotización en $0 no se autoriza.' };
  var precioAuth = Number(cuerpo.precioAuth || 0);
  if (!isFinite(precioAuth) || precioAuth < 0 || precioAuth > 1e9) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El precio autorizado no es un importe válido.' };
  var ia = limpiarItemsAuth(cuerpo.itemsAuth, c.items);
  if (ia.error) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: ia.error };
  var nota = String(cuerpo.nota || '').slice(0, 500);

  var r = { folio: folio, huella: cotHuella(c.iva, c.items), subCalc: +dinero2(subCalc),
            precioAuth: +dinero2(precioAuth), itemsAuth: itemsAuthCanon(ia.valor),
            total: cotTotalFinal(subCalc, c.iva, precioAuth), proyecto: c.proyecto,
            correo: ingreso.correo, ts: '' };
  /* Los renglones salen de lo que la hoja ya comprobó —sus importes, sus ajustes ya escritos en
     canon (los mismos centavos que el teléfono recibe con el sello) y el precio redondeado—, no
     de importes que mande el teléfono. */
  r.renglones = renglonesDe(c.items, c.iva, itemsAuthDeCanon(r.itemsAuth),
                            cotPrecioFinal(subCalc, c.iva, r.precioAuth));
  /* Contra el calculado CON IVA si lo lleva, que es contra lo que se mide el total. */
  var netoCalc = cotNeto(subCalc, c.iva);
  var pct = netoCalc > 0 ? Math.round((netoCalc - r.total) / netoCalc * 1000) / 10 : 0;

  return conCandadoNotario(function () {
    var secreto = secretoDelSello_(true);
    var h = hojaAutorizaciones();
    var filas = filasDe(h, COLS_AUT.length);
    var vigente = ultimaFila(filas, A_FOLIO, folio, function (v) { return v[A_ESTADO] === 'vigente'; });
    if (vigente) {
      var antes = registroDeFila(vigente.v);
      /* El mismo trabajo al mismo precio otra vez: un doble toque, o un reintento después de
         una respuesta que se perdió. Se devuelve el MISMO sello sin escribir nada: dos
         renglones con la misma decisión harían creer que se autorizó dos veces. */
      if (antes.huella === r.huella && antes.subCalc === r.subCalc && antes.precioAuth === r.precioAuth &&
          antes.itemsAuth === r.itemsAuth && antes.proyecto === r.proyecto &&
          /* Y los mismos renglones. Una descripción corregida no mueve la huella, pero sí lo que
             /verificar enseña: devolver el sello viejo dejaría al QR diciendo la de antes. Un
             vigente de antes de puente-sheets-8 no trae renglones, así que volver a autorizarlo
             tal cual le da uno nuevo que sí los firma. */
          antes.renglones === r.renglones) {
        return { ok: true, sello: selloDeFila(vigente.v), repetida: true };
      }
      /* Otro precio u otro trabajo sobre el mismo folio: volver a autorizar. La de antes no se
         borra, se SUPERA: un PDF viejo verifica como «superada», que no es lo mismo que falso. */
      h.getRange(vigente.fila, A_ESTADO + 1).setValue('superada');
    }
    r.ts = new Date().toISOString();
    var firma = firmar(r, secreto);
    var codigo = codigoDe(firma);
    var sol = ultimaFila(filasDe(hojaSolicitudes(), COLS_SOL.length), S_FOLIO, folio,
                         function (v) { return v[S_ESTADO] === 'pendiente'; });
    var fila = [txt(r.ts), txt(folio), txt(r.proyecto), txt(c.cliente), r.subCalc, r.precioAuth, r.total,
                pct, txt(r.itemsAuth), txt(r.huella), txt(r.correo), txt(sol ? String(sol.v[S_SOLICITO] || '') : r.correo),
                txt(codigo), txt(firma), 'vigente', txt(nota), txt(r.renglones)];
    h.getRange(h.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
    if (sol) hojaSolicitudes().getRange(sol.fila, S_ESTADO + 1, 1, 4)
      .setValues([['autorizada', txt(r.correo), new Date(), txt(nota || String(sol.v[S_NOTA] || ''))]]);
    /* Los ajustes por partida van como quedaron firmados —a centavo—, igual que los devuelve
       /estado. Antes iban como llegaron, y el teléfono que autorizaba aquí se quedaba con unos
       centavos y el que lo recibía por /estado con otros: los renglones del PDF no habrían
       cuadrado con los firmados en uno de los dos. */
    return { ok: true, sello: { codigo: codigo, correo: r.correo, ts: r.ts, huella: r.huella,
             subCalc: r.subCalc, precioAuth: r.precioAuth, itemsAuth: itemsAuthDeCanon(r.itemsAuth), total: r.total, nota: nota,
             renglones: renglonesDeTexto(r.renglones) } };
  });
}

/* ---------------------------------------------------------------- /rechazar */
function rutaRechazar_(cuerpo, rol, ingreso) {
  var no = soloDireccionConGoogle(ingreso, 'rechazar una solicitud');
  if (no) return no;
  var folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El folio no se entiende.' };
  var nota = String((cuerpo && cuerpo.nota) || '').slice(0, 500);
  return conCandadoNotario(function () {
    var h = hojaSolicitudes();
    var viva = ultimaFila(filasDe(h, COLS_SOL.length), S_FOLIO, folio, function (v) { return v[S_ESTADO] === 'pendiente'; });
    if (!viva) return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Esa solicitud ya no está pendiente.' };
    h.getRange(viva.fila, S_ESTADO + 1, 1, 4).setValues([['rechazada', txt(ingreso.correo), new Date(), txt(nota)]]);
    return { ok: true, estado: 'rechazada' };
  });
}

/* ----------------------------------------------------------------- /revocar */
/* Para el día en que un PDF autorizado ya no vale —se canceló el trabajo, se equivocó el
   precio—. El renglón se queda; su estado cambia, y el QR dice «revocada». */
function rutaRevocar_(cuerpo, rol, ingreso) {
  var no = soloDireccionConGoogle(ingreso, 'revocar una autorización');
  if (no) return no;
  var folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El folio no se entiende.' };
  return conCandadoNotario(function () { return revocarAutorizacion(folio) ? { ok: true } :
    { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Ese folio no tiene una autorización vigente.' }; });
}
/** Revoca la autorización vigente de un folio. Se puede correr a mano desde el editor:
 *  revocarAutorizacion('COT-0042@K7QM') */
function revocarAutorizacion(folio) {
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_AUTORIZACIONES);
  if (!h) return false;
  var vig = ultimaFila(filasDe(h, COLS_AUT.length), A_FOLIO, String(folio), function (v) { return v[A_ESTADO] === 'vigente'; });
  if (!vig) return false;
  h.getRange(vig.fila, A_ESTADO + 1).setValue('revocada');
  return true;
}

/* ---------------------------------------------------------------- /verificar */
/* PÚBLICA. La abre el QR de un PDF, desde el teléfono de cualquiera, sin cuenta y sin token.
   Por eso contesta lo mínimo —folio, fecha, total, negocio y, desde puente-sheets-8, los
   renglones que el papel ya trae impresos— y nunca cliente, teléfono, dirección ni correo. Y
   tiene su propio cupo, contado por folio y en total, porque aquí no hay identidad contra la cual contarlo. */
var VERIFICAR_POR_FOLIO = 30;      // cada 10 minutos
var VERIFICAR_EN_TOTAL = 400;
function rutaVerificar_(cuerpo) {
  var folio = String((cuerpo && cuerpo.f) || '').trim();
  var cod = normalizarCodigo(cuerpo && cuerpo.c);
  /* folioDePapel_ y no folioValido: aquí llega lo que está impreso, con «@aparato» si se
     escaneó el QR y sin él si se tecleó de la hoja. Ver la nota de folioDePapel_. */
  if (!folioDePapel_(folio) || cod.length !== 12) return { ok: true, estado: 'no_autentica' };
  /* El cupo se cuenta por el folio CORTO: «COT-0042» y «COT-0042@K7QM» son la misma
     cotización, y con dos cubetas alguien podría pedir el doble alternando las dos formas. */
  if (!cupoDeVerificar(folioCorto_(folio))) return { ok: false, codigo: 'SIN_RED', mensaje: 'Demasiadas consultas seguidas. Espera unos minutos.' };
  var h = SpreadsheetApp.getActive().getSheetByName(HOJA_AUTORIZACIONES);
  var secreto = secretoDelSello_(false);
  if (!h || !secreto) return { ok: true, estado: 'no_autentica' };
  var filas = filasDe(h, COLS_AUT.length);
  var hallada = ultimaFilaDeVerificar_(filas, folio, cod);
  if (!hallada) return { ok: true, estado: 'no_autentica' };
  /* La firma se RECALCULA desde el renglón. Si alguien cambió el total o el negocio a mano en
     la hoja, deja de cuadrar: el renglón existe, pero ya no dice lo que se firmó. */
  var firma = firmar(registroDeFila(hallada.v), secreto);
  if (firma !== String(hallada.v[A_FIRMA]) || normalizarCodigo(codigoDe(firma)) !== cod) return { ok: true, estado: 'no_autentica' };
  var est = String(hallada.v[A_ESTADO]);
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var cuando = new Date(String(hallada.v[A_TS]));
  /* El folio que se contesta sale del RENGLÓN, no de lo que se tecleó: si alguien mandó
     «cot-0042» en minúsculas o con el aparato pegado, lo que se enseña al lado del papel es lo
     que la hoja tiene guardado.
     Y los renglones, si el sello los firmó: descripción, cantidad e importe de cada partida, que
     es lo que el papel ya enseña —nada de cliente, teléfono ni correo—. `null` es un sello de
     antes de puente-sheets-8: auténtico, pero solo responde del total, y la página lo dice. */
  return { ok: true, estado: est === 'vigente' ? 'autentica' : (est === 'revocada' ? 'revocada' : 'superada'),
           folio: folioCorto_(hallada.v[A_FOLIO]), fecha: isNaN(cuando) ? '' : Utilities.formatDate(cuando, tz, 'dd/MM/yyyy'),
           total: Number(hallada.v[A_TOTAL]), proyecto: String(hallada.v[A_PROY]),
           renglones: renglonesDeTexto(hallada.v[A_RENGLONES]) };
}
/* ----- Buscar la autorización con lo que trae el papel -----
   ultimaFila() compara el folio con «===» y ahí no cabe el folio corto, así que /verificar
   tiene la suya. Manda el CÓDIGO: doce hexadecimales del HMAC del renglón. El folio solo
   estrecha la búsqueda —exacto si trae «@aparato», por el corto si no—, y quien decide de
   verdad es la firma que rutaVerificar_ recalcula después.

   De atrás para adelante, como ultimaFila(), porque una cotización reautorizada deja varios
   renglones con el mismo folio: el último es el que vale, y los de antes salen «superada». */
function ultimaFilaDeVerificar_(filas, folio, cod) {
  /* El folio corto se compara sin distinguir mayúsculas: el prefijo es siempre «COT-» y lo
     que sigue son dígitos, así que dos folios no pueden diferenciarse solo por la caja, y
     quien teclea del papel en un teclado físico escribe «cot-42» tan fácil como «COT-42».
     La parte del aparato (la que solo llega por QR, ya bien escrita) sí se compara exacta:
     ahí sí hay minúsculas y mayúsculas que significan cosas distintas. */
  var conAparato = String(folio).indexOf('@') >= 0, corto = folioCorto_(folio).toUpperCase();
  for (var i = filas.length - 1; i >= 0; i--) {
    var v = filas[i], f = String(v[A_FOLIO]);
    if (conAparato ? f !== folio : folioCorto_(f).toUpperCase() !== corto) continue;
    if (normalizarCodigo(v[A_CODIGO]) !== cod) continue;
    return { fila: i + 2, v: v };
  }
  return null;
}
function cupoDeVerificar(folio) {
  try {
    var cache = CacheService.getScriptCache();
    var k1 = 'v_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, folio)).slice(0, 24);
    /* En ventanas fijas de diez minutos (contarEnVentana): con la caducidad que se reiniciaba
       en cada consulta, una cada nueve minutos dejaba el cupo total cerrado para siempre. */
    var n1 = contarEnVentana(cache, k1, 600), n2 = contarEnVentana(cache, 'v__total', 600);
    return n1 <= VERIFICAR_POR_FOLIO && n2 <= VERIFICAR_EN_TOTAL;
  } catch (e) { return true; }
}

/** Crea las dos pestañas y el secreto del sello si faltan. Idempotente, y NUNCA rota el
 *  secreto: cambiarlo haría que todos los PDF ya impresos verifiquen como «no auténtica». */
function configurarAutorizaciones() {
  hojaAutorizaciones(); hojaSolicitudes(); secretoDelSello_(true);
  return 'Listo: pestañas «' + HOJA_AUTORIZACIONES + '» (oculta) y «' + HOJA_SOLICITUDES + '», y el secreto del sello.';
}

/* ============================================================================
   LA IA, POR EL PUENTE — las llaves viven aquí y no en los teléfonos.

   Antes cada teléfono guardaba sus propias llaves de Qwen, DeepSeek y Gemini, ofuscadas con
   una sal que venía escrita en el propio código: quien tuviera el teléfono las sacaba en una
   línea, y quitar a alguien de «Accesos» no le quitaba la IA, que seguía cobrándose a la
   cuenta de AL3D. Ahora las llaves se pegan UNA vez, en ⚡ AL3D → Llaves de IA, y el teléfono
   le pide a este puente que llame por él.

   Lo que NO se mudó es la cadena: el orden Qwen → DeepSeek → Gemini, los reintentos, las
   esperas y el «probando con Qwen…» siguen en el teléfono. Apps Script no puede decir nada a
   mitad de una ejecución, y con el cliente enfrente ese letrero es lo que evita que parezca
   colgada. Cada llamada a /ia es UN intento contra UN proveedor, como era cada fetch.
   ============================================================================ */
var IA_PROVS = ['qwen', 'deepseek', 'gemini'];
var IA_NOMBRE = { qwen: 'Qwen', deepseek: 'DeepSeek', gemini: 'Gemini' };
var IA_URLS = { qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
                deepseek: 'https://api.deepseek.com/chat/completions' };
/* Los modelos que se pueden pedir: el de cada proveedor y sus hermanos de respaldo, los de
   AI_DEFAULTS y AI_RESPALDO en js/cotizador/ia.js. Con la llave aquí, dejar que el teléfono
   escoja cualquier modelo sería dejar que escoja cuánto cuesta cada llamada. */
var IA_MODELOS = { qwen: ['qwen3.7-flash', 'qwen3.6-flash'], deepseek: ['deepseek-flash'],
                   gemini: ['gemini-3.1-flash-lite', 'gemini-3.6-flash'] };
var IA_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/* Por persona y por día. Una cotización con IA son de una a cuatro llamadas; doscientas es
   un día de trabajo muy largo, y es muy poco para quien quiera vaciar la cuenta. La cuenta
   de Google gratuita permite unas 20 000 salidas a internet al día en total. */
var IA_LIMITE_DIARIO = 200;
var IA_MAX_LLAVES = 4;
var IA_MAX_CUERPO = 15 * 1024 * 1024;
/* Cuerpos de más de 64 KB por minuto, entre todos. Un análisis manda uno; cuarenta por minuto
   es un taller entero cotizando con IA a la vez, y muy poco para tumbar la hoja a fuerza de
   archivos. Se cuenta antes de parsear, porque antes de parsear no se sabe quién es. */
var CUERPOS_GRANDES_POR_MINUTO = 40;
function cupoDeCuerposGrandes() {
  try {
    var cache = CacheService.getScriptCache();
    return contarEnVentana(cache, 'grandes', 60) <= CUERPOS_GRANDES_POR_MINUTO;
  } catch (e) { return true; }
}

/* iaLlaves_ e iaOrdenDeLlaves_ llevan guion bajo porque DEVUELVEN las llaves: sin él,
   google.script.run las podía llamar desde cualquier diálogo del menú (ver escaparHtml), y un
   guion colado en uno se llevaba las llaves de la cuenta de AL3D. Con él, solo este script. */
function iaLlaves_(prov) {
  try {
    var m = JSON.parse(PropertiesService.getScriptProperties().getProperty('IA_KEYS') || '{}');
    var ks = m && Object.prototype.toString.call(m[prov]) === '[object Array]' ? m[prov] : [];
    return ks.filter(function (k) { return typeof k === 'string' && k.length >= 10; });
  } catch (e) { return []; }
}
function iaEstado() {
  var o = {};
  IA_PROVS.forEach(function (p) { o[p] = iaLlaves_(p).length > 0; });
  return o;
}
/* Las llaves se turnan: cada llamada empieza por la siguiente, para repartir la cuota. Sin
   candado a propósito: una carrera reparte un poco peor un instante, no rompe nada. */
function iaOrdenDeLlaves_(prov) {
  var ks = iaLlaves_(prov);
  if (ks.length < 2) return ks;
  var props = PropertiesService.getScriptProperties();
  var rot = {};
  try { rot = JSON.parse(props.getProperty('IA_ROTACION') || '{}') || {}; } catch (e) { rot = {}; }
  var i = (Number(rot[prov]) || 0) % ks.length;
  rot[prov] = (i + 1) % ks.length;
  try { props.setProperty('IA_ROTACION', JSON.stringify(rot)); } catch (e2) {}
  return ks.slice(i).concat(ks.slice(0, i));
}
/* Leer, sumar y escribir, con candado. Sin él, una ráfaga de consultas en paralelo leía todas
   la misma cuenta y cada una escribía «la de antes + 1»: veinte a la vez contaban como una, y
   el tope de doscientas se pasaba. El candado es el del script —el único que hay entre
   ejecuciones— pero corto y solo alrededor de la cuenta, no de la llamada a la IA: tomado
   mientras el proveedor contesta, dejaría la hoja sin escrituras diez o veinte segundos. Si no
   se consigue en tres segundos (una subida grande del puente lo tiene), se niega con su razón
   y el teléfono reintenta: contar a ciegas es justo lo que se está cerrando.
   Devuelve true, false (cupo agotado) o null (no se pudo contar). */
function dentroDelCupoIA(quien) {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(3000)) return null;
  try {
    var props = PropertiesService.getScriptProperties();
    var hoy = Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd');
    var clave = 'IA_CUOTA_' + hoy;
    var m = {};
    try { m = JSON.parse(props.getProperty(clave) || '{}') || {}; } catch (e) { m = {}; }
    var id = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, quien)).slice(0, 16);
    m[id] = (Number(m[id]) || 0) + 1;
    props.setProperty(clave, JSON.stringify(m));
    /* Las cuentas de días pasados no se quedan para siempre en las propiedades. */
    Object.keys(props.getProperties()).forEach(function (k) {
      if (k.indexOf('IA_CUOTA_') === 0 && k !== clave) props.deleteProperty(k);
    });
    return m[id] <= IA_LIMITE_DIARIO;
  } catch (e) { return true; }
  finally { candado.releaseLock(); }
}

/* La petición al proveedor, armada EXACTAMENTE como la armaban aiLlamar() del cotizador y
   llamar() del asistente cuando salían del teléfono. */
function iaPeticion(prov, model, key, d) {
  if (prov === 'gemini') {
    var body;
    if (d.modo === 'cotizar') {
      body = { contents: [{ parts: [{ text: d.prompt }, { inline_data: { mime_type: d.mime, data: d.b64 } }] }],
               generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
    } else {
      var contents = d.mensajes.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; })
        .concat([{ role: 'user', parts: [{ text: d.pregunta }] }]);
      body = { systemInstruction: { parts: [{ text: d.sistema }] }, contents: contents,
               generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } };
    }
    return { url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) +
                  ':generateContent?key=' + encodeURIComponent(key),
             opts: { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true } };
  }
  var b;
  if (d.modo === 'cotizar') {
    b = { model: model, temperature: 0.2, max_tokens: 4096,
          messages: [{ role: 'user', content: [{ type: 'text', text: d.prompt },
                     { type: 'image_url', image_url: { url: 'data:' + d.mime + ';base64,' + d.b64 } }] }] };
    if (!d.sinJson) b.response_format = { type: 'json_object' };
  } else {
    b = { model: model, temperature: 0.2, max_tokens: 1200,
          messages: [{ role: 'system', content: d.sistema }].concat(d.mensajes, [{ role: 'user', content: d.pregunta }]) };
  }
  if (prov === 'deepseek') b.thinking = { type: 'disabled' };
  return { url: IA_URLS[prov],
           opts: { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + key },
                   payload: JSON.stringify(b), muteHttpExceptions: true } };
}
/* Qué contestó, en el mismo idioma que aiError() del cotizador: el estado, si vale la pena
   reintentar, y una frase que se pueda leer. */
function iaRespuesta(prov, model, codigo, txt) {
  var data = null;
  try { data = JSON.parse(txt); } catch (e) { data = null; }
  var n = IA_NOMBRE[prov];
  var e = data && data.error;
  if (codigo >= 200 && codigo < 300 && data && !e) {
    var texto = '', razon = '';
    if (prov === 'gemini') {
      var cand = (data.candidates || [])[0];
      texto = ((cand && cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('').trim();
      razon = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '';
    } else {
      var ch = (data.choices || [])[0];
      texto = ((ch && ch.message && ch.message.content) || '').trim();
      razon = (ch && ch.finish_reason) || '';
    }
    if (texto) return { ok: true, texto: texto, prov: prov, model: model };
    return { ok: false, codigo: 'VACIO', razon: String(razon || ''), transitorio: !razon, prov: prov,
             mensaje: n + ' respondió vacío' };
  }
  var crudo = ((typeof e === 'string' ? e : (e && (e.message || e.msg))) || (data && data.message) ||
               String(txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 140);
  var s = (e && typeof e.code === 'number' && e.code >= 100) ? e.code : codigo;
  var msg, trans = false;
  if (s === 429) { msg = n + ' alcanzó su límite de peticiones'; trans = true; }
  else if (s === 408 || s >= 500) { msg = n + ' está saturado'; trans = true; }
  else if (s === 401 || s === 403) msg = 'la llave de ' + n + ' que está en la hoja no es válida o no tiene saldo';
  else if (s === 404) msg = n + ' no reconoce el modelo «' + model + '»';
  else if (s === 413) msg = 'el archivo pesa demasiado para ' + n;
  else msg = n + ' rechazó la petición (HTTP ' + s + ')';
  return { ok: false, codigo: 'PROVEEDOR', status: s, transitorio: trans, crudo: crudo, prov: prov,
           mensaje: crudo ? msg + ' — ' + crudo : msg };
}
function limpiarPeticionIA(c) {
  var d = { modo: c.modo === 'chat' ? 'chat' : 'cotizar', sinJson: !!c.sinJson };
  if (d.modo === 'cotizar') {
    d.prompt = String(c.prompt || '');
    var img = c.imagen || {};
    d.b64 = String(img.b64 || ''); d.mime = String(img.mime || '');
    if (!d.prompt || d.prompt.length > 30000) return { error: 'Falta la instrucción para la IA.' };
    if (!d.b64 || !/^[A-Za-z0-9+\/=]+$/.test(d.b64.slice(0, 200))) return { error: 'Falta el archivo que se va a analizar.' };
    if (IA_MIMES.indexOf(d.mime) === -1) return { error: 'Solo se analizan JPG, PNG, WEBP o PDF.' };
  } else {
    d.sistema = String(c.sistema || '').slice(0, 40000);
    d.pregunta = String(c.pregunta || '').slice(0, 4000);
    var ms = Object.prototype.toString.call(c.mensajes) === '[object Array]' ? c.mensajes.slice(-20) : [];
    d.mensajes = ms.map(function (m) {
      return { role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').slice(0, 8000) };
    });
    if (!d.pregunta) return { error: 'Falta la pregunta.' };
  }
  return d;
}
function rutaIA_(cuerpo, quien) {
  var prov = String((cuerpo && cuerpo.prov) || '');
  var model = String((cuerpo && cuerpo.model) || '');
  if (IA_PROVS.indexOf(prov) === -1) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Ese proveedor de IA no existe.' };
  if (IA_MODELOS[prov].indexOf(model) === -1) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: IA_NOMBRE[prov] + ': el modelo «' + model + '» no está en la lista de la hoja.' };
  var d = limpiarPeticionIA(cuerpo || {});
  if (d.error) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: d.error };
  if (d.modo === 'cotizar' && d.mime === 'application/pdf' && prov !== 'gemini') return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo Gemini lee PDF.' };
  var llaves = iaOrdenDeLlaves_(prov);
  if (!llaves.length) return { ok: false, codigo: 'SIN_LLAVE', prov: prov, transitorio: false,
    mensaje: IA_NOMBRE[prov] + ' no tiene llave en la hoja — Dirección la pega en ⚡ AL3D → Llaves de IA' };
  var cupo = dentroDelCupoIA(quien);
  if (cupo === null) return { ok: false, codigo: 'SIN_RED', transitorio: true, prov: prov,
    mensaje: 'La hoja está ocupada con otra escritura y no pudo contar esta consulta de IA. Vuelve a intentarlo en un momento.' };
  if (!cupo) return { ok: false, codigo: 'CUPO_AGOTADO', transitorio: false,
    mensaje: 'Llegaste al tope de ' + IA_LIMITE_DIARIO + ' consultas de IA por hoy. Mañana se reinicia.' };
  var ultima = null;
  for (var i = 0; i < llaves.length; i++) {
    var p = iaPeticion(prov, model, llaves[i], d);
    var r;
    try { r = UrlFetchApp.fetch(p.url, p.opts); }
    catch (e) { ultima = { ok: false, codigo: 'PROVEEDOR', status: 0, transitorio: true, prov: prov, mensaje: 'no se pudo conectar con ' + IA_NOMBRE[prov] }; continue; }
    var res = iaRespuesta(prov, model, r.getResponseCode(), r.getContentText());
    if (res.ok) return res;
    ultima = res;
    /* Con otra llave del mismo proveedor se sigue solo si el problema era de ESA llave: una
       cuota agotada o una llave sin saldo. Un modelo que no existe no lo arregla otra llave. */
    if (!(res.status === 429 || res.status === 401 || res.status === 403)) break;
  }
  return ultima;
}

/* ---------------------------------------------------------- Llaves de IA (menú) */
function mascaraLlave(k) { return '••••' + escaparHtml(String(k).slice(-4)); }
function dialogoLlavesIA() {
  var filas = IA_PROVS.map(function (p) {
    var ks = iaLlaves_(p);
    return '<label>' + IA_NOMBRE[p] + ' — ' + (ks.length ? ks.map(mascaraLlave).join(', ') : '<i>sin llave</i>') + '</label>' +
      '<textarea id="k_' + p + '" rows="2" placeholder="Pega aquí para reemplazar (una por renglón). Vacío = no cambiar."></textarea>' +
      '<label style="font-weight:400;margin-top:4px"><input type="checkbox" id="b_' + p + '" style="width:auto"> Quitar las de ' + IA_NOMBRE[p] + '</label>';
  }).join('');
  var c =
    '<h2>Llaves de IA</h2>' +
    '<p class="sub">Viven en las propiedades de este script, no en los teléfonos. El cotizador y el asistente ' +
    'las usan a través del puente, y solo para quien está en «Accesos».</p>' + filas +
    '<div class="dato">Orden de intento: Qwen → DeepSeek → Gemini. Los PDF solo los lee Gemini. ' +
    'Tope: ' + IA_LIMITE_DIARIO + ' consultas por persona al día.</div>' +
    '<div class="pie"><button class="gris" onclick="google.script.host.close()">Cerrar</button>' +
    '<button onclick="guardar()">Guardar</button></div><div id="msg" class="aviso"></div>' +
    '<script>function guardar(){var d={};' + JSON.stringify(IA_PROVS) + '.forEach(function(p){' +
    'd[p]={nuevas:document.getElementById("k_"+p).value,quitar:document.getElementById("b_"+p).checked};});' +
    'google.script.run.withSuccessHandler(function(m){var e=document.getElementById("msg");e.className="aviso ok";e.textContent=m;})' +
    '.withFailureHandler(function(x){var e=document.getElementById("msg");e.className="aviso mal";e.textContent=x.message;})' +
    '.guardarLlavesIA(d);}</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 600), 'Llaves de IA');
}
function guardarLlavesIA(d) {
  var props = PropertiesService.getScriptProperties();
  var m = {};
  try { m = JSON.parse(props.getProperty('IA_KEYS') || '{}') || {}; } catch (e) { m = {}; }
  IA_PROVS.forEach(function (p) {
    var x = (d && d[p]) || {};
    if (x.quitar) { m[p] = []; return; }
    var nuevas = String(x.nuevas || '').split(/[\s,]+/).map(function (k) { return k.trim(); })
      .filter(function (k) { return k.length >= 10; }).slice(0, IA_MAX_LLAVES);
    if (nuevas.length) m[p] = nuevas;
  });
  props.setProperty('IA_KEYS', JSON.stringify(m));
  return 'Guardado. ' + IA_PROVS.map(function (p) { return IA_NOMBRE[p] + ': ' + ((m[p] || []).length || 'sin') + ' llave' + ((m[p] || []).length === 1 ? '' : 's'); }).join(' · ');
}

/* ------------------------------------------ realinear Y:AD, una sola vez */
/**
 * Hasta puente-sheets-5, ordenarVentas movía A:N y dejaba Y:AD en su renglón (ver la regla
 * de orden). Cada reacomodo le cambiaba de dueño al folio de cotización, a la etapa, a la
 * dirección y al % de comisión de las filas que se movían. Esto los regresa con su venta.
 *
 * La pista es la bitácora del puente. Las únicas que escriben Y:AD son las subidas, y cada
 * una quedó anotada con su folio, su FILA en ese momento y sus columnas; y como el código de
 * antes nunca movió Y:AD, lo que hay hoy en una celda de Y:AD es lo que escribió ahí la
 * última subida que la tocó. De ese folio es, y va a la fila donde ese folio está hoy.
 *
 * Por eso se corre UNA vez y en un momento preciso: antes de que ningún reacomodo mueva
 * Y:AD con su fila —después, la bitácora ya no dice dónde está cada celda—, y solo a mano:
 * revisarColumnasDelPuente() enseña la propuesta y realinearColumnasDelPuente() aplica
 * exactamente esa (ninguna subida la corre sola: la bitácora puede estar desfasada por una
 * fila borrada a mano, y eso lo tiene que ver una persona). Lo que no se puede atribuir se queda donde está; nada se
 * pierde: antes de escribir se copia Ventas a «Ventas (antes de realinear)» y se deja la
 * lista de cada celda que cambió en la pestaña «Revisión Y-AD».
 *
 * Lo que NO arregla: si una subida ya escribió el nombre y el dinero de una venta encima de
 * otra (buscó la fila por un folio de cotización revuelto), esa venta vieja ya no está en
 * Ventas. La revisión enseña las ventas que cambiaron de nombre desde el último respaldo
 * para buscarlas en Archivo › Historial de versiones.
 */
var PROP_ALINEADAS = 'PUENTE_Y_AD_ALINEADAS';
var HOJA_REVISION = 'Revisión Y-AD';
var HOJA_ANTES_DE_REALINEAR = 'Ventas (antes de realinear)';

/** true: ya se realineó. false: todavía no. null: no se pudo leer. Sin saberlo NO se
 *  realinea otra vez ni se reacomoda: las dos cosas, hechas a ciegas, revuelven Y:AD. */
function estadoDeAlineacion() {
  try { return !!PropertiesService.getScriptProperties().getProperty(PROP_ALINEADAS); }
  catch (e) { return null; }
}
function columnasDelPuenteAlineadas() { return estadoDeAlineacion() === true; }

/* Lo que se reescribe con getValues → setValues pierde el apóstrofo con el que armarCeldas
   protege un texto que empieza con = + - @: getValue lo devuelve sin él y setValues lo vuelve
   fórmula. Una fórmula de verdad nunca llega aquí como texto (getValues da su resultado), así
   que un texto con esos inicios es texto y se vuelve a proteger. */
function textoProtegido(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}
/* `desde` es la columna en la que empieza cada fila (1 si no se dice). El teléfono de AE es la
   excepción: un «+52 1 33…» limpio no lleva apóstrofo, porque su columna está en texto sin
   formato (telefonosATexto) y ahí el apóstrofo se quedaría escrito como parte del número. Lo
   que no es un teléfono limpio se protege como cualquier otro texto. */
function filasProtegidas(filas, desde) {
  var kTel = COL['Telefono'] - (desde || 1);
  /* Las notas y los sellos (puente-sheets-14) también viven en texto sin formato (notasATexto_):
     ahí un «- pedir medidas» no es fórmula, y el apóstrofo se quedaría escrito en la nota. */
  var kNotas = COL['Notas'] - (desde || 1), kSellos = COL['Sellos'] - (desde || 1);
  return filas.map(function (r) {
    return r.map(function (v, k) {
      if (k === kTel && typeof v === 'string' && v !== '' && telefonoLimpio(v) === v) return v;
      if ((k === kNotas || k === kSellos) && typeof v === 'string') return v;
      return textoProtegido(v);
    });
  });
}

function esFecha(x) { return Object.prototype.toString.call(x) === '[object Date]'; }
function mismoValor(a, b) {
  if (esFecha(a) && esFecha(b)) return a.getTime() === b.getTime();
  return a === b || ((a === '' || a === null) && (b === '' || b === null));
}

/** Qué quedaría en Y:AD, sin escribir nada. */
function propuestaDeRealineacion(h) {
  var ss = SpreadsheetApp.getActive();
  var n = FIN - 1;
  var ini = COL['Folio cotizacion'];
  /* Hasta AD y no hasta ULTIMA_COL: AE (el teléfono) nunca estuvo revuelta. Ver ULTIMA_COL_REALINEABLE. */
  var ancho = Math.min(ULTIMA_COL_REALINEABLE, h.getMaxColumns()) - ini + 1;
  var p = { ini: ini, ancho: Math.max(0, ancho), nueva: [], cambios: [], movidas: 0,
            sinDueno: [], huerfanos: [], desplazados: [], renombradas: [] };
  if (ancho < 1) return p;   // una hoja sin las columnas del puente no tiene qué realinear

  var actual = h.getRange(2, ini, n, ancho).getValues();
  /* La hora se compara y se enseña como «HH:MM», no como el Date de 1899 en que Sheets la
     convierte (ver horaDeCelda): la revisión decía «Sat Dec 30 1899…», y una celda con el
     Date y otra con su mismo «10:00» contaban como distintas. Aquí no se escribe nada. */
  var kHora = COL['Hora instalacion'] - ini;
  if (kHora < ancho) {
    var tz = ss.getSpreadsheetTimeZone();
    actual.forEach(function (r) { r[kHora] = horaDeCelda(r[kHora], tz); });
  }
  var ab = h.getRange(2, 1, n, 2).getValues();
  var filaDe = {};
  ab.forEach(function (r, i) {
    var f = String(r[0]).trim();
    if (f && !Object.prototype.hasOwnProperty.call(filaDe, f)) filaDe[f] = i;
  });
  var nombres = [];
  for (var c = 0; c < ancho; c++) nombres.push(nombreDeColumna(ini + c).trim());

  /* 1. De quién es cada celda: del último que la escribió en ese renglón. */
  var dueno = {};
  var b = ss.getSheetByName(BITACORA);
  var nb = b ? b.getLastRow() - 1 : 0;
  if (nb > 0) {
    var bit = b.getRange(2, 1, nb, 5).getValues();
    for (var i = 0; i < bit.length; i++) {
      var folio = String(bit[i][2]).trim(), fila = Number(bit[i][3]);
      if (!folio || !(fila >= 2 && fila <= FIN)) continue;
      var campos = String(bit[i][4]).split(' + ')[0].split(',')
                     .map(function (x) { return x.trim(); });
      for (var k = 0; k < ancho; k++) {
        if (campos.indexOf(nombres[k]) !== -1) dueno[(fila - 2) + ':' + k] = { folio: folio, orden: i };
      }
    }
  }

  /* 2. Lo último que cada folio dejó escrito, columna por columna. */
  var ultimo = {}, sueltas = {};
  for (var r = 0; r < n; r++) {
    for (var k2 = 0; k2 < ancho; k2++) {
      var v = actual[r][k2];
      if (v === '' || v === null) continue;
      var d = dueno[r + ':' + k2];
      if (!d) { sueltas[r + ':' + k2] = true; continue; }
      var u = ultimo[d.folio] || (ultimo[d.folio] = {});
      if (!u[k2] || u[k2].orden < d.orden) u[k2] = { valor: v, orden: d.orden, r: r };
    }
  }

  /* 3. La Y:AD nueva: lo suelto se queda donde está; lo de cada folio, a su fila de hoy. */
  var nueva = [];
  for (var r2 = 0; r2 < n; r2++) {
    var vacia = [];
    for (var k3 = 0; k3 < ancho; k3++) vacia.push(sueltas[r2 + ':' + k3] ? actual[r2][k3] : '');
    nueva.push(vacia);
  }
  Object.keys(ultimo).forEach(function (folio) {
    var destino = Object.prototype.hasOwnProperty.call(filaDe, folio) ? filaDe[folio] : -1;
    Object.keys(ultimo[folio]).forEach(function (kk) {
      var k4 = Number(kk), x = ultimo[folio][kk];
      if (destino === -1) {
        p.huerfanos.push([folio, nombres[k4], x.valor, x.r + 2]);
        return;
      }
      if (sueltas[destino + ':' + k4]) {
        p.desplazados.push([destino + 2, nombres[k4], actual[destino][k4]]);
        delete sueltas[destino + ':' + k4];
      }
      nueva[destino][k4] = x.valor;
      if (x.r !== destino) p.movidas++;
    });
  });
  Object.keys(sueltas).forEach(function (key) {
    var rk = key.split(':').map(Number);
    p.sinDueno.push([rk[0] + 2, ab[rk[0]][0], ab[rk[0]][1], nombres[rk[1]], actual[rk[0]][rk[1]]]);
  });
  for (var r3 = 0; r3 < n; r3++) {
    for (var k5 = 0; k5 < ancho; k5++) {
      if (!mismoValor(actual[r3][k5], nueva[r3][k5])) {
        p.cambios.push([r3 + 2, ab[r3][0], ab[r3][1], nombres[k5], actual[r3][k5], nueva[r3][k5]]);
      }
    }
  }
  p.nueva = nueva;

  /* 4. Las ventas que cambiaron de nombre desde el último respaldo de mejorarTodo: la huella
        de una subida que escribió una venta encima de otra. También salen las que PAGOS
        corrigió a mano; por eso se enseñan y no se tocan. */
  var resp = ss.getSheetByName('Ventas (respaldo)');
  if (resp && resp.getLastRow() > 1) {
    var antes = {};
    resp.getRange(2, 1, Math.min(resp.getLastRow(), FIN) - 1, 2).getValues().forEach(function (x) {
      var f = String(x[0]).trim();
      if (f) antes[f] = String(x[1]).trim();
    });
    ab.forEach(function (x) {
      var f = String(x[0]).trim(), hoyEs = String(x[1]).trim();
      if (f && Object.prototype.hasOwnProperty.call(antes, f) && antes[f] && hoyEs && antes[f] !== hoyEs) {
        p.renombradas.push([f, antes[f], hoyEs]);
      }
    });
  }
  return p;
}

/** La pestaña «Revisión Y-AD»: qué cambió, qué no se pudo atribuir y qué hay que buscar. */
function escribirRevision(p, aplicada) {
  var ss = SpreadsheetApp.getActive();
  var vieja = ss.getSheetByName(HOJA_REVISION);
  if (vieja) ss.deleteSheet(vieja);
  var h = ss.insertSheet(HOJA_REVISION);
  var filas = [];
  var pon = function (arr) { var f = arr.slice(0, 7); while (f.length < 7) f.push(''); filas.push(f); };
  pon([aplicada
    ? 'Se realinearon las columnas Y a AD con su venta. El estado de antes está en «' + HOJA_ANTES_DE_REALINEAR + '».'
    : 'Vista previa: esto es lo que haría realinearColumnasDelPuente(). Todavía no se escribió nada.']);
  pon(['Fuente: la bitácora del puente. Si en Ventas se borraron o insertaron filas a mano después de una subida, revisa estas líneas antes de darlas por buenas.']);
  pon([]);
  pon(['CELDAS QUE CAMBIAN (' + p.cambios.length + ')']);
  pon(['Fila', 'Folio', 'Proyecto', 'Columna', 'Antes', 'Queda']);
  p.cambios.forEach(pon);
  pon([]);
  pon(['DE VENTAS QUE YA NO ESTÁN EN LA HOJA (' + p.huerfanos.length + ') — no se pusieron en ninguna fila']);
  pon(['Folio', 'Columna', 'Valor', 'Estaba en la fila']);
  p.huerfanos.forEach(pon);
  pon([]);
  pon(['SIN DUEÑO EN LA BITÁCORA (' + p.sinDueno.length + ') — se quedaron donde estaban']);
  pon(['Fila', 'Folio', 'Proyecto', 'Columna', 'Valor']);
  p.sinDueno.forEach(pon);
  pon([]);
  pon(['VALORES SIN DUEÑO QUE SE TAPARON (' + p.desplazados.length + ') — su lugar lo ocupó el de la venta de esa fila']);
  pon(['Fila', 'Columna', 'Valor']);
  p.desplazados.forEach(pon);
  pon([]);
  pon(['VENTAS QUE CAMBIARON DE NOMBRE DESDE EL ÚLTIMO RESPALDO (' + p.renombradas.length + ') — si no las renombró nadie, una subida escribió otra venta encima: búscala en Archivo › Historial de versiones']);
  pon(['Folio', 'En el respaldo', 'Hoy']);
  p.renombradas.forEach(pon);
  /* Una pestaña nueva trae mil renglones; una hoja con mucho escrito a mano en Y:AD puede
     pedir más, y sin esto la realineación se caería en cada subida por no caber su lista. */
  if (filas.length > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), filas.length - h.getMaxRows());
  /* En texto sin formato: es un reporte de lo que dice cada celda, y en una pestaña nueva
     Sheets volvería hora el «10:00» de la columna AA (ver horaDeCelda). */
  h.getRange(1, 1, filas.length, 7).setNumberFormat('@').setValues(filas);
  h.getRange(1, 1, 1, 7).setFontWeight('bold');
  return h;
}

/** Realinea si todavía no se hizo. La llaman rutaEmpujar_ (con el candado puesto) y
 *  realinearColumnasDelPuente. Devuelve la propuesta, o null si ya estaba hecho. */
function huellaDePropuesta(p) {
  var s = JSON.stringify([p.cambios, p.huerfanos, p.desplazados]);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s));
}
var PROP_VISTA = 'PUENTE_Y_AD_VISTA_PREVIA';

function realinearSiHaceFalta(h) {
  var est = estadoDeAlineacion();
  if (est === null) throw new Error('No se pudo leer si Y:AD ya se realinearon (PropertiesService). No se tocó nada: vuelve a intentarlo.');
  if (est) return null;
  var p = propuestaDeRealineacion(h);
  /* Solo lo que se VIO: la vista previa guarda la huella de lo que enseñó. Si la hoja cambió
     desde entonces —otra subida, una fila borrada—, la propuesta es otra y no se aplica a
     ciegas: hay que volver a revisarla. */
  var vista = PropertiesService.getScriptProperties().getProperty(PROP_VISTA);
  if ((p.cambios.length || p.huerfanos.length) && vista !== huellaDePropuesta(p)) {
    escribirRevision(p, false);
    throw new Error('La propuesta cambió desde la última vista previa (o no se ha hecho). Se volvió a escribir «' +
      HOJA_REVISION + '»: revísala y corre realinearColumnasDelPuente otra vez.');
  }
  if (p.cambios.length || p.huerfanos.length) {
    var ss = SpreadsheetApp.getActive();
    /* El respaldo se hace una sola vez: si un intento anterior se cayó a la mitad, el que
       vale es el de ANTES de ese intento. */
    if (!ss.getSheetByName(HOJA_ANTES_DE_REALINEAR)) {
      h.copyTo(ss).setName(HOJA_ANTES_DE_REALINEAR).hideSheet();
    }
    escribirRevision(p, true);
    horasATexto(h, p.nueva, p.ini);
    h.getRange(2, p.ini, FIN - 1, p.ancho).setValues(filasProtegidas(p.nueva));
    SpreadsheetApp.flush();
  } else {
    escribirRevision(p, true);   // también sin cambios: la pestaña dice que ya se hizo
  }
  PropertiesService.getScriptProperties().setProperty(PROP_ALINEADAS, new Date().toISOString());
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_VISTA); } catch (e) {}
  return p;
}

/** Vista previa, sin escribir en Ventas. Se puede correr las veces que sea. */
function revisarColumnasDelPuente() {
  var h = hojaVentas();
  if (columnasDelPuenteAlineadas()) {
    return 'Las columnas Y a AD ya se realinearon el ' +
      PropertiesService.getScriptProperties().getProperty(PROP_ALINEADAS) + '. No hay nada que revisar.';
  }
  var p = propuestaDeRealineacion(h);
  escribirRevision(p, false);
  PropertiesService.getScriptProperties().setProperty(PROP_VISTA, huellaDePropuesta(p));
  return avisar('Vista previa en «' + HOJA_REVISION + '»: ' + p.cambios.length + ' celdas cambiarían, ' +
    p.huerfanos.length + ' son de ventas que ya no están. Revísala; si está bien, corre realinearColumnasDelPuente.');
}

/* El editor de Apps Script no enseña lo que devuelve una función: se dice también en el
   registro de ejecución y como aviso en la hoja. */
function avisar(msg) {
  try { console.log(msg); } catch (e) {}
  try { SpreadsheetApp.getActive().toast(msg, 'Puente AL3D', 15); } catch (e) {}
  return msg;
}

/**
 * A mano, desde el editor, DESPUÉS de implementar la versión nueva y de revisar la vista
 * previa (revisarColumnasDelPuente). Aplica exactamente lo que la vista previa enseñó; si
 * la hoja cambió desde entonces, no aplica nada y vuelve a escribir la vista previa. Antes de
 * implementar no: la implementación vieja seguiría reacomodando sin mover Y:AD y volvería a
 * revolver lo recién realineado.
 */
function realinearColumnasDelPuente() {
  var h = hojaVentas();
  return avisar(conCandado(function () {
    var p = realinearSiHaceFalta(h);
    if (!p) {
      return 'Ya estaba hecho el ' + PropertiesService.getScriptProperties().getProperty(PROP_ALINEADAS) +
        '. No se tocó nada.';
    }
    ordenarVentas(h);
    return p.cambios.length
      ? 'Listo: ' + p.cambios.length + ' celdas de Y a AD volvieron con su venta. Revisa «' + HOJA_REVISION + '».'
      : 'No había nada revuelto. Desde ahora Y a AD viajan con su fila.';
  }));
}

/* ------------------------------------------- preparar la hoja para el puente */
/**
 * Agrega las cinco columnas que la plataforma necesita y que la hoja no tenía,
 * y alinea el vocabulario de «Tipo» con el de la plataforma.
 * Es idempotente.
 */
function prepararHojaParaElPuente() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName('Ventas');
  var nuevas = [
    ['Folio cotizacion', 130],
    ['Etapa de obra', 140],
    ['Hora instalacion', 110],
    ['Ubicacion', 150],
    ['Direccion', 220],
    ['Porcentaje comision', 90],
    ['Telefono', 140],
    ['Entrega', 120],
    ['Notas', 260],
    ['Plazo taller', 120],
    ['Sellos', 60]
  ];
  var cab = h.getRange(1, 1, 1, h.getMaxColumns()).getValues()[0]
      .map(function (x) { return String(x).trim(); });
  /* AG:AI (puente-sheets-14) nacen en columnas que antes no eran del puente. Si alguna ya trae
     OTRO encabezado, alguien la está usando para otra cosa: no se le escribe encima —se avisa y
     las tres se quedan fuera; lo demás sí se prepara—. */
  var ocupadas = ['Notas', 'Plazo taller', 'Sellos'].filter(function (n) {
    var c = cab[COL[n] - 1];
    return c !== undefined && c !== '' && c !== n;
  });
  if (ocupadas.length) {
    nuevas = nuevas.filter(function (n) { return ['Notas', 'Plazo taller', 'Sellos'].indexOf(n[0]) === -1; });
    avisar('Las columnas AG, AH y AI de Ventas ya tienen otro encabezado (' +
      ocupadas.map(function (n) { return '«' + cab[COL[n] - 1] + '»'; }).join(', ') +
      '), así que no se crearon las notas, el plazo de taller ni los sellos. Muévelas a otra parte y vuelve a correr esto.');
  }

  /* Las posiciones salen de COL y no de un 25 contado a mano: si un día se mueve una
     columna en COL, ésta se mueve con ella en vez de quedarse escribiendo al lado. */
  var primera = COL[nuevas[0][0]];
  nuevas.forEach(function (n) {
    var col = COL[n[0]];
    if (h.getMaxColumns() < col) h.insertColumnsAfter(h.getMaxColumns(), col - h.getMaxColumns());
    if (cab[col - 1] !== n[0]) h.getRange(1, col).setValue(n[0]);
    h.setColumnWidth(col, n[1]);
  });
  h.getRange(1, primera, 1, nuevas.length).setBackground(AZUL).setFontColor('#ffffff')
      .setFontWeight('bold').setFontSize(10).setWrap(true)
      .setVerticalAlignment('middle').setHorizontalAlignment('center');

  h.getRange(2, COL['Porcentaje comision'], FIN - 1, 1).setNumberFormat('0.##').setHorizontalAlignment('center');
  /* AE en texto sin formato ANTES de que llegue el primer teléfono: en una celda normal Sheets
     vuelve número «3312345678» (y lo enseña 3.31E+09) y lee «+52 1 33…» como una cuenta. */
  h.getRange(2, COL['Telefono'], FIN - 1, 1).setNumberFormat('@').setHorizontalAlignment('left');
  /* AF, la entrega (puente-sheets-12): desplegable cerrado con las tres opciones, como la etapa.
     No se llena: vacía es Instalación, que es lo que eran todas hasta hoy. */
  h.getRange(2, COL['Entrega'], FIN - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ENTREGAS, true)
      .setAllowInvalid(false).build()).setHorizontalAlignment('center');

  /* AG:AI (puente-sheets-14): las notas en texto, el plazo con su desplegable y los sellos en
     texto y ocultos —son de la plataforma, no de quien lee la hoja—. Ninguna se llena: vacías no
     le dicen nada a ningún teléfono. */
  if (tieneColumnasDeObra(h)) {
    h.getRange(2, COL['Notas'], FIN - 1, 1).setNumberFormat('@').setHorizontalAlignment('left');
    h.getRange(2, COL['Plazo taller'], FIN - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(PLAZOS_TALLER, true)
        .setAllowInvalid(false).build()).setHorizontalAlignment('center');
    h.getRange(2, COL['Sellos'], FIN - 1, 1).setNumberFormat('@');
    try { h.hideColumns(COL['Sellos']); } catch (eOculta) { /* se ve, pero funciona igual */ }
  }

  // Etapa de obra: lista cerrada, igual que en la plataforma
  h.getRange(2, 26, FIN - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ETAPAS_OBRA, true)
      .setAllowInvalid(false).build());

  // Tipo de trabajo: el vocabulario de la plataforma manda, porque de ahí cuelga
  // el criterio de éxito del cotizador. Se permite valor libre porque puede venir
  // combinado ("Letras 3D con iluminacion, Rotulacion de vinil").
  h.getRange(1, 5).setValue('Tipo de trabajo');
  h.getRange(2, 5, FIN - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TIPOS_TRABAJO, true)
      .setAllowInvalid(true).build());
  alinearTiposDeTrabajo(h);

  var colHora = COL['Hora instalacion'];
  h.getRange(2, colHora, FIN - 1, 1).setHorizontalAlignment('center');
  crearHojaAccesos(ss);
  protegerColumnasCalculadas(h);
  /* Las tres del almacén (puente-sheets-9). Se crearían solas en la primera subida; aquí, para
     que se vean antes y con sus cabeceras. En su propio try: si fallan, Ventas y «Accesos» ya
     quedaron listas, y la primera subida del almacén las vuelve a intentar. */
  try { prepararPestanasDelAlmacen(); }
  catch (eAlm) { avisar('Las pestañas del almacén no se crearon (' + (eAlm && eAlm.message) + '). Se crean solas con la primera subida.'); }

  /* AA en texto sin formato, para que la hora se quede como la mandó el teléfono (ver
     horaDeCelda). Lo que ya era hora se reescribe «HH:MM» en el mismo paso: el formato de
     texto encima de una hora no la convierte, la enseña como 0.4166…. Con el candado porque
     reescribe la columna entera, y una subida que cayera en medio perdería su hora.
     Va al final y sin el error de conCandado: con el candado ocupado, esto se deja para la
     siguiente corrida con un aviso, en vez de tumbar «Accesos» y las protecciones —que no
     tienen que ver con la hora— ni el final de mejorarTodo. Esperar no rompe nada: la lectura
     ya aguanta el Date, cada hora que escribe el puente pone su '@' y el reacomodo pasa a
     texto la columna cada vez que mueve filas. */
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(30000)) {
    avisar('La columna AA (hora de instalación) no se pasó a texto: la hoja estaba ocupada con ' +
      'otra escritura. Lo demás quedó listo; vuelve a correr prepararHojaParaElPuente en un momento.');
  } else {
    try {
      var aa = h.getRange(2, colHora, FIN - 1, 1);
      var horas = aa.getValues();
      if (horasATexto(h, horas, colHora)) aa.setValues(filasProtegidas(horas));
    } finally { candado.releaseLock(); }
  }
  SpreadsheetApp.flush();
}

/**
 * Las columnas que son fórmula quedan protegidas con aviso. No es contra un
 * atacante —el puente ya no puede escribirlas— es contra el resbalón de un
 * martes: pegar algo encima de la fila 2 tumba la fórmula de las 309 de abajo.
 */
function protegerColumnasCalculadas(h) {
  var marca = 'Columnas calculadas — no escribir a mano';
  h.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
    if (p.getDescription() === marca) p.remove();
  });
  CALC.forEach(function (c) {
    var p = h.getRange(c + '2:' + c + FIN).protect().setDescription(marca);
    p.setWarningOnly(true);
  });
}

/**
 * Traduce lo que yo había clasificado al vocabulario de la plataforma.
 * Los dos que cambian de sentido según lleven luz o no se dejan EN BLANCO
 * a propósito: adivinar la iluminación sería inventar el dato que más pesa.
 */
function alinearTiposDeTrabajo(h) {
  var mapa = {
    'Vinil / rotulación': 'Rotulacion de vinil',
    'Acrílico': 'Recorte acrilico',
    'Neón flex': 'Custome / Proyecto Especial',
    'Alucobond / panel': 'Custome / Proyecto Especial',
    'Señalética': 'Custome / Proyecto Especial',
    'Otro': 'Custome / Proyecto Especial',
    'Letras 3D': '',
    'Caja de luz': ''
  };
  var n = FIN - 1;
  var col = h.getRange(2, 5, n, 1).getValues();
  var cambios = 0;
  for (var i = 0; i < n; i++) {
    var v = String(col[i][0] || '').trim();
    if (v && Object.prototype.hasOwnProperty.call(mapa, v)) { col[i][0] = mapa[v]; cambios++; }
  }
  if (cambios) h.getRange(2, 5, n, 1).setValues(col);
}


/* ================== 6. REPARTIR UN ABONO ENTRE COMISIONES (FIFO) ==================
   Elías recibe un monto suelto (ej. $10,000) que cubre varias comisiones.
   Este bloque lo reparte de la comisión más antigua a la más nueva y deja
   UN RENGLÓN POR PROYECTO en la pestaña de abonos, con su importe, su fecha
   y un folio de pago (columna "Pago") que amarra los renglones del mismo depósito.
   Así, un reporte por fechas siempre sabe cuánto se abonó a cada proyecto y cuándo. */

var COL_PAGO = 6;   /* columna F de "Abonos comisión" */

function prepararColumnaPago(h) {
  h = h || SpreadsheetApp.getActive().getSheetByName(ABONOS);
  if (!h) throw new Error('No encuentro la pestaña "' + ABONOS + '".');
  if (h.getMaxColumns() < COL_PAGO) h.insertColumnsAfter(h.getMaxColumns(), COL_PAGO - h.getMaxColumns());
  if (h.getRange(1, COL_PAGO).getValue() !== 'Pago') {
    h.getRange(1, COL_PAGO).setValue('Pago');
    encabezado(h, h.getRange(1, COL_PAGO).getA1Notation());
    h.setColumnWidth(COL_PAGO, 90);
    h.getRange(2, COL_PAGO, 1999, 1).setFontColor('#6b7684').setHorizontalAlignment('center');
  }
  return h;
}

/* Comisiones pendientes, de la más antigua a la más nueva (el folio es cronológico). */
function pendientesFIFO() {
  var d = hojaVentas().getRange(2, 1, FIN - 1, 24).getValues();
  var out = [];
  d.forEach(function (r) {
    var pend = Math.round((Number(r[19]) || 0) * 100) / 100;
    if (r[0] && r[1] && pend > 0.004) out.push({ folio: r[0], nombre: r[1], pend: pend });
  });
  out.sort(function (a, b) { return numeroDeFolio(a.folio) - numeroDeFolio(b.folio); });
  return out;
}

/* Calcula el reparto sin escribir nada. */
function calcularReparto(monto) {
  var resta = Math.round(Number(monto) * 100) / 100;
  var lista = pendientesFIFO();
  var reparto = [];
  for (var i = 0; i < lista.length && resta > 0.004; i++) {
    var toca = Math.round(Math.min(resta, lista[i].pend) * 100) / 100;
    reparto.push({
      folio: lista[i].folio,
      nombre: lista[i].nombre,
      pend: lista[i].pend,
      abono: toca,
      queda: Math.round((lista[i].pend - toca) * 100) / 100
    });
    resta = Math.round((resta - toca) * 100) / 100;
  }
  var total = lista.reduce(function (s, p) { return s + p.pend; }, 0);
  return { reparto: reparto, sobrante: resta, totalPendiente: total, cuantas: lista.length };
}

/* Lo llama el formulario para pintar la vista previa. */
function vistaPreviaReparto(monto) {
  var r = calcularReparto(monto);
  return {
    filas: r.reparto.map(function (x) {
      return [x.folio, x.nombre, pesos(x.pend), pesos(x.abono), pesos(x.queda)];
    }),
    sobrante: r.sobrante,
    sobranteTxt: pesos(r.sobrante)
  };
}

function siguienteIdPago(h) {
  var col = h.getRange(2, COL_PAGO, 1999, 1).getValues();
  var max = 0;
  col.forEach(function (c) {
    var m = String(c[0] || '').match(/^P-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'P-' + ('000' + (max + 1)).slice(-3);
}

/* El primer renglón de «Abonos comisión» desde el que hay n VACÍOS seguidos, o 0 si no caben
   antes del 2000. Vacío es sin nada en A ni de C a F —B es la fórmula del nombre y no cuenta—:
   un renglón al que solo le borraron el folio todavía tiene su importe y su pago, y escribir
   encima los mezclaría con el abono nuevo. Lo usan los tres que escriben abonos: el formulario,
   el puente y el reparto. */
function filaLibreEnAbonos(h, n) {
  var ancho = Math.min(COL_PAGO, h.getMaxColumns());
  var datos = h.getRange(2, 1, 1999, ancho).getValues();
  var seguidos = 0;
  for (var i = 0; i < datos.length; i++) {
    var vacio = true;
    for (var c = 0; c < ancho && vacio; c++) {
      if (c !== 1 && datos[i][c] !== '' && datos[i][c] !== null) vacio = false;
    }
    seguidos = vacio ? seguidos + 1 : 0;
    if (seguidos >= n) return i + 3 - n;
  }
  return 0;
}

function guardarReparto(d) {
  /* Con candado, como guardarAbono: el reparto escribe varios renglones seguidos desde el
     primero libre, y un abono del puente en medio caería en uno de ellos. */
  return conCandado(function () { return guardarRepartoConCandado_(d); });
}

function guardarRepartoConCandado_(d) {
  var monto = Number(d.monto);
  if (!(monto > 0)) throw new Error('Escribe un importe mayor a cero.');

  var calc = calcularReparto(monto);
  if (!calc.reparto.length) throw new Error('No hay comisiones pendientes que abonar.');

  var h = prepararColumnaPago();

  /* n renglones LIBRES SEGUIDOS, no «el primer folio vacío y los que sigan». Si alguien vació a
     mano un renglón en medio, el reparto empezaba ahí y escribía encima de los abonos de
     abajo: la comisión pendiente de esos proyectos volvía a subir y se podía pagar dos veces. */
  var fila = filaLibreEnAbonos(h, calc.reparto.length);
  if (!fila) throw new Error('No caben los ' + calc.reparto.length + ' renglones del reparto en la pestaña de abonos (llega hasta el renglón 2000).');

  var id = siguienteIdPago(h);
  var fecha = d.fecha ? fechaDe(d.fecha) : new Date();
  var nota = (d.nota ? String(d.nota).trim() + ' · ' : '') + 'Reparto ' + id + ' de ' + pesos(monto);
  var n = calc.reparto.length;

  h.getRange(fila, 1, n, 1).setValues(calc.reparto.map(function (x) { return [x.folio]; }));
  h.getRange(fila, 3, n, 3).setValues(calc.reparto.map(function (x) { return [x.abono, fecha, nota]; }));
  h.getRange(fila, COL_PAGO, n, 1).setValues(calc.reparto.map(function () { return [id]; }));
  h.getRange(fila, 3, n, 1).setNumberFormat(MONEDA);
  h.getRange(fila, 4, n, 1).setNumberFormat(FECHA);
  SpreadsheetApp.flush();

  var msg = id + ': ' + pesos(monto - calc.sobrante) + ' repartido entre ' + n + ' proyecto(s).';
  if (calc.sobrante > 0.004) msg += ' Sobraron ' + pesos(calc.sobrante) + ' sin aplicar.';
  return msg;
}

function dialogoReparto() {
  var calc = calcularReparto(0);
  if (!calc.cuantas) { SpreadsheetApp.getUi().alert('No hay comisiones pendientes.'); return; }

  var c =
    '<style>' +
    'table.tb{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}' +
    'table.tb th{text-align:left;background:#eef1f6;color:#41506b;padding:6px 8px;font-weight:500}' +
    'table.tb td{padding:6px 8px;border-top:1px solid #e4e9f0}' +
    'table.tb th:nth-child(3),table.tb th:nth-child(4),table.tb th:nth-child(5),' +
    'table.tb td:nth-child(3),table.tb td:nth-child(4),table.tb td:nth-child(5){text-align:right}' +
    'table.tb td:nth-child(4){color:#1e6b2a;font-weight:500}' +
    '.caja{max-height:230px;overflow:auto;border:1px solid #e4e9f0;border-radius:6px;margin-top:10px}' +
    '</style>' +
    '<h2>Repartir un abono entre comisiones</h2>' +
    '<p class=sub>Se descuenta de la comisión más antigua a la más nueva. ' +
    'Cada proyecto queda con su propio renglón, su importe y su fecha en la pestaña de abonos.</p>' +
    '<div class=dato>Tienes <b>' + calc.cuantas + '</b> comisiones pendientes por <b>' +
    pesos(calc.totalPendiente) + '</b>.</div>' +
    '<div class=fila><div><label>Importe recibido</label>' +
    '<input id=monto type=number step=0.01 placeholder=10000></div>' +
    '<div><label>Fecha del abono</label><input id=fecha type=date value=' + hoy() + '></div></div>' +
    '<label>Nota (opcional)</label><input id=nota placeholder="Transferencia, efectivo...">' +
    '<div id=prev></div>' +
    '<div class=pie><button id=ok onclick="mandar()">Repartir</button>' +
    '<button id=no class=gris onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div id=av class=aviso></div>' +
    '<script>' +
    'var t;var enviado=false;' +
    /* La vista previa se arma con innerHTML en el navegador, con el folio y el NOMBRE del
       proyecto que manda vistaPreviaReparto: se escapan aquí, del lado que pinta (ver
       escaparHtml). */
    'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")' +
    '.replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;");}' +
    'function pinta(r){' +
    'var p=document.getElementById("prev");' +
    'if(!r.filas.length){p.innerHTML="";return;}' +
    'var h="<div class=caja><table class=tb><tr><th>Folio</th><th>Proyecto</th><th>Pendiente</th><th>Abono</th><th>Queda</th></tr>";' +
    'r.filas.forEach(function(f){h+="<tr><td>"+esc(f[0])+"</td><td>"+esc(f[1])+"</td><td>"+esc(f[2])+"</td><td>"+esc(f[3])+"</td><td>"+esc(f[4])+"</td></tr>";});' +
    'h+="</table></div>";' +
    'if(r.sobrante>0.004){h+="<div class=dato>Sobran "+esc(r.sobranteTxt)+": ya no hay más comisiones pendientes que cubrir.</div>";}' +
    'p.innerHTML=h;}' +
    'function calc(){clearTimeout(t);t=setTimeout(function(){' +
    'var m=parseFloat(document.getElementById("monto").value);' +
    'if(!(m>0)){document.getElementById("prev").innerHTML="";return;}' +
    'google.script.run.withSuccessHandler(pinta).vistaPreviaReparto(m);},300);}' +
    'document.getElementById("monto").addEventListener("input",calc);' +
    'document.getElementById("ok").addEventListener("click",mandar);' +
    'document.getElementById("no").addEventListener("click",function(){google.script.host.close();});' +
    'function mandar(){if(enviado)return;enviado=true;' +
    'var b=document.getElementById("ok");var a=document.getElementById("av");' +
    'b.disabled=true;b.textContent="Guardando...";' +
    'google.script.run.withSuccessHandler(function(m){' +
    'a.className="aviso ok";a.textContent=m;' +
    'setTimeout(function(){google.script.host.close();},2500);})' +
    '.withFailureHandler(function(e){' +
    'a.className="aviso mal";a.textContent=e.message;' +
    'b.disabled=false;b.textContent="Repartir";enviado=false;})' +
    '.guardarReparto({monto:document.getElementById("monto").value,' +
    'fecha:document.getElementById("fecha").value,' +
    'nota:document.getElementById("nota").value});}' +
    '</scr' + 'ipt>';

  SpreadsheetApp.getUi().showModalDialog(
      marco(c, 640).setWidth(580), 'Repartir abono de comisión');
}



/* ================== 7. COMISIONES COBRADAS POR PERIODO ==================
   Hoja "Comisiones por periodo": lee los renglones de la pestaña de abonos
   y arma resumen, corte por mes, corte por proyecto y el detalle completo,
   todo filtrado por el rango de fechas que se elige arriba.
   Como cada abono trae su propia fecha, un proyecto viejo que recibió dinero
   este mes SÍ aparece en el periodo, y uno que no recibió nada NO aparece.
   Es idempotente: se puede volver a correr cuando se quiera. */

var HOJA_PERIODO = 'Comisiones por periodo';
var PERIODOS = ['Últimos 2 meses', 'Mes actual', 'Mes anterior', 'Últimos 3 meses',
                'Últimos 6 meses', 'Año actual', 'Todo', 'Personalizado'];

function rangosAbonos() {
  var b = "'" + ABONOS + "'!";
  return {
    folio: b + '$A$2:$A$2000',
    proy:  b + '$B$2:$B$2000',
    imp:   b + '$C$2:$C$2000',
    fecha: b + '$D$2:$D$2000',
    nota:  b + '$E$2:$E$2000',
    pago:  b + '$F$2:$F$2000'
  };
}

function filtroPeriodo(r) {
  return 'ARRAYFORMULA(N(' + r.fecha + '>=$B$5)*N(' + r.fecha + '<=$B$6)*N(' + r.folio + '<>""))';
}

function construirComisionesPorPeriodo() {
  var ss = SpreadsheetApp.getActive();
  prepararColumnaPago();

  var h = hojaLimpia(ss, HOJA_PERIODO);
  var r = rangosAbonos();
  var f = filtroPeriodo(r);

  titulo(h, 'A1', 'COMISIONES COBRADAS — POR PERIODO',
         'Sale de la pestaña "' + ABONOS + '". Cambia el periodo en B4 y todo se recalcula solo.');

  /* ---------- controles ---------- */
  h.getRange('A4').setValue('Periodo');
  h.getRange('A5').setValue('Desde');
  h.getRange('A6').setValue('Hasta');
  h.getRange('A4:A6').setFontWeight('bold').setFontColor(SLATE);

  h.getRange('B4').setValue(PERIODOS[0]);
  h.getRange('B4').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(PERIODOS, true).setAllowInvalid(false).build());

  h.getRange('B5').setFormula(
    '=IFS($B$4="Mes actual",EOMONTH(TODAY(),-1)+1,' +
    '$B$4="Mes anterior",EOMONTH(TODAY(),-2)+1,' +
    '$B$4="Últimos 2 meses",EOMONTH(TODAY(),-2)+1,' +
    '$B$4="Últimos 3 meses",EOMONTH(TODAY(),-3)+1,' +
    '$B$4="Últimos 6 meses",EOMONTH(TODAY(),-6)+1,' +
    '$B$4="Año actual",DATE(YEAR(TODAY()),1,1),' +
    '$B$4="Todo",DATE(2000,1,1),' +
    '$B$4="Personalizado",$E$5)');
  h.getRange('B6').setFormula(
    '=IFS($B$4="Mes anterior",EOMONTH(TODAY(),-1),' +
    '$B$4="Todo",DATE(2099,12,31),' +
    '$B$4="Personalizado",$E$6,TRUE,TODAY())');
  h.getRange('B4:B6').setBackground(GRISF).setFontWeight('bold')
      .setHorizontalAlignment('center');
  h.getRange('B5:B6').setNumberFormat(FECHA);

  h.getRange('D4').setValue('Rango a mano (solo con Periodo = Personalizado)')
      .setFontStyle('italic').setFontColor('#6b7684').setFontSize(9);
  h.getRange('D5').setValue('Desde');
  h.getRange('D6').setValue('Hasta');
  h.getRange('D5:D6').setFontColor(SLATE);
  var hoy = new Date();
  h.getRange('E5').setValue(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  h.getRange('E6').setValue(hoy);
  h.getRange('E5:E6').setNumberFormat(FECHA).setBackground('#fffbe6')
      .setHorizontalAlignment('center');

  /* ---------- resumen ---------- */
  h.getRange('A8').setValue('RESUMEN DEL PERIODO');
  seccion(h, 'A8:E8');
  h.getRange('A9:E9').setValues([['Comisión cobrada', 'Abonos', 'Proyectos',
                                  'Depósitos', 'Promedio x abono']]);
  encabezado(h, 'A9:E9');
  h.getRange('A9:E9').setFontSize(9);

  h.getRange('A10').setFormula('=SUMIFS(' + r.imp + ',' + r.fecha + ',">="&$B$5,' +
      r.fecha + ',"<="&$B$6)');
  h.getRange('B10').setFormula('=COUNTIFS(' + r.fecha + ',">="&$B$5,' + r.fecha +
      ',"<="&$B$6,' + r.folio + ',"<>")');
  h.getRange('C10').setFormula('=IFERROR(ROWS(UNIQUE(FILTER(' + r.folio + ',' +
      r.fecha + '>=$B$5,' + r.fecha + '<=$B$6,' + r.folio + '<>""))),0)');
  h.getRange('D10').setFormula('=IFERROR(ROWS(UNIQUE(FILTER(' + r.pago + ',' +
      r.fecha + '>=$B$5,' + r.fecha + '<=$B$6,' + r.pago + '<>""))),0)');
  h.getRange('E10').setFormula('=IFERROR($A$10/$B$10,0)');
  h.getRange('A10:E10').setFontSize(14).setFontWeight('bold')
      .setHorizontalAlignment('center').setBackground(GRISF);
  h.getRange('A10').setNumberFormat(MONEDA);
  h.getRange('E10').setNumberFormat(MONEDA);
  h.getRange('B10:D10').setNumberFormat('0');
  h.setRowHeight(10, 34);

  /* ---------- por mes ---------- */
  h.getRange('A12').setValue('CUÁNTO COBRÉ CADA MES');
  seccion(h, 'A12:C12');
  h.getRange('A13').setFormula(
    '=IFERROR(QUERY({ARRAYFORMULA(IF(' + r.folio + '="","",TEXT(' + r.fecha +
    ',"yyyy-mm"))),' + r.imp + ',' + f + '},' +
    '"select Col1, count(Col2), sum(Col2) where Col3=1 group by Col1 ' +
    'order by Col1 desc limit 18 ' +
    'label Col1 \'Mes\', count(Col2) \'Abonos\', sum(Col2) \'Cobrado\'",0),' +
    '"Sin abonos en el periodo")');
  encabezado(h, 'A13:C13');
  h.getRange('A13:C13').setFontSize(9);
  h.getRange('A14:A32').setHorizontalAlignment('center');
  h.getRange('B14:B32').setNumberFormat('0');
  h.getRange('C14:C32').setNumberFormat(MONEDA);

  /* ---------- por proyecto ---------- */
  h.getRange('A34').setValue('COMISIÓN COBRADA POR PROYECTO');
  seccion(h, 'A34:D34');
  h.getRange('A35').setFormula(
    '=IFERROR(QUERY({' + r.folio + ',' + r.proy + ',' + r.imp + ',' + f + '},' +
    '"select Col1, Col2, count(Col3), sum(Col3) where Col4=1 group by Col1, Col2 ' +
    'order by sum(Col3) desc limit 150 ' +
    'label Col1 \'Folio\', Col2 \'Proyecto\', count(Col3) \'Abonos\', ' +
    'sum(Col3) \'Cobrado\'",0),"Sin abonos en el periodo")');
  encabezado(h, 'A35:D35');
  h.getRange('A35:D35').setFontSize(9);
  h.getRange('A36:A188').setHorizontalAlignment('center').setFontColor(SLATE);
  h.getRange('C36:C188').setNumberFormat('0');
  h.getRange('D36:D188').setNumberFormat(MONEDA);

  /* ---------- detalle ---------- */
  h.getRange('A190').setValue('DETALLE DE ABONOS DEL PERIODO');
  seccion(h, 'A190:F190');
  h.getRange('A191').setFormula(
    '=IFERROR(QUERY({' + r.fecha + ',' + r.folio + ',' + r.proy + ',' + r.imp +
    ',ARRAYFORMULA(TO_TEXT(' + r.pago + ')),ARRAYFORMULA(TO_TEXT(' + r.nota + ')),' +
    f + '},' +
    '"select Col1, Col3, Col2, Col4, Col5, Col6 where Col7=1 order by Col1 desc ' +
    'label Col1 \'Fecha\', Col3 \'Proyecto\', Col2 \'Folio\', Col4 \'Importe\', ' +
    'Col5 \'Pago\', Col6 \'Nota\'",0),"Sin abonos en el periodo")');
  encabezado(h, 'A191:F191');
  h.getRange('A191:F191').setFontSize(9);
  h.getRange('A192:A2200').setNumberFormat(FECHA).setHorizontalAlignment('center');
  h.getRange('C192:C2200').setHorizontalAlignment('center').setFontColor(SLATE);
  h.getRange('D192:D2200').setNumberFormat(MONEDA);
  h.getRange('E192:E2200').setHorizontalAlignment('center').setFontColor(SLATE);
  h.getRange('F192:F2200').setFontColor('#6b7684').setFontSize(9);

  fuente(h);
  anchos(h, [120, 250, 105, 120, 120, 320]);
  h.setFrozenRows(2);
  h.setHiddenGridlines(true);
  ss.setActiveSheet(h);
  ss.moveActiveSheet(ss.getNumSheets());
  SpreadsheetApp.flush();
  return h;
}

/* ============================================================================
   EL ALMACÉN, EL CATÁLOGO DE MATERIAL Y LAS LISTAS DE COMPRA — desde puente-sheets-9.

   Hasta la 8 el puente conocía una sola pestaña, Ventas, y el teléfono apartaba en su
   bandeja todo lo demás «hasta que exista su pestaña». Esto es esa pestaña, tres veces:

     · «Almacén»               el libro de movimientos. APPEND-ONLY: un renglón que ya está
                               no se vuelve a escribir, ni se corrige, ni se borra.
     · «Catálogo de material»  una fila por material (acr-3mm, lam-galv…).
     · «Listas de compra»      una fila por requerimiento: lo que un proyecto pide de un
                               material (<proyecto>:<material>), del que sale la lista de compra.

   Dos caminos nuevos, y nada de lo de la venta se toca:
     /empujar_almacen   hasta 25 operaciones en una petición, en orden, bajo el candado
     /jalar_almacen     lo que cambió desde la última vez que ese teléfono preguntó

   ── Por qué el libro no se descuenta dos veces ──────────────────────────────────────
   El id del movimiento lo pone el teléfono, y aquí se busca ANTES de escribir: un reintento
   después de una respuesta que se perdió (lo más normal del mundo con mala señal) contesta
   «ya estaba» y no agrega nada. Y las salidas que deriva la obra llevan un id que sale del
   requerimiento (`mov-salida:<requerimiento>`, js/datos/proyectos.js): si dos teléfonos
   cruzan el corte del mismo proyecto antes de enterarse uno del otro, emiten EL MISMO id, y
   la segunda copia llega aquí como «ya estaba». El libro no suma existencias guardadas: suma
   renglones, y un renglón repetido es material que aparece de la nada.

   ── Por qué el catálogo y las listas van campo por campo ────────────────────────────
   La operación trae qué campos cambió (`campos`) y solo ésos se escriben, como en Ventas desde
   septiembre de 2026: si fabricación corrige el mínimo de almacén y dirección el proveedor del
   mismo material, quedan las dos. Y cada campo guarda aquí su sello (columna «Sellos»): un
   cambio que llega tarde —el teléfono que estuvo sin señal— no pisa uno más nuevo del mismo
   campo. Una operación de una versión anterior, sin `campos`, cuenta como «todos», con la misma
   regla del sello.

   ── Lo que cada rol puede escribir y leer aquí ──────────────────────────────────────
   Dirección todo. Fabricación mueve el almacén, edita el catálogo y corrige las listas, pero no
   escribe costos y no los recibe (CAMPOS_DE_DINERO_ALMACEN). Pagos NO mueve el almacén: lo
   único suyo que entra es lo que la plataforma deriva sola cuando ese teléfono es el que está
   abierto el día del corte —la salida `derivado` y el requerimiento que pasa a `consumido`—,
   porque si no, ese día el almacén se quedaría sin descontar por una razón de organigrama
   (js/datos/stock.js, `permiso`). Es la misma regla que la plataforma, del lado que no se puede
   saltar.

   ── Cómo sabe un teléfono qué le falta ──────────────────────────────────────────────
   Cada fila escrita recibe un número de SECUENCIA, uno más que el último, bajo el candado: el
   teléfono pregunta «lo que tenga más de N» y guarda el más alto que vio. No es un sello de
   tiempo a propósito: el reloj de un teléfono miente, y el de la hoja también puede repetirse
   dentro de un mismo milisegundo; la secuencia no. Una corrección a mano en estas pestañas NO
   cambia la secuencia y por eso no viaja sola: las pestañas son el buzón de la plataforma, y
   lo dice su nota (cada teléfono las vuelve a leer enteras una vez por semana, ver puente.js).
   ============================================================================ */

var ALM_PROP_SECUENCIA = 'ALMACEN_SECUENCIA';
var ALM_OPS_MAX = 25;
/* Una respuesta de /jalar_almacen. Un teléfono nuevo pide desde cero, y un libro de años son
   miles de renglones: se manda por páginas, y el teléfono pide la siguiente. */
var ALM_POR_PAGINA = 1500;
var ALM_CELDA_MAX = 45000;      // una celda de Sheets aguanta 50 000 caracteres

/* El vocabulario del libro y del catálogo. Copias a propósito de js/datos/stock.js y de
   js/datos/material.js —este archivo no importa nada, se pega en un editor— y
   pruebas/puente-almacen.mjs compara las dos. */
var ALM_TIPOS = ['entrada', 'salida', 'ajuste', 'conteo', 'merma', 'devolucion'];
var ALM_ORIGENES = ['derivado', 'manual', 'conteo', 'compra'];
/* El signo lo pone el tipo. Una salida con cantidad positiva es un dedo que se olvidó del
   menos, y con ella el almacén CRECE cada vez que la obra consume: se rechaza. `ajuste` va
   para los dos lados y un `conteo` no es un delta, es lo que había en el estante (≥ 0). */
var ALM_SIGNO = { entrada: 1, devolucion: 1, salida: -1, merma: -1, ajuste: 0, conteo: 0 };
var ALM_UNIDADES_COMPRA = ['unidad', 'bolsa', 'caja', 'lamina', 'litro', 'metro'];
var ALM_UNIDADES_CONSUMO = ['m2', 'm', 'cm', 'pieza', 'litro'];
var ALM_ESTADOS_REQ = ['calculado', 'apartado', 'comprado', 'consumido', 'descartado'];

/* Lo que fabricación no escribe ni recibe de estas pestañas: los importes. Es la misma regla
   que la de Ventas (CAMPOS_DE_DINERO y VE_EL_DINERO), y la plataforma ya no los pinta para ese
   rol (§8.4): aquí es donde de verdad no salen. */
var CAMPOS_DE_DINERO_ALMACEN = ['costo_total', 'costo_compra'];

/* Lo que no se guarda: la marca local de «ya subí» de cada teléfono. */
var ALM_NO_VIAJA = ['sync'];

/* ── Las tres pestañas, columna por columna ──────────────────────────────────────────
   Cada columna lleva { campo, nombre, tipo, para }, como la lista de /esquema: el campo es el
   nombre en la plataforma, el nombre es la cabecera que lee una persona, el tipo decide cómo
   se guarda y cómo se lee, y `para` va como nota en la cabecera. Las columnas se buscan POR SU
   CABECERA, no por su posición: si alguien mueve una, no se escribe en la de al lado.
   Tipos: texto · número · sí/no · sello (milisegundos, como los guarda la plataforma) ·
   lista (JSON) · cuándo (la fecha legible de otro sello; se escribe, no se lee). Lo que llegue
   y no tenga columna se guarda en «Otros (JSON)»: un campo nuevo de la plataforma no se pierde
   en el viaje por no tener todavía su columna. */
var ALM_PESTANAS = {
  movimientos: {
    hoja: 'Almacén', anexo: true, fijos: ['id'],
    nota: 'El libro de movimientos del almacén. Lo escribe el puente y nunca se edita: una corrección ' +
          'es otro movimiento (un ajuste o un conteo). La existencia es el último conteo más lo que pasó después.',
    columnas: [
      { campo: '_cuando', nombre: 'Cuándo', tipo: 'cuándo', de: 'ts', para: 'la fecha del movimiento, para leerla; la que vale es «Sello»' },
      { campo: 'material_id', nombre: 'Material', tipo: 'texto', para: 'la clave del material en el catálogo (acr-3mm)' },
      { campo: 'tipo', nombre: 'Tipo', tipo: 'texto', para: ALM_TIPOS.join(', ') },
      { campo: 'cantidad', nombre: 'Cantidad', tipo: 'número', para: 'en unidad de compra y con signo: + entra, − sale' },
      { campo: 'unidad_compra', nombre: 'Unidad', tipo: 'texto', para: 'la de compra del material, copiada para poder auditar' },
      { campo: 'origen', nombre: 'Origen', tipo: 'texto', para: ALM_ORIGENES.join(', ') },
      { campo: 'nota', nombre: 'Nota', tipo: 'texto', para: 'lo que escribió quien lo movió' },
      { campo: 'usuario', nombre: 'Quién', tipo: 'texto', para: 'el nombre que el teléfono tenía puesto' },
      { campo: 'rol', nombre: 'Rol', tipo: 'texto', para: 'el rol con el que se capturó' },
      { campo: 'dispositivo', nombre: 'Dispositivo', tipo: 'texto', para: 'las cuatro letras del aparato' },
      { campo: 'proyecto_id', nombre: 'Proyecto (id)', tipo: 'texto', para: 'el proyecto al que se le cargó, si alguno' },
      { campo: 'folio_hoja', nombre: 'Venta', tipo: 'texto', para: 'el folio de esa venta en la pestaña Ventas (V-042)' },
      { campo: 'requerimiento_id', nombre: 'Requerimiento', tipo: 'texto', para: 'la línea de la lista de compra que lo produjo' },
      { campo: 'costo_total', nombre: 'Costo total', tipo: 'número', para: 'pesos, si se capturó; fabricación no lo recibe' },
      { campo: 'sello', nombre: 'Firma', tipo: 'texto', para: 'quién, con qué rol y en qué aparato, como se leyó al capturarlo' },
      { campo: 'empresa_id', nombre: 'Empresa', tipo: 'texto', para: '' },
      { campo: 'ts', nombre: 'Sello', tipo: 'sello', para: 'el instante del movimiento, en milisegundos, como lo guarda el teléfono' },
      { campo: 'id', nombre: 'Id', tipo: 'texto', para: 'lo pone el teléfono; es lo que evita que un reintento reste dos veces' }
    ]
  },
  materiales: {
    hoja: 'Catálogo de material', anexo: false, fijos: ['id'],
    nota: 'El catálogo de material de la plataforma. Lo escribe el puente campo por campo; se edita en la ' +
          'plataforma (Material → Catálogo), no aquí: un cambio a mano no viaja a los teléfonos.',
    columnas: [
      { campo: 'id', nombre: 'Clave', tipo: 'texto', para: 'la clave corta del material (acr-3mm); no cambia nunca' },
      { campo: 'nombre', nombre: 'Nombre', tipo: 'texto', para: 'como se le pide al proveedor' },
      { campo: 'familia', nombre: 'Familia', tipo: 'texto', para: 'acrilico, aluminio, led, fuente…' },
      { campo: 'unidad_compra', nombre: 'Unidad de compra', tipo: 'texto', para: ALM_UNIDADES_COMPRA.join(', ') },
      { campo: 'unidad_consumo', nombre: 'Unidad de consumo', tipo: 'texto', para: ALM_UNIDADES_CONSUMO.join(', ') },
      { campo: 'medida', nombre: 'Medida', tipo: 'texto', para: 'lo que dice el proveedor' },
      { campo: 'factor', nombre: 'Factor', tipo: 'número', para: 'unidades de consumo que rinde UNA de compra' },
      { campo: 'factor_origen', nombre: 'De dónde sale el factor', tipo: 'texto', para: 'obligatorio: sin esto nadie sabe si el número está bien' },
      { campo: 'largo_cm', nombre: 'Largo (cm)', tipo: 'número', para: 'de la hoja, si es lámina' },
      { campo: 'ancho_cm', nombre: 'Ancho (cm)', tipo: 'número', para: 'de la hoja, si es lámina' },
      { campo: 'espesor', nombre: 'Espesor', tipo: 'texto', para: '' },
      { campo: 'merma_pct', nombre: 'Merma', tipo: 'número', para: 'de 0 a 0.99' },
      { campo: 'fraccionable', nombre: 'Fraccionable', tipo: 'sí/no', para: 'si un retazo sirve (se compra por cuartos)' },
      { campo: 'min_compra', nombre: 'Mínimo de compra', tipo: 'número', para: 'en unidad de compra' },
      { campo: 'min_stock', nombre: 'Mínimo de almacén', tipo: 'número', para: '0 = no avisar' },
      { campo: 'costo_compra', nombre: 'Costo de compra', tipo: 'número', para: 'pesos por unidad de compra; fabricación no lo recibe ni lo escribe' },
      { campo: 'proveedor', nombre: 'Proveedor', tipo: 'texto', para: '' },
      { campo: 'tel_proveedor', nombre: 'Teléfono del proveedor', tipo: 'texto', para: '' },
      { campo: 'activo', nombre: 'Activo', tipo: 'sí/no', para: '' },
      { campo: 'empresa_id', nombre: 'Empresa', tipo: 'texto', para: '' },
      { campo: 'creado_en', nombre: 'Creado', tipo: 'sello', para: 'milisegundos' },
      { campo: 'actualizado_en', nombre: 'Editado', tipo: 'sello', para: 'milisegundos, del teléfono que lo editó' }
    ]
  },
  requerimientos: {
    hoja: 'Listas de compra', anexo: false, fijos: ['id', 'proyecto_id', 'material_id'],
    nota: 'Lo que cada proyecto pide de cada material: de aquí sale la lista de compra. Lo escribe el puente ' +
          'campo por campo; la cantidad que vale es «Corrección» cuando la hay. No se edita a mano.',
    columnas: [
      { campo: 'folio_hoja', nombre: 'Venta', tipo: 'texto', para: 'el folio de la venta en la pestaña Ventas (V-042)' },
      { campo: 'material_id', nombre: 'Material', tipo: 'texto', para: 'la clave del material' },
      { campo: 'cantidad_compra', nombre: 'Cantidad', tipo: 'número', para: 'en unidad de compra, SIN redondear: el redondeo es de la lista entera' },
      { campo: 'unidad_compra', nombre: 'Unidad', tipo: 'texto', para: '' },
      { campo: 'cantidad_ajustada', nombre: 'Corrección', tipo: 'número', para: 'la de una persona; si está, manda sobre la calculada' },
      { campo: 'estado', nombre: 'Estado', tipo: 'texto', para: ALM_ESTADOS_REQ.join(', ') + '; consumido ya salió del almacén' },
      { campo: 'confianza', nombre: 'Confianza', tipo: 'texto', para: 'exacta, estimada o requiere_dato' },
      { campo: 'requiere', nombre: 'Le falta', tipo: 'texto', para: 'qué dato hace falta, si lo hay' },
      { campo: 'formula', nombre: 'Cómo se calculó', tipo: 'texto', para: '' },
      { campo: 'cantidad_consumo', nombre: 'Consumo', tipo: 'número', para: 'en unidad de consumo, ya con merma' },
      { campo: 'unidad_consumo', nombre: 'Unidad de consumo', tipo: 'texto', para: '' },
      { campo: 'partidas', nombre: 'Partidas', tipo: 'lista', para: 'qué partidas de la cotización lo piden' },
      { campo: 'motivo_ajuste', nombre: 'Por qué se corrigió', tipo: 'texto', para: '' },
      { campo: 'ajustado_por', nombre: 'Corrigió', tipo: 'texto', para: '' },
      { campo: 'ajustado_en', nombre: 'Corregido', tipo: 'sello', para: 'milisegundos' },
      { campo: 'constantes_version', nombre: 'Constantes', tipo: 'texto', para: 'con qué números del taller se calculó' },
      { campo: 'proyecto_id', nombre: 'Proyecto (id)', tipo: 'texto', para: 'el id del proyecto en el teléfono que lo calculó' },
      { campo: 'empresa_id', nombre: 'Empresa', tipo: 'texto', para: '' },
      { campo: 'creado_en', nombre: 'Creado', tipo: 'sello', para: 'milisegundos' },
      { campo: 'actualizado_en', nombre: 'Editado', tipo: 'sello', para: 'milisegundos, del teléfono que lo editó' },
      { campo: 'id', nombre: 'Id', tipo: 'texto', para: '<proyecto>:<material>; no cambia nunca' }
    ]
  }
};
/* Las columnas que pone la hoja y no la plataforma. Van al final de cada pestaña. */
var ALM_COLUMNAS_DE_LA_HOJA = [
  { campo: '_otros', nombre: 'Otros (JSON)', tipo: 'lista', para: 'lo que llegó sin columna propia; se devuelve tal cual' },
  { campo: '_sellos', nombre: 'Sellos', tipo: 'lista', para: 'cuándo se escribió cada campo, para que un cambio atrasado no pise uno nuevo', soloFichas: true },
  { campo: '_secuencia', nombre: 'Secuencia', tipo: 'número', para: 'el orden en que la hoja lo recibió; es lo que cada teléfono pregunta' },
  { campo: '_llego', nombre: 'Llegó', tipo: 'cuándo', para: 'cuándo lo recibió la hoja' },
  { campo: '_subio', nombre: 'Subió', tipo: 'texto', para: 'con qué cuenta o con qué rol entró' }
];

/** Las columnas completas de una pestaña: las de la plataforma y las de la hoja. */
function almColumnas_(alm) {
  var t = ALM_PESTANAS[alm];
  return t.columnas.concat(ALM_COLUMNAS_DE_LA_HOJA.filter(function (c) { return !(c.soloFichas && t.anexo); }));
}

/* ── La pestaña, creada si falta ──────────────────────────────────────────────────────
   Se crea sola en la primera escritura, y también en prepararHojaParaElPuente. Si ya existe
   y le falta alguna cabecera (una columna que llegó con una versión posterior), se agrega al
   final sin mover las que hay. Devuelve la hoja y el mapa campo → número de columna. */
function almPestana_(alm, crear) {
  var t = ALM_PESTANAS[alm];
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(t.hoja);
  if (!h) {
    if (!crear) return null;
    h = ss.insertSheet(t.hoja);
    h.setFrozenRows(1);
    try {
      /* Con aviso y no con candado: no es contra un atacante —el puente es el único que escribe
         aquí—, es contra el resbalón de quien entra a ver y teclea encima. */
      h.protect().setDescription('La escribe el puente — no se edita a mano').setWarningOnly(true);
    } catch (e) { /* sin la protección la pestaña sirve igual */ }
  }
  var cols = almColumnas_(alm);
  var ancho = Math.max(1, h.getLastColumn());
  var cab = h.getRange(1, 1, 1, ancho).getValues()[0].map(function (x) { return String(x).trim(); });
  var mapa = {};
  var nuevas = [];
  cols.forEach(function (c) {
    var i = cab.indexOf(c.nombre);
    if (i !== -1) mapa[c.campo] = i + 1;
    else nuevas.push(c);
  });
  if (nuevas.length) {
    /* La primera columna libre. Una pestaña recién creada tiene la fila 1 vacía y su
       getLastColumn es 0: se empieza en la A. */
    var libre = cab.every(function (x) { return x === ''; }) ? 1 : ancho + 1;
    var falta = libre + nuevas.length - 1 - h.getMaxColumns();
    if (falta > 0) h.insertColumnsAfter(h.getMaxColumns(), falta);
    nuevas.forEach(function (c, k) {
      var col = libre + k;
      mapa[c.campo] = col;
      var celda = h.getRange(1, col);
      celda.setValue(c.nombre);
      if (c.para) { try { celda.setNote(c.para); } catch (e) {} }
      /* El texto se queda como texto: sin esto Sheets vuelve fecha un «1/2» y número un
         «0042», y la clave de un material deja de ser la misma al volver. Los sellos, como
         número entero, para que no salgan en notación científica. */
      var cuerpo = h.getRange(2, col, Math.max(1, h.getMaxRows() - 1), 1);
      if (c.tipo === 'texto' || c.tipo === 'lista') cuerpo.setNumberFormat('@');
      else if (c.tipo === 'sello' || c.campo === '_secuencia') cuerpo.setNumberFormat('0');
      else if (c.tipo === 'cuándo') cuerpo.setNumberFormat('dd/mm/yyyy HH:mm');
    });
    h.getRange(1, 1, 1, libre + nuevas.length - 1).setFontWeight('bold').setBackground(AZUL).setFontColor('#ffffff');
    try { h.getRange(1, 1).setNote(t.nota + '\n\n' + (cols[0].para || '')); } catch (e) {}
  }
  var n = 0;
  for (var k in mapa) if (mapa[k] > n) n = mapa[k];
  return { h: h, mapa: mapa, ncol: n, alm: alm };
}

/** Las tres pestañas, para prepararHojaParaElPuente y para quien quiera crearlas a mano.
 *  Idempotente: si ya están, solo les agrega la cabecera que les falte. */
function prepararPestanasDelAlmacen() {
  for (var alm in ALM_PESTANAS) almPestana_(alm, true);
}

/* ── De la plataforma a la celda, y de vuelta ──────────────────────────────────────── */
function almACelda_(c, v) {
  if (v === undefined || v === null || v === '') return '';
  if (c.tipo === 'número' || c.tipo === 'sello') { var n = Number(v); return isFinite(n) ? n : ''; }
  if (c.tipo === 'sí/no') return v === true || v === 'true' || v === 'Sí';
  if (c.tipo === 'cuándo') { var ms = Number(v); return isFinite(ms) && ms > 0 ? new Date(ms) : ''; }
  if (c.tipo === 'lista') return JSON.stringify(v);
  /* Texto. Una celda que empieza con «=» es una FÓRMULA, y una nota que alguien escribió en
     el teléfono como «=IMPORTXML(…)» saldría a internet sola: se le antepone el apóstrofo,
     igual que en armarCeldas. */
  var s = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function almDeCelda_(c, x) {
  if (x === '' || x === null || x === undefined) {
    if (c.tipo === 'sí/no') return false;
    return (c.tipo === 'texto') ? '' : null;
  }
  if (c.tipo === 'número' || c.tipo === 'sello') {
    if (Object.prototype.toString.call(x) === '[object Date]') return x.getTime();
    var n = Number(x);
    return isFinite(n) ? n : null;
  }
  if (c.tipo === 'sí/no') return x === true || String(x).trim().toLowerCase() === 'true' || String(x).trim() === 'Sí';
  if (c.tipo === 'lista') { try { return JSON.parse(String(x)); } catch (e) { return null; } }
  var s = String(x);
  /* El apóstrofo que se puso al escribir, si Sheets lo dejó en el valor. */
  return (s.charAt(0) === "'" && /^'[=+\-@]/.test(s)) ? s.slice(1) : s;
}

/** Las filas de una pestaña, con su número de fila. Sin id no es una fila: es un renglón vacío. */
function almFilas_(P) {
  var n = P.h.getLastRow() - 1;
  if (n < 1) return [];
  var valores = P.h.getRange(2, 1, n, P.ncol).getValues();
  var colId = P.mapa.id;
  var out = [];
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][colId - 1] || '').trim() === '') continue;
    out.push({ fila: i + 2, valores: valores[i] });
  }
  return out;
}

/** Una fila de la hoja como registro de la plataforma, sin lo que el rol no ve. */
function almRegistro_(P, valores, rol) {
  var cols = almColumnas_(P.alm);
  var otros = null, reg = {};
  cols.forEach(function (c) {
    var col = P.mapa[c.campo];
    if (!col) return;
    var x = valores[col - 1];
    if (c.campo === '_otros') { otros = almDeCelda_(c, x); return; }
    if (c.campo.charAt(0) === '_' || c.tipo === 'cuándo') return;
    reg[c.campo] = almDeCelda_(c, x);
  });
  /* Primero lo de «Otros» y encima las columnas: si una columna se agregó después, manda ella. */
  var salida = {};
  if (otros && typeof otros === 'object') for (var k in otros) salida[k] = otros[k];
  for (var k2 in reg) salida[k2] = reg[k2];
  /* Una celda vacía de un campo que NUNCA se escribió no se inventa: se devuelve como no venida,
     para que el teléfono conserve lo que tiene (sync.fusionar no pisa con undefined). Pero la de
     un campo que sí se escribió vacío —el costo que alguien borró— es un dato, y baja como null:
     si se quitara también, borrar un costo no llegaría nunca a los otros teléfonos. Lo que dice
     cuál es cuál es «Sellos». El libro no tiene sellos: sus renglones se escriben enteros. */
  var sellos = null;
  if (P.mapa._sellos) {
    var cs = null;
    cols.forEach(function (c) { if (c.campo === '_sellos') cs = c; });
    sellos = almDeCelda_(cs, valores[P.mapa._sellos - 1]) || {};
  }
  for (var k3 in salida) {
    if (salida[k3] === null && sellos && !Object.prototype.hasOwnProperty.call(sellos, k3)) delete salida[k3];
  }
  if (!VE_EL_DINERO[rol]) CAMPOS_DE_DINERO_ALMACEN.forEach(function (c) { delete salida[c]; });
  return salida;
}

/* ── La secuencia ─────────────────────────────────────────────────────────────────────
   Vive en las propiedades del script y se sube bajo el candado. Si la propiedad se perdió (un
   proyecto de Apps Script copiado, alguien que las limpió), se toma la más alta que haya en las
   pestañas: empezar de cero haría que ningún teléfono volviera a ver nada nuevo. */
function almLeerSecuencia_() {
  var p = Number(PropertiesService.getScriptProperties().getProperty(ALM_PROP_SECUENCIA) || 0);
  if (isFinite(p) && p > 0) return p;
  var max = 0;
  for (var alm in ALM_PESTANAS) {
    var P = almPestana_(alm, false);
    if (!P || !P.mapa._secuencia) continue;
    almFilas_(P).forEach(function (f) {
      var s = Number(f.valores[P.mapa._secuencia - 1]) || 0;
      if (s > max) max = s;
    });
  }
  return max;
}

/* ── Quién puede escribir qué ──────────────────────────────────────────────────────────
   null si puede; si no, el porqué en palabras. Va antes de mirar la hoja. */
function almPermiso_(rol, alm, op) {
  var d = op.datos || {};
  if (!PUENTE_ROLES[rol]) return 'ese rol no existe';
  if (rol === 'direccion' || rol === 'fabricacion') return null;
  /* Pagos. Ver la cabecera de esta sección: solo lo que la plataforma deriva sola. */
  if (alm === 'movimientos') {
    return (d.origen === 'derivado' && d.tipo === 'salida') ? null
      : 'el almacén lo mueven fabricación y dirección; desde pagos solo entra la salida que deriva la obra sola';
  }
  if (alm === 'requerimientos') {
    var campos = Object.prototype.toString.call(op.campos) === '[object Array]' ? op.campos : null;
    var soloEstado = campos && campos.length && campos.every(function (c) { return c === 'estado' || c === 'folio_hoja'; });
    return (soloEstado && d.estado === 'consumido') ? null
      : 'las listas de compra las corrigen fabricación y dirección; desde pagos solo se marca lo que ya salió del almacén';
  }
  return 'el catálogo de material lo editan fabricación y dirección';
}

/* ── Lo que no puede entrar, venga de quien venga ──────────────────────────────────── */
function almValidar_(alm, d) {
  var id = String(d.id == null ? '' : d.id);
  if (!id.trim() || id.length > 200) return 'le falta el id, o es demasiado largo';
  if (alm === 'movimientos') {
    if (ALM_TIPOS.indexOf(d.tipo) === -1) return '«' + d.tipo + '» no es un tipo de movimiento';
    if (ALM_ORIGENES.indexOf(d.origen) === -1) return '«' + d.origen + '» no es un origen de movimiento';
    if (!String(d.material_id || '').trim()) return 'el movimiento no dice de qué material';
    if (ALM_UNIDADES_COMPRA.indexOf(d.unidad_compra) === -1) return '«' + d.unidad_compra + '» no es una unidad de compra';
    var c = Number(d.cantidad);
    if (d.cantidad === null || d.cantidad === '' || !isFinite(c) || Math.abs(c) > 1e7) return 'la cantidad no es un número razonable';
    var s = ALM_SIGNO[d.tipo];
    if (s === 1 && !(c > 0)) return 'una ' + d.tipo + ' suma: su cantidad va en positivo';
    if (s === -1 && !(c < 0)) return 'una ' + d.tipo + ' resta: su cantidad va en negativo';
    if (d.tipo === 'conteo' && c < 0) return 'no se puede contar menos que nada';
    if (d.tipo === 'ajuste' && c === 0) return 'un ajuste de cero no ajusta nada';
    if (!(Number(d.ts) > 0)) return 'el movimiento no trae su sello de tiempo';
    if (d.costo_total !== undefined && d.costo_total !== null && d.costo_total !== '' && !isFinite(Number(d.costo_total))) return 'el costo no es un número';
    return '';
  }
  if (alm === 'materiales') {
    if (d.unidad_compra !== undefined && ALM_UNIDADES_COMPRA.indexOf(d.unidad_compra) === -1) return '«' + d.unidad_compra + '» no es una unidad de compra';
    if (d.unidad_consumo !== undefined && ALM_UNIDADES_CONSUMO.indexOf(d.unidad_consumo) === -1) return '«' + d.unidad_consumo + '» no es una unidad de consumo';
    if (d.factor !== undefined && !(Number(d.factor) > 0)) return 'el factor tiene que ser mayor que cero';
    return '';
  }
  if (!String(d.proyecto_id || '').trim() || !String(d.material_id || '').trim()) return 'la línea no dice de qué proyecto y de qué material';
  if (d.estado !== undefined && ALM_ESTADOS_REQ.indexOf(d.estado) === -1) return '«' + d.estado + '» no es un estado de la lista de compra';
  return '';
}

/* Un estado de la lista de compra no vuelve atrás desde «comprado» o «consumido». Consumido
   quiere decir que la salida ya se restó del almacén: si un teléfono atrasado lo regresara a
   «calculado», la siguiente vuelta del corte volvería a emitir la salida. La única vuelta que
   hay es de comprado a consumido. */
function almEstadoAdmite_(actual, nuevo) {
  if (actual === 'consumido') return nuevo === 'consumido';
  if (actual === 'comprado') return nuevo === 'comprado' || nuevo === 'consumido';
  return true;
}

/* ------------------------------------------------------------ /empujar_almacen */
function rutaEmpujarAlmacen_(cuerpo, rol, quien) {
  var ops = (cuerpo && Object.prototype.toString.call(cuerpo.ops) === '[object Array]')
    ? cuerpo.ops.slice(0, ALM_OPS_MAX) : [];
  /* El mismo candado que /empujar: una escritura a la vez en toda la hoja. Sin él, dos
     teléfonos que mandan el mismo movimiento al mismo tiempo lo buscan los dos, no lo
     encuentran ninguno y lo escriben los dos. */
  var candado = LockService.getScriptLock();
  try { candado.waitLock(20000); }
  catch (e) {
    return { ok: false, codigo: 'SIN_RED',
             mensaje: 'La hoja está ocupada con otra escritura. Se vuelve a intentar solo.' };
  }
  try {
    var ctx = { pestanas: {}, secuencia: almLeerSecuencia_(), rol: rol,
                quien: quien || ('token de ' + rol), ahora: new Date() };
    var resultados = [], anotaciones = [];
    for (var i = 0; i < ops.length; i++) {
      var r;
      /* Una operación que truena no se lleva a las que vienen detrás en el mismo viaje. */
      try { r = almUnaOperacion_(ctx, ops[i], anotaciones); }
      catch (err) {
        try { console.error('puente almacén: ' + (err && err.stack || err)); } catch (_) {}
        r = { id: (ops[i] && ops[i].id) || '?', ok: false, codigo: 'DESCONOCIDO', mensaje: 'La hoja falló al escribir ese cambio.' };
      }
      resultados.push(r);
    }
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty(ALM_PROP_SECUENCIA, String(ctx.secuencia));
    anotar_(anotaciones);
    return { ok: true, resultados: resultados, secuencia: ctx.secuencia };
  } finally {
    candado.releaseLock();
  }
}

/* La pestaña y sus filas por id, leídas una vez por viaje. */
function almContexto_(ctx, alm) {
  if (ctx.pestanas[alm]) return ctx.pestanas[alm];
  var P = almPestana_(alm, true);
  P.porId = {};
  almFilas_(P).forEach(function (f) { P.porId[String(f.valores[P.mapa.id - 1]).trim()] = f; });
  P.siguiente = Math.max(P.h.getLastRow() + 1, 2);
  ctx.pestanas[alm] = P;
  return P;
}

function almUnaOperacion_(ctx, op, anotaciones) {
  var id = op && op.id;
  if (!op || !id) return { id: id || '?', ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Operación sin id.' };
  var alm = String(op.almacen || '');
  if (!ALM_PESTANAS[alm]) {
    return { id: id, ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La hoja no tiene pestaña para «' + alm + '».' };
  }
  var d = (op.datos && typeof op.datos === 'object') ? op.datos : null;
  if (!d) return { id: id, ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La operación no trae datos.' };

  var no = almPermiso_(ctx.rol, alm, op);
  if (no) return { id: id, ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Este teléfono no puede escribir eso: ' + no + '.' };
  var malo = almValidar_(alm, d);
  if (malo) return { id: id, ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La hoja no aceptó ese cambio: ' + malo + '.' };

  var P = almContexto_(ctx, alm);
  var t = ALM_PESTANAS[alm];
  var llave = String(d.id).trim();
  var previa = P.porId[llave] || null;
  var veDinero = !!VE_EL_DINERO[ctx.rol];

  /* ── El libro: si ya está, ya está ── */
  if (t.anexo && previa) return { id: id, ok: true, ya_estaba: true };

  var cols = almColumnas_(alm);
  var porCampo = {};
  cols.forEach(function (c) { porCampo[c.campo] = c; });
  var valores = previa ? previa.valores.slice() : new Array(P.ncol).fill('');
  var actual = previa ? almRegistro_(P, previa.valores, 'direccion') : {};
  var otros = previa && P.mapa._otros ? (almDeCelda_(porCampo._otros, previa.valores[P.mapa._otros - 1]) || {}) : {};
  var sellos = previa && P.mapa._sellos ? (almDeCelda_(porCampo._sellos, previa.valores[P.mapa._sellos - 1]) || {}) : {};
  var ts = Number(d.actualizado_en) > 0 ? Number(d.actualizado_en) : ctx.ahora.getTime();

  /* Qué se escribe. En un alta, todo lo que vino. En un cambio, solo lo que la operación dice
     que cambió —o todo, si es de una versión que no lo decía—, y de cada campo solo si su sello
     no es más viejo que el de la hoja. */
  var lista = [];
  if (!previa) { for (var k in d) lista.push(k); }
  else if (Object.prototype.toString.call(op.campos) === '[object Array]') lista = op.campos.map(String);
  else { for (var k2 in d) lista.push(k2); }

  var escritos = [], viejos = [];
  lista.forEach(function (campo) {
    if (!Object.prototype.hasOwnProperty.call(d, campo)) return;
    if (ALM_NO_VIAJA.indexOf(campo) !== -1 || campo.charAt(0) === '_') return;
    if (campo === 'creado_en' && previa) return;
    /* Lo que identifica la fila no se cambia en un cambio: la clave, y en la lista de compra el
       proyecto y el material, que son su id. */
    if (previa && t.fijos.indexOf(campo) !== -1) return;
    /* Los importes, solo de quien los ve. Fabricación guarda el material con el costo que tenía
       su teléfono —ninguno, porque no lo recibe— y sin esto lo borraba. */
    if (!veDinero && CAMPOS_DE_DINERO_ALMACEN.indexOf(campo) !== -1) return;
    if (previa && Number(sellos[campo]) > ts) { viejos.push(campo); return; }
    var v = d[campo];
    if (alm === 'requerimientos' && campo === 'estado' && previa && !almEstadoAdmite_(actual.estado, v)) { viejos.push(campo); return; }
    var c = porCampo[campo];
    if (c && P.mapa[campo]) {
      var celda = almACelda_(c, v);
      if (typeof celda === 'string' && celda.length > ALM_CELDA_MAX) { viejos.push(campo); return; }
      valores[P.mapa[campo] - 1] = celda;
    } else {
      otros[campo] = v;
    }
    sellos[campo] = ts;
    escritos.push(campo);
  });

  if (previa && !escritos.length) {
    /* Nada nuevo: no se gasta un número de secuencia, que haría bajar la fila otra vez a los
       tres teléfonos para nada. Se contesta ok —no hay nada que reintentar— y se dice qué no
       entró por ser más viejo que lo que ya hay. */
    return { id: id, ok: true, sin_cambio: true, viejos: viejos };
  }

  /* La fecha legible del libro sale de su sello. */
  cols.forEach(function (c) {
    if (c.tipo === 'cuándo' && c.de && P.mapa[c.campo] && escritos.indexOf(c.de) !== -1) {
      valores[P.mapa[c.campo] - 1] = almACelda_(c, d[c.de]);
    }
  });
  if (P.mapa._otros) {
    var hayOtros = false; for (var o in otros) { hayOtros = true; break; }
    var jo = hayOtros ? JSON.stringify(otros) : '';
    if (jo.length > ALM_CELDA_MAX) return { id: id, ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La hoja no aceptó ese cambio: trae demasiado texto.' };
    valores[P.mapa._otros - 1] = jo;
  }
  if (P.mapa._sellos) valores[P.mapa._sellos - 1] = JSON.stringify(sellos);
  ctx.secuencia++;
  valores[P.mapa._secuencia - 1] = ctx.secuencia;
  valores[P.mapa._llego - 1] = ctx.ahora;
  valores[P.mapa._subio - 1] = almACelda_(porCampo._subio, ctx.quien);

  var fila = previa ? previa.fila : P.siguiente++;
  if (fila > P.h.getMaxRows()) P.h.insertRowsAfter(P.h.getMaxRows(), Math.max(200, fila - P.h.getMaxRows()));
  P.h.getRange(fila, 1, 1, P.ncol).setValues([valores]);
  P.porId[llave] = { fila: fila, valores: valores };

  anotaciones.push({ rol: ctx.rol, folio: t.hoja + ' · ' + llave, fila: fila,
                     campos: escritos.filter(function (c) { return c !== 'actualizado_en'; }), creada: !previa });
  return { id: id, ok: true, creada: !previa, viejos: viejos };
}

/* -------------------------------------------------------------- /jalar_almacen */
/**
 * Lo que la hoja recibió después de la secuencia `desde`, de las tres pestañas, en el orden en
 * que llegó. Con el candado aunque solo lee: una escritura de varias filas a la mitad dejaría
 * ver la tercera sin la segunda, y el teléfono, que guarda la más alta que vio, ya no
 * preguntaría por la segunda. Si está ocupada se dice, y el teléfono pregunta en la siguiente.
 */
function rutaJalarAlmacen_(cuerpo, rol) {
  var desde = Number(cuerpo && cuerpo.desde);
  if (!isFinite(desde) || desde < 0) desde = 0;
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(10000)) {
    return { ok: false, codigo: 'SIN_RED', mensaje: 'La hoja está ocupada con otra escritura. Se vuelve a pedir sola.' };
  }
  try {
    var todos = [];
    for (var alm in ALM_PESTANAS) {
      var P = almPestana_(alm, false);
      if (!P || !P.mapa._secuencia || !P.mapa.id) continue;
      almFilas_(P).forEach(function (f) {
        var s = Number(f.valores[P.mapa._secuencia - 1]) || 0;
        if (s > desde) todos.push({ s: s, almacen: P.alm, valores: f.valores, P: P });
      });
    }
    todos.sort(function (a, b) { return a.s - b.s; });
    var pagina = todos.slice(0, ALM_POR_PAGINA);
    var hasta = pagina.length ? pagina[pagina.length - 1].s : desde;
    return {
      ok: true,
      registros: pagina.map(function (x) { return { almacen: x.almacen, datos: almRegistro_(x.P, x.valores, rol) }; }),
      hasta: hasta,
      hay_mas: todos.length > pagina.length
    };
  } finally {
    candado.releaseLock();
  }
}


/* =========================================================================================
   LA CARPETA DE LOS DISEÑOS — /carpetas (puente-sheets-10)

   Elías sube los diseños de cada trabajo a «Trabajos Pendientes», una carpeta de Drive con una
   subcarpeta por venta («Diego - Herrajes Innova 2», «José - Kelvarion»…): el .cdr con las
   escalas, sus copias de seguridad y el PDF de órdenes de fabricación. La plataforma los enseña
   en la ficha del proyecto, y quien está en el taller los abre sin pedirlos por WhatsApp.

   Va por aquí y no desde el teléfono porque este script ya corre con la cuenta dueña de la hoja,
   que ve la carpeta. Desde el navegador haría falta pedirle a cada persona el permiso de Drive,
   que Google cuenta como sensible —pantalla de «app no verificada»—. Aquí se pide UNA vez, al
   pegar esta versión.

   /carpetas solo LEE: nombres, ligas y fechas, nunca el contenido de un archivo. No hay dinero
   en ella, así que contesta igual a los tres roles. /crear_carpeta es lo único que escribe, y
   solo crea —nunca mueve, renombra ni borra—: una subcarpeta vacía con el nombre del proyecto,
   y solo si Dirección la pide. Quien abre una liga necesita,
   además, que la carpeta esté compartida con su cuenta: eso lo decide Drive, no este puente.

   Se guarda cinco minutos en la caché del script: la ficha se abre seguido y recorrer Drive
   cuesta segundos. Una carpeta nueva aparece a más tardar en cinco minutos.
   ========================================================================================= */
var CARPETA_TRABAJOS = '1XfM5KMFn5p87LI_W-IglmflaZcs3y_wB';   // «Trabajos Pendientes»
var CARPETAS_CACHE = 'carpetas-trabajos-v1';
var CARPETAS_MAX = 150;         // subcarpetas
var ARCHIVOS_MAX = 60;          // archivos por subcarpeta

/* «Trabajos Pendientes», por su id y, si Google no la da así, buscándola por nombre entre lo que
   esta cuenta ve. La primera versión se tragaba el error y contestaba «no alcanza la carpeta» sin
   decir por qué: el 7 de octubre de 2026 la carpeta —de otra cuenta, compartida con la de la hoja—
   no salía y no había cómo saber la causa. Ahora el error de Google viaja en `detalle` y queda en
   Ejecuciones. */
function carpetaDeTrabajos_() {
  var porId = '';
  try { return { ok: true, carpeta: DriveApp.getFolderById(CARPETA_TRABAJOS) }; }
  catch (err) { porId = String(err && err.message || err); console.error('carpetas: getFolderById: ' + porId); }
  var porNombre = '';
  try {
    var it = DriveApp.searchFolders('title = "Trabajos Pendientes" and trashed = false');
    var hallada = null, n = 0;
    while (it.hasNext() && n < 20) {
      var c = it.next(); n++;
      if (c.getId() === CARPETA_TRABAJOS) return { ok: true, carpeta: c };
      if (!hallada) hallada = c;
    }
    if (hallada && n === 1) return { ok: true, carpeta: hallada };
    porNombre = n ? n + ' carpetas se llaman así y ninguna es la de siempre' : 'ninguna carpeta se llama así';
  } catch (err2) { porNombre = String(err2 && err2.message || err2); console.error('carpetas: searchFolders: ' + porNombre); }
  return { ok: false, codigo: 'NO_ENCONTRADO',
    mensaje: 'La hoja no alcanza la carpeta «Trabajos Pendientes» de Drive.',
    detalle: 'Por id: ' + porId + ' · Por nombre: ' + porNombre };
}

function rutaCarpetas_() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (_) { cache = null; }
  var guardado = cache ? cache.get(CARPETAS_CACHE) : null;
  if (guardado) { try { return JSON.parse(guardado); } catch (_) { /* se vuelve a leer */ } }

  var raiz = carpetaDeTrabajos_();
  if (!raiz.ok) return raiz;
  raiz = raiz.carpeta;
  var carpetas = [];
  var it = raiz.getFolders();
  while (it.hasNext() && carpetas.length < CARPETAS_MAX) {
    var c = it.next();
    carpetas.push({ id: c.getId(), nombre: c.getName(), url: c.getUrl(),
                    modificado: c.getLastUpdated().getTime(), archivos: archivosDeCarpeta_(c) });
  }
  var out = { ok: true, ts: Date.now(), raiz: raiz.getUrl(), carpetas: carpetas };
  /* La caché guarda hasta 100 KB por llave; si no cabe, se contesta igual sin guardarla. */
  try { if (cache) cache.put(CARPETAS_CACHE, JSON.stringify(out), 300); } catch (_) {}
  return out;
}

function archivosDeCarpeta_(carpeta) {
  var lista = [];
  var it = carpeta.getFiles();
  while (it.hasNext() && lista.length < ARCHIVOS_MAX) {
    var f = it.next();
    lista.push({ nombre: f.getName(), url: f.getUrl(), tipo: f.getMimeType(),
                 modificado: f.getLastUpdated().getTime() });
  }
  return lista;
}

/* ---------------------------------------------------------------- /crear_carpeta
   La carpeta del proyecto en fabricación que no tiene una. La pide el teléfono de Dirección al
   sincronizar (js/datos/carpetas.js, `alDia`), con el nombre del proyecto: «Contacto - Negocio».
   Bajo el candado y comparando el nombre sin acentos ni mayúsculas, para que dos teléfonos que la
   pidan a la vez no hagan dos: si ya hay una que se llama igual, devuelve ésa. */
function nombreDeCarpeta_(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rutaCrearCarpeta_(cuerpo, rol) {
  if (rol !== 'direccion') return { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Las carpetas nuevas las abre el teléfono de Dirección.' };
  var nombre = String((cuerpo && cuerpo.nombre) || '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nombre || nombre.length > 120) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Falta el nombre de la carpeta, o es demasiado largo.' };
  var raiz = carpetaDeTrabajos_();
  if (!raiz.ok) return raiz;
  raiz = raiz.carpeta;
  return conCandado(function () {
    var buscado = nombreDeCarpeta_(nombre);
    var it = raiz.getFolders();
    while (it.hasNext()) {
      var c = it.next();
      if (nombreDeCarpeta_(c.getName()) === buscado) {
        return { ok: true, creada: false, carpeta: { id: c.getId(), nombre: c.getName(), url: c.getUrl(), modificado: c.getLastUpdated().getTime(), archivos: archivosDeCarpeta_(c) } };
      }
    }
    var nueva = raiz.createFolder(nombre);
    try { CacheService.getScriptCache().remove(CARPETAS_CACHE); } catch (_) {}
    return { ok: true, creada: true, carpeta: { id: nueva.getId(), nombre: nueva.getName(), url: nueva.getUrl(), modificado: Date.now(), archivos: [] } };
  });
}

/* Para pedirle a Google el permiso de Drive desde el editor: se elige «autorizarDrive» y se le da
   Ejecutar. Solo lee el nombre de «Trabajos Pendientes». Existe porque la pantalla de permisos
   de Google deja desmarcar uno por uno, y el 8 de octubre de 2026 el de Drive había quedado
   fuera: la hoja contestaba «No cuentas con el permiso para llamar a DriveApp.getFolderById» y
   correr cualquier otra función no lo volvía a pedir, porque Google solo pregunta por los
   permisos que usa la función que se corre. */
function autorizarDrive() {
  /* Con la pantalla de permisos por casillas, Google ya no vuelve a preguntar solo por uno que se
     desmarcó: esto lo pide de nuevo. */
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/drive']);
  var r = carpetaDeTrabajos_();
  return r.ok ? 'Drive autorizado: «' + r.carpeta.getName() + '».' : (r.mensaje + ' ' + r.detalle);
}

/* =========================================================================================
   /espejo — LA HOJA, COMO ESPEJO DE SOLO LECTURA DE LA BASE DE DATOS (Supabase)

   A partir de la fase 4 de la migración la verdad vive en la base de datos y esta hoja deja de
   ser donde se captura: es una copia que se llena sola, para que el Tablero, la cobranza, las
   comisiones, las vistas y el correo de los lunes sigan calculándose como siempre. Lo que se
   escriba a mano aquí se pisa con el siguiente cambio de la base.

   Quién llama: la función `espejo` de Supabase (supabase/functions/espejo), cada pocos minutos.
   No la llama ningún teléfono ni ninguna persona, y por eso va ANTES de las dos puertas de
   doPost (como /verificar) con la suya propia: un secreto compartido. Son tres propiedades del
   script (aquí solo viven los NOMBRES; el valor no está en el código ni en el repositorio):

     · ESPEJO_SECRETO  la identidad de quien llama. Se compara en tiempo constante. Sin ella, con
                       otra, o con una de menos de 32 caracteres, la respuesta es la misma que
                       le da la puerta a quien no trae token —no confirma que la ruta existe— y
                       no se toca nada.
     · MODO_ESPEJO     «si» declara que esta hoja ES un espejo. Mientras no esté: la ruta se
                       niega a escribir (una llamada por error no puede pisar la hoja viva, que
                       hasta la fase 4 es la fuente de verdad) y alEditar, normalizarIvaActivos y
                       ordenarVentas hacen lo de siempre. Con ella: los tres quedan inocuos, para
                       que no reescriban lo que la base mandó.
     · ESPEJO_SELLOS   opcional. Apagada, el espejo NO escribe la columna AI «Sellos» (una hoja
                       espejo no decide quién gana ningún cambio); con «si» la escribe tal cual la
                       manda la base, por si algún día se regresa a leer de la hoja.

   LO QUE LLEGA (el cuerpo de /espejo, con `secreto` al lado de `ruta`):

       { ruta: 'espejo', secreto: '…', lote: {
           id: 'esp-…',                       lo que se quiera para reconocer el lote en la bitácora
           modo: 'incremental' | 'completo',  informativo
           ventas: [ { a_folio: 'V-014', b_proyecto: '…', c_estatus: '…', … }, … ],
           abonos: [ { a_folio: 'V-014', abonos: [ { c_importe, d_fecha, e_nota, f_pago }, … ] }, … ] } }

   Las llaves de cada venta son las columnas de la vista espejo_ventas (a_folio = columna A,
   b_proyecto = B…; ver espejoColumnasVentas_). Los abonos de un folio llegan COMPLETOS y juntos:
   una hoja de abonos no tiene un id por renglón, así que lo que se reconcilia es el conjunto del
   folio, no un renglón. `{ ruta: 'espejo', secreto, accion: 'estado' }` no escribe nada y dice
   cuántas filas libres quedan.

   QUÉ HACE, Y QUÉ NUNCA:

     · La identidad es el FOLIO (columna A), jamás el número de fila: la hoja se reacomodaba por
       estatus y, aunque aquí ya no, las filas de hoy están donde estén. Un folio que no está se da
       de alta en la primera fila libre; uno que está se pone al día en su fila.
     · Escribe solo las columnas CAPTURADAS —A:G, I:J, L:N, Y:AH (y AI con ESPEJO_SELLOS)— y solo las
       celdas cuyo valor cambió. H, K y O:X son fórmulas de la hoja y no se tocan nunca: un lote que
       trae una llave de esas columnas se rechaza completo. En «Abonos comisión» escribe A, C, D, E y
       F; la B es la fórmula del nombre.
     · Lo que se teclea como texto (la hora, el teléfono, las notas, los sellos) lleva su '@' antes
       del valor, y un texto que empieza con = + - @ lleva su apóstrofo (lo que la hoja volvería
       fórmula). La base no guarda ese apóstrofo; aquí se pone.
     · Es atómica por lote: todo se valida y se calcula con el candado puesto y ANTES de escribir; si
       algo no cabe o no vale, no se escribe nada. Una caída a la mitad del escribir (la cuota de
       Google) se repara con el reintento: aplicar el mismo lote dos veces deja la misma hoja.
     · Respeta FIN. Si el lote necesita más filas libres de las que hay, contesta CAPACIDAD_AGOTADA y
       no escribe nada (subir FIN y todos los $2:$310 es un paso del despliegue, no de esta ruta).
     · No crea ninguna pestaña. Anota en la «Bitácora del puente» —si existe— con rol «espejo»; pone
       una nota en A1 de Ventas y de Abonos («esto es un espejo, las ediciones se pisan») y la fecha
       y hora de la última sincronización en la columna que sigue a la última del puente (AJ).
   ========================================================================================= */
var PROP_ESPEJO_SECRETO = 'ESPEJO_SECRETO';
var PROP_MODO_ESPEJO = 'MODO_ESPEJO';
var PROP_ESPEJO_SELLOS = 'ESPEJO_SELLOS';
var ESPEJO_SECRETO_MIN = 32;          // un secreto más corto que esto no se acepta, ni configurado ni recibido
var ESPEJO_MAX_VENTAS = 100;          // ventas por lote (el cuerpo entero ya topa en 64 KB, ver doPost)
var ESPEJO_MAX_ABONOS = 400;          // renglones de abonos por lote
var ESPEJO_ABONOS_FILAS = 1999;       // «Abonos comisión» llega del renglón 2 al 2000 (ver filaLibreEnAbonos)

/* Una propiedad del script como texto; vacío si no existe o si el servicio no contesta. */
function espejoPropiedad_(nombre) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(nombre);
    return v == null ? '' : String(v);
  } catch (e) { return ''; }
}

function espejoEncendida_(nombre) {
  var v = espejoPropiedad_(nombre).trim().toLowerCase();
  return v === 'si' || v === 'sí' || v === 'true' || v === '1';
}

/** ¿Esta hoja es un espejo? Falsa si la propiedad no está o no se pudo leer: ante la duda, todo se
 *  comporta como siempre. La preguntan alEditar, normalizarIvaActivos y ordenarVentas. */
function modoEspejo_() { return espejoEncendida_(PROP_MODO_ESPEJO); }

function espejoConSellos_() { return espejoEncendida_(PROP_ESPEJO_SELLOS); }

/** Igualdad de dos textos sin salir en la primera diferencia: recorre SIEMPRE el más largo y junta
 *  las diferencias, de modo que lo que tarda no dice en qué posición falla. */
function espejoIgual_(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  var largo = Math.max(a.length, b.length), dif = a.length ^ b.length;
  for (var i = 0; i < largo; i++) dif |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return dif === 0;
}

/** ¿Quien llama trae el secreto del espejo? Compara siempre, aunque no haya secreto configurado, y
 *  después exige el largo mínimo: no hay camino corto que distinga «no hay secreto» de «es otro». */
function espejoAutenticado_(cuerpo) {
  var esperado = espejoPropiedad_(PROP_ESPEJO_SECRETO);
  var dado = (cuerpo && typeof cuerpo.secreto === 'string') ? cuerpo.secreto : '';
  var igual = espejoIgual_(esperado, dado);
  return igual && esperado.length >= ESPEJO_SECRETO_MIN;
}

/* ---------------------------------------------------------------- /espejo */
function rutaEspejo_(cuerpo) {
  if (!espejoAutenticado_(cuerpo)) {
    /* La misma respuesta, letra por letra, que la puerta de doPost le da a quien no trae token: para
       quien no tiene el secreto, esta ruta no se distingue de cualquier otra. */
    return { ok: false, codigo: 'ROL_SIN_PERMISO',
             mensaje: 'Este teléfono no tiene un token válido del puente. Pégalo otra vez en Ajustes.' };
  }
  var accion = String((cuerpo && cuerpo.accion) || 'lote');
  if (accion === 'estado') return espejoEstado_();
  if (accion !== 'lote') {
    return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La acción del espejo es «lote» o «estado».' };
  }
  if (!modoEspejo_()) {
    return { ok: false, codigo: 'ESPEJO_APAGADO',
             mensaje: 'Esta hoja todavía no es un espejo: falta MODO_ESPEJO = si en las propiedades del script. No se escribió nada.' };
  }
  return espejoLote_(cuerpo.lote);
}

/** Qué tan llena está la hoja y cuándo se sincronizó por última vez. No escribe nada. */
function espejoEstado_() {
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName('Ventas');
  var a = ss.getSheetByName(ABONOS);
  var out = { ok: true, version: PUENTE_VERSION, modo_espejo: modoEspejo_(), sellos: espejoConSellos_(),
              fin: FIN, ventas: null, abonos: null, ultima_sincronizacion: null };
  if (h) {
    var b = h.getRange(2, COL['Proyecto'], FIN - 1, 1).getValues(), ocupadas = 0;
    for (var i = 0; i < b.length; i++) if (String(b[i][0]).trim() !== '') ocupadas++;
    out.ventas = { ocupadas: ocupadas, libres: (FIN - 1) - ocupadas };
    try {
      if (h.getMaxColumns() >= espejoColMarca_()) {
        var marca = h.getRange(2, espejoColMarca_()).getValue();
        if (esFecha(marca)) out.ultima_sincronizacion = marca.toISOString();
      }
    } catch (e) { /* sin la marca no hay última sincronización, y nada más */ }
  }
  if (a && a.getMaxColumns() >= COL_PAGO) {
    var d = a.getRange(2, 1, ESPEJO_ABONOS_FILAS, COL_PAGO).getValues(), ocupAb = 0;
    for (var j = 0; j < d.length; j++) if (!espejoRenglonVacio_(d[j])) ocupAb++;
    out.abonos = { ocupadas: ocupAb, libres: ESPEJO_ABONOS_FILAS - ocupAb };
  }
  return out;
}

/* Vacío en «Abonos comisión» es lo mismo que para filaLibreEnAbonos: nada en A ni de C a F (B es la
   fórmula del nombre y no cuenta). */
function espejoRenglonVacio_(r) {
  for (var c = 0; c < COL_PAGO; c++) {
    if (c !== 1 && r[c] !== '' && r[c] !== null) return false;
  }
  return true;
}

/* ── Qué columna de Ventas recibe cada columna de la vista espejo_ventas ───────────────────
   Las posiciones salen de COL, y no de un 25 contado a mano: si un día se mueve una columna en COL,
   el espejo se mueve con ella. pruebas/supabase-espejo.mjs compara esta lista con la de la función
   (supabase/functions/_shared/espejo.js): una llave escrita distinto de un lado es una columna que
   el otro no entiende. NO hay H, K ni O:X: son fórmulas. */
function espejoColumnasVentas_() {
  return [
    ['a_folio', COL_FOLIO], ['b_proyecto', COL['Proyecto']], ['c_estatus', COL['Estatus']],
    ['d_cuenta', COL['Cuenta ']], ['e_tipo', COL['Tipo de trabajo']], ['f_iva', COL['IVA']],
    ['g_subtotal', COL['Precio Subtotal']], ['i_anticipo', COL['Anticipo']], ['j_liquidacion', COL['Liquidacion']],
    ['l_fecha_anticipo', COL['Fecha Anticipo e Instalacion']], ['m_fecha_instalacion', COL['Fecha instalacion']],
    ['n_fecha_liquidacion', COL['Fecha Liquidacion']], ['y_folio_cotizacion', COL['Folio cotizacion']],
    ['z_etapa', COL['Etapa de obra']], ['aa_hora', COL['Hora instalacion']], ['ab_ubicacion', COL['Ubicacion']],
    ['ac_direccion', COL['Direccion']], ['ad_pct', COL['Porcentaje comision']], ['ae_telefono', COL['Telefono']],
    ['af_entrega', COL['Entrega']], ['ag_notas', COL['Notas']], ['ah_plazo', COL['Plazo taller']],
    ['ai_sellos', COL['Sellos']]
  ];
}

/* Cómo se lee cada una: el tipo decide qué se valida, qué se escribe y cómo se compara con lo que
   ya hay en la celda. */
var ESPEJO_TIPOS = {
  a_folio: 'folio', b_proyecto: 'nombre', c_estatus: 'estatus', d_cuenta: 'cuenta', e_tipo: 'tipos',
  f_iva: 'iva', g_subtotal: 'subtotal', i_anticipo: 'dinero', j_liquidacion: 'dinero',
  l_fecha_anticipo: 'fecha', m_fecha_instalacion: 'fecha', n_fecha_liquidacion: 'fecha',
  y_folio_cotizacion: 'texto', z_etapa: 'etapa', aa_hora: 'hora', ab_ubicacion: 'texto', ac_direccion: 'texto',
  ad_pct: 'pct', ae_telefono: 'telefono', af_entrega: 'entrega', ag_notas: 'notas', ah_plazo: 'plazo',
  ai_sellos: 'sellos'
};

/* Las llaves que acompañan a cada fila de la vista y no son columnas de la hoja. */
var ESPEJO_IGNORABLES = { empresa_id: true, updated_at: true, dinero_updated_at: true, id: true };

/** ¿Esta llave es la de una columna de fórmula? La letra que va antes del primer «_» (h_neto, k_saldo,
 *  x_revisar…) o una letra suelta («H»). `letras` son las columnas de fórmula de la pestaña: H, K y
 *  O:X en Ventas; solo la B en «Abonos comisión» (el nombre sale de un VLOOKUP). */
function espejoEsFormula_(llave, letras) {
  var m = /^([a-z]{1,2})(?:_|$)/i.exec(String(llave));
  return !!m && letras.indexOf(m[1].toUpperCase()) !== -1;
}
var ESPEJO_FORMULAS_VENTAS = ['H', 'K', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'];
var ESPEJO_FORMULAS_ABONOS = ['B'];

/** El texto como se escribe en una celda normal: lo que la hoja volvería fórmula (empieza con = + - @)
 *  lleva su apóstrofo, que Sheets no guarda y getValues no devuelve (ver textoProtegido). */
function espejoProtegido_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

/** Un número de verdad: número finito, o texto que lo es. Cualquier otra cosa, null. */
function espejoNumero_(x) {
  if (typeof x === 'number') return isFinite(x) ? x : null;
  if (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x.trim())) return Number(x.trim());
  return null;
}

/** Una fecha «YYYY-MM-DD» que existe, como Date a medianoche (como la arma armarCeldas); null si no. */
function espejoFecha_(x) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x));
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var f = new Date(y, mo - 1, d);
  if (y < 1900 || y > 2100 || f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
  return f;
}

/** Medianoche de ese día EN LA ZONA DE LA HOJA, que es la que usa getValues para leer la fecha de vuelta
 *  (Utilities.formatDate con la zona de la hoja, como aplanarFila). `new Date(a, m, d)` la arma en la zona
 *  del proyecto del script, y si ésta fuera otra la fecha se correría un día y se reescribiría en cada
 *  sincronización. Sin parseDate cae en la de siempre. */
function espejoDia_(texto, tz) {
  try { return Utilities.parseDate(texto, tz, 'yyyy-MM-dd'); }
  catch (e) { return espejoFecha_(texto); }
}

/** Valida y deja listo el valor de UNA columna de la vista: { ok, v, w, texto } o { ok:false, por }.
 *  `v` es el valor canónico, el que se compara con lo que ya hay; `w`, lo que se le da a la celda;
 *  `texto`, si la celda tiene que estar en texto sin formato ('@') antes de escribirla. `tz` es la zona
 *  de la hoja (para las fechas). */
function espejoNormalizar_(nombre, x, tz) {
  var tipo = ESPEJO_TIPOS[nombre];
  var no = function (por) { return { ok: false, por: por }; };
  var si = function (v, w, texto) { return { ok: true, v: v, w: w === undefined ? v : w, texto: !!texto }; };
  var vacio = x === null || x === undefined || (typeof x === 'string' && x.trim() === '');
  if (x !== null && typeof x === 'object' && tipo !== 'sellos') return no('«' + nombre + '» no es un dato simple');
  var s = String(x == null ? '' : x);
  var n;

  if (tipo === 'folio') {
    s = s.trim().toUpperCase();
    return /^V-\d{3,7}$/.test(s) ? si(s) : no('el folio «' + s.slice(0, 30) + '» no tiene la forma V-###');
  }
  if (tipo === 'nombre') {
    s = s.trim().slice(0, 2000);
    return s ? si(s, espejoProtegido_(s)) : no('la venta no trae el nombre del proyecto');
  }
  if (tipo === 'texto') { s = s.slice(0, 2000); return si(s, espejoProtegido_(s)); }
  if (tipo === 'estatus') {
    if (vacio) return si('');
    return ESTATUS.indexOf(s.trim()) !== -1 ? si(s.trim()) : no('«' + s.slice(0, 30) + '» no es un estatus de la hoja');
  }
  if (tipo === 'cuenta') {
    if (vacio) return si('');
    return CUENTAS.indexOf(s.trim()) !== -1 ? si(s.trim()) : no('«' + s.slice(0, 30) + '» no es una cuenta de la hoja');
  }
  if (tipo === 'tipos') {
    if (vacio) return si('');
    var arr = s.split(/\s*,\s*/).filter(Boolean);
    var malos = arr.filter(function (t) { return TIPOS_TRABAJO.indexOf(t) === -1; });
    return malos.length ? no('no son tipos de la hoja: ' + malos.join(', ').slice(0, 60)) : si(arr.join(', '));
  }
  if (tipo === 'iva') {
    if (x === true || s === 'Sí') return si('Sí');
    if (x === false || s === 'No') return si('No');
    return no('el IVA es «Sí» o «No»');
  }
  if (tipo === 'subtotal') {
    n = espejoNumero_(x);
    return n === null ? no('el subtotal no es un número') : si(n);
  }
  if (tipo === 'dinero') {
    n = espejoNumero_(x);
    if (n === null) return no('«' + nombre + '» no es un número');
    return n < 0 ? no('«' + nombre + '» no puede ser negativo') : si(n);
  }
  if (tipo === 'fecha') {
    if (vacio) return si('');
    var f = espejoFecha_(s.trim());
    return f ? si(s.trim(), espejoDia_(s.trim(), tz)) : no('la fecha de «' + nombre + '» tiene que venir como YYYY-MM-DD');
  }
  if (tipo === 'etapa') {
    if (vacio) return si('');
    return ETAPAS_OBRA.indexOf(s.trim()) !== -1 ? si(s.trim()) : no('«' + s.slice(0, 30) + '» no es una etapa de obra');
  }
  if (tipo === 'hora') {
    if (vacio) return si('', '', true);
    var hora = horaEscrita(s);
    return hora === null ? no('la hora va como HH:MM') : si(hora, hora, true);
  }
  if (tipo === 'pct') {
    if (vacio) return si('');
    n = espejoNumero_(x);
    return (n === null || n < 0 || n > 100) ? no('el porcentaje va de 0 a 100') : si(n);
  }
  if (tipo === 'telefono') {
    if (vacio) return si('', '', true);
    var tel = telefonoLimpio(s);
    return si(tel, tel, true);
  }
  if (tipo === 'entrega') {
    if (vacio) return si('');
    return ENTREGAS.indexOf(s.trim()) !== -1 ? si(s.trim()) : no('la entrega es «Instalación», «Paquetería» o «Recolección en taller»');
  }
  if (tipo === 'notas') {
    s = vacio ? '' : s.slice(0, 40000);
    return si(s, s, true);
  }
  if (tipo === 'plazo') {
    if (vacio) return si('');
    return PLAZOS_TALLER.indexOf(s.trim()) !== -1 ? si(s.trim()) : no('el plazo es uno de: ' + PLAZOS_TALLER.join(', '));
  }
  if (tipo === 'sellos') {
    if (vacio) return si('', '', true);
    var crudo = typeof x === 'string' ? x : JSON.stringify(x);
    var canon = sellosATexto_(sellosDeCelda_(crudo));
    return canon ? si(canon, canon, true) : no('los sellos no se pudieron leer');
  }
  return no('«' + nombre + '» no es una columna del espejo');
}

/** Lo que hay en una celda, en la misma forma canónica que espejoNormalizar_ le da al valor nuevo. */
function espejoActual_(tipo, x, tz) {
  var s = String(x == null ? '' : x);
  switch (tipo) {
    case 'folio': return s.trim().toUpperCase();
    case 'nombre': return s.trim();
    case 'texto': case 'notas': return s;
    case 'estatus': case 'cuenta': case 'tipos': case 'iva': case 'etapa': case 'entrega': case 'plazo': return s.trim();
    case 'subtotal': case 'dinero': case 'pct': return typeof x === 'number' ? x : (x === '' || x == null ? '' : s.trim());
    case 'fecha': return esFecha(x) ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : s.trim();
    case 'hora': return horaDeCelda(x, tz);
    case 'telefono': return telefonoLimpio(s);
    case 'sellos': return sellosATexto_(sellosDeCelda_(x));
  }
  return s;
}

/* ── Validar el lote, sin tocar la hoja ───────────────────────────────────────────────── */
function espejoValidarVentas_(items, conSellos, tz) {
  var cols = espejoColumnasVentas_(), colDe = {};
  cols.forEach(function (c) { colDe[c[0]] = c[1]; });
  var filas = [], rechazadas = [], formulas = [], vistos = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var etiqueta = '#' + (i + 1);
    if (!it || typeof it !== 'object' || Object.prototype.toString.call(it) === '[object Array]') {
      rechazadas.push({ flujo: 'ventas', folio: etiqueta, por: 'la fila no es un objeto' });
      continue;
    }
    if (it.a_folio != null) etiqueta = String(it.a_folio).trim().toUpperCase().slice(0, 30) || etiqueta;
    var vals = {}, malas = [];
    for (var k in it) {
      if (!Object.prototype.hasOwnProperty.call(it, k)) continue;
      if (ESPEJO_IGNORABLES[k] === true) continue;
      if (espejoEsFormula_(k, ESPEJO_FORMULAS_VENTAS)) { formulas.push(k); continue; }
      if (!Object.prototype.hasOwnProperty.call(colDe, k)) { malas.push('«' + String(k).slice(0, 30) + '» no es una columna del espejo'); continue; }
      if (k === 'ai_sellos' && !conSellos) continue;
      var r = espejoNormalizar_(k, it[k], tz);
      if (!r.ok) { malas.push(r.por); continue; }
      vals[colDe[k]] = { nombre: k, tipo: ESPEJO_TIPOS[k], v: r.v, w: r.w, texto: r.texto };
    }
    if (!vals[COL_FOLIO]) malas.push('falta el folio');
    if (!vals[COL['Proyecto']]) malas.push('falta el nombre del proyecto');
    if (vals[COL_FOLIO]) {
      if (Object.prototype.hasOwnProperty.call(vistos, 'f:' + vals[COL_FOLIO].v)) malas.push('el folio viene dos veces en el lote');
      vistos['f:' + vals[COL_FOLIO].v] = true;
    }
    if (malas.length) { rechazadas.push({ flujo: 'ventas', folio: etiqueta, por: malas[0] }); continue; }
    filas.push({ folio: vals[COL_FOLIO].v, vals: vals });
  }
  return { filas: filas, rechazadas: rechazadas, formulas: formulas };
}

function espejoValidarAbonos_(grupos) {
  var out = [], rechazadas = [], formulas = [], vistos = {}, renglones = 0;
  for (var i = 0; i < grupos.length; i++) {
    var g = grupos[i];
    var etiqueta = '#' + (i + 1);
    if (!g || typeof g !== 'object' || Object.prototype.toString.call(g) === '[object Array]') {
      rechazadas.push({ flujo: 'abonos', folio: etiqueta, por: 'el grupo no es un objeto' });
      continue;
    }
    if (g.a_folio != null) etiqueta = String(g.a_folio).trim().toUpperCase().slice(0, 30) || etiqueta;
    var folio = String(g.a_folio == null ? '' : g.a_folio).trim().toUpperCase();
    var mala = '';
    for (var k in g) {
      if (!Object.prototype.hasOwnProperty.call(g, k) || k === 'a_folio' || k === 'abonos' || ESPEJO_IGNORABLES[k] === true) continue;
      if (espejoEsFormula_(k, ESPEJO_FORMULAS_ABONOS)) formulas.push(k);
      else if (!mala) mala = '«' + String(k).slice(0, 30) + '» no es una llave de un folio de abonos';
    }
    if (!/^V-\d{3,7}$/.test(folio)) mala = mala || 'el folio «' + folio.slice(0, 30) + '» no tiene la forma V-###';
    if (Object.prototype.hasOwnProperty.call(vistos, 'f:' + folio)) mala = mala || 'el folio viene dos veces en el lote';
    vistos['f:' + folio] = true;
    if (Object.prototype.toString.call(g.abonos) !== '[object Array]' || !g.abonos.length) {
      /* Un folio sin abonos no se manda: dejaría en blanco los renglones de ese folio por un error de la
         lectura, y los abonos no se borran nunca (solo se corrigen con otro renglón). */
      mala = mala || 'los abonos de un folio vienen en una lista que no está vacía';
    }
    var lista = [];
    if (!mala) {
      for (var j = 0; j < g.abonos.length && !mala; j++) {
        var x = g.abonos[j];
        if (!x || typeof x !== 'object') { mala = 'un abono no es un objeto'; break; }
        for (var kk in x) {
          if (!Object.prototype.hasOwnProperty.call(x, kk)) continue;
          if (kk === 'a_folio' || kk === 'c_importe' || kk === 'd_fecha' || kk === 'e_nota' || kk === 'f_pago' || ESPEJO_IGNORABLES[kk] === true) continue;
          if (espejoEsFormula_(kk, ESPEJO_FORMULAS_ABONOS)) formulas.push(kk);
          else mala = '«' + String(kk).slice(0, 30) + '» no es una columna de los abonos';
        }
        if (mala) break;
        var imp = espejoNumero_(x.c_importe);
        if (imp === null || Math.abs(imp) >= 1e7) { mala = 'el importe de un abono no es un número de menos de $10,000,000'; break; }
        var fecha = '';
        if (x.d_fecha !== null && x.d_fecha !== undefined && String(x.d_fecha).trim() !== '') {
          fecha = String(x.d_fecha).trim();
          if (!espejoFecha_(fecha)) { mala = 'la fecha de un abono tiene que venir como YYYY-MM-DD'; break; }
        }
        var pago = (x.f_pago === null || x.f_pago === undefined) ? '' : String(x.f_pago).trim();
        if (pago && !/^P-\d{3,}$/.test(pago)) { mala = 'el id de pago de un abono no tiene la forma P-###'; break; }
        var nota = String(x.e_nota == null ? '' : x.e_nota).slice(0, 2000);
        lista.push({ c: imp, d: fecha, e: nota, f: pago });
      }
    }
    if (mala) { rechazadas.push({ flujo: 'abonos', folio: etiqueta, por: mala }); continue; }
    renglones += lista.length;
    out.push({ folio: folio, abonos: lista });
  }
  return { grupos: out, rechazadas: rechazadas, formulas: formulas, renglones: renglones };
}

/** Un abono en una sola cadena, para saber si dos son el mismo: importe, fecha (solo el día), nota y
 *  pago. La hoja vieja guardaba la hora en la fecha; aquí cuenta el día. */
function espejoClaveAbono_(imp, fecha, nota, pago) {
  return [imp, fecha, nota, pago].join('\u0001');
}

/* ── El lote ─────────────────────────────────────────────────────────────────────────── */
function espejoLote_(lote) {
  var malo = function (mensaje, extra) {
    var r = { ok: false, codigo: 'DATO_INVALIDO', mensaje: mensaje };
    for (var k in (extra || {})) r[k] = extra[k];
    return r;
  };
  if (!lote || typeof lote !== 'object') return malo('Falta el lote.');
  var ventas = lote.ventas == null ? [] : lote.ventas;
  var abonos = lote.abonos == null ? [] : lote.abonos;
  if (Object.prototype.toString.call(ventas) !== '[object Array]' || Object.prototype.toString.call(abonos) !== '[object Array]') {
    return malo('Las ventas y los abonos del lote van en listas.');
  }
  if (ventas.length > ESPEJO_MAX_VENTAS) return malo('El lote trae demasiadas ventas (' + ESPEJO_MAX_VENTAS + ' como mucho).');
  var conSellos = espejoConSellos_();
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();

  /* 1. Validar TODO antes de tocar nada. Una llave de columna de fórmula tumba el lote entero: no es
        un dato malo de una venta, es un lote mal armado (o alguien probando). */
  var vv = espejoValidarVentas_(ventas, conSellos, tz);
  var va = espejoValidarAbonos_(abonos);
  if (vv.formulas.length || va.formulas.length) {
    return malo('El lote intenta escribir columnas de fórmula (H, K y O a X de Ventas, B de abonos): se rechaza completo y no se escribió nada.',
                { motivo: 'formulas' });
  }
  if (va.renglones > ESPEJO_MAX_ABONOS) return malo('El lote trae demasiados abonos (' + ESPEJO_MAX_ABONOS + ' renglones como mucho).');
  var rechazadas = vv.rechazadas.concat(va.rechazadas);
  if (rechazadas.length) {
    return malo(rechazadas.length + ' fila(s) del lote no valen: no se escribió nada.', { rechazadas: rechazadas.slice(0, 50) });
  }

  var h = ss.getSheetByName('Ventas');
  if (!h) return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'La hoja no tiene pestaña "Ventas".' };
  var a = ss.getSheetByName(ABONOS);
  var ancho = anchoDelPuente(h);
  var anchoMinimo = COL[conSellos ? 'Sellos' : 'Plazo taller'];
  if (vv.filas.length && ancho < anchoMinimo) {
    return { ok: false, codigo: 'ESQUEMA_INCOMPLETO',
             mensaje: 'La hoja todavía no tiene las columnas AE a AI de Ventas: falta correr ⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente. No se escribió nada.' };
  }
  if (va.grupos.length && (!a || a.getMaxColumns() < COL_PAGO)) {
    return { ok: false, codigo: 'ESQUEMA_INCOMPLETO',
             mensaje: 'La pestaña «' + ABONOS + '» no existe o no llega a la columna F «Pago». No se escribió nada.' };
  }

  /* 2. El candado de toda escritura sobre Ventas y los abonos. Si está ocupado, el reintento de la función
        lo vuelve a intentar. */
  var candado = LockService.getScriptLock();
  try { candado.waitLock(25000); }
  catch (e) {
    return { ok: false, codigo: 'SIN_RED', mensaje: 'La hoja está ocupada con otra escritura. Se vuelve a intentar solo.' };
  }
  try {
    /* 3. El plan, leyendo la hoja una vez. Todavía no se escribe nada. */
    var pv = vv.filas.length ? espejoPlanVentas_(h, vv.filas, ancho, tz) : null;
    var pa = va.grupos.length ? espejoPlanAbonos_(a, va.grupos, tz) : null;

    /* 4. Capacidad: si no cabe, no se escribe NADA —ni siquiera lo que sí cabía—. */
    var sinLugarV = pv ? pv.sinLugar : [], sinLugarA = pa ? pa.sinLugar : [];
    if (sinLugarV.length || sinLugarA.length) {
      return { ok: false, codigo: 'CAPACIDAD_AGOTADA', capacidad_agotada: true,
               mensaje: 'La hoja no tiene filas libres para todo el lote (Ventas llega al renglón ' + FIN + ', abonos al 2000): no se escribió nada. Subir FIN es un paso del despliegue.',
               ventas: { sin_lugar: sinLugarV.slice(0, 50), libres: pv ? pv.libres : null, fin: FIN },
               abonos: { sin_lugar: sinLugarA.slice(0, 50), libres: pa ? pa.libres : null, filas: ESPEJO_ABONOS_FILAS } };
    }

    /* 5. Escribir. */
    var celdasV = 0, celdasA = 0;
    if (pv) {
      pv.limpiar.forEach(function (fila) { limpiarFila(h, fila); });
      celdasV = espejoEscribir_(h, pv.porFila, FIN);
    }
    if (pa) celdasA = espejoEscribir_(a, pa.porFila, ESPEJO_ABONOS_FILAS + 1);
    SpreadsheetApp.flush();

    /* 6. Las marcas y la bitácora no tumban una sincronización que ya escribió. */
    var ahora = new Date();
    var anotaciones = [];
    /* Lo que había antes de lo que se pisó va en la columna «Nota» de la bitácora: si alguien editó la
       hoja a mano, ahí queda lo que había por si hace falta recuperarlo. */
    if (pv) pv.cambios.forEach(function (c) {
      anotaciones.push({ rol: 'espejo', folio: c.folio, fila: c.fila, creada: c.creada, campos: c.campos, abono: null, nota: c.antes });
    });
    if (pa) pa.cambios.forEach(function (c) {
      anotaciones.push({ rol: 'espejo', folio: c.folio, fila: c.fila, creada: false, campos: [c.texto], abono: null, nota: c.antes });
    });
    var anotada = espejoAnotar_(ss, anotaciones);
    var texto = 'ok · ' + (lote.modo === 'completo' ? 'completa' : 'al día') + (lote.id ? ' · ' + String(lote.id).slice(0, 40) : '');
    var marcada = espejoMarcar_(h, a, tz, ahora, texto);

    return {
      ok: true, ts: ahora.getTime(), lote: String(lote.id == null ? '' : lote.id).slice(0, 80),
      ventas: pv ? { recibidas: vv.filas.length, nuevas: pv.nuevas, cambiadas: pv.cambiadas, sin_cambio: pv.sinCambio,
                     celdas: celdasV, duplicadas: pv.duplicadas.slice(0, 20) } : null,
      abonos: pa ? { folios: va.grupos.length, agregados: pa.agregados, reescritos: pa.reescritos, borrados: pa.borrados,
                     sin_cambio: pa.sinCambio, celdas: celdasA } : null,
      capacidad: { fin: FIN, ventas_libres: pv ? pv.libres - pv.nuevas : null, abonos_libres: pa ? pa.libres - pa.agregados : null },
      bitacora: anotada, anotadas: anotada ? anotaciones.length : 0, marca: marcada
    };
  } catch (err) {
    /* Una caída a la mitad (la cuota de Google, un tiempo agotado) deja el lote a medias: no se esconde.
       Aplicarlo otra vez es seguro, porque lo ya escrito no cambia. */
    try { console.error('espejo: ' + (err && err.stack || err)); } catch (_) {}
    return { ok: false, codigo: 'DESCONOCIDO', parcial: true,
             mensaje: 'El espejo falló escribiendo. Vuelve a mandar el lote: aplicarlo dos veces deja la misma hoja.' };
  } finally {
    candado.releaseLock();
  }
}

/** El plan de Ventas: qué celdas cambian y en qué fila, y qué folios son altas. Lee la hoja una sola vez
 *  y NO escribe. `porFila` es { fila: { columna: { w, texto } } }. */
function espejoPlanVentas_(h, filas, ancho, tz) {
  var datos = h.getRange(2, 1, FIN - 1, ancho).getValues();
  var colA = COL_FOLIO - 1, colB = COL['Proyecto'] - 1;
  var bloques = bloquesCapturados(ancho);
  var indice = {};                                    // 'f:V-001' → las filas de la hoja con ese folio
  for (var i = 0; i < datos.length; i++) {
    var f = String(datos[i][colA]).trim().toUpperCase();
    if (!f) continue;
    if (!Object.prototype.hasOwnProperty.call(indice, 'f:' + f)) indice['f:' + f] = [];
    indice['f:' + f].push(i + 2);
  }
  var delLote = {};
  filas.forEach(function (x) { delLote['f:' + x.folio] = true; });

  /* Una fila libre es una sin proyecto, prefiriendo la que de verdad está vacía (como primeraFilaLibre).
     Una que tiene el folio de este lote no es libre: el folio la encuentra y la pone al día. */
  var vacias = [], restos = [];
  for (var j = 0; j < datos.length; j++) {
    if (String(datos[j][colB]).trim() !== '') continue;
    var fj = String(datos[j][colA]).trim().toUpperCase();
    if (fj && delLote['f:' + fj]) continue;
    (filaSinNada(datos[j], bloques) ? vacias : restos).push(j + 2);
  }
  var libres = vacias.concat(restos);
  var disponibles = libres.slice();

  var plan = { porFila: {}, cambios: [], limpiar: [], sinLugar: [], nuevas: 0, cambiadas: 0, sinCambio: 0,
               duplicadas: [], libres: libres.length };
  /* Las altas van en orden de folio, para que la hoja se llene igual cada vez. */
  var ordenadas = filas.slice().sort(function (x, y) { return numeroDeFolio(x.folio) - numeroDeFolio(y.folio); });
  ordenadas.forEach(function (fila) {
    var hallada = indice['f:' + fila.folio];
    var cols = Object.keys(fila.vals).map(Number).sort(function (x, y) { return x - y; });
    var celdas = {}, campos = [], antes = [];
    if (hallada) {
      if (hallada.length > 1) plan.duplicadas.push(fila.folio);
      var r = hallada[0];
      cols.forEach(function (c) {
        var n = fila.vals[c];
        var hay = espejoActual_(n.tipo, datos[r - 2][c - 1], tz);
        if (hay === n.v) return;
        celdas[c] = { w: n.w, texto: n.texto };
        campos.push(nombreDeColumna(c).trim());
        if (hay !== '') antes.push(nombreDeColumna(c).trim() + '=' + String(hay).slice(0, 40));
      });
      if (campos.length) {
        plan.porFila[r] = celdas;
        plan.cambiadas++;
        plan.cambios.push({ folio: fila.folio, fila: r, creada: false, campos: campos, antes: espejoAntes_(antes) });
      } else plan.sinCambio++;
      return;
    }
    if (!disponibles.length) { plan.sinLugar.push(fila.folio); return; }
    var destino = disponibles.shift();
    if (restos.indexOf(destino) !== -1) plan.limpiar.push(destino);
    cols.forEach(function (c) {
      var n = fila.vals[c];
      if (n.v === '' && c !== COL_FOLIO) return;          // una fila nueva ya está en blanco: no se escribe nada
      celdas[c] = { w: n.w, texto: n.texto };
      campos.push(c === COL_FOLIO ? 'Folio' : nombreDeColumna(c).trim());
    });
    plan.porFila[destino] = celdas;
    plan.nuevas++;
    plan.cambios.push({ folio: fila.folio, fila: destino, creada: true, campos: campos, antes: '' });
  });
  return plan;
}

/** Lo que había antes de lo que el espejo pisó, como texto para la columna «Nota» de la bitácora (acotado). */
function espejoAntes_(partes) {
  return partes.length ? ('antes: ' + partes.join(' · ')).slice(0, 300) : '';
}

/** El plan de «Abonos comisión»: el conjunto de abonos de cada folio contra los renglones que ya tiene.
 *  Los que ya están no se tocan; un renglón que ya no corresponde a ningún abono se reescribe con uno que
 *  falta; lo que sobra se deja en blanco y lo que falta va a la primera fila libre. */
function espejoPlanAbonos_(a, grupos, tz) {
  var datos = a.getRange(2, 1, ESPEJO_ABONOS_FILAS, COL_PAGO).getValues();
  var indice = {}, libres = [];
  for (var i = 0; i < datos.length; i++) {
    if (espejoRenglonVacio_(datos[i])) { libres.push(i + 2); continue; }
    var f = String(datos[i][0]).trim().toUpperCase();
    if (!f) continue;                                  // con datos y sin folio: de nadie, no se toca
    if (!Object.prototype.hasOwnProperty.call(indice, 'f:' + f)) indice['f:' + f] = [];
    indice['f:' + f].push(i + 2);
  }
  var plan = { porFila: {}, cambios: [], sinLugar: [], agregados: 0, reescritos: 0, borrados: 0, sinCambio: 0,
               libres: libres.length };
  var actual = function (fila) {
    var r = datos[fila - 2];
    var imp = typeof r[2] === 'number' ? r[2] : (r[2] === '' || r[2] == null ? '' : String(r[2]).trim());
    var fecha = esFecha(r[3]) ? Utilities.formatDate(r[3], tz, 'yyyy-MM-dd') : String(r[3] == null ? '' : r[3]).trim();
    return { c: imp, d: fecha, e: String(r[4] == null ? '' : r[4]), f: String(r[5] == null ? '' : r[5]).trim() };
  };
  var ordenados = grupos.slice().sort(function (x, y) { return numeroDeFolio(x.folio) - numeroDeFolio(y.folio); });
  ordenados.forEach(function (g) {
    var filas = indice['f:' + g.folio] || [];
    var pendientes = {};                               // clave → filas de la hoja con ese abono, todavía sin pareja
    filas.forEach(function (fila) {
      var x = actual(fila);
      var k = espejoClaveAbono_(x.c, x.d, x.e, x.f);
      if (!Object.prototype.hasOwnProperty.call(pendientes, k)) pendientes[k] = [];
      pendientes[k].push(fila);
    });
    var faltan = [];                                   // los abonos de la base que la hoja todavía no tiene
    g.abonos.forEach(function (x) {
      var k = espejoClaveAbono_(x.c, x.d, x.e, x.f);
      if (Object.prototype.hasOwnProperty.call(pendientes, k) && pendientes[k].length) pendientes[k].shift();
      else faltan.push(x);
    });
    var sobran = [];                                   // renglones de la hoja que no son de ningún abono de la base
    Object.keys(pendientes).forEach(function (k) { pendientes[k].forEach(function (fila) { sobran.push(fila); }); });
    sobran.sort(function (x, y) { return x - y; });

    var agregados = 0, reescritos = 0, borrados = 0, primera = 0, antes = [];
    var comoEra = function (fila, que) {
      var y = actual(fila);
      return 'fila ' + fila + que + [y.c, y.d, y.e, y.f].join(' | ');
    };
    var celdaDe = function (x) {
      return {
        3: { w: x.c, texto: false },
        4: { w: x.d ? espejoDia_(x.d, tz) : '', texto: false },
        5: { w: espejoProtegido_(x.e), texto: false },
        6: { w: x.f, texto: false }
      };
    };
    /* Un renglón que sobra se reescribe con un abono que falta: así una edición a mano se corrige en su lugar. */
    while (faltan.length && sobran.length) {
      var x1 = faltan.shift(), fila1 = sobran.shift(), ya = actual(fila1), c1 = celdaDe(x1), cambio = {};
      if (ya.c !== x1.c) cambio[3] = c1[3];
      if (ya.d !== x1.d) cambio[4] = c1[4];
      if (ya.e !== x1.e) cambio[5] = c1[5];
      if (ya.f !== x1.f) cambio[6] = c1[6];
      plan.porFila[fila1] = cambio;
      antes.push(comoEra(fila1, ' era '));
      if (!primera) primera = fila1;
      reescritos++;
    }
    /* Lo que sigue faltando va a filas libres; si no alcanzan, el lote entero espera. */
    if (faltan.length > libres.length - (plan.agregados + agregados)) {
      plan.sinLugar.push(g.folio);
      return;
    }
    faltan.forEach(function (x2) {
      var fila2 = libres[plan.agregados + agregados];
      var c2 = celdaDe(x2);
      c2[1] = { w: g.folio, texto: false };
      plan.porFila[fila2] = c2;
      if (!primera) primera = fila2;
      agregados++;
    });
    sobran.forEach(function (fila3) {
      plan.porFila[fila3] = { 1: { w: '', texto: false }, 3: { w: '', texto: false }, 4: { w: '', texto: false },
                              5: { w: '', texto: false }, 6: { w: '', texto: false } };
      antes.push(comoEra(fila3, ' se vació: '));
      if (!primera) primera = fila3;
      borrados++;
    });
    plan.agregados += agregados; plan.reescritos += reescritos; plan.borrados += borrados;
    if (agregados + reescritos + borrados) {
      plan.cambios.push({ folio: g.folio, fila: primera,
                          texto: 'Abonos comisión: +' + agregados + ' ~' + reescritos + ' -' + borrados,
                          antes: antes.length ? ('antes: ' + antes.join(' ; ')).slice(0, 300) : '' });
    } else plan.sinCambio++;
  });
  return plan;
}

/** Escribe un plan: `porFila` es { fila: { columna: { w, texto } } }. Lo que va como texto lleva su '@'
 *  ANTES del valor, como unaOperacion (con el formato puesto después, Sheets ya volvió hora el «10:00»).
 *  Las celdas seguidas de una misma fila van en un solo setValues. Devuelve cuántas celdas escribió. */
function espejoEscribir_(h, porFila, ultimaFila) {
  var filas = Object.keys(porFila).map(Number).sort(function (x, y) { return x - y; });
  var enTexto = {};
  filas.forEach(function (f) {
    for (var c in porFila[f]) if (porFila[f][c].texto) enTexto[c] = true;
  });
  Object.keys(enTexto).forEach(function (c) { h.getRange(2, Number(c), ultimaFila - 1, 1).setNumberFormat('@'); });
  var escritas = 0;
  filas.forEach(function (f) {
    var cols = Object.keys(porFila[f]).map(Number).sort(function (x, y) { return x - y; });
    var i = 0;
    while (i < cols.length) {
      var j = i;
      while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
      if (j === i) h.getRange(f, cols[i]).setValue(porFila[f][cols[i]].w);
      else {
        var valores = [];
        for (var k = i; k <= j; k++) valores.push(porFila[f][cols[k]].w);
        h.getRange(f, cols[i], 1, valores.length).setValues([valores]);
      }
      escritas += j - i + 1;
      i = j + 1;
    }
  });
  return escritas;
}

/* La columna que sigue a la última del puente (AJ): ahí vive la fecha de la última sincronización. Queda
   fuera de A:AI —del filtro, del reacomodo y de /jalar— y no es dato de nadie. */
function espejoColMarca_() { return ULTIMA_COL + 1; }

var ESPEJO_TITULO_MARCA = 'Espejo · última sincronización';

/** La nota «esto es un espejo» y la fecha y hora de la última sincronización. Sin crear pestañas. Si no se
 *  puede escribir, la sincronización ya hecha no se deshace: devuelve false. */
function espejoMarcar_(h, a, tz, ahora, estado) {
  try {
    var cuando = Utilities.formatDate(ahora, tz, 'yyyy-MM-dd') + ' ' + Utilities.formatDate(ahora, tz, 'HH:mm:ss');
    var nota = 'ESTA HOJA ES UN ESPEJO DE SOLO LECTURA de la base de datos de AL3D. Se llena sola.\n' +
               'Las ediciones manuales se pisan con el siguiente cambio de la base: no captures nada aquí, las ediciones se hacen en la plataforma.\n' +
               'Las columnas de cálculo (H, K y O a X) siguen siendo fórmulas de la hoja.\n' +
               'Última sincronización: ' + cuando + '.';
    h.getRange(1, 1).setNote(nota);
    if (a) a.getRange(1, 1).setNote(nota);
    var col = espejoColMarca_();
    if (h.getMaxColumns() < col) h.insertColumnsAfter(h.getMaxColumns(), col - h.getMaxColumns());
    var t = h.getRange(1, col);
    if (String(t.getValue()) !== ESPEJO_TITULO_MARCA) {
      t.setValue(ESPEJO_TITULO_MARCA).setBackground(AZUL).setFontColor('#ffffff').setFontWeight('bold')
       .setFontSize(10).setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
      h.setColumnWidth(col, 170);
    }
    h.getRange(2, col).setValue(ahora).setNumberFormat('dd/mm/yyyy HH:mm:ss').setHorizontalAlignment('center');
    h.getRange(3, col).setValue(estado).setFontColor('#6b7684').setFontStyle('italic').setHorizontalAlignment('center');
    return true;
  } catch (e) { return false; }
}

/** Anota en la «Bitácora del puente» —la de siempre, con rol «espejo»— si existe. Aquí no se crea ninguna
 *  pestaña: sin bitácora, no se anota. */
function espejoAnotar_(ss, anotaciones) {
  if (!anotaciones.length || !ss.getSheetByName(BITACORA)) return false;
  anotar_(anotaciones);
  return true;
}
