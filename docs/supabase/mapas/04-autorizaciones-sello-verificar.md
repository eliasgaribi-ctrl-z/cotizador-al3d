# Mapa 04 — Autorizaciones, sello y /verificar

Repo (solo lectura): `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, incluye PR #99; `PUENTE_VERSION = 'puente-sheets-14'`, GS:1881).
Abreviaturas de rutas:
- **GS** = `puente/hoja-apps-script.gs`
- **N** = `js/cotizador/notario.js`
- **H** = `js/cotizador/historial.js`
- **E** = `js/cotizador/entrega.js` (no estaba en mi lista, pero el QR se arma ahí)
- **NU** = `js/cotizador/nucleo.js`
- **V** = `verificar.html`
- **T-N** = `pruebas/notario.mjs`, **T-V** = `pruebas/verificar-desde-el-papel.mjs`, **T-P** = `pruebas/precio-servidor.mjs`

Marcas: «NO CONFIRMADO» = no se pudo comprobar solo con el código del repo. Todo lo demás está leído en el código (cita archivo:línea).

Los vectores de la sección 1.8 los generé cargando el `.gs` REAL en un contexto `vm` de Node 24 (solo lectura del repo, scripts en el scratchpad fuera del repo) y comparándolos con una reimplementación independiente con WebCrypto: 0 diferencias en 3000 registros aleatorios con acentos, comillas, `\`, `|`, emoji, U+2028, saltos de línea y números con ruido de flotante.

---

## 0. Lo esencial en 12 líneas

1. **Solo el servidor calcula el sello.** No hay `crypto`/HMAC en ningún `js/` ni en `verificar.html` (grep sin resultados). El teléfono recibe `{codigo, correo, ts, total, huella, subCalc, precioAuth, itemsAuth, nota, renglones}` y lo guarda; nunca firma.
2. **Algoritmo:** `HMAC-SHA256(clave = texto UTF-8 de SELLO_AUTORIZACION, mensaje = texto UTF-8 de canon)`, salida **hex minúscula de 64 chars** (`firma`). `canon = 'AL3D-AUTH-v1' | 'AL3D-AUTH-v2'` **pegado sin separador** a `JSON.stringify([...9 o 10 strings])` (GS:3635-3646, 3666).
3. **El código impreso** = primeros 12 hex de la firma en MAYÚSCULAS, en grupos `XXXX-XXXX-XXXX` (GS:3671).
4. **Se firma el TEXTO tal como queda guardado** (huella, itemsAuth, ts ISO, renglones): en Postgres esos campos tienen que ser `text` verbatim, no `timestamptz` ni `jsonb`.
5. **v1** (sin renglones) y **v2** (con renglones): el prefijo es parte de lo firmado. Una v2 con la celda «Renglones» vacía se comprueba como v1 y falla a propósito. Fechas por `git log -S` (commits locales, hora −0600): `AL3D-AUTH-v1` y el QR en el PDF entran el **2026-09-25** (042a37e, 18e0aec); `folioDePapel_` (aceptar folio corto) el 2026-09-29 (dd5cb95); **v2 y los renglones el 2026-10-01** (fc961ac); la **letra en el folio visible** (`COT-0042-B`) el 2026-10-01 (2cdfd81). Fecha real de publicación del Apps Script en la hoja: NO CONFIRMADA. Hay como mucho ~2 semanas de sellos en el mundo.
6. **QR** = `<origen del cotizador>/verificar.html?f=<folio global URL-encoded>&c=<CODIGO con guiones>`. Los PDFs ya impresos apuntan a `https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/verificar.html` o a `https://cotizador-al3d.pages.dev/verificar.html`: **esas dos URLs tienen que seguir sirviendo `verificar.html` para siempre.**
7. `verificar.html` hace `POST` (text/plain, JSON) a `URL_PUENTE` (Apps Script) con `{ruta:'verificar', f, c}`; su CSP solo deja conectar a `script.google.com` / `script.googleusercontent.com` (V:6).
8. `/verificar` es pública, devuelve solo `{ok, estado, folio, fecha, total, proyecto, renglones}` y tiene cupo: 30 consultas por folio corto y 400 en total por ventana fija de 600 s.
9. Hay **N filas por folio** en «Autorizaciones» (`vigente` / `superada` / `revocada`): no es una columna de la cotización.
10. **`FOLIO_MAS_ALTO` no tiene nada que ver con sellos ni con folios de cotización**: es el contador de los folios `V-###` de la pestaña Ventas (GS:1366-1421).
11. El folio de cotización (`COT-0042-B`) lo emite **cada teléfono** (contador local + letra); el folio con que se sella es `COT-0042-B@K7QM` (folio + aparato). No hay contador central.
12. **No existen vectores de oro con firma real en el repo.** Las pruebas calculan la firma con `node:crypto` simulando `Utilities`. Falta validar contra filas reales de la hoja + el secreto real (ver sección 9).

---

## 1. Especificación exacta del sello

### 1.1 Quién lo calcula

| Pregunta | Respuesta (evidencia) |
|---|---|
| ¿El cliente calcula el HMAC? | **No.** Sin `crypto.subtle`/`createHmac` en `js/` (grep). `aplicarSello()` (N:136-213) solo copia lo que devolvió la hoja. |
| ¿Qué calcula el cliente? | La **huella** del trabajo (`huellaTrabajo`, NU:1326) para compararla con la que devuelve el servidor (N:373, proceso.js:2131); los **renglones del papel** (`renglonesDelPapel`, E:619) para decidir si imprime el QR (`selloDeOtrosRenglones`, E:627). Ninguno entra a la firma: el servidor recalcula todo desde las partidas. |
| ¿Quién firma? | `rutaAutorizar_` (GS:3905-3976) → `firmar(r, secreto)` (GS:3666). Solo con **Google verificado** y rol `direccion` en «Accesos» (GS:3748-3754). El token de dispositivo no basta. |
| ¿Quién comprueba? | `rutaVerificar_` (GS:4023-4055), pública, recalcula la firma desde el renglón de la hoja. |
| ¿De dónde sale la clave? | Propiedad del script `SELLO_AUTORIZACION` (GS:3334, 3657-3665). Si no existe y se llama con `crear=true` (solo `/autorizar` y `configurarAutorizaciones`), **se inventa una nueva**: `Utilities.getUuid()+getUuid()+getUuid()` (3 UUID con guiones = 108 chars, hex minúscula y `-`). `/verificar` la lee con `crear=false`; sin clave contesta `no_autentica`. |

### 1.2 Algoritmo de firma (pseudocódigo bit a bit)

```
dinero2(n)   = (Math.round(Number(n || 0) * 100) / 100).toFixed(2)      // JS: Math.round = mitad hacia +inf; toFixed(2) = "12500.00"
                                                                       // GS:3617. NO equivale a round() de Postgres (mitad par / aritmética exacta)

canonDe(r):                                                            // GS:3635-3646
  campos = [
    String(r.folio),          // 1  folio GLOBAL con aparato, p.ej. "COT-0042-B@K7QM" (col B de «Autorizaciones», tal cual)
    String(r.huella),         // 2  p.ej. "c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~..."  (ver 1.4)
    dinero2(r.subCalc),       // 3  subtotal calculado por la hoja, "11310.00"
    dinero2(r.precioAuth),    // 4  precio autorizado NETO redondeado; "0.00" si no hubo ajuste global
    String(r.itemsAuth),      // 5  "" ó "id:1500.00,id2:300.00" (claves ordenadas como texto; ver 1.4)
    dinero2(r.total),         // 6  total final que se cobra, "13119.60"
    String(r.proyecto),       // 7  negocio/proyecto, ya trim y cortado a 140
    String(r.correo),         // 8  correo del autorizador, minúsculas (lo pone identidadDelIngreso: trim+toLowerCase, GS:2341)
    String(r.ts)              // 9  ISO UTC con milisegundos: new Date().toISOString() → "2026-10-01T04:30:15.123Z" (24 chars)
  ]
  si r.renglones es verdadero (string NO vacío):
      return 'AL3D-AUTH-v2' + JSON.stringify(campos.concat([ String(r.renglones) ]))   // 10 elementos; el 10º es el TEXTO de la col Q
  si no:
      return 'AL3D-AUTH-v1' + JSON.stringify(campos)                                   //  9 elementos
  // El prefijo va PEGADO al "[" del arreglo. Sin espacios ni separador. JSON compacto (sin espacios).

firmar(r, secreto):                                                    // GS:3666
  bytesMensaje = UTF8(canonDe(r))
  bytesClave   = UTF8(secreto)          // el secreto es TEXTO; no se decodifica de hex ni de base64
  mac          = HMAC_SHA256(bytesClave, bytesMensaje)       // 32 bytes (clave de 108 chars > 64 bytes: se le aplica SHA-256 primero, como en cualquier HMAC estándar)
  firma        = hex_minúscula(mac)                           // 64 chars; aHex(): cada byte (b+256)%256 → 2 dígitos hex minúscula (GS:3647)

codigoDe(firma):                                                       // GS:3671
  c = firma.slice(0,12).toUpperCase()
  return c.slice(0,4) + '-' + c.slice(4,8) + '-' + c.slice(8,12)       // "1031-54B3-55D4"

normalizarCodigo(c) = String(c||'').toUpperCase().replace(/[^0-9A-F]/g,'').slice(0,12)   // GS:3675
```

Detalles que muerden:
- **Por qué JSON y no `|`**: un negocio con `|` corría la frontera entre campos (comentario GS:3630-3634; T-N:601-605 lo prueba).
- **Orden de los 9 campos es fijo.** Cambiar uno invalida todos los PDF.
- `total`, `subCalc`, `precioAuth` se firman **en texto con 2 decimales** (`dinero2`), no en número.
- `renglones` se firma **como string dentro del arreglo** (el JSON lo escapa: comillas internas salen `\"`). Ejemplo crudo en 1.8 (vector E2E-A).
- **JSON.stringify de ECMAScript** (reglas exactas, comprobadas en Node 24): `"`→`\"`; `\`→`\\`; U+0008/0009/000A/000C/000D → `\b \t \n \f \r`; demás U+0000–U+001F → `\u00xx` con hex **minúscula**; U+007F, U+00A0, **U+2028, U+2029 salen crudos**; emoji (par sustituto válido) crudo; **sustituto suelto** → `\udXXX` minúscula; todo lo demás (`ñ ü « » €`) crudo en UTF-8. Si implementan a mano en SQL, hay que reproducir esto; en TS/Deno `JSON.stringify` es idéntico y es la recomendación.
- El **apóstrofo** (`txt()`, GS:3682) es solo del almacén de la hoja: `txt(s)` escribe `"'"+s` para que Sheets no convierta ni ejecute; **no entra al canon**. Al leer, `getValues()` ya lo devuelve sin apóstrofo.

### 1.3 Origen y normalización de cada campo firmado

| # | Campo canon | Columna «Autorizaciones» (letra / índice 0-based) | Origen al autorizar (`rutaAutorizar_`, GS:3905-3976) | Normalización |
|---|---|---|---|---|
| 1 | `folio` | B / `A_FOLIO=1` | `cuerpo.folio` del teléfono = `folioGlobal()` = `Q.folio + '@' + dispositivo()` (N:89); validado con `folioValido` = `^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$` (GS:3573-3577). Remota: folio del OTRO teléfono (`s.folio`, N:679). | verbatim; sensible a mayúsculas |
| 2 | `huella` | J / `A_HUELLA=9` | `cotHuella(c.iva, c.items)` recalculada en servidor (GS:3396-3402) | ver 1.4 |
| 3 | `subCalc` | E / `A_SUB=4` (número) | `cotSubtotal(items)` con el catálogo del servidor; guardado `+dinero2(subCalc)` | `dinero2` |
| 4 | `precioAuth` | F / `A_PRECIO=5` (número) | `Number(cuerpo.precioAuth||0)`, validado 0…1e9; guardado `+dinero2(precioAuth)` | `dinero2`; **`total` se calcula con el precioAuth SIN redondear** (GS:3923) |
| 5 | `itemsAuth` | I / `A_ITEMS=8` (texto) | `itemsAuthCanon(ia.valor)` (GS:3619) | claves `Object.keys(...).sort()` (orden UTF-16 de strings: `"1","10","2"`), `k + ':' + dinero2(v)`, unidas por `,`; vacío = `""` |
| 6 | `total` | G / `A_TOTAL=6` (número) | `cotTotalFinal(subCalc, iva, precioAuthSinRedondear)` (GS:3389) | `+fin.toFixed(2)`; firmado vía `dinero2` |
| 7 | `proyecto` | C / `A_PROY=2` | `limpiarCotizacion`: `String(c.proyecto).trim().slice(0,140)` (GS:3557) | verbatim; puede traer cualquier carácter |
| 8 | `correo` | K / `A_AUTORIZO=10` | `ingreso.correo` (email de Google verificado, `trim().toLowerCase()`) | minúsculas |
| 9 | `ts` | A / `A_TS=0` (**texto**) | `new Date().toISOString()` **tomado dentro del candado, justo antes de firmar** (GS:3957); la fecha la pone la hoja, no el teléfono | verbatim ISO con `.mmmZ` |
| 10 | `renglones` (solo v2) | Q / `A_RENGLONES=16` (texto) | `renglonesDe(items, iva, itemsAuth, precioFinal)` (GS:3505-3512): `JSON.stringify([[desc≤120, cantidad, importe],...])` | verbatim; ver sección 6 |

No firmados (informativos): D `Cliente`, H `Ajuste %`, L `Solicitó`, M `Código`, N `Firma`, O `Estado`, P `Nota`.
**Consecuencia:** cambiar `Estado` (vigente→superada/revocada) o la `Nota` NO rompe la firma; cambiar cualquiera de los 9/10 campos sí.

### 1.4 Cómo se calculan los insumos (portar VERBATIM; líneas GS)

Catálogo del servidor, copia de `js/cotizador/catalogo.js` + `lineTotal` de NU (GS:3338-3348). `T-P` compara ambos lados con miles de cotizaciones aleatorias; hay que portarlo y llevar la prueba al nuevo código.

```
COT_MATERIALES  = {'al-paint':30,'al-brush':35,'acr-vol':40,'acr-vinil':45,'acero':55}
COT_COMPLEJIDAD = {'recta':0,'cursiva':5,'compleja':10}
COT_RECORTES    = {'sencillo':20,'vinil':25,'sandwich':55};  COT_RECORTE_COMP_EXTRA = 5
COT_BASTIDORES  = {'lamina':950,'alucobond':1500};  COT_M2_MINIMO = 1;  COT_IVA = 0.16
COT_CAMPOS_PRECIO = ['tipo','material','comp','luz','altura','n','acab','recComp','bas','ancho','alto','tarifa','pz','pu']   // mismo orden que _CAMPOS_PRECIO (NU:1309)
precioDe(mapa,k) = mapa.hasOwnProperty(k) ? mapa[k] : 0

lineTotalCrudo(it):                                                    // GS:3356-3378 (orden de multiplicación importa en flotante)
  letras:   p = (precioDe(MAT,it.material)+precioDe(COMPL,it.comp)) * (it.altura||0) * (it.n||0);  si !it.luz → p *= 0.8
  recorte:  rate = precioDe(REC,it.acab); si it.acab==='sandwich' && it.recComp → rate += 5;  return rate*(it.altura||0)*(it.n||0)
  bastidor: m2 = (it.ancho||0)*(it.alto||0)/10000; si m2<=0 → 0; return (precioDe(BAS,it.bas)||0) * Math.max(m2||0, 1)
  caja:     m2 igual;                               si m2<=0 → 0; return (it.tarifa||0) * Math.max(m2||0, 1)
  cualquier otro tipo (manual): (it.pz||0)*(it.pu||0)
lineTotal(it) = Math.round(lineTotalCrudo(it)*100)/100
cotSubtotal(items) = suma secuencial en orden del arreglo de lineTotal(it)          // GS:3380 (NO redondeada: puede traer ruido 11310.000000000002)
cotNeto(sub,iva)   = iva ? sub + sub*0.16 : sub                                      // GS:3386, sin redondear
cotTotalFinal(subCalc, iva, precioAuthSinRedondear):                                 // GS:3389
  neto = cotNeto(subCalc, iva)
  fin  = (precioAuth > 0 && Math.abs(precioAuth - neto) > 0.01) ? precioAuth : neto
  return +fin.toFixed(2)
cotHuella(iva, items):                                                               // GS:3396-3402
  (iva ? 'c' : 's') + '|' + items.map(it => it.id + ':' + CAMPOS.map(k => it[k]===undefined ? '' : String(it[k])).join('~')).sort().join(',')
  // String(null)="null"; String(true)="true"; String(40)="40"; números = representación más corta de JS.
  // .sort() = orden por unidades UTF-16 SOBRE LA ENTRADA COMPLETA ("10:..." < "9:...").
itemsAuthCanon(ia) = Object.keys(ia).sort().map(k => k + ':' + dinero2(ia[k])).join(',')     // GS:3619
itemsAuthDeCanon(s): s.split(',').filter(Boolean) → por cada par, i = lastIndexOf(':') → {par.slice(0,i): Number(par.slice(i+1))}   // GS:3622
```

Entrada limpia (`limpiarCotizacion`, GS:3530-3571) — lo que SE ACEPTA del teléfono y se vuelve a guardar:
- `c` objeto con `items` array, 1…`MAX_PARTIDAS = 80`; cada partida: `id` number|string (≤40 chars, único), solo los campos de `COT_CAMPOS_PRECIO` que existan (`hasOwnProperty`), valores `null|number finito|string ≤60|boolean`, y `desc = String(...).slice(0,300)`.
- `proyecto` y `cliente`: `String().trim().slice(0,140)`; `iva = !!c.iva`; `subtotal = Number(c.subtotal)`.
- Límite `CELDA_MAX = 45000` sobre la huella y sobre `JSON.stringify(out)` (una celda de Sheets guarda 50 000): en Postgres no hace falta, pero hoy es regla de negocio con mensaje «La cotización es demasiado grande…».
- Orden de las llaves en la partida limpia: `id`, luego campos de precio en el orden de `COT_CAMPOS_PRECIO` presentes, luego `desc`.

Validaciones de `/autorizar` y su código de error (GS:3905-3919): `ROL_SIN_PERMISO` (no es dirección con Google) · `DATO_INVALIDO` (folio / cotización / `$0` / precioAuth fuera de 0…1e9 / ajuste que apunta a partida inexistente o fuera de 0…1e8) · `CATALOGO_DESINCRONIZADO` (|subtotalServidor − c.subtotal| > 0.01; trae `subtotal_hoja`).

`pct` («Ajuste %», informativo): `netoCalc>0 ? Math.round((netoCalc - total)/netoCalc*1000)/10 : 0`, con `netoCalc = cotNeto(subCalc, iva)` (GS:3931-3932).

### 1.5 Algoritmo de verificación (lo que debe reproducir el nuevo /verificar)

```
verificar({f, c}):                                                     // GS:4023-4055
  folio = String(f||'').trim();  cod = normalizarCodigo(c)
  si !folioDePapel_(folio) || cod.length !== 12  →  {ok:true, estado:'no_autentica'}          // forma inválida: NO cuenta para el cupo
  folioDePapel_(f) = typeof f==='string' && /^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$/.test(f)          // GS:3597 (el "@aparato" es opcional AQUÍ y solo aquí)
  si !cupoDeVerificar(folioCorto_(folio)) → {ok:false, codigo:'SIN_RED', mensaje:'Demasiadas consultas seguidas. Espera unos minutos.'}   // ver sección 3
  si no hay hoja de autorizaciones o no hay secreto → {ok:true, estado:'no_autentica'}      // ⚠ falla "cerrada" con mensaje de FALSO; en Supabase debe ser ok:false/500, no no_autentica
  hallada = ultimaFilaDeVerificar_(filas, folio, cod):                                       // GS:4064-4078
      conAparato = folio.includes('@');  corto = folioCorto_(folio).toUpperCase()           // folioCorto_ = split('@')[0]
      recorrer filas DE LA ÚLTIMA A LA PRIMERA:
          f = String(fila.Folio)
          si conAparato ? (f !== folio) : (folioCorto_(f).toUpperCase() !== corto) → siguiente
          si normalizarCodigo(fila.Código) !== cod → siguiente
          devolver la fila
      devolver null
  si !hallada → no_autentica
  firma = firmar(registroDeFila(hallada), secreto)        // registroDeFila (GS:3735): folio=String(B), huella=String(J), subCalc=Number(E), precioAuth=Number(F),
                                                          //   itemsAuth=String(I||''), total=Number(G), proyecto=String(C), correo=String(K), ts=String(A), renglones=String(Q||'')
  si firma !== String(hallada.Firma) || normalizarCodigo(codigoDe(firma)) !== cod → no_autentica   // recalcula SIEMPRE desde los campos; no basta con que la fila exista
  estado = fila.Estado === 'vigente' ? 'autentica' : (fila.Estado === 'revocada' ? 'revocada' : 'superada')      // cualquier otro texto → 'superada'
  fecha  = isNaN(new Date(String(fila.ts))) ? '' : Utilities.formatDate(new Date(String(fila.ts)), zonaHorariaDeLaHoja, 'dd/MM/yyyy')
  return {ok:true, estado, folio: folioCorto_(fila.Folio), fecha, total: Number(fila.Total), proyecto: String(fila.Proyecto), renglones: renglonesDeTexto(fila.Renglones)}
```
- `renglonesDeTexto(s)` (GS:3516): `null` si `s` vacío o no es JSON de arreglo; si no, `[{descripcion:String(r[0]), cantidad:Number(r[1])||0, importe:Number(r[2])||0}]`.
- La **firma almacenada** (col N) se compara con la recalculada con `!==` (no es tiempo constante; irrelevante aquí).
- La búsqueda es por **código + folio**, no por firma completa: 48 bits de código + folio válido.

### 1.6 El secreto

- Propiedad de script `SELLO_AUTORIZACION`. Forma esperada (si la creó el código): 3 UUID concatenados con guiones, 108 chars. **NO CONFIRMADO** que el valor real sea así (la propiedad pudo borrarse y regenerarse a mano; DESPLIEGUE.md:76-78 «si de verdad se filtrara, se borra la propiedad a mano»).
- Se usa **como cadena UTF-8** (no hex, no base64). Copiarla byte a byte: sin `trim`, sin salto de línea al final.
- `PUENTE_TOKENS`, `IA_KEYS` y `FOLIO_MAS_ALTO` viven en el mismo sitio; solo el sello afecta a PDFs ya entregados.
- Rotarla = todos los PDF «no auténtica». Para futura rotación el esquema nuevo debería llevar `clave_id` por fila (el algoritmo no lo trae: hoy NO hay versión de clave, solo versión de formato v1/v2).

### 1.7 Cosas del entorno Apps Script de las que depende la firma (y que Deno/Postgres no dan gratis)

| Dependencia | Hoy | En el nuevo sistema |
|---|---|---|
| `Utilities.computeHmacSha256Signature(String, String)` | bytes con signo −128..127; `aHex` los pasa a 0..255 | WebCrypto `HMAC/SHA-256` con `TextEncoder` (UTF-8); o `pgcrypto`: `encode(hmac(convert_to(canon,'UTF8'), convert_to(secreto,'UTF8'), 'sha256'),'hex')` |
| Codificación del mensaje | **NO CONFIRMADO en Apps Script real**: la doc dice UTF-8 para strings; las pruebas lo simulan con `createHmac(..).update(x,'utf8')` (T-N:90, T-V:58). Con clave ASCII y mensajes ASCII da igual; **los nombres con ñ/ü y «TACOS» sí dependen de esto.** | validar contra filas reales (sección 9) |
| `JSON.stringify` (V8 de Apps Script) | well-formed (sustituto suelto → `\udXXX`) si el runtime es V8; con el motor antiguo Rhino no. **NO CONFIRMADO** (`appsscript.json` no está en el repo) | Deno: igual a V8 |
| `Math.round`, `toFixed`, `String(number)`, `sort()` por UTF-16, suma flotante secuencial | JS | **Solo se reproducen bit a bit en JS/TS.** En plpgsql: `round(double)` redondea mitad-par, `numeric` es exacto, el texto de un `float8` difiere, y el orden de `ORDER BY` depende de la colación. |
| Fecha `ts` | texto ISO, escrito con apóstrofo para que Sheets no lo vuelva fecha | columna `text` (o par `ts_iso text` + `ts timestamptz` derivado). Nunca firmar desde un `timestamptz`. |

**Recomendación de arquitectura (derivada del código, no del plan):** `/autorizar` (calcula catálogo + huella + renglones + firma) y `/verificar` (recalcula firma) en **Edge Function TypeScript** con un único módulo compartido; Postgres solo guarda texto/numerics y aplica RLS/estado. Un RPC plpgsql que reimplemente `cotLineTotalCrudo`/`cotPreciosCliente` no será idéntico bit a bit.

### 1.8 Vectores de prueba (CLAVE FALSA)

Clave falsa (126 chars, texto UTF-8):
`FALSO-0000aaaa-1111-2222-3333-444455556666FALSO-0000bbbb-1111-2222-3333-444455556666FALSO-0000cccc-1111-2222-3333-444455556666`

Todos generados con `canonDe`/`firmar`/`codigoDe` del `.gs` real (y reconfirmados con WebCrypto). `CANON` es el texto crudo que entra al HMAC (una sola línea).

**V1 — formato v1 (sin renglones)**
```
folio="COT-0007-B@K7QM"  huella="c|1:letras~al-paint~recta~true~40~8~~~~~~~~"  subCalc=11310  precioAuth=0  itemsAuth=""  total=13119.6
proyecto="Tacos de Antes"  correo="elias@al3d.mx"  ts="2026-09-26T17:00:00.000Z"  renglones=""
CANON:  AL3D-AUTH-v1["COT-0007-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~","11310.00","0.00","","13119.60","Tacos de Antes","elias@al3d.mx","2026-09-26T17:00:00.000Z"]
firma:  6c3baa7b19643e32c7cd2e371cef52ebdd49168582739d255dea2e8eef44b10b
codigo: 6C3B-AA7B-1964
```

**E2E-A — `/autorizar` con precioAuth=12500, sin ajustes por partida** (partidas: `{id:1,tipo:'letras',material:'al-paint',comp:'recta',luz:true,altura:40,n:8,desc:'Letras «TACOS»'}` y `{id:2,tipo:'bastidor',bas:'lamina',ancho:300,alto:60,desc:'Bastidor'}`; `iva:true`, `proyecto:'Tacos El Güero'`, `subtotal:11310`)
```
folio="COT-0042-B@K7QM"  huella="c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~"
subCalc=11310  precioAuth=12500  itemsAuth=""  total=12500  proyecto="Tacos El Güero"  correo="elias@al3d.mx"  ts="2026-10-01T04:30:15.123Z"
renglones=[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]   (texto: [["Letras «TACOS»",8,9600],["Bastidor",1,1710]])
CANON:  AL3D-AUTH-v2["COT-0042-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","12500.00","","12500.00","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,9600],[\"Bastidor\",1,1710]]"]
firma:  103154b355d43c10258af78f53c9c94386c4ed7a414a221f975c120cedae7e0e
codigo: 1031-54B3-55D4
```

**E2E-B — precioAuth=14000 e `itemsAuth {2:1500}` (aumento repartido entre partidas)** (mismas partidas, `folio="COT-0041-B@K7QM"`)
```
itemsAuth="2:1500.00"  total=14000  renglones=[["Letras «TACOS»",8,10438],["Bastidor",1,1630.97]]
CANON:  AL3D-AUTH-v2["COT-0041-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","14000.00","2:1500.00","14000.00","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,10438],[\"Bastidor\",1,1630.97]]"]
firma:  280b5ab35179d3b337025c83806bc3ab2173b5ac67491c4032a86d50319c06a9
codigo: 280B-5AB3-5179
```
(suma de renglones 12068.97 = 14000/1.16.)

**E2E-C — precioAuth=0 (total = calculado con IVA)** (`folio="COT-0043-B@K7QM"`)
```
precioAuth=0  total=13119.6  renglones=[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]
CANON:  AL3D-AUTH-v2["COT-0043-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","0.00","","13119.60","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,9600],[\"Bastidor\",1,1710]]"]
firma:  cf1881799dd06afc0c88dde657a3ba342a6a2d26520489cc5a98435d6ee166f2
codigo: CF18-8179-9DD0
```

**V5 — v2 con comillas, `|` y Ñ en el negocio**
```
folio="COT-0001-A@ABCD"  huella="s|7:manual~~~~~~~~~~~~2~1234.56"  subCalc=2469.12  precioAuth=0  itemsAuth=""  total=2469.12
proyecto="Tacos \"El Güero\" | Ñandú"  correo="elias@al3d.mx"  ts="2026-10-09T23:59:59.999Z"  renglones=[["Pieza",2,2469.12]]
CANON:  AL3D-AUTH-v2["COT-0001-A@ABCD","s|7:manual~~~~~~~~~~~~2~1234.56","2469.12","0.00","","2469.12","Tacos \"El Güero\" | Ñandú","elias@al3d.mx","2026-10-09T23:59:59.999Z","[[\"Pieza\",2,2469.12]]"]
firma:  76f4c52c2bc6049dbb7f02d13993849867de269f34c5bb4520a6e2547cb8dc39
codigo: 76F4-C52C-2BC6
```

Otros vectores sueltos (todos del `.gs` real): `itemsAuthCanon({10:5, 2:1500, 1:8500.005})` = `1:8500.00,10:5.00,2:1500.00`; `normalizarCodigo("a1b2-c3d4 e5f6zz9")` = `A1B2C3D4E5F6`; `Math.round(1.005*100)/100` = `1` (JS); `cotTotalFinal(11310, true, 0)` = `13119.6`.

Referencia TypeScript (equivalente a lo validado; **no** es código del repo):
```ts
const d2 = (n: unknown) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
export function canon(r: {folio:string;huella:string;subCalc:number;precioAuth:number;itemsAuth:string;total:number;proyecto:string;correo:string;ts:string;renglones:string}) {
  const c = [String(r.folio), String(r.huella), d2(r.subCalc), d2(r.precioAuth), String(r.itemsAuth), d2(r.total), String(r.proyecto), String(r.correo), String(r.ts)];
  return r.renglones ? 'AL3D-AUTH-v2' + JSON.stringify([...c, String(r.renglones)]) : 'AL3D-AUTH-v1' + JSON.stringify(c);
}
export async function firma(canonTxt: string, secreto: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(canonTxt)));
  return Array.from(mac, b => b.toString(16).padStart(2, '0')).join('');
}
export const codigo = (f: string) => { const c = f.slice(0, 12).toUpperCase(); return `${c.slice(0,4)}-${c.slice(4,8)}-${c.slice(8,12)}`; };
```

### 1.9 Qué cubren y qué NO cubren las pruebas existentes

- **T-N** (`pruebas/notario.mjs`, 674 líneas): se carga el `.gs` completo en `vm` con dobles de Google; verifica quién sella, catálogo alterado, doble toque (mismo sello, `repetida:true`), `superada`, firma rota al editar total/negocio/renglones, v1 sin renglones sigue verificando (T-N:329-346), cupo de 30 por folio (T-N:274-277) y de 400 total (T-N:438-444), solicitudes por identidad, fórmulas/apóstrofo, y que `verificar.html` no use `innerHTML` ni la palabra `token` (T-N:657-671).
- **T-V** (`pruebas/verificar-desde-el-papel.mjs`, 236 líneas): folio corto vs largo, desempate de dos `COT-0042` por código, reautorizada/revocada.
- **T-P**: la copia del catálogo y de `preciosCliente` contra NU/E con ~3000 cotizaciones al azar.
- **Ninguna usa un vector con firma fija ni una fila real.** Las firmas se calculan con las funciones del propio `.gs`: si `canonDe` cambiara, las pruebas seguirían en verde y los PDF impresos fallarían. Hay que añadir los vectores de 1.8 como prueba de regresión del nuevo código.

---

## 2. El QR del PDF y `verificar.html`

### 2.1 Qué contiene el QR (E:644-661, 674-682)

1. Se imprime solo si `selloImprimible(neto)` (E:597): `Q.sello` con `codigo` y `folio`; `Q.estado==='autorizada'`; `authVigente()` (la huella guardada = la de hoy, NU:1392); `|sello.total − neto| ≤ 0.01`; `!selloDeOtroProyecto()` (E:640) y `!selloDeOtrosRenglones()` (E:627).
2. `ligaDeVerificacion(s)`: `u = new URL('verificar.html', location.href)` (relativa al `cotizador.html` donde se genera el PDF); `u.search = '?f=' + encodeURIComponent(s.folio) + '&c=' + encodeURIComponent(s.codigo)`; `u.hash = ''`.
   - Ejemplo: `https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/verificar.html?f=COT-0042-B%40K7QM&c=1031-54B3-55D4`.
   - `s.folio` = `folioGlobal()` en el momento de autorizar = `Q.folio@dispositivo()` (N:158). `s.codigo` = código con guiones (mayúsculas).
3. QR por `vendor/qrcodegen.js`, `Ecc.MEDIUM`, texto = la URL completa, dibujado como `<svg>` de cuadros (E:653-661).
4. Junto al QR el PDF imprime (E:681): la dirección sin protocolo ni query (`…/verificar.html`), el **folio completo `s.folio`** y el **código**. En PDFs anteriores al arreglo «falla 1» solo se imprimía el código y el folio corto de la cabecera (`Q.folio`, p.ej. `COT-0042-B`); por eso `/verificar` acepta el folio sin `@aparato`.
5. El origen de la URL es el de la página que generó el PDF: `https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/` o `https://cotizador-al3d.pages.dev/` (DESPLIEGUE.md:11; ingreso.js:98-100). **README.md:339-346 recomienda abandonar github.io**: si se hace, los QR ya impresos con ese origen quedan muertos salvo que ese origen siga sirviendo `verificar.html` (o redirija).

### 2.2 Qué hace `verificar.html` paso a paso (V:162-570)

1. Carga `js/tema.js`, `css/sistema.css`, `css/publico.css`, `css/vidrio.css`, `js/piezas.js` (sin cuenta, sin token, `noindex`; V:11). CSP en `<meta>`: `connect-src https://script.google.com https://script.googleusercontent.com` (V:6); `pruebas/csp.mjs:102-103` lo exige y prohíbe `'self'`.
2. `import { URL_PUENTE } from './js/datos/prefs.js'` (V:163; valor `https://script.google.com/macros/s/AKfycbwY6q…/exec`, prefs.js:83-84). **No** usa la URL guardada por dispositivo (`Prefs.puente()`), siempre la de fábrica.
3. Arranque (V:557-570): `q = URLSearchParams(location.search)`; `f = folioDelPapel(q.get('f'))` (quita espacios; pone en MAYÚSCULAS solo la parte antes de `@`, `toLocaleUpperCase('es-MX')`); `c = q.get('c').trim()`. Pinta `f` en el input y `c` en las 12 casillas (`P.casillasCodigo`).
   - Si hay `f` **y** `c`: `<details>` del formulario cerrado y `verificar(f, c)` automático.
   - Si falta alguno: formulario abierto y mensaje «Falta el código».
4. `verificar(f,c)` (V:390): bloquea doble envío; oculta datos; `esperando(...)` (animación del logo); llama `consultar`.
5. `consultar` (V:407-456): `fetch(URL_PUENTE, {method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ruta:'verificar', f, c})})` → `res.json()`.
   - Excepción de red/JSON → veredicto «Sin respuesta» y se reintenta una vez al evento `online`.
   - `r.ok !== true` → «Espera un momento» con `r.mensaje` (es lo que pasa con el cupo agotado). **No mira el código HTTP**, solo `ok` del JSON.
   - `r.estado` → tabla `ESTADOS` (V:173-178): `autentica` («Auténtica»), `superada` («Ya no vigente»), `revocada` («Revocada»), `no_autentica` («No auténtica»); cualquier valor desconocido cae en `no_autentica`.
   - `no_autentica`: sello gris, abre el formulario («probar con otro folio»), no pinta datos.
   - Otros estados: escribe con `textContent` (nunca `innerHTML`; lo prueba T-N:661) `r.folio`, `r.fecha`, `r.proyecto` («Negocio»), `r.total` (formateado `es-MX` MXN) y `pintarRenglones(r.renglones)`; arma el cotejo «Coincide / No coincide» por renglón; muestra el sello circular `P.sello` con `location.host` y la hora local de la consulta.
   - `renglones` nulo o vacío → nota «Este sello es de antes de que AL3D guardara los renglones: garantiza el folio, la fecha, el negocio y el total, no cada renglón.»
6. Cotejo manual: un solo «No coincide» pasa la tarjeta a «Documento alterado» con un `mailto:eliasgaribi@gmail.com` prellenado. Nada se guarda ni se envía.
7. Formulario a mano: `enviar()` (V:534): exige folio con forma `^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$` y 12 hex (`normalizar`: la O se lee 0, I/L se leen 1 en las casillas, `P.codigo.HEX`); hace `history.replaceState('?f=…&c=…')` y consulta.
8. **Para cambiar el backend**: (a) la constante de URL (V:163), (b) `connect-src` del `<meta>` (V:6) + `pruebas/csp.mjs:92-103`, (c) `pruebas/notario.mjs:662` (exige `ruta: 'verificar'` en el script y prohíbe la palabra `token`), (d) `pruebas/navegador/publicas.mjs` (intercepta `https://script.google.com/**` en :81 y :631 para simular las respuestas de `/verificar`), (e) **subir `APP_VERSION` en `sw.js:43`**: el service worker precachea `verificar.html` (`sw.js:74`) y lo sirve caché-primero (`PAGINAS`, `sw.js:216`), así que un teléfono con la versión vieja seguirá llamando a Apps Script hasta que actualice. Por eso el `/verificar` de Apps Script no debería apagarse a la vez.

---

## 3. `/verificar` — contrato exacto

**Entrada:** `POST` al Web App, cuerpo JSON (`Content-Type: text/plain`) `{ruta:'verificar', f:'<folio>', c:'<código>'}`. Va **antes** de las dos puertas de identidad (GS:2216-2220): sin token, sin Google, y **no pasa por `dentroDelLimite`** (el cupo de 60/min por identidad). `doGet` contesta `{ok:false,codigo:'DATO_INVALIDO'}` (GS:2167). Cuerpo máximo 64 KB para todo lo que no sea `/ia` (GS:2189-2214; T-N:615-628).

**Salida (siempre HTTP 200, JSON):**

| Caso | Respuesta |
|---|---|
| Folio mal formado, o código ≠ 12 hex, o no hay hoja/secreto, o no se halla fila, o la firma recalculada ≠ guardada | `{ok:true, estado:'no_autentica'}` — **solo esas dos llaves** (T-N:248) |
| Cupo agotado | `{ok:false, codigo:'SIN_RED', mensaje:'Demasiadas consultas seguidas. Espera unos minutos.'}` |
| Fila hallada y firma correcta | `{ok:true, estado:'autentica'\|'superada'\|'revocada', folio, fecha, total, proyecto, renglones}` (T-N:242: llaves exactas `estado, fecha, folio, ok, proyecto, renglones, total`) |
| Excepción interna | `{ok:false, codigo:'DESCONOCIDO', mensaje:'El puente falló procesando eso.'}` |

Campos: `folio` = **folio corto** de la fila (`COT-0042-B`, sin `@aparato`; viene del renglón, no de lo tecleado); `fecha` = `dd/MM/yyyy` de `A_TS` en la **zona horaria de la hoja** (GS:4043; **NO CONFIRMADO** cuál es: las pruebas simulan `America/Mexico_City`; `''` si el ISO no se entiende); `total` = número; `proyecto` = texto libre tal cual lo firmó la hoja; `renglones` = `[{descripcion,cantidad,importe}]` o `null` (sello v1).

**Lo que NO devuelve a un anónimo:** cliente, teléfono, dirección, correo del autorizador, nota, huella, subCalc, precioAuth, itemsAuth, firma, código, `ts` (solo el día), solicitante, ni el estado interno de otros folios. (Matiz: `proyecto` es texto libre; el formulario sugiere «Farmacia San Juan – Letrero fachada», cotizador.html:331, pero un vendedor puede escribir ahí un nombre de persona.)

**Límite de peticiones (GS:4021-4031, 4079-4088, 2412-2417):**
- Constantes `VERIFICAR_POR_FOLIO = 30` y `VERIFICAR_EN_TOTAL = 400`, ventana **fija** de 600 s (`contarEnVentana`: clave `base@floor(Date.now()/600000)`, `put` con TTL 600).
- Dos contadores por consulta: por folio y total. Claves de `CacheService`: `'v_' + base64urlSafe(SHA-256(folioCorto)).slice(0,24)` y `'v__total'`. Se permite mientras `n1 <= 30 && n2 <= 400` (la 31ª del folio y la 401ª total se rechazan; T-N:274-277, 438-440).
- Se cuenta por `folioCorto_(folio)` **sin pasar a mayúsculas** (`cot-0042` y `COT-0042` son cubetas distintas, mientras que la búsqueda sí ignora la caja): el tope por folio es burlable con variantes de caja; el tope total de 400 sigue valiendo. Se cuenta antes de buscar y también cuando la consulta es válida y exitosa; no se cuenta cuando la forma es inválida.
- Si `CacheService` falla, **se deja pasar** (`catch → true`). No hay límite por IP (Apps Script no la ve).
- Supabase no tiene `CacheService`: hace falta una tabla/ventana (p. ej. contador por `(clave, ventana)`) y, si se quiere, límite por IP de la Edge Function (cabeceras `x-forwarded-for`).

---

## 4. Ciclo de vida solicitud → autorización → revocación

### 4.1 Hojas y columnas EXACTAS

Las crea `hojaConCabecera` (GS:3700-3710) con cabecera en negrita, fondo `AZUL`, fila 1 congelada. Se leen **por posición**.

**«Autorizaciones»** — **oculta** (`hideSheet`), sin protección. `COLS_AUT` (GS:3685-3687), índices `A_*` (GS:3692-3694). Todo texto va con `txt()` (apóstrofo) salvo lo indicado.

| Col | Idx | Encabezado EXACTO | Constante | Tipo en la celda | Qué se escribe |
|---|---|---|---|---|---|
| A | 0 | `Cuándo (ISO)` | `A_TS` | texto | `r.ts` ISO UTC ms |
| B | 1 | `Folio` | `A_FOLIO` | texto | folio global `COT-0042-B@K7QM` |
| C | 2 | `Proyecto` | `A_PROY` | texto | proyecto limpio (≤140) |
| D | 3 | `Cliente` | `A_CLI` | texto | cliente limpio (≤140). **No se firma; privado** |
| E | 4 | `Subtotal calculado` | `A_SUB` | número | `+dinero2(subCalc)` |
| F | 5 | `Precio autorizado (neto)` | `A_PRECIO` | número | `+dinero2(precioAuth)` (0 si no hubo ajuste global) |
| G | 6 | `Total` | `A_TOTAL` | número | `cotTotalFinal(...)` |
| H | 7 | `Ajuste %` | `A_PCT` | número | `pct` (1 decimal). No firmado |
| I | 8 | `Ajustes por partida` | `A_ITEMS` | texto | `itemsAuthCanon` (`id:1500.00,...`; vacío = `''`) |
| J | 9 | `Huella` | `A_HUELLA` | texto | `cotHuella(...)` |
| K | 10 | `Autorizó` | `A_AUTORIZO` | texto | correo del autorizador (minúsculas) |
| L | 11 | `Solicitó` | `A_SOLICITO` | texto | `S_SOLICITO` de la solicitud pendiente que resuelve, o el correo del autorizador si no había |
| M | 12 | `Código` | `A_CODIGO` | texto | `XXXX-XXXX-XXXX` |
| N | 13 | `Firma` | `A_FIRMA` | texto | 64 hex minúscula |
| O | 14 | `Estado` | `A_ESTADO` | texto **sin** apóstrofo | `vigente` \| `superada` \| `revocada` |
| P | 15 | `Nota` | `A_NOTA` | texto | `nota` (≤500) de dirección. No firmado |
| Q | 16 | `Renglones` | `A_RENGLONES` | texto | JSON de renglones. Va al final a propósito; `hojaAutorizaciones()` le pone cabecera si falta (GS:3711-3722) |

**«Solicitudes de autorización»** — visible. `COLS_SOL` (GS:3695-3696), `S_*` (GS:3697-3698).

| Col | Idx | Encabezado EXACTO | Constante | Tipo | Qué se escribe |
|---|---|---|---|---|---|
| A | 0 | `Cuándo` | `S_TS` | **Date** (`new Date()`) | cuándo se pidió (al re-pedir se sobrescribe) |
| B | 1 | `Folio` | `S_FOLIO` | texto | folio global |
| C | 2 | `Proyecto` | `S_PROY` | texto | proyecto limpio |
| D | 3 | `Cliente` | `S_CLI` | texto | cliente limpio |
| E | 4 | `Subtotal` | `S_SUB` | número | `cotSubtotal` del servidor |
| F | 5 | `IVA` | `S_IVA` | texto plano | `'Sí'` \| `'No'` |
| G | 6 | `Huella` | `S_HUELLA` | texto | `cotHuella` |
| H | 7 | `Cotización` | `S_COT` | texto | `JSON.stringify(c)` (cotización limpia: `{proyecto,cliente,iva,subtotal,items:[{id,<campos precio>,desc≤300}]}`) |
| I | 8 | `Solicitó` | `S_SOLICITO` | texto | `quienSoy`: correo de Google, o `'token de pagos'` / `'token de fabricacion'` / `'token de direccion'` |
| J | 9 | `Estado` | `S_ESTADO` | texto plano | `pendiente` \| `autorizada` \| `rechazada` \| `cancelada` |
| K | 10 | `Resolvió` | `S_RESOLVIO` | texto | quién resolvió (`''` mientras pendiente) |
| L | 11 | `Cuándo se resolvió` | `S_TSRES` | **Date** | `new Date()` al resolver |
| M | 12 | `Nota` | `S_NOTA` | texto | nota de quien pidió; al autorizar/rechazar se sobrescribe con la de dirección (en `autorizar`: `nota \|\| notaAnterior`) |

La pestaña «Solicitudes» **no está firmada**: es una cola operativa, no evidencia. Nada la verifica (cualquiera con acceso a la hoja puede editarla); lo único firmado es «Autorizaciones».

**«Accesos»**: ver sección 5.

### 4.2 Estados y transiciones — quién, qué se escribe

Todas las rutas que escriben llevan el candado de script `conCandadoNotario` (`waitLock(20000)`, si no lo logra → `{ok:false, codigo:'SIN_RED', mensaje:'La hoja está ocupada con otra escritura. Vuelve a intentarlo.'}`, GS:3759-3764).

Identidad: `quienSoy(rol, ingreso)` = `ingreso.correo` si entró con Google, si no `'token de ' + rol` (GS:3747). Dos aparatos con el mismo token de rol son **la misma identidad**.

| Transición | Ruta | Quién puede | Qué escribe | Precondiciones / salida |
|---|---|---|---|---|
| ∅ → solicitud `pendiente` | `/solicitar` (GS:3769) | cualquier rol reconocido (Google en «Accesos» o token), incluido dirección | fila nueva en «Solicitudes»: `[new Date(), folio, proyecto, cliente, sub, 'Sí'/'No', huella, JSON(c), yo, 'pendiente', '', '', nota≤500]` | `folioValido` (con `@aparato`); cotización limpia; `\|sub−c.subtotal\|≤0.01` (si no `CATALOGO_DESINCRONIZADO` + `subtotal_hoja`). Salida `{ok:true, estado:'pendiente'}` |
| `pendiente` → `pendiente` (re-pedir) | `/solicitar` | quien la pidió (mismo `Solicitó`) o dirección | **sobrescribe la MISMA fila** (la última pendiente de ese folio) | si la pendiente es de otra identidad y quien llama no es dirección → `ROL_SIN_PERMISO` «Ese folio ya tiene una solicitud pendiente de otra persona…» |
| `pendiente` → `cancelada` | `/cancelar` (GS:3808) | quien la pidió, o dirección | `Estado='cancelada'`, `Resolvió=txt(quien)`, `Cuándo se resolvió=new Date()` (no toca `Nota`) | sin pendiente → `{ok:true, estado:null}`; ajena sin ser dirección → `ROL_SIN_PERMISO`; salida `{ok:true, estado:'cancelada'}` |
| `pendiente` → `autorizada` (+ crea sello) | `/autorizar` | **solo dirección con Google** (GS:3748) | ver 1.4: fila nueva `vigente` en «Autorizaciones»; la última pendiente del folio (de cualquiera) pasa a `autorizada`, `Resolvió=txt(correo)`, `Cuándo se resolvió=new Date()`, `Nota=txt(nota \|\| notaDeLaSolicitud)` | salida `{ok:true, sello:{…}}` |
| ∅ → autorización `vigente` (sin solicitud previa) | `/autorizar` | dirección con Google | igual, sin tocar «Solicitudes»; `Solicitó = correo` | |
| `vigente` → `superada` | `/autorizar` otra vez, mismo folio, otra decisión | dirección con Google | la vigente pasa a `'superada'` (`setValue`) y se anexa una `vigente` nueva | «otra decisión» = cualquier diferencia en huella, subCalc, precioAuth, itemsAuth, proyecto o renglones |
| `vigente` → (misma) | `/autorizar` otra vez, **idéntico** | dirección con Google | **nada se escribe**; devuelve `{ok:true, sello:<el vigente>, repetida:true}` | ⚠ **no resuelve la solicitud pendiente** (se sale antes de GS:3960-3967): la solicitud queda `pendiente` y `/estado` del solicitante seguirá diciendo `pendiente` (GS:3870-3872). Comportamiento hoy; decidir si se porta o se corrige |
| `pendiente` → `rechazada` | `/rechazar` (GS:3979) | solo dirección con Google | `Estado='rechazada'`, `Resolvió=txt(correo)`, `Cuándo se resolvió=new Date()`, `Nota=txt(nota)` | sin pendiente → `{ok:false, codigo:'NO_ENCONTRADO', mensaje:'Esa solicitud ya no está pendiente.'}`; salida `{ok:true, estado:'rechazada'}`. **No toca** una autorización vigente del mismo folio |
| `vigente` → `revocada` | `/revocar` (GS:3997) o `revocarAutorizacion('COT-…@…')` desde el editor (GS:4007) | dirección con Google | `A_ESTADO='revocada'` en la última fila `vigente` del folio | sin vigente → `NO_ENCONTRADO`; salida `{ok:true}`. **Ningún `js/` llama `/revocar`** (grep): no hay interfaz. `revocada` es terminal: reautorizar el folio crea una fila `vigente` nueva |

- Una autorización **no se borra nunca**: `superada`/`revocada` se quedan; `/verificar` de un PDF viejo contesta `superada`/`revocada` con SU total (T-V:206-219).
- Invariante (por el candado): como mucho una fila `vigente` por folio global.
- `/pendientes` y `/estado`: lecturas, sección 4.3.

### 4.3 Lecturas

**`/pendientes`** (GS:3826): solo `rol==='direccion'` (token o Google) → si no `ROL_SIN_PERMISO 'La cola de autorizaciones es de Dirección.'`. Recorre «Solicitudes» **de la última fila a la primera**, hasta 50 con `Estado==='pendiente'` y `Cotización` que sea JSON válido. Cada una: `{folio, cuando: Date.getTime() | null, solicito, nota, cotizacion:<objeto c>}`. Al re-pedir se reescribe la MISMA fila, así que el orden es por posición original, no por última petición. Salida `{ok:true, solicitudes:[…]}`.

**`/estado`** (GS:3877-3902): `cuerpo.folios` (array; solo los primeros 20; los que no pasan `folioValido` simplemente no salen en el mapa). `todos = rol==='direccion'`.
- `sol` = última fila de «Solicitudes» con ese folio (si no es dirección: solo las de `yo`).
- No dirección y sin `sol` → `out[f] = {estado:null, sello:null, resolvio:'', nota:''}`.
- `aut` = última fila **vigente** del folio, y solo vale si `selloDeLaSolicitud` (GS:3866-3876): si no es dirección, `aut.Solicitó === yo`; si `sol` es `pendiente` → no vale; si no, `ms(aut.ts) >= ms(sol.Cuándo)` (`msDe` convierte Date o ISO; NaN = no vale).
- `out[f] = {estado: aut ? 'autorizada' : (sol ? sol.Estado : null), sello: aut ? selloDeFila(aut) : null, resolvio: sol ? sol.Resolvió : '', nota: sol ? sol.Nota : ''}`.
- `selloDeFila` (GS:3741): `{codigo, correo, ts, huella, subCalc, precioAuth, itemsAuth:{id:número}, total, nota, renglones: [{descripcion,cantidad,importe}] | null}`.
- Por qué existe esa regla: fabricación leía precios de folios ajenos; y pedir re-autorizar devolvía el sello viejo (comentario GS:3848-3864; T-N:458-521).

### 4.4 Folios

| Folio | Quién lo genera | Formato | Detalle |
|---|---|---|---|
| Folio visible de cotización | **Cada teléfono** (H:2570-2597) | `COT-` + número a 4 dígitos + `-` + letra: `COT-0042-B` (`folioFmt`, H:2574) | `nextFolio()`: `n = al3d_folio + 1` (localStorage, contador de **confirmadas**), saltando los números ya ocupados en cola/historial; `confirmarFolio()` lo sube al autorizar (H:2594). El provisional no consume número. La letra = `al3d_pf_letra_folio`, o la 1ª letra de `dispositivo()`, o `A` (E:324-330; prefs.js:150). |
| Aparato | `dispositivo()` (E:303-316; prefs.js:132-145) | 4 chars de `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` por `crypto.getRandomValues` (o `D`+4 dígitos si falla) | guardado en `al3d_pf_disp`; **no** va al respaldo |
| **Folio global (el que se sella y se imprime en el QR)** | `folioGlobal(folio)` (N:89) | `COT-0042-B@K7QM` | `^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$`. El corto **se repite entre teléfonos**; el global no. |
| `reFoliarSiEsOtroCliente` | H:95-106 | — | si un folio ya está ocupado por OTRO cliente en el historial se le da uno nuevo **antes de sellar** (proceso.js:2088) |
| Folio de venta `V-###` | la hoja (`reservarFolios`) | `V-` + número con mínimo 3 dígitos (`V-001`, `V-1000`; GS:1368-1371) | **No es el folio de cotización.** Ver 4.5. |

La hoja **no genera nunca** un folio de cotización: solo valida su forma (`folioValido`) y lo guarda tal cual. El corto tampoco es único en «Autorizaciones» (un folio con 3 renglones: superada, superada, vigente).

### 4.5 `FOLIO_MAS_ALTO` (propiedad de script `PROP_FOLIO`, GS:1366)

- Es el contador de **ids de fila de la pestaña Ventas** (`V-001`, columna A, `id_notion` en el puente). **No participa en el sello, ni en «Autorizaciones», ni en los folios `COT-`.**
- No es secreto. Solo sube. Se toca siempre con el candado (`/empujar`, `alEditar`, formularios, `mejorarTodo`).
- `marcaDeFolios(h)` (GS:1386-1398): `alto = Number(prop) || 0`; si es 0 se siembra con `max(folioMasAltoEn('Ventas (respaldo)', col 1), folioMasAltoEn(BITACORA, col 3), folioMasAltoEn(ABONOS, col 1))`; luego `alto = max(alto, numeroDeFolio(cada A2:A{FIN}))`. `numeroDeFolio` = `/^V-(\d{1,7})$/i` → número, o −1 (GS:949).
- `reservarFolios(h,k)` (GS:1401): para `i<k`: `alto++`, empuja `folioDeNumero(alto)`; guarda `FOLIO_MAS_ALTO = alto`. `siguienteFolio(h)` = `reservarFolios(h,1)[0]` (GS:1410).
- `recordarFolio(h, folio)` (GS:1414-1421): si un teléfono pregunta por un `V-n` que la hoja ya no tiene, sube la marca a `n` salvo que `n > alto + 1000` (dato malo).
- Para migrar: debe ser una **secuencia de Postgres** (o fila contador bajo transacción) sembrada con `max(valor de la propiedad, todo V-n existente en Ventas/respaldo/bitácora/abonos)`. El plan (§3.1) lo mete en «Secretos/Vault» junto al sello: no corresponde.

### 4.6 Quién llama qué desde el cliente

| Ruta | Llamada | Cuerpo |
|---|---|---|
| `solicitar` | N:223 (`enviarSolicitud`) | `{folio: folioGlobal(folio), cotizacion: cotParaHoja(), nota:''}` |
| `cancelar` | N:280 (`retirarSolicitud`) | `{folio: folioGlobal(folio)}` (fire-and-forget) |
| `pendientes` | N:468 | `{}` (solo si `puedeAutorizar()`) |
| `estado` | N:322 | `{folios:[folioGlobal(f), …≤20]}`; cada 15 s con la pantalla visible mientras haya solicitudes pendientes |
| `autorizar` (local) | proceso.js:2101 | `{folio: folioGlobal(), cotizacion: cotParaHoja(), precioAuth, itemsAuth:Q.itemsAuth, nota}` |
| `autorizar` (remota) | N:679 | `{folio: s.folio /*global del OTRO teléfono*/, cotizacion:{...c, subtotal}, precioAuth, itemsAuth, nota}` |
| `rechazar` | N:718; proceso.js:2161 | `{folio, nota}` |
| `revocar` | **nadie** | — |
| `verificar` | V:410 | `{ruta:'verificar', f, c}` |

`cotParaHoja()` (N:93-102): `{proyecto, cliente, iva, subtotal: totals().sub, items:[{id, desc: descParaHoja(it), …campos de _CAMPOS_PRECIO que no sean undefined}]}`.
Códigos de error que el cliente ya sabe leer: `ROL_SIN_PERMISO`, `DATO_INVALIDO`, `CATALOGO_DESINCRONIZADO` (no se reintenta; `definitivo`), `SIN_RED` (se reintenta), `NO_ENCONTRADO`, `DESCONOCIDO`. El puente contesta HTTP 200 aunque `ok:false`; el cliente (`pedir`, puente.js:1036-1049) traduce `ROL_SIN_PERMISO` a 401.
`aplicarSello(sello)` (N:136): guarda `Q.sello = {codigo, correo, ts, total, folio: folioGlobal(), proyecto, renglones?}` y lo copia al historial (`H:132`), de donde lo lee `selloImprimible` al reimprimir.

### 4.7 Edición a mano / manipulación

- Cambiar a mano un campo firmado en «Autorizaciones» → la firma recalculada ya no coincide → `no_autentica` (T-N:258-267, 299-306). Cambiar `Estado` sí cambia el veredicto (`vigente`→`revocada`) sin romper la firma: **el estado no está firmado**.
- Vaciar `Renglones` de un sello v2 → se comprueba como v1 → `no_autentica`.
- «Solicitudes» no tiene ninguna protección contra edición manual.
- En Supabase RLS sustituye a esa defensa, pero la recomprobación de firma en `/verificar` se debe conservar (defensa contra importaciones incorrectas o escrituras con `service_role`).

---

## 5. Hoja «Accesos»

**Qué es hoy un acceso:** un renglón `(Correo, Rol, Nota)` en la pestaña «Accesos» (`HOJA_ACCESOS`, GS:1909). No hay id de usuario, fecha de alta, empresa ni estado. Quitar el renglón es la baja.

| Col | Encabezado | Uso en el código |
|---|---|---|
| A | `Correo` | comparado `String(x).trim().toLowerCase() === correo` |
| B | `Rol` | `trim().toLowerCase()`; solo vale si es llave de `PUENTE_ROLES` = `direccion` \| `fabricacion` \| `pagos` (GS:2120); validación de datos en B2:B201 (lista cerrada) |
| C | `Nota` | **ningún código la lee** |

- Creación (`crearHojaAccesos`, GS:2379-2398): cabecera `Correo / Rol / Nota`, fila 2 = dueño de la hoja (`Session.getEffectiveUser().getEmail()`) con `direccion` y nota «El dueño de la hoja. Se puso solo.», y en **`A4` un texto instructivo** («Escribe aquí el correo de Google de cada persona…»): la importación debe **filtrar filas que no sean correo válido + rol válido**.
- `rolDelCorreo` (GS:2363-2375): lee `A2:B{lastRow}`; **primera coincidencia** gana; rol desconocido → `null` (sin acceso).
- Contenido real (cuántas personas, mayúsculas, duplicados): **NO CONFIRMADO** (solo vive en la hoja).

**Identidad de una petición** (GS:2228-2244, 2305-2360):
1. Llega `google_token` (access token de Google) y/o `token` (de dispositivo) en el cuerpo (no en la URL).
2. `identidadDelIngreso(tok)`: exige longitud ≥ 20 y `PUENTE_CLIENT_IDS` no vacío; consulta `https://oauth2.googleapis.com/tokeninfo?access_token=…`; exige `aud` ∈ `PUENTE_CLIENT_IDS` (hoy un único id, GS:1898-1901) y `email_verified === 'true'`; `correo = email.trim().toLowerCase()`; `rol = rolDelCorreo(correo)`. Caché de 300 s si hay rol, **60 s si no**, indexada por hash del token. Cortacircuitos: 5 fallos Google en 15 s, tope 120 consultas/min global. Si no se puede verificar, **no entra** (falla cerrada).
3. Si no hay identidad de Google, `rolDelToken(token)`: `PUENTE_TOKENS` (propiedad JSON `{token: rol}`, 3 tokens, longitud ≥ 30) → rol. **El token no identifica a nadie**; solo dice qué aparato/rol es.
4. Sin ninguna → `ROL_SIN_PERMISO`. Con identidad se aplica `dentroDelLimite('g:'+correo | token)` = 60 peticiones/min (GS:2164, 2241).

**Relación con el notario:** `/autorizar`, `/rechazar`, `/revocar` exigen `ingreso` (Google) **y** rol `direccion`: «el token del teléfono no dice quién eres». `/solicitar`, `/cancelar`, `/estado` aceptan token (identidad `'token de <rol>'`); `/pendientes` solo rol `direccion` (token o Google).

**Del lado del cliente** (`puerta.js`): la persona entra con Google; `salud()` devuelve `{via:'google', correo, rol}` y se guarda un **pase** de 30 días sin señal (`DIAS_PASE=30`, puerta.js:128); `ROL_SIN_PERMISO` con token Google vivo = «fuera» (borra el pase). Baja efectiva ≤ 5 min con señal (caché 300 s), hasta 30 días sin señal. El plan §4.8 propone `acceso_revocado` y borrado local; hoy no existe.

**Decisión de Elías en memoria:** «no más pestañas en la hoja» → el espejo no debe crear pestañas nuevas.

---

## 6. Renglones de la cotización autorizada

### 6.1 Cómo se guardan

- **Servidor** (v2): col Q de «Autorizaciones», texto = `JSON.stringify(items.map(it => [String(it.desc||'').slice(0,120), Number(cotPiezas(it)) (o 0 si no finito), +Number(pc[it.id]).toFixed(2)]))` (GS:3505-3512). `[ [descripción, cantidad, importe], … ]` **en el orden de las partidas** (= orden del PDF) y **todas** las partidas, también las ocultas del PDF (`showInPdf:false`), porque «ocultar» no está en la huella.
- **Cliente**: `Q.sello.renglones = [{descripcion, cantidad, importe}]` (N:163-164), copiado a la entrada del historial (H:132) y de ahí al PDF.
- **Respuesta**: `renglonesDeTexto` (GS:3516) a `[{descripcion, cantidad, importe}]` o `null`.

### 6.2 Qué es cada número

- `cantidad` = `cotPiezas(it)` (GS:3422): letras/recorte → `it.n||0`; bastidor/caja → `1`; manual → `it.pz||1`.
- `importe` = lo que ve el cliente en el PDF: `cotPreciosCliente(items, iva, ia, final)` (GS:3441-3497): precio por partida = ajuste por partida (`itemsAuth`) o `lineTotal`; **si dirección SUBIÓ el total** (`ajuste < -0.01 && subBase > 0.005`, `hayAumentoAuth`) el aumento se **reparte** proporcionalmente por partidas en centavos por pieza (`floor`, resto por mayor fracción, luego búsqueda de intercambio, luego se carga el resto a la partida de mayor base); un **descuento** no se reparte (el PDF lo imprime aparte). `final = cotPrecioFinal(subCalc, iva, r.precioAuth)` **sin redondear a toFixed** (GS:3435). Es copia de `preciosCliente()` de NU; **portarla verbatim** y llevar `T-P`.
- Descripción: la que viaja desde el teléfono (`descParaHoja` → `shortDescAuth(it)`), cortada a 120 en la hoja y también en E:618 (`RENGLON_DESC_MAX=120`).

### 6.3 Cómo se comparan

1. **Servidor, al autorizar:** fingerprint de «misma decisión» (`/autorizar` repetido): `huella, subCalc, precioAuth, itemsAuth, proyecto` **y** `renglones` idénticos → devuelve el sello viejo; si cambia solo una descripción, firma uno nuevo y el anterior queda `superada` (T-N:308-313).
2. **Cliente, antes de imprimir el QR** (`selloDeOtrosRenglones`, E:627-633): compara **como conjunto** (ordena) las llaves `JSON.stringify([String(descripcion), Number(cantidad)||0, Math.round((Number(importe)||0)*100)])` de los renglones firmados contra `renglonesDelPapel()` (calculado con `preciosCliente()`); si difiere → el PDF sale **sin QR** y `generarPDF` lo dice. Un sello sin `renglones` (v1) no tiene con qué compararse y se imprime.
3. **Cliente, proyecto:** `selloDeOtroProyecto` (E:640): `s.proyecto !== (Q.proy||'').trim()` → sin QR.
4. **Persona con el papel:** `verificar.html` enseña un renglón por partida («Renglón N · descripción» / «cantidad pzas. · importe») con «Coincide / No coincide»; nota: «Los importes son antes de I.V.A. y de cualquier descuento. Si tu PDF junta partidas en «Conceptos adicionales», ese importe es la suma de las de aquí que allá no aparecen.»
5. **Criptográfico:** el texto de la col Q **entra a la firma v2** (campo 10 del arreglo, como string). Alterarlo = `no_autentica`.

---

## 7. Mapeo propuesto a Postgres (PROPUESTA derivada del código; no es hecho)

Lo mínimo para que un PDF impreso siga verificando y no se pierda historial. Tipos pensados para firmar **verbatim**.

`autorizaciones` (una fila por fila de la hoja «Autorizaciones»; N por folio):
| Columna propuesta | Tipo | Viene de | Nota |
|---|---|---|---|
| `id` | uuid/bigint | — | |
| `empresa_id` | | — | |
| `folio_global` | text | B `Folio` | `COT-0042-B@K7QM`; **no unique solo** |
| `ts_iso` | **text** | A `Cuándo (ISO)` | se firma este texto |
| `proyecto` | text | C | firmado |
| `cliente` | text | D | privado; no firmado |
| `sub_calc` / `precio_auth` / `total` | numeric(14,2) | E / F / G | `dinero2` firmado; leer como `Number` |
| `ajuste_pct` | numeric | H | informativo |
| `items_auth` | **text** | I | canon, firmado verbatim (`''` permitido) |
| `huella` | **text** | J | firmado |
| `autorizo` | text | K | correo, firmado |
| `solicito` | text | L | puede ser `'token de pagos'` (histórico) |
| `codigo` | text | M | `XXXX-XXXX-XXXX` |
| `firma` | text | N | hex 64 |
| `estado` | text check (`vigente`,`superada`,`revocada`) | O | no firmado |
| `nota` | text | P | |
| `renglones` | **text** | Q | firmado verbatim (`''`/null = v1) |
| `clave_id` / `formato` (propuesto) | text | — | v1/v2 se deduce de `renglones`; `clave_id` permitiría rotar sin romper PDFs |
Índices: `unique (folio_global) where estado='vigente'`; búsqueda `(upper(split_part(folio_global,'@',1)), codigo)`.

`solicitudes` (una por fila de la hoja): `ts` timestamptz (Date), `folio_global`, `proyecto`, `cliente`, `subtotal`, `iva` bool, `huella`, `cotizacion` jsonb (o text), `solicito_texto`, `estado` check (`pendiente`,`autorizada`,`rechazada`,`cancelada`), `resolvio`, `ts_resolvio`, `nota`.

`miembros`: `correo` (lower), `area` check (`direccion`,`fabricacion`,`pagos`), `nota`.

Importar «Autorizaciones»: leer con **Apps Script `getValues()`** (devuelve números crudos, textos sin apóstrofo y Date reales) y no con la API de Sheets en modo formateado (`FORMATTED_VALUE` rompería `dinero2`; los Date de «Solicitudes» llegan como serial en la zona de la hoja si no se usa Apps Script). Validar cada fila: recalcular firma con el secreto y compararla con col N; reportar las que no cuadren (no aborta).

Tabla de contadores de cupo para `/verificar` (ventana fija 600 s): `(clave text, ventana bigint, n int)`.

---

## 8. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **§3.1 «Propiedades del script (`PUENTE_TOKENS`, `SELLO_AUTORIZACION`, `IA_KEYS`, `FOLIO_MAS_ALTO`) → Vault»**: `FOLIO_MAS_ALTO` no es secreto ni tiene que ver con el sello: es el contador `V-###` de Ventas (GS:1366-1421). Debe ir a una secuencia/contador en Postgres.
2. **§3.2 «`/solicitar … /autorizar … /revocar` → funciones SQL (RPC)»**: `/solicitar`, `/cancelar`, `/pendientes`, `/estado`, `/rechazar`, `/revocar` sí pueden ser RPC. **`/autorizar` no es portable bit a bit a plpgsql**: depende de `Math.round` (mitad hacia +∞), `toFixed`, `String(number)`, `sort()` UTF-16, suma flotante secuencial y `JSON.stringify` (sección 1.7). Debe ejecutarse en TypeScript (Edge Function) con el mismo módulo de `/verificar`.
3. **§3.1/§4.7 «`cotizaciones(id, empresa_id, folio, datos, estado, sello, renglones, revocada)`»**: hay **N sellos por folio** (`vigente`/`superada`/`revocada`) y cada uno es evidencia firmada; no caben en una columna de `cotizaciones`. Hace falta una tabla de autorizaciones/sellos con historial. Además el campo `folio` debe ser el **folio global con aparato** (`COT-0042-B@K7QM`); el corto no es único.
4. **§3.1 «El QR de los PDF ya impresos debe seguir verificando: se conserva el sello y la clave»**: es necesario pero **insuficiente**. Los PDFs apuntan a una página estática en dos orígenes (`github.io/cotizador-al3d`, `cotizador-al3d.pages.dev`) y esa página llama a un endpoint fijo (`URL_PUENTE`) bajo una CSP que solo permite Google. Además hay que conservar: texto verbatim de `ts`/`huella`/`itemsAuth`/`renglones`, la clave como texto UTF-8, v1+v2, y el estado `no_autentica` solo cuando de verdad no autentique (no por falta de clave).
5. **§3.1 «Hoja «Accesos» → `miembros`»**: «Accesos» no tiene ids ni usuarios: es `(correo, rol, nota)` con un texto instructivo en `A4`; el correo es la única identidad, comparado en minúsculas. Los tokens de dispositivo (`PUENTE_TOKENS`) no están ligados a filas de «Accesos» (son por rol) y no pueden autorizar. El valor `solicito` histórico `'token de <rol>'` no es un correo.
6. **§4.12 «Rotación del sello: nueva clave + revocar con `revocar`»**: `revocar` solo cambia `Estado` de la fila vigente; con una clave nueva, **todas** las filas viejas fallan al recalcular la firma aunque no se revoquen. Una rotación real exige `clave_id` por fila y verificar con la clave de cada fila.
7. **§3.2 «`/verificar` … Edge Function pública, con su propio límite de peticiones»**: ok, pero el límite actual es por `CacheService` (ventana fija, 30/folio + 400 global); en Supabase hay que construirlo (tabla de ventanas) y decidir si se añade límite por IP.
8. **§8 «Archivos a modificar»** no menciona `verificar.html` (URL + CSP), `sw.js` (`APP_VERSION`), `pruebas/csp.mjs`, `pruebas/notario.mjs:662`, ni `pruebas/navegador/publicas.mjs`.
9. **§1/§3.3 «`_headers` de Cloudflare sigue como está»**: la CSP relevante de `verificar.html` está en su `<meta>`, no en `_headers` (`_headers` solo agrega `frame-ancestors 'self'`).

---

## 9. Riesgos, comportamiento a decidir y lo NO CONFIRMADO

**Riesgos críticos**
- **R1. Falsos «No auténtica».** Hoy, si falta la propiedad `SELLO_AUTORIZACION` o la hoja, `/verificar` contesta `no_autentica` (GS:4034): le dice a un cliente que su PDF legítimo es falso. En el nuevo sistema, clave ausente ⇒ error explícito (`ok:false`), nunca `no_autentica`. Y `secretoDelSello_(true)` **inventa una clave nueva si no hay** (GS:3659-3662): jamás portar esa conducta (haría que todo lo nuevo se firme con otra clave).
- **R2. Texto verbatim.** Si `ts`, `huella`, `itemsAuth` o `renglones` se guardan en `timestamptz`/`jsonb`/`numeric` reformateado, la firma cambia.
- **R3. Orígenes del QR.** Mantener `verificar.html` para siempre en github.io y pages.dev (o redirigir). README.md:339-346 propone retirar github.io.
- **R4. Caché del service worker** (`sw.js:74,216`): subir `APP_VERSION` y mantener vivo el `/verificar` de Apps Script mientras haya teléfonos con la página vieja; las revocaciones hechas en Supabase no llegarían a la hoja si el espejo no las copia (decidir).
- **R5. Sin vector de oro real** (ver abajo).

**Comportamiento actual a decidir (portar o corregir)**
- `/autorizar` idéntico (`repetida:true`) deja viva la solicitud pendiente (GS:3939-3952, 3870-3872).
- Cupo de `/verificar` por folio sin normalizar mayúsculas (burlable con variantes de caja).
- `/estado` ignora silenciosamente folios inválidos y recorta a 20.
- `/pendientes` ordena por posición de fila (re-pedir no la sube).
- `/revocar` no tiene UI.

**NO CONFIRMADO (necesita la hoja/entorno real; se puede resolver con la sesión de Chrome de Elías)**
1. Que `Utilities.computeHmacSha256Signature(String, String)` codifica en UTF-8 el mensaje en el runtime real (las pruebas lo asumen). **Prueba de oro propuesta:** exportar 3-5 filas reales de «Autorizaciones» (incluida una con acentos o `«»` y una v1) + `SELLO_AUTORIZACION`, recalcular la firma con el nuevo módulo y exigir igualdad con la col N. El secreto no debe pasar por el chat ni por el repo (plan §4.12).
2. Valor/forma real de `SELLO_AUTORIZACION` y que no tenga espacios/saltos finales.
3. Zona horaria de la hoja (`getSpreadsheetTimeZone`) para `fecha` en `/verificar`; runtime V8 vs Rhino (`appsscript.json` no está en el repo).
4. Cuántas filas hay en «Autorizaciones» (v1 vs v2), si alguna se editó a mano, y si la pestaña tiene las 17 columnas (si tuviera 16, `filasDe(…,17)` truena y `/verificar` daría `DESCONOCIDO`).
5. Contenido real de «Accesos» (duplicados, mayúsculas, la fila de ayuda en A4).
6. Cuáles orígenes (github.io vs pages.dev) aparecen impresos en PDFs ya entregados. Desde cuándo hay QR: commit del 2026-09-25 (18e0aec); los PDFs anteriores no traen QR.
7. Qué proporción de PDFs trae el folio completo impreso (después del arreglo «falla 1», 2026-09-29) frente a solo el corto. **Añadido por la letra del folio (2026-10-01):** hay tres vintages de folio en circulación, `COT-0042@K7QM` (antes del 1 oct), y `COT-0042-B@K7QM` (desde el 1 oct); el regex `[A-Za-z0-9-]{1,24}` acepta ambos, pero el nuevo `folio_global` no puede asumir que lleva letra.

**Archivos que el sistema nuevo va a tener que tocar por este tema (lista corta)**
`verificar.html` (URL + CSP), `js/datos/prefs.js:83` (`URL_PUENTE`, compartida con la plataforma), `js/cotizador/notario.js` (`hablarHoja` → nueva API; contrato de respuesta `{ok,codigo,mensaje,…}` a conservar), `js/cotizador/proceso.js:2101,2161`, `sw.js` (`APP_VERSION`), `pruebas/{notario,verificar-desde-el-papel,csp,precio-servidor,revision-remota}.mjs`, `pruebas/navegador/publicas.mjs`, y el nuevo módulo TS del sello con los vectores de 1.8.
