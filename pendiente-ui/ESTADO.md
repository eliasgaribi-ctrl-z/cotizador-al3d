# Paquete de UI (brief v3) — dónde se quedó y cómo seguir

Rama: `claude/cambios-paquetes-individuales-1itp1x`. Pausado el 28-sep-2026 por el límite semanal de uso; se retoma el miércoles.
Esta carpeta es temporal: se borra al terminar el paquete (ver «Fase 4»).

## Avance: ~35 % del paquete

| Fase | Peso | Estado |
|---|---|---|
| 0 · Preparación: `js/piezas.js`, bloques de CSS, guía y reparto de las 153 fichas | 5 % | ✅ |
| 1 · Las 26 piezas compartidas (paquetes 1 y 2 del ZIP) | 20 % | ✅ construidas, probadas y fusionadas; revisadas 3 de 4 secciones |
| 2 · Las 19 zonas de pantalla (paquetes 3 al 8: 153 fichas, 6 fallas, funciones 31, 32, 33, 53 y 54) | 55 % | 🟡 6 zonas empezadas y guardadas como parches; 13 sin empezar |
| 3 · Función 76 (propuesta con opciones) | 5 % | ⬜ |
| 4 · Documentación, conteos, `APP_VERSION`, pruebas completas y cierre | 15 % | ⬜ |

La revisión por zona que antes era la fase 3 ya va **dentro** de cada zona de la fase 2: no hay otra ronda al final.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `paquete/` | El ZIP original: brief v3, las 153 fichas y las 8 páginas de muestras. |
| `CONVENCIONES.md` | La guía que siguen todos los agentes: reglas del repo, tono, dónde va el CSS, cómo probar, cómo entregar, y las siete decisiones ya tomadas. |
| `pantallas.json` | El reparto de la fase 2: las 19 zonas con sus fichas, sus archivos y su bloque de CSS. Cubre las 153 fichas, sin huecos. |
| `api/piezas-1..4.md` | La API de las 26 piezas compartidas. Es lo que leen los agentes de pantalla. |
| `avance-fase2/*.patch` | Seis zonas a medio construir, **sin aplicar y sin terminar** (ver abajo). |
| `parches-revision/seccion-4-senales-a-medias.patch` | La única revisión de piezas que quedó pendiente (sección 4). Sin aplicar. |

## Fase 1 — lo que quedó en la rama

Las cuatro secciones de `js/piezas.js` (359 KB, 89 funciones bajo `window.Piezas`) están construidas, probadas y fusionadas, y las cargan las cuatro superficies: cotizador, plataforma, anidador y `verificar.html`.

| Sección | Piezas | Revisión |
|---|---|---|
| 1 · Avisos y botones | aviso con mecha, pausa, deslizar y **pila con prioridad** (arregla la falla 2 del brief), botón que trabaja con reloj, deshacer en el mismo botón, rótulo sin brinco, mantener para confirmar, palomita, veredicto y sello, copiar | ✅ |
| 2 · Hojas y transiciones | hoja que se cierra deslizando (una sola para las dos apps), tarjeta que viaja, tema en círculo, bordes que se desvanecen, desenfoque bajo el dock, renglón deslizable, entra/sale de lista, pliegues, páginas, silueta | ✅ |
| 3 · Números y campos | total que rueda, diferencia en vivo, ficha que viaja, arrastrar la medida, opciones deslizantes, casillas de código, teléfono completo, medidores, deslizador con imanes | ✅ |
| 4 · Señalar y sellar | vistazo en popover, nombres con el dedo, neón, traza de pasos, riel, esquinas que señalan, carga con los azules del logo, letrero 3D, resaltar coincidencias | ⬜ pendiente |

Ya están cableadas en el repo: los dos `toast()`, los dos `copiarTexto()`, las dos hojas del teléfono y el botón de tema de `js/tema.js`.

Al fusionar hubo un choque de nombres: `P.plegar` de la sección 4 (plegar acentos) contra el `P.plegar` de los pliegues de la sección 2. El de la 4 se llama ahora `P.plegarTexto`.

**Comprobado sobre la rama:** las 30 pruebas de node y las 24 de navegador pasan; las 89 funciones cargan en las cuatro superficies sin errores de página, sin desborde a 390 px y sin nada moviéndose en reposo.

## Fase 2 — las seis zonas empezadas

Están en `avance-fase2/`, como parches contra la rama. **Ninguna está terminada ni probada**: se cortaron a media construcción, antes de su revisión. Entre las seis llevaban ~7,500 líneas.

| Parche | Zona | Qué traía |
|---|---|---|
| `publicas.patch` | Páginas públicas y PWA | verificar con código en casillas y el folio del papel (falla 1), sello de «Auténtica», página de «sin señal», índice de las legales, créditos |
| `cot-entrega.patch` | Entrega y registrar venta | WhatsApp que dice a qué número va (falla 5), los tres hitos como riel, «Hoja 3 de 5» del PDF, la cuenta con IVA |
| `pf-esqueleto.patch` | Esqueleto de la plataforma | «Más» en la barra del teléfono, búsqueda global, marca de módulo que se desliza, arranque en pasos, la puerta |
| `pf-proyectos.patch` | Proyectos | etapa como pasos, tarjeta que viaja, arrastrar entre columnas, **modo cliente** (función 31) y **garantía y liquidación** (función 53) |
| `cot-ia.patch` | Cotizar con IA | resumen de lo que leyó, miniatura que «se lee», el tachado al apagar «Conservar», y la zona de arrastre que deja de respirar sola (falla 3) |
| `cot-escalador.patch` | Escalador | lectura en cm pegada a la lupa, aviso al pegarse a una guía, calibración en tres pasos, y **el letrero sobre la foto del local** (función 32) |

Aplicar con `git apply --3way pendiente-ui/avance-fase2/<zona>.patch`, **verificando**: son trabajos a medias, no verdad revelada. Si un parche estorba más de lo que ayuda, tíralo y que la zona empiece de nuevo: sus fichas están en `pantallas.json`.

### Las 13 zonas sin empezar

`cot-cliente`, `cot-partidas`, `cot-precio`, `cot-vector`, `cot-historial`, `an-controles`, `an-mesa`, `pf-tablero`, `pf-material`, `pf-fabricacion`, `pf-control`, `pf-mapa`, `pf-ajustes`.

Entre ellas quedan tres de las seis fallas del brief: la 3 (los latidos en bucle de `.cand-partidas`, `.cand-cliente.ojo` y `#prog-bar::after`), la 6 (la veta del anidador) y el resto de la 1 (imprimir el folio completo en el PDF, en `cot-entrega`, que sí se empezó).

## Cómo seguir el miércoles

1. **Lee este archivo y `CONVENCIONES.md`.**
2. **Cierra la fase 1:** un revisor para la sección 4 de `js/piezas.js`, partiendo de `parches-revision/seccion-4-senales-a-medias.patch`.
3. **Fase 2:** un agente por zona de `pantallas.json`, cada uno en su *worktree*. **PASO 0 OBLIGATORIO**, que ya está escrito en el guion: cada agente hace `git reset --hard claude/cambios-paquetes-individuales-1itp1x` y comprueba que `js/piezas.js` pese más de 200000 bytes. Sin eso, los worktrees pueden nacer de un commit viejo con el andamiaje vacío de 3.9 KB y el agente trabaja en balde — pasó, y costó una corrida entera.
   El guion está en `~/.claude/projects/.../workflows/scripts/pantallas.js` (si ya no existe, se rehace desde `pantallas.json`; el contenedor se borra, el repo no).
4. **Fase 3:** la función 76 (propuesta con opciones: aluminio, acrílico y caja de luz lado a lado, y la elegida pasa a ser la cotización), que toca `partidas.js` y `entrega.js`, así que va **después** de fusionar esas zonas.
5. **Fase 4:** `docs/SISTEMA-DE-DISENO.md` (una sección para las piezas), `docs/FUNCIONES.md`, los conteos del README que `pruebas/publicacion.mjs` vigila, subir `APP_VERSION` en `sw.js`, `pruebas/correr.sh --navegador` completa, borrar esta carpeta y push.

**Ritmo:** caben seis agentes a la vez en esta máquina de 4 procesadores; cada zona tarda entre 40 y 60 minutos porque además prueba en el navegador. Las 19 zonas son unas 3 horas de reloj.

## Decisiones tomadas por omisión (cambiables)

1. La excepción de $60,000 del anticipo se mide sobre el total que se cobra, con IVA si lleva.
2. El plazo del taller va en días de calendario, como `js/datos/taller.js`.
3. «Pagar estas» (comisiones) arma la lista para registrarla en Finanzas AL3D; no marca pagos.
4. La puerta de referencia del escalador se queda en 200 cm.
5. «Más» en la barra del teléfono concilia nombres con `RUTAS` de `js/app.js`.
6. La veta: con aluminio cepillado o MDF se pregunta y se quitan los giros de 90°.
7. El IVA por cuenta sale de `ivaDeCuenta` de la hoja; solo se avisa, nunca se cambia solo.
