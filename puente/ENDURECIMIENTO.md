
# Endurecimiento de `puente/worker.js`

> ## LOS DIEZ PARCHES YA ESTÁN APLICADOS EN `puente/worker.js`
>
> Este documento pasó de ser una propuesta a ser la explicación de por qué el archivo dice lo
> que dice. Se conserva entero —con el «antes», el «después» y el razonamiento de cada uno—
> porque el código guarda el resultado y no el motivo, y dentro de un año el motivo es lo que
> va a hacer falta.
>
> **Lo que falta es pegarlo en Cloudflare, y ahí el orden no es negociable:**
>
> 1. **Primero** `ORIGENES` en el panel del Worker con los **dos** dominios separados por
>    coma, sin barra final, y **Deploy** (guardar la variable no basta). Con el parche 1
>    puesto, un origen que no está en la lista ya no recibe cabecera de CORS: si pegas el
>    código antes de arreglar la variable, los tres teléfonos dejan de sincronizar.
> 2. Después el código: *Edit code*, borrar todo, pegar `puente/worker.js` entero, *Deploy*.
> 3. Después `Ajustes → El puente → Probar` en los tres teléfonos, uno por uno, comprobando
>    que cada uno reconoce **su** rol.
> 4. Y una vez en `Workers → Logs`, para ver el rastro del parche 9: tiene que traer nombres
>    de propiedad y ni un solo importe.
>
> `pruebas/worker.mjs` cubre los diez y creció de 88 a 133 aserciones: la travesía de ruta con
> `../databases/`, el alta desde fabricación, los importes negativos, el `TOKENS` roto, el
> origen ajeno con su 403 al preflight, el `no-store`, la operación que revienta sin llevarse
> el acuse de las demás, y el `/expandir` que ya devuelve 404. Y la que más importa de todas:
> que un renglón mal escrito en `TOKENS` **no apague a los otros dos teléfonos**, que es lo
> que hace que revocar un token perdido se pueda hacer con prisa.
>
> **Un cambio tiene consecuencia visible y conviene saberlo antes:** `/jalar` ya no manda los
> importes crudos. Ver el parche 8 — no cambia ninguna pantalla, porque el cliente no los
> leía, pero es el único que altera lo que cruza la red.

**Regla que gobierna todo el documento:** `pruebas/worker.mjs` importa el Worker de verdad y lo corre contra una Notion de mentiras, y `pruebas/puente.mjs` lo lee **como texto** y le saca `ETAPAS`, `TIPOS`, `ESTATUS` y `CUENTAS` con expresiones regulares (`pruebas/puente.mjs:173-181`). Cada parche de abajo dice si rompe alguna de las dos. **Uno rompe** (el 7) y lleva su parche de prueba al lado.

Orden de despliegue obligatorio antes de tocar nada: **primero** pon `ORIGENES` en el Worker con los **dos** dominios (`https://eliasgaribi-ctrl-z.github.io,https://<nuevo>.pages.dev`) y redespliega. El parche 1 sin eso deja a los tres teléfonos sin sincronizar.

**Dos cosas se aplicaron distinto de como están escritas abajo, y las dos a la baja:**

- **Parche 4.** Solo se aplicó la mitad del Worker (el rango de los importes). La mitad del cliente —dejar de mandar `Anticipo: 0`— **no**, porque exige decidir antes qué significa `Anticipo` en la base: lo pactado o lo recibido. Esa decisión es del negocio y no se toma desde un parche.
- **Parche 8.** La lista de `/jalar` quedó **más estricta** que la propuesta de abajo, y por una razón mejor: no salió de una opinión sobre qué debería ver cada rol, sino de leer qué consume el cliente. `deNotion` usa seis campos y `bajar` añade el sello; nada más. Así que el filtro es **el mismo para los tres roles** y no cambia una sola pantalla, en vez de recortarle a fabricación un espejo de cobranza que el dueño había decidido darle a propósito.

---

## Parche 1 — El origen no permitido se niega, no se sustituye

*(tu prioridad 2 · valor alto por lo que habilita · 3 líneas)*

**Antes** — `puente/worker.js:136-150`

```js
function origenPermitido(req, env) {
  const lista = String(env.ORIGENES || 'https://eliasgaribi-ctrl-z.github.io')
    .split(',').map(s => s.trim()).filter(Boolean);
  const o = req.headers.get('Origin') || '';
  return lista.includes(o) ? o : (lista[0] || '');
}
function cabecerasCors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
```

**Después**

```js
function origenPermitido(req, env) {
  const lista = String(env.ORIGENES || 'https://eliasgaribi-ctrl-z.github.io')
    .split(',').map(s => s.trim()).filter(Boolean);
  const o = req.headers.get('Origin') || '';
  /* Si el origen no está en la lista NO se contesta con otro. Devolver `lista[0]` hacía que
     un dominio mal puesto se viera desde el teléfono exactamente igual que «no hay señal»
     (js/datos/puente.js:283-285 lo dice así), y que un `curl -X OPTIONS` de diagnóstico
     contestara 204 con unas cabeceras que se ven bien. Vacío significa vacío. */
  return lista.includes(o) ? o : '';
}
function cabecerasCors(origen) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    /* Varía por Authorization además de por Origin: la respuesta DEPENDE del token — el rol,
       los escribibles, y con el parche 8 hasta qué columnas se devuelven. */
    'Vary': 'Origin, Authorization',
  };
  /* Sin origen permitido, ninguna cabecera. Nunca `*`: con Authorization de por medio, un
     comodín es una invitación abierta a que cualquier página del mundo use este token. */
  if (origen) h['Access-Control-Allow-Origin'] = origen;
  return h;
}
```

**Y** — `puente/worker.js:304`

```js
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecerasCors(origen) });
```

```js
    if (req.method === 'OPTIONS') {
      /* 403 al preflight de un origen desconocido. El navegador falla igual que con un 204
         sin cabecera, pero en los logs de Cloudflare queda dicho que fue el ORIGEN y no la
         red. Es diagnóstico, no defensa: `curl` no manda Origin y no le toca esta rama. */
      const o = req.headers.get('Origin') || '';
      return new Response(null, { status: (o && !origen) ? 403 : 204, headers: cabecerasCors(origen) });
    }
```

**Por qué.** Hoy no protege menos ni más — con el ACAO equivocado el navegador bloquea igual que sin ACAO, y desde JavaScript se ve idéntico. Lo que compra es el **paso 3 de la mudanza**: el `curl -X OPTIONS` con el dominio de Pages hoy contesta 204 con cabeceras convincentes aunque te hayas equivocado de dominio, porque cae al `lista[0]`. Con esto, o sale el dominio nuevo o no sale nada.

**¿Rompe algo?** No.
- `pruebas/worker.mjs:206` pide `/salud` con `https://ejemplo.mx`, que sí está en `ENV.ORIGENES` → devuelve ese origen. ✓
- `:207` exige `/Origin/i` en `Vary` → `'Origin, Authorization'` casa. ✓
- `:209-213` con `https://el-malo.com` compara `ACAO === 'https://el-malo.com'` y `=== '*'`; ahora `get()` devuelve `null` y las dos siguen dando `false`. ✓ (Esta prueba estaba escrita justo para poder endurecerse.)
- `:215-217` el preflight va con origen válido → sigue 204. ✓
- Cliente: sin `Origin` (curl, mismo origen) nunca hizo falta ACAO. Con `Origin` válido, idéntico.

**Lo que NO hagas en la misma pasada:** quitar el `'https://eliasgaribi-ctrl-z.github.io'` codificado de la línea 137. Si `ORIGENES` no está puesta todavía y quitas el default, `lista` queda vacía, todo origen sale `''` y rompes a los tres teléfonos con el mismo síntoma que estás tratando de evitar. Se quita **después** de confirmar que los tres sincronizan desde el dominio nuevo.

---

## Parche 2 — Cabeceras de respuesta

*(tu prioridad 4 · 3 líneas · cero riesgo)*

**Antes** — `puente/worker.js:151-154`

```js
const json = (cuerpo, estado, origen, extra) => new Response(JSON.stringify(cuerpo), {
  status: estado || 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecerasCors(origen), ...(extra || {}) },
});
```

**Después**

```js
const json = (cuerpo, estado, origen, extra) => new Response(JSON.stringify(cuerpo), {
  status: estado || 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    /* Por aquí sale el dinero y las direcciones de los clientes. Que no se guarde en ningún
       lado: ni en el borde de Cloudflare el día que alguien encienda una Cache Rule sobre el
       dominio propio, ni en el Cache Storage del service worker si el puente acaba viviendo
       en el mismo dominio — sw.js:197 solo descarta lo de OTRO origen, así que ese día el
       `no-store` es lo único que separa las dos cosas. */
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...cabecerasCors(origen), ...(extra || {}),
  },
});
```

**Por qué.** Es higiene, no urgencia, y así hay que venderla. Vale por lo barata y porque el día que el puente viva en `al3d.mx/puente/*` estas dos líneas son la diferencia entre razonar sobre el pipeline de caché de Cloudflare a las once de la noche y no tener que hacerlo. Van en `json()` y no en `cabecerasCors()` a propósito: el preflight se queda como está y su `Access-Control-Max-Age: 86400` sigue intacto.

**¿Rompe algo?** No. Ninguna prueba mira esas cabeceras y el cliente no las lee.

---

## Parche 3 — Borrar `/expandir`

*(tu prioridad 3 · el mejor valor/esfuerzo del lote: −10 líneas y cierra cuatro hallazgos)*

**Antes de escribir una sola validación, verifiqué que no lo llama nadie:**

```
$ grep -rn "expandir(" --include=*.js --include=*.html .
./js/datos/puente.js:408:    async expandir(u) {
```

Una sola definición y cero llamadas. `js/mod/mapa.js:914` resuelve el link corto por el otro camino (pedirle al usuario que abra y copie).

**Antes** — `puente/worker.js:430-439`

```js
      /* ── /expandir ── cuatro líneas que del lado del navegador son imposibles ── */
      if (ruta === '/expandir' && req.method === 'GET') {
        const u = url.searchParams.get('u') || '';
        if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(u)) {
          return json({ ok: false, mensaje: 'Eso no es un link corto de Google Maps.' }, 422, origen);
        }
        const r = await fetch(u, { redirect: 'follow' });
        if (!r.url || r.url === u) return json({ ok: false, mensaje: 'Ese link corto no llevó a ningún mapa.' }, 422, origen);
        return json({ ok: true, url: r.url }, 200, origen);
      }
```

**Después:** las diez líneas se borran. Nada las sustituye.

**Por qué, y por qué borrar en vez de blindar.** La regex del primer salto es correcta —la barra obligatoria justo después de `goo.gl` es lo que mata el truco del `@` en la autoridad, y no hay que aflojarla nunca— pero el `redirect: 'follow'` deja que un tercero elija los otros veinte saltos, sin timeout y sin tope. Blindarlo cuesta un bucle de `redirect:'manual'` con lista blanca de host final, y esa lista **va a romper el caso de uso**: Google mueve sus cortos entre `google.com/maps`, `maps.google.com`, `www.google.com/maps/place/...` y hosts regionales, y el día que salga por uno que no está en tu lista el pin deja de resolverse delante del cliente con un 422 que miente. Escribir validaciones para un endpoint muerto es trabajo que solo puede salir mal. Borrarlo cierra de un golpe: los saltos sin validar, el `fetch` sin timeout, el proxy que ignora el rol y el 422 que sirve de oráculo.

**¿Rompe algo?** **Sí, `pruebas/worker.mjs`** — y lleva su parche:

```js
/* pruebas/worker.mjs:381-389 — el bloque entero se borra */
console.log('\n/expandir: las cuatro líneas que en el navegador son imposibles');
{
  const r = await pedir('/expandir?u=' + encodeURIComponent('https://maps.app.goo.gl/abc123'));
  eq('el link corto se expande', r.cuerpo.ok, true);
  cierto('y trae coordenada', /20\.6,-103\.3/.test(r.cuerpo.url));

  const noEs = await pedir('/expandir?u=' + encodeURIComponent('https://ejemplo.mx/nada'));
  eq('lo que no es un link de Maps se rechaza, sin salir a la red', noEs.estado, 422);
}
```

y en la Notion de mentiras, `pruebas/worker.mjs:93-98`:

```js
  /* El link corto de Google Maps, para /expandir. */
  if (u.startsWith('https://maps.app.goo.gl/')) {
    const r = new Response('', { status: 200 });
    Object.defineProperty(r, 'url', { value: 'https://www.google.com/maps/place/20.6,-103.3' });
    return r;
  }
```

también se borra. `pruebas/cabeceras.mjs` no mira `puente/worker.js` (verificado: sus `ARCHIVOS` son `index.html`, `plataforma.html`, `sw.js`, `gcal.js`, `geo.js`, `puente.js`, `ui.js`, `mapa.js`, `material.js` y los dos CSS), así que no se entera.

**Y limpia los tres textos que van a mentir**, o el siguiente que lea el código vuelve a creer que el endpoint existe:
- `js/datos/sync.js:82-90` — el bloque de documentación de la ruta `GET /expandir`.
- `js/datos/geo.js:52` — «Con el puente de Fase 3 un endpoint /expandir lo hace del lado servidor».
- `js/datos/puente.js:407-416` — el método `expandir`. Quitarlo o dejarlo da igual para la seguridad (nadie lo invoca y del lado navegador no representa riesgo); si lo quitas, queda coherente.

---

## Parche 4 — Los importes con rango

*(hallazgo [alta] · 3 líneas)*

**Antes** — `puente/worker.js:248-251`

```js
    } else if ([P.subtotal, P.anticipo, P.liquidacion, P.abonoCom].includes(nombre)) {
      const n = Number(valor);
      if (!isFinite(n)) { rechazadas.push({ nombre, por: 'no es un número' }); continue; }
      props[nombre] = { number: n };
```

**Después**

```js
    } else if ([P.subtotal, P.anticipo, P.liquidacion, P.abonoCom].includes(nombre)) {
      const n = Number(valor);
      if (!isFinite(n)) { rechazadas.push({ nombre, por: 'no es un número' }); continue; }
      /* Un importe negativo no es un cobro: es una resta silenciosa en la base del dinero, y
         las cinco fórmulas la propagan a las siete vistas sin que se vea de dónde salió. El
         tope de arriba no le estorba a un negocio con $3.7M acumulados, y ataja las dos
         formas reales de meter basura: el dedo gordo —un cero de más son $60,000— y el
         1e21 que `Number` acepta feliz y Notion guarda. */
      if (n < 0) { rechazadas.push({ nombre, por: 'un importe no puede ser negativo' }); continue; }
      if (n > 10000000) { rechazadas.push({ nombre, por: 'ese importe está fuera de rango; si es correcto, captúralo en Notion a mano' }); continue; }
      props[nombre] = { number: n };
```

**¿Rompe algo?** No. Los importes que las pruebas mandan son `12000`, `6000` y `1` (`pruebas/worker.mjs:258, 334, 342`); el `999` de `:325` va contra nombres de fórmula y rebota antes, en la línea 236.

**La mitad de adelante, que es donde está la pérdida real y NO está en este archivo.** `js/datos/puente.js:162`:

```js
  out[P.anticipo] = num(p.anti_pactado);
```

`num()` convierte `null`, `undefined` y `''` en **0**, y `js/datos/proyectos.js:326` garantiza que `anti_pactado` siempre sea número, así que un guardia contra `null` sería un no-op. El problema es otro y es de dinero: cuando dirección mueve la etapa de un proyecto sin anticipo pactado, `aNotion` arma el mapa **completo** con `Anticipo: 0`, `filtrar()` lo deja pasar porque dirección sí puede escribir `Anticipo`, y el PATCH pone en cero lo que pagos hubiera capturado en Notion. El cambio mínimo es no mandar el cero nunca:

```js
  /* Cero no es «no debe nada»: es «aquí no sabemos». Mandarlo pisa en Notion lo que capturó
     quien cobra. Un PATCH es por propiedad: lo que no se manda, no se toca. */
  if (num(p.anti_pactado) > 0) out[P.anticipo] = num(p.anti_pactado);
```

El precio es que desde la plataforma ya no se puede bajar un anticipo a 0 — se hace en Notion, que es donde vive esa corrección. **Antes de aplicarlo hay que decidir qué significa `Anticipo` en la base: lo pactado o lo recibido.** No lo decidas desde aquí. `pruebas/puente.mjs:42,54` usa `anti_pactado: 6000` y seguiría pasando.

---

## Parche 5 — `rolDe`: comparación sin corte y `TOKENS` que dice qué tiene roto

*(tus prioridades 1 y 6 · ~25 líneas · los dos arreglos comparten sitio, por eso van juntos)*

**Antes** — `puente/worker.js:156-165`

```js
/** El token de dispositivo → rol. Devuelve null si no lo conoce. */
function rolDe(req, env) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t) return null;
  let mapa;
  try { mapa = JSON.parse(env.TOKENS || '{}'); } catch (_) { return null; }
  const rol = mapa[t];
  return (rol && ESCRIBIBLES[rol]) ? rol : null;
}
```

**Después**

```js
/** Lee TOKENS y dice qué tiene de malo, en español. Va aparte del token a propósito: hoy
 *  «tu token no está» y «el JSON de TOKENS está roto» son el mismo 401 mudo, y el segundo
 *  manda a tres personas a re-pegar tres tokens que estaban bien. */
function revisarTokens(env) {
  let mapa;
  try { mapa = JSON.parse(env.TOKENS || ''); } catch (_) {
    return { error: 'El JSON de TOKENS en Cloudflare está roto: revisa las comas y que las comillas sean rectas, no curvas. Ningún teléfono va a poder entrar hasta arreglarlo.' };
  }
  if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) {
    return { error: 'TOKENS tiene que ser un objeto {"<token>":"<rol>"}, y es otra cosa.' };
  }
  /* Y el otro error de pegar desde el teclado del celular, que hoy da el MISMO 401 mudo que
     la coma de más: un rol mal escrito. Se nombra el que está mal. */
  for (const rol of Object.values(mapa)) {
    if (!ESCRIBIBLES[rol]) {
      return { error: 'TOKENS tiene un rol que no existe: «' + rol + '». Los tres válidos son direccion, fabricacion y pagos, en minúsculas y sin acento.' };
    }
  }
  return { mapa };
}

/* Comparación que no se corta en la primera diferencia. Seamos honestos con lo que compra:
   contra un ataque de tiempo por internet, casi nada — el token es un UUID de 122 bits y el
   ruido de la red tapa mil veces lo que se mediría. Está por dos razones concretas: cuesta
   cinco líneas, y quita el `mapa[t]` de antes, que buscaba en la cadena de prototipos (un
   `Authorization: Bearer constructor` llegaba hasta Object.prototype). Hoy no se cuela nadie
   por ahí, pero es una trampa puesta para el siguiente que toque estas líneas. */
function igualExacto(a, b) {
  if (a.length !== b.length) return false;   // el largo de un UUID no es un secreto
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** El token de dispositivo → rol. Devuelve null si no lo conoce. */
function rolDe(req, mapa) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t) return null;
  let encontrado = null;
  /* Sin `return` dentro del bucle: se recorren los tres siempre, para que el tiempo de
     respuesta tampoco diga CUÁL de los tres acertó. */
  for (const [tok, rol] of Object.entries(mapa)) {
    if (igualExacto(t, tok) && ESCRIBIBLES[rol]) encontrado = rol;
  }
  return encontrado;
}
```

**Y el sitio donde se llama** — `puente/worker.js:310-315`

```js
    if (!env.NOTION_TOKEN || !env.TOKENS) {
      return json({ ok: false, codigo: 'DESCONOCIDO',
        mensaje: 'Al puente le faltan sus secretos. Revisa NOTION_TOKEN y TOKENS en Cloudflare.' }, 500, origen);
    }

    const rol = rolDe(req, env);
```

```js
    if (!env.NOTION_TOKEN || !env.TOKENS) {
      return json({ ok: false, codigo: 'DESCONOCIDO',
        mensaje: 'Al puente le faltan sus secretos. Revisa NOTION_TOKEN y TOKENS en Cloudflare.' }, 500, origen);
    }

    /* TOKENS roto no es un token malo: es una variable mal pegada. Un 500 que lo dice es la
       diferencia entre una tarde perdida y dos minutos. */
    const revision = revisarTokens(env);
    if (revision.error) {
      return json({ ok: false, codigo: 'DESCONOCIDO', mensaje: revision.error }, 500, origen);
    }

    const rol = rolDe(req, revision.mapa);
```

**Honestidad sobre la prioridad 1.** Le pusiste el número uno y no lo merece: `mapa[t]` es una búsqueda en tabla hash de V8, no un `===` byte a byte, y para llegar a comparar hace falta que coincida el hash del token entero. Medir esas diferencias por internet, a través del borde de Cloudflare, pide del orden de mil millones de peticiones contra una cuota de 100,000 al día. Lo incluyo porque son cinco líneas, no rompe nada y comparte sitio con el arreglo de `TOKENS`, que ese sí paga solo. **No hagas la versión con `crypto.subtle.digest` y `await`:** vuelve `rolDe` asíncrona, obliga a tocar la línea 315, y mete criptografía en un archivo que una persona pega en un editor web para blindar un ataque que no existe aquí.

**¿Rompe algo?** No.
- `pruebas/worker.mjs:198-200` pasa `env: { TOKENS: ENV.TOKENS }` sin `NOTION_TOKEN`: la primera guarda dispara antes y el mensaje sigue nombrando `NOTION_TOKEN`. ✓
- `:195-196` el token con espacio pegado sigue entrando: el `.trim()` sigue ahí, y después las longitudes cuadran. ✓
- `:192` `'el-que-yo-quiera'` (16 caracteres) contra `'tok-direccion'` (13): longitudes distintas, `null`, 401. ✓
- Cliente: la respuesta 500 con mensaje cae en `js/datos/puente.js:296` (`r.status >= 400 && !cuerpo` no aplica porque sí hay cuerpo), así que `salud()` lo pinta tal cual. Exactamente lo que quieres.

**Sobre revocación (tu prioridad 6): rechazo la caducidad, y el arreglo no es de código.** Un token que vence es una app que un día deja de sincronizar sola, sin nadie de guardia, en un taller donde la única persona que sabe repegar el JSON puede estar en una instalación. Cambiar una pérdida rara por una falla programada es mal negocio aquí. Y hay un error de hecho en el runbook que sí hay que corregir hoy: `puente/README.md:61` manda `TOKENS` como **Secret**, y un Secret de Cloudflare **no se puede volver a leer**. O sea que «quita ese token del JSON» es imposible: hoy, perder un teléfono cuesta **regenerar los tres** (`js/datos/puente.js:641`, y `README.md:70-74` avisa que se ven una sola vez), pegar el JSON nuevo y volver a repartirlo. Lo que borra el hallazgo cuesta dos frases:

1. En la pantalla de Ajustes que genera los tres (`js/mod/ajustes.js:602`), añadir: **«Guarda este JSON completo en tu gestor de contraseñas antes de salir de esta pantalla.»**
2. En `puente/README.md`, junto al runbook: con ese JSON guardado, revocar **uno** es editar una línea —cambiar su rol por cualquier cosa, o borrar la entrada— y redesplegar. El Worker ya lo maneja: con el parche de arriba, un rol desconocido devuelve 500 nombrándolo, y una entrada borrada devuelve el 401 de siempre.

---

## Parche 6 — El candado del alta, en el servidor

*(hallazgo [media] · 12 líneas)*

**Antes** — `puente/worker.js:394-397`

```js
          let r;
          if (!idPagina) {
            r = await notion(env, '/pages', { method: 'POST',
              body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: ds }, properties: props }) });
```

**Después**

```js
          let r;
          if (!idPagina) {
            /* Primero el caso que va a pasar de verdad, que no es el malicioso: el cliente
               mandó un CAMBIO de una fila que cree que existe, y aquí no se encontró por su
               folio. Crearla sería inventar una venta a partir de un cambio parcial — una
               fila con la etapa movida y sin precio. El cliente ya manda `tipo`
               (js/datos/puente.js:476) y hasta hoy el Worker lo tiraba a la basura. */
            if (op.tipo === 'actualizar') {
              resultados.push({ id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
                mensaje: 'No encontré esa venta en Notion por su folio. Revisa que la fila siga ahí.', rechazadas });
              continue;
            }
            /* Y el candado de verdad. Vivía SOLO en el cliente (js/datos/puente.js:460-464),
               o sea que no era un candado: era un aviso anticipado. Dar de alta una venta es
               escribir una fila nueva en la base del dinero, y eso sale del teléfono de
               Dirección. Aquí es donde se decide; allá, donde se avisa antes. */
            if (!ESCRIBIBLES[rol].includes(P.proyecto) || !props[P.proyecto]) {
              resultados.push({ id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO',
                mensaje: 'Este teléfono no puede dar de alta ventas: eso sale del de Dirección.', rechazadas });
              continue;
            }
            r = await notion(env, '/pages', { method: 'POST',
              body: JSON.stringify({ parent: { type: 'data_source_id', data_source_id: ds }, properties: props }) });
```

**¿Rompe algo?** No.
- `pruebas/worker.mjs:268` manda `tipo: 'crear'` con `TOK.dir` y `VENTA` trae `'Proyecto'` → crea. ✓
- `:291` el reintento encuentra la fila por folio → `idPagina` no es null → ni entra a esta rama. ✓
- `:397` (`{ ops: [{ datos: VENTA }] }`, sin `op.id`) rebota antes, en la línea 376. ✓
- Ninguna prueba manda `tipo:'actualizar'` sin `id_notion`.
- Cliente: `js/datos/puente.js:476` manda `tipo: idNotion ? 'actualizar' : 'crear'`, así que un alta legítima siempre llega como `'crear'`. El mensaje del cliente (`:461-464`) queda como lo que debe ser: un aviso, no la defensa.

---

## Parche 7 — `id_notion` con forma de id de Notion

*(hallazgo [alta] SSRF · 4 líneas en el Worker · **este sí rompe las pruebas y lleva su parche**)*

**Qué compra exactamente.** `op.id_notion` se concatena crudo en la ruta (`worker.js:388, 404, 412`), y `fetch` normaliza el `..` del camino. Con un token de **fabricación** —el rol que no puede tocar el dinero— y un `curl`, `op.id_notion = '../databases/<otra>'` manda el PATCH a otro objeto del workspace, y por la vía de `esperado` (`:403-404`) se hace un **GET a cualquier página que la integración pueda ver**, cuyo resultado vuelve al cliente aplanado dentro de `conflicto` (`:408`). Eso es lectura arbitraria del workspace de Notion desde el rol más restringido. La regex lo cierra y no le quita nada a nadie: los ids que el cliente manda salen de `proy.notion_page_id`, que solo se llena desde `res.remoto.id_notion` (`js/datos/puente.js:474-476`), o sea siempre de Notion, y `aplanar()` los toma de `pagina.id`, que es siempre UUID.

**Después** — declarar la constante junto a las demás, tras `puente/worker.js:53`:

```js
/* La forma de un id de página de Notion. Existe porque ese id se PEGA a la ruta de la API:
   sin esto, quien tenga cualquiera de los tres tokens elige a qué endpoint del workspace le
   pega el Worker con el token que puede escribirlo todo. */
const ID_NOTION = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;
```

y en `puente/worker.js:388`:

```js
          let idPagina = op.id_notion || null;
```

```js
          /* Si venía algo y no es un id, se DICE. Silenciarlo lo convertiría en un alta
             duplicada: `idPagina` quedaría en null y la fila se crearía otra vez. */
          if (op.id_notion && !ID_NOTION.test(String(op.id_notion))) {
            resultados.push({ id: op.id, ok: false, codigo: 'DATO_INVALIDO',
              mensaje: 'Ese id de página de Notion no tiene forma de id de Notion.' });
            continue;
          }
          let idPagina = op.id_notion || null;
```

**¿Rompe algo? SÍ: `pruebas/worker.mjs`.** La Notion de mentiras inventa ids `'pag-1'`, `'pag-2'`… (`:126`) y catorce sitios los usan. Sin este parche de prueba, **fallan 20 aserciones**. Los cambios son mecánicos:

```js
/* pruebas/worker.mjs:33-34 — añadir junto a PAGINAS/SIGUIENTE */
/* Con forma de UUID porque el Worker valida el formato del id antes de pegarlo a la ruta de
   la API: un id que no es UUID ya no se manda a Notion, y eso es justo lo que protege. */
const ID_BASE = '00000000-0000-4000-8000-';
const ID1 = ID_BASE + '000000000001';
```

```js
/* pruebas/worker.mjs:126 */
-    const pag = { id: 'pag-' + (SIGUIENTE++), url: 'https://notion.so/x',
+    const pag = { id: ID_BASE + String(SIGUIENTE++).padStart(12, '0'), url: 'https://notion.so/x',
```

y sustituir el literal `'pag-1'` por `ID1` en las **trece** apariciones restantes: líneas 284, 294, 299, 306, 309, 311, 315, 325, 335, 342, 347, 355, 357, 359. Es un `sed 's/'"'"'pag-1'"'"'/ID1/g'` — el generador de la línea 126 no casa porque ahí dice `'pag-' + (SIGUIENTE++)`.

`pruebas/puente.mjs` no se entera: sus extractores solo buscan `const ETAPAS`, `const TIPOS`, `const ESTATUS` y `const CUENTAS`, y `const ID_NOTION = /…/` no interfiere con ninguno.

**Lo que NO añadas hoy:** la comprobación de pertenencia (`GET /pages/<id>` y verificar que `parent.data_source_id === ds`). Con la regex puesta, la travesía está muerta, y lo que queda —un PATCH a otra página que además tenga propiedades con esos mismos nombres— es estrecho. A cambio cuesta **una subpetición por operación para siempre**, contra el tope de 50 del plan gratuito. Si algún día se activa el lote de verdad, cada operación pasa a costar 3 y el tope real baja a 16.

---

## Parche 8 — `LEGIBLES` por rol: `/jalar` deja de entregar el dinero a fabricación

*(hallazgo [media], repetido por dos auditorías · ~20 líneas · el único con consecuencia visible)*

**Después** — añadir tras `puente/worker.js:131`, debajo de `ESCRIBIBLES`:

```js
/* ── Y la lista blanca de LECTURA ───────────────────────────────────────────────
   `/jalar` devolvía la fila entera a cualquier rol. Con el token de fabricación —el que este
   archivo presume de que no puede tocar el dinero— un `curl` de una línea se baja el
   subtotal, el anticipo, la liquidación, las comisiones y la cuenta de cobro de TODAS las
   ventas. El permiso de escritura estaba y el de lectura no, y en la base del dinero el que
   importa es el de lectura.

   `null` significa «todo». Dirección ve todo porque es su base. Pagos ve todo porque cobra:
   quitarle el dinero sería quitarle el trabajo, y la dirección del cliente no es el secreto.
   Fabricación ve la obra: lo que puede escribir, más lo que necesita para fabricar.

   OJO con las tres llaves, que NO son opcionales: sin `Folio cotizacion`, `deNotion`
   (js/datos/puente.js:230-232) devuelve null y la fila entera se descarta — se apagaría el
   espejo en ese teléfono. Sin `id_notion` se pierde lo que evita la segunda fila en la base.
   Y `Direccion` está en la lista de ESCRIBIBLES de fabricación: no leerlo sería no poder ver
   lo que uno mismo escribe. */
const LEGIBLES = {
  direccion: null,
  fabricacion: new Set(['id_notion', 'url', 'editado',
    'Folio cotizacion', P.proyecto, 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
    'Ubicacion', 'Direccion', 'Tipo de trabajo', P.fecha]),
  pagos: null,
};
const filtrarLegibles = (datos, rol) => {
  const ok = LEGIBLES[rol];
  if (!ok) return datos;
  return Object.fromEntries(Object.entries(datos).filter(([k]) => ok.has(k)));
};
```

**Y los tres sitios que devuelven una fila aplanada**, todos por el mismo camino:

```js
/* worker.js:362 */
-        const registros = (r.cuerpo.results || []).map(p => ({ almacen: 'proyectos', datos: aplanar(p) }));
+        const registros = (r.cuerpo.results || [])
+          .map(p => ({ almacen: 'proyectos', datos: filtrarLegibles(aplanar(p), rol) }));

/* worker.js:408 */
-                  conflicto: aplanar(act.cuerpo) });
+                  conflicto: filtrarLegibles(aplanar(act.cuerpo), rol) });

/* worker.js:425 */
-          resultados.push({ id: op.id, ok: true, remoto: aplanar(r.cuerpo), rechazadas });
+          resultados.push({ id: op.id, ok: true, remoto: filtrarLegibles(aplanar(r.cuerpo), rol), rechazadas });
```

**¿Rompe algo?** No, ni las pruebas ni el cliente — pero **sí cambia lo que se ve en el teléfono de fabricación**, y hay que verlo antes de desplegar.

- `pruebas/worker.mjs:366-378` (`/jalar`) usa el token por omisión, `TOK.dir` → `LEGIBLES.direccion` es `null` → sin filtro → las diez aserciones del aplanado, las fórmulas incluidas, pasan igual. ✓
- `:284` y `:294` leen `remoto.id_notion` con `TOK.dir` → sin filtro. ✓ Y `id_notion` está en la lista de fabricación de todos modos.
- `:334-350`, las de fabricación y pagos, solo miran `ok`, `rechazadas` y el estado de `PAGINAS`. Ninguna toca `remoto`. ✓
- Cliente: `fusionar` ya protege el caso a propósito — `js/datos/sync.js:551-555`, `if (nuevo[k] !== undefined) salida[k] = nuevo[k];` con el comentario «undefined no es un valor… Sobrescribir con undefined borraría el dato del viejo con nada». **Omitir las claves de dinero no borra el espejo local.**

**El efecto real, dicho sin adornos.** En el teléfono de fabricación, `deNotion` va a devolver solo `{folio_global, notion_page_id, notion_estado}`: deja de bajar `estatus_notion`, `cuenta`, `pago_pendiente` y `comision_restante`. Cualquier pantalla que sume totales sobre el espejo va a mostrar vacío o cero en vez del importe difuminado de hoy — que es justo lo prometido, pero conviene mirarlo. Y **esto no cierra el agujero en las filas que ese teléfono ya bajó**: para eso hay que borrar los datos del sitio en ese aparato y volver a sincronizar, con respaldo previo.

---

## Parche 9 — Que una operación que revienta no se lleve el acuse de las demás, y que quede rastro

*(hallazgos [media] y [baja] · ~12 líneas · van juntos porque tocan el mismo bucle)*

**El try/catch por operación.** Envuelve el cuerpo del `for (const op of ops)` de `worker.js:375-426`. El `continue` y el `return json(...429...)` de dentro siguen funcionando igual:

```js
        for (const op of ops) {
          try {
            /* …todo el cuerpo actual del bucle, líneas 376 a 425, un nivel más adentro… */
          } catch (e) {
            /* Sin esto, una excepción en la operación número tres se lleva el `resultados`
               entero por el catch de la línea 442, y la bandeja pierde el acuse de las dos
               que SÍ se escribieron. Reintentarlas es idempotente —el mismo PATCH con las
               mismas propiedades— y `buscarPorFolio` cubre las altas, así que el costo real
               es un reintento sin convergencia, no una base corrupta. Aun así, barato. */
            console.error('empujar', op && op.id, e && e.message);
            resultados.push({ id: (op && op.id) || '?', ok: false, codigo: 'SIN_RED',
              mensaje: 'Ese cambio no se pudo mandar. Sigue guardado en el teléfono y se reintenta solo.' });
          }
        }
```

**El rastro**, justo después de `worker.js:413` (con `r` ya resuelto, antes del `if (r.estado >= 400)`):

```js
          /* Lo único que hay para saber qué teléfono escribió qué: en Notion toda escritura
             aparece firmada por la integración. Se ve en el panel (Workers → Logs) y se puede
             mandar a Logpush. Van los NOMBRES de las propiedades y NUNCA sus valores — con
             los valores acabas con los importes de los clientes en el panel de Cloudflare — y
             nunca, bajo ninguna circunstancia, el token. */
          console.log(JSON.stringify({ ts: Date.now(), rol, op: op.id,
            pagina: idPagina || 'nueva', props: Object.keys(props), estado: r.estado }));
```

**Lo que NO hagas:** añadir una propiedad «Último cambio por» a la base de Notion. Contradice de frente el principio 1 de la cabecera de este mismo archivo (`worker.js:26-29`) y sería la octava propiedad nueva en un esquema que el proyecto congeló a propósito. El `console.log` da el 90% del valor por cero riesgo.

**¿Rompe algo?** No. Único efecto colateral: `pruebas/worker.mjs` va a escupir una veintena de líneas JSON entre las de `ok`/`FALLA`. No falla, pero ensucia una salida que hoy se lee bien; tenlo en cuenta antes de sorprenderte.

---

## Parche 10 — El detalle de Notion al log, sin quitarlo de la pantalla

*(hallazgo [baja] · 1 línea · hazlo solo si ya estás tocando el archivo)*

**Antes** — `puente/worker.js:223-224`

```js
  const m = (cuerpo && (cuerpo.message || cuerpo.mensaje)) || '';
  return { codigo: 'DESCONOCIDO', mensaje: m ? 'Notion rechazó el cambio: ' + m : 'Notion rechazó el cambio y no dijo por qué.' };
```

**Después**

```js
  const m = (cuerpo && (cuerpo.message || cuerpo.mensaje)) || '';
  if (m) console.log('notion-rechazo', m);
  return { codigo: 'DESCONOCIDO', mensaje: m ? 'Notion rechazó el cambio: ' + m : 'Notion rechazó el cambio y no dijo por qué.' };
```

**Por qué así y no como pedían los hallazgos.** Los dos informes proponen dejar de devolver `m` al cliente. **No lo hagas todavía.** Ese mensaje crudo de Notion —«property does not exist», «is expected to be status»— es la única pista que tiene quien monta el esquema, y el runbook de `puente/README.md:150` («Notion rechaza el alta y nombra una propiedad») depende literalmente de leerlo. Quitarlo cambia un riesgo teórico —quien lo ve ya tiene un token válido, y con un token válido ya se lee la base entera— por una tarde a ciegas. El `console.log` pone el detalle donde también sirve, sin quitarlo de donde hoy hace falta. Si algún día `/esquema` cubre todos los casos del runbook, entonces sí se puede recortar el mensaje.

Lo mismo aplica al `catch` de `worker.js:442-446`: con `/expandir` borrado (parche 3), lo único que puede llegar ahí es una falla del propio Worker, y añadir `console.error(e)` antes del `return` es suficiente. No hace falta ocultar el texto.

---

## Lo que descarto para un taller de tres personas

| Propuesta | Veredicto |
|---|---|
| **Límite de tasa por token, sin KV ni Durable Objects (tu prioridad 5)** | **No se puede, y no hay truco.** Un Worker no tiene estado entre invocaciones. Lo único que persiste es una variable de módulo dentro de un *isolate*, y hay muchos isolates en muchos colos: no es un límite, es un fusible que a veces salta. Además rompería `pruebas/worker.mjs`, que dispara ~35 peticiones con el mismo token en un proceso. **Lo que sí funciona hoy y es gratis:** (a) la **alerta de uso al 80% de la cuota** en el panel de Cloudflare — vale más que cualquier regla, porque el escenario real no es un atacante sino un bucle del cliente o una resincronización repetida; (b) `Workers & Pages → puente-al3d → Metrics`, ya encendido y sin configurar, que muestra peticiones por minuto y tasa de error. **Cuando haya dominio propio:** una Rate Limiting Rule de zona (60/min por IP), que el plan gratuito incluye una. En `*.workers.dev` no hay WAF. El binding `ratelimit` del runtime quizá ya se declare desde `Settings → Bindings` en cuentas recientes; verifícalo en el panel antes de descartarlo por «obliga a wrangler». |
| **Caducidad en el token** | Rechazada. Ver el parche 5: el arreglo es guardar el JSON y corregir el runbook, no programar una falla futura. |
| **`Retry-After` en el 401 repetido** | No. Un 401 no se reintenta: se arregla pegando el token. |
| **Bajar el `slice(0, 25)` de la línea 373** | No hoy. `js/datos/puente.js` manda **una** operación por petición (`sync.js` sube de una en una a propósito). El día que exista el lote de verdad, el número correcto es **16** (16×3 = 48, bajo las 50 subpeticiones del plan) y un contador de subpeticiones es mejor que un número mágico, porque el costo por operación no es fijo: 1 con `id_notion`, 2 si hay que buscar por folio, 3 si algún día se activa la validación de pertenencia. |
| **Comprobar `parent.data_source_id === ds`** | No hoy. Ver el parche 7: la regex ya cierra lo que importa, y esto cuesta una subpetición por operación para siempre. |
| **Filtrar `LEGIBLES` para el rol `pagos`** | No. Pagos cobra: el dinero es su trabajo, y la dirección del cliente no es el secreto que este sistema guarda. |
| **`crypto.subtle` + comparación asíncrona de digests** | No. Ver el parche 5. |
| **Quitar el `ORIGENES` por omisión de la línea 137** | Sí, pero **después** de confirmar que los tres teléfonos sincronizan desde el dominio nuevo. No en la misma pasada que el parche 1. |

---

## Orden de aplicación

1. **Antes de tocar código:** `ORIGENES` en el panel con los **dos** dominios, separados por coma, sin barra final. Redesplegar (guardar la variable sin redesplegar es el error clásico de este paso).
2. **Una sola pasada de código**, en este orden dentro del archivo: parches **5**, **8** (arriba, junto a las constantes), **1**, **2**, **4**, **10**, **3** (borrado), **7**, **6**, **9**.
3. `node pruebas/worker.mjs` y `node pruebas/puente.mjs` — con los parches de prueba del **3** y del **7** ya puestos. Los dos tienen que salir en cero.
4. `pruebas/correr.sh` completo, y `pruebas/navegador/puente.mjs` (recorre el camino entero con clics; finge el Worker, así que no valida estos cambios, pero confirma que el cliente no se movió).
5. Pegar en el editor de Cloudflare. Desplegar. `Ajustes → El puente → Probar` en los tres teléfonos, uno por uno, verificando que cada uno reconoce **su** rol.
6. Después del despliegue, mirar `Workers → Logs` una vez: ahí debe aparecer el rastro del parche 9, con nombres de propiedad y sin un solo importe.

**Archivos que cambian:** `/home/user/cotizador-al3d/puente/worker.js` (los diez parches), `/home/user/cotizador-al3d/pruebas/worker.mjs` (obligatorio por los parches 3 y 7), `/home/user/cotizador-al3d/js/datos/puente.js` (opcional: la mitad de adelante del parche 4, y el método muerto `expandir`), `/home/user/cotizador-al3d/js/datos/sync.js` y `/home/user/cotizador-al3d/js/datos/geo.js` (comentarios que quedan mintiendo tras el parche 3), `/home/user/cotizador-al3d/puente/README.md` y `/home/user/cotizador-al3d/js/mod/ajustes.js` (la revocación del parche 5).