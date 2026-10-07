# Instrucciones para Cowork: que la hoja tenga permiso de Drive

**Para quién:** Claude Cowork, en la computadora de Elías, en su Chrome con su sesión de Google.

**Contexto:** la hoja ya corre `puente-sheets-10` (Versión 12, 7 oct 2026, 13:25), pero Google no pidió
el permiso de Drive al publicar. Sin ese permiso, la plataforma no puede leer la carpeta «Trabajos
Pendientes» ni abrir carpetas nuevas. Google lo pide la primera vez que se ejecuta cualquier función
del script desde el editor.

## Esta vez SÍ se ejecuta una función, y solo esta

Elías autoriza ejecutar **una sola** función: **`hoy`**. Solo lee la fecha de hoy
(`Utilities.formatDate(new Date(), …)`): no escribe en ninguna celda, no toca pestañas, no manda
correos y no cambia nada en Drive. **Ninguna otra función.**

## Reglas

- No cambies el código, no guardes y no publiques nada. No hace falta una implementación nueva.
- No toques la hoja ni ninguna celda.
- **La pantalla de permisos de Google la acepta Elías**, no tú: cuando salga, detente y pídeselo.
- Si algo no coincide con lo que aquí se describe, detente y avísale a Elías.

## Pasos

1. Abre el editor del script de la hoja:
   https://script.google.com/u/0/home/projects/1hYImlywM9z9uqiBbdplX527zYqCEmcMXSjj6VR0fmB434HS1gY-4gcpi/edit
2. Comprueba que `var PUENTE_VERSION` diga `'puente-sheets-10'` (Ctrl+F). Si no, detente.
3. En la barra de arriba, junto al botón **Ejecutar**, está la lista desplegable de funciones.
   Elige **`hoy`**. Fíjate bien: tiene que decir exactamente `hoy`, no otra con nombre parecido.
4. Toca **Ejecutar**.
5. Va a salir «Se requiere autorización». **Detente** y dile a Elías:

   > Google pide permisos para el script de tu hoja. Haz esto:
   > 1. Toca **Revisar permisos**.
   > 2. Elige tu cuenta (la dueña de la hoja).
   > 3. Si sale «Google no ha verificado esta app», toca **Configuración avanzada** (abajo a la
   >    izquierda) y luego **Ir a Vistas - Finanzas AL3D (no seguro)**. Es tu propio script.
   > 4. En la lista de permisos debe aparecer **Google Drive**. Toca **Permitir**.

6. Cuando Elías termine, la función `hoy` se ejecuta sola. En el «Registro de ejecución» de abajo
   tiene que decir **«Ejecución completada»**.
   - Si **no** salió la pantalla de autorización y la ejecución se completó sin pedir nada, anótalo:
     quiere decir que el permiso ya estaba dado.
   - Si salió un error, copia el texto exacto del error.

## Avisar

Escribe el resultado en `C:\Users\elias\Git\cotizador-al3d\docs\RESULTADO-COWORK-PERMISO-DRIVE.md`:
- si salió la pantalla de autorización;
- si en la lista aparecía Google Drive y si Elías lo permitió;
- qué dijo el registro de ejecución.

Dile a Elías que ya puede avisarle a Claude Code para que compruebe las carpetas.
