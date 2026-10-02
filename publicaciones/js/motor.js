/* ============================================================================
   El motor por lotes: un JSON de piezas entra, sus PNG salen.

   Es la puerta de la automatización. Abrir `motor.html?contenido=datos/semana.json` carga y
   pinta todo; desde código (Playwright, GitHub Actions) se espera a `window.AL3D.listo` y se
   llama `await window.AL3D.png(pieza)`, que devuelve el PNG en data URL.

   El contenido tiene que ser de este mismo sitio: la política de la página no deja leer JSON
   ni fotos de otro servidor (ver el comentario en motor.html).
   ============================================================================ */

import { cargar, P, porId, esc, textoDe, piezaNueva, nodo, png, video, bajar } from './plantillas.js';

const $ = id => document.getElementById(id);
let DATOS = [];

const AL3D = {
  plantillas: P,
  porId,
  /** El nodo de la pieza, ya llenado. */
  render: pieza => nodo(porId[pieza.plantilla], pieza),
  png: (pieza, o) => png(pieza, { croma: o && (o.croma || o.transparente) }),
  video: (pieza, o) => video(pieza, o),
  listo: null,
};
window.AL3D = AL3D;

function leer() {
  try {
    const v = JSON.parse($('mt-json').value || '[]');
    $('mt-err').textContent = '';
    return Array.isArray(v) ? v : [v];
  } catch (e) {
    $('mt-err').textContent = 'El JSON no se puede leer: ' + e.message;
    return null;
  }
}
const escribir = () => { $('mt-json').value = JSON.stringify(DATOS, null, 2); };
const croma = () => $('mt-croma').checked;
const nombre = (it, i) => String(it.nombre || it.plantilla || 'pieza-' + (i + 1)).replace(/[^\w.-]+/g, '-');

function pintar() {
  const d = leer();
  if (!d) return;
  DATOS = d;
  const out = $('mt-salida');
  out.replaceChildren();
  DATOS.forEach((it, i) => {
    const p = porId[it.plantilla];
    if (!p) { $('mt-err').textContent = 'No existe la plantilla «' + it.plantilla + '» (pieza ' + (i + 1) + ').'; return; }
    it.campos = { ...p.campos, ...(it.campos || {}) };
    const c = document.createElement('div');
    c.className = 'mt-pieza';
    const sc = Math.min(1, 300 / p.vista[0]);
    const caja = document.createElement('div');
    caja.className = 'pb-caja';
    caja.style.width = p.vista[0] * sc + 'px';
    caja.style.height = p.vista[1] * sc + 'px';
    const el = nodo(p, it);
    el.style.transform = 'scale(' + sc + ')';
    el.style.transformOrigin = '0 0';
    if (croma() && p.tipo === 'video') { el.style.background = '#00FF00'; el.querySelectorAll('[data-video]').forEach(n => n.remove()); }
    el.querySelectorAll('[data-slot]').forEach(n => {
      try { n.contentEditable = 'plaintext-only'; } catch (_) { n.contentEditable = 'true'; }
      if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
      n.spellcheck = false;
      n.addEventListener('input', () => {
        const k = n.dataset.slot;
        it.campos[k] = textoDe(n);
        el.querySelectorAll('[data-slot="' + CSS.escape(k) + '"]').forEach(o => { if (o !== n) o.innerHTML = esc(it.campos[k]); });
        escribir();
      });
    });
    el.querySelectorAll('[data-foto]').forEach(n => {
      const k = +n.dataset.foto - 1;
      const poner = f => {
        const r = new FileReader();
        r.onload = () => { it.fotos = it.fotos || []; while (it.fotos.length <= k) it.fotos.push(''); it.fotos[k] = r.result; escribir(); pintar(); };
        r.readAsDataURL(f);
      };
      n.addEventListener('dragover', e => { e.preventDefault(); n.classList.add('soltar'); });
      n.addEventListener('dragleave', () => n.classList.remove('soltar'));
      n.addEventListener('drop', e => { e.preventDefault(); n.classList.remove('soltar'); if (e.dataTransfer.files[0]) poner(e.dataTransfer.files[0]); });
      n.addEventListener('click', e => {
        if (e.target.closest('[data-slot]')) return;
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.addEventListener('change', () => { if (inp.files[0]) poner(inp.files[0]); });
        inp.click();
      });
    });
    caja.appendChild(el);
    const m = document.createElement('div');
    m.className = 'mt-meta';
    m.innerHTML = '<b>' + esc(nombre(it, i)) + '</b> · ' + esc(p.id) + ' · ' + p.ancho + '×' + p.alto;
    const fila = document.createElement('div');
    fila.className = 'mt-fila';
    fila.style.marginTop = '0';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-gho'; b.textContent = 'Descargar PNG';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { bajar(await AL3D.png(it, { croma: croma() }), nombre(it, i) + '.png'); }
      catch (e) { $('mt-err').textContent = e.message; }
      finally { b.disabled = false; }
    });
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'btn btn-gho'; x.textContent = 'Quitar';
    x.addEventListener('click', () => { DATOS.splice(i, 1); escribir(); pintar(); });
    fila.append(b, x);
    c.append(caja, m, fila);
    out.appendChild(c);
  });
}

async function todo() {
  const b = $('mt-todo');
  b.disabled = true;
  try {
    for (let i = 0; i < DATOS.length; i++) {
      b.textContent = (i + 1) + ' de ' + DATOS.length + '…';
      bajar(await AL3D.png(DATOS[i], { croma: croma() }), nombre(DATOS[i], i) + '.png');
      await new Promise(r => setTimeout(r, 350));
    }
  } catch (e) { $('mt-err').textContent = e.message; }
  finally { b.disabled = false; b.textContent = 'Descargar todo (PNG)'; }
}

function biblioteca() {
  const q = $('mt-q').value.trim().toLowerCase(), t = $('mt-tipo').value;
  const lib = $('mt-lib');
  lib.replaceChildren();
  const lista = P.filter(p => (!t || p.tipo === t) && (!q || (p.id + ' ' + (p.nombre || '') + ' ' + p.tipo).toLowerCase().includes(q))).slice(0, 80);
  for (const p of lista) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pb-tarj';
    const m = document.createElement('div');
    m.className = 'pb-marco';
    m.style.aspectRatio = p.vista[0] + '/' + p.vista[1];
    const inn = document.createElement('div');
    inn.className = 'pb-in';
    inn.style.width = p.vista[0] + 'px';
    inn.style.height = p.vista[1] + 'px';
    const el = nodo(p, null);
    for (const n of [el, ...el.querySelectorAll('*')]) {
      if (n.style.animationName && n.style.animationName !== 'none') n.style.animationDelay = ((parseFloat(n.style.animationDelay) || 0) - 3) + 's';
    }
    inn.appendChild(el);
    m.appendChild(inn);
    const pie = document.createElement('div');
    pie.className = 'pb-pie';
    pie.innerHTML = '<b>' + esc(p.id) + '</b><span>' + esc((p.nombre || p.tipo) + ' · ' + Object.keys(p.campos).join(', ') + (p.fotos ? ' · ' + p.fotos + ' foto(s)' : '')) + '</span>';
    b.append(m, pie);
    b.addEventListener('click', () => { DATOS.push(piezaNueva(p)); escribir(); pintar(); });
    lib.appendChild(b);
    requestAnimationFrame(() => { inn.style.transform = 'scale(' + (m.clientWidth / p.vista[0]) + ')'; });
  }
}

AL3D.listo = (async () => {
  await cargar();
  $('mt-cuenta').textContent = P.length + ' plantillas';
  const qs = new URLSearchParams(location.search).get('contenido');
  let d = [];
  try {
    /* Solo del mismo sitio. `new URL` con la página de base resuelve las relativas; una absoluta
       de otro origen se rechaza aquí con un mensaje, antes de que la política la tire callada. */
    const u = new URL(qs || 'automatizacion/contenido-ejemplo.json', location.href);
    if (u.origin !== location.origin) throw new Error('El contenido tiene que estar en este mismo sitio.');
    d = await (await fetch(u)).json();
  } catch (e) { $('mt-err').textContent = 'No se pudo cargar el contenido: ' + e.message; }
  $('mt-json').value = JSON.stringify(d, null, 2);
  pintar();
  biblioteca();
  document.documentElement.classList.remove('arrancando');
  return true;
})();
AL3D.listo.catch(e => { $('mt-err').textContent = e.message; document.documentElement.classList.remove('arrancando'); });

$('mt-generar').addEventListener('click', pintar);
$('mt-todo').addEventListener('click', todo);
$('mt-croma').addEventListener('change', pintar);
let pend = 0;
$('mt-q').addEventListener('input', () => { if (!pend) pend = requestAnimationFrame(() => { pend = 0; biblioteca(); }); });
$('mt-tipo').addEventListener('change', biblioteca);
$('mt-archivo').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) f.text().then(t => { $('mt-json').value = t; pintar(); });
});
