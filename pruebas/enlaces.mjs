/* LOS `href` QUE SE ARMAN CON DATOS QUE ESCRIBIÓ ALGUIEN MÁS.

   `esc()` escapa HTML. Eso protege el texto de una pantalla y no protege un `href`, porque un
   href no es un contexto de HTML: es un contexto de URL. `javascript:alert(1)` pasa por `esc()`
   sin un rasguño —no trae `<`, ni `>`, ni comillas— y llega al atributo intacto. Tocar el
   enlace ejecuta el código, con acceso a todo lo que la app tiene en ese origen: el historial,
   las API keys de IA, el token del puente.

   Y hay un solo campo del sistema por el que puede entrar: `maps_url`. Es el link de Google
   Maps que el cliente manda por WhatsApp, que alguien pega a mano en el cotizador. Tiene tres
   caminos hasta el `href`, y no hace falta que nadie lo escriba con mala intención: basta un
   respaldo restaurado de un archivo que viajó por correo, o una fila de Notion que bajó por el
   puente.

   `js/mod/agenda.js` lo filtraba, con el motivo escrito al lado. `js/mod/proyectos.js` hacía lo
   mismo dos archivos más allá y NO lo filtraba: devolvía `p.maps_url` tal cual. Una línea de
   diferencia entre los dos, y solo se ve poniéndolos uno junto al otro.

   Así que esto los pone uno junto al otro, y en vez de comprobar cómo están escritos —una
   prueba de ortografía envejece mal— saca las dos funciones del archivo y LAS CORRE. Es la
   misma técnica que `pruebas/puente.mjs:173-181` usa con el Worker: las dos son puras y no
   tocan el DOM, así que corren en node tal cual.

   Se corre con pruebas/correr.sh, como todas.
*/
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/** Saca una función del archivo por su nombre y la devuelve ejecutable.
 *  Se cuentan las llaves en vez de buscar `\n}` para no depender de la indentación: un
 *  reformateo del archivo no debería tumbar esta prueba, y un cambio de comportamiento sí. */
function sacar(archivo, nombre) {
  const src = readFileSync(join(RAIZ, archivo), 'utf8');
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), n = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (!n) break; }
  }
  try { return (0, eval)('(' + src.slice(i, k + 1) + ')'); } catch (_) { return null; }
}

/* Las dos que arman el enlace a Maps. Son los dos únicos sitios donde `maps_url` acaba en un
   href, y por eso las dos tienen que decir lo mismo. */
const CONSTRUCTORES = [
  ['js/mod/proyectos.js', 'urlMapa',  'la ficha de un proyecto (js/mod/proyectos.js:676)'],
  ['js/mod/agenda.js',    'linkMapa', 'la agenda y la ficha del día (js/mod/agenda.js:550 y :1121)'],
];

/* Lo que de verdad puede llegar en `maps_url`. Los tres primeros son enlaces legítimos que NO
   se pueden romper: un filtro que además rompa el trabajo diario se quita a la semana. */
const BUENOS = [
  ['https://maps.app.goo.gl/aBcD1234', 'el link corto que manda el cliente por WhatsApp'],
  ['https://www.google.com/maps/place/Tlajomulco', 'el link largo de Maps'],
  ['http://goo.gl/maps/xyz', 'un link viejo, todavía en http'],
];
const MALOS = [
  ['javascript:alert(document.cookie)', 'el esquema javascript: pelado'],
  ['JaVaScRiPt:alert(1)', 'el mismo, con mayúsculas alternadas'],
  ['  javascript:alert(1)', 'con espacios delante, que el navegador recorta'],
  ['java\tscript:alert(1)', 'partido con un tabulador, que el navegador también recorta'],
  ['data:text/html,<script>alert(1)</script>', 'un documento entero en un data:'],
  ['vbscript:msgbox(1)', 'el equivalente viejo de Internet Explorer'],
];

console.log('\nEL LINK A MAPS: los dos sitios donde `maps_url` acaba en un href');
for (const [archivo, nombre, donde] of CONSTRUCTORES) {
  const fn = sacar(archivo, nombre);
  if (!fn) { mal(`no pude sacar \`${nombre}\` de ${archivo}: ¿le cambiaron el nombre?`); continue; }

  let bienes = 0, males = 0;
  for (const [url, que] of BUENOS) {
    const r = String(fn({ maps_url: url, lat: null, lng: null, dir_texto: '' }) || '');
    if (r === url) bienes++;
    else mal(`${nombre}() rompió un enlace legítimo — ${que}\n` +
             `      entró: ${url}\n      salió: ${r || '(vacío)'}`);
  }
  for (const [url, que] of MALOS) {
    const r = String(fn({ maps_url: url, lat: null, lng: null, dir_texto: 'Av. Vallarta 100' }) || '');
    if (/^https?:\/\//i.test(r) || r === '') males++;
    else mal(`${nombre}() deja pasar ${que} hasta el href de ${donde}.\n` +
             `      entró: ${JSON.stringify(url)}\n      salió: ${JSON.stringify(r)}\n` +
             '      `esc()` no lo detiene: escapa HTML y un href es un contexto de URL. Tocar\n' +
             '      «Ver en Maps» ejecutaría eso con acceso al historial, a las API keys y al\n' +
             '      token del puente. El arreglo es el mismo que ya está en js/mod/agenda.js:566:\n' +
             "      `if (/^https?:\\/\\//i.test(String(p.maps_url || ''))) return String(p.maps_url);`");
  }
  if (bienes === BUENOS.length && males === MALOS.length)
    bien(`${nombre}() de ${archivo}: deja pasar los ${bienes} enlaces buenos y filtra los ${males} malos`);
}

/* Y el de WhatsApp, que es el otro dato que el usuario teclea y acaba en un href. Este nunca
   tuvo el problema —arma la URL desde los dígitos y descarta todo lo demás— y la prueba está
   para que siga siendo así el día que alguien quiera «respetar el formato que puso el usuario». */
console.log('\nEL LINK A WHATSAPP');
{
  const { linkWa } = await import('../js/nucleo/ui.js').catch(() => ({}));
  const fn = linkWa || sacar('js/nucleo/ui.js', 'linkWa');
  if (!fn) mal('no pude cargar `linkWa` de js/nucleo/ui.js');
  else {
    const casos = [
      ['3312345678', 'diez dígitos: se le pone la lada 52'],
      ['33 1234 5678', 'con espacios, como se copia de una tarjeta'],
      ['javascript:alert(1)', 'alguien pegó código en el campo del teléfono'],
      ['+52 (33) 1234-5678', 'con lada, paréntesis y guiones'],
    ];
    let ok = 0;
    for (const [tel, que] of casos) {
      const r = String(fn(tel, 'hola') || '');
      if (r.startsWith('https://wa.me/')) ok++;
      else mal(`linkWa(${JSON.stringify(tel)}) no salió como https://wa.me/… — ${que}\n      salió: ${r}`);
    }
    if (ok === casos.length) bien(`linkWa() siempre sale a https://wa.me/, con los ${ok} casos incluido el del código pegado`);
  }
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nNingún dato del usuario llega crudo a un href.');
process.exit(fallos ? 1 : 0);
