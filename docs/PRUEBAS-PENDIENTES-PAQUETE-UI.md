# Las pruebas de navegador del paquete de UI: 44 de 44

El paquete «Ideas de UI para todo el repo AL3D» (brief v3) está **implementado entero** en la rama
`claude/cambios-paquetes-individuales-1itp1x`: las 26 piezas compartidas, las 19 zonas de pantalla
con sus 153 fichas, las seis fallas del brief y las seis funciones nuevas.

**Las 46 pruebas de node pasan, y las 44 de navegador también.**

## Lo que encontró correrlas todas juntas

Cada zona pasó su propia prueba al construirse, en su copia de trabajo. Lo que esta tanda buscaba
era si dos zonas se estorban ahora que están juntas, y encontró **un desacuerdo real**:

**El latido de «sin decidir».** La clase `.cand-partidas` la comparten el cotizador, el Tablero y
Proyectos. El agente del cotizador la dejó en **un** latido, que es lo que pide la falla 3 del brief
(«un solo disparo cuando algo cambia»); los de Tablero y Proyectos escribieron sus pruebas esperando
**tres**. Ninguno podía verlo: cada zona pasaba sola. Se corrigieron las pruebas, no el CSS, porque
el número correcto es uno. Ya está arreglado y ambas pasan.

También salieron **tres falsos positivos por falta de recursos** (`cot-historial`, `cot-vector` y una
de las primeras): fallaban con cuatro navegadores a la vez y pasaban al correrlas solas. Antes de dar
por mala una prueba, **córrela sola**.

## La última en caer: `puente`

Fue la que más costó, y por una lectura equivocada: se dio por hecho que las dos comprobaciones de
«Quitar del tablero» seguían en rojo cuando **ya pasaban**. Lo que detenía la prueba estaba más
adelante. Quedan aquí las dos cosas que cambió el paquete y que la prueba tuvo que aprender:

1. **«Quitar del tablero» ahora se confirma SOSTENIENDO el botón**, no con un toque. Es la única de
   las cinco preguntas de `decisionHoja()` que borra algo de este teléfono sin más, y por eso lleva
   la pieza 5 (ver `conMantenerPresionado()` en `js/mod/proyectos.js`). `contestarPf()` detecta la
   marca que deja la pieza en el botón, espera a que la hoja deje de deslizarse, y sostiene con el
   dedo por CDP. Una corrida con logs confirmó que funciona: el sostener se detecta, el dedo cae
   encima y la pregunta se cierra. **«Quitar» sí borra; no era un defecto del código.**
2. **El filtro «Todas» ya no existe en el teléfono.** Desde P28 la tira es el pasador de las
   páginas —una por etapa— (`pintarFiltros()` en `js/mod/proyectos.js`).

Y lo que de verdad la detenía, en el último clic de Ajustes: «Probar» deja un aviso largo —el
puente de mentiras dice que corre otra versión—, que tapa el botón «Revisar el esquema» por abajo
mientras el índice de Ajustes lo tapa por arriba. El clic de Playwright dejaba el cursor encima del
aviso, y **la pieza 12 congela la mecha de un aviso con el cursor encima**, así que no se iba nunca
y el clic esperaba hasta agotar el tiempo. La prueba ahora aparta el cursor, limpia los avisos y
trae el botón al centro.

Es comportamiento a propósito de la pieza, pero vale anotarlo para un teléfono: **un aviso largo y
un índice que se pega pueden tapar juntos un botón**. Con el dedo no pasa lo del cursor —el aviso se
va solo o se desliza—, pero conviene mirarlo en un teléfono real.

## Cómo correrlas

```sh
pruebas/correr.sh --navegador          # la tanda entera: node + las 44 de navegador
```

Una por una, que es lo práctico:

```sh
npx --yes http-server -p 8814 -c-1 --silent &
PUERTO=8814 node pruebas/navegador/<archivo>.mjs
```

Las que levantan su propio servidor —`puente`, `service-worker-actualizacion` y
`service-worker-redireccion`— se corren con `env -u PUERTO`, o chocan consigo mismas. **`service-worker`
NO es una de ellas**: necesita que le den el puerto, y confundirlas cuesta una corrida en falso.

**No uses `pkill -f http-server`** si hay más de una tanda: mata la de al lado.

Cada archivo tarda entre 5 y 20 minutos, y los que más tardan son los nuevos del paquete, que traen
entre 500 y 1,800 comprobaciones cada uno.

---

La lista de lo que las zonas dejaron anotado para revisar está en **`docs/REVISAR-PAQUETE-UI.md`**:
20 zonas y 194 puntos, cada uno con archivo, qué revisar y gravedad, más la decisión de producto
que sigue abierta.
