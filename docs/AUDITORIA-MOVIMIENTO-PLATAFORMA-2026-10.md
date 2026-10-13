# Auditoría de movimiento e interacción de la plataforma (Emil Kowalski) — octubre 2026

Hecha el 2026-10-13 con la skill emil-design-eng por 4 revisores en paralelo, sobre la rama `claude/clics-que-se-pierden` (PR #107: lo más nuevo, con el Mapa de zoom fluido y pines por estatus). Todo se midió en Chromium real (`document.getAnimations()`, capturas a mitad de animación, CPU ×4). No se cambió código, salvo `mapa-1`, que era un defecto del zoom recién hecho y se corrigió en el mismo PR #107 (58c3eb9). La auditoría de septiembre (PR #75) no se repite.

## Resumen para Elías

**35 hallazgos: 8 altos, 10 medios y 17 bajos.** Nada rompe datos. Lo que más se siente:

| # | Qué se siente | Dónde |
|---|---|---|
| `marco-1` | Cambiar de pantalla tarda **más de medio segundo** en asentarse (hasta 0.7 s en Ajustes). Se puede conservar el «flujo» que pediste con la mitad del tiempo. | Todas |
| `marco-2` | Mientras cambias de pantalla, la que se va y la que llega se ven **encimadas** un instante. | Todas |
| `obra-1`, `obra-2` | En el teléfono, un renglón del Tablero **avanza de etapa** con un deslizón corto, aunque te detengas antes de soltar. | Tablero |
| `datos-1` | En el Calendario, 4 clics rápidos en › tardan **1 segundo** en llegar al mes: cada cambio espera al anterior. | Calendario |
| `mapa-2` | Al filtrar, los pines nuevos aparecen donde estaban y luego **brincan** ~180 px cuando el mapa se reencuadra. | Mapa |
| `mapa-4` | En el teléfono, la hoja de abajo **sale disparada** hacia arriba si sueltas con el dedo quieto. | Mapa |
| `mapa-5` | Cerrar la ficha del Mapa con el dedo **abre el teclado** del teléfono (el foco cae en el buscador). | Mapa |
| ~~`mapa-1`~~ | ~~El zoom con rueda perdía giros.~~ **Arreglado en PR #107.** | Mapa |

### Tandas sugeridas
1. **Lo que se siente roto** (S, bajo riesgo): `obra-1`, `obra-2`, `mapa-4`, `mapa-5`, `datos-1`. Son de gestos y foco; arreglos chicos y medibles.
2. **Velocidad del cambio de pantalla** (S, solo CSS + 2 números): `marco-1`, `marco-2`, `marco-3`, `marco-4`. Conviene que Elías lo vea antes de fusionar, porque el «flujo» lo pidió él.
3. **Que las cosas viajen de donde están** (M): `mapa-2`, `mapa-3`, `obra-3`, `obra-4`, `datos-2`, `datos-3`.
4. **Pulido** (bajos): curvas fuera del sistema, presión de botones a .95 en vez de .97, salidas tan lentas como las entradas, animaciones que se repiten en cada visita (`marco-5`, `datos-6`), hover sin `pointer:fine`.

---

# Detalle por grupo (tablas Antes / Después / Por qué)


## Grupo: Marco: cambiar de pantalla, avisos, «Preguntar», Cotizador empotrado

## Grupo `marco` — lo transversal

**Pantallas:** cambio de pantalla (barra de abajo, menú lateral, teclas 1–9), hoja «Más», confirmar (`confirmarPf`), avisos con «Deshacer», botón «Preguntar» y asistente, tema claro/oscuro, Ajustes, Qué atender, Publicaciones, entrada y salida del Cotizador, :active y hover de los botones del marco.
**Tamaños:** teléfono 390×844 táctil; computadora 1280×800 con ratón. **Tema:** claro (y el cambio a oscuro). **Rol:** dirección. **Extra:** CPU ×4 (CDP) y `prefers-reduced-motion: reduce`.
**Código:** worktree `clics`, servidor 8960. Scripts: `scratchpad/pw/marco1.mjs`, `marco2.mjs`, `marco3.mjs` (+ `marco-comun.mjs`). Datos crudos: `r1.json`, `r2.json`, `r3.json`. Capturas en esta carpeta.

Contexto: el «flujo entre pantallas» (commit 0e59ddc, octubre 2026) lo pidió Elías y deshace a propósito el corte de 120 ms que dejó la auditoría de septiembre. No propongo quitarlo: propongo que el mismo flujo dure la mitad y que las dos pantallas no se encimen.

| Antes | Después | Por qué |
|---|---|---|
| marco-1 · ALTA · Cambiar de pantalla tarda en asentarse 540 ms (Calendario) a 700 ms (Ajustes): `.pf-mod` `pf-entra-der .34s` con `.06s` de retraso + `pf-cascada .42s` con retrasos de 40 en 40 hasta `.28s` (11 bloques en Ajustes) + título `pf-titulo .32s` | Entrada de `.pf-mod`: `.22s var(--ease-out)` sin retraso, 16 px. Cascada: `.24s var(--ease-out)`, paso de 30 ms y solo los 4 primeros hijos (`:nth-child(n+5)` sin retraso extra, entra con el 4.º). Título: `.18s var(--ease-out)`, 4 px. Todo quieto en ≤ 330 ms | Es lo que más se repite en el día (cada toque de la barra). Con 700 ms la pantalla todavía se está acomodando cuando Elías ya quiere tocar algo; la sensación de «ir a otro lugar» se conserva con la mitad del tiempo |
| marco-2 · ALTA · La pantalla que se va sale con `cubic-bezier(.4,0,1,1)` (ease-in) en 170 ms: a los 125 ms sigue medio visible y se enciman los textos de las dos pantallas (captura `A-mitad-125ms.png`) | `duration: 120, easing: 'cubic-bezier(.23,1,.32,1)'` (la `--ease-out` de la casa) y que solo se desvanezca con un desplazamiento corto (`dx = ∓16`) | Con ease-in lo viejo se queda opaco justo cuando entra lo nuevo: se ve un revoltijo de dos pantallas. Con ease-out lo viejo ya casi no está a los 60 ms, cuando arranca lo nuevo |
| marco-3 · MEDIA · Con CPU ×4 el cambio a Ajustes da un cuadro de 261 ms (tarea larga de 226 ms) y el de Calendario uno de 133 ms; en ese momento se clona la sección entera (`cloneNode(true)`) y se animan hasta 11 bloques a la vez | Cascada topada a 4 hijos (marco-1) y no clonar la pantalla de salida cuando pase de ~400 nodos (`s.querySelectorAll('*').length > 400` → solo fundido de la nueva) | En un teléfono de gama media se ve el tirón justo al tocar la barra. Menos cosas animándose a la vez y no copiar pantallas grandes quita trabajo al peor momento |
| marco-4 · MEDIA · Entrar al Cotizador junta tres entradas: la sección se desliza 36 px (`pf-entra-der .34s +.06s`), el `<iframe>` se funde aparte (`opacity .22s … .06s`) y el esqueleto aparece (`pf-esq-aparece .3s +.18s`) con la barra de progreso; visible a los 450 ms | En `#mod-cotizador` sin deslizamiento (`html.va-adelante #mod-cotizador{animation:none}` y lo mismo para `va-atras`): solo el fundido del marco, `.18s var(--ease-out)` | Mover un iframe pesado que todavía carga no aporta dirección y suma tres movimientos encimados; el fundido solo ya dice «llegó» |
| marco-5 · BAJA · El brillo del botón «Preguntar» (`ia-barrido 5.5s … 1.2s 2`) vuelve a correr completo cada vez que se sale del Cotizador (al ocultarse con `display:none` y volver, la animación renace; medido `running t=33` al volver a Tablero) | Que el barrido corra una vez por sesión: quitarlo con una clase (`.pf-ia-btn.ya-brillo::after{animation:none}`) que se pone en `animationend` del primer barrido | Un brillo que se repite en cada vuelta deja de llamar la atención y se vuelve ruido; ya se vio la primera vez |
| marco-6 · BAJA · «Preguntar» con ratón: en hover está a `translateY(-2px) scale(1.03)` y al presionar salta a `scale(.96)` (7 % de golpe y baja 2 px) | `@media(hover:hover) and (pointer:fine){.pf-ia-btn:hover:active{transform:translateY(-1px) scale(1)}}` y fuera de hover `.pf-ia-btn:active{transform:scale(.97)}` | La presión debe sentirse como un leve hundimiento, no como un brinco del botón |
| marco-7 · BAJA · Botones del encabezado (`.pf-cab-tema`, buscar, `.pf-sesion`, `.pf-cerrar`, `.ia-copiar`) presionan a `scale(.95)`; el resto de la app usa `.97`/`.98` | `scale(.97)` | Misma familia, misma presión; .95 en un botón de 44 px se ve como un salto |
| marco-8 · BAJA · Barra de progreso de arriba (`#pf-progreso`): `transition: opacity .25s` con curva `ease` por omisión | `transition: opacity .2s var(--ease-out)` (conservar el retraso de 150 ms que ya tiene al encender) | Es la única transición del marco fuera del sistema de curvas |

### Detalle por hallazgo

**marco-1** — Dónde: `css/plataforma.css:2866-2867` (`va-adelante/va-atras`), `:2882-2891` (`pf-cascada`), `:2892-2893` (`pf-titulo`); se encienden en `js/app.js:976-1060` (`ponerDireccion`, `marcarLlegada`, `terminarLlegada`). Cómo lo medí: `document.getAnimations()` 25 ms después del toque (teléfono, Tablero→Calendario: entrada 340 ms + 60, cascada 420 ms con retrasos 0/40/80/120; computadora, a Ajustes: 11 bloques con retrasos hasta 280 ms) y un bucle de rAF hasta que no queda nada corriendo: Ajustes 706 ms, Qué atender 589 ms, Publicaciones 462 ms. Riesgo: bajo; es solo CSS. Elías pidió el flujo, así que conviene enseñarle el resultado antes de fusionar. El `setTimeout` de 900 ms de `terminarLlegada` puede bajar a 450.

**marco-2** — Dónde: `js/app.js:1017` (`MS_SALE = 170`) y `:1042` (`easing: 'cubic-bezier(.4,0,1,1)'`), `dx = ±36` en `:1039`. Cómo lo medí: `getAnimations()` muestra `Animation 170 ms cubic-bezier(0.4, 0, 1, 1)` en `SECTION.pf-sale`; captura a los 125 ms (`A-mitad-125ms.png`) con Tablero y Calendario superpuestos. Riesgo: bajo; solo cambian dos números y la curva.

**marco-3** — Dónde: `js/app.js:1018-1047` (`despedir`, clon completo) y la cascada de marco-1. Cómo lo medí: `Emulation.setCPUThrottlingRate 4` + rAF: Calendario peor cuadro 133 ms; Ajustes peor cuadro 261 ms y `PerformanceObserver('longtask')` = [226, 66] ms. Riesgo: medio. No aislé cuánto de la tarea larga es pintar el módulo y cuánto es clonar y animar; hay que volver a medir después de marco-1.

**marco-4** — Dónde: `css/plataforma.css:2866-2867` aplicadas a `#mod-cotizador`; fundido del iframe en `js/mod/cotizador.js` y su CSS (`opacity .22s … .06s`); esqueleto `pf-esq-aparece` (`css/plataforma.css:2584`). Cómo lo medí: teléfono, toque en «Cotizador» de la barra; `getAnimations()` lista `pf-entra-der` en `#mod-cotizador`, la transición del iframe, `pf-esq-aparece`, `esq-barre` ×17 y `pf-progreso-corre`; el iframe llega a opacidad 1 a los 450 ms. Al volver (marco conservado) llega en 2 ms y solo queda el deslizamiento. Riesgo: bajo.

**marco-5** — Dónde: `css/plataforma.css:2464` (`.pf-ia-btn::after`) y `:2168` (`body.pf-marco-lleno .pf-ia-btn{display:none}`). Cómo lo medí: esperé 12,5 s (sin barrido), navegué entre pantallas (sin barrido), entré al Cotizador y volví: `ia-barrido running t=33`. Riesgo: bajo.

**marco-6** — Dónde: `css/plataforma.css:2467-2481` (hover y `.pf-ia-btn:active{transform:scale(.96)}`). Cómo lo medí: `CSS.forcePseudoState` por CDP y `getComputedStyle().transform` tras 260 ms: hover `matrix(1.03,…,-2)`, hover+active `matrix(.96,…,0)`. Riesgo: nulo.

**marco-7** — Dónde: `css/plataforma.css:2645`. Cómo lo medí: igual que marco-6: buscar, tema y sesión dan `matrix(.95…)`; los del menú lateral `.98`, el «Deshacer» `.96`. Riesgo: nulo.

**marco-8** — Dónde: `css/plataforma.css:2568-2569`. Cómo lo medí: al entrar a Qué atender, `CSSTransition opacity 250 ms, ease, retraso 150` en `#pf-progreso`. Riesgo: nulo.

### Lo que ya está bien
- Teclas 1–9: `pf-aparece` a 0 ms, sin cascada, sin título animado, sin clon (`data-nav="teclado"`). Medido.
- Escape cierra «Más», confirmar y el asistente sin animación (lista vacía a los 15 ms); con toque o clic sí animan.
- Hojas: abren con `transform .32s var(--ease-hoja)` + velo 200 ms; cierran en 220/140 ms (la salida es más rápida que la entrada). En computadora el confirmar entra desde `scale(.96) translateY(6px)` (no desde 0) y sale a `.98` en 140 ms.
- Avisos: entran con `aviso-entra .24s` ease-out, salen con transición de 150 ms; con «Deshacer» la mecha dura 8 s; tres avisos seguidos se apilan sin saltos (los de atrás se funden en 160 ms).
- Doble toque rápido en la barra: un solo clon, y las clases `pf-llega`/`va-*` se limpian solas.
- Movimiento reducido: el cambio de pantalla queda en un fundido de 150 ms, la hoja «Más» solo opacidad, el tema sin revelado, el aviso con fundido. Menos, no cero.
- Hover: todas las reglas del marco van detrás de `@media(hover:hover)`; no hay `transition: all` ni ease-in en las hojas de estilo; todos los botones del marco tienen `:active`.
- Tema: revelado con `clip-path` de 380 ms. Es una acción rara, así que se acepta.

### Sin reproducir
- Glifo de sincronización: estuvo `hidden` (`data-sync="quieto"`) en todas las corridas con la hoja de mentiras; no lo vi cambiar de estado ni animarse.
- Bajar la hoja «Más» con el dedo (velocidad para descartar, amortiguación en el borde): no lo probé con gestos.
- Hover sin media query en `leaflet.css` (3 reglas): es del Mapa, de otro grupo.


## Grupo: Tablero y Proyectos

## Auditoría Emil · grupo `obra`

- **Pantallas:** Tablero (`#/hoy`, renglón deslizable de `js/piezas.js` §9, «Deshacer» con mecha) y Proyectos (`#/proyectos`: arrastre de tarjetas, columna iluminada, autodesplazamiento, ficha y viaje de la tarjeta).
- **Tamaños:** 1280×800 con ratón; 900×800 táctil (Fold abierto, el tablero se desliza); 390×844 táctil (teléfono).
- **Tema/rol:** claro, dirección. Con y sin `prefers-reduced-motion: reduce`. CPU ×6 en el autodesplazamiento.
- **Código:** worktree `clics`, servidor 8960. Scripts: `scratchpad/pw/obra1.mjs` … `obra5.mjs`; resultados crudos en `r1.json` … `r5.json`; capturas `p-arrastre.png`, `p-ficha.png`, `t-deshacer.png`.

| Antes | Después | Por qué |
|---|---|---|
| obra-1 · ALTA · renglón del Tablero: dedo 46 px a la derecha, **quieto 900 ms**, levanta → **avanza la etapa** (sale «Deshacer»). La velocidad se calcula con movimientos viejos, sin contar el momento de soltar | En `alSoltar`, antes de `_vel`: `s.pts.push([e.timeStamp, e.clientX])` y, si `e.timeStamp - último movimiento > 80 ms`, `v = 0` | Quien se detiene a medio camino está dudando; hoy el renglón lo trata como latigazo y mueve el proyecto de etapa |
| obra-2 · MEDIA · `filaDecide`: un latigazo de **46 px** (12 % del renglón de 350 px) a > 0,5 px/ms dispara la acción principal (avanzar etapa) | Principal: `dx > Math.max(64, anchoFila * 0.22) && v > 0.6`; abrir acciones a la izquierda se queda como está (`dx < -24 && v < -0.5`) | Avanzar etapa escribe y saca material; un roce al desplazar la lista no debe bastar. Abrir acciones no escribe nada, ahí sí conviene que sea fácil |
| obra-3 · MEDIA · soltar en otra columna: el fantasma **desaparece en seco** donde se soltó y la tarjeta viaja **desde su hueco de origen** (`matrix(… 257, 399)` → `452, 399`), 320 ms `cubic-bezier(.23,1,.32,1)` | El «antes» de la transición se toma del **fantasma** (darle a él el `view-transition-name` y quitarlo de la tarjeta; borrar el fantasma dentro del callback de la transición). Duración `250ms`, `var(--ease-out)` | Hoy la tarjeta da dos saltos: regresa de golpe a donde estaba y luego vuela. Debe salir de donde la dejó la mano |
| obra-4 · MEDIA · soltar donde no vale (misma columna, fuera del tablero) o Escape: el fantasma se borra en el primer cuadro (`.pj-fantasma` sin animaciones, 0 cuadros grabados); la tarjeta reaparece sin moverse | `fantasma.animate([{transform: actual}, {transform: 'translate(origenX,origenY)'}], {duration: 200, easing: 'cubic-bezier(.23,1,.32,1)'}).finished.then(() => fantasma.remove())`; con menos movimiento, quitarlo directo | Ver que la tarjeta «regresa a su lugar» dice que no se movió nada; desaparecer en seco parece que se perdió |
| obra-5 · BAJA · cerrar la ficha tras cambiar la etapa: la salida dura **140 ms**, pero el viaje espera `setTimeout(…, 260)`; la tarjeta empieza a moverse a los **324 ms** del toque | `setTimeout(…, sinMov() ? 0 : 160)` y corregir el comentario («220 ms de salida» ya no es cierto) | 120 ms muertos entre que la ficha se fue y la tarjeta se mueve; se siente lento |
| obra-6 · BAJA · el fantasma aparece de golpe a tamaño completo (sin animaciones al levantar) | Al crearlo: `fantasma.animate([{scale: .96, opacity: .7}, {scale: 1, opacity: 1}], {duration: 150, easing: 'cubic-bezier(.23,1,.32,1)'})` (propiedad `scale` aparte, no choca con el `transform` que lo mueve) | Un pequeño «despegue» confirma que la tarjeta ya está en la mano |
| obra-7 · BAJA · la columna que recibe se ilumina en seco: `.pj-col` `transition: all 0s` | `.pj-col{transition: background-color 120ms var(--ease-out)}` (el aro `outline` se queda instantáneo) | Al pasar de columna en columna el fondo parpadea; un fundido corto lo suaviza sin retrasar la respuesta |
| obra-8 · BAJA · amortiguación del renglón con **tope duro**: a la izquierda sigue al dedo hasta −188 px y luego frena a −204 px y no pasa (80 px más de dedo = 16 px; 120 px más = 16 px) | Resistencia continua: `extra = 24 * (1 - 1 / (exceso / 60 + 1))` | El tope duro se siente como chocar con una pared; la resistencia que crece se siente física |
| obra-9 · BAJA · autodesplazamiento al borde (Fold): **18 px por cuadro** fijo (medido 72 px / 66 ms a 60 Hz y lo mismo con CPU ×6); en una pantalla de 120 Hz correría al doble | Escalar por tiempo: `dx * (dt / 16.7)` con `dt` del `requestAnimationFrame` | La velocidad debe depender de qué tan cerca está el dedo, no del teléfono |

### Detalle por hallazgo

**obra-1**
- Dónde: `js/piezas.js` ~l.2340 (`alSoltar`: `v: _vel(s.pts)`) y l.1461 (`_vel`). `alMover` solo guarda puntos al moverse; al soltar no se agrega el punto final ni se mira cuánto lleva quieto.
- Cómo lo medí: `obra5.mjs`, PointerEvents de toque sintéticos sobre la cara del renglón: 12/26/40/46 px en 4 cuadros, espera 900 ms, `pointerup` → aparece «Deshacer» («Ponerlo en diseño»). Con CDP (eventos cada ~40 ms) la velocidad quedó en 0,33 y no disparó, por eso el sintético.
- Riesgo: bajo. Una línea; solo vuelve más conservador el latigazo.

**obra-2**
- Dónde: `js/piezas.js` ~l.2240 `P.filaDecide` (`dx > 40 && v > 0.5`).
- Cómo lo medí: `obra5.mjs`, latigazo de 46 px en 4 cuadros y soltar → avanza la etapa.
- Riesgo: bajo; afecta también las partidas del cotizador y el escalador (misma pieza). Si allá debe seguir igual, pasar el piso por opción (`o.latigazoMin`).

**obra-3**
- Dónde: `js/mod/proyectos.js` `soltarEnColumna()` (~l.2005: `soltarArrastre()` quita el fantasma antes de `moverEtapa`) y `pintarLista()` (~l.578, `nombres: { [nombre]: donde }`). Curva/duración de `css/sistema.css` l.4255 (`--vt-dur .32s`).
- Cómo lo medí: `obra2.mjs`/`obra5.mjs`, `getComputedStyle(html, '::view-transition-group(vt-pj-…)')` → `0.32s`, `cubic-bezier(0.23,1,0.32,1)`; primer cuadro clave `matrix(0.99,…,257,399)` = hueco de origen, no el punto de soltar (≈ 520, 430).
- Riesgo: medio. Toca la pieza de transición por nombre; probar también el camino de la ficha (que sí debe salir del hueco) y Alt+→.

**obra-4**
- Dónde: `js/mod/proyectos.js` `soltarArrastre()` ~l.1838 (`a.fantasma.remove()`).
- Cómo lo medí: `obra2.mjs`, ratón levanta y suelta en la misma columna; grabador por cuadro sobre `.pj-fantasma` → 0 cuadros, sin animaciones.
- Riesgo: bajo; cuidar que el fantasma que regresa no reciba eventos (ya trae `pointer-events:none`) y que un segundo levantamiento cancele el regreso.

**obra-5**
- Dónde: `js/mod/proyectos.js` ~l.2025–2033.
- Cómo lo medí: `obra2.mjs`, «Ya se diseñó» en la ficha → × → salida `opacity/transform 140ms`; primer `::view-transition-group` a los 324 ms.
- Riesgo: bajo. Si la salida de la ficha cambia, el número debe seguirla (mejor leer `transitionend` del panel).

**obra-6**
- Dónde: `js/mod/proyectos.js` `levantar()` ~l.1926; `css/plataforma.css` l.3513.
- Cómo lo medí: `obra1.mjs`, grabador por cuadro: al levantar solo hay transiciones de la tarjeta de origen, ninguna en `.pj-fantasma`.
- Riesgo: muy bajo.

**obra-7**
- Dónde: `css/plataforma.css` l.1629 (`.pj-col`) y l.3503 (`.pj-col.sobre`).
- Cómo lo medí: `obra1.mjs`, `getComputedStyle(.pj-col.sobre).transition` = `all` (0 s), sin animaciones al entrar.
- Riesgo: muy bajo.

**obra-8**
- Dónde: `js/piezas.js` ~l.2318 (`Math.min(16, (exceso) * 0.2)`).
- Cómo lo medí: `obra3.mjs`, CDP táctil cada 20 px: −180→−180, −200→−190,4, −280→−204, −320→−204.
- Riesgo: muy bajo.

**obra-9**
- Dónde: `js/mod/proyectos.js` `correrPorElBorde()` ~l.1955 (`CORRE_MAX = 18` por cuadro).
- Cómo lo medí: `obra4.mjs`, 900×800 táctil, pulsación de 320 ms, dedo a 860 px: `scrollLeft` 58→346 en 266 ms (18 px/cuadro); con CPU ×6 igual por cuadro. 120 Hz no se pudo emular: el doble de velocidad sale del cálculo, no de la medición.
- Riesgo: bajo.

### Lo que ya está bien
- Ficha: entra en 220 ms (`opacity`+`transform` desde `scale(.96)`, `cubic-bezier(.23,1,.32,1)`) y sale en 140 ms (la salida es más rápida). Escape la cierra sin animación (acción de teclado). La confirmación al cruzar «Cortado» va igual: 200 de entrada y 140 de salida.
- Ratón en Proyectos: a 5 px no se levanta, a más de 8 px sí; cursor `grab`/`grabbing`; hover `translateY(-2px)` solo con `hover:hover and pointer:fine`; `:active scale(.985)`, 100 ms.
- Dedo en el Fold: se levanta a los 250 ms; el tablero corre solo por el borde y quita el imán mientras arrastra.
- Renglón del Tablero: la cara regresa con `transform .26s cubic-bezier(.23,1,.32,1)`, solo `transform`; el eje se decide a los 8 px; con ratón no se desliza (como se pidió).
- «Deshacer» en el botón: mecha de 5000 ms `linear` en `scaleX`; el cambio de rótulo (`rotulo-a/b`) dura 180 ms `opacity`+`transform` con ease-out, y el botón hace `scale` al presionarse.
- Menos movimiento: no hay viaje (sin view transition), el fantasma sin `rotate`, y la cara del renglón sin transición (sigue al dedo, que no es adorno).

### Sin reproducir
- La pista del primer uso (900 ms `ease-in-out`, retraso de 350 ms, según el código): cuando llegó la lectura ya había terminado; no se midió.
- El autodesplazamiento en una pantalla real de 120 Hz, iOS Safari y un dedo de verdad (todo fue Chromium con eventos de CDP o sintéticos).
- Tirones con la CPU ×6 en el arrastre: el fantasma y el `scrollLeft` siguieron a 18 px por cuadro, sin cuadros perdidos que se vieran en la grabación.


## Grupo: Mapa y herramientas

## Auditoría de movimiento (Emil) · grupo `mapa`

- **Pantallas:** Mapa (`#/mapa`, js/mod/mapa.js, css/plataforma.css) y Mesa de corte / Vectorizador (`#/anidador`, `#/vectorizar`, js/mod/herramientas.js).
- **Código:** worktree `clics`. Servidor 127.0.0.1:8960, Chromium 1234 con Playwright.
- **Probado en:** computadora 1366×768 (ratón, sin táctil); teléfono 390×844 (táctil, isMobile); tema claro; rol dirección; `prefers-reduced-motion: reduce` en el teléfono; CPU ×6 para el zoom.
- **Datos:** 14 obras sembradas (pines Fabricación, Cobrando, Liquidado y Sin estatus; 4 del día para la ruta).
- **Scripts:** `m1.mjs` a `m5.mjs` en esta carpeta. Capturas: `m2-pin-entrando.png`, `m4-ficha.png`, `m4-ruta.png`, `m5-anidador.png`, `m5-vectorizar.png`.

| Antes | Después | Por qué |
|---|---|---|
| mapa-1 · ALTA · **(ARREGLADO en PR #107, 58c3eb9)** Después de cada gesto de rueda, `asentar()` lanza `m._animateZoom()` hacia el MISMO zoom: 233 ms con `_animatingZoom=1`, y la rueda hace `if (m._animatingZoom) return`. Medido: 2 golpes de rueda dados en ese hueco se perdieron completos (zoom 13.021 → 13.021; se esperaban +1.33) | En `asentar()`, cambiar `m._animateZoom(...)` por `m._moveEnd(true)`: con `zoomSnap:0` no hay nivel al cual ajustar. Si se deja la animación, que la rueda no se descarte: guardar `objetivo` y retomarlo en `zoomend` | Con el zoom nuevo pasa a cada rato: giras, haces una pausa corta, vuelves a girar y el mapa no responde un cuarto de segundo. Se siente pegajoso, justo lo que Elías pidió quitar |
| mapa-2 · ALTA · Al tocar un chip, los pines que entran crecen con `el.animate({transform: 'translate3d(viejo) scale(.3→1)'}, 160ms)` mientras `encuadrar()` hace un `fitBounds` de 250 ms. La animación congela la posición vieja: medido, la punta del pin se queda en (535,599) y a los 206 ms **brinca a (687,499), ~180 px** | Animar la propiedad independiente `scale` (y `opacity`), no `transform`: `el.animate([{scale:.3,opacity:0},{scale:1,opacity:1}],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'})`. `scale` se compone con el `translate3d` de Leaflet y el pin acompaña al encuadre. Igual para la salida y para el latido de la ruta | Cada vez que se filtra, los pines nuevos aparecen en un lugar equivocado y se teletransportan. Se ve roto en el filtro nuevo, que se usa a diario |
| mapa-3 · MEDIA · `transform-origin: 0px 0px` en `.leaflet-marker-icon.mapa-pin` (viene de `.leaflet-zoom-animated`). El pin crece desde su esquina de arriba a la izquierda: medido, la punta camina de (524,575) a (535,599), ~26 px, mientras crece. El latido 1→1.3→1 de la ruta crece hacia abajo a la derecha | `.leaflet-marker-icon.mapa-pin{transform-origin:16px 32px}` y `.leaflet-marker-icon.mapa-pin.sel{transform-origin:20px 40px}` (el ancla, la punta). Leaflet solo traslada los marcadores y el origen no le afecta | Un pin tiene que nacer de su punta, que es la dirección. Hoy se ve resbalar hacia su lugar |
| mapa-4 · ALTA · Hoja del teléfono: la velocidad del soltar es la del ÚLTIMO `pointermove`, aunque el dedo lleve quieto. Medido: desde «media» (y=355) se subió a y=275 (80 px de media, 217 de alta), **quieto 450 ms**, soltar → se fue a **alta** (y=58) como si fuera un tirón | En `alSoltarArrastre`: `const v = (Date.now() - a.t) > 80 ? 0 : a.v;`. Mejor aún, medir la velocidad sobre los últimos ~100 ms (guardar 3–4 muestras) | Si acomodas la hoja y te detienes, al soltar tiene que quedarse en la parada más cercana. Hoy sale disparada hacia arriba y tapa el mapa |
| mapa-5 · ALTA · Cerrar la ficha con el dedo (botón ×, `cerrarFicha({foco:true})`) deja el foco en `INPUT.mapa-q`. Medido en 390×844 táctil: `document.activeElement` = el campo de búsqueda | Con un toque, devolver el foco al asa de la hoja o al pin (no a un campo de texto). El foco al buscador solo cuando se cerró con Escape. O, como mínimo, `focus({preventScroll:true})` sobre un elemento que no sea campo en `(pointer:coarse)` | En un teléfono, enfocar un campo de texto abre el teclado: cierras la ficha y medio mapa queda tapado por el teclado. No es movimiento, pero sí lo que se siente al cerrar |
| mapa-6 · BAJA · `.mapa-hoja{transition: transform .32s var(--ease-out)}` = `cubic-bezier(.23,1,.32,1)` | `transition: transform .32s var(--ease-hoja)` (`cubic-bezier(.32,.72,0,1)`) | El sistema ya tiene la curva de las hojas del teléfono y la hoja del mapa no la usa: arranca más brusco que las demás hojas de la app |
| mapa-7 · BAJA · Bordes de la hoja: arriba se para en seco (arrastrar 470 px más allá deja y=58 = alta exacta); abajo deja pasar 24 px lineales (y=566) y luego se para en seco | Amortiguar fuera de los límites: `fuera = y - límite; y = límite + Math.sign(fuera) * 24 * (1 - Math.exp(-Math.abs(fuera)/60))` en los dos bordes | Un tope duro se siente como un error; un borde que cede poquito y regresa dice «hasta aquí» |
| mapa-8 · BAJA · Lo que acompaña a la hoja (`#mapa-lienzo .leaflet-bottom` y `.mapa-tira`) anima `bottom` 320 ms: propiedad de diseño, recalcula la página en cada cuadro. Medido en el arrastre: 1 layout y ~3 recálculos de estilo por cada movimiento del dedo | Dejar `bottom` fijo y moverlos con `transform: translateY(calc(-1 * var(--mapa-abajo)))`, con la misma transición | Solo transform/opacity se animan sin trabajo extra; en un teléfono modesto es lo que separa seguir al dedo de ir a tirones |
| mapa-9 · BAJA · El pin que sale dura lo mismo que el que entra: 160 ms `cubic-bezier(.2,.8,.2,1)`, con `fill:'forwards'` | Salida en 120 ms con `var(--ease-out)`; entrada se queda en 160 ms | Lo que se va tiene que irse más rápido que lo que llega: la vista va a lo que quedó |

### Detalle por hallazgo

#### mapa-1 · La rueda se pierde durante el «asentado»
- **Dónde:** js/mod/mapa.js:1715-1721 (`asentar`) y :1735 (`if (m._animatingZoom) return;`).
- **Cómo lo medí:** `m3.mjs`. Capturé el `L.Map` con `L.Map.addInitHook` (importando el mismo `/vendor/leaflet-src.esm.js`) y leí `getZoom()` y `_animatingZoom` por cuadro. Un golpe de rueda (−120): el zoom llega en 280 ms; a los 386 ms dispara `zoomanim` hacia 12.355 (el mismo valor) y queda `_animatingZoom` de 396 a 629 ms. Prueba B: golpe, espero a `_animatingZoom`, dos golpes más → el zoom no se movió.
- **Riesgo:** bajo. `_moveEnd(true)` es el mismo cierre que usa Leaflet; hay que comprobar que los cuadros se piden al terminar (lo hace `moveend`). Las pruebas del zoom en `pruebas/navegador` deben seguir pasando.

#### mapa-2 · Los pines que entran se teletransportan
- **Dónde:** js/mod/mapa.js:1152-1166 (`animarPin`), :1622-1628 (latido de la ruta), :2445 (chip → `refrescarPines({animar:true}); encuadrar();`).
- **Cómo lo medí:** `m5.mjs`, primer bloque: apago y prendo «Cobrando» y registro por cuadro la punta del pin animado. 39 ms (524,575) → 189 ms (535,599) con la animación; 206 ms (687,499) sin ella. En `m2.mjs` los fotogramas clave salen con el traslado fijo: `translate3d(302px, 516px, 0px) scale(0.3)` → `... scale(1)`. Los pines que se quedan sí viajan con la transición de Leaflet (250 ms, `cubic-bezier(0,0,.25,1)`).
- **Riesgo:** bajo. `scale` como propiedad suelta existe en Chrome 104+, Safari 14.1+ y Firefox 72+. Con `scale` ya no hace falta leer `el.style.transform`. El de salida con `fill:'forwards'` también deja de congelar la posición.

#### mapa-3 · El pin crece desde su esquina
- **Dónde:** vendor/leaflet.css:188 (`.leaflet-zoom-animated{transform-origin:0 0}`); se corrige en css/plataforma.css junto a :1533.
- **Cómo lo medí:** `m1.mjs` (`getComputedStyle(pin).transformOrigin = "0px 0px"`, caja 32×34 con márgenes −16/−32). `m2.mjs`: pausé la entrada a 40 ms; la caja está en el mismo x,y que al final pero mide 27×28, o sea que crece hacia abajo a la derecha. Captura `m2-pin-entrando.png`.
- **Riesgo:** muy bajo. Las animaciones de zoom de Leaflet a los marcadores son solo `translate3d`, y al origen no le importa la traslación. Hay que verificar el pin `.sel` (30 px, ancla 20/40).

#### mapa-4 · La hoja sale disparada al soltar quieta
- **Dónde:** js/mod/mapa.js:1010 (cálculo de `v`) y :1028 (`if (Math.abs(a.v) > .5)`).
- **Cómo lo medí:** `m4.mjs`, prueba 2b, con toques reales por CDP (`Input.dispatchTouchEvent`): 4 movimientos de 20 px cada 12 ms, 450 ms quieto, soltar. Termina en `alta`. Con «menos movimiento» la hoja salta en vez de deslizarse, pero el destino equivocado es el mismo.
- **Riesgo:** bajo. El umbral de tirón (0.5 px/ms) se queda igual.

#### mapa-5 · Cerrar la ficha abre el teclado
- **Dónde:** js/mod/mapa.js:2491 (`cerrarFicha({ foco: true })`) y el destino del foco dentro de `cerrarFicha`.
- **Cómo lo medí:** `m4.mjs`. Toqué un pin, luego `[data-cerrar-ficha]`, y leí `document.activeElement` = `INPUT.mapa-q`. También se ve que arranca la transición de foco del buscador (borde y sombra, 200 ms). Que se abra el teclado no se puede ver en Chromium sin pantalla. En Android Chrome y en iOS un `focus()` dentro de un toque sí lo abre.
- **Riesgo:** medio. Quien llega por teclado necesita que el foco vuelva a un lugar razonable; hay que separar el caso del dedo y el de Escape/teclado.

#### mapa-6 · Curva de la hoja
- **Dónde:** css/plataforma.css:858.
- **Cómo lo medí:** `getComputedStyle(#mapa-hoja).transition` y `getAnimations()` al tocar el asa: `transform 320ms cubic-bezier(0.23, 1, 0.32, 1)`, de translateY(542px) a 355px.
- **Riesgo:** nulo. Las dos cosas que la siguen (`.leaflet-bottom` y `.mapa-tira`, css/plataforma.css:767 y ~3825) deben llevar la misma curva para no despegarse.

#### mapa-7 · Bordes sin amortiguar
- **Dónde:** js/mod/mapa.js:1008 (`Math.min(P.baja + 24, Math.max(P.alta, ...))`).
- **Cómo lo medí:** `m4.mjs`, prueba 3: 30 movimientos de 30 px hacia arriba → y=58 (=alta), sin ceder nada. Hacia abajo, 40 movimientos → y=566 (=baja+24), y al soltar regresa a 542.
- **Riesgo:** bajo.

#### mapa-8 · `bottom` animado
- **Dónde:** css/plataforma.css:767 y la regla de `.mapa-caja>.mapa-tira:not([hidden])` (~:3825, `transition:bottom .32s`).
- **Cómo lo medí:** `getAnimations()` al tocar el asa: `leaflet-bottom leaflet-left|bottom|320`, de 246px a 433px. En el arrastre, `Performance.getMetrics`: LayoutCount +6 y RecalcStyleCount +20 en 6 movimientos. Parte de ese layout lo pone también `padding-bottom: calc(var(--hoja-y) ...)` del cuerpo (css/plataforma.css:869).
- **Riesgo:** medio. `.leaflet-bottom` es de Leaflet y el crédito tiene que verse; las pruebas que miden que la tira y el crédito no se toquen leen posiciones, así que siguen valiendo con `transform`. No medí tirones reales con CPU ×4 en el arrastre.

#### mapa-9 · Salida tan lenta como la entrada
- **Dónde:** js/mod/mapa.js:1159-1163.
- **Cómo lo medí:** `getAnimations()` al apagar un chip: `W160` con `cubic-bezier(0.2, 0.8, 0.2, 1)` tanto en la entrada como en la salida.
- **Riesgo:** nulo. Si se hace junto con mapa-2, el `setTimeout(sacar, 400)` sigue cubriendo.

### Lo que ya está bien
- **Botones + y −:** suben un nivel con la animación de Leaflet (250 ms, `cubic-bezier(0,0,.25,1)`). Los botones redondos tienen `:active scale(.94)` en 160 ms con `--ease-out`.
- **Chips de estatus:** heredan `:active scale(.97)` y transición de 160 ms. El chip no anima nada propio.
- **Zoom fluido con rueda:** un golpe llega a su objetivo en ~280 ms, hacia el cursor, sin brincos de nivel. Con CPU ×6 tarda lo mismo (292 ms) porque el rAF siguió a ~17 ms.
- **Trazo de la ruta:** 800 ms lineal (a propósito, para sincronizar los números) y cada número con un latido de 240 ms. Empieza cuando termina el encuadre (~250 ms), no antes. Es un momento único, no algo que se repita.
- **Menos movimiento:** la hoja queda `transition: none`, los pines no crecen ni se encogen, la ruta no se traza y la rueda llega de inmediato. Lo de información (el borde de la parada actual) se queda.
- **Mesa de corte y Vectorizador (`herramientas.js`):** la silueta se cruza con el marco (`.pf-marco` opacidad .22 s `--ease-out` con 60 ms de retraso; la silueta sale en 160 ms) y la silueta se quita del DOM a los 450 ms. Correcto. Lo de dentro de los iframes es del anidador y del cotizador, no de este grupo.

### Sin reproducir
- **`zoomFluido` depende de los cuadros por segundo:** se acerca un 30 % por cuadro. En una pantalla de 120 Hz llegaría en ~140 ms en vez de ~280 ms. No tengo pantalla de 120 Hz y CPU ×6 no bajó el rAF de 60 Hz. La corrección sería `1 - Math.pow(0.7, dt/16.7)`.
- **Tirones del arrastre de la hoja en un teléfono modesto:** conté layouts (mapa-8), pero no medí cuadros perdidos con CPU ×4.
- **Pin que sale congelado durante el encuadre:** misma causa que mapa-2. Solo lo vi un cuadro (`W160@0`) antes de que lo taparan las transiciones de Leaflet en mi registro.
- **De paso, fuera del grupo:** al entrar a `#/anidador` y `#/vectorizar` sale `pf-sale` (170 ms, `cubic-bezier(0.4, 0, 1, 1)`, una curva ease-in) del cambio de pantalla general. Es del grupo que tenga el enrutador.


## Grupo: Calendario, Control y Material

## Hallazgos · grupo `datos`

- **Pantallas:** Calendario (`#/agenda`, js/mod/fabricacion.js), Control (`#/control`, js/mod/control.js), Material (`#/material`, en mantenimiento: solo lo visible).
- **Tamaños:** 390×844 (táctil, móvil) y 1280×800 (ratón). **Tema:** claro. **Rol:** dirección. Además 390 con `prefers-reduced-motion: reduce` y 390 con CPU ×4.
- **Código:** worktree `clics` (HEAD 93da208), servidor 127.0.0.1:8960. Datos sembrados con `sembrarObras` / `sembrarVentas` de `pw/ctl/base.mjs`.
- **Scripts y registros:** `pw/emil-datos.mjs` (registrador de `document.getAnimations()` por cuadro), `pw/emil-cal1.mjs`, `pw/emil-cal2.mjs`, `pw/emil-ctl.mjs`, `pw/emil-x.mjs`; salidas en esta carpeta (`cal1.log`, `cal2.log`, `ctl.log`, `x.log`, capturas `*.png`).

| Antes | Después | Por qué |
|---|---|---|
| datos-1 · ALTA · Calendario: cada ‹ › espera a que termine el viaje anterior. 4 clics a 60 ms entre sí → los títulos llegan a los 63, 396, 713 y 1046 ms (≈330 ms por mes, en cola) | Si ya hay un viaje en curso, el clic nuevo lo salta (`ViewTransition.skipTransition()`) y pinta el mes de inmediato; solo el ÚLTIMO mes de la ráfaga viaja. Meta: 4 clics ⇒ marzo a los ≈250 ms, no a 1 s | Buscar una fecha es pulsar › varias veces; hoy la rejilla va atrás del dedo un segundo entero y se siente lenta. Lo que se dispara seguido tiene que poder interrumpirse |
| datos-2 · MEDIA · Calendario, deslizar el mes: al soltar a −140 px / opacidad .65 el lienzo vuelve de golpe a 0 px y opacidad 1 (captura a 30 ms) y ~68 ms después arranca el viaje `vt-sale-izq` desde 0 | Al pasar el umbral, NO limpiar el transform: que el mes viejo siga desde donde lo dejó el dedo (animar `translateX(dx)` → `translateX(-100%)` con opacidad a 0, 200 ms `--ease-out`) y que el nuevo entre desde el lado contrario; o capturar la vista vieja con el transform puesto | El mes «rebota» al centro un instante antes de irse: se ve como un parpadeo y rompe la sensación de que el dedo empujó la hoja |
| datos-3 · MEDIA · Calendario, deslizar: solo cuenta la distancia (`GESTO_UMBRAL = 48` px). Un golpe rápido de 40 px en 16 ms no cambia de mes | Cambiar también si la velocidad al soltar es > 0.11 px/ms (o > 0.5 px/ms con ≥ 20 px), midiendo con los dos últimos `pointermove` | Un golpe corto y rápido es la intención más clara de «siguiente»; hoy obliga a arrastrar despacio y largo |
| datos-4 · MEDIA · Calendario: las cuentas de arriba ruedan en cada cambio de mes (`span.rueda-tira`, 600 ms, `cubic-bezier(.2,.8,.2,1)`), y en ráfaga se reinician | En el Calendario pasar `duracion: 280` a `rodarCifra` (o no rodar con `viaje` en curso y solo rodar al cambio de datos, no de periodo) | Cambiar de mes no es «la cifra cambió frente a ti», es otra página; 600 ms de odómetro en algo que se pulsa seguido se siente arrastrado |
| datos-5 · MEDIA · Teléfono: el botón flotante de IA (`#pf-ia-btn`) entra y sale en cada repintado — en Control, cada pestaña: aparece (translate 154→0 px, 220 ms) y a los ~35 ms se vuelve a apartar (`.apartado`, 120 ms); igual en cada › del Calendario, sin que haya scroll | Que el estado `apartado` no se recalcule al repintar el módulo (conservarlo hasta un scroll real) | Un botón que asoma y se esconde con cada toque es movimiento sin motivo y llama la vista a la esquina en cada acción |
| datos-6 · BAJA · Control, gráfica de 12 meses: 650 ms por barra + escalón 35 ms → 1035 ms en total, y se repite en cada visita a Control (`_barras='espera'` en cada `montar`) | 380 ms, escalón 20 ms (total ≈ 620 ms) y solo la primera vez por sesión | Es la pantalla a la que se entra a ver una cifra; un segundo de barras creciendo cada vez cansa a la tercera visita |
| datos-7 · BAJA · Calendario: `.cal-nav:hover` está detrás de `@media(hover:hover)` sin `(pointer:fine)` (css/plataforma.css:503) | `@media (hover:hover) and (pointer:fine)` | En tabletas/híbridos con dedo el borde azul se queda «pegado» tras tocar |
| datos-8 · BAJA · Control › Comisiones: «armar lista» dibuja la palomita con `dibuja-trazo` .42 s + .12 s de espera (540 ms) | .3 s y .05 s de espera (350 ms), como `.marca-estado` | Confirmación de una acción repetible: tiene que llegar casi al instante |
| datos-9 · BAJA · Material (mantenimiento): al entrar se ve el esqueleto con barrido (`esq-barre` 1.5 s lineal, `pf-progreso` 1.1 s) para luego pintar una tarjeta fija | Saltar el esqueleto cuando el módulo está en mantenimiento (pintar el aviso directo) | Un esqueleto promete datos que no van a llegar; es movimiento de carga para un texto fijo |

### Detalle por hallazgo

**datos-1** · Dónde: js/mod/fabricacion.js:410–433 (`irAlPeriodo` → `recargar` → `viajar`, `P.transicion(hacer,{duracion:200})`), y `P.transicion` en js/piezas.js:1817. Cómo lo medí: MutationObserver sobre `.cal-mes` y 4 clics en `[data-mueve="1"]` con 60 ms entre sí, a 390 y a 1280: `[[63,"diciembre"],[396,"enero"],[713,"febrero"],[1046,"marzo"]]` (cal1.log). Cada paso dispara su propia View Transition de 200 ms completa. Riesgo: bajo; saltar la transición deja el DOM igual. Cuidar que `focoDia` y `voz()` se apliquen al último mes.

**datos-2** · Dónde: js/mod/fabricacion.js:519–523 (`limpiar(l); irAlPeriodo(...)`). Cómo lo medí: toques CDP (`Input.dispatchTouchEvent`) 140 px en 8 pasos; antes de soltar `translateX(-140px) op 0.65`; captura `cal-gesto-30ms.png` muestra la rejilla centrada a opacidad plena con título ya cambiado; `vt-sale-izq` arranca a t=68 ms desde `transform:none`. Riesgo: medio; tocar la pieza de transición o hacer el viaje propio solo para el gesto.

**datos-3** · Dónde: fabricacion.js:482 (`GESTO_PX = 8, GESTO_UMBRAL = 48`) y `alSoltar`. Cómo lo medí: arrastre de 40 px en 2 movimientos de 8 ms → «noviembre 2026 → noviembre 2026» (cal2.log). Riesgo: bajo; mantener los 8 px de holgura para no confundir toque con golpe.

**datos-4** · Dónde: fabricacion.js:821–828 (`rodarCuentas`, `P.rodarCifra(..., {clave, animar})`), duración por omisión 600 ms en js/piezas.js:3221. Cómo lo medí: `document.getAnimations()` tras › : `span.rueda-tira` 600 ms en cada cambio de mes (cal1.log, x.log). Con menos movimiento no rueda (bien). Riesgo: bajo.

**datos-5** · Dónde: el botón es de la cabecera global (css/plataforma.css:2410–2413, `.pf-ia-btn.apartado`); se dispara al repintar Control (pestañas) y Calendario (›). Cómo lo medí: a 390, en cada pestaña de Control: `translate 0 154px→0` (220 ms) y a +35 ms `.apartado` `translate →154px` (120 ms) (ctl.log); en el Calendario no hubo eventos `scroll` durante el cambio (cal2.log) y aun así alterna. A 1280 no pasa. Riesgo: medio; es de otra zona (botón IA), avisar al grupo que la tenga. Causa exacta sin aislar.

**datos-6** · Dónde: js/mod/control.js:1441–1456 (`crecerBarras`), control.js:144 (`_barras` se vuelve 'espera' en cada montaje). Cómo lo medí: 13 animaciones `i.ct-b` 650 ms, delay máx 385 ms, fin a 1035 ms, igual a 390 y 1280. Riesgo: bajo.

**datos-7** · Dónde: css/plataforma.css:503. Cómo lo medí: leyendo la regla y confirmando que a 1280 el hover dispara la transición de borde de 160 ms; en 390 con `isMobile` no se disparó (Chromium reporta hover:none), así que el «pegado» en tablet híbrida queda sin reproducir en dispositivo real. Riesgo: nulo.

**datos-8** · Dónde: css/sistema.css:4129 (`.palomita.dibuja path`). Cómo lo medí: Comisiones, monto 1500, «armar»: 3 `path` con `dibuja-trazo` 420 ms, delay 120 (x.log). Riesgo: nulo; la regla es compartida con otras pantallas.

**datos-9** · Dónde: js/mod/material.js (arranque con `esqueletoModulo`) y css/plataforma.css:2582–2593. Cómo lo medí: al entrar `pf-esqueleto` 300 ms + `esq-barre` 1.5 s infinito antes del aviso (x.log, `material-390.png`). Riesgo: nulo.

### Lo que ya está bien

- Hoja «Agendar»: entra con `transform` 320 ms `--ease-hoja` (`cubic-bezier(.32,.72,0,1)`) y fondo 200 ms; con teclado (Esc) se cierra sin animación.
- Globo del mes en Control (`vistazo`): entra 160 ms desde `translateY(4px) scale(.98)` con `--ease-out`, sale más rápido (100 ms) y con `display/overlay allow-discrete`; nada desde scale(0).
- Regreso del lienzo bajo el umbral: 180 ms `cubic-bezier(.2,.8,.2,1)` desde donde quedó el dedo; captura del puntero solo al confirmar arrastre.
- Lista del día: `entra` 220 ms `--ease-out`, 10 px; se apaga con menos movimiento.
- Botones (`.cal-nav`, `[data-com-pagar]`, pestañas): solo color/fondo/transform a 160 ms, `:active` con scale; pestañas de Control cambian sin animación (correcto para algo frecuente).
- Menos movimiento: el cambio de mes queda en un fundido de 150 ms (menos, no cero).
- CPU ×4: cambio de mes sin cuadros > 50 ms.

### Sin reproducir

- El globo de la pestaña «Calendario» (`pf-globo-sube`, 380 ms con rebote a 1.18) saltó una vez tras cambiar de mes en la primera corrida; en la segunda, con el conteo igual (10,6,0,0,2 antes y después), no saltó. Probablemente fue el conteo inicial llegando.
- «Mover fechas» (arrastrar una instalación a otro día) y el paso 2 de «Agendar»: el botón «Elegir» no avanzó al paso 2 con mi selector; no medí esas transiciones.
- Rodar cifras en Control al cambiar el periodo («Este mes»): no se registró ninguna animación (posible que la cifra no cambiara con la siembra).
- Tema oscuro y rol pagos/fabricación: no probados.
