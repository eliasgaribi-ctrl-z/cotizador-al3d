/* ============================================================================
   Los conjuntos de carrusel — qué láminas van juntas y en qué orden.

   Las plantillas de carrusel (C01…C116) son láminas sueltas en `plantillas.json`: nada decía
   cuáles forman una misma publicación, y había que bajarlas de una en una adivinando el orden
   (Elías, octubre de 2026). Esta tabla lo dice. Se escribió leyendo las propias láminas —el
   «3 / 12» de su pie, el tema de cada serie— y el orden de `ids` es el orden en que se suben.

   Lo que no forma serie (estilos sueltos para armar un carrusel a mano) va en «Láminas sueltas»,
   que se ve agrupado pero no se baja como conjunto: no es una publicación.
   La prueba (pruebas/publicaciones.mjs) revisa que cada id exista y sea de carrusel.
   ============================================================================ */

const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'C' + String(a + i).padStart(2, '0') + '@1x1');

export const SERIES = [
  { id: 'asi-trabajamos',     nombre: 'Así trabajamos',              ids: rango(1, 12) },
  { id: 'caso-de-proyecto',   nombre: 'Caso de proyecto',            ids: rango(13, 24) },
  { id: 'guia-en-diez',       nombre: 'Guía en diez láminas',        ids: rango(25, 34) },
  { id: 'como-elegir',        nombre: 'Cómo elegir tu anuncio',      ids: rango(49, 58) },
  { id: 'antes-de-cotizar',   nombre: 'Antes de cotizar',            ids: rango(59, 68) },
  { id: 'preguntas',          nombre: 'Preguntas frecuentes',        ids: rango(69, 78) },
  { id: 'guia-negocios',      nombre: 'Guía para negocios',          ids: rango(79, 88) },
  { id: 'renueva-tu-imagen',  nombre: 'Renueva tu imagen',           ids: rango(89, 96) },
  { id: 'panorama',           nombre: 'Panorama (una foto en tres)', ids: rango(97, 99) },
  { id: 'guia-corta',         nombre: 'Guía corta',                  ids: rango(100, 102) },
  { id: 'linea-continua',     nombre: 'Línea continua',              ids: rango(103, 105) },
  { id: 'antes-y-despues',    nombre: 'Antes y después',             ids: rango(106, 107) },
  { id: 'pregunta-respuesta', nombre: 'Pregunta y respuesta',        ids: rango(108, 109) },
];

/* Las que no son serie: se enseñan juntas, al final, sin «Descargar conjunto». */
export const SUELTAS = { id: 'sueltas', nombre: 'Láminas sueltas', ids: rango(35, 48).concat(rango(110, 116)), suelta: true };

const _porId = new Map();
for (const s of SERIES) s.ids.forEach((id, i) => _porId.set(id, { serie: s, orden: i }));

/** La serie de una lámina y su lugar en ella, o null. */
export const serieDe = id => _porId.get(id) || null;

/** «Caso de proyecto» → «caso-de-proyecto»: el nombre del .zip y de su carpeta. */
export const slug = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carrusel';
