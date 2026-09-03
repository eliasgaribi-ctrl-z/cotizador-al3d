# Reacomodo del ecosistema AL3D — contrato de implementación

> Este documento es el contrato. Quien lo ejecute no tiene que volver a decidir nada: cada
> archivo, cada renglón y cada prueba están nombrados. Donde dice «lock» es una decisión
> tomada y no se reabre sin escribir aquí por qué.
>
> Todo el repo está en español —código, comentarios, nombres de variables, nombres de ruta— y
> los archivos nuevos también.
>
> Verificado contra el árbol el día que se escribió: `js/app.js:36-43` (RUTAS), `js/app.js:389`
> (el oyente de `storage`), `sw.js:39` (`APP_VERSION = 13`), `sw.js:268` y `sw.js:324` (las dos
> estrategias de caché), `js/datos/agenda.js:556` y `:597`, `js/datos/proyectos.js:86`,
> `js/datos/taller.js:198`, `css/plataforma.css:78`, `:429-432`, `:653-664`, `:855-868`.

---

## 1. LA DECISIÓN

Se implementa **el Tablero como puerta**: la ruta `hoy` deja de cargar `inicio.js` y carga un
módulo nuevo, `js/mod/tablero.js`, y se mueve al primer lugar de `RUTAS`. El Cotizador entra
como pestaña propia (`#/cotizador`) con `cotizador.html` vivo dentro de un `<iframe>` del mismo
origen, y el Anidador entra como **sub-vista del módulo del Tablero** (segmento
`Tablero | Anidador`), también en `<iframe>`.

Gana por tres razones verificables:

1. **Es la única forma en que R1 llega a los aparatos que ya están instalados.** `#/hoy` es la
   única dirección de la plataforma grabada en cosas que no controlamos: `start_url` y el
   shortcut «Hoy» de `manifest-plataforma.webmanifest`, el icono de la pantalla de inicio del
   iPhone —que guarda la URL con la que se agregó, no la que diga el manifiesto de hoy
   (`plataforma.html:6-12`)—, `cotizador.html:3111`, `anidador-vectores/index.html:57` y
   `plataforma.html:21`. Crear una ruta nueva (`taller`, `tablero`) deja las cinco puertas
   abriendo la lista de avisos, y la única salida sería pedirle al dueño que reinstale la app.
   Repuntar el `mod` de la ruta que ya existe hace que las cinco aterricen en el Tablero, con
   cero alias y cero renombres. El precedente está escrito en el propio repo
   (`js/app.js:30-35`: la ruta se llama `agenda` aunque la pestaña diga «Calendario»).
2. **Evita el defecto que rompería el Cotizador empotrado.** `js/app.js:389` hace
   `montar(_actual, { forzar: true })` cuando llega un evento `storage` de `al3d_historial` o
   `al3d_queue`, y `cotizador.html:9194` escribe `al3d_historial` en cada guardado. Con el
   cotizador en un `<iframe>` ese evento sí cruza al padre, y `montarDeVerdad` hace
   `cont.innerHTML = ''` (`js/app.js:162`): el marco muere y recarga 933 KB justo después de
   apretar Guardar. Se arregla con la guarda de §4.3.
3. **Un solo juez del material.** El semáforo del Tablero se le pregunta a
   `Agenda.dictamen()`, el mismo que pinta el calendario, en vez de re-derivarlo con un
   `Stock.listaCompra()` propio y acabar con dos respuestas a la misma pregunta —la regla que
   `js/mod/inicio.js:14-17` dejó escrita.

Se le injertan de las otras propuestas: **no apagar la `.topbar` del cotizador** (ahí viven
Deshacer, Clientes, Historial, `#folio` y el segmento Vendedor/Autorizador), **el safe-area
resuelto desde el contenedor padre** en vez de inyectar variables en el documento hijo, **el
campo `padre`** para que ninguna ruta oculta deje la barra sin «estás aquí», **el Anidador como
sub-vista** en vez de ruta hermana, y **Mapa se queda visible en la barra**.

---

## 2. EL MAPA DE NAVEGACIÓN FINAL

### 2.1 La lista `RUTAS`, exacta

Reemplaza el bloque de `js/app.js:36-43`. El comentario de `js/app.js:30-35` se reescribe
completo (hoy dice «El calendario va PRIMERO porque es la pantalla que abre» y quedaría
mintiendo).

```js
/* El TABLERO va PRIMERO porque es la pantalla que abre: `rutaDelHash()` cae en la primera
   ruta del rol cuando el hash no dice nada, así que el orden de esta lista ES el default, y
   `cambiarRol()` reenvía al mismo sitio.

   La ruta se sigue llamando «hoy» aunque la pestaña diga «Tablero» y el archivo tablero.js.
   No es descuido: `./#/hoy` es la única dirección de la plataforma grabada en cosas que no
   controlamos —el start_url y el shortcut del manifiesto YA INSTALADO, el icono de la
   pantalla de inicio del iPhone (que guarda la URL con la que se agregó, ver plataforma.html),
   cotizador.html, anidador-vectores/index.html y plataforma.html—. Renombrarla no daría
   error: abriría otra pantalla, en silencio. Es la misma decisión que ya se tomó con
   «agenda» / «Calendario», y funcionó.

   La lista de avisos —lo que antes era «Hoy»— sigue existiendo como ruta `atender` con el
   mismo módulo inicio.js. Es nombre de ruta NUEVO, así que ninguna URL publicada depende de
   él, y va oculta: se entra por la puerta que el Tablero pone al pie.

   `padre` es para las ocultas: `pintarNav()` prende la pestaña de la madre, así que estar en
   «Qué atender» deja «Tablero» encendido en vez de dejar la tira entera apagada. Ese defecto
   está documentado con nombre en css/plataforma.css, a propósito de Ajustes.

   `roles` no es seguridad —en fase 1 no hay servidor y cualquiera cambia su rol— es modo de
   trabajo. Mapa sigue sin aparecerle a pagos. */
const RUTAS = [
  { ruta: 'hoy',       mod: 'tablero',     seccion: 'mod-tablero',     icono: 'i-taller',    nombre: 'Tablero',     roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'agenda',    mod: 'fabricacion', seccion: 'mod-fabricacion', icono: 'i-agenda',    nombre: 'Calendario',  roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'proyectos', mod: 'proyectos',   seccion: 'mod-proyectos',   icono: 'i-proyectos', nombre: 'Proyectos',   roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'material',  mod: 'material',    seccion: 'mod-material',    icono: 'i-material',  nombre: 'Material',    roles: ['direccion', 'fabricacion'] },
  { ruta: 'cotizador', mod: 'cotizador',   seccion: 'mod-cotizador',   icono: 'i-venta',     nombre: 'Cotizador',   roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'mapa',      mod: 'mapa',        seccion: 'mod-mapa',        icono: 'i-mapa',      nombre: 'Mapa',        roles: ['direccion', 'fabricacion'] },
  { ruta: 'atender',   mod: 'inicio',      seccion: 'mod-atender',     icono: 'i-aviso',     nombre: 'Qué atender', roles: ['direccion', 'fabricacion', 'pagos'], oculto: true, padre: 'hoy' },
  { ruta: 'ajustes',   mod: 'ajustes',     seccion: 'mod-ajustes',     icono: 'i-ajustes',   nombre: 'Ajustes',     roles: ['direccion', 'fabricacion', 'pagos'], oculto: true },
];
```

**El Anidador NO es una ruta.** Es la sub-vista `anidador` de `js/mod/tablero.js`, en estado de
módulo (`let _vista`). Razones, todas verificadas: (a) la pestaña «Tablero» se queda encendida
por construcción, sin depender de `padre`; (b) el estado sobrevive al desmontaje porque los
módulos ES se cachean; (c) desmontar el módulo destruye el `<iframe>`, que es **lo único que
mata sus Web Workers** — `SvgNest.stop()` (`anidador-vectores/js/svgnest.js:815-820`) solo pone
`working = false` y no hace `terminate()`; (d) una sección y una ruta menos que mantener. Se
llega desde otro módulo con `ctx.pasar('hoy', { vista: 'anidador' })` (§3.13).

### 2.2 Qué ve cada rol, y las teclas

| # (tecla) | dirección | fabricación | pagos |
|---|---|---|---|
| 1 | Tablero | Tablero | Tablero |
| 2 | Calendario | Calendario | Calendario |
| 3 | **Proyectos** | **Proyectos** | **Proyectos** |
| 4 | **Material** | **Material** | Cotizador |
| 5 | Cotizador | Cotizador | — |
| 6 | Mapa | Mapa | — |

Ocultas para los tres: `atender` (puerta al pie del Tablero) y `ajustes` (engrane de la topbar).

**El corrimiento de teclas es el mínimo posible y fue una decisión.** Las teclas salen del
índice de `rutasDeRol().filter(r => !r.oculto)` (`js/app.js:198` y `:347`), así que la barra y
el atajo nunca divergen. Con este orden **Proyectos se queda en la 3 y Material en la 4**, que
es donde ya están; Calendario pasa de 1 a 2, Mapa de 5 a 6, y «Hoy» pierde su número. Para
pagos, Proyectos también se queda en la 3. Hay que avisarlo una vez al dueño el día del cambio:
el `title` de la pestaña se actualiza solo, la memoria muscular no.

### 2.3 Por qué Mapa NO se esconde

Verificado: **`grep -rn "ir('mapa')" js/` no devuelve nada.** Hoy la pestaña es el ÚNICO acceso
al mapa. Esconderlo obliga a que sus puertas nuevas entren en el mismo commit o la pantalla
queda alcanzable solo escribiendo el hash a mano; y su globo (`js/mod/mapa.js:308`) dejaría de
pintarse **sin un solo error**, porque `pintarCuentasNav` se salta la ruta que no encuentra en
el DOM (`js/app.js:212-213`). Además, para quien va manejando, la pestaña es un toque y la
puerta contextual son dos.

Seis pestañas para dirección y fabricación es +1 neto sobre hoy (entra Cotizador, sale «Hoy»),
y **el cromo total en 375 px baja, no sube**: al borrar los dos `<a>` de la topbar
(`index.html:141` y `:147`) el renglón de abajo del encabezado suelta ~88 px y desaparece la
razón medida de `css/plataforma.css:855-868`. Las pestañas conservan **siempre** su nombre: que
un icono solo no dice «Material» ya se probó y se revirtió (`css/plataforma.css:141-148`).

---

## 3. EL DASHBOARD — `js/mod/tablero.js`

Sección `<section class="pf-mod" id="mod-tablero" data-mod="tablero" hidden aria-label="Tablero">`.
Contrato de siempre: `export async function montar(contenedor, ctx)` y `export function desmontar()`.

**Cero aritmética nueva.** La columna vertebral es `Taller.ventanaTaller()`, que ya devuelve
etapa esperada, atraso en días, holgura, los cinco hitos y un `texto` en español listo para
pantalla. El Tablero **no escribe nada** salvo la acción explícita del bloque 5.

### 3.0 La lectura — cinco llamadas, todas locales, ninguna a la red

```js
const hoy = hoyISO();                       // UN solo `hoy` para todas las filas
const [todos, insts, cts, mat, fres] = await Promise.all([
  Proyectos.listar({}),          // TODOS, cancelados incluidos: A6 necesita sus folios
  Agenda.listar({ vivas: true }),
  Material.constantes(),
  Agenda.contextoMaterial(),     // ← hay que EXPORTARLA (agenda.js:556)
  Sync.frescura(),
]);
const vivos = todos.filter(p => p.etapa !== 'cancelado');
const instDe = new Map();
for (const i of (insts || [])) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
const V = vivos.map(p => Taller.ventanaTaller(p, instDe.get(p.id) || null, { hoy, cts }))
               .filter(v => v.estado !== 'cancelado' && v.estado !== 'hecho');
const semDe = p => Agenda.dictamen(                   // ← hay que EXPORTARLA (agenda.js:597)
  [{ proyecto_id: p.id, titulo: p.nombre, fecha: (instDe.get(p.id) || {}).fecha || null }],
  mat, hoy);
const pendientes = Prefs.rol() === 'direccion'
  ? Cot.sinDecidir(new Set(todos.map(p => p.folio_global)), 0) : [];
```

**Reglas del camino de pintado, no opinables:**

- **Nunca `Reglas.refrescar()` en este módulo.** Tiene efecto secundario: llama
  `emitirSalidasDerivadas` y ESCRIBE movimientos en el almacén (`js/datos/reglas.js:665-668` →
  `js/datos/proyectos.js:829`). Como pantalla de entrada eso pasaría a correr en cada arranque
  de cada teléfono. Los avisos son de `#/atender`, que es quien los pide.
- **Ninguna llamada de red en el primer pintado.** Solo IndexedDB. El puente y
  `sincronizarCallado()` ya van al final del arranque a propósito (`js/app.js:392-397`).
- **Una sola pasada de `Proyectos.listar`.** `etapas[]` no usa índice; se agrupa en memoria.
- **`Agenda.contextoMaterial()` una vez** y `dictamen()` puro sobre ella. No se llama
  `Stock.listaCompra()` por separado: `contextoMaterial` ya la pide con `SIN_TOPE_DIAS`.
- **Toda fecha por `js/nucleo/fechas.js`.** Prohibido `new Date(iso)`.
- **Esqueleto con retardo de 180 ms**, no el «Cargando…» genérico del router: una lectura de
  IndexedDB suele estar bajo 100 ms y un esqueleto sin retardo es un parpadeo. Con la
  geometría real de las tarjetas, para que el layout no salte.
- **La base cerrada se pinta ANTES que todo**, con el patrón de `js/mod/inicio.js:60-72`:
  `vacio('No se pudo abrir la base de este dispositivo', DB.motivoTexto(), '…Recargar')`. La
  diferencia entre «todavía no tienes proyectos» y «la base no abrió» es la diferencia entre
  estar tranquilo y perder una tarde.

### 3.1 El segmento de sub-vista — `segmento()` de `js/nucleo/ui.js:286`

A ancho completo, arriba de todo:
`segmento([{v:'tablero',t:'Tablero'},{v:'anidador',t:'Anidador'}], _vista, 'data-vista', 'Qué ves del taller')`.
Trae `role="group"`, `aria-pressed` y 44 px por puntero grueso. **Cero CSS nuevo.**

Todo lo que sigue (3.2 a 3.12) es la sub-vista `tablero`. La sub-vista `anidador` es §5.

### 3.2 La línea de frescura — `.pf-frescura` / `.pf-banda`

Una línea, sin caja, y **solo cuando hay algo que decir**. Texto y lógica: se sube
`bandaFrescura(fres, Sync.disponible())` a `js/nucleo/ui.js` desde `js/mod/inicio.js:186-200`
y las dos pantallas la llaman. Si `fres.al_dia`, **no se pinta nada**: «una franja verde
diciendo al día todos los días es una felicitación diaria que se deja de leer»
(`css/plataforma.css:461-466`).

- Vacío: no existe el elemento.
- 375 px: igual, es una línea que envuelve.
- No se toca.

### 3.3 La cinta de cuentas — `.pf-cuentas` / `.pf-cuenta`

`css/plataforma.css:429-432`. Número en `<b>` a `--t6`, etiqueta a `--t2` en `--muted`,
`.urge` pinta el número en ámbar. Máximo seis, y **el número se pinta siempre, aunque sea 0**,
para que la cinta no cambie de ancho entre dos aperturas.

| Etiqueta | Fórmula | Tono | Rol |
|---|---|---|---|
| **En el taller hoy** | `V.filter(v => v.ancla==='instalacion' && v.empezar<=hoy && v.listo>=hoy).length` | — | los 3 |
| **Van tarde** / **Va tarde** | `V.filter(v => v.atraso_dias > 0).length` | `.urge` si >0 | los 3 |
| **No llegan** | `V.filter(v => v.estado === 'no_llega').length` | `.mal` si >0 | los 3 |
| **Trabajos sin material** | de los que están en ventana, cuántos con `semDe(p).estado` en `['falta','grave']` | `.urge` si >0 | dirección, fabricación |
| **Ganados sin fecha** | `V.filter(v => v.ancla !== 'instalacion').length` | `.urge` si >0 | los 3 |
| **En el taller** (importe) | `money(suma de p.precio_auth de los que están en ventana)` | — | **solo si `Prefs.veDinero()`** |

Las dos primeras usan la **fórmula literal y las mismas palabras** de
`js/mod/fabricacion.js:520-522`, para que el número no cambie de valor al navegar. «No llegan»
es un subconjunto de «Van tarde» a propósito: la primera es apurarse, la segunda es una llamada
telefónica hoy (`js/datos/taller.js:326-328`).

«Ganados sin fecha» se calcula con `v.ancla !== 'instalacion'` y **no** con
`Proyectos.listar({sinFecha:true})`: es la misma regla —`ventanaTaller` ya descarta la
instalación cancelada igual que `js/datos/proyectos.js:543-552`— y no cuesta una lectura más.

El importe **no existe** con rol `fabricacion`: `Prefs.veDinero()` es `false` y la capa de datos
devuelve `null`, no 0. El elemento no se pinta; **no se difumina y nunca se imprime `$0`**.

- Vacío: la cinta se pinta con ceros; nunca desaparece.
- 375 px: `.pf-cuentas` ya es `flex-wrap` con `gap:var(--e1) var(--e4)`; cae en dos o tres renglones.
- No se toca.

### 3.4 «No llegan a su fecha» — solo si hay

La lista de llamadas del día, y **lo único de esta pantalla que puede ir arriba de la línea**.

`.card` > `.card-h` > `h2` con `ico('i-aviso')` + «No llegan a su fecha» +
`<span class="folio">2</span>`. Dentro, un `.pf-fila` por proyecto con `.pf-fila-ico mal`.

- Título: `v.titulo` + ` · ` + `VERBO_TALLER[v.etapa_real]`.
- Descripción: **`v.texto` verbatim** (`js/datos/taller.js:336-338`) — «Debía estar listo el
  3 sep y sigue cortado. O se termina hoy, o hay que mover la fecha con el cliente.» Eso
  resuelve solo la regla de no comunicar por color únicamente, sin redactar una línea nueva.
  **No se recorta nunca**: es el texto de riesgo.
- `.tal-pista` con `.tal-riel tarde`.
- Acciones, las dos `.btn.btn-gho.pf-btn-corto`:
  **«Mover la fecha»** → `ctx.pasar('agenda', { inst: id })` ·
  **«Abrir»** → `ctx.pasar('proyectos', { proyecto_id: id })`.

- Vacío: **la tarjeta no existe**. No se pinta «no hay ninguno».
- 375 px: `.pf-fila-acc` ya baja a un renglón propio con sangría (`css/plataforma.css:186-190`).

### 3.5 La tarjeta de A6 «cotizaciones autorizadas sin decidir» — solo dirección

Se reusa **entera** la que ya existe en `js/mod/inicio.js:242-268`: `.cand-partidas.pf-decidir`,
ámbar, barro y `animation:latido 2.6s`. Es lo único de la plataforma que late y tiene que seguir
siendo lo único: dos cosas latiendo son cero cosas latiendo. Va en el Tablero porque sin ese
toque no hay proyecto, ni agenda, ni material, ni Tablero.

**En el commit 1 el bloque es un renglón compacto, no la tarjeta completa**: el flujo con el
modal `#pf-pide` son ~120 líneas de `inicio.js` que no se duplican. Se pinta
`.pf-decidir` con el conteo y **un** botón `.btn.btn-ok.pf-btn-corto` **«Decidir N
cotizaciones»** → `ctx.ir('atender')`. Traer los botones «Se ganó» / «No se dio» al propio
renglón queda fuera de esta entrega (§10).

- Vacío / rol ≠ dirección: no existe el bloque.
- 375 px: un renglón y el botón debajo.

### 3.6 «El taller ahora mismo» — la línea de estaciones

Cinco bloques en el **ORDEN del proceso** (`Proyectos.ORDEN`), **nunca ordenados por
cantidad**: es una tubería, no un ranking. Cada bloque **filtra la lista de abajo** y el filtro
es estado de módulo (`let _etapa`), **no del hash**: filtrar no es navegar y no debe ensuciar el
historial.

**Se construye sobre `.pf-cuentas` / `.pf-cuenta`, no con un componente nuevo.** Cada bloque es
`<button type="button" class="pf-cuenta tb-etapa" aria-pressed="false" data-etapa="cortado">`
con:

- `<b>` = `V.filter(v => v.etapa_real === e).length` — tipografía y `--t6` heredados de `.pf-cuenta b`.
- el nombre = `Proyectos.ETAPA_NOMBRE[e]`, **nunca reescrito en la vista**.
- `<em>` = de esos, cuántos con `ORDEN[v.etapa_real] < ORDEN[v.etapa_esperada]`, y dice
  «2 atrasados».

**Ese `<em>` es EL indicador que hoy no se pinta en ningún lado** y es literalmente la pregunta
del dueño: qué debería estar cortado y sigue en diseño. Sale gratis de la misma ventana
(`js/datos/taller.js:313-318`), y es una **lectura**: el Tablero muestra la discrepancia, no la
corrige (`js/datos/taller.js:21-24`).

`instalado`, `garantia` y `cancelado` **no son estaciones**: no están en `ORDEN` y
`ventanaTaller` los devuelve como `estado:'hecho'`. Quedan fuera por construcción.

CSS nuevo: `.tb-etapa` (hacer del `.pf-cuenta` un botón pulsable: `min-height`, radio, borde,
`--clay`, estado `.on` con `--a-suave`/`--a-borde`/`--clay-in`) y `.tb-etapa em`. **Ocho
declaraciones, cero tokens nuevos.** El contenedor es `.pf-cuentas` con la clase extra
`.tb-linea` solo para darle `gap` propio.

- Vacío: si no hay ni un proyecto vivo, la línea no se pinta y se va directo al vacío de 3.7.
- 375 px: `.pf-cuentas` ya envuelve; caben tres bloques por renglón. Sin media query nueva.
- Se toca: filtra. Segundo toque suelta el filtro. Con filtro puesto, la cabecera de la lista lo
  dice y trae `[Ver todos]`, porque «o el control enseña el filtro, o el filtro no existe»
  (`js/mod/proyectos.js:135-139`). Y se llama `voz()` con el resultado («4 trabajos en
  Cortado»), porque repintar una lista sin decirlo no lo nota quien no la ve.

### 3.7 La lista del taller — `.pf-fila` + `.tal-pista`

**Es la misma `filaTaller()` que ya existe en `js/mod/fabricacion.js:482-509`.** Se sube a
`js/nucleo/ui.js` con firma `filaTaller(v, hoy, opts = {})`, donde
`opts = { icono, plazoEditable, accionesHTML }`, junto con `corta()`, `VERBO_TALLER` y
`TONO_TALLER`. `fabricacion.js` la llama con `{ plazoEditable: puedeCorregirPlazo() }` y el
Tablero con `{ icono: ICO_ETAPA[v.etapa_real], plazoEditable: false, accionesHTML: … }`.
Copiarla sería garantizar que el renglón del Calendario y el del Tablero divergan.

Piezas, todas existentes:

| pieza | clase | contenido |
|---|---|---|
| icono 40×40 | `.pf-fila-ico` + `TONO_TALLER[v.estado]` (`no_llega→mal`, `tarde`/`justo→urge`) | `ICO_ETAPA[v.etapa_real]` |
| título | `.pf-fila-t` | `v.titulo` + ` · ` + `VERBO_TALLER[v.etapa_real]` |
| descripción | `.pf-fila-d` | **`v.texto`**, completo, sin recortar |
| etapa | `.pf-etapa` + `claseEtapa(v.etapa_real)` | `ETAPA_NOMBRE[...]` — «Listo para instalar», no «Listo» |
| material | `.pf-sem` `ok`/`falta`/`grave`/`nada` | palabra + `title` con `sem.texto` |
| cuándo | `.pf-cuando` `hoy`/`tarde`/`lejos` | `hoy` si `holgura_dias===0`; `+N d` si `atraso_dias>0` |
| plazo | `.cal-plazo` (+`.mano` si `plazo_fuente==='elegido'`) | `ico('i-reloj')` + `v.plazo_etiqueta`, `title = v.plazo_razon`. **En el Tablero es `<span>`, no botón**: corregir el plazo se hace en el Calendario |
| pista | `.tal-pista` `aria-hidden="true"` > `.tal-fecha` `.tal-riel[.tarde][.propuesta]` `.tal-hoy` | `.propuesta` (punteado) cuando `v.ancla==='ganado'`: sin fecha de instalación la ventana es una hipótesis |
| acción | `.pf-fila-acc` | §3.8 |

Orden, y **no se reordena solo entre dos aperturas**:

```js
const PESO = { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4 };
lista.sort((a, b) => (PESO[a.estado] - PESO[b.estado])
                  || (b.atraso_dias - a.atraso_dias)
                  || (a.holgura_dias - b.holgura_dias)
                  || String(a.titulo).localeCompare(String(b.titulo), 'es'));
```

Con el filtro en «Todo», agrupada por estación con `.ag-grupo` en versalitas
(`css/plataforma.css:600-610`).

**Los tres vacíos, que son tres cosas distintas:**

| situación | qué se pinta |
|---|---|
| No hay ni un proyecto vivo | «Todavía no hay nada en el taller» / «Cuando una cotización autorizada se marque como ganada, el proyecto aparece aquí con su ventana de taller.» + `.btn.btn-pri` «Abrir el Cotizador» → `ctx.ir('cotizador')` |
| Hay vivos, ninguno con hoy dentro de su ventana | «Hoy no hay nada en la mesa» / «Los N trabajos vivos empiezan más adelante; el primero arranca el 12 sep.» — la fecha es `min(v.empezar)` |
| Hay vivos y todos sin fecha de instalación | «Nada tiene fecha de instalación» / «Sin fecha no hay ventana de taller, no hay alarmas en el calendario y el material no sabe para cuándo.» + `.btn.btn-pri` «Ponerles fecha» → `ctx.ir('agenda')` |

**`vacio()` clava `i-carpeta`** (`js/nucleo/ui.js:378`), así que estos tres se escriben a mano
con `ico('i-taller')`, igual que ya hace `js/mod/fabricacion.js:452-455`.

375 px: una columna, `.pf-fila` con la acción en su propio renglón. El nombre del negocio y
`v.texto` **envuelven**, no se recortan.

### 3.8 La acción del renglón — la única escritura del Tablero

Un solo botón, `.btn.btn-gho.pf-btn-corto`, cuya etiqueta es el verbo de la etapa que sigue:

```
SIGUIENTE (js/datos/taller.js:198, hay que exportarlo)
  ganado → en_diseno   «Ponerlo en diseño»
  en_diseno → cortado  «Ya se cortó»
  cortado → armado     «Ya se armó»
  armado → listo       «Ya está listo»
  listo → instalado    «Ya se instaló»
```

Llama `Proyectos.avanzarEtapa(id, SIGUIENTE[v.etapa_real])`. Nunca un parche con `actualizar()`:
la etapa está en BLOQUEADOS con su razón (`js/datos/proyectos.js:595`).

**Tope por rol.** Se pregunta con `Proyectos.puedeMover(Prefs.rol(), etapa)`
(`js/datos/proyectos.js:683`, hay que exportarlo). Si no puede, **no se pinta un botón
deshabilitado**: se pinta la razón que la capa de datos ya escribió — «Eso lo marca Dirección»
(`js/datos/proyectos.js:780-782`) — como `.pf-nota` dentro de `.pf-fila-acc`. Solo-lectura con
motivo visible, no ausencia silenciosa. Con rol `pagos` no hay botón en ningún renglón.

**Confirmación cuando el paso cruza corte.** Si
`ORDEN[nueva] >= ORDEN.cortado && ORDEN[v.etapa_real] < ORDEN.cortado`, se pregunta en
`#pf-pide`: «Al marcar Cortado salen del almacén los materiales de este proyecto. ¿Ya se
cortó?». Es la única escritura irreversible de la pantalla
(`js/datos/proyectos.js:704-748`, idempotente por el estado del requerimiento). Después, el
toast dice lo que pasó con el número que `avanzarEtapa` devuelve:
«Cortado · salieron 3 materiales del almacén», con acción «Ver almacén» → `ctx.ir('material')`.

Un botón por renglón y **nunca `.btn-pri`**: la regla de un solo botón con relleno de color por
pantalla está escrita en `css/sistema.css:2451`, y `.pf-btn-corto`
(`css/plataforma.css:685-689`) existe exactamente para esto.

Además, **«Abrir»** como segunda acción → `ctx.pasar('proyectos', { proyecto_id })`, y
`js/mod/proyectos.js` lee `ctx.recibir()` al montar y abre la ficha directo. Sin ese pase,
«Abrir» te deja en una lista donde hay que volver a buscar lo que ya estabas mirando, que es
literalmente la queja del dueño.

### 3.9 «Hoy en el taller» — columna derecha en monitor, primera en teléfono

`Taller.cargaDeDia(hoy, V)` (`js/datos/taller.js:376-403`), ya probada, cero lecturas más.

- `.ag-grupo` **ARRANCAN HOY** `<span class="n">2</span>` → un renglón por nombre de
  `carga.empiezan[]`; cada uno toca y va al proyecto.
- `.ag-grupo` **DEBEN QUEDAR LISTOS HOY** `<span class="n">1</span>` → `carga.listos[]`.
- `carga.sin_fecha` se dice aparte y **no se suma a `total`**: son hipótesis ancladas en la
  venta (`js/datos/taller.js:386`).
- Al pie, `.pf-btn-corto` **«Ver la semana en el Calendario»** →
  `ctx.pasar('agenda', { dia: hoy, vista: 'semana' })`.

- Vacío: se pinta `carga.texto`, que ya dice **«Taller libre.»** y nunca es `undefined`.
- 375 px: **va PRIMERA de las dos columnas**, con el mismo `order:-1` que la agenda ya usa por
  debajo de 1099 px porque «es la pregunta de la mañana».

**No se dibuja ninguna rejilla semanal en el Tablero.** Sería un segundo `.cal-rej`/`.cal-dia`
con otro CSS en el mismo producto, y el ojo dejaría de reconocer la forma que ya aprendió. La
semana es del Calendario, y a un toque.

### 3.10 «Se instala esta semana»

`insts.filter(i => i.fecha >= hoy && i.fecha <= masDias(hoy, 6))`, unidas con `vivos` por
`proyecto_id`. Cero lecturas más.

`.pf-fila` con `ico('i-camion')`, título del proyecto, `fmtFechaDia(i.fecha)`,
`Agenda.VENTANA_NOMBRE[i.ventana]` **cuando no es `'dia'`** (una instalación de madrugada es
otra logística) y el `.pf-sem` del dictamen.

Arriba, bajo `.ag-grupo` **YA PASARON Y NADIE LAS MARCÓ** en tono `mal`:
`insts.filter(i => i.fecha < hoy && ['propuesta','confirmada','reagendada'].includes(i.estado))`.
Dejan el almacén sin descontar y la cobranza sin arrancar.

Al pie, dos `.pf-btn-corto`:
**«Ver la ruta en el mapa»** → `ctx.ir('mapa')`, con `· N sin ubicar` cuando
`vivos.filter(p => !isFinite(p.lat) || !isFinite(p.lng)).length > 0` ·
**«Ver el calendario»** → `ctx.ir('agenda')`.

- Vacío: `vacio('Nada agendado esta semana', 'La siguiente instalación es el 18 sep.')` con la
  fecha real, o sin ella si no hay ninguna.
- 375 px: una columna, debajo de «Hoy en el taller».

### 3.11 «Falta material» — dirección y fabricación

Los que están en el taller cuyo `semDe(p).estado` es `falta` o `grave`, ordenados por
`sem.dias` ascendente. Título del proyecto, `.pf-sem` con su palabra, y **`sem.texto`**, que ya
viene escrito (`js/datos/agenda.js:653-661`): «Falta Acrílico blanco 3 mm y 2 materiales más —
se instala en 2 días.» `grave` es a tres días o menos, el mismo −P3D de la alarma del `.ics`.

Se dicen aparte dos casos que no son «falta genérica»:
- `sem.codigo === 'sin_calcular'` → su propia frase, porque «no se ha calculado» y «ya está
  todo» son la misma cara verde si se confunden.
- `!mat.leido` → «No se pudo leer el almacén, así que no se sabe si está el material.» **No se
  dice que está.**

Acciones por renglón: **«Pedir por WhatsApp»** con `linkWa(f.tel_proveedor, texto)`
(`mat.faltantes` trae `proveedor` y `tel_proveedor`, `js/datos/agenda.js:583-590`) — el único
verde de la plataforma y está justificado — y **«Ver la lista de compra»** → `ctx.ir('material')`.

- Vacío: la tarjeta no aparece.
- Rol `pagos`: la tarjeta no aparece. Pagos no mueve el almacén.
- 375 px: una columna.

### 3.12 El pie: la puerta a «Qué atender» y la nota

`.pf-fila` con `ico('i-aviso')`, título **«Qué atender»**, descripción «Avisos de material,
fechas, cobranza y respaldo, ordenados por lo que truena antes», y `[Abrir]` →
`ctx.ir('atender')`. **Sin número**: contarlos exigiría `Reglas.evaluar()` con existencias y
calibración, cuatro lecturas más en la pantalla de entrada para un número que la pantalla de al
lado ya sabe dar bien; un contador aproximado es peor que ninguno.

Y `.pf-nota` (`--t1`, sin caja) con la verdad del final, que es lo que hace que se le crea:

> «La ventana de cada trabajo se cuenta hacia atrás desde el día de instalación, con el plazo
> que dice el tipo de trabajo —o el que se puso a mano, que siempre manda—. El plazo se reparte
> parejo entre diseño, corte y armado porque hoy la etapa no guarda fecha: nadie ha medido
> cuánto tarda cortar. La primera vez que corrijas un plazo, esto empieza a saber la verdad.»

### 3.13 La barra fija del teléfono — `#pf-mbar`

Una sola acción, y solo cuando hay una:

| condición | botón |
|---|---|
| rol dirección y hay A6 | `.btn.btn-ok` «Decidir N cotizaciones» → scroll a esa tarjeta y foco a su botón (el truco de `js/mod/fabricacion.js:930-937`) |
| hay «no llegan» | `.btn.btn-pri` «Ver los N que no llegan» → scroll a esa tarjeta |
| resto | **sin barra** |

Protocolo obligatorio y en este orden: `innerHTML` → `hidden = false` → `onclick =`
(asignación, **no** `addEventListener`) → `ajustarAltoBarra()`.

### 3.14 El layout de dos columnas

**No se clona `.ag-cuerpo.dos`.** En `css/plataforma.css` se añade `.tb-cuerpo` como segundo
selector a los tres bloques que ya existen (`:657`, `:658`, `:660-663`, `:666`), sin duplicar
una sola declaración:

```css
.ag-cuerpo.dos,.tb-cuerpo{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--e4);align-items:start}
.ag-cuerpo.dos>*,.tb-cuerpo>*{min-width:0}
@media(min-width:1100px){
  .ag-cuerpo.dos,.tb-cuerpo{grid-template-columns:minmax(0,1fr) minmax(380px,440px)}
  .ag-cuerpo.dos>.card,.tb-cuerpo>.card{position:sticky;top:calc(3px + 78px + var(--e3))}
}
@media(max-width:1099px){ .ag-cuerpo.dos.taller-primero>.card,.tb-cuerpo.taller-primero>.card{order:-1} }
```

El marcado del Tablero usa `<div class="tb-cuerpo taller-primero">`. `1100px` es el único corte
de escritorio que esta plataforma ha decidido; no se inventa otro.

### 3.15 Iconos

**Cero símbolos nuevos.** Todo lo que el Tablero necesita ya está en el sprite de `index.html`:
`i-taller`, `i-aviso`, `i-corte`, `i-lapiz`, `i-material`, `i-check`, `i-pin`, `i-venta`,
`i-camion`, `i-reloj`, `i-nube`, `i-nube-off`, `i-wa`, `i-anidar`, `i-mapa`, `i-carpeta`,
`i-imprimir`. Los que faltarían para una versión más rica —`i-adelante` (hoy solo existe
`i-atras` y el avance se pinta con el glifo crudo `›`), `i-buscar`, `i-filtro`— quedan fuera de
esta entrega (§10).

### 3.16 Accesibilidad — lo que este módulo añade

Se hereda gratis del armazón: `.salto`, el foco a `#pf-contenido` con `preventScroll`,
`voz(r.nombre)`, `#vozStatus`/`#vozAlert`, el aro de `:focus-visible`,
`[hidden]{display:none!important}`, los 44 px por puntero grueso y `prefers-reduced-motion`.

Lo que hay que poner:

1. `aria-label="Tablero"` en `<section id="mod-tablero">`, **igual que el campo `nombre` de la
   ruta**: si no, la app se anuncia con un nombre y la región con otro.
2. `aria-pressed` en cada `.tb-etapa` y `role="group" aria-label="Filtrar por etapa"` en `.tb-linea`.
3. `.tal-pista` sigue con `aria-hidden="true"`: el riel nunca es la única fuente, la frase de
   arriba dice lo mismo con palabras.
4. `voz()` cuando el filtro cambia el número de renglones.
5. Alta de las clases nuevas de rótulo (`.tb-etapa em`) en la lista de `user-select:none` de
   `css/plataforma.css:847-851`, o al mantener pulsado en el teléfono salen las manijas de
   selección y la barra de Cortar.
6. `font-variant-numeric:tabular-nums` en `.pf-cuenta b` (se añade a la regla existente): son
   números que cambian.

**Sin atajos de teclado nuevos.** `←`/`→`/`t`/`T` son oyentes de `window` de `fabricacion.js` y
las teclas 1-9 son del router; una letra más se pelearía con las dos.

### 3.17 `desmontar()` — las cinco cosas, copiadas literal de los seis módulos

```js
export function desmontar() {
  if (_cont) _cont.removeEventListener('click', alClic);
  cerrarCapa('pf-pide');
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  if (_ctx && _ctx.sinRemonte) _ctx.sinRemonte(false);
  _cont = null; _ctx = null; _d = null; _etapa = null; _oyendo = false;
  /* _vista NO se anula: es lo único que se quiere recordar entre visitas. */
}
```

El estado de nivel de módulo **sobrevive al desmontaje** porque los módulos ES se cachean
(documentado con el caso real de `filtro.texto` en `js/mod/proyectos.js:96-101`). Se anula a
propósito todo menos `_vista`.

### 3.18 Impresión

`.no-papel` en los botones y en la línea de frescura. `rotularPapel('Carga del taller · ' + fmtFecha(hoy))`
antes de `window.print()`: el encabezado con logotipo, filete y pie de `index.html:58-67` se
enciende solo en `@media print` y se repite en todas las hojas.

---

## 4. EL COTIZADOR COMO APARTADO (R2)

Ruta `cotizador`, icono `i-venta` (el mismo glifo que hoy lleva el `<a>` de `index.html:141`),
módulo nuevo `js/mod/cotizador.js`, sección `mod-cotizador`. Se borra ese `<a>`.

### 4.1 Por qué iframe y no módulo ES — con el número

El marcado del cotizador tiene **273 manejadores en línea** (189 `onclick`, 39 `oninput`, y el
resto entre `onblur`/`onchange`/`onkeydown`/`onload`/`onerror`/`ondrop`/`ondragover`/
`ontouchstart`/`onmousedown`) y **cero** `window.X =` explícitos. En un módulo ES el ámbito
superior no es el objeto global: los 273 dejan de resolver **en silencio**, sin error de
compilación, y se descubren haciendo clic uno por uno sobre 645 KB de JS que no tiene ni una
prueba unitaria (`pruebas/correr.sh:4-5`) y que guarda `al3d_historial`, el único dato
irrecuperable del sistema. El archivo depende exactamente de esa semántica: desde el padre
`typeof w.irAPaso === 'function'` (declaración de función → propiedad de `window`) pero
`w._pantalla === undefined` (`let` de nivel superior, `cotizador.html:6192`). Y rompería a
propósito el candado de `pruebas/publicacion.mjs:124-137`.

### 4.2 El módulo — `js/mod/cotizador.js`

```html
<div class="pf-marco-caja">
  <iframe class="pf-marco" id="pf-cot-marco" src="cotizador.html"
          title="Cotizador AL3D — precios, autorización y registro de venta"></iframe>
</div>
```

**`src` sin query string. Lock.** `esDeLaPlataforma()` (`sw.js:119-128`) NO reconoce
`cotizador.html`, así que va por `cotizador()`, que resuelve el respaldo con `c.match(req)`
**sin** `ignoreSearch` (`sw.js:324`) — al contrario que la estrategia de la plataforma
(`sw.js:268`). Con `?empotrado=1` la copia guardada bajo `./cotizador.html` no casa, se cachea
una segunda entrada y el respaldo sin señal queda dependiendo de que el navegador marque la
petición del iframe como navegación. El modo empotrado se detecta **dentro**, con
`parent !== window` (§4.5).

**Sin atributo `sandbox`. Lock.** `sandbox` mataría `window.open`, y el PDF se entrega como
`Blob` + `URL.createObjectURL` + `window.open` (`cotizador.html:9124-9130`), igual que WhatsApp
(`:9822`) y Maps (`:6871`).

**Altura.** El alto lo mide **el padre**, porque dentro de un iframe `100dvh` y `visualViewport`
describen el iframe y no el visor: el teclado del teléfono encoge el visor del padre pero no la
caja del marco, así que los modales altos del cotizador
(`max-height:calc(100dvh - …)` en `css/sistema.css:1086`, `:1231`, `:1702`) quedarían tapados.

```js
function medir() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(() => {
    _raf = 0;
    const m = $('pf-cot-marco'); if (!m) return;
    const vv = window.visualViewport;
    const alto = vv ? vv.height : window.innerHeight;
    const top  = m.getBoundingClientRect().top;
    const h = Math.max(360, Math.round(alto - top - insetInferior() - 8));
    document.documentElement.style.setProperty('--pf-marco-h', h + 'px');
  });
}
```

`insetInferior()` lee una sonda `<i>` con `padding-bottom:env(safe-area-inset-bottom,0px)` y
`getComputedStyle`, y se cachea. `medir()` se llama al montar, en `window.resize` y en
`visualViewport.resize`, **siempre con acelerador de `requestAnimationFrame`** (el oyente de
`resize` de `js/app.js:404` va sin techo y una rejilla densa lo calienta; el nuevo no repite ese
error). Los dos oyentes se retiran en `desmontar()`.

`--pf-marco-h` **se declara en `css/plataforma.css`**, junto a `--mbar-h` (`:78`):
`:root{--mbar-h:0px;--pf-marco-h:70vh}`. Así `var(--pf-marco-h)` sin valor de reserva es legal
para `pruebas/hojas-de-estilo.mjs:54-59` y el marco tiene alto aunque el JS no haya corrido.
**Prohibido usar `--top-fijo`**: no está declarado en ninguna hoja (solo se usa con reserva en
`css/sistema.css:458`), así que un `calc()` que lo cite se invalida entero y el iframe cae a
150 px.

**Safe-area sin tocar el cotizador.** `.pf-marco-caja{padding-bottom:env(safe-area-inset-bottom,0px)}`.
Al encoger la caja del marco, el visor del iframe termina arriba de la franja del gesto y el
`position:fixed` de su `.mbar` (`cotizador.html:614-618`) queda por encima **solo**. Cero
ediciones de las 30 declaraciones `env()` del cotizador y cero código que dependa del ciclo de
vida del marco.

**Salida de emergencia.** Si el marco no dispara `load` en 8 s o dispara `error`, el módulo
pinta `vacio('El Cotizador no se pudo abrir aquí', …, '<a class="btn btn-pri" href="cotizador.html">Abrirlo en su propia pestaña</a>')`.
`./cotizador.html` sigue siendo una URL de primera clase que funciona sola.

**Vuelta a la plataforma.** El módulo oye `message` validando
`ev.origin === location.origin && ev.source === m.contentWindow`, y traduce
`{ al3d:'ir', ruta }` → `ctx.ir(ruta)` y `{ al3d:'anidar' }` →
`ctx.pasar('hoy', { vista:'anidador' })`. Oyente retirado en `desmontar()`.

**El marco se destruye al cambiar de pestaña, y es correcto.** El router hace
`cont.innerHTML = ''` antes de montar (`js/app.js:162`) y reparentar un iframe recarga su
documento; mantenerlo vivo exigiría un contenedor paralelo fuera de `<main>` peleando con la
cola de montajes que existe por un incidente concreto y documentado
(`js/app.js:81-114`). **No se pierde nada**: el cotizador autoguarda `al3d_q` en cada tecla
(`cotizador.html:10212`), y el primer pintado son 200–332 ms con la CPU frenada 4×.

### 4.3 La guarda del remonte — el arreglo más importante de esta entrega

En `js/app.js`, junto al `ctx`:

```js
/* Un módulo que sostiene un <iframe> vivo pide que no se le remonte por debajo. El oyente
   de 'storage' remonta el módulo actual cuando el cotizador guarda en otra pestaña, y eso
   es correcto para los seis módulos que pintan DOM… y catastrófico para uno que pinta un
   marco: `montarDeVerdad` hace cont.innerHTML='' y el iframe muere y recarga 933 KB, justo
   después de que alguien apretó Guardar o «Registrar venta». Y con el cotizador empotrado
   el evento SÍ llega aquí, porque 'storage' dispara en todos los documentos del mismo
   origen menos el que escribió. Se apaga en cada montaje, así que no puede quedarse
   pegado. */
let _sinRemonte = false;
ctx.sinRemonte = v => { _sinRemonte = !!v; };
```

`montarDeVerdad()` pone `_sinRemonte = false` en su prefijo síncrono, antes del primer `await`.
Y el oyente de `storage` (`js/app.js:382-390`) queda así:

```js
if (ev.key === Prefs.CLAVES.GANADAS) {
  const r = await Cot.drenarBuzon();
  if (r.creados) {
    toast('Llegó ' + … + ' del cotizador', 'ok', 4200);
    if (!_sinRemonte) montar(_actual, { forzar: true });
  }
  return;
}
if (['al3d_historial', 'al3d_queue'].includes(ev.key) && !_sinRemonte) montar(_actual, { forzar: true });
```

`drenarBuzon()` **sigue corriendo** y el toast sigue apareciendo: lo único que se salta es el
remonte. Al salir del Cotizador, el Tablero monta fresco y el proyecto nuevo ya está ahí.

Quien declara la guarda: `js/mod/cotizador.js` (`ctx.sinRemonte(true)` al montar) y
`js/mod/tablero.js` cuando `_vista === 'anidador'`. Los dos la apagan en `desmontar()`.

### 4.4 La ganancia que R4 pide y hoy no existe

El evento `storage` cruza del iframe al padre. Hoy `drenarBuzon()` solo corre al arrancar la
plataforma (`js/app.js:370`), porque `storage` nunca dispara en el documento que escribe y son
dos páginas separadas. Empotrado se dispara **en el instante en que se aprieta «Registrar
venta»**: el toast aparece de inmediato y, al volver al Tablero, el proyecto ganado ya está.
El puente no se reescribe: ni una línea.

### 4.5 Qué pasa con `cotizador.html` — cuatro cambios aditivos

Ninguno toca el script de 645 KB más allá de un helper de cuatro líneas.

**(1) Una línea de `<script>` inmediatamente después de `<body>`** (ahí y no en el script
grande, para que la clase esté puesta antes de que el CSS pinte):

```html
<script>if(parent!==window)document.documentElement.classList.add('empotrado');</script>
```

`parent !== window` y no una query: así **la página suelta se comporta byte por byte como hoy**,
y `manifest.webmanifest`, el candado de `pruebas/publicacion.mjs:124-137` y la ruta sin señal
del service worker siguen verdes.

**(2) Dos reglas al final del bloque `<style>`:**

```css
/* ----- Modo empotrado: dentro del apartado Cotizador de la plataforma -----
   NO se apaga la .topbar entera. Ahí viven Deshacer, Clientes, Historial —la única puerta a
   al3d_historial, el dato irrecuperable—, la píldora del folio y el segmento
   Vendedor/Autorizador: sin ellos no se puede autorizar una cotización. Lo que sobra son
   las dos cosas que la plataforma ya pone: el logotipo con su título, que apilado daría dos
   encabezados, y el enlace de vuelta, que navegaría el marco y anidaría la plataforma
   dentro de sí misma. Con esas dos apagadas la barra queda como un renglón delgado de
   controles y no hay doble cromo. */
html.empotrado .brand{display:none}
html.empotrado .btn-pf{display:none}
```

Se escriben como `html.empotrado` y no `.empotrado` a secas: estas reglas terminan en
`css/sistema.css` y por tanto cargadas por `index.html`, donde son inertes porque el `<html>` de
la plataforma nunca lleva esa clase, pero la especificidad tiene que ser explícita.

**(3) El helper de salida y sus dos sitios de llamada.** Los tres puntos que navegan a la
plataforma son `cotizador.html:3111` (el `<a href="./#/hoy">`, que la regla anterior ya apaga),
`:12439` (`location.href='./#/proyectos'`) y `:12458`
(`location.href='./#/'+(sinFecha?'agenda':'proyectos')`). Los dos últimos navegarían el MARCO:

```js
function irAPlataforma(ruta){
  try{ if(parent!==window){ parent.postMessage({al3d:'ir',ruta:ruta},location.origin); return; } }catch(_){}
  location.href='./#/'+ruta;
}
```

**(4) Reescribir el comentario de `cotizador.html:3105-3110`. Obligatorio.** Hoy dice
textualmente que el enlace «es un `<a>` y no un iframe: este archivo tiene 27 declaraciones
`env(safe-area-inset-*)` y dentro de un iframe todas valen 0… Y son 690 KB duplicados en la
memoria de un celular». Las dos objeciones siguen siendo verdad (son 30 declaraciones, no 27) y
esta entrega las mitiga desde el padre. Dejar ese párrafo en pie es sembrar la próxima
regresión: alguien lo va a leer y va a revertir el reacomodo creyendo que arregla un bug. El
comentario nuevo tiene que decir qué mitiga cada objeción y dónde (`.pf-marco-caja` con el
`padding-bottom` del inset, y `medir()` en `js/mod/cotizador.js`).

**Después de tocar el `<style>`: `bash herramientas/extraer-estilo.sh`, en el mismo commit**, o
`pruebas/hojas-de-estilo.mjs:31,39,44` falla porque las dos mitades del producto divergen.
`css/sistema.css` **no se edita a mano nunca**.

### 4.6 El límite que hay que decir en voz alta

`manifest.webmanifest:6` tiene `start_url: './cotizador.html'`: **quien ya tenga la PWA
«Cotizador» en su pantalla de inicio seguirá entrando directo al cotizador y no verá nunca el
Tablero.** No se toca: cambiar el `id` de un manifiesto instalado crea una app nueva en el
teléfono y deja la vieja huérfana. Se acepta y se dice: el Cotizador sigue siendo una puerta
suelta legítima, y ahora además tiene casa dentro de la plataforma.

---

## 5. EL ANIDADOR EN FABRICACIÓN (R3)

Vive como la sub-vista `anidador` de `js/mod/tablero.js`. Se llega tocando «Anidador» en el
segmento de §3.1, o desde otro módulo con `ctx.pasar('hoy', { vista:'anidador' })`.

Se borra el `<a class="btn-hist btn-anidar">` de `index.html:147` **con su comentario de
`:142-146`**, y se borra el bloque completo de `css/plataforma.css:855-868` (el comentario y la
regla `.topbar-in .btn-anidar{display:none}`).

### 5.1 El marcado

```js
// dentro de pintar(), cuando _vista === 'anidador'
_ctx.sinRemonte(true);
_cont.innerHTML = segmentoLente() +
  '<p class="hintnote">' + ico('i-aviso') + ' El acomodo se calcula en la computadora, que es ' +
  'donde se exporta el SVG y se alimenta el láser. Aquí puedes ver el resultado y los ' +
  'retazos guardados.</p>' +
  '<div class="pf-marco-caja">' +
    '<iframe class="pf-marco" id="pf-anid-marco" src="anidador-vectores/" ' +
    'title="Anidador de vectores — acomodo de piezas en la lámina"></iframe>' +
  '</div>';
medirMarco();   // el mismo helper que el cotizador, compartido en ui.js
```

**`src` sin query string, igual que el cotizador. Lock.** Aunque aquí la query sí sería segura
—`plataforma()` resuelve con `{ignoreSearch:true}` (`sw.js:268`) y `esDeLaPlataforma()` ya casa
por prefijo `/anidador-vectores/` (`sw.js:126`)—, si **ninguna** de las dos URLs lleva query el
service worker nunca ve dos entradas para el mismo archivo y desaparece toda una clase de bug
que solo aparece sin señal. La detección va dentro, con `parent !== window`.

### 5.2 El iframe es LA restricción dura, no una comodidad

`anidador-vectores/js/svgnest.js:338` y `:544` arrancan los Web Workers con
`evalPath: 'js/lib/eval.js'` —un **literal relativo**— y
`anidador-vectores/js/lib/parallel.js:142/152/167` hace `new Worker(this.options.evalPath)`.
`new Worker(url)` resuelve contra la URL base del **documento**, no del script.

- Servido desde `/anidador-vectores/` → `/anidador-vectores/js/lib/eval.js` ✔
- Servido desde la raíz `/`, donde vive la plataforma → `/js/lib/eval.js` ✘ **no existe**

Y no hay plan B, las tres cosas verificadas:
- `evalPath` **no es configurable**: `SvgNest.config()` (`svgnest.js:84-118`) solo acepta
  curveTolerance, spacing, rotations, populationSize, mutationRate, useHoles y exploreConcave.
- La rama de `Blob` + `URL.createObjectURL` que salvaría el caso (`parallel.js:158-163`) está
  **muerta**: el motor siempre llama `p.require(...)` (`svgnest.js:344-347` y `:547-551`), así
  que `requiredScripts.length !== 0` y siempre se toma la rama del `evalPath`.
- **El fallo es MUDO**: no lanza excepción, deja un cálculo que nunca termina. Está escrito como
  razón de existir de la prueba: `pruebas/navegador/anidador.mjs:5-8` — «Una carpeta movida o un
  archivo que falte no da error en la página: da un cálculo que nunca termina». El
  autodiagnóstico de `anidador-vectores/js/app.js:730-734` cubre `file://` y la falta de
  `window.Worker`, pero **no** este caso.

Dentro del iframe el documento sigue siendo `/anidador-vectores/`, así que `evalPath` resuelve
igual que hoy y el `importScripts("matrix.js", …)` del worker (`parallel.js:96`) sigue
resolviendo contra el directorio de `eval.js`. **Es la única forma de embeberlo sin editar
código vendorizado**, y editarlo tiene precio escrito: `anidador-vectores/README.md:81-82` y
`:105` y `sw.js:92-95` dicen tres veces que `svgnest.js`, `svgparser.js` y `js/lib/*` son «byte
por byte el master de SVGnest».

**Este párrafo se copia como comentario dentro de `js/mod/tablero.js`, junto al iframe, con las
dos líneas citadas.** Es la barandilla que impide que alguien lo «optimice» a módulo dentro de
seis meses.

### 5.3 Lo demás que el iframe resuelve de un golpe

- Los **cinco oyentes a nivel de `document`** que `anidador-vectores/js/app.js:689-708` instala
  y nunca quita (dragenter, dragover, dragleave, drop, paste) se quedan dentro del documento del
  marco. En el mismo documento secuestrarían el arrastre y el Ctrl+V de **todos** los módulos,
  para siempre, porque `app.js` es un IIFE sin desmontar.
- Las **13 colisiones de id** (`toast`, `vozStatus` y 11 símbolos del sprite) dejan de existir:
  cada documento tiene su espacio.
- `window.SvgNest` es un **singleton creado al cargar** (`svgnest.js:9`): un solo motor por
  documento, que en el marco es exactamente lo que se quiere.
- **Destruir el marco mata sus Web Workers** (`navigator.hardwareConcurrency || 4`,
  `parallel.js:74`), que es justo lo que `SvgNest.stop()` no hace.
- Los `keydown` del marco **no llegan** al `window` del padre, así que `←`/`→` y `t`/`T` de
  `fabricacion.js` no se pelean. Y como el Anidador vive en `tablero.js`, esos oyentes ni
  siquiera están montados mientras se usa.
- **`sw.js` no se toca para el anidador**: `esDeLaPlataforma()` ya casa por prefijo y sus 14
  archivos ya están en `APP_FILES` (`sw.js:92-110`).
- **`pruebas/navegador/anidador.mjs` sigue verde sin editar una línea**: navega a
  `/anidador-vectores/` y maneja `window.Anidador`.

### 5.4 Modo empotrado — dos cambios

**`anidador-vectores/index.html`**, una línea después de `<body class="an">`:

```html
<script>if(parent!==window)document.documentElement.classList.add('empotrado');</script>
```

**`anidador-vectores/css/anidador.css`** (277 líneas de delta, **se edita a mano**, NO es
generada), al final:

```css
/* ----- Modo empotrado: dentro del apartado Taller de la plataforma -----
   Aquí SÍ se apaga la .topbar entera: solo lleva el logotipo y dos enlaces de salida
   (index.html:49-60), y los tres los pone ya el documento padre. Y .an-wrap y .an-pie
   sueltan su ancho máximo de 1180 px y su relleno de área segura, que dentro de la .wrap de
   la plataforma se sumarían al de ella. La regla de más arriba que deshace el ocultamiento
   de etiquetas de .btn-hist por debajo de 560 px deja de aplicar, porque esa barra ya no se
   pinta. */
html.empotrado .topbar{display:none}
html.empotrado .an-wrap,html.empotrado .an-pie{max-width:none;padding-left:var(--e3);padding-right:var(--e3)}
```

`env(safe-area-inset-*)` vale 0 dentro de un iframe, pero aquí son solo tres usos de relleno
(`anidador.css:21`, `:26`, `:253`) y ninguno es una barra fija con el botón principal: molestia
menor, no el problema de 30 declaraciones del cotizador. El `padding-bottom` de
`.pf-marco-caja` lo cubre igual.

### 5.5 En el teléfono SÍ se ve, y es deliberado

Las dos razones escritas de esconderlo (`css/plataforma.css:855-868`), examinadas una por una:

1. **La geometría de la barra**, que es la razón medida: a 390 px el renglón lleva el selector
   de rol (300 px de contenido mínimo que ningún `flex-basis` baja) más el icono del cotizador y
   el engrane, 352 px en 366 útiles. **Esa razón se evapora sola con R3**: `.btn-anidar` deja de
   existir y la barra **recupera 44 px** (y otros 44 al borrar el `<a>` del Cotizador). R3 mejora
   la barra en vez de empeorarla.
2. **«En un teléfono no hay SVG que exportar ni láser que alimentar»**: cubre CALCULAR, no LEER.
   El de corte, parado en la máquina con el teléfono, quiere ver el acomodo y saber cuántas hojas
   salen. El CSS del anidador ya está trabajado hasta 420 px (`anidador.css:24-27`, `:79`,
   `:123`, `:182`, `:197`, `:207`): lo único escondido era la puerta de entrada.

Así que a ≤560 px la sub-vista se ve, con el `.hintnote` de §5.1 arriba del marco. **Explicar,
no esconder en silencio.**

### 5.6 El contexto: se reusa el canal probado, no se inventa protocolo

Cuando se entra con `ctx.recibir()` trayendo `{ vista:'anidador', proyecto_id, nombre, folio }`,
el módulo escribe `al3d_anidar` **antes** de crear el marco, con la MISMA forma que
`cotizador.html:13607` más un campo aditivo:

```js
{ svg, nombre, folio, cliente, proyecto, proyecto_id, ts }
```

El anidador lo lee al arrancar y **lo borra** (`anidador-vectores/js/app.js:713-728`): es una
entrega, no un guardado, y la prueba de navegador comprueba justo eso. La banda de origen
(`anidador-vectores/index.html:67`) ya sabe pintar `folio · cliente · proyecto`.

**Límite honesto, y se dice con palabras en la pantalla:** el proyecto **no guarda vector**.
`js/datos/proyectos.js:280-283` congela `aiFile` a `{name, type, url:''}` y no hay campo SVG; el
vectorizador vive dentro de `cotizador.html`. Y `recibirDelCotizador()` devuelve `false` si no
hay `d.svg`, así que una entrega de solo identidad **no funciona hoy**. Por eso en esta entrega
**el pase desde un proyecto no escribe `al3d_anidar`**: pinta el `.hintnote` con el origen
—«Vienes de «Farmacia San Juan» — folio COT-0231. Suelta aquí el SVG, o tráelo del vectorizador
del Cotizador»— y un `.pf-btn-corto` **«Vectorizar en el Cotizador»** → `ctx.ir('cotizador')`.
Desde allá, el botón «Acomodar en hoja» que ya existe (`cotizador.html:3617`) escribe
`al3d_anidar` con el trazo de verdad y manda `postMessage({al3d:'anidar'})`, y el padre vuelve
al Anidador con las piezas puestas. **El bucle queda cerrado sin una sola pestaña nueva del
navegador.** Prometer más sería inventar un dato.

---

## 6. LA LISTA ORDENADA DE CAMBIOS

Cuatro commits, de menor a mayor riesgo. **`bash pruebas/correr.sh` en cada uno**, y
`bash pruebas/correr.sh --navegador` en los commits 2 y 3. Cada commit tiene valor solo y es
reversible.

### COMMIT 1 — «El Tablero es la puerta» (R1)

Si este commit se revierte, **el repo queda idéntico a hoy**. Es un requisito, no una
aspiración: no toca `cotizador.html` ni el anidador.

| # | Archivo | Qué se le hace |
|---|---|---|
| 1.1 | `js/datos/proyectos.js` | Escribir `export` delante de `ORDEN` (`:86`) y de `puedeMover` (`:683`). Mover `ICO_ETAPA` y `claseEtapa` desde `js/mod/proyectos.js:88-97` a este archivo, junto a `ETAPA_NOMBRE`, y exportarlos (los nombres de pantalla de las etapas ya viven en la capa de datos; el icono es uno más). |
| 1.2 | `js/datos/taller.js` | Escribir `export` delante de `SIGUIENTE` (`:198`). Nada más: el archivo es PURO a propósito y no recibe lógica de pintado. |
| 1.3 | `js/datos/agenda.js` | Escribir `export` delante de `contextoMaterial` (`:556`) y de `dictamen` (`:597`). Nada más. Es lo que permite que el Tablero pregunte el semáforo de material con UNA lectura y con el MISMO juez que pinta el calendario. |
| 1.4 | `js/nucleo/ui.js` | Subir aquí, desde los módulos, lo que si no se duplica y diverge: `corta()`, `VERBO_TALLER`, `TONO_TALLER` y `filaTaller(v, hoy, opts={icono,plazoEditable,accionesHTML})` (de `js/mod/fabricacion.js:436-509`); `bandaFrescura(f, disponible)` (de `js/mod/inicio.js:186-200`); y `medirMarco(id)` + `insetInferior()`, el helper de alto de los dos iframes. Ya está en `APP_FILES`, así que no cuesta un archivo nuevo. |
| 1.5 | `js/mod/fabricacion.js` | Importar `filaTaller`/`corta`/`VERBO_TALLER`/`TONO_TALLER` de `ui.js` y borrar las copias locales. Llamada: `filaTaller(v, _d.hoy, { plazoEditable: puedeCorregirPlazo() })`. **Ningún otro cambio en este archivo en el commit 1.** |
| 1.6 | `js/mod/inicio.js` | Importar `bandaFrescura` de `ui.js` y borrar la copia local. Nada más: el módulo sigue igual y ahora se llama `atender`. |
| 1.7 | `js/mod/proyectos.js` | Importar `ICO_ETAPA`/`claseEtapa` de `js/datos/proyectos.js` y borrar las copias. Y en `montar()`, leer `ctx.recibir()` y, si trae `{proyecto_id}`, abrir la ficha directo. |
| 1.8 | **`js/mod/tablero.js`** (NUEVO) | Todo el §3, sub-vista `tablero` únicamente. El segmento de §3.1 se pinta ya, con la opción «Anidador» **deshabilitada** hasta el commit 2 (o directamente sin la opción; se decide al escribir, pero no se deja un botón que no hace nada). |
| 1.9 | `js/app.js` | (a) `RUTAS` de §2.1 y el comentario nuevo. (b) `pintarNav()` (`:191-202`): prender también por `padre` — `const activa = r => r.ruta === _actual || r.ruta === (rutaPorNombre(_actual)||{}).padre`. (c) el buzón de un solo uso `ctx.pasar/recibir` (§6.1). (d) `ctx.sinRemonte` y la guarda del oyente de `storage` (§4.3). (e) `montarDeVerdad()`: `_sinRemonte = false` en el prefijo síncrono, y escribir la miga en `#pf-sub` junto a `voz(r.nombre)` (`:182`). (f) limitar el oyente de `resize` de `:404` con `requestAnimationFrame`. |
| 1.10 | `index.html` | (a) `<section class="pf-mod" id="mod-tablero" data-mod="tablero" hidden aria-label="Tablero">` como PRIMERA del bloque `:172-177`. (b) renombrar `id="mod-hoy" data-mod="inicio"` a `id="mod-atender"` con `aria-label="Qué atender"` — verificado que `mod-hoy` solo se nombra en `js/app.js`. (c) revisar los seis `aria-label` contra el campo `nombre` de `RUTAS`: `voz(r.nombre)` y la etiqueta de la región están escritas en dos sitios y se desincronizan solas. (d) reescribir `<title>` (`:6`), `<meta name="description">` (`:7`) y el texto por omisión de `#pf-sub` (`:138`), que hoy dicen «Agenda de instalaciones, material en almacén, proyectos y mapa de obra» y ya no describen este producto. **No tocar `<script type="module" src="./js/app.js"></script>`**: es el candado de `pruebas/publicacion.mjs:124-137`. **Cero símbolos nuevos en el sprite.** |
| 1.11 | `css/plataforma.css` | (a) `:root{--mbar-h:0px;--pf-marco-h:70vh}` en `:78`. (b) añadir `.tb-cuerpo` como segundo selector a los tres bloques de `.ag-cuerpo.dos` (§3.14) — **no clonar**. (c) sección nueva «TABLERO» con cabecera `======`, **antes** del bloque global de `user-select` de `:834`: `.tb-linea`, `.tb-etapa`, `.tb-etapa.on`, `.tb-etapa em`, `.pf-cuenta.mal b{color:var(--mal)}`, y `font-variant-numeric:tabular-nums` añadido a `.pf-cuenta b`. (d) dar de alta `.tb-etapa em` en la lista de `user-select:none` de `:847-851`. **Cero tokens nuevos: ni un color, ni un tamaño de letra, ni un radio.** |
| 1.12 | `sw.js` | `APP_FILES`: añadir `'./js/mod/tablero.js'`. `APP_VERSION` de **13 a 14**. `esDeLaPlataforma()` NO se toca: `:127` ya cubre `/js/`. |
| 1.13 | **`pruebas/navegador/tablero.mjs`** (NUEVO) | §6.2. |

**Verifica el commit 1:** `pruebas/sintaxis.mjs` (que los archivos nuevos parseen — el incidente
que documenta su cabecera es exactamente este), `pruebas/publicacion.mjs` (que `tablero.js` esté
en `APP_FILES` y que `APP_VERSION` exista; falla con el mensaje exacto «Arreglo: añadirlos a
APP_FILES en sw.js y subir APP_VERSION»), `pruebas/hojas-de-estilo.mjs` (que ningún token nuevo
se use sin existir y que `css/sistema.css` siga siendo copia exacta del `<style>` — este commit
no lo toca, así que debe seguir idéntico), `pruebas/taller.mjs` y `pruebas/proyectos.mjs` (que
los `export` nuevos no rompan nada), y `pruebas/navegador/tablero.mjs`.

### COMMIT 2 — «El Anidador dentro del Taller» (R3)

| # | Archivo | Qué se le hace |
|---|---|---|
| 2.1 | `anidador-vectores/index.html` | La línea de `<script>` de §5.4 después de `<body class="an">`. Nada más. Los diez `<script>` en orden estricto de `:238-249` no se tocan. |
| 2.2 | `anidador-vectores/css/anidador.css` | El bloque de tres reglas de §5.4, al final. |
| 2.3 | `js/mod/tablero.js` | La sub-vista `anidador` de §5.1, con el comentario-barandilla de §5.2 pegado al iframe, `ctx.sinRemonte(true)` al entrar y `(false)` al salir, y `medirMarco('pf-anid-marco')`. |
| 2.4 | `css/plataforma.css` | (a) `.pf-marco` y `.pf-marco-caja` en la sección TABLERO: `display:block;width:100%;border:0;border-radius:var(--rr2);background:var(--card);box-shadow:var(--clay-in);height:var(--pf-marco-h)` y `.pf-marco-caja{padding-bottom:env(safe-area-inset-bottom,0px)}`. (b) `@media print{.pf-marco{display:none!important}}` — imprimir un iframe no imprime nada útil. (c) **borrar el bloque `:855-868`** completo, comentario incluido. |
| 2.5 | `index.html` | Borrar el `<a class="btn-hist btn-anidar">` de `:147` **y su comentario de `:142-146`**. |
| 2.6 | `sw.js` | `APP_VERSION` de 14 a **15**. `APP_FILES` no cambia: el anidador ya está entero. |
| 2.7 | `pruebas/navegador/tablero.mjs` | Añadir el caso del anidador empotrado: que `window.Anidador` exista dentro del marco y que **un acomodo TERMINE**. Es la única forma de cazar el fallo mudo del `evalPath`. |

**Verifica el commit 2:** `pruebas/publicacion.mjs` (los 14 archivos del anidador siguen en
`APP_FILES`, `esDeLaPlataforma` sigue reconociéndolo), `pruebas/navegador/anidador.mjs` (**tiene
que seguir verde sin editarla**: la página suelta no cambió), `pruebas/navegador/tablero.mjs`
(el acomodo termina dentro del marco), `pruebas/anidador-medidas.mjs`.

### COMMIT 3 — «El Cotizador como apartado» (R2)

**Va al final de los tres riesgosos y sale con red.** Es la herramienta que se usa en el
teléfono, en la calle, delante del cliente, y el `<a>` de la topbar **no se borra hasta que esto
se pruebe en un iPhone real con un modal alto abierto y el teclado arriba**. Si el empotrado no
convence, revertir este commit deja todo lo demás en pie.

| # | Archivo | Qué se le hace |
|---|---|---|
| 3.1 | `cotizador.html` | Los cuatro cambios de §4.5, incluida la reescritura obligatoria del comentario de `:3105-3110`. |
| 3.2 | `css/sistema.css` | **Se REGENERA** con `bash herramientas/extraer-estilo.sh`, en este mismo commit. Nunca a mano. |
| 3.3 | **`js/mod/cotizador.js`** (NUEVO) | §4.2, ~110 líneas. |
| 3.4 | `js/app.js` | Añadir el renglón de `cotizador` a `RUTAS` en la posición 5 de §2.1. |
| 3.5 | `index.html` | `<section class="pf-mod" id="mod-cotizador" data-mod="cotizador" hidden aria-label="Cotizador">`. Y borrar el `<a href="cotizador.html">` de `:141`. |
| 3.6 | `sw.js` | `APP_FILES`: añadir `'./js/mod/cotizador.js'`. `APP_VERSION` de 15 a **16**. |
| 3.7 | `pruebas/navegador/tablero.mjs` | Añadir los cuatro casos del cotizador empotrado: que cargue; que `.brand` y `.btn-pf` estén apagados **y Historial siga visible y tocable**; que un `al3d_pf_ganadas` escrito desde dentro del marco **NO** remonte la ruta; y el orden del botón atrás (modal → pantalla del cotizador → ruta de la plataforma) con cero `pageerrors`. |

**Verifica el commit 3:** `pruebas/hojas-de-estilo.mjs` (la copia generada sigue siendo copia —
si esto falla es que faltó correr el extractor), `pruebas/publicacion.mjs` (el candado de quién
es quién en la puerta: `index.html` carga `js/app.js`, `cotizador.html` no y trae
`const MATERIALES`), `pruebas/navegador/cotizador-flujo.mjs`,
`pruebas/navegador/volver-atras.mjs`, `pruebas/navegador/pdf-hoja-carta.mjs` y
`pruebas/navegador/camino-completo.mjs` (**los cuatro tienen que seguir verdes sin editarlos**:
la página suelta no cambió de comportamiento), y `pruebas/navegador/tablero.mjs`.

### COMMIT 4 — «Limpieza de puertas» (R4)

| # | Archivo | Qué se le hace |
|---|---|---|
| 4.1 | `js/mod/fabricacion.js` | Leer `ctx.recibir()` para abrir el día (`{dia}`), la vista (`{vista}`), la hoja de agendar con el proyecto YA elegido (`{proy, hoja:'agendar'}`) o el modal de plazo (`{plazo}`). Y en la lente Taller, al pie de la fila, `.pf-btn-corto` **«Acomodar en la lámina»** → `ctx.pasar('hoy', { vista:'anidador', proyecto_id, nombre, folio })`. |
| 4.2 | `js/mod/mapa.js` | Leer `ctx.recibir()` para `{dia}` y `{proy}` y llegar con el filtro puesto. |
| 4.3 | `js/mod/material.js` | Cada renglón de la lista de compra puede volver al proyecto que lo exige con `ctx.pasar('proyectos', {proyecto_id})`. |
| 4.4 | `manifest-plataforma.webmanifest` | `start_url` de `'./plataforma.html#/hoy'` a **`'./#/hoy'`** (quita un salto por el redirector en cada arranque instalado). Los tres shortcuts a `'./#/hoy'`, `'./#/material'`, `'./#/agenda'`, renombrando el primero de «Hoy» a **«Tablero»**, y añadiendo un cuarto: «Cotizador» → `'./#/cotizador'`. Reescribir la `description` (`:5`). **NO tocar `id` ni `name`.** |
| 4.5 | `plataforma.html` | **Solo** el texto del `<p>` de `:21`. El destino `./#/hoy` ya es correcto y ahora abre el Tablero. El `location.replace` que conserva el hash (`:19`) no se toca. |
| 4.6 | `anidador-vectores/index.html` | El `<a href="../#/hoy">` de `:57` se queda: el destino sigue siendo válido y ahora abre el Tablero. Solo se actualiza su `title`/`aria-label`, que dicen «agenda, material y mapa de obra». |
| 4.7 | `js/app.js` | Corregir la discrepancia documental de `:30-35`, que afirma que `cotizador.html` publica `./#/agenda` cuando el enlace real de `:3111` dice `./#/hoy`. Ya está reescrito por 1.9a; se verifica. |
| 4.8 | `js/mod/ajustes.js` | Un renglón «Atajos y pantallas» que lista lo alcanzable sin pestaña: Qué atender, y la nota de que quien tenga el icono viejo en la pantalla de inicio puede volver a agregar la app para estrenar el Tablero. Nada queda indescubrible. |
| 4.9 | `docs/SISTEMA-DE-DISENO.md` | Documentar `.tb-linea`, `.tb-etapa`, `.pf-marco`, `.pf-marco-caja` y `.pf-cuenta.mal`. Y cerrar dos huecos que este reacomodo destapa: §1 no documenta la escala de iconos `--ico1..--ico4` (`css/sistema.css:65-82`) ni los seis matices `--pc-1..--pc-6` (`:126-180`). Manda el CSS, como dice la línea 3 del propio documento. |
| 4.10 | `sw.js` | `APP_VERSION` de 16 a **17**. |

**Criterio de aceptación del commit 4, y es una condición, no una sugerencia:** se recorre la
tabla del recorrido de §6.3 y **si una casilla exige volver a la barra de pestañas, el commit no
está terminado**.

### 6.1 El buzón de un solo uso — `ctx.pasar` / `ctx.recibir`

Cuatro líneas en `js/app.js`, junto al objeto literal que el comentario de `:48-50` pide
expresamente que se amplíe ahí y no con un global.

```js
/* Lo que un módulo le deja al siguiente. De un solo uso, en memoria y SIN pasar por el
   hash: `rutaDelHash()` corta en '?' y `rutaPorNombre()` exige igualdad EXACTA de un solo
   segmento, así que `#/proyectos?id=x` no casa con nada, cae al default y además deja la
   barra de direcciones mintiendo, porque montarDeVerdad nunca reescribe location.hash. Es
   el mismo idioma que `al3d_anidar`: se escribe, se lee una vez y se borra. */
let _pase = null;
ctx.pasar   = (ruta, dato) => { _pase = { ruta, dato }; ir(ruta); };
ctx.recibir = () => { const p = (_pase && _pase.ruta === _actual) ? _pase.dato : null; _pase = null; return p; };
```

**No se inventan sub-rutas ni query string en el hash. Lock.** `#/hoy/anidador` no existe:
`rutaPorNombre` exige `r.ruta === n` (`js/app.js:46`), el segundo segmento no casa, cae a la
primera ruta del rol **y la URL sigue mintiendo**. Soportarlas de verdad son cuatro cambios
coordinados —`rutaDelHash`, `ir`, `montarDeVerdad` y la guarda de deduplicación de `:126`, que
haría que cambiar solo la sub-vista no remonte nada— y ahorran cuatro líneas. El precio de
depurar un fallo sin error, sin log y con la URL mintiendo es más alto.

### 6.2 `pruebas/navegador/tablero.mjs` — la prueba nueva

Mismo arnés que las nueve que ya existen: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'`,
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, `PUERTO` del entorno,
contadores `mal`/`bien`, `p.on('pageerror')`, `process.exit(fallos ? 1 : 0)`. Cabecera con el
porqué, como todas.

Casos, y cada uno cubre algo que **no se ve mirando la pantalla**:

1. `./` sin hash monta `mod-tablero` y la pestaña 1 está `.on`.
2. `./#/hoy` monta `mod-tablero` (no `mod-atender`). **Es el caso que protege el icono ya
   instalado del iPhone.**
3. `./#/agenda`, `./#/material`, `./#/proyectos`, `./#/mapa` siguen montando lo suyo.
4. `./#/atender` monta `mod-atender` **y la pestaña «Tablero» sigue encendida** (el campo `padre`).
5. Con datos sembrados, el Tablero pinta la cinta de cuentas, la línea de estaciones y al menos
   un `.pf-fila` con su `.tal-pista`; y `«N atrasados»` aparece cuando `etapa_real` va detrás de
   `etapa_esperada`.
6. Tocar un bloque de la línea filtra la lista y `aria-pressed` pasa a `true`.
7. Con rol `fabricacion`, un renglón en `listo` **no** trae botón de avanzar y **sí** trae la
   razón visible.
8. **Commit 2:** `./#/hoy` con la sub-vista anidador → `window.Anidador` existe dentro del marco
   y **un acomodo de prueba TERMINA**; la `.topbar` del anidador no se pinta.
9. **Commit 3:** `./#/cotizador` carga el marco; `.brand` y `.btn-pf` apagados y el botón
   «Historial» **visible y tocable**; escribir `al3d_pf_ganadas` desde dentro del marco dispara
   el `storage` del padre **y NO recarga el iframe**; tres `history.back()` desenrollan modal →
   pantalla del cotizador → ruta de la plataforma, con `pageerrors` vacío.

`pruebas/correr.sh` recoge `navegador/*.mjs` solo: **no hay que tocarlo.**

### 6.3 La tabla del recorrido — criterio de aceptación de R4

| Paso del taller | Dónde vive | Cómo se llega al SIGUIENTE sin volver a la barra |
|---|---|---|
| cotizar | `#/cotizador` (marco) | «Registrar venta» escribe `al3d_pf_ganadas`; el `storage` cruza al padre, `drenarBuzon()` corre y el toast lo dice de inmediato |
| autorizar | dentro del Cotizador | El aviso A6 aparece en el Tablero con su botón «Decidir N cotizaciones» |
| se ganó | `#/atender`, tarjeta A6 | El toast ofrece «Ponerle fecha» → `ctx.pasar('agenda', {proy, hoja:'agendar'})`: la hoja abre con el proyecto ya elegido |
| diseñar | renglón del Tablero | «Ponerlo en diseño» en sitio, sin cambiar de pantalla |
| anidar | sub-vista del Tablero | «Acomodar en la lámina» desde el Calendario o desde el Tablero; si falta el trazo, «Vectorizar en el Cotizador» → `postMessage` → de vuelta al Anidador |
| cortar | renglón del Tablero | «Ya se cortó» con confirmación; el toast dice «salieron 3 materiales del almacén» con acción «Ver almacén» |
| armar / listo | renglón del Tablero | En sitio. Con rol `fabricacion` el tope es `listo` y ahí se pinta la razón |
| instalar | `#/agenda` y `#/mapa` | La ficha imprime la orden de trabajo; «Se instala esta semana» lleva a la ruta del día |
| cobrar | ficha, eje `estatus_notion` | Rol pagos. Es OTRO eje y **nunca se mezcla con la etapa** |

---

## 7. LO QUE NO SE TOCA

- **`plataforma.html` no se borra nunca**, ni su `location.replace` que conserva el hash
  (`:19`), ni su entrada en `APP_FILES` (`sw.js:56`). Es la dirección grabada en marcadores, en
  los shortcuts del manifiesto instalado y, en iPhone, **dentro del icono de la pantalla de
  inicio**. Lo único que cambia es el texto de su `<p>` visible.
- **`manifest.webmanifest` (el del Cotizador) no se toca en absoluto.** Su `id` y su `start_url`
  pertenecen a una PWA ya instalada; cambiar el `id` crea una app nueva en el teléfono y deja la
  vieja huérfana.
- **El `id` de `manifest-plataforma.webmanifest` no se toca**, por lo mismo.
- **`css/sistema.css` no se edita a mano.** Es una copia generada del bloque `<style>` de
  `cotizador.html` (`herramientas/extraer-estilo.sh`, anclado en `^<style>$` / `^</style>$`) y
  `pruebas/hojas-de-estilo.mjs:31,39,44` falla si divergen. **Todo el CSS del reacomodo va en
  `css/plataforma.css`**; lo único que se escribe del otro lado son las dos reglas
  `html.empotrado`, y se regenera en el mismo commit.
- **`index.html` sigue cargando exactamente `<script type="module" src="./js/app.js"></script>`
  y `cotizador.html` NO lo carga.** Es el candado contra el ritual viejo de publicar renombrando
  el HTML a `index.html` (`pruebas/publicacion.mjs:124-137`), y `cotizador.html` sigue trayendo
  `const MATERIALES`.
- **El motor vendorizado del anidador no se toca ni una coma**: `svgnest.js`, `svgparser.js` y
  `js/lib/*` siguen byte por byte el master de SVGnest, y los diez `<script>` en orden estricto
  de `anidador-vectores/index.html:238-249` tampoco.
- **`js/datos/taller.js` sigue PURO**: sin DOM, sin red, sin IndexedDB, sin reloj propio. El
  Tablero consume sus resultados y no le mete pintado adentro. Y `ventanaTaller` **nunca se
  ancla en hoy**: un plan que se mueve cada vez que alguien abre la app no es un plan.
- **El contrato de solo lectura del cotizador.** `js/datos/cotizador.js` no escribe ninguna
  clave del cotizador; la única que la plataforma escribe es `al3d_pf_ganadas`, que es suya por
  prefijo. Y el buzón sigue siendo los mismos 12 campos planos.
- **`.pf-mbar` sigue siendo de ACCIONES del módulo, no de navegación.** El incidente de
  ensuciarla está documentado con nombre en `js/app.js:95-100`: «el botón que se queda pegado es
  *Recibí lo de la lista*, que escribe en el libro del almacén».
- **Los nombres de pantalla de la capa de datos no se reescriben en la vista**: `ETAPA_NOMBRE`
  («Listo para instalar», «No se dio»), `VENTANA_NOMBRE`, `ESTADO_NOMBRE`, `PLAZOS[].etiqueta`.
  «Listo» y «Terminado» en dos vistas del mismo dato es cómo alguien pregunta si son dos cosas.
- **Los siete `TIPOS_TRABAJO`** siguen sin acentos y con «Custome» mal escrito, porque así están
  en Notion. Corregirlos crea un octavo valor que las vistas de Notion no filtran.
- **Los tiles de OpenStreetMap no se cachean** (`sw.js:245-253`).
- **`js/mod/fabricacion.js` no se rediseña.** Son 1 600 líneas con tres lentes, tres vistas, dos
  capas, cuatro atajos de teclado y una barra fija; el reacomodo solo le injerta la lectura de
  `ctx.recibir()`, un botón y el `import` de `filaTaller`.
- **No se fusionan los dos sprites** (48 símbolos en `index.html`, 36 en `cotizador.html`). Con
  marcos cada documento tiene su espacio de ids; fusionar es trabajo con un modo de falla mudo
  —un `<use>` que no resuelve dibuja nada— y ningún beneficio en esta arquitectura.
- **No se toca la carga no bloqueante de las fuentes** (`media="print" onload=this.media='all'`).
  `js/app.js:457-466` documenta la caída completa que provocó no tenerla.
- **`pruebas/correr.sh` no se toca**: recoge `*.mjs` y `navegador/*.mjs` solos.

---

## 8. COMPATIBILIDAD

### 8.1 URLs — ninguna se rompe, ninguna cambia de significado

| Dirección | Quién la tiene grabada | Dónde aterriza después |
|---|---|---|
| `./` | el marcador de la computadora del taller | **Tablero** (dirección/fabricación/pagos) |
| `./#/hoy` | `start_url` y shortcut del manifiesto **ya instalado**, el icono del iPhone, `cotizador.html:3111`, `anidador-vectores/index.html:57`, `plataforma.html:21` | **Tablero** — la ruta sigue existiendo y solo cambió el módulo que carga |
| `./#/agenda` | shortcut instalado, `cotizador.html:12458` | Calendario, igual que hoy |
| `./#/material` | shortcut instalado | Material, igual que hoy |
| `./#/proyectos` | `cotizador.html:12439` | Proyectos, igual que hoy |
| `./#/mapa`, `./#/ajustes` | — | igual que hoy |
| `./#/atender` | nadie: nombre nuevo | Qué atender, con la pestaña Tablero encendida |
| `./#/cotizador` | nadie: nombre nuevo | el Cotizador empotrado |
| `./plataforma.html` y `./plataforma.html#/…` | marcadores viejos, iconos de iPhone | `location.replace('./' + search + hash)` conserva el hash y todo lo de arriba aplica |
| `./cotizador.html` | `start_url` de la PWA «Cotizador» instalada | el cotizador, **solo, byte por byte como hoy**: sin `parent`, sin clase `empotrado`, con su topbar completa y su enlace de vuelta |
| `./anidador-vectores/` | marcadores del de corte | el anidador, solo, con su topbar propia |

**Cero alias, cero renombres, cero atajos rotos.** Ese es el argumento entero para no crear una
ruta `tablero`.

### 8.2 Service worker

- **`APP_VERSION`**: 13 → **14** (commit 1) → **15** (commit 2) → **16** (commit 3) → **17**
  (commit 4). Una unidad por commit que toque la plataforma. Es la única línea que hay que subir
  al publicar, y su propio recuadro (`sw.js:4-9`) lo dice.
- **`APP_FILES`**: dos rutas nuevas en total, `'./js/mod/tablero.js'` y
  `'./js/mod/cotizador.js'`, junto a los otros `mod/`. `pruebas/publicacion.mjs:70-89` falla con
  el mensaje exacto si falta una.
- **`esDeLaPlataforma()` no se toca**: `sw.js:127` ya cubre `/js/` y `:126` ya casa
  `/anidador-vectores/` por prefijo.
- **La estrategia del cotizador no cambia**: sigue por `cotizador()`, red-primero
  (`sw.js:308-331`), y `./cotizador.html` sigue en `BASICOS`. Una petición de iframe es un fetch
  normal dentro del mismo scope `./`.
- **Las dos estrategias NO son la misma y se ven iguales:** `plataforma()` resuelve con
  `c.match(req, {ignoreSearch:true})` (`:268`) y `cotizador()` con `c.match(req)` a secas
  (`:324`). Por eso **ningún `src` de iframe lleva query string**.
- Si `addAll` falla y ya existía una versión anterior, `install` **LANZA** a propósito
  (`sw.js:199-206`) y la versión completa vieja sigue sirviendo: publicar sin actualizar
  `APP_FILES` **no degrada, bloquea**.

### 8.3 Manifiestos y atajos instalados

- `manifest-plataforma.webmanifest`: `start_url` a `'./#/hoy'`, cuatro shortcuts a `'./#/…'`,
  `description` nueva. `id` y `name` intactos.
- `manifest.webmanifest`: intacto.
- **Los iconos YA instalados no se releen del manifiesto**: guardan la URL con la que se
  agregaron. Siguen entrando por `./plataforma.html#/hoy` → `./#/hoy` → **el Tablero**. Es
  exactamente por eso que no hacía falta renombrar nada, y es la razón de ser de la decisión de §1.
- **No redirigir `#/hoy` a otra ruta dentro de `plataforma.html`.** Eso convertiría un marcador
  legítimo en una mentira y es la clase de fallo que no se depura.
- `pruebas/hojas-de-estilo.mjs:81` valida el `theme_color` de los dos manifiestos contra el azul
  de la marca; no se toca.

---

## 9. RIESGOS RESIDUALES

| Riesgo | Mitigación |
|---|---|
| **Las teclas 1-9 se remapean solas.** Salen de la posición en la barra (`js/app.js:198`, `:347`); el `title` se actualiza pero la costumbre no. | El orden se eligió para que Proyectos siga en la 3 y Material en la 4. Solo cambian la 1, la 2 y la 5→6. Se avisa una vez al dueño. No hay prueba que lo detecte. |
| **El teclado del teléfono dentro del marco del Cotizador.** `100dvh` y `visualViewport` describen el marco, no el visor, así que los modales altos (`css/sistema.css:1086`, `:1231`, `:1702`) podrían quedar tapados. | `medirMarco()` fija el alto en píxeles reales escuchando `visualViewport.resize`. **Condición de publicación: probarlo en un iPhone real con un modal alto abierto y el teclado arriba, y no borrar el `<a>` de la topbar hasta entonces.** Salida de emergencia: el `vacio()` con `<a href="cotizador.html">`. |
| **`env(safe-area-inset-*)` vale 0 dentro de un iframe**, y ni usa el valor de reserva. La víctima es `.mbar` (`cotizador.html:614-618`), la barra con el botón principal. | `.pf-marco-caja{padding-bottom:env(safe-area-inset-bottom,0px)}` en el PADRE, y `medirMarco()` resta el inset. Cero ediciones de las 30 declaraciones del cotizador y cero código que dependa del ciclo de vida del marco. Verificado por el caso 9 de `tablero.mjs` y a mano en iPhone. |
| **Alguien «optimiza» el iframe del anidador a módulo del router.** `evalPath` resolvería a `/js/lib/eval.js` y el motor se rompería **mudo**. | El comentario-barandilla de §5.2 pegado al iframe, con las dos líneas citadas, y el caso 8 de `tablero.mjs`, que comprueba que un acomodo TERMINA. |
| **Alguien le pone `sandbox` al iframe del cotizador.** Mataría `window.open` y con él el PDF. | Comentario explícito en `js/mod/cotizador.js` junto al `<iframe>`. `pruebas/navegador/pdf-hoja-carta.mjs` cubre la página suelta; el caso 9 el marco. |
| **El marco se destruye al cambiar de pestaña.** Se pierde el paso y el scroll del Cotizador, y un acomodo en curso del Anidador. | Es un trade elegido: `al3d_q` se autoguarda en cada tecla, así que la cotización no se pierde; y destruir el marco es lo único que mata los Web Workers del anidador. Se dice al dueño antes de que lo descubra. Recuperar el paso del Cotizador con `contentWindow.irAPaso(n)` queda fuera de esta entrega (§10). |
| **Dos copias de `css/sistema.css` en memoria** (una por marco, cacheadas). | Se cierra casi entero con el cambio que `herramientas/extraer-estilo.sh:8-12` ya tiene programado —el `<style>` a `<link href="css/sistema.css">`—, que queda fuera de esta entrega (§10). |
| **Publicar sin subir `APP_VERSION` o sin meter los `.js` nuevos en `APP_FILES`.** | `pruebas/publicacion.mjs` lo caza solo con el mensaje del arreglo. Y `install` lanza en vez de degradar. Correr `pruebas/correr.sh` en cada commit no es ceremonia. |
| **El Tablero es la pantalla de entrada: cualquier escritura suya corre en cada arranque de cada teléfono.** | No llama `Reglas.refrescar()`. Está escrito en la cabecera del módulo y en §3.0. Quien pinte encima tiene que respetarlo. |
| **Duplicar el juez del semáforo de material.** Si alguien re-deriva `Stock.listaCompra()` en el Tablero, habrá dos respuestas a la misma pregunta y la que se pinte será la que nadie probó. | El Tablero llama `Agenda.dictamen()`. La regla está escrita en `js/mod/inicio.js:14-17` y se repite en la cabecera de `tablero.js`. |
| **El globo de «Material» deja de pre-pintarse.** Hoy lo publica `js/mod/inicio.js:439`, y con `atender` fuera de la barra solo aparece tras visitar Material. | Pérdida real y aceptada a propósito: la alternativa era una segunda llamada a la función más cara del sistema en la pantalla de entrada, o publicar el mismo globo con otra fórmula y que el número cambie al navegar. La tarjeta «Falta material» del Tablero es una señal mejor. Se dice, no se descubre. |
| **El globo de la pestaña cambia el ancho al aparecer** (`hidden` sobre un `.cta` de `min-width:20px`), y la tira se recorre en horizontal. | Las cuentas del Tablero se pintan siempre, aunque sean 0. Reservar el hueco del `.cta` con un `min-width` estable en `css/plataforma.css:124-127` va en el commit 1. |
| **El Anidador sigue siendo una mesa de arrastre sin alternativa de un solo puntero** (WCAG 2.2 AA). | Deuda previa, pero al meterlo al ecosistema deja de ser «otra app». Se registra como deuda conocida en `docs/`; esta entrega no la crea ni la resuelve. |
| **El desfase `etapa_real` vs `etapa_esperada` es una LECTURA.** | El Tablero lo muestra y no lo corrige. La etapa está en BLOQUEADOS (`js/datos/proyectos.js:595`) y solo se mueve con `avanzarEtapa()`, que descuenta el almacén al cruzar corte. |

---

## 10. LO QUE SE DEJA FUERA, Y POR QUÉ

1. **Sub-rutas de verdad (`#/hoy/anidador`) y query string en el hash.** Cuatro cambios
   coordinados en el router para ahorrar cuatro líneas, con un modo de falla sin error, sin log
   y con la URL mintiendo. `ctx.pasar/recibir` da el 100 % del resultado visible.
2. **Renombrar `agenda` o `hoy`.** Están grabados en shortcuts de manifiestos ya instalados y en
   el icono de pantalla de inicio del iPhone. Una ruta que desaparece no da error: abre otra
   pantalla.
3. **Convertir `cotizador.html` en módulo ES.** 273 manejadores en línea, cero `window.X =`,
   645 KB sin pruebas unitarias, el único dato irrecuperable del sistema adentro, y rompe a
   propósito el candado de `pruebas/publicacion.mjs:124-137`.
4. **Portar el anidador a módulo ES.** Es el destino correcto y no es esta tarea: exige
   reescribir 755 líneas con `montar`/`desmontar`, inyectar ocho globales en orden, quitar los
   cinco oyentes de `document`, ceder `#toast` a `ui.js`, rehacer `APP_FILES`, reescribir la
   prueba de navegador y —sobre todo— resolver `evalPath`, que no es configurable y cuyo fallo no
   se ve en pantalla.
5. **El `<style>` de 210 KB del cotizador a `<link href="css/sistema.css">`.** El propio
   `herramientas/extraer-estilo.sh:8-12` lo tiene programado «para la próxima vez que
   cotizador.html se toque por otra razón», y bajaría el archivo de 912 KB a ~700 KB con caché
   compartida. Pero obliga a reescribir el extractor y `pruebas/hojas-de-estilo.mjs:31,39,44`, y
   hace que la ruta sin señal del cotizador dependa de que la caché APP esté completa. Es un
   commit propio, con su cambio de herramienta y de prueba, y no bloquea nada de R1–R4.
6. **La tarjeta A6 completa dentro del Tablero** (los botones «Se ganó» / «No se dio» en el
   propio renglón). Son ~120 líneas de `inicio.js` con su modal `#pf-pide`; duplicarlas es
   garantizar que divergan. En esta entrega el Tablero lleva el renglón compacto y el botón que
   manda a `#/atender`, donde el flujo ya funciona.
7. **Recuperar el paso y el scroll del Cotizador al volver al apartado.** Se puede con seis
   líneas y mismo origen (`contentDocument` para leer el `.paso-tab.on`, `contentWindow.irAPaso(n)`
   en el `load`), pero es pulido y no requisito: `al3d_q` ya no pierde nada.
8. **`js/datos/paso.js`, la única fuente de «qué sigue».** Es la refactorización correcta —el
   mismo verbo en el renglón del Tablero, en el pie de `pf-ficha` y en `#pf-mbar`— pero es
   antidivergencia, no funcionalidad, y en esta entrega solo hay dos consumidores. Se hace cuando
   el pie de la ficha se toque por otra razón.
9. **Mudar los retazos del anidador a IndexedDB / `js/datos/stock.js`.** Hoy son un array en el
   `localStorage` de un solo aparato (`anidador-vectores/js/app.js:36`, `:219-223`) y son
   inventario real de sobrantes que no ve nadie más.
10. **Que las tarjetas de hoja del anidador salgan del catálogo.** Fija `1200×2400` mm a mano
    (`anidador-vectores/js/app.js:45`) mientras `js/datos/material.js:123-131` dice 1.22 × 2.44 m
    y `js/datos/taller.js:106` usa `LARGO_LAMINA_CM = 244`; Alucobond es 1.25 × 2.50 y no tiene
    tarjeta. Son 20 × 40 mm de material real por hoja y el aviso «cabe / no cabe»
    (`medidas.js:111-118`) se calcula contra la hoja equivocada. Cambio chico y de valor
    inmediato, pero es del anidador y no del reacomodo.
11. **Cerrar el bucle de calibración.** `APROV_NESTING_simple: 0.80` y
    `APROV_NESTING_irregular: 0.72` (`js/datos/material.js:151`) son **adivinanzas** que deciden
    cuánto material consume cada proyecto; `PALANCA` (`:1119-1128`) y `calibracion()` ya saben
    proponer un valor nuevo con 5 muestras y >15 % de desviación; y el anidador calcula el
    aprovechamiento **real** en cada corrida (`anidador-vectores/js/app.js:520`) y lo tira. Con
    el marco de mismo origen el canal ya existe: `contentWindow.Anidador.estado()`. **Es el
    argumento más fuerte de todo el expediente para meter el anidador dentro y no al lado**, y es
    la siguiente cosa que hay que hacer después de esto.
12. **El sello de tiempo de cambio de etapa.** `avanzarEtapa` escribe `{...p, etapa}` y nada más
    (`js/datos/proyectos.js:793`), y `js/datos/taller.js:88-91` lo declara: «no hay un solo dato
    de cuánto tardó cortar nada». Sin él son **imposibles con datos honestos** la duración por
    etapa, el throughput, el cuello de botella medido, el cumplimiento histórico y la calibración
    de `CUBO_POR_TIPO`. Se arregla con **un campo**, no con una consulta, y desbloquea los cinco
    de golpe. Es la siguiente prioridad después del punto 11.
13. **Indicadores que esta entrega NO pinta, y no por falta de tiempo:** ningún % de ocupación
    del taller (no existe capacidad capturada en ningún sistema y `js/datos/taller.js:30-31` y
    `:362-364` se niegan expresamente), ninguna tarjeta de cobranza (`pago_pendiente` y
    `comision_restante` son fórmulas de Notion y en fase 1 valen `null` en todas las filas: un
    `$0` ahí le dice a alguien que ya cobró), ningún margen o costo real (`costo_compra` es
    opcional y `null` en las 19 filas de la semilla), y nada derivado de `compromiso_texto`, que
    se guarda crudo y la arquitectura prohíbe parsear.
14. **Riel lateral a partir de 1100 px, menú «Más», y cualquier librería** —de gráficas, de
    iconos o de animación—. La barra se queda como tira superior de pestañas: mezclar riel y tira
    es peor que la tira, y con seis pestañas en 1180 px de contenido la tira no se desliza. Todo
    el Tablero son piezas del sistema que ya existen.
15. **Iconos nuevos** (`i-adelante`, `i-buscar`, `i-filtro`, `i-armar`, `i-instalar`). Ninguno
    hace falta para R1–R4. El que cierra una pareja incompleta es `i-adelante`: hoy solo existe
    `i-atras` y el avance se pinta con el glifo crudo `›`, que es lo que esta entrega también usa.
16. **Modo oscuro.** `color-scheme:only light` es una decisión escrita con su bug medido
    (`css/sistema.css:25-29`). Cero ocurrencias de `prefers-color-scheme` en todo `css/`, y así
    se queda.
17. **Arrastrar tarjetas entre etapas.** La etapa solo se mueve con `avanzarEtapa()`, y un
    arrastre sin alternativa de un solo puntero es deuda de accesibilidad, no una mejora.
