# Publicar el cotizador en Cloudflare Pages

Esta guía es para hacerlo desde el navegador: GitHub por la web y el panel de Cloudflare. No hace falta terminal en ningún paso. Donde sí conviene una terminal —correr las pruebas antes de publicar— se dice, y se dice también qué se pierde si no se corren.

Va en el orden en que hay que hacerlo. Saltarse el orden tiene consecuencias concretas y están escritas en cada sección: no son advertencias de manual, son las tres o cuatro formas reales de dejar los teléfonos del taller sin sincronizar o con la app en blanco delante de un cliente.

Un aviso general sobre los menús: Cloudflare les cambia el nombre y de lugar cada pocos meses. Si una ruta de menú de aquí no existe tal cual, busca el **nombre del ajuste**, que es lo que no cambia.

---

## 1. Qué se está publicando, y qué no cambia

### Lo que se publica

Cloudflare Pages sirve **el repositorio entero, tal cual**. Eso incluye la app:

| Pieza | Qué es |
|---|---|
| `index.html` | El cotizador. 893 KB, todo el JavaScript adentro, un solo `<script>` |
| `plataforma.html` + `js/` | La plataforma: unos treinta módulos ES que se importan entre sí |
| `sw.js` | El service worker: lo que hace que las dos apps abran sin señal |
| `css/`, `vendor/`, `datos/` | Estilos, Leaflet copiado a mano, la semilla de datos |
| `manifest.webmanifest`, `manifest-plataforma.webmanifest` | Lo que hace que el teléfono la instale como app y no como acceso directo |
| `_headers` | **Nuevo.** Las cabeceras de seguridad. En GitHub Pages este archivo no hacía nada |
| `robots.txt` | **Nuevo.** Deja rastrear a propósito, para que el `noindex` de la cabecera se llegue a leer |
| `.nojekyll` | Vacío. Deja de hacer falta en Cloudflare, pero no se borra (§3) |

Y también, porque Pages no distingue: `docs/` (688 KB), `pruebas/` (220 KB), `herramientas/` (24 KB) y `puente/` (44 KB). Sobre eso hay que ser honesto y está en §12.

### Lo que NO cambia

**El Worker del puente ya vive en Cloudflare y no se toca.** `puente/worker.js` se pega a mano en el editor del panel —lo dice el propio archivo, `puente/worker.js:4-6`: «no hay node, no hay wrangler, no hay terminal»— y ahí seguirá. No se despliega con el sitio, no se despliega desde el repositorio, y esta mudanza no le cambia una sola línea de código.

Lo único que hay que tocarle es **una variable**: `ORIGENES`. Eso es la §4, y va antes que mover a nadie.

Dentro de ese Worker viven los dos únicos secretos de todo el sistema (`puente/worker.js:40-47`):

- `NOTION_TOKEN` — escritura total sobre el workspace de Notion.
- `TOKENS` — el mapa `token de teléfono → rol`. Es la única frontera de permisos real que existe (`puente/worker.js:157-165`).

Ninguno de los dos está en el sitio ni pasa por Cloudflare Pages. Publicar en Pages no los expone ni los mueve.

**Y los datos del negocio tampoco cambian, pero sí se quedan donde están.** Esto es lo que más va a doler si no se entiende, así que va en tabla:

| Qué | Dónde vive | Qué le pasa al mudarse |
|---|---|---|
| Historial, folios, cotización en curso, logotipo | `localStorage` del origen `github.io` | **No cruza.** Hay que bajar el respaldo y restaurarlo |
| Proyectos, agenda, material, almacén | IndexedDB del origen `github.io` | **No cruza.** Otro respaldo, otro archivo |
| Bandeja de salida del puente (lo que no se ha mandado a Notion) | IndexedDB, y **no entra en el respaldo** a propósito (`js/datos/db.js:304`) | **Se pierde.** Tiene que estar en cero antes de mover |
| API keys de IA (OpenRouter, Groq, Gemini) | `localStorage`, y **no entran en el respaldo** (`index.html:9554-9556`) | Se vuelven a pegar a mano |
| Token del puente, rol, Client ID de Calendar | `localStorage` de la plataforma, y `exportar()` solo recorre IndexedDB (`js/datos/db.js:301-313`) | Se vuelven a pegar a mano |
| Lo que está en Notion | Notion | **Intacto.** No se toca nada |

La razón de fondo es la misma para todo: el navegador guarda por **origen**, y `https://eliasgaribi-ctrl-z.github.io` y `https://cotizador-al3d.pages.dev` son dos orígenes distintos. Para el navegador son dos aplicaciones que no se conocen. No hay ajuste que cambie eso.

---

## 2. Antes de tocar Cloudflare: cuál rama se va a publicar

**Esto es lo primero y es lo más fácil de pasar por alto.** `_headers` y `robots.txt` —todo el trabajo de cabeceras— están en la rama `claude/cloudflare-deployment-security-ubbiv2`, en el commit `5c699d2`. **En `main` no están.**

Si se conecta Cloudflare Pages a `main` hoy, el sitio nuevo sale **sin política de contenido, sin HSTS, sin `X-Frame-Options`, sin `Permissions-Policy` y sin `noindex`**. O sea exactamente igual de desprotegido que GitHub Pages, pero con la molestia de haberse mudado. Y no se nota: una cabecera que falta no da error, no pinta nada y no aparece en ningún log.

Así que el paso cero es llevar esa rama a `main`:

1. Entra a [github.com/eliasgaribi-ctrl-z/cotizador-al3d/branches](https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/branches) y abre un pull request desde `claude/cloudflare-deployment-security-ubbiv2` hacia `main`.
2. **Merge pull request** → **Confirm merge**.
3. Comprueba que en la raíz de `main` ya se vean `_headers` y `robots.txt`.

Hasta que eso esté hecho, no crees el proyecto de Pages. Después de eso, la rama de producción es `main` y todo lo demás de esta guía funciona.

**Alternativa, si prefieres no mover `main` todavía**: crea el proyecto de Pages con *Production branch* = `claude/cloudflare-deployment-security-ubbiv2`. Publica igual y con las cabeceras puestas. Pero acuérdate de cambiarlo a `main` después de fusionar, porque si no, publicar un cambio del cotizador a `main` —que es como se ha publicado siempre— dejaría de llegar al sitio, y ese es exactamente el fallo silencioso que esta mudanza venía a quitar.

---

## 3. Crear el proyecto de Cloudflare Pages

### Los ajustes exactos

Panel: **dash.cloudflare.com** → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git** → autorizar GitHub si lo pide → elegir el repositorio `eliasgaribi-ctrl-z/cotizador-al3d`.

Después salen cuatro campos y hay que ponerlos así:

| Campo | Valor | Por qué |
|---|---|---|
| **Project name** | `cotizador-al3d` | Es lo que decide el dominio: `cotizador-al3d.pages.dev`. Se puede cambiar después, pero cambiar el dominio es cambiar el origen otra vez, con todo lo de §5. Elígelo una vez |
| **Production branch** | `main` | Después del merge de §2. Antes del merge, `main` publica un sitio sin cabeceras |
| **Framework preset** | `None` | No hay framework. Cualquier preset intentaría construir algo que aquí no existe |
| **Build command** | **vacío** | No hay nada que construir. Ver abajo, que esto importa más de lo que parece |
| **Build output directory** | `/` | La raíz del repositorio |
| **Root directory** | `/` | Igual |

Dale a **Save and Deploy**. Tarda menos de un minuto. Al final te da la URL: `https://cotizador-al3d.pages.dev`.

Es gratis y sin límite de despliegues útiles en el plan Free (500 construcciones al mes; aquí una construcción es copiar archivos).

### Por qué el build command va vacío, y la trampa que hay ahí

Hay una tentación razonable: poner un comando que copie a una carpeta `dist/` solo lo que sirve el sitio, para que `docs/`, `pruebas/` y `puente/` dejen de publicarse.

**Si lo haces, la lista de archivos a copiar tiene que incluir `_headers`, `robots.txt` y `.nojekyll`.** Cloudflare Pages lee `_headers` **del directorio de salida**, no de la raíz del repositorio. Un comando como `cp -r index.html plataforma.html sw.js css js vendor datos dist/` publica el sitio idéntico a la vista y **sin una sola cabecera de seguridad**. Es la forma más silenciosa de deshacer todo el trabajo de `_headers`: el sitio se ve igual, funciona igual, y está desprotegido.

Recomendación para hoy: **build command vacío y output `/`**. Se publica de más, pero se publica lo correcto. Lo que se publica de más ya está mitigado —el bloque `/*` de `_headers` le pone `X-Robots-Tag: noindex, nofollow` a **todas** las respuestas del sitio, `docs/` incluida— y el arreglo de verdad para `docs/` no es un comando de copia: es borrar del repositorio las cifras y los nombres de clientes, o volverlo privado. Eso está en §12.

### Por qué `.nojekyll` deja de importar, y por qué eso elimina un modo de fallo entero

En GitHub Pages, el repositorio pasa por **Jekyll** antes de publicarse. Jekyll lee `{{` como una etiqueta de plantilla, y hoy hay ocho de esas en la documentación (`docs/ARQUITECTURA.md` y `docs/INVESTIGACION-TECNICA.md`), dentro de bloques de código. Eso ya costó caro una vez: **dos días y cinco despliegues en los que GitHub Pages no publicó nada** —la plataforma, los arreglos del cotizador, el PDF nuevo, todo fusionado al repositorio y nada en el sitio— y nadie se enteró, porque **GitHub no avisa**: el sitio sigue sirviendo la versión anterior como si nada. El incidente está documentado en `pruebas/publicacion.mjs:1-21` y en `README.md:305`.

El parche fue `.nojekyll`, un archivo vacío que le pide a GitHub «no proceses esto». Funciona, pero está a un borrado de distancia de volver a tronar, y por eso existe una prueba entera que lo vigila.

**Cloudflare Pages no procesa nada con Jekyll.** No hay etapa de plantillas, no hay Liquid, no hay nada que se atore con `{{`. Los archivos se sirven tal cual. O sea que el modo de fallo —publicar y que el sitio se quede congelado sin avisar— **desaparece**, y no porque se haya arreglado, sino porque el mecanismo que lo causaba ya no está en el camino.

**Aun así, no borres `.nojekyll`.** Dos razones concretas:

1. GitHub Pages va a seguir sirviendo el sitio en paralelo durante toda la transición (§6), y ahí sí importa.
2. `pruebas/publicacion.mjs:42-53` falla si el archivo no está mientras haya un `{{` en la documentación, y esa prueba es lo que evita que el incidente se repita.

Es un archivo vacío. No estorba.

---

## 4. El puente: el orden exacto, y qué se rompe al revés

El Worker decide a qué dominios les contesta con la cabecera `Access-Control-Allow-Origin`, y esa lista está en la variable `ORIGENES`. Hoy, si esa variable nunca se puso, el Worker está corriendo con el valor codificado por omisión (`puente/worker.js:137`):

```
https://eliasgaribi-ctrl-z.github.io
```

### El orden

**Paso 1. Comprueba si `ORIGENES` está siquiera definida.**
**Workers & Pages** → `puente-al3d` → **Settings** → **Variables and Secrets**. Si no aparece `ORIGENES` en la lista, el Worker está usando el dominio viejo por omisión y la rotura es segura. Si alguien ya la puso, mira qué dice.

**Paso 2. Pon los DOS dominios, separados por coma, sin barra final.**
Editar `ORIGENES` (tipo **Text**, no Secret) y poner exactamente:

```
https://eliasgaribi-ctrl-z.github.io,https://cotizador-al3d.pages.dev
```

Los dos a la vez. Durante la transición hay teléfonos en los dos dominios y los dos tienen que sincronizar.

**Paso 3. Redespliega el Worker.** Guardar la variable **no basta**: hay que darle a **Deploy** para que la tome. Este es el error clásico de este paso y produce exactamente el mismo síntoma que no haber hecho nada.

**Paso 4. Da de alta el origen nuevo en Google Cloud.** Esto no está en Cloudflare y por eso se olvida. `js/nucleo/gcal.js:462` pide registrar el origen exacto en Google:

**console.cloud.google.com** → proyecto AL3D → **APIs y servicios** → **Credenciales** → el ID de cliente de OAuth → **Orígenes autorizados de JavaScript** → agregar `https://cotizador-al3d.pages.dev` (sin barra final, sin ruta). Sin esto, Google Calendar devuelve `origin_mismatch` desde el primer día en el dominio nuevo.

**Paso 5. Verifica ANTES de mover a nadie.** En **un solo teléfono** —o mejor, en la computadora—: abre `https://cotizador-al3d.pages.dev/plataforma.html`, ve a **Ajustes → El puente**, pega la URL del Worker y el token de ese dispositivo, y dale a **Probar** (`js/mod/ajustes.js:626`). Tiene que contestar en verde y decir qué rol reconoció.

Si tienes terminal a la mano, la comprobación buena es leer el **valor** de la cabecera, no el estado:

```
curl -s -D- -o /dev/null -X OPTIONS \
  https://puente-al3d.<tu-cuenta>.workers.dev/salud \
  -H 'Origin: https://cotizador-al3d.pages.dev' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
```

y comprobar que `access-control-allow-origin` diga **el dominio nuevo**. Esto hay que leerlo con cuidado: por cómo está escrito hoy `puente/worker.js:140`, si el origen no está en la lista el Worker **no rechaza** — contesta con `lista[0]`, o sea con el primer dominio de la lista. Así que un dominio mal escrito igual devuelve `204` y las cabeceras se ven bien. Solo el valor delata el error.

**Paso 6. Ahora sí, mueve a la gente** (§5).

**Paso 7. Cuando los tres teléfonos estén en el dominio nuevo y con la bandeja en cero**, y no antes: quita `https://eliasgaribi-ctrl-z.github.io` de `ORIGENES`, deja solo el nuevo, y redespliega.

### Qué se rompe si se hace al revés

Si mueves a alguien al dominio nuevo antes de tocar `ORIGENES`, pasa esto:

1. El navegador del teléfono manda `Origin: https://cotizador-al3d.pages.dev`.
2. El Worker no lo encuentra en la lista y contesta con `https://eliasgaribi-ctrl-z.github.io` (`puente/worker.js:140`).
3. El navegador ve que el origen de la respuesta no es el suyo y **bloquea la respuesta entera** antes de que el JavaScript la vea.
4. Desde JavaScript, un CORS bloqueado y una falla de red **son indistinguibles**: la especificación no deja diferenciarlos. El código lo sabe y por eso el mensaje nombra las dos posibilidades en vez de mentir con una (`js/datos/puente.js:282-285`):

   > «No se pudo llegar al puente. Puede ser que no haya señal, o que a este dominio le falte estar en ORIGENES del Worker.»

5. Y aquí está el daño real: la persona está en la calle, con señal irregular, y ese mensaje es exactamente el que sale cuando de verdad no hay señal. Va a suponer que es la red. Va a seguir trabajando. Todo lo que capture se acumula en la bandeja de salida y **no llega a Notion**, durante horas o días, hasta que alguien lo note.

Hay un detalle que empeora la confusión: la pantalla de Ajustes te va a **dictar el valor correcto**, porque `js/datos/puente.js:619` arma la instrucción a partir de `location.origin`. O sea que la app dice «pon `ORIGENES` con este valor: `https://cotizador-al3d.pages.dev`» mientras el Worker sigue con el viejo. Leerlo ahí y no cambiarlo en Cloudflare es fácil, y produce el mismo silencio.

**Regla corta: el Worker primero, la gente después.**

Y una cosa que hay que decir aunque incomode: `ORIGENES` **no es autenticación**. Un `curl` sin navegador ignora CORS por completo. Lo único que de verdad protege el puente es el token de `TOKENS` (`puente/worker.js:157-165`). `ORIGENES` solo evita que una página web ajena use el puente desde el navegador de alguien del taller.

---

## 5. El service worker: los teléfonos que ya tienen la app instalada

### Qué les pasa

**Nada, y ese es el problema.**

Los tres teléfonos tienen la app instalada desde `github.io`, con un service worker registrado en ese origen (`index.html:11751`, `js/app.js:410`). Ese service worker:

- Sirve la plataforma **desde la caché primero** (`sw.js:210-218`). Abre instantáneo, sin red, sin preguntarle a nadie.
- Sirve el cotizador **red primero, caché de respaldo** (`sw.js:249-259`).

O sea que publicar en Cloudflare no les hace absolutamente nada. Siguen abriendo la app vieja, desde el ícono viejo, con todos los datos del negocio adentro, y **funcionan bien**. No hay ningún aviso, ninguna redirección, ninguna señal. Un teléfono puede seguir así meses.

Y el dominio nuevo, para ese mismo teléfono, es **una app vacía**: otro origen, otro IndexedDB, otro `localStorage`, otro service worker. Historial en blanco, agenda en blanco, almacén en blanco, folio en cero.

Si alguien instala la nueva sin haber respaldado la vieja, y después borra la vieja, se perdió todo. No hay recuperación.

### Qué se lleva el respaldo y qué no

Son **dos archivos distintos y no se cruzan**. La propia app lo advierte (`js/mod/ajustes.js:368-374`).

| | Se lleva | No se lleva |
|---|---|---|
| **Cotizador** (`index.html`, botón **Respaldar** del pie del historial) | Historial, **contador de folios** (`al3d_folio`), cotización en curso, logotipo, notas de los cuadernos, hitos, autorizador, ganadas, preferencias de material y de comisión (`index.html:9554-9556`) | **Las API keys de IA** (`al3d_kx_*`, `al3d_kxs_gemini`), y el identificador del aparato (`al3d_pf_disp`, excluido a propósito: restaurar un respaldo en un teléfono nuevo no puede convertirlo en el viejo, `index.html:7845-7848`) |
| **Plataforma** (Ajustes → tarjeta **Respaldo** → **Respaldar ahora**) | Proyectos, agenda, material, libro del almacén, blobs (`js/datos/db.js:301-313`) | **La bandeja de salida** (`js/datos/db.js:304`: reenviarla duplicaría operaciones), el **token del puente**, la URL del Worker, el rol, el nombre, el Client ID de Calendar, el proveedor de teselas, los datos de empresa (`js/datos/prefs.js:22-32`) |

Dos consecuencias que hay que tener claras antes de empezar:

**La bandeja de salida es lo único verdaderamente irreversible.** Lo que esté ahí sin mandar, se pierde con el origen viejo. Por eso el contador tiene que estar en **cero** en los tres teléfonos antes de mover a nadie.

**El token del puente no se puede volver a leer.** La pantalla no lo vuelve a pintar nunca —es lo único de Ajustes que sirve para entrar a algo, y Ajustes se le enseña a otra persona para que copie los pasos (`js/mod/ajustes.js:612-620`)— y `TOKENS` está guardado en Cloudflare como **Secret**, que tampoco se puede releer desde el panel (`puente/README.md:61`). Los tres se ven **una sola vez**, cuando se generan (`puente/README.md:70-74`).

Así que **decide esto antes del primer teléfono, no con uno en la mano**:

- ¿Tienes los tres tokens apuntados en algún lado? Entonces los vuelves a pegar y ya.
- ¿No los tienes? Entonces hay que **regenerar los tres**: Ajustes → El puente → **Generar los tres tokens** (`js/mod/ajustes.js:602`), pegar el JSON nuevo completo encima del secreto `TOKENS` en Cloudflare, redesplegar el Worker, y repartir los tres. Eso es **un solo momento coordinado con los tres teléfonos juntos**, no algo que se haga a lo largo de la semana. Y esta vez, **guarda el JSON en un gestor de contraseñas antes de cerrar la pantalla**: con el JSON guardado, revocar el token de un teléfono robado es editar una línea; sin él, es volver a hacer esto entero.

### El procedimiento, teléfono por teléfono

Se hace **uno a la vez**, y no se toca el siguiente hasta que el anterior esté verificado.

**En el teléfono, todavía en `github.io`:**

1. **Plataforma → Ajustes → El puente → «Mandar lo que está pendiente»** (`js/mod/ajustes.js:633`). Repetir hasta que el contador de pendientes diga **0**. Si no hay señal, esperar. Este paso no se salta.
2. **Plataforma → Ajustes → Respaldo → «Respaldar ahora».** Guarda el archivo fuera del teléfono (correo a ti mismo, Drive, lo que sea).
3. **Cotizador → Historial → «⬇ Respaldar».** Otro archivo, guardar también fuera del teléfono.
4. **Anota en papel**: qué rol tiene este teléfono, la URL del Worker, y **cuál es el último folio emitido**.

**En el teléfono, ya en el dominio nuevo:**

5. Abre `https://cotizador-al3d.pages.dev` en el navegador. **Instálala** (Android: menú ⋮ → *Instalar aplicación*; iOS: Compartir → *Agregar a pantalla de inicio*).
6. **Restaura primero el de la plataforma**: Ajustes → *Restaurar desde un respaldo de la plataforma*. Este **fusiona**: lo que ya está se queda y lo que falta entra, y el mismo archivo se puede meter dos veces sin miedo (`js/mod/ajustes.js:364-366`).
7. **Después el del cotizador**: Historial → *Restaurar*. Este es **todo-o-nada y aborta completo si algo no cabe** (`js/mod/ajustes.js:371-373`). Por eso va segundo: si algo va a fallar, que falle cuando la plataforma ya está a salvo. La app descarga sola un respaldo de lo que había antes de reemplazar (`index.html:9664`).
8. **Vuelve a pegar a mano** lo que el respaldo no lleva: el token del puente y la URL del Worker (Ajustes → El puente), las API keys de IA en el cotizador, y el Client ID de Calendar si este es el teléfono de Dirección.
9. **Verifica a ojo, sin prisa:** que el historial tenga las cotizaciones que tenía, que el folio siguiente sea el que anotaste (no `COT-0001`), que la agenda tenga los eventos, que el almacén cuadre, y que Ajustes → El puente → **Probar** conteste en verde con el rol correcto.

**Solo entonces, soltar el viejo EN ESE TELÉFONO:**

10. **Android/Chrome**: ⋮ → *Configuración del sitio* → `eliasgaribi-ctrl-z.github.io` → **Borrar datos**.
    **iOS/Safari**: Ajustes del teléfono → Safari → Avanzado → *Datos de sitios web* → buscar `github.io` → eliminar.
11. **Borra el ícono viejo de la pantalla de inicio.** Dos íconos idénticos con datos distintos es cómo se acaba capturando media semana en la app equivocada.

Este paso 10 borra el IndexedDB viejo, por eso va **después** del 9 y no antes.

**Repite con el segundo teléfono. Después con el tercero.**

---

## 6. Apagar GitHub Pages (o no)

### La respuesta corta: no de golpe, y no todavía

Apagar GitHub Pages a secas —**Settings → Pages → Source: None**— **no desregistra nada**. El service worker vive en el teléfono, no en el servidor. Un teléfono que ya tiene la plataforma instalada la sirve **desde su propia caché** (`sw.js:210-218`) y va a seguir abriéndola exactamente igual, con el sitio apagado, indefinidamente. No hay error, no hay 404, no hay aviso. Solo una app zombi con los datos del negocio adentro que ya nadie actualiza.

Lo mismo pasa si el repositorio se vuelve privado: en cuenta gratuita eso apaga GitHub Pages, con el mismo resultado.

### Lo que sí suelta un teléfono: la lápida

Lo único que apaga un service worker es **otro service worker que se desregistre a sí mismo**. Así que, con **GitHub Pages todavía prendido**, se publica en `main` un despliegue lápida:

1. **`index.html` y `plataforma.html`**: reemplazarlos por una página corta que diga, en el cuerpo del HTML y en grande: *«Esta dirección se mudó. La app nueva está en https://cotizador-al3d.pages.dev — respalda desde aquí primero si todavía no lo hiciste.»* Esto es lo que la gente ve, y funciona porque el cotizador es red-primero y la plataforma revalida.

2. **`sw.js`**: subir `APP_VERSION`, vaciar `APP_FILES`, y dejar el archivo así:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
})()));
```

Un aviso sobre una variante de esto que circula y **no funciona**: agregarle `clients.navigate(url)` apuntando al dominio nuevo. `WindowClient.navigate()` solo acepta URLs del **mismo origen**; con una URL cruzada la promesa se rechaza con `TypeError` y el usuario no se entera de nada. La lápida funciona sin eso: el aviso lo da el HTML.

3. **Déjala publicada 60 o 90 días.** Un teléfono que no abre la app vieja en ese tiempo no se entera de nada. Este es el único paso que no se puede apurar.

4. **Recién entonces**: Settings → Pages → Source: **None**.

5. **Después**: quitar `github.io` de `ORIGENES` en el Worker y redesplegar.

6. **Y hasta el final**, si se quiere: volver el repositorio privado. El orden importa: privado apaga Pages, y Pages tiene que estar prendido para que la lápida llegue.

### Redirigir el dominio viejo

GitHub Pages no ofrece redirecciones de servidor para un sitio de proyecto: no hay panel donde poner un 301. Lo que sí se puede es una redirección del lado del navegador en el `index.html` de la lápida, con un `<meta http-equiv="refresh">` y un enlace visible por si el refresh no corre.

Pero conviene entender qué compra y qué no: **una redirección no desregistra el service worker**. Un teléfono con la app instalada sirve su copia de caché y ni siquiera pide el HTML nuevo hasta que el service worker se actualiza. La redirección es cortesía para quien llegue por un enlace guardado desde otro navegador; **la lápida es lo que suelta los teléfonos**. Haz las dos, pero no confíes en la primera.

---

## 7. Los ajustes de seguridad del panel, uno por uno

Aquí hay que ser exacto sobre una cosa que confunde a todo el mundo: **Cloudflare tiene dos clases de ajustes**.

- Los de **zona** (SSL/TLS, Speed, Security, WAF, Caching, Rules) existen cuando tienes un **dominio propio** en la cuenta. En `*.pages.dev` **no existen**: no hay menú, no hay interruptor, no hay nada que apagar.
- Los de **proyecto** y de **cuenta** sí aplican hoy.

Así que la lista de hoy es corta y honesta.

### Hoy, en `cotizador-al3d.pages.dev`

| Ajuste | Ruta del menú | Valor | ¿Gratis? |
|---|---|---|---|
| **Verificación en dos pasos de la cuenta** | **My Profile** → **Authentication** → *Two-Factor Authentication* → activar | Activada | **Sí** |
| **HTTPS y certificado** | — | Automático, obligatorio, nada que hacer | **Sí** |
| **Access sobre las vistas previa** | Ver §9 | — | **Sí** |
| **Vistas previa de ramas** | Ver §9 | — | **Sí** |
| **Web Analytics** | Workers & Pages → `cotizador-al3d` → Settings → *Web Analytics* | **No lo enciendas.** Ver §8 | Sí, pero no |
| **Observability / Logs del Worker** | Workers & Pages → `puente-al3d` → Settings → **Observability** → *Logs* → Enable, *Sampling* 100% | Encendido | **Sí** (200,000 eventos/día; el puente hace del orden de 100 peticiones diarias, `puente/README.md:183`) |
| **Metrics del Worker** | Workers & Pages → `puente-al3d` → **Metrics** | Ya está encendido, sin configurar | **Sí** |

**El primero de esa lista es el más importante de todo este documento, y cuesta tres minutos.** Un secreto de Cloudflare no se puede **leer** desde el panel, pero sí se puede **sobrescribir**. Quien entre a esa cuenta puede escribir un `TOKENS` nuevo y darse a sí mismo el rol `direccion` (`puente/worker.js:157-165`), o leerse el workspace entero de Notion con `NOTION_TOKEN`. La verificación en dos pasos es lo único que de verdad guarda esos dos valores. Hazla hoy, antes que nada de lo demás.

Sobre los logs del Worker, una regla que hay que respetar el día que alguien escriba un `console.log` ahí: se puede registrar `rol`, `ruta` y el estado de la respuesta. **Nunca** el token (`puente/worker.js:159`), nunca `req.headers`, nunca `env.TOKENS`, nunca `env.NOTION_TOKEN`, y nunca los valores de las propiedades —solo sus nombres— o acabas con los importes de los clientes guardados en el panel de Cloudflare.

**HSTS: no lo toques en el panel.** Ya está puesto en `_headers` con `max-age=31536000; includeSubDomains` y **sin `preload`**, que es lo correcto. Duplicarlo en la zona es cómo se acaba con un `max-age` que nadie sabe de dónde sale. En `*.pages.dev` el `includeSubDomains` es inofensivo porque no cuelga nada de ese hostname.

### El día que conectes un dominio propio (`al3d.mx`)

Esto no hay que hacerlo hoy. Cuando toque, va en este orden:

1. **Add a domain** → `al3d.mx` → plan **Free**. Cambiar los dos servidores de nombres en el registrador. Esperar a que la zona diga **Active**.
2. Workers & Pages → `cotizador-al3d` → **Custom domains** → *Set up a domain* → `al3d.mx`, y repetir con `www.al3d.mx`. Cloudflare crea los registros solo. **No los crees a mano antes**: si ya existe uno, el asistente se atora.
3. **SSL/TLS** → *Overview* → **Full (strict)**.
4. **SSL/TLS** → *Edge Certificates*: **Always Use HTTPS: On** · **Minimum TLS Version: TLS 1.2** · **TLS 1.3: On** · **Opportunistic Encryption: On**. Todo gratis. *Automatic HTTPS Rewrites* es indiferente aquí: la CSP de `_headers` ya lleva `upgrade-insecure-requests`.
5. **Caching** → *Configuration* → **Browser Cache TTL: Respect Existing Headers**. Y **no crees ninguna Cache Rule ni Page Rule con «Cache Everything»** sobre este host: `_headers` ya dice archivo por archivo qué se revalida y qué no, y una regla de zona lo pisa.
6. **Rules** → *Redirect Rules* → redirigir `www.al3d.mx` al ápice con un 301. Una sola PWA, un solo origen, un solo IndexedDB.
7. **Security** → *WAF* → *Managed rules* → desplegar el **Cloudflare Free Managed Ruleset**, acción **Block**. Es el único disponible en el plan Free, es gratis, y no rompe nada en un sitio estático. Si algún día bloquea algo legítimo, se mira en Security → Events y se hace una excepción por hostname, nunca apagando el conjunto.
8. **Security** → *Settings*: **Security Level: Medium** (no *I'm Under Attack*: interpone una pantalla de espera de cinco segundos y convierte cada revalidación del service worker en un desafío) · **Browser Integrity Check: On**.
9. **Y fuera de Cloudflare, otra vez**: dar de alta `https://al3d.mx` en los *Orígenes autorizados de JavaScript* de Google Cloud, y actualizar `ORIGENES` del Worker. **Esto se hace dos veces en total**: una al mudarse a `pages.dev` y otra al conectar el dominio propio. Son dos orígenes distintos y el segundo salto rompe lo mismo que el primero.
10. **Y sí: `al3d.mx` es un tercer origen.** Todo lo de §5 —los dos respaldos, la bandeja en cero, los tokens— hay que volver a hacerlo. Por eso conviene decidir el dominio definitivo **antes** de mover a nadie, y saltarse `pages.dev` como destino final si el dominio propio ya está comprado.

Y el paso que borra el problema del CORS de raíz para siempre: cuando haya dominio propio, montar el Worker como **ruta del mismo dominio** (`al3d.mx/puente/*`) en vez de `.workers.dev`. Ahí desaparece el CORS por completo —mismo origen—, y `connect-src` de la CSP puede cerrarse. Dos condiciones antes de hacerlo: (a) el Worker necesita `Cache-Control: no-store` en su helper `json()` (`puente/worker.js:151-154`), porque en un dominio propio la caché de borde de Cloudflare sí aplica; y (b) hay que blindar `sw.js` **antes**, con un `if` que excluya `/puente/` de la caché justo después de `sw.js:197`, o el service worker empezaría a guardar en el Cache Storage las respuestas del puente, que llevan dinero y direcciones de clientes.

---

## 8. Lo que hay que apagar sí o sí

Los tres son **ajustes de zona**: hoy, en `*.pages.dev`, no existen y no hay nada que hacer. **Esta sección es para el día que conectes `al3d.mx`**, y hay que leerla antes de ese día, porque los tres vienen encendidos o a un clic de estarlo, y los tres rompen esta app en particular de formas que no se diagnostican solas.

### Rocket Loader — **Off**

**Speed** → *Optimization* → *Content Optimization* → **Rocket Loader: Off**

Rocket Loader difiere la ejecución de todo el JavaScript hasta **después** del `DOMContentLoaded`. `index.html` tiene **un solo `<script>`** con los 893 KB adentro, y **267 manejadores escritos en el HTML** (`onclick="..."`, `oninput="..."` y demás). Esos atributos apuntan a funciones que están dentro de ese script.

Con Rocket Loader, hay una ventana en la que la pantalla ya está pintada, los botones ya se ven, y las funciones que llaman **todavía no existen**. Tocar cualquier cosa en esa ventana no hace nada: no da error visible, no pinta un aviso, simplemente no pasa nada.

Y hay que decirlo bien, porque cambia lo obedecible que es el consejo: **eso pasa en cada carga**, en fibra y en 3G. La mala señal solo alarga la ventana; no la crea. Un botón que a veces no responde es de los defectos más caros de diagnosticar que existen, y aquí lo produciría un interruptor.

### Auto Minify — **Off**

**Speed** → *Optimization* → **Auto Minify**

Cloudflare lo retiró del panel en agosto de 2024, así que en una zona nueva probablemente ni aparezca. Si la cuenta arrastra una zona vieja donde todavía se ve: **Off**, las tres casillas.

Minificar 893 KB de HTML con **190 atributos `style=""`** y 267 atributos `on*` es el caso exacto donde un minificador se equivoca, y el resultado —un atributo mal recortado, una comilla comida— se ve como un pedazo de la interfaz que dejó de funcionar sin razón aparente.

### Email Obfuscation — **Off**

**Scrape Shield** → **Email Address Obfuscation: Off**

Email Obfuscation **reescribe el HTML** que sirve Cloudflare: sustituye las direcciones de correo que encuentra por un enlace codificado y le **inyecta un `<script>`** a la página para decodificarlas.

Aquí compra cero: revisé `index.html` y `plataforma.html` y **no hay ningún `mailto:`**. El único correo del proyecto, `remates@thiqa.mx`, está en `js/datos/geo.js:250` —dentro de JavaScript, que esta función no toca— y está ahí porque la política de uso de Nominatim **exige** un contacto identificable. No se quita.

Y sí cuesta: cualquier reescritura automática del HTML es un cambio que el service worker del cotizador **guarda en la caché** (`sw.js:253-259`) y sirve durante días sin señal. Un HTML modificado en el borde, congelado en un teléfono, es la clase de estado que nadie va a pensar en revisar.

### Y dos más de la misma familia

**Bot Fight Mode — Off** (**Security** → *Bots*). Inyecta un script en el HTML, con el mismo problema de caché de arriba. Pero la razón que de verdad manda es otra: la revalidación del service worker (`sw.js:245`) es un `fetch` **sin gesto de usuario**, que es exactamente el perfil que estas heurísticas marcan. Un desafío ahí rompe la actualización de la PWA y **nadie lo ve**: el teléfono simplemente se queda en la versión vieja.

**Web Analytics — no lo enciendas** (Workers & Pages → proyecto → Settings → *Web Analytics*). Es un script de terceros metido en un HTML que el service worker cachea, en una app de tres personas donde ya sabes quién la usa. Si lo enciendes de todos modos, hay que hacer **dos cosas o no funciona**: agregar `https://static.cloudflareinsights.com` a `script-src` y `https://cloudflareinsights.com` a `connect-src` de la CSP de `_headers`, y **subir `APP_VERSION` en `sw.js:33` el mismo día** para que los teléfonos con la app instalada no se queden con el HTML de antes.

---

## 9. Las vistas previa de las ramas

### El riesgo

Cloudflare Pages, por omisión, publica **cada rama** que se sube al repositorio en su propia URL: `https://<hash>.cotizador-al3d.pages.dev`. Suena inofensivo. Aquí no lo es, por tres razones distintas:

1. **Cada vista previa es un origen nuevo.** Y un origen nuevo es un service worker nuevo, un IndexedDB nuevo y un `localStorage` nuevo. Si alguien del taller abre un enlace de vista previa desde su teléfono e instala eso por error, se queda con una cuarta copia de la app, vacía, con el mismo ícono y el mismo nombre. Todo lo que capture ahí no está en ningún lado.

2. **Cada vista previa sirve el repositorio entero, públicamente y sin adivinar nada.** Incluida `docs/`, con los UUIDs de la base de Notion, las cifras de facturación y los nombres de clientes reales (§12). El `X-Robots-Tag: noindex` de `_headers` evita que salga en Google, no que se abra.

3. **La vista previa es un origen que no está en `ORIGENES`**, así que el puente no le contesta. Eso técnicamente es bueno, pero produce un rato perdido: alguien prueba una rama, el puente falla, y el mensaje dice «puede ser que no haya señal».

### Cómo se cierra

Hay dos formas y **hay que elegir una**, no las dos. Hacer las dos es trabajo de configuración sin beneficio.

**Opción A — apagarlas.** Workers & Pages → `cotizador-al3d` → **Settings** → **Builds** → *Preview deployments* → **None** (o restringirlas a ramas concretas). Gratis, instantáneo, y no hay nada más que mantener. Es la que recomiendo si nadie del taller necesita ver ramas antes de fusionarlas.

**Opción B — dejarlas detrás de Cloudflare Access.** Gratis también, y sirve si alguien sí quiere revisar cambios antes de que salgan.

1. **Zero Trust** → **Settings** → *Authentication* → *Login methods* → *Add new* → **One-time PIN**. Viene por omisión, no hace falta ningún proveedor de identidad ni tarjeta.
2. Workers & Pages → `cotizador-al3d` → **Settings** → **General** → *Access policy* → **Enable**. Esto protege `*.cotizador-al3d.pages.dev` —las vistas previa— **sin tocar el dominio de producción**.
3. **Zero Trust** → **Access** → *Applications* → editar la aplicación creada: *Action: Allow* · *Include: Emails* → los tres correos del negocio, uno por línea.

**Y la advertencia que importa más que todo lo anterior: hay una casilla para extender Access también al dominio de producción. NO LA MARQUES.**

La razón es concreta y es del service worker. Access intercepta las peticiones y las manda a una pantalla de login en `<equipo>.cloudflareaccess.com`. El `install` del service worker hace `addAll` sobre los 34 archivos de `APP_FILES` (`sw.js:45-80`), y `addAll` es **todo o nada por diseño**. Contra una redirección a otro dominio, esas peticiones fallan con error de red: `addAll` rechaza, `install` falla en cada visita, y —por lo que hace `sw.js:155-162`— la plataforma se queda **congelada en la versión anterior para siempre**, o, si es una primera instalación, el teléfono se queda **sin service worker**, que es lo mismo que decir sin el cotizador sin señal, que es la única razón por la que ese archivo existe.

Access no protege esta app de nada, además: los datos del negocio están en el teléfono de cada quien, no en el servidor, y lo que se sirve es código que ya es público en GitHub. La única frontera de permisos real ya existe y es el token de dispositivo del Worker. Poner Access encima de la app es un candado sobre una puerta abierta que además tira la pared.

---

## 10. Runbook

Al estilo del de `puente/README.md:141-153`.

| Lo que ves | Qué pasó | Qué hacer |
|---|---|---|
| El sitio nuevo abre pero sin la tipografía Inter, el mapa gris y «Cotizar con IA» pensando para siempre | La CSP no llegó: o `_headers` no está en la rama publicada, o el *Build output directory* no es la carpeta donde está | Comprobar que `main` tenga `_headers` en la raíz (§2) y que *Build output directory* sea `/`. Si hay un build command con `cp`, agregarle `_headers robots.txt .nojekyll` |
| Todo se ve bien pero el sitio se ve igual de desprotegido que antes | Se conectó Pages a `main` **antes** de fusionar la rama de las cabeceras | Fusionar el PR (§2) y volver a desplegar desde Workers & Pages → *Deployments* → *Retry deployment* |
| Ajustes → Probar: «No se pudo llegar al puente. Puede ser que no haya señal, o que a este dominio le falte estar en ORIGENES» | El dominio nuevo no está en `ORIGENES`, **o** se guardó la variable sin redesplegar el Worker | Worker → Settings → Variables → `ORIGENES` con los dos dominios, coma en medio, sin barra final → **Deploy** (§4) |
| Lo mismo, pero solo en un teléfono y los otros dos sí sincronizan | No es CORS: es la señal, o la URL del Worker mal pegada en ese teléfono | Ajustes → El puente → revisar la URL. Si está bien, es la red: la bandeja lo reintenta sola |
| «Este teléfono no tiene un token válido del puente» (401), en **un** teléfono | El token se pegó con un espacio o es el de otro dispositivo | Volver a pegarlo en Ajustes → El puente |
| «Este teléfono no tiene un token válido» (401) en **los tres** | El JSON de `TOKENS` está roto —una coma de más, una comilla curva del teclado del celular— o un rol está mal escrito | Regenerar el JSON con Ajustes → *Generar los tres tokens*, pegarlo completo en el secreto `TOKENS`, desplegar, repartir los tres |
| «Al puente le faltan sus secretos» (500) | Falta `NOTION_TOKEN` o `TOKENS` en el Worker | Workers & Pages → `puente-al3d` → Settings → Variables and Secrets |
| Google Calendar dice `origin_mismatch` | Falta el origen nuevo en Google Cloud | console.cloud.google.com → Credenciales → el ID de cliente → *Orígenes autorizados de JavaScript* → agregar el dominio nuevo, sin barra final (§4, paso 4) |
| La app nueva abre **vacía**: sin historial, sin agenda, folio en `COT-0001` | Es otro origen. Los datos siguen en el teléfono, bajo `github.io` | Restaurar los dos respaldos (§5). Si no se bajaron, volver a abrir la app vieja —que sigue funcionando— y bajarlos |
| El folio nuevo empieza en `COT-0001` **después** de restaurar | El respaldo del cotizador no se restauró, o se restauró solo el de la plataforma | `al3d_folio` sí viaja en el respaldo del cotizador (`index.html:9554`). Restaurar ese archivo, el que se baja desde el Historial |
| Se restauró el de la plataforma dentro del cotizador (o al revés) y no pasó nada bueno | Son dos archivos distintos y no se cruzan | El del cotizador es todo-o-nada y aborta completo. Bajar otra vez los dos del teléfono viejo y restaurar cada uno en su lugar |
| Un teléfono sigue abriendo la app vieja aunque el sitio nuevo ya está publicado | Correcto y esperado: el service worker de `github.io` sirve desde su caché | Es lo que hace la lápida (§6). Mientras tanto, mover ese teléfono a mano con el procedimiento de §5 |
| Se publicó un cambio de la plataforma y no llega a los teléfonos | No se subió `APP_VERSION` | `sw.js:33`, subir el número una unidad. Abrir y cerrar la app **dos veces** en cada teléfono: la primera baja el worker nuevo, la segunda lo activa |
| Un botón del cotizador no responde a veces | Rocket Loader encendido en la zona | **Speed** → *Optimization* → **Rocket Loader: Off** (§8) |
| El sitio no se actualiza y no es el service worker | Alguna Cache Rule o Page Rule de zona con «Cache Everything» pisando `_headers` | Borrar la regla. **Caching** → *Configuration* → **Browser Cache TTL: Respect Existing Headers** |
| Una cuarta copia de la app apareció en un teléfono | Alguien instaló desde una URL de vista previa | Borrar los datos de ese sitio en el teléfono y cerrar las vistas previa (§9) |
| «Notion rechaza el alta» nombrando una propiedad | Falta crearla a mano en la base | Ajustes → *Revisar el esquema* → crearla en Notion con ese nombre y ese tipo exactos. El puente detecta y no crea, a propósito |
| Un teléfono se perdió o se lo robaron | El token de ese teléfono sigue siendo válido | **El mismo día**: si tienes el JSON de `TOKENS` guardado, borra esa entrada, pega el JSON y despliega. Si no lo tienes —y no se puede releer del panel—, regenera los tres y repártelos (§5) |

---

## 11. Qué probar después de publicar, en orden

Esto se hace **una vez en la computadora, con la consola abierta**, antes de tocar ningún teléfono. La consola es la parte que no se puede saltar: una CSP a la que le falta un origen **no da error de red, no pinta un aviso y no aparece en ningún log**. El navegador simplemente no hace la petición. Lo que se ve es la tipografía de reserva, o el mapa gris, o el análisis que nunca termina — y solo se entera quien tenga la consola abierta, que en un celular en la calle no es nadie.

**Cómo abrir la consola**: en Chrome o Edge, `F12` → pestaña **Console**. En Safari de Mac, Preferencias → Avanzado → *Mostrar el menú Desarrollo*, y luego Desarrollo → *Mostrar consola de JavaScript*.

**Qué estás buscando**: líneas en rojo que empiecen con

> `Refused to load ... because it violates the following Content Security Policy directive: ...`

Cada una nombra el origen bloqueado y la directiva que lo bloqueó. Si aparece una, el arreglo es agregar ese origen a esa directiva de la CSP en `_headers` — y **no** quitar la CSP.

### La lista, en orden

1. **Abre `https://cotizador-al3d.pages.dev` con la consola ya abierta.** Cero rojos. La tipografía tiene que verse Inter, no la de reserva del sistema: si se ve distinta, falta `fonts.googleapis.com` o `fonts.gstatic.com`.

2. **Comprueba que las cabeceras llegaron.** Pestaña **Network** → recarga → clic en el primer documento → **Headers** → *Response Headers*. Tienen que estar `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` y `x-robots-tag: noindex, nofollow`. Si no están, el problema es de §2 o del *Build output directory*, y todo lo demás de esta lista da igual.

3. **El flujo de cotizar, completo.** Crear una cotización de prueba: cliente, teléfono, dos partidas, autorizarla. Que el folio avance. Que el historial la guarde. Que salga el aviso de respaldo si toca. Esto ejercita casi todos los 267 manejadores del HTML: si `script-src` estuviera mal, aquí no funcionaría **nada**.

4. **El PDF.** Genera el PDF de esa cotización. Tiene que abrirse en otra pestaña **y lanzar el diálogo de impresión solo**. Si abre pero no imprime, es la CSP: el PDF se arma como una página HTML con un `<script>` adentro, se mete en un `Blob` y hereda la política de quien lo creó. Si no abre, mira `frame-src` y `blob:`.

5. **Leer un PDF que manda el cliente.** Sube un PDF en el analizador. Esto carga pdf.js desde `cdnjs.cloudflare.com` (`index.html:10369-10370`), que es el origen más frágil de la lista. Ojo: **hoy esto necesita señal la primera vez** y el propio mensaje de error lo admite. Si falla con la consola limpia, es la red; si falla con un `Refused to load`, es `script-src`.

6. **El mapa.** Plataforma → Mapa. Las teselas tienen que pintar (`img-src` con `tile.openstreetmap.org`). Prueba también cambiar el proveedor a CARTO en Ajustes, que es la otra entrada de `img-src`. Y busca una dirección: eso pega a `nominatim.openstreetmap.org` por `connect-src`. Este último vale la pena mirarlo con la consola de red abierta aunque no falle: nadie del proyecto ha verificado nunca que Nominatim mande la cabecera que el navegador necesita (`js/datos/geo.js:244-245`), y el origen acaba de cambiar.

7. **El puente.** Ajustes → El puente → **Probar**. Tiene que contestar **en verde** y **decir el rol** que reconoció. Después **Revisar el esquema**, que tiene que listar lo que falte sin errores. Y por último **Mandar lo que está pendiente** y **Traer de Notion**, con una operación real de prueba, para ver el ciclo completo.

8. **Google Calendar**, si estás en el teléfono de Dirección: crear un evento de prueba. Si dice `origin_mismatch`, falta el paso 4 de §4.

9. **Sin señal.** Pon el teléfono en modo avión y abre las dos apps desde el ícono instalado. Las dos tienen que abrir: el cotizador con su historial, la plataforma con sus proyectos. El mapa va a salir gris y **eso es correcto y está dicho con palabras en la pantalla**: las teselas no se cachean a propósito, porque archivarlas viola la política de OpenStreetMap (`sw.js:189-196`). El mapa necesita señal; los datos no.

10. **Y si tienes terminal a la mano** —o alguien que la tenga—, antes de cada publicación:

    ```
    pruebas/correr.sh
    pruebas/correr.sh --navegador
    ```

    La primera corre en segundos con node y nada más. Dos de sus pruebas son justo las que atajan los fallos silenciosos de esta mudanza: `pruebas/cabeceras.mjs` compara **en los dos sentidos** los orígenes que el código carga y los que `_headers` permite —falla si agregas un proveedor y no tocas la CSP, y también si dejas permitido un origen que el código ya no usa—, y `pruebas/publicacion.mjs` verifica que existan los 34 archivos que `sw.js` promete cachear y que `APP_VERSION` siga ahí. La segunda levanta Chromium, sirve el sitio **con las cabeceras reales de `_headers`** y escucha el evento `securitypolicyviolation`, que es exactamente lo que el navegador dispara cuando la CSP le impide cargar algo. En producción ese evento no lo escucha nadie; ahí sí.

    Si nadie del taller corre una terminal, la alternativa honesta es la lista 1-9 de arriba, hecha completa, cada vez.

---

## 11 bis. Las tres alarmas que se comprobaron y resultaron falsas

Al revisar esta mudanza salieron tres cosas que sonaban a que iban a romper la app. Las tres
se probaron con Chromium antes de escribir nada, y las tres son falsas. Van aquí con el
resultado, porque el día que alguien vuelva a leer sobre service workers y Cloudflare las va
a volver a encontrar y va a querer arreglar algo que no está roto.

**«Las URL limpias de Pages rompen el service worker.»** Cloudflare Pages sirve
`plataforma.html` en `/plataforma` y manda un 308 de la ruta con extensión a la limpia. La
alarma era que `sw.js:120` guarda con `c.addAll(...)` y que `addAll` rechaza las respuestas
que vinieron de una redirección, con lo cual la plataforma se quedaría sin caché y sin abrir
sin señal, en silencio.

No pasa. Se sirvió el sitio con las URL limpias y el 308 puesto: el service worker guardó
sus **34 archivos completos** y la plataforma abrió en modo avión desde `/plataforma`. Lo que
`Cache.put` rechaza es una respuesta de tipo `opaqueredirect` —la que sale cuando alguien
pide con `redirect: 'manual'`—, que es otra cosa y aquí no aparece. Está cubierto de aquí en
adelante por `pruebas/navegador/csp.mjs`, que sirve el sitio como lo sirve Pages, con el 308
incluido, y comprueba las dos cosas.

**«La CSP rompe la instalación del service worker.»** Sirviendo por **http** en una máquina
de pruebas, sí: la política lleva `upgrade-insecure-requests`, Chromium asciende a `https`
los `fetch` que el worker hace desde dentro, el servidor de pruebas no habla `https`, y
`addAll` falla. Cero de 34.

Pero eso es del servidor de pruebas, no de la política. Sirviendo lo mismo por **https** con
un certificado que el navegador acepta —que es lo único que hace Cloudflare Pages, que no
sirve http— la CSP completa deja los 34 archivos guardados. Está anotado en
`pruebas/navegador/csp.mjs`, que le quita esa directiva a la política **solo para su propio
servidor** y deja que `pruebas/cabeceras.mjs` exija que siga escrita en `_headers`.

**«Hay que quitar `.nojekyll`.»** No. Deja de hacer falta en Cloudflare, pero GitHub Pages
sigue publicando en paralelo durante toda la transición y ahí sí importa. Es un archivo
vacío. Está explicado en §3.

---

## 12. Lo que esta mudanza NO arregla

> **Nota, puesta después.** Esta sección se escribió cuando la lista de abajo estaba entera
> por hacer. Después se hizo casi todo: los diez parches del Worker están aplicados en
> `puente/worker.js` (falta pegarlo en Cloudflare, y el orden está en
> `puente/ENDURECIMIENTO.md`), los doce `onclick` ya no interpolan, pdf.js vive en
> `vendor/pdfjs/` y `cdnjs` salió de la política, `urlMapa()` filtra el esquema, y hay un
> aviso de privacidad en borrador. El estado al día está en `docs/SEGURIDAD.md`, en «Qué se
> arregló, y qué sigue abierto». Lo de abajo se conserva porque explica **por qué** cada cosa
> importaba, que es lo que no se puede reconstruir leyendo el código ya arreglado.
>
> Lo que de verdad sigue abierto y depende de la mudanza es lo primero de la lista, y no es
> código: **`docs/` se publica con el sitio**, con los UUID de la base de Notion, cifras de
> facturación y nombres de clientes reales.

Mudarse a Cloudflare arregla **las cabeceras**, y eso es real: hoy el sitio se sirve sin política de contenido, sin HSTS, enmarcable desde cualquier página del mundo e indexable por Google, y no era descuido — es que GitHub Pages no deja poner una sola cabecera. En Cloudflare sí se puede y `_headers` ya lo hace.

**No arregla nada más.** Lo que sigue abierto, con su archivo y su línea, para que nadie dé por cubierto lo que no lo está:

**En el Worker del puente** (nada de esto lo toca la mudanza):

- `/jalar` entrega **la base del dinero completa a cualquier rol**, fabricación incluida (`puente/worker.js:348-365`). El token de fabricación se baja por `curl` los importes de todas las ventas. La lista blanca `ESCRIBIBLES` (`worker.js:121-131`) controla lo que se **escribe**; no existe una equivalente para lo que se **lee**.
- `op.id_notion` se concatena crudo en la ruta de la API de Notion, sin validar formato ni pertenencia a la base (`worker.js:388, 404, 412`). El arreglo barato y sin efectos es una expresión regular de UUID en la 388.
- **Cualquier rol puede crear filas nuevas** en la base del dinero; el candado está solo en el cliente (`worker.js:394-397`, candado real en `js/datos/puente.js:460-464`).
- **Los importes se aceptan sin rango**: negativos y cantidades absurdas entran directo (`worker.js:248-251`).
- **Ninguna escritura deja rastro** de qué teléfono la hizo: en Notion todo aparece firmado por la integración.
- **No hay límite de tasa.** El riesgo real no es la fuerza bruta: es agotar las 100,000 peticiones diarias con un bucle del cliente, sin ningún atacante. La regla de Rate Limiting es gratis pero necesita dominio propio; mientras tanto, lo que más vale es **activar la alerta de uso de Cloudflare al 80% de la cuota**, que sí se puede hoy.
- **`/expandir` no lo llama nadie** (`worker.js:430-439`): es riesgo sin función. Borrarlo cierra tres hallazgos de una vez y no rompe nada.

**En el cotizador:**

- **Doce `onclick` se arman por interpolación** a partir del folio o del nombre del cliente, y `esc()` no protege el contexto JavaScript (`index.html:3810` y los sinks; los cinco que llevan dato controlable son `9352, 9403, 9404, 9405, 9530`). El comentario del propio archivo lo documenta como resuelto y no lo está.
- **pdf.js se carga desde `cdnjs` sin verificación de integridad**, en dos lugares copiados literal (`index.html:10369-10370` y `12082-12083`). Bajarlo a `vendor/` como ya se hizo con Leaflet resuelve las cuatro líneas, hace que leer PDFs funcione **sin señal** —hoy no funciona— y permite quitar `cdnjs` de `script-src`.
- **`urlMapa()` no filtra el esquema** (`js/mod/proyectos.js:742-749`), a diferencia de `agenda.js:566` que sí lo hace. Es una línea de diferencia entre los dos archivos.

**Y lo que no es de código:**

- **`docs/` se publica con el sitio**: 688 KB con los UUIDs de la base de Notion, cifras de facturación, nombres de clientes reales y cuentas bancarias. El `X-Robots-Tag: noindex` de `_headers` los saca de Google, y eso es todo lo que se puede hacer sin tocar el repositorio. El arreglo de verdad es borrar del repositorio lo que no tiene por qué estar ahí, o volverlo privado — y volverlo privado apaga GitHub Pages, así que va **después** de la lápida (§6), no antes.
- **La lista de precios completa sale a OpenRouter en cada análisis**, y el modelo por omisión es uno `:free`, que manda el prompt al proveedor y él lo puede usar para entrenar (`index.html:6801, 7309`). Eso hay que decirlo **en la pantalla de Ajustes**, junto al campo de la key, no en un documento que nadie abre.
- **El cliente no sabe que su plano sale del taller.** Antes de mandarle una imagen a un servicio de IA de terceros hace falta decírselo, y en México eso es un aviso de privacidad simplificado. Cabe en dos renglones.

Ninguna de estas cosas la resuelve un panel de Cloudflare. Están aquí para que la mudanza no se lea como si las hubiera cerrado.