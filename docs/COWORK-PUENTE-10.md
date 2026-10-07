# Instrucciones para Cowork: poner el puente de la hoja en `puente-sheets-10`

> **Ya no se usa:** la hoja resultó estar en `puente-sheets-7`, no en la 9. Las instrucciones buenas son [COWORK-PUENTE-7-A-10.md](COWORK-PUENTE-7-A-10.md).

**Para quién:** Claude Cowork, actuando en la computadora de Elías, en su Chrome con su sesión de Google.
**Qué se logra:** que la hoja «Finanzas AL3D — Ventas y Comisiones» pueda leer la carpeta de Drive
«Trabajos Pendientes» y abrirle carpeta a los proyectos en fabricación que no tienen una.

**La hoja:** https://docs.google.com/spreadsheets/d/1tTU_FXBlvl29diKaXQjSkxq3J9bWcQE6dx9xPSKKjHs/edit

## Reglas (léelas antes de empezar)

- **No reemplaces el código entero.** El `Código.gs` de la hoja tiene cosas que no están en ningún
  otro lado. Solo se hacen los **tres cambios** de abajo, con buscar y pegar.
- **No corras ninguna función** del editor ni ninguna opción del menú ⚡ AL3D de la hoja.
- **No toques las pestañas de la hoja** ni ninguna celda.
- **La pantalla de permisos de Google la acepta Elías**, no tú. Cuando aparezca, detente y pídeselo.
- Si algo no se parece a lo que aquí se describe, **detente y avísale a Elías** sin cambiar nada.

## Paso 0 · Revisar qué versión tiene la hoja

1. Abre la hoja → menú **Extensiones → Apps Script**.
2. En `Código.gs`, busca (Ctrl+F) `var PUENTE_VERSION`.
3. Según lo que diga:
   - `'puente-sheets-9'` → sigue con el paso 1.
   - `'puente-sheets-10'` → ya está hecho. Avísale a Elías y termina.
   - **Cualquier otra cosa** (8, 7…) → **detente.** Dile a Elías: «La hoja está en <la versión
     que viste>. Hay que fusionar el código a mano; pídeselo a Claude Code». No cambies nada.

## Paso 1 · Respaldo

Copia **todo** el contenido de `Código.gs` (Ctrl+A, Ctrl+C) y guárdalo en un archivo de texto en
el Escritorio llamado `Codigo-respaldo-<fecha de hoy>.gs`. Si algo sale mal, ese archivo regresa
todo a como estaba.

## Paso 2 · Los tres cambios

**Cambio A. La versión.** Cambia esta línea:

```
var PUENTE_VERSION = 'puente-sheets-9';
```

por esta:

```
var PUENTE_VERSION = 'puente-sheets-10';
```

**Cambio B. Los dos caminos nuevos.** Busca esta línea (está dentro de `function doPost`):

```
    if (ruta === 'jalar_almacen')   return responder(rutaJalarAlmacen_(cuerpo, rol));
```

y **justo debajo** pega estas dos líneas, con la misma sangría:

```
    if (ruta === 'carpetas')        return responder(rutaCarpetas_());
    if (ruta === 'crear_carpeta')   return responder(rutaCrearCarpeta_(cuerpo, rol));
```

**Cambio C. El bloque nuevo.** Ve al **final** de `Código.gs`, después de la última línea, deja una
línea en blanco y pega este bloque completo, sin cambiarle nada:

```javascript
/* =========================================================================================
   LA CARPETA DE LOS DISEÑOS — /carpetas (puente-sheets-10)

   Elías sube los diseños de cada trabajo a «Trabajos Pendientes», una carpeta de Drive con una
   subcarpeta por venta («Diego - Herrajes Innova 2», «José - Kelvarion»…): el .cdr con las
   escalas, sus copias de seguridad y el PDF de órdenes de fabricación. La plataforma los enseña
   en la ficha del proyecto, y quien está en el taller los abre sin pedirlos por WhatsApp.

   Va por aquí y no desde el teléfono porque este script ya corre con la cuenta dueña de la hoja,
   que ve la carpeta. Desde el navegador haría falta pedirle a cada persona el permiso de Drive,
   que Google cuenta como sensible —pantalla de «app no verificada»—. Aquí se pide UNA vez, al
   pegar esta versión.

   /carpetas solo LEE: nombres, ligas y fechas, nunca el contenido de un archivo. No hay dinero
   en ella, así que contesta igual a los tres roles. /crear_carpeta es lo único que escribe, y
   solo crea —nunca mueve, renombra ni borra—: una subcarpeta vacía con el nombre del proyecto,
   y solo si Dirección la pide. Quien abre una liga necesita,
   además, que la carpeta esté compartida con su cuenta: eso lo decide Drive, no este puente.

   Se guarda cinco minutos en la caché del script: la ficha se abre seguido y recorrer Drive
   cuesta segundos. Una carpeta nueva aparece a más tardar en cinco minutos.
   ========================================================================================= */
var CARPETA_TRABAJOS = '1XfM5KMFn5p87LI_W-IglmflaZcs3y_wB';   // «Trabajos Pendientes»
var CARPETAS_CACHE = 'carpetas-trabajos-v1';
var CARPETAS_MAX = 150;         // subcarpetas
var ARCHIVOS_MAX = 60;          // archivos por subcarpeta

function rutaCarpetas_() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (_) { cache = null; }
  var guardado = cache ? cache.get(CARPETAS_CACHE) : null;
  if (guardado) { try { return JSON.parse(guardado); } catch (_) { /* se vuelve a leer */ } }

  var raiz;
  try { raiz = DriveApp.getFolderById(CARPETA_TRABAJOS); }
  catch (err) {
    return { ok: false, codigo: 'NO_ENCONTRADO',
      mensaje: 'La hoja no alcanza la carpeta «Trabajos Pendientes» de Drive. Tiene que estar compartida con la cuenta dueña de la hoja.' };
  }
  var carpetas = [];
  var it = raiz.getFolders();
  while (it.hasNext() && carpetas.length < CARPETAS_MAX) {
    var c = it.next();
    carpetas.push({ id: c.getId(), nombre: c.getName(), url: c.getUrl(),
                    modificado: c.getLastUpdated().getTime(), archivos: archivosDeCarpeta_(c) });
  }
  var out = { ok: true, ts: Date.now(), raiz: raiz.getUrl(), carpetas: carpetas };
  /* La caché guarda hasta 100 KB por llave; si no cabe, se contesta igual sin guardarla. */
  try { if (cache) cache.put(CARPETAS_CACHE, JSON.stringify(out), 300); } catch (_) {}
  return out;
}

function archivosDeCarpeta_(carpeta) {
  var lista = [];
  var it = carpeta.getFiles();
  while (it.hasNext() && lista.length < ARCHIVOS_MAX) {
    var f = it.next();
    lista.push({ nombre: f.getName(), url: f.getUrl(), tipo: f.getMimeType(),
                 modificado: f.getLastUpdated().getTime() });
  }
  return lista;
}

/* ---------------------------------------------------------------- /crear_carpeta
   La carpeta del proyecto en fabricación que no tiene una. La pide el teléfono de Dirección al
   sincronizar (js/datos/carpetas.js, `alDia`), con el nombre del proyecto: «Contacto - Negocio».
   Bajo el candado y comparando el nombre sin acentos ni mayúsculas, para que dos teléfonos que la
   pidan a la vez no hagan dos: si ya hay una que se llama igual, devuelve ésa. */
function nombreDeCarpeta_(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rutaCrearCarpeta_(cuerpo, rol) {
  if (rol !== 'direccion') return { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Las carpetas nuevas las abre el teléfono de Dirección.' };
  var nombre = String((cuerpo && cuerpo.nombre) || '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nombre || nombre.length > 120) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Falta el nombre de la carpeta, o es demasiado largo.' };
  var raiz;
  try { raiz = DriveApp.getFolderById(CARPETA_TRABAJOS); }
  catch (err) { return { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'La hoja no alcanza la carpeta «Trabajos Pendientes» de Drive.' }; }
  return conCandado(function () {
    var buscado = nombreDeCarpeta_(nombre);
    var it = raiz.getFolders();
    while (it.hasNext()) {
      var c = it.next();
      if (nombreDeCarpeta_(c.getName()) === buscado) {
        return { ok: true, creada: false, carpeta: { id: c.getId(), nombre: c.getName(), url: c.getUrl(), modificado: c.getLastUpdated().getTime(), archivos: archivosDeCarpeta_(c) } };
      }
    }
    var nueva = raiz.createFolder(nombre);
    try { CacheService.getScriptCache().remove(CARPETAS_CACHE); } catch (_) {}
    return { ok: true, creada: true, carpeta: { id: nueva.getId(), nombre: nueva.getName(), url: nueva.getUrl(), modificado: Date.now(), archivos: [] } };
  });
}
```

Luego **guarda** (Ctrl+S). Si el editor marca un error de sintaxis, deshaz con el respaldo del
paso 1 y avísale a Elías.

## Paso 3 · Publicar la versión nueva (la misma URL)

1. Botón **Implementar → Gestionar implementaciones**.
2. En la implementación que ya existe (tipo «Aplicación web»), el **lápiz** para editar.
3. **Versión: Nueva versión** → **Implementar**.
4. **No uses «Nueva implementación»**: eso crea otra URL y los teléfonos se quedan en la vieja.
5. Si Google pide **autorizar el acceso** (va a pedir permiso de **Google Drive**): **detente** y
   dile a Elías «Google pide permiso de Drive para la hoja. Elige tu cuenta y dale Permitir».
   Si sale «Google no verificó esta app», él toca **Configuración avanzada → Ir a … (no seguro)**:
   es su propio script.
6. Comprueba que la URL de la aplicación web que se ve al final **termina igual** que antes y que
   empieza con `https://script.google.com/macros/s/AKfycbwY6qsBGs1dt17ORGo7dc7YkJr3k_9M-6iVS82gu2NikL81qU6WTunwp84IHFXPOQyqLQ/exec`.

## Paso 4 · Avisar

Dile a Elías qué versión tenía la hoja, que el respaldo quedó en el Escritorio y si Google pidió el
permiso de Drive y él lo aceptó. Con eso termina. La comprobación de que la plataforma ya ve las
carpetas la hace Claude Code.
