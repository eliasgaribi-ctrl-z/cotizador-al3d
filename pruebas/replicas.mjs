/* LAS RÉPLICAS ENTRE EL COTIZADOR Y LA PLATAFORMA, COMPARADAS.

   El cotizador son once guiones clásicos que comparten el ámbito global y no exportan nada;
   la plataforma son módulos ES. Lo que las dos necesitan saber —cómo se describe una
   partida, qué campos mueven el precio, cómo se agrupan los clientes, con qué alfabeto se
   nombra un aparato, con qué sal se guardan las llaves— está escrito DOS veces por
   necesidad. Una duplicación que nadie compara es la que se separa sin que nadie lo note, y
   se descubre cuando la orden de trabajo describe otra cosa que el historial, o cuando el
   aviso «la cotización cambió después de venderse» suena en todos los proyectos a la vez.

   Aquí se lee el cotizador como TEXTO, se evalúa cada función replicada en un contexto
   aparte con lo mínimo que necesita, y se compara su salida con la del módulo de la
   plataforma sobre los mismos datos. Es el mismo truco que pruebas/respaldo.mjs y
   pruebas/taller.mjs ya usan para las dos listas que sí se comparaban.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);

const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');
const COT = {
  nucleo: leer('js/cotizador/nucleo.js'), historial: leer('js/cotizador/historial.js'),
  entrega: leer('js/cotizador/entrega.js'), venta: leer('js/cotizador/venta.js'),
  ia: leer('js/cotizador/ia.js'), catalogo: leer('js/cotizador/catalogo.js'),
};
const HTML = leer('cotizador.html');

/* ----- Sacar una función o una constante del texto -----
   `fuente` devuelve `function nombre(...){...}` completo, contando llaves y saltándose
   cadenas, plantillas y comentarios: los guiones traen llaves dentro de textos. */
function fuente(texto, nombre) {
  const ini = texto.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no está function ' + nombre);
  let i = texto.indexOf('{', ini), prof = 0;
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return texto.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}
/* `constante` devuelve el valor de `const NOMBRE=...;`: un objeto o arreglo —contando sus
   llaves aunque ocupe varias líneas— o un escalar escrito en una línea. */
function constante(texto, nombre) {
  const m = new RegExp('const ' + nombre + '\\s*=\\s*').exec(texto);
  if (!m) throw new Error('no está const ' + nombre);
  const ini = m.index + m[0].length;
  const abre = texto[ini];
  if (abre === '{' || abre === '[') {
    const cierra = abre === '{' ? '}' : ']';
    let prof = 0;
    for (let i = ini; i < texto.length; i++) {
      const c = texto[i];
      if (c === '\'' || c === '"' || c === '`') {
        for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
        continue;
      }
      if (c === abre) prof++;
      if (c === cierra && --prof === 0) return Function('"use strict";return (' + texto.slice(ini, i + 1) + ')')();
    }
    throw new Error('const ' + nombre + ' no cierra');
  }
  const linea = /^([^\n]*?);(?:\s|\/\/|$)/.exec(texto.slice(ini));
  if (!linea) throw new Error('const ' + nombre + ' no termina en la línea');
  return Function('"use strict";return (' + linea[1] + ')')();
}
/* Evalúa un trozo de cotizador con lo que le haga falta alrededor. */
function evaluar(codigo, entorno) {
  const ctx = vm.createContext({ ...entorno, console });
  vm.runInContext(codigo, ctx);
  return ctx;
}

const Cot = await import('../js/datos/cotizador.js');
const Proy = await import('../js/datos/proyectos.js');
const Puente = await import('../js/datos/puente.js');
const Prefs = await import('../js/datos/prefs.js');
const Cat = await import('../js/datos/catalogo-precios.js');
const Asis = await import('../js/datos/asistente-contexto.js');
const UI = await import('../js/nucleo/ui.js');

/* ============================================================================ */
console.log('\nLA HUELLA DEL TRABAJO — la misma lista de campos, el mismo texto');
{
  const campos = constante(COT.nucleo, '_CAMPOS_PRECIO');
  eq('los campos que mueven el precio son los mismos, en el mismo orden', campos, Cot.CAMPOS_PRECIO);

  const items = [
    { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8 },
    { id: 2, tipo: 'recorte', acab: 'sandwich', recComp: true, altura: 30, n: 3 },
    { id: 3, tipo: 'bastidor', bas: 'lamina', ancho: 120, alto: 80 },
    { id: 4, tipo: 'caja', tarifa: 3900, ancho: 60, alto: 40 },
    { id: 5, tipo: 'manual', pz: 2, pu: 500 },
  ];
  for (const iva of [true, false]) {
    const ctx = evaluar('const _CAMPOS_PRECIO=' + JSON.stringify(campos) + ';\n' + fuente(COT.nucleo, 'huellaTrabajo'),
                        { Q: { iva, items } });
    eq('huellaTrabajo() y huellaDe() escriben el mismo texto (iva ' + (iva ? 'con' : 'sin') + ')',
       ctx.huellaTrabajo(), Cot.huellaDe({ iva, items }));
  }
}

/* ============================================================================ */
console.log('\nCÓMO SE DESCRIBE UNA PARTIDA — el historial y la orden de trabajo dicen lo mismo');
{
  const ctx = evaluar(
    ['HIST_MAT', 'HIST_ACAB', 'HIST_BAS'].map(n => 'const ' + n + '=' + JSON.stringify(constante(COT.historial, n)) + ';').join('\n') +
    '\n' + fuente(COT.historial, 'histDsc'), {});
  const casos = [
    { tipo: 'letras', material: 'al-brush', n: 6, altura: 35 },
    { tipo: 'letras', material: 'acero', n: 1, altura: 20 },
    { tipo: 'letras', material: 'raro', n: 2, altura: 12 },
    { tipo: 'recorte', acab: 'vinil', n: 4 },
    { tipo: 'recorte', acab: 'sandwich', n: 1 },
    { tipo: 'bastidor', bas: 'alucobond', ancho: 100, alto: 60 },
    { tipo: 'bastidor', bas: 'lamina', ancho: 0, alto: 0 },
    { tipo: 'caja', ancho: 80, alto: 40 },
    { tipo: 'manual', pz: 1, pu: 100 },
    { tipo: 'letras', desc: 'Lo que escribió el vendedor', n: 3 },
  ];
  for (const it of casos) eq('«' + ctx.histDsc(it) + '»', Cot.descPartida(it), ctx.histDsc(it));

  /* Y las tres tablas conocen exactamente las claves del catálogo: ni una de más ni una de
     menos. Un material nuevo en catalogo.js sin su nombre aquí se describiría «Letras 3D». */
  const HM = constante(COT.historial, 'HIST_MAT'), HA = constante(COT.historial, 'HIST_ACAB'), HB = constante(COT.historial, 'HIST_BAS');
  eq('HIST_MAT nombra cada material del catálogo', Object.keys(HM).sort(), Cat.MATERIALES.map(m => m.key).sort());
  eq('HIST_ACAB nombra cada acabado de recorte',    Object.keys(HA).sort(), Cat.RECORTES.map(r => r.key).sort());
  eq('HIST_BAS nombra cada bastidor',               Object.keys(HB).sort(), Cat.BASTIDORES.map(b => b.key).sort());
  const PA = constante(COT.entrega, 'PDF_ACAB'), PB = constante(COT.entrega, 'PDF_BAS');
  eq('y las del papel también: acabados', Object.keys(PA).sort(), Cat.RECORTES.map(r => r.key).sort());
  eq('y bastidores',                      Object.keys(PB).sort(), Cat.BASTIDORES.map(b => b.key).sort());
}

/* ============================================================================ */
console.log('\nLO QUE SE COBRÓ — una regla, no cuatro parecidas');
{
  const ctx = evaluar(fuente(COT.historial, 'totalFinalHist'), {});
  const casos = [
    { neto: 1000, precioAuth: 0 }, { neto: 1000, precioAuth: 1000 }, { neto: 1000, precioAuth: 1000.005 },
    { neto: 1000, precioAuth: 950 }, { neto: 1000, precioAuth: 1200 }, { neto: 0, precioAuth: 500 }, { neto: 1000 },
  ];
  for (const e of casos) {
    eq('neto ' + e.neto + ' / autorizado ' + e.precioAuth + ' → ' + ctx.totalFinalHist(e),
       Cot.cobrado(e.neto, e.precioAuth), ctx.totalFinalHist(e));
  }
}

/* ============================================================================ */
console.log('\nEL TIPO DE TRABAJO — la traducción de una partida a los siete valores');
{
  const ctx = evaluar(fuente(COT.historial, 'tipoTrabajoCot'), {});
  /* `altura` y `n` van en todas a propósito: lo que se compara aquí es la TRADUCCIÓN de una
     partida a los siete valores, y una partida sin un solo dato capturado ya no se traduce
     —no describe ningún trabajo— por los dos lados. Esa criba se prueba abajo, aparte. */
  const partidas = [];
  for (const tipo of ['letras', 'caja', 'recorte', 'bastidor', 'manual', 'otra'])
    for (const luz of [true, false, undefined])
      for (const acab of ['vinil', 'sencillo', 'sandwich', undefined])
        partidas.push({ tipo, luz, acab, altura: 30, n: 4 });
  let iguales = 0;
  for (const it of partidas) {
    const plataforma = Proy.tiposDerivados([it]);
    if (plataforma.length === 1 && plataforma[0] === ctx.tipoTrabajoCot(it)) iguales++;
  }
  eq('las ' + partidas.length + ' combinaciones dan el mismo tipo de los dos lados', iguales, partidas.length);

  /* ----- Y la partida EN BLANCO se descarta por los dos lados -----
     El cotizador la criba en `plazoSugeridoCot` con `itemVacio`; la plataforma, dentro de
     `tiposDerivados` con `partidaEnBlanco`. Si una de las dos dejara de hacerlo, el vendedor
     vería un plazo al capturar y la plataforma escribiría otro al ganar: la partida que
     siembra `addItem()` —'letras' con luz, sin un dato— añade un tipo de trabajo que nadie
     vendió y `plazoSugerido` le suma un cubo por «hay dos tipos distintos». */
  const cotVacio = evaluar(fuente(COT.ia, 'itemVacio'), {});
  const blanca = { id: 9, tipo: 'letras', material: '', matAuto: false, comp: 'recta', luz: true,
    altura: 0, n: 0, tarifa: 0, ancho: 0, alto: 0, acab: '', bas: '', desc: '', pz: 1, pu: 0 };
  eq('el cotizador dice que la partida recién sembrada está vacía', cotVacio.itemVacio(blanca), true);
  eq('y la plataforma no le deriva ningún tipo', Proy.tiposDerivados([blanca]), []);
  const conDato = { ...blanca, altura: 30, n: 4 };
  eq('en cuanto se teclea algo, las dos la cuentan',
     [cotVacio.itemVacio(conDato), Proy.tiposDerivados([conDato])],
     [false, ['Letras 3D con iluminacion']]);
  const cubos = constante(COT.historial, 'CUBO_POR_TIPO_COT');
  eq('y los cubos del plazo nombran exactamente los siete tipos', Object.keys(cubos).sort(), [...Proy.TIPOS_TRABAJO].sort());
}

/* ============================================================================ */
console.log('\nLOS CUADERNOS — la misma agrupación de clientes');
{
  const HIST = [
    { folio: 'COT-0009', cliente: 'Andrey Healthylicious', tel: '33 1111 2222', ts: 900, neto: 5000, precioAuth: 0, dirRaw: 'La Perla' },
    { folio: 'COT-0008', cliente: 'Andrey', tel: '3311112222', ts: 800, neto: 3000, precioAuth: 0, dirRaw: '' },
    { folio: 'COT-0007', cliente: 'Andrey', tel: '', ts: 700, neto: 1000, precioAuth: 0 },
    { folio: 'COT-0006', cliente: 'Sarai', tel: '+52 33 9999 8888', ts: 600, neto: 2000, precioAuth: 4500 },
    { folio: 'COT-0005', cliente: '', tel: '', ts: 500, neto: 500, precioAuth: 0 },
    { folio: 'COT-0004', cliente: 'Farmacia GDL', tel: '', ts: 400, neto: 700, precioAuth: 0 },
    { folio: 'COT-0003', cliente: 'farmacia  gdl', tel: '', ts: 300, neto: 300, precioAuth: 0 },
    { folio: 'COT-0002', cliente: 'Andrey', tel: '5555555555', ts: 200, neto: 100, precioAuth: 0 },
    { folio: 'COT-0001', cliente: 'andrey', tel: '', ts: 100, neto: 50, precioAuth: 0 },
  ];
  const ctx = evaluar(
    fuente(COT.historial, 'telClave') + '\n' + fuente(COT.nucleo, 'normNom') + '\n' +
    fuente(COT.historial, 'totalFinalHist') + '\nlet _cuaCache=null;\n' + fuente(COT.historial, 'cuadernos'),
    { getHistorial: () => JSON.parse(JSON.stringify(HIST)) });
  globalThis.localStorage = {
    _d: { al3d_historial: JSON.stringify(HIST) },
    getItem(k) { return k in this._d ? this._d[k] : null; },
  };
  const forma = g => ({ clave: g.clave, claves: g.claves, nombre: g.nombre, tel: g.tel, dirRaw: g.dirRaw,
                        alias: g.alias, vendido: g.vendido, ultima: g.ultima, primera: g.primera,
                        cots: g.cots.map(e => e.folio) });
  const delCotizador = ctx.cuadernos().map(forma);
  const delaPlataforma = Cot.cuadernos().map(forma);
  eq('salen los mismos cuadernos, en el mismo orden', delaPlataforma.map(g => g.clave), delCotizador.map(g => g.clave));
  for (let i = 0; i < delCotizador.length; i++) {
    eq('el cuaderno «' + delCotizador[i].clave + '» es idéntico', delaPlataforma[i], delCotizador[i]);
  }
  /* «Andrey» se ha visto con DOS teléfonos: la que no trae ninguno no adivina y se queda en
     su propio cuaderno. Es la parte de la regla que más fácil se pierde al reescribirla. */
  cierto('un nombre con dos teléfonos no se adivina', delCotizador.some(g => g.clave === 'nom:andrey'));
}

/* ============================================================================ */
console.log('\nLA IDENTIDAD DEL APARATO — mismo alfabeto, misma clave');
{
  const abCot = /const AB='([^']+)'/.exec(COT.entrega);
  const abPf  = /const AB = '([^']+)'/.exec(leer('js/datos/prefs.js'));
  eq('el alfabeto de cuatro letras es el mismo', abCot && abCot[1], abPf && abPf[1]);
  eq('y la clave donde se guarda', constante(COT.entrega, 'DISP_KEY'), Prefs.CLAVES.DISP);
  eq('el buzón se escribe en la clave que la plataforma lee', HTMLoJs(COT.venta, 'al3d_pf_ganadas'), Prefs.CLAVES.GANADAS);
  eq('y el puente se lee de la clave que Ajustes escribe', constante(COT.venta, 'PUENTE_KEY'), Prefs.CLAVES.PUENTE);
  eq('y la restauración pendiente, de la suya', constante(COT.historial, 'RESTAURAR_PF_KEY'), Prefs.CLAVES.RESTAURAR);
}
function HTMLoJs(texto, literal) { return texto.includes("'" + literal + "'") ? literal : ''; }

/* ============================================================================ */
console.log('\nLAS LLAVES DE IA — la plataforma las lee con la receta del cotizador');
{
  eq('la misma sal', constante(COT.ia, '_KSALT'), /const KSALT = '([^']+)'/.exec(leer('js/datos/asistente-contexto.js'))[1]);
  eq('los mismos proveedores', constante(COT.ia, 'AI_PROVS'), Asis.PROVEEDORES);
  eq('los mismos nombres', constante(COT.ia, 'AI_NOMBRE'), Asis.PROVEEDOR_NOMBRE);
  eq('los mismos modelos por defecto', constante(COT.ia, 'AI_DEFAULTS'), Asis.MODELO_DEFECTO);
  eq('las mismas direcciones', constante(COT.ia, 'AI_URLS'), Asis.PROVEEDOR_URL);
  eq('los mismos modelos retirados', constante(COT.ia, 'AI_VIEJOS'), Asis.MODELOS_VIEJOS);
}

/* ============================================================================ */
console.log('\nLO QUE EL COTIZADOR LE MANDA A LA HOJA — solo nombres que el puente conoce');
{
  const f = fuente(COT.venta, 'datosParaLaHoja');
  const nombres = new Set();
  for (const m of f.matchAll(/'([A-Z][^']*)'\s*:/g)) nombres.add(m[1]);
  for (const m of f.matchAll(/d\['([^']+)'\]\s*=/g)) nombres.add(m[1]);
  cierto('se leyeron los nombres de propiedad del modal', nombres.size >= 10);
  const conocidos = new Set(Object.values(Puente.P));
  for (const n of nombres) cierto('«' + n + '» existe en el vocabulario del puente', conocidos.has(n));
  const colW = /var COL = \{([\s\S]*?)\};/.exec(leer('puente/hoja-apps-script.gs'))[1];
  for (const n of nombres) cierto('y la hoja tiene su columna «' + n + '»', colW.includes("'" + n + "'"));
  eq('la etapa con la que nace una venta es la que la plataforma llama «ganado»',
     /'Etapa de obra':\s*'([^']+)'/.exec(f)[1], Puente.ETAPA_A_NOTION.ganado);
  cierto('y el folio viaja con el aparato pegado, como lo arma la plataforma', /'@'\+dispositivo\(\)/.test(f));
}

/* ============================================================================ */
console.log('\nEL MODAL DE REGISTRAR VENTA — los desplegables, en el orden de la hoja');
{
  const opciones = id => {
    const m = new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>').exec(HTML);
    return m ? [...m[1].matchAll(/<option>([^<]+)<\/option>/g)].map(x => x[1]) : null;
  };
  eq('los estatus del modal son los de la hoja, en su orden', opciones('rv-estatus'), Puente.ESTATUS);
  eq('las cuentas también', opciones('rv-cuenta'), Puente.CUENTAS);
}

/* ============================================================================ */
console.log('\nEL MÍNIMO DE UN METRO CUADRADO — precio, no geometría, y el mismo número');
{
  eq('M2_MINIMO del cotizador es el de la copia generada', constante(COT.nucleo, 'M2_MINIMO'), Cat.M2_MINIMO);
}

/* ============================================================================ */
/* El cotizador ya había arreglado esto y dejó escrito el porqué: un «33 12» a medias «abría
   el chat de un número que no era el del cliente mientras el aviso decía WhatsApp abierto».
   La plataforma llevaba su propia versión —`linkWa`— que mandaba a wa.me CUALQUIER cadena de
   dígitos, y la usan el botón «Cobrar» de Control, la ficha de Proyectos y los dos de pedirle
   material al proveedor, cuyo teléfono se teclea a mano. */
console.log('\nEL TELÉFONO DE WHATSAPP — la misma regla de los dos lados');
{
  const ctx = evaluar(fuente(COT.entrega, 'telWhatsApp'), {});
  const casos = ['', '  ', '33', '33 12', '3312345', '33 1234 5678', '+52 33 1234 5678',
    '521 33 1234 5678', '+1 415 555 2671', 'ext. 204', '(33) 1234-5678',
    '1234567890123456', 'no tiene'];
  let iguales = 0;
  for (const t of casos) {
    if (UI.telWa(t) === ctx.telWhatsApp(t)) iguales++;
    else console.log('         ' + JSON.stringify(t) + ': plataforma ' + JSON.stringify(UI.telWa(t)) +
                     ', cotizador ' + JSON.stringify(ctx.telWhatsApp(t)));
  }
  eq('los ' + casos.length + ' teléfonos dan el mismo número de los dos lados', iguales, casos.length);
  eq('el celular de diez dígitos se manda con lada de país', UI.telWa('33 1234 5678'), '5233 12345678'.replace(/\s/g, ''));
  eq('el que no puede ser un teléfono se rechaza, no se manda a medias', UI.telWa('33 12'), '');
  eq('y sin número la liga sigue abriendo WhatsApp para elegir contacto (la orden de trabajo)',
     UI.linkWa('', 'hola'), 'https://wa.me/?text=hola');
  eq('con un teléfono que no lo es, tampoco inventa destinatario',
     UI.linkWa('ext. 204', 'hola'), 'https://wa.me/?text=hola');
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
