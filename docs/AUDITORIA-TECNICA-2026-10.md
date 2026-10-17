# Auditoría técnica — 17 de octubre de 2026

Estabilidad, precisión del dinero, seguridad, pruebas y dependencias (los seis pilares que
pidió Elías). Tres revisores leyeron el repositorio completo; los hallazgos de peso se
confirmaron leyendo el código. Lo de interfaz no se repite aquí: está en
[`AUDITORIA-COMPLETA-2026-10.md`](AUDITORIA-COMPLETA-2026-10.md) y
[`REVISION-UIUX-2026-10.md`](REVISION-UIUX-2026-10.md).

**Veredicto: ningún hallazgo crítico.** No hay secretos en el árbol ni en las 703 entradas del
historial: lo que parece una llave son valores de prueba marcados como falsos o llaves públicas
por diseño (la publicable de Supabase, el ID de cliente de Google, la de sitio de Turnstile). El
dinero se redondea en un solo lugar y pantalla, PDF, WhatsApp, hoja y sello usan el mismo total,
con una prueba que compara el precio del teléfono contra el del servidor en 2 000 partidas al
azar. Las 17 tablas de Supabase tienen RLS y se escriben solo por RPC. El HTML se escapa de forma
consistente y todo lo que se escribe en la hoja va protegido contra fórmulas.

## Lo que se arregló

| # | Hallazgo | Arreglo |
|---|---|---|
| M2 | El anticipo escrito a mano podía salir **mayor que el total** en el PDF, el WhatsApp y Canva («Anticipo $10,000 · Resta $0» sobre $8,000) | `anticipoDelPapel()` en `js/cotizador/entrega.js` lo acota al imprimir y `avisarAnticipoDeMas()` se lo dice al vendedor. La pantalla sigue sin acotarlo a propósito (`proceso.js`). Prueba: `cot-entrega.mjs` 1c |
| M3 | `/solicitar` y `/autorizar` aceptaban medidas que no son número o son negativas: «abc» volvía NaN el subtotal y `Math.abs(NaN - x) > 0.01` es falso, así que pasaba el cuadre | `limpiarCotizacion` (hoja y `supabase/functions/_shared/precio.js`) rechaza número inválido o negativo; el cuadre exige subtotal finito. Prueba: `supabase-autorizar.mjs` |
| M4 | Si `arrancar()` lanzaba después de la puerta, quedaba un rechazo sin manejar y ocho segundos de esqueleto girando | `js/app.js`: el aviso con «Recargar» sale en cuanto falla |
| M5 | `fetch` sin tope: Nominatim corre en una cola en serie y una petición colgada frenaba todas las búsquedas siguientes; Calendar y `userinfo` igual | `conTope()` (`AbortSignal.timeout`) en `geo.js` (12 s), `gcal.js` (30 s) e `ingreso.js` (10 s). En `pedir()` del puente el reloj ahora cubre también la lectura del cuerpo |
| M8 | Publicar sin subir `APP_VERSION` deja los teléfonos instalados con el código viejo (el service worker sirve caché primero) | `pruebas/publicacion.mjs` falla si cambió un archivo de `APP_FILES` y la versión no subió; CI baja la historia para poder comparar |

**Descartado (falso positivo):** «Registrar venta» desde un teléfono que entró solo con Google.
`puenteCfg()` en `venta.js` exige token, pero sin él la venta queda en el buzón
`al3d_pf_ganadas`, la plataforma lo convierte en proyecto y lo sube a la hoja con la identidad de
Google; el aviso que se ve es el verde.

## Lo que queda abierto

| # | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| M6 | Medio | El CSP del cotizador permite `script-src 'unsafe-inline'` y todo cdnjs; comparte origen con la plataforma y los tokens de Google y del puente viven en `localStorage`. Hoy no hay XSS, pero uno futuro los alcanzaría. Arreglo: los ~135 `onclick=` a delegación y pdf.js por ruta exacta | `cotizador.html:10`, `nucleo/ingreso.js` |
| M7 | Medio | Tokens de dispositivo: uno por rol, compartido, sin caducidad. Un teléfono robado no se revoca solo | `hoja-apps-script.gs` (emisión de `PUENTE_TOKENS`) |
| M9 | Medio | Las 45 pruebas de navegador (PDF, service worker) no corren en CI | `.github/workflows/pruebas.yml` |
| B1 | Bajo | Un precio autorizado inalcanzable por subtotal × 1.16 (p. ej. 11,600.04) deja 1 centavo de saldo en la hoja | `historial.js`, `notario.js` |
| B2 | Bajo | `lineTotal` redondea 973.845 a 973.84 (sin `EPSILON`); el resto usa `red2`. Hoy no descuadra porque solo esa función y su copia del `.gs` calculan partidas | `cotizador/nucleo.js` |
| B3 | Bajo | Medidas sin tope superior; al teclear se guarda el valor crudo (p. ej. «-5») hasta el blur | `cotizador/partidas.js` |
| B4 | Bajo | El anticipo no se redondea a centavos antes de ir a la hoja; `totals()` guarda el IVA sin redondear | `proceso.js`, `venta.js`, `nucleo.js` |
| B5 | Bajo | El respaldo de comisión divide entre 1.16 sin redondear el subtotal | `asistente-contexto.js` |
| B7 | Bajo | `/carpetas` no revisa el rol: Fabricación y Pagos ven el listado de Drive completo | `hoja-apps-script.gs` |
| B8 | Bajo | El cupo de `/verificar` falla abierto en el `catch`, y el tope global de 400 lo agota cualquiera | `hoja-apps-script.gs` |
| B9 | Bajo | `_headers` no aplica en GitHub Pages (sin `frame-ancestors` ni `nosniff`); los dos hostings publican `docs/`, `supabase/` y el `.gs` | `_headers` |
| B10 | Bajo | El historial es una sola clave con imágenes en dataURL, reescrita completa en cada guardado y sin versión de esquema | `cotizador/historial.js` |
| B11 | Bajo | El POST al puente está en tres copias (`puente.js`, `venta.js`, `notario.js`); `esperaMs` de `sync.js` no lo llama nadie | — |
| B12 | Bajo | html-to-image sin versión identificable; pdf.js 3.11.174 (CVE-2024-4367, mitigado con SRI e `isEvalSupported:false`) conviene pasarlo a 4.x; las acciones de GitHub van por etiqueta, no por SHA | `vendor/`, `escalador.js` |
| — | Bajo | La RPC de `supa.js` no tiene tope (hoy apagado: solo pruebas) | `nucleo/supa.js` |

## Bien hecho (no tocar)

Redondeo de una sola fuente (`desgloseFinal`) y paridad teléfono–servidor probada; protección
contra fórmulas en todas las escrituras a la hoja; `tokeninfo` con `aud` y `email_verified`, que
cierra la puerta si falla la red; RLS completa, escritura por RPC y `search_path` fijo en las
funciones `SECURITY DEFINER`; CORS con lista cerrada y comparación de secretos en tiempo
constante; `postMessage` con revisión de origen; cola sin señal en IndexedDB; recorte de imágenes
al llenarse `localStorage`; service worker que publica todo o nada; ningún token en la consola.
