# Mapa 07 — Cotizaciones, historial y cola (cotizador)

Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, incluye PR #99).
Rutas abajo relativas a ese repo. Todo es lo que el CÓDIGO hace hoy; donde el plan dice otra cosa está en la sección 10.
Convención: `archivo:línea`. «NO CONFIRMADO» = no se pudo verificar con el código (dato de producción, navegador, etc.).

Archivos leídos: `js/cotizador/historial.js` (todo lo que toca datos: 16-170, 386-1160, 1396-1470, 1560-2060, 2225-2622; el visor de imagen 174-385, la UI de cuadernos 1157-1395 y deshacer/rehacer 2061-2225 se revisaron por índice de funciones y por grep de `localStorage`: no escriben datos de negocio), `js/datos/cotizador.js` (completo), `js/mod/cotizador.js` (completo), `js/cotizador/notario.js` (completo), `js/cotizador/venta.js` (completo), `js/cotizador/entrega.js` (31-690: logo, WhatsApp, Canva, dispositivo, hitos, sello impreso; el cuerpo de `generarPDF` 685-1970 solo por grep de escrituras), `pruebas/cot-historial.mjs` (completo). Además, para cerrar vínculos: `js/cotizador/nucleo.js` (Q, cálculo, huella), `js/cotizador/proceso.js` (flujo de estados), `js/cotizador/imagenes.js`, `js/cotizador/arranque.js`, `js/cotizador/partidas.js` (addItem, opciones), `js/datos/proyectos.js` (ganar/armarProyecto), `js/datos/prefs.js`, `js/app.js:1535`, `puente/hoja-apps-script.gs` (COL, COLS_AUT, COLS_SOL, rutas del notario).

---------------------------------------------------------------------------------------------------

## 0. Resumen ejecutivo (lo que un implementador necesita saber en 10 líneas)

1. El cotizador es 12 scripts CLÁSICOS (no módulos) en un `<iframe>` de la plataforma, mismo origen, mismo `localStorage` (`js/mod/cotizador.js:126-131`). Guarda en `localStorage` de forma SÍNCRONA (`getHistorial()` aparece 22 veces en `js/cotizador/`, `getQueue()` 14, `nextFolio()` 7; cada cifra incluye la definición).
2. Solo hay UN almacén de cotizaciones terminadas: `localStorage['al3d_historial']` = array JSON de entradas planas, más reciente primero, **solo autorizadas**. No trae campo `estado`.
3. «Borrador» y «rechazada» existen SOLO en `localStorage['al3d_q']` (un único renglón por aparato, la cotización en pantalla). «Pendiente» vive en `al3d_queue` (con copia completa en `.q`) y en la hoja «Solicitudes de autorización».
4. «Revocada» y «superada» NO existen en el cliente: solo en la pestaña oculta «Autorizaciones» de la hoja (columna `Estado`).
5. La llave real de una cotización es `folio` + `disp` (aparato). `folio` solo se repite entre teléfonos (cada uno cuenta desde COT-0001). El folio que ve la hoja es `COT-0042-B@K7QM` (`folio@disp`).
6. La entrada se REEMPLAZA completa en cada guardado (`historial.js:163`): no hay versiones ni bitácora. `ts` se conserva mientras no cambie autorizador+fechaAuth.
7. Las imágenes viven en DOS sitios: `aiFile.url` (data URL DENTRO de la entrada) e IndexedDB `al3d_cot_imgs` (planos por partida, renders, propuesta visual). **La IndexedDB no viaja en ningún respaldo ni exportación** (`js/datos/cotizador.js:428-439` solo lee claves de localStorage).
8. La única exportación completa que existe es `respaldar()` (historial.js:1648) / `armarRespaldoCotizador()` (datos/cotizador.js:433) / `respaldar()` de la plataforma (js/app.js:1535). Trae el historial CON `aiFile.url`, pero SIN planos/renders y SIN la identidad del aparato (`al3d_pf_disp`).
9. El sello (`entry.sello`) es una copia parcial. El registro completo y firmable vive solo en la hoja «Autorizaciones» (17 columnas). Para que el QR de los PDF ya impresos siga verificando, hay que conservar el texto exacto de esa fila (`hoja-apps-script.gs:3635-3646`).
10. Sin autorización de Dirección en línea NO hay «autorizada»: `sellarEnLaHoja` exige red y cuenta Google de Dirección (notario.js:119-130). Las entradas anteriores a septiembre de 2026 pueden no traer `sello` (historial.js:130-132).

---------------------------------------------------------------------------------------------------

## 1. Inventario de almacenamiento del cotizador

### 1.1 localStorage (mismo origen que la plataforma)

| Clave | Contenido | Escribe | Crece | En RESPALDO_KEYS |
|---|---|---|---|---|
| `al3d_historial` | JSON array de entradas autorizadas (sección 2) | historial.js:24-53 `saveHistorial` | sí, con imágenes | sí |
| `al3d_queue` | JSON array de solicitudes (sección 3) | historial.js:1940 `saveQueue` | poco | sí |
| `al3d_q` | JSON de `Q` sin `editMode` y con `aiFile:null` (la cotización en pantalla) | historial.js:2015 `saveState`, en CADA tecla | no | sí |
| `al3d_aifile` | JSON `{name,type,url[,deEscalador]}` de la imagen analizada en curso. Tope `AI_FILE_MAX=2000000` caracteres (nucleo.js:934-935) | historial.js:2251 `sincronizarAiFile` | hasta 2 MB | sí |
| `al3d_folio` | entero en texto: mayor folio CONFIRMADO (autorizado) en este aparato | historial.js:2594 `confirmarFolio` | no | sí |
| `al3d_hitos` | `{ "<folio corto>": {pdf:ms, wa:ms, venta:ms} }` | entrega.js:381 `marcarHito` | decenas de bytes por folio | sí |
| `al3d_canva` | `{ "<folio corto>": {primera:ms, ultima:ms, veces:n} }` («Copiar datos para Canva» = propuesta presentada) | entrega.js:273 `marcarPropuesta` | idem | sí |
| `al3d_cuadernos` | `{ "tel:<10 dígitos>" \| "nom:<nombre normalizado>": "<nota, máx 1200 caracteres>" }` | historial.js:1144 `guardarNotaCuaderno` (`CUA_NOTA_MAX=1200`) | poco | sí |
| `al3d_pf_ganadas` | buzón de ventas ganadas (array de `g`, sección 6.3) | venta.js:521 `registrarGanada`; la plataforma lo drena (datos/cotizador.js:202) | poco | sí (única `al3d_pf_` que entra) |
| `al3d_logo` | data URL del logotipo propio (PNG/JPEG ≤300000 caracteres, o SVG) | entrega.js:77 | ≤300 KB | sí |
| `al3d_autorizador` | nombre recordado de quien autoriza (preferencia) | `prefSet` nucleo.js:939 | no | sí |
| `al3d_ult_material` | último material elegido a mano (clave de material) | idem | no | sí |
| `al3d_rv_pct` | % de comisión recordado (ya NO se escribe: venta.js:482-484 solo recuerda cuenta) | — | — | sí (lista) |
| `al3d_rv_cuenta` | última cuenta de cobro elegida | venta.js:482 | no | sí |
| `al3d_respaldo_ts` / `al3d_respaldo_n` | ms del último respaldo / cuántas cotizaciones llevaba | historial.js:1651 | no | sí |
| `al3d_pf_disp` | id del aparato, 4 caracteres de `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` | entrega.js:303 `dispositivo()` (misma clave que prefs.js:27) | no | **NO** (entrega.js:299-301: es identidad del aparato) |
| `al3d_pf_letra_folio` | 1 letra A-Z del folio impreso (`COT-0042-B`); editable en Ajustes | entrega.js:324 `letraFolio()` | no | **NO** |
| `al3d_pf_restaurar` | respaldo completo que dejó la plataforma esperando al cotizador | plataforma (prefs.js:236) | hasta el tamaño del respaldo | no (se borra al restaurar, historial.js:1834) |
| `al3d_pf_puente` | `{url, token}` del puente (token de dispositivo en claro) | Ajustes | no | **NO** (secreto) |
| `al3d_anidar` | SVG que el vectorizador deja al anidador (transitorio) | vectorizador.js:1558 | transitorio | no |
| `al3d_fold_proy`, `al3d_kxs_*`, `ai_key*`, `ai_model`, `ai_provider` | claves viejas; se BORRAN al arrancar (arranque.js:70, ia.js:140-145) | — | — | no |
| `sessionStorage['al3d_sesion']` | marca «misma sesión» para decidir si empezar en blanco (historial.js:2516) | — | — | no |

`RESPALDO_KEYS` = 16 claves, exactamente (historial.js:1574-1576; réplica en `js/datos/cotizador.js:428-432`; la prueba `pruebas/respaldo.mjs:41` exige «tiene 16 claves» e igualdad de las dos listas). Orden: `al3d_historial, al3d_folio, al3d_q, al3d_queue, al3d_logo, al3d_canva, al3d_hitos, al3d_pf_ganadas, al3d_cuadernos, al3d_aifile, al3d_autorizador, al3d_ult_material, al3d_rv_pct, al3d_rv_cuenta, al3d_respaldo_ts, al3d_respaldo_n`.

Otras claves del anidador (`al3d_anidador_material`, `al3d_anidador_retazos`) son de `anidador-vectores/js/app.js:43-44`; NO cubiertas en este mapa.

### 1.2 IndexedDB propia del cotizador (¡no está en el plan!)

`imagenes.js:18` — base `al3d_cot_imgs` v1, almacén `img`, `keyPath:'id'`. Registro: `{id:'img-<Date.now() base36>-<6 aleatorios>', url:<data URL JPEG>, w:<px>, h:<px>, ts:<ms>}` (imagenes.js:47-52). La imagen se re-escala a ≤1800 px de lado, JPEG calidad 0.86 (imagenes.js:19, 99).
La cotización solo guarda el ID: `items[i].plano` (string), `renders[]` (≤2 ids), `propuesta[]` (≤6 ids) (imagenes.js:20, 70).
Limpieza automática: `imgLimpiar()` (imagenes.js:75-84), lanzada 8 s después de arrancar (arranque.js:64), borra imágenes que NO referencian ni `Q` ni ninguna entrada del historial Y tienen más de 7 días.
No hay exportación de esta base en ningún sitio (`grep al3d_cot_imgs` solo da imagenes.js y arranque.js).
Una restauración de respaldo en otro aparato deja ids de imagen que no existen allá (`_imgNoHay`, imagenes.js:201: «llegaron en un respaldo sin ellas»).

---------------------------------------------------------------------------------------------------

## 2. `al3d_historial`: forma EXACTA

Se lee con `getHistorial()` (historial.js:20-23): `JSON.parse`, exige array y descarta lo que no sea objeto. Se escribe con `saveHistorial(arr)` (24-53): reescribe TODA la cadena, con todas las imágenes dentro.
Orden: `arr.unshift(entry)` (163) → más reciente primero. Una entrada existente se reemplaza en su posición (`arr[idx]=entry`, 163). Índice lógico: `folio` (`arr.findIndex(x=>x.folio===Q.folio)`, 111).
Quién escribe (todos pasan por `guardarEnHistorial`, historial.js:107): `aplicarSello` (notario.js:178, autorizar), `reenviarConFechaNueva` (historial.js:614), `guardarAutorizadaYa` (2452, 700 ms después de tocar anticipo/entrecalles/nota/plazo en una autorizada), `_imgCambio` (imagenes.js:119), `guardarCambiosEdicion` y partidas.js:493, `rvComprometerAnticipo` (venta.js:269), `cerrarEdicionCliente` (proceso.js:1700). Más `borrarDeHistorial` (397) y su `deshacerBorradoHistorial` (410), que llaman a `saveHistorial` directo.

### 2.1 Campos de una entrada (31), construidos en historial.js:119-162

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `folio` | string | `Q.folio` | `COT-0042-B` (formato nuevo `COT-`+4 dígitos+`-`+letra, historial.js:2574). Entradas viejas: `COT-0042`. Único solo DENTRO del aparato |
| `proy` | string | `Q.proy` | El NEGOCIO/proyecto («Farmacia San Juan»). OBLIGATORIO al capturar (proceso.js:989-993); puede venir `''` en entradas viejas |
| `cliente` | string | `Q.cliente` | La PERSONA/contacto («Juan Pérez»). En la plataforma `contacto`=`cliente`, `negocio`=`proy` (datos/proyectos.js:578-579) |
| `tel` | string | `Q.tel \|\| ''` | Tal como se tecleó, formato vivo `33 2813 0092` (piezas.js:4276). Obligatorio ≥10 dígitos hoy; puede ser `''` en entradas viejas |
| `dirRaw` | string | `Q.dirRaw \|\| ''` | Dirección en texto libre (puede traer saltos de línea) |
| `direccion` | string | `Q.direccion \|\| ''` | Campo heredado; ya no hay input que lo escriba (`_FM` no lo lista, historial.js:2298). Normalmente `''` |
| `maps` | string | `Q.maps \|\| ''` | URL de Google Maps (puede ser enlace corto `maps.app.goo.gl`) |
| `entrecalles` | string | `Q.entrecalles \|\| ''` | texto |
| `entrega` | string | `Q.entrega \|\| ''` | **Texto libre del compromiso/«límite de fabricación»** («Viernes 15 de Agosto»). NO es el modo de entrega (Instalación/Paquetería/Recolección) de la hoja/plataforma; en la plataforma esto es `compromiso_texto` (datos/proyectos.js:588) |
| `notaCliente` | string | `Q.notaCliente \|\| ''` | nota que sale en el PDF |
| `fecha` | string | `Q.fecha \|\| ''` | fecha de la cotización, texto es-MX: `hoy()` = `toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})` → `10 oct 2026` (arranque.js:17). NO se puede restar |
| `plazoK` | number\|null | `Q.plazoK` si 1..5, si no `null` | cubo de plazo de taller; `null` = «manda el propuesto» (historial.js:2317-2323) |
| `fechaAuth` | string | `Q.fechaAuth` | fecha de autorización, texto es-MX `09 oct 2026` (notario.js:147) |
| `autorizador` | string | `Q.autorizador` | hoy = CORREO de la cuenta de Dirección (`sello.correo`, notario.js:144). Entradas viejas: nombre tecleado |
| `nota` | string | `Q.nota` | nota del autorizador |
| `precioAuth` | number | `Q.precioAuth` | precio AUTORIZADO en NETO (con IVA si `iva`); `0` = sin ajuste, manda el calculado |
| `neto` | number | `totals().neto` | neto CALCULADO con el catálogo de precios de la versión que guardó. SIN redondear (suma de partidas redondeadas + `sub*0.16`; puede traer ruido de flotante tipo 15042.399999999998). No es el total cobrado |
| `sub` | number | `totals().sub` | subtotal calculado (suma de `lineTotal` por partida), sin IVA |
| `iva` | boolean | `Q.iva` | `true` = lleva 16 %. Se lee como `e.iva!==false` |
| `huellaAuth` | string | `Q.huellaAuth \|\| ''` | huella del trabajo autorizado (sección 4.4). `''` = el precio se soltó al editar; AUSENTE = entrada anterior a la huella (historial.js:905-911) |
| `sello` | object\|null | `Q.sello \|\| null` | ver 2.3. Ausente/null en entradas anteriores al notario |
| `anti` | number | `Q.anti \|\| 0` | anticipo pactado. Por omisión `Math.round(precioFinal*0.5)` (proceso.js:2149) |
| `antiManual` | boolean | `!!Q.antiManual` | `true` si una persona fijó el anticipo |
| `items` | array | copia profunda de `Q.items` + `_lt` | partidas, ver 2.2 |
| `itemsAuth` | object | copia de `Q.itemsAuth \|\| {}` | ajustes por partida: `{ "<id partida como texto>": <importe SIN IVA> }` |
| `aiFile` | object\|null | `{name,type,url}` o la imagen previa del mismo folio | ver 2.4. La marca `deEscalador` NO se guarda aquí |
| `renders` | string[] | `Q.renders` | ids de IndexedDB `al3d_cot_imgs` (máx 2) |
| `propuesta` | string[] | `Q.propuesta` | ids de IndexedDB (máx 6) |
| `disp` | string | `dispositivo()` | id de 4 caracteres del aparato que emitió. AUSENTE en entradas antiguas (datos/cotizador.js:175 cae a `e.disp \|\| disp` de ESTE aparato) |
| `ts` | number | ver abajo | ms epoch de la AUTORIZACIÓN |
| `reenviada` | number | `extra.reenviada` / anterior / `0` | ms del último «Reenviar con fecha nueva» (función 33). `0` = nunca |

`ts` (historial.js:150-156): se conserva el de la entrada anterior SOLO si `arr[idx].fechaAuth===Q.fechaAuth && arr[idx].autorizador===Q.autorizador`; en cualquier otro caso `Date.now()`. (ARQUITECTURA.md:147 dice que «`ts` se sobrescribe»: ya no es cierto.) Entradas viejas pueden NO traer `ts` (`vigenciaDe` devuelve `null`, historial.js:546-547).

### 2.2 Una partida (`items[i]`), forma que escribe `addItem` (partidas.js:183-184) + lo que se agrega después

| Campo | Tipo | Valores / significado |
|---|---|---|
| `id` | int>0 | único SOLO dentro de la cotización (contador `pid`); es la llave de `itemsAuth` |
| `tipo` | string | `'letras'`,`'recorte'`,`'bastidor'`,`'caja'`,`'manual'` (nucleo.js:1357; lo demás se normaliza a `manual`) |
| `material` | string | `'al-paint'`,`'al-brush'`,`'acr-vol'`,`'acr-vinil'`,`'acero'` o `''` (solo letras lo usa) |
| `matAuto` | boolean | el material lo heredó la app |
| `comp` | string | `'recta'`,`'cursiva'`,`'compleja'` (complejidad de la letra) |
| `luz` | boolean | con iluminación (default `true`); sin luz las letras valen 0.8× |
| `ilumTipo` | string | `'fria'`\|`'calida'` |
| `altura` | number | cm (letras/recorte) |
| `n` | number | letras/piezas |
| `tarifa` | number | $/m² (solo caja) |
| `ancho`, `alto` | number | cm (bastidor/caja) |
| `acab` | string | `'sencillo'`,`'vinil'`,`'sandwich'` o `''` (recorte) |
| `recComp` | boolean | recorte sándwich complejo (+$5/cm) |
| `bas` | string | `'lamina'`,`'alucobond'` o `''` (bastidor) |
| `desc` | string | descripción que sale en el PDF/sello (≤120 se firma) |
| `descAi` | boolean | descripción escrita por la IA |
| `pz`, `pu` | number | piezas y precio unitario (tipo `manual`) |
| `textoAuto` | string | texto del que se cuentan las letras |
| `showInPdf` | boolean | `false` = oculta del PDF pero SE COBRA |
| `_lt` | number | importe de la partida CONGELADO al guardar (`+lineTotal(it).toFixed(2)`, historial.js:141). Solo en `items` del historial |
| `plano` | string (opcional) | id en IndexedDB `al3d_cot_imgs` |
| `opciones` | object (opcional) | `{lista:[{k:int, d:{…campos de esa opción…}}], activa:k}`; 2 a 3 opciones (partidas.js:2002, `OPC_MAX=3`) |
| `nManual`, `descAuto`, `medidaTipo`, `anchoMedido` | opcionales | banderas/medida del escalador (partidas.js:328-336, escalador.js:2167-2168) |

Campos que mueven el precio (`_CAMPOS_PRECIO`, nucleo.js:1309): `tipo, material, comp, luz, altura, n, acab, recComp, bas, ancho, alto, tarifa, pz, pu`. Fórmula de importe: `lineTotalCrudo` (nucleo.js:1261-1284), redondeo a centavo UNA vez (`lineTotal`, 1260). Catálogo de precios copiado en el .gs (`COT_MATERIALES` etc., hoja-apps-script.gs:3338-3348).
`normalizarItems` (nucleo.js:1358) fuerza números >0 en `altura,n,ancho,alto,tarifa,pz,pu`, tipo válido e id entero único: los respaldos externos entran por ahí.

### 2.3 `sello` (notario.js:158-164)

```
{ codigo:'A1B2-C3D4-E5F6',          // 12 hex del HMAC en mayúsculas, 3 grupos
  correo:'<correo de Dirección>',
  ts:'2026-10-09T18:04:11.000Z',   // STRING ISO (hora de la HOJA), no número
  total:18000,                      // total que firmó la hoja (cotTotalFinal)
  folio:'COT-0042-B@K7QM',          // folioGlobal() = Q.folio+'@'+dispositivo() al sellar
  proyecto:'Farmacia San Juan',     // proyecto firmado (opcional, solo selloImprimible lo compara)
  renglones:[{descripcion:'…',cantidad:11,importe:13200}, …] }   // opcional; ausente en sellos anteriores a puente-sheets-8
```
NO trae `huella`, `subCalc`, `precioAuth` canónico ni `itemsAuth` canónico, que SÍ firma la hoja. El PDF imprime un QR → `verificar.html?f=<sello.folio>&c=<sello.codigo>` (entrega.js:644-649).

### 2.4 `aiFile`

`{name:string, type:string(mime), url:string}`. `url` es un data URL base64. Se vacía a `''` (nombre y tipo se quedan) cuando no cupo (historial.js:42). Puede ser imagen o PDF (`type` empieza con `image/` solo para imágenes, historial.js:654). Al analizar con IA la imagen se re-escala a ≤1600 px JPEG 0.85 (`AI_IMG_MAX=1600, AI_IMG_Q=0.85`, ia.js:812); un PDF no se re-escala. `guardarEnHistorial` NO limita el tamaño de `url` (el tope `AI_FILE_MAX` solo aplica a la clave `al3d_aifile`, historial.js:2268).

### 2.5 Ejemplo realista (datos FALSOS; `url` truncada)

```json
{
  "folio": "COT-0042-B",
  "proy": "Farmacia San Juan",
  "cliente": "Juan Pérez",
  "tel": "33 1234 5678",
  "dirRaw": "Av. Patria 1234, Col. Jardines Vallarta, Zapopan, Jal.",
  "direccion": "",
  "maps": "https://maps.app.goo.gl/AbC123xyz",
  "entrecalles": "Entre Av. Vallarta y Calle Niños Héroes",
  "entrega": "Viernes 23 de octubre",
  "notaCliente": "El cliente debe proporcionar salida eléctrica.",
  "fecha": "08 oct 2026",
  "plazoK": 3,
  "fechaAuth": "09 oct 2026",
  "autorizador": "direccion@ejemplo.mx",
  "nota": "Descuento por cliente frecuente",
  "precioAuth": 18000,
  "neto": 19372,
  "sub": 16700,
  "iva": true,
  "huellaAuth": "c|1:letras~al-paint~recta~true~40~11~~false~~0~0~0~1~0,2:caja~~recta~true~0~0~~false~~120~60~3500~1~0",
  "sello": {
    "codigo": "A1B2-C3D4-E5F6",
    "correo": "direccion@ejemplo.mx",
    "ts": "2026-10-09T18:04:11.000Z",
    "total": 18000,
    "folio": "COT-0042-B@K7QM",
    "proyecto": "Farmacia San Juan",
    "renglones": [
      { "descripcion": "Letras 3D aluminio pintado con luz LED", "cantidad": 11, "importe": 13200 },
      { "descripcion": "Caja de luz 120x60 cm", "cantidad": 1, "importe": 3500 }
    ]
  },
  "anti": 9000,
  "antiManual": false,
  "items": [
    { "id": 1, "tipo": "letras", "material": "al-paint", "matAuto": false, "comp": "recta", "luz": true,
      "ilumTipo": "fria", "altura": 40, "n": 11, "tarifa": 0, "ancho": 0, "alto": 0, "acab": "", "recComp": false,
      "bas": "", "desc": "Letras 3D aluminio pintado con luz LED", "descAi": false, "pz": 1, "pu": 0,
      "textoAuto": "FARMACIA 24H", "showInPdf": true, "plano": "img-lq3k9x-a1b2c3", "_lt": 13200 },
    { "id": 2, "tipo": "caja", "material": "", "matAuto": false, "comp": "recta", "luz": true,
      "ilumTipo": "fria", "altura": 0, "n": 0, "tarifa": 3500, "ancho": 120, "alto": 60, "acab": "", "recComp": false,
      "bas": "", "desc": "Caja de luz 120x60 cm", "descAi": false, "pz": 1, "pu": 0,
      "textoAuto": "", "showInPdf": true, "_lt": 3500 }
  ],
  "itemsAuth": {},
  "aiFile": { "name": "fachada.jpg", "type": "image/jpeg", "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg…(≈300 KB)" },
  "renders": ["img-lq3ka2-d4e5f6"],
  "propuesta": [],
  "disp": "K7QM",
  "ts": 1791569053412,
  "reenviada": 0
}
```
Cuentas del ejemplo: letras 30(al-paint)+0(recta)=30 ×40 cm ×11 = 13 200; caja 120×60 cm = 0.72 m² → mínimo 1 m² × 3 500 = 3 500; `sub` 16 700; IVA 2 672; `neto` 19 372; Dirección autorizó 18 000 neto (descuento) → total cobrado 18 000 = `sello.total`; anticipo 50 % = 9 000. `itemsAuth` vacío porque no hubo ajuste por partida. Con ajuste por partida sería `{ "2": 3000 }`.

### 2.6 Reglas de escritura que cualquier réplica debe respetar

- **Un folio es de UN cliente** (historial.js:54-106): antes de escribir, si el folio ya existe con OTRO cliente (`mismoCliente`: coincide el teléfono de 10 dígitos O el nombre normalizado; si falta con qué comparar se asume el mismo), la nueva cotización toma folio nuevo (`nextFolio()`) y se quita la solicitud del viejo de la cola. Puede cambiar `Q.folio` en pleno guardado.
- Imagen previa del folio se conserva si la de pantalla se perdió (historial.js:112-118, 143).
- Cuota llena (historial.js:30-52): se reintenta soltando `aiFile.url` de la más ANTIGUA a la más reciente hasta que quepa; si ni así, no se escribe nada, `saveHistorial` devuelve `false` y la cola queda como única copia.
- Estado de la entrada = siempre «autorizada» por construcción (datos/cotizador.js:404-406 acepta un `estado` si algún día existiera; hoy ninguna entrada lo trae).

---------------------------------------------------------------------------------------------------

## 3. `al3d_queue` (cola de autorización del aparato)

Código: historial.js:1934-1962 (+ notario.js, proceso.js, partidas.js). Array en orden de inserción (`push`, el MÁS ANTIGUO primero — al revés que el historial).

### 3.1 Forma de un renglón (creado en `pushToQueue`, historial.js:1950)

```json
{ "folio": "COT-0043-B",
  "proy": "Taquería El Güero",
  "cliente": "María López",
  "neto": 9280,
  "fecha_sol": "10 oct 2026",
  "estado": "pendiente",
  "precioAuth": 0,
  "autorizador": "",
  "nota": "",
  "fechaAuth": "",
  "q": { "…copia COMPLETA de Q con aiFile:null…": "ver 3.2" } }
```
Campos: `folio,proy,cliente` (string); `neto` (number: `totals().neto` al pedir, calculado); `fecha_sol` (string es-MX = `Q.fecha`, NO la fecha de solicitud); `estado` (`'pendiente'`\|`'autorizada'`\|`'rechazada'`); `precioAuth` (number); `autorizador`,`nota`,`fechaAuth` (string); `q` (object\|null). Tras `updateQueueEntry` pueden aparecer `itemsAuth` y `huellaAuth` (partidas.js:533, 1961, notario.js:177).

### 3.2 `q` = foto de `Q` (nucleo.js:21-57 más lo que se le agrega)

Claves: `proy, cliente, tel, direccion, fecha, maps, folio, entrecalles, entrega, dirRaw, notaCliente, plazoK, items, iva, estado, rol, autorizador, nota, fechaAuth, anti, antiManual, precioAuth, itemsAuth, huellaAuth, sello, solicitud, reauth, aiFile(=null), renders, propuesta, sinEstrenar, editMode`.
- `rol`: `'vendedor'`\|`'autorizador'` — vista de pantalla, NO es el rol de la plataforma (Prefs).
- `solicitud`: `{enviada:bool, ts:ms, error:string, definitivo?:bool, cancelada?:bool, retirada?:bool, proyecto?:string, rechazo?:{resolvio:string, nota:string}}` (notario.js:237-248, 269, 392, 415).
- `reauth`: `{folio, autorizador, nota, fechaAuth, precioAuth, itemsAuth, huellaAuth, pf:<precio final que el cliente ya tiene>, sello}` mientras se re-autoriza una autorizada (proceso.js:1996-1998).
- `sinEstrenar`: bool (nunca ha tenido partida). `editMode`: bool (solo UI).
- Las partidas de `q.items` NO traen `_lt` (eso es del historial).
Trae `tel` y `dirRaw` (a diferencia del renglón, que no lleva teléfono, historial.js:84-86).

### 3.3 Ciclo de vida

| Evento | Función | Efecto en la cola |
|---|---|---|
| Vendedor pide autorización | `solicitar` → `solicitarConfirmado` (proceso.js:1886-1898) | `Q.estado='pendiente'`, `Q.solicitud={enviada:false,ts,error:''}`, `pushToQueue()` (alta o reemplazo por folio), luego `enviarSolicitud()` (POST ruta `solicitar` con `folioGlobal(folio)`) |
| Dirección se autoriza a sí misma | `autorizarYoMismo` (proceso.js:1932-1961) | pasa por `pushToQueue()` (1956) igual que el flujo normal |
| Re-autorizar una autorizada | `reautorizar` (proceso.js:1991) | mete la misma cotización en la cola con `Q.reauth`; la entrada del historial NO se toca (el folio queda a la vez en historial y en cola) |
| La hoja contesta (cada 15 s mientras la pantalla se ve; `VIGILA_MS=15000`) | `consultarSolicitudes` → `atenderRespuesta` (notario.js:313, 356) | `autorizada`+sello → `aplicarSello`; rechazada fuera de pantalla → guarda `q.solicitud.rechazo`; cancelada → `q.solicitud.cancelada` |
| Avance de la revisión de precio | `updItemAuth` (partidas.js:1960-1963), `guardarCambiosEdicion` (partidas.js:532-533), `cerrarEdicionCliente` (proceso.js:1736) | `updateQueueEntry` reescribe `precioAuth,itemsAuth,huellaAuth` y/o `q` |
| Autorizada | `aplicarSello` (notario.js:177) | `updateQueueEntry(...,{estado:'autorizada',…})`, `guardarEnHistorial()`, y **solo si el historial recibió la entrada** `removeFromQueue(folio)` (181) |
| Rechazada | `rechazar` (proceso.js:2153-2172) y `atenderRespuesta` (notario.js:399-401) | `removeFromQueue(folio)` |
| Volver a editar / cancelar | `reabrir` (proceso.js:2025-2062) | `removeFromQueue(folio)`; `retirarSolicitud` → POST `cancelar` |
| Folio reasignado | `reFoliarSiEsOtroCliente` (historial.js:101) | `removeFromQueue(folio viejo)` |

Reglas de guardado: `saveQueue` (historial.js:1940-1943) pone `q:null` a todo renglón con `estado!=='pendiente'` («se conserva el renglón porque de él salen los folios ocupados»). El `try/catch` de `setItem` es mudo (cuota llena = cola sin guardar sin aviso).
**Cuándo se vacía**: nunca por tiempo ni por cantidad. Solo por las acciones de la tabla. Quedan huérfanos (a) los `pendiente` que nadie abre o cancela, (b) un `autorizada`+`q:null` si el historial no cupo (es la única copia de folio/precio/quién, notario.js:179-181). `foliosOcupados` (historial.js:2578-2584) cuenta todo renglón con `estado!=='rechazada'` para no reutilizar el número.
La plataforma lee solo `estado==='pendiente'` (`datos/cotizador.js:39`).

Lo que la hoja sabe de una solicitud (hoja «Solicitudes de autorización», 13 columnas, hoja-apps-script.gs:3695-3696): `Cuándo, Folio, Proyecto, Cliente, Subtotal, IVA, Huella, Cotización, Solicitó, Estado, Resolvió, Cuándo se resolvió, Nota`. La celda `Cotización` guarda `limpiarCotizacion` (3530-3571): `{proyecto, cliente, iva, subtotal, items:[{id, <_CAMPOS_PRECIO>, desc≤300}]}` — SIN teléfono, dirección, anticipo, notas ni imágenes. **La hoja no puede reconstruir una pendiente completa.**

---------------------------------------------------------------------------------------------------

## 4. Estados de una cotización y cómo cambian

### 4.1 Estados del cliente (`Q.estado`)

`['borrador','pendiente','autorizada','rechazada']` (historial.js:2473; etiquetas proceso.js:2176). Cualquier otro valor se lee como `borrador`.

| Estado | Dónde vive | Cómo se entra |
|---|---|---|
| `borrador` | solo `al3d_q` (UN renglón por aparato) | `init`/`nueva()` (proceso.js:2216-2271), `usarComoBase` (historial.js:992), `reabrir` (proceso.js:2048) |
| `pendiente` | `al3d_q` + `al3d_queue[folio].q` + hoja «Solicitudes» (`Estado='pendiente'`) | `solicitarConfirmado` (proceso.js:1894), `autorizarYoMismo` (1956) |
| `autorizada` | `al3d_historial` (+ `al3d_q` si está en pantalla) + hoja «Autorizaciones» (`Estado='vigente'`) | `aplicarSello` (notario.js:143), `reabrirDeHistorial` (historial.js:914) |
| `rechazada` | solo `al3d_q`, mientras siga en pantalla; sale de la cola de inmediato | `rechazar` (proceso.js:2164), `atenderRespuesta` (notario.js:399) |

Transiciones:
```
borrador ──solicitar──▶ pendiente ──sello──▶ autorizada
   ▲  └─(Dirección)autorizarYoMismo──▶ pendiente    │  ▲
   │                       │ └─rechazo──▶ rechazada  │  └─ reautorizar (autorizada→pendiente, Q.reauth)
   └──── reabrir ──────────┘      (rechazada→borrador por reabrir)
autorizada ──editar partidas──▶ autorizada SIN precio (huellaAuth='', precioAuth=0, sello=null) ──volver a autorizar──▶ pendiente…
```
Quién decide: solo una cuenta Google con rol `direccion` sella (`puedeAutorizar`, notario.js:44; `autorizarConfirmado` proceso.js:2077; hoja `soloDireccionConGoogle`, hoja-apps-script.gs:3748). Sin red no se autoriza (notario.js:120).

### 4.2 Estados derivados que NO son un campo (pero existen)

- **Autorización suelta**: `Q.estado==='autorizada' && !Q.huellaAuth` (`autorizacionSuelta`, proceso.js:1978). En el historial = entrada con `huellaAuth===''` (y `sello:null`, `precioAuth:0`). Ocurre al editar partidas de una autorizada (`soltarAuthSiCambio`, nucleo.js:1404-1413). La hoja sigue con su fila `vigente` hasta que se vuelva a autorizar (entonces pasa a `superada`).
- **Vigencia de 10 días** (`VIG_DIAS=10`, `VIG_AMBAR=3`, historial.js:543): se calcula desde `max(ts, reenviada)` en días naturales locales; `ok` (>3 días), `av` (0-3), `mal` (vencida). No se guarda. Probado en `pruebas/cot-historial.mjs`.
- **Hitos** (por folio corto, `al3d_hitos`): `pdf`, `wa` («chat abierto», no «enviada»), `venta`; más `propuesta` (`al3d_canva`). Se borran `pdf` y `wa` cuando el precio cambia (`desmarcarHitos`, entrega.js:438; notario.js:172).
- **Ganada**: no es un estado de la cotización; es la existencia de un proyecto con `folio_global` (sección 6).

### 4.3 Estados que SOLO existen en la hoja

| Hoja | Columna | Valores (con el código que los escribe) |
|---|---|---|
| «Autorizaciones» (oculta) | `Estado` | `vigente` (alta, hoja-apps-script.gs:3964); `superada` (otra autorización del mismo folio con otro precio/trabajo, 3955); `revocada` (`/revocar` o `revocarAutorizacion('COT-0042@K7QM')`, 4012) |
| «Solicitudes de autorización» | `Estado` | `pendiente` (3792); `autorizada` (3967); `rechazada` (3989); `cancelada` (3820) |
`/verificar` contesta `autentica` / `superada` / `revocada` / `no_autentica` (4051). **Ningún archivo del cliente llama a `/revocar` ni lee `revocada`** (grep sobre `js/`): una cotización revocada en la hoja sigue siendo `autorizada` en el historial del teléfono.

### 4.4 Huella (clave de identidad del TRABAJO)

`huellaTrabajo()` (nucleo.js:1326-1329): `(iva?'c':'s')+'|'+items.map(it=>it.id+':'+_CAMPOS_PRECIO.map(k=>it[k]===undefined?'':String(it[k])).join('~')).sort().join(',')`. NO incluye cliente/teléfono/proyecto. Se ORDENA (desde el 15-sep-2026); las guardadas antes se comparan con `huellaOrdenada` (nucleo.js:1387). La hoja calcula la misma (`cotHuella`, hoja-apps-script.gs:3396) y la guarda en la columna `Huella` de «Autorizaciones».

---------------------------------------------------------------------------------------------------

## 5. Cliente, dinero y renglones: qué se guarda y qué ya es columna de la hoja

### 5.1 Cuatro «subtotales/totales» distintos (trampa para el esquema)

| Nombre | Dónde | Qué es |
|---|---|---|
| `entry.sub` / `entry.neto` | historial | CALCULADOS con el catálogo del momento (sin redondeo final, ver 2.1) |
| `entry.precioAuth` | historial | neto AUTORIZADO (0 = sin ajuste) |
| total cobrado | `totalFinalHist(e)` (historial.js:1045) = `precioAuth` si `precioAuth>0 && |precioAuth-neto|>0.01`, si no `neto`; réplica `cobrado()` datos/cotizador.js:96 | lo que se cobra |
| `sub`/`neto` de la VENTA | `desgloseFinal()` (nucleo.js:1452): `neto=precioFinal`, `sub=neto/1.16` si IVA | lo que viaja a `al3d_pf_ganadas` (venta.js:545) y a la hoja (`Precio Subtotal`). Con descuento autorizado, `venta.sub` ≠ `entry.sub` |
Regla de precio: `precioFinal()` (nucleo.js:1419-1428). `neto` autorizado se guarda CON IVA; el formulario de revisión teclea SUBTOTAL y `conIva` convierte (nucleo.js:1449).

### 5.2 Mapa campo → hoja

| Dato del cotizador | Columna de la hoja que ya existe | Quién la escribe |
|---|---|---|
| `cliente` + `proy` | «Ventas»: `Proyecto` (B) = `"<cliente> - <proy>"` (venta.js:149, 358) — se mezclan en una sola celda. «Autorizaciones»/«Solicitudes»: `Proyecto`(=`proy`) y `Cliente`(=`cliente`) por separado | cotizador (`empujar`), notario |
| `tel` | «Ventas»: `Telefono` (AE). El cotizador NO lo manda (`datosParaLaHoja`, venta.js:357-371) | la plataforma desde `proyecto.tel` |
| `dirRaw`/`direccion` | «Ventas»: `Direccion` (AC) = `direccionPdf()` = `dirRaw` o `direccion` (nucleo.js:1672) | cotizador |
| `maps` | «Ventas»: `Ubicacion` (AB) solo cuando la plataforma resuelve lat,lng o link | plataforma |
| `entrecalles`, `notaCliente`, `entrega`(texto), `fecha`, `nota` | ninguna columna | — |
| `plazoK` | «Ventas»: `Plazo taller` (AH) | plataforma |
| `sub` (de la venta) | «Ventas»: `Precio Subtotal` (G) | cotizador |
| `iva` | «Ventas»: `IVA` (F) | cotizador |
| `anti` (editable en el modal) | «Ventas»: `Anticipo` (I) | cotizador |
| neto, saldo, comisión | «Ventas»: `Precio Neto ` (H), `Pago Pendiente` (K), `Comisiones` (R), `Comision Restante` (T) = FÓRMULAS (no se escriben) | hoja |
| estatus de cobro / cuenta | «Ventas»: `Estatus` (C), `Cuenta ` (D, con espacio final) | cotizador (modal) |
| `pct_comision` (siempre 10) | «Ventas»: `Porcentaje comision` (AD) (la fórmula R no la lee) | cotizador |
| fechas anticipo/instalación/liquidación | «Ventas»: `Fecha Anticipo e Instalacion` (L), `Fecha instalacion` (M), `Fecha Liquidacion` (N); `Liquidacion` (J) si estatus LIQUIDADO | cotizador |
| `folio`+`disp` | «Ventas»: `Folio cotizacion` (Y) = `COT-0042-B@K7QM` (venta.js:368) | cotizador |
| etapa | «Ventas»: `Etapa de obra` (Z) = `'Ganado'` al registrar (venta.js:369) | cotizador |
| precio autorizado, ajustes, huella, código, firma, quién, cuándo, nota, renglones | «Autorizaciones»: `Cuándo (ISO)` A, `Folio` B, `Proyecto` C, `Cliente` D, `Subtotal calculado` E, `Precio autorizado (neto)` F, `Total` G, `Ajuste %` H, `Ajustes por partida` I, `Huella` J, `Autorizó` K, `Solicitó` L, `Código` M, `Firma` N, `Estado` O, `Nota` P, `Renglones` Q (17 columnas, hoja-apps-script.gs:3685-3687) | notario (`/autorizar`) |
| partidas con todos sus campos (material, medidas, luz, tarifa…) | NINGUNA columna. «Solicitudes».`Cotización` guarda solo los campos de precio + `desc` (JSON); «Autorizaciones».`Renglones` guarda `[descripción≤120, cantidad, importe]` por partida | notario |
| imágenes (aiFile, planos, renders, propuesta) | ninguna | — |
| hitos, propuesta Canva, notas de cuaderno | ninguna | — |

Formatos de celda de «Autorizaciones» (para no romper la firma): todo texto se guarda con apóstrofo delante (`txt()`, 3682); `Ajustes por partida` = `itemsAuthCanon` → `"1:1500.00,2:800.00"` (llaves ordenadas, 2 decimales); `Renglones` = JSON `[[desc,cantidad,importe],…]`; `Cuándo (ISO)` = ISO en texto.

### 5.3 Clientes: no hay tabla; se DERIVAN del historial («cuadernos»)

Regla de agrupación (historial.js:1039-1116; réplica `datos/cotizador.js:261-324`, probada por `pruebas/replicas.mjs`/`pruebas/cuadernos.mjs`):
1. `telClave(t)`: dígitos; si ≥10, los ÚLTIMOS 10; si no, `''`.
2. Pasada 1: las entradas con `telClave` forman el grupo `tel:<10 dígitos>`; se registra `nombre normalizado → {tel:…}`.
3. Pasada 2: las que no tienen teléfono: sin nombre → grupo `?` («Sin identificar»); con nombre que apunta a UN solo teléfono → se unen a ese grupo (y se anota la clave `nom:<nombre>`); si no → grupo `nom:<nombre>`.
4. `normNom(s)` = `trim().toLowerCase().replace(/\s+/g,' ')` (nucleo.js:946; NO quita acentos).
5. Por grupo: nombre, tel y dirección = los de la cotización más reciente que los tenga; `alias` = otros nombres; `vendido` = suma de `totalFinalHist`; `primera`/`ultima` desde `ts`.
La nota del cuaderno (`al3d_cuadernos`) se busca bajo cualquiera de las claves del grupo (historial.js:1137-1143).

---------------------------------------------------------------------------------------------------

## 6. Vínculo con proyectos, ventas y autorizaciones

### 6.1 Llave: `folio` vs folio global

- `Q.folio` = `COT-`+`0042`+`-`+letra (historial.js:2570-2574). El número sale de `max(al3d_folio, ocupados)+1` y solo AVANZA el contador al autorizar (`confirmarFolio`, 2594); un borrador/pendiente lleva folio PROVISIONAL.
- `folioGlobal(folio)` = `folio+'@'+dispositivo()` (notario.js:89; datos/cotizador.js:186 `folioGlobal(folio,disp)`). `folioVisible` = parte antes de `@`.
- La hoja valida `^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$` (`folioValido`, hoja-apps-script.gs:3573); `/verificar` acepta también sin `@` (`folioDePapel_`, 3597).
- Dos aparatos con el mismo número y letra son posibles (la letra es la primera del id o editable). Lo que desempata es `disp`.
- Entradas sin `disp`: usar `sello.folio` (parte tras `@`) si hay sello; si no, NO CONFIRMADO de qué aparato son: hay que pedir el id del aparato (Ajustes lo muestra, mod/ajustes.js:511).

### 6.2 Cotización → proyecto (datos/proyectos.js)

`ganar(entrada, extra)` (667) crea el proyecto: `folio_global: Cot.folioGlobal(origen.folio, disp)` (576), `folio_local`, `dispositivo`, `origen` = COPIA CONGELADA de la entrada (`congelar`, 344-352: `JSON.parse(JSON.stringify(entrada))` con `aiFile.url` puesto en `''` y `fuente:'cotizador'`; se le pone `origen.huellaAuth` = huella del momento de ganar). Campos copiados: `contacto=cliente`, `negocio=proy`, `tel`, `compromiso_texto=entrega`, `dir_texto=dirRaw||direccion`, `entrecalles`, `maps_url=maps`, `sub`, `neto`, `precio_auth=Cot.totalVendido(origen)`, `anti_pactado`, `iva`, `plazo_k`, `cuenta`, `estatus_notion`, `pct_comision`. Duplicados: `yaExiste(folio_global)` → `DUPLICADO`.
`estadoOrigen(proyecto)` (datos/cotizador.js:151) compara `origen.huellaAuth` con la huella de la entrada de HOY (`igual`/`cambio`/`desaparecio`/`sin_huella`).
**Consecuencia para la migración**: cada proyecto ganado trae dentro (`proyectos.origen` en IndexedDB `al3d_pf`) una segunda copia de su entrada sin imagen. Es fuente de rescate cuando el historial del teléfono se perdió (datos/proyectos.js: «Si la entrada desaparece, el proyecto sigue completo»).

### 6.3 Buzón `al3d_pf_ganadas` (venta.js:525-548)

```
g = { folio, disp, huella:Q.huellaAuth||'', fecha_instalacion:'YYYY-MM-DD'|'', fecha_anticipo:'YYYY-MM-DD'|'',
      plazo_k:1..5|null, cuenta, estatus, pct_comision:10, sub, neto, anti, ts:ms }
```
`drenarBuzon` (datos/cotizador.js:202-248) lo convierte en proyecto buscando la entrada por `porFolio(g.folio)` en el historial de ESTE aparato; si no está → `fallidos` y se descarta del buzón. Si la entrada no existe en este aparato, la venta no se convierte.

### 6.4 Cotización → hoja «Ventas»

`mandarALaHoja` (venta.js:393-436): POST `empujar` con `ops:[{id:datos['Folio cotizacion'], datos}]`, `datos` = `datosParaLaHoja()` (350-388) con claves exactas: `'Proyecto','Precio Subtotal','IVA','Anticipo','Estatus','Cuenta ','Folio cotizacion','Etapa de obra','Direccion','Fecha Anticipo e Instalacion','Fecha instalacion','Porcentaje comision'` y, si `LIQUIDADO`, `'Liquidacion','Fecha Liquidacion'`. El puente busca por `Folio cotizacion` antes de crear (no duplica). `marcarHito('venta')` al terminar. Cuentas válidas (`RV_CUENTAS`, venta.js:53): `Elias BBVA`, `Constru BNT`, `Moni MPago`, `Rul HSBC`, `Tatis BNT`; solo `Elias BBVA` cobra sin factura (`CUENTA_SIN_FACTURA`, venta.js:52). Comisión fija 10 % del subtotal (`COMISION_PCT`, venta.js:27).

### 6.5 Cotización → autorización (rutas del puente que toca el cotizador)

Todas por `hablarHoja(ruta,cuerpo)` (notario.js:59): empotrado = `window.AL3D.hablar` de la plataforma (mod/cotizador.js:362 → `Puente.hablar`); suelto (`?solo=1`) = `fetch` directo con el token de dispositivo (`_postHoja`, notario.js:70).

| Ruta | Cuerpo | Respuesta | Disparador |
|---|---|---|---|
| `solicitar` | `{folio:folioGlobal, cotizacion:cotParaHoja(), nota:''}` | `{ok, estado:'pendiente'}` | enviarSolicitud (notario.js:223) |
| `cancelar` | `{folio}` | `{ok, estado:'cancelada'\|null}` | retirarSolicitud (280) |
| `estado` | `{folios:[hasta 20 folios globales]}` | `{ok, folios:{ "<folio global>": {estado:'autorizada'\|'pendiente'\|'rechazada'\|'cancelada'\|null, sello|null, resolvio, nota} }}` | consultarSolicitudes (322) |
| `pendientes` | `{}` | `{ok, solicitudes:[{folio, cuando, solicito, nota, cotizacion}]}` (hasta 50; solo Dirección) | cargarPendientesRemotas (468) |
| `autorizar` | `{folio, cotizacion, precioAuth, itemsAuth, nota}` | `{ok, sello:{codigo,correo,ts,huella,subCalc,precioAuth,itemsAuth,total,nota,renglones}}` | sellarEnLaHoja (notario.js:124) |
| `rechazar` | `{folio, nota}` | `{ok, estado:'rechazada'}` | rechazar / rechazarRemota |
| `revocar` | `{folio}` | `{ok}` | **nadie en el cliente** |

`cotParaHoja()` (notario.js:93-102) = `{proyecto, cliente, iva, subtotal, items:[{id, desc, …_CAMPOS_PRECIO presentes}]}`. Códigos de error relevantes: `SIN_PUENTE`, `SIN_RED`, `DESCONOCIDO`, `CATALOGO_DESINCRONIZADO`, `ROL_SIN_PERMISO`, `DATO_INVALIDO`, `NO_ENCONTRADO`.

### 6.6 Quién lee el historial en la plataforma (puntos a re-apuntar)

`js/datos/cotizador.js` expone `historial()`, `cola()`, `porFolio()`, `sinDecidir()`, `conversion()`, `cuadernos()`, `cuadernoDeEntrada()`, `clientes()`, `notaDeCuaderno()`, `propuestaDe()`, `estadoOrigen()`, `drenarBuzon()`, `armarRespaldoCotizador()`. Consumidores: `mod/proyectos.js`, `mod/inicio.js`, `mod/fabricacion.js`, `mod/tablero.js`, `mod/control.js`, `mod/mapa.js`, `datos/ventas.js`, `datos/reglas.js` (regla A6: autorizada hace >7 d sin decidir, cruza `ts` contra ausencia de proyecto), `nucleo/asistente.js`, `app.js`. TODOS síncronos. Este módulo promete NO escribir ninguna clave del cotizador (datos/cotizador.js:1-19).

---------------------------------------------------------------------------------------------------

## 7. Otras claves con datos de negocio (resumen de formas)

Ver tabla 1.1. Formas exactas:
- `al3d_hitos`: `{"COT-0042-B":{"pdf":1791570000000,"wa":1791570600000,"venta":1791641000000}}` — llaves por folio CORTO; la primera vez manda (entrega.js:387-390).
- `al3d_canva`: `{"COT-0042-B":{"primera":1791560000000,"ultima":1791570000000,"veces":2}}`.
- `al3d_cuadernos`: `{"tel:3312345678":"paga a 15 días, llamar a Juan","nom:farmacia san juan":"…"}` (datos/cotizador.js:350-353 también acepta `{texto}`).
- `al3d_folio`: `"42"`.
- `al3d_pf_ganadas`: ver 6.3.
- `al3d_aifile`: igual a `entry.aiFile` (puede traer `deEscalador:true`).
- Los hitos y `al3d_canva` se indexan por folio CORTO: al unir varios aparatos hay colisiones; la clave correcta es `(folio, disp)`.

---------------------------------------------------------------------------------------------------

## 8. Exportación: qué existe y qué falta (fase 2)

### 8.1 Lo que ya existe

| Función | Dónde | Produce | Incluye |
|---|---|---|---|
| `respaldar()` del cotizador (botón «Respaldar» del pie del Historial, cotizador.html:638; también en los avisos de «no hubo espacio» y al autorizar con respaldo vencido). El botón «CSV» es `exportarHistorialCSV()` (cotizador.html:640) | historial.js:1648 → `armarRespaldo` 1608-1612 → `descargarArchivo` | `cotizador-al3d-respaldo-<AAAA-MM-DD-HHMM>.json` = `{"app":"cotizador-al3d","formato":1,"fecha":"<ISO>","datos":{"<clave>":"<cadena tal cual de localStorage>",…}}`. Los valores son CADENAS (el historial va como cadena JSON dentro del JSON) | las 16 `RESPALDO_KEYS` presentes. El historial con `aiFile.url` |
| `respaldar()` de la plataforma (Ajustes → «Respaldar») | js/app.js:1535-1550 | `al3d-respaldo-completo-<sello>.json` = `{"app":"al3d-completo","formato":1,"fecha":"<ISO>","plataforma":{"app":"plataforma-al3d","formato":1,"fecha":…,"datos":{<almacén>:[filas]}},"cotizador":{…el mismo objeto de arriba…}}` | historial + todo lo de la plataforma salvo `pendientes` y `ventas_hoja` (`NO_RESPALDA`, db.js:38); los blobs como `dataUrl` |
| `Cot.armarRespaldoCotizador()` | datos/cotizador.js:433-439 | lo mismo que el objeto `cotizador` | — |
| `DB.exportar()` | js/datos/db.js:392 | SOLO la IndexedDB `al3d_pf` de la plataforma (`app:'plataforma-al3d'`). **No toca el cotizador** | `proyectos` (con `origen` = copia de la entrada sin imagen), etc. |
| `exportarHistorialCSV()` | historial.js:1908 | CSV con BOM: `Folio, Fecha de autorización, Cliente, Teléfono, Proyecto, Dirección, Autorizador, Partidas, Subtotal, IVA, Total calculado, Precio autorizado, Ajuste, Detalle, Dispositivo` | **con pérdida**: sin partidas estructuradas, sin sello, sin imágenes |
| `cuaCSV` / `exportarClientesCSV` | historial.js:1436, 1451 | CSV por cliente / cartera | con pérdida |
Restaurar: `restaurarDesde` (historial.js:1842) es TODO-O-NADA y SUSTITUYE (no fusiona): borra las 16 claves y escribe las del archivo, con copia previa descargada y reversión si algo no cabe (1778-1841). Un respaldo viejo pisa lo nuevo.

### 8.2 Lo que falta para una importación completa

1. **Planos, renders y propuesta visual** (IndexedDB `al3d_cot_imgs`): ninguna función los exporta. Hay que escribir un lector nuevo (o subirlas desde el propio aparato). Sin ellas, `items[].plano`, `renders[]`, `propuesta[]` quedan apuntando a ids inexistentes.
2. **Identidad del aparato** (`al3d_pf_disp`, `al3d_pf_letra_folio`): no va en el respaldo. Salir a pedirla (Ajustes la muestra) o inferirla de `entry.disp` / `entry.sello.folio` / `proyectos[].dispositivo` del respaldo completo.
3. **Registro firmable del sello**: solo está en la hoja «Autorizaciones» (no en el teléfono).
4. Entradas que existan solo en un teléfono viejo: el respaldo es manual y no hay recordatorio periódico (el banner de Ajustes se quitó, js/app.js:1524-1526); solo avisa al autorizar si está vencido (`respaldoEstado`, historial.js:1627-1640: vencido si `total>0` y (nunca respaldado con ≥3 cotizaciones, o ≥10 sin respaldar, o ≥30 días)).
5. Alternativa que cubre todo: código de «subida única» DENTRO de la app (cotizador/plataforma ya comparten origen y pueden leer `localStorage` e IndexedDB `al3d_cot_imgs` directamente) en vez de pedir archivos. NO está escrita.

---------------------------------------------------------------------------------------------------

## 9. Tamaños y riesgos de pérdida

### 9.1 Tamaños (ESTIMACIONES; el código no mide y no hay datos reales en el repo → NO CONFIRMADO)

- `al3d_q` serializado: 0.8 KB con 1 partida, 8.7 KB con 30 (medición sintética, docs/REVISION-UIUX-2026-10-PARCIAL.md:2230) → ≈0.27 KB por partida.
- Entrada del historial SIN imagen: lo anterior + `_lt` por partida + `sello.renglones` (~0.1-0.15 KB/partida) + `huellaAuth` (~65 B/partida) → del orden de 1.5-3 KB con 2-5 partidas.
- Entrada CON `aiFile.url`: domina todo. Imagen IA ≤1600 px JPEG 0.85 → del orden de 150-600 KB en base64 (estimación); un PDF no se re-escala y `guardarEnHistorial` no pone tope. Una entrada con foto pesa ~100× una sin ella.
- Cuota de localStorage: ≈5 MB por origen (≈5 M de caracteres) en navegadores comunes — dato general, no está en el código. Con fotos de ~300 KB caben del orden de 15 cotizaciones con foto antes de que `saveHistorial` empiece a soltar imágenes viejas; sin fotos caben miles. El origen se COMPARTE con `al3d_q`, `al3d_aifile` (≤2 MB), `al3d_logo` (≤300 KB), `al3d_pf_restaurar` (hasta un respaldo entero) y todas las `al3d_pf_*`.
- Tablero de pruebas: hay pruebas con historiales sintéticos de 25 a 400 entradas (REVISION-UIUX…:2360, 2372); no hay un conteo real de producción en el repo.

### 9.2 Limpiezas automáticas (todas las que existen)

1. `saveHistorial`: quita `aiFile.url` de la más antigua a la más reciente hasta que quepa (historial.js:37-49). La cotización que se guarda es la última en perder su imagen. Avisa con toast («Faltó espacio: se quitó la imagen de N cotizaciones viejas»).
2. `saveQueue`: `q:null` en todo renglón no pendiente (historial.js:1941).
3. `imgLimpiar`: imágenes de IndexedDB no referenciadas por `Q` ni por el historial y de más de 7 días (imagenes.js:75-84). Borrar una cotización del historial condena sus planos 7 días después.
4. Claves viejas: `al3d_fold_proy` (arranque.js:70), `/^(al3d_kxs?_|ai_key|ai_model|ai_provider)/` (ia.js:140-145).
5. NO hay purga por edad ni por cantidad del historial ni de la cola.

### 9.3 Riesgos de pérdida (orden de gravedad)

1. **Todo es por aparato y en el navegador**: «Borrar datos del sitio», cambio de teléfono, o iOS limpiando sitios sin abrir en semanas (el propio código lo dice, historial.js:1614-1616) se llevan historial, folios y cola. Una PWA instalada en iOS está exenta de la limpieza por inactividad — NO CONFIRMADO en el código; es comportamiento de Safari.
2. **Planos/renders (IndexedDB) no están en ningún respaldo** (sección 8.2).
3. **Cuota llena**: la imagen de referencia de cotizaciones viejas se pierde (irreversible, solo avisa); si ni así cabe, la autorización queda solo en la hoja y en la cola (`autorizada`+`q:null`), sin cotización completa en ningún sitio.
4. **`saveQueue` y `saveState` tragan errores de cuota**: `saveQueue` con `catch` vacío (historial.js:1942); `saveState` avisa una vez (2025-2036).
5. **Restaurar sustituye, no fusiona** (`ejecutarRestauracion`, historial.js:1823-1826): un respaldo viejo borra las cotizaciones nuevas del aparato.
6. **Borrado duro** (`borrarDeHistorial`, 397-409): sin tumba; el «Deshacer» dura 8 s y vive en memoria (`_histBorrada`).
7. **Dos pestañas, última escritura gana** (arranque.js:185-193: solo avisa).
8. **Reemplazo completo de la entrada** en cada guardado (historial.js:163): sin historial de versiones; una edición posterior a la venta cambia la entrada pero el proyecto conserva su copia congelada (por eso existe `estadoOrigen`).
9. **Folios repetidos entre aparatos** y reinicio del contador si un aparato pierde sus datos: el contador `al3d_folio` vuelve a 0 y, si `al3d_pf_letra_folio` coincide, el mismo número de folio se emite otra vez. El `disp` nuevo (aleatorio) los distingue en la hoja.
10. Revocaciones de la hoja no llegan al teléfono (sección 4.3).

---------------------------------------------------------------------------------------------------

## 10. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **Plan §6 / §5-Fase 2**: «exportación de la base de cada teléfono (`js/datos/db.js` ya tiene exportación)». `DB.exportar()` (db.js:392) cubre solo la IndexedDB de la plataforma `al3d_pf`; NO exporta el historial del cotizador (localStorage) ni las imágenes de `al3d_cot_imgs`. El historial se exporta con `respaldar()`/`armarRespaldoCotizador()` (y el archivo completo es `js/app.js:1535`).
2. **Plan §3.1 / §4.7**: `al3d_queue` → `cotizaciones` con estado `pendiente`, y columna `revocada`. En el código la cola mezcla `pendiente` (con `q`) con renglones fantasma `autorizada`+`q:null` que solo reservan número de folio; y no existe `revocada` en ningún dato del cliente (solo en la hoja, columna `Estado` de «Autorizaciones»).
3. **Plan §3.1** omite del inventario: `al3d_q` (borrador en curso, único renglón), `al3d_folio` (contador), `al3d_hitos`, `al3d_canva`, `al3d_cuadernos`, `al3d_pf_ganadas`, `al3d_logo`, `al3d_aifile`, preferencias, y **la IndexedDB `al3d_cot_imgs`** (planos/renders). Plan §3.1 dice «`blobs` (imágenes de referencia) → Storage» refiriéndose a la plataforma; las imágenes de las cotizaciones son otra cosa.
4. **Plan §5-Fase 2**: «se unen por `Folio cotizacion`». La llave de unión de dos teléfonos es el folio GLOBAL (`folio@disp`); el folio corto se repite entre aparatos (entrega.js:283-296), el historial se indexa solo por `folio`, y las entradas antiguas no traen `disp`.
5. **Plan §4.7** modela `cotizaciones(id, empresa_id, folio, datos, estado, sello, renglones, revocada)`. Faltan, según el código: `disp` (aparato), `ts`, `reenviada`, hitos (`pdf`/`wa`/`venta`/`propuesta`), `huella`, imágenes (4 tipos) y `cliente_id` derivado por la regla de cuadernos. `sello` local ≠ registro firmable de la hoja (ver hallazgo en 0.9).
6. **Plan §3.3** «el cotizador… solo cambia dónde guarda»: el acceso a datos es síncrono en unos 33 sitios (22 de `getHistorial()` + 14 de `getQueue()` menos las dos definiciones) y `cotizador.html:10` tiene `connect-src 'self' data: blob: https://script.google.com https://script.googleusercontent.com` (sin Supabase). La vía ya existente es el puente `window.AL3D` (mod/cotizador.js:350-378) hacia el padre.
7. **docs/ARQUITECTURA.md:147** (no es el plan, pero el plan hereda la idea): dice que `ts` «se sobrescribe» al reescribir; el código actual lo conserva mientras `fechaAuth` y `autorizador` no cambien (historial.js:150-156).

---------------------------------------------------------------------------------------------------

## 11. Implicaciones de diseño derivadas del código (propuestas, no hechos)

Propuesta de llave y columnas para `cotizaciones` (nombres PROPUESTOS):
- Unicidad: `(empresa_id, folio, disp)`. `disp` NOT NULL (se completa por `sello.folio` o por entrada manual).
- Guardar `datos` jsonb = la entrada completa SIN `aiFile.url` ni data URLs; las imágenes a Storage con referencia (`aiFile`, `items[].plano`, `renders`, `propuesta`).
- `estado` ∈ {`borrador`,`pendiente`,`autorizada`,`rechazada`} + `autorizacion_suelta` (derivable: `huellaAuth=''`) + `vigencia` calculada; `revocada`/`superada` importadas de la hoja «Autorizaciones».`Estado`.
- Importes: `neto`/`sub` guardarlos redondeados a 2 decimales (el origen tiene ruido de flotante) y calcular `total_cobrado` = regla de `totalFinalHist`; el subtotal de la VENTA (`desgloseFinal`) va en `ventas_dinero`, no en la cotización.
- Sello: `codigo`, `folio_global`, `ts` (texto ISO tal cual), `huella`, `subCalc`, `precioAuth`, `itemsAuth` canónico, `total`, `proyecto`, `correo`, `renglones` (texto JSON tal cual), `firma`, `estado` — copiados de la hoja «Autorizaciones», no del teléfono. Cualquier normalización rompe el HMAC (hoja-apps-script.gs:3635-3646).
- Orden `historial`: más reciente primero por `ts`; la cola por inserción.
- Clientes: reproducir EXACTAMENTE `cuadernos()` (5.3) o aceptar que los grupos cambien; las notas (`al3d_cuadernos`) van por clave de grupo, con claves `tel:`/`nom:`.
- Folio: decidir si el contador sigue siendo local por aparato (el cotizador lo usa de forma síncrona y sin red, historial.js:2585-2592) o pasa a servidor; los folios ya impresos (`COT-NNNN` y `COT-NNNN-L`) deben seguir siendo válidos.
- Nombres cruzados que NO deben confundirse: `entrega` (cotizador: texto del compromiso) ≠ `entrega` (plataforma/hoja `Entrega`, modo de salida); `proy`=negocio, `cliente`=persona; hoja Ventas `Proyecto` = «cliente - proy».

---------------------------------------------------------------------------------------------------

## 12. NO CONFIRMADO / preguntas abiertas

- Volumen real: cuántas entradas y cuántos MB tiene el `al3d_historial` de cada aparato, cuántos aparatos hay, y cuántos tienen entradas sin `disp` o sin `sello`. No hay datos de producción en el repo.
- Cuota real de localStorage en los navegadores de uso (se asumen ≈5 MB).
- Si las PWAs instaladas en iOS están exentas de la limpieza por inactividad (comportamiento del navegador).
- De qué aparato son las entradas sin `disp` y sin `sello` (no hay forma de saberlo desde el archivo).
- Si alguna cotización existe solo en un teléfono ya sin uso (riesgo declarado en el plan §10).
- Dónde se generará el folio después de migrar (hoy `nextFolio()` es síncrono y local).
- Si «revocada» debe reflejarse hacia el cliente (hoy no existe ninguna lectura de `revocada` en `js/`).
- (Resuelto) `shortDescAuth(it)` (partidas.js:1875-1882) devuelve `it.desc` si existe; si no, `Letras 3D · N letras, Hcm` / `Recorte acrílico · N pzas, Hcm` / `Bastidor · AxBcm` / `Caja de luz · AxBcm` / `Manual · N pza`. Esa cadena (cortada a 120) es la `descripcion` de cada renglón del sello; distinta de `histDsc` (historial.js:425) que usa el historial.
