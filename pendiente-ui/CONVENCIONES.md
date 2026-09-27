# Convenciones para implementar el paquete de UI de AL3D (léelo entero antes de tocar nada)

Estás implementando, en el repo `cotizador-al3d`, parte del paquete «Ideas de UI para todo el repo AL3D — brief v3».
El paquete está en:

    PAQ=pendiente-ui/paquete

- `$PAQ/00-LEEME-brief-v3.md` — el brief: reglas (§0), fallas (§1), las 26 piezas (§2), piezas 27–86 (§2b–2e), los 153 lugares por pantalla (§3), orden, descartes (§6), licencias (§7).
- `$PAQ/01-anexo-153-fichas.md` — las 153 fichas completas (Dónde · Hoy · Propuesta · Sale de · Cómo en vanilla · Cuidado). **Tu fuente principal**: busca tus ID con `grep -n "^### C7\." ...`.
- Las muestras funcionando (vanilla JS, cada pieza con un comentario «Va en:»). El brief las cita con nombres viejos; en el paquete se llaman:
  - `muestras-1-piezas-01-11.html` (piezas 1–11) · `muestras-2-piezas-12-26.html` (12–26) · `muestras-3-piezas-27-36.html` · `muestras-4-piezas-37-45.html` · `muestras-5-piezas-46-56.html` · `muestras-6-piezas-57-66.html` · `muestras-7-piezas-67-76.html` · `muestras-8-piezas-77-86.html`.
  - Porta desde la muestra: su comportamiento, sus medidas y sus cuidados ya se probaron. Pero **el repo manda**: sus tokens, su tono, sus funciones existentes.

## Ojo: el repo cambió después del brief

El brief se escribió contra el commit `9ff7318`. Después entró el PR #71 (commit `1c3f391`, «La interfaz responde al tacto sin hacerse esperar, y nada vuelve a animarse al repintar»), que tocó 31 archivos: el toast ya se pausa con el dedo/puntero y no reinicia su tiempo, las hojas del teléfono ya suben con translateY y se descartan deslizando, `confirmarPf` ya reemplazó algunos `confirm()`, las animaciones infinitas en reposo se quitaron en parte, `repintarEnSitio / repintarAlrededor / conservandoFoco` existen en `js/nucleo/ui.js`, `.partida.nace`, etc. **Los números de línea del anexo pueden estar corridos: busca por función/selector, no por línea.** Antes de implementar cada ficha, comprueba qué hay HOY (`git show 1c3f391 --stat`, lee el código). Si ya está hecho, no lo rehagas: complétalo o déjalo y dilo en tu informe.

## Reglas del repo (no se negocian)

1. **Vanilla JS, sin build, sin npm.** Nada de React, Framer Motion, GSAP, Tailwind ni Three.js. No añadas dependencias ni CDNs.
2. **Política de contenido:** la plataforma (`index.html`) NO permite guiones en línea: nada de `onclick="..."` en HTML que pinte la plataforma ni en `js/piezas.js`; usa `addEventListener` o la delegación que ya usa cada módulo. El cotizador sí usa manejadores en línea (157) y su CSP lo permite; puedes seguir su estilo dentro del cotizador, pero **no cambies el número de manejadores en línea de `cotizador.html` si puedes evitarlo** (ver «Números que la documentación afirma»).
3. **`css/sistema.css` va en capas (1–8).** Lee `docs/SISTEMA-DE-DISENO.md` (§0 cabecera, §2.18 «El movimiento», §3, §4, §6). El movimiento nuevo va en la capa 4. Hay **bloques con marca de fin** preparados para cada zona — escribe DENTRO del tuyo (ver «Dónde va tu CSS»).
4. **Una sola pieza se mueve sola: el botón «Cotizar con IA».** Todo lo demás se mueve porque alguien tocó algo, o es un momento breve que se apaga. Nada de `animation-iteration-count:infinite` en reposo.
5. **Contraste medido, 4.5:1.** `--a-claro` y `--a3` no llevan texto. De `--n5` hacia abajo ningún neutro lleva texto. **El estado no se dice con `opacity`** sobre bloques con texto (§4.3). `pruebas/navegador/contraste.mjs` mide el render.
6. **`prefers-reduced-motion` apaga el adorno, no la información** (una mecha o un relleno de avance se quedan, quietos o en fundido de 150 ms).
7. Clases semánticas **en español**, zonas táctiles de **44 px** (`@media(hover:none),(pointer:coarse)`), tema claro **y oscuro** (usa tokens: `--sup`, `--linea`, `--tinta`, `--tinta2`, `--a`, `--a-fuerte`, `--ok`, `--mal`, `--av`… — revisa §1 del documento de diseño; nada de colores sueltos que no existan en tokens), teléfonos de gama media (solo `transform` y `opacity` animados; nada de `transition:all`; `backdrop-filter` solo en lo que flota).
8. **Una sola implementación por patrón.** Las piezas compartidas viven en **`js/piezas.js`** (guion clásico que cuelga todo de `window.Piezas`; lo cargan cotizador, plataforma, anidador y verificar.html). Las pantallas **llaman** a esas piezas; no las copian.
9. Hover solo con puntero fino (`@media(hover:hover) and (pointer:fine)`). `:active{transform:scale(.97)}` con `transition:transform var(--mv-liq)` en lo presionable.
10. Accesibilidad: `role`, `aria-*` correctos (`aria-pressed`, `aria-expanded`+`aria-controls`, `aria-current`, `role="radiogroup"`/`radio`, combobox con `aria-activedescendant`…), foco visible, Escape cierra, todo alcanzable con teclado, `voz()` anuncia lo importante. Un gesto (deslizar, mantener presionado, arrastrar) **siempre** tiene alternativa de teclado/toque simple.
11. En papel (`@media print`) no hay movimiento, ni vidrio, ni velos.

## El tono del proyecto (se nota si no lo sigues)

- Todo en **español de México**. Comentarios largos que explican el **porqué** (qué se rompía, qué se midió, qué se descartó), en prosa, como los que ya hay. Mira cualquier archivo del repo y escribe igual. No escribas comentarios que repiten el código.
- Textos de interfaz cortos, en segunda persona o impersonales, sin emojis (§7.2 del documento de diseño).
- Nombres de funciones y clases en español, con el estilo del archivo donde estás (el cotizador es compacto, sin espacios; la plataforma usa módulos ES con espacios).

## `js/piezas.js`

- Guion clásico, IIFE, `const P = g.Piezas`. Cuatro secciones con marca de fin: **1 · Avisos y botones**, **2 · Hojas, listas y transiciones**, **3 · Números, medidas y campos**, **4 · Señalar, explicar y sellar**. Si eres agente de piezas, escribe **solo dentro de tu sección**. Si eres agente de pantalla, **no edites `js/piezas.js`**: si te falta algo de una pieza, adáptalo en tu pantalla y anótalo en tu informe (campo `piezasQueFaltan`).
- Ayudas comunes arriba: `P.sinMovimiento()`, `P.punteroFino()`, `P.esc()`, `P.$()`.
- Cada pieza: una función (o un pequeño objeto) documentada en español, que recibe elementos o selectores y opciones, **devuelve algo controlable** (p. ej. `{ fijar(v), destruir() }` o una promesa), no depende de Q, de proyectos ni de la hoja, y funciona igual con ratón, dedo y teclado. Idempotente: llamarla dos veces sobre el mismo elemento no duplica oyentes.
- Tiene que poder cargarse en node sin `window` (la IIFE sale si no hay `document`).

## Dónde va tu CSS

- `css/sistema.css`: bloque «PIEZAS COMPARTIDAS» (al final de la capa 4, antes de «Cierre de la hoja») con un sub-bloque por sección `/* ── Piezas · N · … ── */ … /* ── fin de piezas · N ── */`, y después «LAS PANTALLAS DEL COTIZADOR, CON LAS PIEZAS» con un sub-bloque por zona (`cot-cliente`, `cot-partidas`, `cot-precio`, `cot-entrega`, `cot-ia`, `cot-escalador`, `cot-vector`, `cot-historial`).
- Su apagado para menos movimiento: el bloque «Menos movimiento, para las piezas y las pantallas nuevas», justo después de `@keyframes pulso-lento`, con sub-bloques `/* ── rm · piezas · N ── */` y `/* ── rm · cot-… ── */`.
- `css/plataforma.css`: al final, «LAS PANTALLAS DE LA PLATAFORMA, CON LAS PIEZAS COMPARTIDAS», sub-bloques `pf-esqueleto`, `pf-tablero`, `pf-proyectos`, `pf-control`, `pf-fabricacion`, `pf-material`, `pf-mapa`, `pf-ajustes`, y su bloque `rm · pf-…` dentro del `@media(prefers-reduced-motion:reduce)` final.
- `anidador-vectores/css/anidador.css`, `css/publico.css`: los tiene un solo agente cada uno.
- Puedes **modificar reglas existentes** donde viven (p. ej. quitar un bucle infinito), pero lo nuevo va en tu bloque. No reordenes ni reformatees lo que no tocas: otros agentes trabajan en paralelo sobre el mismo archivo y lo fusionamos con git.
- El tema oscuro, si hace falta algo más que los tokens: `html[data-tema="oscuro"] .tu-clase{…}` dentro de tu mismo bloque.

## Archivos que son tuyos y los que no

Tu tarea dice qué archivos son tuyos. Puedes leer todo; **edita solo lo tuyo** y, en archivos compartidos, solo las funciones/regiones de tu tarea. Otros agentes trabajan a la vez en otros *worktrees* y todo se fusiona con `git merge`: un cambio fuera de tu zona es un conflicto que alguien tiene que resolver a mano. **No toques:** `sw.js` (versión y lista — lo hace el integrador, salvo que tu tarea lo diga), `README.md`, `docs/*.md` (el integrador escribe la documentación con tu informe), `pruebas/publicacion.mjs`, los conteos escritos en prosa.

## Números que la documentación afirma

`pruebas/publicacion.mjs` cuenta cosas y las compara con la prosa (archivos de pruebas de node y de navegador en el README, manejadores en línea de `cotizador.html` en 13 archivos, archivos de APP_FILES…). Si añades pruebas o manejadores, esas comprobaciones **de conteo** fallarán: **no las arregles** (el integrador corrige los números al final, de una vez; si cada agente los corrige, chocan). Anota en tu informe qué conteos moviste. Cualquier OTRO fallo de cualquier prueba sí es tuyo.

## Cómo probar

- Pruebas de node: `pruebas/correr.sh` (todas deben pasar salvo los conteos de arriba).
- Pruebas de navegador: `pruebas/correr.sh --navegador` usa el puerto 8814 y lo comparten todos los agentes: **no la uses**. Corre las que te importan una por una con TU servidor en TU puerto:
  `npx --yes http-server -p <PUERTO> -c-1 --silent &` desde la raíz de tu worktree y `PUERTO=<PUERTO> node pruebas/navegador/<archivo>.mjs`. Las que llevan `createServer` levantan el suyo (`env -u PUERTO node …`) y pueden chocar entre agentes: si choca, reintenta más tarde. Mata tu servidor al terminar (`kill %1` o por PID; **nunca `pkill -f http-server`**, mataría los de otros agentes).
- Playwright: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'` y `chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })` — copia el arranque de `pruebas/navegador/capas.mjs`. **No corras `playwright install`.**
- **Escribe pruebas** para lo que construyes, en archivos NUEVOS con nombre propio (no edites pruebas ajenas salvo que tu cambio las rompa con razón): de node para la lógica pura (normalizar un teléfono, la cuenta del anticipo…) y de navegador (`pruebas/navegador/<tu-nombre>.mjs`) que ejerciten cada pieza con ratón, toque y teclado, a **360 y 420 px**, con y sin `prefers-reduced-motion` (`reducedMotion: 'reduce'` en el contexto), en claro y oscuro (`localStorage al3d_tema`/`data-tema` — mira `js/tema.js`), sin errores de página, sin desborde horizontal y **sin animaciones infinitas en reposo** (`document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations===Infinity)` debe quedar vacío salvo el botón de IA). Sigue el estilo de las pruebas existentes (español, comentario de cabecera que explica qué se defiende y por qué).
- Revisa capturas tuyas (`page.screenshot`) de lo que tocaste para ver que se ve bien; guárdalas en tu scratchpad, no en el repo.

## Cómo entregar (worktree)

Trabajas en un *worktree* de git aislado. Al terminar:
1. `git add -A && git commit` en tu worktree — uno o varios commits, mensaje en español con el estilo del repo (título que dice el resultado para quien usa la app, p. ej. «El aviso de Deshacer enseña su mecha y un aviso ya no borra al otro»; cuerpo con viñetas por ficha/pieza e ID). Termina cada mensaje con estas dos líneas exactas:

       Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
       Claude-Session: https://claude.ai/code/session_01XuZW5if1eH6GakngoRFE3P

   No pongas identificadores de modelo en ningún otro lado.
2. **No hagas push, no cambies de rama principal, no hagas rebase de nada que no sea tuyo.**
3. Devuelve en tu informe: la ruta del worktree (`pwd`), el nombre de la rama (`git branch --show-current`), el SHA final (`git rev-parse HEAD`), y por cada ficha/pieza: hecho / parcial / ya estaba / no se hizo (y por qué), archivos tocados, pruebas añadidas y su resultado, y lo que el integrador tiene que saber (conteos movidos, piezas que faltan, decisiones tomadas).

## Decisiones ya tomadas (las del brief §2b, «hay que tomarlas antes»)

1. **Excepción de $60,000** (anticipo): se mide sobre el **total que se cobra (con IVA si lleva)**, igual que el repo calcula el anticipo («sobre lo que realmente se va a cobrar»). Una constante con nombre, fácil de cambiar.
2. **Plazo del taller:** **días de calendario**, como `js/datos/taller.js` (a propósito). Nada de hábiles en el plazo del taller. (La liquidación de la pieza 53 sí dice «2 días hábiles» porque así es la regla de cobro: esa es otra cuenta.)
3. **Comisiones (pieza 54):** «Pagar estas» **arma la lista** para registrarla en la hoja «Finanzas AL3D» (copiar/compartir), no marca pagos en la app: en el repo el abono se registra allá.
4. **Puerta de referencia del escalador:** se queda la del repo (**200 cm**), una sola constante compartida con la pieza 32.
5. **Barra de 5 del teléfono (pieza 47):** concilia con `RUTAS` de `js/app.js` — el nombre del módulo es el que ya tiene en `RUTAS` (no inventes «Hoy» si allí dice Tablero), y «Más» abre el resto.
6. **La veta (falla 6, pieza 85):** al elegir aluminio **cepillado** o **MDF**, el anidador pregunta por los giros de 90° y por omisión los quita (solo 0°/180°); el aluminio blanco, negro o pintado no tiene veta y no pregunta.
7. **IVA por cuenta (C4):** la tabla es la de la hoja (`ivaDeCuenta` en `puente/hoja-apps-script.gs`); nunca cambiar el IVA en automático, solo avisar.
