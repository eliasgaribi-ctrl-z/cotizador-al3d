# La hoja como espejo de la base de datos

**Estado: construido y apagado.** Nada de esto se despliega solo ni cambia lo que hoy hace la
hoja: mientras no crees las propiedades de abajo, el puente y la hoja se comportan igual que
siempre. Este documento es para el día que toque encenderlo (la **fase 4** de
[`docs/PLAN-SUPABASE.md`](../docs/PLAN-SUPABASE.md), cuando la base de datos pase a ser la
fuente de verdad). Las decisiones de fondo están en
[`docs/DECISIONES-SUPABASE.md`](../docs/DECISIONES-SUPABASE.md), Q-10 y Q-12.

## Qué hace, en dos frases

Una función de Supabase (`espejo`) mira cada pocos minutos qué cambió en la base —ventas y abonos
de comisión— y se lo manda a la hoja por una ruta nueva del Apps Script, que **escribe solo lo que
cambió** y solo en las columnas que se capturan. El Tablero, la cobranza, las comisiones y el
correo de los lunes siguen calculándose como siempre, porque sus fórmulas no se tocan.

Dos cosas que hay que tener claras desde el principio:

- **La hoja pasa a ser de solo lectura en la práctica.** Lo que alguien escriba a mano se pisa con el
  siguiente cambio de esa fila en la base. Por eso la hoja lo avisa con una nota en la celda `A1`.
- **La hoja viva sigue siendo la fuente de verdad hasta la fase 4.** No enciendas `MODO_ESPEJO` antes:
  con él puesto, la hoja deja de acomodarse sola, de poner folios y de corregir el IVA.

## Lo que hay que crear (solo nombres; los valores los pones tú y nunca van al repositorio, al chat ni a la hoja)

**En el Apps Script de la hoja** (engrane de *Configuración del proyecto* → *Propiedades de la secuencia
de comandos* → *Agregar propiedad*):

| Propiedad | Para qué | Cuándo | Qué valor lleva |
|---|---|---|---|
| `ESPEJO_SECRETO` | Es la llave con la que la función demuestra que es ella. Sin ella la ruta nueva no abre | Al montarlo | Un texto largo y al azar, **de al menos 32 caracteres**, que sacas de tu gestor de contraseñas. El mismo que cargas en Supabase como `ESPEJO_SECRETO` |
| `MODO_ESPEJO` | Declara que esta hoja **es** un espejo. Sin ella la ruta se niega a escribir y la hoja se porta como siempre | El día del cambio de lectura, no antes | `si` |
| `ESPEJO_SELLOS` | Opcional. Con `si`, el espejo también copia la columna oculta `AI` (Sellos). Apagada, no la toca | Solo si piensas poder volver a leer de la hoja | `si` |

**En Supabase** (secretos de funciones: `supabase secrets set` o el panel; un secreto propio no puede
empezar con `SUPABASE_`):

| Secreto | Qué es |
|---|---|
| `ESPEJO_SECRETO_FUNCION` | El que presenta **quien dispare** la función (el programador de tareas o el webhook) en la cabecera `x-espejo-secreto`. Otro texto largo y al azar, **distinto** del de la hoja |
| `ESPEJO_URL` | La dirección `/exec` de la aplicación web del Apps Script (`https://script.google.com/macros/s/…/exec`). La función solo sale a direcciones de `script.google.com` |
| `ESPEJO_SECRETO` | El **mismo** valor que la propiedad del script del mismo nombre |
| `ESPEJO_EMPRESA` | Opcional. La empresa cuyas ventas se espejan; por omisión `al3d` |

La llave de servicio de la base (`SUPABASE_SECRET_KEYS` o la antigua `SUPABASE_SERVICE_ROLE_KEY`) la
inyecta la plataforma; no la cargas.

## Los pasos, en orden

1. **Ensáyalo primero con una copia.** *Archivo → Hacer una copia* de la hoja trae su propio Apps Script;
   publícalo como aplicación web aparte y apúntale una función `espejo` del proyecto de pruebas
   (`al3d-pruebas`). Así ves todo lo de abajo sin tocar la hoja viva.
2. **Compara antes de pegar.** La copia que manda es la de la hoja, y el repositorio puede ir atrás de
   ella (ya pasó). Sigue «Antes de pegar nada» de [`README.md`](README.md) y los pasos de
   [`DESPLIEGUE.md`](DESPLIEGUE.md): bajar el código vivo, compararlo con `puente/hoja-apps-script.gs` y
   **recién entonces** pegarlo en `Código.gs` y guardar.
3. **Publica la versión nueva** (guardar no publica): *Implementar → Gestionar implementaciones →
   lápiz → Versión: Versión nueva → Implementar*. La dirección `/exec` **no cambia** y los teléfonos no
   se tocan: la versión del puente sigue siendo `puente-sheets-14`.
   La aplicación web tiene que seguir en *Ejecutar como: Yo* y *Quién tiene acceso: Cualquier usuario*;
   si no, Google contesta una página de inicio de sesión en vez de JSON y la función lo dice.
4. **Revisa el tope de filas (`FIN`).** Hoy la hoja llega al renglón 310 (309 ventas) y «Abonos comisión»
   al 2000 (1999 abonos). Si la base ya tiene más ventas que filas, la ruta contesta `CAPACIDAD_AGOTADA` y
   no escribe nada. Subir `FIN` es un paso del despliegue, no de esta ruta: cambiar `var FIN = 310;`
   (primera línea del código), pegar, publicar, asegurarte de que la pestaña Ventas tiene filas de sobra y
   correr **⚡ AL3D → 🔄 Actualizar formato y vistas** para que las fórmulas (`$2:$310`) se rehagan con el
   número nuevo. *No probé ese paso con un `FIN` más grande.*
5. **Crea `ESPEJO_SECRETO` en el Apps Script** y, en Supabase, `ESPEJO_SECRETO`, `ESPEJO_SECRETO_FUNCION` y
   `ESPEJO_URL` (tabla de arriba). Todavía **no** pongas `MODO_ESPEJO`.
6. **Que la base tenga las dos vistas y la función su permiso.** Las vistas `espejo_ventas` y `espejo_abonos` las
   crea la migración `supabase/migrations/0010_sync_espejo.sql`: tiene que estar aplicada (solo las lee
   `service_role`, o sea, esta función). Y `supabase/config.toml` ya le quita a `espejo` la verificación de JWT
   (`[functions.espejo]` con `verify_jwt = false`, como a las otras cuatro); si despliegas sin ese archivo, es
   `supabase functions deploy espejo --no-verify-jwt`. Lo que protege a la función es su secreto, no un JWT: las
   llaves nuevas de Supabase no son JWT.
7. **Despliega la función:** `supabase functions deploy espejo`.
8. **Prueba la conexión sin escribir nada.** Pide el «estado» (desde PowerShell, con tus secretos en
   variables de entorno de esa sesión, nunca escritos en el comando):
   ```powershell
   Invoke-RestMethod -Method Post -Uri $env:ESPEJO_FUNCION_URL `
     -Headers @{ 'x-espejo-secreto' = $env:ESPEJO_SECRETO_FUNCION } `
     -ContentType 'application/json' -Body '{"accion":"estado"}'
   ```
   Si contesta `ok: true` con los cursores, la función está viva y su secreto es el bueno. (Esa respuesta no
   habla con la hoja.)
9. **Enciende el modo:** en el Apps Script, `MODO_ESPEJO` = `si`. Desde ese momento la hoja deja de
   acomodarse sola, de poner folios y de corregir el IVA al teclear.
10. **La primera pasada, completa:** el mismo comando con `-Body '{"modo":"completo"}'`. Manda todo lo que hay
    en la base y deja la hoja igual que ella. Si no cabe en una corrida (la función corta a los ~100
    segundos), contesta `parcial: true` y **la siguiente la reanuda sola**: repítela hasta que el «estado»
    diga `completo.estado = listo`.
11. **Prográmala.** Dos tareas externas (un programador de tareas como cron-job.org, o uno de GitHub), las
    dos con el mismo POST y la cabecera `x-espejo-secreto`:
    - **cada 5 minutos**, con cuerpo vacío (`{}`): lo que cambió;
    - **cada noche**, con `{"modo":"completo"}`: la reconciliación. Es lo que corrige lo que ningún cursor
      ve (alguien que editó una celda a mano en una fila que la base no volvió a tocar, o un cambio que
      solo movió la agenda de instalación).

## Cómo se ve que está sincronizado

- **En la hoja, pestaña Ventas:** una **nota en la celda `A1`** (la ves como un triángulo rojo; al pasar el
  cursor dice que es un espejo y cuándo fue la última sincronización) y, a la derecha de la última columna
  (`AJ`, columna 36), un cuadro **«Espejo · última sincronización»** con la fecha y hora (`AJ2`) y cómo
  quedó (`AJ3`). La función manda un latido aunque no haya cambios, así que esa hora avanza cada pocos
  minutos. Si pasan horas sin moverse, algo falla. «Abonos comisión» lleva la misma nota en su `A1`.
  *No se crean pestañas nuevas.*
- **En la «Bitácora del puente»** (la pestaña oculta de siempre): cada fila que el espejo creó o cambió
  queda con el rol **espejo**, su folio, su fila y las columnas que escribió. Un lote que no cambia nada no
  anota nada. (Si esa pestaña no existe, el espejo no la crea: sincroniza igual y no anota.)
- **Preguntándole a la función** (`{"accion":"estado"}`): dónde va cada cursor y cuándo se movió, si hay una
  reconciliación completa a medias o ya `listo`, las filas que la hoja rechazó y cómo terminó la última
  corrida (`corrida.ok`, `corrida.ultimo_ok`). Y a la hoja directamente
  (`{"ruta":"espejo","secreto":"…","accion":"estado"}`): cuántas filas quedan libres y la última
  sincronización.

## Qué hacer cuando algo falla

La función contesta con un estado HTTP que un programador de tareas ya sabe leer (cualquier cosa distinta de
200 es un aviso). Nada se pierde: el cursor solo avanza cuando la hoja confirmó, y repetir un lote no
cambia nada.

| Contesta | Qué pasó | Qué haces |
|---|---|---|
| `200` con `parcial: true` | No alcanzó el tiempo | Nada: la siguiente corrida sigue donde se quedó |
| `200` con `rechazadas` | La hoja rechazó una o más filas (un estatus, una cuenta o una fecha que la hoja no conoce) | Mira cuáles son (vienen con su razón), corrige el dato en la base y la siguiente corrida las manda. El resto de las filas entró normal |
| `507` `CAPACIDAD_AGOTADA` | La hoja ya no tiene filas libres | Sube `FIN` (paso 4). En cuanto haya lugar, la siguiente corrida manda lo que faltaba. Los abonos siguen aunque Ventas esté llena, y viceversa |
| `409` `ESPEJO_APAGADO` | La hoja no tiene `MODO_ESPEJO = si` | Ponla (paso 9), o deja la función apagada |
| `409` `ESQUEMA_INCOMPLETO` | A la hoja le faltan las columnas AE a AI o «Abonos comisión» | **⚡ AL3D → 🔧 Actualizar el puente → 3 · Preparar la hoja para el puente** |
| `502` `AUTENTICACION_HOJA` | La hoja no aceptó el secreto | `ESPEJO_SECRETO` de Supabase no es igual a la propiedad del script (o la propiedad mide menos de 32). Pon el mismo valor en los dos |
| `502` `SIN_RED` | La hoja no contestó (se reintentó 3 veces), o contestó una página de Google | Puede ser un tropiezo de Google (reintenta sola). Si no se quita: revisa que `ESPEJO_URL` sea la dirección `/exec` vigente y que la aplicación web esté en *Cualquier usuario* |
| `502` `BASE_NO_CONTESTA` | La base no contestó | Revisa que el proyecto de Supabase no esté pausado (el plan gratuito pausa a la semana sin actividad) |
| `422` `DATO_INVALIDO` | La hoja rechazó un lote sin decir cuáles filas (por ejemplo, una llave de columna de fórmula) | Es un error de programación: no se manda nada más de ese flujo hasta revisarlo |
| `503` `CONFIGURACION` | Falta una variable de entorno (el mensaje dice cuál, nunca su valor) | Cárgala |
| `401` | El secreto de quien dispara la función es otro | Corrige la cabecera `x-espejo-secreto` de la tarea programada |

## Lo que MODO_ESPEJO no apaga

El menú **⚡ AL3D** (*Registrar nueva venta*, *Registrar un cobro*, *Registrar abono de comisión*, *Repartir un abono*) y
`/empujar` de los teléfonos viejos **siguen escribiendo en la hoja**. Con el modo puesto no los uses: lo que capturen no llega
a la base, y el espejo lo pisa (un abono tecleado para un folio se deja en blanco la siguiente vez que ese folio cambie). Vigila la
«Bitácora del puente»: una fila con un rol que no es `espejo` es alguien escribiendo por el camino de antes.

Y cuando el espejo pisa algo que alguien había cambiado a mano, **lo que había queda en la columna «Nota» de la bitácora** (por
ejemplo `antes: Estatus=REPARANDO · Anticipo=999`, o `fila 7 era 999 | 2026-10-05 |  | `), para poder recuperarlo.

## Cómo apagarlo

De lo más suave a lo más fuerte; ninguno borra datos de la hoja:

1. **Pausar:** detén las tareas programadas. La hoja se queda como está y la función no hace nada.
2. **Devolverle a la hoja su comportamiento de siempre:** borra la propiedad `MODO_ESPEJO` (o ponle `no`). Al
   instante `alEditar` vuelve a poner folios, sellos e IVA, y `ordenarVentas` y `normalizarIvaActivos` a
   acomodar y corregir. La ruta `espejo` se niega a escribir (`ESPEJO_APAGADO`).
3. **Cerrar la puerta:** borra la propiedad `ESPEJO_SECRETO`. La ruta contesta lo mismo que a cualquier
   desconocido.

No hace falta volver al código viejo del Apps Script, y **no conviene**: la misma versión que trae el espejo
trae el arreglo de seguridad del `/expandir` (abajo). Apagar con las propiedades deja el código nuevo y
todo se comporta como antes.

Si apagas el espejo para volver a escribir en la hoja (volver al modo `hoja`), lo que la base mandó ya está
en ella; el espejo no deshace nada. Si piensas que ese regreso puede hacer falta, enciende `ESPEJO_SELLOS`:
sin los sellos al día, el teléfono que gana «el cambio más reciente» lo decidiría con sellos viejos.

## Lo que escribe, y lo que nunca escribe

| Pestaña | Escribe | Nunca escribe |
|---|---|---|
| **Ventas** | `A:G`, `I:J`, `L:N` y `Y:AH` (folio, proyecto, estatus, cuenta, tipo, IVA, subtotal, anticipo, liquidación, las tres fechas, folio de cotización, etapa, hora, ubicación, dirección, %, teléfono, entrega, notas, plazo). `AI` solo con `ESPEJO_SELLOS = si` | **`H`, `K` y `O` a `X`**: son fórmulas de la hoja (neto, saldo, días, antigüedad, comisión, abonos, revisar…). Un lote que trae una llave de esas columnas se rechaza completo |
| **Abonos comisión** | `A`, `C`, `D`, `E`, `F` (folio, importe, fecha, nota, pago) | **`B`**: es la fórmula que trae el nombre del proyecto |
| Cualquier otra | nada | No crea pestañas, ni siquiera para la marca |

Cómo busca: **por folio** (`V-014`), nunca por número de fila (la hoja se reacomodaba por estatus). Un folio
que no está se da de alta en la primera fila libre; uno que está se actualiza donde esté. Con el modo puesto
ya no se reacomoda, así que las ventas nuevas quedan al final.

Los abonos no tienen un id por renglón en la hoja, así que se espejan **por folio y completos**: si la base
tiene tres abonos del folio `V-014` y la hoja uno, agrega los otros dos; si alguien tecleó un abono de más
para ese folio, lo deja en blanco (y anota en la bitácora cómo era). Un renglón que no tiene folio no se toca. Un lote lleva a lo más
350 renglones de abonos (la hoja rechaza más de 400).

Lo que se teclea como texto (hora, teléfono, notas) se escribe con formato de texto antes del valor, y un
texto que empieza con `=`, `+`, `-` o `@` lleva su apóstrofo para que la hoja no lo vuelva fórmula.

## Seguridad

- **El archivo de la hoja contiene todo el dinero y ya no lo protege la base** (la protección por área de
  Supabase no llega a Drive). **No lo compartas con Fabricación** (riesgo R-05 del diseño). Quién tiene acceso
  hoy al archivo está por confirmar.
- La dirección `/exec` es pública por diseño; lo que protege la ruta es el secreto, que viaja en el cuerpo de
  la petición por HTTPS. Quien no lo tiene ve lo mismo que en cualquier ruta que no existe, y la ruta no
  confirma que existe.
- **Si crees que un secreto se filtró:** cambia el valor en los dos lados a la vez (la propiedad del script y
  el secreto de Supabase). No hay otro paso. Los secretos no se rotan por correo, chat ni repositorio.
- Las pruebas usan claves de mentiras, marcadas como tales; ningún secreto real está en el código.

## El arreglo de seguridad del `/expandir` que viaja en esta versión

El `.gs` aceptaba `https://maps.google.com:x@evil.example/` como si fuera de Google Maps y conectaba a
`evil.example`. Ahora el host solo puede llevar letras, números, puntos y guiones, y detrás tiene que venir
`/`, `?`, `#` o el final: un usuario, una contraseña o un puerto en la dirección ya no pasan. La lista de
dominios es la de siempre. Un cambio que se nota: una liga con el puerto escrito aunque sea el normal
(`https://maps.google.com:443/…`) ya no se acepta; nadie comparte una liga así. Las ligas normales dan
exactamente lo mismo que antes.

## Para quien programe

La ruta nueva es `POST /exec` con el cuerpo JSON (el secreto **va en el cuerpo**: Apps Script no deja leer
cabeceras):

```json
{ "ruta": "espejo", "secreto": "<ESPEJO_SECRETO>",
  "lote": { "id": "esp-20261010T150000-001", "modo": "incremental",
            "ventas": [ { "a_folio": "V-014", "b_proyecto": "…", "c_estatus": "COBRANDO", "…": "…" } ],
            "abonos": [ { "a_folio": "V-014", "abonos": [ { "c_importe": 100, "d_fecha": "2026-10-05", "e_nota": "", "f_pago": null } ] } ] } }
```

Las llaves de cada venta son las de la vista `espejo_ventas` (la letra del principio es la columna de la hoja);
la lista está en `espejoColumnasVentas_()` del `.gs` y en `COLUMNAS_VENTAS` de
`supabase/functions/_shared/espejo.js`, y la prueba compara las dos entre sí **y con el texto de la migración
`0010_sync_espejo.sql`** (nombres y orden de columnas, las listas de etapas, entregas, plazos, estatus, cuentas
y tipos, los topes de los números y los permisos). Si alguien cambia una columna o un valor de un lado sin el
otro, esa prueba falla. `{ "accion": "estado" }` no escribe nada.

Respuestas: `{ ok: true, ventas, abonos, capacidad, … }`, o `{ ok: false, codigo }` con `CAPACIDAD_AGOTADA`,
`DATO_INVALIDO` (con `rechazadas` por fila, o `motivo: "formulas"`), `ESPEJO_APAGADO`, `ESQUEMA_INCOMPLETO`,
`SIN_RED` (candado ocupado: se reintenta), `DESCONOCIDO` con `parcial: true` (se cayó a la mitad: se reintenta,
es idempotente) y `ROL_SIN_PERMISO` (el secreto: la misma respuesta que da la puerta a quien no trae token).
Un lote es atómico: se valida y se calcula completo, con el candado puesto, antes de escribir. El tope del
cuerpo es el de siempre de `doPost`: 64 KB, por eso la función arma lotes de 40 filas y de a lo más 60 000
caracteres.

La función es `supabase/functions/espejo/` (`handler.js` con todo inyectable, `base.js` con las cuatro consultas
a PostgREST, `index.ts` que solo lo conecta a Deno) y su lógica pura está en `_shared/espejo.js`. Lee las
vistas `espejo_ventas` y `espejo_abonos` con la llave de servicio, con un cursor `(updated_at, id)` y un solape de
30 s; guarda su estado en `contadores` (`espejo:ventas`, `espejo:ventas_dinero`, `espejo:abonos`,
`espejo:completo`, `espejo:rechazadas`, `espejo:corrida`). Hay un cursor aparte para la hora del dinero
(`dinero_updated_at`) porque la vista trae dos horas y una venta cambia cuando cambia su obra o su dinero. Lo que
**ningún cursor ve** es un cambio que solo toque `instalaciones` (la vista no expone su hora). Agendar o mover una
cita por `instalacion_guardar` normalmente sube también el sello del proyecto y entonces sí se ve, pero una
escritura directa a esa tabla, o la importación, no: eso lo cubre la reconciliación completa de cada noche.
Los abonos de un folio se leen de 500 en 500 **hasta que llega una página vacía**, no hasta que llega una corta:
así un `max_rows` menor en la API no los deja incompletos (la hoja deja en blanco lo que no venga en la lista).

Las pruebas: `node pruebas/supabase-espejo.mjs`.

## Lo que no se pudo verificar

- Las fórmulas de la hoja (`H`, `K`, `R`, `T`, el Tablero…): la hoja de mentiras de las pruebas no calcula
  `ARRAYFORMULA`; se comprueba que el espejo **no las toca**, no que se recalculen sobre lo que escribe.
- Cómo reinterpreta Sheets de verdad cada valor (un texto que parece fecha o número), las validaciones de lista
  y el formato de las celdas; qué tan lento es escribir un lote en la hoja viva, y el candado con dos ejecuciones
  en paralelo.
- La aplicación web publicada (la redirección de Google, la versión desplegada) y PostgREST de verdad. Las vistas
  `espejo_ventas` y `espejo_abonos` (migración 0010) **se compararon como texto** con lo que espera el `.gs` y la
  función, pero nadie ejecutó ese SQL (aquí no hay Postgres): no se probó que la vista corra, ni cómo sale de
  PostgREST la hora con microsegundos o un `numeric`.
- Deno: `index.ts` pasa `deno check` y la batería de pruebas también corre bajo Deno 2.9.6 (`deno run -A pruebas/supabase-espejo.mjs`),
  pero eso no es el runtime de las Edge Functions de Supabase: no se midió su límite de 150 s por petición, los 2 s de CPU ni el cuerpo máximo.
