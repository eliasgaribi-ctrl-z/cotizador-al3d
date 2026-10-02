/* El Worker `puente-al3d` está retirado: el puente se mudó a la hoja de Google
   (puente/hoja-apps-script.gs). Esto es lo único que queda publicado en Cloudflare, para que
   el build conectado al repositorio pase y para que la dirección vieja diga qué pasó en vez
   de seguir hablando con Notion. Ver puente/wrangler.jsonc. */
export default {
  fetch() {
    return new Response('El puente de AL3D ya no vive aquí: ahora va por la hoja de Google.\n', {
      status: 410,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
    });
  },
};
