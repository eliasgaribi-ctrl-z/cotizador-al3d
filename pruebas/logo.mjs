/* EL LOGOTIPO DEL PROYECTO: de qué archivo sale la miniatura (js/datos/logo.js).
 *
 * Elegir mal no truena: enseña el logo de OTRO trabajo, o el .cdr que Drive no sabe dibujar
 * como un hueco roto. Lo que decide es puro, así que se prueba aquí, en node.
 *
 * Uso:  node pruebas/logo.mjs
 */
import { idDeDrive, miniaturaDrive, archivoDelLogo, imagenDeCotizacion, logoDe } from '../js/datos/logo.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

const f = (nombre, id, tipo, modificado = 1) => ({ nombre, tipo, modificado, url: 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk' });
const CDR = f('Escalas y Logotipo de Trevaré Suites.cdr', 'CDR0000000001', 'application/octet-stream');
const COPIA = f('Backup_of_Escalas y Logotipo de Trevaré Suites.cdr', 'CDR0000000002', 'application/octet-stream');
const ORDEN = f('Ordenes de fabricacion.pdf', 'PDF0000000001', 'application/pdf');
const PNG = f('render fachada.png', 'PNG0000000001', 'image/png');
const LOGO = f('Logo Trevare.jpg', 'JPG0000000001', 'image/jpeg');

console.log('\nEL ID DE DRIVE');
eq('de la liga de un archivo', idDeDrive(PNG.url), 'PNG0000000001');
eq('de una liga con ?id=', idDeDrive('https://drive.google.com/open?id=abcdefghij_-12'), 'abcdefghij_-12');
eq('de otro sitio, nada', idDeDrive('https://evil.example/file/d/abcdefghijkl/view'), '');
eq('con comillas para salirse del atributo, nada', idDeDrive('https://drive.google.com/file/d/"onerror=x'), '');
eq('la miniatura', miniaturaDrive('PNG0000000001', 160), 'https://drive.google.com/thumbnail?id=PNG0000000001&sz=w160');

console.log('\nQUÉ ARCHIVO DE LA CARPETA ES EL LOGO');
eq('el .cdr no: Drive no lo dibuja, aunque diga «Logotipo»', archivoDelLogo([CDR, COPIA]), null);
eq('las órdenes, si es lo único que se puede dibujar', archivoDelLogo([CDR, COPIA, ORDEN]).nombre, ORDEN.nombre);
eq('una imagen gana a las órdenes', archivoDelLogo([CDR, ORDEN, PNG]).nombre, PNG.nombre);
eq('y la imagen con «logo» en el nombre gana a todo', archivoDelLogo([PNG, ORDEN, LOGO, CDR]).nombre, LOGO.nombre);
eq('entre dos logos, el más reciente', archivoDelLogo([{ ...LOGO, modificado: 1 }, { ...LOGO, nombre: 'logo v2.png', tipo: 'image/png', modificado: 9 }]).nombre, 'logo v2.png');
eq('sin carpeta, nada', archivoDelLogo(null), null);

console.log('\nLA IMAGEN DE LA COTIZACIÓN');
eq('un data URL de imagen pasa', imagenDeCotizacion({ aiFile: { url: 'data:image/png;base64,iVBORw0KGgo=' } }), 'data:image/png;base64,iVBORw0KGgo=');
eq('un PDF no es miniatura', imagenDeCotizacion({ aiFile: { url: 'data:application/pdf;base64,JVBERi0=' } }), '');
eq('ni un data URL que se sale del atributo', imagenDeCotizacion({ aiFile: { url: 'data:image/png;base64,AAA=" onerror="x' } }), '');
eq('el aiFile congelado (sin url), nada', imagenDeCotizacion({ aiFile: { name: 'a.png', type: 'image/png', url: '' } }), '');

console.log('\nEL LOGO DEL PROYECTO');
const p = { id: 'p1', nombre: 'Cuquis - Trevaré Suites' };
const IMG = 'data:image/jpeg;base64,/9j/4AAQ';
eq('de Drive primero, que lo ve todo el equipo', logoDe(p, { carpeta: { archivos: [ORDEN] }, cotizacion: IMG, ancho: 200 }),
  { src: 'https://drive.google.com/thumbnail?id=PDF0000000001&sz=w200', fuente: 'drive', nombre: ORDEN.nombre, abrir: ORDEN.url });
eq('sin nada que dibujar en Drive, la de la cotización', logoDe(p, { carpeta: { archivos: [CDR] }, cotizacion: IMG }).fuente, 'cotizacion');
eq('sin ninguna de las dos, null', logoDe(p, {}), null);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
