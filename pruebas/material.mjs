import { derivar } from '../js/datos/material.js';
import { readFileSync } from 'fs';
import { catalogos } from '../js/datos/catalogo-precios.js';

const semilla = JSON.parse(readFileSync(new URL('../datos/semilla.json', import.meta.url),'utf8'));
const cts = Object.fromEntries(semilla.constantes.map(c => [c.clave, c.valor]));
/* La semilla escribe `merma` y `m²`; el esquema del almacén usa `merma_pct` y `m2`.
   filaDesdeSemilla() hace esa traducción al sembrar, así que la prueba tiene que pasar por
   la misma forma o mide otra cosa: la primera versión de esto le pasó los objetos crudos a
   derivar() y «descubrió» que la merma no se aplicaba, cuando lo que no se aplicaba era la
   traducción. */
const norm = m => ({ ...m, merma_pct: m.merma_pct !== undefined ? m.merma_pct : m.merma,
                     unidad_consumo: String(m.unidad_consumo||'').replace('m²','m2') });
const mats = Object.fromEntries(semilla.materiales.map(m => [m.id, norm(m)]));

/* Y el invariante de verdad: ningún material puede quedarse sin merma declarada, con
   cualquiera de los dos nombres. Una merma ausente se lee como cero y hace comprar 25%
   menos acrílico del que se va a gastar, sin decir nada. */
const sinMerma = semilla.materiales.filter(m => m.merma === undefined && m.merma_pct === undefined);
if (sinMerma.length) { console.log('materiales sin merma declarada: ' + sinMerma.map(m=>m.id).join(', ')); process.exit(1); }

// El ejemplo obligado de la sección 6.6: 8 letras de 40 cm de acero inoxidable,
// rectas, con luz fría. Venta: $55 × 40 × 8 = $17,600.
const items = [{ id:1, tipo:'letras', material:'acero', comp:'recta', luz:true,
                 ilumTipo:'fria', altura:40, n:8, showInPdf:true }];

const r = derivar(items, cts, catalogos(), mats);
if (!r || !Array.isArray(r.lineas)) { console.log('derivar() no devolvió {lineas}. Devolvió:', r); process.exit(1); }

/* Los dos valores de piezas contadas NO son los de la tabla del §6.6 del documento (0.44 y
   0.64): esa tabla se saltó el paso de la merma en las piezas que se cuentan, aunque el
   §6.4 dice que la conversión es pareja —consumo ÷ (1 − merma) ÷ factor— y la semilla les
   declara 3% con su origen escrito. Manda la aritmética del contrato y el documento se
   corrigió. Un módulo LED sí se rompe al soldarlo; un separador sí se cae al piso. */
const ESPERADO = {
  'acr-3mm':     { compra: 0.54, u:'lamina' },
  'fleje-inox':  { compra: 0.29, u:'lamina' },
  'led-6500':    { compra: 0.45, u:'caja'   },
  'fuente-60':   { compra: 1,    u:'unidad' },
  'separador-20':{ compra: 0.66, u:'bolsa'  },
  'silicon':     { compra: 1.07, u:'unidad' },
};
let fallos = 0;
console.log('8 letras de 40 cm · acero inoxidable · rectas · luz fría\n');
for (const l of r.lineas) {
  const e = ESPERADO[l.material_id];
  const marca = !e ? '  (extra)'
    : Math.abs(l.cantidad_compra - e.compra) <= 0.011 ? '  ✓'
    : `  ✗ esperaba ${e.compra}`;
  if (e && marca.startsWith('  ✗')) fallos++;
  console.log('  ' + (l.material_id||'?').padEnd(14) +
    String(Number(l.cantidad_compra||0).toFixed(2)).padStart(7) + ' ' + (l.unidad_compra||'').padEnd(8) +
    (l.confianza||'').padEnd(14) + marca);
  if (l.formula) console.log('      ' + l.formula);
}
for (const id of Object.keys(ESPERADO)) {
  if (!r.lineas.some(l => l.material_id === id)) { console.log('  ✗ FALTA la línea de ' + id); fallos++; }
}
console.log('\navisos:', (r.avisos||[]).length ? r.avisos.join(' | ') : 'ninguno');
console.log('sin material:', (r.sinMaterial||[]).length);

// Las tres reglas de la sección 6.0
console.log('\n— las tres reglas —');
const sinLuz = derivar([{...items[0], luz:false}], cts, catalogos(), mats);
const led = sinLuz.lineas.filter(l => /^led-|^fuente-/.test(l.material_id));
if (led.length) { console.log('  ✗ luz:false debe dar CERO LED y CERO fuentes; dio ' + led.length); fallos++; }
else console.log('  ✓ luz:false → cero LED y cero fuentes (el −20% es dinero, no material)');

// Caja de 0.3 m²: se COBRA 1 m² y se FABRICA con 0.3
const chica = derivar([{id:2,tipo:'caja',ancho:60,alto:50,tarifa:3900,luz:true,showInPdf:true}], cts, catalogos(), mats);
const cara = chica.lineas.find(l => l.material_id === 'acr-6mm');
if (!cara) { console.log('  ✗ la caja no derivó cara de acrílico'); fallos++; }
else {
  const m2 = 0.60*0.50;                       // 0.30 m² reales
  const tope = m2 / 0.80 / (1-0.25) * 1.05;    // aprovechamiento + merma, con holgura
  const ok = cara.cantidad_consumo <= tope;
  console.log((ok?'  ✓':'  ✗') + ' caja de 0.3 m²: material sobre el área REAL (' +
    cara.cantidad_consumo.toFixed(3) + ' m² ≤ ' + tope.toFixed(3) + '), no sobre el m² mínimo cobrado');
  if (!ok) fallos++;
}

// showInPdf:false se cobra Y se fabrica
const oculta = derivar([{...items[0], showInPdf:false}], cts, catalogos(), mats);
if (!oculta.lineas.length) { console.log('  ✗ showInPdf:false NO debe filtrar: esas partidas se fabrican'); fallos++; }
else console.log('  ✓ showInPdf:false sigue derivando material (se cobra y se fabrica)');

// Una partida manual no tiene material calculable, y se dice
const man = derivar([{id:9,tipo:'manual',pz:1,pu:2500}], cts, catalogos(), mats);
if (man.lineas.length) { console.log('  ✗ una partida manual no debe derivar material'); fallos++; }
else console.log('  ✓ partida manual → sin material, y va a sinMaterial (' + (man.sinMaterial||[]).length + ')');

/* Lo que no cabe en la hoja. Hasta septiembre de 2026 solo se comparaba la medida MAYOR con
   el largo: una caja de 130 × 130 salía «exacta» y sin junta —130 < 244— cuando la lámina
   tiene 122 de ancho y la cara no cabe ni girándola. */
console.log('\n— lo que no cabe en la hoja —');
const junta = (t, it, re, debe) => {
  const d = derivar([it], cts, catalogos(), mats);
  const hay = d.avisos.some(a => re.test(a));
  console.log((hay === debe ? '  ✓ ' : '  ✗ ') + t + (hay ? ' → ' + d.avisos.find(a => re.test(a)) : ''));
  if (hay !== debe) fallos++;
};
junta('caja 130 × 130: la cara no cabe a lo ancho de 1.22', {id:3,tipo:'caja',ancho:130,alto:130,tarifa:3900,luz:true}, /Acrílico blanco 6 mm.*no cabe ni girándola/, true);
junta('bastidor de alucobond 200 × 130 en hoja de 1.25 × 2.50', {id:4,tipo:'bastidor',bas:'alucobond',ancho:200,alto:130}, /Alucobond.*no cabe ni girándola/, true);
junta('bastidor de alucobond 120 × 240, de pie: cabe girándolo', {id:5,tipo:'bastidor',bas:'alucobond',ancho:120,alto:240}, /no cabe|junta/, false);
junta('bastidor de lámina 295 × 100: lo largo sí pide la hoja de 3.05', {id:6,tipo:'bastidor',bas:'lamina',ancho:295,alto:100}, /hoja más larga/, true);
junta('8 letras de 40 cm: caben de sobra', items[0], /junta/, false);

/* Y la tarifa a mano. El aviso dice «geometría estándar»; la cuenta usaba la de silueta para
   cualquier tarifa ≥ 4,600. Ahora la forma la dice el catálogo, y las dos cosas coinciden. */
const formulaCara = tarifa => (derivar([{id:7,tipo:'caja',ancho:100,alto:100,tarifa,luz:true}], cts, catalogos(), mats)
  .lineas.find(l => l.material_id === 'acr-6mm') || {}).formula || '';
const aMano = formulaCara(5200);
if (/silueta/.test(aMano) || !/0\.80 aprov/.test(aMano)) { console.log('  ✗ tarifa a mano de 5,200: dice estándar y debe calcular estándar → ' + aMano); fallos++; }
else console.log('  ✓ tarifa a mano de 5,200: se calcula con la geometría estándar que el aviso dice');
if (!/silueta/.test(formulaCara(4600))) { console.log('  ✗ la tarifa de silueta del catálogo debe usar el aprovechamiento de silueta'); fallos++; }
else console.log('  ✓ la de silueta del catálogo (4,600) sí desperdicia como silueta');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo cuadra con el documento.');
process.exit(fallos ? 1 : 0);
