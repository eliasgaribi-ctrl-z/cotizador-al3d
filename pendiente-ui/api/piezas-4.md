# Piezas · 4 — Señalar, explicar y sellar (API para las pantallas)

Todo cuelga de `window.Piezas` (en el cotizador: `Piezas.x(…)`; en la plataforma: `window.Piezas.x(…)`).
Código: `js/piezas.js`, sección 4. Estilos: `css/sistema.css`, bloque «Piezas · 4» y su apagado «rm · piezas · 4».
Vitrina con cada pieza montada: `pruebas/navegador/piezas-senales.html` (el `<script>` del final es un ejemplo de uso de todo).

Reglas comunes:
- **Idempotentes.** Llamar otra vez sobre el mismo elemento devuelve el mismo control y no cuelga oyentes nuevos. Si la pantalla repinta con `innerHTML`, vuelve a llamar después de pintar (el control viejo se va con el nodo viejo).
- **Las `…HTML()` devuelven una cadena y no tocan el DOM.** Escapan con `P.esc()` todo lo que interpolan. Solo entra crudo lo que aquí se marca como **HTML de la pantalla** (tú lo escapas).
- **Sin manejadores en línea.** Nada de lo que generan lleva `onclick="…"`; sirve en la plataforma (CSP sin `unsafe-inline`).
- **Flota en la capa superior** (`popover="manual"`): encima de modales, hojas y velos sin z-index. Sin soporte de popover (Safari 16) cae a `position:fixed; z-index:90`.
- **Menos movimiento** apaga el adorno y deja la información (fundidos de 150 ms, pulso lento en esperas).
- **No dependen de Q, proyectos ni la hoja.**

---

## 4 · El globo que explica (desglose o vistazo) — `P.vistazo`

Entra en: C23 (precio de la partida, total del dock), H2 (mensaje de WhatsApp), H19 (plazo sugerido, el «?»), H21 (cuaderno del cliente), A10 (pieza del anidador), A5 (veta), P27 (mes de Ventas), F28 (menú de cuenta), F26 (día del calendario: ver *nombres*).

### Declarativo (lo más fácil si pintas con innerHTML)
Un botón con `data-vistazo="id"` y el globo con ese id en el marcado. **No hay que llamar a nada**: un oyente del documento (puesto al cargar `js/piezas.js`) abre y cierra.

```js
P.vistazoHTML({ id, titulo, cuerpo, rol, clase })   // → '<div class="vistazo" id popover="manual" role="dialog" aria-label tabindex="-1">cuerpo</div>'
P.porqueHTML({ id?, etiqueta, titulo, cuerpo, alinear, clase })  // → botón «?» de 40/44 px + su globo
```
- `cuerpo`: **HTML de la pantalla**. `rol`: `'dialog'` (por omisión), `'menu'`, `'nota'`.
- Atributos opcionales en el botón: `data-lado="arriba"`, `data-alinear="centro|fin"`, `data-hoja` (en el teléfono sale como hoja de abajo).
- El botón que pinta `porqueHTML` ya trae `aria-haspopup="dialog" aria-expanded aria-controls`. Si pintas tu propio botón con `data-vistazo`, ponle esos tres tú (el `aria-expanded` lo mantiene la pieza).

### Programático
```js
const g = P.vistazo(ancla, opciones)
// → { abrir(el?), cerrar(motivo?), alternar(el?), abierto(), reubicar(), pop, destruir() }
```
- `ancla`: el botón (elemento o id); con `delegar`, el **contenedor estable**; `null` para abrirlo solo desde código (`g.abrir(el)`).
- `opciones`:
  - `contenido`: cadena (**HTML de la pantalla**), nodo, o `(ancla, pop) => cadena|nodo`. Se llama **en cada apertura** (el desglose se calcula al abrir).
  - `titulo` (aria-label del globo) · `rol`: `'dialog'` | `'menu'` (flechas ↑↓, Inicio, Fin; los `button`/`a` de dentro reciben `role="menuitem"`) | `'nota'` (no se lleva el foco; el ancla recibe `aria-describedby`).
  - `lado`: `'abajo'` (omisión) | `'arriba'` — se voltea solo si no cabe. `alinear`: `'inicio'` | `'centro'` | `'fin'` (menú de cuenta: `'fin'`).
  - `hoja: true` → a ≤ 560 px sale como hoja de abajo (mensaje de WhatsApp, cuaderno).
  - `tocarFueraCierra` (true) — ponlo en `false` para una pregunta (A5, la veta): solo se cierra con su botón o con Escape.
  - `delegar: '.selector'` → un solo globo para muchos anclas repintables (barras de meses, piezas del SVG, `.mbar-tot`). En elementos que no son botón (una `<g tabindex="0" role="button">`), Enter/Espacio también abren.
  - `enfocar` (true), `sinClic` (no cablea el clic), `pop` (un globo ya pintado), `clase`, `alAbrir(pop, ancla)`, `alCerrar(pop, motivo)`.
- Motivos de cierre: `'escape'`, `'fuera'`, `'foco'`, `'alternar'`, `'otro'` (se abrió otro), `'ancla'` (el ancla desapareció), `'codigo'`.

**Teclado / toque / ratón.** Clic, toque o Enter/Espacio abren; el foco entra al globo (salvo `nota`). **Escape** cierra, **devuelve el foco al ancla** y NO llega a `_CAPAS` / `vigilarCapas` (el modal de abajo se queda). Tocar fuera cierra (sin robar el foco). **Tab** recorre el globo; pasando el último control se cierra y el foco sigue *después* del ancla (también dentro de un modal del cotizador, cuyo cerco de Tab no interviene); Shift+Tab en el primero vuelve al ancla. Uno a la vez: abrir otro cierra el anterior. Se reacomoda con scroll y resize. Si el ancla se repinta: si tenía `id` se re-ancla a su gemela; si no, se cierra.

**Menos movimiento:** entra y sale en fundido, sin desplazarse.

**CSS:** `.vistazo` (globo) · `.vistazo.en-hoja` · `.vistazo-t` (título) · `.vistazo dl/dt/dd/.suma` (desglose) · `.vistazo-texto` (texto exacto, `pre-wrap`) · `.vistazo-acciones` (fila de botones; `.btn` dentro va a su ancho) · `.porque` (el «?») · `.vistazo-ancla-abierta` (el ancla, mientras está abierto). Ancho: `--vz-ancho` (320 px por omisión, nunca más que la pantalla − 24).

Ejemplos:
```js
// C23 · el total del dock (se repinta en cada tecla): delegar en el contenedor estable
P.vistazo('mbar', { delegar: '.mbar-tot', titulo: 'Cómo sale el total', contenido: () =>
  `<dl><dt>Subtotal</dt><dd>${money(sub)}</dd><dt>IVA 16 %</dt><dd>${money(iva)}</dd>` +
  `<dt class="suma">Total</dt><dd class="suma">${money(total)}</dd></dl>` });

// H19 · el plazo sugerido, pintado con innerHTML dentro de pintarPlazo()
html += Piezas.porqueHTML({ id: 'plazo-porque', etiqueta: 'Por qué ese plazo', titulo: 'Por qué 2.5 semanas',
  cuerpo: '<span class="vistazo-t">Por qué 2.5 semanas</span><ul>' + razones.map(r => `<li>${esc(r)}</li>`).join('') + '</ul>' });

// F28 · menú de la cuenta (plataforma)
window.Piezas.vistazo(btn, { rol: 'menu', alinear: 'fin', titulo: 'Tu cuenta',
  contenido: '<button type="button" data-accion="ajustes">Ajustes</button><button type="button" data-accion="salir">Cerrar sesión</button>' });

// A10 · la pieza del anidador: nota, sin llevarse el foco
Piezas.vistazo('an-res', { delegar: 'g[data-pieza]', rol: 'nota',
  contenido: g => `Pieza ${g.dataset.pieza} · ${w} × ${h} mm${giro ? ' · girada ' + giro + '°' : ''}` });

// H2 · el mensaje de WhatsApp: hoja en el teléfono, «Copiar» adentro y cierre desde el código
const vm = Piezas.vistazo('wa-ver', { titulo: 'Mensaje de WhatsApp', hoja: true, contenido: () =>
  `<span class="vistazo-t">A ${esc(tel)}</span><pre class="vistazo-texto">${esc(msg)}</pre>` +
  '<div class="vistazo-acciones"><button type="button" class="btn btn-gho" data-copiar>Copiar</button></div>' });
// … en el clic de [data-copiar]: copiarTexto(msg); vm.cerrar();   (el foco vuelve a «Ver mensaje»)
```
Si cambias el contenido de un globo abierto, llama `g.reubicar()`.

`P.vistazo.ubicar(rectAncla, {w,h}, {w,h,arriba,abajo}, {lado,alinear,margen,hueco})` es la cuenta pura (sin DOM) de dónde cae.

---

## Variante · los iconos sin texto dicen su nombre — `P.nombres`

Entra en: C25 (botones de solo icono del cotizador: Deshacer, Clientes, Historial, Tema, Plataforma; duplicar/ojo/borrar de cada partida; `.mbar-undo`), P31 (barra lateral con su tecla), F26 (el día del calendario con ratón).

```js
const n = P.nombres(raiz = document, opciones)   // → { destruir() }
```
- `raiz`: el contenedor (o `document`). Delegado: sirve para lo que se repinte dentro. Llámala **una vez** por raíz+selector.
- `opciones`: `selector` (por omisión `button[aria-label], a[aria-label], [role="button"][aria-label], button[title], a[title], [data-nombre]`), `siempre` (false: solo en los que **no tienen texto visible**; true para P31/F26), `toque` (true), `raton` (true), `espera` (400 ms), `caliente` (600 ms), `mantener` (450 ms), `texto(el)` → cadena o `{nombre, tecla}`.
- Nombre: `data-nombre` → `aria-label` → `title` → el texto del botón. Tecla: `data-tecla` o `aria-keyshortcuts` (sale en `<kbd>`).

**Dedo:** mantener 450 ms enseña el nombre y **ese toque no dispara la acción** (el clic se detiene en captura, antes del `onclick` en línea; en `.del` nunca borra). Deslizar > 10 px cancela. Se va 0.9 s después de soltar. Sin menú contextual de Android.
**Ratón** (solo puntero fino): el primero espera 400 ms; mientras el grupo está «caliente» los vecinos salen al instante. El `title` nativo se guarda mientras el ratón está encima (y se devuelve al salir) para que no se encimen.
**Teclado:** al enfocar con Tab (`:focus-visible`), al momento; Escape lo quita (y deja pasar el Escape).
Es un solo nodo `aria-hidden` (el nombre ya está en el `aria-label`: no se lee dos veces). Se esconde al desplazar.

**CSS:** `.nombre-tip` (con `kbd`), `.nombre-presionando` (mientras se mantiene el dedo). **Menos movimiento:** aparece sin desplazarse; no vibra.

```js
// C25 · cotizador, al arrancar
Piezas.nombres(document);
// P31 · barra lateral de la plataforma: el nombre ya se ve; lo que añade es la tecla
window.Piezas.nombres('pf-nav', { selector: '.pf-lat-item', siempre: true, toque: false,
  texto: el => ({ nombre: el.dataset.nombre, tecla: el.dataset.tecla }) });
// F26 · días del calendario, solo con ratón, con el aria-label completo
window.Piezas.nombres(rejilla, { selector: '.cal-dia', siempre: true, toque: false, texto: el => el.getAttribute('aria-label') });
```

---

## 7 · El encendido de neón, un momento — `P.encenderNeon`

Entra en: C23 (cotización autorizada, también la remota), A27 (título de «acerca», discreto), A17 (logo al volver la señal).

```js
const n = P.encenderNeon(el, { modo: 'borde'|'texto'|'logo', fuerza: 'fuerte'|'discreta', queda: false, alTerminar })
// → { listo: Promise<boolean>, apagar() }
```
- `'borde'` (omisión): halo + un haz que da dos vueltas al borde (2.6 s) y se va. `el` es la tarjeta; si es `position:static` se le pone `relative` mientras dura. `fuerza:'discreta'` → sin haz, halo suave.
- `'texto'`: halo discreto (alfa .25) sobre el texto; usa `data-neon` (lo pone si falta). `queda:true` lo deja prendido y quieto al final.
- `'logo'`: `el` es la **envoltura** del logo (inline-block que contiene solo el `<img>`/`<svg>`), marcada antes con `.neon-apagado` (gris). Parpadea a color y se queda a color.
- Llamarla otra vez sobre el mismo elemento reinicia. En reposo no queda nada (las capas se quitan por reloj, no por `animationend`).
- **Sin guion (acerca.html):** `<h1 class="neon-texto neon-al-cargar neon-queda" data-neon="La plataforma del taller">La plataforma del taller</h1>` se enciende solo al cargar.
- **Menos movimiento:** sin parpadeo ni haz; el halo aparece y se va en 1 s.
- **CSS:** `.neon-capa`, `.neon-haz`, `.neon-texto`, `.neon-al-cargar`, `.neon-queda`, `.neon-apagado`, `.neon-logo-copia`, `.neon-halo`, `.neon-ancla`.

```js
// C23 · al sellar (autorizarRemota() y la local)
Piezas.encenderNeon('card-auth');
// A17 · sin señal: <span class="logo-sin-senal neon-apagado"><img src="logo-al3d.svg" alt="AL3D"></span>
addEventListener('online', () => Piezas.encenderNeon(document.querySelector('.logo-sin-senal'), { modo: 'logo' }).listo.then(() => location.reload()));
```

---

## 8 · Pasos que avanzan (la traza) — `P.traza`

Entra en: IA del cotizador (`aiStatus`), asistente F14, arranque P22, puerta F10, restaurar respaldo H25, abrir PDF H12.

```js
const t = P.traza(el, { reloj: 's'|'ds'|false, plegar: true })
// → { paso(clave, texto, estado, detalle), hecho(clave, detalle?), falla(clave, detalle?), salta(clave, detalle?),
//     terminar({ ok, resumen }), limpiar(), actual(), destruir() }
P.trazaHTML({ etiqueta, pasos: [{ clave, texto, estado, detalle }] })   // marcado fijo (P22), que P.traza() adopta
```
- Estados: `'espera'` (anillo punteado) · `'trabaja'` (anillo que gira; lo único que se mueve) · `'ok'` (palomita) · `'salta'` (guion ámbar: «Qwen sin llave») · `'mal'` (equis roja).
- `paso()` crea o actualiza **en su sitio** por `clave`. `texto` y `detalle` van como **texto** (no HTML): los mensajes de la hoja entran seguros. `texto: null` conserva el que tenía.
- **Avanza por eventos:** llama `paso()` cuando algo pasó de verdad. El reloj de cada paso es tiempo real desde que empezó a trabajar; al terminar se queda con lo que tardó. `'s'` = «14 s», `'ds'` = «2.3 s» (PDF), pasado el minuto «2 min 05 s». Un solo intervalo por traza, solo mientras algo trabaja; se para si el nodo sale del documento.
- `terminar({ ok, resumen })`: lo que trabajaba pasa a ok/mal (lo que esperaba se queda esperando) y, con `resumen`, se pliega en un `<details>` («Contestó Gemini en 18 s»).
- `actual()` → `{clave, texto, ms}` del paso que trabaja (para «tarda más de lo normal en: …»).
- **Voz:** región viva propia (`.traza-voz`) que dice los cambios de estado; el reloj es `aria-hidden` (no se lee cada segundo).
- **Menos movimiento:** los pasos entran en fundido; la espera late despacio (`pulso-lento`) en vez de girar.
- **CSS:** `.traza`, `.traza-pasos`, `.traza-paso[data-estado]`, `.traza-marca`, `.traza-t`, `.traza-d`, `.traza-reloj`, `.traza-pliegue`, `.traza-resumen`. `el.dataset.estado` = `trabaja|mal|quieta|ok`.

```js
// F14 · el asistente, en preguntarIA()
const t = window.Piezas.traza(burbuja, { reloj: 's' });
t.paso('taller', 'Leí el taller', 'ok');
t.paso('qwen', 'Qwen', 'trabaja');  /* … */  t.salta('qwen', 'sin llave');
t.paso('gemini', 'Preguntando a Gemini', 'trabaja');
t.terminar({ ok: true, resumen: `Contestó Gemini en ${s} s` });
// H12 · abrir un PDF en el lienzo
const t = Piezas.traza('sc-overlay-pasos', { reloj: 'ds' });
t.paso('pdfjs', 'Bajando el lector de PDF', 'trabaja'); await cargarPdfJs(); t.hecho('pdfjs');
t.paso('hoja', 'Abriendo el PDF', 'trabaja'); try { await abrir(); t.terminar({ ok: true }); } catch (e) { t.falla('hoja', e.message); }
// P22 · el arranque, marcado fijo en index.html con P.trazaHTML(), y faseArranque() llama t.paso(fase, null, 'trabaja')
```

---

## 16 · Riel de pasos — `P.rielHTML` + `P.riel`

Entra en: H3 (hitos de entrega vertical + mini en el historial), C12 (4 pasos del cotizador), P7 (etapa en la ficha), F19 (agendar), H11 (calibración), F5 (riel del taller, con marcas), P25 (estaciones), F32 (pasos de Google Cloud, palomeables), A18 (instalar en iPhone).

```js
P.rielHTML(pasos, { forma, actual, tocable, etiqueta, id, clase, numeros: true, desliza, hoy })   // → cadena
const r = P.riel(el, { alTocar, enOrden, permitirAtras: true, marcable, alCambiar, aviso })
// → { fijar(pasos|estados, actual?), estados(), actual(), puede(i), negar(i), destruir() }
```
- `pasos`: cadenas o `{ texto, nota, estado, clave, titulo, extra, pos }`. `extra` es **HTML de la pantalla** (p. ej. el botón del hito) y va debajo del texto (`.riel-extra`). `pos` (0–1) solo en `'marcas'`.
- Estados: `'hecho'` (verde con palomita) · `'actual'` (anillo azul, `aria-current="step"`) · `'pendiente'` · `'espera'` (punteado ámbar) · `'tarde'` (rojo con muesca). Sin estados escritos, `actual` (índice) decide: antes hechos, ése actual, después pendientes.
- `forma`: `'vertical'` (omisión) · `'horizontal'` (`desliza: true` → tira que se recorre con el dedo, p. ej. 7 etapas a 360 px) · `'mini'` (puntos de 14 px, `role="img"` con la lista en su nombre; `titulo` por punto = fecha) · `'marcas'` (pista con marcas por fecha y `hoy` 0–1; `aria-hidden`: la frase de al lado es la que se lee).
- `tocable: true` → cada paso es un `<button class="riel-boton">` (44 px con el dedo).
- `P.riel(el)` cablea el `<ol class="riel">` (o su contenedor). `alTocar(i, estadoAntes, li, evento)`.
  - `enOrden`: tocar un paso que no toca **no hace nada** más que decir «Ese paso todavía no toca. Sigue: X» (por `aviso(texto)` si lo pasas —tu toast—, si no por una región viva) y una sacudida corta del actual. Los hechos se pueden tocar si `permitirAtras`.
  - `marcable`: tocar palomea/despalomea; el primero sin palomear queda `'actual'` («vas aquí»); `alCambiar(estados)` para que lo guardes en Prefs. Con `enOrden`, solo se palomea el actual y se despalomea el último.
  - `puede(i)` / `negar(i)`: para botones propios dentro de `extra` («Marcar»).
- `fijar()` cambia estados **en su sitio**: solo entonces se anima (la palomita entra y el conector se llena). Un riel repintado con innerHTML nace quieto. Acepta `['hecho','actual',…]` o objetos (`{}` + `actual`).
- **Menos movimiento:** nada se llena ni entra; ya está en su sitio.
- **CSS:** `.riel`, `.riel-v`, `.riel-h`, `.riel-desliza`, `.riel-mini`, `.riel-marcas`, `.riel-paso[data-estado]`, `.riel-punto`, `.riel-t`, `.riel-nota`, `.riel-boton`, `.riel-extra`, `.riel-pista`, `.riel-marca`, `.riel-hoy`.

```js
// H3 · hitos en entregaHTML(): el botón de cada hito va en `extra`
html += Piezas.rielHTML(HITOS.map(h => ({ texto: h.t, nota: pista(h), estado: hitoHecho(h) ? 'hecho' : (h === sig ? 'actual' : 'pendiente'),
  extra: `<button class="btn btn-gho" onclick="marcarHito('${h.k}')">${h.accion}</button>` })), { etiqueta: 'Entrega' });
// H3 · los cuatro puntos del historial
html += Piezas.rielHTML([{ texto: 'Propuesta', estado: 'hecho', titulo: 'Propuesta · 27 ago' }, …], { forma: 'mini' });
// F5 · el riel del taller en filaTaller()
html += window.Piezas.rielHTML(v.hitos.map(h => ({ texto: h.nombre, pos: h.pos, estado: h.paso ? 'hecho' : h.pos < hoy ? 'tarde' : 'pendiente' })), { forma: 'marcas', hoy });
// F32 · pasos de Google Cloud que se recuerdan
cont.innerHTML = window.Piezas.rielHTML(Gcal.instrucciones(), { tocable: true, etiqueta: 'Pasos de Google Cloud' });
window.Piezas.riel(cont, { marcable: true, alCambiar: e => Prefs.poner('gcal_pasos', e) }).fijar(guardados);
```

---

## 17 · Las esquinas que señalan — `P.senalar`

Entra en: C7 (llevar a lo que falta), H5 (lupa del escalador, en lienzo), F9 (pin a mano: retícula fija), A15 (avisos del anidador, varias a la vez), P3 (cuentas tocables).

```js
const s = P.senalar(destino, { tono: ''|'av'|'mal'|'ok', pad: 4, abre: 18, dura: 900, desplazar, esperar: true, quedar })
// → { listo: Promise<boolean>, soltar() }
P.senalar.lienzo(ctx, { x, y, w, h }, { largo: 8, grosor: 2, color })   // las mismas esquinas en un <canvas>
P.reticulaHTML({ clase })                                              // retícula quieta al centro de un contenedor position:relative
P.senalar.esquinas(rect, pad)                                          // cuenta pura
```
- `destino`: elemento, id, rectángulo `{left, top, width, height}` o **una lista** (una mira por cada uno).
- `desplazar: true` → si no está entero a la vista (entre `--top-fijo` arriba y `--mbar-h` abajo) lo trae con `scrollIntoView({block:'center'})` (que respeta el `scroll-padding-top` de `html`, hecho con `--top-fijo`). Luego **espera a que deje de moverse** (3 cuadros iguales, tope 1 s), vuela, se cierra sobre el rectángulo exacto (± `pad`), lo sigue si se desplaza, y se va a los `dura` ms.
- `quedar: true` → se queda hasta `soltar()` («otro toque las suelta», A15) y se reacomoda con scroll/resize.
- Solo transform y opacity. Van en la capa superior: se ven encima de una hoja o un modal.
- **Menos movimiento:** un aro fijo durante 1 s, sin vuelo.
- **CSS:** `.mira` (con `data-tono`), `.reticula`.

```js
// C7 · irACampoProy(): llevar, enfocar y señalar
Piezas.senalar(campo, { desplazar: true, tono: 'av' }); campo.focus({ preventScroll: true });
// P3 · la cuenta que baja a su tarjeta
window.Piezas.senalar(tarjeta, { desplazar: true });
// F9 · retícula del pin a mano sobre el mapa
lienzo.insertAdjacentHTML('beforeend', window.Piezas.reticulaHTML());
// H5 · en scLoupe(), cuando se pega a una guía
Piezas.senalar.lienzo(ctxLupa, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, { color: getComputedStyle(document.documentElement).getPropertyValue('--a') });
```

---

## 25 · Carga con los azules del logo — `P.cargaLogoHTML` + `P.cargaLogo`

Entra en: A23 (verificar.html), F10 (puerta de entrada).

```js
P.cargaLogoHTML({ etiqueta, chica })        // → cadena (cada una con su propio id de filtro)
const c = P.cargaLogo(el, { etiqueta, chica })   // el: un .carga-logo ya pintado o el contenedor donde agregarlo
// → { nodo, terminar(estado = 'ok'|'mal', texto?), destruir() }
```
- Tres círculos con filtro gooey en `--a-fuerte`, `--a`, `--a-claro`. Se mueven **solo mientras** `data-carga="espera"`; `terminar()` los junta en la forma del logo y se quedan quietos (sin animación infinita).
- `etiqueta` → `role="status"` con ese texto para el lector (`terminar(…, texto)` lo cambia). Sin etiqueta, es adorno (`aria-hidden`) de un texto que ya está al lado.
- **Menos movimiento:** pulso lento de opacidad (`pulso-lento`) mientras espera.
- **CSS:** `.carga-logo[data-carga]`, `.carga-logo-chica`, `.carga-logo-svg`. Atribución: Skiper UI skiper64 (gratis con atribución).

```js
// A23 · verificar.html
const c = Piezas.cargaLogo('ver-est', { etiqueta: 'Consultando el registro de AL3D' });
const r = await consultar(); c.terminar(r.ok ? 'ok' : 'mal', r.ok ? 'Auténtica' : 'No auténtica');
// F10 · la puerta, en pintar(): '<span class="puerta-carga">' + window.Piezas.cargaLogoHTML({ chica: true }) + '</span>'
```

---

## 26 · El letrero mientras se escribe — `P.letreroHTML` + `P.letrero`

Entra en: C14 (partida de letras 3D, bajo «Escribe el texto →»), función nueva 32 (el letrero sobre la foto del local).

```js
P.letreroHTML(texto, { material: 'aluminio'|'acrilico', luz: 'fria'|'calida'|'ninguna'|<color CSS>, color, alto, tam, pared, nota })  // → cadena
const l = P.letrero(el, { …mismas…, texto, ajustar, clase })   // → { fijar(cambios), destruir() }
P.letrero.tamLetra(altoPx, razon = 0.72)                         // cuenta pura
```
- **Aluminio = LED posterior**: cara opaca del color del material, halo **detrás** (drop-shadow del color de la luz). **Acrílico = LED frontal**: la cara **es** la luz, canto de aluminio. No se invierte.
- `color`: la cara (aluminio pintado negro, acrílico rojo…). `luz`: la ficha cálida/fría, `'ninguna'`, o un color.
- `alto` (px): alto **real de la mayúscula** (cm × px/cm del escalador); el cuerpo de letra se saca midiendo la «H» en la tipografía cargada. `tam`: cuerpo directo. Sin ninguno, `clamp(34px, 11vw, 64px)`.
- `ajustar: true` → achica hasta caber en su contenedor (vista previa en 360 px); sigue al contenedor con ResizeObserver.
- `pared: true` (solo en `letreroHTML`) → lo envuelve en `.letrero-pared` (marino) con la nota «Ilustrativo». Siempre dice que es ilustrativo (`role="img"` con `aria-label` «Letrero ilustrativo: «…» · aluminio con LED posterior · luz fría»).
- Sobre una foto: el elemento es `inline-block`; posiciónalo tú (`position:absolute` con tu clase; `fijar()` no toca tus clases).
- Solo se mueve porque alguien escribe: `fijar()` no anima.
- **CSS:** `.letrero`, `.letrero-aluminio`, `.letrero-acrilico`, `.luz-fria`, `.luz-calida`, `.luz-propia`, `.sin-luz`, `.letrero-pared`, `.letrero-nota`. Variables: `--letrero-cara`, `--letrero-luz`.

```js
// C14 · en bodyFor() de la partida de letras
html += '<div class="letrero-pared"><span class="letrero" id="letrero-' + it.id + '"></span><span class="letrero-nota" aria-hidden="true">Ilustrativo</span></div>';
// … después de pintar y en cada tecla:
Piezas.letrero('letrero-' + it.id, { texto: it.texto, material: it.material === 'acrilico' ? 'acrilico' : 'aluminio', luz: it.ilumTipo === 'calida' ? 'calida' : 'fria', ajustar: true });
// 32 · sobre la foto del escalador, a escala
Piezas.letrero(nodoSobreFoto, { texto, material, luz, alto: altoCm * SC.pxPorCm * escalaVista });
```

---

## Patrón · Búsqueda con fichas y coincidencia resaltada

Entra en: P6 (buscar un proyecto desde cualquier pantalla), H8 (fichas de filtro del historial), H15 (resaltar en historial y cuadernos).

```js
P.coincide(texto, busqueda)     // → boolean. Sin acentos ni mayúsculas; si la búsqueda es de puros números, compara solo dígitos («331234» ↔ «33 1234 5678»)
P.resaltar(texto, busqueda)     // → HTML escapado con <mark class="coincide"> en cada tramo; listo para innerHTML (NO lo pases por esc())
P.plegarTexto(texto, soloDigitos)    // → { txt, ini, fin } (el texto plegado y dónde cae cada letra en el original)
P.esNumerica(busqueda)          // → boolean
P.fichasHTML([{ id, texto, n }], { activo, etiqueta, multiple })   // → '<div class="fichas" role="group"><button class="chip ficha" data-ficha aria-pressed>texto <span class="ficha-n">n</span></button>…'
const f = P.fichas(el, { alElegir(valor, boton), multiple, todas: 'todas' })  // → { elegir(id), valor(), contar({id: n}), destruir() }
```
- Fichas: `<button>` con `aria-pressed`; la activa va hundida en `--a-suave` (no es el botón con relleno de la pantalla); 44 px con el dedo. Sencilla por omisión: tocar la activa la suelta y regresa a `todas`. `multiple`: cada una se prende y se apaga; `valor()` es la lista. `contar()` actualiza los conteos en su sitio.
- La marca va en `--a-suave` con la tinta completa (contraste medido).

```js
// H15 · en pintarHistorial()
`<b class="h-cli">${Piezas.resaltar(e.cliente, q)}</b> <span>${Piezas.resaltar(e.folio, q)}</span>`
// H8 · fichas bajo el buscador del historial
cont.innerHTML = Piezas.fichasHTML([{ id: 'todas', texto: 'Todas', n: total }, { id: 'pdf', texto: 'Sin PDF', n: sinPdf }], { activo: 'todas', etiqueta: 'Filtrar por lo que falta' });
const fichas = Piezas.fichas(cont, { todas: 'todas', alElegir: () => pintarHistorial() });
// … el predicado: FILTROS[fichas.valor()]
```
