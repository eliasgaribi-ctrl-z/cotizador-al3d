# Hallazgo de Cowork — 7 oct 2026: la hoja NO está en puente-sheets-9

Cowork siguió COWORK-PUENTE-10.md y se detuvo en el Paso 0. No cambió nada en la hoja (ni respaldo, ni código, ni implementación).

## Lo que vio (solo lectura)
- Proyecto Apps Script de la hoja: «Vistas - Finanzas AL3D (seguro de re-ejecutar)»
  https://script.google.com/u/0/home/projects/1hYImlywM9z9uqiBbdplX527zYqCEmcMXSjj6VR0fmB434HS1gY-4gcpi/edit
- Un solo archivo: Código.gs, 4,361 líneas (~225 KB).
- `var PUENTE_VERSION = 'puente-sheets-7';`  (el archivo exige 9)
- Existen: `function doPost`, `function responder`, `function conCandado`.
- NO existen: `jalar_almacen`, `rutaJalarAlmacen_` (ancla del Cambio B), ni `rutaCarpetas_`.
  Es decir, faltan las versiones 8 y 9 (al menos la ruta jalar_almacen) y la 10.

## Qué le toca a Claude Code
1. Fusionar a mano el código de puente-sheets-8, -9 y -10 sobre el Código.gs vivo (no reemplazar entero: la hoja tiene cosas que no están en el repo).
2. Entregar a Cowork instrucciones nuevas (tipo COWORK-PUENTE-10.md) con los cambios exactos contra la versión 7, empezando por el respaldo de Código.gs al Escritorio.
3. Después Cowork las aplica en el Chrome de Elías, con las mismas reglas (no correr funciones, no tocar celdas, Elías acepta el permiso de Drive, misma URL de implementación AKfycbwY6qs…).
