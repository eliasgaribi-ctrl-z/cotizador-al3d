/* ============================================================================
   A QUÉ SUPABASE HABLA LA APP — por ahora, al proyecto de PRUEBAS.

   Solo se usa con el interruptor de Ajustes encendido (js/nucleo/supa.js); apagado, nadie lo lee.

   Ninguna de las dos cosas es un secreto. La dirección del proyecto la ve cualquiera que abra la
   app, y la llave PÚBLICA («publishable», sb_publishable_…) está hecha para ir en el navegador:
   lo que protege los datos son las reglas de acceso de la base (RLS) y las funciones, no esta
   llave. La llave SECRETA (sb_secret_…) jamás va aquí ni en ningún archivo del repositorio.

   Cuando exista el proyecto de producción, se cambia aquí (y su dirección en la CSP de index.html).
   ============================================================================ */

export const SUPABASE = Object.freeze({
  proyecto: 'al3d-pruebas',
  url: 'https://hhwjlxukuzxearrjurtc.supabase.co',
  llave: 'sb_publishable_0eDt3eXlQVT04oIN8htMmA_Gh7SZPuV',
});
