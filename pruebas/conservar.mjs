/* EL ROUTER DECIDIENDO QUÉ TIRA Y QUÉ GUARDA.
 *
 * Esto prueba `planDeMontaje` de js/nucleo/conservar.js, que es la mitad pensante de
 * `montarDeVerdad`. Existe por dos razones y las dos importan:
 *
 *   · El router es la parte más sensible de la app. Un error aquí no da un error: da una
 *     pantalla que no se desmonta nunca —con sus oyentes de `resize` encima de todas las
 *     demás—, o un <iframe> vivo escondido que nadie vuelve a tocar, o el caso contrario, un
 *     marco que se reconstruye entero cada vez que alguien entra y sale del Cotizador. Todo
 *     eso se ve como «el teléfono va raro» tres días después, sin una línea en la consola.
 *
 *   · Y las 17 pruebas de pruebas/navegador/ no corren en Windows: llevan rutas /opt/node22/
 *     escritas a mano. Así que la única prueba de esto que se puede correr en la máquina
 *     donde se escribió el cambio es ésta. Por eso la decisión vive aparte del DOM: entran
 *     nombres de ruta y salen nombres de ruta, y node basta.
 *
 * Lo que NO prueba, y hay que comprobarlo a mano en el navegador: que `ocultar()` y
 * `mostrar()` de js/mod/cotizador.js y js/mod/herramientas.js repongan de verdad la clase
 * `pf-marco-lleno`, la barra fija del teléfono y los oyentes que miden el alto del marco.
 *
 * Uso: node pruebas/conservar.mjs   (o pruebas/correr.sh, que corre todas)
 */

import { planDeMontaje, TOPE_CONSERVADAS } from '../js/nucleo/conservar.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

/* Las rutas como están en RUTAS de js/app.js: tres se conservan y las demás no. `permitida`
   por defecto dice que sí a todo; el caso del rol va aparte, más abajo. */
const CONSERVA = ['cotizador', 'anidador', 'vectorizar'];
const plan = (o) => planDeMontaje({
  conservar: r => CONSERVA.includes(r),
  tope: TOPE_CONSERVADAS,
  ...o,
});

console.log('\nEL TOPE ES UNO, Y ESO ES UNA DECISIÓN DE MEMORIA');
eq('el tope que trae el archivo', TOPE_CONSERVADAS, 1);

console.log('\nARRANCAR — no hay nada montado, así que no hay nada que soltar');
eq('la primera pantalla se monta y ya',
   plan({ actual: null, destino: 'hoy', vivas: [] }),
   { ocultar: null, soltar: [], vaciar: [], reutilizar: false });
eq('y si la primera es el Cotizador, igual: montar',
   plan({ actual: null, destino: 'cotizador', vivas: [] }),
   { ocultar: null, soltar: [], vaciar: [], reutilizar: false });

console.log('\nLO DE SIEMPRE — dos pantallas normales');
/* Esto es lo que hacía el router antes de conservar nada, y tiene que seguir haciéndolo
   exactamente igual: desmontar la que se va y montar la que llega. Su sección NO se vacía
   aquí —nunca se vació— porque la vacía su próximo montaje. */
eq('Tablero → Proyectos: se desmonta el Tablero y no se vacía su sección',
   plan({ actual: 'hoy', destino: 'proyectos', vivas: ['hoy'] }),
   { ocultar: null, soltar: ['hoy'], vaciar: [], reutilizar: false });

console.log('\nEL CASO QUE SE VINO A ARREGLAR — salir del Cotizador y volver');
eq('Cotizador → Proyectos: el Cotizador se ESCONDE, no se desmonta',
   plan({ actual: 'cotizador', destino: 'proyectos', vivas: ['cotizador'] }),
   { ocultar: 'cotizador', soltar: [], vaciar: [], reutilizar: false });
/* Y la vuelta, que es el renglón entero de esta tarea: sin `reutilizar`, aquí se volvían a
   interpretar 795 KB de guiones. */
eq('Proyectos → Cotizador: se REUTILIZA, no se vuelve a montar',
   plan({ actual: 'proyectos', destino: 'cotizador', vivas: ['cotizador', 'proyectos'] }),
   { ocultar: null, soltar: ['proyectos'], vaciar: [], reutilizar: true });
eq('la Mesa de corte se comporta igual: se esconde',
   plan({ actual: 'anidador', destino: 'hoy', vivas: ['anidador'] }),
   { ocultar: 'anidador', soltar: [], vaciar: [], reutilizar: false });
eq('y al volver se reutiliza',
   plan({ actual: 'hoy', destino: 'anidador', vivas: ['anidador', 'hoy'] }),
   { ocultar: null, soltar: ['hoy'], vaciar: [], reutilizar: true });

console.log('\nEL TOPE — de una pantalla de marco a OTRA pantalla de marco');
/* Éste es el precio de tope 1, y está elegido a sabiendas: saltar del Cotizador a la Mesa de
   corte SÍ tira el Cotizador. Lo que compra es que nunca haya dos documentos de 795 KB vivos
   a la vez en un teléfono del taller. La sección se vacía, que es lo único que de verdad
   libera el documento del <iframe>: el router nunca vaciaba la que se abandona. */
eq('Cotizador → Mesa de corte: el Cotizador se suelta Y se le vacía la sección',
   plan({ actual: 'cotizador', destino: 'anidador', vivas: ['cotizador'] }),
   { ocultar: null, soltar: ['cotizador'], vaciar: ['cotizador'], reutilizar: false });
/* Y no puede pasar lo peor de todo: que se le llame a `ocultar()` Y a `desmontar()` en la
   misma navegación. Una podada no se esconde. */
eq('una podada no aparece además en `ocultar`',
   plan({ actual: 'cotizador', destino: 'vectorizar', vivas: ['cotizador'] }).ocultar,
   null);
/* La poda va ANTES del montaje —el router ejecuta `soltar` primero— así que el pico nunca
   llega a dos documentos vivos. Eso es lo que significa descontar el destino del cupo. */
eq('el Vectorizador entra con el Cotizador ya soltado, no encima',
   plan({ actual: 'cotizador', destino: 'vectorizar', vivas: ['cotizador'] }),
   { ocultar: null, soltar: ['cotizador'], vaciar: ['cotizador'], reutilizar: false });

console.log('\nEL TOPE — que se pode la MÁS VIEJA, no la que se acaba de dejar');
/* Con tope 2 hay dos vivas y hay que elegir. `vivas` llega de la más vieja a la más reciente,
   y la que se acaba de abandonar es la última: es la que más probable es que se vuelva a
   abrir, así que la que cae es la otra. Si esta prueba falla, subir el tope elegiría al
   revés y el ahorro se perdería justo en el camino que se usa. */
eq('tope 2: Cotizador → Mesa de corte deja vivas las dos',
   plan({ actual: 'cotizador', destino: 'anidador', vivas: ['cotizador'], tope: 2 }),
   { ocultar: 'cotizador', soltar: [], vaciar: [], reutilizar: false });
eq('tope 2: la tercera poda al Cotizador, que es la más vieja, y esconde la Mesa de corte',
   plan({ actual: 'anidador', destino: 'vectorizar', vivas: ['cotizador', 'anidador'], tope: 2 }),
   { ocultar: 'anidador', soltar: ['cotizador'], vaciar: ['cotizador'], reutilizar: false });

console.log('\nREFRESCAR A LA FUERZA — `ctx.refrescar()`, el cambio de rol, la sincronización');
/* `forzar` quiere decir «lo que hay en la sección no sirve», y sigue queriendo decir eso
   aunque la ruta se conserve. Es el camino de vuelta cuando el marco se quedó en la tarjeta
   de «no se pudo abrir», y es lo que hacía el router antes: no se cambia. */
eq('un refresco forzado del Cotizador lo rehace entero',
   plan({ actual: 'cotizador', destino: 'cotizador', vivas: ['cotizador'], forzar: true }),
   { ocultar: null, soltar: ['cotizador'], vaciar: [], reutilizar: false });
eq('y de una pantalla normal, lo mismo de siempre',
   plan({ actual: 'proyectos', destino: 'proyectos', vivas: ['proyectos'], forzar: true }),
   { ocultar: null, soltar: ['proyectos'], vaciar: [], reutilizar: false });
/* LA LÍNEA QUE EVITA UN MÓDULO HUÉRFANO. Llegar a una ruta que tiene algo vivo sin
   reutilizarlo obliga a desmontarlo primero: montar encima dejaría sus oyentes de `resize` y
   su oyente de `message` puestos, sin nadie que los quite, encima de todas las demás
   pantallas. Es el mismo modo de falla que la cola de montajes de app.js documenta. */
eq('forzar el Cotizador desde otra pantalla también lo desmonta antes de montar',
   plan({ actual: 'proyectos', destino: 'cotizador', vivas: ['cotizador', 'proyectos'], forzar: true }),
   { ocultar: null, soltar: ['cotizador', 'proyectos'], vaciar: [], reutilizar: false });

console.log('\nEL ROL — lo que ya no se puede abrir no merece un documento vivo');
/* Fabricación no tiene Control; pagos no tiene la Mesa de corte ni el Vectorizador. Al
   cambiar de rol, una conservada que el rol nuevo no tiene se tira: mantener vivo el
   documento de una pantalla a la que ya no se puede entrar es pagar memoria por nada. */
const soloDireccion = r => r !== 'anidador';
eq('el rol nuevo no tiene la Mesa de corte: se suelta y se vacía su sección',
   plan({ actual: 'hoy', destino: 'proyectos', vivas: ['anidador', 'hoy'], permitida: soloDireccion }),
   { ocultar: null, soltar: ['hoy', 'anidador'], vaciar: ['anidador'], reutilizar: false });
eq('y si era la que estaba en pantalla cuando cambió el rol, igual',
   plan({ actual: 'anidador', destino: 'hoy', vivas: ['anidador'], permitida: soloDireccion }),
   { ocultar: null, soltar: ['anidador'], vaciar: ['anidador'], reutilizar: false });
/* Y no gasta cupo: irse por rol no tiene por qué tirar además a la otra conservada. */
eq('la que se va por rol no le quita la plaza a la que sí se puede abrir',
   plan({ actual: 'cotizador', destino: 'proyectos', vivas: ['anidador', 'cotizador'],
          permitida: soloDireccion, tope: 1 }),
   { ocultar: 'cotizador', soltar: ['anidador'], vaciar: ['anidador'], reutilizar: false });

console.log('\nLOS BORDES');
eq('volver a la MISMA ruta sin forzar no toca nada',
   plan({ actual: 'cotizador', destino: 'cotizador', vivas: ['cotizador'] }),
   { ocultar: null, soltar: [], vaciar: [], reutilizar: true });
/* Una conservada cuyo módulo ya no está viva no se puede reutilizar: hay que montarla. Es el
   estado después de una poda, y el router lo alcanza al volver a esa pantalla. */
eq('una conservada podada se vuelve a montar, no se reutiliza',
   plan({ actual: 'anidador', destino: 'cotizador', vivas: ['anidador'] }),
   { ocultar: null, soltar: ['anidador'], vaciar: ['anidador'], reutilizar: false });
eq('tope 0 apaga la función entera: nada se conserva',
   plan({ actual: 'cotizador', destino: 'proyectos', vivas: ['cotizador'], tope: 0 }),
   { ocultar: null, soltar: ['cotizador'], vaciar: ['cotizador'], reutilizar: false });
/* Sin `conservar`, `planDeMontaje` tiene que comportarse como el router de antes. Es la red
   de seguridad del día que alguien quite las marcas de RUTAS para descartar una hipótesis. */
eq('sin ninguna ruta conservada, es el router de antes',
   planDeMontaje({ actual: 'cotizador', destino: 'proyectos', vivas: ['cotizador'] }),
   { ocultar: null, soltar: ['cotizador'], vaciar: [], reutilizar: false });

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
