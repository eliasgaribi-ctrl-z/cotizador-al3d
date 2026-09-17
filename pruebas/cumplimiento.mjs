/* LO QUE LA APP PROMETE EN legal.html TIENE QUE SER VERDAD EN EL CÓDIGO.

   Septiembre de 2026: se le aplicó a la app la lista de cumplimiento con la que se revisa un sitio
   —aviso de privacidad, términos, cancelaciones, cookies, consentimiento en los formularios, terceros,
   licencias, datos de la empresa, borrado de datos— adaptada a lo que esta app hace de verdad: no
   tiene cuentas, ni cookies, ni correos, ni reseñas, y guarda todo en el dispositivo. Una página legal
   que promete «las tipografías se sirven desde este sitio» mientras el HTML sigue pidiéndolas a
   Google es peor que no tener página. Esta prueba amarra cada promesa a un hecho del repo:

   · legal.html existe, con sus diez apartados y los datos de la empresa que imprime el PDF.
   · Ninguna página pide tipografías a fonts.googleapis.com; css/fuentes.css apunta a archivos que
     existen, cada familia trae su licencia OFL, y el service worker los cachea junto con legal.html.
   · Los términos viven en UNA función (terminosCotizacion) que leen el PDF y la página; el
     apartado 8 dejó de amarrar el consentimiento de imágenes al pago.
   · El formulario del cliente enlaza el aviso; el modal de IA dice a dónde manda el archivo;
     Ajustes de la plataforma enlaza la página; el cuaderno del cliente tiene «Borrar sus datos».

   Uso: node pruebas/cumplimiento.mjs */
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(RAIZ, f), 'utf8');
let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };

console.log('\nLA PÁGINA LEGAL');
cierto(existsSync(join(RAIZ, 'legal.html')), 'legal.html existe');
const legal = leer('legal.html');
for (const id of ['empresa', 'privacidad', 'terminos', 'cancelaciones', 'uso', 'mensajes', 'eliminacion', 'terceros', 'accesibilidad', 'licencias'])
  cierto(legal.includes('id="' + id + '"'), 'tiene el apartado #' + id);
const entrega = leer('js/cotizador/entrega.js');
const empresa = {};
for (const k of ['nombre', 'whatsapp', 'oficina']) {
  const m = new RegExp(k + ":\\s*'([^']+)'").exec(entrega);
  empresa[k] = m ? m[1] : '';
}
cierto(empresa.nombre && legal.includes(empresa.nombre), 'dice el nombre comercial que firma el PDF («' + empresa.nombre + '»)');
cierto(empresa.whatsapp && legal.includes(empresa.whatsapp), 'y el WhatsApp del PDF (' + empresa.whatsapp + ')');
cierto(empresa.oficina && legal.includes(empresa.oficina.split(' Col.')[0]), 'y la dirección del taller');
cierto(legal.includes('src="js/tema.js"') && legal.includes('css/sistema.css'), 'usa el tema y el sistema de diseño de la app');
cierto(legal.includes('js/cotizador/catalogo.js') && legal.includes('terminosCotizacion('), 'pinta los términos desde terminosCotizacion, no desde una copia');
cierto(/Google Fonts<\/td><td>Ya no/.test(legal), 'la tabla de terceros dice que Google Fonts ya no interviene');
cierto(!/cookie/i.test(legal) || /no usa cookies/i.test(legal), 'habla de cookies solo para decir que no las usa');

console.log('\nLAS TIPOGRAFÍAS VAN CON EL SITIO');
for (const f of ['cotizador.html', 'index.html', 'anidador-vectores/index.html', 'legal.html']) {
  const h = leer(f);
  const links = h.match(/<link[^>]+>/g) || [];
  cierto(!links.some(l => /googleapis|gstatic/.test(l)), f + ': ningún <link> pide nada a Google');
  cierto(links.some(l => /fuentes\.css/.test(l)), f + ': carga css/fuentes.css');
}
cierto(!/<link[^>]*googleapis/.test(entrega), 'el documento del PDF tampoco enlaza a Google');
cierto(/fuentes\.css/.test(entrega), 'y enlaza css/fuentes.css con la URL del propio sitio');
const fuentes = leer('css/fuentes.css');
const archivos = [...fuentes.matchAll(/url\(\.\.\/fonts\/([^)]+)\)/g)].map(m => m[1]);
cierto(archivos.length >= 6, 'css/fuentes.css declara ' + archivos.length + ' archivos');
cierto(archivos.every(a => existsSync(join(RAIZ, 'fonts', a))), 'y todos existen en fonts/');
cierto(!/https?:\/\//.test(fuentes.replace(/\/\*[\s\S]*?\*\//g, '')), 'y ninguna regla apunta fuera del sitio');
const familias = [...new Set([...fuentes.matchAll(/font-family:'([^']+)'/g)].map(m => m[1]))];
cierto(familias.length === 3, 'tres familias: ' + familias.join(', '));
for (const fam of familias) {
  const lic = join(RAIZ, 'fonts', 'OFL-' + fam + '.txt');
  cierto(existsSync(lic) && /SIL Open Font License/.test(readFileSync(lic, 'utf8')), fam + ' trae su licencia SIL OFL al lado');
}
const sw = leer('sw.js');
const lista = (/const APP_FILES = \[([\s\S]*?)\];/.exec(sw) || [, ''])[1];
cierto(/'\.\/legal\.html'/.test(lista), 'sw.js cachea legal.html');
cierto(/'\.\/css\/fuentes\.css'/.test(lista), 'sw.js cachea css/fuentes.css');
cierto(archivos.every(a => lista.includes("'./fonts/" + a + "'")), 'sw.js cachea cada archivo de fuente');

console.log('\nLOS TÉRMINOS: UNA COPIA, DOS LECTORES');
const ctx = vm.createContext({ console });
vm.runInContext(leer('js/cotizador/catalogo.js'), ctx, { filename: 'catalogo.js' });
const terminos = vm.runInContext("terminosCotizacion('')", ctx);
cierto(Array.isArray(terminos) && terminos.length === 8, 'terminosCotizacion() devuelve 8 apartados');
cierto(terminos.every(t => typeof t[0] === 'string' && Array.isArray(t[1]) && t[1].length), 'cada uno con título y puntos');
const conFecha = vm.runInContext("terminosCotizacion('26 sep 2026')", ctx);
cierto(conFecha[0][1].some(p => /válida por 10 días — hasta el 26 sep 2026\./.test(p)), 'con fecha, el apartado 1 dice hasta cuándo vale');
cierto(terminos[0][1].some(p => /válida por 10 días\.$/.test(p)), 'sin fecha, solo el plazo');
const imagenes = terminos[7][1].join(' ');
cierto(/salvo que indique lo contrario/.test(imagenes) && /no cambia el precio ni el servicio/.test(imagenes), 'el uso de imágenes se puede negar y negarse no cuesta nada');
cierto(!/const TERMINOS = \[/.test(entrega) && /terminosCotizacion\(/.test(entrega), 'el PDF ya no trae su propia lista: llama a terminosCotizacion');
cierto(/Aviso de privacidad<\/span>/.test(entrega) && /urlLegal/.test(entrega), 'el PDF imprime el aviso de privacidad con la dirección de la página');
cierto(/label:'Empresa',val:esc\(EMPRESA\.nombre\)/.test(entrega), 'y el pie de los términos nombra a la empresa');
cierto(/Precio sin IVA · si requiere factura se agrega el 16%/.test(entrega), 'un total sin IVA dice que con factura se agrega el 16%');

console.log('\nCONSENTIMIENTO, IA, AJUSTES Y BORRADO');
const cot = leer('cotizador.html');
cierto(/id="consent-datos"[^>]*>[^<]*<a href="legal\.html#privacidad" target="_blank" rel="noopener">/.test(cot), 'el formulario del cliente enlaza el aviso de privacidad en otra pestaña');
const ia = leer('js/cotizador/ia.js');
cierto(/AI_INTRO_ARCHIVO=.*proveedor de IA.*confidencialidad/.test(ia), 'el modal de IA dice a dónde manda el archivo y cuándo no usarlo');
const ajustes = leer('js/mod/ajustes.js');
cierto(/function cardLegal\(\)/.test(ajustes) && /href="legal\.html"/.test(ajustes) && /cardLegal\(\) \+/.test(ajustes), 'Ajustes de la plataforma enlaza la página legal');
const hist = leer('js/cotizador/historial.js');
cierto(/function cuaBorrarDatos\(clave\)/.test(hist) && /cuaBorrarDatos\('\$\{esc\(g\.clave\)\}'\)/.test(hist), 'el cuaderno del cliente tiene «Borrar sus datos»');
cierto(/armarRespaldo\(\),`cotizador-al3d-antes-de-borrar/.test(hist), 'que descarga un respaldo antes de borrar');
for (const k of ['HITOS_KEY', 'CANVA_KEY', 'CUA_NOTAS', "'al3d_pf_ganadas'"]) cierto(new RegExp('podar\\(' + k.replace(/[$'.]/g, '\\$&')).test(hist), 'y poda ' + k.replace(/'/g, ''));

console.log('');
if (fallas) { console.log(`${fallas} falla(s).`); process.exit(1); }
console.log('Cumplimiento: lo que la página promete está en el código.');
