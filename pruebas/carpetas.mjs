/* QUÉ CARPETA DE «TRABAJOS PENDIENTES» ES DE QUÉ PROYECTO.

   Con los nombres de verdad de octubre de 2026: los once proyectos en FABRICACION de la hoja y
   las ocho carpetas de Drive. Ninguna coincide letra por letra, y una carpeta equivocada en la
   ficha manda a cortar el diseño de otro cliente: por eso aquí se prueba tanto lo que SÍ se
   empareja como lo que se queda sin carpeta.

   Se corre con pruebas/correr.sh, como todas. */

import { carpetaDe, ordenarArchivos, palabras, estadoDe, sinCarpeta, nombreParaCarpeta } from '../js/datos/carpetas.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

const arch = (...n) => n.map(nombre => ({ nombre, url: 'https://drive.google.com/file/d/x/view', tipo: '' }));
const CARPETAS = [
  { nombre: 'Diego - Herrajes Innova 2', archivos: arch('Escalas y Logotipo de Herrajes Innova.cdr', 'Copia_de_seguridad_de_Escalas y Logotipo de Herrajes Innova.cdr') },
  { nombre: 'Hector - Smufit Westrock (S2D Graficas)', archivos: arch('Backup_of_Escalas y Logotipo de Smurfit Westrock.cdr', 'Escalas y Logotipo de Smurfit Westrock.cdr', 'Ordenes de Fabricacion.pdf') },
  { nombre: 'Joaquin - Placita La Perla', archivos: arch('Escalas y Logotipo de La Placita.cdr', 'Ordenes de Fabricacion Placita La Perla.pdf') },
  { nombre: 'José - Kelvarion', archivos: arch('Escalas y Logotipo de Kelvarion.cdr', 'Ordenes de Fabricacion Kelvarion.pdf', 'Kelvarion_Wordmark.eps') },
  { nombre: 'Juan Carlos - Centro Dental', archivos: arch('Escalas y Logotipo de Centro Dental.cdr', '12.cdr') },
  { nombre: 'Litzy - Profix Soluciones', archivos: arch('Escalas y Logotipo de Profix Soluciones.cdr', 'Ordenes de Fabricacion.pdf') },
  { nombre: 'Madre Maria - Colegio Madre Velarde', archivos: arch('Escalas y Logotipo de Colegio Madre Velarde.cdr',
      'Ordenes de Fabricacion - Colegio Madre Velarde.pdf', 'Escalas y Logotipo de Hijas de Santa Maria del Corazon de Jesus.cdr',
      'Ordenes de Fabricacion - Hijas de Santa Maria de Jesus.pdf') },
  { nombre: 'Sofia - Inhuman Movement', archivos: arch('Escalas y Logotipo de Inhuman.cdr', 'Ordenes de Fabricacion.pdf', 'INHUMAN_LOGOS_260902_154034.pdf') },
];
const de = nombre => { const c = carpetaDe({ nombre }, CARPETAS); return c ? c.nombre : null; };

console.log('\npalabras — lo que cuenta de un nombre');
eq('sin acentos, sin artículos, sin números sueltos', palabras('Héctor - Smurfit Westrock (S2D) 2'), ['hector', 'smurfit', 'westrock', 's2d']);
eq('«Escalas y Logotipo de…» no cuenta', palabras('Escalas y Logotipo de Kelvarion.cdr'), ['kelvarion']);

console.log('\ncarpetaDe — los once en fabricación, octubre de 2026');
eq('Profix', de('Litzy - Profix Soluciones'), 'Litzy - Profix Soluciones');
eq('Smurfit, con la carpeta escrita «Smufit»', de('Héctor - Smurfit Westrock (S2D)'), 'Hector - Smufit Westrock (S2D Graficas)');
eq('Placita La Perla', de('Joaquín - Placita La Perla'), 'Joaquin - Placita La Perla');
eq('Kelvarion', de('José - Kelvarion'), 'José - Kelvarion');
eq('Herrajes Innova, con la carpeta «… 2»', de('Diego - Herrajes Innova'), 'Diego - Herrajes Innova 2');
eq('Hijas de Santa María: por los archivos de dentro', de('Hrm. Maria - Hijas de Santa Maria de Jesus'), 'Madre Maria - Colegio Madre Velarde');
eq('Colegio Madre Velarde', de('Hrm. Maria - Colegio Madre Velarde'), 'Madre Maria - Colegio Madre Velarde');
eq('Centro Dental', de('Juan Carlos - Centro Dental'), 'Juan Carlos - Centro Dental');
eq('Inhuman Movement', de('Sofia - Inhuman Movement'), 'Sofia - Inhuman Movement');
eq('Dupla Taller no tiene carpeta: no se adivina', de('Marlén - Dupla Taller'), null);
eq('Belaur Tonalá tampoco', de('Samantha - Belaur Tonalá'), null);

console.log('\ncarpetaDe — lo que NO debe atar');
eq('solo el contacto igual no basta', de('Diego - Panadería Sol'), null);
eq('otro «Centro» no es Centro Dental', de('Ana - Centro Óptico'), null);
eq('un nombre que solo sale en los archivos no basta', carpetaDe({ nombre: 'Ana - Kelvarion' }, [{ nombre: 'Varios', archivos: arch('Kelvarion.cdr') }]), null);
eq('sin lista no truena', carpetaDe({ nombre: 'X - Y' }, null), null);
eq('con negocio y contacto ya partidos (los del cotizador)', (carpetaDe({ nombre: 'COT-0042', contacto: 'José', negocio: 'Kelvarion' }, CARPETAS) || {}).nombre, 'José - Kelvarion');

console.log('\nordenarArchivos — lo que se busca, primero');
const o = ordenarArchivos(arch('Kelvarion_Wordmark.eps', 'Copia_de_seguridad_de_Escalas.cdr', 'Escalas y Logotipo de Kelvarion.cdr',
  'Backup_of_Escalas.cdr', 'Ordenes de Fabricacion Kelvarion.pdf', 'desktop.ini'));
eq('órdenes, luego el .cdr, luego lo demás', o.vistos.map(a => a.nombre), ['Ordenes de Fabricacion Kelvarion.pdf', 'Escalas y Logotipo de Kelvarion.cdr', 'Kelvarion_Wordmark.eps']);
eq('las copias de seguridad se cuentan aparte', o.copias, 2);

console.log('\nestadoDe — la marca del tablero');
const taller = (nombre, o = {}) => ({ nombre, etapa: 'armado', estatus_notion: 'FABRICACION', ...o });
eq('Kelvarion trae sus órdenes', estadoDe(taller('José - Kelvarion'), CARPETAS), 'ordenes');
eq('Centro Dental tiene carpeta pero no órdenes', estadoDe(taller('Juan Carlos - Centro Dental'), CARPETAS), 'sin_ordenes');
eq('Herrajes Innova tampoco (solo el .cdr)', estadoDe(taller('Diego - Herrajes Innova'), CARPETAS), 'sin_ordenes');
eq('Dupla Taller no tiene carpeta', estadoDe(taller('Marlén - Dupla Taller'), CARPETAS), 'sin_carpeta');
eq('lo instalado ya no lleva marca', estadoDe(taller('José - Kelvarion', { etapa: 'instalado' }), CARPETAS), null);
eq('lo que la hoja ya cobra tampoco', estadoDe(taller('José - Kelvarion', { estatus_notion: 'COBRANDO' }), CARPETAS), null);
eq('sin nada sabido de Drive no se dice nada', estadoDe(taller('José - Kelvarion'), null), null);

console.log('\nsinCarpeta — a quién le abre carpeta el teléfono de Dirección');
const proyectos = [taller('Marlén - Dupla Taller'), taller('Samantha - Belaur Tonalá'), taller('José - Kelvarion'),
  taller('Ana - Café Luna', { etapa: 'cancelado' }), taller('Beto - Gym', { etapa: 'instalado' }),
  taller('Ceci - Spa', { estatus_notion: 'LIQUIDADO' }), taller('Sin negocio'), taller('Eva - De la', {})];
eq('solo los del taller sin carpeta, y con un negocio que la encuentre después',
   sinCarpeta(proyectos, CARPETAS).map(p => p.nombre), ['Marlén - Dupla Taller', 'Samantha - Belaur Tonalá', 'Sin negocio']);
eq('el nombre es «Contacto - Negocio»', nombreParaCarpeta({ nombre: 'COT-0042', contacto: 'Marlén', negocio: 'Dupla Taller' }), 'Marlén - Dupla Taller');
const nueva = { nombre: nombreParaCarpeta({ nombre: 'Marlén - Dupla Taller' }), archivos: [] };
eq('y la carpeta que se le abre la encuentra a la primera: no se pide otra', carpetaDe(taller('Marlén - Dupla Taller'), [nueva]) === nueva, true);

console.log('\nLA HOJA — /carpetas y /crear_carpeta contra un Drive de mentiras');
{
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const src = readFileSync(new URL('../puente/hoja-apps-script.gs', import.meta.url), 'utf8');
  let n = 0;
  const carpeta = (nombre, archivos = []) => ({ id: 'c' + (++n), nombre, archivos,
    getId() { return this.id; }, getName() { return this.nombre; }, getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; },
    getLastUpdated() { return new Date(0); },
    getFiles() { const l = this.archivos.slice(); return { hasNext: () => l.length > 0, next: () => l.shift() }; } });
  const archivo = nombre => ({ getName: () => nombre, getUrl: () => 'https://drive.google.com/file/d/x/view', getMimeType: () => 'application/pdf', getLastUpdated: () => new Date(0) });
  const hijas = [carpeta('José - Kelvarion', [archivo('Ordenes de Fabricacion Kelvarion.pdf')])];
  const raiz = { getUrl: () => 'https://drive.google.com/drive/folders/raiz',
    getFolders() { const l = hijas.slice(); return { hasNext: () => l.length > 0, next: () => l.shift() }; },
    createFolder(nombre) { const c = carpeta(nombre); hijas.push(c); return c; } };
  const cache = new Map();
  const ctx = vm.createContext({
    DriveApp: { getFolderById: () => raiz },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    console,
  });
  vm.runInContext(src, ctx);
  const run = c => vm.runInContext(c, ctx);
  const l = run('rutaCarpetas_()');
  eq('/carpetas lista la carpeta con su archivo', [l.ok, l.carpetas.map(c => c.nombre), l.carpetas[0].archivos[0].nombre],
     [true, ['José - Kelvarion'], 'Ordenes de Fabricacion Kelvarion.pdf']);
  eq('fabricación no abre carpetas', run('rutaCrearCarpeta_({ nombre: "Marlén - Dupla Taller" }, "fabricacion")').codigo, 'ROL_SIN_PERMISO');
  const a = run('rutaCrearCarpeta_({ nombre: "Marlén - Dupla Taller" }, "direccion")');
  eq('Dirección sí, y la caché se suelta para que /carpetas la traiga', [a.ok, a.creada, a.carpeta.nombre, cache.size], [true, true, 'Marlén - Dupla Taller', 0]);
  const b = run('rutaCrearCarpeta_({ nombre: "MARLEN - dupla taller" }, "direccion")');
  eq('pedirla otra vez (otro teléfono, otra mayúscula) devuelve la misma: no hay dos', [b.creada, b.carpeta.id, hijas.length], [false, a.carpeta.id, 2]);
  eq('un nombre con diagonales no hace subcarpetas', run('rutaCrearCarpeta_({ nombre: "Ana / Café: Luna" }, "direccion")').carpeta.nombre, 'Ana Café Luna');
  eq('sin nombre no se crea nada', run('rutaCrearCarpeta_({ nombre: "  " }, "direccion")').codigo, 'DATO_INVALIDO');

  /* Si Google no la da por su id, se busca por nombre; y si tampoco, el error viaja. */
  ctx.DriveApp = { getFolderById: () => { throw new Error('No se encontró el elemento con el ID especificado'); },
    searchFolders: () => { const l = [raiz]; raiz.getId = () => '1XfM5KMFn5p87LI_W-IglmflaZcs3y_wB'; return { hasNext: () => l.length > 0, next: () => l.shift() }; } };
  cache.clear();
  eq('por id falla y por nombre la encuentra', run('rutaCarpetas_()').ok, true);
  ctx.DriveApp = { getFolderById: () => { throw new Error('Acceso denegado: DriveApp'); },
    searchFolders: () => ({ hasNext: () => false, next: () => null }) };
  cache.clear();
  const f = run('rutaCarpetas_()');
  eq('y si no, dice el error de Google', [f.ok, /Acceso denegado/.test(f.detalle), /ninguna carpeta/.test(f.detalle)], [false, true, true]);
}

console.log('');
if (fallos) { console.log(fallos + ' fallo(s).'); process.exit(1); }
console.log('Todo bien.');
