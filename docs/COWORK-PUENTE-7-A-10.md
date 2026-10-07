# Instrucciones para Cowork: pasar el puente de la hoja de `puente-sheets-7` a `puente-sheets-10`

**Reemplaza a `COWORK-PUENTE-10.md`**, que suponía que la hoja estaba en la 9. Cowork la encontró en la 7
(`HALLAZGO-COWORK-PUENTE-7.md`).

**Para quién:** Claude Cowork, en la computadora de Elías, en su Chrome con su sesión de Google.

## Por qué esta vez se pega el archivo completo

Claude Code comparó el `Código.gs` que corre en la hoja (7 oct 2026, 4,361 líneas, `puente-sheets-7`)
contra el historial del repositorio. **Es idéntico, línea por línea, a la versión del repositorio del
29 de septiembre** (commit `f64a859`). La hoja no tiene nada propio que se pueda perder. Por eso
el archivo del repositorio, que ya trae las versiones 8, 9 y 10 encima de esa misma base, se puede
pegar **entero** en lugar del que hay.

La condición es que la hoja siga exactamente como estaba. Por eso el Paso 0 lo vuelve a revisar.

## Reglas

- **No corras ninguna función** del editor ni ninguna opción del menú ⚡ AL3D de la hoja.
- **No toques las pestañas de la hoja** ni ninguna celda.
- **La pantalla de permisos de Google la acepta Elías**, no tú. Cuando aparezca, detente y pídeselo.
- Si algo no coincide con lo que aquí se describe, **detente y avísale a Elías** sin cambiar nada.

## Paso 0 · Confirmar que la hoja sigue igual

1. Abre el proyecto de Apps Script de la hoja:
   https://script.google.com/u/0/home/projects/1hYImlywM9z9uqiBbdplX527zYqCEmcMXSjj6VR0fmB434HS1gY-4gcpi/edit
2. Tiene que haber **un solo archivo**, `Código.gs`.
3. Ctrl+F `var PUENTE_VERSION` → tiene que decir `'puente-sheets-7'`.
4. Ve a la última línea (Ctrl+End): tiene que ser la **4,361** (o 4,360 si la última está vacía).

Si alguna de las cuatro no se cumple, **detente**. Dile a Elías lo que viste y que se lo pase a
Claude Code.

## Paso 1 · Respaldo

En `Código.gs`: clic dentro del código, Ctrl+A, Ctrl+C. Pégalo en un archivo de texto nuevo en el
**Escritorio** llamado `Codigo-respaldo-puente-7.gs` y guárdalo. Si algo sale mal, ese archivo
regresa todo a como estaba.

## Paso 2 · Pegar la versión 10

1. En la computadora, abre con el **Bloc de notas** el archivo:
   `C:\Users\elias\Git\cotizador-al3d\puente\hoja-apps-script.gs`
2. Comprueba que tenga **5,299 líneas** y que la línea con `var PUENTE_VERSION` diga
   `'puente-sheets-10'`. Si no, detente.
3. En el Bloc de notas: Ctrl+A, Ctrl+C.
4. En el editor de Apps Script, en `Código.gs`: clic dentro del código, **Ctrl+A** y luego **Ctrl+V**.
   Tiene que reemplazar todo, no agregarse al final.
5. Comprueba:
   - la primera línea es igual a la primera del archivo del Bloc de notas;
   - la última línea es la **5,299** (o una más, si quedó una vacía);
   - `var PUENTE_VERSION` dice `'puente-sheets-10'`;
   - existe una sola vez `function doPost` (Ctrl+F: «1 de 1»).
6. **Guarda** (Ctrl+S, o el ícono del disquete). Si el editor marca un error de sintaxis, pega el
   respaldo del paso 1, guarda y avísale a Elías.

## Paso 3 · Publicar la versión nueva (la misma URL)

1. **Implementar → Gestionar implementaciones**.
2. En la implementación que ya existe (tipo «Aplicación web»), el **lápiz** para editar.
3. **Versión: Nueva versión** → **Implementar**.
4. **No uses «Nueva implementación»**: eso crea otra URL y los teléfonos se quedan en la vieja.
5. Google va a pedir **autorizar el acceso**, ahora con permiso de **Google Drive**. **Detente** y dile
   a Elías: «Google pide permiso de Drive para la hoja. Elige tu cuenta y dale Permitir». Si sale
   «Google no verificó esta app», él toca **Configuración avanzada → Ir a … (no seguro)**: es su
   propio script.
6. Comprueba que la URL de la aplicación web siga siendo
   `https://script.google.com/macros/s/AKfycbwY6qsBGs1dt17ORGo7dc7YkJr3k_9M-6iVS82gu2NikL81qU6WTunwp84IHFXPOQyqLQ/exec`.

No hace falta correr nada del menú. Las pestañas nuevas del almacén («Almacén», «Catálogo de
material», «Listas de compra») y la columna «Renglones» de «Autorizaciones» se crean solas la
primera vez que se usan.

## Paso 4 · Avisar

Dile a Elías:
- que la hoja pasó de la 7 a la 10;
- que el respaldo quedó en el Escritorio;
- si Google pidió el permiso de Drive y si él lo aceptó.

Con eso terminas. La comprobación de que la plataforma ya ve las carpetas la hace Claude Code.
