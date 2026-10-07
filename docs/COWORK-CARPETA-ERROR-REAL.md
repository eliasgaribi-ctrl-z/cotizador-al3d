# Instrucciones para Cowork: que la hoja diga por qué no alcanza «Trabajos Pendientes»

**Para quién:** Claude Cowork, en la computadora de Elías, en su Chrome con su sesión de Google.

**Contexto:** la hoja ya corre `puente-sheets-10` (Versión 12, 7 oct 2026) y tiene el permiso de
Drive, pero contesta «La hoja no alcanza la carpeta Trabajos Pendientes» sin decir por qué. La
carpeta es de otra cuenta («Constru Imagen GG») y está compartida con Elías. Esta versión del código:

- dice el error exacto de Google (en la respuesta y en «Ejecuciones»);
- si Google no da la carpeta por su id, la busca por su nombre entre lo que la cuenta ve.

Es el mismo procedimiento que ya hiciste (`COWORK-PUENTE-7-A-10.md`): pegar el archivo entero y
publicar una versión nueva en la misma implementación.

## Reglas

- **No corras ninguna función** del editor ni ninguna opción del menú ⚡ AL3D.
- **No toques la hoja** ni ninguna celda.
- Si sale una pantalla de permisos de Google, **detente**: la acepta Elías.
- Si algo no coincide con lo que aquí se describe, detente y avísale a Elías sin cambiar nada.

## Paso 0 · Confirmar que la hoja sigue como la dejaste

1. Abre el editor: https://script.google.com/u/0/home/projects/1hYImlywM9z9uqiBbdplX527zYqCEmcMXSjj6VR0fmB434HS1gY-4gcpi/edit
2. Un solo archivo, `Código.gs`, con `var PUENTE_VERSION = 'puente-sheets-10';` y **5,300 líneas**
   (5,299 + una vacía). Debe ser idéntico a lo que pegaste a las 13:22 (sha1 `c703aff2…`).

Si no coincide, detente y avísale a Elías.

## Paso 1 · Respaldo

Copia todo `Código.gs` a `Descargas\Codigo-respaldo-puente-10-v12.gs`.

## Paso 2 · Pegar la versión nueva

1. Abre con el Bloc de notas `C:\Users\elias\Git\cotizador-al3d\puente\hoja-apps-script.gs`.
2. Comprueba: **5,322 líneas**, `var PUENTE_VERSION = 'puente-sheets-10';`, y que contenga
   `function carpetaDeTrabajos_()`. Su sha1 es `f281042e0b6482796d60ce88c320159b2b6ed29a`.
3. Ctrl+A, Ctrl+C en el Bloc de notas → en el editor, clic dentro del código, Ctrl+A, Ctrl+V.
4. Comprueba que el editor tenga lo mismo (5,322 líneas, o 5,323 con una vacía al final; una sola
   `function doPost`; existe `function carpetaDeTrabajos_`). **Guarda** (Ctrl+S).
5. Si el editor marca un error de sintaxis, pega el respaldo del paso 1, guarda y avísale a Elías.

## Paso 3 · Publicar en la misma implementación

1. **Implementar → Gestionar implementaciones** → lápiz en la implementación que ya existe.
2. **Versión: Nueva versión**, descripción «puente-sheets-10: dice por qué no alcanza la carpeta»
   → **Implementar**. **No** uses «Nueva implementación».
3. La URL tiene que seguir siendo
   `https://script.google.com/macros/s/AKfycbwY6qsBGs1dt17ORGo7dc7YkJr3k_9M-6iVS82gu2NikL81qU6WTunwp84IHFXPOQyqLQ/exec`.

## Paso 4 · Avisar

Escribe en `C:\Users\elias\Git\cotizador-al3d\docs\RESULTADO-COWORK-CARPETA-ERROR-REAL.md` qué
versión quedó publicada y a qué hora, y dile a Elías que ya le puede avisar a Claude Code.
