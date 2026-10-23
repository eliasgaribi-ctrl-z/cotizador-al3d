/* LOS PRECIOS EDITABLES: UNA TABLA, DOS LADOS, EL MISMO PRECIO.

   Desde el 23-oct-2026 Dirección cambia los precios y agrega u oculta materiales desde el
   cotizador («Precios y materiales», js/cotizador/tarifas.js), y la tabla vive en la pestaña
   «Tarifas» de la hoja (puente/hoja-apps-script.gs, «Las tarifas, editables»). La hoja recalcula
   cada cotización antes de sellarla con ESA tabla, y el teléfono cotiza con la que la hoja le
   dio. Lo que se defiende aquí:

     · el catálogo de fábrica de la hoja es el de catalogo.js, nombres incluidos;
     · guardar valida todo o nada, nunca borra un renglón y fecha lo que cambió;
     · con una tabla cambiada —precios nuevos, un material agregado, el extra del sándwich— el
       teléfono y la hoja siguen cobrando EXACTAMENTE lo mismo, partida por partida;
     · un material oculto deja de ofrecerse pero sigue cobrando donde ya está; uno agregado
       hereda de su «se fabrica como» la iluminación y el material de compra;
     · una caja ya cotizada no pierde su tipo cuando sube su precio.

   Uso: node pruebas/tarifas.mjs   (o pruebas/correr.sh, que corre todas) */

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
const plano = x => JSON.parse(JSON.stringify(x));

/* `function nombre(...){...}` completo (la receta de pruebas/precio-servidor.mjs). */
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

/* ----- El teléfono: catalogo.js, tarifas.js y lineTotal() de nucleo.js ----- */
const nucleo = leer('js/cotizador/nucleo.js');
const guardado = {};
const cot = vm.createContext({
  localStorage: { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); }, removeItem: k => { delete guardado[k]; } },
  window: { addEventListener() {} }, console,
});
vm.runInContext(leer('js/cotizador/catalogo.js'), cot);
vm.runInContext('const ACC={}; function accionesDirectas(){} const M2_MINIMO=1;' +
  ['m2Total', 'lineTotal', 'lineTotalCrudo'].map(n => fuente(nucleo, n)).join('\n'), cot);
vm.runInContext(leer('js/cotizador/tarifas.js'), cot);
const T = vm.runInContext('({MATERIALES,COMPLEJIDAD,RECORTES,BASTIDORES,CAJAS,extra:()=>RECORTE_COMP_EXTRA,' +
  'aplicarTarifas,lineTotal,ofrecer,baseDe,cajaOf,cajaDe,matOf,info:()=>TARIFAS_INFO})', cot);

/* ----- La hoja: el .gs completo, sin Google ----- */
const hoja = vm.createContext({});
vm.runInContext(leer('puente/hoja-apps-script.gs'), hoja);
const H = vm.runInContext('({COT_TARIFAS_FABRICA,cotTablaFabrica,cotTabla,cotNormalizarTabla_,cotMezclarTarifas_,' +
  'cotLineTotal,poner:t=>{_cotTablaMemo=t;_cotMapasMemo=null;},rutaTarifas_})', hoja);

/* ============================================================================ */
console.log('\nEL CATÁLOGO DE FÁBRICA DE LA HOJA ES EL DE catalogo.js');
{
  const fab = plano(H.cotTablaFabrica().filas);
  const del = g => fab.filter(f => f.grupo === g).map(f => [f.clave, f.nombre, f.precio]);
  eq('materiales', del('material'), plano(T.MATERIALES).map(m => [m.key, m.label, m.precio]));
  eq('complejidad', del('complejidad'), plano(T.COMPLEJIDAD).map(c => [c.key, c.label, c.extra]));
  eq('recortes', del('recorte'), plano(T.RECORTES).map(r => [r.key, r.label, r.precio]));
  eq('bastidores', del('bastidor'), plano(T.BASTIDORES).map(b => [b.key, b.label, b.tarifa]));
  eq('cajas', del('caja'), plano(T.CAJAS).map(c => [c.key, c.label, c.tarifa]));
  eq('el extra del sándwich', del('recorte-extra').map(f => f[2]), [T.extra()]);
  eq('sin pestaña ni Google, la hoja cobra con la de fábrica', plano(H.rutaTarifas_().tabla.filas).length, fab.length);
  /* Y las otras dos copias, la de la nube (0019, interno.tarifas_fabrica) y la del importador (las claves). */
  const mig = leer('supabase/migrations/0019_tarifas.sql');
  const nube = JSON.parse(/interno\.tarifas_fabrica\(\)[\s\S]*?select '(\[[\s\S]*?\])'::jsonb/.exec(mig)[1]);
  eq('la de la nube (0019) es la misma, renglón por renglón', nube, plano(H.COT_TARIFAS_FABRICA));
}

/* ============================================================================ */
console.log('\nGUARDAR: TODO O NADA, NUNCA BORRA, FECHA LO QUE CAMBIÓ');
const AHORA = '2026-10-23T18:00:00.000Z', QUIEN = 'direccion@al3d.mx';
const base = H.cotTablaFabrica();
const pedido = [
  { grupo: 'material', clave: 'al-paint', nombre: 'Aluminio Blanco/Negro/Pintado', precio: 34, visible: true },
  { grupo: 'material', clave: 'acero', nombre: 'Acero Inoxidable', precio: 55, visible: false },
  { grupo: 'material', clave: 'xanod1', nombre: 'Aluminio anodizado', precio: 38, como: 'al-paint', visible: true },
  { grupo: 'recorte-extra', clave: 'sandwich', nombre: 'Complejidad del sándwich', precio: 7, visible: true },
  { grupo: 'caja', clave: 'std', nombre: 'Estándar', precio: 4200, visible: true },
  { grupo: 'bastidor', clave: 'xpvc22', nombre: 'PVC espumado', precio: 800, como: 'lamina', visible: true },
];
const r = H.cotMezclarTarifas_(base, pedido, QUIEN, AHORA);
cierto('una tabla buena se acepta', !r.error, r.error);
const tabla = plano(r.tabla);
const fila = (g, k) => tabla.filas.find(f => f.grupo === g && f.clave === k);
eq('cuenta lo que cambió: aluminio, acero, el nuevo, el sándwich, la caja y el PVC', r.cambios, 6);
eq('el aluminio sube a $34 y dice quién y cuándo', [fila('material', 'al-paint').precio, fila('material', 'al-paint').por, fila('material', 'al-paint').actualizado], [34, QUIEN, AHORA]);
eq('lo que no cambió no se fecha', [fila('material', 'al-brush').actualizado, fila('material', 'al-brush').por], ['', '']);
eq('el acero se oculta, no se borra', [!!fila('material', 'acero'), fila('material', 'acero').visible], [true, false]);
eq('el nuevo dice de qué se fabrica y hereda la iluminación', [fila('material', 'xanod1').como, fila('material', 'xanod1').detalle], ['al-paint', 'LED posterior (cálida/fría)']);
eq('lo que no vino en el pedido se queda como estaba: los 16 de fábrica más los 2 nuevos', tabla.filas.length, 18);
eq('la tabla dice cuándo fue el último cambio y de quién', [tabla.actualizado, tabla.por], [AHORA, QUIEN]);
const malo = (que, p, re) => { const x = H.cotMezclarTarifas_(base, p, QUIEN, AHORA); cierto(que + ': «' + (x.error || '') + '»', !!x.error && re.test(x.error)); };
malo('un material en $0 no', [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 0 }], /precio/);
malo('un precio que no es número no', [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 'treinta' }], /precio/);
malo('un precio vacío no', [{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: '' }], /precio/);
malo('sin nombre no', [{ grupo: 'material', clave: 'al-paint', nombre: '  ', precio: 30 }], /nombre/);
malo('una clave con mayúsculas o espacios no', [{ grupo: 'material', clave: 'Mi Material', nombre: 'X', precio: 30, como: 'al-paint' }], /clave/);
malo('un material nuevo sin «se fabrica como» no', [{ grupo: 'material', clave: 'xnuevo', nombre: 'Nuevo', precio: 30 }], /fabrica/);
malo('ni con uno que no es de fábrica', [{ grupo: 'material', clave: 'xnuevo', nombre: 'Nuevo', precio: 30, como: 'xanod1' }], /fabrica/);
malo('en complejidad no se agregan renglones', [{ grupo: 'complejidad', clave: 'xrara', nombre: 'Rara', precio: 3, como: 'recta' }], /no se agregan/);
malo('un grupo inventado no', [{ grupo: 'neon', clave: 'flex', nombre: 'Neón', precio: 30 }], /grupo/);
malo('la misma clave dos veces no', [pedido[0], pedido[0]], /dos veces/);
cierto('la complejidad recta sí puede costar $0', !H.cotMezclarTarifas_(base, [{ grupo: 'complejidad', clave: 'recta', nombre: 'Recta', precio: 0 }], QUIEN, AHORA).error);
{
  const todo = H.cotMezclarTarifas_(base, plano(T.MATERIALES).map(m => ({ grupo: 'material', clave: m.key, nombre: m.label, precio: m.precio, visible: false })), QUIEN, AHORA);
  cierto('ocultar todos los materiales deja el primero a la vista: sin él no habría con qué cotizar letras',
    !todo.error && plano(todo.tabla.filas).filter(f => f.grupo === 'material' && f.visible).map(f => f.clave).join() === 'al-paint');
}
{
  /* La pestaña la puede tocar una persona a mano: lo que no se entiende vuelve a fábrica. */
  const sucia = H.cotNormalizarTabla_([{ grupo: 'material', clave: 'al-paint', nombre: 'Aluminio', precio: 'abc' },
    { grupo: 'material', clave: 'xraro', nombre: 'Raro', precio: 50, como: 'no-existe' }, { grupo: 'basura' }]);
  const s = plano(sucia.filas);
  cierto('un precio ilegible en la pestaña vuelve al de fábrica ($30), no a $0', s.find(f => f.clave === 'al-paint').precio === 30);
  cierto('un renglón nuevo sin de qué fabricarse se ignora', !s.some(f => f.clave === 'xraro'));
  cierto('y lo que falta de fábrica se completa', s.length === 16);
}

/* ============================================================================ */
console.log('\nCON LA TABLA NUEVA, EL TELÉFONO Y LA HOJA COBRAN LO MISMO');
cierto('el teléfono la aplica', T.aplicarTarifas(tabla) === true);
H.poner(tabla);
eq('el aluminio del teléfono ya es de $34', T.matOf('al-paint').precio, 34);
eq('y el extra del sándwich, de $7', T.extra(), 7);
{
  let semilla = 20261023;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  const uno = l => l[Math.floor(azar() * l.length)];
  const dec = m => Math.round(azar() * m * 2) / 2;
  const mats = plano(T.MATERIALES).map(m => m.key), comps = plano(T.COMPLEJIDAD).map(c => c.key);
  const recs = plano(T.RECORTES).map(x => x.key), bass = plano(T.BASTIDORES).map(b => b.key);
  let malas = [];
  for (let i = 0; i < 3000; i++) {
    const tipo = uno(['letras', 'letras', 'recorte', 'bastidor', 'caja', 'manual']);
    const it = { id: i + 1, tipo };
    if (tipo === 'letras') Object.assign(it, { material: uno(mats), comp: uno(comps), luz: azar() < 0.6, altura: dec(120), n: Math.floor(azar() * 30) });
    if (tipo === 'recorte') Object.assign(it, { acab: uno(recs), recComp: azar() < 0.5, altura: dec(10), n: Math.floor(azar() * 40) });
    if (tipo === 'bastidor') Object.assign(it, { bas: uno(bass), ancho: dec(400), alto: dec(300) });
    if (tipo === 'caja') Object.assign(it, { tarifa: uno([3900, 4200, 4600, 5000]), ancho: dec(300), alto: dec(200) });
    if (tipo === 'manual') Object.assign(it, { pz: Math.floor(azar() * 5) + 1, pu: dec(5000) });
    const a = T.lineTotal(it), b = H.cotLineTotal(it);
    if (Math.abs(a - b) > 0.001) malas.push({ it, a, b });
  }
  cierto('3,000 partidas al azar, con el material nuevo y el bastidor nuevo: mismo importe de los dos lados', !malas.length, JSON.stringify(malas.slice(0, 2)));
  eq('9 letras de 40 cm del aluminio anodizado nuevo: $38 × 40 × 9', [T.lineTotal({ tipo: 'letras', material: 'xanod1', comp: 'recta', luz: true, altura: 40, n: 9 }),
    H.cotLineTotal({ tipo: 'letras', material: 'xanod1', comp: 'recta', luz: true, altura: 40, n: 9 })], [13680, 13680]);
}

/* ============================================================================ */
console.log('\nOCULTO NO SE OFRECE, PERO COBRA; NUEVO HEREDA DE SU BASE');
eq('el acero ya no se ofrece en una partida nueva', plano(T.ofrecer(T.MATERIALES, 'al-paint')).some(m => m.key === 'acero'), false);
eq('pero sí en la partida que ya es de acero', plano(T.ofrecer(T.MATERIALES, 'acero')).some(m => m.key === 'acero'), true);
eq('y esa partida sigue cobrando: 9 letras de 40 cm de acero', T.lineTotal({ tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 9 }), 55 * 40 * 9);
eq('el anodizado se fabrica como el pintado', T.baseDe(T.matOf('xanod1')), 'al-paint');
eq('y trae su iluminación', T.matOf('xanod1').ilum, 'LED posterior (cálida/fría)');
{
  const antes = JSON.stringify(plano(T.MATERIALES));
  const rota = plano(tabla); rota.filas = rota.filas.filter(f => f.clave !== 'al-brush');
  cierto('una tabla a la que le falta un material de fábrica no se aplica', T.aplicarTarifas(rota) === false);
  cierto('y deja el catálogo como estaba', JSON.stringify(plano(T.MATERIALES)) === antes);
  cierto('una que no es tabla, tampoco', T.aplicarTarifas({ filas: 'x' }) === false && T.aplicarTarifas(null) === false);
}

/* ============================================================================ */
console.log('\nLA CAJA NO PIERDE SU TIPO CUANDO SUBE SU PRECIO');
eq('la estándar ya es de $4,200', T.cajaOf(4200).key, 'std');
eq('una caja elegida con el chip guarda su clave y se sigue llamando estándar', T.cajaDe({ tarifa: 3900, caja: 'std' }).key, 'std');
eq('una caja de antes, sin clave y a $3,900, queda sin apellido: esa tarifa ya no es del catálogo', T.cajaDe({ tarifa: 3900 }), null);
eq('la nube se sigue encontrando por su tarifa', T.cajaDe({ tarifa: 4600 }).key, 'nube');

/* ============================================================================ */
console.log('\nLA PLATAFORMA LEE LA MISMA TABLA QUE GUARDÓ EL COTIZADOR');
{
  globalThis.localStorage = { getItem: k => (k === 'al3d_tarifas' ? JSON.stringify(tabla) : null), setItem() {}, removeItem() {} };
  const Cat = await import('../js/datos/catalogo-precios.js?tarifas=' + Date.now());
  eq('el material nuevo tiene nombre en la plataforma', (Cat.matOf('xanod1') || {}).label, 'Aluminio anodizado');
  eq('y sabe de qué se fabrica', Cat.baseDe(Cat.matOf('xanod1')), 'al-paint');
  eq('el bastidor nuevo también', Cat.baseDe(Cat.basOf('xpvc22')), 'lamina');
  const { derivar } = await import('../js/datos/material.js?tarifas=' + Date.now());
  const semilla = JSON.parse(leer('datos/semilla.json'));
  const cts = Object.fromEntries(semilla.constantes.map(c => [c.clave, c.valor]));
  const norm = m => ({ ...m, merma_pct: m.merma_pct !== undefined ? m.merma_pct : m.merma, unidad_consumo: String(m.unidad_consumo || '').replace('m²', 'm2') });
  const mats = Object.fromEntries(semilla.materiales.map(m => [m.id, norm(m)]));
  const ids = it => (derivar([it], cts, Cat.catalogos(), mats) || { lineas: [] }).lineas.map(l => l.material_id || l.id || l.sku).sort().join();
  const letra = m => ({ id: 1, tipo: 'letras', material: m, comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 9 });
  cierto('el material de compra del anodizado es el del pintado (canto incluido)', ids(letra('xanod1')) === ids(letra('al-paint')) && ids(letra('al-paint')).length > 0,
    ids(letra('xanod1')) + ' vs ' + ids(letra('al-paint')));
}

/* Al final a propósito: el importador carga js/datos/catalogo-precios.js, y la plataforma (arriba) tenía que cargarlo YA con la tabla. */
{
  const { FABRICA_TARIFAS } = await import('../scripts/importador/plan.mjs');
  const claves = {};
  plano(H.COT_TARIFAS_FABRICA).forEach(r => { (claves[r[0]] = claves[r[0]] || []).push(r[1]); });
  eq('el importador de la copia diaria conoce las mismas claves de fábrica', plano(FABRICA_TARIFAS), claves);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
