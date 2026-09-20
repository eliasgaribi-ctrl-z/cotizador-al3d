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

  respaldar(ss, ventas);
  var historicos = leerAbonosViejos(ventas);
  fijarFolios(ventas);
  agregarColumnas(ventas);
  crearAbonos(ss, historicos);
  formulasVentas(ventas);
  clasificarTipos(ventas);
  normalizarIvaActivos(ventas);   // la cuenta manda el IVA: realinea lo que sigue abierto
  ordenarVentas(ventas);
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
  var max = 0;
  for (var i = 0; i < n; i++) max = Math.max(max, numeroDeFolio(fol[i][0]));
  var out = [];
  for (var j = 0; j < n; j++) {
    if (String(proy[j][0]).trim() === '') { out.push(['']); continue; }
    if (numeroDeFolio(fol[j][0]) > 0) { out.push([fol[j][0]]); continue; }
    max++;
    out.push(['V-' + ('000' + max).slice(-3)]);
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
    X: '=ARRAYFORMULA(IF(' + L('B') + '="","",' +
       'IF((' + L('D') + '<>"")*(' + L('F') + '<>IF(' + L('D') + '="' + CUENTA_SIN_FACTURA + '","No","Sí")),"IVA no corresponde a la cuenta",' +
       'IF(' + L('K') + '<-0.004,"Cobrado de más",' +
       'IF(' + L('T') + '<-0.004,"Comisión pagada de más",' +
       'IF((' + L('C') + '="LIQUIDADO")*(' + L('K') + '>0.004),"Liquidado con saldo",' +
       'IF((' + L('C') + '="LIQUIDADO")*(' + L('N') + '=""),"Falta fecha de liquidación","")))))))'
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

  var f = h.getFilter(); if (f) f.remove();
  h.getRange(1, 1, FIN, ult).createFilter();

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
 * Solo se mueven las columnas que se capturan (A:G, I:J, L:N). Las columnas
 * calculadas son ARRAYFORMULA que vive en la fila 2: no se tocan nunca.
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

function numeroDeFolio(v) {
  var s = String(v).trim();
  if (s.substring(0, 2).toUpperCase() !== 'V-') return -1;
  var n = Number(s.substring(2));
  return isNaN(n) ? -1 : n;
}

function filaPorFolio(h, folio) {
  var folios = h.getRange(2, 1, FIN - 1, 1).getValues();
  for (var i = 0; i < folios.length; i++) {
    if (String(folios[i][0]).trim() === String(folio).trim()) return i + 2;
  }
  return 0;
}

/** Reacomoda Ventas. Es idempotente: correrla dos veces no cambia nada. */
function ordenarVentas(h) {
  h = h || SpreadsheetApp.getActive().getSheetByName('Ventas');
  if (!h) return;
  var n = FIN - 1;
  var datos = h.getRange(2, 1, n, 14).getValues();

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

  var orden = llenas.concat(vacias), ag = [], ij = [], lmn = [];
  for (var j = 0; j < orden.length; j++) {
    var r = orden[j];
    ag.push([r[0], r[1], r[2], r[3], r[4], r[5], r[6]]);
    ij.push([r[8], r[9]]);
    lmn.push([r[11], r[12], r[13]]);
  }
  h.getRange(2, 1, n, 7).setValues(ag);
  h.getRange(2, 9, n, 2).setValues(ij);
  h.getRange(2, 12, n, 3).setValues(lmn);
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
  try {
    var h = e.range.getSheet();
    if (h.getName() !== 'Ventas') return;

    var col = e.range.getColumn();
    var colFin = col + e.range.getNumColumns() - 1;
    var ini = Math.max(e.range.getRow(), 2);
    var fin = e.range.getRow() + e.range.getNumRows() - 1;
    if (fin < 2) return;

    /* 1) folio nuevo cuando se escribe el proyecto (columna B) */
    if (col <= 2 && colFin >= 2) {
      var folios = h.getRange(2, 1, FIN - 1, 1).getValues();
      var max = 0;
      for (var k = 0; k < folios.length; k++) {
        max = Math.max(max, numeroDeFolio(folios[k][0]));
      }
      for (var f = ini; f <= fin; f++) {
        var proy = h.getRange(f, 2).getValue();
        var fol = h.getRange(f, 1).getValue();
        if (proy !== '' && fol === '') {
          max++;
          h.getRange(f, 1).setValue('V-' + ('000' + max).slice(-3));
        }
      }
    }

    /* 2) IVA segun la cuenta (columna D) */
    if (col <= 4 && colFin >= 4) {
      for (var g = ini; g <= fin; g++) aplicarIva(h, g);
    }

    /* 3) arriba lo que esta en fabricacion (columna C) */
    if (col <= 3 && colFin >= 3) {
      SpreadsheetApp.flush();
      ordenarVentas(h);
    }
  } catch (err) { /* nunca bloquear la captura */ }
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

function tablaHtml(cabs, filas) {
  if (!filas.length) return '<p style="color:#6b7684">Nada pendiente.</p>';
  var s = '<table style="border-collapse:collapse;font-size:13px"><tr>';
  cabs.forEach(function (c) {
    s += '<th style="background:#1c3d6e;color:#fff;padding:7px 12px;text-align:left">' + c + '</th>';
  });
  s += '</tr>';
  filas.forEach(function (f, i) {
    s += '<tr style="background:' + (i % 2 ? '#f7f9fc' : '#ffffff') + '">';
    f.forEach(function (c) {
      s += '<td style="padding:6px 12px;border-bottom:1px solid #e4e9f0">' + c + '</td>';
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
      .addItem('📬  Mandarme el resumen ahora', 'enviarResumen')
      .addItem('🔄  Actualizar formato y vistas', 'mejorarTodo')
      .addItem('📅  Rehacer vista de comisiones por periodo', 'construirComisionesPorPeriodo')
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
    '</style>';
  return HtmlService.createHtmlOutput(css + cuerpo).setWidth(430).setHeight(alto || 560);
}

function opciones(arr, sel) {
  return arr.map(function (o) {
    return '<option' + (o === sel ? ' selected' : '') + '>' + o + '</option>';
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

function siguienteFolio(h) {
  var folios = h.getRange(2, 1, FIN - 1, 1).getValues();
  var max = 0;
  folios.forEach(function (r) {
    var m = String(r[0]).match(/^V-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'V-' + ('000' + (max + 1)).slice(-3);
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
    '<div class="pie"><button onclick="enviar()">Registrar</button>' +
    '<button class="gris" onclick="google.script.host.close()">Cancelar</button></div>' +
    '<div id="msg" class="aviso"></div>' +
    '<script>' +
    'function enviar(){' +
    ' var d={proyecto:proyecto.value.trim(),cuenta:cuenta.value,estatus:estatus.value,' +
    ' tipo:tipo.value,iva:iva.value,subtotal:subtotal.value,anticipo:anticipo.value,' +
    ' fecha:fecha.value,instalacion:instalacion.value};' +
    ' if(!d.proyecto){aviso("Falta el nombre del proyecto.",false);return;}' +
    ' if(!d.subtotal){aviso("Falta el subtotal.",false);return;}' +
    ' document.querySelector("button").disabled=true;' +
    ' google.script.run.withSuccessHandler(function(r){' +
    '   aviso("Listo: "+r.folio+" registrado en la fila "+r.fila+".",true);' +
    '   setTimeout(google.script.host.close,1400);})' +
    '  .withFailureHandler(function(e){aviso(e.message,false);' +
    '   document.querySelector("button").disabled=false;})' +
    '  .guardarVenta(d);}' +
    'function aviso(t,ok){var m=document.getElementById("msg");' +
    ' m.textContent=t;m.className="aviso "+(ok?"ok":"mal");}' +
    '</script>';
  SpreadsheetApp.getUi().showModalDialog(marco(c, 580), 'Nueva venta');
}

function guardarVenta(d) {
  var h = hojaVentas();
  var n = FIN - 1;
  var proy = h.getRange(2, 2, n, 1).getValues();
  var fila = 0;
  for (var i = 0; i < n; i++) { if (proy[i][0] === '') { fila = i + 2; break; } }
  if (!fila) throw new Error('Ya no hay filas libres antes de la ' + FIN +
      '. Amplía los rangos de las fórmulas.');

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

  SpreadsheetApp.getActive().setActiveSheet(h);
  aplicarIva(h, fila);
  SpreadsheetApp.flush();
  ordenarVentas(h);
  fila = filaPorFolio(h, folio) || fila;

  h.setActiveRange(h.getRange(fila, 2));
  return { folio: folio, fila: fila };
}

/* ================== 2. COBRO / LIQUIDACIÓN ================== */
function listaSaldos() {
  var d = hojaVentas().getRange(2, 1, FIN - 1, 24).getValues();
  var out = [];
  d.forEach(function (r) {
    var saldo = Number(r[10]) || 0;
    if (r[1] && saldo > 0.004) {
      out.push({ folio: r[0], nombre: r[1], saldo: saldo, estatus: r[3] });
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
    return '<option value="' + p.folio + '" data-saldo="' + p.saldo + '">' +
           p.folio + ' · ' + p.nombre + ' — ' + pesos(p.saldo) + '</option>';
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
  if (d.liquidar) h.getRange(fila, 4).setValue('LIQUIDADO');
  SpreadsheetApp.flush();

  var resta = Number(h.getRange(fila, 11).getValue()) || 0;
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
    return '<option value="' + p.folio + '" data-p="' + p.pend + '">' +
           p.folio + ' · ' + p.nombre + ' — ' + pesos(p.pend) + '</option>';
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
  var ss = SpreadsheetApp.getActive();
  var h = ss.getSheetByName(ABONOS);
  if (!h) throw new Error('No encuentro la pestaña "' + ABONOS + '".');
  var col = h.getRange(2, 1, 1999, 1).getValues();
  var fila = 0;
  for (var i = 0; i < col.length; i++) { if (col[i][0] === '') { fila = i + 2; break; } }
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
  if (!crudo) { configurarTokensDelPuente(); crudo = props.getProperty('PUENTE_TOKENS'); }
  var mapa = JSON.parse(crudo);
  var porRol = {};
  Object.keys(mapa).forEach(function (t) { porRol[mapa[t]] = t; });

  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }

  var filas = ['direccion', 'fabricacion', 'pagos'].map(function (rol) {
    return '<label>' + rol.charAt(0).toUpperCase() + rol.slice(1) + '</label>' +
           '<input readonly value="' + (porRol[rol] || '') + '" onclick="this.select()">';
  }).join('');

  var c =
    '<h2>El puente</h2>' +
    '<p class="sub">Pega la liga y el token que le toque en cada teléfono, ' +
    'en Ajustes &rsaquo; El puente.</p>' +
    '<label>Liga del puente</label>' +
    '<input readonly value="' + url + '" onclick="this.select()">' +
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
    '  .configurarTokensDelPuente(); }' +
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
   dispositivo. La lista de quién es quién vive en la pestaña «Accesos» de esta hoja. */
var PUENTE_VERSION = 'puente-sheets-5';
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
  /* Aplicación web · origen https://eliasgaribi-ctrl-z.github.io */
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
  'Porcentaje comision':          30    // AD
};

var COL_FOLIO = 1;                      // A — el id interno (V-001)
var ULTIMA_COL = 30;

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
              'Ubicacion', 'Direccion', 'Tipo de trabajo', 'Porcentaje comision'],
  fabricacion: ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion'],
  pagos: ['Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ', 'Fecha Liquidacion',
          'Porcentaje comision']
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
    if (crudo.length > 65536) {
      return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
    }
    try { cuerpo = JSON.parse(crudo); }
    catch (err) { return responder({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo no es JSON.' }); }

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

    var ruta = String((e && e.pathInfo) || (cuerpo && cuerpo.ruta) || '')
                 .replace(/^\/+|\/+$/g, '') || 'salud';

    if (ruta === 'salud')    return responder(rutaSalud(rol, ingreso ? 'google' : 'token', ingreso ? ingreso.correo : ''));
    if (ruta === 'esquema')  return responder(rutaEsquema());
    if (ruta === 'jalar')    return responder(rutaJalar(cuerpo, rol));
    if (ruta === 'empujar')  return responder(rutaEmpujar(cuerpo, rol));
    if (ruta === 'expandir') return responder(rutaExpandir(cuerpo));

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
   Se siembran con  configurarTokensDelPuente(). */
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
  try {
    var r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(tok),
      { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var j = JSON.parse(r.getContentText());
      if (PUENTE_CLIENT_IDS.indexOf(String(j.aud)) !== -1 && String(j.email_verified) === 'true') {
        correo = String(j.email || '').trim().toLowerCase();
      }
    }
  } catch (e) {
    /* Sin red del lado de la hoja no se puede verificar, y un token que no se pudo verificar
       NO entra: fallar abierto aquí sería dejar la puerta sin llave cuando falla la llave. */
    return null;
  }
  if (!correo) { cache.put(clave, '-', 60); return null; }

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

function dentroDelLimite(token) {
  try {
    var cache = CacheService.getScriptCache();
    /* La clave es el resumen del token, no el token: así no queda escrito en la
       caché de Google tal cual. */
    var clave = 'p_' + Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 24);
    var n = Number(cache.get(clave) || 0) + 1;
    cache.put(clave, String(n), 60);
    return n <= LIMITE_POR_MINUTO;
  } catch (e) {
    return true;   // si la caché falla, no se deja fuera a los teléfonos
  }
}

/** Genera un token por rol y los guarda. Córrela una vez y pega cada uno en su teléfono. */
function configurarTokensDelPuente() {
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
function rutaSalud(rol, via, correo) {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  if (!h) return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'La hoja no tiene pestaña "Ventas".' };
  return { ok: true, ts: Date.now(), version: PUENTE_VERSION, rol: rol,
           escribibles: PUENTE_ROLES[rol], destino: 'google-sheets',
           /* Para que Ajustes pueda decir «entraste como fulano@…» y no solo «Dirección»:
              con dos puertas, saber por cuál entraste es la mitad de poder arreglarlo. */
           via: via || 'token', correo: correo || '' };
}

/* ---------------------------------------------------------------- /esquema */
function rutaEsquema() {
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
    { nombre: 'Porcentaje comision', tipo: 'número', para: 'el % que capturó el cotizador; la comisión de la hoja sigue siendo 10 % fijo' }
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
      : 'La hoja ya tiene las ocho columnas que la plataforma necesita.' };
}

/* ------------------------------------------------------------------ /jalar */
function rutaJalar(cuerpo, rol) {
  var h = SpreadsheetApp.getActive().getSheetByName('Ventas');
  var desde = Number((cuerpo && cuerpo.cursor) || 2);
  if (!isFinite(desde) || desde < 2) desde = 2;
  var tam = 50;
  var hasta = Math.min(desde + tam - 1, FIN);
  var datos = h.getRange(desde, 1, hasta - desde + 1, ULTIMA_COL).getValues();
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

  return {
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
    'Hora instalacion':              String(v('Hora instalacion') || ''),
    'Ubicacion':                     String(v('Ubicacion') || ''),
    'Direccion':                     String(v('Direccion') || '')
  };
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

/* ---------------------------------------------------------------- /empujar */
function rutaEmpujar(cuerpo, rol) {
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
    for (var i = 0; i < ops.length; i++) resultados.push(unaOperacion(h, ops[i], rol, anotaciones));
    SpreadsheetApp.flush();
    anotar(anotaciones);
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
  if (!armado.celdas.length && !armado.abono) {
    return { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
             mensaje: armado.rechazadas.length
               ? 'Este teléfono no puede escribir: ' + armado.rechazadas.map(function (x) { return x.nombre; }).join(', ')
               : 'No había nada que escribir.',
             rechazadas: armado.rechazadas };
  }

  /* Antes de crear, se busca. Igual que el Worker: un reintento después de una
     respuesta perdida no puede costar una venta duplicada. */
  var fila = 0;
  if (op.id_notion) fila = filaPorFolioInterno(h, String(op.id_notion));
  if (!fila) {
    var fc = String((op.datos && op.datos['Folio cotizacion']) || '').trim();
    if (fc) fila = filaPorFolioCotizacion(h, fc);
  }
  var creada = false;
  if (!fila) {
    fila = primeraFilaLibre(h);
    if (!fila) {
      return { id: op.id, ok: false, codigo: 'DESCONOCIDO',
               mensaje: 'Ya no hay filas libres antes de la ' + FIN + ' en la hoja.' };
    }
    h.getRange(fila, COL_FOLIO).setValue(siguienteFolio(h));
    creada = true;
  }

  armado.celdas.forEach(function (c) { h.getRange(fila, c.col).setValue(c.valor); });
  if (armado.abono) registrarAbonoDesdePuente(h, fila, armado.abono);
  SpreadsheetApp.flush();

  var folio = h.getRange(fila, COL_FOLIO).getValue();
  anotaciones.push({ rol: rol, folio: folio, fila: fila, creada: creada,
                     campos: armado.celdas.map(function (c) { return nombreDeColumna(c.col); }),
                     abono: armado.abono });

  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  var datos = aplanarFila(h.getRange(fila, 1, 1, ULTIMA_COL).getValues()[0], tz);
  return { id: op.id, ok: true, creada: creada, remoto: datos,
           rechazadas: armado.rechazadas };
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
      var m = Number(valor);
      if (!isFinite(m) || m === 0) { rechazadas.push({ nombre: nombre, por: 'no es un importe válido' }); continue; }
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

function registrarAbonoDesdePuente(h, fila, importe) {
  var ss = SpreadsheetApp.getActive();
  var a = ss.getSheetByName(ABONOS);
  if (!a) return;
  var folio = h.getRange(fila, COL_FOLIO).getValue();
  var col = a.getRange(2, 1, 1999, 1).getValues();
  var libre = 0;
  for (var i = 0; i < col.length; i++) { if (col[i][0] === '') { libre = i + 2; break; } }
  if (!libre) return;
  a.getRange(libre, 1).setValue(folio);
  a.getRange(libre, 3).setValue(importe);
  a.getRange(libre, 4).setValue(new Date());
  a.getRange(libre, 5).setValue('Registrado desde la plataforma');
}

function filaPorFolioInterno(h, folio) {
  var col = h.getRange(2, COL_FOLIO, FIN - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === folio) return i + 2;
  return 0;
}
function filaPorFolioCotizacion(h, fc) {
  var col = h.getRange(2, COL['Folio cotizacion'], FIN - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]).trim() === fc) return i + 2;
  return 0;
}
function primeraFilaLibre(h) {
  var col = h.getRange(2, 2, FIN - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (col[i][0] === '') return i + 2;
  return 0;
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
function rutaExpandir(cuerpo) {
  var u = String((cuerpo && cuerpo.u) || '').trim();
  var m = /^https?:\/\/([^\/:?#]+)/i.exec(u);
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

/* --------------------------------------------------------------- bitácora */
/**
 * Toda escritura que entra por el puente queda anotada: cuándo, qué rol, qué
 * folio y qué campos. Es lo que convierte «algo se movió» en «esto se movió, el
 * martes, desde el teléfono de pagos».
 *
 * Es una pestaña oculta y nadie más que tú entra a la hoja, así que no hace
 * falta más protección que esa.
 */
function anotar(anotaciones) {
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
              a.creada ? 'fila nueva' : ''];
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
    ['Porcentaje comision', 90]
  ];
  var cab = h.getRange(1, 1, 1, h.getMaxColumns()).getValues()[0]
      .map(function (x) { return String(x).trim(); });

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

  h.getRange(2, 27, FIN - 1, 1).setHorizontalAlignment('center');
  crearHojaAccesos(ss);
  protegerColumnasCalculadas(h);
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

function guardarReparto(d) {
  var monto = Number(d.monto);
  if (!(monto > 0)) throw new Error('Escribe un importe mayor a cero.');

  var calc = calcularReparto(monto);
  if (!calc.reparto.length) throw new Error('No hay comisiones pendientes que abonar.');

  var h = prepararColumnaPago();

  var col = h.getRange(2, 1, 1999, 1).getValues();
  var fila = 0;
  for (var i = 0; i < col.length; i++) { if (col[i][0] === '') { fila = i + 2; break; } }
  if (!fila) throw new Error('Ya no hay renglones libres en la pestaña de abonos.');
  if (fila + calc.reparto.length - 1 > 2000) throw new Error('No caben todos los renglones del reparto.');

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
    'function pinta(r){' +
    'var p=document.getElementById("prev");' +
    'if(!r.filas.length){p.innerHTML="";return;}' +
    'var h="<div class=caja><table class=tb><tr><th>Folio</th><th>Proyecto</th><th>Pendiente</th><th>Abono</th><th>Queda</th></tr>";' +
    'r.filas.forEach(function(f){h+="<tr><td>"+f[0]+"</td><td>"+f[1]+"</td><td>"+f[2]+"</td><td>"+f[3]+"</td><td>"+f[4]+"</td></tr>";});' +
    'h+="</table></div>";' +
    'if(r.sobrante>0.004){h+="<div class=dato>Sobran "+r.sobranteTxt+": ya no hay más comisiones pendientes que cubrir.</div>";}' +
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
