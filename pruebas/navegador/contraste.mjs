/* NADA DE LO QUE LLEVA TEXTO BAJA DE 4.5:1 — MEDIDO SOBRE EL RENDER, NO SOBRE LA HOJA.

   El README dice que esta app mide su contraste rasterizando cada pieza y contando sus
   píxeles, y explica por qué no se puede hacer de otra forma: con degradados por todos lados,
   leer `backgroundColor` devuelve «transparent». Ahí salió lo que hunde a la mitad de los
   diseños de este estilo — `#6090f8` con blanco encima da 3,07:1 — y de ahí salió la regla
   escrita: de `--n5` para arriba, ningún tono de la rampa lleva texto.

   Lo que faltaba era que la medición viviera en el repo. Se hacía a mano, una vez, y después
   cada regla de color nueva se aprobaba a ojo. Esta revisión encontró dos así, las dos
   escritas con la intención correcta:

   · Una pista dentro del botón de relleno separada con `opacity:.82`, que pasaba —5,1:1— pero
     pagaba contraste por una jerarquía que ya hacían el tamaño y el peso.
   · Un `<summary>` que quedó en azul de marca porque `details.ai-cfg summary` tiene la misma
     especificidad y vive más abajo en la hoja: 4,48:1, por debajo del mínimo, y encima el azul
     ahí no significaba nada. A ojo se ve bien; medido, no pasa.

   El método es el del README: se rasteriza el elemento, se agrupan sus colores, el más
   frecuente es el fondo y el que más se le aleja en luminancia es el texto. Sobre una pieza
   chica el par puede salir invertido —lee el azul como fondo y el blanco como texto— y no
   importa: la razón entre dos colores es la misma en los dos sentidos.

   Sin dependencias: el PNG se descomprime con el zlib de node.

   Necesita navegador y servidor, así que va en pruebas/navegador/:

     pruebas/correr.sh --navegador
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { inflateSync } from 'zlib';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const MINIMO = 4.5;

/* ---------- Leer un PNG de Chromium: 8 bits, RGBA, con sus filtros por scanline ---------- */
function leerPNG(buf) {
  let i = 8, idat = [], w, h, bd, ct;
  while (i < buf.length) {
    const ln = buf.readUInt32BE(i), tipo = buf.toString('ascii', i + 4, i + 8);
    const dat = buf.subarray(i + 8, i + 8 + ln);
    i += 12 + ln;
    if (tipo === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); bd = dat[8]; ct = dat[9]; }
    else if (tipo === 'IDAT') idat.push(dat);
    else if (tipo === 'IEND') break;
  }
  if (bd !== 8) throw new Error('PNG de ' + bd + ' bits: esta prueba espera 8');
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!bpp) throw new Error('tipo de color ' + ct + ' no soportado');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    if (f === 1) for (let x = bpp; x < stride; x++) line[x] = (line[x] + line[x - bpp]) & 255;
    else if (f === 2) for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255;
    else if (f === 3) for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255;
    }
    else if (f === 4) for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(px, y * stride); prev = line;
  }
  return { w, h, bpp, px };
}

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const razon = (a, b) => { const l1 = L(a), l2 = L(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };

function medir(buf) {
  const { w, h, bpp, px } = leerPNG(buf);
  const cuenta = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * bpp;
    if (bpp === 4 && px[o + 3] < 200) continue;                 // lo transparente no es fondo
    const k = (px[o] >> 2) + ',' + (px[o + 1] >> 2) + ',' + (px[o + 2] >> 2);
    const v = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++; v.r += px[o]; v.g += px[o + 1]; v.b += px[o + 2];
    cuenta.set(k, v);
  }
  const cols = [...cuenta.values()].map(v => ({ n: v.n, c: [v.r / v.n, v.g / v.n, v.b / v.n] }))
    .sort((a, b) => b.n - a.n);
  if (cols.length < 2) return null;
  const bg = cols[0];
  let fg = null, mejor = -1;
  for (const c of cols.slice(0, 60)) {
    const d = Math.abs(L(c.c) - L(bg.c));
    if (d > mejor) { mejor = d; fg = c; }
  }
  return { r: razon(fg.c, bg.c), fg: fg.c.map(Math.round), bg: bg.c.map(Math.round) };
}

/* ---------- La app, capturada y autorizada ---------- */
const nav = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
/* deviceScaleFactor 3: con 1 px por píxel el texto chico es casi todo antialias y la medida
   baila. A ×3 hay píxeles de tinta plena que contar. */
const ctx = await nav.newContext({viewport:{width:1440,height:1000}, locale:'es-MX', deviceScaleFactor:3});
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

await p.goto(B + '/index.html', {waitUntil:'load'});
await p.evaluate(() => { try { localStorage.clear(); } catch(_) {} });
await p.goto(B + '/index.html', {waitUntil:'load'});
await p.waitForTimeout(1100);
await p.fill('#f-cli', 'Farmacia San Juan');
await p.fill('#f-tel', '33 1234 5678');
await p.fill('#f-proy', 'Letrero de fachada sucursal Centro');
await p.fill('#f-dir-raw', 'Av. Vallarta 1234');
await p.waitForTimeout(400);

async function comprobar(nombre, sel) {
  const el = await p.$(sel);
  if (!el) { mal(nombre + ': el selector «' + sel + '» no encontró nada — ¿cambió el marcado?'); return; }
  let buf;
  try { buf = await el.screenshot({timeout:5000}); }
  catch (_) { mal(nombre + ': «' + sel + '» no se pudo rasterizar (¿oculto?)'); return; }
  const m = medir(buf);
  if (!m) { console.log('  · ' + nombre + ': un solo color, nada que medir'); return; }
  const txt = `${nombre}: ${m.r.toFixed(2)}:1  rgb(${m.fg}) / rgb(${m.bg})`;
  m.r >= MINIMO ? bien(txt) : mal(txt + `  ← por debajo de ${MINIMO}:1`);
}

console.log('\nPANTALLA 1 · CLIENTE');
await comprobar('la etiqueta de un campo', '#fld-cli label');
await comprobar('lo que se teclea en un campo', '#f-cli');
await comprobar('el botón que cierra el paso 1', '#p1-btn');

await p.evaluate(() => irAPaso(2));
await p.waitForTimeout(500);

/* El ámbar de «Sin elegir» solo existe mientras el grupo está sin elegir, así que se mide
   ANTES de capturar la partida. */
console.log('\nUNA PARTIDA RECIÉN NACIDA');
await comprobar('«Sin elegir», en ámbar', '.optgrp-v.falta');
await comprobar('lo que falta en la fórmula', '.formula');

await p.click('.chip:has-text("Acero Inoxidable")');
await p.fill('#h-1', '40'); await p.fill('#n-1', '8');
await p.waitForTimeout(500);

console.log('\nLA BARRA DE PASOS');
await comprobar('la pestaña en la que estás', '.paso-tab.on');
await comprobar('una pestaña ya hecha', '.paso-tab.hecho');
await comprobar('el nombre del cliente debajo de la pestaña', '.paso-tab.on .tx small');

console.log('\nPANTALLA 2 · PARTIDAS');
await comprobar('el chip elegido', '.chip.on');
await comprobar('un chip sin elegir', '.chips .chip:not(.on)');
await comprobar('el título de un grupo de opciones', '.optgrp-t');
await comprobar('la fórmula de la partida, ya completa', '.formula');
await comprobar('el nombre de una herramienta neutra', '.btn-scaler-open');

console.log('\nLA COLUMNA DEL DINERO');
await comprobar('«qué sigue» en la barra de completitud', '#prog-next');
await comprobar('el anticipo', '.anti label');
/* Mientras es borrador los importes salen difuminados a propósito —se captura delante del
   cliente—, así que medirlos tapados es medir el difuminado. Se destapan con el mismo botón
   que usa quien no tiene dedo ni ratón. */
await p.evaluate(() => togglePreciosALaVista());
await p.waitForTimeout(400);
await comprobar('el total neto, destapado', '#s-neto');
await comprobar('el subtotal, destapado', '#s-sub');
await comprobar('el importe de una partida', '.lt');
await p.evaluate(() => togglePreciosALaVista());
await p.waitForTimeout(300);

await p.evaluate(() => { autorizarYoMismo(); });
await p.waitForTimeout(500);
await p.evaluate(() => { const a = document.getElementById('a-name'); if (a) { a.value = 'Elías'; Q.autorizador = 'Elías'; } autorizar(); });
await p.waitForTimeout(900);

console.log('\nPASO 4 · LA ENTREGA');
await comprobar('el paso que toca', '#authbox .btn-pri');
await comprobar('su pista, dentro del relleno', '#authbox .btn-pri .hito-pista');
await comprobar('un paso que todavía no toca', '.btn-vta');
await comprobar('la nota de quién autorizó', '#authbox .authnote');
await comprobar('el resumen del pliegue de otras salidas', 'details.otras-salidas summary');
await p.evaluate(() => marcarHito('pdf'));
await p.waitForTimeout(600);
await comprobar('el nombre de un paso ya hecho', '.hito-hecho');
await comprobar('su fecha', '.hito-hecho .hito-fecha');

console.log('\nLO QUE AVISA DE UN PROBLEMA');
await p.evaluate(() => { _saveOk = false; pintarFolio(); });
await p.waitForTimeout(300);
await comprobar('«sin guardar» en la píldora del folio', '#folio');
await p.evaluate(() => { _saveOk = true; pintarFolio(); });
await p.waitForTimeout(200);
await p.evaluate(() => irAPaso(2));
await p.waitForTimeout(500);
await comprobar('el aviso del paso 2 congelado', '#cand-partidas');

console.log(fallos ? '\n' + fallos + ' PIEZA(S) POR DEBAJO DE ' + MINIMO + ':1'
                   : '\nNada de lo que lleva texto baja de ' + MINIMO + ':1.');
await nav.close();
process.exit(fallos ? 1 : 0);
