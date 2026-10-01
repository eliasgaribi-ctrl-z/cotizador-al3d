/* EL PRECIO, SIN PANTALLA: el anticipo partido, el ajuste del autorizador, el recorrido de la
   solicitud, el avance de los pasos y las razones del plazo.

   Cinco cuentas de la zona «precio, autorización, notario y hitos» del cotizador que un error vuelve
   plausibles —sale un número que parece bueno— y que se enseñan delante del cliente:

     1. EL ANTICIPO PARTIDO (C17). «Hoy $X · Al instalar $Y» tiene que sumar el total que se cobra, el
        porcentaje que sale en el rótulo tiene que ser el que se ve, y la excepción de las condiciones
        de pago —arriba de $60,000— se mide sobre el TOTAL QUE SE COBRA (con IVA si lleva) y nunca
        se prende en el 60,000 exacto. Se prueba con miles de totales y anticipos generados.

     2. EL AJUSTE DEL AUTORIZADOR (C18). El deslizador va de −20 % a +10 % del subtotal calculado; el
        imán del 0 % tiene que caer EXACTO en el calculado —un centavo de diferencia se anuncia solo
        como «Aumento: $0.01» antes de que nadie toque nada, que es justo el error que el formulario
        ya tuvo una vez—, y los imanes van en orden de menor a mayor.

     3. EL RECORRIDO DE LA SOLICITUD (C9). Cada estado de la solicitud —en camino, en la hoja,
        reintentando, rechazada por el catálogo, retirada, contestada— se dibuja con el glifo que le toca,
        y el arco que gira solo sale cuando hay una espera de verdad: una solicitud que ya no espera
        nada no puede seguir girando.

     4. CUÁNTO VA (C12). El filete del riel de pasos sube de cuarto en cuarto y no pasa de uno.

     5. POR QUÉ ESE PLAZO (H19). `plazoSugeridoCot()` devuelve lo mismo de siempre —un cubo del 1 al
        5, que es lo que lee la plataforma— con o sin el arreglo de razones, y las razones dicen la
        cuenta con la que se llegó a él. Se compara contra la fórmula escrita aparte.

   Además se defiende, leyendo el texto, lo que no se puede ver sin un navegador: que el error de «el
   total no es el que selló la hoja» sale por el camino que sabe si el marco se ve (C3).

   Se leen los guiones del cotizador como TEXTO y se evalúa cada función con lo mínimo que necesita
   (el mismo método que pruebas/replicas.mjs). Uso: node pruebas/cot-precio.mjs (o pruebas/correr.sh) */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v, extra) => { if (v) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que + (extra ? '\n         ' + extra : '')); } };

const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');
const PROCESO = leer('js/cotizador/proceso.js'), NOTARIO = leer('js/cotizador/notario.js'), HISTORIAL = leer('js/cotizador/historial.js');

/* ----- Sacar una función o una constante del texto (contando llaves, saltando cadenas) ----- */
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
const linea = (texto, nombre) => { const m = new RegExp('^const ' + nombre + '\\s*=.*$', 'm').exec(texto); if (!m) throw new Error('no está const ' + nombre); return m[0]; };
const bloqueConst = (texto, nombre) => {
  const m = new RegExp('const ' + nombre + '\\s*=\\s*').exec(texto); if (!m) throw new Error('no está const ' + nombre);
  const ini = m.index + m[0].length, abre = texto[ini], cierra = abre === '{' ? '}' : ']';
  let prof = 0;
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\'' || c === '"' || c === '`') { for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++; continue; }
    if (c === abre) prof++;
    if (c === cierra && --prof === 0) return 'const ' + nombre + '=' + texto.slice(ini, i + 1) + ';';
  }
  throw new Error('const ' + nombre + ' no cierra');
};
/* `const` y `let` pasan a `var` para que las constantes queden como propiedades del contexto y se puedan leer. */
const cargar = (codigo, globales = {}) => { const ctx = vm.createContext(Object.assign({ Math, Number, String, Array, Object, JSON, isFinite, Set }, globales)); vm.runInContext(codigo.replace(/^(const|let) /gm, 'var '), ctx); return ctx; };

/* ============================== 1 · EL ANTICIPO PARTIDO (C17) ============================== */
console.log('\n1. EL ANTICIPO PARTIDO SUMA EL TOTAL Y LA EXCEPCIÓN SE MIDE SOBRE LO QUE SE COBRA');
{
  const A = cargar(linea(PROCESO, 'ANTICIPO_EXCEPCION') + '\n' + fuente(PROCESO, 'partirAnticipo'));
  eq('la excepción de las condiciones de pago es de $60,000', A.ANTICIPO_EXCEPCION, 60000);
  let mala = null, n = 0;
  /* Miles de totales (con y sin IVA, con centavos) y de anticipos: siempre suma, nunca negativo, y el
     porcentaje que se dice es el redondeo de lo que se ve. */
  for (let t = 0; t <= 140000; t += 733.37) for (const f of [0, .1, .25, .5, .77, 1, 1.3]) {
    const total = +t.toFixed(2), anti = +(total * f).toFixed(2);
    const c = A.partirAnticipo(total, anti); n++;
    const suma = +(c.hoy + c.alInstalar).toFixed(2);
    const ok = c.hoy >= 0 && c.alInstalar >= 0 && (c.supera ? suma >= total - 0.011 && c.alInstalar === 0 : Math.abs(suma - total) < 0.011)
      && c.pct === (total > 0 ? Math.round(anti / total * 100) : 0) && c.excepcion === (total > 60000) && c.supera === (anti - total > 0.01);
    if (!ok && !mala) mala = { total, anti, c };
  }
  cierto('hoy + al instalar = total, o el anticipo supera y se dice, en ' + n + ' combinaciones', !mala, JSON.stringify(mala));
  eq('en $60,000 exactos todavía no hay excepción: «mayores a» no incluye al 60,000', A.partirAnticipo(60000, 30000).excepcion, false);
  eq('con un centavo más sí', A.partirAnticipo(60000.01, 30000).excepcion, true);
  /* Con factura el total que se cobra lleva IVA: $53,000 de subtotal son $61,480 y ya pasan. */
  eq('se mide sobre el total CON IVA: $53,000 + 16 % = $61,480 pasa', A.partirAnticipo(53000 * 1.16, 0).excepcion, true);
  eq('y el mismo subtotal sin factura, no', A.partirAnticipo(53000, 0).excepcion, false);
  eq('un anticipo mayor que el total lo dice y deja el resto en cero', (c => [c.supera, c.alInstalar])(A.partirAnticipo(10440, 12760)), [true, 0]);
  eq('sin total no hay nada que partir', A.partirAnticipo(0, 0), { hoy: 0, alInstalar: 0, supera: false, pct: 0, excepcion: false });
  eq('basura no truena', A.partirAnticipo(undefined, 'x'), { hoy: 0, alInstalar: 0, supera: false, pct: 0, excepcion: false });
}

/* ============================== 2 · EL AJUSTE DEL AUTORIZADOR (C18) ============================== */
console.log('\n2. EL DESLIZADOR DEL PRECIO: −20 % A +10 %, CON EL 0 % EXACTO');
{
  const J = cargar(linea(PROCESO, 'AJUSTE_DESDE') + '\n' + fuente(PROCESO, 'ajusteDelPrecio'));
  eq('los imanes son 0, −5, −10 y −15 %', J.AJUSTE_IMANES, [0, -5, -10, -15]);
  let mala = null, n = 0;
  for (let sub = 100; sub <= 200000; sub = sub * 1.37 + 17.31) {
    const s = +sub.toFixed(2), a = J.ajusteDelPrecio(s); n++;
    const cero = a.imanes.find(i => i.t === '0%');
    const ordenados = a.imanes.map(i => i.v).every((v, i, l) => i === 0 || v < l[i - 1]);
    const ok = Math.abs(a.min - s * 0.8) < 0.006 && Math.abs(a.max - s * 1.1) < 0.006 && cero && cero.v === s
      && ordenados && a.imanes.every(i => i.v >= a.min && i.v <= a.max)
      && a.marcas[0].v === a.min && a.marcas[a.marcas.length - 1].v === a.max && a.marcas.length === a.imanes.length + 2;
    if (!ok && !mala) mala = { s, a };
  }
  cierto('rango, imanes y marcas bien en ' + n + ' subtotales (el 0 % cae EXACTO en el calculado)', !mala, JSON.stringify(mala));
  eq('los rótulos usan el menos de verdad, no el guion', J.ajusteDelPrecio(1000).marcas.map(m => m.t), ['−20%', '0%', '−5%', '−10%', '−15%', '+10%']);
  eq('un calculado con centavos no se redondea a pesos: $17,585.60 se queda en $17,585.60', J.ajusteDelPrecio(17585.6).imanes[0].v, 17585.6);
}

/* ============================== 3 · EL RECORRIDO DE LA SOLICITUD (C9) ============================== */
console.log('\n3. EL RECORRIDO DE LA SOLICITUD: CADA ESTADO CON SU GLIFO, Y SOLO GIRA LO QUE ESPERA');
{
  const R = cargar([fuente(NOTARIO, '_esperaViva'), fuente(PROCESO, 'etapasEspera'), fuente(PROCESO, 'glifoDeEspera'), fuente(PROCESO, 'haceTexto'), linea(PROCESO, '_DICE_ETAPA')].join('\n'),
    { _selfAuth: false, Q: { solicitud: null } });
  const t = s => R.etapasEspera(s);
  eq('sin solicitud todo está por hacer', t(null), ['espera', 'espera', 'espera']);
  eq('recién pedida, sin llegar a la hoja: la hoja trabaja', t({ enviada: false, error: '' }), ['ok', 'trabaja', 'espera']);
  eq('sin señal, se reintenta: ámbar, y Dirección todavía no', t({ enviada: false, error: 'Sin señal' }), ['ok', 'av', 'espera']);
  eq('la hoja la rechazó por el catálogo: cruz, y nada que esperar', t({ enviada: false, definitivo: true, error: 'no cuadra' }), ['ok', 'mal', 'espera']);
  eq('llegó a la hoja: Dirección decide, con el arco', t({ enviada: true }), ['ok', 'ok', 'trabaja']);
  eq('Dirección la retiró: ya no espera, cruz', t({ enviada: true, cancelada: true }), ['ok', 'ok', 'mal']);
  eq('Dirección la rechazó y quedó en la cola: cruz, no gira', t({ enviada: true, rechazo: { resolvio: 'a', nota: '' } }), ['ok', 'ok', 'mal']);
  /* La regla de oro: el arco solo sale si _esperaViva lo dice. */
  let falla = null;
  for (const enviada of [true, false]) for (const definitivo of [true, false]) for (const cancelada of [true, false]) for (const rechazo of [null, {}]) for (const error of ['', 'x']) {
    const s = { enviada, definitivo, cancelada, rechazo, error };
    const gira = t(s).includes('trabaja');
    if (gira && !(enviada ? R._esperaViva(s) : !error && !definitivo && !cancelada)) falla = s;
  }
  cierto('ninguna solicitud que ya no espera nada lleva un arco que gira (32 combinaciones)', !falla, JSON.stringify(falla));
  R.Q.solicitud = { enviada: true };
  eq('la insignia de una espera viva es el arco', R.glifoDeEspera(), 'trabaja');
  R.Q.solicitud = { enviada: false, error: 'Sin señal' };
  eq('la de una que se reintenta, el aviso ámbar', R.glifoDeEspera(), 'av');
  R.Q.solicitud = { enviada: true, cancelada: true };
  eq('la de una retirada, el aviso ámbar: hay que actuar', R.glifoDeEspera(), 'av');
  R._selfAuth = true;
  eq('autorizándose a uno mismo no hay recorrido: anillo punteado', R.glifoDeEspera(), 'espera');
  eq('«revisado hace»: segundos', [R.haceTexto(0), R.haceTexto(9400), R.haceTexto(59000)], ['0 s', '9 s', '59 s']);
  eq('«revisado hace»: minutos y horas', [R.haceTexto(60000), R.haceTexto(185000), R.haceTexto(3600000)], ['1 min', '3 min', 'más de 1 h']);
  eq('un reloj adelantado no da cifras negativas', R.haceTexto(-5000), '0 s');
}

/* ============================== 4 · CUÁNTO VA (C12) ============================== */
console.log('\n4. EL FILETE DEL RIEL SUBE DE CUARTO EN CUARTO');
{
  const C = cargar(fuente(PROCESO, 'avancePasos'));
  eq('ningún paso hecho: vacío', C.avancePasos({ 1: false, 2: false, 3: false, 4: false }), 0);
  eq('cliente y partidas: la mitad', C.avancePasos({ 1: true, 2: true, 3: false, 4: false }), 0.5);
  eq('autorizada: tres cuartos', C.avancePasos({ 1: true, 2: true, 3: true, 4: false }), 0.75);
  eq('entregada: lleno', C.avancePasos({ 1: true, 2: true, 3: true, 4: true }), 1);
  eq('sin datos no truena', C.avancePasos(null), 0);
  let maxi = 0;
  for (let m = 0; m < 16; m++) maxi = Math.max(maxi, C.avancePasos({ 1: !!(m & 1), 2: !!(m & 2), 3: !!(m & 4), 4: !!(m & 8) }));
  eq('en ninguna combinación pasa de uno', maxi, 1);
}

/* ============================== 5 · POR QUÉ ESE PLAZO (H19) ============================== */
console.log('\n5. EL PLAZO SUGERIDO: EL MISMO CUBO DE SIEMPRE, CON O SIN RAZONES');
{
  const codigo = [bloqueConst(HISTORIAL, 'PLAZOS_COT'), bloqueConst(HISTORIAL, 'CUBO_POR_TIPO_COT'), fuente(HISTORIAL, 'tipoTrabajoCot'), fuente(HISTORIAL, 'plazoSugeridoCot')].join('\n');
  const H = cargar(codigo, { itemVacio: it => !(it.altura || it.ancho || it.alto || it.n || it.desc) });
  /* La fórmula, escrita aparte y a propósito sin copiar el código: el cubo del tipo más lento, uno más por cada
     tipo distinto de más, uno más si una pieza no cabe en la lámina de 244 cm, y tope en 5. */
  const oraculo = items => {
    const vivos = items.filter(it => it.altura || it.ancho || it.alto || it.n);
    if (!vivos.length) return 4;
    const luz = it => it.luz !== false;
    const tipo = it => it.tipo === 'letras' ? (luz(it) ? 3 : 2) : it.tipo === 'caja' ? (luz(it) ? 3 : 2) : it.tipo === 'recorte' ? 1 : 4;
    const nombre = it => it.tipo + (it.tipo === 'letras' || it.tipo === 'caja' ? (luz(it) ? 'L' : 'N') : it.tipo === 'recorte' ? (it.acab === 'vinil' ? 'V' : 'A') : '');
    const distintos = new Set(vivos.map(nombre)).size;
    const lado = it => (it.tipo === 'letras' || it.tipo === 'recorte') ? (+it.altura || 0) : (it.tipo === 'caja' || it.tipo === 'bastidor') ? Math.max(+it.ancho || 0, +it.alto || 0) : 0;
    const base = Math.max(...vivos.map(it => it.tipo === 'recorte' && it.acab === 'vinil' ? 1 : tipo(it)));
    return Math.min(5, base + distintos - 1 + (Math.max(...vivos.map(lado)) > 244 ? 1 : 0));
  };
  const muestras = [];
  const tipos = [{ tipo: 'letras', luz: true }, { tipo: 'letras', luz: false }, { tipo: 'caja', luz: true }, { tipo: 'caja', luz: false }, { tipo: 'recorte', acab: 'vinil' }, { tipo: 'recorte', acab: 'acrilico' }, { tipo: 'manual' }];
  for (const a of tipos) for (const b of [null, ...tipos]) for (const alto of [30, 120, 250, 300]) {
    const it = (x, id) => Object.assign({ id, altura: alto, ancho: alto, alto: alto / 2, n: 3 }, x);
    muestras.push(b ? [it(a, 1), it(b, 2)] : [it(a, 1)]);
  }
  muestras.push([], [{ id: 1, tipo: 'letras', luz: true }]);
  let distinto = null, sinRazon = null, mal2 = null;
  for (const m of muestras) {
    const k = H.plazoSugeridoCot(m), r = []; const k2 = H.plazoSugeridoCot(m, r);
    if (k !== k2 && !distinto) distinto = { m, k, k2 };
    if (k !== oraculo(m) && !mal2) mal2 = { m: m.map(x => x.tipo + ':' + x.altura), k, oraculo: oraculo(m) };
    const etiqueta = H.PLAZOS_COT.find(p => p.k === k).etiqueta;
    if (m.some(x => x.altura || x.n) && !(r.length >= 2 && r[r.length - 1] === 'Plazo sugerido: ' + etiqueta) && !sinRazon) sinRazon = { m, r };
  }
  cierto('con y sin el arreglo de razones devuelve el MISMO cubo, en ' + muestras.length + ' casos', !distinto, JSON.stringify(distinto));
  cierto('y ese cubo es el de la fórmula escrita aparte', !mal2, JSON.stringify(mal2));
  cierto('la última razón siempre dice el plazo con las palabras del chip', !sinRazon, JSON.stringify(sinRazon));
  const r1 = []; H.plazoSugeridoCot([{ id: 1, tipo: 'letras', luz: true, altura: 300, n: 2 }], r1);
  eq('letras con luz de 3 m: el trabajo, la pieza que no cabe y el plazo', r1,
    ['Letras 3D con iluminación: 2 semanas', 'Una pieza de 3.00 m no cabe en una lámina de 2.44 m: suma media semana', 'Plazo sugerido: 2.5 semanas']);
  const r2 = []; H.plazoSugeridoCot([{ id: 1, tipo: 'letras', luz: true, altura: 40, n: 2 }, { id: 2, tipo: 'recorte', acab: 'vinil', altura: 20, n: 1 }], r2);
  eq('dos tipos de trabajo: lo dice con lo que suman', r2.slice(1, 2), ['2 tipos de trabajo: suma media semana por cada uno de más']);
  const r3 = []; H.plazoSugeridoCot([], r3);
  eq('sin trabajo capturado dice que es el de un proyecto especial, no una cuenta', r3.length === 1 && /Todavía no hay trabajo capturado/.test(r3[0]), true);
  eq('una partida en blanco no cuenta como tipo de trabajo (el plazo no se infla)', H.plazoSugeridoCot([{ id: 1, tipo: 'recorte', acab: 'vinil', altura: 20, n: 1 }, { id: 2, tipo: 'letras', luz: true }]), 1);
}

/* ============================== 6 · LO QUE SOLO SE PUEDE LEER (C3, C5) ============================== */
console.log('\n6. EL ERROR DEL TOTAL SELLADO NO SE PIERDE, Y SELLAR SE DICE');
{
  const sello = fuente(NOTARIO, 'aplicarSello');
  const i = sello.indexOf('desgloseFinal().neto-Q.sello.total');
  const tramo = sello.slice(i, sello.indexOf('return guardada', i));
  cierto('el aviso de «el total no es el que selló la hoja» sale por avisoDelNotario, que sabe si el marco se ve', /avisoDelNotario\(\s*'El total de este teléfono/.test(tramo) && !/\btoast\(/.test(tramo));
  cierto('y sigue siendo un error (rojo, el de mayor prioridad en la pila de avisos) de 12 s', /'err'\s*,\s*12000/.test(tramo));
  cierto('«Autorizar precio» ya no se pinta «trabajando» a mano: lo hace la pieza 14', !/trabajando'\:''\)/.test(fuente(PROCESO, 'authRevisionHTML')) && /Piezas|P\.trabajando/.test(fuente(PROCESO, 'autorizarConfirmado')));
  cierto('y la revisión remota también', /Piezas\.trabajando\('rem-autorizar'/.test(fuente(NOTARIO, 'autorizarRemota')));
  cierto('el aviso del notario explica la prioridad de la pila en vez de inventar otra', /error \(2\) > con botón \(1\) > informativo \(0\)/.test(NOTARIO));
}

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
