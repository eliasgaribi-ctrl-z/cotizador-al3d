# Mapa 10 — Pruebas, documentos y privacidad (estado real del código, 2026-10-10)

Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, incluye PR #99).
Todo lo de abajo se leyó en el código o se midió corriendo las 55 pruebas de node en esta máquina
(Windows 11, Node v24.17.0). Lo que no pude confirmar dice «NO CONFIRMADO». Rutas relativas a la raíz del repo.

Leyenda de clases (para pruebas):
- **VALE** = sigue valiendo tal cual (función pura / interfaz / diseño; no habla con puente, hoja, tokens ni sync).
- **VALE+ajuste** = vale, pero lee algo que el plan toca (campos `*_notion`, `localStorage` del historial, texto de `app.js`, conteos en README); hay que revisarla al tocar eso.
- **PARTE** = el archivo se parte: secciones que valen y secciones que se reescriben (con rangos de línea).
- **REESCRIBE** = habla con el puente/hoja/tokens/sync; las reglas de negocio que defiende se portan a SQL/Edge, la prueba se rehace.
- **RETIRA-F5** = prueba del Apps Script de hoja y de tokens; muere con la fase 5 (salvo reglas que se portan, listadas).

---

## 0. Hechos medidos (lo que el plan no sabe)

| Hecho | Dato | Evidencia |
|---|---|---|
| Archivos de node | **55** (`pruebas/*.mjs`), los 55 pasan (exit 0) | corrida propia |
| Archivos de navegador | **45** `.mjs` + 6 de soporte (`hoja-de-mentiras.js`, 4 vitrinas `.html`, `piezas-numeros-vitrina.js`) | `pruebas/navegador/` |
| Comprobaciones de node | ≈ **4 046** (suma de las líneas `ok`/`✓` de cada salida; `geo.mjs` imprime «37 bien») | corrida propia |
| Tiempo node, secuencial | **249 s** (4 min 9 s). Los 55 corren en serie (`correr.sh:14-19`) | corrida propia |
| Los lentos | `puente.mjs` **177.7 s**, `sincronizacion.mjs` 44.0 s, `puente-almacen.mjs` 7.7 s, `sintaxis.mjs` 7.0 s, `piezas-avisos.mjs` 4.4 s, `respaldo.mjs` 1.4 s, `precio-servidor.mjs` 0.68 s. Los otros 48: 70–330 ms c/u | corrida propia |
| Por qué son lentos aquí | `setTimeout(...,0)` tarda **15.3 ms** en esta Windows (medí 500 seguidos: 7 662 ms). La base de mentiras agenda CADA operación con `setTimeout(...,0)` (`pruebas/comun/base-de-mentiras.mjs:20,28,76`; copia en `pruebas/puente.mjs:591,599,647` y `pruebas/puente-almacen.mjs:349,357,397`). `puente.mjs` gasta ~177 s en la sección «LA VENTA QUE LA HOJA YA NO TIENE: el camino entero, con base» (líneas 653-1613); lo medí con la salida cronometrada y hay saltos de ~5 s en 8 pasos. No perfilé la causa exacta (candidatas: el `setTimeout(0)` de 15 ms por operación de la base de mentiras, y `MS_RENOVAR = 5000` de `js/datos/puente.js:939-957` que espera a `Ingreso.renovar()`). Con ~1 ms por timer en Linux podría ser mucho menos (cuadra con el «unos segundos» del README). NO CONFIRMADO en Linux | medición + lectura |
| README miente en tiempo | `README.md:379` dice «55 archivos, solo node, unos segundos». En esta máquina: 4 min | corrida propia |
| Dependencias de node | Ninguna de npm. Solo built-ins (`node:fs/path/url/vm/crypto/os/child_process`) + archivos del repo. No hay `package.json`. Requiere Node con módulos ES, `import.meta.url`, top-level await, `structuredClone`, `EventTarget` (≥ 18). `sincronizacion.mjs` copia `js/` (3.8 MB, 57 archivos) a un tmp cinco veces | lectura |
| **Las de navegador NO corren en esta máquina** | Las **45** importan `/opt/node22/lib/node_modules/playwright/index.mjs` y lanzan `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (rutas del contenedor Linux de otra sesión). `pdf-hoja-carta.mjs:29-33` es la única con respaldo (`import('playwright')`) pero igual lanza con la ruta `/opt`. No hay `/opt`, ni playwright de node, ni docker, ni supabase CLI aquí | `grep` + `ls /opt` |
| Runner de navegador | `pruebas/correr.sh --navegador`: usa `npx --yes http-server` (descarga de npm), `/tmp/al3d-srv.pid`, `pkill`, `env -u` (POSIX). Las que traen `createServer` (4: `dos-telefonos`, `puente`, `service-worker-actualizacion`, `service-worker-redireccion`) levantan su servidor y reciben `env -u PUERTO` (`correr.sh:43-55`) | `correr.sh` |
| Tiempo navegador | NO CONFIRMADO (no se pueden correr). Cota inferior: 1 589 `waitForTimeout` literales suman **873 s** (14.5 min) en serie | `grep` |
| No hay CI | No existe `.github/` en el repo. Nada corre las pruebas salvo una persona | `ls -a` |
| Comentario viejo | `pruebas/conservar.mjs:12` dice «las 17 pruebas de pruebas/navegador/ no corren en Windows»: hoy son 45 | lectura |
| Referencias muertas | `pruebas/puente.mjs:1-11` habla de `puente/worker.js` y de Notion, y `pruebas/navegador/puente.mjs:3` de `pruebas/worker.mjs`: ninguno existe (el Worker se retiró; `puente/retirado.js` solo contesta 410). Hoy `puente.mjs:294` lee el `.gs` | lectura |

### Acoplamientos duros que el plan no menciona

1. **13 archivos de node leen `puente/hoja-apps-script.gs`** (todos fallan al cargar si el `.gs` se recorta a `espejo`+`carpetas`): `carpetas`, `cot-entrega`, `ingreso`, `notario`, `precio-servidor`, `precios-cliente`, `puente-almacen`, `puente-hoja`, `puente`, `replicas`, `revision-remota`, `sincronizacion` (vía `comun/`), `verificar-desde-el-papel`; más `navegador/dos-telefonos.mjs` y `comun/hoja-de-mentiras.mjs`. Varias lo hacen con regex sobre el texto y `.exec(gs)[1]` sin guarda: si la constante desaparece, TypeError.
   Constantes/funciones del `.gs` que las pruebas usan como oráculo: `ETAPAS_OBRA`, `ESTATUS`, `CUENTAS`, `TIPOS_TRABAJO`, `TIPOS`, `COL` (mapa de columnas), `PUENTE_VERSION` (`puente.mjs:302-342`); `IA_MODELOS`, `IA_PROVS`, `CUENTA_SIN_FACTURA` (`replicas.mjs:280-317`); `folioValido()` (`cot-entrega.mjs:189-195`); `CUENTAS`, `CUENTA_SIN_FACTURA`, `ivaDeCuenta()` (`cot-entrega.mjs:222-229`); la fórmula `R` como texto (`precios-cliente.mjs:308-311`).
2. **`pruebas/publicacion.mjs` ata README, `sw.js` y el árbol `js/`** (líneas 196-244): exige que cada `js/**/*.js` esté en `APP_FILES` de `sw.js`; que el README diga con letra «Son <N> archivos que se cargan en orden» igual al largo de `APP_FILES` (tabla `NUM` de la línea 219-222 solo llega a «ciento quince»; README:368 dice «ciento quince»); que `README.md` diga `correr.sh   55 archivos, solo node` y `--navegador   45 más` (líneas 231-233; README:379-380) iguales a los `.mjs` reales; y que `sw.js` diga cuántos «módulos ES» tiene la plataforma (hoy 42, en `sw.js:30` y `sw.js:512`). **Cada módulo nuevo (cliente Supabase, `vendor/supabase-js`) y cada prueba nueva/retirada obliga a corregir esos números en README y `sw.js` y a ampliar `NUM`**, o `publicacion.mjs` falla. Los archivos de `vendor/` solo se exigen en `APP_FILES` para Publicaciones (línea 127: `vendor/html-to-image.js`), no para el resto: un `vendor/supabase-js.*` nuevo se cachea a mano.
3. **`pruebas/csp.mjs` fija las políticas de contenido** de 10 páginas: nada puede abrir `*`/`https:` suelto, ni `unsafe-eval`; `index.html` hoy permite en `connect-src` solo `'self' https://www.googleapis.com https://accounts.google.com https://script.google.com https://script.googleusercontent.com https://nominatim.openstreetmap.org` y en `script-src` solo `'self' https://accounts.google.com`. **Hay que agregar a `index.html` el host de Supabase (https y `wss://` de Realtime) y hacer que `connect-src` de `verificar.html` apunte a la Edge Function**; `csp.mjs:93-104` exige que `verificar.html` permita la hoja (línea 102) y que acerca/privacidad/condiciones tengan `connect-src 'self'` exacto (línea 104). Su buscador de salidas (`SALIDAS`, 121-128) solo ve `fetch('https://…')` literales: el `fetch` interno de supabase-js no lo ve, hay que agregar la aserción a mano. Además `permite()` (50-61) no entiende `wss:`.
4. **Pruebas de navegador con salida cortada**: 8 interceptan todo lo que no sea 127.0.0.1 con `ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort())` o equivalente (`dos-telefonos`, `pf-ajustes:155`, `pf-control:103`, `pf-esqueleto:96`, `pf-fabricacion:122`, `pf-mapa:105`, `pf-material:88`, `puerta:66`). Un cliente Supabase en el arranque intentaría `*.supabase.co`; las rutas de Playwright **no interceptan WebSocket**: el Realtime saldría de verdad. Y 40 de las 45 registran `pageerror` y asertan cero errores de página. Hay que prever un interruptor que apague Supabase en pruebas, o `routeWebSocket`.
5. **La puerta tiene una exención para pruebas**: `esCopiaLocal()` en `js/nucleo/puerta.js` deja pasar a 127.0.0.1 (descrito en `navegador/puerta.mjs:1-18`); todas las demás pruebas de navegador entran sembrando `al3d_pf_rol` en localStorage. Con rol sacado de `miembros` por JWT esa exención no sirve: hace falta una sesión inyectable de prueba. NO CONFIRMADO cómo lo diseñará quien implemente.

---

## 1. Clasificación de las 55 pruebas de node

Columnas: archivo · comprobaciones · qué importa/lee · clase · razón (una línea).

| Archivo | # | Importa / lee | Clase | Razón |
|---|---|---|---|---|
| anidador-medidas.mjs | 65 | `anidador-vectores/js/medidas.js` (createRequire) | VALE | unidades SVG→mm, pura |
| asistente.mjs | 154 | `datos/asistente-contexto.js`, `datos/ventas.js`; lee `nucleo/asistente.js` como texto (142, 349-350) | VALE+ajuste | pura; defiende que tel/dirección/coordenadas no van a la IA y fabricación no recibe importes; fixtures con `estatus_notion`, `pago_pendiente`, `comision_restante` |
| blindaje-de-la-app.mjs | 66 | `datos/prefs.js`, `nucleo/gcal.js`, `nucleo/ingreso.js`, `mod/ajustes.js`; texto de `app.js`, `puerta.js`, `puente.js` | PARTE | VALE: ventana de Calendar (60-94), respaldo del cotizador (115-140), recarga por versión nueva del service worker (142-162), marcos/instalar/mesa de corte (196-259). REESCRIBE: 95-114 (ingreso con Google), 164-174 (regex sobre `sincronizarDeVerdad` de `app.js`: «bombear no suma a `movio`») y 176-194 (renovación del permiso de Google: `MS_ENTRE_RENOVACIONES` de `puente.js:940`, `reconfirmar()` de `puerta.js` que «echa» a quien quitaron de «Accesos») |
| carpetas.mjs | 38 | `datos/carpetas.js`; `.gs` por vm (`rutaCarpetas_`, `rutaCrearCarpeta_`) con DriveApp de mentiras | PARTE | 1-83 VALE; 84-129 vale mientras el Apps Script conserve `/carpetas` y `/crear_carpeta`; ojo a cómo se autentica el rol que se le pasa (línea 111: fabricación recibe `ROL_SIN_PERMISO`) |
| comisiones.mjs | 39 | `datos/ventas.js`, `datos/asistente-contexto.js` (`comisionDe`) | VALE | aritmética pura (10 % fijo, abonable/restante) |
| conservar.mjs | 23 | `nucleo/conservar.js` | VALE | decisión del router, pura |
| cot-entrega.mjs | 42 | guiones del cotizador por vm; `.gs` por texto | PARTE | VALE casi todo (WhatsApp, hitos). REESCRIBE 189-195 (`folioValido()` del `.gs`) y 222-229 (`CUENTAS`, `CUENTA_SIN_FACTURA`, `ivaDeCuenta()` del `.gs`): pierden su oráculo |
| cot-escalador.mjs | 40 | catalogo, nucleo, partidas, escalador (vm) | VALE | cuentas del letrero sobre la foto |
| cot-historial.mjs | 36 | `cotizador/historial.js` (texto→vm) | VALE+ajuste | vigencia 10 días y fichas; si `al3d_historial` pasa a `cotizaciones` en la nube cambia la fuente, no la aritmética |
| cot-ia-logica.mjs | 58 | catalogo, nucleo, partidas, ia (vm) | VALE | lógica de «Cotizar con IA» |
| cot-opciones-logica.mjs | 71 | + `datos/material.js`, `datos/catalogo-precios.js`, `datos/semilla.json` | VALE | propuesta con opciones |
| cot-precio.mjs | 48 | guiones del cotizador (vm) | VALE | anticipo, ajuste, glifos de la solicitud (usa solo los estados, no el transporte) |
| csp.mjs | 144 | las 10 páginas HTML, `js/**`, `anidador-vectores/js`, `publicaciones/js` | VALE+ajuste (obligatorio) | ver §0 punto 3: hay que ampliar con Supabase y quitar la hoja de `verificar.html` cuando se mude |
| cuadernos.mjs | 10 | `datos/cotizador.js` con `localStorage.al3d_historial` sembrado | VALE+ajuste | agrupa clientes por teléfono (10 dígitos) o nombre; si nace `clientes` en SQL habrá una tercera réplica de la regla (ya hay dos: `cotizador/historial.js` y `datos/cotizador.js`, comparadas en `replicas.mjs:224-259`) |
| datos-de-entrega.mjs | 83 | `datos/datos-de-entrega.js`, `datos/geo.js`, `datos/proyectos.js`, `datos/puente.js` (`ventaDeHoja`), `mod/datos-entrega.js` | PARTE | VALE: faltantes por entrega, parche, `CAMPOS_ROL` (37-153) y el link corto (155-213: `/expandir` es una función INYECTADA a `resolverLink(url, expandir)`, no toca el transporte; solo cambia si cambia el contrato `{ok,url,codigo}`). REESCRIBE 214-228 (ubicación que baja de la hoja, columna AB, `ventaDeHoja` con encabezados de la hoja) |
| defensas-del-cotizador.mjs | 88 | texto de `cotizador/*.js`; `notario.js` entero en vm con `hablarHoja` falso | VALE | habla por la costura `window.AL3D.hablar`, no por el transporte |
| entrega.mjs | 39 | `datos/entrega.js`, `datos/agenda.js`, `datos/reglas.js`, `nucleo/ics.js`; texto de `mod/mapa.js`, `mod/fabricacion.js`, `css/plataforma.css`, `mod/proyectos.js` | VALE | instalación/paquetería/recolección, pura |
| fechas.mjs | 68 | `nucleo/fechas.js` | VALE | aritmética de fechas |
| geo.mjs | 37 | `datos/geo.js` | VALE | `parseGmaps` con URLs reales |
| hojas-de-estilo.mjs | 76 | texto de `css/*`, HTML | VALE | «hoja» aquí es hoja de estilo (tokens CSS), no de cálculo |
| ics.mjs | 36 | `nucleo/ics.js` | VALE | RFC 5545 |
| ingreso.mjs | 26 | `.gs` por vm (`identidadDelIngreso`, `rolDelCorreo`, `PUENTE_ROLES`, `PUENTE_CLIENT_IDS`); `nucleo/ingreso.js` | RETIRA-F5 | 1-206: audiencia del token de Google, falla cerrado, caché del tokeninfo, rol desde «Accesos» → los reemplaza Supabase Auth + `miembros` + RLS (plan 4.12 regla 4: «sin sesión no se lee nada»). 208-223 (`origenAutorizado`, origen antes de abrir la ventana de Google) vale solo si se conserva GIS en `ingreso.js`. Lo que `/carpetas` siga necesitando de esa verificación: ver §9 |
| letra-del-folio.mjs | 13 | `datos/prefs.js`; texto de `cotizador/entrega.js` | VALE | letra del aparato en el folio, dos réplicas |
| marca.mjs | 37 | texto de HTML/CSS/SVG | VALE | una sola marca |
| material.mjs | 11 | `datos/material.js`, `datos/catalogo-precios.js`, `datos/semilla.json` | VALE | `derivar()` pura (el plan 4.10 deja el material en el cliente) |
| notario.mjs | 167 | `.gs` por vm con 6 servicios de Google de mentiras, HMAC/SHA-256 reales; texto de `verificar.html` (659) | REESCRIBE | quién sella, catálogo, QR, renglones, solicitudes, cupos, IA, tope 64 KB: todo pasa a RPC/Edge. **Hay que conservar los vectores de firma v1** (ver §2.4) |
| pagina-sin-senal.mjs | 41 | `sw.js` por vm | VALE | página 503 del service worker |
| pf-esqueleto.mjs | 94 | funciones extraídas por texto de `app.js` (RUTAS, barra, indicador de sync) | VALE+ajuste | frágil: extrae por regex de `app.js`; el cambio sondeo→Realtime puede moverlas |
| pf-fabricacion.mjs | 33 | `nucleo/ui.js`, `datos/taller.js`, `datos/proyectos.js` (ETAPAS), `nucleo/fechas.js` | VALE | marcas del riel del taller |
| pf-proyectos-garantia.mjs | 52 | `datos/proyectos.js` | VALE | hábiles, garantías |
| piezas-avisos.mjs | 54 | `js/piezas.js` (vm) | VALE | pieza compartida de UI (4.4 s por temporizadores reales) |
| piezas-hojas.mjs | 84 | `js/piezas.js` (vm), CSS | VALE | «hojas» = sheets de interfaz |
| piezas-numeros.mjs | 91 | `js/piezas.js`, `nucleo/ui.js`, guion de teléfono del cotizador | VALE | regla de teléfono igual en 3 sitios |
| piezas-senales.mjs | 92 | `js/piezas.js` | VALE | globos, búsqueda |
| precio-servidor.mjs | 61 | `js/cotizador/{catalogo,nucleo,entrega,notario,partidas}.js` + `.gs` completo por vm | PARTE | el oráculo (cotizador) y las baterías valen; **el lado «hoja» se reemplaza** cuando `/autorizar` salga del `.gs`. Detalle en §3 |
| precios-cliente.mjs | 59 | guiones del cotizador (vm); `.gs` por texto en 296-326 | PARTE | reparto del aumento VALE; 296-326 compara la fórmula `R` (10 %) del `.gs` con el modal: cambiar a vista SQL/constante |
| proyectos.mjs | 85 | `datos/proyectos.js`; `datos/puente.js` (`aNotion`, `P`) en 159; texto de `cotizador/ia.js` | PARTE | 31-150 VALE (tipos derivados, nombre). 151-336 REESCRIBE: `camposDelRecalculo`+`aNotion`, `marcaPerdida`, `huerfanasDeLaHoja`, `repetidasDeLaHoja` (identidad de fila de hoja `V-xxx`) |
| publicacion.mjs | 18 | `.nojekyll`, `sw.js`, `README.md`, `index.html`, `cotizador.html` | VALE+ajuste (obligatorio) | ver §0 punto 2; dato: su cabecera cuenta un incidente previo con `{{ secrets.SUPABASE_URL }}` en un documento que tumbó Pages; si los docs nuevos traen `{{`, `.nojekyll` debe quedarse |
| publicaciones.mjs | 32 | `publicaciones/automatizacion/*.json`, `publicaciones/js/*` | VALE | plantillas de redes |
| puente-almacen.mjs | 98 | `.gs` por vm (`rutaEmpujarAlmacen_`, `rutaJalarAlmacen_`, `doPost`); `datos/db.js`, `datos/sync.js`, `datos/puente.js`, `datos/stock.js`, `datos/proyectos.js` | REESCRIBE | las reglas se portan a SQL/RLS: movimiento no se descuenta dos veces (id), pagos no mueve almacén, fabricación sin costos, catálogo campo por campo con sellos, `consumido` no vuelve atrás, lotes de 25 (`MAX_LOTE` de `sync.js`), `mov-salida:<proyecto>:<material>` (513-537, vale con SQL) |
| puente-hoja.mjs | 369 | `.gs` por vm; `datos/puente.js`, `datos/ventas.js`, `datos/proyectos.js`, `datos/geo.js` | RETIRA-F5 | prueba del Apps Script de hoja. **Reglas que se portan** (a RLS/SQL/espejo): roles de escritura (80-97), fórmulas solo lectura (99-106), listas cerradas (108-131), fechas/números (133-151), **texto que no se vuelve fórmula (180-193: el espejo debe seguir escribiendo con apóstrofo)**, `/expandir` solo Maps (195-205, → Edge `maps`), lectura por rol (207-253 → RLS), saldo y «una de las 199» de la celda al récord (255-378: las fixtures sirven de casos para la vista SQL), datos malos (821-844), paridad `coordenadasDeMaps_`=`parseGmaps` (1327-1369, si `maps` parsea en el servidor). **Se portan SOLO si la plataforma asume esas acciones** (pregunta abierta 1): cobro con LIQUIDADO en el estatus (537-560), abono positivo/negativo (153-178, 972-994), reparto sin pisar abonos (995-1018), «Registrar nueva venta» (1235-1326). **Mueren con la hoja editable**: reacomodo Y:AD (500-536), folio único/sin nombre (561-620), `/empujar` filtra respuesta (644-657), tropiezo de Google (658-680), candado (681-706), `/jalar` en una página (707-715), copia pegada (716-734), realineación (735-820), hora de instalación (845-971), diálogos del dueño y menú (1019-1094), AE/AF (1095-1234) |
| puente.mjs | 452 | `datos/puente.js`, `datos/proyectos.js`, `datos/sync.js`, `datos/db.js`, `datos/agenda.js`, `datos/ventas.js`; `.gs` por texto (294, 1620, 1671) | REESCRIBE | mapeo proyecto↔columnas de Notion/hoja y relevo contra `fetch` falso. Rescatables: etapas (169-175), teléfono puro (1614-1663), entrega pura (1664-1718), y el patrón de coherencia léxica (288-348) para SQL↔JS |
| puerta.mjs | 77 | `datos/prefs.js`, `datos/puente.js` (155); texto de `nucleo/puerta.js`, `app.js`, `sw.js`, `cotizador.html`, `anidador-vectores/index.html` | PARTE | VALE: el pase local vale/caduca/rol inválido (55-83: pase para abrir sin señal). REESCRIBE: «el rol manda la hoja» (85-111, `Prefs.rolDeLaHoja`), dirección del puente de fábrica `URL_PUENTE` (113-140), «el puente se construye sin token de dispositivo» (153-173). A REVISAR: 179-398 leen `puerta.js`/`app.js` por texto («lo que la puerta promete», cotizador y mesa piden credencial 349, «solo una cuenta de Google abre la plataforma» 374, «solo los botones abren Google» 384): valen mientras la puerta siga siendo la de Google; con Supabase Auth cambian los textos que busca |
| reglas-de-partida.mjs | 53 | catalogo, nucleo, partidas, ia (vm) | VALE | <10 cm no es letra 3D; caja con dos cotas |
| reglas.mjs | 52 | `datos/reglas.js`, `datos/cotizador.js` (`huellaDe`), `datos/proyectos.js` (`avisoDeHoja`, 195) | VALE+ajuste | la regla A11 (142-165) depende de `notion_page_id`/«ya está en la hoja»; el resto es pura |
| replicas.mjs | 101 | texto de `cotizador/{nucleo,historial,entrega,venta,ia,catalogo}.js`, `cotizador.html`; `datos/{cotizador,proyectos,puente,prefs,catalogo-precios,asistente-contexto}.js`; `.gs` por texto | PARTE | VALE: huella, descripción de partida, cobrado, tipo de trabajo, cuadernos, identidad del aparato, mínimo 1 m², teléfono WA. REESCRIBE: 273-287 (`IA_MODELOS`, `IA_PROVS` del `.gs`), 288-304 (`COL`, vocabulario `P`), 305-326 (`CUENTA_SIN_FACTURA`, desplegables «en el orden de la hoja») |
| respaldo.mjs | 55 | `datos/cotizador.js` (`RESPALDO_KEYS`), `datos/db.js` (`exportar/importar/poner/borrar/vaciar`); texto de los 11 guiones del cotizador | VALE+ajuste | dos listas de claves de respaldo + atomicidad de la base local; con la nube como fuente, **restaurar un respaldo viejo puede resucitar datos**: el plan no lo trata |
| revision-remota.mjs | 43 | `.gs` por vm (dobles de notario «en corto»); texto de `cotizador/{nucleo,notario}.js` | REESCRIBE | cadena solicitud→revisión por renglón→sello→`/estado`; pasa a RPC |
| sincronizacion.mjs | 85 | `datos/{db,sync,proyectos,agenda,puente}.js` (copia de `js/` por teléfono); `comun/*` | REESCRIBE | **guion válido**, transporte nuevo (ver §2.5). Sección pura «LA REGLA» (111-152: `obraDeLaFila`, `sellosDeLaOperacion`, `citaDeHoja`) vale tal cual salvo la comparación con `PLAZOS_TALLER` del `.gs` (115-118) |
| sintaxis.mjs | 5 | `js/**` (vm.Script + `execFileSync` de node) | VALE | todo lo publicado compila; archivos nuevos de `js/` entran solos |
| stock.mjs | 11 | `datos/stock.js` (`cuantoComprar`) | VALE | redondeo agregado |
| taller.mjs | 120 | `datos/taller.js`, `nucleo/fechas.js`; texto de `cotizador/historial.js` | VALE | ventana de taller |
| ventas-por-tipo.mjs | 51 | `datos/ventas-por-tipo.js`, `datos/proyectos.js`, `datos/ventas.js` | VALE | tarjetas por tipo |
| ventas.mjs | 124 | `datos/ventas.js`, `datos/proyectos.js` (`desdeVentaDeHoja`), `datos/puente.js` (`VIVAS_EN_TALLER`) | PARTE | 29-139 VALE (mes, saldo estimado, cartera, conversión, CSV). 140-345 REESCRIBE (`ventaDesdeHoja`, `unificar`, «récord de la hoja», `VIVAS_EN_TALLER`): plan §3.1 dice que `ventas_hoja` desaparece |
| verificar-desde-el-papel.mjs | 39 | `.gs` por vm con solo la pestaña «Autorizaciones» | REESCRIBE | `folioValido()` estricto en rutas que escriben vs `folioDePapel_()` laxo en `/verificar`; el código desempata folios repetidos (186-205); estado «reautorizada»/«revocada»: pasa a Edge `verificar` |

Totales (node): **VALE 29** · **VALE+ajuste 8** · **PARTE 10** · **REESCRIBE 6** · **RETIRA-F5 2**.
Comprobaciones en archivos que se reescriben o retiran enteros: 884 (REESCRIBE) + 395 (RETIRA-F5) = 1 279 de ≈ 4 046 (**32 %**), más los bloques parciales de los 10 PARTE.

Lo que el plan §4.11 lista como «se reescriben» (`puente*.mjs`, `sincronizacion.mjs`, `dos-telefonos.mjs`, `navegador/puente.mjs`) **omite**: `notario`, `ingreso`, `puerta`, `verificar-desde-el-papel`, `revision-remota`, `precio-servidor`, `precios-cliente`, `cot-entrega`, `replicas`, `carpetas`, `blindaje-de-la-app`, `proyectos`, `ventas`, `datos-de-entrega`, `reglas` y, en navegador, `pf-control`, `pf-esqueleto`, `pf-ajustes`, `pf-proyectos`, `cot-entrega`, `publicas`, `puerta`.

---

## 1b. Clasificación de las 45 pruebas de navegador

Todas: Chromium vía Playwright (rutas `/opt/...` de Linux, ver §0), servidor en `:8814` salvo las 4 con su propio `createServer`. Las 14 marcadas † inyectan `pruebas/navegador/hoja-de-mentiras.js` (`ctx.addInitScript`), que **sustituye `window.AL3D`** (la costura que usa `cotizador/notario.js:35-61` y que la plataforma implementa en `js/mod/cotizador.js:362` como `Puente.hablar`): mientras `hablar(ruta, cuerpo, espera)` conserve rutas y formas, esas pruebas no notan el cambio de transporte.

| Archivo | Carga | Clase | Razón |
|---|---|---|---|
| an-controles.mjs | `anidador-vectores/` | VALE | paro, veta, cotas, descarga del anidador |
| an-mesa.mjs | `anidador-vectores/` | VALE | zoom, carrusel, ficha, mover a mano |
| anidador.mjs | anidador + cotizador (`al3d_anidar`) | VALE | el motor arranca, unidades, recoge el trazo |
| camino-completo.mjs † | `cotizador.html?solo=1` → plataforma; `/js/datos/db.js` | VALE+ajuste | cotizar→«se ganó»→buzón `al3d_pf_ganadas`→proyecto en IDB; sin puente |
| capas.mjs | plataforma | VALE | capas y botón atrás |
| carga.mjs | plataforma | VALE | siluetas de carga (corta lo externo) |
| contraste.mjs † | cotizador/plataforma | VALE | mide 4.5:1 rasterizando |
| cot-cliente.mjs † | `cotizador.html?solo=1` | VALE | barra y formulario del cliente |
| cot-entrega.mjs † | cotizador | PARTE | «Registrar venta» contra `ctx.route('https://script.google.com/**')` (94-101, 401-445): mira `ops[0].datos`; el resto (WhatsApp, hitos) vale |
| cot-escalador.mjs | cotizador | VALE | escalador con piezas |
| cot-historial.mjs † | cotizador | VALE+ajuste | historial/cuadernos/respaldos sobre `localStorage` |
| cot-ia.mjs † | cotizador | VALE | «Cotizar con IA»; la ruta `ia` falsa contesta `SIN_LLAVE` |
| cot-opciones.mjs † | cotizador | VALE | propuesta con opciones |
| cot-partidas.mjs † | cotizador | VALE | partidas y completitud |
| cot-precio.mjs † | cotizador | VALE | autorizar/notario por la costura |
| cot-vector.mjs | cotizador | VALE | vectorizador |
| cotizacion-de-antes.mjs † | cotizador | VALE | abrir la app no recarga la cotización vieja |
| cotizador-flujo.mjs † | cotizador | VALE | flujo con clics |
| dos-telefonos.mjs | 2 servidores, 2 orígenes; **`comun/hoja-de-mentiras.mjs`**; `/js/datos/{sync,db,proyectos,agenda}.js` | REESCRIBE | el plan §7 la nombra; corta todo salvo sus dos orígenes (74-80) |
| escalador-cotas.mjs | cotizador | VALE | modos de cotas |
| pdf-hoja-carta.mjs | cotizador | VALE | PDF cabe en carta (la «hoja» es papel); trae `import('playwright')` con respaldo |
| pf-ajustes.mjs | plataforma; `datos/puente.js` | PARTE | asistente/ajustes VALEN; «El puente» (pasos, Probar, esquema, token) contra `puenteDeMentiras` (49-110) se REESCRIBE |
| pf-control.mjs | plataforma; `db.js` | PARTE | cuentas/barras/comisiones VALEN; «Traer la hoja» contra `ctx.route(B+'/puente')` (52-93) se REESCRIBE |
| pf-esqueleto.mjs | plataforma; `db.js` | PARTE | barra, búsqueda, menú VALEN; indicador de sincronización (P15) contra `contestarHoja` (58-100) se REESCRIBE |
| pf-fabricacion.mjs | plataforma | VALE | riel del taller, calendario (intercepta Google Calendar en 838) |
| pf-mapa.mjs | plataforma + Leaflet; `db.js` | VALE | siembra IDB local |
| pf-material.mjs | plataforma; `db.js`, `prefs.js` | VALE | siembra IDB local |
| pf-proyectos.mjs | plataforma; `db.js` | PARTE | ficha/etapas/garantía VALEN; P1 «aviso de la hoja» (marcas «Ya no está en la hoja») desaparece con `hoja_perdida` |
| pf-tablero.mjs | plataforma; `db.js` | VALE | tablero y deshacer |
| piezas-avisos.mjs | vitrina `piezas-avisos.html` | VALE | `js/piezas.js` con ratón, dedo, teclado |
| piezas-hojas.mjs | vitrina `piezas-hojas.html` | VALE | idem |
| piezas-numeros.mjs † | vitrina + cotizador | VALE | idem |
| piezas-senales.mjs | vitrina | VALE | idem |
| plegable.mjs | cotizador | VALE | Galaxy Z Fold |
| precio-suelto.mjs † | cotizador | VALE | precio autorizado que se suelta |
| publicas.mjs | `verificar.html`, `condiciones`, `privacidad`, `acerca`, sin señal | PARTE | `verificar.html` contra `https://script.google.com/**` (81-100, 630-631) se REESCRIBE si `/verificar` pasa a Edge Function. **`PAGINAS = [['condiciones', 9], ['privacidad', 10]]` (línea 640) fija el número de secciones de `privacidad.html`**: si se agrega o quita una sección, cambiar el 10 |
| puente.mjs † | su propio servidor + `/puente` falso; `sync.js`, `db.js`, `puente.js` | REESCRIBE | cotizar→autorizar→registrar→la venta sale sola a la hoja con dirección/pin/tipo; espejo del dinero baja |
| puerta.mjs | host `al3d.prueba` → 127.0.0.1 (`--host-resolver-rules`) | PARTE | pase vivo entra, puerta sale, nada se monta detrás: valen en esencia; la puerta de Google cambia con Supabase Auth |
| service-worker-actualizacion.mjs | propio servidor | VALE | la versión anterior sobrevive si la nueva no baja entera (ojo: `APP_FILES` crece) |
| service-worker-redireccion.mjs | propio servidor | VALE | Cloudflare 308 vs caché |
| service-worker.mjs | sw.js | VALE | el cotizador abre sin señal |
| tablero.mjs | plataforma | VALE | `#/hoy` grabado en manifiestos |
| total-que-viaja.mjs | cotizador | VALE | transición del total |
| vidrio.mjs | plataforma | VALE | capa de vidrio (los «tokens» son CSS) |
| volver-atras.mjs | cotizador | VALE | historial de pasos |

Totales (navegador): **VALE 34** · **VALE+ajuste 2** · **PARTE 7** · **REESCRIBE 2** · **RETIRA 0**.
Navegador con puente de mentiras propio (inline, ≥ 6 copias): `puente.mjs:77-163`, `pf-control.mjs:52-93`, `pf-esqueleto.mjs:58-100`, `pf-ajustes.mjs:49-110`, `cot-entrega.mjs:94-101`, `publicas.mjs:81-100`.

---

## 2. Cómo se corren y cómo están hechos los dobles

### 2.1 Runner (`pruebas/correr.sh`, 82 líneas)
- `set -e`; entra a `pruebas/`; `for f in *.mjs` → `node "$f"`; cuenta fallos; no recorre `comun/` ni `navegador/`.
- `--navegador` (o `NAVEGADOR=1`): `npx --yes http-server -p $PUERTO -c-1 --silent` (PUERTO por defecto 8814), `sleep 3`, luego `for f in navegador/*.mjs`: si el archivo contiene `createServer` → `env -u PUERTO node "$f"`, si no `PUERTO="$PUERTO" node "$f"`. Mata el servidor con `kill $(cat /tmp/al3d-srv.pid)` y `pkill -f "^http-server"`.
- Sin la bandera imprime la lista de las de navegador por nombre (`correr.sh:80`).
- Es serial. No hay paralelismo, ni filtro por archivo (se corre uno con `node pruebas/x.mjs`).

### 2.2 Qué requiere cada familia
| Familia | Requiere |
|---|---|
| node (55) | solo `node` |
| navegador (45) | Playwright global en `/opt/node22/lib/node_modules/playwright`, Chromium en `/opt/pw-browsers/chromium-1194/...`, `npx http-server` (red a npm), POSIX |
| nuevas del plan (RLS, dos teléfonos contra Supabase local) | Docker + `supabase start` (el plan §7 ya lo dice «hay que confirmar»; aquí: sin `docker`, sin `supabase` en PATH) |

### 2.3 Inventario de dobles (cada prueba reinventa los suyos)
| Doble | Dónde | Qué simula | Fidelidad / límites |
|---|---|---|---|
| `hojaDeMentiras({props,tokens,columnas})` | `pruebas/comun/hoja-de-mentiras.mjs` (133 líneas); lo usan `sincronizacion.mjs` y `navegador/dos-telefonos.mjs` | El `.gs` REAL en `vm` sobre cuadrícula: SpreadsheetApp (`getActive`, `flush`, `newDataValidation`, `getUi`), HtmlService, PropertiesService (get/set/delete), CacheService (sin TTL), LockService (siempre libre), UrlFetchApp (lanza «sin red»), ContentService, Utilities (**solo `formatDate` y `getUuid`**), Session | Devuelve `{ss, v, C, run, ctx, props, fila, celda, doPost(textoJSON), teclear(folio,columna,valor)}`. Hoja «Ventas» 330 filas × `columnas` (30 por omisión) y «Abonos comisión» 2100×6; `insertSheet` crea 400×8. **No evalúa fórmulas** (`setFormula` ni existe; `formulasVentas` solo se inspecciona como texto en `puente-hoja.mjs:731`). Sin HMAC/Digest, sin reloj controlable |
| `hojaDeMentiras({candadoLibre,props,google})` | `puente-hoja.mjs:379-497` | idem + `comoLaGuardaSheets(valor, formato)` (coerción de Sheets), cola `google` para `UrlFetchApp`, registro de candados y de diálogos, `hora()`, `pon(fila, folio, campos)`, `empujar(ops, rol)` | la más rica de la hoja; `comun/` es una copia sin la coerción |
| doble «mínimo» con `noImplementado` | `puente-hoja.mjs:41-73` | solo para llamar funciones puras (`armarCeldas`, `rutaExpandir_`, `sinLoQueNoLeToca`, `aplanarFila`) | Proxy que truena si se toca Google |
| `hoja()` del almacén | `puente-almacen.mjs:41-110` | pestañas nuevas de 50×26, candado con estado, `empujar/jalar/filas/doPost(objeto)` | `doPost` recibe objeto (el de `comun/` recibe texto JSON) |
| `libro()/hojaFalsa()` del notario | `notario.mjs:29-173` | **la más fiel**: `guardar()` reproduce Sheets (apóstrofo→texto, «=+-@» sin apóstrofo TRUENA, números, fechas, horas, «TRUE»), `Utilities` con SHA-256/HMAC reales y bytes con signo, `UrlFetchApp` que contesta `tokeninfo` por token y los proveedores de IA, **reloj controlable** (`pasan(seg)` sobre `Date.now`), caché con TTL que se reinicia, candado con estado | copia reducida en `revision-remota.mjs:89-106` |
| `verificar-desde-el-papel.mjs:84-94` | solo pestaña «Autorizaciones» | |
| `ingreso.mjs:98-115` | vm con contador de `fetch` al tokeninfo | |
| `carpetas.mjs:100-107` | `DriveApp` falso | |
| `precio-servidor.mjs:72-73` | contexto vacío `{}` (carga los 333 KB del `.gs` sin servicios: funciona porque el nivel superior no llama a Google) | |
| base local en memoria | `pruebas/comun/base-de-mentiras.mjs` (`idbConIndices`, índices+cursores+orden de llaves de IndexedDB, `structuredClone`); copia idéntica en `puente.mjs:578-651`; otra sin índices en `respaldo.mjs` (`idbDeMentira`, con cuota y aborto simulados) y una más en `puente-almacen.mjs:~340-397` | la base local seguirá existiendo (bandeja `pendientes`, caché): estas **siguen sirviendo** |
| `fetch` falso | `puente.mjs:438-446` (contesta `salud/esquema/empujar`), `sincronizacion.mjs:49-53` (`fetch → H.doPost(init.body)`) | el segundo es el patrón de cableado |
| `window.AL3D` falso | `navegador/hoja-de-mentiras.js` (107 líneas): `autorizar` (sella en el acto con el mismo total que `cotTotalFinal`), `salud`, `ia`→`SIN_LLAVE`, `solicitar/cancelar/rechazar/revocar/estado/pendientes` con orden de sucesos | contrato por forma de respuesta; no comprueba catálogo |

### 2.4 ¿Se puede reutilizar la «hoja de mentiras» para probar la ruta `espejo`?
**Sí, con 4 límites.** La ruta `espejo` vive en el `.gs`, y `hojaDeMentiras()` de `comun/` ya carga el `.gs` entero y expone la misma puerta que usa el teléfono.
- Cableado: `H = hojaDeMentiras({ props: { <SECRETO_DEL_ESPEJO>: 'x' } })`; `H.doPost(JSON.stringify({ ruta:'espejo', ... }))`; leer con `H.celda(folio, nombre)` / `H.v._g`. La «Edge Function» llamará a Apps Script con `fetch`: cablear `globalThis.fetch = async (_u, init) => ({ status: 200, json: async () => H.doPost(init.body) })` como `sincronizacion.mjs:49-53`. Si la función `espejo` de Supabase se escribe como módulo ES puro (sin APIs de Deno) también corre en node con ese `fetch`.
- `H.teclear(folio, columna, valor)` simula «alguien editó la hoja» (llama a `alEditar`, que sella `AI «Sellos»`). Sirve para probar «el siguiente cambio de la base la sobrescribe» (plan 4.5). Las ediciones por script no disparan `alEditar` en Sheets: el espejo no necesita llamarlo.
- Técnica de centinelas para «el espejo no toca las columnas de fórmula»: poner valores marcados en H, K, R, S, T y comprobar que siguen intactos (ya usada en `puente-hoja.mjs:510-524`).
- **Límites**: (1) no calcula `ARRAYFORMULA`: no sirve para verificar H/K/R/T tras el espejo; (2) `Utilities` sin HMAC/Digest: si el secreto se verifica con HMAC hay que usar los de `notario.mjs:86-98`; (3) `LockService` siempre libre y sin reloj: la contención del candado y el reintento solo se prueban con el doble de `notario.mjs:143-148`/`puente-hoja.mjs:379`; (4) la «nota en la primera fila» («Si alguien edita la hoja… se avisa con una nota en la primera fila», plan 4.5) se escribe con `setNote`, que aquí es un no-op (`comun/hoja-de-mentiras.mjs:80-82` lo mete en la lista de métodos mudos): hay que registrar notas en el doble. `insertSheet` crea 8 columnas: una pestaña nueva ancha necesita `insertColumnsAfter` (existe).
- **Vectores de firma v1 (sellos heredados)**: `notario.mjs:329-346` arma un sello viejo con las funciones del propio `.gs` (`firmar`, `codigoDe`, `canonDe`, `secretoDelSello_`): `canonDe(r)` empieza `AL3D-AUTH-v1[`; `r = {folio, huella, subCalc, precioAuth, itemsAuth, total, proyecto, correo, ts}`; `codigo` = 12 hexadecimales en 3 grupos. **Generar y congelar estos vectores como JSON ANTES de la fase 5** (cuando el `.gs` aún los calcula) es la forma de probar «un PDF autorizado antes de la migración sigue verificando» (plan §7) contra la Edge Function `verificar`. También cubren `renglones: null` para sellos de antes de `puente-sheets-8` (`notario.mjs:344-345`).

### 2.5 `sincronizacion.mjs` como especificación de contrato
Los 8 escenarios (390 líneas) son independientes del backend; solo cambian: `H = hojaDeMentiras(...)` (166-171), las lecturas `H.celda(...)` (10 aserciones: líneas 200, 209, 214, 247, 279, 313, 314, 367, 381, 384), `H.teclear(...)` (325-336, escenario 7 «a mano en la hoja»: en Supabase pasa a «cambio hecho por SQL/otro cliente»), `H.doPost` directo (350-352), y el cableado `globalThis.fetch` (49-53). El aislamiento por teléfono es: copiar `js/` a un tmp por teléfono (módulos separados) + intercambiar `globalThis.indexedDB/localStorage` según el teléfono `actual`. Un cliente supabase-js cachea su `storage` al crearse: habría que crear un cliente por teléfono (ya hay copias separadas de `js/`). Node 24 trae `WebSocket` global; con Node más viejo habría que traer `ws` (el repo no tiene `package.json`). NO CONFIRMADO todo lo de supabase-js (no existe aún en el repo).

### 2.6 Pruebas nuevas que el código real obliga a escribir (no están en el plan)
1. Paridad vocabulario SQL↔JS (patrón de `puente.mjs:288-348`): 8 etapas, 4 estatus, 5 cuentas, 7 tipos de trabajo, 5 plazos de taller (`PLAZOS_TALLER`↔`PLAZO_A_HOJA`), orden incluido y con el espacio final de `Cuenta `.
2. Matriz de roles como pgTAP, portando `puente-hoja.mjs:80-97, 207-253` y `puente-almacen.mjs:183-207`.
3. `acceso_revocado` → borrar IndexedDB y localStorage (plan 4.8): no hay ninguna prueba hoy.
4. Realtime sustituye el sondeo de 30 s (`js/app.js`): `blindaje-de-la-app.mjs:164-174` ata el texto de `sincronizarDeVerdad`.
5. `espejo`: secreto, escape de fórmulas (`puente-hoja.mjs:180-193`), no escribir columnas de fórmula, reintento, sobrescritura de edición manual.
6. Vista de finanzas vs hoja (§3).

---

## 3. `pruebas/precio-servidor.mjs` (236 líneas, 61 comprobaciones, 0.7 s)

**Lo que verifica de verdad**: que el **precio de la cotización** que calcula el notario del `.gs` (copia del catálogo + `lineTotal`) sea idéntico al del cotizador. **No toca** «Precio Neto», «Pago Pendiente», «Comisiones» ni «Comisión Restante» de la hoja de ventas: **el plan 4.10 se equivoca al decir «es lo que hoy hace `pruebas/precio-servidor.mjs`»**. Esas cuatro fórmulas viven solo como `ARRAYFORMULA` dentro de la hoja (`puente/hoja-apps-script.gs:171-199`, `formulasVentas`) y como réplicas en JS (`js/datos/ventas.js:59-65` `saldoDe`; `js/datos/asistente-contexto.js:50-63` `comisionDe`), y ninguna prueba las evalúa (en los fixtures se teclea el valor «como la fórmula K»: `puente-hoja.mjs:268`).

Secciones: LAS TABLAS (7: `COT_MATERIALES`, `COT_COMPLEJIDAD`, `COT_RECORTES`, `COT_RECORTE_COMP_EXTRA`, `COT_BASTIDORES`, `COT_M2_MINIMO`, `COT_CAMPOS_PRECIO`); LOS IMPORTES (batería de 15 partidas + 2 000 al azar, semilla 20260925, LCG `s*1103515245+12345 mod 2^31`, línea 113-114); LA HUELLA (`cotHuella` con y sin IVA y tras JSON); EL TOTAL (`cotTotalFinal` ×8 combinaciones); LOS RENGLONES (`cotPiezas`, `cotPreciosCliente`, 3 000 cotizaciones al azar semilla 20261001 con aumento/descuento/ajustes por partida, exige >300 de cada camino); EL PAPEL Y EL SELLO (`renglonesDe`, `renglonesDeTexto`, descripción cortada a 120/300).
Funciones del `.gs` que usa (línea 74-76): `COT_MATERIALES, COT_COMPLEJIDAD, COT_RECORTES, COT_RECORTE_COMP_EXTRA, COT_BASTIDORES, COT_M2_MINIMO, COT_CAMPOS_PRECIO, cotLineTotal, cotSubtotal, cotHuella, cotTotalFinal, cotPiezas, cotPrecioFinal, cotPreciosCliente, renglonesDe, renglonesDeTexto, itemsAuthCanon, itemsAuthDeCanon, dinero2`. Del cotizador extrae por texto (con el contador de llaves `fuente()`, líneas 29-45) `m2Total, lineTotal, lineTotalCrudo, totals, huellaTrabajo, huellaOrdenada, authVigente, precioFinal, desgloseFinal, itemPrecio, subAjustado, netoAjustado, ajusteAuth, hayAumentoAuth, piezasDe, preciosCliente, renglonesDelPapel, selloDeOtrosRenglones, descParaHoja, shortDescAuth, RENGLON_DESC_MAX, _CAMPOS_PRECIO, MATERIALES, COMPLEJIDAD, RECORTES, RECORTE_COMP_EXTRA, BASTIDORES, M2_MINIMO`.

### Cómo extenderla (plan 4.10)
- **(a) Precio de cotización** (si `/autorizar` sale del `.gs`): quitar el `vm` del `.gs` (línea 72-76) y cargar la nueva implementación (Edge Function TS o PL/pgSQL con adaptador de los mismos 19 nombres). Para SQL: que el nodo exporte las baterías y los resultados esperados del oráculo del cotizador a JSON (mismas semillas) y una prueba SQL (pgTAP) los consuma.
- **(b) Vista de finanzas**: archivo nuevo tipo `pruebas/vista-finanzas.mjs` con un port en JS de las 4 fórmulas, contra fixtures que lee la prueba SQL. Fórmulas exactas de la hoja (columna → fórmula; `COL` en `.gs:1915-1936`):
  - H `Precio Neto ` = `ROUND(G*(1+IF(F="Sí",16%,0)),2)` (si B vacío: vacío) — G `Precio Subtotal`, F `IVA`.
  - K `Pago Pendiente` = `ROUND(H-I-J,2)` — I `Anticipo`, J `Liquidacion` (positivo = falta cobrar).
  - R `Comisiones` = `ROUND(G*10%,2)` — **no lee la columna AD «Porcentaje comision»**.
  - S `Abono Comision` = `SUMIF('Abonos comisión'!A2:A2000, A, 'Abonos comisión'!C2:C2000)`; U = `COUNTIF` de abonos.
  - T `Comision Restante` = `ROUND(R-S,2)`.
  - Tolerancia que usa la propia hoja: 0.004 (fórmulas P y X).
  - Fila vacía: H, R, S y U devuelven `""` cuando B (Proyecto) está vacío; K y T usan `IFERROR(...,"")`.
- **(c) Cuadre real sobre todas las ventas**: la hoja de mentiras NO puede dar los valores de H/K/R/T: hay que exportar de la hoja real los valores calculados (A, B, F, G, H, I, J, K, R, S, T por fila) a un JSON y comparar con la vista, por folio, con tolerancia 0.004.
- **(d) Redondeo («al centavo»)**: usar `numeric` en SQL, no `float`. Con aritmética de doble IEEE y `Math.round`, de 200 000 subtotales que terminan en 5 centavos (empate exacto de `G*10%`), **3 277 dan otro céntimo** que el redondeo decimal exacto (ej. 0.35→3 vs 4, 1.45→14 vs 15, 10.35→103 vs 104; experimento corrido en esta máquina). Qué hace Sheets en esos empates NO CONFIRMADO: por eso (c) con valores reales es la prueba que cuenta. Con IVA 16 % y subtotal de 2 decimales no hay empates exactos (aritmética: 16k≡50 mod 100 no tiene solución).
- `saldoDe` (`ventas.js:59-65`) además hace `Math.max(0, …)` y devuelve 0 si el estatus es LIQUIDADO o la etapa es `cancelado`: la vista SQL debe decidir si reproduce eso o solo la celda K.

---

## 4. `docs/ARQUITECTURA.md` (1 377 líneas, «v1.0 · 23/ago/2026»)

El plan dice que corregir la línea 1364 basta. El documento está desactualizado de fondo: habla de Notion como libro mayor y del Worker (retirado), no de la hoja. Lo que contradice o necesita actualizarse con la ruta Supabase:

| Línea(s) | Qué dice | Qué cambia |
|---|---|---|
| **1364** (punto 13) | «**No se usa Supabase.** Se pausa a la semana…, cero días de retención de respaldo…, una sola tabla con RLS apagada expone todo a una anon key…, tres modos de falla nuevos…» | Reemplazar por la decisión aprobada (Supabase es fuente de verdad) y **conservar sus riesgos como requisitos**: pausa a 7 días (cron semanal), sin respaldos (export semanal a Drive), RLS siempre encendida con prueba de «sin sesión no se lee nada» (plan 4.12 regla 4). Dato: la línea 1364 coincide con la cita del plan |
| 1366 (punto 14) | «No se usa Vercel Hobby… no comercial» | **Sigue siendo cierto** (plan §2: no se usa Vercel). Añadir que el sitio sigue en GitHub Pages; sin cambio de fondo |
| **1370** (punto 16) | «**No hay usuarios, ni login, ni base de usuarios en Fase 1.** Tres personas, tres dispositivos, un rol por dispositivo. En Fase 3 la autoridad… vive en el token del dispositivo dentro del Worker» | Falso hoy (hay login con Google y «Accesos», README:236) y falso después: `miembros(usuario_id, empresa_id, area)` + RLS. Reescribir; los tokens de dispositivo se retiran en fase 5 |
| **1372** (punto 17) | «Los instaladores no tienen acceso, y no aparecen en el modelo. Ni fila, ni token, ni app.» | Sigue cierto en la primera versión (plan 4.8: solo Dirección, Fabricación, Pagos). La fase 6 agrega rol `cliente`: aclarar que los clientes (no los instaladores) tendrían acceso y que los instaladores siguen fuera |
| 1340 (punto 1) | «No se migran los 199 proyectos fuera de Notion» | Histórico (Notion ya salió); hoy la migración es hoja→Supabase (fase 2) |
| 1342, 1344 (puntos 2-3) | API de Notion desde el navegador / esquema por API | Obsoletos (Notion fuera) |
| **1346** (punto 4) | «**No se recalcula ninguna fórmula de Notion.** `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`… se leen. Nunca se calculan aquí.» | **Contradice el plan 4.10** (la base debe reproducirlas con una vista SQL). Cambiar a «las calcula la base; el cliente no las escribe». Igual: línea 141 y `puente/README.md:176-179` |
| 10, 16 | «Gana notion-verdad: Notion sigue siendo el sistema de registro»; «Notion es el libro mayor…» | Obsoleto desde la mudanza a la hoja; ahora hoja→Supabase |
| 20-30, 37-48 | por qué Calendar y no Notion; papel de Notion; 4 defectos de `copiarFilaVenta()` | Histórico; marcar como tal |
| 78-117 (Fase 3) | «el usuario publica el puente desde su propia hoja»; pasos con «Accesos» (95-99) y «tres tokens de dispositivo… salida de emergencia» (97-99); estado `puente-sheets-9` (106-117) | Sustituir por el flujo Supabase; versión real del contrato hoy `puente-sheets-14` (el doc dice 9) |
| 125-143 (§4.0, fuentes de la verdad) | 139 «Dinero… **La hoja** (Fase 3)… PAGOS escribe vía puente»; 140 «El récord de ventas… **La hoja**… espejo `ventas_hoja`»; 141 «Fórmulas… La hoja de finanzas (antes Notion). Nadie más. Nunca se recalculan aquí»; 143 «Memoria técnica… Notion» | La base pasa a ser dueña; `ventas_hoja` desaparece (plan §3.1); la hoja es espejo |
| 156-178 (§4.2) | 168 `al3d_pf_puente` `{url, token}` en claro; 170 `al3d_pf_empresa` «hoy nadie la escribe»; 178 «`al3d_pf_puente` no entra en el respaldo» | `Prefs.empresa()` pasa a venir de la membresía (plan 4.1); el token de dispositivo se retira; la sesión de Supabase se guarda en localStorage: decidir si entra al respaldo |
| 180-199 (§4.3) | lista de almacenes IndexedDB de `al3d_pf` v2 | Sin `ventas_hoja`; revisar contra `ALMACENES` de `db.js` y contra el destino de cada uno (plan §3.1) |
| 689-733 (§5.11 `sync.js`) | contrato del adaptador; 733 «Notion no tiene comparación-e-intercambio… “cambió en Notion mientras no tenías señal”» | Transporte nuevo (Supabase) y las reglas de sellos por campo (`obraDeLaFila`); reescribir la «nota de honestidad» |
| 755-788 (§5.13 `puente.js`) | 757 «el único archivo que sabe que existe un Worker… propiedades de Notion»; 764-767 `aNotion/deNotion`; 777-786 decisiones 1-5; **788** «el vocabulario está duplicado a propósito entre este archivo y el Worker… `pruebas/puente.mjs` lee el Worker como texto» | El Worker no existe; el archivo se reemplaza por el cliente Supabase; la prueba de coherencia léxica pasa a SQL↔JS |
| 1022-1060 (§7 árbol) | 1035 `sync.js` «Dep: db, prefs»; 1055 `puente/hoja-apps-script.gs … pruebas/puente.mjs compare los dos vocabularios`; 1056 `puente/README.md · DESPLIEGUE.md` | Faltan `supabase/` (migraciones, funciones `ia/maps/verificar/espejo`, `tests/rls.sql`), `scripts/importar-hoja.*`, el cliente y el `vendor/` de supabase-js; el árbol ni siquiera lista `datos/puente.js` ni `datos/ventas.js` |
| 1172-1174, 1196-1208 (§8) | 1174 «El rol no es seguridad, es modo de trabajo… En Fase 3, el rol se valida contra el token del dispositivo dentro del Apps Script»; tabla 1202-1206 «Importes», «Avanzar etapa», «Fila TSV / espejo a Notion» | El rol se valida con RLS por `miembros`; «espejo a Notion» → espejo a la hoja |
| 1277, 1303 | «Copiar fila para Notion», «copia la fila TSV» | Obsoletos |
| 1282 | «No hay cron y no lo puede haber» (para recordatorios) | Sigue cierto para Calendar, pero el plan agrega un cron semanal para Supabase (§4.6): precisar que es otro cron |

Y el encabezado de `js/datos/sync.js:1-60` (plan Fase 0) sigue describiendo Notion, Worker y «Fase 1 no hay servidor» (líneas 8-15, 26-31, 48, 65, 71).

---

## 5. `puente/README.md` (667 líneas) y `puente/DESPLIEGUE.md` (414)

### `puente/README.md`
| Líneas | Sección | Qué cambia |
|---|---|---|
| 1-14 | Intro: «El puente — a Google Sheets», «llave es la cuenta de Google (o, de emergencia, un token de dispositivo)», cuatro botones de Ajustes → El puente | Título y rol del puente: la hoja pasa a espejo; botones «Traer el dinero»/«Mandar lo pendiente» cambian de sentido |
| 18-48 | «Qué cambió, y por qué se fue Cloudflare»; token en el cuerpo del POST | Histórico; el argumento «todo por POST con el token en el cuerpo» (por CORS de Apps Script) deja de aplicar a Supabase (cabecera `Authorization`), sí aplica al `espejo` |
| 52-57 | Los caminos: «cualquier rol = cuenta de Google en “Accesos” o token de dispositivo válido… La única excepción es `/verificar`» | Reglas de acceso nuevas |
| 59-78 | **Tabla de caminos** (cada fila): `/salud`(61) `/esquema`(62) `/jalar`(63) `/empujar`(64) `/expandir`(65) `/solicitar`(66) `/cancelar`(67) `/pendientes`(68) `/estado`(69) `/autorizar`(70) `/rechazar`(71) `/revocar`(72) `/verificar`(73) `/empujar_almacen`(74) `/jalar_almacen`(75) `/ia`(76) `/carpetas`(77) `/crear_carpeta`(78) | Destino según plan §3.2; **en fase 5 el `.gs` solo conserva `espejo`, `carpetas` (y `crear_carpeta`, que el plan lista en §3.2 pero no en la fase 5: «dos rutas»)** |
| 80-100 | Roles: 97-100 «El rol sale de “Accesos”… o del token de dispositivo» | `miembros` + RLS; fuera tokens |
| 104-140 | «Diferencias de contrato contra la versión de Notion» (6 puntos) | Histórico |
| 142-182 | «Lo que baja: el récord entero» (152-163 `ventas_hoja` en IndexedDB; **176-179 «las fórmulas siguen siendo de solo lectura… se leen»**) | `ventas_hoja` desaparece; fórmulas las calcula la base |
| 184-257 | sello firma renglones; almacén (215-257: `/empujar_almacen`, `/jalar_almacen`, cupo de 25 ops/60 por minuto en 247-248) | rutas a SQL/RPC |
| 258-394 | `puente-sheets-11/12/13` (teléfono AE, entrega AF, datos al registrar venta) | columnas del espejo |
| 395-481 | `puente-sheets-14`: la regla «gana el cambio más reciente» (403-426), tablas de quién gana (445-468: incluye 465 «Cotizaciones… No, se quedan en el aparato» → el plan las mueve a `cotizaciones`), `ULTIMA_COL = 35` y columna `AI «Sellos»` (474), `SELLO_HOLGURA_MS` (443), pruebas (480) | La regla se conserva con `sellos` por campo en jsonb (plan 4.4); la AI deja de ser fuente |
| 484-520 | «Montarlo» (488-496 «la copia que manda es la de la hoja»; 498-520 «baja la copia de la hoja y compárala») | Sigue aplicando mientras el `.gs` se pegue a mano; recuerda que las pruebas corren contra la copia del repo, no la de producción |
| 522-594 | «Cómo está cerrado»: 524-528 puerta = Google + «Accesos» + token; 531-539 cupo de 60/min por persona; 540-543 lista blanca `/expandir`; 544-560 texto→fórmula y diálogos; 561-563 bitácora; 564-568 el rol cierra la lectura; 569-580 el dinero solo sube si cambió; 581-587 solicitudes de quien las pide | Cada punto tiene equivalente nuevo (RLS, límite de la Edge Function, `bitacora`); el 4 (anti-fórmula) **sigue** en `espejo` |
| 596-620 | «Lo que la hoja rechaza» y «Lo que sigue abierto» (608-614: la llave vive en el teléfono; token de Google y `al3d_pf_puente` en localStorage compartido; «quitar su renglón de “Accesos”… y *Generar tokens nuevos*») | Salida = quitar el renglón de `miembros` + borrado local al siguiente contacto (plan 4.8) |
| 622-667 | «Si algo falla»: 627-631 «Accesos» y «401 en todo… tokens» | Retirar (tokens/Accesos); agregar Supabase |

### `puente/DESPLIEGUE.md`
| Líneas | Sección | Qué cambia |
|---|---|---|
| 1-5 | «Ya no hay Worker…, ni secretos que guardar fuera del repo: el puente vive dentro de la hoja» | Falso con Supabase: hay secretos (Vault/funciones/espejo/`service_role`) |
| 7-21 | «Lo que hay montado» (sitio, puente, código) | Agregar proyecto Supabase, Edge Functions, secreto del espejo |
| 23-31 | «La palomita roja de “Workers Builds: puente-al3d”» (`wrangler.jsonc`, `retirado.js`) | Sin cambio; sigue pendiente de desconectar desde el panel de Cloudflare |
| 33-52 | «Los pasos»: 45-47 pestaña «Accesos»; **50-52 «⚡ AL3D → Tokens del puente»** | 45-52 se retiran en fase 5 (`miembros`) |
| 54-82 | «Dónde viven los secretos»: tokens (56-60), `FOLIO_MAS_ALTO`, `PUENTE_Y_AD_ALINEADAS` (62-67), `SELLO_AUTORIZACION` y `IA_KEYS` (69-78: «el secreto del sello no se rota nunca») | Plan 4.12: `SELLO_AUTORIZACION`→Vault (no se rota, copia fuera de línea), `IA_KEYS`→secretos de Edge `ia`, `PUENTE_TOKENS` se retira. `FOLIO_MAS_ALTO`/`PUENTE_Y_AD_ALINEADAS` y la hoja de folios `V-xxx` dejan de ser fuente |
| 84-128 | «Cuando cambies el código»: publicar versión, `salud`/versión, 89-92 «`pruebas/puente.mjs` compara los dos lados» | Orden de despliegue nuevo (migraciones, funciones, luego app); versión de contrato |
| 130-400 | historial `puente-sheets-6` … `-14` (pasos de menú «Preparar la hoja», «Realinear Y–AD»…) | Archivo histórico |
| 402-414 | «Las cabeceras del sitio» (411-414: el `.gs` describe el esquema de la hoja; si incomoda, repo privado) | Aplica igual a `supabase/migrations/*.sql` + RLS en repo público; decidir |

---

## 6. `privacidad.html` (190 líneas; «Rige desde el 20 de septiembre de 2026», línea 37)

Lo que dice hoy → lo que tendría que decir (y lo que ya es incorrecto hoy):

| Línea(s) | Dice hoy | Problema / lo que debe decir |
|---|---|---|
| 84-85 | De quién es: AL3D — Elías Garibi; contacto `eliasgaribi@gmail.com` | Sin cambio; agregar quién es responsable de la base y del proveedor |
| 87-89 | Para quién es: equipo de AL3D; «la dirección pone los correos y los quita» | Cierto (`miembros`). Si la fase 6 deja entrar a clientes, nuevo público |
| 91-99 | Permiso «**openid email**… una sola cosa: tu correo»; «no podemos leer tu correo, archivos…» | Reverificar contra la config final de OAuth de Supabase Auth con Google (puede traer perfil/avatar). NO CONFIRMADO qué scopes pedirá |
| **101-106** | «la llave de Google **vive solo en la memoria del navegador** y se pierde al cerrar la pestaña: no se guarda en el aparato» | **Ya es falso**: `js/nucleo/ingreso.js:33-37` guarda el token en `localStorage` (`al3d_pf_gtok`) mientras vale; el README:326 lo dice. Con Supabase habrá una sesión (JWT + refresh token) en localStorage por defecto de supabase-js: decirlo |
| **108-111** | «**La mayor parte de lo que haces se queda en tu propio aparato**… cotizaciones, proyectos, material, almacén, agenda. Si borras los datos del sitio, eso se va contigo.» | **Falso tras la migración**: la base en la nube pasa a ser la fuente de verdad; el aparato guarda una copia/caché. Si borras el sitio ya no «se va contigo» |
| **112-115** | «Lo que sí sale… su nombre, su importe, su fecha, su **dirección de instalación** y la etapa de la obra se escriben en una hoja de Google» | Ya incompleto hoy: también salen **teléfono del cliente** (columna AE, `puente-sheets-11`), **ubicación/pin** (AB), **forma de entrega** (AF) y **notas** (AG). Con Supabase: nombre del cliente/negocio, teléfono, dirección y coordenadas, notas, importes (solo roles que ven dinero), cotizaciones con partidas, fotos de referencia (Storage), bitácora |
| 116-118 | Bitácora de escrituras (cuándo, desde qué rol, qué campos) | Ahora es la tabla `bitacora` en la nube, con altas/cambios de área/salidas (plan 4.8) y «quién lo hizo» |
| 120-136 | «A quién más le llegan datos»: Google (verificar, **hoja**, Calendar si se activa); OSM/Carto; Google Fonts y cdnjs; **Qwen/DeepSeek/Gemini «pasan por esa hoja —que corre en los servidores de Google— y de ahí a ese proveedor»** | Agregar **Supabase** (base, autenticación, almacenamiento, funciones; región y subencargado de nube: NO CONFIRMADO). La IA ahora pasa por la Edge Function de Supabase, no por la hoja (línea 132-133 deja de ser cierta). La hoja sigue (espejo de solo lectura) y Drive (carpetas, y el **respaldo semanal a Drive** del plan 4.6/§6 contendrá datos de clientes) |
| 138-149 | «Qué NO hacemos»: no vendemos ni compartimos; sin analítica de terceros | Cierto; revisar que no se agregue telemetría de Supabase/Vercel |
| 151-154 | Cuánto se guarda: «mientras AL3D lo necesite… tu correo en la lista de accesos mientras trabajes con AL3D» | Definir retención de la base, de la bitácora y de los respaldos en Drive (el plan no fija plazos) y qué pasa al darse de baja |
| 156-167 | Cómo quitas tu acceso: «Salir de este aparato»; permiso de Google; «escríbele a… y se borra tu correo»; «borra los datos del sitio» | Ahora: Dirección quita el renglón de `miembros`; **el teléfono borra su copia local al siguiente contacto** (plan 4.8) — con el límite honesto de que un aparato que nunca vuelve a conectarse la conserva; borrar el sitio ya no borra los datos de la nube |
| 168-169 | Derechos (acceso, corrección, borrado) por correo | Los titulares que más datos tienen ahora son **los clientes** (teléfonos, direcciones, ubicaciones), y la página solo habla de empleados: decisión legal NO CONFIRMADA (aviso de privacidad para clientes, LFPDPPP) |
| 175-176 | «Si el cambio es de fondo —**datos nuevos, o un tercero nuevo**— se avisa al equipo **antes**» | Supabase es un tercero nuevo y la base un lugar nuevo para los datos: **la propia página obliga a avisar antes** (plan §9 punto 6: actualizar antes de la fase 2) |

Restricciones al editarla:
- CSP de la propia página: `connect-src 'self'`, `script-src 'self'` y **sin JavaScript** (`privacidad.html:50-58`); `csp.mjs:104` fija `connect-src 'self'`. Es texto estático: no cambia la CSP.
- `navegador/publicas.mjs:640` espera **10 secciones** (`['privacidad', 10]`); hoy el índice tiene 10 (68-77). Agregar o quitar una sección exige cambiar ese 10.
- `puerta.mjs:252-253` exige que la puerta enlace `privacidad.html` y `condiciones.html`.
- Páginas hermanas que también hablan de dónde viven los datos: `condiciones.html:111-124` («la plataforma funciona en el navegador de cada aparato y se apoya en servicios de terceros —Google, entre otros—»; «Buena parte de lo que se captura vive en el aparato de cada quien… un respaldo es responsabilidad de quien usa el aparato») y `acerca.html:98` («leído de la hoja de cálculo donde AL3D lleva sus ventas»).
- Dato de privacidad aparte: `pruebas/carpetas.mjs:21-34` trae nombres reales de clientes/negocios («con los nombres de verdad de octubre de 2026») en un repo público (`puente/DESPLIEGUE.md:412` dice que es público).

---

## 7. `README.md` (411 líneas)

Afirmaciones que dejarán de ser ciertas (o ya no lo son):
| Línea(s) | Dice | Estado / cambio |
|---|---|---|
| **40-44** | «Todo corre en el navegador. **Sin servidor, sin cuenta**, sin instalar nada y sin build… Los datos viven en el dispositivo, y lo que tiene que ser de todos —ventas, cobranza, almacén, autorizaciones— viaja a la hoja de Google» | «Sin servidor, sin cuenta» **ya es falso hoy** (Apps Script + puerta de Google, línea 226-238). Con Supabase: los datos viven en la base; el sitio sigue estático (el `build` sigue sin existir) |
| 17-19 | insignias «100 % estático», «sin build» | El sitio sigue estático y sin build; «100 % estático» engaña sobre los datos |
| 90-92 | «Las llaves [de IA] no viven en los teléfonos: están en la hoja (⚡ AL3D → Llaves de IA)… Quitar a alguien de “Accesos” le quita también la IA» | Edge Function `ia` + `miembros` |
| 97-113 | «Autorización sellada en la hoja», «`/autorizar`», «`verificar.html` le pregunta a la hoja», sellos de antes de `puente-sheets-8` | La base/Edge firma; **el QR de los PDF ya impresos debe seguir verificando** |
| 124-125 | «No hay alta de clientes: se arma solo con lo capturado» | El plan agrega tabla `clientes` (4.7): decidir si hay alta |
| **167-183** | «**La hoja de cálculo es el libro mayor**… la llave es la cuenta de Google… “Accesos”… el token de dispositivo… salida de emergencia… Sin puente no se rompe nada: la plataforma funciona completa en un dispositivo» | La hoja pasa a espejo de solo lectura; «Accesos»→`miembros`; tokens se retiran; «funciona completa en un dispositivo» ya no vale para un teléfono nuevo sin señal (no tiene datos) |
| 153-158 | «El récord de ventas es el de la hoja… el puente baja la pestaña Ventas entera» | `ventas_hoja` desaparece |
| **208-219** | «Los datos se guardan localmente en cada dispositivo y **no se sincronizan entre ellos**»; respaldos a 30 días/10 cotizaciones; «El respaldo no lleva llaves de IA… viven en la hoja» | Ya es parcialmente falso (la plataforma sincroniza); tras mover `cotizaciones` a la nube lo será del todo; el modelo de respaldo cambia |
| 236-238 | «Se entra con la cuenta de Google que Dirección dio de alta en la pestaña “Accesos”… la sesión se cierra sola cada día» | `miembros` |
| 279-289 | Tabla «Qué está cerrado»: **7 filas dicen «la hoja»** (281 quién entra, 282 columnas de dinero por rol `PUENTE_ROLES`/`VE_EL_DINERO`, 283 autorización, 284 `/verificar`, 285 llaves de IA, 286 sesenta por minuto, 287 `/cancelar`/`/estado`) | RLS + Edge Functions |
| 298-313 | «Cerrado en septiembre de 2026» | Histórico |
| 315-346 | «**El origen compartido**… recomendación: servir la app desde un origen propio… cambiar `ORIGENES` y `URL_APP`» | **Choca con el plan §1** («El sitio se queda en GitHub Pages»). Con Supabase el riesgo crece: un XSS en cualquier página de `eliasgaribi-ctrl-z.github.io` lee la sesión de Supabase y obtiene lo que RLS deje a ese rol (Dirección: todo el dinero). 335-337 «`connect-src` permite `https://script.google.com` entero» → pasará a permitir un host de Supabase concreto (mejora) |
| 357-360 | «publicar el puente antes que la app» (Apps Script) | Orden: migraciones y funciones antes que la app |
| 368 | «Son ciento quince archivos que se cargan en orden» | **`publicacion.mjs:223-226` lo valida contra `APP_FILES`**; cambiará al sumar módulos |
| **377-384** | `pruebas/correr.sh  55 archivos, solo node, unos segundos`; `--navegador  45 más`; «otra corre el Apps Script del puente entero contra una hoja de mentiras, sin cuenta y sin red» | **`publicacion.mjs:231-233` valida 55 y 45**; tiempo real 4 min; agregar Supabase local/Docker |
| 396 | enlace a `puente/README.md`: «El puente a la hoja: caminos, roles y cómo está cerrado» | Reorientar |

---

## 8. Contradicciones con el plan

1. **Plan 4.10** dice que `pruebas/precio-servidor.mjs` ya compara «Precio Neto / Pago Pendiente / Comisiones / Comisión Restante» sobre todas las ventas. **No**: compara el precio de la cotización (catálogo + `lineTotal`, huella, total, renglones del sello) entre el cotizador y el `.gs`. Las fórmulas de finanzas no las ejercita ninguna prueba (§3).
2. **Plan 4.11** lista 6 archivos como «se reescriben» (`puente.mjs`, `puente-hoja.mjs`, `puente-almacen.mjs`, `sincronizacion.mjs`, `navegador/dos-telefonos.mjs`, `navegador/puente.mjs`); en realidad 6 de node se reescriben enteros, 2 se retiran, 10 se parten y ≥ 7 de navegador se parten o reescriben (§1, §1b). Omite `notario`, `ingreso`, `puerta`, `verificar-desde-el-papel`, `revision-remota`.
3. **Plan 4.11** dice que las «funciones puras (… ics)» siguen valiendo: cierto, pero 13 archivos de node leen el `.gs` por texto/vm y fallan al cargar si se recorta (§0 punto 1).
4. **Plan §7** («Dos dispositivos: adaptar `sincronizacion.mjs`… y con la hoja de mentiras para el espejo») subestima: `sincronizacion.mjs` (44 s aquí) solo es una especificación de contrato; el cableado (`fetch`→`H.doPost`, `H.celda`, `H.teclear`) cambia entero (§2.5).
5. **Plan §7** («Navegador: `dos-telefonos.mjs` contra el proyecto de pruebas»): las 45 pruebas de navegador no corren fuera del contenedor Linux original (rutas `/opt/...`), y `dos-telefonos.mjs` corta toda red salvo sus dos orígenes (74-80), así que habría que exentar el Supabase de pruebas (y el WebSocket).
6. **Plan §1 / `docs/ARQUITECTURA.md:1364`**: el plan cita «`docs/ARQUITECTURA.md:1364` dice “No se usa Supabase”»: confirmado. Pero ese documento también sostiene (1346, 141, `puente/README.md:176-179`) «las fórmulas nunca se recalculan aquí», que **contradice** 4.10.
7. **Plan §3.2 vs fase 5**: §3.2 deja `/carpetas` **y** `/crear_carpeta` en Apps Script; la fase 5 dice «el Apps Script queda con dos rutas (`espejo`, `carpetas`)».
8. **Plan §5 fase 5** retira «tokens de dispositivo»; `/carpetas` (cualquier rol) y `/crear_carpeta` (solo Dirección) hoy dependen de `doPost` → `identidadDelIngreso`/«Accesos»/`PUENTE_ROLES` (README puente 54-57, 77-78; `carpetas.mjs:111`). El plan no dice cómo se autentican esas rutas sin Accesos ni tokens.
9. **Plan §10 («Pagos… la plataforma tiene las mismas acciones»)**: `js/datos/puente.js:284-286` dice que `Liquidacion`, `Abono Comision` y `Fecha Liquidacion` «las captura quien cobra, del lado de Notion [la hoja], y que la plataforma no guarda». Las acciones «Registrar un cobro», «Registrar abono de comisión» y «Repartir un abono entre comisiones» existen **solo como menú de la hoja** (`.gs:1263-1283`) y sus reglas solo están probadas en `puente-hoja.mjs:537-560, 972-1018`. NO CONFIRMADO que la plataforma tenga pantallas equivalentes; si no, hay que construirlas y portar esas reglas (cobro con LIQUIDADO en estatus y no en cuenta; abono positivo < $10 000 000; reparto sin pisar abonos; IVA por cuenta).
10. **Plan §3.3** («`_headers`… sigue como está»; CSP no cambia): `index.html` y `verificar.html` necesitan nuevos `connect-src` (host Supabase, `wss:`) y `csp.mjs` los pide explícitos.
11. **Plan §8** no lista `README.md` ni las pruebas `publicacion.mjs`/`csp.mjs`/`publicas.mjs` entre lo que hay que tocar, y los tres se rompen en cuanto se cambie un conteo, un host o una sección de privacidad.

## 9. Hallazgos críticos (resumen) y preguntas abiertas

Hallazgos:
- Las 45 de navegador no se pueden correr en Windows (rutas `/opt/…` y Playwright global del contenedor). Sin CI. Hoy solo las 55 de node dan señal local.
- Vectores de firma v1 hay que congelarlos antes de la fase 5 (§2.4); si no, la promesa «un PDF ya impreso sigue verificando» no tiene prueba posible.
- Tres pruebas de «documentación» (`publicacion.mjs`, `csp.mjs`, `publicas.mjs`) fallan por números/hosts/secciones al tocar README, sw.js, HTML públicos.
- La suite de node tarda 4 min aquí, muy probablemente por el timer de 15 ms de Windows × base de mentiras; fácil de bajar cambiando `setTimeout(0)` por `setImmediate`/`queueMicrotask` en los dobles (NO CONFIRMADO el efecto).
- `privacidad.html` ya está atrasada (teléfono/ubicación/entrega/notas; token en localStorage) antes de que llegue Supabase.

Preguntas abiertas:
1. ¿Qué pasa con los menús de la hoja (registrar cobro/abono/reparto/nueva venta) cuando la hoja sea de solo lectura: se retiran o se portan a la plataforma? (determina si `puente-hoja.mjs:537-1326` se porta o se borra)
2. ¿Cómo se autentican `/carpetas` y `/crear_carpeta` sin «Accesos» ni tokens? (determina el destino de `ingreso.mjs` y de `carpetas.mjs:84-129`)
3. ¿Dónde vive la fórmula de comisión/IVA tras la fase 3: sigue `formulasVentas` en la hoja (y `precios-cliente.mjs:308` / `cot-entrega.mjs:222` siguen leyéndola) o solo la vista SQL?
4. ¿Quién ejecutará las 45 de navegador (¿se portan las rutas `/opt` a una variable de entorno?) y habrá CI?
5. ¿La Edge Function `espejo` se escribe como módulo ES puro (para probarla en node con el doble) o en Deno con `deno test`?
6. ¿Aviso de privacidad para clientes (LFPDPPP)? ¿Qué scopes de Google pedirá Supabase Auth? ¿Región/proveedor de nube y plazos de retención de la base y de los respaldos en Drive?
7. Restaurar un respaldo del cotizador/plataforma con la nube como fuente: ¿qué evita que resucite datos viejos? (`respaldo.mjs` solo prueba la mecánica local.)

## 10. NO CONFIRMADO
- Tiempos de las pruebas de node en Linux y de las 45 de navegador (no se pueden correr aquí).
- Que el timer de 15 ms de Windows sea la única causa de los 177 s de `puente.mjs` (medí el timer y el patrón de ~5 s por `S.jalar()`; no perfilé).
- Redondeo de empates de la función `ROUND` de Google Sheets (solo medí doble IEEE en JS).
- Si la plataforma ya tiene pantallas de cobro/abono/reparto (solo confirmé lo que dice `js/datos/puente.js:284-286`).
- Alcances de OAuth, región y subencargados de Supabase, y todo lo de supabase-js en Node/Playwright (aún no hay código).
- Que la `.gs` publicada en producción coincida con la del repo (las pruebas corren contra la del repo).
