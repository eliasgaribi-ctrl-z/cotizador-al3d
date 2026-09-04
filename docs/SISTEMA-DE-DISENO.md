# Sistema de diseño — AL3D
### Especificación exacta y copiable para módulos nuevos
Fuente única: **`css/sistema.css`**. Las tres superficies —`cotizador.html`, `index.html` y `anidador-vectores/index.html`— la enlazan, y `js/tema.js` pone `data-tema` en `<html>` antes de que pinte. El tema oscuro es la capa (7) al final de la hoja: otro juego de tokens bajo `html[data-tema="oscuro"]`, sin reglas repetidas. Los números de línea de este documento envejecen en cuanto alguien toca el archivo, así que **busca por el selector, no por la línea**: cuando este documento y el CSS no coincidan, manda el CSS. Vanilla JS, sin build. No hay clases utilitarias: todo es clase semántica o `style=` en línea para lo irrepetible.

> **Septiembre de 2026 · el rediseño responsive.** La app era de BARRO —radios de 38 px, cuatro capas de sombra por pieza, degradados de marca, el lienzo teñido con manchas radiales y un matiz de color por partida—. Ahora es **híbrida**: la estructura y la sobriedad de la guía THIQA con los azules del logotipo AL3D. Superficie plana, un borde de 1 px, esquinas casi rectas, **una** sombra y solo donde algo flota de verdad, y **un botón de color por pantalla**. Lo que sigue describe esa dirección; lo que cuenta el barro se conserva solo donde explica por qué algo es como es.
>
> El cambio se hizo **en la capa de tokens**, no regla por regla: los nombres viejos (`--card`, `--line`, `--muted`, `--r`, `--sh`) cuelgan hoy de los nuevos (`--sup`, `--linea`, `--tinta2`, `--rr3`, `--sombra`), así que las mil reglas que ya los pedían pintan la dirección nueva sin haberse tocado. Si vas a cambiar el aspecto de algo transversal, **cámbialo ahí**.

**Ley de la hoja, respétala o tu CSS no aplica:** entre dos reglas con la misma especificidad gana **la última**; una media query **no** pesa más por ser más estrecha. La hoja está ordenada en capas: (1) estructura, (2) bloque de teléfono `≤560px`, (3) `@media(hover:none),(pointer:coarse)`, (4) **capa de estructura y movimiento** (la que sustituyó a la capa de estructura; empieza en el banner `CAPA DE ESTRUCTURA Y MOVIMIENTO`), (5) bloque de cierre «lo que tiene que ganar por orden», (6) `@media print`, (7) tema oscuro. Si escribes una regla base nueva y la pones al final, **pisas la capa (4)**. Pon lo nuevo en la capa que le toca.

**Y una que costó tres veces:** `[hidden]{display:none!important}` vive al principio de la hoja porque la regla del navegador —`[hidden]{display:none}`— la pisa **cualquier** clase de autor que ponga `display`. Sin ella, `el.hidden = true` sobre algo con `display:flex` no esconde nada.

---

## 1. Variables `:root` — verbatim

```css
:root{
  color-scheme:light;

  /* ----- Los tokens del traspaso ----- la fuente; la rampa sale de ellos */
  --fondo:#f3f4fb;                    /* el lienzo, plano */
  --sup2:#f7f8fd;                     /* superficie hundida: un hueco dentro de una tarjeta */
  --linea:#dcdff2; --linea2:#eceef8;  /* el borde de una pieza y el renglón de dentro */
  --tinta:#1a1d33; --tinta2:#5c6184;  /* la tinta y la segunda tinta */
  --nav:#171a33; --nav2:#232744;      /* la barra lateral y su ítem encendido */
  --tinta3:#666d9b;                   /* la tercera tinta; ver la nota de contraste de abajo */

  /* ----- Neutros ----- los mismos números: --n1 es --fondo, --n3 es --linea, --n8 es --tinta */
  --n0:#fbfcff; --n1:#f3f4fb; --n2:#eceef8; --n3:#dcdff2; --n4:#b9bede;
  --n5:#8b90b8; --n6:#5c6184; --n7:#3d4166; --n8:#1a1d33; --n9:#171a33;

  /* ----- El acento, sacado del logotipo ----- */
  --a:#4060f8; --a-fuerte:#3018f8; --a-claro:#6090f8; --a-suave:#e9edff; --a-borde:#b9c5fe;
  --a-fill:#4060f8;   /* RELLENO de lo elegido y del botón de color: lleva blanco encima */
  --a-tx:#3018f8;     /* el azul cuando es TEXTO o filete */
  --a2:#7b3ff8;       /* violeta: el mismo azul girado, para el segundo acento */
  --a3:#18b6d8;       /* aguamarina: para lo que informa sin ser acción */
  --grd-deco:var(--a-fill);           /* era un degradado; hoy es un color */

  /* ----- Estados ----- vivos, no apagados; medidos contra su relleno. */
  --ok:#0a7d4a; --ok-bg:#e2f8ec; --ok-borde:#a9e8c6;
  --ok-fill:#0a7d4a;  /* RELLENO verde: el único de la app, y el que aguanta blanco encima */
  --av:#8a5100; --av-bg:#fff2dd; --av-borde:#ffd79c;
  --mal:#c62828; --mal-bg:#ffeceb; --mal-borde:#ffc4c1;

  /* ----- Tipografía ----- siete pasos y dos familias. */
  --t1:11px; --t2:12.5px; --t3:14px; --t4:15px; --t5:20px; --t6:24px; --t7:28px;
  --f-texto:'Figtree',…;   /* todo el texto */
  --f-cifra:'Outfit',…;    /* títulos, cifras, folios, números de paso */

  /* ----- Espacio ----- múltiplos de 4. */
  --e1:4px; --e2:8px; --e3:12px; --e4:16px; --e5:24px; --e6:32px; --e7:48px;

  /* ----- Radios ----- casi rectos: ficha, control, tarjeta. */
  --rr1:3px; --rr2:4px; --rr3:6px; --rr4:6px;

  /* ===================== La sombra, una sola =====================
     Significa «esta pieza flota por encima de las demás». La llevan las tarjetas del
     tablero de proyectos y los controles sueltos encima del mapa. Nada más. */
  --sombra:0 1px 2px rgba(35,39,68,.06),0 8px 24px -12px rgba(48,24,248,.18);
  --sombra-alta:0 2px 6px rgba(35,39,68,.08),0 24px 48px -16px rgba(48,24,248,.28);
  /* Los cuatro nombres del barro siguen existiendo porque los piden ~200 reglas: */
  --clay:var(--sombra); --clay-alto:var(--sombra-alta); --clay-a:var(--sombra);
  --clay-in:none; --clay-in-pc:none;   /* lo hundido hoy se dice con --sup2 y un borde */

  /* ----- Movimiento ----- una curva, la del rediseño. */
  --mv:.32s cubic-bezier(.2,.8,.2,1);     /* lo que aparece */
  --mv-r:.2s cubic-bezier(.2,.8,.2,1);    /* un cambio de estado */
  --mv-s:.16s cubic-bezier(.2,.8,.2,1);   /* un color */
  --mv-t:.5s cubic-bezier(.2,.8,.2,1);    /* la transición de elemento compartido */

  /* ----- Alias de los nombres viejos ----- ESTO es el rediseño, para las mil reglas de abajo */
  --bg:var(--fondo); --card:var(--sup); --ink:var(--tinta); --fg:var(--tinta);
  --muted:var(--tinta2); --line:var(--linea);
  --brand:var(--a); --brand-strong:var(--a-fuerte); --navy:var(--nav);
  --soft:var(--sup2); --soft-2:var(--linea2);
  --r:var(--rr4); --r-sm:var(--rr2); --r-xs:var(--rr1); --r-lg:var(--rr4);
  --sh:var(--sombra); --sh1:var(--sombra); --sh2:var(--sombra-alta);
  --brand-grd:var(--a-fill);
}
```

**Los seis matices de partida son uno.** `--pc-1..--pc-6` (y sus `-md`, `-bd`, `-sv`, `-rgb`) siguen declarados porque los piden ~200 reglas, y los seis apuntan al mismo azul. El rediseño lo pide con una frase —«el azul solo significa ELEGIDO»— y la partida rediseñada contesta mejor la pregunta que los matices resolvían: el **resumen fijo** del encabezado dice de quién es cada cosa, y lo dice también en papel y para quien no distingue seis tonos.

**La tercera tinta se aparta del traspaso, y es medido.** El documento la da como `#8b90b8` y a la vez pone la regla «nada con texto encima baja de 4,5:1». Las dos cosas no pueden ser verdad: `#8b90b8` sobre blanco da **3,10:1** y en el diseño lleva texto de verdad. Se conserva el papel y se oscurece hasta que pueda serlo: `#666d9b` da 4,97:1 sobre `--sup`, 4,68:1 sobre `--sup2` y 4,53:1 sobre `--fondo`. En oscuro, `#6f76a8` daba 3,80:1 y se sube a `#8b92c0`, que da 5,48:1. El tono de la muestra se queda en `--n5`, que es el escalón que no lleva texto.

**`--a` y `--a-fill` son el mismo número en claro y NO en oscuro.** De noche `--a` (`#6d86ff`) es el azul que se lee como texto sobre marino (5,11:1 sobre `--sup`) y con blanco encima daría 3,0:1; `--a-fill` (`#3b57e6`) es el que aguanta blanco (5,69:1). Uno es tinta y el otro es fondo.

**El verde tiene la misma separación, y por el mismo motivo.** `--ok` es TINTA —el verde que se lee sobre una superficie clara— y `--ok-fill` es RELLENO. De día coinciden (blanco sobre `#0a7d4a` da 5,21:1); de noche `--ok` sube a `#6fd6a4` para poder ser tinta y con blanco encima daría **1,78:1**, así que el relleno se queda oscuro: `#0e7a4d`, 5,37:1. `.btn-ok` —«Autorizar precio», «Guardar y salir de edición», «Restaurar ahora»— pedía `--ok`, o sea que en oscuro era ilegible; hoy pide `--ok-fill`. Su hover aclara un 6 % y no un 8 %: con `brightness(1.08)` el blanco de encima quedaba en 4,29:1. Lo mide `pruebas/navegador/contraste.mjs`, sección «PASO 3 · REVISAR EL PRECIO».

**`--nav-rgb`** es `--nav` en partes, para el velo de los modales: `rgba(var(--nav-rgb),.55)` en los seis flotantes y `.75` en los dos aparatos de pantalla completa. Ningún modal desenfoca el fondo — lo que lo separa son su borde, su sombra y el velo, y un `backdrop-filter` sobre un lienzo que se repinta al arrastrar una cota cuesta una capa de composición por cuadro justo ahí.

**Variables publicadas desde JS** (no viven en `:root`, se escriben en runtime):
`--top-fijo` (alto de la barra fija del cotizador, `ajustarTopbarMovil()`), `--mbar-h` (alto de la barra fija, `ajustarAltoBarra()`), `--pf-marco-h` (alto de los marcos empotrados, `medirMarco()`), `--sc-acc-h` y `--vt-acc-h` (pies del escalador y del vectorizador).

**Sí hay tema oscuro**, desde la auditoría de septiembre de 2026: `js/tema.js` escribe `data-tema` en `<html>` antes del primer pintado leyendo `al3d_tema` (`claro`, `oscuro` o el del sistema), y la capa (7) de la hoja cambia los tokens. Ninguna regla de arriba se entera.

### Cimientos que dependen de las variables

```css
*{box-sizing:border-box;margin:0;padding:0}
[hidden]{display:none!important}          /* obligatoria; ver la ley de la hoja */

body{
  font-family:var(--f-texto);
  background:var(--fondo);                /* PLANO: aquí vivían dos manchas radiales */
  color:var(--ink);line-height:1.45;font-size:var(--t3);
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
}
h1,h2,h3,.brand .t,.cifra{font-family:var(--f-cifra);letter-spacing:-.1px}
.cifra,.folio,[data-shared="total"]{font-variant-numeric:tabular-nums}

/* Filete de marca de 3 px pegado arriba. En la PLATAFORMA se apaga
   (css/plataforma.css: body.pf::before): allí la marca es la barra lateral, y una raya
   azul cruzando por encima la corta en dos. */
body::before{content:'';position:fixed;top:env(safe-area-inset-top,0px);left:0;right:0;height:3px;
  background:var(--a);z-index:200}

.wrap{max-width:1240px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 320px;
  gap:16px;align-items:start;
  padding:26px max(24px,env(safe-area-inset-right,0px)) 70px max(24px,env(safe-area-inset-left,0px))}
.wrap>main,.wrap>aside{min-width:0}   /* obligatorio: sin esto la página se desplaza a lo ancho */
.wrap.p-cliente{grid-template-columns:minmax(0,560px);justify-content:center}
```

**Pila de z-index (memorízala, está agotada casi entera):** filete `body::before` y `.salto` → **200**; `#toast` → **100**; `#lightbox` → **80**; `.lightbox-close` → **70**; `.modal-bg` → **60**; `.vt-modal-bg` → **56**; `.scaler-modal-bg` → **55**; `.pf-lat` (barra lateral) → **50**; `.mbar` → **45**; `.pf-abajo` (barra de módulos del teléfono) → **40**; `.topbar` y `.pf-cab` → **30**; el resumen fijo de una partida (`.pcab`) y el encabezado de una columna → **5**. Un módulo nuevo con capa propia debe elegir un hueco y documentarlo.

---

## 2. Componentes reutilizables

### 2.1 `.card` / `.card-h` / `.card-b` — la superficie contenedora
Toda sección de contenido va en una tarjeta. Título en `<h2>`/`<h3>` dentro de `.card-h`; contenido en `.card-b`.

```css
.card{background:var(--card);border:1px solid var(--n3);border-radius:var(--rr3);overflow:hidden}
.card+.card{margin-top:var(--e4)}
.card-h{padding:var(--e5) var(--e5) 0;display:flex;align-items:baseline;justify-content:space-between;gap:var(--e3)}
.card-h :is(h2,h3){font-size:var(--t4);font-weight:650;letter-spacing:-.2px;color:var(--n8);display:flex;align-items:center;gap:var(--e2)}
.card-b{padding:var(--e4) var(--e5) var(--e5)}
/* Capa de estructura (gana): */
.card,.sum{
  background:var(--sup);
  border:1px solid var(--linea);
  border-radius:var(--rr3);
  box-shadow:none;                 /* la sombra la llevan solo las piezas que flotan */
}
.card:hover,.sum:hover{box-shadow:none}   /* 35 tarjetas que se levantan son un tablero que se mueve solo */
.card-h{padding:var(--e3) var(--e4);background:transparent;border-bottom:1px solid var(--linea2)}
.card,.sum,.pasos,.p1-cierre{animation:entra .32s cubic-bezier(.2,.8,.2,1) both}
```

```html
<div class="card" id="card-mimodulo">
  <div class="card-h">
    <h2>Título del módulo</h2>
    <span class="folio" id="mi-contador">0 renglones</span>
  </div>
  <div class="card-b">…</div>
</div>
```

Plegado de tarjeta (opcional, `.card-fold` + clase `.folded` en `.card`, solo `≤920px`):
```html
<button class="card-fold" id="fold-x-btn" onclick="…" aria-expanded="true">
  <span class="txt" id="fold-x-txt">Ocultar</span><span class="chev" aria-hidden="true">▾</span>
</button>
```
```css
.card-fold{display:none;align-items:center;gap:7px;border:1.5px solid var(--line);background:#fff;
  color:var(--brand-strong);border-radius:9px;padding:7px 11px;font-family:inherit;font-size:11.5px;
  font-weight:700;cursor:pointer;max-width:60%;min-height:40px}
.card-fold .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.card-fold .chev{font-size:10px;flex-shrink:0;transition:transform .18s}
@media(max-width:920px){
  .card-fold{display:inline-flex}
  .card.folded .card-fold .chev{transform:rotate(-90deg)}
  .card.folded .card-b{display:none}
  .card.folded .card-h{padding-bottom:16px}
}
```

### 2.2 `.btn` y variantes — **un solo botón lleva relleno de color por pantalla**

```css
.btn{width:100%;padding:12px 16px;border-radius:var(--rr1);font-size:var(--t3);font-weight:550;
  border:1px solid transparent;cursor:pointer;
  transition:background .12s,border-color .12s,color .12s;
  display:flex;align-items:center;justify-content:center;gap:var(--e2)}
.btn+.btn{margin-top:var(--e2)}
.btn-fila{display:flex;gap:8px}
.btn-fila .btn+.btn,.vt-dl .btn+.btn{margin-top:0}

.btn-pri{background:var(--a);color:#fff}          .btn-pri:hover{background:var(--a-fuerte)}
.btn-ok {background:var(--ok);color:#fff}         .btn-ok:hover{filter:brightness(1.08)}
.btn-dgr{background:#fff;color:var(--mal);border-color:var(--mal-borde)}  .btn-dgr:hover{background:var(--mal-bg)}
.btn-gho{background:#fff;color:var(--n7);border-color:var(--n3)}
.btn-gho:hover{border-color:var(--n4);background:var(--n1)}
.btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.btn-wa {background:#fff;color:#0f7a6c;border:1.5px solid rgba(18,140,126,.32)}
.btn-wa:hover{background:#e9f8f5;border-color:#128c7e}
```

Capa de estructura (la que de verdad se ve):
```css
.btn,.mbar-btn,.ai-btn,.btn-scaler-open,.btn-vector-open,.addbtn,.precios-ver,.btn-maps,.card-fold,.btn-hist{
  border-radius:var(--rr2);
  transition:background var(--mv-s),color var(--mv-s),border-color var(--mv-s),transform var(--mv-s);
}
.btn-pri,.mbar-btn:not(.gho):not(.ok){
  background:var(--a-fill);color:#fff;border:1px solid var(--a-fill);
  box-shadow:none;text-shadow:none;font-weight:600;
}
.btn-pri:hover,.mbar-btn:not(.gho):not(.ok):hover{
  background:var(--a-fuerte);border-color:var(--a-fuerte);transform:none;box-shadow:none;
}
/* El verde se queda —autorizar un precio no es «continuar»— pero pasa al relleno que aguanta
   blanco. Es el único verde de relleno de la app. */
.btn-ok,.mbar-btn.ok{
  background:var(--ok-fill);color:#fff;border:1px solid var(--ok-fill);
  box-shadow:none;text-shadow:none;font-weight:600;
}
.btn-ok:hover,.mbar-btn.ok:hover{filter:brightness(1.06);transform:none;box-shadow:none}
.btn-gho,.btn-dgr,.ai-btn,.btn-scaler-open,.btn-vector-open,.precios-ver,.btn-maps,.card-fold,.btn-hist,.mbar-btn.gho{
  background:var(--sup);
  border:1px solid var(--linea);
  color:var(--tinta);
  box-shadow:none;
}
.btn-gho:hover,…,.mbar-btn.gho:hover{transform:none;box-shadow:none;border-color:var(--a-borde)}
.btn-dgr{border-color:var(--mal-borde);color:var(--mal)}
.btn-dgr:hover{background:var(--mal-bg);border-color:var(--mal)}
/* Los dos hitos de la entrega que todavía no tocan: neutros, con su tinta en el ICONO.
   Eran dos rellenos verdes debajo del relleno azul del hito que sí toca, así que la columna
   tenía tres botones de color y el que decía «esto es lo que sigue» no se distinguía. */
.btn-wa,.btn-vta{background:var(--sup);border:1px solid var(--linea);color:var(--tinta);box-shadow:none}
.btn-wa:hover,.btn-vta:hover{border-color:var(--ok-borde);background:var(--ok-bg);color:var(--ok)}
.btn-wa .svgi{color:var(--wa)}   .btn-vta .svgi{color:var(--ok)}
/* Cede 1 px al tocar, y nada más. El pellizco de escala era del barro. */
.btn:active:not(:disabled),…{transform:translateY(1px);box-shadow:none}
.btn:disabled,.mbar-btn:disabled{box-shadow:none;transform:none;opacity:.55}
```

```html
<button class="btn btn-pri" onclick="hacer()">Continuar a partidas <span aria-hidden="true">→</span></button>
<button class="btn btn-gho" onclick="volver()"><svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Volver al cotizador</button>
<div class="btn-fila">
  <button class="btn btn-ok">Autorizar</button><button class="btn btn-dgr">Rechazar</button>
</div>
```

> `.btn` trae `width:100%`. Dentro de un contenedor flex ese `width` es el **tamaño base** y el botón se come el renglón: para un botón en línea hay que anularlo (`.rv-header .btn{width:auto;flex:0 0 auto;min-width:44px;min-height:44px;padding:0;justify-content:center}`).

Botón de agregar (acción secundaria, discontinua):
```css
.addbtn{width:100%;padding:12px;border:1px dashed var(--n4);border-radius:var(--rr1);background:none;
  color:var(--n7);font-size:var(--t2);font-weight:500;cursor:pointer;transition:border-color .12s,background .12s}
.addbtn:disabled{opacity:.45;cursor:not-allowed}
/* capa de estructura */
.addbtn{background:var(--sup);border:1px dashed var(--a-borde);color:var(--a-tx);font-weight:600;
  box-shadow:none}
.addbtn:hover{background:var(--a-suave);border-color:var(--a);color:var(--a-tx);
  transform:none;box-shadow:none}
.addrow{display:flex;flex-wrap:wrap;gap:9px;align-items:stretch}
.addrow[hidden]{display:none}          /* `hidden` pierde contra cualquier display de autor */
.addrow .addbtn{flex:2 1 auto;width:auto;min-width:0}   /* reparto 2:1 a favor de la acción principal */
.addbtn.igual{flex:1 1 auto;white-space:nowrap;border-style:solid;border-color:var(--line);background:#fff;color:var(--brand)}
```
```html
<div class="addrow">
  <button class="addbtn" onclick="agregar()">+ Agregar partida</button>
  <button class="addbtn igual" onclick="duplicar()"><svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg> Igual que la anterior</button>
</div>
```

El botón de IA es **el único con color propio** (violeta→azul, respira):
```css
.ai-btn{width:100%;padding:10px 14px;border:1px solid var(--n3);border-radius:var(--rr1);background:#fff;
  color:var(--n7);font-size:var(--t2);font-weight:500;cursor:pointer;margin-bottom:var(--e4);
  display:flex;align-items:center;justify-content:center;gap:var(--e2)}
/* capa de estructura: sigue siendo el ÚNICO botón de color de su fila, y deja de respirar —
   en un botón de 44 px un degradado que se mueve solo es ruido, y el violeta ya distingue. */
.ai-btn{background:var(--a-fill);color:#fff;border:1px solid var(--a-fill);
  box-shadow:none;text-shadow:none;animation:none}
.ai-btn:hover{background:var(--a-fuerte);border-color:var(--a-fuerte);transform:none}
.ai-btn:disabled{animation:none;opacity:.5}
```

### 2.3 `.chip` — elegir una opción de un grupo

```css
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.chip{display:inline-flex;align-items:center;gap:var(--e2);padding:9px 14px;border:1px solid var(--n3);
  border-radius:var(--rr1);font-size:var(--t2);font-weight:500;cursor:pointer;background:#fff;color:var(--n7);
  transition:background .12s,border-color .12s,color .12s;user-select:none}
.chip small{font-weight:500;color:var(--n6);font-variant-numeric:tabular-nums}
.chip .ck{display:none}
.chip.on{border-color:var(--a-borde);background:var(--a-suave);color:var(--a-fuerte);font-weight:600}
.chip.on small{color:var(--a-fuerte);opacity:.75}
.chip.on .ck{display:inline-flex;align-items:center;font-size:11px;line-height:1;color:var(--a)}
.chip:hover:not(.on){border-color:var(--n4);background:var(--n1)}
.chip:focus-visible{outline:2.5px solid var(--brand);outline-offset:2px}
/* Apagado con COLOR, nunca con opacidad: el chip dice qué se eligió y eso hay que leerlo */
.chip[aria-disabled="true"]{cursor:default;background:transparent;border-color:var(--n2);color:var(--n6)}
.chip[aria-disabled="true"]:hover:not(.on){background:transparent;border-color:var(--n2);color:var(--n6)}
.chip[aria-disabled="true"].on{background:var(--n2);border-color:var(--n3);color:var(--n7)}
/* capa de estructura: caja de 4 px, no píldora. Una píldora se lee como un botón, y estos
   son opciones de un grupo. */
.chip{border-radius:var(--rr2);padding:0 var(--e3);min-height:40px;background:var(--sup);
  border:1px solid var(--linea);color:var(--tinta);font-weight:500;font-size:var(--t3);
  box-shadow:none;transition:border-color var(--mv-s),background var(--mv-s),color var(--mv-s)}
.chip:hover:not(.on):not([aria-disabled]){transform:none;box-shadow:none;border-color:var(--a-borde)}
/* Elegido = --a-fill con blanco. Es LA regla de color de la app, escrita una sola vez para el
   chip suelto y para el de dentro de una partida. */
.chip.on,.partida .chip.on{background:var(--a-fill);color:var(--a-fill-tx);border-color:var(--a-fill)}
/* El catálogo (los cinco materiales) va en rejilla; los grupos de tres chips cortos, en fila. */
.chips-catalogo{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}
.chips-catalogo .chip{min-height:44px;justify-content:flex-start;text-align:left}
.chips-catalogo .chip small{margin-left:auto;padding-left:var(--e2)}
.chip:active:not([aria-disabled]){transform:translateY(1px) scale(.97);box-shadow:var(--clay-in)}
.chip.on{background:var(--a-suave);color:var(--a-fuerte);border-color:var(--a-borde);
  box-shadow:var(--clay-in);font-weight:600}   /* HUNDIDO, no relleno de marca */
.chip[aria-disabled="true"]{box-shadow:var(--clay-in);background:var(--n1);transform:none}
.chip[aria-disabled="true"].on{background:linear-gradient(168deg,var(--n3),var(--n2));color:var(--n7);
  text-shadow:none;box-shadow:var(--clay-in);animation:none}
```

Constructor canónico en JS (**úsalo, no escribas chips a mano**):
```js
function chip(on,click,label,extra){
  const dis=capturaBloqueada();
  return `<div class="chip${on?' on':''}" role="button" aria-pressed="${on?'true':'false'}"`+
    (dis?' aria-disabled="true"':` tabindex="0" onclick="${click}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`)+
    `><span class="ck" aria-hidden="true"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg></span>${label}${extra?` <small>${extra}</small>`:''}</div>`;
}
function grupo(titulo,valor,chipsHTML,extraHTML=''){
  const falta=!valor;
  return `<div class="optgrp${falta?' falta':''}">
      <div class="optgrp-h"><span class="optgrp-t">${titulo}</span>${falta?'<span class="optgrp-v falta">Sin elegir</span>':''}</div>
      <div class="chips" role="group" aria-label="${esc(titulo.replace(/<[^>]*>/g,'').trim())}">${chipsHTML}</div>${extraHTML}
    </div>`;
}
```
```html
<div class="optgrp">
  <div class="optgrp-h"><span class="optgrp-t">Material</span></div>
  <div class="chips" role="group" aria-label="Material">
    <div class="chip on" role="button" aria-pressed="true" tabindex="0" onclick="…" onkeydown="…">
      <span class="ck" aria-hidden="true"><svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg></span>Acero Inoxidable <small>$55/cm</small>
    </div>
    <div class="chip" role="button" aria-pressed="false" tabindex="0" onclick="…" onkeydown="…">…</div>
  </div>
</div>
```
```css
.optgrp{margin-bottom:var(--e4)}
.optgrp-h{display:flex;align-items:baseline;gap:var(--e2);flex-wrap:wrap;margin-bottom:var(--e2)}
.optgrp-t{font-size:var(--t2);font-weight:600;color:var(--n6)}
.optgrp-v{font-size:var(--t2);font-weight:600;color:var(--av);display:inline-flex;align-items:center;gap:var(--e1);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.optgrp-v::before{content:'·';font-weight:700}
.optgrp .chips{margin:0}
.optgrp .hintnote{margin-top:8px}
```

### 2.4 `.fld` — campo de formulario

```css
label,.fld-lab{display:block;font-size:var(--t2);font-weight:500;color:var(--n6);margin-bottom:var(--e2)}
input,select,textarea{width:100%;border:1px solid var(--n3);border-radius:var(--rr1);padding:11px 13px;
  font-size:var(--t3);color:var(--n8);background:#fff;outline:none;font-family:inherit;
  transition:border-color .12s,box-shadow .12s}
input::placeholder,textarea::placeholder{color:var(--n6)}
input:focus,select:focus,textarea:focus{border-color:var(--a);box-shadow:0 0 0 3px var(--a-suave)}
input:-webkit-autofill,input:-webkit-autofill:focus{-webkit-text-fill-color:var(--ink);
  -webkit-box-shadow:0 0 0 100px #fff inset;caret-color:var(--ink)}
input:disabled,select:disabled,textarea:disabled{background:var(--n1);border-color:var(--n2);color:var(--n6);cursor:not-allowed}
textarea{resize:vertical;min-height:46px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.fld{margin-bottom:13px}  .fld:last-child{margin-bottom:0}
/* obligatorios */
.fld label .req{color:var(--amber-ico);font-weight:800;margin-left:1px}
.fld.falta label{color:var(--amber)}
.fld.falta input,.fld.falta textarea{border-color:var(--amber-ico);background:var(--amber-bg)}
.fld.falta input:focus,.fld.falta textarea:focus{border-color:var(--brand);background:#fff}
/* capa de estructura: 42 px, un borde de 1 px, y al foco el anillo de 3 px del azul tenue */
input,select,textarea,.inp-money{
  border:1px solid var(--linea);border-radius:var(--rr2);
  background:var(--sup);color:var(--tinta);box-shadow:none;
  transition:box-shadow var(--mv-s),border-color var(--mv-s)}
input:focus,select:focus,textarea:focus{border-color:rgba(255,255,255,.95);
  box-shadow:inset 0 3px 7px rgba(64,96,248,.1),0 0 0 4px rgba(64,96,248,.18),0 8px 20px -4px rgba(64,96,248,.28);
  animation:foco-brote var(--mv-r)}
input:disabled,select:disabled,textarea:disabled{background:var(--n2);box-shadow:inset 0 2px 5px rgba(64,96,248,.09);color:var(--n6)}
/* input monetario con prefijo $ */
.inp-money{position:relative;display:block}
.inp-money::before{content:'$';position:absolute;left:12px;top:50%;transform:translateY(-50%);
  color:var(--muted);font-weight:700;font-size:13px;pointer-events:none;z-index:1}
.inp-money input{padding-left:26px}
.fld-relleno{}   /* columna vacía de relleno en .grid3; se colapsa en móvil */
```

```html
<div class="grid2">
  <div class="fld" id="fld-cli">
    <label for="f-cli">Cliente<span class="req" aria-hidden="true">*</span></label>
    <input id="f-cli" placeholder="Nombre del cliente" autocomplete="off"
           aria-required="true" aria-describedby="hint-oblig" oninput="upd('cliente',this.value)">
  </div>
  <div class="fld"><label for="f-tel">Teléfono<span class="req" aria-hidden="true">*</span></label>
    <input id="f-tel" type="tel" inputmode="tel" placeholder="33 0000 0000" autocomplete="off" aria-required="true"></div>
</div>
<span class="solo-voz" id="hint-oblig">Sin cliente, teléfono y proyecto no se pueden capturar partidas.</span>
<div class="fld"><label for="f-anti">Anticipo sugerido (50%)</label>
  <div class="inp-money"><input id="f-anti" type="number" inputmode="decimal" min="0" placeholder="0"></div></div>
```
`.fld-lab` es el mismo renglón de arriba pero para lo que **no** es un campo (una lista, un segmentado): un `<label>` que no apunta a ningún control se lee como texto suelto, así que va un `<div class="fld-lab" id="…">` y el grupo lo nombra con `aria-labelledby`.

### 2.5 `.seg` y `.tipo-seg` — control segmentado

```css
.seg{display:inline-flex;background:var(--n1);border:1px solid var(--n2);border-radius:var(--rr1);padding:3px;gap:2px}
.seg button{border:none;background:none;padding:7px 14px;font-size:var(--t2);font-weight:500;color:var(--n6);
  border-radius:6px;cursor:pointer;transition:background .12s,color .12s}
.seg button.on{background:#fff;color:var(--n8);font-weight:600;box-shadow:0 1px 2px rgba(18,20,28,.07)}

.tipo-seg{display:inline-flex;background:var(--n1);border:1px solid var(--n2);border-radius:var(--rr1);
  padding:3px;flex-wrap:wrap;gap:2px}
.tipo-seg button{border:none;background:none;padding:6px 11px;font-size:var(--t2);font-weight:500;color:var(--n6);
  border-radius:6px;cursor:pointer;transition:background .12s,color .12s}
.tipo-seg button.on{background:#fff;color:var(--n8);font-weight:600;box-shadow:0 1px 2px rgba(18,20,28,.07)}
.tipo-seg .sm,.ptipo .sm{display:none}          /* nombre corto: solo en teléfono */
.tipo-seg button:is(:disabled,[aria-disabled="true"]){cursor:default}
.tipo-seg button:is(:disabled,[aria-disabled="true"]):active{transform:none}
.tipo-seg button:is(:disabled,[aria-disabled="true"]).on{background:var(--gray-bg);color:var(--ink);box-shadow:none;animation:none}
/* capa de estructura. El elegido va en MARINO, no en azul: el azul significa «esto está
   elegido» y el marino «esta es la vista que estás mirando». Son dos preguntas distintas y en
   la misma pantalla conviven —la lente del calendario contra el material de una partida—. */
.tipo-seg,.seg{border-radius:var(--rr2);padding:0;gap:0;
  background:var(--sup);border:1px solid var(--linea);box-shadow:none;overflow:hidden}
.tipo-seg button,.seg button{border-radius:0;min-height:34px;color:var(--tinta2);font-weight:500;
  transition:background var(--mv-s),color var(--mv-s)}
.tipo-seg button.on,.seg button.on{background:var(--nav);color:#fff;font-weight:600;
  box-shadow:none;animation:none}
.tipo-seg button:active,.seg button:active{transform:none}
```
```html
<div class="seg" id="roleseg" role="group" aria-label="Rol con el que trabajas">
  <button class="on" aria-pressed="true"  data-rol="vendedor"     onclick="setRol('vendedor')">Vendedor</button>
  <button           aria-pressed="false" data-rol="autorizador" onclick="setRol('autorizador')">Autorizador</button>
</div>
<!-- con nombre largo/corto: -->
<div class="tipo-seg" role="group" aria-label="Tipo de la partida 1">
  <button class="on" aria-pressed="true" onclick="setTipo(1,'letras')"><span class="lg">Letras 3D</span><span class="sm">Letras</span></button>
</div>
```
Variante del escalador/vectorizador (sistema viejo, no la uses en módulos nuevos salvo dentro de esos modales): `.tool-seg` / `.tool-seg button.active`.

### 2.6 `.switch` + `.tg` — interruptor
Es un **`<button role="switch">`**, no un `<label>` (sin `for` y sin control dentro no entraba al tabulador ni respondía a Espacio).

```css
.switch{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;
  user-select:none;border:none;background:none;font-family:inherit;text-align:left;padding:0;margin-bottom:5px}
.switch:disabled{cursor:default}
.switch:disabled .tg{background:#b6bdd0;box-shadow:none}
.switch:disabled .tg.on{background:#8a90a6}
.tg{width:42px;height:24px;background:#8a90a6;border-radius:13px;position:relative;transition:.2s;flex-shrink:0}
.tg::before{content:'';position:absolute;inset:-10px -4px;border-radius:16px}  /* zona táctil 50×44 */
.tg.on{background:var(--brand-grd)}
.tg::after{content:'';width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;top:3px;left:3px;
  transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.tg.on::after{left:21px}
/* capa de estructura (gana): 32×18, perilla 14 px, desplazamiento 16 px. Los 46×26 del barro
   pesaban más que el renglón que gobierna, y este vive en la columna del dinero. */
.tg{width:32px;height:18px;border-radius:999px;background:var(--linea);
  box-shadow:none;transition:background .2s}
.tg::after{width:14px;height:14px;top:2px;left:2px;background:#fff;
  box-shadow:0 1px 2px rgba(var(--tinta-rgb),.25);transition:left .2s}
.tg.on{background:var(--a-fill)}   .tg.on::after{left:16px}
.tg.on{background:var(--brand-grd);box-shadow:inset 0 2px 5px rgba(20,22,43,.22),0 4px 12px -2px rgba(48,24,248,.45)}
.tg.on::after{left:23px}
.switch:active .tg::after{transform:scale(.9)}
```
```html
<button type="button" class="switch" role="switch" id="ivabtn" aria-checked="true" onclick="toggleIva(event)">
  <span class="tg on" id="ivatg" aria-hidden="true"></span> IVA 16%
</button>
```

### 2.7 `.toast` — aviso emergente (uno solo en la página, `#toast`)

```css
.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%) translateY(90px);
  background:#11162e;color:#fff;padding:13px 20px;border-radius:13px;font-size:14px;font-weight:600;z-index:100;
  box-shadow:0 8px 40px rgba(0,0,0,.28);display:flex;align-items:center;gap:14px;width:max-content;
  max-width:min(92vw,540px);text-align:left;visibility:hidden;
  transition:transform .3s cubic-bezier(.2,.8,.2,1),visibility 0s linear .3s}
.toast.show{transform:translateX(-50%) translateY(0);visibility:visible;
  transition:transform .3s cubic-bezier(.2,.8,.2,1),visibility 0s linear 0s}
.toast:not(.show){pointer-events:none}
.toast-act{flex-shrink:0;border:1.5px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;
  font-family:inherit;font-size:13px;font-weight:800;padding:7px 15px;border-radius:9px;cursor:pointer;
  transition:background .13s,border-color .13s}
.toast-act:hover{background:rgba(255,255,255,.24);border-color:#fff}
.toast.ok{background:linear-gradient(135deg,#0d8050,var(--green))}
.toast.err{background:linear-gradient(135deg,#bf3730,var(--red))}
@media(max-width:920px){ .toast{bottom:calc(20px + 66px + env(safe-area-inset-bottom,0px))} }
/* capa de estructura */
#toast{border-radius:var(--rr2);box-shadow:var(--sombra-alta)}
#toast.show{animation:toast-sube var(--mv-s)}
@keyframes toast-sube{from{opacity:0;transform:translate(-50%,10px)}}
/* subidas por modal de pantalla completa: */
.scaler-modal-bg.show+.toast{bottom:calc(16px + var(--sc-acc-h,150px))}   /* ≤1000px */
.vt-modal-bg.show~.toast{bottom:calc(26px + var(--vt-acc-h,150px))}       /* ≤1000px */
```
```html
<div class="toast" id="toast"></div>   <!-- el contenido lo escribe toast(); no lo toques a mano -->
```
> **Orden del documento cerrado:** `#toast` va inmediatamente antes de `#mbar` porque el escalador lo sube con un selector de hermano contiguo (`.scaler-modal-bg.show+.toast`). No metas nada entre `#scalermodal`, `#toast` y `#mbar`.

### 2.8 Modales — `.modal-bg` + `.modal`, con `.show`

```css
.modal-bg{position:fixed;inset:0;background:rgba(17,22,46,.6);display:none;align-items:center;justify-content:center;
  z-index:60;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);overscroll-behavior:contain;
  padding:calc(18px + env(safe-area-inset-top,0px)) calc(18px + env(safe-area-inset-right,0px))
          calc(18px + env(safe-area-inset-bottom,0px)) calc(18px + env(safe-area-inset-left,0px))}
.modal-bg.show{display:flex}
.modal{background:#fff;border-radius:20px;max-width:460px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.28);
  overflow:hidden;display:flex;flex-direction:column;
  max-height:calc(100dvh - 36px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))}
.modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;
  border-bottom:1px solid var(--line);background:linear-gradient(90deg,var(--soft),#fff);flex-shrink:0}
.modal-h b{font-size:15px;font-weight:700}
.modal-h button{border:none;background:none;font-size:22px;color:var(--muted);cursor:pointer;line-height:1;
  width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:.12s}
.modal-h button:hover{background:var(--soft);color:var(--ink)}
.modal-b{padding:18px 20px 20px;overflow-y:auto;flex:1 1 auto;min-height:0;-webkit-overflow-scrolling:touch}
/* capa de estructura: la ENTRADA DESDE ABAJO, con la misma `entra` que todo lo demás */
.modal,.rv-modal,.sc-modal,.vt-modal,.hist-panel,.lightbox-body{
  border-radius:var(--rr3);
  border:1px solid var(--linea);
  box-shadow:var(--sombra-alta);
  animation:entra .32s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes modal-entra{from{opacity:0;transform:translateY(18px) scale(.94)} to{opacity:1;transform:none}}
.modal-bg,.rv-modal-bg{backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2)}
.modal-bg.show,.rv-modal-bg.show{animation:vela var(--mv-s)}
@keyframes vela{from{opacity:0}to{opacity:1}}
/* el fondo se queda quieto */
html.modal-abierto,html.modal-abierto body{overflow:hidden}
@media(hover:none),(pointer:coarse){ .modal-h button{width:44px;height:44px} }
```
```html
<div class="modal-bg" id="mimodal" onclick="if(event.target===this)cerrarMio()"
     role="dialog" aria-modal="true" aria-label="Título del modal">
  <div class="modal">
    <div class="modal-h">
      <b><svg class="svgi" aria-hidden="true"><use href="#i-ia"/></svg> Título del modal</b>
      <button onclick="cerrarMio()" aria-label="Cerrar">×</button>
    </div>
    <div class="modal-b">…</div>
  </div>
</div>
```
Modal de pantalla completa (escalador/vectorizador): armazón reutilizable `.sp-topbar` / `.sp-main` / `.sp-canvas-area` / `.sp-side` / `.sp-sec` / `.sp-sec-h` / `.sp-sec-b` / `.sp-actions`, con `.scaler-modal-bg` (z 55) o `.vt-modal-bg` (z 56), `position:fixed;inset:0;height:100dvh` y `.show{display:flex}`. Panel plegable: `<details class="sp-fold"><summary class="sp-sec-h"><h3>…</h3></summary><div class="sp-sec-b">…</div></details>`.

### 2.9 `.folio` — píldora de dato/contador (**no** es un botón)

```css
.folio{font-size:var(--t2);color:var(--n6);font-weight:500;background:var(--n1);padding:6px 12px;
  border-radius:var(--rr1);border:1px solid var(--n2);font-variant-numeric:tabular-nums}
#folio.prov{color:var(--muted);background:var(--soft);border-color:var(--line);border-style:dashed}
/* capa de estructura: 3 px de radio, no píldora. Una ficha con 999 px se lee como un botón,
   y estas no se tocan. */
.ptok,.ptipo{border-radius:var(--rr1);box-shadow:none;border:1px solid var(--linea);
  background:var(--sup2);color:var(--tinta2);font-size:var(--t2);font-weight:600}
.folio,.badge{border-radius:var(--rr1);box-shadow:none;border:1px solid var(--linea);background:var(--sup2)}
.folio{font-family:var(--f-cifra);font-weight:600}
/* Lo elegido, lo que falta y lo apagado a propósito: tres estados, tres colores. */
.ptok.ok,.ptok.on{background:var(--a-suave);border-color:var(--a-borde);color:var(--a-tx)}
.ptok.falta{background:var(--av-bg);border-color:var(--av-borde);color:var(--av)}
```
```html
<span class="folio" id="folio">COT-0001</span>
<span class="folio" id="pcount">3 partidas · 1 oculta del PDF</span>
```

### 2.10 `.hintnote` — nota de ayuda en línea

```css
.hintnote{font-size:var(--t2);color:var(--n6);background:var(--n1);border-radius:var(--rr1);padding:8px 12px;
  display:inline-block;line-height:1.5}
.hintnote.nota-av{background:var(--av-bg);border:1px solid var(--av-borde);color:var(--av)}
.hintnote.nota-ok{background:var(--ok-bg);border:1px solid var(--ok-borde);color:var(--ok)}
/* capa de estructura: una acotación al margen, con su filete a la izquierda */
.hintnote{border-radius:0 var(--rr2) var(--rr2) 0;box-shadow:none;border:1px solid var(--linea);
  border-left:3px solid var(--n5);background:var(--sup2)}
.hintnote.nota-av{background:var(--av-bg);border-color:var(--av-borde);border-left-color:var(--av)}
.hintnote.nota-ok{background:var(--ok-bg);border-color:var(--ok-borde);border-left-color:var(--ok)}
```
```html
<div class="hintnote">Se imprime en la cotización. Vacía, sale la de arriba.</div>
<div class="hintnote nota-av">El acrílico sin luz sale más caro que el aluminio.</div>
```
Avisos grandes que **piden acción** (mismo ámbar, con latido): `.cand-partidas` (botón) y `.edit-mode-banner` (div).
```css
.cand-partidas,.edit-mode-banner{border-radius:var(--rr2);border:1px solid rgba(255,255,255,.75);
  background:linear-gradient(168deg,#fffaf0,var(--av-bg));
  box-shadow:inset 0 3px 6px rgba(255,255,255,.9),inset 0 -4px 9px rgba(200,140,20,.13),0 10px 22px -6px rgba(200,140,20,.22)}
.cand-partidas{animation:latido 2.6s ease-in-out infinite}
.cand-partidas[hidden]{display:none}
```
```html
<button type="button" class="cand-partidas" id="cand-x" onclick="irAlCandado()" hidden>
  <svg class="svgi" aria-hidden="true"><use href="#i-candado"/></svg>
  <span class="cp-txt" aria-live="polite" aria-atomic="true"></span>
  <span class="cp-go" aria-hidden="true">›</span>
</button>
```

### 2.11 `.prog-*` — barra de completitud (**es un botón que lleva a lo que falta**)

```css
.prog-box{display:block;width:100%;padding:10px 20px 13px;border:none;border-bottom:1px solid var(--line);
  background:none;font-family:inherit;text-align:left;cursor:pointer;transition:background .14s}
.prog-box:hover{background:var(--soft)}
.prog-box:disabled{cursor:default;background:none}
.prog-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.prog-label span:first-child{font-size:var(--t2);font-weight:500;color:var(--n6)}
#prog-pct{font-size:12.5px;font-weight:900;color:var(--brand)}
.prog-track{height:7px;background:var(--line);border-radius:10px;overflow:hidden}
#prog-bar{height:100%;background:linear-gradient(90deg,#f59e0b,#fb923c);border-radius:10px;
  transition:width .5s cubic-bezier(.22,1,.36,1),background .5s;width:0%}
.prog-next{font-size:11px;color:var(--brand);font-weight:700;margin-top:6px;display:flex;align-items:center;gap:5px}
.prog-next:empty{display:none}
/* capa de estructura: brillo que recorre */
.prog-track{border-radius:999px;box-shadow:var(--clay-in);background:var(--n2)}
#prog-bar{border-radius:999px;box-shadow:0 2px 8px -2px rgba(64,96,248,.5);position:relative;overflow:hidden;
  transition:width var(--mv)}
#prog-bar::after{content:'';position:absolute;inset:0;border-radius:999px;
  background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.6) 50%,transparent 80%);
  animation:brillo 2.4s ease-in-out infinite}
```
```html
<button class="prog-box" onclick="irAPendiente()" title="Ir a lo primero que falta por capturar">
  <div class="prog-label"><span>Completitud</span><span id="prog-pct">0%</span></div>
  <div class="prog-track"><div id="prog-bar"></div></div>
  <div class="prog-next" id="prog-next"></div>
</button>
```
Los tres tramos de color los pone `updProg()`: `<40%` ámbar `linear-gradient(90deg,#f59e0b,#fb923c)`, `<80%` marca `#3a4ad8→#7b9bf7`, `≥80%` verde `#15a06a→#22c55e`.

### 2.12 `.badge` — estado

```css
.badge{display:inline-flex;align-items:center;gap:var(--e2);font-size:var(--t1);font-weight:500;padding:4px 10px;border-radius:var(--rr1)}
.badge .dot{width:7px;height:7px;border-radius:50%}
.badge.borrador  {background:var(--gray-bg);color:var(--gray)}    .badge.borrador  .dot{background:var(--gray)}
.badge.pendiente {background:var(--amber-bg);color:var(--amber)}  .badge.pendiente .dot{background:var(--amber)}
.badge.autorizada{background:var(--green-bg);color:var(--green)}  .badge.autorizada .dot{background:var(--green)}
.badge.rechazada {background:var(--red-bg);color:var(--red)}      .badge.rechazada .dot{background:var(--red)}
```
```html
<span class="badge autorizada"><span class="dot"></span>Autorizada</span>
```

### 2.13 Fichas de dato — `.ptok` (con su `.psum` contenedora)
Son **datos, no selecciones**: neutros, con `✓` que dice que están puestos. El color se reserva para lo que falta (`.falta`, ámbar) y lo apagado a propósito (`.off`).

```css
.psum{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;align-items:center}
.pdsc{flex:1 1 100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-size:13px;font-weight:700;color:var(--ink);line-height:1.35}
.pdsc.vacia{font-weight:600;font-style:italic;color:var(--muted)}
.ptok{display:inline-flex;align-items:center;gap:var(--e1);font-size:var(--t2);font-weight:500;padding:4px 10px;
  border-radius:var(--rr1);background:var(--n1);color:var(--n7);border:1px solid var(--n2);
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptok::before{content:'✓';font-size:10px;font-weight:400;color:var(--n5)}
.ptok.falta{background:var(--av-bg);color:var(--av);border-color:var(--av-borde)}
.ptok.falta::before{content:'!';font-weight:700;color:var(--av)}
.ptok.off{background:transparent;color:var(--n6);border-color:var(--n2)}
.ptok.off::before{content:'—';font-weight:500;color:var(--n5)}
/* capa de estructura */
.ptok{background:linear-gradient(168deg,#fff,var(--n1))}
.ptok.falta{background:linear-gradient(168deg,#fff8ec,var(--av-bg))}
```
```html
<div class="psum" id="psum-3" onclick="abrirDesdeResumen(3,event)">
  <span class="pdsc">Farmacia San Juan — letras fachada</span>
  <span class="ptok falta">Faltan 2 datos</span>
  <span class="ptok ">Acero Inoxidable</span>
  <span class="ptok dinero">$1,250.00</span>   <!-- .dinero = se difumina en borrador -->
  <span class="ptok off">Sin iluminación</span>
</div>
```

### 2.14 Primitivas de lista
Tres patrones, elige por semántica:

**a) Lista de renglones seleccionables (`.queue-list` / `.queue-item`)** — un contenedor con borde y renglones divididos por línea:
```css
.queue-list{border:1.5px solid var(--line);border-radius:var(--r-sm);overflow:hidden;margin-bottom:11px}
.queue-empty{font-size:12.5px;color:var(--muted);text-align:center;padding:16px 10px;background:var(--soft)}
.queue-item{display:flex;align-items:center;gap:9px;padding:10px 13px;cursor:pointer;
  border-bottom:1px solid var(--line);transition:.12s;background:#fff}
.queue-item:last-child{border-bottom:none}
.queue-item:hover:not(.active){background:var(--soft)}
.queue-item.active{background:var(--soft-2);border-left:3px solid var(--brand);padding-left:10px}
.qi-dot{width:8px;height:8px;border-radius:50%;border:2px solid var(--brand);flex-shrink:0;margin-top:2px}
.queue-item.active .qi-dot{background:var(--brand)}
.qi-body{flex:1;min-width:0}
.qi-folio{font-size:10px;font-weight:800;color:var(--brand);letter-spacing:.4px;text-transform:uppercase}
.qi-name{font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qi-fecha{font-size:10.5px;color:var(--muted)}
.qi-total{font-size:12px;font-weight:800;color:var(--ink);white-space:nowrap}
```
```html
<!-- Un div con onclick NO es alcanzable con teclado. Usa la constante _ABRIBLE. -->
<div class="queue-list">
  <div class="queue-item active" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"
       aria-current="true" aria-label="Revisar COT-0007, Farmacia San Juan" onclick="loadQueueEntry('COT-0007')">
    <span class="qi-dot"></span>
    <div class="qi-body">
      <div class="qi-folio">COT-0007</div>
      <div class="qi-name">Farmacia San Juan</div>
      <div class="qi-fecha">21 ago 2026</div>
    </div>
    <div style="text-align:right"><div class="qi-total">$12,480.00</div></div>
  </div>
</div>
```

**b) Lista de tarjetitas sueltas (`.falt-list` / `.falt-row`)** — separadas por hueco, cada una con acción propia:
```css
.falt-list{display:flex;flex-direction:column;gap:8px;margin-bottom:15px}
.falt-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1.5px solid rgba(207,138,18,.45);
  background:var(--amber-bg);border-radius:var(--r-sm);width:100%;text-align:left;font-family:inherit;transition:.14s}
.falt-ir{flex:1;min-width:0;display:flex;align-items:center;gap:11px;border:none;background:none;
  font-family:inherit;text-align:left;cursor:pointer;padding:0}
.falt-n{width:26px;height:26px;border-radius:8px;background:var(--amber);color:#fff;font-size:12px;font-weight:800;
  display:flex;align-items:center;justify-content:center;flex-shrink:0}
.falt-b{flex:1;min-width:0}
.falt-t{display:block;font-size:12.5px;font-weight:800;color:var(--ink);line-height:1.35}
.falt-d{display:block;font-size:11.5px;color:#7a5800;line-height:1.45;margin-top:2px}
.falt-go{font-size:14px;color:var(--amber);flex-shrink:0;font-weight:800}
.falt-quitar{border:1.5px solid rgba(216,69,63,.3);background:#fff;color:var(--red);font-family:inherit;
  font-size:11px;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;flex-shrink:0;transition:.14s}
```

**c) Vacío de una lista (`.empty`)**:
```css
.empty{text-align:center;color:var(--muted);font-size:13px;padding:30px 10px;border:1.5px dashed var(--line);
  border-radius:var(--r-sm);background:var(--soft)}
```

**d) Lista de campos apilados (`.key-list`)**: `display:flex;flex-direction:column;gap:6px` + `.key-list:not(:empty){margin-bottom:7px}`.

### 2.15 Tablas — `.htable`
Única tabla del proyecto. Tres columnas: número (28 px, centrado, azul), descripción, importe (derecha, tabular). Sin `<th>`: es un desglose, no un cuadro de datos.
```css
.htable{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}
.htable td{padding:5px 7px;border-bottom:1px solid var(--line);color:#4b5269;vertical-align:top}
.htable td:first-child{width:28px;font-weight:800;color:var(--brand);text-align:center}
.htable td:last-child{text-align:right;font-weight:700;color:var(--ink);white-space:nowrap}
.htable tr:last-child td{border-bottom:none}
.hentry-total{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;
  padding:9px 7px 0;border-top:1.5px solid var(--line);color:var(--ink)}
```
```html
<table class="htable">
  <tr><td>1</td><td>Letras 3D · Acero · 25 cm</td><td>$8,250.00</td></tr>
</table>
<div class="hentry-total"><span>Total autorizado</span><span style="color:var(--green)">$12,480.00</span></div>
```
**Regla de ancho:** cualquier tabla, diagrama o bloque de código ancho vive dentro de su propio contenedor con `overflow-x:auto`. El `body` no se desplaza a lo ancho nunca (de ahí `.wrap>main,.wrap>aside{min-width:0}` y todos los `min-width:0` en los flex).

### 2.16 Resumen numérico — `.sum` / `.srow` / `.neto`
```css
.sum{background:var(--card);border:1px solid var(--n3);border-radius:var(--rr3);overflow:hidden}
.side{position:sticky;top:calc(3px + 78px)}
.sum-rows{padding:var(--e4) var(--e5) var(--e2)}
.srow{display:flex;justify-content:space-between;align-items:center;gap:var(--e3);font-size:var(--t3);
  color:var(--n6);padding:var(--e2) 0}
.srow.ivt{border-top:1px solid var(--n2);margin-top:var(--e1)}
.srow .v{font-weight:500;color:var(--n8);font-variant-numeric:tabular-nums}
.srow.subtotal{font-size:var(--t3);font-weight:500;color:var(--n7);padding:var(--e2) 0}
.srow.subtotal .v{font-size:var(--t4);font-weight:600;color:var(--n8)}
.neto{padding:var(--e4) var(--e5) var(--e5);border-top:1px solid var(--n2);display:flex;
  justify-content:space-between;align-items:flex-end;gap:var(--e3)}
.neto .lab{font-size:var(--t2);font-weight:500;color:var(--n6)}
.neto .amt{font-size:var(--t7);font-weight:650;letter-spacing:-1px;color:var(--n9);
  font-variant-numeric:tabular-nums;line-height:1}
/* capa de estructura: el número más grande de la app, y el único que late cuando cambia */
.neto .amt{background:linear-gradient(160deg,var(--a-claro),var(--a) 45%,var(--a-fuerte));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 3px 8px rgba(64,96,248,.28))}
.neto .amt.cambio{animation:total-late var(--mv)}
```
**Todo importe lleva `font-variant-numeric:tabular-nums`.** Sin excepción.

---

## 3. Breakpoints exactos y qué cambia en cada uno

| Consulta | Qué cambia |
|---|---|
| `@media print` (5 bloques, el último manda) | Sin pantallas ni barras: `.pasos,.p1-cierre{display:none}`, `.wrap{grid-template-columns:1fr}`, `#card-proy,#card-partidas,#sidebox{display:block}`, `.mbar{display:none}`, `.topbar{position:static}`, `.wrap{padding-bottom:0}`, se revierte el difuminado de precios (`body.precios-ocultos *{filter:none}`), se despliega todo lo plegado (`.card.folded .card-b{display:block}`, `.partida.folded .pbody{display:block}`, `.pfold{display:none}`), `.cand-partidas{display:none}`, y **fuera el relieve y lo pegajoso**: `*{box-shadow:none;animation:none;text-shadow:none}`, `body{background:#fff}`, `.card,.sum,.partida{background:#fff;border:1px solid #ddd}`, `.pcab{position:static}` —un `sticky` en una hoja no se queda arriba pero sí se sale del flujo—, y lo que lleva relleno de color pasa a borde (`.partida .chip.on`, `.paso-tab.on`, `.partida .tg.on`), porque media oficina imprime en blanco y negro. `@page{margin:0;size:letter portrait}` en el PDF generado. |
| `max-width:1000px` | **Solo escalador y vectorizador** (su barra necesita 982 px en un renglón; la pantalla interna del Fold 6 son 832 px). `.sp-topbar` envuelve con `order` 1..5, se esconde el logotipo, `.sp-main{flex-direction:column}`, `.sp-side{width:100%;max-height:54%}`, `.sp-actions` pegado al pie con `env(safe-area-inset-bottom)`, `.sp-close` pasa de × a botón «← Cotizador», `.vt-modal-bg .sp-side{width:100%}`, controles a ≥44/46 px, `input[type=range]{max-width:400px}`. |
| `max-width:1000px` **y** `max-height:820px` **y** `orientation:landscape` | Teléfono acostado: `.sp-main{flex-direction:row}`, `.sp-side{width:46%;max-width:340px;height:100%}`, el toast vuelve a `bottom:16px`, `.sp-hint-bar` recupera la franja de gestos. |
| `max-width:920px` | **Retoques de dedo**, que se quedan en 920 a propósito: campos, alturas mínimas y zonas táctiles no dependen de si hay una o dos columnas. **campos a 16 px** para que iOS no haga zoom (`input,select,textarea,.rv-field input,.rv-field select,.autoctr input{font-size:16px}` — repetido al final de la hoja para ganar por orden); `.btn,.addbtn,.ai-btn{min-height:46px}`; `.chip{padding:9px 14px;font-size:13px}`; `.seg button{padding:9px 14px}`; `.del,.dup,.pdf-vis` a 40×40; `.optgrp .chip{flex:1 1 auto;min-height:44px}`; `.fld-relleno{display:none}`; `.card-fold{display:inline-flex}` + reglas de `.card.folded`; `.drag-handle{display:none}` (el arrastre HTML no existe al tocar). |
| `max-width:759px` | **El corte real de «una columna»**, y desde el rediseño ya NO incluye al Fold 6 abierto (880 px), que conserva sus dos columnas. `.wrap{grid-template-columns:minmax(0,1fr)}`; aparece `.mbar` fija abajo; `.wrap{padding-bottom:calc(84px + env(safe-area-inset-bottom))}` y `html{scroll-padding-bottom:` igual `}`; `.p1-cierre{display:none}` (la acción se muda a la barra fija); `.toast{bottom:calc(20px + 66px + safe-area)}`. En la PLATAFORMA: se apaga la barra lateral y aparecen el encabezado marino y `.pf-abajo` con cinco módulos; Proyectos cambia de tablero de columnas a lista de tarjetas; el mapa apila mapa y ruta. |
| `min-width:760px` | **Hay barra lateral.** `:root{--lat:168px}` y `.pf-wrap,.pf-cab{padding-left:calc(var(--lat) + var(--e4))}`; el encabezado pasa a blanco de 64 px con subtítulo y acciones; `#pj-filtros{display:none}` (las columnas del tablero SON el filtro). |
| `min-width:1024px` | La barra lateral crece a `--lat:216px` y el logotipo a 30 px. |
| `screen and (min-width:760px) and (max-width:920px)` | **Fold 6 abierto (880 px)**: `.wrap{grid-template-columns:minmax(0,1fr) 272px}` — con 320 px la rejilla de materiales pasa de tres opciones por fila a dos. |
| `screen and (min-width:561px) and (max-width:759px)` | **Tableta angosta / Fold cerrado en horizontal**: `.wrap>aside{width:100%;max-width:320px;margin-left:auto}`; nombre corto del tipo (`.tipo-seg .lg{display:none};.tipo-seg .sm{display:inline}`); `.grid3:not(:has(>.fld:nth-child(3):not(.fld-relleno))){grid-template-columns:1fr 1fr}`; `.partida{padding:16px;margin-bottom:12px}`; `.optgrp .chip{flex:0 1 auto;max-width:100%;font-size:11.5px}`; `.tipo-seg button{font-size:11.5px}`; `.hintnote{font-size:11px}`. |
| `max-width:760px` | `.tipo-seg` pasa a rejilla de 3 columnas (`grid-template-columns:repeat(3,1fr)`, `min-height:42px`). |
| `min-width:400px` and `max-width:760px` | La fila de tres accesos NO envuelve: `.scaler-ai-row{flex-wrap:nowrap}`, `.ai-btn{flex:1 1 auto;width:auto}`. |
| `max-width:560px` | **Teléfono propiamente.** Recorta el marco, nunca lo tocable: `.wrap{padding:12px 10px calc(84px+safe-area);gap:14px}`; `.card-h{padding:13px 13px 0}`, `.card-b{padding:11px 13px 15px}`, `.card+.card{margin-top:12px}`; `.partida{padding:11px 11px 12px;margin-bottom:10px}` (re-declarado en el bloque de cierre para ganarle a la capa de estructura); `.grid2,.grid3{grid-template-columns:1fr 1fr;gap:9px}`; `.tipo-seg{grid-template-columns:repeat(5,1fr)}` con nombre corto; `.optgrp .chip{flex:1 1 calc(50% - 3px);min-height:42px}` (dos columnas); `.neto .amt{font-size:24px}`; **topbar en dos renglones** (ver 3.1); `.brand .t small{display:none}`; `.logoslot .up{display:none}`. |
| `min-width:385px` and `max-width:560px` | `.grid3:has(>.fld:nth-child(3):not(.fld-relleno)){grid-template-columns:repeat(3,1fr);gap:7px}` — tres columnas solo si hay tercer campo real. |
| `max-width:385px` | Portada del Fold: `.topbar-in .btn-hist .lbl{display:none}` y el botón a 42 px cuadrado; `.sp-topbar .brand{flex:1 1 0;min-width:0}`; `#fld-cli,#fld-tel{grid-column:1/-1}`. |
| `max-width:340px` | `.mbar-btn{white-space:normal;line-height:1.15;padding:0 12px;text-align:center}`. |
| `max-width:399px` | Los tres accesos envuelven: `.scaler-ai-row{flex-wrap:wrap}`, `.ai-btn{flex:1 1 100%}`. |
| `@media(hover:none),(pointer:coarse)` | **Por tipo de puntero, no por ancho** — vale igual en iPhone y en las dos pantallas del Fold. Sube la **caja**, nunca la letra: `.modal-h button{44×44}`; `.toast-act,.falt-quitar,.key-btn,.sp-gclear,.hist-foot button,.card-fold,.btn-maps,.chip,.seg button,.tipo-seg button{min-height:44px}`; `.hentry-del,.sp-ibtn{44×44}`; `.del,.dup,.pdf-vis{40×40}`; `.optgrp .chip{min-height:44px}`; `.hist-close{44×44}`; `.autoctr input{min-height:44px}`; `.pfold{44×44}`; `.vt-sw{32×32}`; `.vt-split::after{48×48}`. |
| `@media(prefers-reduced-motion:reduce)` (3 bloques) | `*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}`; `#prog-bar::after,.cand-partidas{animation:none!important}`; `.btn:hover,.chip:hover,.paso-tab:hover,.ai-btn:hover{transform:none!important}`; `.chip:active,…,.mbar-btn:active{transform:none}`. Y la **transición de elemento compartido** no se acorta: se apaga entera en su propio código (`_medirTotal()` en `js/cotizador/proceso.js` no mide, así que no hay vuelo). |

**Sin zoom por doble toque ni destello gris** (base): `button,.chip,.tg,.switch,.ptok,.psum,.tipo-seg button,.seg button,summary{touch-action:manipulation;-webkit-tap-highlight-color:transparent}`.

### 3.1 Teléfono: la barra fija de arriba (`.topbar` / `.topbar-in`) y la de abajo (`.mbar`)

**Arriba.** `≤560px` la topbar se parte en dos renglones: arriba la marca, abajo folio + rol + historial. `.rolewrap{display:contents}` disuelve el contenedor para que los tres controles se acomoden como hermanos, y `order` los ordena. **Solo el segundo renglón se queda pegado**: `ajustarTopbarMovil()` le pone a `.topbar` un `top` negativo del alto exacto de la marca, así el logotipo se va con el scroll y la barra fija baja de 115 px a ~50 px.

```css
.topbar{background:rgba(255,255,255,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid var(--n2);position:sticky;top:3px;z-index:30}
.topbar-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;
  gap:14px;flex-wrap:wrap;
  padding:max(12px,env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) 12px max(24px,env(safe-area-inset-left,0px))}
@media(max-width:560px){
  .topbar-in{padding:max(8px,env(safe-area-inset-top,0px)) 12px 8px;gap:8px;row-gap:7px}
  .rolewrap{display:contents}
  .topbar-in .brand{order:1;flex:1 1 100%;min-width:0;gap:8px}
  .topbar-in .folio{order:2;flex:0 0 auto;padding:5px 9px;font-size:11.5px;white-space:nowrap}
  .topbar-in .seg{order:3;flex:1 1 150px;width:auto}
  .topbar-in .seg button{flex:1;padding:0 10px;min-height:40px;font-size:12.5px}
  .topbar-in .btn-hist{order:4;flex:0 0 auto;padding:0 12px;min-height:40px}
}
@media(max-width:385px){ .topbar-in .btn-hist .lbl{display:none}
  .topbar-in .btn-hist{padding:0;width:42px;font-size:16px;display:inline-flex;align-items:center;justify-content:center} }
/* capa de estructura */
.topbar{background:rgba(255,255,255,.72);backdrop-filter:blur(20px) saturate(1.5);
  border-bottom:1px solid rgba(255,255,255,.9);
  box-shadow:0 1px 0 rgba(255,255,255,.7),0 8px 24px -12px rgba(64,96,248,.2)}
```
```js
function altoTopbarFija(){
  const tb=document.querySelector('.topbar');
  if(!tb) return 0;
  const top=parseFloat(getComputedStyle(tb).top)||0;
  return Math.max(0,tb.offsetHeight+top);
}
function ajustarTopbarMovil(){
  const tb=document.querySelector('.topbar'), marca=$('brandLogo');
  if(!tb||!marca) return;
  if(!window.matchMedia('(max-width:560px)').matches){ tb.style.top=''; document.documentElement.style.setProperty('--top-fijo',altoTopbarFija()+'px'); return; }
  const fila=tb.querySelector('.topbar-in');
  const hueco=parseFloat(getComputedStyle(fila).rowGap)||0;
  tb.style.top=(3-Math.round(marca.offsetHeight+hueco))+'px';
  document.documentElement.style.setProperty('--top-fijo',altoTopbarFija()+'px');
}
window.addEventListener('resize',ajustarTopbarMovil);
window.addEventListener('orientationchange',()=>setTimeout(ajustarTopbarMovil,180));
document.fonts.ready.then(()=>ajustarTopbarMovil());   // Inter llega después del primer trazado
```

**Abajo — `.mbar`, la barra de acción móvil.** Solo `≤920px`. Total a la izquierda (botón que lleva al resumen) + acción principal a la derecha. Se repinta entera desde JS con `renderMobileBar()`.

```css
.mbar{display:none}
@media(max-width:920px){
  .mbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:45;gap:10px;align-items:center;
    background:rgba(255,255,255,.97);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    border-top:1px solid var(--line);box-shadow:0 -3px 18px rgba(23,29,74,.11);
    padding:9px 14px;padding-bottom:calc(9px + env(safe-area-inset-bottom,0px));
    padding-left:max(14px,env(safe-area-inset-left,0px));
    padding-right:max(14px,env(safe-area-inset-right,0px))}
}
.mbar-tot{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:1px;
  border:none;background:none;padding:2px 0;font-family:inherit;cursor:pointer;text-align:left}
.mbar-lab{font-size:var(--t1);font-weight:500;color:var(--n6);display:flex;align-items:center;gap:var(--e1)}
.mbar-lab .chev{font-size:9px;opacity:.7}
.mbar-amt{font-size:var(--t5);font-weight:650;color:var(--n9);letter-spacing:-.5px;
  font-variant-numeric:tabular-nums;line-height:1.15}
.mbar-amt.desc{color:var(--green)}
.mbar-btn{flex:0 0 auto;max-width:62%;border:1px solid transparent;border-radius:var(--rr1);
  background:var(--a);color:#fff;font-family:inherit;font-size:var(--t3);font-weight:550;padding:0 18px;
  min-height:46px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mbar-btn:active{transform:scale(.98)}
.mbar-btn:only-child{max-width:100%}
.mbar-btn:disabled{opacity:.42;box-shadow:none;cursor:not-allowed}
.mbar-btn.ok{background:var(--ok)}
.mbar-btn.gho{background:#fff;color:var(--n7);border-color:var(--n3)}
/* capa de estructura */
.mbar{background:rgba(255,255,255,.8);backdrop-filter:blur(22px) saturate(1.5);
  border-top:1px solid rgba(255,255,255,.9);box-shadow:0 -10px 30px -10px rgba(64,96,248,.28)}
```
```html
<div class="mbar" id="mbar" role="region" aria-label="Total y acción principal"></div>
```
```js
// contenido, tal como lo arma renderMobileBar():
bar.innerHTML=`<button class="mbar-tot" onclick="irAResumen()" title="Ir al resumen">
    <span class="mbar-lab">${lab}<span class="chev">▾</span></span>
    <span class="mbar-amt${hayAjuste&&aj>0?' desc':''}">${money(pf)}</span>
  </button>${btn}`;
```
Reserva de hueco obligatoria si tu módulo tiene barra fija propia: `.wrap{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}` **y** `html{scroll-padding-bottom:` lo mismo `}` — sin lo segundo, 13 de 58 paradas del recorrido con Tab quedan debajo de la barra.

### 3.2 El esqueleto de la plataforma: barra lateral, encabezado y barra de abajo

Vive en `css/plataforma.css` y lo pinta `js/app.js` desde la lista `RUTAS`, que es la única: de ahí salen la barra lateral, la barra de abajo y el router. **Añadir un módulo es añadir un renglón.**

| Ancho | Forma |
|---|---|
| ≥ 1024 px | Barra lateral `--lat:216px` · encabezado blanco de 64 px con título, subtítulo y acciones |
| 760–1023 px | Barra lateral `--lat:168px` (el Fold abierto mide 880) · el mismo encabezado |
| ≤ 759 px | Sin barra lateral · encabezado **marino** con logotipo, título y tema · `.pf-abajo` con **cinco** módulos |

```html
<aside class="pf-lat" id="pf-lat">
  <div class="pf-lat-marca"><img src="logo-al3d-oscuro.svg" alt="AL3D"><span class="pf-lat-t">Taller</span></div>
  <nav class="pf-nav" id="pf-nav" aria-label="Módulos de la plataforma"></nav>   <!-- lo pinta pintarNav() -->
  <div class="pf-lat-pie">…tema · ajustes · rol del dispositivo…</div>
</aside>
<header class="pf-cab">
  <img class="pf-cab-logo" src="logo-al3d-oscuro.svg" alt="AL3D">   <!-- solo en el teléfono -->
  <h1 class="pf-cab-t" id="pf-sub">Tablero</h1>
  <span class="pf-cab-d" id="pf-cab-sub"></span>                    <!-- solo de 760 px para arriba -->
  <div class="pf-cab-acc" id="pf-cab-acc"></div>                    <!-- lo escribe el módulo: ctx.acciones(html) -->
  <button class="pf-cab-tema btn-tema" data-tema-btn>…</button>
</header>
…
<nav class="pf-abajo" id="pf-abajo" aria-label="Módulos"></nav>      <!-- lo pinta pintarNav() -->
```

**Tres decisiones que no son de gusto:**

1. **La barra lateral es `position:fixed`, no un contenedor con `overflow:auto`.** La maqueta la hace con scroll propio; hacerlo así aquí se lleva por delante el guardado y la reposición del scroll por ruta que hace el router, los `position:sticky` (la columna del dinero, el resumen de cada partida) y la impresión, porque un contenedor con scroll sale recortado al alto de la ventana. Fija, con el hueco hecho por `padding-left`, se ve igual y no cuesta nada de eso.
2. **El logotipo de la barra lateral y el del encabezado del teléfono NO llevan `.logoimg`.** Esa clase es justo la que `js/tema.js` intercambia por el de tinta cuando el tema es claro, y las dos superficies son marinas en los dos temas: con ella puesta, el «AL3D» negro desaparecía sobre el marino.
3. **La barra de abajo lleva cinco módulos, no seis.** Material se queda fuera: con seis, cada botón mide 60 px en una pantalla de 360 y el nombre no cabe debajo del icono. Se llega a Material desde el Tablero, que es de donde se sale a comprar. Lo decide `movil:true` en `RUTAS`.

El módulo elegido lleva `--nav2` con un **filete de 3 px del acento a la izquierda** (`box-shadow:inset 3px 0 0 var(--a)`), no un relleno azul: el azul sólido significa «esta es LA acción» en toda la app, y seis lugares no pueden ser todos la acción. En la barra de abajo, el icono va dentro de una píldora de 44×26 que se enciende con `--a-fill` — un icono de 19 px cambiando solo de color no se ve encendido de un vistazo en una pantalla al sol.

### 3.3 La transición de elemento compartido

El total vive en dos sitios: **chiquito** en la barra de pasos mientras se captura al cliente (`.paso-total`) y **grande** en la columna del dinero mientras se capturan las partidas (`.neto .amt`). Los dos llevan `data-shared="total"`, y al cambiar de paso el número **vuela** de uno al otro en vez de desaparecer aquí y aparecer allá.

Es un FLIP y vive en `js/cotizador/proceso.js` (`_medirTotal()` / `_volarTotal()`), llamado desde `irAPaso()`:

```js
_medirTotal();                 // 1. el rect del que se va, ANTES de cambiar de pantalla
const d=_llevarAlPaso(n);      // 2. cambia la pantalla; el navegador coloca al que llega
_volarTotal();                 // 3. transformación inversa sin transición, y 4. quitarla con transición
```

Tres detalles que cuestan si faltan:
- **La escala sale del ALTO, no del ancho.** Son la misma cifra con distinto tamaño de letra, y el ancho de `$1,234.00` a 15 px y a 28 px no guarda la misma proporción por culpa del interletraje: con el ancho, el número llega estirado.
- **Dos `requestAnimationFrame` anidados**, no uno: con uno solo, Chrome agrupa la escritura sin transición y la que sí la lleva en el mismo recálculo de estilo y no anima nada.
- **Se limpia el `transform` al terminar** (`transitionend`): un `transform` vacío pero declarado deja al elemento con su propio contexto de apilamiento, y el resumen fijo de una partida le pasaba por encima.

`prefers-reduced-motion` lo apaga **entero** —`_medirTotal()` no mide, así que no hay vuelo—, y no dejándolo en 1 ms: aquí no hay nada que apagar a medias.

---

## 4. Reglas duras de accesibilidad y contraste

### 4.1 La regla del acento — verbatim, líneas 59–64
```
/* MEDIDO, y es el detalle que hunde a la mitad de los diseños de este estilo: con blanco
   encima, --a-claro (#6090f8) da 3,07:1 y --a3 (#18b6d8) da 2,41:1. Los dos son bonitos y
   los dos son ilegibles. Así que el azul claro y el aguamarina son DECORACIÓN —sombras,
   el lienzo, un borde, un trazo— y nunca fondo de texto. Lo que sí aguanta blanco encima
   empieza en --a: 4,95:1; --a-fuerte da 8,04:1 y --a2, 5,37:1. */
```

### 4.2 La regla de la rampa de neutros — verbatim, README.md línea 73
```
Todo se midió: nada de lo que lleva texto baja de **4,5:1**, y quedó escrita la regla que
se rompió en el primer intento —de `--n5` para arriba, ningún tono de la rampa lleva texto—.
```
Es decir: **`--n5` (#8b90c0), `--n4`, `--n3`, `--n2`, `--n1`, `--n0` no llevan texto encima.** Tinta de texto: `--n6` (secundaria), `--n7`, `--n8` (`--ink`), `--n9` (números grandes). `--n5` solo aparece en `.ptok::before` (el ✓ y el —, glifos decorativos) y como `border-color` de `.addbtn:hover`.

Y el corolario, de la misma sección del README:
```
Con degradados por todos lados, leer `backgroundColor` dejó de servir: devuelve transparente.
Así que la prueba de contraste ahora **rasteriza cada pieza y mide sus píxeles** —agrupa
colores, toma el más frecuente como fondo y el que más se le aleja como texto—.
```

### 4.3 Nunca apagar con `opacity` — verbatim, líneas 1288–1298
```
/* NO se apaga con `opacity`, que fue el primer intento: un .62 sobre la partida entera se
   lleva por delante el texto, y el valor de la descripción bajaba de 16,9:1 a 2,6:1 y las
   fichas ámbar a 2,7:1 —exactamente el problema que este archivo ya había arreglado una
   vez subiendo los tonos de estado—. Congelar una partida no puede volverla ilegible: leer
   es justo lo único que se puede hacer con ella. Así que lo que cambia es el marco —fondo
   de reposo y filete gris en vez del azul de marca—, y el estado real lo llevan los
   controles: los campos con su gris de deshabilitado de siempre y los chips con la regla
   de aquí abajo. El texto se queda en su contraste completo. */
```
Lo mismo para el chip apagado: *«El apagado se hace con color y no con opacidad: el chip dice QUÉ material se eligió, y eso hay que poder leerlo.»* Y para lo oculto del PDF: *«no se atenúa con opacidad —eso hundía su texto a 2:1 y la partida sigue siendo legible por derecho— sino que se marca en el margen y lo dice con palabras.»*
`opacity` sí se permite en un **control** entero deshabilitado (`.btn:disabled{opacity:.45}` / `.55`), nunca sobre un bloque que contiene texto que hay que leer.

### 4.4 Aro de foco
```css
/* Sin border-radius: el contorno sigue por sí solo el radio real del elemento */
:where(button,summary,a[href],input,select,textarea,[tabindex]):focus-visible{
  outline:2px solid var(--a);outline-offset:2px;       /* capa de estructura, la que gana */
}
```
Nunca dejes un `outline:none` sin sustituto visible.

### 4.5 Zonas táctiles
Mínimo **44 px** en `@media(hover:none),(pointer:coarse)`; 40 px para los tres iconos de acción de una fila (`.del,.dup,.pdf-vis`), que van juntos. *«Lo que sube es la caja, nunca la letra.»* Truco para no mover nada de sitio: capa invisible, como `.tg::before{position:absolute;inset:-10px -4px}` (se ve 46×26, se toca 54×46).

### 4.6 Semántica obligatoria
- **Un `<div>` con `onclick` no es alcanzable con teclado.** Usa la constante:
  ```js
  const _ABRIBLE=`role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`;
  ```
- **Nada de `<label class="switch">` sin `for`.** `<button role="switch" aria-checked>`.
- `aria-pressed` en chips y segmentados; `aria-expanded` + `aria-controls` en plegables; `aria-current="true"` en el renglón activo de una lista; `aria-required` + `aria-describedby` en campos obligatorios (el `*` es `aria-hidden`, decorativo).
- **`aria-disabled="true"` en vez de `disabled`** cuando el control tiene que seguir contestando: *«un `<button disabled>` no despacha click, así que el oyente que existe para que nada se quede callado nunca se enteraba»*. Un `<input disabled>` tampoco despacha `pointerdown`: *«un campo que se ve y no contesta es, palabra por palabra, "la app se rompió"»*.
- Texto solo para lector de pantalla:
  ```css
  .solo-voz{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);
    clip-path:inset(50%);white-space:nowrap;border:0;padding:0;margin:-1px}
  ```
- Enlace de salto, primero del recorrido, con `:focus` a secas (no `:focus-visible`):
  ```html
  <a class="salto" href="#contenido">Saltar al contenido</a>
  ```
- **Regiones activas de verdad**, siempre presentes en el DOM (un `aria-live` en algo con `visibility:hidden` no anuncia nada):
  ```html
  <div id="vozStatus" class="solo-voz" role="status" aria-live="polite"></div>
  <div id="vozAlert"  class="solo-voz" role="alert"  aria-live="assertive"></div>
  ```
- `<section>` sin nombre accesible no se expone como región: usa `<main>`, o `aria-label`.

---

## 5. Sprite de iconos SVG

El sprite vive en `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>…</defs></svg>` justo después de `<body>` (líneas 2116–2149). Todos los símbolos son `viewBox="0 0 24 24"`, trazo abierto (`fill:none;stroke:currentColor`) salvo los que declaran `fill="currentColor" stroke="none"` en primitivas concretas (`i-asa`, `i-corte`, `i-colores`).

**Los 32 ids disponibles, completos:**

| id | dibuja |
|---|---|
| `i-escalar` | triángulo con cotas — escalador |
| `i-regla` | regla graduada |
| `i-carpeta` | carpeta — cargar archivo |
| `i-ia` | dos destellos — IA |
| `i-vector` | curva Bézier con nodos — vectorizador |
| `i-anidar` | cuatro piezas acomodadas en una lámina — anidador de vectores (vive también en el sprite de la plataforma y en el del anidador) |
| `i-historial` | flecha circular con reloj |
| `i-copiar` | dos hojas — duplicar |
| `i-basura` | bote — eliminar |
| `i-ojo` | ojo — visibilidad en PDF |
| `i-lapiz` | lápiz — editar |
| `i-aviso` | triángulo con ! |
| `i-imagen` | marco con sol y montaña |
| `i-pin` | pin de mapa |
| `i-bajar` | flecha abajo a una línea — descargar |
| `i-subir` | flecha arriba desde una línea — cargar |
| `i-doc` | hoja con renglones — PDF/CSV |
| `i-horiz` | flecha ↔ |
| `i-vert` | flecha ↕ |
| `i-libre` | flecha diagonal ↗ |
| `i-ajustar` | cuatro esquinas hacia fuera — encajar |
| `i-recalibrar` | flecha circular inversa |
| `i-candado` | candado cerrado |
| `i-rayo` | rayo — acción rápida |
| `i-asa` | seis puntos — asa de arrastre |
| `i-corte` | círculo medio relleno — modo corte |
| `i-colores` | círculo con cuatro puntos — paleta |
| `i-guardar` | disquete |
| `i-chat` | globo de diálogo — nota |
| `i-venta` | barras — registrar venta |
| `i-check` | palomita |
| `i-cerrar` | × |
| `i-atras` | flecha ← |

**Estilo del icono** (base, líneas 197–198):
```css
/* Un icono mide 1 em —el alto de la letra que lleva al lado— y se pinta con el color
   del texto, así que sigue al botón cuando cambia de estado sin reglas aparte.
   pointer-events:none para que el toque siempre lo reciba el botón y no el trazo. */
.svgi{width:1em;height:1em;flex:0 0 auto;vertical-align:-.135em;pointer-events:none;
  fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
/* capa de estructura */
.svgi{transition:transform var(--mv-r)}
.btn:hover .svgi,.ai-btn:hover .svgi,.btn-hist:hover .svgi{transform:scale(1.12)}
```

**Uso en markup estático:**
```html
<button class="btn btn-gho" onclick="volver()">
  <svg class="svgi" aria-hidden="true"><use href="#i-atras"/></svg> Volver al cotizador
</button>
```

**Uso desde JS** (línea 2725) — mismo sprite, misma clase:
```js
/* Icono en línea para el HTML que se arma desde JS. Mismo sprite que el markup. */
function ico(n,cls){return '<svg class="svgi'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#'+n+'"/></svg>';}
// ico('i-copiar')  →  <svg class="svgi" aria-hidden="true"><use href="#i-copiar"/></svg>
// ico('i-pin','mio')
```

**Por qué SVG y no emoji** (verbatim, líneas 2108–2115): *«La pila de fuentes no trae fuente de emoji, así que cada glifo lo resolvía el fallback del sistema: en el iPhone y en el Fold, ⬇ ⬜ 🖼 salían como emoji de color a ~1.5 em —enormes y fuera de la línea base— mientras ↔ ↕ ↗ ⧉ caían a una fuente de símbolos y salían minúsculos. Mismo botón, dos tamaños de icono, distinto en cada teléfono.»*

**Los emoji que sí sobreviven** llevan `.emo` (dibujan una cosa del mundo: una puerta, una persona, el tono de la luz):
```css
.emo{font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;
  font-size:.95em;line-height:1;font-style:normal;font-weight:400;vertical-align:-.05em}
```
Glifos de texto que se usan crudos y ya están cubiertos por la pila de fuentes: `▾ ▸ ▴` (plegados), `› →` (avance), `× ✓ !` (cierre/estado), `↺`.

---

## 6. APIs de UI en JS

### 6.1 Firmas exactas

```js
/* ---- Helpers, línea 2791 en adelante ---- */
const $=id=>document.getElementById(id);

const money=n=>'$'+Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
// money(1250)      -> "$1,250.00"
// money(null)      -> "$0.00"

const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// El apóstrofo TAMBIÉN se escapa: los onclick que pasan un folio lo delimitan con comilla simple.

function ico(n,cls){…}                          // §5

const _ABRIBLE=`role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"`;

function irA(el,extra=12){…}                    // desplaza restando altoTopbarFija(); respeta reduced-motion
function altoTopbarFija(){…}                    // offsetHeight + top (negativo en teléfono)
function irAResumen(){ irA('sidebox'); }

function voz(msg,urgente){…}                    // #vozStatus (polite) / #vozAlert (assertive)
function copiarTexto(txt,msgOk,extra){…}        // con respaldo para iOS y páginas no seguras
function prefGet(k,def=''){…}  function prefSet(k,v){…}   // localStorage envuelto en try/catch

const locked=()=>Q.estado!=='borrador'&&!Q.editMode;
function faltanDatosCliente(){ return datosFaltantes().length>0; }
function capturaBloqueada(){ return locked()||faltanDatosCliente(); }
```

### 6.2 `toast()` — firma completa, incluida la acción de deshacer

```js
let _toastT=null;
function toast(msg,type='',dur=2600,accion=null){
  /* Con botón, 8 s como mínimo: quien lo oye en vez de verlo tiene que encontrar
     «Deshacer» deslizando, y los 2.6 s de siempre no alcanzan ni para llegar. Si el
     llamador ya pide más, se respeta lo que pida. */
  if(accion&&dur<8000) dur=8000;
  const t=$('toast');
  t.innerHTML='';
  const sp=document.createElement('span'); sp.textContent=msg; t.appendChild(sp);
  if(accion&&accion.label&&typeof accion.fn==='function'){
    const b=document.createElement('button');
    b.type='button'; b.className='toast-act'; b.textContent=accion.label;
    b.onclick=()=>{ clearTimeout(_toastT); t.classList.remove('show'); accion.fn(); };
    t.appendChild(b);
  }
  t.className='toast '+type;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>t.classList.remove('show'),dur);
  voz(msg+(accion&&accion.label?' — '+accion.label+' disponible':''),type==='err');
}
```

| Parámetro | Tipo | Default | Notas |
|---|---|---|---|
| `msg` | string | — | va por `textContent`, **no** hace falta escaparlo |
| `type` | `''` \| `'ok'` \| `'err'` | `''` | `''` = tinta oscura; `'err'` además dispara la región `assertive` |
| `dur` | ms | `2600` | con `accion`, se fuerza a **≥ 8000** |
| `accion` | `{label:string, fn:function}` \| `null` | `null` | pinta un `.toast-act`; al pulsarlo cancela el temporizador, oculta el aviso y llama `fn()` |

Un solo temporizador compartido (`_toastT`): dos avisos seguidos ya no se pisan. Llamadas reales:
```js
toast('Partida '+(idx+1)+' eliminada','',6000,{label:'Deshacer',fn:deshacerBorrado});
toast('Cotización vaciada','',7000,{label:'Deshacer',fn:deshacerVaciado});
toast('Escala ajustada — medidas actualizadas','ok',3800,{label:'Deshacer',fn:volver});
toast(`Partida con altura ${h} cm agregada — sigue midiendo`,'ok',4200,{label:'Ir al cotizador',fn:cerrarScaler});
toast('No se pudo guardar el logotipo: no hay espacio en este dispositivo','err',6000,{label:'Respaldar',fn:()=>respaldar()});
toast('No falta nada por capturar','ok',2400);
```
El `dur` de 6000 en un borrado con «Deshacer» **es el contrato**: la ventana de deshacer dura lo que dura el aviso.

### 6.3 Abrir y cerrar un modal

**Cada modal solo pone o quita la clase `.show`.** No hay ninguna otra cosa que hacer: un `MutationObserver` vigila esa clase y se encarga del foco, del `inert` del fondo y del bloqueo del scroll. Es el mismo camino para el botón ×, el «atrás» del teléfono y el Escape.

```js
function abrirMio(){ $('mimodal').classList.add('show'); }
function cerrarMio(){ $('mimodal').classList.remove('show'); }
```

**Para que tu modal entre en el sistema, regístralo en `_CAPAS`, ordenado de mayor a menor z-index:**
```js
const _CAPAS=[
  ['pdf-fallback',()=>cerrarEnlacePDF()],
  ['lightbox',   ()=>closeLightbox()],
  ['rv-modal-bg',()=>cerrarRegistrarVenta()],
  ['faltmodal',  ()=>cerrarFaltantes()],
  ['aimodal',    ()=>aiClose()],
  ['histmodal',  ()=>cerrarHistorial()],
  ['vectormodal',()=>cerrarVector()],
  ['scalermodal',()=>cerrarScaler()],
];
```
Eso te da gratis: **Escape cierra la capa de arriba** (por su propia función, la misma que su botón, «así no hay dos maneras de cerrar que puedan dejar estados distintos»), **trampa de Tab** en los dos extremos y **`_capaDeArriba()`**.

Selector de focales y su filtro (no lo reescribas, reúsalo):
```js
const _FOCABLES='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),'+
  'select:not([disabled]),textarea:not([disabled]),summary,iframe,[tabindex]:not([tabindex="-1"])';
function _focablesDe(m){
  return [...m.querySelectorAll(_FOCABLES)].filter(e=>{
    if(!e.getClientRects().length) return false;                 // getClientRects, no offsetParent: son fixed
    if(e.checkVisibility && !e.checkVisibility({visibilityProperty:true})) return false;
    const d=e.closest('details:not([open])');
    return !d || (e.tagName==='SUMMARY' && e.parentElement===d);
  });
}
```

### 6.4 Manejo del foco al abrir y al cerrar

```js
const _focoAntes=new Map();

function _fondoInerte(v){
  document.querySelectorAll('.wrap,.topbar,.mbar').forEach(e=>{ try{ e.inert=v; }catch(_){} });
  document.documentElement.classList.toggle('modal-abierto',v);
}

function _modalAbierto(m){
  const prev=document.activeElement;
  // NO se guarda un elemento que viva dentro de otra capa que se está cerrando
  const dentroDeUnaCapa=prev&&prev.closest&&_CAPAS.some(([id])=>{
    const c=document.getElementById(id); return c&&c.contains(prev);
  });
  _focoAntes.set(m.id,dentroDeUnaCapa?null:prev);
  _fondoInerte(true);
  const f=_focablesDe(m);
  const d=f[0]||m;
  if(!f.length) m.tabIndex=-1;
  requestAnimationFrame(()=>{            // en iOS enfocar en el mismo golpe se pierde
    if(!m.classList.contains('show'))return;
    try{ d.focus({preventScroll:true}); }catch(_){}
  });
}

function _modalCerrado(m){
  const arriba=_capaDeArriba();
  if(!arriba) _fondoInerte(false);
  const a=_focoAntes.get(m.id); _focoAntes.delete(m.id);
  /* Devolver el foco es SÍNCRONO a propósito: irAPartida() cierra el aviso y enfoca el
     campo en el fotograma siguiente, y si esto también esperara se lo quitaría después. */
  if(a&&a.isConnected&&a.getClientRects().length&&(!arriba||arriba.contains(a))){
    try{ a.focus({preventScroll:true}); }catch(_){}
  }
  // Red 1: si el que abrió ya no puede recibir foco y queda una capa debajo, a su primer control
  if(arriba&&(document.activeElement===document.body||!arriba.contains(document.activeElement))){
    const alt=_focablesDe(arriba)[0];
    if(alt){ try{ alt.focus({preventScroll:true}); }catch(_){} }
  }
  // Red 2: sin capas y sin foco válido, se ancla en #contenido
  if(!arriba&&document.activeElement===document.body){
    const anc=$('contenido');
    if(anc){ anc.tabIndex=-1; try{ anc.focus({preventScroll:true}); }catch(_){} }
  }
}

const _obsModal=new MutationObserver(regs=>{
  for(const r of regs){
    const m=r.target, ahora=m.classList.contains('show');
    if(ahora===(m.dataset.abierto==='1'))continue;   // la clase cambió, el estado no
    m.dataset.abierto=ahora?'1':'0';
    if(ahora) _modalAbierto(m); else _modalCerrado(m);
  }
});
function _vigilarModales(){
  for(const [id] of _CAPAS){
    const el=document.getElementById(id); if(!el)continue;
    el.dataset.abierto=el.classList.contains('show')?'1':'0';
    _obsModal.observe(el,{attributes:true,attributeFilter:['class']});
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_vigilarModales,{once:true});
else _vigilarModales();
```

**Foco dentro de una lista que se repinta entera** (el otro patrón, para `innerHTML=''` sobre un contenedor):
```js
function _focoDeItems(){
  const a=document.activeElement;
  if(!a||!a.closest||!a.closest('#items')) return null;
  return a.getAttribute('data-foco')||a.getAttribute('onclick')||null;
}
function _devolverFocoItems(marca){
  if(!marca) return;
  const c=$('items'); if(!c) return;
  const el=c.querySelector('[data-foco="'+CSS.escape(marca)+'"]')
        || Array.prototype.find.call(c.querySelectorAll('[onclick]'),e=>e.getAttribute('onclick')===marca);
  if(el){ try{ el.focus({preventScroll:true}); }catch(_){ el.focus(); } }
}
// uso: const _focoPrevio=_focoDeItems();  … repintar …  _devolverFocoItems(_focoPrevio);
```
La marca es el `onclick` (identifica partida + valor elegido, así que no hay que mantener una lista de qué es enfocable). Los controles cuyo `onclick` cambia al pulsarlos llevan `data-foco="…"` explícito (el ojo del PDF, los dos interruptores).

Y la regla de dónde dejar el foco después de destruir algo:
```js
/* Va al ▾ de la partida vecina y no a su ×: dejar el cursor sobre un botón destructivo
   justo después de borrar convierte un segundo Enter en otra pérdida. */
const _sig=Q.items[Math.min(idx,Q.items.length-1)];
const _b=_sig?document.querySelector('#p-'+_sig.id+' .pfold'):$('addbtn');
if(_b){ try{ _b.focus({preventScroll:true}); }catch(_){ _b.focus(); } }
```

### 6.5 Botón «atrás» del teléfono en un modal de pantalla completa (`.hist` en SC/VT)

Bandera `hist` en el objeto de estado del modal + una entrada de historial + `popstate`. **Copia el patrón tal cual** para cualquier modal nuevo de pantalla completa:

```js
const SC={ /* … */ hist:false /* … */ };

function abrirScaler(){
  /* … preparar el contenido … */
  $('scalermodal').classList.add('show');
  // Una entrada de historial por el escalador: en el celular el gesto natural para
  // regresar es el botón "atrás", y sin esto se salía de la cotización entera.
  if(!SC.hist){ try{history.pushState({sc:1},'');SC.hist=true;}catch(_){} }
  /* … */
}
function scOcultarScaler(){                    // solo esconde, NO toca el historial
  $('scalermodal').classList.remove('show');
  if(SC._guideRelease)SC._guideRelease();
  scHideLoupe();
}
function cerrarScaler(){                       // cerrar POR LA APP: consume la entrada
  scOcultarScaler();
  if(SC.hist){ SC.hist=false; try{history.back();}catch(_){} }
}
window.addEventListener('popstate',()=>{       // cerrar POR EL TELÉFONO
  if(!$('scalermodal').classList.contains('show'))return;
  SC.hist=false;            // la entrada ya la consumió el "atrás" del navegador
  scOcultarScaler();
});
```
Idéntico en el vectorizador con `VT.hist` y `history.pushState({vt:1},'')`. Las tres piezas son obligatorias: `ocultar()` (sin historial), `cerrar()` (con `history.back()`) y el `popstate` (que baja la bandera **antes** de ocultar, para no consumir dos entradas).

**Ceder la entrada entre dos modales** en vez de cerrar y reabrir (`history.back()` es asíncrono y se cruzaría):
```js
// La entrada de historial se CEDE al escalador en vez de cerrarla y volver a abrirla:
// history.back() es asíncrono y abrir el escalador enseguida se cruzaría con él, con
// el resultado de que el "atrás" del teléfono cerraría el modal recién abierto.
vtOcultar();
if(VT.hist){ VT.hist=false; SC.hist=true; }
abrirScaler();
```

### 6.6 Contratos de repintado
`renderItems()` es el patrón: guarda el foco → repinta `innerHTML` → **`renderSummary(); updProg(); saveState();`** → devuelve el foco. `updProg()` es el único sitio donde se repintan los obligatorios, el candado y el encabezado plegado: *«los datos del proyecto cambian por muchos caminos —se teclean, los llena un cliente conocido, llegan de la IA, de la cola o del historial— y todos pasan por un repintado.»* Si tu módulo añade datos que afectan la completitud, engánchate a `updProg()`, no a cada llamador.

---

## 7. El tono del proyecto

### 7.1 Cómo se escriben los comentarios
Bloque `/* … */` de varias líneas, **en español, con em-dashes y comillas latinas «»**, en presente. La forma es siempre la misma: **qué se veía mal, medido, y por qué la solución es esta.** Se nombra el dispositivo concreto (iPhone SE, Fold 6, 344 px), el número exacto de píxeles, y el intento anterior que falló. Los comentarios explican **decisiones**, nunca lo que el código ya dice. Van encabezados con `/* ----- Nombre ----- */` o `/* ===== Sección ===== */` cuando abren una sección.

Cinco verbatim:

1. *(línea 30, sobre el sistema)*
```
Antes de esto la hoja tenía 23 tamaños de letra distintos —de 9 a 30 px, en saltos de
medio píxel—, 39 sombras y 18 degradados. Ninguno estaba mal por sí solo; el problema
es que no eran un sistema, eran decisiones sueltas tomadas de una en una a lo largo de
meses. Una pantalla hecha así se siente desordenada aunque cada pieza esté bien.
```

2. *(la receta de la sombra, en los tokens)*
```
Y el truco que casi nadie aplica: la sombra exterior va en dos pasos, una corta y
apretada y otra larga y abierta. Con una sola, la pieza flota; con dos, se apoya.
```

3. *(línea 754, el botón principal)*
```
Un solo botón lleva color de relleno en cada pantalla: el que hace lo que se vino a
hacer. Los demás son neutros con borde. Cuando todos gritan, ninguno dirige.
```

4. *(línea 578, el chip)*
```
Era una píldora gris que al elegirla se volvía azul con degradado, sombra de 14 px y un
rebote. Multiplicado por los cinco materiales, las tres complejidades y los tres acabados
de cada partida, lo seleccionado era lo más ruidoso de la pantalla justo por estar
decidido.
```

5. *(línea 3872, en JS)*
```
Un `<input disabled>` no despacha `click` ni `pointerdown`: tocar la altura de una
partida congelada no producía absolutamente nada, y un campo que se ve y no contesta es,
palabra por palabra, «la app se rompió».
```

Otras muestras del mismo registro, para calibrar: *«Quien las pidió sin animación no las tiene»*, *«En papel no hay barro»*, *«Ningún control mudo»*, *«se recorta el marco (rellenos, huecos, notas), nunca el blanco de lo que se toca»*, *«Una pieza de barro que no se deforma al apretarla no se lee como barro: se lee como una calcomanía»*.

### 7.2 Cómo se escriben los textos de interfaz
Español de México, **tuteo**, minúscula después de la primera palabra (nada de Mayúsculas De Título), sin punto final en botones y etiquetas, con punto en notas de una o dos frases. Los botones dicen **qué va a pasar**, no qué son (`Continuar a partidas`, no `Siguiente`). Los avisos **nombran el hueco** (`Falta la dirección`, `Partida 2 · falta material`), nunca «error» ni «inválido». Los estados vacíos dicen qué hacer. Se usa `·` como separador de datos y `›` `→` `▾` como flechas. Sin exclamaciones, sin «¡Listo!», sin emoji decorativo.

Cinco verbatim:

1. `Sin cliente, teléfono y proyecto no se pueden capturar partidas.`
2. `Aún no hay partidas. Agrega letras 3D, un recorte de acrílico, un bastidor, una caja de luz o una partida manual.`
3. `Todo se guarda solo en este dispositivo. El respaldo <b>no</b> incluye tus API keys.`
4. `Solo aparecen las solicitudes hechas en <b>este</b> dispositivo — la cola se guarda aquí, no en un servidor.`
5. `Duplicar copia el cliente y las partidas a una cotización nueva, en borrador: es la de cotizar lo mismo con otro material o otra medida sin capturar de nuevo.`

Más muestras: `Mantén tocado para ver un importe` · `No falta nada por capturar` · `Igual que la anterior` · `Ábrelo para verificar la ubicación antes de compartirla.` · `Se imprime en la cotización. Vacía, sale la de arriba.` · `Ninguna cotización coincide con «…».` · `Pega tu key (gratis, sin tarjeta)` · `Ocultar del PDF — la partida sigue sumando al total` · `Fila copiada — pégala en la hoja Ventas` · `No hubo espacio para guardar en el historial — respalda y borra cotizaciones viejas`.

**Títulos de `title=` y `aria-label`:** el `title` dice la **acción** (para el ratón), el `aria-label` dice el **destino** o el objeto, y el **estado** lo carga `aria-expanded`/`aria-pressed`, nunca el nombre. Ejemplo del código: `<button class="pfold" aria-expanded="false" title="Abrir la partida" aria-label="Detalle de la partida 3">`.

---

## Checklist para un módulo nuevo

1. Envuélvelo en `.card`/`.card-h`/`.card-b`. Si va en la columna derecha, `.sum`.
2. Un solo botón con relleno de color: `.btn-pri` (o `.btn-ok` si confirma). Todo lo demás `.btn-gho`.
3. Chips por `chip()`/`grupo()`. Campos en `.fld` dentro de `.grid2`/`.grid3`. Interruptores `<button role="switch">`.
4. Importes con `money()` y `font-variant-numeric:tabular-nums`. Todo lo interpolado en HTML pasa por `esc()`.
5. Iconos con `<use href="#i-…">` o `ico()`. Si necesitas uno nuevo, añade el `<symbol viewBox="0 0 24 24">` al sprite; trazo abierto, `stroke-width:1.9`.
6. Modal: `.modal-bg` + `.modal`, `role="dialog" aria-modal="true" aria-label`, cierre por `.show`, alta en `_CAPAS`. Si es de pantalla completa, además el patrón `.hist` de §6.5.
7. `min-width:0` en todo hijo de flex/grid que reciba texto largo; recorte con `overflow:hidden;text-overflow:ellipsis;white-space:nowrap`.
8. `≥44px` de zona táctil en `@media(hover:none),(pointer:coarse)`; nunca subas la letra para conseguirlo.
9. Nada de `opacity` sobre bloques con texto. Apagado por color. `--n5` hacia arriba no lleva texto. `--a-claro`/`--a3` solo decoración.
10. Si añades una regla base al final de la hoja, comprueba en el navegador que no estás pisando la capa de estructura y movimiento — y si tu regla tiene que ganar por orden, va en el bloque de cierre («lo que tiene que ganar por orden») con su comentario diciendo por qué.