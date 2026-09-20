/* LA PUERTA — lo que decide quién pasa, probado sin navegador.
 *
 * Desde la versión 51 la plataforma no monta un solo módulo sin saber quién entró. Eso mueve
 * dos cosas que antes no decidían nada y ahora sí:
 *
 *   · EL PASE. Es lo que permite que la app abra en una azotea sin señal, y por eso mismo es
 *     lo que hay que probar con saña: un pase sin fecha, con una fecha pasada, con un rol
 *     inventado o con un correo que no es un correo NO puede valer. Si cualquiera de esos
 *     colara, la puerta se abriría sola escribiendo cuatro caracteres en el almacenamiento.
 *
 *   · EL ROL. Dejó de ser un interruptor de este teléfono y pasa a salir de la pestaña
 *     «Accesos» de la hoja. Lo que se prueba aquí es que cuando hay pase, el pase MANDA —da
 *     igual lo que diga la clave vieja del aparato—, porque el día que esas dos se
 *     desempataran al revés, fabricación se pondría «dirección» y vería los importes.
 *
 * Y la dirección del puente, que se acaba de meter en el código: que exista, que sea https,
 * y que lo guardado la pueda anular. De eso depende que a alguien nuevo le baste el enlace.
 *
 * Nada de esto toca la red ni Google. La verificación de VERDAD —la audiencia del token, el
 * correo en la hoja— vive del lado del Apps Script y tiene sus propias pruebas en
 * pruebas/ingreso.mjs. Esta comprueba la mitad de acá.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));

/* Un localStorage de mentira, para poder sembrar claves antes de importar prefs.js. */
const almacen = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
globalThis.localStorage = almacen;
const sembrar = obj => { almacen._d = { ...obj }; };

const Prefs = await import('../js/datos/prefs.js');

const DIA = 24 * 60 * 60 * 1000;
const pase = (extra = {}) => JSON.stringify({
  correo: 'beto@al3d.mx', rol: 'fabricacion', hasta: Date.now() + 10 * DIA, ...extra,
});

console.log('\nEL PASE — lo que vale y lo que no');
{
  sembrar({ al3d_pf_pase: pase() });
  eq('un pase con correo, rol y fecha por delante vale',
     Prefs.pase() && Prefs.pase().correo, 'beto@al3d.mx');

  sembrar({ al3d_pf_pase: pase({ hasta: Date.now() - 1 }) });
  eq('uno caducado no vale, aunque sea de un segundo', Prefs.pase(), null);

  /* Éste es el que importa: sin fecha, un pase duraría para siempre. Quien se quede sin
     señal a propósito seguiría entrando el año que viene. */
  sembrar({ al3d_pf_pase: JSON.stringify({ correo: 'beto@al3d.mx', rol: 'fabricacion' }) });
  eq('uno SIN fecha no vale: un pase eterno es no tener puerta', Prefs.pase(), null);

  sembrar({ al3d_pf_pase: JSON.stringify({ correo: 'x@y.mx', rol: 'fabricacion', hasta: 'mañana' }) });
  eq('una fecha que no es número tampoco', Prefs.pase(), null);

  sembrar({ al3d_pf_pase: pase({ rol: 'jefazo' }) });
  eq('un rol inventado no vale: el default es cerrado', Prefs.pase(), null);

  sembrar({ al3d_pf_pase: pase({ correo: 42 }) });
  eq('un correo que no es texto tampoco', Prefs.pase(), null);

  sembrar({ al3d_pf_pase: '{esto no es json' });
  eq('basura en la clave no truena y no abre', Prefs.pase(), null);

  sembrar({});
  eq('sin pase, null', Prefs.pase(), null);
}

console.log('\nEL ROL — manda la hoja, no el teléfono');
{
  /* El caso que hay que impedir: alguien se puso «direccion» a mano en el aparato y la hoja
     dice que es fabricación. Gana la hoja. */
  sembrar({ al3d_pf_rol: 'direccion', al3d_pf_pase: pase({ rol: 'fabricacion' }) });
  eq('con pase, el rol es el del pase aunque el aparato diga otra cosa',
     Prefs.rol(), 'fabricacion');
  eq('y la app lo sabe, para poder apagar el interruptor', Prefs.rolDeLaHoja(), true);
  eq('fabricación NO ve dinero, que es para lo que sirve todo esto',
     Prefs.veDinero(), false);

  /* Y al revés: un pase de dirección no lo puede degradar la clave del aparato. */
  sembrar({ al3d_pf_rol: 'fabricacion', al3d_pf_pase: pase({ rol: 'direccion' }) });
  eq('y al revés también: el pase manda en los dos sentidos', Prefs.rol(), 'direccion');

  /* Sin pase se vuelve al interruptor: es el aparato que todavía trabaja con token de
     dispositivo, y ahí el rol sigue siendo un modo de trabajo. */
  sembrar({ al3d_pf_rol: 'pagos' });
  eq('sin pase manda el aparato, como siempre', Prefs.rol(), 'pagos');
  eq('y el interruptor se queda encendido', Prefs.rolDeLaHoja(), false);

  /* Un pase caducado NO puede seguir mandando el rol: si mandara, quitar a alguien de la
     hoja no le cambiaría nunca lo que ve. */
  sembrar({ al3d_pf_rol: 'pagos', al3d_pf_pase: pase({ rol: 'direccion', hasta: Date.now() - DIA }) });
  eq('un pase caducado no manda el rol', Prefs.rol(), 'pagos');
  eq('ni apaga el interruptor', Prefs.rolDeLaHoja(), false);
}

console.log('\nLA DIRECCIÓN DEL PUENTE — de fábrica, y anulable');
{
  sembrar({});
  cierto('viene una dirección en el código: sin ella, un teléfono nuevo no puede preguntar nada',
         Prefs.puente().url);
  cierto('y es https: por ahí viaja un token de Google',
         /^https:\/\//.test(Prefs.puente().url));
  eq('sin nada guardado, la de fábrica', Prefs.puente().url, Prefs.URL_PUENTE);
  eq('y `puenteGuardado` NO se la inventa: el campo de Ajustes sale vacío',
     Prefs.puenteGuardado(), null);

  sembrar({ al3d_pf_puente: JSON.stringify({ url: 'https://otro.example/exec' }) });
  eq('lo guardado gana, para apuntar un aparato a un despliegue de prueba',
     Prefs.puente().url, 'https://otro.example/exec');

  /* Una URL guardada vacía —que es lo que deja «Guardar» con el campo en blanco— tiene que
     volver a la de fábrica, no dejar el aparato sin puente. */
  sembrar({ al3d_pf_puente: JSON.stringify({ url: '   ', token: 'abc' }) });
  eq('una liga vacía vuelve a la de fábrica', Prefs.puente().url, Prefs.URL_PUENTE);
  eq('y no se lleva por delante lo demás que hubiera guardado', Prefs.puente().token, 'abc');

  /* `hayPuente` es lo que enciende la sincronización. Con la dirección de fábrica, basta
     haber entrado con Google: ése es el camino normal desde hoy. */
  sembrar({ al3d_pf_ingreso: JSON.stringify({ correo: 'beto@al3d.mx' }) });
  eq('entrar con Google enciende la sincronización, sin pegar nada', Prefs.hayPuente(), true);
  sembrar({});
  eq('y sin ninguna de las dos puertas, no', Prefs.hayPuente(), false);
}

/* EL BUCLE DE PRODUCCIÓN, capturado como prueba.
 *
 * El 20 de septiembre de 2026, con la puerta recién desplegada, entrar con Google funcionaba
 * —el token llegaba, el correo era correcto— y la pantalla rebotaba a «Entrar con Google»
 * una y otra vez. La causa estaba a dos archivos de distancia: `crear()` en puente.js abría
 * con `if (!cfg.url || !cfg.token) return null`, y un teléfono que entra con su cuenta NO
 * tiene token de dispositivo. El relevo salía null, la puerta no podía preguntarle a la hoja
 * quién era, y el bucle.
 *
 * Es el defecto exacto que esta plataforma produce cuando se cambia una puerta: la condición
 * vieja sigue escrita en un sitio que nadie mira porque «eso ya funcionaba». */
console.log('\nEL PUENTE SE CONSTRUYE SIN TOKEN DE DISPOSITIVO');
{
  const Puente = await import('../js/datos/puente.js');

  sembrar({});
  cierto('sin nada guardado —un teléfono recién estrenado— el relevo EXISTE: ' +
         'si no, quien entra con Google no puede ni preguntar quién es',
         Puente.desdePrefs());

  sembrar({ al3d_pf_puente: JSON.stringify({ token: 'x'.repeat(40) }) });
  cierto('con token y sin liga propia, también', Puente.desdePrefs());

  sembrar({ al3d_pf_puente: JSON.stringify({ url: 'https://otro.example/exec' }) });
  cierto('con liga propia y sin token, también', Puente.desdePrefs());

  /* Lo único que sigue siendo obligatorio es la dirección, y ya no puede faltar. */
  cierto('lo que el relevo necesita es la DIRECCIÓN, y viene de fábrica',
         Puente.crear({ url: '', token: 'x'.repeat(40) }) === null);
  cierto('y con dirección y sin ninguna puerta se construye igual: la hoja contesta el porqué',
         Puente.crear({ url: 'https://x.example/exec' }));
}

/* ----- Lo que el código de la puerta promete, leído del archivo -----
   No se puede importar puerta.js en node: pide DOM. Lo que sí se puede es comprobar que las
   decisiones que su cabecera promete siguen escritas, porque son justo las que alguien
   quitaría «para simplificar» sin saber qué sostienen. */
console.log('\nLO QUE LA PUERTA PROMETE');
{
  const src = readFileSync(join(aqui, '..', 'js', 'nucleo', 'puerta.js'), 'utf8');

  /* El arranque entero cuelga de `confirmar()`. Sin tope, una ventana de Google que el
     navegador bloqueó en silencio deja la app muerta en «Comprobando quién entra…» para
     siempre — y sin un solo error en la consola, que es la peor clase de avería. */
  cierto('confirmar() tiene tope de espera: el arranque no puede colgar de Google',
         src.includes('Promise.race') && /MS_CALLADO = \d+/.test(src) &&
         /MS_CON_PANTALLA = \d+/.test(src));
  const msCallado = Number((src.match(/MS_CALLADO = (\d+)/) || [])[1]);
  const msPantalla = Number((src.match(/MS_CON_PANTALLA = (\d+)/) || [])[1]);
  cierto('y el de pantalla es MÁS largo que el callado: detrás hay una persona eligiendo cuenta',
         msPantalla > msCallado && msPantalla >= 60000);
  cierto('el tope vence a «no se pudo preguntar», nunca a «no tienes acceso»',
         /Promise\.race\(\[[\s\S]{0,160}estado: 'sin_red'/.test(src));

  cierto('el pase caduca: hay un tope de días escrito', /const DIAS_PASE = \d+/.test(src));
  const dias = Number((src.match(/const DIAS_PASE = (\d+)/) || [])[1]);
  cierto('y es un número razonable: ni un día ni para siempre', dias >= 7 && dias <= 90);

  /* El tope exterior TIENE que ser más largo que el que la hoja se da a sí misma
     (MS_ESPERA en puente.js), o corta antes de que el de abajo llegue a rendirse. Eso pasó
     el primer día con diez segundos contra quince. */
  const msEspera = Number((readFileSync(join(aqui, '..', 'js', 'datos', 'puente.js'), 'utf8')
    .match(/MS_ESPERA = (\d+)/) || [])[1]);
  cierto('el tope del arranque es más largo que el que se da la hoja: si no, es una carrera',
         msEspera > 0 && msCallado > msEspera);

  /* `via !== 'google'` es la comprobación que impide que un /salud contestado por la puerta
     del TOKEN dé pase: ahí la hoja reconoció al aparato, no a la persona, y el rol saldría
     de una cadena pegada a mano. */
  cierto('un /salud que no venga por Google no da pase',
         src.includes("s.via === 'google'") && src.includes("if (s.ok && s.via !== 'google') return"));

  cierto('un correo fuera de la lista borra el pase en vez de dejarlo caducar solo',
         /'fuera'[\s\S]{0,120}borrarPase\(\)/.test(src));

  /* Cerrar la ventana de Google no es quedarse fuera: si se tratara como rechazo definitivo,
     un resbalón del dedo dejaría a alguien viendo «no tienes acceso» sin tenerlo. Lo que se
     comprueba es que el fallo del ingreso sale por `sin_red` —«no se pudo preguntar»— y
     NUNCA por `fuera`, que es el estado que cierra. */
  const traloIngreso = (src.match(/if \(!e\.ok\) \{[\s\S]*?\n  \}/) || [''])[0];
  cierto('un ingreso que no salió se trata como «todavía no», no como «no»',
         traloIngreso.includes("estado: 'sin_red'") && !traloIngreso.includes("'fuera'"));

  /* Y al revés: `fuera` solo puede salir del código que la hoja manda para «este correo no
     está en Accesos». Si saliera de cualquier otra rama, un error de red dejaría a alguien
     con el cartel de «no tienes acceso» delante. */
  cierto('«fuera» solo lo dice la hoja, con su código',
         /codigo === 'ROL_SIN_PERMISO'[\s\S]{0,120}estado: 'fuera'/.test(src) &&
         (src.match(/estado: 'fuera'/g) || []).length === 1);

  cierto('la puerta enlaza la privacidad y las condiciones, que es donde Google las pide',
         src.includes('privacidad.html') && src.includes('condiciones.html'));

  /* El arranque no puede montar nada antes de esto. Se comprueba del lado de app.js. */
  const app = readFileSync(join(aqui, '..', 'js', 'app.js'), 'utf8');
  const iPuerta = app.indexOf('Puerta.custodiar()');
  const iMontar = app.indexOf('await montar(rutaDelHash())');
  cierto('app.js espera a la puerta ANTES de montar el primer módulo',
         iPuerta > 0 && iMontar > 0 && iPuerta < iMontar);
  cierto('y antes de pintar la barra, que depende del rol',
         iPuerta > 0 && iPuerta < app.indexOf('pintarRolSeg();\n  pintarNav();'));

  /* La guarda del rol tiene que estar en la FUNCIÓN, no solo en el atributo `disabled` del
     botón: Ajustes llega a `cambiarRol` simulando un clic y se saltaría el atributo. */
  cierto('cambiar de rol se bloquea en el código, no solo en el HTML',
         /function cambiarRol[\s\S]{0,400}if \(Prefs\.rolDeLaHoja\(\)\)/.test(app));

  /* Y el service worker tiene que traerse el archivo: sin él, cada apertura sin señal
     entraría por el camino de emergencia. */
  const sw = readFileSync(join(aqui, '..', 'sw.js'), 'utf8');
  cierto('sw.js cachea la puerta', sw.includes("'./js/nucleo/puerta.js'"));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
