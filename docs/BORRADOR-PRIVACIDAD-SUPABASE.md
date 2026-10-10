# BORRADOR de cambios al aviso de privacidad por la migración a Supabase

> **BORRADOR para revisión de Elías; no es asesoría legal; no aplicar hasta la fase 2.**

Redactado el 2026-10-10. **No toca [`privacidad.html`](../privacidad.html)**: el aviso vigente sigue tal cual, porque escribir hoy que los datos están en Supabase sería falso. La migración está en construcción y apagada: la hoja de Google sigue siendo la fuente de verdad hasta la fase 4 ([`PLAN-SUPABASE.md`](PLAN-SUPABASE.md), [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md), avance en [`ESTADO-SUPABASE.md`](ESTADO-SUPABASE.md)).

**Para qué sirve.** La propia página promete avisar al equipo *antes* de un cambio de fondo —«datos nuevos, o un tercero nuevo»— (`privacidad.html`, líneas 175-176), y Supabase es las dos cosas. Por eso el plan pide actualizarla antes de la fase 2 (§9, punto 6), que es cuando entran datos reales de clientes a la base. Este documento junta los hechos y propone el texto; las decisiones que faltan están marcadas **[POR DECIDIR]**. Conviene que lo revise quien asesore legalmente a AL3D, sobre todo lo que toca a los datos de los clientes.

**Cómo está dividido**

| Parte | De qué trata | ¿Depende de Supabase? |
|---|---|---|
| **A** | Tres cosas que el aviso ya dice mal **hoy**, con el texto corregido | No. Son errores de hoy; aplicarlas antes de la fase 2 es decisión de Elías |
| **B** | Lo que cambia cuando se encienda Supabase | Sí. No se aplica hasta la fase 2 |
| **C** | Qué hay que tocar en la página y qué pruebas la vigilan | Sí |

---

## A. Lo que el aviso ya dice mal hoy

### A1. La llave de Google sí se guarda en el aparato

**Lo que dice** (`privacidad.html`, líneas 101-106): que la llave que entrega Google «vive solo en la memoria del navegador», que se pierde al cerrar la pestaña, que no se guarda en el aparato, y que lo único que sí se guarda es el correo.

**Lo que pasa de verdad**

- La llave se guarda en el aparato (`localStorage`, clave `al3d_pf_gtok`) mientras vale —Google la da por una hora— y se borra al salir. Se hizo así para no abrir la ventana de Google en cada recarga (`js/nucleo/ingreso.js`, líneas 33-39, 127-138 y 315-320). Lo que sí es cierto es que no viaja en ningún respaldo.
- Además del correo se guarda un «pase»: el correo, el área de la persona y hasta cuándo sirve sin señal, 30 días como máximo (`js/nucleo/puerta.js`, línea 128).

**Texto propuesto**

> Cuando entras, Google le da a la aplicación una llave temporal que dura una hora. Esa llave **se guarda en tu aparato mientras vale** —para que no tengas que escoger tu cuenta cada vez que recargas— y **se borra cuando sales**; no viaja en ningún respaldo. También se guardan en tu aparato tu correo y el área que te toca (dirección, fabricación o pagos), junto con la fecha hasta la que ese permiso sirve sin señal (30 días como máximo), para que la pantalla pueda abrir y decirte con quién estás dentro sin esperar a la red.

### A2. De la venta también salen el teléfono, la ubicación, la entrega y las notas

**Lo que dice** (líneas 112-115): que lo que sale del aparato es la venta y que, cuando un trabajo se gana, «su nombre, su importe, su fecha, su dirección de instalación y la etapa de la obra» se escriben en una hoja de cálculo de Google.

**Lo que pasa de verdad.** Esa lista se quedó corta. Hoy también viajan a la hoja, y después cada vez que cambian:

| Dato | Dónde queda en la hoja | Desde cuándo |
|---|---|---|
| Teléfono del cliente | columna AE «Telefono» | `puente-sheets-11` |
| Ubicación de la obra (el punto del mapa, o el enlace) | columna AB «Ubicacion» | antes |
| Forma de entrega (instalación, paquetería, recolección) | columna AF «Entrega» | `puente-sheets-12` |
| Notas del proyecto | columna AG «Notas» | `puente-sheets-14` |
| Plazo de taller | columna AH «Plazo taller» | `puente-sheets-14` |
| Anticipo, cuenta en la que se cobró, estado del cobro, comisión | columnas de dinero | antes |

Fuentes: `js/datos/puente.js`, líneas 101-117; `puente/hoja-apps-script.gs`, líneas 1915-1960 (las columnas) y 2120-2136 (quién escribe qué). Una precisión que ya es correcta y que conviene decir: el dinero solo llega a los teléfonos de dirección y de pagos; el de fabricación no lo recibe (`.gs`, líneas 2149-2153 y 2590-2594).

**Texto propuesto**

> Lo que sí sale del aparato es la venta: cuando un trabajo se gana, y después cada vez que algo de él cambia, se escribe en una hoja de cálculo de Google que es de AL3D. Ahí quedan el nombre del cliente y del negocio, el importe, el anticipo, la cuenta en la que se cobró y el estado del cobro, las fechas, la dirección y la ubicación de la obra, la forma de entrega, **el teléfono del cliente**, las notas del proyecto y el plazo de taller. Esa hoja es el libro mayor del negocio y la administra la dirección. El dinero solo llega a los aparatos de dirección y de pagos.

### A3. Las cotizaciones también salen cuando se pide o se da una autorización de precio

**Lo que dice** (líneas 109-111): que lo que haces, incluidas las cotizaciones, «se queda en tu propio aparato».

**Lo que pasa de verdad.** Cuando alguien pide a Dirección que autorice un precio, o Dirección lo autoriza, a la hoja llegan el nombre del negocio y del cliente, las partidas de la cotización con sus precios y el correo de quien la pidió y de quien la autorizó (hojas «Solicitudes de autorización» y «Autorizaciones»; `puente/hoja-apps-script.gs`, líneas 3556-3562, 3685-3696 y 3790-3792). El historial completo de cotizaciones, en cambio, sí se queda en el aparato.

**Texto propuesto** (se agrega al párrafo de A2)

> Cuando alguien pide que se autorice el precio de una cotización, o la dirección lo autoriza, a esa misma hoja llegan también el nombre del cliente y del negocio, las partidas con sus precios y el correo de quien la pidió y de quien la autorizó.

---

## B. Lo que cambia cuando se encienda Supabase

Todo esto describe el **plan**; ninguna parte existe en producción. Donde un dato depende del código que se está construyendo se dice.

### B1. Qué datos pasan a una base en la nube

| Dato | Hoy | Con Supabase |
|---|---|---|
| Nombre del cliente y del negocio | En el aparato de quien capturó, y en la hoja cuando se gana la venta o se autoriza un precio | En la base |
| Teléfono, dirección, ubicación, forma de entrega y notas de cada proyecto | Igual: aparato y hoja | En la base |
| Cotizaciones con partidas y precios | **Solo en el aparato** de quien las hizo; a la hoja solo llega lo de A3 | En la base. El plan las marca como la prioridad 1: son el dato más valioso y el más frágil |
| Importes, anticipo, cuenta, estado del cobro, comisiones y abonos | Aparato y hoja | En una tabla aparte que solo leen Dirección y Pagos; la hoja queda como copia de solo lectura |
| Proyectos, etapa de la obra, fechas y citas de instalación | Aparato y hoja | En la base |
| Material, almacén, listas de compra y proveedores (nombre y teléfono) | Aparato y hoja | En la base |
| Correos de las personas del equipo y su área | Pestaña «Accesos» de la hoja y el «pase» del aparato | Tabla de miembros de la base y el registro de usuarios del servicio de entrada de Supabase |
| Bitácora: quién cambió qué y cuándo | En cada aparato, y la hoja oculta «Bitácora del puente» (cuándo, qué rol, qué campos) | En la base, con las altas, los cambios de área y las salidas de personas, y quién los hizo |
| Imágenes de referencia de las cotizaciones | Solo en el aparato | **[POR DECIDIR]** El plan habla de almacenamiento de archivos, con el tamaño por revisar; hoy esas imágenes viven en el historial del cotizador y en una base propia (`al3d_cot_imgs`), no en el almacén `blobs` del plan, que está vacío |
| Respaldos | Ninguno automático: cada quien exporta el suyo | Un respaldo semanal de la base a Google Drive, que se enciende después de la fase 4 y **lleva datos de clientes** |

Fuentes: `PLAN-SUPABASE.md` §3.1, §4.7 y §6; `DECISIONES-SUPABASE.md` Q-02 y Q-20.

### B2. Proveedor y región

- **Proveedor:** Supabase. Aloja la base de datos, el servicio de entrada con Google, las funciones (entre ellas la que consulta a la inteligencia artificial) y, si se usa, el almacenamiento de archivos. **[POR CONFIRMAR]** en el panel de Supabase: el nombre de la empresa de nube sobre la que corre y el país donde quedan los datos.
- **Región.** Hoy existe un solo proyecto, el de **pruebas** (`al3d-pruebas`), sin datos reales, en West US (North California). El de **producción** no existe todavía: su región está **[POR DECIDIR]**.
- **Plan gratuito.** Se pausa tras una semana sin actividad y no hace respaldos automáticos (verificado en la página de precios el 2026-10-10); por eso el plan prevé un aviso que lo mantiene despierto y el respaldo semanal a Drive de B1.

### B3. Quién ve qué, por área

La limitación es **solo por área**; no hay permisos por obra ni por cliente (decisión de Elías, `PLAN-SUPABASE.md` §4.8).

| Qué | Dirección | Pagos | Fabricación |
|---|---|---|---|
| Dinero (importes, anticipo, cuenta, estado del cobro, comisiones, abonos) | Ve y escribe | Ve y escribe | **No lo ve: ni siquiera le llega** |
| Etapa de la obra | Cualquiera | No la mueve | Hasta «Listo» |
| Cotizaciones y solicitudes de autorización | Todas | Las suyas | Las suyas |
| Costos del almacén | Los ve | Los ve | No los ve; opera el almacén sin ellos |
| Teléfono, dirección, ubicación, entrega y notas del cliente | Todo | **[POR CONFIRMAR]** Hoy lo ve todo | **[POR CONFIRMAR]** Hoy lo ve todo |
| Correos y áreas del equipo | Los ve y los cambia | **[POR CONFIRMAR]** | **[POR CONFIRMAR]** |

Fuentes: `PLAN-SUPABASE.md` §4.2 y §4.3; `DECISIONES-SUPABASE.md` Q-02, Q-03, Q-05 y Q-13. Hoy el puente solo le quita el dinero a Fabricación y deja pasar el resto (`puente/hoja-apps-script.gs`, líneas 2590-2594): si el plan no cambia eso, la página tiene que decir que los tres equipos ven los datos de contacto de los clientes.

### B4. Cómo se da de baja un acceso y qué se borra del teléfono

**Lo decidido** (`PLAN-SUPABASE.md` §4.8; `DECISIONES-SUPABASE.md` Q-09)

1. Dirección da de baja a la persona. Desde su **siguiente consulta** a la base ya no ve nada.
2. El teléfono **borra su copia local** la próxima vez que se conecte: la base le contesta con una señal explícita de acceso revocado y la aplicación borra lo guardado de la empresa y vuelve a la pantalla de entrada. Se borran, dicho en llano y a reserva de la lista exacta que se fije al construirlo: cotizaciones, proyectos, agenda, material, almacén, bitácora, imágenes de las cotizaciones, y los datos de acceso guardados (correo, pase, llaves). **Se conservan** el identificador del aparato y el contador de folios, para que no se repitan folios.
3. Tres candados para no borrar por error: solo con esa señal explícita (nunca por falta de señal ni porque una consulta salió vacía); solo si no hay nada sin enviar (si lo hay, se bloquea la pantalla y **no** se borra); y todo detrás del interruptor, apagado hasta que exista la subida única de lo que solo está en los teléfonos.
4. **Límite que hay que decir con todas sus letras:** un teléfono que nunca vuelve a conectarse conserva sus datos. Sin conexión no se puede evitar; lo que protege es el bloqueo del propio teléfono.
5. Además queda anotado quién dio de alta, cambió de área o dio de baja a quién.

**Lo que hoy no existe.** Esa borradura del teléfono **no está en el código**: hoy, si quitan a alguien de «Accesos», su teléfono solo cierra la puerta (borra el pase) y no borra datos. El botón de borrar todo de Ajustes tampoco cubre todo lo guardado: deja fuera, por ejemplo, el historial de cotizaciones (`js/mod/ajustes.js`, líneas 1709-1756).

**Lo que vale lo mismo que hoy:** «Salir de este aparato» y quitar el permiso desde la cuenta de Google siguen igual. **Cambia:** borrar los datos del sitio en el navegador ya no «se lleva» tus datos, porque la copia buena está en la nube; solo borra la copia del aparato.

**[POR DECIDIR] La baja y el correo.** La página dice hoy: «escríbele a… y se borra tu correo». El borrador de la migración de acceso (`supabase/migrations/0002_acceso.sql`, en construcción) **no borra el renglón** de quien sale: lo marca como baja y lo conserva como evidencia, con la fecha y quién la dio, y la bitácora conserva su correo. Las dos cosas no pueden ser ciertas a la vez. Hay que decidir cuál se queda y por cuánto tiempo, y la página tiene que decir la que sea.

### B5. Cuánto tiempo se guarda

Hoy la página dice que los datos del negocio se guardan «mientras AL3D los necesite» y lo que la ley exija de su contabilidad, y el correo mientras la persona trabaje con AL3D (líneas 151-154). El plan **no fija plazos**. Lo que hay que decidir:

| Qué | Pregunta |
|---|---|
| Cotizaciones que no se ganaron | ¿Cuánto tiempo se guardan en la nube? Hoy cada quien las tiene en su teléfono hasta que las borra |
| Lo «borrado» en la aplicación | Las tablas de negocio no se borran de verdad: se marcan como borradas para que los demás aparatos se enteren (`DECISIONES-SUPABASE.md` A.6). **[POR DECIDIR]** cuándo se purga lo marcado, sobre todo si alguien pide que se borren sus datos |
| Bitácora | ¿Cuánto tiempo se conserva, con los correos y nombres que lleva? |
| Correo de quien salió | Ver B4 |
| Respaldos semanales en Drive | ¿Cuántos se conservan y quién tiene acceso a esa carpeta? Llevan datos de clientes |

### B6. Terceros

| Tercero | Cambio |
|---|---|
| **Supabase** | **Nuevo.** Base de datos, entrada con Google, funciones y, si se usa, archivos (B2) |
| **Google** | Sigue para entrar con la cuenta. La hoja de cálculo queda como **copia de solo lectura**. Se agrega Drive para el respaldo semanal (después de la fase 4). Calendar sigue igual: lo activa la dirección con su propio permiso y no pasa por la base |
| **Qwen, DeepSeek o Gemini** | Solo si alguien usa la inteligencia artificial, como hoy. **Cambia el camino:** la imagen o el texto ya no pasan por la hoja, sino por una función de Supabase y de ahí al proveedor, con las llaves guardadas en el servidor (la página dice hoy que pasan por «esa hoja», líneas 130-135) |
| OpenStreetMap y Carto; Google Fonts y cdnjs | Sin cambio |

Qué datos de tu cuenta de Google guardará el servicio de entrada de Supabase —el correo seguro; el nombre y la foto, según cómo se configure— **[POR CONFIRMAR]** al construir el inicio de sesión: la página dice hoy que el permiso es solo «openid email» (líneas 91-99).

### B7. Lo que no cambia

No se venden ni se comparten los datos, no hay publicidad, no hay analítica de terceros, no se toman decisiones automáticas sobre las personas (líneas 138-149). Al encender Supabase hay que **comprobar** que eso siga siendo cierto: que no se active ninguna telemetría y que la página no cargue nada de otros sitios (su política de contenido lo impide, ver C2).

---

## C. Qué hay que tocar en la página y en las pruebas

### C1. Sección por sección

| Sección (`privacidad.html`) | Qué hay que hacer |
|---|---|
| 1. De quién es (líneas 83-85) | Agregar quién es responsable de la base y quién es su proveedor (B2) |
| 2. Para quién es la aplicación (87-89) | Sigue siendo cierto: la dirección da de alta y de baja. Si algún día entran clientes (fase 6 del plan), es un público nuevo |
| 3. Qué te pedimos de tu cuenta de Google (91-106) | **A1** ahora; después, confirmar qué datos del perfil guarda el servicio de entrada (B6) |
| 4. Qué datos guarda la aplicación (108-118) | Reescribir: la nube es la fuente y el aparato guarda una copia; los datos de B1; **A2 y A3** (esa sección es donde ya están mal hoy) |
| 5. A quién más le llegan datos (120-136) | Agregar Supabase, el nuevo camino de la inteligencia artificial, el respaldo a Drive y la hoja como copia (B6) |
| 6. Qué NO hacemos (138-149) | Comprobar que sigue siendo cierto (B7) |
| 7. Cuánto tiempo se guarda (151-154) | Escribir los plazos de B5 |
| 8. Cómo quitas tu acceso y tus datos (156-169) | Reescribir con B4: quién da de baja, qué borra el teléfono y su límite, y que borrar los datos del sitio ya no borra los de la nube |
| 9. Menores (171-172) | Sin cambio |
| 10. Si esto cambia (174-176) | Sin cambio de texto, pero **la propia sección obliga a avisar al equipo antes**: Supabase es un tercero nuevo y la base, un lugar nuevo para los datos |
| Fecha de arriba («Rige desde…», línea 37) | Poner la fecha en que se aplique |

### C2. Lo que la página y las pruebas no dejan hacer

- **Diez secciones, fijas.** `pruebas/navegador/publicas.mjs` (línea 640: `['privacidad', 10]`) comprueba que la página tenga exactamente diez títulos con su `id` y diez renglones en el índice. Agregar o quitar una sección obliga a cambiar ese `10` **y** el índice (líneas 68-77 de la página). Lo más sencillo es meter lo nuevo dentro de las secciones que ya existen, con subtítulos (`h3`), que no cuentan.
- **Cero JavaScript propio** y política de contenido cerrada (`connect-src 'self'`): `pruebas/csp.mjs` (líneas 104 y 156-178) lo vigila, y la prueba de navegador exige que el único guion sea `js/tema.js`. Es texto: no cambia la política.
- **La puerta tiene que enlazar la página** (`pruebas/puerta.mjs`, líneas 252-253).
- **La prueba de navegador no corre en la computadora de Elías**: usa rutas de Linux para el navegador. Hay que correrla donde sí se pueda, o adaptar las rutas, antes de dar el cambio por bueno.

### C3. Páginas hermanas que hablan de dónde viven los datos

- `condiciones.html`, secciones 5 y 6 (líneas 111-124): dicen que «buena parte de lo que se captura vive en el aparato de cada quien» y que el respaldo es responsabilidad de quien usa el aparato. Con la nube, eso cambia. Esa página tiene nueve secciones fijas (`['condiciones', 9]`).
- `acerca.html`, línea 98: «leído de la hoja de cálculo donde AL3D lleva sus ventas».

---

## Preguntas abiertas

1. **Los clientes.** Los teléfonos, direcciones y ubicaciones que pasan a la nube son de los clientes, y la página solo habla del equipo. Si hace falta un aviso para ellos (por ejemplo, bajo la ley mexicana de datos personales, la LFPDPPP), lo decide quien asesore legalmente a AL3D; este borrador no lo resuelve.
2. **Plazos** de B5 y qué pasa con el correo de quien sale (B4).
3. **Región y proveedor de nube** de producción (B2), y qué dicen los términos de Supabase del plan gratuito sobre datos de clientes.
4. **Imágenes de las cotizaciones:** ¿suben o se quedan en el aparato?
5. **Quién es el responsable de la base.** La página nombra a «AL3D — Elías Garibi» (líneas 84-85); confirmar que se mantiene.
6. **Los servidores del sitio.** La página no menciona a GitHub ni a Cloudflare, que son los que sirven la aplicación (`puente/DESPLIEGUE.md`, tabla «Lo que hay montado»). No es nuevo ni depende de Supabase; se anota porque se va a reescribir la sección de terceros.
7. **Cuándo avisar al equipo y cuándo aplicar.** El plan pide actualizar el aviso antes de la fase 2 y, la propia página, avisar *antes* del cambio. Fecha por fijar por Elías.
