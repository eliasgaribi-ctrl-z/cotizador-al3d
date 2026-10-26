/* ENTRAR A SUPABASE, QUIÉN ERES Y EL ACCESO RETIRADO — js/nucleo/supa.js (pieza 3, apagada).
 *
 * Lo que se vigila:
 *   · que APAGADO no haga nada: el interruptor nace apagado, app.js ni siquiera carga el módulo y la
 *     puerta de hoy (puerta.js) no lo conoce;
 *   · los TRES CANDADOS del acceso retirado (DISENO.md §7.5): solo dos respuestas explícitas
 *     separadas cuentan; un error, una sesión vencida o «sin acceso» no; y el borrado está
 *     DESHABILITADO hasta que exista la subida única, aunque todo lo demás diga que sí;
 *   · que lo que se borraría conserve el id del aparato y su contador de folios;
 *   · el nonce (a Google su huella SHA-256, a Supabase el original);
 *   · y la configuración: la llave pública y la dirección de pruebas, sin ninguna secreta, en la CSP
 *     de index.html, y la librería de vendor/ con la huella que dice su licencia.
 *
 * No toca Supabase ni Google. Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* localStorage de mentiras (como pruebas/puerta.mjs) */
const almacen = new Map();
globalThis.localStorage = {
  getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: k => almacen.delete(k), clear: () => almacen.clear(),
};
const S = await import('../js/nucleo/supa.js');
const { SUPABASE } = await import('../js/datos/supabase-config.js');

console.log('\nAPAGADO NO HACE NADA');
{
  eq('el interruptor nace apagado', S.encendido(), false);
  localStorage.setItem(S.CLAVE_INTERRUPTOR, 'basura{');
  eq('una clave dañada se lee como apagado', S.encendido(), false);
  S.encender(true);
  eq('se enciende en este aparato', S.encendido(), true);
  S.encender(false);
  eq('y se apaga quitando la clave', [S.encendido(), localStorage.getItem(S.CLAVE_INTERRUPTOR)], [false, null]);

  const app = leer('js/app.js');
  cierto('app.js solo carga supa.js con el interruptor encendido, con import() y no estático',
    /if \(\/"encendido":true\/\.test\(localStorage\.getItem\('al3d_pf_supa'\)/.test(app) && !/^import .*supa\.js/m.test(app));
  eq('y la clave que mira app.js es la del módulo', S.CLAVE_INTERRUPTOR, 'al3d_pf_supa');
  /* Desde «la base manda» (paso 2, docs/BASE-MANDA.md) la puerta pregunta el rol a la base, pero SOLO con la base
     mandando en este aparato: el interruptor encendido y el último modo oído 'base'. Y desde la puerta de un toque
     (2026-10-25), también cuando alguien toca el botón de Google de la puerta. Con la hoja y el botón de siempre, ni
     lo carga: el import() está en UN lugar (`cargarSupa`) y solo lo llaman esos dos caminos. */
  const pu = sinComentarios(leer('js/nucleo/puerta.js'));
  cierto('la puerta no lo importa de forma estática, y solo lo carga con import() cuando la base manda o al tocar el botón de Google',
    !/^import[^;]*supa\.js/m.test(pu) && (pu.match(/import\('\.\/supa\.js'\)/g) || []).length === 1 &&
    /async function cargarSupa\(\) \{\n  try \{ return await import\('\.\/supa\.js'\); \}/.test(pu) &&
    (pu.match(/await cargarSupa\(\)/g) || []).length === 2 &&
    /async function preguntarALaBase\(\) \{\n  const Supa = await cargarSupa\(\);/.test(pu) &&
    /async function entrarPorLaBase\(cred, correo\) \{\n  const Supa = await cargarSupa\(\);/.test(pu) &&
    /if \(laBaseManda\(\)\) \{\n    const v = await preguntarALaBase\(\);/.test(pu));
  const aj = leer('js/mod/ajustes.js');
  cierto('Ajustes lo carga con import() y pinta la tarjeta a los tres roles (paso 2 de «la base manda»)',
    /import\('\.\.\/nucleo\/supa\.js'\)/.test(aj) && /function cardSupabase\(\) \{\n  if \(!Prefs\.ROLES\.includes\(Prefs\.rol\(\)\)\) return '';/.test(aj));
  cierto('y lo de Dirección (personas, pantallas, la sombra) sigue solo para Dirección activa',
    /if \(a\.estado === 'activo' && a\.area === 'direccion'\) \{\s*html \+= await bloquePersonas\(Supa, a\.correo\)/.test(aj));
  /* Con la base mandando, la sombra de pruebas no se enseña: queda la copia de la hoja y el cuadre (ES-10). */
  cierto('  con la base mandando, sin el bloque de la sombra (la copia de la hoja y el cuadre, nada más)',
    /\(Supa\.laBaseManda\(\) \? await bloqueCopiaYCuadre\(\) : await bloqueSombra\(\)\)/.test(aj));
  cierto('ningún módulo lo importa de forma estática',
    !/^import[^;]*supa\.js/m.test(aj) && !/^import[^;]*supa\.js/m.test(app));
  cierto('su interruptor y su sesión no viajan en los respaldos (no están en Prefs.CLAVES)',
    !/al3d_pf_supa/.test(leer('js/datos/prefs.js')) && !/al3d_pf_supa/.test(leer('js/datos/cotizador.js')));
}

console.log('\nCANDADO 1: SOLO DOS RESPUESTAS EXPLÍCITAS, SEPARADAS');
{
  const R = { estado: 'acceso_revocado' };
  eq('dos «acceso retirado» con 5 s entre ellas: sí', S.accesoRetirado(R, R, 5000), true);
  eq('con menos de 5 s: no', S.accesoRetirado(R, R, 4999), false);
  eq('una sola: no', S.accesoRetirado(R, { estado: 'activo' }, 9000), false);
  eq('la segunda con error de red: no', S.accesoRetirado(R, { estado: 'desconocido' }, 9000), false);
  eq('sesión vencida: no', S.accesoRetirado({ estado: 'sin_sesion' }, { estado: 'sin_sesion' }, 9000), false);
  eq('«sin acceso» (nunca lo tuvo) no es retirado', S.accesoRetirado({ estado: 'sin_acceso' }, { estado: 'sin_acceso' }, 9000), false);
  eq('nada: no', S.accesoRetirado(null, undefined, 9000), false);
  eq('mi_acceso con error de la base es «no sé»', S.leerAcceso({ ok: false, codigo: 'INTERNO', mensaje: 'x' }).estado, 'desconocido');
  eq('mi_acceso sin sesión es sin_sesion', S.leerAcceso({ ok: false, codigo: 'SIN_SESION' }).estado, 'sin_sesion');
  eq('un estado que no existe es «no sé»', S.leerAcceso({ ok: true, estado: 'fuera' }).estado, 'desconocido');
  eq('una respuesta vacía es «no sé»', S.leerAcceso(null).estado, 'desconocido');
  eq('activo con su área y su correo', S.leerAcceso({ ok: true, estado: 'activo', usuario: { correo: 'a@b.mx' },
    empresas: [{ empresa_id: 'al3d', area: 'pagos', estado: 'activo' }], contrato: { actual: 1, minimo: 1 } }),
    { estado: 'activo', correo: 'a@b.mx', area: 'pagos', empresa: 'al3d', contratoViejo: false, modo: '', permisos: null });
  eq('un contrato mínimo mayor que el de la app se avisa', S.leerAcceso({ ok: true, estado: 'activo', contrato: { minimo: 2 } }).contratoViejo, true);
}

console.log('\nSOLO SE TAPA LA APP DE LA MISMA PERSONA, Y SIEMPRE CON SALIDA');
{
  eq('la misma cuenta (sin importar mayúsculas): sí', S.esLaMismaPersona('Ana@Gmail.com ', 'ana@gmail.com'), true);
  eq('otra cuenta (Dirección probando con una dada de baja): no', S.esLaMismaPersona('baja@gmail.com', 'ana@gmail.com'), false);
  eq('sin correo de la puerta (copia local): no', S.esLaMismaPersona('ana@gmail.com', ''), false);
  eq('sin correo de la base: no', S.esLaMismaPersona('', 'ana@gmail.com'), false);
  const v = sinComentarios(leer('js/nucleo/supa.js'));
  cierto('después de la segunda opinión vuelve a mirar el interruptor y la persona',
    /if \(!encendido\(\) \|\| !esLaMismaPersona\(b\.correo \|\| a\.correo, correoDeLaPuerta\(\)\)\) return;/.test(v));
  cierto('una revisión a la vez', /if \(_enCurso\) return;/.test(v));
  /* Con la hoja mandando trae su botón para apagar en este aparato; con la base mandando, no: apagado, el teléfono volvía a
     abrir Control con lo guardado. Ahí la salida es entrar con otra cuenta, y el pase de la base se va (ES-1). */
  const bloq = (v.match(/export function bloquear\([^)]*\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('la pantalla de «acceso retirado» trae su botón: apagar con la hoja mandando, otra cuenta con la base',
    /id="pf-sin-acceso-apagar"/.test(bloq) && /if \(!manda\) encender\(false\);\s*location\.reload\(\);/.test(bloq) &&
    /const salida = manda\s*\? 'Entrar con otra cuenta'/.test(bloq));
  cierto('  con la base mandando borra el pase y recuerda la cuenta en este aparato',
    /if \(manda\) \{[\s\S]*?removeItem\('al3d_pf_pase'\)[\s\S]*?setItem\(CLAVE_FUERA/.test(bloq));
  cierto('  y con los colores de la app (no --tx, que no existe)', /var\(--sup,#ffffff\)/.test(bloq) && /var\(--tinta,#1a1d33\)/.test(bloq) && !/--tx/.test(bloq));
  /* Los tres botones entran por `cambiarPorSesion`, y ahí se vigila en cuanto la cuenta es la buena. */
  const cambio = (v.match(/async function cambiarPorSesion\([^)]*\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('al entrar empieza a vigilar sin esperar a la siguiente vez que se abra la app',
    /if \(error\) throw error;/.test(cambio) && /vigilar\(\);[^\n]*\n\s*return \{ ok: true, acceso: a \};/.test(cambio));
}

console.log('\nCANDADO 2: EL BORRADO ESTÁ DESHABILITADO HASTA LA SUBIDA ÚNICA');
{
  eq('el borrado está deshabilitado en este código', S.BORRADO_HABILITADO, false);
  eq('aunque la bandeja esté vacía y todo tenga acuse, no se borra', S.sePuedeBorrar({ bandejaVacia: true, todoConAcuse: true }), false);
  eq('habilitado y con bandeja pendiente: no', S.sePuedeBorrar({ habilitado: true, bandejaVacia: false, todoConAcuse: true }), false);
  eq('habilitado y sin acuse: no', S.sePuedeBorrar({ habilitado: true, bandejaVacia: true, todoConAcuse: false }), false);
  eq('habilitado, bandeja vacía y todo con acuse: sí', S.sePuedeBorrar({ habilitado: true, bandejaVacia: true, todoConAcuse: true }), true);
  eq('«true» como texto no cuenta', S.sePuedeBorrar({ habilitado: 'true', bandejaVacia: true, todoConAcuse: true }), false);
  localStorage.setItem('al3d_pf_nombre', 'Ana'); localStorage.setItem('al3d_historial', '[]');
  eq('borrarLocal() con el borrado deshabilitado no toca nada', [await S.borrarLocal(), localStorage.getItem('al3d_pf_nombre')], [false, 'Ana']);
  const v = sinComentarios(leer('js/nucleo/supa.js'));
  cierto('vigilar() solo borra si sePuedeBorrar() lo dice', /if \(puede\) await borrarLocal\(\);/.test(v) && /const puede = sePuedeBorrar\(/.test(v));
}

console.log('\nCANDADO 3: LO QUE SE CONSERVA');
{
  eq('se conservan el id del aparato y su contador de folios', S.SE_CONSERVAN, ['al3d_pf_disp', 'al3d_folio']);
  cierto('ninguno de los dos está en la lista de lo que se borra', S.SE_CONSERVAN.every(k => !S.SE_BORRAN.includes(k)));
  cierto('las preferencias del aparato (tema, mapa, último respaldo) tampoco', ['al3d_tema', 'al3d_pf_tiles', 'al3d_pf_ult_export', 'al3d_pf_fondo'].every(k => !S.SE_BORRAN.includes(k)));
  cierto('y sí se borran el pase, la sesión de Supabase, el historial y las credenciales', ['al3d_pf_pase', S.CLAVE_SESION, 'al3d_historial', 'al3d_pf_gtok', 'al3d_pf_puente'].every(k => S.SE_BORRAN.includes(k)));
  eq('y las bases locales (la de la sombra incluida)', S.BASES_LOCALES, ['al3d_pf', 'al3d_cot_imgs', 'al3d_sombra']);
}

console.log('\nEL NONCE');
{
  const n = S.nonceNuevo();
  cierto('el nonce son 64 hexadecimales y cambia cada vez', /^[0-9a-f]{64}$/.test(n) && n !== S.nonceNuevo());
  eq('a Google va su huella SHA-256', await S.huella('abc'), createHash('sha256').update('abc').digest('hex'));
  const v = sinComentarios(leer('js/nucleo/supa.js'));
  /* El nonce lo arman dos: el aviso sin botón (aquí) y el botón (`botonDeIdentidad`, en ingreso.js, que usan la
     puerta, la banda y Ajustes). Los dos le dan a Google la huella; a Supabase va el original en `cambiarPorSesion`. */
  const ing = sinComentarios(leer('js/nucleo/ingreso.js'));
  cierto('a Google la huella y a Supabase el original',
    /const nonce = await huella\(crudo\);/.test(v) && /client_id: CLIENT_ID, nonce,/.test(v) &&
    /signInWithIdToken\(\{ provider: 'google', token: credencial, nonce: crudo \}\)/.test(v) &&
    /callback: async resp => fin\(await cambiarPorSesion\(resp && resp\.credential, crudo, correoPuerta\)\)/.test(v) &&
    /const nonce = await huella\(crudo\);/.test(ing) && /client_id: opc\.clienteId \|\| CLIENT_ID, nonce,/.test(ing) &&
    /callback: resp => alCredencial\(\{ credencial: \(resp && resp\.credential\) \|\| '', crudo, nonce \}\)/.test(ing));
  const I = await import('../js/nucleo/ingreso.js');
  cierto('el nonce de supa.js es el de ingreso.js (uno solo)', S.huella === I.huella && S.nonceNuevo === I.nonceNuevo);
  cierto('con el Client ID de siempre', /client_id: CLIENT_ID/.test(v));
  cierto('y cada llamada de escritura lleva la cabecera del contrato', /'x-al3d-contrato': CONTRATO/.test(v));
}

console.log('\nLOS MENSAJES');
{
  eq('sin red', S.mensajeDe({ message: 'TypeError: Failed to fetch' }), 'Sin conexión con Supabase. Revisa la señal.');
  eq('sin permiso', S.mensajeDe({ codigo: 'ROL_SIN_PERMISO' }), 'Eso solo lo puede hacer Dirección.');
  eq('el mensaje de la base pasa tal cual', S.mensajeDe({ codigo: 'DATO_INVALIDO', mensaje: 'Debe quedar al menos un Dirección activo.' }), 'Debe quedar al menos un Dirección activo.');
}

console.log('\nLA CONFIGURACIÓN');
{
  cierto('la dirección es la de un proyecto de Supabase', /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(SUPABASE.url));
  cierto('la llave es la PÚBLICA (sb_publishable_)', /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(SUPABASE.llave));
  const cfg = leer('js/datos/supabase-config.js');
  cierto('y ninguna secreta ni JWT en la configuración ni en el módulo', !/sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}/.test(cfg + leer('js/nucleo/supa.js')));
  /* Desde el 2026-10-16 la app publicada habla con PRODUCCIÓN. El de pruebas se queda anotado en la
     configuración para una copia local, pero no hay manera de elegirlo desde la app. */
  eq('la app publicada apunta al proyecto de PRODUCCIÓN', [SUPABASE.proyecto, SUPABASE.url],
    ['al3d-produccion', 'https://gwzfdprdrdudfakjsdxf.supabase.co']);
  cierto('  con su llave pública', SUPABASE.llave === 'sb_publishable__yKAsMzY5aar3i2oYmJtPA_uWcTWjed');
  cierto('  y lo dice una sola constante, EN_USO, que no se exporta', /\nconst EN_USO = 'al3d-produccion';\n/.test(cfg.replace(/\r/g, '')) &&
    [...cfg.matchAll(/^export /gm)].length === 1 && /^export const SUPABASE = PROYECTOS\[EN_USO\];/m.test(cfg));
  const tocanPruebas = readdirSync(join(RAIZ, 'js'), { recursive: true }).map(String).filter(f => f.endsWith('.js'))
    .filter(f => f.replace(/\\/g, '/') !== 'datos/supabase-config.js')
    .filter(f => /hhwjlxukuzxearrjurtc|al3d-pruebas/.test(readFileSync(join(RAIZ, 'js', f), 'utf8')));
  eq('ningún otro archivo de la app nombra el proyecto de pruebas (no hay botón para cambiarlo)', tocanPruebas, []);
  cierto('ni la CSP lo deja pasar', !/hhwjlxukuzxearrjurtc/.test(leer('index.html')));
  const host = SUPABASE.url.replace('https://', '');
  const idx = leer('index.html');
  cierto('index.html deja hablar con ese proyecto por https y wss, y con nada más de supabase.co',
    new RegExp('connect-src[^;]*https://' + host.replace(/\./g, '\\.') + ' wss://' + host.replace(/\./g, '\\.')).test(idx) &&
    (idx.match(/supabase\.co/g) || []).length === 3);
  cierto('el service worker lista el módulo y la configuración, y no cachea la librería por adelantado',
    /'\.\/js\/nucleo\/supa\.js'/.test(leer('sw.js')) && /'\.\/js\/datos\/supabase-config\.js'/.test(leer('sw.js')) && !/^\s*'\.\/vendor\/supabase\.js'/m.test(leer('sw.js')));
  const lic = leer('vendor/SUPABASE-LICENSE.txt');
  const h = createHash('sha256').update(readFileSync(join(RAIZ, 'vendor/supabase.js'))).digest('hex');
  cierto('vendor/supabase.js es el de npm sin cambios: su huella es la que dice su licencia', lic.includes('SHA-256: ' + h) && /MIT License/.test(lic));
  cierto('y no evalúa código ni trae mapas de fuente', !/\beval\(|new Function\(|sourceMappingURL/.test(readFileSync(join(RAIZ, 'vendor/supabase.js'), 'utf8')));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
