# Las pruebas de navegador del paquete de UI: 43 de 44, y la que falta

El paquete «Ideas de UI para todo el repo AL3D» (brief v3) está **implementado entero** en la rama
`claude/cambios-paquetes-individuales-1itp1x`: las 26 piezas compartidas, las 19 zonas de pantalla
con sus 153 fichas, las seis fallas del brief y las seis funciones nuevas.

**Las 46 pruebas de node pasan. De las 44 de navegador pasan 43.** Falta una: `puente`.

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

## La que falta: `puente`

Quedan dos comprobaciones en rojo, y **las dos son la prueba asumiendo el comportamiento viejo, no
código roto**. Lo que cambió, y que la prueba todavía no sabe:

1. **«Quitar del tablero» ahora se confirma SOSTENIENDO el botón**, no con un toque. Es la única de
   las cinco preguntas de `decisionHoja()` que borra algo de este teléfono sin más, y por eso lleva
   la pieza 5 (ver `conMantenerPresionado()` en `js/mod/proyectos.js`).
2. **El filtro «Todas» ya no existe en el teléfono.** Desde P28 la tira dejó de ser un filtro y pasó
   a ser el pasador de las páginas —una por etapa—, así que un botón que no lleva a ningún lado se
   quitó a propósito (`pintarFiltros()` en `js/mod/proyectos.js`).

### Lo que ya se le hizo a la prueba, y dónde se quedó

`contestarPf()` de `pruebas/navegador/puente.mjs` ya detecta si el botón pide sostener —por la marca
que deja la pieza, no por una lista de cuáles son— y sostiene con el dedo por CDP, que es el arnés
que sí funciona en `cot-historial` y `cot-cliente`. También espera a que la hoja **deje de
deslizarse** antes de tomar las coordenadas, y comprueba con `elementFromPoint` que el dedo caiga
encima; si no, falla diciendo eso.

**Aun así las dos comprobaciones siguen en rojo**, y la causa no está confirmada. Se intentaron cinco
corridas y cada una tarda ~20 minutos, así que se dejó aquí escrito en vez de seguir.

### Por dónde seguir

Lo primero es **saber si el sostener llega o no**, en vez de seguir adivinando: poner un
`console.log` del valor de `sostener` y de `encima` dentro de `contestarPf()`, correrla una vez y
mirar. De ahí salen dos caminos:

- **Si el sostener no se detecta** (la marca no está en el botón cuando la prueba mira), el problema
  es de orden: `conMantenerPresionado()` arma la pieza sobre `#pf-confirma-si` justo después de que
  `confirmarPf()` abre la capa, y la prueba podría estar mirando antes.
- **Si se detecta y aun así no confirma**, entonces el gesto no está llegando a la pieza, y hay que
  mirar `P.mantener` en `js/piezas.js` con el contexto `isMobile` de esta prueba.

Y hay una tercera posibilidad que **no se descartó**: que «Quitar» de verdad no borre, y sea un
defecto del código y no de la prueba. Se dio por supuesto que era la prueba porque el diálogo sale
con su texto correcto, pero eso no lo demuestra. **Vale la pena quitarse esa duda a mano**: abrir la
app, provocar una tarjeta importada cuya fila ya no esté, y quitarla sosteniendo el botón. Si se
quita, era la prueba; si no, es un defecto que borra —o más bien no borra— datos.

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
20 zonas y 194 puntos, cada uno con archivo, qué revisar y gravedad, más las dos decisiones de
producto que siguen abiertas.
