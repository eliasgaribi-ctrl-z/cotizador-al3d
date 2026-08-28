# De dónde salieron estos dos archivos

    npm pack pdfjs-dist@4.10.38
    tar xzf pdfjs-dist-4.10.38.tgz
    cp package/legacy/build/pdf.min.mjs        vendor/pdfjs/pdf.min.mjs
    cp package/legacy/build/pdf.worker.min.mjs vendor/pdfjs/pdf.worker.min.mjs
    cp package/LICENSE                          vendor/PDFJS-LICENSE.txt

Apache 2.0, Mozilla Foundation. La licencia completa está en `vendor/PDFJS-LICENSE.txt`.

## Por qué están aquí y no en una CDN

Antes se bajaban de `cdnjs.cloudflare.com` en caliente, la primera vez que alguien abría un
PDF, desde cuatro líneas copiadas literal en dos sitios de `index.html`. Traerlos al
repositorio arregla tres cosas de una vez:

1. **La versión.** La que se cargaba era la **3.11.174**, anterior al parche de
   **CVE-2024-4367**: un PDF preparado podía ejecutar JavaScript arbitrario a través del
   renderizador de tipografías. Y aquí eso no es teórico — **los PDF los manda el cliente**,
   se abren en el escalador y en el vectorizador, y ese JavaScript correría en el origen de
   la app, donde están el historial, las API keys de IA y el token del puente.
2. **Sin señal.** El lector se descargaba en el momento, así que leer un PDF **no funcionaba
   sin conexión** y el propio mensaje de error lo admitía. Ahora es un archivo del sitio, y
   `/vendor/` va por el camino caché-primero del service worker: **la primera vez que alguien
   abre un PDF con señal, el lector se queda guardado** y a partir de ahí funciona sin ella.

   Con una salvedad dicha sin adornos: **no va en `APP_FILES`**, o sea que no se precarga al
   instalar y hay que volver a bajarlo después de cada subida de `APP_VERSION`. Es a
   propósito. `APP_FILES` se instala con `addAll`, que es todo-o-nada por diseño, y meter
   1.8 MB ahí significaría que cada instalación de la plataforma se juega su caché entera
   contra que esos dos archivos bajen completos — en la calle, con la señal de un taller. El
   lector es lo segundo; abrir la app sin señal es lo primero.
3. **La política de contenido.** Con esto, `cdnjs.cloudflare.com` salió de `script-src` en
   `_headers`. Un origen menos con permiso de ejecutar código en esta app, y era el único que
   no controlamos.

## Por qué la build `legacy` y no la normal

`pdfjs-dist` 4.x ya no publica UMD: todo es ESM. La carpeta `legacy/` es la misma biblioteca
compilada para navegadores más viejos, y aquí eso importa más que los kilobytes: la app se
abre desde iPhone y Android de gente que trabaja en la calle, no desde el navegador de un
escritorio recién actualizado.

## Al actualizar

Repite los comandos de arriba con la versión nueva y corre `pruebas/navegador/pdf.mjs`, que
abre un PDF de verdad y comprueba que se rasteriza. Si cambia la API de `getDocument`,
`getViewport` o `render`, esa prueba lo dice.
