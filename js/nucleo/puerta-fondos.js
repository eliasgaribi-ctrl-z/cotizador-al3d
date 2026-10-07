/* ============================================================================
   Los fondos de LIENZO de la puerta (tanda 3 del paquete «Pantalla animada AL3D Google»)
   ----------------------------------------------------------------------------
   Nueve fondos que se dibujan en vivo en un solo <canvas>: impresión 3D, semitono, corriente,
   grabado láser, mosaico, malla elástica, tablero de paletas, gotas y curvas de nivel. Los otros
   nueve (neón, plano, LED…) son de CSS y viven en js/nucleo/puerta.js y css/plataforma.css.

   Es la misma excepción aprobada a «nada se mueve solo» que los demás fondos: solo en la puerta.
   Lo carga puerta.js con import() cuando le toca uno de éstos, así que la puerta no depende de
   este archivo para abrir.

   Cada fondo es `{ init(w, h, reducido), draw(ctx, w, h, t, dt, P, estado, toques) }`.
   La lógica es la del prototipo (objeto R2 de «Puerta AL3D v2»), tal cual; lo que cambia es el
   bucle de abajo:
     · `P = {x, y, on, caja}` en px, suavizado: `on` sube a 1 con el dedo encima y baja a 0 al
       soltar. `caja` es el rectángulo de la caja de entrada, también suavizado (crece cuando
       salen los pasos o un aviso): lo usa 3a para poner sus piezas fuera de ella.
     · `toques` son los de este cuadro, en px.
     · Con movimiento reducido `dt = 0`: cada fondo pinta un cuadro fijo completo (la pieza
       impresa, el grabado terminado), sin seguir al dedo, y solo se vuelve a pintar si la
       pantalla cambia de tamaño.
     · Con la pestaña escondida no se pinta nada; sigue cuando la pestaña regresa.
   ============================================================================ */

const NZ = (x, y, t) => Math.sin(x * 1.3 + t * .6 + Math.sin(y * .7 - t * .3) * 1.5) * .5 + Math.sin(y * 1.1 - t * .4 + Math.sin(x * .9 + t * .2) * 1.2) * .5;
const GS = (d2, r) => Math.exp(-d2 / (r * r));
const RND = Math.random;
/* La letra de las cifras de la app (--f-cifra de css/sistema.css), leída al arrancar el fondo:
   si la tipografía de la app cambia, el lienzo cambia con ella. */
let LETRA = 'sans-serif';
const RR = (ctx, x, y, w, h, r) => { if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };

/** Los de fondo oscuro llevan encima una viñeta oscura; los claros, una azul muy tenue. */
export const OSCUROS = ['impresion', 'flujo', 'laser', 'malla', 'persianas'];

/* 3g · Las palabras del tablero de paletas.
   DECISIÓN PENDIENTE: Elías confirma los servicios. */
const PALABRAS = ['LETREROS', 'NEÓN', 'CORTE LÁSER', 'ACRÍLICO', 'VINIL', 'IMPRESIÓN 3D', 'ROTULACIÓN', 'CNC', 'LONAS', 'SEÑALÉTICA', 'DISPLAYS', 'AL3D', 'MDF', 'LETRAS 3D'];
const PALETA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÑ0123456789';
const renglon = (n) => { let s = ''; while (s.length < n + 16) s += PALABRAS[RND() * PALABRAS.length | 0] + '  '; const o = RND() * 12 | 0; return s.slice(o, o + n); };

export const LIENZOS = {
  /* 3a · Impresión 3D: «AL3D» se imprime capa por capa hasta llenar el contorno punteado. El
     cursor gira la pieza y cada toque cambia el color del filamento. Las dos piezas van fuera de
     la caja: a los lados si sobran más de 230 px por lado, si no arriba y abajo. Se acomodan
     alrededor de la caja de verdad (`P.caja`), no del 500 × 340 fijo del prototipo, y si ya no
     caben —un teléfono acostado— no se pintan debajo de la caja. */
  impresion: {
    init(w, h, reducido) {
      const NL = 56, mk = (lay) => ({ cols: new Uint8Array(NL), lay, th: 0, hold: 0, out: 0 });
      return { NL, ci: 0, A: mk(NL), B: mk(reducido ? NL : NL / 2 | 0) };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const FIL = [['#4267fe', '#2f4fd6'], ['#6290ff', '#4a74e0'], ['#341efd', '#2614c4'], ['#9db4ff', '#7d93df']];
      for (const q of taps) s.ci = (s.ci + 1) % FIL.length;
      const NL = s.NL;
      const paso = (p) => {
        if (p.lay >= NL) { p.hold += dt; if (p.hold > 2.6) { p.out += dt; if (p.out > .9) { p.lay = 0; p.th = 0; p.hold = 0; p.out = 0; } } }
        else { p.th += dt / .2; while (p.th >= 1) { p.th -= 1; p.cols[p.lay] = s.ci; if (++p.lay >= NL) { p.th = 0; break; } } }
      };
      if (dt > 0) { paso(s.A); paso(s.B); }
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * .75);
      bg.addColorStop(0, '#151a6e'); bg.addColorStop(1, '#05061a'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const ex = .45 + P.on * (P.x / w - .5) * 1.1, ey = -1 + P.on * (P.y / h - .5) * .5;
      const pieza = (p, cx, cy, fs) => {
        const TX = 'AL3D';
        ctx.font = '700 ' + fs + 'px ' + LETRA; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        const tw = ctx.measureText(TX).width, cap = fs * .72, lh = fs * .4 / NL;
        const x0 = cx - tw / 2 - ex * NL * lh / 2, y0 = cy + cap / 2 - ey * NL * lh / 2;
        const pos = (k) => [x0 + ex * k * lh, y0 + ey * k * lh];
        ctx.globalAlpha = 1 - p.out / .9;
        const px = x0 - fs * .2, pw = tw + fs * .4, pd = fs * .18;
        ctx.fillStyle = 'rgba(98,144,255,.12)'; ctx.strokeStyle = 'rgba(157,180,255,.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px - pd, y0 + pd * .6); ctx.lineTo(px + pw - pd, y0 + pd * .6); ctx.lineTo(px + pw + pd, y0 - pd * .6); ctx.lineTo(px + pd, y0 - pd * .6); ctx.closePath(); ctx.fill(); ctx.stroke();
        const [gx, gy] = pos(NL - 1); ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(157,180,255,.4)'; ctx.strokeText(TX, gx, gy); ctx.setLineDash([]);
        const n = Math.min(p.lay, NL);
        for (let k = 0; k < n; k++) { const [x, y] = pos(k), c = FIL[p.cols[k]]; ctx.fillStyle = k % 2 ? c[1] : c[0]; ctx.fillText(TX, x, y); }
        if (n) { const [x, y] = pos(n - 1); ctx.fillStyle = 'rgba(223,230,255,.3)'; ctx.fillText(TX, x, y); }
        let nx = null, ny = null;
        if (p.lay < NL) {
          const [x, y] = pos(p.lay), dir = p.lay % 2 ? -1 : 1, sw = dir > 0 ? p.th : 1 - p.th, edge = x - fs * .05 + (tw + fs * .1) * sw;
          ctx.save(); ctx.beginPath(); if (dir > 0) ctx.rect(0, 0, edge, h); else ctx.rect(edge, 0, w - edge, h); ctx.clip();
          ctx.fillStyle = '#eef2ff'; ctx.shadowColor = '#9db4ff'; ctx.shadowBlur = 12; ctx.fillText(TX, x, y); ctx.restore();
          nx = edge; ny = y - cap * .5;
          ctx.fillStyle = 'rgba(223,230,255,.85)'; ctx.fillRect(edge - 1, y - cap - 4, 2, cap + 8);
        }
        const u = fs / 100, top = pos(NL - 1)[1] - cap, hy = top - 34 * u, hx = nx == null ? cx : nx;
        ctx.fillStyle = 'rgba(157,180,255,.22)'; ctx.fillRect(px - pd, hy - 2.5 * u, pw + pd * 2, 5 * u);
        ctx.fillStyle = '#4267fe'; ctx.beginPath(); RR(ctx, hx - 16 * u, hy - 14 * u, 32 * u, 22 * u, 5 * u); ctx.fill();
        ctx.fillStyle = FIL[s.ci][0]; ctx.beginPath(); ctx.arc(hx, hy - 3 * u, 4 * u, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#9db4ff'; ctx.beginPath(); ctx.moveTo(hx - 6 * u, hy + 8 * u); ctx.lineTo(hx + 6 * u, hy + 8 * u); ctx.lineTo(hx, hy + 19 * u); ctx.closePath(); ctx.fill();
        if (nx != null) { ctx.strokeStyle = 'rgba(223,230,255,.55)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(hx, hy + 19 * u); ctx.lineTo(hx, ny - cap * .5); ctx.stroke(); ctx.setLineDash([]); }
        ctx.globalAlpha = 1;
      };
      const k = P.caja || { x: (w - 420) / 2, y: (h - 340) / 2, w: 420, h: 340 };
      const izq = k.x, der = w - k.x - k.w, arriba = k.y, abajo = h - k.y - k.h;
      if (w > h && Math.min(izq, der) > 230) {
        const fs = Math.min(Math.min(izq, der) * .27, h * .18);
        pieza(s.A, izq / 2, h * .38, fs); pieza(s.B, w - der / 2, h * .64, fs);
      } else {
        const zona = Math.min(arriba, abajo), fs = Math.min(w * .2, zona * .42);
        if (zona >= 110) { pieza(s.A, w / 2, arriba * .55, fs); pieza(s.B, w / 2, h - abajo * .5, fs); }
      }
    },
  },
  /* 3b · Semitono: dos tramas de imprenta que se cruzan. Los puntos engordan bajo el cursor y
     cada toque manda una onda de tinta. */
  semitono: {
    init() { return { rip: [] }; },
    draw(ctx, w, h, t, dt, P, s, taps) {
      for (const q of taps) s.rip.push({ x: q.x, y: q.y, t0: t });
      s.rip = s.rip.filter(r => t - r.t0 < 1.8);
      /* Lo de cada onda se calcula una vez por cuadro, y un punto lejos del frente de la onda (o
         del cursor) no la pide: su campana ahí ya vale menos de una diezmilésima. */
      const ondas = s.rip.map(r => { const age = (t - r.t0) / 1.8; return { x: r.x, y: r.y, f: age * 700, k: (1 - age) * .9 }; });
      const cerca = P.on > .01;
      ctx.fillStyle = '#f3f5ff'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .8;
      const g = w < 600 ? 14 : 18, D = Math.hypot(w, h) / 2 + g, cx = w / 2, cy = h / 2;
      for (const [an, col, ph] of [[.26, '#6290ff', 0], [1.31, '#341efd', 2.1]]) {
        const co = Math.cos(an), si = Math.sin(an); ctx.fillStyle = col; ctx.beginPath();
        for (let u = -D; u <= D; u += g) for (let v = -D; v <= D; v += g) {
          const x = cx + u * co - v * si, y = cy + u * si + v * co;
          if (x < -g || x > w + g || y < -g || y > h + g) continue;
          let val = .5 + .5 * NZ(x * .004, y * .004, t * .4 + ph);
          if (cerca) { const d2 = (x - P.x) ** 2 + (y - P.y) ** 2; if (d2 < 202500) val += P.on * .9 * GS(d2, 150); }
          for (const r of ondas) { const e = Math.hypot(x - r.x, y - r.y) - r.f; if (e < 130 && e > -130) val += r.k * GS(e * e, 40); }
          const rr = g * .5 * Math.min(1, Math.max(.06, val * .8));
          ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 6.283);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    },
  },
  /* 3c · Corriente: cientos de hilos de luz siguen una corriente; el cursor la hace girar en
     remolino y un toque los dispersa. */
  flujo: {
    init(w, h) {
      const n = Math.round(Math.min(900, Math.max(260, w * h / 1700))), p = [];
      for (let i = 0; i < n; i++) p.push({ x: RND() * w, y: RND() * h, vx: 0, vy: 0, l: RND() * 6 });
      return { p, ok: false };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const COL = ['rgba(98,144,255,.55)', 'rgba(157,180,255,.5)', 'rgba(66,103,254,.65)', 'rgba(255,255,255,.45)'];
      const paso = (d, tt) => {
        const ps = COL.map(() => new Path2D());
        s.p.forEach((a, i) => {
          const an = NZ(a.x * .0028, a.y * .0028, tt * .15) * 3.2;
          let tx = Math.cos(an) * 55, ty = Math.sin(an) * 55;
          if (P.on > .01) { const dx = a.x - P.x, dy = a.y - P.y, r = Math.hypot(dx, dy) + .01; if (r < 240) { const k = (1 - r / 240) * P.on; tx += (-dy / r * 260 - dx / r * 40) * k; ty += (dx / r * 260 - dy / r * 40) * k; } }
          const m = Math.min(1, d * 2.2); a.vx += (tx - a.vx) * m; a.vy += (ty - a.vy) * m;
          const ox = a.x, oy = a.y; a.x += a.vx * d; a.y += a.vy * d; a.l -= d;
          if (a.x < -10 || a.x > w + 10 || a.y < -10 || a.y > h + 10 || a.l < 0) { a.x = RND() * w; a.y = RND() * h; a.vx = a.vy = 0; a.l = 3 + RND() * 5; return; }
          ps[i % 4].moveTo(ox, oy); ps[i % 4].lineTo(a.x, a.y);
        });
        ctx.lineWidth = 1.2; ps.forEach((p, i) => { ctx.strokeStyle = COL[i]; ctx.stroke(p); });
      };
      if (!s.ok) { ctx.fillStyle = '#080920'; ctx.fillRect(0, 0, w, h); for (let k = 0; k < 50; k++) paso(1 / 30, t - (50 - k) / 30); s.ok = true; }
      if (dt > 0) {
        ctx.fillStyle = 'rgba(8,9,32,.07)'; ctx.fillRect(0, 0, w, h);
        for (const q of taps) for (const a of s.p) { const dx = a.x - q.x, dy = a.y - q.y, r = Math.hypot(dx, dy) + .01; if (r < 300) { const k = 520 * (1 - r / 300); a.vx += dx / r * k; a.vy += dy / r * k; } }
        paso(dt, t);
      }
    },
  },
  /* 3d · Grabado láser: el cabezal graba fila por fila un patrón de «AL3D». Con el dedo se graba
     a mano y un toque quema un círculo. Con movimiento reducido sale el grabado terminado. */
  laser: {
    init(w, h, reducido) {
      const g = w < 600 ? 6 : 7, C = Math.ceil(w / g), R = Math.ceil(h / g), n = C * R;
      const mask = new Uint8Array(n), eng = new Float32Array(n), heat = new Float32Array(n);
      const oc = document.createElement('canvas'); oc.width = C; oc.height = R; const ox = oc.getContext('2d');
      const fs = Math.max(9, Math.round(Math.min(C * .2, R * .14))); ox.font = '800 ' + fs + 'px ' + LETRA; ox.textBaseline = 'middle'; ox.fillStyle = '#000';
      const tw = ox.measureText('AL3D').width + fs * .9;
      for (let r = 0, y = fs * .8; y < R + fs; y += fs * 1.45, r++) for (let x = (r % 2) * -tw / 2; x < C; x += tw) ox.fillText('AL3D', x, y);
      const px = ox.getImageData(0, 0, C, R).data; for (let i = 0; i < n; i++) mask[i] = px[i * 4 + 3] > 110 ? 1 : 0;
      if (reducido) eng.set(mask);
      return { g, C, R, mask, eng, heat, row: reducido ? R - 1 : 0, col: 0, acc: 0, hold: reducido ? 1 : 0, fade: 1, fading: false, humo: [] };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const { g, C, R, mask, eng, heat } = s;
      const quema = (x, y, rad) => { const c0 = Math.max(0, (x - rad) / g | 0), c1 = Math.min(C - 1, (x + rad) / g | 0), r0 = Math.max(0, (y - rad) / g | 0), r1 = Math.min(R - 1, (y + rad) / g | 0); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if ((c * g + g / 2 - x) ** 2 + (r * g + g / 2 - y) ** 2 < rad * rad) { eng[r * C + c] = 1; heat[r * C + c] = 1; } };
      let fuego = false;
      if (dt > 0) {
        if (s.hold > 0) { s.hold -= dt; if (s.hold <= 0) s.fading = true; }
        else if (s.fading) { s.fade -= dt * .8; if (s.fade <= 0) { eng.fill(0); s.fade = 1; s.fading = false; s.row = 0; s.col = 0; } }
        else {
          s.acc += dt * (R / 14) * C;
          while (s.acc >= 1) {
            s.acc--; const i = s.row * C + s.col;
            if (mask[i]) { eng[i] = 1; heat[i] = 1; fuego = true; }
            if (++s.col >= C) { s.col = 0; if (++s.row >= R) { s.row = R - 1; s.hold = 2.5; break; } }
          }
        }
        const k = Math.exp(-dt * 2.5); for (let i = 0; i < heat.length; i++) if (heat[i]) heat[i] = heat[i] < .03 ? 0 : heat[i] * k;
        if (P.on > .5) quema(P.x, P.y, 14);
      }
      for (const q of taps) quema(q.x, q.y, 46);
      ctx.fillStyle = '#07081f'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = s.fade;
      ctx.fillStyle = 'rgba(66,103,254,.6)'; ctx.beginPath();
      for (let i = 0; i < eng.length; i++) if (eng[i]) ctx.rect((i % C) * g + 1, (i / C | 0) * g + 1, g - 2, g - 2);
      ctx.fill();
      ctx.fillStyle = '#eef2ff';
      for (let i = 0; i < heat.length; i++) if (heat[i] > .05) { ctx.globalAlpha = heat[i] * s.fade; ctx.fillRect((i % C) * g + 1, (i / C | 0) * g + 1, g - 2, g - 2); }
      ctx.globalAlpha = 1;
      if (!s.hold && !s.fading) {
        const hx = s.col * g, hy = s.row * g + g / 2;
        ctx.fillStyle = 'rgba(157,180,255,.12)'; ctx.fillRect(0, hy - 1, w, 2);
        ctx.strokeStyle = fuego ? 'rgba(200,214,255,.5)' : 'rgba(157,180,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, hy); ctx.stroke();
        const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, 34); gl.addColorStop(0, fuego ? 'rgba(200,214,255,.8)' : 'rgba(157,180,255,.35)'); gl.addColorStop(1, 'rgba(157,180,255,0)');
        ctx.fillStyle = gl; ctx.fillRect(hx - 34, hy - 34, 68, 68);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, 6.283); ctx.fill();
        if (fuego && dt > 0 && s.humo.length < 60) s.humo.push({ x: hx, y: hy, vx: (RND() - .5) * 20, vy: -20 - RND() * 25, l: 1 });
      }
      s.humo = s.humo.filter(p => (p.l -= dt * .7) > 0);
      for (const p of s.humo) { p.x += p.vx * dt; p.y += p.vy * dt; ctx.fillStyle = 'rgba(157,180,255,' + (p.l * .12).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 5 + (1 - p.l) * 16, 0, 6.283); ctx.fill(); }
      if (P.on > .05) { ctx.strokeStyle = 'rgba(157,180,255,' + (.8 * P.on).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(P.x, P.y, 18, 0, 6.283); ctx.stroke(); }
    },
  },
  /* 3e · Mosaico: losetas que se voltean en ola desde las esquinas. Las que se tocan se dan la
     vuelta y un toque lanza la ola desde ahí. */
  mosaico: {
    init(w, h) {
      const g = w < 600 ? 46 : 64, C = Math.ceil(w / g) + 1, R = Math.ceil(h / g) + 1, n = C * R;
      const col = new Uint8Array(n); for (let i = 0; i < n; i++) col[i] = (i * 7919 + (i >> 3) * 31) % 3;
      return { g, C, R, ang: new Float32Array(n), tgt: new Float32Array(n), due: new Float32Array(n).fill(-1), col, next: 1, esq: 0, hover: -1 };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const { g, C, R, ang, tgt, due, col } = s, n = C * R;
      const ola = (ox, oy) => { for (let i = 0; i < n; i++) due[i] = t + Math.hypot((i % C) * g + g / 2 - ox, (i / C | 0) * g + g / 2 - oy) / 700; s.next = t + 5; };
      const voltea = (i) => { tgt[i] = tgt[i] > 1 ? 0 : Math.PI; };
      if (dt > 0 && t >= s.next) { const k = s.esq++ % 4; ola(k % 2 ? w : 0, k > 1 ? h : 0); }
      for (const q of taps) ola(q.x, q.y);
      if (P.on > .5) { const i = Math.floor(P.y / g) * C + Math.floor(P.x / g); if (i !== s.hover && i >= 0 && i < n) { s.hover = i; voltea(i); } } else s.hover = -1;
      const a = dt ? Math.min(1, dt * 6) : 1;
      ctx.fillStyle = '#e3e8ff'; ctx.fillRect(0, 0, w, h);
      const B = ['#4267fe', '#341efd', '#6290ff'];
      for (let i = 0; i < n; i++) {
        if (due[i] >= 0 && due[i] <= t) { voltea(i); due[i] = -1; }
        ang[i] += (tgt[i] - ang[i]) * a;
        const cs = Math.cos(ang[i]), sy = Math.max(.04, Math.abs(cs)), hh = (g - 6) * sy;
        const x = (i % C) * g + 3, y = (i / C | 0) * g + g / 2 - hh / 2;
        ctx.fillStyle = cs >= 0 ? '#f7f8ff' : B[col[i]]; ctx.beginPath(); RR(ctx, x, y, g - 6, hh, 6); ctx.fill();
        if (sy < .98) { ctx.fillStyle = 'rgba(10,11,38,' + ((1 - sy) * .3).toFixed(3) + ')'; ctx.fill(); }
      }
    },
  },
  /* 3f · Malla elástica: una red tensa que se hunde bajo el cursor y regresa a su lugar; un toque
     la sacude como tambor. */
  malla: {
    init(w, h) {
      const g = w < 600 ? 30 : 38, C = Math.ceil(w / g) + 3, R = Math.ceil(h / g) + 3, n = C * R;
      const rx = new Float32Array(n), ry = new Float32Array(n);
      for (let i = 0; i < n; i++) { rx[i] = ((i % C) - 1) * g; ry[i] = ((i / C | 0) - 1) * g; }
      return { C, R, n, rx, ry, x: rx.slice(), y: ry.slice(), vx: new Float32Array(n), vy: new Float32Array(n) };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const { C, n, rx, ry, x, y, vx, vy } = s;
      for (const q of taps) for (let i = 0; i < n; i++) { const dx = x[i] - q.x, dy = y[i] - q.y, d = Math.hypot(dx, dy) + .01; if (d < 320) { const k = 900 * (1 - d / 320); vx[i] += dx / d * k; vy[i] += dy / d * k; } }
      if (dt > 0) for (let sub = 0; sub < 2; sub++) {
        const h2 = dt / 2;
        for (let i = 0; i < n; i++) {
          const tx = rx[i] + Math.sin(t * .9 + ry[i] * .013) * 5, ty = ry[i] + Math.cos(t * .8 + rx[i] * .011) * 5;
          let ax = (tx - x[i]) * 45 - vx[i] * 5, ay = (ty - y[i]) * 45 - vy[i] * 5;
          if (P.on > .01) { const dx = x[i] - P.x, dy = y[i] - P.y, d = Math.hypot(dx, dy) + .01; if (d < 170) { const k = 3200 * (1 - d / 170) * P.on; ax += dx / d * k; ay += dy / d * k; } }
          vx[i] += ax * h2; vy[i] += ay * h2; x[i] += vx[i] * h2; y[i] += vy[i] * h2;
        }
      }
      const bg = ctx.createRadialGradient(w / 2, h * .45, 0, w / 2, h * .45, Math.max(w, h) * .7); bg.addColorStop(0, '#13166b'); bg.addColorStop(1, '#05061a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const ST = ['rgba(66,103,254,.25)', 'rgba(98,144,255,.42)', 'rgba(157,180,255,.62)', 'rgba(220,228,255,.85)'];
      const ps = ST.map(() => new Path2D()), nodos = new Path2D();
      const dsp = (i) => Math.hypot(x[i] - rx[i], y[i] - ry[i]);
      for (let i = 0; i < n; i++) {
        const di = dsp(i);
        if (i % C < C - 1) { const b = Math.min(3, (di + dsp(i + 1)) / 16 | 0); ps[b].moveTo(x[i], y[i]); ps[b].lineTo(x[i + 1], y[i + 1]); }
        if (i + C < n) { const b = Math.min(3, (di + dsp(i + C)) / 16 | 0); ps[b].moveTo(x[i], y[i]); ps[b].lineTo(x[i + C], y[i + C]); }
        if (di > 4) { const r = Math.min(4, 1.2 + di / 18); nodos.moveTo(x[i] + r, y[i]); nodos.arc(x[i], y[i], r, 0, 6.283); }
      }
      ctx.lineWidth = 1; ps.forEach((p, i) => { ctx.strokeStyle = ST[i]; ctx.stroke(p); });
      ctx.fillStyle = '#c9d4ff'; ctx.fill(nodos);
      if (P.on > .02) { const gl = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 150); gl.addColorStop(0, 'rgba(98,144,255,' + (.28 * P.on).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(98,144,255,0)'); ctx.fillStyle = gl; ctx.fillRect(P.x - 150, P.y - 150, 300, 300); }
    },
  },
  /* 3g · Tablero de paletas: el de los aeropuertos, con los servicios del taller. Las paletas
     giran al pasar el cursor y un toque cambia la fila. */
  persianas: {
    init(w, h) {
      const cw = w < 600 ? 24 : 32, ch = Math.round(cw * 1.42), px = cw + 3, py = ch + 3;
      const C = Math.ceil(w / px), R = Math.ceil(h / py), n = C * R;
      const cur = [], tgt = [];
      for (let r = 0; r < R; r++) { const l = renglon(C); for (let c = 0; c < C; c++) { cur.push(l[c]); tgt.push(l[c]); } }
      return { cw, ch, px, py, C, R, n, ox: (w - C * px) / 2, oy: (h - R * py) / 2, cur, tgt, sp: new Int8Array(n), at: new Float32Array(n), fp: new Float32Array(n).fill(-9), glow: new Float32Array(n), next: 1.5, hover: -1 };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const { cw, ch, px, py, C, R, n, ox, oy, cur, tgt, sp, at, fp, glow } = s;
      const fila = (r) => { const l = renglon(C); for (let c = 0; c < C; c++) { const i = r * C + c; if (l[c] !== tgt[i]) { tgt[i] = l[c]; sp[i] = 3 + RND() * 5 | 0; at[i] = t + c * .035; } } };
      if (dt > 0 && t >= s.next) { fila(RND() * R | 0); fila(RND() * R | 0); s.next = t + 2.2; }
      for (const q of taps) { const r = Math.floor((q.y - oy) / py); if (r >= 0 && r < R) fila(r); }
      if (P.on > .5) {
        const c0 = Math.floor((P.x - ox) / px), r0 = Math.floor((P.y - oy) / py), id = r0 * C + c0;
        if (id !== s.hover) { s.hover = id; for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) if (r >= 0 && r < R && c >= 0 && c < C) { const i = r * C + c; if (!sp[i]) { sp[i] = 3 + RND() * 4 | 0; at[i] = t + Math.abs(c - c0) * .04; } } }
      }
      if (dt > 0) for (let i = 0; i < n; i++) {
        if (sp[i] > 0 && t >= at[i]) { cur[i] = sp[i] === 1 ? tgt[i] : PALETA[RND() * PALETA.length | 0]; sp[i]--; at[i] = t + .055; fp[i] = t; glow[i] = 1; }
        if (glow[i]) glow[i] = Math.max(0, glow[i] - dt * 1.2);
      }
      ctx.fillStyle = '#090a1f'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#15173f'; ctx.beginPath();
      for (let i = 0; i < n; i++) RR(ctx, ox + (i % C) * px, oy + (i / C | 0) * py, cw, ch, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(4,5,18,.6)';
      for (let i = 0; i < n; i++) { const p = (t - fp[i]) / .055; if (p >= 0 && p < 1) ctx.fillRect(ox + (i % C) * px, oy + (i / C | 0) * py, cw, ch / 2 * (1 - p)); }
      ctx.font = '600 ' + Math.round(ch * .6) + 'px ' + LETRA; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const hot of [false, true]) {
        ctx.fillStyle = hot ? '#ffffff' : '#a9b8f5';
        for (let i = 0; i < n; i++) if ((glow[i] > .3) === hot && cur[i] !== ' ') ctx.fillText(cur[i], ox + (i % C) * px + cw / 2, oy + (i / C | 0) * py + ch / 2 + 1);
      }
      ctx.fillStyle = '#090a1f';
      for (let r = 0; r < R; r++) ctx.fillRect(0, oy + r * py + ch / 2 - .5, w, 1);
      if (P.on > .05) { const gl = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 120); gl.addColorStop(0, 'rgba(98,144,255,' + (.25 * P.on).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(98,144,255,0)'); ctx.fillStyle = gl; ctx.fillRect(P.x - 120, P.y - 120, 240, 240); }
    },
  },
  /* 3h · Gotas: tinta brillante que se junta y se separa como lámpara de lava. El cursor es una
     gota más y cada toque suelta otra. Es el más pesado: el campo se calcula a 1/2 de resolución
     en el teléfono y a 1/3 en el escritorio. */
  gotas: {
    init(w, h) {
      const sc = w > 900 ? 3 : 2, W = Math.ceil(w / sc), H = Math.ceil(h / sc), oc = document.createElement('canvas');
      oc.width = W; oc.height = H; const octx = oc.getContext('2d'), base = Math.max(.55, Math.min(w, h) / 900);
      const b = []; for (let i = 0, k = w < 600 ? 5 : 8; i < k; i++) b.push({ x: RND() * w, y: RND() * h, vx: (RND() - .5) * 60, vy: (RND() - .5) * 60, r: (70 + RND() * 90) * base });
      const img = octx.createImageData(W, H);
      return { sc, W, H, oc, octx, img, d32: new Uint32Array(img.data.buffer), base, b, extra: [] };
    },
    draw(ctx, w, h, t, dt, P, s, taps) {
      const { sc, W, H, b, base } = s;
      for (const q of taps) s.extra.push({ x: q.x, y: q.y, t0: t });
      s.extra = s.extra.filter(q => t - q.t0 < 3).slice(-6);
      if (dt > 0) b.forEach((o, i) => { o.vx += Math.sin(t * .3 + i) * 6 * dt; o.vy += Math.cos(t * .27 + i * 2) * 6 * dt; o.x += o.vx * dt; o.y += o.vy * dt; if (o.x < 0 && o.vx < 0 || o.x > w && o.vx > 0) o.vx *= -1; if (o.y < 0 && o.vy < 0 || o.y > h && o.vy > 0) o.vy *= -1; });
      const L = [];
      for (const o of b) L.push(o.x / sc, o.y / sc, (o.r / sc) ** 2);
      if (P.on > .02) L.push(P.x / sc, P.y / sc, ((95 * base) / sc) ** 2 * P.on);
      for (const q of s.extra) L.push(q.x / sc, q.y / sc, ((110 * base * Math.sin(Math.PI * (t - q.t0) / 3)) / sc) ** 2);
      /* El campo se calcula por mosaicos de 8 × 8. Si ni con la distancia MÁS CORTA de cada gota
         al mosaico la suma llega a .9 —el borde de la tinta—, ningún punto de adentro llega, y el
         mosaico se borra de un jalón. Es casi toda la pantalla: la tinta ocupa poco. */
      const d = s.img.data, d32 = s.d32, K = 110 * base / sc, nL = L.length, T = 8;
      for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
        const x1 = Math.min(W, tx + T) - 1, y1 = Math.min(H, ty + T) - 1;
        let fmax = 0;
        for (let j = 0; j < nL; j += 3) {
          const cx = L[j], cy = L[j + 1];
          const dx = cx < tx ? tx - cx : cx > x1 ? cx - x1 : 0, dy = cy < ty ? ty - cy : cy > y1 ? cy - y1 : 0;
          fmax += L[j + 2] / (dx * dx + dy * dy + 1);
        }
        if (fmax < .9) { for (let y = ty; y <= y1; y++) d32.fill(0, y * W + tx, y * W + x1 + 1); continue; }
        for (let y = ty; y <= y1; y++) for (let x = tx, o = (y * W + tx) * 4; x <= x1; x++, o += 4) {
        let f = 0, gx = 0, gy = 0;
        for (let j = 0; j < nL; j += 3) { const dx = x - L[j], dy = y - L[j + 1], q = dx * dx + dy * dy + 1, v = L[j + 2] / q, v2 = 2 * v / q; f += v; gx -= v2 * dx; gy -= v2 * dy; }
        if (f < .9) { d[o + 3] = 0; continue; }
        const f2 = f * f, nx = gx / f2 * K, ny = gy / f2 * K, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const dif = Math.max(0, Math.min(1, (.36 * nx + .5 * ny + .79) * inv));
        const hv = Math.max(0, (.18 * nx + .26 * ny + .95) * inv); let sp = hv * hv; sp *= sp; sp *= sp; sp *= sp; sp *= sp; const s4 = sp * 170 * Math.max(0, Math.min(1, (f - 1.4) / 1.2));
        const rim = Math.max(0, 1 - (f - .9) / .35) * .35;
        const a = Math.min(1, (f - .9) / .1);
        d[o] = Math.min(255, 30 + 70 * dif + 120 * rim + s4); d[o + 1] = Math.min(255, 20 + 120 * dif + 120 * rim + s4); d[o + 2] = Math.min(255, 200 + 55 * dif + s4); d[o + 3] = a * a * (3 - 2 * a) * 255;
        }
      }
      s.octx.putImageData(s.img, 0, 0);
      ctx.fillStyle = '#eef1ff'; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s.oc, 0, 0, W * sc, H * sc);
    },
  },
  /* 3i · Curvas de nivel: un mapa topográfico que se mueve lento. El cursor levanta un cerro y
     cada toque deja uno que se va hundiendo. */
  curvas: {
    init() { return { cerros: [], F: null }; },
    draw(ctx, w, h, t, dt, P, s, taps) {
      for (const q of taps) s.cerros.push({ x: q.x, y: q.y, t0: t });
      s.cerros = s.cerros.filter(q => t - q.t0 < 6);
      const g = w < 600 ? 12 : 15, C = Math.ceil(w / g) + 1, R = Math.ceil(h / g) + 1;
      if (!s.F || s.F.length !== C * R) s.F = new Float32Array(C * R);
      const F = s.F;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const x = c * g, y = r * g;
        let f = NZ(x * .0032, y * .0032, t * .1) * 1.1 + .6 * Math.sin(x * .0021 + y * .0013 + t * .07);
        if (P.on > .01) f += P.on * 1.8 * GS((x - P.x) ** 2 + (y - P.y) ** 2, 160);
        for (const q of s.cerros) { const age = t - q.t0; f += 1.6 * Math.min(1, age * 2) * Math.max(0, 1 - age / 6) * GS((x - q.x) ** 2 + (y - q.y) ** 2, 130); }
        F[r * C + c] = f;
      }
      const st = .2, L0 = -4, men = new Path2D(), may = new Path2D();
      for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
        const a = F[r * C + c], b = F[r * C + c + 1], cc = F[(r + 1) * C + c + 1], d = F[(r + 1) * C + c];
        const mn = Math.min(a, b, cc, d), mx = Math.max(a, b, cc, d), x0 = c * g, y0 = r * g;
        for (let k = Math.ceil((mn - L0) / st), k1 = Math.floor((mx - L0) / st); k <= k1; k++) {
          const L = L0 + k * st, p = [];
          if ((a < L) !== (b < L)) p.push(x0 + g * (L - a) / (b - a), y0);
          if ((b < L) !== (cc < L)) p.push(x0 + g, y0 + g * (L - b) / (cc - b));
          if ((d < L) !== (cc < L)) p.push(x0 + g * (L - d) / (cc - d), y0 + g);
          if ((a < L) !== (d < L)) p.push(x0, y0 + g * (L - a) / (d - a));
          const pa = k % 5 === 0 ? may : men;
          if (p.length >= 4) { pa.moveTo(p[0], p[1]); pa.lineTo(p[2], p[3]); }
          if (p.length === 8) { pa.moveTo(p[4], p[5]); pa.lineTo(p[6], p[7]); }
        }
      }
      ctx.fillStyle = '#f5f6ff'; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(66,103,254,.32)'; ctx.stroke(men);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(52,30,253,.62)'; ctx.stroke(may);
      if (P.on > .05) { ctx.fillStyle = 'rgba(52,30,253,' + P.on.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(P.x, P.y, 3.5, 0, 6.283); ctx.fill(); }
    },
  },
};

/**
 * Echa a andar uno de los fondos de lienzo sobre `c`.
 *   clave    uno de LIENZOS
 *   cursor() devuelve `{x, y}` (0–1 de la pantalla) mientras hay dedo o ratón, o null
 *   caja()   la caja de entrada (el elemento), o null: 3a pone sus piezas fuera de ella
 *   quieto() true con movimiento reducido
 * Devuelve `{ tocar(x, y), parar() }`; `tocar` recibe px de la pantalla.
 *
 * El siguiente cuadro se agenda ANTES de dibujar y el dibujo va en try/catch: si un fondo truena,
 * se reinicia su estado y la puerta sigue. Cada cuadro compara el tamaño del lienzo con el
 * guardado y vuelve a empezar el fondo si cambió (girar el teléfono). `dt` tope 0.05 s y
 * `devicePixelRatio` tope 2. Si la persona cambia a «menos movimiento» con la puerta abierta, el
 * fondo se detiene en un cuadro fijo, y al revés vuelve a andar.
 */
export function lienzoAnimado(c, clave, { cursor, caja, quieto }) {
  const r = LIENZOS[clave];
  const ctx = r && c.getContext && c.getContext('2d');
  if (!ctx) return { tocar() {}, parar() {} };
  try { LETRA = getComputedStyle(document.documentElement).getPropertyValue('--f-cifra').trim() || LETRA; } catch (_) {}
  let w = 0, h = 0, st = null, t = 0, last = 0, raf = 0, vivo = true;
  const P = { x: 0, y: 0, on: 0, caja: null }, toques = [];
  const ajusta = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = c.clientWidth; h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st = null;
  };
  /* El rectángulo de la caja, relativo al lienzo. Va suavizado: cuando salen los pasos la caja
     crece de golpe, y las piezas de 3a se encogían de un cuadro al otro. */
  const mideCaja = (a) => {
    const el = caja();
    if (!el || !el.offsetWidth) return;
    const k = el.getBoundingClientRect(), o = c.getBoundingClientRect();
    const n = { x: k.left - o.left, y: k.top - o.top, w: k.width, h: k.height };
    if (!P.caja) { P.caja = n; return; }
    for (const q in n) P.caja[q] += (n[q] - P.caja[q]) * a;
  };
  const cuadro = (dt, reducido) => {
    if (c.clientWidth !== w || c.clientHeight !== h) ajusta();
    if (!w || !h) return;
    if (!st) { st = r.init(w, h, reducido); P.on = 0; P.caja = null; }
    t += dt;
    mideCaja(reducido ? 1 : Math.min(1, dt * 8));
    const p = reducido ? null : cursor();
    if (p) {
      const tx = p.x * w, ty = p.y * h;
      if (P.on < .01) { P.x = tx; P.y = ty; }
      const a = Math.min(1, dt * 12); P.x += (tx - P.x) * a; P.y += (ty - P.y) * a;
      P.on += (1 - P.on) * Math.min(1, dt * 6);
    } else P.on = reducido ? 0 : P.on - P.on * Math.min(1, dt * 4);
    const ts = toques.splice(0);
    ctx.save();
    try { r.draw(ctx, w, h, t, dt, P, st, ts); } finally { ctx.restore(); }
  };
  const seguro = (dt, reducido) => {
    try { cuadro(dt, reducido); } catch (err) { st = null; console.warn('fondo de la puerta', clave, err); }
  };
  /* Con movimiento reducido no hay bucle: un cuadro fijo, desde cero, y otro si la pantalla cambia. */
  const fijo = () => { st = null; seguro(0, true); };
  /* El freno para un teléfono lento: si dibujar un cuadro cuesta más de 12 ms en promedio, se
     pinta uno sí y uno no (30 por segundo, con el `dt` del doble) en lugar de trabar la pantalla;
     si vuelve a bajar de 6 ms, regresa a todos. El cuadro saltado no toca `last`, así que el
     tiempo del fondo no se atrasa. */
  let costo = 0, medio = false, salta = false;
  const vuelta = (ahora) => {
    raf = 0;
    if (!vivo || document.hidden) return;
    if (quieto()) { fijo(); return; }
    raf = requestAnimationFrame(vuelta);
    if (medio && (salta = !salta)) return;
    const dt = last ? Math.min(.05, Math.max(0, ahora - last) / 1000) : 1 / 60;
    last = ahora;
    const t0 = performance.now();
    seguro(dt, false);
    const ms = performance.now() - t0;
    costo = costo ? costo * .9 + ms * .1 : ms;
    if (!medio && costo > 12) medio = true; else if (medio && costo < 6) medio = false;
  };
  const arrancar = () => {
    if (!vivo || raf || document.hidden) return;
    if (quieto()) { fijo(); return; }
    last = 0;
    raf = requestAnimationFrame(vuelta);
  };
  const alVolver = () => { if (!document.hidden) arrancar(); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (vivo && quieto()) { ajusta(); fijo(); } }) : null;
  if (ro) ro.observe(c);
  document.addEventListener('visibilitychange', alVolver);
  let mq = null;
  const alCambiarPreferencia = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } st = null; arrancar(); };
  try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener('change', alCambiarPreferencia); } catch (_) { mq = null; }
  /* El grabado láser hace su plantilla con la letra UNA vez: si la letra de la app llega después
     de arrancar, se rehace con la buena. Los demás la leen en cada cuadro. */
  if (clave === 'laser' && document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(() => { if (!vivo) return; st = null; if (quieto()) fijo(); }).catch(() => {});
  }
  ajusta();
  arrancar();
  return {
    tocar(x, y) {
      const b = c.getBoundingClientRect();
      toques.push({ x: x - b.left, y: y - b.top });
      if (toques.length > 8) toques.shift();
    },
    parar() {
      vivo = false;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', alVolver);
      if (mq) try { mq.removeEventListener('change', alCambiarPreferencia); } catch (_) {}
    },
  };
}
