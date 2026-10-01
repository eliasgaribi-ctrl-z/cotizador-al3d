# Las pruebas de navegador que faltan correr del paquete de UI

El paquete «Ideas de UI para todo el repo AL3D» (brief v3) está **implementado entero** en la rama
`claude/cambios-paquetes-individuales-1itp1x`: las 26 piezas compartidas, las 19 zonas de pantalla
con sus 153 fichas, las seis fallas del brief y las seis funciones nuevas.

Lo que queda pendiente es **terminar de correr la tanda completa de pruebas de navegador**, que se
cortó a propósito: cada archivo tarda unos 20 minutos en esta máquina de cuatro procesadores —las
pruebas nuevas traen entre 500 y 1,800 comprobaciones cada una, y cada una levanta su navegador—,
así que la tanda entera son unas 14 horas de reloj. Se decidió cerrarla al llegar a 20 y dejar el
resto para después, con esto escrito.

## Lo que SÍ está verificado

- **Las 46 pruebas de node:** todas pasan. Se corrieron completas en cada fusión.
- **20 de las 44 de navegador:** verde, con un solo arreglo (abajo).
- **Cada zona pasó su propia prueba al construirse**, en su copia de trabajo y antes de fusionarse.
  Lo que esta tanda busca no es si una zona funciona, sino si dos zonas se estorban ahora que están
  juntas.

### Las que ya corrieron en verde

`an-controles`, `an-mesa`, `anidador`, `camino-completo`, `capas`, `carga`, `contraste`,
`cot-cliente`, `cot-entrega`, `cot-escalador`, `cot-historial`, `cot-ia`, `cot-opciones`,
`cot-partidas`, `cot-precio`, y las cinco siguientes hasta completar 20 (ver el commit de cierre).

Entre ellas van las tres transversales que más valen: **`contraste`** (nada de lo que lleva texto
baja de 4.5:1, medido en el render), **`capas`** (cada capa se cierra sola y el atrás cierra una por
toque) y **`camino-completo`**.

### El único arreglo que hizo falta

`pruebas/navegador/cot-historial.mjs` miraba las cifras del cuaderno 120 ms después de abrirlo —a
propósito, porque la marca de «rodando» solo está mientras ruedan—, y con cuatro navegadores
corriendo a la vez no alcanzaban a pintarse. Ahora espera a que las tres cifras existan, que es la
condición de verdad, en vez de confiar en un cronómetro fijo. **Era la prueba, no el código.**

## Lo que FALTA correr

```
cot-vector            pf-ajustes        piezas-avisos          service-worker
cotizacion-de-antes   pf-control        piezas-hojas           service-worker-actualizacion
cotizador-flujo       pf-esqueleto      piezas-numeros         service-worker-redireccion
escalador-cotas       pf-fabricacion    piezas-senales         tablero
pdf-hoja-carta        pf-mapa           plegable               total-que-viaja
publicas              pf-material       precio-suelto          vidrio
puente                pf-proyectos      puerta                 volver-atras
```

Son 24, menos las que alcanzaron a correr antes del corte.

**Ojo:** varias de estas ya se corrieron en verde **antes**, en fusiones anteriores (`contraste`,
`capas`, `carga`, `cotizador-flujo`, `tablero`, `total-que-viaja`, `vidrio`, `volver-atras`,
`plegable`, `puente`, `puerta`, las de `service-worker`, `pdf-hoja-carta`, `precio-suelto`,
`cotizacion-de-antes`, `escalador-cotas` y las cuatro de `piezas-*`). Lo que no se ha hecho es
correrlas **todas juntas sobre el árbol final**.

## Cómo terminarlas

```sh
pruebas/correr.sh --navegador          # la tanda entera: node + las 44 de navegador
```

O una por una, que es lo práctico si se quiere repartir en varias sesiones:

```sh
npx --yes http-server -p 8814 -c-1 --silent &
PUERTO=8814 node pruebas/navegador/<archivo>.mjs
```

Las que levantan su propio servidor (`puente`, las tres de `service-worker`) se corren con
`env -u PUERTO node pruebas/navegador/<archivo>.mjs`, o chocan consigo mismas.

**No uses `pkill -f http-server`** si hay más de una tanda corriendo: mata la de al lado.

## Qué buscar si alguna falla

Antes de dar por mala una prueba, córrela **sola**: dos de los fallos que salieron en esta tanda
fueron por falta de recursos, no por el código, y pasaron al correrlas aparte. Un fallo real se
repite con la máquina descargada.

Lo que estas pruebas podrían encontrar y las de zona no: que dos zonas usen la misma clase de CSS
para cosas distintas, que una pieza compartida se comporte distinto según quién la llame primero, o
que el árbol final tenga más animaciones en reposo que las que cada zona vio por su lado.

La lista de lo que ya quedó anotado para revisar está en **`docs/REVISAR-PAQUETE-UI.md`**: 20 zonas
y 194 puntos, cada uno con archivo, qué revisar y gravedad.
