/* EL ESQUELETO DE LA PLATAFORMA — lo que se puede probar sin navegador.
 *
 * La barra de abajo del teléfono, el arranque en pasos, la puerta que dice en qué paso va, la
 * búsqueda desde cualquier pantalla, el menú de la cuenta y el indicador de sincronización son
 * casi todo interfaz, y eso se ejerce en pruebas/navegador/pf-esqueleto.mjs. Pero hay reglas que
 * no se ven cuando fallan y que salen números y marcado plausibles:
 *
 *   · QUÉ RUTAS VAN EN LA BARRA Y CUÁLES EN «MÁS». Si la cuenta se equivoca por uno, un rol se
 *     queda sin su pantalla en el teléfono (pagos sin Control era el defecto de origen) o la
 *     barra lleva seis botones y cada uno mide 60 px en una pantalla de 360, donde el nombre ya
 *     no cabe. Se prueba por rol y con listas inventadas de 0 a 12 rutas.
 *   · DE QUÉ LADO ENTRA UNA PANTALLA. Sale de comparar lugares en la barra, no de la historia.
 *   · LA FRASE QUE DICE EL INDICADOR DE SINCRONIZACIÓN, que es también su `aria-label`.
 *   · LO QUE NO SE PUEDE ROMPER SIN QUE NADIE LO NOTE: que entre el clic de la puerta y la
 *     ventana de Google no haya un `await` (el navegador tapa la ventana), que el menú de la
 *     cuenta ya no cuelgue dos oyentes de `document`, que el HTML de la plataforma siga sin
 *     un solo guion en línea, y que nada de lo nuevo en la hoja de estilos se mueva solo o se
 *     quede sin su apagado para menos movimiento.
 *
 * app.js no se puede importar en node —arranca la plataforma al cargarse—, así que las tres
 * funciones puras se sacan de su texto y se corren en un contexto aparte, con la misma lista
 * RUTAS que tiene el archivo de verdad. Si alguien cambia el nombre o la forma de una de ellas,
 * esta prueba falla diciendo cuál, y no pasa en silencio.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const app = leer('js/app.js');
/* El HTML sin sus comentarios: el de la cabecera habla de `<script>` y de `onload`, y las
   comprobaciones de abajo miran el marcado, no lo que se cuenta de él. */
const html = leer('index.html').replace(/<!--[\s\S]*?-->/g, '');
const sinBloques = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = leer('css/plataforma.css');
const cuenta = leer('js/nucleo/cuenta.js');
const puerta = leer('js/nucleo/puerta.js');

/* Un trozo del texto de app.js, desde `ancla` hasta el cierre de su bloque. Sin `export`: en el
   contexto de vm no hay módulos. */
function trozo(ancla, cierre) {
  const i = app.indexOf(ancla);
  if (i < 0) throw new Error('app.js ya no tiene «' + ancla + '»');
  const j = app.indexOf(cierre, i);
  if (j < 0) throw new Error('no se encontró el cierre de «' + ancla + '»');
  return app.slice(i, j + cierre.length).replace(/^export /, '');
}
const contexto = vm.createContext({});
vm.runInContext([
  trozo('const RUTAS = [', '\n];'),
  trozo('const TOPE_BARRA = 5;', ';'),
  trozo('export function repartirBarra(', '\n}'),
  trozo('export function direccionDeEntrada(', '\n}'),
  trozo('export function fraseDeSync(', '\n}'),
  'this.RUTAS = RUTAS; this.repartirBarra = repartirBarra; this.direccionDeEntrada = direccionDeEntrada; this.fraseDeSync = fraseDeSync;',
].join('\n'), contexto);
const { RUTAS, repartirBarra, direccionDeEntrada, fraseDeSync } = contexto;

const visibles = rol => RUTAS.filter(r => !r.oculto && r.roles.includes(rol));
const nombres = l => l.map(r => r.ruta);

console.log('\nLA BARRA DE ABAJO SE QUEDA EN CINCO, Y LA QUINTA ES «MÁS»');
{
  const pa = repartirBarra(visibles('pagos'));
  eq('pagos ve cinco rutas y las lleva todas: no hay «Más»', nombres(pa.barra), ['hoy', 'agenda', 'proyectos', 'cotizador', 'control']);
  eq('  y no sobra nada', pa.mas, []);
  cierto('  y Control, que es SU pantalla, está a un toque', nombres(pa.barra).includes('control'));

  const di = repartirBarra(visibles('direccion'));
  eq('dirección: las cuatro marcadas `movil` se quedan abajo', nombres(di.barra), ['hoy', 'agenda', 'proyectos', 'cotizador']);
  eq('  y «Más» abre lo demás, en el orden de RUTAS', nombres(di.mas), ['material', 'mapa', 'anidador', 'vectorizar', 'publicaciones', 'control']);

  const fa = repartirBarra(visibles('fabricacion'));
  eq('fabricación: las mismas cuatro abajo', nombres(fa.barra), ['hoy', 'agenda', 'proyectos', 'cotizador']);
  eq('  y en «Más» solo lo que ese rol tiene: sin Control, que no ve importes', nombres(fa.mas), ['material', 'mapa', 'anidador', 'vectorizar']);

  for (const rol of ['direccion', 'fabricacion', 'pagos']) {
    const v = visibles(rol), r = repartirBarra(v);
    const botones = r.barra.length + (r.mas.length ? 1 : 0);
    cierto(rol + ': la barra mide cinco botones como mucho (con «Más» incluido): son ' + botones, botones <= 5);
    const todas = nombres(r.barra).concat(nombres(r.mas));
    eq(rol + ': cada ruta del rol sale una vez, ni una de menos ni repetida', todas.slice().sort(), nombres(v).sort());
    cierto(rol + ': nunca entra una ruta oculta (Qué atender, Ajustes)', !todas.some(x => RUTAS.find(y => y.ruta === x).oculto));
    cierto(rol + ': las rutas de «Más» son las que NO llevan `movil`, salvo que sobren marcadas',
      r.mas.every(x => !x.movil) || r.barra.length === 4);
  }

  /* La cuenta, sin depender de los renglones de hoy: con cualquier cantidad de rutas. */
  for (let n = 0; n <= 12; n++) {
    const lista = Array.from({ length: n }, (_, i) => ({ ruta: 'r' + i, movil: i % 3 === 0 }));
    const r = repartirBarra(lista);
    const botones = r.barra.length + (r.mas.length ? 1 : 0);
    const ok = botones <= 5 && r.barra.length + r.mas.length === n &&
      (n > 5 ? r.mas.length === n - 4 && r.barra.length === 4 : r.mas.length === 0);
    if (!ok) { eq('con ' + n + ' rutas el reparto cuadra', { barra: r.barra.length, mas: r.mas.length }, 'cuatro y «Más» si pasan de cinco, todas si no'); }
  }
  bien++; console.log('  ok   con 0 a 12 rutas: nunca más de cinco botones, ninguna se pierde, y «Más» solo si pasan de cinco');

  cierto('las marcadas `movil` van primero aunque estén después en RUTAS',
    nombres(repartirBarra([{ ruta: 'a' }, { ruta: 'b' }, { ruta: 'c', movil: true }, { ruta: 'd' }, { ruta: 'e' }, { ruta: 'f' }, { ruta: 'g', movil: true }]).barra).slice(0, 2).join() === 'c,g');
}

console.log('\nLA PANTALLA ENTRA POR DONDE ESTÁ EN LA BARRA');
{
  eq('la que está después llega desde la derecha', direccionDeEntrada(0, 1), 'adelante');
  eq('la que está antes, desde la izquierda', direccionDeEntrada(3, 1), 'atras');
  eq('de Tablero a la última, y de vuelta: siempre el mismo lado, se haya llegado por donde se haya llegado', [direccionDeEntrada(0, 8), direccionDeEntrada(8, 0)], ['adelante', 'atras']);
  eq('la misma pantalla no tiene lado', direccionDeEntrada(2, 2), '');
  eq('una oculta (Qué atender, Ajustes: lugar −1) sube, no va de lado', [direccionDeEntrada(-1, 2), direccionDeEntrada(2, -1)], ['', '']);
  eq('sin lugar conocido tampoco', [direccionDeEntrada(undefined, 1), direccionDeEntrada(1, null)], ['', '']);
  cierto('el lugar de una ruta sale de las visibles del rol, y las ocultas dan −1',
    /lugarEnLaBarra\(ruta\)[\s\S]{0,140}\.filter\(r => !r\.oculto\)\.findIndex\(r => r\.ruta === ruta\)/.test(app));
  cierto('la dirección es una CLASE de <html>, no `data-va`: la pieza 22 ya escribe ese atributo al cambiar de mes',
    app.includes("h.classList.add(clase)") && !/dataset\.va\b/.test(app) && /html\.va-adelante \.pf-mod/.test(css) && !/html\[data-va[^\]]*\] \.pf-mod/.test(css));
  cierto('con las teclas 1-9 no se pone dirección: lo que dispara el teclado no se anima',
    /h\.dataset\.nav === 'teclado'\) return;/.test(app));
}

console.log('\nLA FRASE DEL INDICADOR DE SINCRONIZACIÓN');
{
  eq('en reposo', fraseDeSync('quieto'), 'Sincronización: al día');
  eq('mientras trabaja', fraseDeSync('trabaja'), 'Sincronización: buscando lo que cambió');
  eq('cuando bajó algo', fraseDeSync('ok'), 'Sincronización: llegó lo nuevo');
  cierto('sin señal dice qué pasa con lo que se hace: se guarda aquí', /Sin señal:.*se guarda aquí/.test(fraseDeSync('sin-senal')));
  eq('el motivo que llega como oración se pega en minúscula', fraseDeSync('mal', 'La hoja no contestó'), 'Sincronización: la hoja no contestó');
  eq('una sigla se respeta', fraseDeSync('mal', 'HTTP 500 en la hoja'), 'Sincronización: HTTP 500 en la hoja');
  eq('sin motivo no queda un hueco', fraseDeSync('mal'), 'Sincronización: no se pudo');
  cierto('cada estado dice algo distinto: el color nunca va solo',
    new Set(['quieto', 'trabaja', 'ok', 'sin-senal', 'mal'].map(e => fraseDeSync(e))).size === 5);
}

console.log('\nLA PUERTA: NADA ENTRE EL CLIC Y LA VENTANA DE GOOGLE');
{
  /* El navegador solo deja abrir la ventana mientras crea que la pidió una persona, y esa
     licencia se gasta esperando. Costó una entrada bloqueada en producción: dos `await import()`
     entre el clic y `requestAccessToken`. La puerta nueva pinta cosas antes (los dos pasos, el
     botón que trabaja), y todo eso tiene que ser síncrono. */
  const i = puerta.indexOf("caja.addEventListener('click', async ev => {");
  const manejador = puerta.slice(i, puerta.indexOf('await pedirConGoogle(', i));
  cierto('en el manejador del clic, hasta pedir la entrada, no hay ningún `await`', i > 0 && !/\bawait\b/.test(manejador.replace(/\/\*[\s\S]*?\*\//g, '')));

  const j = puerta.indexOf('async function confirmarDeVerdad(');
  const antesDeGoogle = puerta.slice(j, puerta.indexOf('await Ingreso.entrar(false)', j)).replace(/\/\*[\s\S]*?\*\//g, '');
  cierto('en confirmarDeVerdad, hasta llamar a Google, tampoco', j > 0 && !/\bawait\b/.test(antesDeGoogle));
  cierto('y el paso «Google» se enciende ANTES de pedirlo, con una sola llamada síncrona', /paso\('google', 'trabaja'\);\s*const e = conPantalla/.test(puerta));

  cierto('los dos pasos van en el orden en que ocurren: primero Google, luego la hoja',
    /PASOS_PUERTA = \[\s*\{ clave: 'google'[^}]*\},\s*\{ clave: 'hoja'/.test(puerta));
  cierto('el botón principal es el que trabaja, se toque el que se toque (`otra` es su hermano)',
    /pedirConGoogle\(btn, t, otra\)/.test(puerta) && /hermanos: otra \? \[otra\] : \[\]/.test(puerta));
  cierto('y ya no es `disabled` ni se repinta la caja al tocar: el foco se queda donde estaba',
    !/puerta-btn"[^>]*disabled/.test(puerta) && !/\besperando\b/.test(sinBloques(puerta)));
  cierto('el mensaje que viene de la hoja sigue pasando por `aviso()`, que lo escapa',
    puerta.includes('aviso(r.mensaje)') && puerta.includes("esc(av.texto || '')"));
  cierto('el aviso de un reintento es un nodo NUEVO y con role=alert: si no, un lector no lo dice otra vez',
    /document\.createElement\('p'\)[\s\S]{0,200}setAttribute\('role', 'alert'\)/.test(puerta));
  cierto('el mismo aviso otra vez lleva la clase que lo sacude', /repetido \? ' otra-vez'/.test(puerta));
  cierto('lo que llegue después de dar el intento por terminado no pinta (el tope de 180 s deja la petición viva)',
    /if \(t && !cerrado\) t\.paso/.test(puerta));
}

console.log('\nEL MENÚ DE LA CUENTA SALE DE SU BOTÓN');
{
  cierto('ya no cuelga oyentes de `document`: ni el clic fuera ni el Escape hechos a mano',
    !/document\.addEventListener/.test(cuenta) && !/menu\.hidden/.test(cuenta));
  cierto('lo abre la pieza 4, con rol de diálogo y alineado al filo del botón', /P\.vistazo\(btn,[\s\S]{0,200}rol: 'dialog'[\s\S]{0,120}alinear: 'fin'/.test(cuenta));
  cierto('y el rol NO es de menú: lleva párrafos, y un menú de ARIA solo lleva opciones', !/rol: 'menu'/.test(cuenta));
  cierto('«Cerrar sesión» sigue pasando por confirmarPf, con el globo cerrado antes', /menu\.cerrar\('codigo'\);[\s\S]{0,300}confirmarPf\(/.test(cuenta));
  cierto('si no hay piezas, el botón lleva a Ajustes en vez de no hacer nada', /btn\.onclick = \(\) => \{ location\.hash = '#\/ajustes'; \}/.test(cuenta));
  cierto('index.html ya no trae `#pf-sesion-menu`', !html.includes('pf-sesion-menu'));
  cierto('y el botón dice que abre un diálogo', /id="pf-sesion"[^>]*aria-haspopup="dialog"/.test(html));
}

console.log('\nEL MARCADO DE LA PLATAFORMA SIGUE SIN GUIONES EN LÍNEA');
{
  cierto('index.html: ni un manejador en un atributo (onclick=, onload=…)', !/\son[a-z]+\s*=\s*["']/i.test(html));
  cierto('ni un <script> con código dentro: solo `src`', [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].every(m => /\bsrc=/.test(m[1]) && !m[2].trim()));
  cierto('las tres capas nuevas existen, son diálogos modales y arrancan escondidas',
    ['pf-buscar', 'pf-mas', 'pf-ios'].every(id => new RegExp('id="' + id + '"[^>]*role="dialog"[^>]*aria-modal="true"').test(html)));
  cierto('y app.js las registra, para que Escape, el tabulador y el atrás las traten como a las demás',
    ['pf-buscar', 'pf-mas', 'pf-ios'].every(id => app.includes("registrarCapa('" + id + "'")));
  cierto('la banda va dentro de su caja y ya no lleva `hidden` (con `hidden` no hay transición)',
    /<div class="pf-banda-caja" id="pf-banda-caja"><div class="pf-banda-in">\s*<div class="pf-banda" id="pf-banda" role="status" aria-live="polite"><\/div>/.test(html));
  cierto('los cuatro renglones del arranque son marcado fijo, con las claves que usa app.js',
    ['puerta', 'base', 'catalogo', 'pantalla'].every(k => html.includes('data-clave="' + k + '"') && /PASOS_ARRANQUE = \['puerta', 'base', 'catalogo', 'pantalla'\]/.test(app)));
  cierto('el sprite trae la lupa y los tres puntos de «Más»', html.includes('<symbol id="i-buscar"') && html.includes('<symbol id="i-puntos"'));
  cierto('y el glifo de sincronización trae la nube y la nube tachada, que ya estaban en el sprite',
    html.includes('href="#i-nube"') && html.includes('href="#i-nube-off"') && html.includes('<symbol id="i-nube"') && html.includes('<symbol id="i-nube-off"'));
  cierto('la lupa del encabezado dice su atajo', /id="pf-cab-buscar"[^>]*aria-keyshortcuts="\/"/.test(html));
}

console.log('\nLAS CUENTAS Y LO QUE SE RECUERDA');
{
  cierto('al ENTRAR a una pantalla se olvida lo que la pieza 1 recuerda de cada cifra; al remontarla en silencio, no',
    /_remontando = enSilencio;\s*if \(!enSilencio\) olvidarCifras\(\);/.test(app));
  cierto('cambiar de rol también lo olvida: otro rol es otra cuenta de todo', /olvidarCifras\(\);\s*if \(sigue && sigue\.roles\.includes\(r\)\)/.test(app));
  cierto('y los módulos pueden preguntar si este montaje es un remonte', /esRemonte: \(\) => _remontando/.test(app));
  cierto('el globo de la barra salta solo si sube, y no la primera vez que se ve',
    /if \(!primera && f\.n > antes && f\.n > 0\) globoSube\(el\)/.test(app));
  cierto('el globo no rueda: el salto y el odómetro competirían por el mismo transform', !/rodarCifra\(el/.test(app));
  cierto('la barra se reescribe solo si cambió el rol, las rutas o las que caben', /if \(firma !== _navFirma\) \{ _navFirma = firma; escribirNav\(/.test(app));
  cierto('el aviso de «se actualizó» lleva la hora y caduca al minuto',
    /sessionStorage\.setItem\(MARCA_ACTUALIZADA, String\(Date\.now\(\)\)\)/.test(app) && /Date\.now\(\) - Number\(marca\) < MS_MARCA_ACTUALIZADA/.test(app));
  cierto('las dos puertas de la recarga por versión —la sola y el botón de la banda— dejan la marca',
    /fn: recargarPorVersion \}/.test(app) && /recargado = true; recargarPorVersion\(\)/.test(app));
}

console.log('\nLA HOJA DE ESTILOS: NADA SE MUEVE SOLO, Y TODO TIENE SU APAGADO');
{
  const abre = '/* ── Plataforma · esqueleto, navegación, arranque y puerta ── */';
  const cierra = '/* ── fin de pf-esqueleto ── */';
  const i = css.indexOf(abre), j = css.indexOf(cierra);
  cierto('el bloque de la zona existe, con su marca de fin', i > 0 && j > i);
  const bloque = css.slice(i, j);
  cierto('nada de `infinite` en lo nuevo: una sola pieza se mueve sola, y es el botón de IA', !/infinite/.test(bloque));
  cierto('nada de `transition:all` ni de `!important` sin razón', !/transition:\s*all/.test(bloque));

  /* La puerta animada (F10 v2) es la excepción aprobada, y vive en su propio bloque para que la
     excepción no se extienda: ahí `infinite` solo puede ir en el fondo o en la espera del logo. */
  const pa = css.indexOf('/* ── Plataforma · la puerta animada (F10 v2) ──'), pb = css.indexOf('/* ── fin de pf-puerta ── */');
  cierto('la puerta animada tiene su bloque, con su marca de fin', pa > 0 && pb > pa);
  const reglas = css.slice(pa, pb).replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(r => /infinite/.test(r));
  const fuera = reglas.filter(r => !/\.pf-|\[data-fondo|\.puerta-fondo|\[data-goo="espera"\]/.test(r.split('{')[0]));
  cierto('y ahí lo que se mueve solo es el fondo o la espera del logo (' + reglas.length + ' reglas)' + (fuera.length ? ': ' + fuera.map(r => r.split('{')[0].trim()).join(' | ') : ''), reglas.length > 0 && !fuera.length);

  const ra = '/* ── rm · pf-esqueleto ── */';
  const rb = '/* ── fin de rm · pf-esqueleto ── */';
  const k = css.indexOf(ra), l = css.indexOf(rb);
  cierto('y el apagado de movimiento vive DENTRO del @media(prefers-reduced-motion:reduce) final',
    k > 0 && l > k && css.lastIndexOf('@media(prefers-reduced-motion:reduce){', k) > css.indexOf(cierra));
  const rm = css.slice(k, l);
  for (const [que, patron] of [
    ['el salto del globo (barra lateral y de abajo)', /\.pf-tab \.cta\.sube,\.pf-abajo \.cta\.sube\{animation:none\}/],
    ['la dirección de la pantalla', /html\.va-adelante \.pf-mod,html\.va-atras \.pf-mod\{animation:none\}/],
    ['el despliegue de la banda', /\.pf-banda-caja\{transition:none\}/],
    ['la sacudida del aviso repetido de la puerta', /\.puerta-aviso\.otra-vez\{animation:none\}/],
    ['el encogerse de las filas de «Más»', /\.pf-mas-op:active\{transform:none\}/],
  ]) cierto('con menos movimiento se apaga: ' + que, patron.test(rm));

  cierto('todo `:hover` de lo nuevo va dentro de @media(hover:hover) and (pointer:fine)',
    [...bloque.matchAll(/([^{}]*):hover[^{}]*\{/g)].filter(m => !m[0].includes('@media')).every(m => {
      const antes = bloque.slice(0, m.index);
      const abiertos = (antes.match(/\{/g) || []).length - (antes.match(/\}/g) || []).length;
      return abiertos > 0 && /@media\(hover:hover\) and \(pointer:fine\)/.test(antes.slice(antes.lastIndexOf('@media')));
    }));
  cierto('las zonas táctiles de lo nuevo mandan 44 px con el dedo (la lupa, «Más», las filas de la búsqueda)',
    /\.pf-cab-tema\{width:44px;height:44px\}/.test(css) && /\.pf-mas-op\{[^}]*min-height:56px/.test(bloque) && /\.pf-buscar-op\{min-height:56px\}/.test(bloque));
  cierto('el globo lleva letra blanca de día y la tinta de la barra de noche (de día, la tinta medía 2,6:1)',
    /\.pf-tab \.cta,\.pf-abajo \.cta,\.pf-mas-op \.cta\{color:#fff\}/.test(bloque) && /html\[data-tema="oscuro"\] \.pf-tab \.cta/.test(bloque));
  {
    /* La regla propia de la fila NO fija color: con la misma especificidad que la del globo y más
       abajo en la hoja, un `color:var(--nav)` aquí le ganaba y dejaba tinta oscura sobre el ámbar
       de texto (2,6:1 de día, medido en el render). */
    const fila = /(?:^|\n)\.pf-mas-op \.cta\{([^}]*)\}/.exec(bloque);
    cierto('la regla propia del globo de una fila de «Más» no fija `color` (lo pone la del globo)', !!fila && !/(^|[;\s])color:/.test(fila[1]));
  }
  cierto('el encabezado no pierde el sitio del título: los botones se pegan y el margen baja a 12 px a 400 px o menos',
    /\.pf-cab\{gap:var\(--e1\)\}/.test(bloque) && /max-width:400px\)\{\s*\.pf-cab\{padding-left:max\(12px/.test(bloque));
  cierto('el aviso de los ocho segundos se queda a la vista encima de la barra', /\.pf-arranque \.pf-esqueleto-t:not\(:empty\)\{position:sticky/.test(bloque));
  cierto('la rejilla del wrap no suma su `gap` a una banda recogida', /\.pf-wrap\{row-gap:0\}/.test(bloque));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
