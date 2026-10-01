# Fichas de la zona `cot-cliente`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### C6. Autocompletar clientes que se ve y se entiende
- **Dónde:** `cotizador.html` 311 (`#f-cli` con `<datalist id="clientes-conocidos">`) y 314 (`#cua-aviso`). `js/cotizador/nucleo.js` 737–759 (`clientesConocidos()`, `pintarClientes()`) y 776–787 (`autocompletarCliente()`). Verificado.
- **Hoy:** un `<datalist>` nativo, que en Android sale como tira sobre el teclado, sin teléfono ni pista de cuál «Farmacia San Juan» es. Al elegir, los campos se llenan y solo un aviso abajo dice cuáles.
- **Propuesta:** una lista propia bajo el campo, con nombre, teléfono y la última cotización del cuaderno. Los campos que llenó la app se iluminan un instante, para que se vea qué puso ella.
- **Sale de:** React Bits · GlideSelect (menú con resaltado que se desliza). El lavado de color viene de CodeSlots.
- **Cómo en vanilla:** patrón combobox (`role=combobox`, `aria-activedescendant`, flechas, Enter y Escape) sobre un `popover="manual"`. El resaltado es un solo elemento movido con `translateY`. El lavado es una clase de 600 ms que anima `background-color`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** respetar `vaciadoAMano()` para no devolver lo que alguien borró a propósito. Renglones de 44 px. En borrador, el importe del cuaderno va difuminado como los demás (`precios-ocultos`).

### C8. El teléfono se ve completo antes de chocar con él
- **Dónde:** `cotizador.html` 312 (`#f-tel`). `js/cotizador/proceso.js` 677 (`telIncompleto()`), 683–686 (`faltaTexto()`), 696–704 (`pintarObligatorios()`) y 2005–2014 (`upd()`). Verificado.
- **Hoy:** es texto libre. Que faltan dígitos solo se sabe al intentar continuar (ámbar más aviso), y un «33 1234 567» parece capturado.
- **Propuesta:** formato en vivo «33 1234 5678» y, en el borde derecho del campo, un contador «8/10» que al llegar a 10 se vuelve ✓ con un lavado verde.
- **Sale de:** React Bits · CodeSlots (ranuras que se llenan y se funden al completar). Alternativa: Skiper · skiper106 Smooth caret input (GRATIS).
- **Cómo en vanilla:** en `oninput`, volver a meter los espacios conservando el cursor (`selectionStart` recontado por dígitos). El contador es un `<span>` absoluto dentro de `.fld`, y el estado va en `aria-describedby`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** pegar «+52 33…» o con guiones tiene que seguir funcionando (se cuentan dígitos, como hoy). Los 16 px contra el zoom de iOS ya están puestos.

### C21. Una isla de estado junto al folio
- **Dónde:** `cotizador.html` 199–202 (`#folio`, `#sin-senal`). `js/cotizador/nucleo.js` 631–640 (`pintarConexion()`). `css/sistema.css` 3461–3463. Estados: `js/cotizador/proceso.js` 1685 (`_sellando`) y `notario.js` 274–280 (`_foliosEsperando()`). Verificado.
- **Hoy:** «Sin señal» aparece y desaparece de golpe. Que la hoja está sellando, o que hay una solicitud esperando, solo se ve bajando hasta la columna del dinero.
- **Propuesta:** una sola pastilla junto al folio que se desenrolla para decir lo que pasa fuera de la pantalla (sin señal · sellando · esperando a Dirección) y se enrolla sola al terminar.
- **Sale de:** React Bits · BellToggle. Alternativa: Skiper · skiper2 Dynamic island (PRO).
- **Cómo en vanilla:** `clip-path:inset()` transicionado entre el ancho del icono y el del rótulo, dentro de un solo `role="status"`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** la barra de arriba está medida al píxel (`css/sistema.css` 790–890): hasta 560 px, solo el icono y sin crecer. No se mueve sola: cambia cuando cambia el estado.

### C24. El folio que cambia se nota
- **Dónde:** `cotizador.html` 199 (`#folio`). Cambia en `js/cotizador/proceso.js` 1823 (`nueva()`) y 1337 (`cerrarEdicionCliente()`). Se pinta en `js/cotizador/historial.js` 1757–1770 (`pintarFolio()`). Verificado.
- **Hoy:** el folio se reescribe sin ninguna señal, y el error documentado es capturar otro cliente encima del mismo folio.
- **Propuesta:** al pasar a otro número, sus caracteres voltean una vez, como un tablero de salidas.
- **Sale de:** React Bits · SplitFlapText. Alternativa: Vengeance · Flip Text.
- **Cómo en vanilla:** un `<span>` por carácter con `rotateX`, escalonado cada 30 ms, solo si el folio anterior no estaba vacío.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `pintarFolio()` vive fuera de mi zona. La marca «sin guardar» no debe voltear.

### C25. Los botones de solo icono dicen su nombre con el dedo
- **Dónde:** `cotizador.html` 166–171 y 198 (Deshacer, Clientes, Historial, Tema, Plataforma). `css/sistema.css` 886–890 (hasta 560 px quedan solo con icono). `js/cotizador/partidas.js` 602–604 (duplicar, ojo, borrar). `js/cotizador/proceso.js` 1927–1929 (`.mbar-undo`). Verificado.
- **Hoy:** el nombre solo existe en `title` y `aria-label`, que en un teléfono no se ven.
- **Propuesta:** mantener presionado un icono muestra su nombre en una etiqueta. Con ratón, la primera tarda un poco y las vecinas salen al instante.
- **Sale de:** React Bits · WarmTooltip. Alternativa: Skiper · skiper101 Custom tooltip (GRATIS).
- **Cómo en vanilla:** `popover="manual"` posicionado con `getBoundingClientRect()`. Se abre con 450 ms de `pointerdown` y se cancela el `click` que viene después.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** en `.del`, el toque largo nunca puede terminar borrando la partida.

### C23. Otros lugares para lo ya propuesto (#1, #2, #4, #5, #6, #7)
- **Dónde:**
  - #1 odómetro: `js/cotizador/proceso.js` 1993–1996 (`.mbar-amt`) y 1133–1156 (`#paso-total-v`); `venta.js` 121–124 (`rvRecalc()`); `partidas.js` 715–716 (`#prog-pct`).
  - #2 ficha que se desliza: `cotizador.html` 354 y 1015 (`#f-plazo`, `#rv-plazo`).
  - #4 desglose en popover: `proceso.js` 1993 (el total del dock).
  - #5 mantener para confirmar: `proceso.js` 1754–1764 («Sí, borrar todo») y 1733–1753 (`rechazar()`); `nucleo.js` 657 (`confirmar()` con `peligro`).
  - #6 palomita dibujada: `proceso.js` 374–380 (hitos de entrega); `css/sistema.css` 703 (paso hecho); `cotizador.html` 1081 (`#rv-copied`).
  - #7 neón al autorizar: `notario.js` 490–508 (`autorizarRemota()`).
  - Verificado.
- **Hoy:** estos lugares repiten el mismo patrón que ya tiene pieza propuesta en otro sitio.
- **Propuesta:** usar la misma pieza, con el mismo código, en estos lugares.
- **Sale de:** lo ya propuesto (React Bits · Counter, RubberSegment, HoldButton, SpringCheck; Vengeance · Border Beam).
- **Cómo en vanilla:** las mismas funciones del sitio original, llamadas desde estos puntos.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** el dock se repinta en cada tecla, así que el odómetro solo debe rodar si el importe cambió. «Mantener para confirmar» va solo en lo destructivo.