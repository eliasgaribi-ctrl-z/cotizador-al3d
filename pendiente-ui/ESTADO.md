# Paquete de UI (brief v3) — dónde se quedó y cómo seguir

Rama: `claude/cambios-paquetes-individuales-1itp1x`. Pausado el 27-sep-2026 para no agotar el uso semanal.
Esta carpeta es temporal: se borra al terminar el paquete (ver «Fase 4»).

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `paquete/` | El ZIP original: brief v3, las 153 fichas y las 8 páginas de muestras. |
| `CONVENCIONES.md` | La guía que siguen todos los agentes (reglas del repo, dónde va el CSS, cómo probar, cómo entregar y las decisiones ya tomadas). |
| `pantallas.json` | El reparto de la fase 2: 19 zonas, con sus fichas, sus archivos y su bloque de CSS. Cubre las 153 fichas. |
| `api/piezas-1..4.md` | La API de las piezas compartidas, escrita por los constructores. Es lo que leen los agentes de pantalla. |
| `parches-revision/*.patch` | Correcciones a medias de los revisores de la fase 1: SIN aplicar y SIN probar. |

## Decisiones tomadas por omisión (cambiables)

1. La excepción de $60,000 del anticipo se mide sobre el total que se cobra (con IVA si lleva).
2. El plazo del taller va en días de calendario (como `js/datos/taller.js`).
3. «Pagar estas» (comisiones) arma la lista para registrarla en Finanzas AL3D; no marca pagos.
4. La puerta de referencia del escalador se queda en 200 cm.
5. «Más» en la barra del teléfono concilia nombres con `RUTAS`.
6. La veta: con aluminio cepillado o MDF se pregunta y se quitan los giros de 90°.
7. El IVA por cuenta sale de `ivaDeCuenta` de la hoja; solo se avisa, nunca se cambia solo.

## Avance

| Fase | Estado |
|---|---|
| 0 · Preparación: `js/piezas.js`, bloques de CSS, guía y reparto | ✅ |
| 1 · Piezas compartidas (piezas 1–26 y los 6 patrones) | 🟡 construidas y fusionadas; falta la revisión |
| 2 · Las 19 zonas de pantalla (piezas 27–86, 153 fichas, 6 fallas, funciones 31, 32, 33, 53, 54) | ⬜ |
| 3 · Función 76 (propuesta con opciones) y revisión por zona | ⬜ |
| 4 · Documentación, conteos, `APP_VERSION`, pruebas completas, borrar esta carpeta, push | ⬜ |

### Fase 1, en detalle

Las cuatro secciones de `js/piezas.js` están construidas (commits `373987d`, `0e03f5b`, `4a827a0` y `facb0f7`) y fusionadas en la rama. Cada una trae su prueba de node (`pruebas/piezas-*.mjs`) y de navegador (`pruebas/navegador/piezas-*.mjs`). Las de node pasan todas.

| Sección | Qué trae | Cableado ya hecho |
|---|---|---|
| 1 · Avisos y botones | aviso con mecha, pausa, deslizar y pila (falla 2); botón que trabaja; deshacer en el botón; mantener para confirmar; palomita; sello y veredicto; copiar | Los dos `toast()` y los dos `copiarTexto()` ya usan la pieza |
| 2 · Hojas y transiciones | hoja que se cierra deslizando; transición/FLIP; tema en círculo; bordes que se desvanecen; desenfoque bajo el dock; renglón deslizable; entra/sale de lista; pliegues; páginas; silueta | Las dos hojas del teléfono y el botón de tema (`js/tema.js`) |
| 3 · Números y campos | total que rueda; diferencia en vivo; ficha que viaja; arrastrar la medida; opciones deslizantes; casillas de código; teléfono completo; medidores; deslizador con imanes | Solo la pieza (las pantallas la conectan en la fase 2) |
| 4 · Señalar y sellar | vistazo (popover); nombres con el dedo; neón; traza de pasos; riel; esquinas que señalan; carga con los azules del logo; letrero 3D; resaltar y fichas de filtro | Solo la pieza |

Arreglo al fusionar: la sección 4 usaba `P.plegar` (plegar acentos) y chocaba con el `P.plegar` de los pliegues de la sección 2. Ahora se llama `P.plegarTexto`.

## Cómo seguir

1. **Terminar la fase 1:** un revisor adversarial por sección que parta de la rama actual. Puede aplicar el parche de `parches-revision/` como punto de partida (`git apply --3way`), pero tiene que verificarlo, porque quedó a medias. Después, correr `pruebas/correr.sh --navegador` completa.
2. **Fase 2:** un agente por zona de `pantallas.json`, cada uno en su *worktree*, siguiendo `CONVENCIONES.md` y leyendo `api/`. Luego se fusionan las 19 ramas. Caben dos agentes a la vez por flujo en esta máquina de 4 CPU.
3. **Fase 3:** la función 76 y una revisión por zona sobre el resultado fusionado.
4. **Fase 4:** hay que actualizar `docs/SISTEMA-DE-DISENO.md` (una sección de piezas), `docs/FUNCIONES.md`, los conteos del README (`pruebas/publicacion.mjs` dice cuáles) y subir `APP_VERSION` en `sw.js`. Después se borra esta carpeta y se hace el push.
