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
 * Y desde la puerta de UN toque (2026-10-25, js/nucleo/puerta.js `confirmarConCredencial`), corrida
 * entera sin navegador:
 *   · con la empresa en 'base' y la persona activa, el token del botón de Google basta: Supabase con su
 *     nonce, el pase de la base, y ni /salud, ni la ventana del permiso de la hoja, ni otro aviso de
 *     Google —tampoco después: `entrarSinBoton` encuentra la sesión de la puerta—;
 *   · quien no está activo en la base no entra por ella; con la base mandando, una baja o una cuenta que la
 *     base no conoce es «fuera» de la base (ES-1), y con la hoja mandando la base nunca dice «fuera»;
 *   · con la empresa en la hoja, la hoja decide como siempre: sin toque reciente, «falta un toque»; con
 *     él, una sola ventana de la hoja, y a la hoja le llega el token de ACCESO, nunca el de identidad;
 *   · un token con otro nonce, de otra app o vencido no llega a Supabase, y el token no se guarda en
 *     ningún lado.
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

/* Google de mentiras: `modo` dice qué hace su `prompt()`. El botón (`renderButton`) se apunta, y el
   permiso de la hoja (`oauth2`, la ventana de siempre) cuenta cuántas veces se abrió. */
const G = { modo: 'da', config: null, credencial: 'idtoken-de-google', promptLlamado: 0, botones: [], ventanasDeLaHoja: 0 };
globalThis.google = { accounts: { id: {
  initialize(c) { G.config = c; },
  prompt(aviso) {
    G.promptLlamado++;
    if (G.modo === 'da') setTimeout(() => G.config.callback({ credential: G.credencial }), 5);
    else if (G.modo === 'no_enseña') aviso({ isNotDisplayed: () => true });
    else if (G.modo === 'cerró') aviso({ isDismissedMoment: () => true, getDismissedReason: () => 'cancel_called' });
    /* 'calla': no avisa nada; manda el reloj */
  },
  renderButton(caja, opciones) { G.botones.push({ caja, opciones }); },
}, oauth2: { initTokenClient(cfg) {
  return { cfg, callback: cfg.callback, requestAccessToken() {
    G.ventanasDeLaHoja++;
    setTimeout(() => this.callback({ access_token: 'tok-de-acceso-de-la-hoja', expires_in: 3600 }), 1);
  } };
} } } };

/* Supabase de mentiras. `correo` es la cuenta de Google con la que se entra (la sesión la trae, como la de
   verdad), y `mi_acceso` contesta con `estado`, `modo` y `area`. */
const B = { sesion: null, correo: 'elias@al3d.test', estado: 'activo', modo: 'hoja', area: 'direccion', entradas: [], salidas: 0 };
const clienteFalso = {
  auth: {
    getSession: async () => ({ data: { session: B.sesion } }),
    signInWithIdToken: async a => {
      B.entradas.push(a);
      B.sesion = { user: { email: B.correo } };
      return { data: { user: { email: B.correo }, session: B.sesion }, error: null };
    },
    signOut: async () => { B.salidas++; B.sesion = null; return { error: null }; },
  },
  rpc: async nombre => ({ data: nombre === 'mi_acceso'
    ? { ok: true, estado: B.estado, usuario: { id: 'u1', correo: B.correo },
        empresas: B.estado === 'activo' ? [{ empresa_id: 'al3d', area: B.area, estado: 'activo', modo: B.modo }] : [], modo: B.modo }
    : { ok: true }, error: null }),
};
globalThis.supabase = { createClient: () => clienteFalso };

/* La red: el correo que da Google con el permiso de la hoja, y la hoja (`/salud`). Se apunta lo que se le
   mandó a la hoja, para ver con QUÉ token. */
const H = { pedidas: [], rol: 'fabricacion' };
globalThis.fetch = async (url, op) => {
  if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
    return { ok: true, status: 200, json: async () => ({ email: B.correo, email_verified: true }) };
  }
  H.pedidas.push(JSON.parse(op && op.body || '{}'));
  return { ok: true, status: 200, json: async () => ({ ok: true, via: 'google', correo: B.correo, rol: H.rol, escribibles: [] }) };
};
const conGesto = si => {
  if (si) Object.defineProperty(globalThis.navigator, 'userActivation', { value: { isActive: true }, configurable: true });
  else delete globalThis.navigator.userActivation;
};

/* El token de identidad que da el botón de Google: un JWT con el correo, la audiencia de la app y la huella
   del nonce que se le dio a Google. La firma la mira Supabase, no la app. */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sha = t => createHash('sha256').update(t).digest('hex');
const credencialDe = (correo, crudo, extra = {}) => ({
  credencial: b64({ alg: 'RS256' }) + '.' + b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, email: correo,
    email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600, nonce: sha(crudo), ...extra }) + '.firma',
  crudo, nonce: sha(crudo),
});
const { CLIENT_ID } = await import('../js/nucleo/ingreso.js');

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

console.log('\nUNA SESIÓN DE OTRA CUENTA NO CUENTA COMO «YA ESTÁ»');
{
  /* Alguien entró a la nube con una cuenta y a la puerta con otra («Entrar con otra cuenta»): la sesión que
     hay no es de quien está en la puerta. Antes `entrarSinBoton` contestaba «ya» sin mirar de quién era. */
  G.modo = 'da'; B.sesion = { user: { email: 'otra@gmail.test' } };
  const salidas = B.salidas, antes = G.promptLlamado;
  const r = await S.entrarSinBoton('elias@al3d.test');
  eq('se suelta y se pide la de la puerta', [B.salidas, G.promptLlamado, r.ok, r.ya], [salidas + 1, antes + 1, true, undefined]);
  B.sesion = { user: { email: 'Elias@AL3D.test' } };
  const r2 = await S.entrarSinBoton('elias@al3d.test');
  eq('la de la misma cuenta (sin importar mayúsculas) sí: no se le pregunta a Google', [r2.ya, G.promptLlamado], [true, antes + 1]);
}

console.log('\nEL BOTÓN DE GOOGLE ES UNO (la puerta, la banda y Ajustes)');
{
  const I = await import('../js/nucleo/ingreso.js');
  const caja = { isConnected: true, innerHTML: 'algo' };
  let recibido = null;
  const pintado = await I.botonDeIdentidad(caja, c => { recibido = c; }, { aspecto: { theme: 'filled_blue', width: 300 } });
  const boton = G.botones.slice(-1)[0];
  eq('se pinta en su caja, con el aspecto que se pidió y en español', [pintado, boton.caja === caja, boton.opciones.theme, boton.opciones.width, boton.opciones.locale],
     [true, true, 'filled_blue', 300, 'es']);
  eq('con el Client ID de la app, FedCM para el botón y sin escoger solo', [G.config.client_id, G.config.use_fedcm_for_button, G.config.auto_select], [CLIENT_ID, true, false]);
  G.config.callback({ credential: 'el-jwt' });
  eq('al tocarlo da el token con su nonce: a Google la huella, a quien llama también el original',
     [recibido.credencial, recibido.nonce === G.config.nonce, sha(recibido.crudo) === recibido.nonce], ['el-jwt', true, true]);
  eq('sin caja en la página no pinta nada', await I.botonDeIdentidad({ isConnected: false }, () => {}), false);
}

console.log('\nLA PUERTA CON EL BOTÓN DE GOOGLE: LA EMPRESA EN LA BASE');
const P = await import('../js/nucleo/puerta.js');
const pasos = [];
const alPaso = (c, e, d, tx) => pasos.push([c, e, d || '', tx || '']);
{
  /* Un teléfono que entra hoy por primera vez después del cambio: Supabase apagado (pero no a propósito), la
     empresa ya en 'base'. Un toque en el botón de Google, y adentro con el área de la base. */
  localStorage.removeItem(S.CLAVE_INTERRUPTOR); localStorage.removeItem(S.CLAVE_NO_SOLO); localStorage.removeItem(S.CLAVE_MODO);
  localStorage.removeItem('al3d_pf_pase');
  B.sesion = null; B.modo = 'base'; B.estado = 'activo'; B.area = 'fabricacion'; B.correo = 'elias@al3d.test';
  const entradas = B.entradas.length, prompts = G.promptLlamado, ventanas = G.ventanasDeLaHoja, hoja = H.pedidas.length;
  const cred = credencialDe('elias@al3d.test', 'nonce-crudo-1');
  const v = await P.confirmarConCredencial(cred, alPaso);
  eq('adentro, con el área que dice la base', [v.estado, v.correo, v.rol], ['ok', 'elias@al3d.test', 'fabricacion']);
  const pase = JSON.parse(localStorage.getItem('al3d_pf_pase') || 'null');
  eq('  y el pase es de la base', [pase && pase.rol, pase && pase.de, pase && pase.correo], ['fabricacion', 'base', 'elias@al3d.test']);
  eq('  Supabase recibió ESE token con el nonce ORIGINAL (Google tenía la huella)',
     [B.entradas.length - entradas, B.entradas.slice(-1)[0].token, B.entradas.slice(-1)[0].nonce, sha(B.entradas.slice(-1)[0].nonce) === cred.nonce],
     [1, cred.credencial, 'nonce-crudo-1', true]);
  eq('  la hoja no se tocó: ni /salud, ni ventana del permiso de la hoja, ni otro aviso de Google',
     [H.pedidas.length - hoja, G.ventanasDeLaHoja - ventanas, G.promptLlamado - prompts], [0, 0, 0]);
  eq('  el interruptor de este aparato quedó encendido y sabe que la base manda', [S.encendido(), S.laBaseManda()], [true, true]);
  eq('  el correo de la puerta es el del token', (await import('../js/nucleo/ingreso.js')).correo(), 'elias@al3d.test');
  eq('  los dos pasos: Google con el correo, y la base', pasos.filter(p => p[1] === 'ok').map(p => p[0] + ':' + p[2]),
     ['google:elias@al3d.test', 'hoja:']);
  cierto('  el segundo renglón dice «La base», no «La hoja»', pasos.some(p => p[0] === 'hoja' && p[3] === 'La base · qué te toca'));

  /* Lo que importa del toque único: después, la app no le vuelve a preguntar a Google. */
  const antes = G.promptLlamado;
  const r = await S.entrarSinBoton('elias@al3d.test');
  eq('después, conectarLaNube encuentra la sesión de la puerta: ningún otro aviso de Google', [r.ok, r.ya, G.promptLlamado - antes], [true, true, 0]);
  const todo = [...almacen.values()].join('\n');
  cierto('el token de identidad no quedó guardado en el aparato (ni entero, ni su cuerpo)',
    !todo.includes(cred.credencial) && !todo.includes(cred.credencial.split('.')[1]));
}

console.log('\nLA PUERTA CON EL BOTÓN DE GOOGLE: QUIEN NO ESTÁ ACTIVO NO ENTRA POR LA BASE');
{
  /* Con la base mandando (este aparato ya lo sabe), una baja o una cuenta que la base no conoce es «fuera» de la base, sin
     preguntarle a la hoja: dar de baja en la base no sacaba a nadie (auditoría 2026-10-25, ES-1). Un correo que Google no
     confirma no es una baja: decide la hoja. */
  for (const [estado, esperado] of [['sin_acceso', ['fuera', undefined, null, 0]], ['acceso_revocado', ['fuera', undefined, null, 0]],
    ['correo_no_verificado', ['sin_red', true, null, 0]]]) {
    B.sesion = null; B.estado = estado; pasos.length = 0;
    localStorage.removeItem('al3d_pf_pase');
    const hoja = H.pedidas.length;
    const v = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'n-' + estado), alPaso);
    eq(estado + (esperado[0] === 'fuera' ? ': con la base mandando es «fuera» de la base, sin pase ni hoja' : ': no entra por la base; decide la hoja (falta su toque)'),
       [v.estado, v.toque, localStorage.getItem('al3d_pf_pase'), H.pedidas.length - hoja], esperado);
  }
  /* Con la empresa en la hoja (lo que este aparato oyó), lo de siempre: la base nunca dice «fuera». */
  const modoAntes = localStorage.getItem('al3d_pf_supa_modo');
  for (const estado of ['sin_acceso', 'acceso_revocado']) {
    B.sesion = null; B.estado = estado; pasos.length = 0;
    localStorage.removeItem('al3d_pf_pase');
    localStorage.setItem('al3d_pf_supa_modo', JSON.stringify({ modo: 'hoja' }));
    const hoja = H.pedidas.length;
    const v = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'h-' + estado), alPaso);
    eq(estado + ' con la hoja mandando: no entra por la base; decide la hoja (falta su toque), y nunca es un «fuera» de la base',
       [v.estado, v.toque, localStorage.getItem('al3d_pf_pase'), H.pedidas.length - hoja], ['sin_red', true, null, 0]);
  }
  if (modoAntes === null) localStorage.removeItem('al3d_pf_supa_modo'); else localStorage.setItem('al3d_pf_supa_modo', modoAntes);
  B.estado = 'activo';
}

console.log('\nLA PUERTA CON EL BOTÓN DE GOOGLE: LA EMPRESA EN LA HOJA');
{
  B.sesion = null; B.modo = 'hoja'; B.area = 'direccion'; pasos.length = 0;
  localStorage.removeItem('al3d_pf_pase');
  conGesto(false);
  const ventanas = G.ventanasDeLaHoja, hoja = H.pedidas.length;
  const cred = credencialDe('elias@al3d.test', 'nonce-crudo-hoja');
  const v = await P.confirmarConCredencial(cred, alPaso);
  eq('sin un toque reciente: falta un toque —la ventana de la hoja no se abre sola—, con su aviso',
     [v.estado, v.toque, /la hoja pide su propio permiso/.test(v.mensaje), G.ventanasDeLaHoja - ventanas, H.pedidas.length - hoja],
     ['sin_red', true, true, 0, 0]);
  eq('  pero ya quedó dentro de Supabase, y el pase NO salió de la base', [!!B.sesion, localStorage.getItem('al3d_pf_pase')], [true, null]);
  cierto('  el renglón de la hoja dice que falta un toque', pasos.some(p => p[0] === 'hoja' && p[1] === 'mal' && p[2] === 'falta un toque'));

  /* Con el toque todavía vivo (Chrome, a veces), sigue solo por el camino de siempre. */
  B.sesion = null; H.rol = 'pagos';
  conGesto(true);
  const v2 = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'nonce-crudo-hoja-2'), alPaso);
  conGesto(false);
  const ultima = H.pedidas.slice(-1)[0] || {};
  eq('con un toque reciente, la hoja decide en el mismo intento, con su rol', [v2.estado, v2.rol], ['ok', 'pagos']);
  eq('  con UNA ventana del permiso de la hoja', G.ventanasDeLaHoja - ventanas, 1);
  eq('  y a la hoja le llega el token de ACCESO, nunca el de identidad', [ultima.ruta, ultima.google_token], ['salud', 'tok-de-acceso-de-la-hoja']);
  cierto('  el pase es de la hoja', JSON.parse(localStorage.getItem('al3d_pf_pase') || '{}').de === undefined);
  H.rol = 'fabricacion';
}

console.log('\nLA PUERTA CON EL BOTÓN DE GOOGLE: LO QUE NO SE ACEPTA');
{
  const entradas = B.entradas.length;
  const ing = await import('../js/nucleo/ingreso.js');
  const malo = credencialDe('elias@al3d.test', 'nonce-a');
  malo.nonce = sha('otro-nonce');
  const v = await P.confirmarConCredencial(malo, alPaso);
  eq('un token con otro nonce no llega a Supabase, y se dice', [v.estado, !!v.mensaje, B.entradas.length - entradas], ['sin_red', true, 0]);
  const v2 = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'nonce-b', { aud: 'otra-app.apps.googleusercontent.com' }), alPaso);
  eq('ni uno de otra app', [v2.estado, B.entradas.length - entradas], ['sin_red', 0]);
  const v3 = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'nonce-c', { exp: Math.floor(Date.now() / 1000) - 60 }), alPaso);
  eq('ni uno vencido', [v3.estado, B.entradas.length - entradas], ['sin_red', 0]);
  eq('y el correo de la puerta no cambió por ninguno de los tres', ing.correo(), 'elias@al3d.test');

  /* Supabase apagado a propósito en este aparato: la puerta ni enseña el botón (puerta.mjs lo vigila), y aun
     así, si llegara un token, no se enciende nada ni se entra a Supabase. */
  S.encender(false);
  const v4 = await P.confirmarConCredencial(credencialDe('elias@al3d.test', 'nonce-d'), alPaso);
  eq('apagado a propósito: ni se enciende ni entra a Supabase; decide la hoja', [S.encendido(), B.entradas.length - entradas, v4.toque], [false, 0, true]);
  S.encender(true);
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
  /* Con la base mandando, quien entró con UN toque no debe ver la ventana del permiso de la hoja en su
     primer clic: el oyente que lo renovaba se para antes de abrir nada. */
  const clic = (app.match(/document\.addEventListener\('click', async \(\) => \{[\s\S]*?\}, true\);/) || [''])[0];
  cierto('con la base mandando, el clic ya no renueva el permiso de la hoja (y lo dice antes de abrir nada)',
    /if \(laBaseManda\(\)\) return;/.test(clic) && clic.indexOf('if (laBaseManda()) return;') < clic.indexOf('Ingreso.renovar('));
}

console.log('\nNI LA PUERTA NI SUPA.JS GUARDAN EL TOKEN DE IDENTIDAD');
{
  const sinCom = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['js/nucleo/puerta.js', 'js/nucleo/supa.js', 'js/nucleo/ingreso.js']) {
    cierto(f + ': sin sessionStorage', !/sessionStorage/.test(sinCom(leer(f))));
  }
  const pu = sinCom(leer('js/nucleo/puerta.js'));
  cierto('la puerta no le pasa el token a nada que guarde: solo a anotarCredencial (lee el correo) y a Supabase',
    (pu.match(/\.credencial\b/g) || []).length === 2 && /Ingreso\.anotarCredencial\(cred && cred\.credencial/.test(pu) &&
    /Supa\.entrarConCredencial\(cred\.credencial, cred\.crudo, correo\)/.test(pu));
  const su = sinCom(leer('js/nucleo/supa.js'));
  cierto('supa.js lo cambia por la sesión en UN solo lugar', (su.match(/signInWithIdToken\(/g) || []).length === 1 &&
    /async function cambiarPorSesion\(credencial, crudo, correoPuerta\)/.test(su));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);   // `vigilar()` deja su reloj puesto: sin esto node no termina
