/* ============================================================================
   EL CAPTCHA DE LA PUERTA — Cloudflare Turnstile.

   Antes de «Entrar con Google», la puerta (js/nucleo/puerta.js) pide que el navegador pase una
   comprobación de «no soy un robot». Se eligió Turnstile y no reCAPTCHA por tres cosas: es
   gratis y sin tope, casi nunca le pide nada a la persona —corre por detrás y solo enseña un
   recuadro cuando duda—, y no se queda con un perfil de nadie: el equipo entra con su cuenta de
   Google a diario y no hace falta darle a un tercero más datos de los que ya tiene.

   ── Lo que esto SÍ es, y lo que NO ─────────────────────────────────────────────
   Es un freno a lo automático: un guion que apriete «Entrar con Google» en bucle, o un
   navegador sin cabeza que se pasee por la puerta, no pasa de aquí. NO es lo que protege el
   dinero ni los datos, y hay que decirlo: eso sigue siendo Google (quién eres) y la lista de
   «Accesos» de la hoja (qué te toca), del lado del servidor. El token del captcha no viaja a
   ninguna parte; si algún día la hoja tuviera que exigirlo, se verifica allá con la clave
   secreta de Turnstile (`siteverify`), y esa es otra pieza.

   ── Falla ABIERTO, a propósito ─────────────────────────────────────────────────
   Si el guion de Cloudflare no baja (sin señal, un bloqueador de anuncios, un firewall), si el
   recuadro da error o si no contesta en MS_LIMITE, la puerta se abre igual y lo dice. Es la
   misma regla de ingreso.js —«una app que solo funciona cuando un tercero contesta bien no está
   terminada»— y aquí cuesta poco: una comprobación que corre en el navegador de quien la
   quiere saltar no se la salta nadie con ella cerrada, y sí deja a un instalador sin plataforma
   en mitad de una obra porque un bloqueador se comió un guion.

   ── Cómo se enciende ───────────────────────────────────────────────────────────
   Con `SITE_KEY` vacía no hay captcha y la puerta es la de siempre; hoy trae la del widget de AL3D.
   La clave de sitio no es un secreto —viaja en cada página, como el CLIENT_ID de ingreso.js—; se saca gratis en
   dash.cloudflare.com → Turnstile → Agregar widget, con los dos dominios de la app
   (`eliasgaribi-ctrl-z.github.io` y `cotizador-al3d.pages.dev`), modo «Administrado», y se pega
   abajo. La «clave secreta» que Cloudflare da junto NO se usa aquí y no debe pegarse en el
   repositorio.
   ============================================================================ */

/* Tiene que bajar de esta URL exacta: Cloudflare avisa que guardarla en caché o pasarla por un
   proxy rompe el captcha cuando sacan una versión nueva. Por eso el service worker no la toca
   (solo guarda lo del propio origen) y por eso no se copia al repositorio. */
const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/* La clave de SITIO de Turnstile —la pública—, del widget «AL3D puerta» creado el 12 de octubre de
   2026 en la cuenta de Elías, con los hostnames `eliasgaribi-ctrl-z.github.io` y
   `cotizador-al3d.pages.dev` en modo Administrado. Desde cualquier otro dominio Turnstile da error
   y la puerta se abre sola (ver «Falla ABIERTO»). Vacía = sin captcha. Ver la cabecera. */
export const SITE_KEY = '0x4AAAAAAFU9b8FWaI0B9NA1';

/* Cuánto se espera a que el recuadro conteste antes de abrir la puerta de todos modos. Corre solo
   mientras NADIE tiene que hacer nada: si Cloudflare pide un clic, el reloj se detiene —esa
   espera es de una persona— y vuelve a correr cuando termina. */
export const MS_LIMITE = 15000;

/** true cuando hay clave y, por tanto, la puerta tiene que pedir la comprobación. */
export const configurado = (clave = SITE_KEY) => !!String(clave || '').trim();

let _cargando = null;

/** Baja el guion de Turnstile una sola vez. Resuelve false —nunca rechaza— si no baja: quien
 *  llama abre la puerta y lo dice. */
export function cargar() {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve(true);
  if (_cargando) return _cargando;
  _cargando = new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(false);
    const s = document.createElement('script');
    s.src = TURNSTILE + '?render=explicit';
    s.async = true; s.defer = true; s.dataset.turnstile = '1';
    s.onload = () => resolve(!!(window.turnstile && typeof window.turnstile.render === 'function'));
    /* Sin señal o con un bloqueador, `onerror` es el caso normal. Se suelta `_cargando` para
       que la siguiente puerta lo intente otra vez en vez de heredar el fallo para siempre. */
    s.onerror = () => { _cargando = null; try { s.remove(); } catch (_) {} resolve(false); };
    document.head.appendChild(s);
  });
  return _cargando;
}

/**
 * Pone el recuadro en `el` y avisa de en qué va. Tres estados, y son los únicos:
 *   · `espera`  — todavía no hay comprobación. La puerta no deja tocar «Entrar».
 *   · `listo`   — Cloudflare dio por buena al navegador.
 *   · `abierto` — no se pudo comprobar (no bajó, dio error, no contestó): la puerta deja entrar
 *                 y lo dice. Si más tarde llega el visto bueno, pasa a `listo`.
 *
 * @param {Element} el dónde dibujar el recuadro.
 * @param {{alCambiar:(estado:string, motivo?:string)=>void,
 *          alInteractivo?:(visible:boolean)=>void,
 *          clave?:string, limite?:number, tema?:'light'|'dark'|'auto'}} op
 * @returns {{estado:()=>string, token:()=>string, quitar:()=>void}}
 */
export function vigilar(el, op = {}) {
  const clave = String(op.clave === undefined ? SITE_KEY : op.clave).trim();
  const limite = op.limite > 0 ? op.limite : MS_LIMITE;
  let estado = 'espera', token = '', id = null, vivo = true, reloj = 0;

  const avisar = (e, motivo) => {
    if (!vivo || estado === e) return;
    estado = e;
    try { if (op.alCambiar) op.alCambiar(e, motivo || ''); } catch (_) {}
  };
  const armar = () => { clearTimeout(reloj); reloj = setTimeout(() => avisar('abierto', 'no contestó'), limite); };
  const parar = () => clearTimeout(reloj);

  try { if (op.alCambiar) op.alCambiar('espera', ''); } catch (_) {}
  if (!configurado(clave)) { avisar('abierto', 'sin clave'); return { estado: () => estado, token: () => '', quitar() {} }; }
  armar();

  cargar().then(bajo => {
    if (!vivo) return;
    if (!bajo) return avisar('abierto', 'no cargó');
    try {
      id = window.turnstile.render(el, {
        sitekey: clave,
        /* Solo se ve si Cloudflare duda: casi todos los días, la persona no ve ningún recuadro. */
        appearance: 'interaction-only',
        language: 'es',
        theme: op.tema || 'auto',
        size: 'flexible',
        callback: t => { token = String(t || ''); parar(); avisar('listo'); },
        /* Pasados cinco minutos el visto bueno caduca y Cloudflare lo renueva solo
           (`refresh-expired`); mientras tanto la puerta vuelve a pedir paciencia. */
        'expired-callback': () => { token = ''; avisar('espera'); armar(); },
        /* `true` le dice a Turnstile que el error ya está atendido y no lo grite a la consola. */
        'error-callback': codigo => { token = ''; parar(); avisar('abierto', 'error ' + String(codigo || '')); return true; },
        'unsupported-callback': () => { parar(); avisar('abierto', 'navegador no compatible'); },
        'before-interactive-callback': () => { parar(); try { if (op.alInteractivo) op.alInteractivo(true); } catch (_) {} },
        'after-interactive-callback': () => { try { if (op.alInteractivo) op.alInteractivo(false); } catch (_) {} if (estado !== 'listo') armar(); },
      });
    } catch (_) {
      avisar('abierto', 'no se pudo dibujar');
    }
  });

  return {
    estado: () => estado,
    token: () => token,
    quitar() {
      vivo = false; parar();
      try { if (id != null && window.turnstile) window.turnstile.remove(id); } catch (_) {}
    },
  };
}
