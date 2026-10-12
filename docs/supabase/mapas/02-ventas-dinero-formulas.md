# Mapa 02 — Ventas, dinero y fórmulas (hoja «Finanzas AL3D»)

Repo leído: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, con PR #99).
Archivo principal: `puente/hoja-apps-script.gs` (5913 líneas; abreviado `.gs`). También leídos: `puente/README.md`, `puente/DESPLIEGUE.md`, `docs/PLAN-SUPABASE.md`, y del lado cliente `js/datos/puente.js`, `js/datos/proyectos.js` (sellos y roles), `js/datos/ventas.js`, `js/datos/asistente-contexto.js`, `js/cotizador/venta.js`.

Convenciones del mapa:
- `.gs:NNN` = línea de `puente/hoja-apps-script.gs`. `puente.js:NNN` = `js/datos/puente.js`.
- Todo lo escrito entre `` ` ` `` en fórmulas está copiado de código, no parafraseado. Las fórmulas están **resueltas** (se evaluó `formulasVentas` con un `h` de mentiras y se imprimió lo que escribiría; FIN=310).
- **NO CONFIRMADO** = no pude verificarlo en el repo (casi siempre: comportamiento interno de Google Sheets, o estado de la hoja viva). No toqué la hoja viva ni ninguna cuenta: todo es lectura del repo.
- Nombres de propiedad del puente tienen espacios finales donde los tienen: `'Cuenta '` y `'Precio Neto '` (con espacio final).

---

## 0. Advertencias de confianza (leer primero)

1. **La copia del repo no es necesariamente la hoja viva.** `README.md` (sección «Antes de pegar nada») dice que «la copia que manda es la de la hoja»; en sept-2026 el repo iba 500 líneas atrás. `DESPLIEGUE.md:384` dice que este `.gs` «parte del `puente-sheets-13` que corre hoy en la hoja» y que la 14 (AG:AI, sellos) se pega entero. **NO CONFIRMADO** que la hoja viva ya corra `puente-sheets-14` (`PUENTE_VERSION`, `.gs:1881`) ni que tenga las columnas AG:AI. Verificar con `/salud` (campo `version`) o mirando la fila 1 de Ventas.
2. Los encabezados de A1:X1 que aparecen abajo son los de `HEAD` (`.gs:20-24`), que `agregarColumnas` reescribe en cada corrida de `mejorarTodo` (`.gs:167`). Los de Y1:AI1 son los de `prepararHojaParaElPuente` (`.gs:4672-4684`). Si nadie volvió a correr esas funciones, la fila 1 real podría diferir. **NO CONFIRMADO contra la hoja viva.**
3. **El puente identifica columnas por NÚMERO (`COL`, `.gs:1915-1960`), no por encabezado.** Los nombres de propiedad del puente (vocabulario heredado de Notion) NO coinciden con los encabezados de la hoja (p. ej. propiedad `Precio Subtotal` ↔ encabezado `Subtotal`). Un script de importación que lea por encabezado se equivoca; hay que leer por letra de columna. Solo `rutaEsquema_` (`.gs:2465`) y `prepararHojaParaElPuente` buscan por encabezado, y solo para Y:AI.
4. Tamaño: `FIN = 310` (`.gs:9`) ⇒ **309 filas de ventas como máximo** (filas 2..310). Todas las fórmulas y vistas tienen `$2:$310` fijo. `/jalar` lee `FIN - 1` filas (`.gs:2510`). `primeraFilaLibre` devuelve 0 si no hay lugar y la alta falla con «Ya no hay filas libres antes de la 310» (`.gs:2831`). README (línea 146) dice que ya hay «199 filas anteriores a la plataforma». Abonos: máximo 1999 renglones (filas 2..2000).

---

## 1. Hoja «Ventas», columna por columna

Fila 1 = encabezados; datos en filas 2..310. Las fórmulas viven **solo en la fila 2** como `ARRAYFORMULA` que derrama hasta la 310 (las celdas 3..310 de esas columnas se vacían, `.gs:206-209`); no se escriben nunca por fila.

«Escribe» = quién puede dejar el dato ahí. Hay 4 caminos de escritura:
- **P** = puente (`/empujar`, filtrado por `PUENTE_ROLES`, `.gs:2120-2136`; ver §5).
- **M** = formularios del menú ⚡ AL3D (`dialogoVenta`, `dialogoCobro`, `dialogoAbono`, `dialogoReparto`), que escriben con `setValue` sin pasar por rol.
- **H** = tecleo a mano en la hoja (cualquiera con acceso de edición; la única protección es `setWarningOnly(true)` sobre las columnas calculadas, `.gs:4788-4797`).
- **S** = script (folio, fórmulas, `ordenarVentas`, `normalizarIvaActivos`).
«Lee» = quién la recibe por `/jalar` (`PUENTE_ROLES`/`CAMPOS_DE_DINERO`, §5.3). La hoja misma la ve cualquiera con acceso al archivo (sin filtro por rol).

| Letra | # | Encabezado fila 1 (exacto) | Propiedad del puente (`COL`) | Qué es / tipo | Captura o fórmula | Escribe (rol por P) | Lee por /jalar |
|---|---|---|---|---|---|---|---|
| A | 1 | `Folio` | `id_notion` (se manda como `fila[0]`; NO está en `COL`, es `COL_FOLIO=1`, `.gs:1962`) | id interno `V-001`, texto. Formato `'V-' + número con al menos 3 dígitos` (`folioDeNumero`, `.gs:1368`). Único por venta | **Capturado por script** (no es fórmula, aunque `A` está en `CALC` `.gs:27` solo por color y protección con aviso). Lo asigna `reservarFolios` (`.gs:1401`) / `alEditar` / `fijarFolios` | S. P nunca lo escribe (`armarCeldas` rechaza lo no listado). `/empujar` lo busca con `filaPorFolioInterno` (`.gs:3090`) | todos |
| B | 2 | `Proyecto` | `Proyecto` | nombre «Cliente - Negocio», texto ≤2000 | capturado | P: dirección. M: Nueva venta. H | todos |
| C | 3 | `Estatus` | `Estatus` | estatus de DINERO. Lista cerrada `ESTATUS` (`.gs:37`): `FABRICACION`, `REPARANDO`, `COBRANDO`, `LIQUIDADO` (sin acentos, mayúsculas) | capturado | P: dirección, pagos (valor fuera de lista se rechaza, `.gs:2986-2988`). M: Nueva venta, Registrar cobro (`LIQUIDADO`, `.gs:1661`). H (validación cerrada en UI) | todos (el estatus baja a fabricación a propósito, `.gs:2147`) |
| D | 4 | `Cuenta` | `'Cuenta '` (espacio final) | cuenta de cobro. Lista cerrada `CUENTAS` (`.gs:29`): `Elias BBVA`, `Constru BNT`, `Moni MPago`, `Rul HSBC`, `Tatis BNT` | capturado | P: dirección, pagos (lista cerrada, `.gs:2989-2991`). M. H | dirección, pagos (**no** fabricación: está en `CAMPOS_DE_DINERO`) |
| E | 5 | `Tipo de trabajo` | `Tipo de trabajo` | uno o varios de `TIPOS_TRABAJO` (`.gs:2114`), unidos con `', '` en una celda; validación **abierta** | capturado | P: dirección (lista de tipos validada contra `TIPOS_TRABAJO`; se guarda `arr.join(', ')`, `.gs:2995-3000`). Además `clasificarTipos` (`.gs:212`) rellena E vacía por regex sobre el nombre en `mejorarTodo` | todos (llega como arreglo: `desdeTexto` parte por `/\s*,\s*/`, `.gs:2596`) |
| F | 6 | `IVA` | `IVA` | `Sí` / `No`, lista cerrada | capturado **pero la cuenta lo manda** (ver §2.7) | P: dirección (`valor ? 'Sí' : 'No'`). S: `normalizarIvaActivos`, `aplicarIva` lo reescriben. M. H | todos (no está en `CAMPOS_DE_DINERO`). Llega como booleano `String(v).trim() === 'Sí'` (`.gs:2543`) |
| G | 7 | `Subtotal` | `'Precio Subtotal'` | subtotal **sin IVA**, número (formato `"$"#,##0.00`). Sin redondeo al guardar | capturado | P: dirección (`Number(valor)`, finito; **puede ser negativo**, `.gs:3003-3009`). M. H | dirección, pagos |
| H | 8 | `Precio neto` | `'Precio Neto '` (espacio final) | subtotal con IVA | **FÓRMULA** | nadie (rechazo: `PUENTE_FORMULAS`, `.gs:2103-2109`) | dirección, pagos |
| I | 9 | `Anticipo` | `Anticipo` | anticipo cobrado, número | capturado | P: dirección, pagos (`Number`, **≥ 0**, `.gs:3008`). M: Nueva venta. H | dirección, pagos |
| J | 10 | `Liquidación` | `Liquidacion` (sin acento) | suma de lo cobrado después del anticipo, número | capturado | P: dirección, pagos (≥ 0). **El teléfono nunca la manda** (ver §5.5). M: «Registrar un cobro» **suma** `previo + monto` (`.gs:1654-1655`). H | dirección, pagos |
| K | 11 | `Saldo por cobrar` | `'Pago Pendiente'` | `neto − anticipo − liquidación`; **positivo = te deben** | **FÓRMULA** | nadie | dirección, pagos |
| L | 12 | `Fecha anticipo` | `'Fecha Anticipo e Instalacion'` | fecha del anticipo (de aquí salen año/mes y antigüedad) | capturado | P: **solo dirección** (`YYYY-MM-DD` o vacío, `.gs:3016-3020`). M. H | todos (no está en `CAMPOS_DE_DINERO`); sale `yyyy-MM-dd` con la zona de la hoja |
| M | 13 | `Fecha instalación` (con acento) | `'Fecha instalacion'` | fecha de instalación (la cita) | capturado, **sellada** (§4) | P: dirección, fabricación. M: Nueva venta. H | todos |
| N | 14 | `Fecha liquidación` | `'Fecha Liquidacion'` | fecha del último cobro | capturado | P: dirección, pagos. M: Registrar cobro. H | dirección, pagos |
| O | 15 | `Días de cobro` | — (no sale por /jalar) | `N − L` | FÓRMULA | — | — |
| P | 16 | `Días de antigüedad` | — | días desde instalación (o anticipo) de lo que aún se debe | FÓRMULA | — | — |
| Q | 17 | `Antigüedad` | — | cubo de antigüedad (texto) | FÓRMULA | — | — |
| R | 18 | `Comisión 10%` | `Comisiones` | comisión de AL3D | **FÓRMULA** (10 % del subtotal) | nadie | dirección, pagos |
| S | 19 | `Abono comisión` | `'Abono Comision'` | suma de abonos de la pestaña «Abonos comisión» | **FÓRMULA** al leer; **al escribir por P es AGREGAR un renglón** en Abonos (§3.1, `.gs:2968-2979`) | P: dirección, pagos (solo positivos ≤ 1e7) | dirección, pagos |
| T | 20 | `Comisión pendiente` | `'Comision Restante'` | `R − S` | **FÓRMULA** | nadie | dirección, pagos |
| U | 21 | `Pagos de comisión` | — | cuántos renglones de abono tiene el folio | FÓRMULA | — | — |
| V | 22 | `Año` | — | `YEAR(L)` | FÓRMULA | — | — |
| W | 23 | `Mes` | — | `yyyy-mm` de L | FÓRMULA | — | — |
| X | 24 | `Revisar` | — | bandera de calidad de dato | FÓRMULA | — | — |
| Y | 25 | `Folio cotizacion` | `Folio cotizacion` | llave a la cotización, `COT-0042@K7QM` (folio local + `@` + dispositivo) | capturado | P: dirección. **No se pisa en un cambio** si la fila ya tiene uno distinto (`.gs:2841-2863`). Se manda además aparte como `folio_cotizacion` para identificar fila | todos |
| Z | 26 | `Etapa de obra` | `Etapa de obra` | lista cerrada `ETAPAS_OBRA` (`.gs:2111`): `Ganado`, `En diseño`, `Cortado`, `Armado`, `Listo para instalar`, `Instalado`, `En garantía`, `No se dio` | capturado, **sellada** | P: dirección, fabricación (**sin tope de etapa**; ver Contradicciones) | todos |
| AA | 27 | `Hora instalacion` | `Hora instalacion` | `HH:MM` texto (celda en formato `@`) | capturado, **sellada con la fecha** | P: dirección, fabricación | todos (`horaDeCelda`, `.gs:2643`) |
| AB | 28 | `Ubicacion` | `Ubicacion` | `lat,lng` o link de Maps que no se pudo leer | capturado, **sellada** | P: dirección, fabricación. M: Nueva venta | todos |
| AC | 29 | `Direccion` | `Direccion` | texto ≤2000 | capturado, **sellada** | P: dirección, fabricación. M | todos |
| AD | 30 | `Porcentaje comision` | `Porcentaje comision` | % en puntos (10 = 10 %), 0..100. **Ninguna fórmula lo lee** | capturado, informativo | P: dirección, pagos (vacío/null borra la celda) | dirección, pagos |
| AE | 31 | `Telefono` | `Telefono` | texto (celda `@`), ≤30 | capturado, **sellada** | P: **los tres** roles. M | todos |
| AF | 32 | `Entrega` | `Entrega` | lista cerrada `ENTREGAS`: `Instalación`, `Paquetería`, `Recolección en taller`; vacía = Instalación | capturado, **sellada** | P: dirección, fabricación | todos |
| AG | 33 | `Notas` | `Notas` | texto libre ≤40000 (celda `@`) | capturado, **sellada** | P: los tres roles | todos |
| AH | 34 | `Plazo taller` | `Plazo taller` | uno de `PLAZOS_TALLER` (`.gs:1997`): `1 semana`, `1.5 semanas`, `2 semanas`, `2.5 semanas`, `3 semanas o más`; vacío = «el que propone la plataforma» | capturado, **sellada** | P: dirección, fabricación | todos |
| AI | 35 | `Sellos` | `Sellos` | JSON de sellos por dato (§4). Columna oculta, formato `@` | script | **No la escribe ningún rol** (`Sellos` no está en ninguna lista de `PUENTE_ROLES`): la pone `unaOperacion`/`alEditar`/`sellarFila_` | todos, **ya parseada como objeto** (`sellosDeCelda_`); solo si la hoja tiene AG:AI |

Notas de la tabla:
- `ULTIMA_COL = 35` (`.gs:1963`). `anchoDelPuente(h)` (`.gs:1976`) recorta lo que se lee/escribe a las columnas que la hoja tenga: AE cuenta solo si su encabezado dice `Telefono`; AF solo si dice `Entrega` (y hay AE); AG:AI solo si los tres encabezados dicen `Notas`, `Plazo taller`, `Sellos` (`tieneColumnasDeObra`, `.gs:1987`).
- Columnas **capturadas** que viajan con su fila al reordenar (`bloquesCapturados`, `.gs:971`): `[[1,7],[9,10],[12,14],[25,35]]` = A:G, I:J, L:N, Y:AI. Las fórmulas son H, K, O:X (no se mueven).
- Hasta la 14, `Etapa de obra` NO tenía sello; ahora sí.
- Validaciones de UI (solo desplegables de Sheets, el script no las respeta al escribir por `setValue`): C y D cerradas, E abierta, F `Sí/No` cerrada, Z cerrada (`.gs:4737`), AF cerrada, AH cerrada.

### 1.1 Cómo se reordena la hoja (afecta el orden de /jalar y lo que un espejo debería respetar)

`ordenarVentas` (`.gs:981-1025`): filas con `B` lleno primero, luego vacías. Dentro de las llenas: por prioridad de estatus (`FABRICACION`=0, `REPARANDO`=1, `COBRANDO`=2, `LIQUIDADO`=3, cualquier otro=4, `prioridadEstatus` `.gs:938`) y luego por número de folio **descendente** (`numeroDeFolio`, `/^V-(\d{1,7})$/i`, `.gs:949`). Corre al final de cada `/empujar` y cuando se edita la columna C a mano. **No corre mientras Y:AD no estén «realineadas»** (`PROP_ALINEADAS`, `.gs:984-990`): ese paso de una sola vez es un artefacto de la migración y no hay que portarlo.

### 1.2 Folios

`FOLIO_MAS_ALTO` (propiedad del script, `.gs:1366`): marca que solo sube. `marcaDeFolios` (`.gs:1386`) = máximo entre la marca guardada y todo folio visible en Ventas; la primera vez se siembra con Ventas, `Ventas (respaldo)`, `Bitácora del puente` (col C) y `Abonos comisión` (col A). `reservarFolios(h,k)` entrega `V-{n+1}…`. `recordarFolio` sube la marca si un teléfono pregunta por un folio borrado (ignora si `n > alto + 1000`). Regla para SQL: **un folio no se reparte dos veces aunque se borre la venta** (secuencia, no `max()+1`).

---

## 2. Fórmulas exactas, redondeo y vacíos

### 2.1 Constantes
- IVA = **16 %** (literal `16%` en H). Comisión = **10 %** (literal `10%` en R). Umbral de «hay saldo» = **0.004** (en K/P/X y en todos los filtros). Cuenta que no factura: `CUENTA_SIN_FACTURA = 'Elias BBVA'` (`.gs:935`). Rangos de antigüedad: `'0-30 días'`, `'31-60 días'`, `'61-90 días'`, `'Más de 90 días'` (`RANGOS`, `.gs:41`).

### 2.2 Fórmulas de la fila 2 (resueltas; fuente `formulasVentas`, `.gs:170-210`)

```
H  Precio neto        =ARRAYFORMULA(IF($B$2:$B$310="","",ROUND($G$2:$G$310*(1+IF($F$2:$F$310="Sí",16%,0)),2)))
K  Saldo por cobrar   =ARRAYFORMULA(IFERROR(ROUND($H$2:$H$310-$I$2:$I$310-$J$2:$J$310,2),""))
O  Días de cobro      =ARRAYFORMULA(IF(($L$2:$L$310="")+($N$2:$N$310="")>0,"",$N$2:$N$310-$L$2:$L$310))
P  Días de antigüedad =ARRAYFORMULA(IF(($B$2:$B$310="")+($L$2:$L$310="")+($C$2:$C$310="FABRICACION")>0,"",IF($K$2:$K$310>0.004,TODAY()-IF($M$2:$M$310="",$L$2:$L$310,$M$2:$M$310),"")))
Q  Antigüedad         =ARRAYFORMULA(IF($P$2:$P$310="","",IF($P$2:$P$310<=30,"0-30 días",IF($P$2:$P$310<=60,"31-60 días",IF($P$2:$P$310<=90,"61-90 días","Más de 90 días")))))
R  Comisión 10%       =ARRAYFORMULA(IF($B$2:$B$310="","",ROUND($G$2:$G$310*10%,2)))
S  Abono comisión     =ARRAYFORMULA(IF($B$2:$B$310="","",SUMIF('Abonos comisión'!$A$2:$A$2000,$A$2:$A$310,'Abonos comisión'!$C$2:$C$2000)))
T  Comisión pendiente =ARRAYFORMULA(IFERROR(ROUND($R$2:$R$310-$S$2:$S$310,2),""))
U  Pagos de comisión  =ARRAYFORMULA(IF($B$2:$B$310="","",COUNTIF('Abonos comisión'!$A$2:$A$2000,$A$2:$A$310)))
V  Año                =ARRAYFORMULA(IF(($B$2:$B$310="")+($L$2:$L$310="")>0,"",YEAR($L$2:$L$310)))
W  Mes                =ARRAYFORMULA(IF(($B$2:$B$310="")+($L$2:$L$310="")>0,"",TEXT($L$2:$L$310,"yyyy-mm")))
X  Revisar            =ARRAYFORMULA(IF($B$2:$B$310="","",IF(($A$2:$A$310<>"")*(COUNTIF($A$2:$A$310,$A$2:$A$310)>1),"Folio repetido",IF(($D$2:$D$310<>"")*($F$2:$F$310<>IF($D$2:$D$310="Elias BBVA","No","Sí")),"IVA no corresponde a la cuenta",IF($K$2:$K$310<-0.004,"Cobrado de más",IF($T$2:$T$310<-0.004,"Comisión pagada de más",IF(($C$2:$C$310="LIQUIDADO")*($K$2:$K$310>0.004),"Liquidado con saldo",IF(($C$2:$C$310="LIQUIDADO")*($N$2:$N$310=""),"Falta fecha de liquidación",""))))))))
```

Comentario del propio código sobre R (`.gs:181-185`): la comisión es FIJA, 10 % del **SUBTOTAL (G)**, no del neto; el IVA no entra; `AD` «Porcentaje comision» **no se usa**; «si algún día la comisión se pactara por venta, este renglón es el único lugar que habría que cambiar». Lo confirma `pruebas/precios-cliente.mjs:309` (regex sobre la fórmula R = 10).

### 2.3 Traducción a SQL (propuesta; semántica exacta del original)

| Columna | Semántica exacta | Notas |
|---|---|---|
| H neto | `NULL` si proyecto vacío; si no `round(coalesce(subtotal,0) * (1 + case when iva then 0.16 else 0 end), 2)` | `IVA` verdadero ⇔ celda F = `Sí`. Ver §6 sobre mayúsculas |
| K saldo | `round(neto - coalesce(anticipo,0) - coalesce(liquidacion,0), 2)`; `NULL` si no hay neto o si algún operando es texto no numérico | **No depende del estatus**: una venta `LIQUIDADO` con liquidación incompleta sigue con saldo > 0 (la bandera X lo dice) |
| R comisión | `NULL` si proyecto vacío; si no `round(subtotal * 0.10, 2)` | Subtotal negativo ⇒ comisión negativa. **No lee `pct_comision`** |
| S abonado | `NULL` si proyecto vacío; si no `coalesce(sum(abonos.importe) filter (where abonos.folio = ventas.folio_hoja), 0)` | Cruce por el folio `V-xxx` (col A), **no** por folio de cotización |
| T restante | `round(R - S, 2)`; `NULL` si R es vacío | Puede ser negativo (comisión pagada de más) |
| U pagos | `NULL` si proyecto vacío; si no `count(abonos) where folio = folio_hoja` | Cuenta renglones, también los negativos |
| O días de cobro | `fecha_liquidacion - fecha_anticipo` si ambas existen; si no `NULL` | |
| P antigüedad | `NULL` si proyecto vacío, o `fecha_anticipo` nula, o `upper(estatus)='FABRICACION'`; si no, si `K > 0.004` ⇒ `current_date(zona hoja) - coalesce(fecha_instalacion, fecha_anticipo)`, si no `NULL` | Cuenta desde la **instalación**, no desde la liquidación. Con instalación futura sale negativo (cae en `0-30 días`). Si `fecha_anticipo` es nula la venta **no entra a ningún cubo** aunque deba |
| Q cubo | `P <= 30`→`0-30 días`; `<=60`→`31-60 días`; `<=90`→`61-90 días`; si no `Más de 90 días`; `NULL` si P vacío | |
| V año / W mes | `extract(year from fecha_anticipo)` / `to_char(fecha_anticipo,'YYYY-MM')`; `NULL` si no hay proyecto o fecha | **Por fecha de anticipo**, no de instalación ni de liquidación |
| X revisar | primera que cumpla, en este orden: (1) proyecto vacío → `''`; (2) folio no vacío y repetido → `Folio repetido`; (3) cuenta no vacía y `IVA ≠ (cuenta = 'Elias BBVA' ? 'No' : 'Sí')` → `IVA no corresponde a la cuenta`; (4) `K < -0.004` → `Cobrado de más`; (5) `T < -0.004` → `Comisión pagada de más`; (6) estatus `LIQUIDADO` y `K > 0.004` → `Liquidado con saldo`; (7) estatus `LIQUIDADO` y `N` vacío → `Falta fecha de liquidación`; si no `''` | |

### 2.4 Redondeo
- `ROUND(x, 2)` de Sheets (mitad **alejándose de cero**; en Postgres `round(numeric, 2)` hace lo mismo). Se aplica solo en H, K, R, T. **G, I, J no se redondean al guardar**: `armarCeldas` hace `Number(valor)` tal cual (`.gs:3004`), así que pueden llevar más de 2 decimales. Conviene que las columnas de importe en Postgres sean `numeric` sin escala forzada, o que se decida redondear a 2 al importar y se valide contra la hoja.
- Verifiqué en JS con doble precisión: para subtotales con centavos terminados en 5, `G*10%` cae exactamente en empate (x.xx5). Un redondeo ingenuo en punto flotante (JS/`double precision`) difiere del redondeo decimal exacto en ~2 % de esos casos (p. ej. G=1.45 → 0.145 se vuelve 0.14 en flotante, 0.15 en decimal). Para H (×1.16) con subtotales de 2 decimales **no** hay empates posibles. **NO CONFIRMADO** cuál de los dos resultados da Sheets en un empate real (Sheets suele redondear sobre el valor decimal mostrado, pero no lo pude comprobar aquí). Por eso la prueba de cuadre contra la hoja debe incluir subtotales con centavos en 5.
- Cliente: `js/cotizador/venta.js:236` calcula `com = sub*COMISION_PCT/100` **sin** `ROUND` y la muestra con `money()` (que redondea a centavos); `js/datos/asistente-contexto.js:51-65` recalcula con `red2(sub * 10 / 100)` si no hay R de la hoja. Cuando la hoja manda R, el cliente usa R.

### 2.5 Vacíos y texto en columnas numéricas (comportamiento del original)
- `B` vacío ⇒ la fila «no existe»: H, R, S, U, X devuelven `""`; K y T también (el `IFERROR` atrapa la resta con `""`). `/jalar` salta las filas con `!datos[i][1]` (`.gs:2519`).
- `B` lleno y `G` vacío ⇒ H = 0 y R = 0 (celda vacía cuenta 0 en aritmética).
- `I`, `J` vacíos cuentan 0.
- `G`, `I` o `J` con texto no numérico ⇒ H da error (**H no tiene IFERROR**), K y T quedan `""`. **NO CONFIRMADO** (comportamiento de Sheets): un texto numérico tipo `"100"` se coerciona a número en aritmética; `""` (cadena vacía de otra fórmula) en aritmética da `#VALUE!`.
- `rutaJalar_` convierte con `num = x === '' || x === null ? null : Number(x)` (`.gs:2533`): texto no numérico → `NaN` → `null` en JSON; una fecha tecleada en una columna numérica → milisegundos de epoch (basura). En la base, usar tipos numéricos estrictos evita esto; el importador debe decidir qué hacer con celdas sucias (hoy esas celdas simplemente «no existen» para el teléfono).
- Fechas: `fecha()` devuelve `null` si la celda no es un `Date` (una fecha tecleada como texto no baja). Formato de salida `yyyy-MM-dd` con la zona de la **hoja** (`getSpreadsheetTimeZone`, `.gs:2515`).

### 2.6 IVA no es un dato libre: lo manda la cuenta
- `ivaDeCuenta(cuenta)` (`.gs:1043`): `Elias BBVA` → `No`; cualquier otra → `Sí`.
- `normalizarIvaActivos` (`.gs:1057-1067`) corre al final de **cada `/empujar`** (`.gs:2698`) y en `mejorarTodo`: para toda fila con proyecto y cuenta no vacíos y estatus **distinto de `LIQUIDADO`**, reescribe F al valor que dicta la cuenta. Es decir, **un `IVA` mandado por el teléfono se descarta** si la cuenta dice otra cosa, salvo que la venta ya esté `LIQUIDADO` o no tenga cuenta (el histórico no se toca).
- `aplicarIva` (`.gs:1048`, desde `alEditar` al editar la col D a mano) **no** exceptúa `LIQUIDADO`.
- Consecuencia para el port: o la base aplica la misma regla (trigger/función: `iva := (cuenta <> 'Elias BBVA')` para ventas abiertas con cuenta), o el espejo y la base divergirán en F y, por tanto, en H/K/R.

### 2.7 Comisión: «generada» vs «abonable»
La hoja genera comisión (R) para **toda** venta con nombre, sin importar el estatus, y la «pendiente» (T) es R − abonos. Los filtros «pendientes» son `T > 0.004`. La noción «se abona cuando la venta queda LIQUIDADA» (`abonable`) vive **solo en el cliente** (`comisionDe`, `asistente-contexto.js:51`); la hoja no la tiene. El cliente además recorta con `Math.max(0, …)` (`comisionDe`, `saldoDe` en `ventas.js:59`), y la hoja **no**: negativos existen en la hoja.

---

## 3. Pestañas derivadas y de apoyo

### 3.1 «Abonos comisión» (`ABONOS`, `.gs:18`) — datos, no cálculo
Creada por `crearAbonos` (`.gs:234-262`). Datos en filas 2..2000.

| Col | Encabezado | Contenido | Quién escribe |
|---|---|---|---|
| A | `Folio` | folio de la venta `V-xxx` (llave contra Ventas!A) | puente, formulario, reparto, a mano |
| B | `Proyecto` | **fórmula**: `=ARRAYFORMULA(IF($A$2:$A$2000="","",IFERROR(VLOOKUP($A$2:$A$2000,Ventas!$A$2:$B$310,2,FALSE),"— folio no encontrado —")))` (`.gs:240-242`) | nadie (no cuenta para «renglón vacío») |
| C | `Importe` | pesos; positivo normalmente. Formato `"$"#,##0.00` | ídem |
| D | `Fecha` | fecha (formato `dd/mm/yyyy`) | ídem |
| E | `Nota` | texto | ídem |
| F | `Pago` | id de depósito `P-001`… (la crea `prepararColumnaPago`, `.gs:4835`, al armar «Comisiones por periodo» o al repartir) | solo el reparto FIFO |

Cómo entra un abono (tres caminos, mismo candado `LockService.getScriptLock()`):
1. **Puente** `Abono Comision` (roles dirección y pagos): `registrarAbonoDesdePuente` (`.gs:3076-3088`) escribe A=folio de la fila, C=importe, **D=`new Date()` (con hora)**, E=`'Registrado desde la plataforma'`, F vacía. Validación: `Number(valor)` finito, `> 0`, `≤ 1e7` (`.gs:2975-2977`). **La plataforma no manda este campo** (`aNotion`, `puente.js:284`).
2. **Formulario** «Registrar abono de comisión» (`guardarAbonoConCandado_`, `.gs:1731`): A=folio, C=`Number(monto)` (acepta negativos), D=`fechaDe(fecha)` (medianoche), E=nota opcional.
3. **Reparto FIFO** «Repartir un abono entre comisiones» (`.gs:4826-4958`): `pendientesFIFO` = ventas con folio y proyecto y `round(T,2) > 0.004`, ordenadas por `numeroDeFolio` ascendente; `calcularReparto(monto)`: `resta = round(monto,2)`; para cada una `toca = round(min(resta, pend),2)`, `resta = round(resta - toca,2)`, mientras `resta > 0.004`; lo que sobra no se aplica. Escribe `n` renglones consecutivos con un id `P-###` (`siguienteIdPago`: `'P-' + ('000'+(max+1)).slice(-3)`; ojo, desborda a `P-000` al llegar a 1000), nota `[nota + ' · '] + 'Reparto P-### de $monto'`.
- «Renglón libre» (`filaLibreEnAbonos`, `.gs:4907`): sin nada en A ni en C..F (B no cuenta).
- Una corrección de abono se hace **a mano** en la pestaña (aquí sí se admiten negativos).

### 3.2 «Comisiones por periodo» (`HOJA_PERIODO`, `.gs:5037`; se arma con `construirComisionesPorPeriodo`, menú «📅 Rehacer vista de comisiones por periodo»)
**No toca Ventas** salvo por la fórmula de nombre de Abonos!B. Todo sale de `'Abonos comisión'` (rangos de `rangosAbonos`, `.gs:5041`: `folio=A, proy=B, imp=C, fecha=D, nota=E, pago=F`, filas 2..2000).

Controles: `B4` = periodo (lista `PERIODOS`: `Últimos 2 meses` (por defecto), `Mes actual`, `Mes anterior`, `Últimos 3 meses`, `Últimos 6 meses`, `Año actual`, `Todo`, `Personalizado`); `B5` = desde; `B6` = hasta; `E5:E6` rango a mano.

```
B5 =IFS($B$4="Mes actual",EOMONTH(TODAY(),-1)+1,$B$4="Mes anterior",EOMONTH(TODAY(),-2)+1,$B$4="Últimos 2 meses",EOMONTH(TODAY(),-2)+1,$B$4="Últimos 3 meses",EOMONTH(TODAY(),-3)+1,$B$4="Últimos 6 meses",EOMONTH(TODAY(),-6)+1,$B$4="Año actual",DATE(YEAR(TODAY()),1,1),$B$4="Todo",DATE(2000,1,1),$B$4="Personalizado",$E$5)
B6 =IFS($B$4="Mes anterior",EOMONTH(TODAY(),-1),$B$4="Todo",DATE(2099,12,31),$B$4="Personalizado",$E$6,TRUE,TODAY())
```
Es decir: «Últimos 2 meses» = del día 1 del mes anterior a hoy; «Últimos 3» = del día 1 de hace 2 meses; «Últimos 6» = del día 1 de hace 5 meses; todos hasta `TODAY()`.

Filtro común (`filtroPeriodo`, `.gs:5053`): `ARRAYFORMULA(N(fecha>=$B$5)*N(fecha<=$B$6)*N(folio<>""))` ⇒ fecha dentro de `[B5,B6]` **inclusive** y folio no vacío.

Bloques:
| Bloque | Celda | Cálculo |
|---|---|---|
| Resumen (fila 9 encabezados `Comisión cobrada`, `Abonos`, `Proyectos`, `Depósitos`, `Promedio x abono`; fila 10 valores) | A10 | `SUMIFS(importe, fecha,">="&B5, fecha,"<="&B6)` — **sin filtro de folio** (un renglón sin folio sí suma aquí) |
| | B10 | `COUNTIFS(fecha>=B5, fecha<=B6, folio,"<>")` |
| | C10 | `IFERROR(ROWS(UNIQUE(FILTER(folio, fecha>=B5, fecha<=B6, folio<>""))),0)` = proyectos distintos |
| | D10 | idem sobre `pago` (col F) = depósitos distintos |
| | E10 | `IFERROR(A10/B10,0)` |
| Por mes (A13) | `QUERY` | agrupa por `TEXT(fecha,"yyyy-mm")`: `select Col1, count(Col2), sum(Col2) where Col3=1 group by Col1 order by Col1 desc limit 18`; columnas `Mes`, `Abonos`, `Cobrado` |
| Por proyecto (A35) | `QUERY` | `select Col1, Col2, count(Col3), sum(Col3) where Col4=1 group by Col1, Col2 order by sum(Col3) desc limit 150`; columnas `Folio`, `Proyecto`, `Abonos`, `Cobrado` |
| Detalle (A191) | `QUERY` | `select Col1, Col3, Col2, Col4, Col5, Col6 … where Col7=1 order by Col1 desc`; columnas `Fecha`, `Proyecto`, `Folio`, `Importe`, `Pago`, `Nota` |

Bordes: un abono **sin fecha** no aparece en ningún periodo (ni en «Todo»). Un abono registrado por el puente **hoy** tiene `D = new Date()` con hora, y `B6 = TODAY()` (medianoche) ⇒ `D <= B6` es falso hasta mañana (**NO CONFIRMADO en vivo**; solo ocurre si el abono entra por el puente o por un reparto sin fecha, porque los formularios siempre mandan fecha a medianoche). «TODAY()» usa la zona de la hoja.
Vista SQL equivalente: función `comisiones_cobradas(desde, hasta)` sobre `abonos` con los mismos agregados; el cálculo de `desde/hasta` por periodo es de interfaz.

### 3.3 «Comisiones» (otra pestaña, distinta de la anterior; `comisiones(ss)`, `.gs:763-809`)
Tarjetas: `Generadas` `=SUM(R)`, `Pagadas` `=SUM(S)`, `Pendientes` `=SUMIF(T,">0")`, `Pagadas de más` `=-SUMIF(T,"<0")` (rangos `Ventas!$X$2:$X$310`). Tres bloques:
- **PENDIENTES POR COBRAR** (cols A:F: `Folio`,`Proyecto`,`Comisión`,`Abonado`,`Pendiente`,`Pagos`): `=IFERROR(SORT(FILTER({A,B,R,S,T,U},ISNUMBER(T)*(T>0.004)),5,FALSE),"Sin comisiones pendientes")` → ordenado por `Pendiente` desc.
- **HISTORIAL DE ABONOS** (cols H:K: `Proyecto`,`Importe`,`Fecha`,`Nota`): `SORT(FILTER({Abonos!B,C,D,E}, Abonos!A<>""),3,FALSE)` → por fecha desc.
- **RÉCORD DE COMISIONES** (cols M:O: `Proyecto`,`Comisión`,`Fecha anticipo`): `SORT(FILTER({B,R,L}, B<>""),2,FALSE)` → por comisión desc.

### 3.4 «Cobranza» (`cobranza(ss)`, `.gs:702-760`; «COBRANZA POR ANTIGÜEDAD»)
Subtítulo: «Los días se cuentan desde la instalación, o desde el anticipo si no hay fecha de instalación.»
- Tarjetas (fila 3-4, cada una ocupa 2 columnas): `Proyectos con saldo` `=COUNTIF(K,">0.004")`; `Total por cobrar` `=SUMIF(K,">0")`; `Antigüedad promedio` `=IFERROR(ROUND(AVERAGE(P),0),"")`; `El más atrasado` `=IFERROR(MAX(P),"")`; `En fabricación (no vence)` `=SUMIFS(K, C,"FABRICACION", K,">0")`.
- Tabla `Rango | Proyectos | Monto` (E7:G13): por cada rango `COUNTIFS(Q, rango)` y `SUMIFS(K, Q, rango)`; fila `En fabricación` (`COUNTIFS(C,"FABRICACION",K,">0.004")`, `SUMIFS(K,C,"FABRICACION",K,">0")`); fila `TOTAL` (`COUNTIF(K,">0.004")`, `SUMIF(K,">0")`).
- Detalle: `=IFERROR(SORT(FILTER({P,Q,A,B,D,C,K,L},ISNUMBER(P)),1,FALSE),"Sin saldos por cobrar")` con encabezados `Días`, `Antigüedad`, `Folio`, `Proyecto`, `Cuenta`, `Estatus`, `Saldo por cobrar`, `Fecha anticipo`; orden por días desc. Solo entran filas con `P` numérico (es decir: proyecto lleno, `L` lleno, estatus ≠ FABRICACION, `K > 0.004`).
- Borde: el total no es la suma de los cubos si hay ventas con saldo y sin fecha de anticipo (no entran a ningún cubo).

### 3.5 «Tablero» (`tablero(ss)`, `.gs:408-524`; «TABLERO — FINANZAS AL3D», subtítulo «Todo se calcula solo desde la pestaña Ventas.»)
Rangos `V(c)` = `Ventas!$c$2:$c$310`. Abreviaturas: `vB` proyecto, `vG` subtotal, `vH` neto, `vI` anticipo, `vJ` liquidación, `vK` saldo, `vO` días de cobro, `vR` comisión, `vS` abonado, `vT` pendiente, `vQ` cubo, `vV` año, `vW` mes, `vE` tipo. **Ojo con el alias:** `vC = V('D')` (cuenta) y `vD = V('C')` (estatus) (`.gs:46-47`).
- **RESUMEN GENERAL**: `Proyectos registrados` `=COUNTA(vB)`; `Venta subtotal (sin IVA)` `=SUM(vG)`; `Venta neta (con IVA)` `=SUM(vH)`; `Cobrado (anticipo + liquidación)` `=SUM(vI)+SUM(vJ)`; `Saldo por cobrar` `=SUMIF(vK,">0")`; `Cobrado de más` `=-SUMIF(vK,"<0")`; `Ticket promedio (subtotal)` `=IFERROR(AVERAGEIF(vG,">0"),"")`; `Días promedio de cobro` `=IFERROR(ROUND(AVERAGE(vO),1),"")`.
- **COMISIONES (10% del subtotal)**: `Generadas` `SUM(vR)`; `Pagadas` `SUM(vS)`; `Pendientes` `SUMIF(vT,">0")`; `Pagadas de más` `-SUMIF(vT,"<0")`.
- **ANTIGÜEDAD DE COBRANZA**: por rango `COUNTIFS(vQ,rango)`/`SUMIFS(vK,vQ,rango)`; `En fabricación (aún no vence)`; `TOTAL POR COBRAR` (`COUNTIF(vK,">0.004")`, `SUMIF(vK,">0")`).
- **POR TIPO DE TRABAJO** (`Tipo de trabajo`,`Proyectos`,`Subtotal`,`Comisión`; filas = los 7 `TIPOS` + `(sin clasificar)`): `COUNTIFS/SUMIFS(vE, tipo, vB,"<>")`. Borde: la coincidencia es **exacta con un solo tipo**; una venta con tipos combinados (`"A, B"`) no cuenta en ninguna fila (ni en «sin clasificar», que busca `""`).
- **POR AÑO** (años fijos 2023..2029; columnas `Año`,`Proyectos`,`Subtotal`,`Cobrado`,`Saldo por cobrar`,`Comisión pendiente`): agrupa por `vV` (año del anticipo); más fila `TOTAL`.
- **POR CUENTA DE COBRO** (5 cuentas) y **POR ESTATUS** (4 estatus): conteo, subtotal, cobrado, saldo (`SUMIFS(vK, …, vK,">0")`).
- **POR MES** (con selector de año `=YEAR(TODAY())`): por `vW = TEXT(DATE(año,mes,1),"yyyy-mm")`: `Proyectos`, `Subtotal`, `Cobrado` (`SUMIFS(vI)+SUMIFS(vJ)`), `Comisión` (`SUMIFS(vR)`).

### 3.6 Otras vistas y avisos (cálculo puro sobre Ventas; no hay datos propios)
- Vistas `vistas(ss)` (`.gs:572-625`): `Proyectos en Puerta` (estatus ≠ LIQUIDADO, ordenado por `L` desc), `Vendidos del Mes` (por `vW = año-mes`, ordenado por `L` desc), `Ventas del Año` (por `vV`, ordenado por neto desc), `Récord de Ventas` (todas con proyecto, por neto desc). `Gráficas` (`.gs:812`): ventas por mes año actual vs anterior, por cuenta, por año (2023-2026), saldo por antigüedad, por tipo.
- `enviarResumen` (`.gs:1200-1237`): correo a `CORREO = 'eliasgaribi@gmail.com'` **los lunes a las 8**, con «Por cobrar» (K > 0.004, top 15 por días desc) y «Comisiones pendientes» (T > 0.004, top 15 por monto desc). Lee Ventas A:X por posición (`r[10]`=K, `r[15]`=P, `r[19]`=T). Disparador creado por `instalarTriggers` (`.gs:901-910`).
- **El plan (§3.1/§3.3) solo menciona «Comisiones por periodo» y «Abonos comisión»**; Tablero, Cobranza, Comisiones, vistas, Gráficas y el correo semanal dependen de las columnas fórmula de Ventas. Si la hoja pasa a ser espejo, hay que decidir si el espejo escribe **solo las columnas capturadas** (A:G, I:J, L:N, Y:AI) y deja intactas las fórmulas H, K, O:X (recomendado: todo lo anterior sigue funcionando y sirve de cuadre), o escribe valores (rompe todo lo anterior).

---

## 4. Regla de sellos por campo (PR #99, `puente-sheets-14`)

### 4.1 Qué se sella
`SELLADAS` (`.gs:2019-2020`), 9 nombres de columna del puente:
`['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion', 'Telefono', 'Entrega', 'Notas', 'Plazo taller']`.
`claveDeSello_(nombre)` (`.gs:2021`): `'Hora instalacion'` → `'Fecha instalacion'` (la cita es un solo dato). Por tanto hay **8 claves de sello distintas**; `'Hora instalacion'` nunca se escribe como clave (aunque `sellosDeCelda_` la aceptaría al leer).
**El dinero no se sella**: la hoja es la dueña y baja siempre (`.gs:2018`, README «Qué viaja y quién gana»). Tampoco se sella `Tipo de trabajo`, nombre, `Porcentaje comision`.

### 4.2 Dónde se guarda y formato exacto
- Columna **AI «Sellos»** de Ventas (`COL['Sellos'] = 35`), oculta (`h.hideColumns`, `.gs:4733`), formato de número `@` (texto). Una celda por venta.
- Contenido: **JSON** de objeto `{ "<clave>": <ms>, … }` con `<ms>` = entero de milisegundos desde epoch, > 0. Ejemplo (claves en el orden de `SELLADAS`, que es el que escribe `sellosATexto_`): `{"Etapa de obra":1760100000000,"Fecha instalacion":1760100100000,"Notas":1760100200000}`. Sin ningún sello la celda queda **vacía** (`''`), no `{}` (`sellosATexto_`, `.gs:2042`).
- Lectura tolerante (`sellosDeCelda_`, `.gs:2031`): quita un apóstrofo inicial, `JSON.parse`; si no es objeto o no parsea → `{}`; conserva solo claves de `SELLADAS` con valor numérico finito > 0 (`Math.floor`).
- `/jalar` entrega la celda **ya parseada**: `Sellos` = objeto (solo si la fila llegó hasta AI).
- `ordenarVentas` la mueve con su fila (bloque Y:AI) y fuerza formato `@` (`notasATexto_`, `.gs:1036`).
- Cliente: cada proyecto guarda `sellos` = `{ grupo: ms }` con grupos `etapa`, `notas`, `plazo_k`, `tel`, `dir_texto`, `ubicacion`, `entrega` (`SELLO_DE_CAMPO`, `js/datos/proyectos.js:529-532`: `etapa→etapa`, `notas→notas`, `plazo_k→plazo_k`, `tel→tel`, `dir_texto→dir_texto`, `lat→ubicacion`, `lng→ubicacion`, `entrega→entrega`). **La cita (`instalacion`) no vive en `proyecto.sellos`**: su sello es el de la instalación (`selloDeInstalacion`, `puente.js:457-462`: `actualizado_en`, o `sello_hoja` si `sello_hoja_en === actualizado_en`).
- Correspondencia grupo cliente ↔ columna/clave de la hoja (`COLUMNA_DEL_SELLO`, `puente.js:447-450`): `etapa→'Etapa de obra'`, `notas→'Notas'`, `plazo_k→'Plazo taller'`, `tel→'Telefono'`, `dir_texto→'Direccion'`, `ubicacion→'Ubicacion'`, `entrega→'Entrega'`, `instalacion→'Fecha instalacion'`.

### 4.3 Cómo se resuelve «gana el cambio más reciente» al SUBIR (servidor: `unaOperacion`, `.gs:2881-2929`)
Solo si la hoja tiene AG:AI (`anchoDelPuente(h) >= COL['Sellos']`). Entrada: `op.sellos` = objeto `{ <nombre de columna>: ms }` (el cliente lo arma con `sellosDeLaOperacion`, `puente.js:473-493`; la clave puede ser el nombre de columna o la clave de sello).
Para cada celda a escribir cuyo nombre esté en `SELLADAS`:
1. `clave = claveDeSello_(nombre)`.
2. `llega = conSellos ? selloValido_(op.sellos[nombre] || op.sellos[clave], ahora) : ahora` donde `ahora = Date.now()` de la hoja.
   - `selloValido_(x, ahora)` (`.gs:2025`): `n = Number(x)`; si no es finito o `n <= 0` ⇒ **0**; si no `min(floor(n), ahora + 10 min)`. `SELLO_HOLGURA_MS = 10*60*1000`. (Reloj adelantado: se recorta, no se rechaza.)
   - Si la operación **no trae `sellos`** (versión vieja de la plataforma) ⇒ `llega = ahora` (hora de la hoja).
3. `tiene = Number(guardados[clave]) || 0` (sello que ya hay en AI).
4. Si `tiene && llega < tiene` ⇒ **no se escribe**; se devuelve en `viejos: [{nombre, por: 'ya tenía un cambio más reciente'}]`. **No es un error.** Nota: la comparación es **estricta** (`<`): un sello **igual** al guardado **sí escribe**.
5. Si pasa: se escribe la celda y `sellosNuevos[clave] = llega` **solo si `llega > sellosNuevos[clave]`**. Consecuencia: un `llega = 0` (el teléfono no sabe cuándo cambió) se escribe **solo donde la celda tampoco tenía sello** y no crea sello.
6. Si tras el filtro no queda ninguna celda ni abono ⇒ responde `ok: true` con `remoto` = la fila tal como está (ya filtrada por rol) y `viejos`.
7. Al final, si el texto de sellos cambió, se reescribe AI (`setNumberFormat('@').setValue(texto)`).
Un **alta** (fila nueva) parte con AI vacía (`limpiarFila` borra A..AI capturados) ⇒ todo pasa.

### 4.4 Sellos por edición manual en la hoja (`alEditar`, `.gs:1147-1170`)
Disparador instalable `onEdit` (`instalarTriggers`). Para cada fila editada con proyecto no vacío y cada columna `SELLADAS` dentro del rango editado: lee el valor (para `Hora instalacion` lee la **fecha**, `COL['Fecha instalacion']`); si hay dato ⇒ `sellarFila_(h, fila, nombres, Date.now())` (hora de la **hoja**, no de un teléfono); si quedó **vacío** ⇒ `sellarFila_(..., 0)` que **quita** el sello (borrar a mano no cuenta como cambio y no borra el dato en los teléfonos). Las escrituras por script (puente, formularios) **no** disparan `onEdit`; por eso `unaOperacion` y `escribirDatosDeEntrega_` (`.gs:1569-1575`, que sella `Direccion`, `Ubicacion`, `Telefono`, `Entrega` con `Date.now()`) sellan por su cuenta.

### 4.5 `sellarFila_(h, fila, nombres, ms)` (`.gs:2049-2063`)
Sin AG:AI no hace nada (devuelve `false`). Lee los sellos actuales; para cada nombre: `c = claveDeSello_(n)`; si `ms > 0` pone `s[c] = ms`, si no `delete s[c]`. Escribe solo si el texto resultante difiere del anterior. Devuelve si escribió.

### 4.6 Al BAJAR (cliente: `obraDeLaFila`, `puente.js:512-568`)
Entrada: la fila de la hoja ya convertida (`ventaDeHoja`, que mapea las claves de columna de `Sellos` a grupos con `GRUPO_DE_COLUMNA` y deja `venta.sellos` = `{grupo: ms}`) y el proyecto local. Para cada grupo se llama a `toma(g, valorHoja, vacio, igual, aplicar, borrable)`:
```
si ocupados contiene '*' o g  → no tocar (hay un cambio local en la bandeja)
explicito = Number(venta.sellos[g]) > 0
hs = explicito ? Number(venta.sellos[g]) : (vacio ? 0 : 1)   // dato sin sello y no vacío = «antiquísimo» (1)
solo si hs > (local.sellos[g] || 0)                          // estrictamente más nuevo
si vacio y (no explicito o no borrable) → no aplicar         // un vacío solo borra si trae sello y el grupo es borrable
sellos[g] = hs; cambio = true; si !igual → aplicar()
```
Grupos y si son «borrables» (un vacío con sello sí borra): `etapa` **no**; `notas` sí; `plazo_k` sí; `tel` sí; `dir_texto` sí; `ubicacion` sí; `entrega` **no**. Devuelve `{parche, sellos}` o `{parche:{}, sellos:null}`. Con una hoja sin AI (`venta.sellos` ausente) devuelve `null` y el cliente usa las reglas de antes (`puente.js:1983-2011`).
La **cita** (fecha+hora de instalación) baja por `citaDeHoja` (`puente.js:799-824`): se aplica solo si `sello de la fila (Fecha instalacion) > max(selloDeInstalacion de las instalaciones locales)`; con fecha → mueve/crea (`instalacionDeHoja`); con fecha **vacía** y sello nuevo → **cancela** la viva (`estado:'cancelada'`, `movida+1`, mismo `uid_ics`).
Sellos al crear en cliente: `armarProyecto` (compartida por `ganar` y `descartar`) pone `Date.now()` en `etapa, tel, dir_texto, ubicacion, entrega` (+`plazo_k` si hay) (`proyectos.js:635-636`); `desdeVentaDeHoja` copia los sellos de la fila menos el grupo `instalacion` (`proyectos.js:513-514`); `actualizar` sella solo los campos que **de verdad cambiaron** (`proyectos.js:1066-1067`: «volver a guardar la misma nota no la vuelve la más reciente»).

### 4.7 Lo que hay que reproducir en Postgres
- Por venta: un `jsonb` (o columnas `sello_<grupo> bigint`) con 8 claves; comparación **estricta `<`** para rechazar, igualdad escribe; `llega` recortado a `now()+10 min`; `llega=0` solo escribe sobre celda sin sello; sin sellos en la op ⇒ `llega = now()` del servidor; hora y fecha de instalación comparten sello.
- El sello es **la hora del teléfono** (no la de llegada), salvo operaciones sin sellos y ediciones manuales (hora del servidor).
- Los rechazos por «viejo» no son error: la respuesta es `ok:true` con `viejos`, y el cliente recibe `remoto` (la fila vigente) para bajarla.

---

## 5. Leer y escribir una fila (`/jalar`, `/empujar`)

### 5.1 `/jalar` (`rutaJalar_`, `.gs:2500-2525`)
Petición: `{ ruta:'jalar', token | google_token, cursor? }`. Lee la **hoja entera** en una página (`FIN-1` filas; el cursor solo se acepta para teléfonos viejos). Respuesta: `{ ok:true, registros:[{ almacen:'proyectos', datos:<fila aplanada> }], cursor: null|'N', hay_mas: bool }`. Se omiten las filas con `B` vacío.
Fila aplanada (`aplanarFila`, `.gs:2527-2587`), claves exactas:
`id_notion` (= folio A o `null`), `editado` (siempre `null`), `Proyecto`, `'Cuenta '` (texto o `null`), `Estatus` (texto o `null`), `'Tipo de trabajo'` (arreglo), `IVA` (bool), `'Precio Subtotal'`, `'Precio Neto '`, `Anticipo`, `Liquidacion`, `'Pago Pendiente'`, `Comisiones`, `'Abono Comision'`, `'Comision Restante'`, `'Porcentaje comision'` (todos número o `null`), `'Fecha Anticipo e Instalacion'`, `'Fecha instalacion'`, `'Fecha Liquidacion'` (`yyyy-MM-dd` o `null`), `'Folio cotizacion'`, `'Etapa de obra'` (texto o `null`), `'Hora instalacion'` (`HH:MM` o `''`), `Ubicacion`, `Direccion`; y **solo si la fila llega hasta esa columna**: `Telefono` (si ≥ AE; `telefonoLimpio`), `Entrega` (si ≥ AF; `entregaDeCelda`: `''` = vacía), y `Notas`, `'Plazo taller'` (`plazoDeCelda`: `''` si no es de los 5), `Sellos` (objeto) (si ≥ AI). Sin la llave ≠ llave vacía (vacía = «alguien la borró»).
Pasa por `sinLoQueNoLeToca` (§5.3).

### 5.2 `/empujar` (`rutaEmpujar_`, `.gs:2676-2703`; `unaOperacion`, `.gs:2705-2948`)
Petición: `{ ruta:'empujar', …, ops:[{ id, tipo?, id_notion?, folio_cotizacion?, datos:{<propiedades>}, sellos?:{<columna>:ms} }] }` (máx. **25** ops, el resto se descarta en silencio, `.gs:2677-2678`). Todo bajo `LockService.getScriptLock()` (espera 20 s; si no, `SIN_RED`). Respuesta: `{ ok:true, resultados:[…] }` con, por op: `{ id, ok:true, creada, remoto:<fila filtrada por rol>, rechazadas:[{nombre, por, sinColumna?}], viejos:[{nombre, por}] }` o `{ id, ok:false, codigo, mensaje, motivo?, rechazadas }`.
Códigos usados: `DATO_INVALIDO`, `ROL_SIN_PERMISO`, `SIN_RED`, `NO_ENCONTRADO` (con `motivo: 'borrada'|'de_otra'`), `DESCONOCIDO`, `ESPERA_REALINEAR`, `CATALOGO_DESINCRONIZADO` (solo notario).
Búsqueda de la fila, en orden:
1. por `id_notion` (= folio A) con `filaPorFolioInterno`; si la fila encontrada tiene otro folio de cotización distinto del `fc` de la op ⇒ no es la suya (`deOtra`);
2. si no hay fila y hay `fc` distinto del `id_notion`: por `Folio cotizacion` (`filaPorFolioCotizacion`, `.gs:3102`);
3. si sigue sin fila → **alta** solo si **no** había `id_notion` (con `id_notion` la venta «existió y ya no está» ⇒ `NO_ENCONTRADO`; y se llama `recordarFolio`), y solo si lo que se escribe trae `Proyecto` no vacío y la etapa no es `No se dio`. La fila nueva es `primeraFilaLibre` (primera con B vacío y, preferentemente, totalmente vacía), `limpiarFila`, folio nuevo `siguienteFolio`.
Un op rechazado (`ok:false`) no detiene a los demás; una excepción en un op sí aborta todo el lote (`doPost` contesta `DESCONOCIDO`). Tras procesar todas las ops: `flush`, `anotar_` (bitácora), y `normalizarIvaActivos` + `ordenarVentas` (dentro de `try`, nunca tumban la escritura). El cliente guarda `res.remoto.id_notion` (el folio `V-xxx` de la fila) como `notion_page_id` del proyecto, y con él identifica la fila en los cambios siguientes (`puente.js:1663-1666`): es la llave que en la base debe llamarse `folio_hoja`.
Bitácora (`anotar_`, `.gs:3259`): pestaña oculta `Bitácora del puente`, columnas `Cuándo`, `Rol`, `Folio`, `Fila`, `Qué escribió`, `Nota` (`fila nueva`); retiene 5000 renglones.

### 5.3 Matriz de permisos reales (servidor) — `PUENTE_ROLES` (`.gs:2120-2136`) y lectura (`.gs:2149-2153`)
Escritura (nombres de propiedad exactos):
- **direccion**: `Proyecto`, `Precio Subtotal`, `IVA`, `Anticipo`, `Liquidacion`, `Abono Comision`, `Estatus`, `'Cuenta '`, `Fecha Anticipo e Instalacion`, `Fecha Liquidacion`, `Folio cotizacion`, `Etapa de obra`, `Fecha instalacion`, `Hora instalacion`, `Ubicacion`, `Direccion`, `Tipo de trabajo`, `Porcentaje comision`, `Telefono`, `Entrega`, `Notas`, `Plazo taller`.
- **fabricacion**: `Etapa de obra`, `Fecha instalacion`, `Hora instalacion`, `Ubicacion`, `Direccion`, `Telefono`, `Entrega`, `Notas`, `Plazo taller`.
- **pagos**: `Anticipo`, `Liquidacion`, `Abono Comision`, `Estatus`, `'Cuenta '`, `Fecha Liquidacion`, `Porcentaje comision`, `Telefono`, `Notas`. (No puede escribir `Proyecto` ⇒ **no puede dar altas**: el mensaje dice «dala de alta desde Dirección».)
- Solo fórmulas de solo lectura (rechazo con razón, `PUENTE_FORMULAS`): `'Precio Neto '`, `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision` («ya no existe»). `Sellos` y cualquier nombre fuera de `COL` se rechazan («esa columna no existe en la hoja» / «no puede escribir esta propiedad»).
Lectura: `CAMPOS_DE_DINERO` = `Precio Subtotal`, `'Precio Neto '`, `Anticipo`, `Liquidacion`, `Pago Pendiente`, `Comisiones`, `Abono Comision`, `Comision Restante`, `'Cuenta '`, `Fecha Liquidacion`, `Porcentaje comision` (**11**). `VE_EL_DINERO = {direccion:true, pagos:true, fabricacion:false}`; un rol que no esté en la tabla tampoco ve dinero (default cerrado). Fabricación **sí** recibe `Estatus`, `IVA` y `Fecha Anticipo e Instalacion`.
Lo que devuelve `/empujar` (`remoto`) pasa por el mismo `sinLoQueNoLeToca`.

### 5.4 Normalización y validación por campo al escribir (`armarCeldas`, `.gs:2955-3069`)
| Campo | Regla exacta |
|---|---|
| `Abono Comision` | no escribe celda: `Number(valor)` finito, `> 0`, `≤ 1e7` ⇒ agrega renglón en Abonos (§3.1); si no, rechazo «un abono de comisión va en positivo y es de menos de $10,000,000» |
| `Estatus` / `'Cuenta '` / `Etapa de obra` | debe estar exactamente en `ESTATUS` / `CUENTAS` / `ETAPAS_OBRA`; si no, rechazo |
| `Tipo de trabajo` | arreglo (o valor) ⇒ `filter(Boolean).map(String)`; todos en `TIPOS_TRABAJO` o se rechaza; se guarda `join(', ')` |
| `IVA` | `valor ? 'Sí' : 'No'` (luego `normalizarIvaActivos` puede cambiarlo, §2.6) |
| `Precio Subtotal`, `Anticipo`, `Liquidacion` | `Number(valor)` finito (**`null` y `''` se vuelven 0 y se escriben como 0**, no vacío); `Anticipo` y `Liquidacion` no pueden ser negativos; el subtotal sí |
| `Porcentaje comision` | `null`/`''` ⇒ borra celda; si no número finito en `[0,100]` |
| `Fecha Anticipo e Instalacion`, `Fecha Liquidacion`, `Fecha instalacion` | `null`/`''` ⇒ borra; si no `/^\d{4}-\d{2}-\d{2}$/` ⇒ `new Date(y, m-1, d)` (zona del **proyecto de Apps Script**; la lectura usa la zona de la **hoja** — **NO CONFIRMADO** si son la misma zona) |
| `Entrega` | vacío ⇒ borra (se lee Instalación); si no `entregaDeCelda(valor)` (sin acentos/mayúsculas: `^paquet`→`Paquetería`, `^recole`→`Recolección en taller`, `^instala`→`Instalación`) o rechazo |
| `Plazo taller` | vacío ⇒ borra; si no `plazoDeCelda(valor)` (lee semanas: `n>=3`→`3 semanas o más`; 1, 1.5, 2, 2.5 → su etiqueta; `½`→`.5`, `,`→`.`) o rechazo |
| `Notas` | `String(valor).slice(0,40000)`, escrita en formato `@` |
| `Telefono` | vacío ⇒ borra (formato `@`); si no `telefonoLimpio`: `replace(/[^\d +()\-]/g,' ')`, colapsa espacios, trim; sin ningún dígito ⇒ rechazo; `slice(0,30)`; escrita en `@` |
| `Hora instalacion` | `horaEscrita`: `''` si vacío; acepta `H:MM` y `H:MM:SS`; segundos se cortan salvo ≥58 (suben un minuto); fuera de rango ⇒ rechazo; escrita en `@` |
| cualquier otro texto (`Proyecto`, `Ubicacion`, `Direccion`, `Folio cotizacion`) | `String(valor).slice(0,2000)`; si empieza con `=`, `+`, `-` o `@` se le antepone `'` (antiinyección de fórmulas). **Un espejo que escriba de vuelta a la hoja tiene que repetir esto** (`textoProtegido`, `.gs:4394`); en Postgres se guarda el texto sin el apóstrofo |

### 5.5 Qué manda realmente el cliente (`aNotion`, `puente.js:311-403`) — importante para saber qué datos de dinero existen en la plataforma
- Alta (`alta` = el proyecto aún no tiene folio de hoja) manda: `Proyecto`, `Precio Subtotal`, `IVA`, `Anticipo`, `Porcentaje comision` (solo si > 0), `Folio cotizacion` (si hay `folio_global`), `Etapa de obra`, `Estatus` y `'Cuenta '` (si son válidos), `Direccion`, `Ubicacion` (`lat,lng` o `''`; nunca `0,0`), `Tipo de trabajo`, `Telefono`, `Entrega` (solo si no es Instalación), `Notas` y `Plazo taller` (si hay), `Fecha Anticipo e Instalacion` (= `fecha_ganado`), y `Fecha instalacion`/`Hora instalacion` si hay instalación.
- Cambio: cada propiedad viaja **solo si es lo que cambió** (`campos`), para no pisar lo que Pagos corrigió en la hoja. Una op de versión anterior sin `campos` manda sus campos «propios» como antes (pero nunca estatus/cuenta).
- **Nunca manda** `Liquidacion`, `Abono Comision`, `Fecha Liquidacion`, `'Precio Neto '`, `Pago Pendiente`, `Comisiones`, `Comision Restante`. **Excepción:** el modal «Registrar venta» del cotizador (`js/cotizador/venta.js:350-388`) manda, si el estatus elegido es `LIQUIDADO`, `Liquidacion = max(0, neto - anticipo)` y `Fecha Liquidacion`, además de `Porcentaje comision = 10`.
- Consecuencia: **hoy los cobros posteriores (Liquidacion, Fecha Liquidacion), los abonos de comisión y las correcciones de Anticipo/Subtotal por Pagos se capturan SOLO en la hoja** (menú ⚡ AL3D o a mano). La plataforma no tiene captura de esos datos (`CAMPOS_ROL.pagos` del cliente = `notas, cuenta, estatus_notion, notion_page_id, notion_estado, pct_comision, tel, sync`, `proyectos.js:993-994`; no incluye `anti_pactado`). Esto choca con el plan §1 («Pagos pasan a capturar solo en la plataforma»): hay que construir esa captura (cobro, abono, reparto FIFO).

### 5.6 Formularios del menú ⚡ AL3D que escriben Ventas (lo que Pagos/Dirección hacen hoy en la hoja)
- **Registrar nueva venta** (`dialogoVenta`/`guardarVenta`, `.gs:1424-1579`): campos Proyecto, Cuenta (def. `Elias BBVA`), Estatus (def. `FABRICACION`), Tipo (opcional), ¿Lleva IVA? (`No`/`Sí`), Subtotal (sin IVA), Anticipo, Fecha anticipo (def. hoy), Fecha instalación, **Teléfono** (≥10 dígitos, obligatorio), **Entrega** (obligatoria), Dirección y Link de Maps (opcionales). Escribe B, D, C, E, F, G, I, L, M y AB/AC/AE/AF; `aplicarIva`; `ordenarVentas`. Nota: aquí IVA se elige pero `aplicarIva` lo corrige según la cuenta.
- **Registrar un cobro** (`guardarCobroConCandado_`, `.gs:1644-1670`): lista las ventas con `K > 0.004` (por saldo desc); `J = J_previo + monto`; `N = fecha`; si «Marcar LIQUIDADO» (marcada por defecto) → `C = 'LIQUIDADO'` y reordena. Es decir, **Liquidacion es acumulativa**: cada cobro se suma.
- **Registrar abono de comisión** y **Repartir un abono (FIFO)**: §3.1.

---

## 6. Casos borde que el port a SQL debe reproducir o decidir

1. **Filas «vacías»**: B vacío = no es venta. En SQL: ventas sin `proyecto` no existen; `proyecto` solo con espacios cuenta como lleno en las fórmulas (`B=""` es falso) pero se trata como vacío en `ordenarVentas`/`primeraFilaLibre` (`String(...).trim()===''`). Normalizar (`trim`) en el import.
2. **Celdas sucias**: texto en G/I/J ⇒ H error y K/T `""`. Hay que decidir cómo se importa (rechazar y reportar en el reporte de conflictos) en vez de reproducir el error.
3. **Subtotal 0/vacío**: H=0, R=0. **Subtotal negativo permitido** (descuentos/notas de crédito): comisión negativa; anticipo/liquidación no.
4. **`null`/`''` en Subtotal, Anticipo, Liquidacion por el puente se escriben como 0** (no como vacío): distinguir «0» de «sin dato» no es posible vía puente.
5. **IVA**: `16%` solo si F = `Sí`; cualquier otra cosa (vacío, `No`, `si` sin acento) ⇒ sin IVA. En Sheets la comparación `=` ignora mayúsculas y distingue acentos (comportamiento de Sheets, **no verificado aquí**), mientras que el puente lee `IVA` con `String(v).trim() === 'Sí'` (JS, sensible a mayúsculas, con `trim`): `" Sí "` y `"sí"` dan resultados distintos entre la fórmula y el puente. Y **la cuenta manda el IVA en ventas abiertas** (§2.6).
6. **Porcentaje de comisión por fila: no existe.** `AD` se guarda y viaja pero R usa 10 % fijo del subtotal. El plan propone `ventas_dinero.pct_comision`; si la base lo usa para calcular, **no cuadrará** con la hoja. Guardarlo como dato informativo y calcular comisión con 10 % fijo (o cambiar R en la hoja a la vez). El comentario de `armarCeldas` («Vacío o null borra la celda y la fórmula vuelve al 10 %», `.gs:3011`) y el de `aNotion` («la celda vacía significa el de siempre, 10 %») están desactualizados: R nunca lee AD.
7. **Redondeo**: `ROUND(...,2)` con empates en comisión cuando los centavos del subtotal terminan en 5 (§2.4). Probar con esos casos.
8. **Saldo con estatus**: K ignora el estatus (LIQUIDADO con liquidación incompleta = saldo > 0 + bandera). El cliente, en cambio, fuerza 0 para LIQUIDADO y para etapa `cancelado` (`saldoDe`, `ventas.js:59-66`) y recorta a ≥ 0. Dos reglas distintas: la vista SQL debe replicar la de la hoja; el recorte queda en cliente.
9. **Estimación local del modal**: `rvRecalc` (`venta.js:237`) usa `pend = LIQUIDADO ? 0 : max(0, neto - anti)`, que difiere de K; solo es una vista previa.
10. **Antigüedad**: contada desde `fecha_instalacion` (o `fecha_anticipo` si no hay instalación), solo si estatus ≠ FABRICACION, hay `fecha_anticipo` y `K > 0.004`. Depende de «hoy»: usar la zona horaria de la hoja (**NO CONFIRMADO** el id exacto; el código dice «la zona de México», con LMT −6:36:36 en 1899, `.gs:2616`, así que es una zona mexicana, probablemente `America/Mexico_City`). Es una columna volátil: no persistirla, calcularla en la vista.
11. **Año y mes** salen de `fecha_anticipo` (no de la instalación). Ventas sin fecha de anticipo no entran a «por año/mes» pero sí a los totales.
12. **Abonos**: llave = folio de hoja `V-xxx` (Ventas!A), no el folio de cotización. Un folio inexistente muestra `— folio no encontrado —`. Se admiten negativos (corrección a mano) ⇒ `T` puede subir. Máx. 1999 renglones. El campo `Fecha` por el puente trae hora. `Pago` (`P-###`) agrupa los renglones de un depósito.
13. **Venta sin folio A** (`A` vacío con B lleno): `SUMIF`/`COUNTIF` con criterio vacío — **NO CONFIRMADO** qué suman (`alEditar` y `fijarFolios` evitan que exista). En SQL el folio es `not null`.
14. **Folio repetido**: la hoja lo marca en X y `alEditar` le da uno nuevo a la copia pegada (y le borra el `Folio cotizacion`). En SQL: `unique(empresa_id, folio_hoja)`.
15. **Combinaciones de tipo de trabajo** (`"A, B"`): válidas; los reportes por tipo del Tablero no las cuentan en ninguna fila (§3.5). En SQL guardar un arreglo `text[]`; decidir si el reporte por tipo reproduce o corrige ese defecto.
16. **Límites**: 309 ventas y 1999 abonos por `FIN`/rangos fijos. Si la base tiene más ventas que filas, el espejo no cabe. Hay que subir `FIN` y volver a correr `mejorarTodo` (tiene `$2:$310` en `L()`, `V()`, `FIN`, `getRange`) o espejar solo un subconjunto.
17. **Hora de instalación** se guarda como texto `HH:MM`; Sheets la convierte en hora si la celda no es `@`: el espejo debe poner `@` antes de escribir (`horasATexto`, `.gs:2661`). Igual teléfono/notas/sellos.
18. **Orden y concurrencia**: toda escritura a Ventas y Abonos toma `LockService.getScriptLock()` (30 s en formularios/`mejorarTodo`, 20 s en `/empujar`, 25 s en `alEditar`). El espejo debe tomar el mismo candado.
19. **Disparadores que pelearían con un espejo de solo lectura**: `alEditar` (folios nuevos, IVA por cuenta, sellos, reordena), `normalizarIvaActivos`/`ordenarVentas` (reescriben filas), `enviarResumen` (correo del lunes). `mejorarTodo` → `instalarTriggers` los reinstala. Si la hoja pasa a espejo, hay que decidir cuáles se apagan; sobre todo que `ordenarVentas`/IVA no reescriban lo que la base mandó.
20. **Ventas anteriores a la plataforma** (≥199 filas, README:146) existen solo en la hoja: no tienen cotización ni proyecto. El récord (`ventas_hoja`) las cuenta para Control. `proyectos` solo no las alberga; hace falta una tabla de ventas aparte (o proyectos con bandera `de_hoja`).
21. **`Cuenta ` y `Precio Neto ` con espacio final** son nombres de propiedad del puente, no de columna de base de datos; en SQL usar `cuenta`, `precio_neto` y un mapa de traducción para no perder compatibilidad con el cliente durante la doble escritura.

---

## 7. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **§4.10: «una prueba que compara ambos resultados sobre todas las ventas (es lo que hoy hace `pruebas/precio-servidor.mjs`)»**. Falso: `precio-servidor.mjs` compara el **catálogo de precios del cotizador** (copia `cot*` del Apps Script vs `js/cotizador/nucleo.js`), no las fórmulas de Ventas. No existe ninguna prueba que evalúe H, K, R o T numéricamente; solo `pruebas/precios-cliente.mjs:309` comprueba por regex que R dice `10%`, y `pruebas/puente-hoja.mjs` (con una «hoja de mentiras» de Apps Script) comprueba la **presencia** de `Folio repetido`. La prueba de cuadre hay que escribirla de cero.
2. **§3.1/§4.7 `ventas_dinero(... pct_comision ...)`** y «Comisiones (10 % sin IVA)» en la misma frase: la hoja **no usa** `pct_comision`. Si la vista lo usa, no cuadrará (§6 punto 6).
3. **§4.2 Fabricación: «etapa hasta "Listo"»**: el servidor (`PUENTE_ROLES.fabricacion`) deja a fabricación escribir **cualquier** etapa de `ETAPAS_OBRA` (incluidas `Instalado`, `En garantía`, `No se dio`). El tope `TOPE_ROL = {direccion:null, fabricacion:'listo', pagos:false}` solo existe en el cliente (`js/datos/proyectos.js:1116`). El plan dice que la matriz es «la misma que `PUENTE_ROLES`, `CAMPOS_ROL`, `TOPE_ROL`», pero la frontera real del servidor es más laxa que la del cliente: hay que decidir cuál se porta.
4. **§1/§4.2 «Pagos: dinero, cobranza, estatus, cuenta, teléfono, notas»**: en el servidor Pagos escribe también `Anticipo`, `Liquidacion`, `Abono Comision`, `Fecha Liquidacion` y `Porcentaje comision`, pero la **plataforma no tiene pantalla** que mande `Liquidacion`, `Fecha Liquidacion` ni `Abono Comision` (§5.5). Hoy eso se hace en la hoja. El plan asume que «la plataforma tiene las mismas acciones» (§10) y no es cierto.
5. **§3.1 «Hoja "Ventas" → `proyectos` + `ventas_dinero`»** y **§4.5 «escucha cambios de `ventas` y `ventas_dinero`»**: el plan usa dos nombres (`proyectos` y `ventas`) para lo mismo, y no considera las ≥199 ventas históricas sin proyecto (§6 punto 20).
6. **§3.1 «Hoja Comisiones por periodo y Abonos comisión → vistas sobre `ventas_dinero` y `abonos`»**: «Abonos comisión» **no es un cálculo**, es un libro de datos (folio, importe, fecha, nota, id de pago) con 3 formas de captura (puente, formulario, reparto FIFO) y no existe una tabla `abonos` definida en §4.7. Solo «Comisiones por periodo» es una vista.
7. **§3.1 no lista** las pestañas Tablero, Cobranza, Comisiones, Proyectos en Puerta, Vendidos del Mes, Ventas del Año, Récord de Ventas, Gráficas, ni el correo semanal (`enviarResumen`), que dependen de las fórmulas de Ventas. El plan dice «la hoja refleja la base»; esas pestañas necesitan que las columnas fórmula sigan vivas en la hoja.
8. **§4.4/§3.3 «La regla de sellos se conserva tal cual»**: en el cliente la cita (`instalacion`) no está en `proyecto.sellos` sino en la instalación (`selloDeInstalacion`), y la hoja guarda un sello `Fecha instalacion` compartido con la hora. El modelo `proyectos.sellos` del plan (§4.7) no cubre la cita: hay que llevar el sello también en `instalaciones` (`actualizado_en`, `sello_hoja`, `sello_hoja_en`).
9. **README.md:566** dice que `/jalar` le quita a fabricación «las diez columnas de dinero»; el código tiene **11** en `CAMPOS_DE_DINERO` (incluye `Porcentaje comision`). Es el código el que manda.
10. **Comentarios obsoletos** que podrían confundir a un implementador: `armarCeldas` (`.gs:3011`: «la fórmula vuelve al 10 %») y `aNotion` (`puente.js:325-326`) sugieren que AD cambia la comisión; no lo hace.

---

## 8. Preguntas abiertas / NO CONFIRMADO

1. ¿La hoja viva corre `puente-sheets-14` y tiene AG:AI y la pestaña oculta de bitácora? (`/salud`.)
2. ¿Cuántas filas tiene hoy Ventas y cuántos renglones Abonos (límites 309 y 1999)? ¿Se sube `FIN`?
3. Redondeo de Sheets en empates de `ROUND(G*10%,2)` (centavos terminados en 5).
4. Coerción de texto numérico y de `""` en aritmética con `ARRAYFORMULA`; `SUMIF/COUNTIF` con criterio vacío.
5. Zona horaria de la hoja y del proyecto de Apps Script (¿iguales?) para `TODAY()` y para `new Date(y, m-1, d)`.
6. Abonos con hora registrados por el puente: ¿se excluyen realmente de «Comisiones por periodo» el día en que entran?
7. ¿El encabezado vivo de A1:X1 es `HEAD`? (Un import por encabezado falla; por letra no.)
8. ¿Qué disparadores quedan activos cuando la hoja sea espejo (`alEditar`, `enviarResumen`)? ¿El espejo escribe solo A:G, I:J, L:N, Y:AI (recomendado) o valores en todas?
9. ¿Se porta el IVA-por-cuenta a la base (trigger) o se corrige el dato al importar? Sin eso H/K/R no cuadran en ventas abiertas.
10. ¿Qué regla de etapa por rol gana: la del servidor (`PUENTE_ROLES`, sin tope) o la del cliente (`TOPE_ROL`)?
