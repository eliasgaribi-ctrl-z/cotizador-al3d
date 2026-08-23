# Especificación del modelo de datos — `cotizador-al3d`

Archivo único: `/home/user/cotizador-al3d/index.html` (10 075 líneas; `<script>` en 2723–9996). Vanilla JS, sin build, sin backend. Todo el estado vive en `localStorage` del navegador. **No se modificó ningún archivo.**

Convención en este documento: `L####` = número de línea en `index.html`.

---

## 1. Claves de `localStorage` — inventario completo

19 claves (+ 4 legacy de solo-lectura). No se usa `sessionStorage` ni IndexedDB (grep vacío).

### 1.1 `al3d_historial`
- **Tipo:** `string` con JSON de `Array<EntradaHistorial>` (ver §3).
- **Orden:** más reciente primero (`arr.unshift(entry)`); si el folio ya existe se **reemplaza en su posición** (`arr[idx]=entry`).
- **Clave primaria de hecho:** `folio` (no hay `id`).
- **Escriben:** `saveHistorial(arr)` L6602, llamada desde `guardarEnHistorial()` L6608 (al autorizar, L4952), `borrarDeHistorial()` L6677, `setShowInPdf()` L3585 (solo si `estado==='autorizada'`), `guardarCambiosEdicion()` L3604.
- **Leen:** `getHistorial()` L6601 → `pintarHistorial()`, `clientesConocidos()` L3168, `foliosOcupados()` L7176, `exportarHistorialCSV()`, `armarRespaldo()`.
- **Degradación por falta de espacio** (L6602–6624): si `setItem` truena, `saveHistorial` va soltando `aiFile.url` **de la más antigua a la más reciente** (`copia[i].aiFile={name,type,url:''}`) hasta que quepa. Devuelve `false` si nada quedó escrito. Consecuencia para otros módulos: **`aiFile.url==='' ` con `name`/`type` presentes significa "la imagen existió y se descartó"**, no "no había imagen".

### 1.2 `al3d_queue`
- **Tipo:** `string` con JSON de `Array<EntradaCola>`.
- **Shape** (`pushToQueue` L7010):
```js
{
  folio:      string,   // 'COT-0007'
  proy:       string,
  cliente:    string,
  neto:       number,   // totals().neto al momento de solicitar
  fecha_sol:  string,   // = Q.fecha, texto es-MX '22 ago 2026'
  estado:     'pendiente'|'autorizada'|'rechazada',
  precioAuth: number,   // 0 al crear
  autorizador:string,   // '' al crear
  nota:       string,   // '' al crear
  fechaAuth:  string,   // '' al crear
  q:          Q_snapshot|null   // JSON.parse(JSON.stringify({...Q,aiFile:null}))
}
```
- `updateQueueEntry(folio,changes)` L7020 hace `Object.assign` de campos arbitrarios: al autorizar añade también `itemsAuth` y `huellaAuth` (L4949); `updItemAuth` reescribe además `q` completo (L4254).
- **`saveQueue` poda** (L7005): `arr.map(e=>e.estado==='pendiente'?e:{...e,q:null})` — todo lo que ya cerró ciclo pierde su snapshot. El renglón se conserva **solo para `foliosOcupados()`**.
- `rechazar()` y `autorizarConfirmado()` llaman `removeFromQueue(folio)` inmediatamente después. Por eso en la práctica la cola contiene solo pendientes; una entrada `autorizada` sobrevive **únicamente si el historial no cupo**.
- **Escriben:** `saveQueue` L7005 ← `pushToQueue`, `updateQueueEntry`, `removeFromQueue`. **Leen:** `getQueue()` L6998 ← `renderAuth` (lista de pendientes), `loadQueueEntry`, `foliosOcupados`.

### 1.3 `al3d_q` — la cotización en curso
- **Tipo:** `string` con JSON del objeto `Q` menos `editMode`, con `aiFile` forzado a `null`.
```js
function saveState(){
  try{
    const {editMode,...rest}=Q;
    const toSave={...rest,aiFile:null};
    localStorage.setItem('al3d_q',JSON.stringify(toSave));
    _saveOk=true;
  }catch(_){ /* toast una sola vez con botón Respaldar */ }
  sincronizarAiFile();
}
```
- **Escribe:** `saveState()` L7069 — se llama en **cada tecla** (`upd`, `typeItem`, `updDirRaw`, listener de `#f-anti`) y en cada transición.
- **Lee:** `loadState()` L7134 (solo en `init()`).
- **Validación en carga** (L7139): rechaza si `!saved || typeof saved!=='object' || !Array.isArray(saved.items)`.

### 1.4 `al3d_folio`
- **Tipo:** `string` con un entero decimal (`'7'`). Es el **contador de cotizaciones confirmadas**, no el folio actual.
- **Escribe:** `confirmarFolio(folio)` L7189, únicamente desde `autorizarConfirmado()` L4948, y solo si `n>folioConfirmados()` (monótono creciente).
- **Lee:** `folioConfirmados()` L7170 → `nextFolio()`.

### 1.5 `al3d_logo`
- **Tipo:** `string` = data URL (`data:image/png;base64,...` o JPEG si el PNG excede `LOGO_MAX_BYTES`).
- **Escribe:** listener de `#logoin` L5219 (tras `reducirLogo`). **Leen:** `loadLogo()` L5225 y la generación del PDF L6301. Fallback: constante `AL3D_LOGO` (data URL embebido, L5172).

### 1.6 `al3d_fold_proy`
- **Tipo:** `'1'` | `'0'`.
- **Escriben:** `toggleFoldProy()` L5117, `irACampoProy()` L3890 (fuerza `'0'`).
- **Lee: NADIE.** `init()` L8658 hace `_foldProy=false` a propósito ("la preferencia ya no se lee"). Clave **muerta en lectura pero viva en escritura y en el respaldo**.

### 1.7 `al3d_aifile` — constante `AI_FILE_KEY` (L3155)
- **Tipo:** `string` con JSON de `{name:string, type:string, url:string}`; `url` es data URL (`data:<mime>;base64,...`).
- **Vive fuera de `al3d_q` a propósito** (comentario L7086): son megabytes; si no cabe se pierde solo la imagen, no la cotización.
- **Escribe:** `sincronizarAiFile()` L7099, llamada al final de cada `saveState()`. Guarda **solo cuando `Q.aiFile.url` cambió** (`_aiFileGuardada`), y recuerda la url que no cupo (`_aiFileFallo`) para no reintentar en cada tecla. Límite `AI_FILE_MAX = 2_000_000` (L3156) medido primero sobre `url.length`, luego sobre el JSON completo.
- **Lee:** `cargarAiFile()` L7115, solo desde `loadState()`.
- **Origen del valor:** L5820 `Q.aiFile={name:f.name,type:mime,url:'data:'+mime+';base64,'+b64}`.

### 1.8–1.11 Preferencias del dispositivo (L3150–3151)
```js
const PREF_AUTORIZADOR='al3d_autorizador', PREF_MATERIAL='al3d_ult_material',
      PREF_RV_PCT='al3d_rv_pct', PREF_RV_CUENTA='al3d_rv_cuenta';
```
| Clave | Tipo | Valores | Escribe | Lee |
|---|---|---|---|---|
| `al3d_autorizador` | string | nombre libre | `autorizarConfirmado` L4936, `rechazar` L4966 | `renderAuth` L4481, `autorizar/rechazar`, `vendedorPdf` L6384 |
| `al3d_ult_material` | string | key de `MATERIALES` | `setItem(...,'material',v)` L3535 | `addItem({heredar:true})` L3443 |
| `al3d_rv_pct` | string numérico | default `'10'` | `copiarFilaVenta` L8780 | `abrirRegistrarVenta` L8743 |
| `al3d_rv_cuenta` | string | `'Elias BBVA'`\|`'Moni MPago'`\|`'Constru BNT'`\|`'Otra'` (L10031-34) | `copiarFilaVenta` L8780 | `abrirRegistrarVenta` L8745 |

Acceso siempre vía `prefGet(k,def='')` / `prefSet(k,v)` (L3159-3160), con `try/catch` y `String(v)`.

### 1.12–1.19 Claves de IA (**NO van en el respaldo, a propósito** — L6849)
```js
const AI_PROVS=['gemini','groq','openrouter'];   // L5322
const AI_MAX_KEYS=8;                             // L5333
const AI_NOMBRE={gemini:'Gemini',groq:'Groq',openrouter:'OpenRouter'};                  // L5550
const AI_DEFAULTS={gemini:'gemini-2.5-flash',
                   groq:'meta-llama/llama-4-scout-17b-16e-instruct',
                   openrouter:'meta-llama/llama-4-scout:free'};                          // L5551
const _KSALT='al3d·key·v1';
function _kxor(s){ let o=''; for(let i=0;i<s.length;i++) o+=String.fromCharCode(s.charCodeAt(i)^_KSALT.charCodeAt(i%_KSALT.length)); return o; }
function keyPack(k){ try{ return btoa(_kxor(String(k))); }catch(_){ return ''; } }
function keyUnpack(v){ try{ return _kxor(atob(String(v))); }catch(_){ return ''; } }
```

| Clave literal | Tipo | Shape | Escribe | Lee |
|---|---|---|---|---|
| `al3d_kxs_gemini`, `al3d_kxs_groq`, `al3d_kxs_openrouter` | string | `keyPack(JSON.stringify(string[]))` — array de hasta 8 keys, ofuscado XOR+base64 | `setKeys(p,arr)` L5351 | `getKeys(p)` L5336 |
| `al3d_kx_<prov>` | string | **legacy**: una key ofuscada | — (solo `removeItem` L5353) | migración en `getKeys` L5340 |
| `ai_key_<prov>` | string | **legacy**: una key en texto plano | — (`removeItem` L5354) | migración L5341 |
| `ai_key` | string | **legacy**: key de Gemini en texto plano | — (`removeItem` L5355) | migración L5342 (solo si `p==='gemini'`) |
| `ai_provider` | string | `'gemini'\|'groq'\|'openrouter'` | `setAiProv` L5423, `aiAnalyze` L5778 | `aiOpen` L5480 |
| `ai_model_gemini` / `ai_model_groq` / `ai_model_openrouter` | string | id de modelo | `aiAnalyze` L5778 | `aiOpen` L5477-79, `aiCadena` L5743 |
| `ai_model` | string | **legacy** fallback del modelo de Gemini | — | `aiOpen` L5477 |
| `ai_key_rot_<prov>` | string | entero: índice de rotación de keys | `aiAvanzarTurno` L5719 | `aiKeysRotadas` L5714 |

`getKeys` migra en cuanto lee: convierte la key única en lista de una y **borra** las 3 claves legacy.

---

## 2. El objeto `Q` completo (L2768–2787, verbatim)

```js
const Q = {
  proy:'', cliente:'', tel:'', direccion:'', fecha:'', maps:'', folio:'', entrecalles:'', entrega:'', dirRaw:'',
  notaCliente:'',
  items:[], iva:true,
  estado:'borrador', rol:'vendedor',
  autorizador:'', nota:'', fechaAuth:'',
  anti:0, antiManual:false,
  precioAuth:0,
  itemsAuth:{},
  /* Huella del trabajo sobre el que se autorizó el precio. Ver authVigente(). */
  huellaAuth:'',
  aiFile:null,
  sinEstrenar:true,
  editMode:false
};
let pid=0, dragId=null;
```

| Campo | Tipo | Significado | ¿Sobrevive recarga? |
|---|---|---|---|
| `proy` | string | Nombre del proyecto. **Obligatorio** | Sí |
| `cliente` | string | Nombre del cliente. **Obligatorio** | Sí |
| `tel` | string | Teléfono tal cual se teclea. **Obligatorio**, válido con ≥10 dígitos (`telIncompleto` L4612) | Sí |
| `direccion` | string | Dirección **detectada por la IA** (`p.direccion`, L5899). Solo respaldo | Sí |
| `dirRaw` | string | Dirección **como la compartió el cliente** (textarea libre, multilínea). Es la que manda en el PDF | Sí |
| `maps` | string | URL de Google Maps pegada. Validada solo con `/^https?:\/\//i` (L5136) | Sí |
| `entrecalles` | string | Texto libre ("entre Av. Vallarta y López Mateos") | Sí |
| `entrega` | string | "Límite de fabricación", **texto libre** ("Viernes 15 de Agosto"). Nunca se parsea | Sí |
| `notaCliente` | string | Nota impresa en el PDF. Default vía `notaCliente()` L3333 | Sí |
| `fecha` | string | Fecha de la cotización. `hoy()` = `toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})` → `'22 ago 2026'` | Sí |
| `folio` | string | `'COT-0007'` | Sí |
| `items` | `Partida[]` | Ver §4 | Sí |
| `iva` | boolean | Si aplica 16% | Sí |
| `estado` | `'borrador'\|'pendiente'\|'autorizada'\|'rechazada'` | Ver §6 | Sí |
| `rol` | `'vendedor'\|'autorizador'` | Rol de **quien usa el teléfono**, no de la cotización. `loadQueueEntry` lo **preserva** al pisar Q (L7046) | Sí (y `init` L8667 repinta el segmento) |
| `autorizador` | string | Nombre de quien autorizó/rechazó. Se escribe **en cada tecla** (`oninput="Q.autorizador=this.value"` L4481) | Sí |
| `nota` | string | Nota **interna** del autorizador. **No** va al PDF | Sí |
| `fechaAuth` | string | Fecha de autorización, `toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})` | Sí |
| `anti` | number | Anticipo en MXN. Si `!antiManual` se recalcula a `Math.round(precioFinal()*0.5)` en cada `renderSummary` | Sí |
| `antiManual` | boolean | `true` en cuanto el input `#f-anti` tiene texto (L5169) | Sí |
| `precioAuth` | number | Precio final fijado por el autorizador. `0` = "sin ajuste global" | Sí |
| `itemsAuth` | `{[itemId:number]: number}` | Precio por partida puesto a mano por el autorizador. Llaves = `it.id` (numéricas, se serializan como strings en JSON) | Sí |
| `huellaAuth` | string | Huella del trabajo autorizado (§6) | Sí |
| `aiFile` | `{name,type,url}\|null` | Imagen/PDF analizado | **Se excluye de `al3d_q`** (`aiFile:null`) y vuelve de `al3d_aifile` si cupo (≤2 MB) |
| `sinEstrenar` | boolean | "Esta cotización nunca tuvo partida". En Q y no en variable suelta **precisamente para sobrevivir la recarga** | Sí; además `loadState` lo deduce: `if(Q.items.length) Q.sinEstrenar=false` |
| `editMode` | boolean | Modo edición de una cotización bloqueada | **NO** (destructurado fuera en `saveState`; `loadState` lo fuerza a `false`) |

**Lo que NO se persiste (memoria pura, se pierde en recarga):** `pid` (recomputado: `pid=Q.items.reduce((m,it)=>Math.max(m,it.id||0),0)`), `dragId`, `_plegadas` (Set de ids plegados), `_selfAuth`, `_paDraft` (precio que el autorizador lleva teclado), `aiMerge`, `aiSrc`, `SC` (todo el escalador, incl. `SC.items` = medidas), `_histData`, `_borrada`, `_vaciada`, `_marcarOblig`, `_pantalla` (recomputado por `pantallaSegunDatos()`), `_foldProy` (forzado `false`), `_saveOk`, `_aiFileGuardada`/`_aiFileFallo`.

**Sellado defensivo en carga** (L7152): `if(!Q.huellaAuth && (Q.precioAuth>0 || Object.keys(Q.itemsAuth||{}).length>0)) sellarAuth();` — una cotización guardada por una versión anterior recupera su huella.

---

## 3. Entrada del historial — `guardarEnHistorial()` (L6608–6650, verbatim)

```js
function guardarEnHistorial(){
  const t=totals();
  const entry={
    folio:Q.folio, proy:Q.proy, cliente:Q.cliente, tel:Q.tel||'', dirRaw:Q.dirRaw||'',
    // Se guarda todo lo que hace falta para volver a abrirla y regenerar su PDF igual.
    direccion:Q.direccion||'', maps:Q.maps||'', entrecalles:Q.entrecalles||'',
    entrega:Q.entrega||'', notaCliente:Q.notaCliente||'', fecha:Q.fecha||'',
    fechaAuth:Q.fechaAuth, autorizador:Q.autorizador, nota:Q.nota,
    precioAuth:Q.precioAuth, neto:t.neto, sub:t.sub, iva:Q.iva,
    huellaAuth:Q.huellaAuth||'',
    anti:Q.anti||0, antiManual:!!Q.antiManual,
    items:Q.items.map(it=>Object.assign(JSON.parse(JSON.stringify(it)),{_lt:+lineTotal(it).toFixed(2)})),
    itemsAuth:JSON.parse(JSON.stringify(Q.itemsAuth||{})),
    aiFile:Q.aiFile?{name:Q.aiFile.name,type:Q.aiFile.type,url:Q.aiFile.url}:null,
    ts:Date.now()
  };
  const arr=getHistorial();
  const idx=arr.findIndex(x=>x.folio===Q.folio);
  if(idx>=0) arr[idx]=entry; else arr.unshift(entry);
  const ok=saveHistorial(arr);
  pintarClientes();
  return ok;
}
```

### Campo por campo

| Campo | Tipo | Notas para consumidores |
|---|---|---|
| `folio` | string | Clave primaria de hecho |
| `proy`, `cliente` | string | `cliente` alimenta `clientesConocidos()` |
| `tel` | string | Puede estar vacío en entradas viejas (antes no era obligatorio — comentario L6836) |
| `dirRaw` | string | Multilínea posible; el CSV la aplana con `.replace(/\s*\n\s*/g,' ')` |
| `direccion` | string | Dirección detectada por IA |
| `maps` | string | URL o `''` |
| `entrecalles`, `entrega`, `notaCliente` | string | Texto libre |
| `fecha` | string | `'22 ago 2026'` (locale es-MX, **no parseable sin mapa de meses**) |
| `fechaAuth` | string | Idem |
| `autorizador` | string | |
| `nota` | string | Interna |
| `precioAuth` | number | `0` = sin ajuste global |
| `neto` | number | `totals().neto` **calculado sin ajustes por partida** |
| `sub` | number | `totals().sub` |
| `iva` | boolean | Convención de lectura: `e.iva!==false` |
| `huellaAuth` | string | Puede ser `''` en entradas viejas |
| `anti` | number, `antiManual` | boolean |
| `items` | `Array<Partida & {_lt:number}>` | ver abajo |
| `itemsAuth` | `{[id]:number}` | ver abajo |
| `aiFile` | `{name,type,url}\|null` | `url:''` = imagen soltada por falta de espacio |
| `ts` | number | **El único timestamp real de todo el modelo** (`Date.now()`, ms epoch) |

**Cálculo del total mostrado** (`pintarHistorial` L6712 y `exportarHistorialCSV`):
```js
const ia=(e.itemsAuth&&e.itemsAuth[it.id]!==undefined)?e.itemsAuth[it.id]
         :(it._lt!==undefined?it._lt:lineTotal(it));
const pFin=(e.precioAuth>0&&Math.abs(e.precioAuth-e.neto)>0.01)?e.precioAuth:e.neto;
const ajuste=+(e.neto-pFin).toFixed(2);   // >0 ahorro, <0 aumento
```
Precedencia por renglón: **`itemsAuth[id]` → `_lt` → `lineTotal(it)` recalculado hoy.**

### ¿Por qué existen los dos, `_lt` y `itemsAuth`?

Son cosas distintas y ortogonales:

- **`_lt`** (por item, en el historial únicamente) = *el importe CALCULADO congelado*. El catálogo de precios (`MATERIALES`, `RECORTES`, …) vive en este mismo HTML y se edita a mano y se publica. Sin congelarlo, subir el aluminio de $30 a $35 **reescribía hacia atrás** lo que ya se le cotizó a un cliente y el historial mostraba renglones que no sumaban su propio "Total autorizado" (comentario L6640-6643).
- **`itemsAuth[id]`** (en `Q`, en la cola y en el historial) = *el importe NEGOCIADO*, puesto a mano por el autorizador partida por partida (`updItemAuth` L4223). Es una decisión humana, no un snapshot de catálogo.

Se combinan al reabrir (`reabrirDeHistorial` L6779-6786):
```js
(e.items||[]).forEach(it=>{
  const actual=Q.items.find(x=>x.id===it.id);
  if(!actual||it._lt===undefined) return;
  if(Math.abs(it._lt-lineTotal(actual))>0.01) Q.itemsAuth[it.id]=it._lt;
});
if(!Q.precioAuth&&e.neto>0&&Math.abs(e.neto-totals().neto)>0.01) Q.precioAuth=e.neto;
```
Es decir: si el catálogo cambió, `_lt` **se promueve a `itemsAuth`** para que el PDF reimpreso sea idéntico al que el cliente tiene en la mano. `usarComoBase()` (duplicar) hace lo contrario: `delete c._lt`, `Q.itemsAuth={}`, `Q.precioAuth=0`, `Q.huellaAuth=''` — precio con el catálogo de hoy.

---

## 4. Shape de una PARTIDA por tipo

### 4.1 Item base (`addItem` L3445-3446, verbatim)
```js
Q.items.push({id,tipo:'letras',material:mat,matAuto:!!mat,comp:'recta',luz:true,ilumTipo:'fria',altura:0,n:0,
  tarifa:0,ancho:0,alto:0, acab:'',recComp:false,bas:'', desc:'',descAi:false,pz:1,pu:0,textoAuto:'',showInPdf:true});
```
`id=++pid`. `mat = matOf(prefGet('al3d_ult_material'))?prefGet(...):''` cuando `opts.heredar`.

### 4.2 Item creado por la IA (L5905, verbatim) — **shape diferente**
```js
const it={id:++pid,tipo:'letras',material:'',comp:'',luz:true,altura:0,n:0,tarifa:0,ancho:0,alto:0,acab:'',recComp:false,bas:'',desc:'',descAi:false,pz:1,pu:0,showInPdf:true};
```
**Faltan `matAuto`, `textoAuto`, y `ilumTipo`** (este último se asigna solo si `tipo==='letras'`: `it.ilumTipo = aiNotes.match(/c[aá]lid/)?'calida':'fria'`). Un consumidor debe tratar todos los campos como opcionales: `it.ilumTipo||'fria'`, `it.showInPdf!==false`.

### 4.3 Campos por tipo, con unidades

| Campo | Tipo | Unidad | letras | recorte | bastidor | caja | manual |
|---|---|---|:-:|:-:|:-:|:-:|:-:|
| `id` | number | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| `tipo` | `'letras'\|'recorte'\|'bastidor'\|'caja'\|'manual'` | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| `desc` | string | — | ✔ | ✔ | ✔ | ✔ | ✔ (es el único texto) |
| `descAi` | boolean | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| `showInPdf` | boolean | — | ✔ | ✔ | ✔ | ✔ | ✔ (oculta se **cobra**, agrupada como "Conceptos adicionales") |
| `material` | key de `MATERIALES` | $/cm | ✔ | — | — | — | — |
| `matAuto` | boolean | — | ✔ (heredado, no elegido) | — | — | — | — |
| `comp` | key de `COMPLEJIDAD` | +$/cm | ✔ | — | — | — | — |
| `luz` | boolean | — | ✔ (`false` ⇒ ×0.8) | — | — | — | — |
| `ilumTipo` | `'fria'\|'calida'` | 6500K / 3000K | ✔ (**no afecta precio**) | — | — | — | — |
| `altura` | number | **cm** (step 0.5) | ✔ | ✔ | — | — | — |
| `n` | number entero | **piezas** (letras / piezas físicas) | ✔ | ✔ | — | — | — |
| `textoAuto` | string | — | ✔ (opcional; el texto tecleado en el autocontador) | ✔ | — | — | — |
| `acab` | key de `RECORTES` | $/cm | — | ✔ | — | — | — |
| `recComp` | boolean | +$5/cm, **solo si `acab==='sandwich'`** | — | ✔ | — | — | — |
| `bas` | key de `BASTIDORES` | $/m² | — | — | ✔ | — | — |
| `ancho`,`alto` | number | **cm** | — | — | ✔ | ✔ | — |
| `tarifa` | number | **$/m²** | — | — | — | ✔ (3900/4600 o libre) | — |
| `pz` | number entero ≥1 | piezas | — | — | — | — | ✔ |
| `pu` | number | $/pieza | — | — | — | — | ✔ |
| `_lt` | number | $ | solo en historial | idem | idem | idem | idem |

`setTipo(id,t)` L3556: al cambiar a `caja`, si `!it.tarifa` pone `3900`. Los campos de los otros tipos **no se limpian** — una partida arrastra basura de tipos anteriores (p. ej. `altura` en un `bastidor`). Solo los campos del `tipo` vigente se leen.

### 4.4 Cálculo — `lineTotal()` (L3203–3230, verbatim)

```js
const M2_MINIMO=1;
function m2Total(tarifa,m2){ return (tarifa||0)*Math.max(m2||0,M2_MINIMO); }
function m2EsMinimo(m2){ return (m2||0)>0 && (m2||0)<M2_MINIMO; }

function lineTotal(it){
  if(it.tipo==='letras'){
    let p=factorOf(it)*(it.altura||0)*(it.n||0);
    if(!it.luz) p*=0.8;
    return p;
  }
  if(it.tipo==='recorte'){
    let rate=recOf(it.acab)?.precio||0;
    if(it.acab==='sandwich' && it.recComp) rate+=RECORTE_COMP_EXTRA;
    return rate*(it.altura||0)*(it.n||0);
  }
  if(it.tipo==='bastidor'){
    const m2=(it.ancho||0)*(it.alto||0)/10000;
    if(m2<=0) return 0;
    // Misma regla que la caja de luz: se cobra mínimo 1 m².
    return m2Total(basOf(it.bas)?.tarifa||0,m2);
  }
  if(it.tipo==='caja'){
    const m2=(it.ancho||0)*(it.alto||0)/10000;
    if(m2<=0) return 0;
    return m2Total(it.tarifa||0,m2);
  }
  return (it.pz||0)*(it.pu||0); // manual
}
```

### 4.5 Funciones de catálogo (L2761–2765, verbatim)
```js
const matOf=k=>MATERIALES.find(m=>m.key===k);
const compOf=k=>COMPLEJIDAD.find(c=>c.key===k);
const recOf=k=>RECORTES.find(r=>r.key===k);
const basOf=k=>BASTIDORES.find(b=>b.key===k);
const factorOf=it=>((matOf(it.material)?.precio||0)+(compOf(it.comp)?.extra||0));
```
No hay `cajaOf`: la caja se identifica por **tarifa** (`CAJAS.find(x=>x.tarifa===it.tarifa)`, L3971), y si no coincide es "Tarifa personalizada".

### 4.6 Fórmulas legibles (`formulaFor` L4155, `formulaM2` L4143 — verbatim)
```js
function formulaM2(tarifa,it){
  const m2=((it.ancho||0)*(it.alto||0)/10000);
  if(m2EsMinimo(m2)) return `$${tarifa}/m² · mínimo 1 m² (área real ${m2.toFixed(3)} m²)`;
  return `$${tarifa}/m² × ${m2.toFixed(3)} m²`;
}
function formulaFor(it){
  const faltan=faltantesDe(it);
  if(faltan.length) return (faltan.length>1?'Faltan: ':'Falta: ')+faltan.join(', ');
  if(it.tipo==='letras'){
    const f=factorOf(it), base=matOf(it.material)?.precio||0, ex=compOf(it.comp)?.extra||0;
    const adj=(!it.luz)?' · −20% sin luz':'';
    return `$${f} ($${base}${ex?` + $${ex}`:''}) × ${it.altura||0}cm × ${it.n||0}${adj}`;
  }
  if(it.tipo==='recorte'){
    const p=recOf(it.acab)?.precio||0;
    const ex=(it.acab==='sandwich'&&it.recComp)?RECORTE_COMP_EXTRA:0;
    return `$${p+ex}/cm${ex?` ($${p} + $${ex})`:''} × ${it.altura||0}cm × ${it.n||0} pza`;
  }
  if(it.tipo==='bastidor') return formulaM2(basOf(it.bas)?.tarifa||0,it);
  if(it.tipo==='caja')     return formulaM2(it.tarifa||0,it);
  return `${it.pz||0} pza × ${money(it.pu)}`;
}
```

### 4.7 Precio efectivo de una partida (L3312–3319, verbatim)
```js
function itemPrecio(it){
  if(Q.estado!=='autorizada' || !authVigente()) return lineTotal(it);
  const v=Q.itemsAuth&&Q.itemsAuth[it.id];
  return v!==undefined?v:lineTotal(it);
}
function itemAjustada(it){ return Math.abs(itemPrecio(it)-lineTotal(it))>0.01; }
```

### 4.8 `itemVacio` — definición canónica de "partida sin capturar" (L5434)
```js
function itemVacio(it){
  const matPropio=!!it.material && !it.matAuto;
  return !(it.desc||'').trim() && !it.altura && !it.n && !it.ancho && !it.alto && !it.pu
      && !matPropio && !it.acab && !it.bas;
}
```

---

## 5. Catálogos completos, verbatim (L2728–2760)

```js
const MATERIALES = [
  {key:'al-paint', label:'Aluminio Blanco/Negro/Pintado', precio:30, ilum:'LED posterior (cálida/fría)'},
  {key:'al-brush', label:'Aluminio Brush Cepillado',       precio:35, ilum:'LED posterior (cálida/fría)'},
  {key:'acr-vol',  label:'Acrílico + Aluminio (Volumen)',  precio:40, ilum:'LED fría frontal'},
  {key:'acr-vinil',label:'Acrílico + Vinil',               precio:45, ilum:'LED fría frontal'},
  {key:'acero',    label:'Acero Inoxidable',               precio:55, ilum:'LED posterior (cálida/fría)'},
];
const COMPLEJIDAD = [
  {key:'recta',    label:'Recta',    extra:0},
  {key:'cursiva',  label:'Cursiva',  extra:5},
  {key:'compleja', label:'Compleja', extra:10},
];
const CAJAS = [
  {key:'std',  label:'Estándar', tarifa:3900, desc:'Cuadrada / rectangular / circular'},
  {key:'nube', label:'Tipo nube / silueta', tarifa:4600, desc:'Silueta de logotipo o personaje'},
];
/* Recorte de acrílico: precio por cm de altura × pieza (igual que letras) */
const RECORTES = [
  {key:'sencillo', label:'Sencillo', precio:20},
  {key:'vinil',    label:'Rotulación de vinil', precio:25},
  {key:'sandwich', label:'Tipo sándwich c/iluminación', precio:55},
];
const RECORTE_COMP_EXTRA = 5; // complejidad opcional, solo para tipo sándwich
/* Bastidores: precio por metro cuadrado */
const BASTIDORES = [
  {key:'lamina',    label:'Lámina',    tarifa:950},
  {key:'alucobond', label:'Alucobond', tarifa:1500},
];
const TIPO_NOMBRE={letras:'Letras 3D',recorte:'Recorte acrílico',bastidor:'Bastidor',caja:'Caja de luz',manual:'Manual'};
const TIPO_CORTO ={letras:'Letras',   recorte:'Recorte',         bastidor:'Bastidor',caja:'Caja',       manual:'Manual'};
```

**Unidades:** `MATERIALES.precio` y `COMPLEJIDAD.extra` son **$ MXN por cm de altura por pieza**. `RECORTES.precio` y `RECORTE_COMP_EXTRA`, **$ MXN por cm de altura por pieza**. `BASTIDORES.tarifa` y `CAJAS.tarifa`, **$ MXN por m²**, con mínimo 1 m².

### Catálogos secundarios (etiquetas de presentación — no son el catálogo de precios)
```js
// L6674-6676 (historial y CSV)
const HIST_MAT={'al-paint':'Aluminio Pintado','al-brush':'Aluminio Brush','acr-vol':'Acrílico + Aluminio','acr-vinil':'Acrílico + Vinil','acero':'Acero Inoxidable'};
const HIST_ACAB={'sencillo':'Sencillo','vinil':'Rotulación Vinil','sandwich':'Sándwich c/luz'};
const HIST_BAS={'lamina':'Lámina','alucobond':'Alucobond'};
// L6026-6028 (Canva) — nótese 'Lámina Galvanizada'
const MAT={'al-paint':'Aluminio Blanco/Negro/Pintado',...};
const BAS={'lamina':'Lámina Galvanizada','alucobond':'Alucobond'};
```
`histDsc(it)` (L6677) es el generador canónico de descripción textual de una partida del historial:
```js
function histDsc(it){
  if(it.desc) return it.desc;
  if(it.tipo==='letras')    return (HIST_MAT[it.material]||'Letras 3D')+' · '+(it.n||0)+' letras, '+(it.altura||0)+'cm';
  if(it.tipo==='recorte')   return 'Recorte '+(HIST_ACAB[it.acab]||'')+' · '+(it.n||0)+' pzas';
  if(it.tipo==='bastidor')  return 'Bastidor '+(HIST_BAS[it.bas]||'')+' '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  if(it.tipo==='caja')      return 'Caja de luz '+(it.ancho||0)+'×'+(it.alto||0)+'cm';
  return 'Partida manual';
}
```
También existe `EMPRESA` (L5957):
```js
const EMPRESA = { vendedor:'Elias Guerrero', taller:'Naranjos #648 Col. Lindavista Cp. 45169',
                  whatsapp:'33-2813-0092', oficina:'Naranjos #648 Col. Lindavista Cp. 45169' };
```

---

## 6. Ciclo de vida de una cotización

### 6.1 Estados y transiciones

```
                 ┌──────────────── reabrir() L4917 ────────────────┐
                 │                                                 │
             borrador ──solicitarConfirmado() L4870──> pendiente ──┴──> autorizada
                 │                                        │
                 │  autorizarYoMismo() L4902 (pasa        └──rechazar() L4962──> rechazada
                 │  igualmente por 'pendiente')
                 └──aplicarIA (L5934) fuerza 'borrador'
```

| Transición | Función | Quién | Qué se escribe / congela |
|---|---|---|---|
| — → `borrador` | `nueva()` L5003, `usarComoBase()` L6828, `aplicarIA` L5934 | vendedor | limpia `precioAuth=0, itemsAuth={}, huellaAuth=''` |
| `borrador` → `pendiente` | `solicitarConfirmado()` L4870 | vendedor | `pushToQueue()` (snapshot completo de Q), `saveState()`. Precio bloqueado (`locked()`) |
| `borrador` → `pendiente` (atajo) | `autorizarYoMismo()` L4902 | el mismo vendedor | pasa por los mismos filtros (`exigirDatosCliente`, `sub>0`) y por la cola; `_selfAuth=true` (memoria, no persiste) |
| `pendiente` → `autorizada` | `autorizarConfirmado()` L4933 | autorizador (o `_selfAuth`) | **el momento clave**: ver abajo |
| `pendiente` → `rechazada` | `rechazar()` L4962 | autorizador | `Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth=''`, `updateQueueEntry(...)`, `removeFromQueue(folio)` — la rechazada **no ocupa folio** |
| `pendiente`/`autorizada` → `borrador` | `reabrir()` L4917 | cualquiera | `Q.autorizador=''; Q.nota=''; _selfAuth=false; paBorradorLimpiar()`; si era pendiente, `removeFromQueue`. **No tira `precioAuth`** a propósito |
| `autorizada` → `autorizada` (editar) | `toggleEditMode()` L3587 + `guardarCambiosEdicion()` L3598 | vendedor | `soltarAuthSiCambio()` y reescritura del historial |
| historial → `autorizada` | `reabrirDeHistorial()` L6754 | — | fuerza `estado='autorizada'`, repone `huellaAuth` (o la sella) y promueve `_lt` a `itemsAuth` |

**`autorizarConfirmado()` — lo que se congela (L4933–4959, verbatim):**
```js
function autorizarConfirmado(){
  const nombre=($('a-name')?.value||'').trim();
  Q.autorizador=nombre||prefGet(PREF_AUTORIZADOR,'');
  if(nombre) prefSet(PREF_AUTORIZADOR,nombre);
  Q.nota=($('a-note')?.value||'').trim();
  _selfAuth=false;
  const neto=totals().neto;
  const pa=parseFloat($('a-precio')?.value)||0;
  Q.precioAuth=(pa>0&&Math.abs(pa-neto)>0.01)?pa:0;
  paBorradorLimpiar();   // a partir de aquí manda Q.precioAuth, no lo que se tecleó
  sellarAuth();
  Q.estado='autorizada';
  Q.fechaAuth=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
  confirmarFolio(Q.folio); // el contador de cotizaciones solo avanza al autorizar
  updateQueueEntry(Q.folio,{estado:'autorizada',precioAuth:Q.precioAuth,autorizador:Q.autorizador,nota:Q.nota,fechaAuth:Q.fechaAuth,itemsAuth:Q.itemsAuth,huellaAuth:Q.huellaAuth});
  const guardada=guardarEnHistorial();
  if(guardada) removeFromQueue(Q.folio);
  saveState(); renderItems();
  ...
}
```
Congela, en este orden: **nombre del autorizador → nota interna → `precioAuth` → huella del trabajo → estado → fecha de autorización → folio consumido → cola → historial (con `_lt` por partida)**.

### 6.2 `huellaTrabajo` / `sellarAuth` / `authVigente` / `soltarAuthSiCambio` (L3255–3280, verbatim)

```js
const _CAMPOS_PRECIO=['tipo','material','comp','luz','altura','n','acab','recComp','bas','ancho','alto','tarifa','pz','pu'];
function huellaTrabajo(){
  return (Q.iva?'c':'s')+'|'+Q.items.map(it=>
    it.id+':'+_CAMPOS_PRECIO.map(k=>it[k]===undefined?'':String(it[k])).join('~')).join(',');
}
function sellarAuth(){ Q.huellaAuth=huellaTrabajo(); }
function authVigente(){ return !!Q.huellaAuth && Q.huellaAuth===huellaTrabajo(); }
function soltarAuthSiCambio(){
  if(!Q.huellaAuth || authVigente()) return false;
  const habia = Q.precioAuth>0 || Object.keys(Q.itemsAuth||{}).length>0;
  Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth='';
  return habia;
}
```

**Por qué existen (razones documentadas en el propio archivo, L3235–3254):**
1. Un precio autorizado no es un número suelto: es un número dicho **sobre un trabajo concreto**. Antes, soltarlo vivía en `guardarCambiosEdicion`, así que bastaba **no apretar ese botón** (recargar, que iOS matara la pestaña) para dejar una cotización autorizada al precio de otras partidas.
2. La condición anterior era `Q.precioAuth>0`: cuando el autorizador aprobaba el calculado tal cual —el caso normal— editar partidas no soltaba nada.
3. La huella describe el **trabajo**, no su importe: se basa en los campos que mueven el precio, **no en `lineTotal()`**, porque basarla en el importe convertiría una edición del catálogo (este archivo se edita a mano y se publica) en un "cambio de trabajo" y soltaría autorizaciones que nadie tocó.
4. La huella **no incluye** `cliente`, `tel` ni `proy`, a propósito: escribir el teléfono que falta en una cotización vieja (para poder editar sus partidas) no debe soltarle su precio autorizado.
5. Incluye el IVA (`'c'`/`'s'`) porque mueve el total 16%.

`soltarAuthSiCambio()` es el **único** lugar que suelta, y se llama desde `renderSummary()` (L4266) — es decir en cada repintado, sin depender de ningún botón: recargar la app a medio editar también entra por ahí.

### 6.3 Candados
```js
const locked=()=>Q.estado!=='borrador'&&!Q.editMode;                   // L2816
function capturaBloqueada(){ return locked()||faltanDatosCliente(); }  // L4699
```
`setItem`/`typeItem` preguntan ellos mismos (L3530, L3540). Fuera del candado por decisión explícita: `setShowInPdf` (decide qué se imprime, no captura datos) y los campos `_FM_PDF=['f-entrecalles','f-entrega','f-nota-cli','f-anti']` (L7133) — no mueven el total.

---

## 7. Folios (L7161–7205, verbatim)

```js
const FOLIO_PREFIJO='COT-';
function folioNum(f){ const m=/(\d+)/.exec(String(f||'')); return m?parseInt(m[1],10):0; }
function folioFmt(n){ return FOLIO_PREFIJO+String(n).padStart(4,'0'); }
function folioConfirmados(){ try{ return parseInt(localStorage.getItem('al3d_folio')||'0')||0; }catch(_){ return 0; } }
function foliosOcupados(){
  const s=new Set();
  try{ getQueue().forEach(e=>{ if(e.estado!=='rechazada') s.add(folioNum(e.folio)); }); }catch(_){}
  try{ getHistorial().forEach(e=>s.add(folioNum(e.folio))); }catch(_){}
  s.delete(0);
  return s;
}
function nextFolio(){
  try{
    const ocupados=foliosOcupados();
    let n=folioConfirmados()+1;
    while(ocupados.has(n)) n++;
    return folioFmt(n);
  }catch(_){ return FOLIO_PREFIJO+String(Math.floor(Math.random()*9000)+1000); }
}
function confirmarFolio(folio){
  const n=folioNum(folio);
  if(!n) return;
  try{ if(n>folioConfirmados()) localStorage.setItem('al3d_folio',String(n)); }catch(_){}
}
function folioConfirmado(){ return Q.estado==='autorizada'; }
```

- **Formato:** `COT-` + 4 dígitos con cero a la izquierda → `COT-0001`. `folioNum` toma **el primer grupo de dígitos**, así que tolera el fallback aleatorio `COT-4732` y formatos raros de un respaldo restaurado.
- **Cuándo se consume:** exclusivamente en `autorizarConfirmado()` → `confirmarFolio(Q.folio)`. Borradores y pendientes muestran folio **provisional** (`pintarFolio` pinta la clase `.prov`). El contador es monótono: nunca baja.
- `nextFolio()` se llama en `init()` (si no hay estado guardado) y en `usarComoBase()`.
- **El folio no es único entre dispositivos**: el contador es local a cada navegador. Dos teléfonos generan `COT-0008` en paralelo. Un módulo multiusuario **no puede** usar `folio` como clave global sin prefijar dispositivo.

---

## 8. Respaldo y restauración

### 8.1 Claves incluidas (L6856-6857, verbatim)
```js
const RESPALDO_KEYS=['al3d_historial','al3d_folio','al3d_q','al3d_queue','al3d_logo',
  'al3d_fold_proy',AI_FILE_KEY,PREF_AUTORIZADOR,PREF_MATERIAL,PREF_RV_PCT,PREF_RV_CUENTA];
```
Resueltas: `al3d_historial`, `al3d_folio`, `al3d_q`, `al3d_queue`, `al3d_logo`, `al3d_fold_proy`, `al3d_aifile`, `al3d_autorizador`, `al3d_ult_material`, `al3d_rv_pct`, `al3d_rv_cuenta`.
**Las API keys quedan fuera a propósito** (L6849): "un respaldo se manda por WhatsApp o por correo, y una key que viaja así deja de ser secreta".

### 8.2 Formato exacto del paquete (`armarRespaldo` L6878-6882, verbatim)
```js
function armarRespaldo(){
  const datos={};
  RESPALDO_KEYS.forEach(k=>{ try{ const v=localStorage.getItem(k); if(v!==null) datos[k]=v; }catch(_){} });
  return JSON.stringify({app:'cotizador-al3d',formato:1,fecha:new Date().toISOString(),datos});
}
```
```jsonc
{
  "app": "cotizador-al3d",          // etiqueta fija
  "formato": 1,                     // versión del envoltorio (nunca se valida al restaurar)
  "fecha": "2026-08-22T18:03:11.914Z",  // ISO 8601; restaurar usa solo .slice(0,10)
  "datos": {                        // mapa clave → VALOR CRUDO (string, JSON ya serializado)
    "al3d_historial": "[{\"folio\":\"COT-0007\",...}]",
    "al3d_folio": "7",
    "al3d_q": "{...}",
    "al3d_queue": "[]",
    "al3d_logo": "data:image/png;base64,...",
    "al3d_fold_proy": "0",
    "al3d_aifile": "{\"name\":\"logo.jpg\",\"type\":\"image/jpeg\",\"url\":\"data:...\"}",
    "al3d_autorizador": "Elías",
    "al3d_ult_material": "al-paint",
    "al3d_rv_pct": "10",
    "al3d_rv_cuenta": "Elias BBVA"
  }
}
```
Los valores de `datos` son **strings crudos, doblemente serializados** (JSON dentro de JSON). Una clave ausente en `datos` significa "no existía".

`respaldar(nombre)` L6883: nombre por defecto `cotizador-al3d-respaldo-${selloFecha()}.json`, `selloFecha()` = `YYYY-MM-DD-HHmm`. MIME `application/json`.

### 8.3 `restaurarDesde(texto)` L6890–6957 — validación en 6 pasos, verbatim
```js
function restaurarDesde(texto){
  let paquete;
  try{ paquete=JSON.parse(texto); }
  catch(_){ toast('Ese archivo no se pudo leer — ¿es el respaldo?','err',3600); return; }
  if(!paquete||paquete.app!=='cotizador-al3d'||!paquete.datos){
    toast('Ese archivo no es un respaldo del cotizador','err',3600); return;
  }
  const D=paquete.datos;
  if(typeof D!=='object'||Array.isArray(D)||Object.values(D).some(v=>typeof v!=='string'&&v!==null)){
    toast('El respaldo está dañado: sus datos no tienen la forma esperada','err',4600); return;
  }
  if(!Object.keys(D).some(k=>RESPALDO_KEYS.includes(k))){
    toast('El respaldo no trae ninguno de los datos del cotizador','err',4600); return;
  }
  /* Las dos claves que pueden dejar la app inservible se parsean de prueba. */
  try{
    if(D['al3d_historial']!=null && !Array.isArray(JSON.parse(D['al3d_historial']))) throw 0;
    if(D['al3d_q']!=null){
      const q=JSON.parse(D['al3d_q']);
      if(!q||typeof q!=='object'||!Array.isArray(q.items)) throw 0;
    }
  }catch(_){
    toast('El respaldo está dañado: el historial o la cotización en curso no se pueden leer','err',5200); return;
  }
  let cuantas=0;
  try{ cuantas=(JSON.parse(paquete.datos['al3d_historial']||'[]')||[]).length; }catch(_){}
  const fecha=(paquete.fecha||'').slice(0,10);
  if(!confirm(...)) return;
  if(!descargarArchivo(armarRespaldo(),`cotizador-al3d-antes-de-restaurar-${selloFecha()}.json`,'application/json')){
    toast('No se pudo descargar el respaldo previo — no se cambió nada','err',5200); return;
  }
  const previo={};
  RESPALDO_KEYS.forEach(k=>{ try{ previo[k]=localStorage.getItem(k); }catch(_){} });
  const fallaron=[];
  try{
    RESPALDO_KEYS.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_){} });
    Object.entries(paquete.datos).forEach(([k,v])=>{
      if(RESPALDO_KEYS.includes(k)) { try{ localStorage.setItem(k,v); }catch(_){ fallaron.push(k); } }
    });
  }catch(_){ fallaron.push('(escritura)'); }
  if(fallaron.length){
    RESPALDO_KEYS.forEach(k=>{
      try{ localStorage.removeItem(k); if(previo[k]!=null) localStorage.setItem(k,previo[k]); }catch(_){}
    });
    toast('No cupo el respaldo en este dispositivo ('+fallaron.length+' '+(fallaron.length===1?'clave':'claves')+') — no se cambió nada','err',6000);
    return;
  }
  toast('Respaldo restaurado — recargando…','ok',2000);
  setTimeout(()=>location.reload(),900);
}
```
Notas para otros módulos: `formato` **no se valida** (un `formato:2` pasaría); las claves que no están en `RESPALDO_KEYS` se **ignoran en silencio** al restaurar (extender el respaldo requiere extender la lista en ambos lados); es transaccional con rollback; termina en `location.reload()`.

Entrada: `<input id="restaurarin">` + `FileReader.readAsText` (L6959).

### 8.4 Export CSV (`exportarHistorialCSV` L6976)
14 columnas, BOM `\uFEFF` + CRLF:
`Folio, Fecha de autorización, Cliente, Teléfono, Proyecto, Dirección, Autorizador, Partidas, Subtotal, IVA, Total calculado, Precio autorizado, Ajuste, Detalle`
`csvCampo` (L6963) antepone `'` a cualquier celda no-numérica que empiece con `= + - @ \t \r` (anti-inyección de fórmulas).

---

## 9. Totales, IVA, anticipo y `precioAuth`

### 9.1 `totals()` (L3231–3235, verbatim)
```js
function totals(){
  const sub=Q.items.reduce((s,it)=>s+lineTotal(it),0);
  const iva=Q.iva?sub*0.16:0;
  return {sub,iva,neto:sub+iva};
}
```
**Sin redondeo** y **sin ajustes del autorizador**. Incluye las partidas ocultas del PDF.

### 9.2 Las cinco funciones de precio (L3282–3311, verbatim)
```js
function precioFinal(){
  const neto=totals().neto;
  if(Q.estado!=='autorizada') return neto;
  if(!authVigente()) return neto;
  return (Q.precioAuth>0 && Math.abs(Q.precioAuth-neto)>0.01) ? Q.precioAuth : neto;
}
function subAjustado(){ return Q.items.reduce((s,it)=>s+itemPrecio(it),0); }
function netoAjustado(){ const sub=subAjustado(); return +((Q.iva?sub*1.16:sub)).toFixed(2); }
function ajusteAuth(){ return +(netoAjustado()-precioFinal()).toFixed(2); }   // >0 descuento, <0 aumento
function desgloseFinal(){
  const neto=precioFinal();
  const sub=Q.iva?neto/1.16:neto;
  return {sub:+sub.toFixed(2), iva:+(neto-sub).toFixed(2), neto:+neto.toFixed(2)};
}
```
**Manejo del IVA:** un único punto, 16% fijo. En `totals()` se suma (`sub*0.16`); en `netoAjustado()` se multiplica (`sub*1.16`); en `desgloseFinal()` se **desglosa hacia atrás** desde el neto (`neto/1.16`) para que el descuento baje la base y el IVA salga de la base ya descontada — así el PDF, el texto de Canva y el registro de venta dicen lo mismo. `toggleIva()` está bajo candado (mueve el total 16%) y entra en `huellaTrabajo()`.

**`precioAuth`:** `0` significa "sin ajuste global" (no "gratis"). Solo cuenta si `estado==='autorizada'` **y** `authVigente()` **y** difiere del neto en >$0.01. Mientras se teclea, el borrador vive en `_paDraft={folio,val}` (L4899, memoria) — nunca en `Q.precioAuth`, porque "teclear un descuento no puede aplicarlo antes de que alguien apriete Autorizar".

### 9.3 Anticipo (`renderSummary` L4279–4288, verbatim)
```js
const pf=precioFinal();
if(!Q.antiManual){ const auto=Math.round(pf*0.5); Q.anti=auto; if(document.activeElement!==$('f-anti')) $('f-anti').value=auto||''; }
else if(document.activeElement!==$('f-anti')) $('f-anti').value=Q.anti||'';
const restEl=$('s-anti-rest');
if(restEl){
  const resta=pf-(Q.anti||0);
  restEl.textContent = pf>0 ? `Resta al entregar: ${money(Math.max(0,resta))}${resta<-0.01?' · el anticipo supera el total':''}` : '';
}
```
Listener (L5169): `Q.anti=parseFloat(this.value)||0; Q.antiManual=this.value.trim()!=='';`
- `antiManual:false` ⇒ `anti` es **derivado** (50% de `precioFinal()`, redondeado a peso) y se recalcula en cada repintado.
- `antiManual:true` ⇒ `anti` es **pactado**; no se toca. El historial lo guarda (`anti`, `antiManual`) porque "el anticipo se pacta al cerrar y no siempre es el 50%"; `reabrirDeHistorial` lo restaura, `usarComoBase` lo reinicia a `0/false`.
- Resta al entregar: `Math.max(0, precioFinal()-anti)`. **No hay registro de pagos**: `anti` es un monto pactado, no un cobro con fecha.

### 9.4 Registro de venta (`copiarFilaVenta` L8769) — fila TSV de 15 columnas para Notion
```
Proyecto | Abono Comision | Anticipo | Comision Restante | Comisiones | Cuenta | Estatus
Fecha Anticipo e Instalacion | Fecha Comision | Fecha Liquidacion | IVA | Liquidacion | Pago Pendiente | Precio Neto | Precio Subtotal
```
`com=Math.round(sub*pct/100)` sobre `desgloseFinal().sub`; `pend = estatus==='LIQUIDADO'?0:Math.max(0,neto-anti)`. **Nada de esto se persiste** — es solo portapapeles. La columna "Fecha Comision" va vacía siempre.

---

## 10. Lo más importante — análisis de aptitud de los datos

Punto de partida: **una entrada de `al3d_historial`** (§3). Es la única estructura duradera y completa.

### 10.a Agendar una instalación

**Existe ya, directamente utilizable:**

| Dato | Campo | Tipo/calidad |
|---|---|---|
| Identificador del trabajo | `folio` | string, único **por dispositivo** |
| Qué se instala | `items[]` + `histDsc(it)` | estructurado por tipo |
| Cuántas piezas | `items[].n` (letras/recorte), `1` (bastidor/caja), `items[].pz` (manual) | number |
| Tamaño físico | `altura` cm, o `ancho×alto` cm | number |
| Cliente y contacto | `cliente`, `tel` | string; `tel` **puede estar vacío** en entradas antiguas |
| Ubicación textual | `dirRaw`, `entrecalles`, `direccion` | texto libre |
| Compromiso de fecha | `entrega` | **texto libre, no parseable** (`"Viernes 15 de Agosto"`, sin año) |
| Cuándo se autorizó | `ts` (**epoch ms, único timestamp real**), `fechaAuth`, `fecha` (strings es-MX) | |
| Quién autorizó | `autorizador` | string libre, no un id de usuario |
| Requisito de obra conocido | `notaCliente` | por defecto "El cliente debe proporcionar salidas eléctricas." |
| Si lleva electricidad | `items[].luz` (letras), `acab==='sandwich'` (recorte), todo `caja` | boolean/derivable |
| Temperatura de LED | `items[].ilumTipo` (`'fria'`/`'calida'`) | solo `letras`; opcional |
| Dinero pactado | `anti`, `precioAuth`, `neto` | number |
| Referencia visual | `aiFile` `{name,type,url}` | **es la imagen del DISEÑO/plano, no del sitio**; `url:''` = se descartó por espacio |

**Falta por completo (hay que crearlo):**
- **No existe ningún campo de fecha de instalación.** `entrega` es el límite de fabricación, en prosa. `Q.fecha`/`fechaAuth` son fechas de cotización.
- No hay hora, duración estimada, ni ventana horaria.
- No hay cuadrilla / instalador / vehículo asignado.
- No hay estado de obra: el único estado es el de la **cotización** (`borrador|pendiente|autorizada|rechazada`). No hay `en producción`, `listo`, `instalado`, `reagendado`, `cancelado`.
- No hay historial de eventos: solo `ts` (última escritura de la entrada — se **sobrescribe** al reautorizar o al editar, así que no es "fecha de autorización original" si la entrada se tocó después).
- No hay condiciones de acceso: altura de montaje, andamio/grúa, permisos municipales, horario del local, si hay que tocar fachada de plaza comercial.
- No hay contacto de sitio distinto del cliente, ni segundo teléfono, ni correo.
- No hay pagos reales (solo `anti` pactado); no se puede condicionar el agendado a "anticipo recibido".
- **Peso de montaje no derivable**: no hay profundidad/canto ni espesor, así que no se puede estimar carga sobre la fachada.

### 10.b Calcular el material que hace falta comprar

Punto crítico: **el catálogo es una tarifa de venta, no una lista de materiales.** `MATERIALES[].precio` es $/cm de altura — no describe consumo. Lo que sí se puede derivar, tipo por tipo:

#### `tipo:'letras'`
Datos disponibles: `material` (5 opciones), `comp`, `luz`, `ilumTipo`, `altura` (cm), `n` (piezas), `textoAuto` (opcional).
- **Derivable con exactitud:** número de piezas (`n`), altura nominal de cada pieza (`altura` cm), familia de material, si lleva LED y su temperatura de color.
- **Derivable aproximadamente:** el "alto total apilado" = `altura × n` cm (que es exactamente la base de cobro, no una medida física útil).
- **NO derivable:** ancho de cada letra (depende del glifo y de la tipografía, y la tipografía no se captura); **profundidad del canto/retorno** — no existe el campo, y es lo que determina los **cm lineales de aluminio o acero** del canto; espesor del acrílico de la cara; **m² de acrílico de cara** (requiere área del glifo); **metros de módulo LED / fuente / cableado** (requiere área o perímetro interno); tornillería y separadores. El mapeo `material → materiales físicos` sí se puede sacar de los textos de presentación:
  - `al-paint` → cantos de aluminio blanco/negro/pintado, LED **posterior**
  - `al-brush` → aluminio brush cepillado, LED posterior
  - `acr-vol` → cara de acrílico + cantos de aluminio, LED **frontal/interna** fría
  - `acr-vinil` → cara de acrílico + rotulación de vinil + cantos de aluminio, LED frontal
  - `acero` → cara de acrílico + cantos de **acero inoxidable espejo**, LED posterior
  (fuente: `MATERIALES[].ilum` L2729-2733 y `descGemini` L6094-6104). `comp` (recta/cursiva/compleja) es **complejidad de corte**, no material: sugiere más horas de CNC, no más insumo cuantificable.
- `textoAuto` es la única fuente del **texto real** de las letras (permitiría estimar anchos por glifo), pero: solo se llena si alguien tecleó en el autocontador, **no lo pone la IA** (falta en el item de L5905), y no viaja en `_CAMPOS_PRECIO`. Trátalo como opcional y ausente la mayoría de las veces.

#### `tipo:'recorte'`
Datos: `acab` (`sencillo`/`vinil`/`sandwich`), `recComp`, `altura` (cm), `n` (piezas físicas).
- **Derivable:** `n` piezas de acrílico recortado, de `altura` cm de alto cada una; si lleva **vinil** (`acab==='vinil'`) y si lleva **iluminación** (`acab==='sandwich'`, que implica dos caras de acrílico + LED interior).
- **NO derivable:** ancho de cada pieza → **m² de placa de acrílico NO calculable**; espesor del acrílico (mm); m² de vinil; metros de LED en el sándwich; el `n` de un recorte cuenta "piezas físicas del elemento (icono, figura, silueta)" según el prompt (L5273), es decir formas, no área.

#### `tipo:'bastidor'` — **el único tipo con área física real**
Datos: `bas` (`lamina`/`alucobond`), `ancho` cm, `alto` cm.
- **Derivable con exactitud:** `m² = ancho*alto/10000` — **m² de lámina galvanizada o de Alucobond**. Ojo: el cobro aplica `Math.max(m2,1)`; para compra usar el **área real**, no la cobrada.
- **Derivable con supuesto:** perímetro del marco `= 2*(ancho+alto)` cm de **tubular de 1"** (el material se nombra en `descTxt` L6033: "estructura tubular de 1\" forrada de …").
- **NO derivable:** travesaños/refuerzos internos (cuántos y su separación), profundidad del bastidor, remaches/tornillos, si va a muro o a poste.

#### `tipo:'caja'` (caja de luz)
Datos: `tarifa` (3900 estándar / 4600 nube-silueta / libre), `ancho` cm, `alto` cm.
- **Derivable:** `m² = ancho*alto/10000` de **cara de acrílico**; el tipo geométrico (rectangular vs silueta) a partir de la tarifa; que lleva **LED fría** siempre (`descTxt` L6034: "Caras en Acrílico con Iluminación LED Fría").
- **NO derivable:** **profundidad de la caja** → sin ella no hay cm lineales de perfil/marco lateral ni m² de forro; número de módulos LED y fuentes (requiere profundidad y separación); si es de una o dos caras; impresión/vinil sobre la cara; si la tarifa es "personalizada" no se puede inferir la geometría.

#### `tipo:'manual'`
Datos: `desc` (texto libre), `pz`, `pu`.
- **Derivable:** nada material. Es una línea de importe. El propio prompt la describe como "instalación, viáticos, rotulación vehicular u otros" (L5279). Cualquier módulo de compras debe **excluirla** o pedir clasificación humana.

#### Resumen para un módulo de compras
| Insumo | ¿Calculable hoy? | De dónde |
|---|---|---|
| m² de lámina galvanizada | **Sí, exacto** | `bastidor` con `bas==='lamina'`: `ancho*alto/10000` |
| m² de Alucobond | **Sí, exacto** | `bastidor` con `bas==='alucobond'` |
| cm lineales de tubular 1" (perímetro) | Aproximado | `bastidor`: `2*(ancho+alto)`, sin refuerzos |
| m² de acrílico de cara de caja de luz | **Sí, exacto** (cara frontal) | `caja`: `ancho*alto/10000` |
| Piezas de letra a fabricar | **Sí** | `letras.n` |
| Altura de cada letra | **Sí** | `letras.altura` cm |
| Piezas de recorte | **Sí** | `recorte.n` |
| Familia de material por partida | **Sí** (mapeo de tabla) | `letras.material`, `recorte.acab`, `bastidor.bas` |
| ¿Lleva LED? / temperatura | **Sí** | `letras.luz`+`ilumTipo`; `recorte.acab==='sandwich'`; `caja` siempre fría |
| cm lineales de canto de aluminio / acero | **NO** | falta profundidad de canto y ancho de glifo |
| m² de acrílico de caras de letras | **NO** | falta área del glifo |
| m² de vinil | **NO** | falta área |
| metros de módulo LED, nº de fuentes | **NO** | falta perímetro/área interna y profundidad |
| espesores (mm de acrílico, calibre de lámina) | **NO** | no existe ningún campo |
| profundidad de caja/bastidor/canto | **NO** | no existe ningún campo |
| tornillería, silicón, pintura, consumibles | **NO** | no existe |

Y una advertencia de exactitud: si vas a recalcular, **usa `_lt`/`itemsAuth` para dinero y los campos crudos (`altura`, `n`, `ancho`, `alto`) para material**. Nunca derives material desde el importe: la regla del mínimo 1 m² (`m2Total`) hace que un letrero de 0.3 m² se cobre como 1 m² pero se fabrique con 0.3 m².

### 10.c Poner un pin en un mapa

**Existe:**
- `maps`: string. Validado **solo** con `/^https?:\/\//i` (L5136) — no se comprueba que sea de Google Maps. Puede ser un short link (`maps.app.goo.gl/…`), un `/place/…`, un `?q=…` o cualquier URL.
- `dirRaw`: dirección **como la mandó el cliente**, texto libre multilínea ("Urban Center en López Mateos Sur").
- `entrecalles`: texto libre.
- `direccion`: lo que la IA leyó en la imagen (a menudo vacío o de baja calidad).
- El único constructor de URL geográfica que existe en la app (L5142):
```js
function dirRawMapsUrl(){ return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((Q.dirRaw||'').trim()); }
```
Es decir: **la app delega el geocoding a Google al abrir el link. Nunca resuelve nada.**

**Falta por completo:**
- **No hay `lat`/`lng` en ninguna parte del modelo.** Ni `place_id`, ni geohash.
- No hay dirección estructurada: calle, número, colonia, CP, municipio, estado, país. Todo es una sola cadena.
- No hay validación ni normalización: `dirRaw` puede ser "el local de junto al Oxxo".
- No hay municipio/zona para agrupar rutas.
- `maps` puede estar vacío (`''`) — es opcional, no obligatorio.
- Extraer coordenadas de `maps` funciona **solo** para las formas `/@lat,lng,zoom` o `?q=lat,lng`; un short link `goo.gl` **exige una resolución HTTP** (y la app es offline-first con service worker). Un módulo de mapa tiene que asumir: (1) parsear `maps` si trae coordenadas; (2) si no, geocodificar `dirRaw + ' ' + entrecalles` con un servicio externo; (3) marcar la entrada como "ubicación no confirmada" y exponerla para corrección manual. Ese estado ("geocodificado / confirmado / fallido", con `lat`, `lng`, `precision`, `fuente`) **no existe y hay que añadirlo**.

### 10.d Huecos transversales que afectan a los tres módulos

1. **No hay identidad de registro estable más que `folio`**, y `folio` solo es único por dispositivo (el contador `al3d_folio` es local). Si se van a fusionar datos de varios teléfonos, hace falta un id compuesto (`dispositivo+folio`) o un UUID nuevo.
2. **Fechas legibles, no fechas de máquina.** `fecha`, `fechaAuth` y `entrega` son strings en español (`'22 ago 2026'`, `'Viernes 15 de Agosto'`). El único valor comparable es `ts` (epoch ms), y se sobrescribe cuando la entrada se reguarda.
3. **`ts` no es inmutable.** `guardarEnHistorial` reemplaza la entrada completa (`arr[idx]=entry`) al reautorizar, al editar y al ocultar/mostrar una partida del PDF. No hay `createdAt` separado de `updatedAt`.
4. **`items[].id` es local a la cotización** (`pid` se reinicia por cotización, y `usarComoBase` reasigna). No es una clave global de partida. Las llaves de `itemsAuth` son esos mismos ids **serializados como strings** en JSON: al leer, `e.itemsAuth[it.id]` funciona por coerción, pero `Object.keys()` da strings.
5. **Las partidas ocultas del PDF (`showInPdf===false`) siguen cobrándose** (se agrupan como "Conceptos adicionales"). Un módulo que liste trabajo a fabricar **no debe** filtrar por `showInPdf`.
6. **Solo entran al historial las cotizaciones autorizadas.** Borradores viven en `al3d_q` (uno solo, el actual) y pendientes en `al3d_queue`. No hay archivo de rechazadas: `rechazar()` las saca de la cola con todo su snapshot.
7. **Todo es local a un navegador.** Dos pestañas se pisan (hay solo un aviso, L8695); no hay sincronización, ni servidor, ni conflicto resuelto. Cualquier módulo que lea debe hacerlo desde un respaldo exportado o desde el mismo origen del navegador.
8. **La imagen (`aiFile`) es del diseño, no del sitio**, pesa hasta 2 MB en base64, y puede haber sido descartada silenciosamente (`url:''`) para que el historial cupiera.

---

### Índice de líneas de referencia rápida

| Cosa | Línea |
|---|---|
| Catálogos + `factorOf`/`matOf`/`compOf`/`recOf`/`basOf` | 2728–2765 |
| `Q` | 2768–2787 |
| `locked()` | 2816 |
| `PREF_*`, `AI_FILE_KEY`, `prefGet/prefSet` | 3150–3160 |
| `clientesConocidos` / `autocompletarCliente` | 3168–3196 |
| `M2_MINIMO`, `m2Total`, `lineTotal`, `totals` | 3203–3235 |
| `_CAMPOS_PRECIO`, `huellaTrabajo`, `sellarAuth`, `authVigente`, `soltarAuthSiCambio` | 3255–3280 |
| `precioFinal`, `subAjustado`, `netoAjustado`, `ajusteAuth`, `desgloseFinal`, `itemPrecio`, `itemAjustada`, `ltHTML` | 3282–3331 |
| `notaCliente`, `direccionPdf` | 3333–3336 |
| `addItem`, `setItem`, `typeItem`, `setTipo`, `dupItem`, `setShowInPdf` | 3430–3585 |
| `toggleEditMode`, `guardarCambiosEdicion` | 3587–3610 |
| `resumenPartida` (unidades en pantalla) | 3941–3980 |
| `bodyFor` (inputs y unidades por tipo) | 4045–4142 |
| `formulaM2`, `formulaFor` | 4143–4172 |
| `updItemAuth` | 4223–4258 |
| `renderSummary` (anticipo, ajuste) | 4260–4317 |
| `renderAuth` (labels de estado) | 4318–4427 |
| `OBLIGATORIOS`, `telIncompleto`, `datosFaltantes` | 4603–4615 |
| `solicitar` → `rechazar` (todo el flujo) | 4865–4977 |
| `nueva()` | 5003–5040 |
| `al3d_fold_proy` | 5108–5128 |
| logo | 5172–5225 |
| `PROMPT_IA` | 5228–5286 |
| keys de IA (`keyPack`, `getKeys`, `setKeys`) | 5316–5385 |
| `itemVacio` | 5434 |
| `AI_NOMBRE`, `AI_DEFAULTS` | 5550–5551 |
| `aiCadena`, rotación de keys | 5709–5745 |
| `Q.aiFile={...}` | 5820 |
| `aplicarIA` (item desde IA) | 5896–5950 |
| `EMPRESA` | 5957 |
| `copiarParaCanva` (`descTxt`/`medTxt`/`pzasTxt`) | 6025–6085 |
| `getHistorial`/`saveHistorial`/`guardarEnHistorial` | 6601–6650 |
| `HIST_*`, `histDsc` | 6674–6685 |
| `pintarHistorial` | 6693–6750 |
| `reabrirDeHistorial` | 6754–6799 |
| `usarComoBase` | 6807–6846 |
| `RESPALDO_KEYS`, `armarRespaldo`, `respaldar`, `restaurarDesde` | 6856–6957 |
| `exportarHistorialCSV`, `csvCampo` | 6963–6996 |
| cola: `getQueue`/`saveQueue`/`pushToQueue`/`updateQueueEntry`/`loadQueueEntry` | 6998–7062 |
| `saveState`, `sincronizarAiFile`, `cargarAiFile`, `_FM`, `_FM_PDF`, `loadState` | 7063–7159 |
| folios | 7161–7205 |
| escalador → partidas (`scAgregarPartida`, `scCotizarConIA`) | 8476–8570 |
| `hoy()`, `init()`, listener `storage`, `beforeunload` | 8651–8712 |
| Registrar Venta | 8730–8797 |