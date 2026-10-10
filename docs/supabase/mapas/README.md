# Mapas del código real (insumo de la migración a Supabase)

Escritos el 2026-10-10 leyendo el código del repositorio (solo lectura) antes de diseñar el esquema.
Son el «por qué» de `supabase/DISENO.md`: cada mapa describe lo que el código HACE hoy (con
`archivo:línea`), no lo que el plan dice que hace. **Son una fotografía de ese día**: si el código
cambia, las líneas se desplazan; para una decisión nueva, vuelve a verificar contra el código.

| Mapa | Tema |
|---|---|
| `00-critico.md` | Huecos y contradicciones entre mapas, código y plan; peligros por severidad; preguntas Q-01..Q-20 |
| `01-rutas-roles-seguridad.md` | Las 18 rutas del Apps Script, autenticación, roles, propiedades del script, /ia, /expandir |
| `02-ventas-dinero-formulas.md` | Hoja «Ventas» columna por columna, fórmulas al centavo, sellos por campo, casos borde |
| `03-almacen-catalogo-listas.md` | Almacén, catálogo y listas de compra: columnas, protocolo, idempotencia |
| `04-autorizaciones-sello-verificar.md` | El sello de autorización, el QR, /verificar y el ciclo solicitud → autorización → revocación |
| `05-cliente-puente-sellos.md` | `js/datos/puente.js`: mapeos, regla de sellos, protocolo pull/push |
| `06-cliente-db-sync-prefs.md` | IndexedDB, bandeja de salida, localStorage, empresa y rol |
| `07-cotizaciones-historial.md` | `al3d_historial`, la cola, estados de una cotización |
| `08-login-ia-csp-sw.md` | Inicio de sesión de Google, CSP de cada página, service worker, asistente de IA |
| `09-modelo-proyectos-instalaciones.md` | Proyecto, instalaciones, folios, ciclo de sincronización, qué ve cada rol |
| `10-pruebas-docs-privacidad.md` | Inventario de pruebas, docs a actualizar, privacidad |

Los mapas no contienen secretos ni valores de propiedades del script (el Client ID de Google que
aparece es público, ya está en `js/nucleo/ingreso.js`).
