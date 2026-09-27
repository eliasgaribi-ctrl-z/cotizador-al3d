# Piezas · 3 · Números, medidas y campos — la API

Para los agentes de pantalla. Todo vive en `js/piezas.js` (sección 3) y cuelga de `window.Piezas` (en el cotizador y en las páginas clásicas, `Piezas.x`; en los módulos de la plataforma, `window.Piezas.x` — llega antes que los módulos). El estilo está en `css/sistema.css`, bloques «Piezas · 3» y «rm · piezas · 3». **No copies ninguna pieza en tu pantalla: llámala.** Si te falta algo, adáptalo en tu pantalla y anótalo en `piezasQueFaltan`.

Reglas comunes a todas:

- Reciben un **elemento, un id o un selector** (`'v-neto'`, `'#rv-cuentas'`, `el`).
- Son **idempotentes**: llamarlas dos veces sobre el mismo elemento devuelve el mismo control y no duplica oyentes. Después de un `innerHTML` el elemento es otro: vuelve a llamar (o usa la variante delegada / la `clave`).
- **Sin manejadores en línea.** Las funciones `…HTML()` devuelven marcado sin `onclick`; después de pintarlo, llama a la pieza sobre él.
- Menos movimiento lo preguntan **en el momento** (`Piezas.sinMovimiento()`); en papel nada rueda ni viaja.
- Lo que despachan son **los mismos eventos que teclear** (`input` / `change`, con `bubbles`), así que tu código recalcula por donde siempre.
- Probadas: `pruebas/piezas-numeros.mjs` (node) y `pruebas/navegador/piezas-numeros.mjs` (vitrina `pruebas/navegador/piezas-numeros.html`, 8 rondas: 360/420 px × con/sin movimiento × claro/oscuro).

Índice: [1 · rodarCifra](#1--el-total-que-rueda-rodarcifra) · [diferenciaViva](#variante-número-animado-diferenciaviva) · [2 · fichaQueViaja](#2--la-ficha-que-viaja-fichaqueviaja) · [3 · arrastrarMedida(s)](#3--arrastrar-sobre-la-etiqueta-arrastrarmedida--arrastrarmedidas) · [18 · opcionesDeslizantes](#18--opciones-con-resaltado-que-se-desliza-opcionesdeslizantes) · [19 · casillasCodigo](#19--casillas-de-código-casillascodigo) · [19 · telefonoVivo](#19--el-teléfono-que-se-ve-completo-telefonovivo) · [20 · medidorHTML](#20--medidores-quietos-medidorhtml--pintarmedidor) · [deslizadorConImanes](#patrón--deslizador-con-imanes-deslizadorconimanes) · [cuentas puras](#las-cuentas-sin-pantalla)

---

## 1 · El total que rueda — `rodarCifra`

```js
Piezas.rodarCifra(el, texto, { clave, desde, animar, duracion, delta }) → Promise<boolean>   // true si rodó
Piezas.rodarCifra.olvidar(clave?)                                                          // sin clave, olvida todas
```

**Es el reemplazo de `el.textContent = texto`.** Pone el texto (formateado por TI: `money()`, `cant()`, un entero) y, si cambió respecto a lo último que se pintó ahí, lo hace rodar dígito por dígito, alineado por la derecha.

| Opción | Qué hace |
|---|---|
| `clave` | Memoria que sobrevive al `innerHTML`: el valor anterior se recuerda por la clave, no por el elemento. **Úsala en todo lo que se repinta entero** (el dock `.mbar-amt`, las cuentas `.pf-cuenta b`, `.cua-cifra`). |
| `desde` | Texto anterior explícito (gana a la memoria). |
| `animar:false` | Pinta y recuerda, sin rodar. **Úsalo al montar una pantalla** («nunca al entrar», P18) y al abrir otra cotización. |
| `duracion` | ms (600 por omisión). |
| `delta` | `true` → un «+1»/«−1» breve junto a la cifra (P18). O una función `d => texto`. |

**Garantías (probadas):**
- `el.textContent === texto` **desde el primer cuadro**: la rueda es una capa `aria-hidden` que pinta sus cifras con `::before`. Tus `if(v.textContent!==t)`, `latirTotal()`, `_netoPrev` y el lector de pantalla ven el número final, una vez.
- La caja no cambia de tamaño (la cifra real ocupa su sitio, en transparente): `_medirTotal()/_volarTotal()` (escala por el ALTO) y `cifraQueCabe()` (`--c`) siguen igual. Probado bajo `scale(.6)`.
- Convive con `body.precios-ocultos`: el `filter:blur` está en tu elemento y la capa es su hija. `_SEL_PRECIO` sigue encontrando el elemento (`closest`).
- La primera vez que ve un número **no rueda**. La misma cifra otra vez no reinicia la rueda que va. Una cifra nueva a media rueda sigue desde donde iba.
- Con menos movimiento, en papel, con la pestaña oculta o sin caja: cambia sin rodar. El «+1» con menos movimiento es un fundido (dice cuánto cambió).
- El elemento debe tener **solo texto** (el número). Añade la clase `rueda-cifra` (tabular-nums y `position:relative` con `:where`, así que no pisa un `position` tuyo).

**Clases:** `.rueda-cifra` (en tu elemento), `.rueda-rodando` (mientras rueda), `.rueda-vista/.rueda-col/.rueda-tira/.rueda-ch` (la capa), `.rueda-delta.sube|.baja` (el «+1»).

**Ejemplos**

```js
// C23 · el total de la columna del dinero y el de la barra de pasos (renderSummary, pintarPasoTotal)
Piezas.rodarCifra('s-neto', money(dCol.neto));
Piezas.rodarCifra('paso-total-v', money(pf));

// C23 · el dock: renderMobileBar() lo reescribe con innerHTML en cada pintado → clave
bar.innerHTML = `…<span class="mbar-amt">${money(pf)}</span>…`;
Piezas.rodarCifra(bar.querySelector('.mbar-amt'), money(pf), { clave: 'cot-dock' });
// y en nueva() / al abrir otra del historial:
Piezas.rodarCifra.olvidar('cot-dock');

// P18 / F23 · una cuenta de la plataforma (se repinta en cada toque): marca el <b> con data-cuenta
// en tu plantilla y, después del innerHTML:
for (const b of raiz.querySelectorAll('.pf-cuenta b[data-cuenta]'))
  Piezas.rodarCifra(b, b.textContent, { clave: 'tablero:' + b.dataset.cuenta, animar: !primerPintado, delta: true });

// H26 · cifras del vectorizador y de los cuadernos
Piezas.rodarCifra('vt-st-colores', String(n));
```

---

## Variante «número animado» — `diferenciaViva`

```js
Piezas.diferenciaViva(el, n, { decimales = 2, unidad, cero, nada, formato, clave, animar, duracion = 280 }) → string
Piezas.cifras.proporcionDudosa(libro, dice, veces = 3) → boolean
```

Escribe `n` con su signo (`+0.6 láminas`, `−1,200`, `0 láminas`; el menos es U+2212) y lo hace rodar corto (se teclea). Deja `data-signo="mas|menos|cero"` en `el` para que tu CSS pinte (el redondeo es el mismo del texto: «+0.001» con 1 decimal es `cero`). `formato(abs)` para pesos (`formato: money` → `+$1,200.00`). **El aviso ámbar es tuyo**: decide con `proporcionDudosa()` (3× o más, en cualquier dirección; con el libro en 0 no avisa; contar 0 con libro > 0 sí) y escribe la frase con palabra, no solo color.

```js
// F4 · abrirContar(): la diferencia contra el libro mientras se teclea
const alTeclear = () => {
  const dice = parseFloat($('mt-contar').value);
  Piezas.diferenciaViva($('mt-dif'), isFinite(dice) ? dice - libro : NaN, { decimales: 1, unidad: 'láminas', nada: '' });
  $('mt-dif-aviso').hidden = !(isFinite(dice) && Piezas.cifras.proporcionDudosa(libro, dice));
};
// <output id="mt-dif" aria-live="polite"></output> <p id="mt-dif-aviso" class="…ámbar…" hidden>¿Seguro? Es mucho más de lo que dice el libro</p>
```

---

## 2 · La ficha que viaja — `fichaQueViaja`

```js
Piezas.fichaQueViaja(grupo, { activo, item, medir, clave, duracion = 240 }) → { mover(), destruir() }
Piezas.fichasQueViajan(raiz = document.body, selector = '.seg,.tipo-seg,.tool-seg', opciones) → { destruir() }
```

**La app sigue mandando**: tú pones y quitas `.on`/`aria-pressed`/`aria-current` como siempre (onclick, repintado, historial); un `MutationObserver` ve el cambio y una sola ficha viaja del elegido anterior al nuevo con `transform` (FLIP). **La ficha solo existe durante el viaje**: copia el aspecto del destino (fondo, radio, sombra, borde), va detrás de los botones y se va al llegar. En reposo el elegido se pinta con TU regla de siempre, así que el marino de `.tipo-seg`, el azul de noche de `.partida .tipo-seg`, el apagado de una partida congelada, el `.active` de `.tool-seg` o el filete de la barra lateral siguen siendo los tuyos sin CSS extra.

| Opción | Qué hace |
|---|---|
| `activo` | Selector del elegido. Por omisión: `.on, .active, [aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], [aria-current]:not([aria-current="false"])`. |
| `item` | Filtro de los hijos directos que cuentan (por omisión, todos). |
| `medir(item)` | El elemento que lleva el relleno, si no es el botón (la `.pil` de la barra de abajo). |
| `clave` | Para un grupo que **nace de nuevo** con innerHTML (la partida entera se rehace al tocar su tipo): si en los últimos 1.5 s había otro grupo con esa clave y el elegido cambió, viaja desde donde estaba. También sale de `data-ficha-clave` o del `id` del grupo. |

Si solo se reescriben los **hijos** (como `pintarNav()`), no hace falta clave: sale del rectángulo que midió antes.

**Clases:** `.con-ficha` (en el grupo: `position:relative; isolation:isolate` con `:where`), `.ficha-viaja` (la ficha), `.ficha-destino` (en el destino mientras llega; esconde su relleno). **`.ficha-transparente`** en el grupo: los NO elegidos pierden el fondo (el borde se queda) para que la ficha se vea pasar por debajo — ponla en grupos de `.chip` con fondo propio (`#f-plazo`, `#rv-plazo`, las fichas de filtro H8).

**Teclado/toque:** los tuyos (la pieza no toca botones). **Menos movimiento / papel:** no viaja; el elegido cambia como cambiaba. Cambiar el ancho re-mide sin animar.

```js
// .seg y .tipo-seg de todo el cotizador, también las partidas que se repintan (una vez, al arrancar):
Piezas.fichasQueViajan(document.body, '.seg,.tipo-seg,.tool-seg');
// …y en la plantilla de la partida, para que la ficha cruce el repintado:
`<div class="tipo-seg" role="group" data-ficha-clave="tipo-${it.id}" …>`

// C23 · #f-plazo / #rv-plazo (chips con fondo):
$('f-plazo').classList.add('ficha-transparente'); Piezas.fichaQueViaja('f-plazo');

// P19 · barra lateral (filete) y barra de abajo (la píldora del icono); pintarNav() ya reescribe los hijos:
Piezas.fichaQueViaja('pf-nav');
Piezas.fichaQueViaja('pf-abajo', { medir: b => b.querySelector('.pil') });

// H26 · vistas del vectorizador (aria-pressed) y cotas del escalador (.active)
Piezas.fichaQueViaja($('vt-view-orig').parentElement); Piezas.fichaQueViaja($('sc-cotas-todas').parentElement);
// F22 · índice de Ajustes: los enlaces con aria-current="true" que mueve tu IntersectionObserver
Piezas.fichaQueViaja('aj-indice');
```

---

## 3 · Arrastrar sobre la etiqueta — `arrastrarMedida` / `arrastrarMedidas`

```js
Piezas.arrastrarMedidas(raiz = document, { px, paso, min, max, alMover, alSoltar }) → { destruir() }   // delegado
Piezas.arrastrarMedida(etiqueta, input?, { px = 6, paso, min, max, caja, alMover, alSoltar }) → { destruir() }
```

La **etiqueta** es el mango; el campo sigue siendo un `<input>` que se teclea. Cada `px` px horizontales = un `step` del campo (con su `min`/`max`), Shift ×10. En cada paso escribe el campo y despacha `input`; al soltar, `change`. **No roba el scroll del teléfono** (`touch-action:pan-y` + zona muerta de 4 px): el dedo que baja desplaza la página y no mueve la medida (probado). Un toque sin arrastrar enfoca el campo, como siempre; el clic que llega al soltar un arrastre se traga (no abre el teclado). No vibra.

**Marcado que espera:** `<label for="id-del-campo" class="arrastrable">` o cualquier elemento con `data-arrastrar="id-del-campo"`. Opcional `data-arrastre-px`. El `step`, `min` y `max` salen del campo. Para lo que se repinta, **un solo `arrastrarMedidas(raiz)`** al arrancar: sirve para las etiquetas de ahora y las de después.

**Clases:** `.arrastrable` (rayitas `::after`; en táctil la zona crece con `::before` sin mover nada), `.arrastre-activo` (en la etiqueta y en su `.fld` mientras dura), `html.arrastre-medida` (cursor). **Teclado:** el campo (flechas nativas de `type=number`). **Menos movimiento:** igual (no anima nada).

```js
// C (partidas): en la plantilla de bodyFor(), <label for="h-${it.id}" class="arrastrable">Altura (cm)</label>
// y lo mismo en # Letras y m². Una vez, al arrancar:
Piezas.arrastrarMedidas('card-partidas');           // typeItem() recibe los input como si se tecleara

// H26 · vectorizador (alto/ancho real) y escalador (cm de la referencia): marcado estático
Piezas.arrastrarMedida(document.querySelector('label[for="vt-alto-cm"]'));
Piezas.arrastrarMedida(document.querySelector('label[for="sc-ref-cm-input"]'), null, { px: 4 });
```

---

## 18 · Opciones con resaltado que se desliza — `opcionesDeslizantes`

```js
Piezas.opcionesDeslizantesHTML({ id, etiqueta, etiquetadaPor, oculto, valor, opciones: [{ v, t, sub, clase, apagada }] }) → string
Piezas.opcionesDeslizantes(grupo, { valor /* hidden */, alCambiar(v, boton), clave }) → { valor(), fijar(v, avisar), destruir() }
```

Un `role="radiogroup"` de `.chip` (`role="radio"`, `aria-checked` y `.on`, así que se ve como un chip elegido de la app) con una pastilla que viaja (es `fichaQueViaja` por dentro). **Teclado de radio de verdad:** flechas (dan la vuelta), Inicio, Fin; la flecha mueve el foco y elige; solo la elegida está en el tabulador. El valor va al `<input type="hidden">` (`oculto` o `valor`) y se despachan `input` y `change` en él. `alCambiar` solo cuando cambia de verdad. Opciones con `apagada` se saltan.

**No decide nada del negocio:** las etiquetas «con IVA / sin IVA» (`sub`), el orden («la que coincide primero») y el aviso ámbar de C4 son de la pantalla. **Nunca cambies el IVA en automático.**

**HTML que genera:** `<div class="glide" role="radiogroup" aria-label… data-valor="rv-cuenta"><button type="button" class="chip on" role="radio" aria-checked="true" tabindex="0" data-v="…">Texto<small>sub</small></button>…</div><input type="hidden" id="rv-cuenta" value="…">`. Clase `.glide`: rejilla de opciones de ≥150 px, 48 px de alto, los no elegidos sin fondo.

```js
// C4 · Registrar venta: el <select id="rv-cuenta"> se vuelve fichas; datosParaLaHoja() sigue leyendo $('rv-cuenta').value
$('rv-cuentas-caja').innerHTML = Piezas.opcionesDeslizantesHTML({
  etiquetadaPor: 'rv-cuenta-l', oculto: 'rv-cuenta', valor: cuentaInicial,
  opciones: cuentas.map(c => ({ v: c, sub: ivaDeCuenta(c) ? 'con IVA' : 'sin IVA', clase: ivaDeCuenta(c) ? 'con' : 'sin' }))
});
Piezas.opcionesDeslizantes($('rv-cuentas-caja').firstElementChild, { alCambiar: revisarIvaDeLaCuenta });
```

---

## 19 · Casillas de código — `casillasCodigo`

```js
Piezas.casillasCodigoHTML({ id, n = 12, grupo = 4, esperado, etiqueta, describe, clase, inputmode }) → string
Piezas.casillasCodigo(input, { n, grupo, alfabeto, equivalencias, esperado, boton, separador = '-', etiqueta,
                               textoRechazo, alCambiar(valor, completo), alCompletar(agrupado) })
  → { valor(), completo(), fijar(v), vaciar(cascada), marcar('ok'|'mal'|null), destruir() }
Piezas.codigo.HEX          // { alfabeto: /[0-9A-F]/, equivalencias: { O:'0', I:'1', L:'1' } }
Piezas.codigo.normalizar(bruto, { n, alfabeto, equivalencias }) → { valor, rechazados }
Piezas.codigo.agrupar('A1B2C3D4E5F6', 4) → 'A1B2-C3D4-E5F6'
```

Un solo `<input>` transparente encima se queda con el foco, el pegado, el autocompletado y el lector; las casillas son dibujo (`aria-hidden`); **la fila entera es la zona táctil**. Al teclear y al pegar: mayúsculas, sin espacios ni guiones, `equivalencias`, y lo que no es del `alfabeto` (o sobra del largo) se quita → la fila se sacude una vez (con menos movimiento no, el borde rojo se queda) y una región viva dice qué se quitó. El cursor vive al final. `alCompletar` recibe el código agrupado.

- **Por omisión el alfabeto es `[0-9A-Z]` sin equivalencias**: para verificar (A1) pasa `...Piezas.codigo.HEX`.
- `esperado: 'BORRAR'` (F27): cada casilla que no coincide sale en rojo (`.casilla.mal`) al teclearla, `completo` solo con la palabra exacta, y `boton` lleva `aria-disabled="true|false"` (no `disabled`). Sin festejo al completar.
- `marcar('ok')` = el lavado verde en cascada (cuando la hoja confirmó). `marcar('mal')` = borde rojo y se vacía en cascada (devuelve promesa). Con menos movimiento, de una vez.

**Clases:** `.casillas` (`.completo`, `.acierto`, `.fallo`, `.rechazo`), `.casillas-in`, `.casillas-grupo`, `.casilla` (`.llena`, `.cursor`, `.mal`), `.casillas-voz`.

```js
// A1 · verificar.html: el código en tres grupos de cuatro
$('ver-codigo').innerHTML = Piezas.casillasCodigoHTML({ id: 'f-c', n: 12, grupo: 4, etiqueta: 'Código de verificación, 12 caracteres' });
const cod = Piezas.casillasCodigo('f-c', { ...Piezas.codigo.HEX, textoRechazo: 'El código solo lleva 0–9 y A–F', alCompletar: consultar });
// al contestar la hoja: cod.marcar(autentica ? 'ok' : 'mal')

// F27 · Ajustes, cordonFinal(): «BORRAR» y el botón con aria-disabled
Piezas.casillasCodigo('aj-borrar', { esperado: 'BORRAR', boton: 'aj-borrar-b' });   // cordonBorrar() sigue validando al apretar
```

---

## 19 · El teléfono que se ve completo — `telefonoVivo`

```js
Piezas.telefonoVivo(input, { numeroWa, alCambiar(lectura) }) → { repintar(), estado(), destruir() }
Piezas.telefonoVivoHTML({ id, valor, placeholder, etiquetadoPor, describe, requerido }) → string
Piezas.telefono.numeroWa(t)      // la regla de telWa / telWhatsApp, idéntica (probado caso por caso contra las dos)
Piezas.telefono.leer(t, regla)   // → { estado, completo, nacional, digitos, prefijo, wa, cuenta }
Piezas.telefono.formato('3328130092') → '33 2813 0092'
Piezas.telefono.contador(lectura) / .frase(lectura)
```

«33 2813 0092 ✓» en vivo y un contador «8/10» en el borde derecho del campo. **El criterio es el de la app**: usa `telWhatsApp` si está cargado (cotizador), o el `numeroWa` que le pases (en la plataforma, `telWa` de ui.js), o `Piezas.telefono.numeroWa`, que es la misma regla. Pegar «+52 3328130092» deja «33 2813 0092 ✓». Con un prefijo tecleado (+52, 044, 01, 00) deja el texto como va hasta que la regla lo reconoce. El formato se aplica **antes** que tu `oninput` (oyente en captura en la caja), así que `upd('tel', this.value)` ya recibe el número con espacios. El cursor se conserva por dígitos y el retroceso sobre un espacio borra el dígito de antes.

`estado`: `vacio` · `faltan` · `completo` · `internacional` · `internacional-parcial` · `revisa` · `sobran` · `no`. **`revisa`** es cuando lo tecleado contradice la lectura de la regla: «+52 33 1234 56» (la regla ve diez dígitos y lo lee como 52 3312 3456) o once dígitos sin «+» (la regla lo acepta como internacional). No lleva ✓ y va en ámbar con su frase. El estado va en un `<span class="solo-voz">` enlazado por `aria-describedby` (se añade al que ya tenga el campo).

**Envuelve** el campo en `<span class="tel-vivo">` (con `.tel-cuenta` y `.tel-estado`); `.fld input`, `.fld.falta input` y el `id` siguen funcionando. **Cuando escribas el campo sin evento** (`historial.js` al abrir una cotización, `autocompletarCliente()`), llama a `repintar()`.

**Clases:** `.tel-vivo` (`.completo`, `.revisa`, `.recien`, `data-estado`), `.tel-vivo-in`, `.tel-cuenta`, `.tel-estado`.

```js
// C8 · cotizador.html #f-tel (su oninput="upd('tel',this.value)" se queda)
const tel = Piezas.telefonoVivo('f-tel');
// y después de $('f-tel').value = Q.tel en historial.js / nucleo.js:
tel.repintar();
// Plataforma (módulo ES): con la regla de ui.js
import { telWa } from '../nucleo/ui.js';
window.Piezas.telefonoVivo(input, { numeroWa: telWa });
```

---

## 20 · Medidores quietos — `medidorHTML` / `pintarMedidor`

```js
Piezas.medidorHTML({ valor, max = 1, rayado, meta, muesca, estimado, tono, texto, clase }) → string
Piezas.pintarMedidor(el, mismasOpciones) → fracciones
Piezas.cifras.medidor(opciones) → { v, r, meta, muesca, bajoCero }   // todas entre 0 y 1
```

Una barra de 6 px **sin transición ni animación**. Tres señales que no son color: **lleno** (`valor`), **rayado** (`rayado`: lo que ya tiene dueño, recortado a lo que hay; o todo el lleno con `estimado: true`, P30 con `x.deNotion`) y **muesca** (`muesca`: mínimo o lo que piden). `meta` > valor pinta el hueco punteado en ámbar hasta ahí. `valor` negativo → vacía con marca roja en el cero (el libro en rojo, F3). `tono`: `ok` · `av` · `mal` (por omisión el azul). Mismas unidades que `max` (o fracciones con `max` 1).

**Accesible:** sin `texto` es `aria-hidden` — **deja tu frase de siempre al lado** («hay 2.4 · piden 3»); con `texto`, `role="img"` con esa frase. En papel se imprime (`print-color-adjust`) y la frase va de todos modos. La barra no lleva texto encima.

**Clases:** `.medidor` (`.tono-*`, `.estimado`, `.bajo-cero`) con `<i class="medidor-lleno|medidor-rayado|medidor-falta|medidor-muesca|medidor-cero">` y variables `--v --r --meta --muesca`.

```js
// F3 · material.js filaCompra(): «hay X · piden Y», con lo comprometido y el mínimo
html += Piezas.medidorHTML({ valor: hay, max: Math.max(hay, pide, minimo) * 1.2, rayado: comprometido, meta: pide, muesca: minimo });
// P30 · control.js filaCobro(): cobrado contra vendido, rayado si el saldo es estimado
html += Piezas.medidorHTML({ valor: cobrado, max: vendido, tono: 'ok', estimado: !!x.deNotion });
// F3 · ajustes.js cardRespaldo() y A12 · aprovechamiento por hoja
html += Piezas.medidorHTML({ valor: usadosMB, max: cuotaMB, tono: pct > 90 ? 'av' : '' });
```

---

## Patrón · Deslizador con imanes — `deslizadorConImanes`

```js
Piezas.deslizadorConImanes(inputRange, {
  imanes,        // [v | { v, radio /* en unidades */, t /* rótulo */ }]; sin radio, 12 px (radioPx)
  radioPx = 12, redondeo /* p. ej. 100: fuera de un imán, a cientos */, pasoTeclado /* p. ej. 100 */,
  marcas,        // true (cada step) | [v | { v, t }] | omitido = los imanes
  etiqueta(v), texto(v) /* aria-valuetext */, pastilla, elastico, origen /* desde dónde se rellena */, grueso,
  campo, formatoCampo(v), alMover(v), alSoltar(v)
}) → { valor(), fijar(v, avisar), rango(min, max, { imanes, marcas, origen }), destruir() }
```

Sobre un `<input type="range">` **nativo**: el teclado (flechas, Re Pág/Av Pág, Inicio, Fin), el foco y el lector vienen gratis. Añade:

- **Imanes** solo al arrastrar (ratón, dedo): el más cercano dentro de su radio gana; fuera, `redondeo`. Con `pasoTeclado` las flechas avanzan a múltiplos de ese paso y Re Pág/Av Pág saltan de imán en imán (y el campo pasa a `step="any"`, para poder valer $6,264.48).
- **Marcas** con rótulo debajo; los rótulos que no caben no se pintan (las rayitas sí; primero y último siempre). Colores 2–24 cabe a 360 px.
- **Pastilla** con el valor, pegada al pulgar y sin salirse de la pista (H9).
- **Liga** (`elastico`): jalar más allá de un tope estira el riel y regresa al soltar (C18). Nunca con menos movimiento.
- **`campo` espejo** (`#f-anti`, `#a-precio`): el deslizador lo escribe y despacha `input` al moverse y `change` al soltar; lo tecleado en el campo mueve el pulgar. **El campo manda**: fuera de rango, el pulgar se queda en el tope y la caja lleva `.fuera` (pulgar ámbar) para que tú lo digas.
- **`alSoltar`** en el `change` nativo: al soltar el dedo, o una vez por tecla — H9: re-trazar aquí y no en `input`.
- El oyente de `input` va en captura: cuando corre tu `oninput`, el imán ya se aplicó. No vibra.

**Envuelve** el range en `<span class="desl-caja">` (con `.desl-pastilla` y `.desl-marcas`). **Clases:** `.desl-iman` (`.grueso` = la barra de dos tramos de C17), `.desl-caja` (`.con-pastilla`, `.fuera`, `data-estira`), `.desl-marca` (`.iman`, `.en`, `.sin-texto`), `.desl-pastilla`. El pulgar mide 44 px (zona táctil) y se ve de 24.

```js
// C17 · anticipo: barra de dos tramos, imán fuerte al 50 % exacto, a cientos, tope en el total (el que se cobra, con IVA)
const anti = Piezas.deslizadorConImanes('f-anti-r', {
  campo: 'f-anti', grueso: true, redondeo: 100, pasoTeclado: 100,
  imanes: [{ v: pf / 2, radio: pf * .02, t: '50%' }, { v: pf, t: 'Total' }],
  texto: v => `Hoy ${money(v)}, al instalar ${money(pf - v)}`
});
anti.rango(0, pfNuevo, { imanes: [...] });            // cuando cambia el total

// C18 · el autorizador: −20 % a +10 % del calculado, imanes en 0/−5/−10/−15 %, con liga; el campo es el subtotal SIN IVA
Piezas.deslizadorConImanes('a-precio-r', {
  campo: 'a-precio', elastico: true, redondeo: 100, pasoTeclado: 100, origen: subCalc, formatoCampo: v => String(Math.round(v)),
  imanes: [0, -5, -10, -15].map(p => ({ v: subCalc * (1 + p / 100), t: (p ? '−' + -p : '0') + '%' }))
});   // #a-precio ya llama a updPrecioAuth() en su oninput

// H9 · vectorizador: marcas, pastilla y re-trazar al soltar (Colores 2–24)
Piezas.deslizadorConImanes('vt-colores', { marcas: true, pastilla: true, alSoltar: () => VT.trazo && vtVectorizar() });
Piezas.deslizadorConImanes('vt-detalle', { marcas: true, pastilla: true, etiqueta: v => ['Bajo', 'Medio', 'Alto'][v], alSoltar: … });
```

---

## Las cuentas sin pantalla

`Piezas.cifras` (probado en node): `plan(viejo, nuevo, vivas)` · `diferencia(n, o)` · `signo(n, dec)` · `proporcionDudosa(libro, dice, veces)` · `pasoDeArrastre(v0, dx, o)` · `imanar(bruto, o)` · `decaer(v, max)` · `marcasQueCaben(marcas, sep)` · `medidor(o)`. `Piezas.telefono`: `numeroWa`, `leer`, `formato`, `cursor`, `contador`, `frase`. `Piezas.codigo`: `HEX`, `normalizar`, `agrupar`.
