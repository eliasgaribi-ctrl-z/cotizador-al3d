/* UNA SOLA ENTRADA — quien pasó la puerta con Google queda también dentro de Supabase (Elías,
 * 2026-10-25: «¿por qué es necesario un segundo acceso a Google?»).
 *
 * Lo que se vigila (js/nucleo/supa.js, `entrarSinBoton`, y js/app.js, `conectarLaNube`):
 *   · sin botón: con la cuenta de la puerta (`login_hint`) y `auto_select`, el token de identidad que
 *     da Google se cambia por la sesión de Supabase con su nonce (a Google la huella, a Supabase el
 *     original);
 *   · si Google no da la cuenta solo (no enseñó nada, se saltó, se cerró, o no contestó), NECESITA_TOQUE:
 *     la app pone el botón en la banda de arriba, no manda a nadie a Ajustes;
 *   · otra cuenta de Google que no es la de la puerta no se queda dentro;
 *   · con sesión ya hecha no se le vuelve a preguntar a Google;
 *   · apagar (Ajustes, o la base que retiró el acceso) deja dicho que fue a propósito, y la entrada
 *     única no vuelve a encender ese aparato sola; encender a mano lo borra.
 *
 * No toca Supabase ni Google: los dos son de mentiras. Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

/* El navegador de mentiras: almacenamiento, documento y ventana. */
const almacen = new Map();
globalThis.localStorage = {
  getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: k => almacen.delete(k), clear: () => almacen.clear(),
};
globalThis.document = { addEventListener() {}, visibilityState: 'hidden', getElementById: () => null,
  head: { appendChild() {} }, createElement: () => ({ dataset: {}, addEventListener() {} }), querySelector: () => null };
globalThis.window = globalThis;

/* Google de mentiras: `modo` dice qué hace su `prompt()`. */
const G = { modo: 'da', config: null, credencial: 'idtoken-de-google', promptLlamado: 0 };
globalThis.google = { accounts: { id: {
  initialize(c) { G.config = c; },
  prompt(aviso) {
    G.promptLlamado++;
    if (G.modo === 'da') setTimeout(() => G.config.callback({ credential: G.credencial }), 5);
    else if (G.modo === 'no_enseña') aviso({ isNotDisplayed: () => true });
    else if (G.modo === 'cerró') aviso({ isDismissedMoment: () => true, getDismissedReason: () => 'cancel_called' });
    /* 'calla': no avisa nada; manda el reloj */
  },
  renderButton() {},
}, oauth2: {} } };

/* Supabase de mentiras. */
const B = { sesion: null, correo: 'elias@al3d.test', entradas: [], salidas: 0 };
const clienteFalso = {
  auth: {
    getSession: async () => ({ data: { session: B.sesion } }),
    signInWithIdToken: async a => { B.entradas.push(a); B.sesion = { user: {} }; return { error: null }; },
    signOut: async () => { B.salidas++; B.sesion = null; return { error: null }; },
  },
  rpc: async nombre => ({ data: nombre === 'mi_acceso'
    ? { ok: true, estado: 'activo', usuario: { id: 'u1', correo: B.correo }, empresas: [{ empresa_id: 'al3d', area: 'direccion', estado: 'activo', modo: 'hoja' }], modo: 'hoja' }
    : { ok: true }, error: null }),
};
globalThis.supabase = { createClient: () => clienteFalso };

const S = await import('../js/nucleo/supa.js');

console.log('\nAPAGAR A PROPÓSITO');
{
  eq('nace sin la marca', S.apagadoAProposito(), false);
  S.encender(false);
  eq('apagar deja dicho que fue a propósito', [S.encendido(), S.apagadoAProposito()], [false, true]);
  S.encender(true);
  eq('encender a mano la borra', [S.encendido(), S.apagadoAProposito()], [true, false]);
}

console.log('\nSIN BOTÓN');
{
  S.encender(false); localStorage.removeItem(S.CLAVE_NO_SOLO);
  eq('apagado no le pregunta a Google', (await S.entrarSinBoton('elias@al3d.test')).codigo, 'APAGADO');
  S.encender(true);
  const r = await S.entrarSinBoton('elias@al3d.test');
  eq('Google da la cuenta solo: dentro de Supabase, con el acceso de la base', [r.ok, r.acceso && r.acceso.correo], [true, 'elias@al3d.test']);
  eq('con la cuenta de la puerta y sin escoger', [G.config.login_hint, G.config.auto_select, G.config.use_fedcm_for_prompt], ['elias@al3d.test', true, true]);
  eq('a Supabase el token de Google y el nonce original', [B.entradas[0].provider, B.entradas[0].token], ['google', 'idtoken-de-google']);
  eq('y a Google su huella SHA-256', G.config.nonce, createHash('sha256').update(B.entradas[0].nonce).digest('hex'));
  const antes = G.promptLlamado;
  const r2 = await S.entrarSinBoton('elias@al3d.test');
  eq('con sesión ya hecha no se le vuelve a preguntar a Google', [r2.ok, r2.ya, G.promptLlamado], [true, true, antes]);
}

console.log('\nCUANDO HACE FALTA EL TOQUE');
{
  for (const [modo, que] of [['no_enseña', 'Google no enseñó nada'], ['cerró', 'la persona cerró la tarjeta'], ['calla', 'Google no contestó (el reloj)']]) {
    B.sesion = null; G.modo = modo;
    eq(que + ': NECESITA_TOQUE', (await S.entrarSinBoton('elias@al3d.test', { esperaMs: 30 })).codigo, 'NECESITA_TOQUE');
  }
}

console.log('\nOTRA CUENTA');
{
  B.sesion = null; G.modo = 'da'; B.correo = 'otra@gmail.test';
  const salidas = B.salidas;
  const r = await S.entrarSinBoton('elias@al3d.test');
  eq('una cuenta que no es la de la puerta no se queda dentro', [r.ok, r.codigo, B.salidas, B.sesion], [false, 'OTRA_CUENTA', salidas + 1, null]);
  B.correo = 'elias@al3d.test';
}

console.log('\nLA APP');
{
  const app = leer('js/app.js');
  cierto('arranca la entrada única después de montar la pantalla, sin frenar el arranque',
    /conectarLaNube\(\)\.catch\(\(\) => \{/.test(app));
  cierto('sin correo de Google (token de emergencia) no hace nada',
    /const correo = Ingreso\.correo\(\);\n  if \(!correo\) return;/.test(app));
  cierto('no vuelve a encender un aparato apagado a propósito',
    /if \(!Supa\.encendido\(\)\) \{\n    if \(Supa\.apagadoAProposito\(\)\) return;\n    Supa\.encender\(true\);/.test(app));
  cierto('si hace falta el toque, el botón de Google va en la banda de arriba y no en Ajustes',
    /id="pf-nube-google"/.test(app) && /Supa\.botonDeGoogle\(caja,/.test(app));
  cierto('y con el botón tampoco se queda dentro otra cuenta',
    /!Supa\.esLaMismaPersona\(res\.acceso && res\.acceso\.correo, correo\)/.test(app));
  cierto('supa.js sigue sin importarse de forma estática', !/^import[^;]*supa\.js/m.test(app));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);   // `vigilar()` deja su reloj puesto: sin esto node no termina
