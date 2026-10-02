# Publicaciones

Plantillas de marca para redes sociales de AL3D: eliges un diseño, cambias textos y fotos
encima de la publicación y la bajas lista para subir. Vive en la plataforma como
**Publicaciones** (`./#/publicaciones`) y también se abre suelta en `publicaciones/`.

| Archivo | Qué es |
|---|---|
| `index.html` · `js/editor.js` | El editor visual |
| `motor.html` · `js/motor.js` | El generador por lotes, para automatizar |
| `js/plantillas.js` | Lo que comparten los dos: cargar, llenar, PNG y video |
| `js/previo.js` | Lo que corre antes de pintar: la puerta, `empotrado` y `arrancando` |
| `automatizacion/plantillas.json` | Las 554 plantillas (HTML + campos) y sus `@keyframes` |
| `fuentes/` | Plus Jakarta Sans y Figtree, para que el PNG salga con la letra de la marca aun sin señal |
| `CLAUDE.md` | Cómo se agrega una plantilla |

La imagen la saca `vendor/html-to-image.js` (MIT, versión 1.11.11, copiada del paquete de npm).

## Descargar
- **Imagen:** *Descargar PNG*, al tamaño real (1080×1080, 1080×1440, 1080×1350, 1080×1920 o 851×315).
- **Video:** en las plantillas de video, *Descargar video (6 s)*: 1080×1920 a 24 cuadros, en `.webm` (Chrome o Edge en la computadora). El mismo botón lo cancela.
  - *Fondo verde*: para encimar la plantilla sobre tu grabación en CapCut o Premiere (Chroma key).
  - ¿MP4? `ffmpeg -i video.webm -c:v libx264 -pix_fmt yuv420p video.mp4`, o conviértelo en CapCut.
- **Mi lista:** guarda piezas para bajarlas juntas. Vive en este aparato; con muchas fotos se llena.

## Automatizar
```json
[{ "nombre": "lunes", "plantilla": "P01@3x4",
   "campos": { "titulo": "Texto", "texto": "Línea 1\nLínea 2" },
   "fotos": ["automatizacion/foto.jpg"] }]
```
- `motor.html?contenido=automatizacion/mi-semana.json` carga y pinta todo.
- Desde código (Playwright): `await window.AL3D.listo` y luego `await window.AL3D.png(pieza)`, que devuelve el PNG en data URL.
- El contenido y las fotos tienen que estar **en este mismo sitio** (o ir en `data:`): la página no lee de otros servidores.
