/* ============================================================================
   A QUÉ SUPABASE HABLA LA APP — al proyecto de PRODUCCIÓN (desde el 2026-10-16).

   Solo se usa con el interruptor de Ajustes encendido (js/nucleo/supa.js); apagado, nadie lo lee.
   Encenderlo sigue siendo cosa de cada aparato y la hoja sigue mandando (docs/ESTADO-SUPABASE.md).

   Ninguna de las dos cosas es un secreto. La dirección del proyecto la ve cualquiera que abra la
   app, y la llave PÚBLICA («publishable», sb_publishable_…) está hecha para ir en el navegador:
   lo que protege los datos son las reglas de acceso de la base (RLS) y las funciones, no esta
   llave. La llave SECRETA (sb_secret_…) jamás va aquí ni en ningún archivo del repositorio.

   EL PROYECTO DE PRUEBAS (`al3d-pruebas`) sigue existiendo y se queda anotado abajo, pero la app
   publicada NO lo usa y no hay ningún botón para cambiarlo: un interruptor así en la pantalla
   sería una forma de mandar datos reales a la base de pruebas (o datos de prueba a la real) con
   un dedo. Para probar algo contra él, en una copia LOCAL de la app:
     1. cambia EN_USO a 'al3d-pruebas';
     2. cambia la dirección en el connect-src de la CSP de index.html (https y wss) por la suya;
     3. no lo publiques así: pruebas/supabase-entrada.mjs truena si EN_USO no es producción o si
        la CSP no coincide con el proyecto en uso.
   ============================================================================ */

const PROYECTOS = Object.freeze({
  'al3d-produccion': Object.freeze({
    proyecto: 'al3d-produccion',
    url: 'https://gwzfdprdrdudfakjsdxf.supabase.co',
    llave: 'sb_publishable__yKAsMzY5aar3i2oYmJtPA_uWcTWjed',
  }),
  'al3d-pruebas': Object.freeze({
    proyecto: 'al3d-pruebas',
    url: 'https://hhwjlxukuzxearrjurtc.supabase.co',
    llave: 'sb_publishable_0eDt3eXlQVT04oIN8htMmA_Gh7SZPuV',
  }),
});

/** El proyecto al que habla ESTA copia de la app. Lo publicado: 'al3d-produccion'. */
const EN_USO = 'al3d-produccion';

export const SUPABASE = PROYECTOS[EN_USO];
