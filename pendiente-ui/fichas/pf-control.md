# Fichas de la zona `pf-control`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### P3. Cuentas tocables que llevan a lo que cuentan
- **Dónde:** `js/mod/tablero.js` 509–546 (`cuentas()` y `unaCuenta()` pintan `<p class="pf-cuenta">`) y 984–1013 (`pintarMbar()`, que hace scroll sin señalar a dónde llegó). También `js/mod/inicio.js` 185–219 y `js/mod/control.js` 325–329. Verificado.
- **Hoy:** las cifras grandes no se pueden tocar. Para ver cuáles son los «3 van tarde» hay que buscarlos en la lista, y la barra fija lleva a una tarjeta sin decir cuál es.
- **Propuesta:** cada cuenta se vuelve botón. «Van tarde / No llegan» baja a su tarjeta, «Trabajos sin material» baja a «Falta material», «Ganados sin fecha» abre el Calendario con pase y «Por cobrar» abre esa pestaña de Control. La tarjeta de llegada se enciende una vez con el aro del acento.
- **Sale de:** React Bits · MagicBento (la ficha como puerta; solo su `clickEffect` breve). Alternativa: Vengeance · Highlight Grid.
- **Cómo en vanilla:** `<button class="pf-cuenta">` + `scrollIntoView({behavior:scrollSuave()})` + la clase `.sc-flash`, que ya existe (`sistema.css` 1914–1915) y se aplica una sola vez.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** la línea de estaciones también es `.pf-cuenta` pero FILTRA. El KPI tiene que distinguirse (una flecha de «ir»). Con cuenta en 0 no lleva a ningún lado.

### P16. «Traer la hoja» que enseña su avance
- **Dónde:** `js/mod/control.js` 222–245 (`lineaHoja()`, botón en 225–227) y 175–205 (`traerDeLaHoja()`). Verificado.
- **Hoy:** el botón dice «Trayendo la hoja…» y se deshabilita. No dice cuántas páginas van (pueden ser hasta 20) y el resultado llega en un toast aparte.
- **Propuesta:** el botón se va llenando por página traída con «página 3 · 2,1 s». Termina en verde con «12 cambios» o se detiene en rojo con «Reintentar».
- **Sale de:** React Bits · CallChip.
- **Cómo en vanilla:** `::before` con `transform:scaleX(var(--p))` actualizado en cada vuelta y el texto con `textContent`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `pintar()` rehace toda la pantalla (251–265). Durante la bajada hay que tocar solo el botón. El refresco silencioso al entrar no lo enciende.

### P18. Las cuentas ruedan cuando la sincronización cambia algo
- **Dónde:** `js/app.js` 1149–1153 (remonte cuando bajan cambios), `js/mod/tablero.js` 509–546, `js/mod/proyectos.js` 395–414 (`pintarCuentas()`) y `js/mod/control.js` 325–329. Verificado.
- **Hoy:** cuando llega algo de otro teléfono, «Van tarde 2» pasa a 3 en seco y nadie se da cuenta.
- **Propuesta:** el odómetro (idea #1), llevado aquí. Si una cuenta cambió respecto a la última vez que se pintó, la cifra rueda del valor viejo al nuevo y aparece un «+1» breve. Nunca al entrar a la pantalla.
- **Sale de:** React Bits · Counter. Alternativa: Vengeance · Animated Number.
- **Cómo en vanilla:** `@property --n <integer>` + `counter()`, o dígitos que se desplazan con `translateY`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** `desmontar()` pone `_d` en null, así que el valor previo se guarda fuera de él. Los importes mantienen sus dos decimales y el ancho `--c` de `cifraQueCabe()`.

### P27. Barras de doce meses que crecen una vez y un mes que se puede abrir
- **Dónde:** `js/mod/control.js` 334–359 (`graficaMeses()`) y `css/plataforma.css` 1781–1799 (`.ct-b{transition:width}` en 1787–1788, que nunca corre). Verificado.
- **Hoy:** las barras nacen ya con su ancho final y un mes no se puede tocar. Para saber qué se vendió en agosto hay que filtrar la lista a mano.
- **Propuesta:** al entrar a Ventas, las barras crecen una sola vez desde 0. Tocar un mes abre un popover con sus ventas y su total: el desglose en popover (idea #4), llevado aquí.
- **Sale de:** Vengeance · Stats Counter (disparo único al verse). Alternativa: React Bits · AnimatedContent.
- **Cómo en vanilla:** poner el ancho en una variable después de un `requestAnimationFrame`, `IntersectionObserver` para disparar al verse, y la API `popover`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** un mes en cero no lleva barra (342–346). No volver a animar cuando la búsqueda repinta (621–625).

### P30. Una barra de cuánto va cobrado en «Por cobrar»
- **Dónde:** `js/mod/control.js` 495–519 (`filaCobro()`) y 472–493. Verificado.
- **Hoy:** cada venta dice «vendido $X · anticipo $Y» y el saldo aparte. Para comparar cuánto falta de cada una hay que hacer la resta.
- **Propuesta:** una barra fina debajo del texto, con lo cobrado en un color, el saldo en ámbar y el porcentaje escrito.
- **Sale de:** React Bits · SloshGauge (solo la lectura del nivel, sin la física).
- **Cómo en vanilla:** `<meter>`, o dos `<i>` con ancho en porcentaje como las barras de `ct-grafica`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** cuando el saldo es estimado y no de la hoja (`x.deNotion`), la barra va rayada. Palabra además de color.