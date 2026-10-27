/* MATERIAL EN MANTENIMIENTO DE VERDAD (auditoría 2026-10-26, T1-7). Sin Google, sin cuenta, en node.

   Material está en mantenimiento: el interruptor único es `MATERIAL_EN_MANTENIMIENTO` en
   js/datos/agenda.js (decisión de Elías del 25-oct, ratificada el 26). Escondía la pantalla, y el
   almacén se seguía moviendo solo y sus avisos seguían saliendo. Lo que se prueba aquí, con el
   teléfono de verdad (js/datos con su IndexedDB de mentiras, la base mandando) y el interruptor como
   está HOY:

     · abrir «Qué atender» no encola ningún movimiento del almacén ni saca avisos de material, aunque
       haya una instalación mañana con material faltante;
     · marcar «Cortado» mueve la etapa y no descuenta nada: ni salida, ni línea «consumida»;
     · la pantalla de Proyectos (js/mod/proyectos.js, cargada de verdad) no cuenta el material que
       falta: es el semáforo de donde salen «Material sin calcular», «Faltan N» y «Ver la lista de
       compra», y la cuenta de la pestaña de Fabricación;
     · LA CONTRAPRUEBA: el mismo escenario, en un proceso hijo con Material ENCENDIDO
       (pruebas/comun/material-encendido.mjs), sí descuenta, sí avisa y sí cuenta. Mismo código,
       mismos datos; lo único distinto es el interruptor. Si un día esta prueba pasa porque el
       escenario dejó de provocar algo, la contraprueba lo dice;
     · el código: todas las piezas preguntan al MISMO interruptor, para que el día que se encienda
       Material vuelva todo junto.

   Lo que pasa en la base (la cabecera `x-al3d-material` y 0031) lo prueba
   supabase/tests/sync-e-importacion/material-en-mantenimiento.mjs contra PGlite.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { idbConIndices } from './comun/base-de-mentiras.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HIJO = process.env.AL3D_PRUEBA_MATERIAL === 'hijo';

/* ── El teléfono ───────────────────────────────────────────────────────────────────────────── */
const guardado = {
  al3d_pf_rol: 'fabricacion', al3d_pf_disp: 'K7QM', al3d_pf_nombre: 'Omar',
  al3d_pf_puente: JSON.stringify({ url: 'https://puente.test/exec', token: 'd'.repeat(40) }),
  /* La base mandando, como hoy (lo que lee `laBaseManda()`). */
  al3d_pf_supa: JSON.stringify({ encendido: true }), al3d_pf_supa_modo: JSON.stringify({ modo: 'base', empresa: 'al3d' }),
};
globalThis.window = globalThis;
globalThis.indexedDB = idbConIndices();
globalThis.IDBKeyRange = { only: v => ({ only: v }), bound: (a, b) => ({ bound: [a, b] }) };
globalThis.localStorage = { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); },
                            removeItem: k => { delete guardado[k]; } };
globalThis.fetch = async u => { throw new TypeError('Failed to fetch (sin red: ' + u + ')'); };
/* Lo mínimo del navegador para cargar la pantalla de Proyectos (js/mod/proyectos.js) sin montarla. */
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} }, body: {},
  documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } }, querySelector: () => null, getElementById: () => null };

const DB = await import('../js/datos/db.js');
const S = await import('../js/datos/sync.js');
const Proy = await import('../js/datos/proyectos.js');
const Agenda = await import('../js/datos/agenda.js');
const Reglas = await import('../js/datos/reglas.js');
const Pantalla = await import('../js/mod/proyectos.js');
await DB.abrir();

const p2 = n => String(n).padStart(2, '0');
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const HOY = dia(0), MANANA = dia(1);

/* El catálogo (sin existencia: nada contado ni comprado) y una venta con su lista de compra calculada, ganada
   ayer, que se instala mañana: con Material encendido es «Falta material y … se instala mañana» en rojo. */
const T0 = Date.now() - 86400000;
await DB.poner('materiales', { id: 'acr-3mm', empresa_id: 'al3d', nombre: 'Acrílico blanco 3 mm', familia: 'acrilico', unidad_consumo: 'm2',
  unidad_compra: 'lamina', medida: '1.22 × 2.44 m', factor: 2.9768, largo_cm: 244, ancho_cm: 122, espesor: '3 mm', merma_pct: 0.25,
  fraccionable: true, min_compra: 1, min_stock: 0, activo: true, sync: 0, creado_en: T0, actualizado_en: T0 });
const req = (id, proyecto) => ({ id: proyecto + ':acr-3mm', empresa_id: 'al3d', proyecto_id: proyecto, material_id: 'acr-3mm',
  cantidad_consumo: 4.1, unidad_consumo: 'm2', cantidad_compra: 1.4, unidad_compra: 'lamina', partidas: [1], formula: '',
  confianza: 'estimada', requiere: '', constantes_version: 'c', cantidad_ajustada: null, motivo_ajuste: '', ajustado_por: '', ajustado_en: 0,
  estado: 'calculado', creado_en: T0, actualizado_en: T0, sync: 0 });
for (const [id, folio] of [['proy-a', 'COT-0301'], ['proy-b', 'COT-0302'], ['proy-c', 'COT-0303'], ['proy-d', 'COT-0304']]) {
  await DB.poner('proyectos', { id, folio_global: folio + '@K7QM', folio_local: folio, dispositivo: 'K7QM', nombre: 'Venta ' + folio,
    etapa: 'ganado', fecha_ganado: dia(-1), sellos: {}, sync: 0, notion_page_id: 'V-3' + folio.slice(-2) });
  await DB.poner('requerimientos', req(id, id));
}
for (const [id, fecha] of [['a', MANANA], ['c', dia(2)]]) {
  await DB.poner('instalaciones', { id: 'inst-' + id, empresa_id: 'al3d', proyecto_id: 'proy-' + id, fecha, hora: '09:00', ventana: 'dia',
    duracion_min: 180, estado: 'confirmada', movida: 0, uid_ics: 'inst-inst-' + id + '@al3d.mx', notas: '', creado_en: T0, actualizado_en: T0, sync: 0 });
}

/* El escenario, igual en los dos procesos: lo que la pantalla de Proyectos cuenta, abrir «Qué atender» y cortar. */
const bandeja = async () => (await S.pendientes()).map(op => op.almacen + ':' + op.tipo);
async function escenario() {
  const r = {};
  r.interruptor = Agenda.MATERIAL_EN_MANTENIMIENTO;
  r.cuentaFabricacion = (await Pantalla.contar()).proyectos;
  const avisos = await Reglas.refrescar({ hoy: HOY });
  r.avisosDeMaterial = avisos.filter(a => /^A(8|9|13)_/.test(a.regla)).map(a => a.regla);
  r.bandejaTrasQueAtender = await bandeja();
  const c = await Proy.avanzarEtapa('proy-b', 'cortado');
  r.corte = { ok: c.ok, movimientos: c.valor && c.valor.movimientos, etapa: (await DB.obtener('proyectos', 'proy-b')).etapa,
              linea: (await DB.obtener('requerimientos', 'proy-b:acr-3mm')).estado };
  r.bandejaTrasCortar = await bandeja();
  /* Dos cortes a la vez del mismo proyecto (el doble toque, o el arrastre del tablero y la ficha): con Material encendido
     restan UNA vez —la fila de `emitirSalidas`—; era el caso 6 de pruebas/puente.mjs, que no puede encender Material. */
  const [d1, d2] = await Promise.all([Proy.avanzarEtapa('proy-d', 'cortado'), Proy.avanzarEtapa('proy-d', 'cortado')]);
  r.dosCortes = { ok: d1.ok && d2.ok, salidas: (await DB.listar('movimientos')).filter(m => m.requerimiento_id === 'proy-d:acr-3mm').length,
                  linea: (await DB.obtener('requerimientos', 'proy-d:acr-3mm')).estado };
  r.libro = (await DB.listar('movimientos')).map(m => m.id + ' ' + m.origen);
  return r;
}

if (HIJO) {
  /* El proceso hijo: el mismo escenario con Material encendido, y su resultado al padre. */
  process.stdout.write('\n@@' + JSON.stringify(await escenario()) + '@@\n');
  process.exit(0);
}

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

console.log('\nCON EL INTERRUPTOR COMO HOY — nada se mueve solo');
const hoy = await escenario();
eq('el interruptor está puesto', hoy.interruptor, true);
eq('abrir «Qué atender» no saca avisos de material (ni «falta material», ni «bajo mínimo», ni «constante»)', hoy.avisosDeMaterial, []);
eq('ni encola ningún movimiento del almacén', hoy.bandejaTrasQueAtender, []);
eq('marcar «Cortado» mueve la etapa y no descuenta: la línea sigue «calculado»', hoy.corte,
  { ok: true, movimientos: 0, etapa: 'cortado', linea: 'calculado' });
eq('a la bandeja solo va la etapa', hoy.bandejaTrasCortar, ['proyectos:actualizar']);
eq('dos cortes a la vez del mismo proyecto: ninguno resta', hoy.dosCortes, { ok: true, salidas: 0, linea: 'calculado' });
eq('el libro del teléfono sigue vacío', hoy.libro, []);
eq('la pantalla de Proyectos no cuenta material que falta (la cuenta de Fabricación sale del semáforo)', hoy.cuentaFabricacion, 0);
eq('y la degradación tampoco corre si alguien la llama directo', (await Proy.emitirSalidasDerivadas(HOY)).valor,
  { proyectos: 0, movimientos: 0, sin_stock: 0, mantenimiento: true });

console.log('\nLA CONTRAPRUEBA — el mismo escenario con Material encendido (proceso aparte)');
{
  const gancho = pathToFileURL(join(AQUI, 'comun', 'material-encendido.mjs')).href;
  const h = spawnSync(process.execPath, ['--import', gancho, fileURLToPath(import.meta.url)],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, AL3D_PRUEBA_MATERIAL: 'hijo' } });
  const m = /@@(.*)@@/.exec(h.stdout || '');
  if (!m) { mal++; console.log('  FALLA el proceso hijo no contestó\n' + (h.stdout || '') + (h.stderr || '')); }
  else {
    const enc = JSON.parse(m[1]);
    eq('el hijo corre con el interruptor apagado', enc.interruptor, false);
    eq('abrir «Qué atender» sí avisa que falta material (la de pasado mañana: la de mañana ya salió como derivada)', enc.avisosDeMaterial, ['A8_material']);
    eq('y saca la salida derivada de la instalación de mañana', enc.bandejaTrasQueAtender, ['movimientos:apendice', 'requerimientos:actualizar']);
    eq('cortar sí descuenta', enc.corte, { ok: true, movimientos: 1, etapa: 'cortado', linea: 'consumido' });
    eq('dos cortes a la vez del mismo proyecto restan UNA vez', enc.dosCortes, { ok: true, salidas: 1, linea: 'consumido' });
    eq('y el libro tiene una salida por línea, cada una con el id de su requerimiento',
      enc.libro.sort(), ['mov-salida:proy-a:acr-3mm derivado', 'mov-salida:proy-b:acr-3mm manual', 'mov-salida:proy-d:acr-3mm manual']);
    eq('y la pantalla de Proyectos cuenta los dos que se instalan en tres días o menos sin material', enc.cuentaFabricacion, 2);
  }
}

console.log('\nEL CÓDIGO — todo pregunta al mismo interruptor');
{
  const agenda = leer('js/datos/agenda.js');
  cierto('el interruptor sigue siendo uno, en js/datos/agenda.js', /export const MATERIAL_EN_MANTENIMIENTO = true;/.test(agenda));
  const archivos = ['js/datos/reglas.js', 'js/datos/proyectos.js', 'js/datos/supa-relevo.js', 'js/mod/proyectos.js', 'js/mod/inicio.js', 'js/nucleo/asistente.js'];
  eq('nadie más define el suyo', archivos.filter(f => /(const|let|var)\s+MATERIAL_EN_MANTENIMIENTO\s*=/.test(sinComentarios(leer(f)))), []);

  const reglas = sinComentarios(leer('js/datos/reglas.js'));
  cierto('reglas.js: A8, A9 y A13 solo con Material encendido, y el interruptor decide si nadie dice otra cosa',
    /if \(E\.material\) \{ a8\(E, out\); a9\(E, out\); a13\(E, out\); \}/.test(reglas) &&
    /material: E\.material === undefined \? !MATERIAL_EN_MANTENIMIENTO : E\.material === true/.test(reglas));
  cierto('reglas.js: «Qué atender» no llama a la degradación con el interruptor puesto',
    /const material = !MATERIAL_EN_MANTENIMIENTO;/.test(reglas) &&
    /if \(material && P && typeof P\.emitirSalidasDerivadas === 'function'\)/.test(reglas));

  const datos = sinComentarios(leer('js/datos/proyectos.js'));
  cierto('proyectos.js: la guarda vive en la única puerta de las salidas (el corte y la derivada) y lee agenda.js',
    /async function emitirSalidasAhora\(p, origenMov, nota\) \{\s*if \(await materialEnMantenimiento\(\)\) return/.test(datos) &&
    /return !A \|\| A\.MATERIAL_EN_MANTENIMIENTO !== false;/.test(datos));

  const relevo = sinComentarios(leer('js/datos/supa-relevo.js'));
  cierto('supa-relevo.js: la cabecera de Material sale del mismo interruptor',
    /import \{ MATERIAL_EN_MANTENIMIENTO \} from '\.\/agenda\.js';/.test(relevo) &&
    /c: materialApagado \? conCabeceraDeMaterial\(c\) : c/.test(relevo));

  const pant = sinComentarios(leer('js/mod/proyectos.js'));
  cierto('Proyectos: sin semáforo con el interruptor puesto (de ahí salen las etiquetas y «Ver la lista de compra»)',
    /const conMaterial = \(\) => !Agenda\.MATERIAL_EN_MANTENIMIENTO;/.test(pant) && /SEM = mat \? semaforos\(compra \|\| \[\]\) : new Map\(\);/.test(pant));
  cierto('Proyectos: «¿Ya se cortó?» solo con Material encendido',
    /\} else if \(conMaterial\(\) && actual && de !== undefined && a !== undefined &&\s*a >= Proy\.ORDEN\.cortado && de < Proy\.ORDEN\.cortado\) \{\s*const ok = await confirmarPf\(\{\s*titulo: '¿Ya se cortó «'/.test(pant));
  cierto('Proyectos: «Ver almacén» y «No se descontó nada del almacén» solo con Material encendido',
    /conMaterial\(\) \? \{ label: 'Ver almacén'/.test(pant) && /\} else if \(conMaterial\(\) && \(etapa === 'cortado'/.test(pant));
  cierto('Proyectos: «Recalcular material» se vuelve «Actualizar con la de hoy», y el renglón «Material» de la ficha no sale',
    /\(conMaterial\(\) \? 'Recalcular material' : 'Actualizar con la de hoy'\)/.test(pant) && /if \(conMaterial\(\)\) \{\s*datos\.push\(dato\('Material'/.test(pant));
  cierto('Proyectos: la orden de trabajo no imprime el material calculado',
    /\(conMaterial\(\) \? '<div class="fld-lab">Material que pide este proyecto<\/div>' \+ material : ''\)/.test(pant));
  cierto('Proyectos: el texto de los pasos no promete que el material sale al cortar',
    /\(conMaterial\(\) \? 'Al llegar a «Cortado» el material sale del almacén/.test(pant));

  const ini = sinComentarios(leer('js/mod/inicio.js'));
  cierto('«Qué atender» (inicio.js): no lee el almacén, ni el costo de la compra, ni dice «con material calculado»',
    /Agenda\.MATERIAL_EN_MANTENIMIENTO \? Promise\.resolve\(\[\]\) : Stock\.listaCompra\(\{\}\)/.test(ini) &&
    /if \(veDinero && costo > 0 && !Agenda\.MATERIAL_EN_MANTENIMIENTO\)/.test(ini) &&
    /\(mat \? ', con material calculado y' : ','\)/.test(ini));

  const asis = sinComentarios(leer('js/nucleo/asistente.js'));
  cierto('el asistente: sin la pregunta ni la cifra de material, y escrita a mano contesta que está en mantenimiento, sin botón',
    /const intencionViva = k => k !== 'material' \|\| conMaterial\(\);/.test(asis) && /g\.intents\.filter\(intencionViva\)/.test(asis) &&
    /\} else if \(conMaterial\(\)\) \{\s*c\.push\('<button type="button" class="ia-cifra' \+ \(d\.comprar/.test(asis) &&
    /if \(!intencionViva\(intent\)\) \{\s*_msgs\.push\(\{ rol: 'bot', local: true, intent, ts: Date\.now\(\), texto: RESPUESTA_SIN_MATERIAL, acciones: \[\] \}\);/.test(asis) &&
    /if \(conMaterial\(\)\) \{\s*try \{ const S = await import\('\.\.\/datos\/stock\.js'\)/.test(asis));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
