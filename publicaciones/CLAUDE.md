# Guía para crear plantillas AL3D (para Claude Code)

Este repositorio es un editor estático (sin build). Las plantillas viven en `automatizacion/plantillas.json` y el editor (`index.html`) las lee al cargar.

## Estructura de una plantilla
```json
{
  "id": "P117@1x1",            // prefijo + número + @formato
  "tipo": "post",              // post | carrusel | historia | video | portada | perfil
  "nombre": "Nombre corto",
  "ancho": 1080, "alto": 1080, // tamaño real de exportación
  "vista": [360, 360],         // tamaño en que está dibujado el HTML
  "escala": 3,                 // ancho / vista[0]
  "campos": { "titulo": "Texto de ejemplo" },
  "fotos": 1,
  "html": "<div style=\"width:360px;height:360px;position:relative;overflow:hidden;background:#fff\">…</div>"
}
```
Prefijos y vistas: post `P` (1x1 360×360, 3x4 360×480, 4x5 360×450) · carrusel `C` 360×360 · historia `H` 270×480 · video `V` 360×640 · portada `F` 709×262 · perfil `PF` 200×200. Usa el siguiente número libre de cada prefijo.

## Reglas del HTML
- Un solo `<div>` raíz con `position:relative; overflow:hidden` y el tamaño de `vista`.
- Solo estilos en línea, con posiciones absolutas dentro de la raíz.
- Cada texto editable lleva `data-slot="nombre"`, y su nombre debe estar en `campos`. Nombres preferidos: titulo, texto, boton, etiqueta, cliente, ciudad, telefono, correo, cita, autor, pregunta, respuesta, cifra, pagina. No dejes texto sin `data-slot`.
- Cada recuadro de foto lleva `data-foto="1"`, `"2"`…; el total va en `fotos`.
- Logos: `assets/logos/c1l.png` (a color, sobre fondos claros), `assets/logos/c1d.png` (blanco, sobre fondos oscuros), `assets/logos/c1i.png` (isotipo blanco).
- Historias y videos: nada de texto ni logo en el 14 % superior ni en el 20 % inferior.
- Videos: animaciones con `animation:` en línea que usen `@keyframes` definidos en `keyframes` (raíz del JSON), en ciclos de 6 s. Si agregas un keyframe nuevo, añádelo a ese campo.

## Marca
- Colores: índigo #3320FF · azul #4267FE · cielo #8CA2FF · marino #001A5C · tinta #14213D · gris #5B6785 · niebla #F2F6FF · borde #E3E9F7. Degradado de fondo: `linear-gradient(165deg,#3A2CFF,#4B5FFF)`.
- Tipografía: Plus Jakarta Sans 700/800 para titulares (letter-spacing −3 % a −4.5 %), Figtree 300/400/600 para textos.
- Recursos propios: bloque marino con esquina blanca en diagonal, barra de 56×4 px bajo títulos y botón blanco o índigo con radio de 4 px.
- Tono: tutea, frases cortas, sin emoji, titulares de máximo 7 palabras, cierre con acción.
- Teléfono: 33 2813 0092 · hola@anunciosluminosos3d.com.mx · Naranjos 648, Linda Vista, Zapopan, Jal.

## Antes de terminar
1. Valida que el JSON parsee y que cada `data-slot` y `data-foto` coincida con `campos` y `fotos`.
2. Revisa que ningún texto se encime con otro ni con el logo, y que nada se salga de la raíz.
3. No repitas composiciones que ya existan; revisa los `nombre` actuales.

## Dentro del repositorio del cotizador
Esta carpeta ya no es un sitio aparte: es el apartado **Publicaciones** de la plataforma (`./#/publicaciones`), empotrado como la Mesa de corte (ver `js/mod/herramientas.js`).
- El marcado de las plantillas se pinta con `innerHTML`: nada de `<script>`, manejadores `on…=` ni URLs de otro sitio. La política de la página (CSP) no los deja correr ni cargar, y `pruebas/publicaciones.mjs` lo revisa.
- Solo las tipografías de `fuentes/` (Plus Jakarta Sans y Figtree). Otra familia no va a salir en el PNG.
- Al cambiar `plantillas.json` —o cualquier archivo de esta carpeta— sube `APP_VERSION` en `sw.js`; si no, los teléfonos siguen con las plantillas viejas.
- Corre `node pruebas/publicaciones.mjs` antes de terminar.
