# Las pruebas de navegador que faltan correr del paquete de UI

El paquete «Ideas de UI para todo el repo AL3D» (brief v3) está **implementado entero** en la rama
`claude/cambios-paquetes-individuales-1itp1x`: las 26 piezas compartidas, las 19 zonas de pantalla
con sus 153 fichas, las seis fallas del brief y las seis funciones nuevas.

Lo que queda pendiente es **terminar de correr la tanda completa de pruebas de navegador**, que se
cortó a propósito: cada archivo tarda unos 20 minutos en esta máquina de cuatro procesadores —las
pruebas nuevas traen entre 500 y 1,800 comprobaciones cada una, y cada una levanta su navegador—,
así que la tanda entera son unas 14 horas de reloj. Se cerró al llegar a 20 —decisión de Elías— y el resto
queda para después, con esto escrito.

## Lo que SÍ está verificado

- **Las 46 pruebas de node:** todas pasan. Se corrieron completas en cada fusión.
- **20 de las 44 de navegador:** verde, con un solo arreglo (abajo).
- **Cada zona pasó su propia prueba al construirse**, en su copia de trabajo y antes de fusionarse.
  Lo que esta tanda busca no es si una zona funciona, sino si dos zonas se estorban ahora que están
  juntas.

### Las que ya corrieron en verde

`an-controles`, `an-mesa`, `anidador`, `camino-completo`, `capas`, `carga`, `contraste`,
`cot-cliente`, `cot-entrega`, `cot-escalador`, `cot-historial`, `cot-ia`, `cot-opciones`,
`cot-partidas`, `cot-precio`, `cotizador-flujo`, `piezas-avisos`, `piezas-hojas`, `piezas-numeros`,
`piezas-senales`.

Las cinco últimas se eligieron a propósito: las cuatro de `piezas-*` prueban el aviso, el botón que
trabaja, el total que rueda, el riel, las esquinas y las demás, que son las que usa **cada una** de
las 19 pantallas —si algo se rompió al juntar todo, es ahí donde se nota—, y `cotizador-flujo`
recorre el camino completo, de capturar al cliente hasta autorizar.

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
cot-vector            pf-esqueleto      precio-suelto          service-worker-redireccion
cotizacion-de-antes   pf-fabricacion    publicas               tablero
escalador-cotas       pf-mapa           puente                 total-que-viaja
pdf-hoja-carta        pf-material       puerta                 vidrio
pf-ajustes            pf-proyectos      service-worker         volver-atras
pf-control            pf-tablero        service-worker-actualizacion   plegable
```

Son 24.

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
