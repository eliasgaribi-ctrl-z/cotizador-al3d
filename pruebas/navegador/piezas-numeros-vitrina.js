/* El arranque de la vitrina de piezas-numeros.html. Hace lo que haría una pantalla: llama a las
   piezas de js/piezas.js (sección 3) sobre marcado del repo y lleva la cuenta de los eventos que
   recibe, para que pruebas/navegador/piezas-numeros.mjs compruebe que llegan los mismos que al
   teclear. Nada de esto va a la app. */
(function () {
  'use strict';
  const P = window.Piezas, $ = id => document.getElementById(id);
  const money = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const V = window.vitrina = { eventos: {}, cuentas: {} };
  const contar = (el, tipo) => el.addEventListener(tipo, () => { const k = el.id + ':' + tipo; V.eventos[k] = (V.eventos[k] || 0) + 1; });

  /* 1 · El total que rueda: cinco partidas de $2,160 más IVA, como una cotización de verdad. */
  let partidas = 5;
  const total = () => partidas * 2160 * 1.16;
  const pintarTotal = () => {
    P.rodarCifra($('v-neto'), money(total()));
    P.rodarCifra($('v-dock'), money(total()), { clave: 'vitrina-dock' });
    P.rodarCifra($('v-escalado'), money(total()));
  };
  pintarTotal();
  $('b-mas').addEventListener('click', () => { partidas++; pintarTotal(); });
  $('b-menos').addEventListener('click', () => { partidas = Math.max(0, partidas - 1); pintarTotal(); });
  $('b-precios').addEventListener('click', () => document.body.classList.toggle('precios-ocultos'));
  let tarde = 2;
  P.rodarCifra($('v-cuenta'), String(tarde), { clave: 'vitrina-tarde', animar: false });
  V.masTarde = () => { tarde++; return P.rodarCifra($('v-cuenta'), String(tarde), { clave: 'vitrina-tarde', delta: true }); };
  const LIBRO = 2.4;
  const pintarDif = () => {
    const v = parseFloat($('v-cuenta-in').value);
    P.diferenciaViva($('v-dif'), isFinite(v) ? v - LIBRO : NaN, { decimales: 1, unidad: 'láminas' });
    V.dudosa = isFinite(v) && P.cifras.proporcionDudosa(LIBRO, v);
  };
  pintarDif();
  $('v-cuenta-in').addEventListener('input', pintarDif);

  /* 2 · La ficha que viaja. La vitrina pone `.on` como la app: la pieza solo lo mira. */
  const elegirEn = (grupo, clase) => grupo.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !grupo.contains(b)) return;
    grupo.querySelectorAll('button').forEach(x => {
      const si = x === b;
      x.classList.toggle(clase, si);
      if (x.hasAttribute('aria-pressed')) x.setAttribute('aria-pressed', si ? 'true' : 'false');
    });
  });
  elegirEn($('v-seg'), 'on');
  elegirEn($('v-tipo'), 'on');
  elegirEn($('v-tool'), 'active');
  elegirEn($('v-plazo'), 'on');
  const MODULOS = ['Tablero', 'Proyectos', 'Control'];
  let modulo = 'Tablero';
  const pintarNav = () => {
    $('v-nav').innerHTML = MODULOS.map(m => '<button type="button" data-ruta="' + m + '" class="' + (m === modulo ? 'on' : '') +
      '" aria-current="' + (m === modulo ? 'page' : 'false') + '">' + m + '</button>').join('');
  };
  pintarNav();
  $('v-nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { modulo = b.dataset.ruta; pintarNav(); } });
  V.fichas = ['v-seg', 'v-tipo', 'v-nav', 'v-tool', 'v-plazo'].map(id => P.fichaQueViaja($(id)));

  /* 3 · Arrastrar la medida: un oyente para toda la tarjeta, como en las partidas. */
  P.arrastrarMedidas($('v-medidas'));
  ['v-alto', 'v-letras', 'v-m2'].forEach(id => { contar($(id), 'input'); contar($(id), 'change'); });
  $('v-medidas').addEventListener('input', e => { $('v-medida-eco').textContent = e.target.id + ' = ' + e.target.value; });

  /* 18 · La cuenta de cobro (C4): las cinco cuentas; la pantalla pondría su aviso ámbar. */
  $('v-glide-caja').innerHTML = P.opcionesDeslizantesHTML({
    id: 'v-cuentas', etiqueta: 'Cuenta de cobro', oculto: 'v-rv-cuenta', valor: 'Moni MPago',
    opciones: [
      { v: 'Moni MPago', sub: 'con IVA' }, { v: 'Tatis BNT', sub: 'con IVA' }, { v: 'Constru BNT', sub: 'con IVA' },
      { v: 'Rul HSBC', sub: 'con IVA' }, { v: 'Elias BBVA', sub: 'sin IVA' }
    ]
  });
  contar($('v-rv-cuenta'), 'change');
  V.cambiosCuenta = [];
  V.glide = P.opcionesDeslizantes($('v-cuentas'), { alCambiar: v => V.cambiosCuenta.push(v) });

  /* 19 · El código de verificar (A1) y el «BORRAR» de Ajustes (F27). */
  $('v-codigo-caja').innerHTML = P.casillasCodigoHTML({ id: 'v-codigo', n: 12, grupo: 4, etiqueta: 'Código de verificación, 12 caracteres' });
  V.completos = [];
  V.codigo = P.casillasCodigo($('v-codigo'), Object.assign({ alCompletar: c => V.completos.push(c), textoRechazo: 'El código solo lleva 0–9 y A–F' }, P.codigo.HEX));
  V.borrar = P.casillasCodigo($('v-borrar'), { esperado: 'BORRAR', boton: $('v-borrar-b') });
  V.tel = P.telefonoVivo($('v-tel'));
  contar($('v-tel'), 'input');
  V.telVisto = [];
  $('v-tel').addEventListener('input', () => V.telVisto.push($('v-tel').value));

  /* 20 · Medidores: material (F3), por cobrar (P30), estimado, libro en rojo y una hoja (A12). */
  $('v-medidores').innerHTML = [
    ['Acrílico blanco 3 mm', '2.4 láminas', { valor: 2.4, max: 5, rayado: 1, meta: 3, muesca: 2 }, 'Hay 2.4 · 1 ya tiene dueño · piden 3 · mínimo 2'],
    ['Barbería El Toro · por cobrar', '$6,960', { valor: 6960, max: 13920, tono: 'ok', texto: 'Cobrado 50 %' }, 'Cobrado 50 % ($6,960 de $13,920)'],
    ['Taquería Los Primos · estimado', '$3,480', { valor: .25, estimado: true, tono: 'ok' }, 'Saldo estimado (de Notion): 25 %'],
    ['Vinil negro mate', '−1 rollo', { valor: -1, max: 4, muesca: 1 }, 'El libro va en −1'],
    ['Hoja 2 de 3', '71 %', { valor: .71, tono: 'ok' }, 'Aprovechamiento 71 %']
  ].map(([t, c, o, f], i) => '<div class="mat" id="v-mat-' + i + '"><div class="mat-t"><span>' + P.esc(t) + '</span><span>' + P.esc(c) + '</span></div>' +
    P.medidorHTML(o) + '<small>' + P.esc(f) + '</small></div>').join('');

  /* Deslizadores: el anticipo (C17), el precio del autorizador (C18) y el vectorizador (H9). */
  const T = 12528;
  contar($('v-anti'), 'input'); contar($('v-anti'), 'change');
  V.anti = P.deslizadorConImanes($('v-anti-r'), {
    campo: $('v-anti'), grueso: true, redondeo: 100, pasoTeclado: 100,
    imanes: [{ v: T / 2, radio: T * .02, t: '50%' }, { v: T, t: 'Total' }],
    marcas: [{ v: 0, t: '0' }, { v: T / 2, t: '50%' }, { v: T, t: 'Total' }],
    texto: v => 'Hoy ' + money(v) + ', al instalar ' + money(T - v)
  });
  const calc = 10800, pct = [-20, -15, -10, -5, 0, 10];
  contar($('v-precio'), 'input');
  V.precio = P.deslizadorConImanes($('v-precio-r'), {
    campo: $('v-precio'), elastico: true, redondeo: 100, pasoTeclado: 100, origen: calc,
    formatoCampo: v => String(Math.round(v)),
    imanes: [0, -5, -10, -15].map(p => ({ v: calc * (1 + p / 100), t: (p ? '−' + Math.abs(p) : '0') + '%' })),
    marcas: pct.map(p => ({ v: calc * (1 + p / 100), t: (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p) + '%' })),
    texto: v => money(v)
  });
  V.retrazos = 0;
  const retrazar = () => { V.retrazos++; $('v-retrazos').textContent = 'Re-trazado ' + V.retrazos + (V.retrazos === 1 ? ' vez' : ' veces'); };
  V.colores = P.deslizadorConImanes($('v-colores'), { marcas: true, pastilla: true, alSoltar: retrazar });
  V.detalle = P.deslizadorConImanes($('v-detalle'), { marcas: true, pastilla: true, etiqueta: v => ['Bajo', 'Medio', 'Alto'][v], alSoltar: retrazar });
  V.listo = true;
})();
