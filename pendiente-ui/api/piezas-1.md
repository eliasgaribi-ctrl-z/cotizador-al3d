# API · js/piezas.js · sección 1 · Avisos y botones que dicen lo que pasa

Todo cuelga de `window.Piezas` (en el cotizador: `Piezas.x(...)`; en la plataforma, que es de módulos: `window.Piezas.x(...)`; nunca `import`). Guion clásico: lo cargan cotizador.html, index.html, anidador-vectores/index.html y verificar.html antes que sus guiones. En node se carga sin tronar y no cuelga nada.

Reglas comunes a todas:

- `el`/`btn` puede ser un elemento o su **id** (cadena). Si no existe, la pieza no hace nada y devuelve un mango inerte o `null`.
- **Idempotentes**: llamarlas otra vez sobre el mismo elemento no duplica oyentes.
- **Sin manejadores en línea**: todo va con `addEventListener`. Sirven en la plataforma (CSP sin `'unsafe-inline'`).
- **La guardia de clic**: mientras un botón está `trabajando` (14), diciendo un éxito que se va solo (14), ofreciendo `Deshacer` (15) o bajo `mantener` (5), su `onclick` del marcado y la delegación de la pantalla **no reciben el clic** (se para en la captura del documento). La acción va en los callbacks de la pieza.
- **`verificar.html` no tiene `#toast` ni las regiones que hablan** (`#vozStatus`/`#vozAlert`): ahí `Piezas.aviso()` devuelve un mango muerto y `Piezas.voz()` no dice nada. Las piezas que usa esa página (24, 6) no los necesitan; si tu pantalla sí, agrégalos al marcado y dilo en tu informe.
- **Menos movimiento** se pregunta en el momento (`Piezas.sinMovimiento()`), no al cargar.
- Nada de esto se mueve en reposo; lo único con `iterations: Infinity` es el arco de `marcaEstado('trabaja')`, y solo mientras hay una espera real.
- CSS en `css/sistema.css`, bloque «Piezas · 1» (capa 4) y su apagado en «rm · piezas · 1». Tokens de tema, claro y oscuro. 44 px con el dedo.

Utilidades de la sección que puedes usar:

| Función | Qué hace |
|---|---|
| `Piezas.voz(msg, urgente)` | Lo dice en `#vozStatus` (o `#vozAlert` si `urgente` y existe). Igual que `voz()` de cada app. |
| `Piezas.reloj(ms, {falta})` | `"6 s"`, `"1 min 05 s"`. `{falta:true}` redondea hacia arriba (cuenta regresiva). |
| `Piezas.mecha(cont, {ms, alTerminar, segundos})` | Filete de 2 px al pie de `cont` que se consume en `ms`. Devuelve `{pausar(razón), seguir(razón), reiniciar(ms), cancelar(quitar=true), resta(), el, vivo}`. Las razones de pausa se cuentan (dedo + app oculta = dos). Al volver de una pausa quedan ≥ 1.5 s. Con menos movimiento la línea queda quieta. **`segundos`** escribe lo que falta una vez por segundo, con movimiento y sin él: puede ser un **elemento** (o su id) —se le escribe «18 s»— o una **función** `(msQueFaltan, '18 s')`, para cuando la frase la arma la pantalla (A4: «Sin mejora hace 18 s · faltan 7 intentos»). |
| `Piezas.sacudir(el)` | Sacudida de ±4 px ×3 (320 ms). Nada con menos movimiento. |
| `Piezas._relleno(btn)` | `'claro' \| 'oscuro' \| 'luz'`: de qué color se llena ese botón sin perder contraste (lo usan 5 y 14). |

---

## Pieza 12 · El aviso con mecha, pausa, deslizar y pila

**Ya está integrada** en los tres `toast()` (cotizador `js/cotizador/nucleo.js`, plataforma `js/nucleo/ui.js`, anidador `anidador-vectores/js/app.js`). **Las pantallas siguen llamando `toast(msg, tipo, dur, accion)`**; no hace falta tocar nada para tener pila, mecha, pausa y deslizar.

```js
toast(msg, tipo = '', dur = 2600, accion = null)   // → mango {cerrar(), vivo, el} | null
Piezas.aviso(msg, { tipo, dur, accion, pila = 'toast', clave, voz = true })  // → mango
```

| Parámetro | |
|---|---|
| `tipo` | `''` (marino / claro de noche), `'ok'` (verde relleno), `'err'` (rojo; se dice en la región asertiva). |
| `dur` | ms. Sin número: 2600. **Con `accion`, 8000 como mínimo**; lo que se pida de más se respeta. La mecha dura exactamente esto. |
| `accion` | `{label, fn}`: pinta `.toast-act`. Al tocarlo el aviso se va y `fn()` corre en el mismo toque. |
| `clave` | Opcional. Dos avisos con la misma clave son el mismo: el nuevo toma el lugar del viejo aunque cambie el texto (útil para «Página 3 de 20…»). |
| `voz` | `false` para no decirlo (los `toast()` lo dicen siempre). |

**Qué se ve** (máximo **dos**): prioridad error (2) > con botón (1) > informativo (0).
- Un informativo **siempre cede su lugar** al aviso nuevo (en su sitio, sin volver a entrar).
- El mismo aviso tal cual (texto + tipo + botón) se reusa: no vuelve a entrar. **Un informativo repetido no reinicia su tiempo** (uno pedido en cada tecla no se queda para siempre); **un error o uno con botón sí**, porque es un acto nuevo —el reintento que volvió a fallar, el borrado de ahora— y quitarlo con el reloj del primero era esconder el fallo justo cuando alguien lo buscaba.
- Dos avisos con **la misma función** de botón no conviven: el nuevo reemplaza al viejo (`deshacerBorrado()` solo sabe deshacer el último borrado).
- Error y «con botón» **no se pisan nunca**: si ya hay dos así, el nuevo **espera** y entra cuando uno se va (se dice en voz en cuanto se pide). De los informativos en espera solo queda el último, y si esperó más que su `dur` ya no entra.
- El mango es del aviso: si otro toma su lugar, el mango viejo muere (`vivo === false`, `cerrar()` no hace nada).

**Toque / teclado**: se congela con el cursor o el dedo encima, con el foco dentro (Tab hasta «Deshacer») y con la app en segundo plano; se quita **deslizándolo hacia abajo** (40 px o un deslizón > 0,11 px/ms) o con **Escape** si tiene el foco. «Deshacer» mide 44 px con el dedo. **El foco vuelve** de donde vino: al irse el aviso —por su botón o por Escape— regresa al elemento que lo tenía antes de entrar a la pila (o al botón del otro aviso, si queda uno). Se devuelve **antes** de correr la función del botón, así que ella todavía puede llevarlo a otro lado.

**Menos movimiento**: entra y sale con un fundido de 150 ms, sin desplazamiento; la mecha queda quieta y, si trae botón, los segundos que faltan van con letra (`.toast-seg`).

**Marcado** (lo arma la pieza; no lo escribas a mano):
```html
<div class="toast" id="toast">                      <!-- la PILA; ya está en las 3 páginas -->
  <div class="toast-uno err" data-prio="2">
    <span class="toast-msg">…</span>
    [<span class="toast-seg" aria-hidden="true">8 s</span>]
    [<button type="button" class="toast-act">Deshacer</button>]
    <i class="mecha" aria-hidden="true"></i>
  </div>
</div>
```
Posición: `.toast` es la pila. En ≤759 px va **al ancho del dock** (mismos márgenes que `.mbar`: 10 px, 6 px en ≤385) y encima de él; ≥760 px abajo a la izquierda (`--lat`). Se conservan `.scaler-modal-bg.show+.toast`, `.vt-modal-bg.show~.toast`, `body.pf .toast` y `body:has(.pf-modal-bg.show) .toast`. **No metas nada entre `#scalermodal`, `#toast` y `#mbar`.** Las pruebas que leen `#toast.textContent` o `#toast .toast-act` siguen funcionando (ahora son descendientes).

Utilidades: `Piezas.aviso.vivos()` → `[{msg, tipo, prio, label, resta}]`; `Piezas.aviso.limpiar()` quita todos sin salida.

**Ejemplos (Entra en)**
```js
// C3 · notario.js aplicarSello() + avisoDelNotario(): ya no hay que cambiar nada, los dos quedan:
toast('El total de este teléfono (…) no es el que selló la hoja (…). Actualiza la app antes de mandar el PDF.','err',12000);
toast('✓ '+x.sello.correo+' autorizó '+folio+' · '+money(Q.sello.total),'ok',6000);

// C3 · venta.js mandarALaHoja(): «Mandando…» cede ante «Venta registrada · Abrir plataforma»
// y el «No se escribió…» se apila. Si quieres quitar «Mandando…» tú mismo:
const h = toast('Mandando la venta a la hoja…','',PUENTE_ESPERA);
/* … */ h && h.cerrar();

// A22 · js/app.js al arrancar tras la recarga por versión nueva (sessionStorage):
toast('Se puso la versión nueva de la app','ok',5000);

// A9 · anidador, volver a acomodar desde cero (el toast() del anidador ya es la pieza):
toast('Se guardó el acomodo anterior (78 %, 2 hojas)', '', 8000, { label: 'Recuperar', fn: recuperarAnterior });

// P16 · un aviso que se actualiza en su lugar:
Piezas.aviso('Página 3 de 20', { clave: 'traer-hoja', dur: 20000, voz: false });
```

---

## Pieza 14 · El botón que está trabajando lo dice

```js
Piezas.trabajando(btn, trabajo, { verbo, tau, ok, mal, reintentar, volver, hermanos, voz })
  // → Promise<{ok:true, valor} | {ok:false, error} | {ok:false, ocupado:true}>   NUNCA se rechaza
Piezas.estadoBoton(btn)
  // → { estado, trabajando(o), avance(p, texto), ok(texto, {volver}), mal(motivo, {reintentar}), reiniciar() }
```

| Opción | |
|---|---|
| `trabajo` | Una promesa, o una función `(mango) => promesa|valor` (recibe el mango de `estadoBoton` para llamar `avance`). |
| `verbo` | Lo que dice mientras trabaja: «Sellando» → «Sellando · 6 s». El `texto` de `avance(p, texto)` **sustituye** al verbo, no se le suma: para «Trayendo la hoja · vuelta 3 · 12 s» pasa la frase entera. |
| `tau` | ms que suele tardar (4000). El relleno se acerca al 90 % con 0,9·(1−e^(−t/τ)) y **solo llega al final con la respuesta**. |
| `ok` | Texto de éxito, o `valor => texto`. `false` = vuelve directo a su rótulo sin pintar éxito. Por omisión «Listo». |
| `mal` | Motivo corto, o `error => texto`. Se le agrega « · Reintentar». Por omisión «No se pudo». |
| `reintentar` | Rótulo del reintento («Reintentar»). |
| `volver` | ms que se queda el éxito (3500). `0` = se queda **y el botón vuelve a aceptar toques desde el primer momento**: quien pidió que el éxito se quedara es el dueño de lo que pase después, y solo `reiniciar()` le devuelve su rótulo. |
| `hermanos` | Elementos que pasan a `aria-disabled` + `data-espera` mientras trabaja (se atenúan y no aceptan toques). |
| `voz` | `false` para no decir el resultado (por omisión dice el éxito en polite y el fallo en asertiva). |

Estados (en el botón): `.con-estado` + `data-estado="trabajando|ok|mal"` + `data-relleno="claro|oscuro|luz"`; `aria-busy` y `aria-disabled` mientras trabaja (**no** `disabled`: el foco se queda). Mientras el éxito es un momento que se apaga solo lleva además `data-ocupado` y `aria-disabled`, y la guardia se come los toques: el rótulo dice «Registrada», no su acción, y ahí se registraba una segunda venta. Hijos que genera: `.trabajo-relleno` (aria-hidden, `scaleX`), `.estado-t`, `.trabajo-reloj`; en ok, una `.palomita` que se dibuja. El ancho no se encoge (`min-width: min(<ancho del rótulo original>, 100%)` — con topes en píxeles pelados, girar el teléfono a vertical con el botón trabajando mandaba la página de lado). La letra se queda ≥ 4.5:1 sobre el relleno a medias (en botones de color el relleno oscurece; en fantasmas de día es `--a-suave`; de noche aclara).

**Reintento**: en `mal` el botón vuelve a aceptar toques; tocarlo corre **su propio manejador** otra vez, que llama a `Piezas.trabajando` de nuevo. **No repintes el botón con innerHTML mientras trabaja**: si lo haces, `reiniciar()` no le encima el rótulo guardado.

**Teclado/toque**: Enter/Espacio o el dedo disparan el manejador de siempre; mientras trabaja, la guardia se come los toques. **Menos movimiento**: no hay relleno que avance (salvo `avance(p)` explícito, que se pone sin animación); el reloj con letra dice lo mismo; el fallo no tiembla.

**Ejemplos**
```js
// C5 · Registrar venta (venta.js; mandarALaHoja ya nunca se rechaza):
Piezas.trabajando('rv-registrar', () => mandarALaHoja(cierre).then(ok => { if (!ok) throw new Error(); }),
  { verbo: 'Registrando', tau: 5000, ok: 'Registrada', mal: 'No se registró' });

// C5 · Sellar (proceso.js autorizarConfirmado), con el código del sello en el éxito:
Piezas.trabajando(btn, pedirSello(), { verbo: 'Sellando', tau: 6000, ok: s => 'Sellada · ' + s.codigo, mal: 'La hoja no contestó' });

// P16 / F7 · «Traer la hoja» con páginas conocidas (control.js / ajustes.js jalar()):
Piezas.trabajando(btn, async h => {
  for (let i = 1; i <= total; i++) { await traerPagina(i); h.avance(i / total, 'página ' + i); }
  return cambios;
}, { verbo: 'Trayendo la hoja', ok: n => n + ' cambios', mal: 'No contestó', hermanos: [...btnsDelPuente] });
```

---

## Pieza 15 · «Deshacer» en el mismo botón, con mecha

```js
Piezas.deshacerEnBoton(btn, { ms = 5000, rotulo = 'Deshacer', alConfirmar, alDeshacer, voz })
  // → { deshacer(), confirmar(), vivo, resta() }
```
Llámala **en el momento de la acción, desde el manejador que ya tiene el botón**. El botón cruza su rótulo a «Deshacer» (pieza 23: conserva el ancho del más largo, con el mismo tope de 100 % que la 14) y le sale una mecha de `ms`. **La escritura de verdad va en `alConfirmar`** y corre al apagarse la mecha; tocar el botón (ratón, dedo, Enter/Espacio) llama a `alDeshacer` y regresa. Mientras ofrece deshacer, su `onclick`/delegación no recibe el toque (guardia). Se pausa con el cursor o el foco que **vuelven** al botón (el del toque que hizo la acción no cuenta) y con la app en segundo plano. Si la página se va (`pagehide`) con la mecha viva, **confirma**. Otra llamada sobre el mismo botón confirma la anterior primero. Atributo mientras dura: `data-deshacer`; hijos: `.rotulo…`, `.mecha`, y con menos movimiento `.deshacer-seg` con los segundos (la mecha, quieta).

Nunca para lo que no se deshace (el cruce de corte, «Ya se instaló»): eso lo decide quien llama.

**Ejemplos**
```js
// P4 · Tablero «Ya se armó» (tablero.js avanzar(); el renglón no salta de grupo hasta confirmar):
Piezas.deshacerEnBoton(boton, { ms: 5000,
  alConfirmar: async () => { await Proy.avanzarEtapa(id, a); recargar(); },
  alDeshacer: () => toast('Se quedó en ' + nombreEtapa(de)) });

// F13 · Material «Recibí lo de la lista» (8 s, igual que el aviso con Deshacer):
Piezas.deshacerEnBoton(btn, { ms: 8000, alConfirmar: () => recibirTodo(), alDeshacer: () => pintarMbar() });

// A4 · la mecha del paro del anidador (solo la mecha, sin botón):
const paro = Piezas.mecha('an-mecha-paro', { ms: LIMITE_MS, segundos: 'an-paro-seg' });
/* en cada mejora: */ paro.reiniciar(LIMITE_MS);
```

---

## Pieza 23 · El rótulo que cambia sin brincar

```js
Piezas.cambiarRotulo(el, contenido)                 // → true si cambió (false = mismo texto, NO toca el DOM)
Piezas.rotuloTemporal(el, contenido, { ms = 1500, sacudir }) // → { volver() }   (ms 0 = hasta volver())
Piezas.rotuloHTML(aHtml, bHtml)                     // → cadena, para quien pinta con innerHTML
Piezas.confirmarEnBoton(btn, texto = 'Copiado', { ms = 1800 }) // palomita que se dibuja + texto, y vuelve
```
`contenido`: texto (va por textContent), `{html: '…'}` (marcado de confianza: iconos, palomita), o un nodo. Genera:
```html
<span class="rotulo [alt]"><span class="rotulo-a">rótulo</span><span class="rotulo-b" aria-hidden="true">alterno</span></span>
```
Los dos en la misma celda de rejilla: el ancho es el del más largo, nada de alrededor se mueve; cruce de 180 ms con opacity + translateY. El rótulo alterno **se queda** (invisible y aria-hidden) al volver, para que el botón no brinque ni al ir ni al volver: si pintas con innerHTML declara los dos desde el principio con `rotuloHTML` y el botón nace con su ancho final. `aria-hidden` se cambia de lado con lo que se ve. Un botón de solo icono en `confirmarEnBoton` cambia el icono por la palomita, sin texto.

**Si la pantalla repinta el botón con innerHTML en cada tecla** (renderMobileBar), el rótulo nuevo no tiene de dónde cruzarse: repinta el botón solo cuando cambie la estructura y, para el texto, llama `cambiarRotulo(btn, texto)` (que ya compara y no hace nada si es igual).

**Menos movimiento**: cambio inmediato; sin sacudida. **Teclado/toque**: no aplica (lo dispara quien llama).

**Ejemplos**
```js
// C10 · el botón principal del dock cambia de paso, y dice qué falta:
Piezas.cambiarRotulo(mbarBtn, 'Generar PDF');
Piezas.rotuloTemporal(mbarBtn, 'Falta el teléfono', { ms: 1500, sacudir: true });

// C19 / H28 · el renglón «lo que sigue» y la pista del escalador:
Piezas.cambiarRotulo('prog-sigue', 'Falta la dirección ›');
Piezas.cambiarRotulo(document.querySelector('.sp-hint-bar span'), '✓ Primer punto — toca el otro extremo');

// F29 · la barra de acción de la plataforma, pintada con innerHTML:
barra.innerHTML = '<button class="btn btn-pri" data-acc="agendar">' + Piezas.rotuloHTML(esc(rotulo)) + '</button>';
```

---

## Copiar (piezas 23 + 6)

```js
Piezas.copiar(texto, { boton, ok = 'Copiado', ms = 1800 })  // → Promise<boolean>, nunca se rechaza
Piezas.botonDelEvento(ev = window.event)                      // → el botón del toque en curso, o null
```
Portapapeles con respaldo (textarea de solo lectura en el `<body>`, `setSelectionRange`, `execCommand('copy')`, y **devuelve el foco** adonde estaba). Si copió y hay `boton`, lo confirma en el botón (`confirmarEnBoton`).

**Las dos `copiarTexto(txt, msgOk, extra)` de siempre ya delegan en ella** sin cambiar su firma: el botón sale del clic que está corriendo, así que **todas las llamadas actuales ya confirman en su botón** (Canva, Gemini, SVG, subtotal, link de Maps, orden de trabajo, respuesta del asistente, dirección del mapa…) y siguen avisando abajo con su instrucción. Fuera de un toque (después de un `await`) no se confirma en ningún botón.

```js
// F31 / H18 · ya pasa solo con copiarTexto(); si quieres otro rótulo:
Piezas.copiar(dir, { boton: e.target.closest('button'), ok: 'Copiada' }).then(b => b ? toast('Dirección copiada','ok') : toast('No se pudo copiar','err'));
```

---

## Pieza 5 · Mantener presionado para confirmar

```js
Piezas.mantener(btn, { ms = 1200, alConfirmar, tono = 'mal'|'azul'|'ok', aviso, pista, otraVez, textoHecho })
  // → { reiniciar(), destruir(), progreso, estado }
Piezas.mantener.quitar(btn)   // le devuelve al botón su clic de siempre, si lo tenía la pieza
```
- **Puntero/dedo**: sostener `ms` → `alConfirmar()`. Soltar antes regresa el relleno en 180 ms y no pasa nada. Un toque < 250 ms dice la `pista` («Mantén presionado para confirmar»): en el elemento `aviso` si lo das, si no en el propio botón 1.8 s con una sacudida. Salirse 10 px del botón, perder la ventana o la pestaña cancela. Sin menú de pulsación larga de Android.
- **Teclado**: Enter o Espacio **sostenidos**; Escape suelta.
- **Sin poder sostener** (lector de pantalla, control por voz: clic con `detail === 0`): la primera activación dice «Otra vez para confirmar» (`otraVez`) y la segunda dentro de 5 s confirma.
- Al confirmar: `.hecho` + `aria-disabled="true"` hasta `reiniciar()` (o hasta volver a llamar `mantener`). Si diste `textoHecho`, **se dice** y pasa a ser la coletilla del nombre del botón: la capa de color va `aria-hidden` —es la copia del rótulo—, así que escribirlo solo ahí no lo oía nadie.
- En reposo la pieza **no deja nada colgado fuera del botón**: los oyentes de `window`/`document` existen solo mientras alguien sostiene. Una lista que se repinta con innerHTML puede armar `mantener` en cada vuelta sin acumular nada.
- **El `onclick` del botón no corre** mientras esté bajo la pieza (guardia): pon la acción en `alConfirmar`. `destruir()` devuelve el botón como estaba.
- Si la pantalla **reescribe el rótulo** (p. ej. `confirmar()` hace `si.textContent = o.si`), vuelve a llamar `Piezas.mantener(btn, …)`: se arma de nuevo sobre el rótulo nuevo, sin oyentes de sobra.

Marcado que genera dentro del botón: `.mantener-base` (el rótulo), `.mantener-capa > .mantener-capa-t` (aria-hidden: la copia de color, descubierta con dos translate opuestos), `.solo-voz` («— mantén presionado para confirmar»). Clases/atributos en el botón: `.mantener`, `data-mantener`, `data-tono`, `data-relleno`, `.manteniendo`, `.hecho`. Contraste: sobre un botón claro el relleno es sólido (`--mal` / `--a-fill` / `--ok-fill`, de noche el rojo con letra honda); sobre uno de color, oscurece.

**Menos movimiento**: el relleno **sí** avanza (es información); lo que se apaga es el encogerse al apretar.

**Ejemplos**
```js
// C23 · «Sí, borrar todo» en el confirmar() del cotizador, solo cuando es peligro:
// (sin `aviso`: la pista sale en el propio botón y no le borra el texto a la pregunta)
if (o.peligro) Piezas.mantener('conf-si', { tono: 'mal', alConfirmar: confirmarSi });
else Piezas.mantener.quitar('conf-si');

// P1 · «Quitar del tablero» en proyectos.js:
Piezas.mantener(btnQuitar, { tono: 'mal', ms: 1200, alConfirmar: () => quitarDelTablero(id) });

// C23 · Autorizar (botón verde):
Piezas.mantener('a-autorizar', { tono: 'ok', alConfirmar: autorizarConfirmado, textoHecho: 'Autorizando…' });
```

---

## Pieza 6 · La palomita que se dibuja

```js
Piezas.palomitaHTML({ circulo, dibujar = true, clase })  // → '<svg class="palomita …">…</svg>'
Piezas.palomita(contenedor?, opciones)                    // → el <svg> (lo pone en el contenedor, sustituyendo a la que hubiera)
Piezas.dibujar(el)                                        // vuelve a dibujar la .palomita / .marca-estado de el
```
Trazo `pathLength=1`, de `stroke-dashoffset` 1 a 0 en 420 ms, **una vez**. `circulo:true` = marca llena verde (`--ok-fill` con trazo blanco); sin círculo = trazo en `currentColor`, para ir dentro de un botón. Mide 1.2em. **Se dibuja solo lo que nace**: si repintas una lista con innerHTML, las que ya estaban van con `{dibujar:false}`. **Idempotente en su caja**: si ya hay una palomita ahí, la nueva toma su lugar en vez de ponerse al lado (A14 marca renglón por renglón y F6 repinta el conteo del mes; una fila de ✓ creciendo dentro de un botón de 44 px no es lo que se pidió). **Menos movimiento**: aparece ya dibujada.

```js
// P13 · «Qué atender»: el renglón atendido
fila.querySelector('.ico').innerHTML = Piezas.palomitaHTML({ circulo: true });
// F6 · el renglón contado, repintado con outerHTML: solo el recién contado se dibuja
fila.outerHTML = filaExistencia(x, { palomita: Piezas.palomitaHTML({ circulo: true, dibujar: recienContado }) });
// A14 · «Coincide» renglón por renglón en verificar.html
Piezas.palomita(boton.querySelector('.ver-ico'), { circulo: true });
```

---

## Pieza 24 · El veredicto y el sello

```js
Piezas.marcaEstadoHTML(estado, { tam, etiqueta, clase })  // → cadena (ya dibujada, para listas que se repintan)
Piezas.marcaEstado(el, estado, { tam, etiqueta })         // → el .marca-estado (lo crea al principio de el si no hay)
Piezas.selloHTML({ texto, centro = 'AL3D', sub = 'AUTÉNTICA', gris, tam = 150, estampar = true, etiqueta, clase })
Piezas.sello(contenedor?, opciones)                       // → el <svg>
Piezas.circulo(cx, cy, r) · Piezas.letraCircular(texto, r) // lógica pura del texto circular
```
**Glifo de estado** (StatusMark): `estado` = `'espera'` (anillo punteado) · `'trabaja'` (arco que gira: solo mientras hay una espera real) · `'ok'` (✓ verde) · `'av'` (! ámbar) · `'mal'` (✕ rojo). Tamaño: `tam` en px (14, 16, 20, 44…), por omisión 1.15em. `aria-hidden` salvo que des `etiqueta` (→ `role="img"`). **El color nunca va solo**: pon la palabra al lado. `marcaEstado()` dibuja la marca al **cambiar** a un veredicto; `marcaEstadoHTML()` la pinta ya puesta.
```html
<span class="marca-estado" data-estado="ok" style="--tam:44px" aria-hidden="true"><svg>…</svg></span>
```
**Sello** (CircularText sin giro): aro + texto alrededor ajustado al perímetro (`textLength`) + «AL3D» al centro; cae una vez (`.estampa`) y se queda quieto; `gris:true` = gris y cruzado («ya no vigente», «revocada»). `Piezas.sello(caja, …)` también es **idempotente**: el sello nuevo sustituye al que hubiera en esa caja, así que consultar dos veces —o pasar de «Auténtica» a «Ya no vigente»— no deja dos sellos de 150 px diciendo cosas distintas. El texto va escapado; cada sello tiene su propio id de círculo. Lleva la hora de consulta y el dominio **en `texto`** (lo arma la página); la línea «La prueba es esta dirección, no la imagen» la escribe la página. Clases: `.sello-circular`, `.gris`, `.estampa`.

**Menos movimiento**: el arco queda quieto (el texto de al lado dice «Consultando…»), la marca aparece sin trazo, el sello solo aparece. En papel, todo quieto.

**Ejemplos**
```js
// A2 · verificar.html: el giro se vuelve el veredicto
const m = Piezas.marcaEstado('ver-est', 'trabaja', { tam: 44 });
/* al contestar la hoja */ Piezas.marcaEstado(m, v === 'autentica' ? 'ok' : v === 'no_vigente' ? 'av' : 'mal');

// A3 · el sello de «Auténtica»
Piezas.sello('ver-sello', { texto: 'AL3D · COTIZACIÓN AUTÉNTICA · ' + location.host + ' · CONSULTADA ' + fechaHora + ' ·' });
Piezas.sello('ver-sello', { texto: 'AL3D · YA NO VIGENTE · ' + location.host + ' ·', sub: 'NO VIGENTE', gris: true });

// C9 / H29 / P15 · en listas que se repintan:
insignia.innerHTML = Piezas.marcaEstadoHTML('trabaja', { tam: 16 }) + ' Pendiente';
Piezas.marcaEstado('cua-nota-estado', guardada ? 'ok' : 'av', { tam: 14 });
Piezas.marcaEstado('pf-sync', 'mal', { tam: 20, etiqueta: 'No se pudo sincronizar' });
```

---

## Pruebas

- `pruebas/piezas-avisos.mjs` (node): carga sin ventana; prioridad, duración y `decidir()` de la pila (incluye la falla 2 y la secuencia de venta.js); `reloj()`; la curva del relleno; el reloj que se pausa (razones que se cuentan, piso de 1.5 s, reiniciar, cancelar, `segundos` como función); sello, glifo y palomita escapados y con ids únicos.
- `pruebas/navegador/piezas-avisos.mjs` + `piezas-avisos.html` (vitrina): cada pieza con ratón, dedo (CDP) y teclado, a 360 y 420 px, con y sin menos movimiento, claro y oscuro; contraste medido del render —incluido el hermano que espera y con un fondo de verdad debajo cuando el botón no trae el suyo—; el foco que vuelve al irse el aviso; el error repetido que rearma su reloj y el informativo que no; el éxito que no acepta toques y el que sí (`volver:0`); palomita y sello que sustituyen en vez de apilarse; `textoHecho` que se dice; sin errores, sin desborde, sin animaciones infinitas en reposo; y la falla 2 en el cotizador, la plataforma y el anidador de verdad.
