# Ruta: sistema unificado de AL3D sobre Supabase (plan gratuito)

Estado: **aprobado por Elías el 2026-10-10 para implementarse**. Este documento es el plan tal como se aprobó; el avance real de cada fase vive en [`docs/ESTADO-SUPABASE.md`](ESTADO-SUPABASE.md).
Depende de: PR #99 (puente-sheets-14), **ya fusionado el 2026-10-10**. Su regla de sellos (`obraDeLaFila`, `sellarFila_`) es la que se porta.

> **Nota de implementación (2026-10-10).** Dos cosas del borrador original cambiaron al llegar a la implementación:
> 1. El PR #99 ya está fusionado en `main`, así que este documento no viaja en esa rama sino en `claude/supabase-fase-0-1`.
> 2. La cuenta de Supabase existía pero sin organización ni proyecto; se crearon desde la sesión local de Claude con el permiso de Elías. La contraseña de la base y los secretos siguen la regla de la sección 4.12: no pasan por el chat ni por el repositorio.

---

## 1. Contexto

Hoy el sistema vive en tres lugares:

| Dónde | Qué guarda | Quién lo usa |
|---|---|---|
| IndexedDB de cada teléfono (`js/datos/db.js`) | Proyectos, instalaciones, material, almacén, bitácora, bandeja de salida | La app, por dispositivo |
| Google Sheets «Finanzas AL3D» (`puente/hoja-apps-script.gs`) | Ventas y dinero, almacén, catálogo, listas de compra, autorizaciones, accesos | Pagos y Dirección, y el puente |
| localStorage del cotizador (`al3d_historial`, `js/cotizador/historial.js:21`) | Cotizaciones autorizadas y cola de pendientes | Solo el aparato donde se hicieron |

Funciona, pero cada cambio nuevo (almacén, teléfono, entrega, sellos) agregó columnas y reglas a mano. `docs/ARQUITECTURA.md:1364` dice «No se usa Supabase»; esta ruta lo cambia y hay que documentarlo.

**Lo que pediste**
- Supabase y Vercel en planes gratuitos.
- Un sistema unificado para todas las áreas del negocio, y para otros negocios a futuro.

**Lo que decidiste**
- Hoy solo entra el equipo interno (Dirección, Fabricación, Pagos). A futuro, los clientes ven el estatus de su proyecto.
- Solo AL3D por ahora. El diseño tiene que admitir más empresas sin rehacer nada.
- La hoja queda como **espejo de solo lectura**, permanente.
- El sitio se queda en **GitHub Pages**.

**Consecuencia que hay que comunicar**: Pagos y Dirección dejan de editar en la hoja. Hoy lo hacen (Pagos aprieta estatus y cuenta ahí). Pasan a capturar solo en la plataforma.

---

## 2. Recomendación

**Supabase es la fuente de verdad. La hoja refleja la base y nunca se lee como fuente. GitHub Pages sirve la app. No se usa Vercel.**

---

## 3. Inventario: qué pasa con cada cosa actual

Nada se elimina sin un destino escrito. Esta tabla es la lista de control de la migración.

### 3.1 Datos

| Actual | Destino en Supabase | Notas |
|---|---|---|
| `proyectos` (IndexedDB) | `proyectos` | Quita `empresa_id` de la copia local; la base lo lleva siempre |
| Dinero en `proyectos` (`sub`, `anti_pactado`, `pago_pendiente`, `comision_restante`, `pct_comision`, `estatus_notion`, `cuenta`) | `ventas_dinero` | Tabla aparte, con RLS solo para Dirección y Pagos |
| `instalaciones` | `instalaciones` | Incluye `uid_ics` y `movida` (el .ics depende de ellos) |
| `materiales`, `requerimientos`, `movimientos` | `materiales`, `requerimientos`, `almacen_movimientos` | `movimientos` es append-only |
| `constantes` (constantes del taller) | `constantes` por empresa | Hoy son por dispositivo; pasan a ser de la empresa |
| `avisos` | No se migra | Se calculan en cada cliente (así es hoy) |
| `geo` (caché de ubicaciones) | No se migra | Se vuelve a llenar sola |
| `blobs` (imágenes de referencia) | Supabase Storage | Revisar tamaño antes de subir |
| `bitacora` | `bitacora` | Se conserva el historial completo |
| `ventas_hoja` (espejo de la hoja) | No se migra | Desaparece: la base es la fuente |
| `pendientes` (bandeja) | No se migra | Se reconstruye; se drena antes del corte |
| `al3d_historial` (cotizaciones) | `cotizaciones` | **Prioridad 1**: es el dato más valioso y el más frágil |
| `al3d_queue` (cola de pendientes del cotizador) | `cotizaciones` con estado `pendiente` | |
| Hoja «Ventas» | `proyectos` + `ventas_dinero` | Import una vez; después, espejo |
| Hoja «Almacén», «Catálogo de material», «Listas de compra» | `almacen_movimientos`, `materiales`, `requerimientos` | |
| Hoja «Autorizaciones» y «Solicitudes de autorización» | `cotizaciones` (sello, renglones, revocación) y `solicitudes` | El QR de los PDF ya impresos debe seguir verificando: se conserva el sello y la clave |
| Hoja «Accesos» | `miembros` | |
| Hoja «Comisiones por periodo» y «Abonos comisión» | Vistas sobre `ventas_dinero` y `abonos` | Son cálculos, no datos; se recalculan y se cuadran con la hoja |
| Hoja «Revisión Y-AD», «Ventas (antes de realinear)», «Ventas (respaldo)» | No se migran | Son auxiliares de la realineación ya terminada; se quedan en la hoja como archivo |
| Propiedades del script (`PUENTE_TOKENS`, `SELLO_AUTORIZACION`, `IA_KEYS`, `FOLIO_MAS_ALTO`) | Secretos de Supabase (Vault) o de Edge Functions | `SELLO_AUTORIZACION` no se rota: romperla invalida todos los PDF |

### 3.2 Código del puente (`puente/hoja-apps-script.gs`)

| Ruta actual | Destino |
|---|---|
| `/salud`, `/esquema` | Edge Function `salud` (o se quitan: Supabase da su propio estado) |
| `/jalar`, `/empujar` | Cliente de Supabase + RLS + Realtime |
| `/jalar_almacen`, `/empujar_almacen` | Igual, sobre las tablas de almacén |
| `/solicitar`, `/cancelar`, `/pendientes`, `/estado`, `/autorizar`, `/rechazar`, `/revocar` | Funciones SQL (RPC) con reglas de rol en la base |
| `/verificar` (QR público) | Edge Function pública, con su propio límite de peticiones |
| `/ia` | Edge Function (las llaves salen del Vault, nunca llegan al navegador) |
| `/expandir` (enlaces cortos de Maps) | Edge Function, con la misma lista blanca de dominios |
| `/carpetas`, `/crear_carpeta` (Drive) | **Se queda en Apps Script**: necesita Drive |
| Espejo hacia la hoja | Nueva ruta `espejo` en Apps Script, llamada por una Edge Function |

### 3.3 Partes que no cambian

- Sitio en GitHub Pages (`sw.js`, `_headers` de Cloudflare sigue como está).
- El cotizador como herramienta de captura: se conserva su interfaz; solo cambia dónde guarda.
- La regla «gana el cambio más reciente» con sellos por campo (`js/datos/puente.js`, `obraDeLaFila`).

---

## 4. Diseño

### 4.1 Multiempresa

- Cada tabla de negocio tiene `empresa_id not null`. RLS filtra por la empresa del usuario.
- Hoy solo existe `al3d`. `Prefs.empresa()` (`js/datos/prefs.js:323`) deja de decidir la empresa: la decide la membresía.
- Un usuario puede pertenecer a varias empresas en el futuro. La app elige una empresa activa al entrar.

### 4.2 Roles y permisos

- `miembros(usuario_id, empresa_id, area)`. `area` ∈ {`direccion`, `fabricacion`, `pagos`} hoy; `cliente` después.
- Matriz de permisos (la misma que `PUENTE_ROLES`, `CAMPOS_ROL`, `TOPE_ROL`, pasada a la base):
  - **Dirección**: todo.
  - **Pagos**: dinero, cobranza, estatus, cuenta, teléfono, notas. No mueve la etapa.
  - **Fabricación**: etapa hasta «Listo», dirección, pin, entrega, teléfono, almacén. No ve dinero.
- Se aplica en tres capas, en este orden: RLS en cada tabla, vistas por área para lectura, y funciones SQL para acciones (autorizar, cobrar, mover etapa).
- Cambiar el rol en Ajustes no da permisos; ya era así y sigue siendo así.

### 4.3 Dinero aparte

- `ventas_dinero` tiene RLS que solo deja leer y escribir a Dirección y Pagos.
- Fabricación ni siquiera recibe la fila por la API. Esto sustituye a `sinLoQueNoLeToca` (`hoja-apps-script.gs:2149`), que filtra después de leer.

### 4.4 Sincronización

- Se conserva la bandeja de salida (`pendientes`) y el reintento. Cambia el transporte: el cliente de Supabase en vez de `/empujar`.
- Lectura por **Realtime** en lugar del sondeo cada 30 segundos (`js/app.js:1837`). El sondeo queda como respaldo.
- La regla de sellos (`obraDeLaFila`, `sellos` por campo) se conserva tal cual, porque ya está probada.
- Sin señal, la app sigue funcionando con la bandeja local, como hoy.

### 4.5 Espejo a la hoja (solo lectura)

- Una Edge Function escucha cambios de `ventas` y `ventas_dinero` y los manda a la ruta `espejo` del Apps Script.
- Si alguien edita la hoja, el siguiente cambio de la base la sobrescribe. Se avisa en la hoja con una nota en la primera fila.
- El espejo es un reflejo; si falla, la base sigue bien y se reintenta.

### 4.6 Plan gratuito: lo que hay que verificar

No doy estos límites por seguros desde aquí; hay que revisarlos en las páginas de precios antes de la fase 1.

- **Supabase Free**: se pausa tras una semana sin actividad; sin respaldos diarios; límites de almacenamiento, de conexiones concurrentes y de invocaciones de funciones.
  - Mitigación: un cron semanal que hace una consulta (evita la pausa) y un respaldo exportado a Drive.
- **Vercel Hobby**: prohíbe uso comercial. Por eso no se usa. Si después se quiere, es Pro, de pago por miembro del equipo.
- **Apps Script**: se mantiene solo para el espejo y Drive.

### 4.7 Modelo mínimo (primera versión)

- `empresas(id, nombre)`.
- `miembros(usuario_id, empresa_id, area)`.
- `clientes(id, empresa_id, nombre, teléfono, dirección)`.
- `proyectos(id, empresa_id, cliente_id, folio, etapa, notas, plazo, pin, entrega, sellos, …)`.
- `ventas_dinero(proyecto_id, empresa_id, subtotal, anticipo, iva, cuenta, estatus, liquidación, pct_comision, …)`.
- `instalaciones(…, uid_ics, movida)`.
- `cotizaciones(id, empresa_id, folio, datos, estado, sello, renglones, revocada)`.
- `solicitudes(…)`.
- `almacen_movimientos`, `materiales`, `requerimientos`, `constantes`.
- `bitacora(…)`.

### 4.8 Usuarios, alta, baja y salida (decidido)

- **Limitaciones solo por área** (decisión tuya). Cada persona tiene un área; no hay permisos por obra ni por cliente. Si después un instalador debe ver solo sus obras, eso es un cambio de esquema (`proyectos.responsable`) que no entra en la primera versión.
- **Alta**: Dirección agrega un renglón en `miembros` (correo, área). Quien entra con Google ya está dentro.
- **Cambio de área**: se hace en `miembros`; surte efecto en la siguiente petición (RLS lo lee en cada consulta).
- **Salida**: Dirección quita el renglón. Decisión tuya: **el teléfono borra su copia local al siguiente contacto**, aunque haya leído sin conexión.
  - Mecanismo: la base devuelve `acceso_revocado` en cada respuesta; la app borra IndexedDB y localStorage con datos de la empresa, y vuelve a pantalla de entrada.
  - Límite honesto: un teléfono que nunca vuelve a conectarse conserva sus datos. Eso no se puede evitar sin conexión. Se dice así a Dirección.
- **Bitácora de accesos**: cada alta, cambio de área y salida queda en `bitacora`, con quién lo hizo.
- **Dispositivos**: hoy los tokens de dispositivo son la salida de emergencia (`PUENTE_TOKENS`). En la fase 5 se retiran; la salida pasa a ser quitar el renglón de `miembros`.

### 4.9 Módulos que el plan no cubría (agregados)

| Módulo | Qué hace hoy | Decisión en esta ruta |
|---|---|---|
| Google Calendar (`js/nucleo/gcal.js`) | Cada usuario crea eventos en **su** calendario con su propio token (`pedirToken`, `crearEvento`, `moverEvento`, `borrarEvento`) | Se conserva tal cual: el token es de cada persona y no pasa por la base. Los eventos guardan `gcal_event_id` en `instalaciones` |
| Archivos .ics (`js/nucleo/ics.js`) | Calendario sin Google, con `uid_ics` y `movida` | Se conserva; los campos viajan en `instalaciones` |
| Asistente de IA (`js/nucleo/asistente.js`, `js/datos/asistente-contexto.js`) | Lee el contexto del negocio y consulta la IA | Su contexto se arma desde la base por RLS, así que cada persona solo recibe lo de su área. Las llaves de IA salen del navegador (Edge Function `ia`) |
| Cuenta (`js/nucleo/cuenta.js`) | Muestra quién está dentro | Se toma de la sesión de Supabase |
| Carpetas de Drive (`/carpetas`) | Lee «Trabajos Pendientes» | Se queda en Apps Script |
| Cotizador y su PDF | Firma con `SELLO_AUTORIZACION` | La clave **no se mueve ni se rota**; la verificación de PDF ya impresos se prueba antes del corte |
| WhatsApp Business (revisión de chats, skill `revision-whatsapp-al3d`) | Fuera de la plataforma | **Fuera de alcance** de esta ruta; se decide aparte |
| Aviso de privacidad (`privacidad.html`) | Describe lo que se guarda | Hay que actualizarlo: pasan a la base teléfonos, direcciones y ubicaciones de clientes |

### 4.10 Cálculos que hoy viven en la hoja y en el código

- La hoja calcula «Precio Neto», «Pago Pendiente», «Comisiones» (10 % sin IVA) y «Comisión Restante». La base debe reproducirlos **igual, al centavo**. Se resuelve con una vista SQL y una prueba que compara ambos resultados sobre todas las ventas (es lo que hoy hace `pruebas/precio-servidor.mjs`).
- El material (`js/datos/material.js`, `stock.js`, `reglas.js`) se calcula en el navegador. Se conserva en el cliente en la primera versión; moverlo a SQL es una fase aparte.
- Se conserva la regla de «fórmulas solo lectura» (`puente/README.md`): la base calcula, el cliente no escribe importes derivados.

### 4.11 Pruebas existentes

Hoy hay 55 pruebas de node y 45 de navegador. Antes de la fase 1 se clasifican:
- **Siguen valiendo** (funciones puras: material, cotizador, precios, fechas, ics).
- **Se reescriben** (las que hablan con el puente o con la hoja: `puente*.mjs`, `sincronizacion.mjs`, `dos-telefonos.mjs`, `navegador/puente.mjs`).
- **Se retiran** con la fase 5 (las del Apps Script de hoja y de tokens).

---

### 4.12 Secretos: qué es, dónde vive y quién lo toca

**Regla base**: un secreto nunca va al navegador, al repositorio, a la hoja ni al chat. Si aparece en un lugar equivocado, se rota.

**Inventario actual y destino**

| Secreto | Qué es | Dónde vive hoy | Destino | Público o secreto |
|---|---|---|---|---|
| `IA_KEYS` (Qwen, DeepSeek, Gemini) | Llaves de los proveedores de IA | Propiedades del Apps Script | Supabase Edge Function `ia` (secretos de funciones) | **Secreto** |
| `SELLO_AUTORIZACION` | Clave con la que se firman los PDF autorizados | Propiedades del Apps Script | Supabase Vault | **Secreto, no se rota** (cambiarla invalida todos los PDF ya entregados) |
| `PUENTE_TOKENS` | Tokens de dispositivo (uno por área) | Propiedades del Apps Script | Se retiran en la fase 5 | **Secreto** |
| Secreto del espejo | Clave entre la Edge Function y la ruta `espejo` | No existe | Nuevo: secreto de la función y de la ruta | **Secreto** |
| `service_role` de Supabase | Llave que salta RLS | No existe | Solo en Edge Functions y en la sesión local de Supabase | **Secreto, nunca al navegador** |
| Contraseña de la base | Acceso directo a PostgreSQL | No existe | Gestor de contraseñas de Elías | **Secreto** |
| `anon` de Supabase | Llave pública del proyecto | No existe | En el código de la app | Público (la protege RLS) |
| URL del proyecto de Supabase | Dirección del proyecto | No existe | En el código de la app | Público |
| IDs de cliente de Google | Identificadores de la app de inicio de sesión | `PUENTE_CLIENT_IDS` y `js/nucleo/gcal.js` | Se conservan; Supabase tiene el suyo | Públicos (Google los diseñó así) |
| Token de Google Calendar de cada persona | Permiso para su propio calendario | `localStorage` del aparato de cada persona | Se conserva | **Secreto de la persona**; no pasa por la base |

**Quién toca qué**

- **Tú**: eres dueño de las cuentas (Supabase, Google, proveedores de IA) y del gestor de contraseñas. Las llaves de IA y la contraseña de la base los creas y los rotas tú, desde sus paneles.
- **La sesión local en tu computadora**: usa `supabase login` con tu cuenta. Carga secretos con `supabase secrets set` desde un archivo temporal o desde la entrada del terminal, nunca escritos en la línea de comandos ni impresos en la salida.
- **Yo, en la nube**: no veo ni manejo secretos reales. Escribo el código que los **lee** del entorno, y las pruebas usan valores falsos y marcados como tales. No los pido por el chat.
- **Quien deje de trabajar**: se rota lo que esa persona conocía (no aplica hoy; se anota para cuando haya más personas).

**Reglas de manejo**

1. Nada con secretos se guarda en el repositorio. Un archivo `.env` local va en `.gitignore`.
2. Antes de cada commit se revisa que no haya llaves: el escaneo de secretos de GitHub queda activado para el repositorio.
3. Los secretos de la base viven en la bóveda de Supabase (Vault) o en los secretos de cada función, nunca en tablas normales.
4. Las llaves de la app pública (`anon`) pueden estar en el código, porque su alcance lo limita RLS. La prueba de RLS de la fase 1 confirma que sin sesión no se lee nada.
5. Si una llave aparece donde no debe (chat, repositorio, captura de pantalla), **se rota ese mismo día**. Para el sello no hay rotación simple: ver la regla 7.
6. Las pruebas de RLS y de la función `ia` se corren con un proyecto de pruebas, con llaves de prueba.

**Respaldo de secretos (decisión tuya)**

- Un gestor de contraseñas a tu nombre guarda: contraseña de la base, `service_role`, llaves de IA y las cuentas de los proveedores.
- El **sello de autorización** se guarda en una copia fuera de línea (archivo cifrado en un USB, guardado en un lugar seguro). Sin esa copia, un fallo de la base obliga a regenerar el sello y a dar por inválidos todos los PDF ya entregados.

**Rotación y fuga**

- **Llaves de IA**: se rotan cuando se sospeche fuga, desde el panel de cada proveedor, y se actualizan en el secreto de la función. No afecta a los PDF.
- **`service_role` y contraseña de la base**: se rotan desde Supabase si hay fuga. Hay que actualizar las funciones que la usan.
- **Sello de autorización**: solo en caso de fuga confirmada. Procedimiento: nueva clave, aviso a Dirección y revocación de los PDF afectados con la función `revocar`. Se decide contigo antes de hacerlo.
- **Tokens de dispositivo**: se retiran en la fase 5.

**Punto a decidir**: si quieres que la sesión de tu computadora cargue los secretos por ti, o prefieres cargarlos tú en el panel de Supabase. Lo segundo es más seguro.

## 5. Fases

Cada fase termina con algo que se puede verificar y que permite volver atrás.

**Fase 0 — Decisiones y documentación.** Corregir `docs/ARQUITECTURA.md:1364` y el encabezado de `js/datos/sync.js` (describe Notion, ya no es así). Confirmar la lista de áreas. Avisar al equipo que la hoja deja de ser editable.
- *Salida*: documento de decisión aprobado. No se toca código de producción.

**Fase 1 — Base y acceso.** Proyecto Supabase, esquema, RLS por área, funciones SQL de acciones, login con Google.
- *Salida*: pruebas de RLS en verde para los tres roles. Ninguna fila real todavía.

**Fase 2 — Importar.** Script de una sola vez: hoja completa (copia antes de tocar nada), y los datos de cada teléfono (IndexedDB e historial de cotizaciones). Los datos están repartidos entre teléfonos: se unen por `Folio cotizacion` y las diferencias van a un reporte de conflictos que alguien revisa a mano; el script no decide.
- *Salida*: reporte de cuadre: número de ventas, suma de saldos, comisiones pendientes, cotizaciones autorizadas; debe coincidir con la hoja y con los teléfonos.

**Fase 3 — Doble escritura.** La plataforma escribe en la base (a través de la bandeja). La Edge Function refleja a la hoja. Cuadre diario automático.
- *Salida*: siete días seguidos de cuadre. Si no cuadra, se regresa a la fase 2.

**Fase 4 — Cambio de lectura.** La plataforma lee de la base. La hoja queda en solo lectura. Realtime sustituye el sondeo.
- *Salida*: los tres roles lo usan una semana sin incidentes. Rollback: volver a leer de la hoja, que sigue completa.

**Fase 5 — Retiro.** Se quitan `/empujar`, `/jalar`, los tokens de dispositivo y las columnas que ya no se usan. Se conserva la ruta `espejo`.
- *Salida*: el Apps Script queda con dos rutas (`espejo`, `carpetas`).

**Fase 6 — Clientes (después).** Rol `cliente` con RLS que solo deja ver su proyecto, y una vista sin dinero ni notas internas.

---

## 6. Respaldos y reversión

- **Antes de la fase 2**: copia completa de la hoja (archivo nuevo en Drive, con fecha) y exportación de la base de cada teléfono (`js/datos/db.js` ya tiene exportación).
- **Durante la fase 3–4**: la hoja sigue siendo una copia completa; volver atrás es regresar la lectura a la hoja.
- **Después de la fase 4**: respaldo semanal de la base a Drive (el cron del punto 4.6).
- **Secretos**: nada en el repositorio. Llaves de IA, sello de autorizaciones y tokens en el Vault de Supabase.

---

## 7. Verificación

- **RLS**: pruebas SQL por cada rol (permitido y denegado), incluido que Fabricación no puede leer `ventas_dinero` por la API.
- **Importación**: cuadre entre hoja, base y teléfonos (punto 5, fase 2).
- **Dos dispositivos**: adaptar `pruebas/sincronizacion.mjs` para que hable con Supabase local (`supabase start`; requiere Docker, que hay que confirmar que está disponible en esta sesión) y con la hoja de mentiras para el espejo.
- **Navegador**: `pruebas/navegador/dos-telefonos.mjs` contra el proyecto de pruebas.
- **Sellos heredados**: un PDF autorizado antes de la migración debe seguir verificando en `verificar.html`.
- **Cuadre diario** en las fases 3 y 4.

---

## 8. Archivos

- **Modificar**: `js/datos/db.js` (almacenes → tablas), `js/datos/sync.js` (bandeja → Supabase), `js/datos/puente.js` (mapeos y sellos), `js/nucleo/ingreso.js` y `puerta.js` (login), `js/app.js` (sondeo → Realtime), `js/datos/prefs.js` (empresa), `docs/ARQUITECTURA.md`.
- **Nuevos**: `supabase/migrations/*.sql`, `supabase/functions/{ia,maps,verificar,espejo}/`, `supabase/tests/rls.sql`, `scripts/importar-hoja.*`.
- **Puente**: `puente/hoja-apps-script.gs` (ruta `espejo`), `puente/README.md`, `puente/DESPLIEGUE.md`.

---

## 9. Pendiente de ti

**Paso 0 — pasar el plan a la otra sesión (aprobado por ti como PR)**

- Crear `docs/PLAN-SUPABASE.md` con el contenido de este archivo (sin secretos; el archivo no los tiene).
- Lo dejo en la rama designada de esta sesión (`claude/sleepy-pasteur-tpryn5`), que ya tiene el PR #99 abierto. Así no se abre un PR nuevo sin tu permiso. Si prefieres un PR aparte solo con el documento, dímelo y lo hago.
- La otra sesión lee el archivo desde esa rama en GitHub. No necesita PR #99 fusionado para leerlo; sí lo necesita para implementar la fase 1, porque ahí está la regla de sellos.
- Ningún cambio de código ni de la hoja real en este paso.

**Reparto de trabajo (regla 1 y 2)**

- **Regla 1 — tú, en tu computadora**: creas tu cuenta y el proyecto de Supabase, y cargas los secretos (4.12). Ahí abres la sesión local de Claude con tu cuenta; pasas solo la URL y la llave pública.
- **Regla 2 — yo, en la nube**: código, tablas, reglas de acceso, importador, pruebas y PR. Donde falte tu cuenta, lo marco y no invento resultados.

**Secretos (decisiones tuyas)**

- Aprobar el gestor de contraseñas y la copia fuera de línea del sello (4.12).
- Decidir si cargas los secretos tú en el panel, o los cargas desde la sesión local (recomiendo lo primero).

1. Crear la cuenta de Supabase (tú; yo no tengo acceso a tu panel).
2. Confirmar la lista de áreas: ¿cotizador, taller, cobranza, almacén y comisiones, o falta alguna?
3. Aprobar que la hoja deje de ser editable, y avisar al equipo.
4. Fusionar PR #99 antes de empezar la fase 1.
5. Aclarar si WhatsApp Business entra en la plataforma o queda fuera (decisión aparte).
6. Confirmar que el aviso de privacidad se actualiza antes de la fase 2.
7. Confirmar que Supabase y el plan gratuito cumplen (límites de la sección 4.6) para el tamaño actual: los blobs de imágenes y los respaldos son el punto más probable de exceder el gratuito.

## 10. Riesgos principales

- **Datos repartidos entre teléfonos** (fase 2): alguna cotización puede existir solo en un aparato que ya no se usa. Mitigación: pedir a cada persona exportar antes del corte.
- **Pagos deja de editar la hoja** (decisión tuya): cambia el hábito diario. Mitigación: avisar antes, y la plataforma tiene las mismas acciones.
- **Cálculos de la hoja** (4.10): una diferencia de centavos rompe la confianza. Mitigación: prueba de cuadre antes de la fase 4.
- **Plan gratuito**: pausa del proyecto y límites. Mitigación: cron semanal y respaldo a Drive.
- **Un PDF ya impreso** que deje de verificar: se prueba antes de la fase 3.
