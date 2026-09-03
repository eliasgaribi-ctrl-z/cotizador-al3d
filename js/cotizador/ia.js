/* ============================================================================
   Cotizador · ia.js

   Cotizar con IA: proveedores, API keys, el archivo a analizar, arrastrar y pegar, reintentos y respaldo entre proveedores.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   273 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== IA (Google Gemini) ===================== */
const PROMPT_IA = `Eres un asistente experto en cotizacion para "AL3D", empresa que fabrica letras 3D (caras de acrilico, cantos de aluminio o de acero inoxidable), recortes de acrilico, bastidores y cajas de luz.

Analiza la imagen o PDF y DESGLOSA CADA ELEMENTO por separado en distintas partidas. Devuelve SOLO un JSON valido, sin texto adicional:
{"proyecto":"","cliente":"","direccion":"","partidas":[{"tipo":"letras|recorte|bastidor|caja|manual","material":"al-paint|al-brush|acr-vol|acr-vinil|acero","complejidad":"recta|cursiva|compleja","acabado":"sencillo|vinil|sandwich","bastidor":"lamina|alucobond","altura_cm":0,"n_letras":0,"iluminacion":true,"tarifa":0,"ancho_cm":0,"alto_cm":0,"descripcion":"","piezas":1,"precio_unitario":0,"notas":""}]}

=== CÓMO DISTINGUIR tipos (LEE ESTO PRIMERO — ORDEN DE PRIORIDAD) ===
- tipo "letras": ES EL TIPO POR DEFECTO. Texto, letras, iconos y logos con profundidad/volumen. Ante CUALQUIER DUDA entre letras y recorte, SIEMPRE elige letras. Es el tipo más común en todos los proyectos.
- tipo "caja": cuando hay una SILUETA COMPLETA de logotipo, figura, mascota, animal o icono que funciona como una forma unica iluminada (no son letras individuales separadas). REGLA: si la imagen muestra un dibujo, figura o logo completo como silueta → SIEMPRE tipo "caja" con tarifa 4600 (tipo nube/silueta). Incluye ancho_cm y alto_cm.
- tipo "recorte": ULTIMO RECURSO. Solo cuando el diseno especifica EXPLICITAMENTE que el elemento es plano/2D, sin profundidad, sin iluminacion interna. NUNCA uses recorte si tienes la minima duda — elige letras en su lugar.
REGLA DE ORO: letras (default para todo texto e iconos) > caja (silueta o figura completa) > bastidor (panel de fondo) > recorte (solo si el cliente lo pide explicitamente, muy raro).

=== REGLA PRINCIPAL: DESGLOSA SIEMPRE ===
NUNCA pongas un logotipo completo como una sola partida. Separa cada elemento:
1. Si hay un SIMBOLO, ICONO o LOGOTIPO con VOLUMEN/PROFUNDIDAD (dice "Cantos en Aluminio", "3D", o se ven los lados en la imagen) → tipo "letras". Si es PLANO y sin profundidad → tipo "recorte".
2. Si hay TEXTO principal (nombre/marca) → partida tipo "letras", cuenta CADA letra individual (sin espacios).
3. Si hay SLOGAN o texto secundario con diferente tamaño o tipografia → partida tipo "letras" SEPARADA.
4. Si hay diferentes alturas en el mismo texto → crea una partida por cada grupo de altura distinta.
5. Si hay diferentes materiales en el mismo diseno → una partida por material.

Ejemplos de desglose correcto:
- Logo "FARMACIA SAN JUAN" con cruz medica: → Partida 1: caja (cruz como silueta completa iluminada, tarifa 4600) + Partida 2: letras (FARMACIA = 8 letras) + Partida 3: letras (SANJUAN = 7 letras, si tienen altura diferente).
- Letrero "AL3D Anuncios": → Partida 1: letras (AL3D = 4 caracteres) + Partida 2: letras (Anuncios = 8 letras, si es distinto tamano o tipografia).
- Logo con isotipo + nombre: SIEMPRE son minimo 2 partidas separadas. Si el isotipo es una figura/silueta completa → tipo "caja" tarifa 4600. Si son letras → tipo "letras".

=== REGLAS DE CAMPOS ===
- "descripcion": OBLIGATORIA. Escribe SOLO el contenido visual (texto detectado o descripcion del icono/figura). NO incluyas el material ni las medidas exactas — esos datos ya van en sus propios campos JSON (material, altura_cm, etc.). Ejemplo correcto: "Letras «FARMACIA»", "Cruz médica", "Corazón con avión". Ejemplo incorrecto: "Letras «FARMACIA» en aluminio pintado, 25 cm" (no hagas esto).
- n_letras para tipo "letras": cuenta CADA caracter visible del texto de esa partida, SIN espacios. "AL 3D" = 4.
- n_letras para tipo "recorte": numero de piezas fisicas del elemento (icono, figura, silueta).
- REGLA DE CORCHETES — PASO 1 OBLIGATORIO: Antes de generar el JSON, CUENTA cuantos corchetes, brackets o lineas de cota hay en la imagen. Ese numero exacto es la cantidad minima de partidas que debes generar. Anota internamente: "Veo N corchetes, debo crear N partidas".
- REGLA DE CORCHETES — PASO 2: Aunque dos corchetes apunten a partes del mismo logotipo o elemento visual (por ejemplo: corchete de 92cm para las ondas Y corchete de 19cm para el circulo del mismo logo), CADA corchete con medida diferente = partida SEPARADA. Un logotipo con 2 corchetes = 2 partidas. NO los fusiones en una sola aunque sean del mismo logo.
- REGLA DE CORCHETES — PASO 3: Verifica antes de responder que el numero de partidas en tu JSON coincide con el numero de corchetes que contaste. Si no coincide, agrega las partidas faltantes.
- REGLA DE TEXTOS DESCRIPTIVOS: Los planos suelen tener bloques de texto con especificaciones (ej. "Letras Individuales 3D: Cara en Acrilico Blanco, Cantos en Aluminio Blanco"). Cada bloque de texto descriptivo aplica al elemento visual mas cercano o al que apunta. Cuando hay DOS bloques de texto distintos → son elementos distintos con especificaciones distintas. LEE y USA esos textos para rellenar material, tipo e iluminacion de CADA partida. NUNCA dejes una partida sin descripcion ni sin material si hay texto en la imagen que la describa.
- REGLA ANTI-PARTIDA-VACIA: Una partida con todos los campos en 0 o vacios es invalida. Si creaste una partida para cumplir el conteo de corchetes pero no la llenaste, busca en la imagen el elemento visual y el texto descriptivo que corresponden a ese corchete y rellena todos sus campos.
- altura_cm: el valor numerico que muestra el corchete apuntando a ese elemento. No importa si el corchete es vertical u horizontal: usa ese numero tal cual como centimetros. NUNCA ignores un corchete porque sea horizontal o apunte al ancho.
- Cuando hay MULTIPLES corchetes: asigna el valor de cada corchete al elemento al que apunta. NUNCA uses la misma medida para elementos distintos. NUNCA omitas un corchete.
- Ejemplo para imagen con 2 bloques de texto + 3 corchetes (92cm ondas, 19cm circulo, 62cm letras): → Partida 1: ondas, acr-vinil, altura_cm=92, n_letras=4 (piezas de onda). Partida 2: circulo, acr-vinil, altura_cm=19, n_letras=1. Partida 3: letras "National", acr-vol, altura_cm=62, n_letras=8. TRES partidas completas, ninguna vacia.
- Material de letras: al-paint=Aluminio pintado ($30/cm), al-brush=Aluminio brush cepillado ($35/cm), acr-vol=Acrilico+Aluminio con volumen ($40/cm), acr-vinil=Acrilico+Vinil ($45/cm), acero=Acero Inoxidable ($55/cm).
- Deteccion de material por descripcion: "Cara en Acrilico" + "rotulacion de vinil" + "Cantos en Aluminio" → material="acr-vinil". "Cara en Acrilico" + "Cantos en Aluminio" sin vinil → material="acr-vol". "Cantos en Aluminio Blanco/Negro/Pintado" sin acrilico → material="al-paint". "Acero Inoxidable", "Inoxidable", "Inox", "Stainless" o "Acero Espejo" (en cantos o caras) → material="acero", tenga o no acrilico.
- complejidad: recta (tipografia recta/imprenta), cursiva (manuscrita/script/italica), compleja (muy ornamentada o muy detallada).
- iluminacion: true salvo que diga explicitamente "sin luz" o "sin iluminacion".
- tipo "recorte": acabado sencillo=$20/cm, vinil=$25/cm, sandwich=$55/cm (+$5 si es compleja). Se cobra altura_cm x n_letras (piezas).
- tipo "bastidor": bastidor lamina=$950/m2 o alucobond=$1500/m2. Incluye ancho_cm y alto_cm. Minimo 1 m2.
- tipo "caja": tarifa 3900 (estandar) o 4600 (tipo nube/silueta). Incluye ancho_cm y alto_cm. Minimo 1 m2.
- tipo "manual": para instalacion, viaticos, rotulacion vehicular u otros. Usa descripcion, piezas y precio_unitario solo si el precio aparece en el archivo.
- Si un dato no se ve claramente, dejalo en 0 o "". NUNCA inventes precios.

=== CUANDO NO HAY CORCHETES NI COTAS (imagen sin medidas) ===
Si la imagen NO tiene corchetes ni lineas de cota, estima alturas usando objetos de referencia comunes que aparezcan en la foto:
- Puerta o marco de puerta: 200cm alto x 90cm ancho
- Ventana residencial: 120cm alto x 80cm ancho
- Persona adulta: 170cm alto
- Auto sedan: 145cm alto | Camioneta/SUV: 175cm alto
- Ladrillo estandar MX: 6cm alto x 19cm largo
- Loseta/baldosa cuadrada: 40x40cm
- Letra de cartel tipica en fachada de local comercial (referencia secundaria): 20-40cm alto
PROCESO sin cotas: 1) Identifica el objeto de referencia mas obvio y claro en la imagen. 2) Calcula la proporcion de ese objeto vs los elementos a cotizar usando sus tamaños relativos en pixeles. 3) Estima la altura de letras y elementos. 4) En el campo "descripcion" de CADA partida escribe al final: "(~Xcm estimado por [referencia usada])". 5) Si no hay ninguna referencia reconocible, deja altura_cm=0 y escribe en descripcion "Sin escala — confirmar medidas con cliente".`;

/* ----- Lo que se le añade al prompt cuando la imagen viene del escalador -----
   El prompt de arriba dedica un bloque entero a estimar tamaños comparando contra
   puertas, ladrillos y personas, porque normalmente la IA no tiene de dónde sacarlos.
   Cuando la foto viene del escalador ese problema no existe: las medidas están
   calibradas contra una referencia real y dibujadas sobre la imagen. Aquí se le dice
   que las use tal cual y que dedique su trabajo a lo que sí tiene que deducir —qué es
   cada elemento, de qué material y con cuántas letras—. */
function promptMedidas(medidas){
  const n=medidas.length;
  const lista=medidas.map((m,i)=>`${i+1}. ${scFmtCm(m.cm)} cm${m.label?' — '+m.label:''}`).join('\n');
  return `

=== MEDIDAS YA CALIBRADAS — MANDAN SOBRE CUALQUIER ESTIMACION ===
Esta imagen viene del escalador de AL3D: se calibro contra una referencia real y las
cotas dibujadas encima son medidas EXACTAS en centimetros, no estimaciones.

Medidas tomadas (${n}):
${lista}

1. Usa EXACTAMENTE estos numeros. En las partidas de tipo letras y recorte van en
   altura_cm; en bastidor y caja, en el lado que corresponda (ancho_cm o alto_cm).
   No los redondees, no los cambies y no los sustituyas por una estimacion tuya.
2. Genera una partida por cada medida de la lista y en el mismo orden:
   ${n} medidas = ${n} partidas.
3. El texto que acompaña a una medida lo escribio el vendedor sobre ese elemento:
   usalo para decidir el tipo de partida y para la descripcion.
4. IGNORA por completo la seccion "CUANDO NO HAY CORCHETES NI COTAS": aqui si hay
   cotas y son fiables.
5. Lo que si tienes que deducir de la imagen es QUE es cada elemento: tipo, material,
   complejidad, iluminacion y, en las de tipo letras, cuantas letras tiene el texto.`;
}

/* ----- API keys: fuera del código y fuera de la vista -----
   La key nunca está escrita en el HTML: la captura el usuario. Al guardarla se
   ofusca (no queda en texto plano en localStorage) y en pantalla solo se ven
   sus últimos 4 caracteres, así que tampoco queda visible al abrir el modal.
   El campo es type="text" con text-security en vez de type="password" para que
   Chrome no lo detecte como contraseña ni ofrezca guardarla en el gestor. */
const AI_PROVS=['gemini','groq','openrouter'];
const _KSALT='al3d·key·v1';
function _kxor(s){ let o=''; for(let i=0;i<s.length;i++) o+=String.fromCharCode(s.charCodeAt(i)^_KSALT.charCodeAt(i%_KSALT.length)); return o; }
function keyPack(k){ try{ return btoa(_kxor(String(k))); }catch(_){ return ''; } }
function keyUnpack(v){ try{ return _kxor(atob(String(v))); }catch(_){ return ''; } }
function keyMask(k){ return k.length>4?'••••••••'+k.slice(-4):'••••'; }
/* Cada proveedor guarda VARIAS keys, no una. En los planes gratuitos la cuota va por
   key —no por proveedor—, así que dos cuentas de Google son dos cuotas de Gemini, y
   cuando una se queda sin cupo del día la siguiente sigue contestando. Se guardan
   ofuscadas y en una sola entrada por proveedor. */
const AI_MAX_KEYS=8;
function getKeys(p){
  try{
    const v=localStorage.getItem('al3d_kxs_'+p);
    if(v){ const a=JSON.parse(keyUnpack(v)); if(Array.isArray(a)) return a.filter(Boolean); }
    /* Migración: la key única de las versiones anteriores —ofuscada o, más atrás
       todavía, en texto plano— se convierte en una lista de una. */
    const una=keyUnpack(localStorage.getItem('al3d_kx_'+p)||'')
           || localStorage.getItem('ai_key_'+p)
           || (p==='gemini'?localStorage.getItem('ai_key'):'') || '';
    if(una){ setKeys(p,[una]); return [una]; }
  }catch(_){}
  return [];
}
function setKeys(p,arr){
  const lim=[];
  (arr||[]).forEach(k=>{ k=String(k||'').trim(); if(k&&!lim.includes(k)&&lim.length<AI_MAX_KEYS) lim.push(k); });
  try{
    if(lim.length) localStorage.setItem('al3d_kxs_'+p,keyPack(JSON.stringify(lim)));
    else localStorage.removeItem('al3d_kxs_'+p);
    localStorage.removeItem('al3d_kx_'+p);
    localStorage.removeItem('ai_key_'+p);
    if(p==='gemini') localStorage.removeItem('ai_key');
  }catch(_){}
  return lim;
}
/* Sigue habiendo un getKey de una sola key porque media app solo pregunta «¿hay algo
   configurado para este proveedor?». */
function getKey(p){ return getKeys(p)[0]||''; }
function addKey(p,k){
  k=String(k||'').trim(); if(!k) return '';
  const a=getKeys(p);
  if(a.includes(k)) return 'repetida';
  if(a.length>=AI_MAX_KEYS) return 'llena';
  setKeys(p,a.concat([k])); return 'ok';
}
/* Si el navegador no soporta text-security (p. ej. Firefox), el campo se vería en
   claro: ahí sí conviene type="password" con autocomplete="new-password". */
function aiKeyFallback(){
  const ok=window.CSS&&CSS.supports&&(CSS.supports('-webkit-text-security','disc')||CSS.supports('text-security','disc'));
  if(ok) return;
  AI_PROVS.forEach(p=>{ const i=$('ai-key-'+p); if(i){ i.type='password'; i.setAttribute('autocomplete','new-password'); } });
}
function aiRenderKey(p){
  const cont=$('keys-'+p); if(!cont) return;
  const ks=getKeys(p);
  /* Se numeran para poder hablar de ellas: la barra de estado dice «key 2 de 3»
     mientras analiza, y así se sabe cuál es la que se quedó sin cuota. */
  cont.innerHTML=ks.map((k,i)=>
    `<div class="key-saved"><span class="key-mask">${ico('i-candado')} ${ks.length>1?'Key '+(i+1)+' · ':''}${esc(keyMask(k))}</span>`+
    `<button type="button" class="key-btn del" onclick="aiDelKey('${p}',${i})">Borrar</button></div>`).join('');
  const inp=$('ai-key-'+p);
  if(inp) inp.placeholder=ks.length
    ? (ks.length>=AI_MAX_KEYS?'Ya no caben más keys':'Pega otra key y se turnará con las de arriba')
    : 'Pega tu key (gratis, sin tarjeta)';
  aiPintarRespaldo();
}
/* Cuántas APIs hay cargadas y qué implica. Es la única cuenta que le importa a quien
   cotiza: mientras quede una con cupo, la cotización no se detiene. */
function aiPintarRespaldo(){
  const el=$('ai-respaldo'); if(!el) return;
  const det=AI_PROVS.map(p=>({p,n:getKeys(p).length})).filter(x=>x.n);
  const total=det.reduce((a,x)=>a+x.n,0);
  const lista=det.map(x=>`${x.n} de ${AI_NOMBRE[x.p]}`).join(', ');
  el.innerHTML=
    total>1 ? `<span class="emo">🔁</span> <b>${total} APIs cargadas</b> (${lista}). Se prueban por turnos: si una está saturada o se quedó sin cuota del día, la app pasa sola a la siguiente y la cotización no se detiene.`
    : total ? `<span class="emo">🔁</span> Hay <b>1 API cargada</b> (${lista}). Cuando se satura, la app reintenta sola varias veces — pero no tiene a dónde caerse. Agrega otra key aquí, de este proveedor o de otro, y deja de depender de una sola.`
    : `<span class="emo">🔁</span> Puedes cargar <b>varias APIs</b>, del mismo proveedor o de distintos: se prueban por turnos y la cotización deja de depender de que una tenga cupo.`;
}
function aiEditKey(p){
  const inp=$('ai-key-'+p); if(!inp) return;
  try{ inp.focus({preventScroll:true}); }catch(_){ inp.focus(); }
}
function aiAddKey(p){
  const inp=$('ai-key-'+p); if(!inp) return;
  const r=addKey(p,inp.value);
  if(r==='ok'){ inp.value=''; aiRenderKey(p); toast(`API key guardada · ${getKeys(p).length} de ${AI_NOMBRE[p]}`,'ok'); }
  else if(r==='repetida'){ inp.value=''; toast('Esa key ya estaba guardada','',2600); }
  else if(r==='llena') toast(`Máximo ${AI_MAX_KEYS} keys por proveedor`,'err',3000);
  else { aiEditKey(p); toast('Pega la key antes de agregarla','err',2600); }
}
function aiDelKey(p,i){
  const a=getKeys(p);
  setKeys(p,a.filter((_,x)=>x!==i));
  aiRenderKey(p); toast('API key borrada de este dispositivo','ok');
}

let aiProv='gemini';
function setAiProv(p){
  aiProv=p;
  localStorage.setItem('ai_provider',p);
  AI_PROVS.forEach(x=>{ const el=$('prov-'+x); if(el) el.style.display=x===p?'':'none'; });
  document.querySelectorAll('#ai-prov-seg button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  segAria('#ai-prov-seg button');
  aiPintarRespaldo();
}
/* Una partida recién agregada está en blanco: no cuenta como trabajo capturado.
   El material HEREDADO tampoco cuenta: lo puso la app, no la persona. Sin esa
   salvedad, una cotización recién abierta decía tener «1 partida ya capturada» y la
   IA avisaba de que iba a reemplazar trabajo que nadie había hecho. Solo el material
   elegido a mano —el que ya no trae matAuto— es trabajo. */
function itemVacio(it){
  const matPropio=!!it.material && !it.matAuto;
  return !(it.desc||'').trim() && !it.altura && !it.n && !it.ancho && !it.alto && !it.pu
      && !matPropio && !it.acab && !it.bas;
}
/* Analizar un archivo reemplazaba TODAS las partidas sin avisar. Después la app lo
   avisaba, pero seguía llegando en «reemplazar»: lo predeterminado destruía trabajo y
   solo un aviso en ámbar lo detenía. Ahora arranca en «conservar». Reemplazar sigue a
   un toque, y es una decisión que se toma a propósito en vez de por omisión. */
let aiMerge=true;
function toggleAiMerge(){
  aiMerge=!aiMerge;
  $('ai-merge-tg').classList.toggle('on',aiMerge); tgAria('ai-merge-tg');
  aiPintarMerge();
}
function aiPintarMerge(){
  const box=$('ai-merge-box'), note=$('ai-merge-note'); if(!box) return;
  const n=Q.items.filter(it=>!itemVacio(it)).length;
  box.style.display=n?'':'none';
  if(!n) return;
  /* Con una sola partida, «tus 1 partida» se lee mal: la frase entera cambia de número. */
  const suyas=n===1?'tu partida ya capturada':`tus ${n} partidas ya capturadas`;
  note.textContent=aiMerge
    ? `Se ${n===1?'conservará':'conservarán'} ${suyas} y las de la IA se agregarán al final.`
    : `⚠️ Apagado: ${suyas} se ${n===1?'reemplazará':'reemplazarán'} por lo que detecte la IA.`;
}
/* Fuente del análisis. Normalmente es el archivo que el usuario elige en el modal;
   cuando se entra desde el escalador es la foto que ya se midió, con sus cotas
   dibujadas y su lista de medidas. Solo dura lo que dura el modal abierto. */
let aiSrc=null;
function aiOpen(fuente){
  /* La IA propone partidas, así que pasa por el mismo candado que agregarlas a mano.
     Que además sepa leer el nombre del cliente en la imagen no la exime: lo que la IA
     no puede sacar de un JPG es el teléfono, y es de los tres el que más falta hace. */
  if(!exigirDatosParaPartidas()) return;
  aiSrc=(fuente&&fuente.url)?fuente:null;
  aiPintarFuente();
  aiMerge=true; $('ai-merge-tg').classList.add('on'); tgAria('ai-merge-tg'); aiPintarMerge();
  AI_PROVS.forEach(p=>{ const inp=$('ai-key-'+p); if(inp) inp.value=''; aiRenderKey(p); });
  /* El <input type=file> conserva su selección entre aperturas: sin limpiarlo, volver a
     abrir el modal y darle a Analizar re-analizaba —y volvía a pagar— el archivo del
     análisis anterior, sin que nada en pantalla dijera cuál era. */
  aiOlvidarArchivo();
  _aiDragN=0; aiPintarArrastre(false);
  $('ai-model-gemini').value=localStorage.getItem('ai_model_gemini')||localStorage.getItem('ai_model')||AI_DEFAULTS.gemini;
  $('ai-model-groq').value=localStorage.getItem('ai_model_groq')||AI_DEFAULTS.groq;
  $('ai-model-openrouter').value=localStorage.getItem('ai_model_openrouter')||AI_DEFAULTS.openrouter;
  const p=localStorage.getItem('ai_provider')||'gemini';
  setAiProv(p);
  if(!getKey(p)) $('ai-cfg-box').open=true;
  _aiCancelado=false;
  const go=$('ai-go-btn'); if(go) go.disabled=aiTrabajando;
  aiStatus(aiTrabajando?'Hay un análisis en curso…':''
    ,aiTrabajando?'work':'');
  $('aimodal').classList.add('show');
}
/* Cerrar el modal cancela lo que estuviera corriendo. Antes el análisis seguía en marcha
   con aiTrabajando en true, así que al reabrir el modal el botón Analizar estaba gris y
   sin ninguna explicación, y no había forma de cancelar. */
function aiClose(){
  $('aimodal').classList.remove('show');
  aiThumbsSoltarTodas();
  if(aiTrabajando){
    _aiCancelado=true;
    if(_aiAbort){ try{_aiAbort.abort();}catch(_){} }
    aiTrabajando=false;
    const b=$('ai-go-btn'); if(b) b.disabled=false;
  }
}
/* Con la imagen del escalador el modal cambia de cara: en vez de pedir un archivo
   enseña lo que se va a analizar, y deja la puerta abierta por si el usuario prefiere
   subir otra cosa. */
const AI_INTRO_ARCHIVO='Dale una foto (JPG) o PDF del diseño/boceto. La IA detecta texto, medidas, material e iluminación, <b>describe qué está cotizando en cada partida</b> y muestra una miniatura del archivo para que lo compares. Arma un <b>borrador</b> que tú revisas y autorizas antes de usarlo.';
const AI_INTRO_ESCALADOR='Se analiza la imagen que acabas de medir, con tus cotas dibujadas encima. Como las medidas ya están calibradas, la IA <b>no tiene que estimar tamaños</b>: los usa tal cual y dedica su trabajo a reconocer qué es cada elemento, de qué material y con cuántas letras. Arma un <b>borrador</b> que tú revisas y autorizas antes de usarlo.';
function aiPintarFuente(){
  const box=$('ai-src-box'), fld=$('ai-file-fld'), btn=$('ai-go-btn'), intro=$('ai-intro');
  if(!box) return;
  box.style.display=aiSrc?'flex':'none';
  if(fld) fld.style.display=aiSrc?'none':'';
  if(intro) intro.innerHTML=aiSrc?AI_INTRO_ESCALADOR:AI_INTRO_ARCHIVO;
  if(!aiSrc){ if(btn) btn.textContent='Analizar y cotizar'; return; }
  $('ai-src-img').src=aiSrc.url;
  const n=aiSrc.medidas.length;
  $('ai-src-n').textContent=`${n} ${n===1?'medida calibrada':'medidas calibradas'} — se usan tal cual, sin redondear.`;
  if(btn) btn.textContent='Analizar las medidas y cotizar';
}
/* Al pasar de «la imagen medida» a «subir un archivo» también se limpia la selección
   anterior, por lo mismo que en aiOpen. */
function aiUsarArchivo(){ aiSrc=null; aiOlvidarArchivo(); aiPintarFuente(); }

/* ===================== El archivo que se va a analizar =====================
   El análisis leía directo de $('ai-file').files[0], y eso lo ataba al selector nativo: la
   única manera de entregarle un archivo a la IA era buscarlo en el disco. Un diseño que el
   cliente manda por WhatsApp había entonces que bajarlo primero y después ir a encontrarlo
   entre las descargas, con el cliente esperando. Ahora los tres caminos que un navegador
   ofrece para dar un archivo —elegirlo, arrastrarlo y pegarlo— escriben en aiArchivo, y
   aiAnalyze() lee solo de ahí. Todos pasan por aiArchivoElegido(), que es el único lugar
   donde se valida: el <input> filtraba por su accept=, y lo que se suelta no pasa por
   ningún filtro. */
let aiArchivo=null;
/* Las urls blob: de las miniaturas que están vivas. Se sueltan cuando el navegador YA cargó
   su imagen —ahí la url deja de hacer falta, la imagen ya está decodificada en pantalla— y
   no al pintar la siguiente: revocarla en ese momento la mataba mientras todavía se estaba
   cargando, y el navegador la reportaba como archivo no encontrado. La lista es la red para
   las que nunca lleguen a cargar; se vacía al cerrar el modal, que es el único momento en
   que con seguridad ninguna se está viendo. */
let _aiThumbs=[];
function aiThumbSoltar(u){
  if(!u||String(u).indexOf('blob:')!==0) return;
  const i=_aiThumbs.indexOf(u); if(i<0) return;
  _aiThumbs.splice(i,1);
  try{ URL.revokeObjectURL(u); }catch(_){}
}
function aiThumbLista(img){ aiThumbSoltar(img&&img.src); }
function aiThumbsSoltarTodas(){ _aiThumbs.slice().forEach(aiThumbSoltar); }
const AI_TIPOS_OK=/^(image\/|application\/pdf$)/i;
/* Lo que se suelta puede llegar sin type —pasa con algunos gestores de archivos y con lo que
   viene de otras apps—, y ahí lo único que queda es la extensión. El mapa sirve para las dos
   cosas: decidir si se acepta y, si se acepta, ponerle el tipo que le falta. */
const AI_MIME_EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  gif:'image/gif',bmp:'image/bmp',avif:'image/avif',heic:'image/heic',heif:'image/heif',
  svg:'image/svg+xml',pdf:'application/pdf'};
/* La lista de extensiones se saca del mismo mapa para que las dos no se puedan separar:
   aceptar una extensión cuyo tipo no se sepa es dejar entrar un archivo que más abajo se
   clasifica mal. */
const AI_EXT_OK=new RegExp('\\.('+Object.keys(AI_MIME_EXT).join('|')+')$','i');
function aiTipoAceptado(f){
  if(!f) return false;
  return f.type ? AI_TIPOS_OK.test(f.type) : AI_EXT_OK.test(f.name||'');
}
function aiEsImagen(f){
  if(!f) return false;
  return f.type ? f.type.indexOf('image/')===0 : !/\.pdf$/i.test(f.name||'');
}
function aiPeso(b){
  const kb=(b||0)/1024;
  return kb<1024 ? Math.max(1,Math.round(kb))+' KB' : (kb/1024).toFixed(1)+' MB';
}
/* Un solo punto de entrada para el selector, el arrastre y el pegado. `comoLlego` es para
   confirmar por dónde entró: soltar algo y que la pantalla no diga nada se lee como que no
   se soltó. */
function aiArchivoElegido(f,comoLlego){
  if(!f) return false;
  /* Arrastrar una CARPETA da una entrada de tamaño 0 y sin tipo, igual que un archivo que
     el sistema no alcanzó a entregar. Se mira antes que el tipo: una carpeta tampoco trae
     extensión, así que la guarda de abajo la atrapaba primero y contestaba «no es una
     imagen ni un PDF» —cierto, pero deja a quien la soltó sin saber qué hacer—. */
  if(!f.size){
    aiStatus('«'+(f.name||'eso')+'» llegó vacío — si es una carpeta, arrastra el archivo de dentro.','err');
    return false;
  }
  if(!aiTipoAceptado(f)){
    aiStatus('«'+(f.name||'ese archivo')+'» no es una imagen ni un PDF · la IA lee JPG, PNG y PDF.','err');
    return false;
  }
  /* Sin type, todo lo de más abajo se equivoca: en aiAnalyze() esPdf sale falso y un PDF se
     iría a un proveedor que solo lee imágenes; aiImagen() lo etiquetaría como JPEG; y
     Q.aiFile guardaría una data: url sin tipo, que urlImagenSegura() —con razón— no deja
     pintar, así que la vista previa saldría en blanco. Se le pone el de su extensión una
     sola vez, aquí, en vez de repetir la adivinanza en cada uno de esos lugares. */
  if(!f.type){
    const m=/\.([a-z0-9]+)$/i.exec(f.name||'');
    const tipo=AI_MIME_EXT[((m&&m[1])||'').toLowerCase()];
    if(tipo){ try{ f=new File([f],f.name,{type:tipo}); }catch(_){} }
  }
  aiArchivo=f;
  /* Soltar un archivo mientras se enseñaba la imagen del escalador es decir «analiza esto
     otro»: el modal cambia de cara solo, sin obligar a tocar «Analizar otro archivo». */
  if(aiSrc){ aiSrc=null; aiPintarFuente(); }
  aiPintarArchivo();
  aiStatus(comoLlego?('Archivo '+comoLlego+' · ya puedes analizarlo'):'', comoLlego?'ok':'');
  return true;
}
/* Suelta el archivo y la miniatura sin tocar el aviso en pantalla: lo usan aiOpen() y
   aiUsarArchivo(), que ponen su propio texto. */
function aiOlvidarArchivo(){
  aiArchivo=null;
  const fi=$('ai-file'); if(fi) fi.value='';
  aiPintarArchivo();
}
function aiQuitarArchivo(){
  aiOlvidarArchivo();
  aiStatus('','');
  const z=$('ai-drop'); if(z) try{ z.focus(); }catch(_){}
}
function aiPintarArchivo(){
  const el=$('ai-pick'); if(!el) return;
  if(!aiArchivo){ el.style.display='none'; el.innerHTML=''; return; }
  const f=aiArchivo, esImg=aiEsImagen(f);
  let mini='<div class="ai-pick-ph">'+ico('i-doc')+'</div>';
  if(esImg){
    try{
      const u=URL.createObjectURL(f); _aiThumbs.push(u);
      mini='<img class="ai-pick-img" src="'+u+'" alt="" onload="aiThumbLista(this)" onerror="aiThumbLista(this)">';
    }catch(_){}
  }
  el.style.display='flex';
  el.innerHTML=mini
    +'<div class="ai-pick-b"><div class="ai-pick-n">'+esc(f.name||'archivo')+'</div>'
    +'<div class="ai-pick-m">'+(esImg?'Imagen':'PDF')+' · '+aiPeso(f.size)+'</div></div>'
    +'<button type="button" class="ai-pick-x" onclick="aiQuitarArchivo()" title="Quitar este archivo" aria-label="Quitar el archivo elegido">×</button>';
}

/* ----- Arrastrar y pegar -----
   El arrastre se acepta en TODO el modal, no solo dentro del recuadro punteado: errarle al
   recuadro por veinte píxeles no tiene por qué costar el intento y volver a buscar el
   archivo. Lo que se resalta sí es el recuadro, que es donde se ve que va a caer. */
function aiTraeArchivo(e){
  const t=e.dataTransfer&&e.dataTransfer.types; if(!t) return false;
  const tiene=x=>Array.prototype.indexOf.call(t,x)>=0;
  return tiene('Files')||tiene('text/uri-list');
}
let _aiDragN=0;                 // dragleave también salta al pasar de un hijo a otro
function aiPintarArrastre(on){
  const z=$('ai-drop'); if(z) z.classList.toggle('sobre',!!on);
  const m=$('aimodal'); if(m) m.classList.toggle('arrastrando',!!on);
}
function aiDragEntra(e){ if(!aiTraeArchivo(e)) return; e.preventDefault(); _aiDragN++; aiPintarArrastre(true); }
function aiDragSobre(e){
  if(!aiTraeArchivo(e)) return;
  e.preventDefault();
  try{ e.dataTransfer.dropEffect='copy'; }catch(_){}
  /* Si el resaltado se apagó por un dragleave de más, aquí se vuelve a encender: sin esto
     el recuadro se apaga a media pasada y parece que ya no acepta nada. */
  if(!_aiDragN){ _aiDragN=1; aiPintarArrastre(true); }
}
function aiDragSale(e){
  if(!aiTraeArchivo(e)) return;
  _aiDragN=Math.max(0,_aiDragN-1);
  if(!_aiDragN) aiPintarArrastre(false);
}
function aiSoltar(e){
  if(!aiTraeArchivo(e)) return;
  e.preventDefault();
  _aiDragN=0; aiPintarArrastre(false);
  const dt=e.dataTransfer;
  const f=dt.files&&dt.files[0];
  if(f){
    /* Soltar varios a la vez es fácil sin querer. Se avisa dentro del mismo aviso que
       confirma el archivo: puesto aparte, el de aiArchivoElegido() lo pisaba enseguida. */
    const varios=dt.files.length>1?' (de '+dt.files.length+', se analiza el primero)':'';
    aiArchivoElegido(f,'soltado'+varios);
    return;
  }
  /* Una imagen arrastrada DESDE otra página no viaja como archivo: viaja como su
     dirección. Se intenta traerla —que es justo lo que ahorra el viaje al disco— y si el
     sitio no lo permite se dice qué sí funciona, en vez de un «no se pudo» a secas. */
  let url='';
  try{ url=(dt.getData('text/uri-list')||dt.getData('text/plain')||'').trim().split(/\s+/)[0]; }catch(_){}
  if(url) aiTraerDeUrl(url);
  else aiStatus('Eso que soltaste no traía ningún archivo.','err');
}
async function aiTraerDeUrl(url){
  if(!/^(https?:|data:|blob:)/i.test(url)){
    aiStatus('Eso que soltaste no es un archivo ni una imagen.','err'); return;
  }
  aiStatus('Trayendo la imagen de la página…','work');
  try{
    const r=await fetch(url,{mode:'cors'});
    if(!r.ok) throw new Error('respondió '+r.status);
    const b=await r.blob();
    if(!AI_TIPOS_OK.test(b.type||'')) throw new Error('no es una imagen');
    let nom='imagen';
    try{ nom=decodeURIComponent((url.split(/[?#]/)[0].split('/').pop()||'')).slice(0,80)||'imagen'; }catch(_){}
    aiArchivoElegido(new File([b],nom,{type:b.type}),'traído de la página');
  }catch(_){
    /* Casi siempre es CORS, y decir «CORS» no le sirve a nadie: lo que sirve es el camino
       que sí funciona con una imagen de otra página. */
    aiStatus('Ese sitio no deja traer la imagen directo. Cópiala (clic derecho › Copiar imagen) y pégala aquí.','err');
  }
}
/* Pegar es el camino que de verdad ahorra el viaje al disco: en WhatsApp Web o en el correo
   se copia la imagen y se pega aquí. Solo se atiende cuando el portapapeles trae un
   ARCHIVO, así que pegar una API key en su campo —o cualquier texto— sigue igual. */
document.addEventListener('paste',e=>{
  const m=$('aimodal'); if(!m||!m.classList.contains('show')) return;
  const cd=e.clipboardData; if(!cd) return;
  let f=cd.files&&cd.files[0];
  if(!f&&cd.items){
    for(let i=0;i<cd.items.length;i++){
      if(cd.items[i].kind==='file'){ f=cd.items[i].getAsFile(); if(f) break; }
    }
  }
  if(!f) return;
  e.preventDefault();
  /* Lo pegado del portapapeles casi nunca trae nombre («image.png» a secas o vacío), y en
     la miniatura y en la vista previa de la cotización ese nombre es lo único que lo
     identifica. */
  if(!f.name||f.name==='image.png'||f.name==='blob'){
    const ext=(f.type||'image/png').split('/')[1].replace('jpeg','jpg');
    try{ f=new File([f],'pegado.'+ext,{type:f.type||'image/png'}); }catch(_){}
  }
  aiArchivoElegido(f,'pegado');
});
/* Arrastrar un archivo a la ventana y errarle a la zona que lo espera hace que el navegador
   ABRA el archivo en su lugar: la app se va con él y con ella la cotización de la pantalla,
   sin un «atrás» que la devuelva. Se bloquea en toda la app, y solo para arrastres que
   traen archivos —el de reordenar partidas mueve texto y no se entera de esto—. Es una red
   por debajo: si algo ya lo atendió, aquí no se hace nada. */
['dragover','drop'].forEach(ev=>document.addEventListener(ev,e=>{
  if(e.defaultPrevented) return;
  const t=e.dataTransfer&&e.dataTransfer.types;
  if(t&&Array.prototype.indexOf.call(t,'Files')>=0) e.preventDefault();
}));
function aiStatus(msg,cls=''){
  const e=$('ai-status'); e.textContent=msg; e.className='ai-status '+cls;
  /* Por vozAlert los errores (role=alert, assertive) y por vozStatus el progreso, igual
     que toast(). Este bloque tenía su propia copia del truco del fotograma siguiente y
     además llamaba `voz` a la región: una const local que tapaba al helper del mismo
     nombre, así que dentro de aquí `voz(...)` habría reventado. */
  if(msg) voz(msg,cls==='err');
}
function fileToB64(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(f); }); }
function extractJSON(txt){
  try{ return JSON.parse(txt); }catch(_){}
  const m=txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(m){ try{ return JSON.parse(m[1].trim()); }catch(_){} }
  /* Sin el modo JSON del API —Groq y OpenRouter no siempre lo aceptan con imagen—
     el modelo suele anteponer una frase de cortesía al objeto. Se recorta desde la
     primera llave hasta la última. */
  const a=txt.indexOf('{'), b=txt.lastIndexOf('}');
  if(a>=0&&b>a){ try{ return JSON.parse(txt.slice(a,b+1)); }catch(_){} }
  /* Con la salida escrita: el análisis ya se gastó y volver a apretar el mismo botón con la
     misma foto vuelve a fallar. Lo que arregla esto es otra foto o el archivo recortado, y
     eso no se adivina desde «no se pudo interpretar». La nota de cuántos intentos se hicieron
     se queda: ésa sí sirve para decidir si hace falta otra key. */
  throw new Error('La IA contestó algo que no es una cotización. Suele arreglarse con otra foto más nítida, o con el archivo recortado a lo que se va a cotizar.');
}

/* ===== Reintentos, respaldo entre proveedores e imágenes más ligeras =====
   Los planes gratuitos devuelven 503 «model is overloaded» y 429 «rate limit» a
   cualquier hora del día. Eso llegaba a pantalla como un error seco y el vendedor
   tenía que volver a pulsar «Analizar» hasta que sonara la flauta —a veces cinco o
   seis veces, con el cliente enfrente—. Ahora la app hace sola esa insistencia: 4
   intentos con esperas crecientes y, si el proveedor sigue caído, pasa al siguiente
   modelo y al siguiente proveedor que tenga key guardada, diciendo en todo momento
   con quién está hablando. */
const AI_NOMBRE={gemini:'Gemini',groq:'Groq',openrouter:'OpenRouter'};
const AI_DEFAULTS={gemini:'gemini-2.5-flash',groq:'meta-llama/llama-4-scout-17b-16e-instruct',openrouter:'meta-llama/llama-4-scout:free'};
/* Modelos hermanos a los que se cae cuando el elegido está saturado: cuando el
   2.5-flash no da abasto, el lite y el 2.0 suelen contestar a la primera porque no
   comparten la misma cola. Sirven también de red para un nombre de modelo mal
   escrito a mano, que si no dejaba al proveedor inservible hasta corregirlo. */
const AI_RESPALDO={
  gemini:['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash'],
  groq:['meta-llama/llama-4-scout-17b-16e-instruct','meta-llama/llama-4-maverick-17b-128e-instruct'],
  openrouter:[]  // el catálogo cambia seguido; no se adivinan slugs que quizá no existan
};
const AI_TIMEOUT=90000;
/* Con el proveedor elegido se insiste de verdad —4 intentos, hasta 11 s de esperas—
   porque es el que el usuario quiere usar. Con los de respaldo no: si el primero
   está caído, lo que importa es contestar pronto, no agotar la cola de cada uno. */
const AI_ESPERAS=[1200,3000,7000];
const AI_ESPERAS_RESPALDO=[1500];
const AI_IMG_MAX=1600, AI_IMG_Q=0.85;
const aiSleep=ms=>new Promise(r=>setTimeout(r,ms));
const aiEtq=c=>`${AI_NOMBRE[c.prov]||c.prov} · ${c.model}${c.nk>1?` · key ${c.kn}`:''}`;


/* Una foto de celular pesa entre 3 y 8 MB y en base64 crece otro 33%. Gemini lo
   aguanta; Groq la rechaza por tamaño y en 4G la subida tarda tanto que parece que
   la app se colgó. 1600 px es lo mismo que manda el escalador y de sobra para leer
   una cota. Si el navegador no sabe abrir el archivo —HEIC de iPhone en Android—
   se manda tal cual y que conteste el proveedor. */
async function aiImagen(f){
  const crudo=async()=>({b64:await fileToB64(f),mime:f.type||'image/jpeg'});
  if(f.type==='application/pdf') return crudo();
  try{
    const img=await new Promise((res,rej)=>{
      const u=URL.createObjectURL(f), im=new Image();
      im.onload=()=>{ URL.revokeObjectURL(u); res(im); };
      im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('no se pudo abrir la imagen')); };
      im.src=u;
    });
    const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    if(!w||!h) return crudo();
    const k=Math.min(1,AI_IMG_MAX/Math.max(w,h));
    if(k===1&&f.size<=1200000) return crudo();  // ya es ligera: no se recomprime de gratis
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
    const ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,c.width,c.height);
    return {b64:c.toDataURL('image/jpeg',AI_IMG_Q).split(',')[1],mime:'image/jpeg'};
  }catch(_){ return crudo(); }
}

/* Un 503 con página HTML de por medio, o un corte de red, reventaba dentro de
   res.json() y salía a pantalla como «Unexpected token <», que no le dice nada a
   nadie y encima no se distinguía de un error de verdad. Aquí se lee el cuerpo como
   texto y se intenta interpretar después. */
async function aiFetch(url,opts){
  const ctl=new AbortController();
  _aiAbort=ctl;   // para que cerrar el modal pueda cortar la petición en vuelo
  const t=setTimeout(()=>ctl.abort(),AI_TIMEOUT);
  let res;
  try{
    res=await fetch(url,Object.assign({},opts,{signal:ctl.signal}));
  }catch(e){
    /* Cancelar no es un fallo del proveedor: si se reintentara, cerrar el modal no
       cancelaría nada — la cadena seguiría dando vueltas sola. */
    if(_aiCancelado){ const c=new Error('análisis cancelado'); c.cancelado=true; throw c; }
    const err=new Error(e&&e.name==='AbortError'
      ? 'el proveedor tardó demasiado en responder'
      : 'no se pudo conectar con el proveedor (revisa tu conexión)');
    err.transitorio=true; throw err;
  }finally{ clearTimeout(t); if(_aiAbort===ctl) _aiAbort=null; }
  const txt=await res.text().catch(()=>'');
  let data=null; try{ data=JSON.parse(txt); }catch(_){}
  return {res,data,txt};
}
/* Qué salió mal, en una frase que se pueda leer, y sobre todo: ¿vale la pena
   reintentar? Saturación y límites por minuto sí; una key inválida no. OpenRouter
   contesta algunos errores con HTTP 200 y el código real dentro del cuerpo, así que
   el estado se toma de ahí cuando viene. */
function aiError(r,prov,model){
  const e=r.data&&r.data.error;
  const crudo=((typeof e==='string'?e:(e&&(e.message||e.msg)))||(r.data&&r.data.message)||
               (r.txt||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,140);
  const s=(e&&typeof e.code==='number'&&e.code>=100)?e.code:r.res.status;
  const n=AI_NOMBRE[prov]||prov;
  let msg,trans=false;
  if(s===429){ msg=`${n} alcanzó su límite de peticiones`; trans=true; }
  else if(s===408||s>=500){ msg=`${n} está saturado`; trans=true; }
  else if(s===401||s===403) msg=`la API key de ${n} no es válida o no tiene permiso`;
  else if(s===404) msg=`${n} no reconoce el modelo «${model}»`;
  else if(s===413) msg=`el archivo pesa demasiado para ${n}`;
  else msg=`${n} rechazó la petición (HTTP ${s})`;
  const err=new Error(crudo?`${msg} — ${crudo}`:msg);
  err.transitorio=trans; err.status=s; err.crudo=crudo;
  return err;
}
function aiVacio(prov,razon){
  const n=AI_NOMBRE[prov]||prov, r=String(razon||'').toUpperCase();
  const err=new Error(
    /SAFETY|BLOCK|RECITATION|PROHIBIT/.test(r) ? `${n} bloqueó la imagen con sus filtros de contenido`
    : /MAX_TOKEN|LENGTH/.test(r)               ? `${n} cortó la respuesta antes de terminar el JSON`
    : `${n} respondió vacío`);
  err.transitorio=!r;   // vacío sin motivo declarado suele ser un hipo del proveedor
  return err;
}

async function aiLlamar(c,prompt,b64,mime,sinJson){
  if(c.prov==='gemini'){
    const body={contents:[{parts:[{text:prompt},{inline_data:{mime_type:mime,data:b64}}]}],generationConfig:{responseMimeType:'application/json',temperature:0.2}};
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.key)}`;
    const r=await aiFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.res.ok||(r.data&&r.data.error)||!r.data) throw aiError(r,c.prov,c.model);
    const cand=(r.data.candidates||[])[0];
    const txt=((cand&&cand.content&&cand.content.parts)||[]).map(p=>p.text||'').join('').trim();
    if(!txt) throw aiVacio(c.prov,(cand&&cand.finishReason)||(r.data.promptFeedback&&r.data.promptFeedback.blockReason));
    return extractJSON(txt);
  }
  const URLS={groq:'https://api.groq.com/openai/v1/chat/completions',openrouter:'https://openrouter.ai/api/v1/chat/completions'};
  const hdrs={'Content-Type':'application/json','Authorization':'Bearer '+c.key};
  if(c.prov==='openrouter'){ hdrs['HTTP-Referer']=location.origin; hdrs['X-Title']='Cotizador AL3D'; }
  const body={model:c.model,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${mime};base64,${b64}`}}]}],temperature:0.2,max_tokens:4096};
  if(!sinJson) body.response_format={type:'json_object'};
  const r=await aiFetch(URLS[c.prov],{method:'POST',headers:hdrs,body:JSON.stringify(body)});
  if(!r.res.ok||(r.data&&r.data.error)||!r.data){
    const err=aiError(r,c.prov,c.model);
    /* Buena parte de los modelos de visión no aceptan el modo JSON del API cuando va
       una imagen en la misma petición, y contestan un 400 que reintentar no arregla
       —era el «Groq no me funciona» de siempre—. Quitar la opción sí lo arregla: el
       prompt ya pide «SOLO un JSON valido» y extractJSON sabe pelar el ```json. */
    if(!sinJson&&err.status===400&&/json|response_format|schema|format/i.test(err.crudo||''))
      return aiLlamar(c,prompt,b64,mime,true);
    throw err;
  }
  const ch=(r.data.choices||[])[0];
  const txt=((ch&&ch.message&&ch.message.content)||'').trim();
  if(!txt) throw aiVacio(c.prov,ch&&ch.finish_reason);
  return extractJSON(txt);
}

/* Un candidato = un proveedor con un modelo. Se insiste con él mientras el fallo sea
   pasajero; lo demás se devuelve enseguida para que la cadena pase al siguiente. */
async function aiCandidato(c,prompt,b64,mime,verbo,esperas,hayMas){
  const E=esperas||AI_ESPERAS;
  for(let i=0;;i++){
    try{
      aiStatus(`${verbo} con ${aiEtq(c)}…${i?` (intento ${i+1} de ${E.length+1})`:''}`,'work');
      return await aiLlamar(c,prompt,b64,mime,false);
    }catch(e){
      /* Un 429 es cuota de ESA key: esperar no la devuelve, y si hay otra key u otro
         proveedor esperando turno, probarlo es más rápido y más seguro que dormir. */
      if(e.status===429&&hayMas) throw e;
      if(e.cancelado) throw e;
      if(!e.transitorio||i>=E.length) throw e;
      aiStatus(`⏳ ${e.message} · reintentando en ${Math.round(E[i]/1000)} s…`,'work');
      await aiSleep(E[i]);
    }
  }
}
/* Las keys de un mismo proveedor se turnan: cada análisis empieza por una distinta
   para repartir la cuota del día, en vez de quemar siempre la primera hasta agotarla
   y pagar un 429 en cada cotización a partir de ahí. Conservan su número de la lista
   para que la pantalla pueda decir cuál está usando. */
function aiKeysRotadas(p){
  const ks=getKeys(p).map((k,i)=>({key:k,n:i+1}));
  if(ks.length<2) return ks;
  let i=0; try{ i=(+(localStorage.getItem('ai_key_rot_'+p)||0)||0)%ks.length; }catch(_){}
  return ks.slice(i).concat(ks.slice(0,i));
}
function aiAvanzarTurno(p,n){
  if(n<2) return;
  try{ localStorage.setItem('ai_key_rot_'+p,String(((+(localStorage.getItem('ai_key_rot_'+p)||0)||0)+1)%n)); }catch(_){}
}
/* El orden en que se va a intentar. Primero el proveedor elegido: el modelo elegido
   con TODAS sus keys —la cuota gratuita va por key, así que otra cuenta es cuota
   nueva— y después sus modelos hermanos con una sola, porque un modelo saturado no
   lo arregla cambiar de cuenta. Luego lo mismo con los demás proveedores que tengan
   keys guardadas. Solo se usan keys ya guardadas en este dispositivo: la app no
   manda nada a un proveedor que el usuario no haya configurado. */
const AI_MAX_INTENTOS=12;
function aiCadena(prov,model,esPdf){
  const out=[], vistos=new Set();
  const push=(p,m,k,kn,nk)=>{
    if(!k||!m) return; const id=p+'|'+m+'|'+kn; if(vistos.has(id)) return;
    vistos.add(id); out.push({prov:p,model:m,key:k,kn,nk});
  };
  const bloque=(p,primero)=>{
    const ks=aiKeysRotadas(p); if(!ks.length) return;
    ks.forEach(x=>push(p,primero,x.key,x.n,ks.length));
    (AI_RESPALDO[p]||[]).forEach(m=>push(p,m,ks[0].key,ks[0].n,ks.length));
    aiAvanzarTurno(p,ks.length);
  };
  /* Groq y OpenRouter no leen PDF: con un PDF en la mano el único que sirve es
     Gemini, aunque el proveedor elegido en el modal sea otro. */
  if(!(esPdf&&prov!=='gemini')) bloque(prov,model);
  AI_PROVS.forEach(p=>{ if(p===prov||(esPdf&&p!=='gemini')) return; bloque(p,localStorage.getItem('ai_model_'+p)||AI_DEFAULTS[p]); });
  return out.slice(0,AI_MAX_INTENTOS);
}

let aiTrabajando=false;
/* Qué se intentó de verdad en la última corrida, para que el mensaje de error no cuente
   keys que la cadena excluyó a propósito. */
let _aiIntentados=0, _aiProvsProbados=0, _aiEraPdf=false;
/* El análisis en curso, para poder cancelarlo al cerrar el modal. */
let _aiAbort=null, _aiCancelado=false;

async function aiAnalyze(){
  if(aiTrabajando) return;   // el botón queda deshabilitado, pero el Enter del teclado no
  /* La misma guarda que ya tiene scCotizarConIA. Sin ella, un análisis sobre una
     cotización autorizada la devolvía a borrador y le borraba el precio: había que volver
     a pedir la autorización con el cliente enfrente. */
  if(locked()){ aiStatus('La cotización está autorizada · usa «Editar partidas» antes de analizar','err'); return; }
  const f=aiArchivo;
  if(!aiSrc && !f){ aiStatus('Arrastra aquí el archivo, pégalo, o toca el recuadro para elegirlo.','err'); return; }
  const esPdf=!aiSrc && f.type==='application/pdf';
  /* Con un PDF y Groq/OpenRouter elegidos, antes esto era un callejón sin salida:
     había que entrar a Configuración y cambiar de proveedor a mano. Si la key de
     Gemini ya está guardada, se usa esa y ya. */
  if(esPdf && aiProv!=='gemini' && !getKey('gemini')){
    aiStatus('Groq y OpenRouter solo admiten imágenes JPG. Para PDF guarda tu API key de Gemini en Configuración.','err');
    $('ai-cfg-box').open=true; return;
  }
  /* Una key pegada en el campo y sin «Agregar» cuenta igual: el reflejo de pegar y
     darle a Analizar es el de siempre y no tiene por qué costar un paso extra. */
  if($('ai-key-'+aiProv).value.trim()){ addKey(aiProv,$('ai-key-'+aiProv).value); $('ai-key-'+aiProv).value=''; aiRenderKey(aiProv); }
  const model=($('ai-model-'+aiProv).value.trim())||AI_DEFAULTS[aiProv];
  const soloGemini=esPdf&&aiProv!=='gemini';   // el PDF se va a Gemini: las keys del elegido no hacen falta
  if(!getKeys(aiProv).length&&!soloGemini){ $('ai-cfg-box').open=true; aiEditKey(aiProv); aiStatus('Pega tu API key de '+(AI_NOMBRE[aiProv]||aiProv)+'.','err'); return; }
  /* Recordar la preferencia es un lujo; poder analizar no. Sin el try, con el
     almacenamiento lleno esto lanzaba aquí mismo y el análisis no arrancaba. */
  try{ localStorage.setItem('ai_model_'+aiProv,model); localStorage.setItem('ai_provider',aiProv); }catch(_){}
  const verbo=aiSrc?'Analizando la imagen medida':'Analizando';
  aiStatus(verbo+'…','work');
  const btn=$('ai-go-btn'); aiTrabajando=true; if(btn) btn.disabled=true;
  try{
    /* La imagen del escalador ya viene lista en base64 —la dibuja scImagenParaIA con
       sus cotas encima y ya reducida—, así que no hay archivo que leer ni que
       comprimir. Y como esas cotas son medidas reales, al prompt se le añade la
       lista para que las use tal cual. */
    const {b64,mime}=aiSrc?{b64:aiSrc.url.split(',')[1],mime:aiSrc.mime||'image/jpeg'}:await aiImagen(f);
    const prompt=aiSrc?PROMPT_IA+promptMedidas(aiSrc.medidas):PROMPT_IA;
    const cadena=aiCadena(aiProv,model,esPdf);
    if(!cadena.length) throw new Error('no hay ninguna API key guardada para analizar este archivo');
    let parsed=null,usado=null,ultimo=null;
    let intentados=0;
    for(let i=0;i<cadena.length;i++){
      intentados++;
      try{ parsed=await aiCandidato(cadena[i],prompt,b64,mime,verbo,i?AI_ESPERAS_RESPALDO:AI_ESPERAS,i<cadena.length-1); usado=cadena[i]; break; }
      catch(e){
        ultimo=e;
        if(e.cancelado) break;   // el modal se cerró: no se sigue con la cadena
        /* Un 404 es «ese modelo no existe», no «esa key no sirve»: repetirlo con las otras
           keys del mismo proveedor es gastar intentos en el mismo error. El README promete
           justo esto —«los errores que no se arreglan reintentando no gastan intentos»— y
           para el 404 no se cumplía. */
        if(e.status===404){
          while(i+1<cadena.length&&cadena[i+1].prov===cadena[i].prov&&cadena[i+1].model===cadena[i].model) i++;
        }
        if(i<cadena.length-1) aiStatus(`${e.message} · probando con ${aiEtq(cadena[i+1])}…`,'work');
      }
    }
    _aiIntentados=intentados;
    _aiProvsProbados=new Set(cadena.slice(0,intentados).map(c=>c.prov)).size;
    _aiEraPdf=esPdf;
    if(_aiCancelado) return;   // el usuario cerró el modal a media petición
    if(!parsed) throw ultimo||new Error('No se pudo analizar el archivo.');
    /* La foto del escalador no se guarda como "archivo de IA": ya se ve, con sus
       cotas, en la vista previa del escalador que está junto a las partidas.
       Duplicarla solo repetiría la misma imagen dos veces en la pantalla. */
    /* Se guarda y se pinta aquí mismo: si la IA no devolvió partidas, applyAi no
       re-renderiza y antes la miniatura del archivo analizado no llegaba a aparecer. */
    if(!aiSrc){
      Q.aiFile={name:f.name,type:mime,url:'data:'+mime+';base64,'+b64};
      saveState(); renderAiPreview();
    }
    const medidas=(aiSrc&&aiSrc.origen==='escalador')?aiSrc.medidas.length:0;
    const creadas=applyAi(parsed);
    if(!creadas){
      aiStatus('La IA no detectó ninguna partida en este archivo. Prueba con otra foto, o captura a mano.','err');
      if(medidas) toast('La IA no devolvió ninguna partida — tus medidas siguen ahí para agregarlas a mano','err',5600);
      return;   // sin cerrar el modal, sin felicitar y sin marcar las medidas como usadas
    }
    /* Si contestó un modelo distinto al elegido conviene decirlo: el borrador puede
       venir de otra IA y quien lo revisa tiene derecho a saber de cuál. */
    const cambio=usado.prov!==cadena[0].prov||usado.model!==cadena[0].model;
    aiStatus(cambio
      ? `${AI_NOMBRE[cadena[0].prov]} no respondió · borrador generado con ${aiEtq(usado)}. Revísalo antes de autorizar.`
      : 'Borrador generado. Revísalo y ajústalo antes de autorizar.','ok');
    if(cambio) toast(`⚠️ ${aiEtq(cadena[0])} no respondió · lo resolvió ${aiEtq(usado)}`,'',5200);
    if(medidas){
      scMarcarMedidasUsadas();
      /* Se le pidió una partida por medida, pero el modelo puede saltarse o juntar
         elementos. Si las cuentas no cuadran conviene decirlo: quien midió sabe
         cuántas cosas midió y es el único que puede notar la que falta. */
      const dio=creadas;
      toast(dio&&dio!==medidas
        ? `⚠️ La IA devolvió ${dio} ${dio===1?'partida':'partidas'} para ${medidas} medidas — revisa cuál falta`
        : `${medidas} ${medidas===1?'medida cotizada':'medidas cotizadas'} con IA (borrador)`,
        dio&&dio!==medidas?'':'ok', dio&&dio!==medidas?6000:3200);
    } else {
      toast('Cotización IA lista (borrador)','ok');
    }
    setTimeout(aiClose,1500);
  }catch(e){
    if(e&&e.cancelado) return;   // se canceló a propósito: no hay error que enseñar
    /* Si solo hay una API cargada, insistir más no arregla nada: lo que lo arregla es
       tener a dónde caerse. Se dice aquí, que es cuando duele.
       Y se cuenta lo que se intentó, no lo que hay guardado. «Se probaron las 5 APIs
       cargadas» era falso al analizar un PDF: ahí la cadena solo lleva Gemini, porque Groq
       y OpenRouter no leen PDF, y el mensaje culpaba a keys que nadie tocó. */
    const probados=_aiIntentados;
    const nota=probados>1
      ? ' · Se probaron '+probados+' combinaciones en '+_aiProvsProbados+(_aiProvsProbados===1?' proveedor':' proveedores')+'.'
        +((_aiEraPdf&&_aiProvsProbados===1)?' Groq y OpenRouter no leen PDF, así que no se intentaron.':'')
      : (e.transitorio
          ? ' · Ya reintenté varias veces con la única API cargada. En Configuración puedes agregar más keys —de este proveedor o de otro— y la app irá cambiando sola cuando esto vuelva a pasar.'
          : '');
    aiStatus('Error: '+e.message+nota,'err');
  }finally{
    aiTrabajando=false; _aiAbort=null;
    const b=$('ai-go-btn'); if(b) b.disabled=false;
  }
}

/* La respuesta del modelo es el único dato que entra de fuera del dispositivo, y se
   trataba con demasiada confianza: los enums (tipo, material, acabado) sí se validaban con
   cuidado, pero los campos de texto se asignaban tal cual. Un modelo que devolviera
   "cliente": 33128 o "notas":["a","b"] dejaba Q.cliente sin .trim y reventaba el render a
   media asignación —con Q.items ya reemplazado—, así que el estado roto se guardaba y la
   app dejaba de arrancar. Los números tampoco tenían piso: un altura_cm negativo restaba
   del total. */
const aiTxt=v=>typeof v==='string'?v.trim():'';
const aiNum=v=>{ const n=parseFloat(v); return Number.isFinite(n)&&n>0?n:0; };
/* Excepción deliberada a «ninguna puerta abierta»: aquí NO se vuelve a preguntar por los
   datos del cliente. `aiOpen` ya los pidió al abrir el modal; la escritura ocurre medio
   minuto después, cuando el análisis ya se pagó y ya terminó, y frenarlo aquí lo tiraría a
   la basura para impedir un caso que exige borrar el teléfono a propósito mientras la IA
   trabaja. Además la IA llena el cliente y el proyecto en esta misma pasada y el teléfono
   no lo saca de un JPG nunca, así que revalidar aquí fallaría casi siempre por el único
   dato que no puede traer. Lo que pasa es lo correcto: las partidas entran, y el candado
   se vuelve a cerrar sobre ellas si de verdad falta algo. No se pierde nada. */
function applyAi(p){
  if(!p||typeof p!=='object') return 0;
  if(locked()) return 0;
  p.proyecto=aiTxt(p.proyecto); p.cliente=aiTxt(p.cliente); p.direccion=aiTxt(p.direccion);
  if(p.proyecto){ Q.proy=p.proyecto; if($('f-proy')) $('f-proy').value=p.proyecto; }
  if(p.cliente){ Q.cliente=p.cliente; if($('f-cli')) $('f-cli').value=p.cliente; }
  /* Antes esto escribía en un campo #f-dir que ya no existe, así que la dirección
     detectada se quedaba invisible. Se llena el campo real y solo si está vacío,
     para no pisar lo que ya escribió el vendedor. */
  if(p.direccion){
    Q.direccion=p.direccion;
    if(!(Q.dirRaw||'').trim()){ if($('f-dir-raw')) $('f-dir-raw').value=p.direccion; updDirRaw(p.direccion); }
  }
  if(Array.isArray(p.partidas) && p.partidas.length){
    const nuevos=[];
    p.partidas.forEach(x=>{
      const it={id:++pid,tipo:'letras',material:'',comp:'',luz:true,altura:0,n:0,tarifa:0,ancho:0,alto:0,acab:'',recComp:false,bas:'',desc:'',descAi:false,pz:1,pu:0,showInPdf:true};
      if(!x||typeof x!=='object') x={};
      it.tipo=['letras','recorte','bastidor','caja','manual'].includes(x.tipo)?x.tipo:'letras';
      it.desc=aiTxt(x.descripcion); it.descAi=!!it.desc;
      if(it.tipo==='letras'){
        it.material=['al-paint','al-brush','acr-vol','acr-vinil','acero'].includes(x.material)?x.material:'';
        it.comp=['recta','cursiva','compleja'].includes(x.complejidad)?x.complejidad:'recta';
        it.altura=aiNum(x.altura_cm); it.n=Math.round(aiNum(x.n_letras)); it.luz=(x.iluminacion!==false);
        const aiNotes=(aiTxt(x.notas)||aiTxt(x.descripcion)).toLowerCase();
        it.ilumTipo=aiNotes.match(/c[aá]lid/)?'calida':'fria';
      } else if(it.tipo==='recorte'){
        it.acab=['sencillo','vinil','sandwich'].includes(x.acabado)?x.acabado:'sencillo';
        it.recComp=(it.acab==='sandwich' && x.complejidad==='compleja');
        it.altura=aiNum(x.altura_cm); it.n=Math.round(aiNum(x.n_letras)||aiNum(x.piezas));
      } else if(it.tipo==='bastidor'){
        it.bas=['lamina','alucobond'].includes(x.bastidor)?x.bastidor:'lamina';
        it.ancho=aiNum(x.ancho_cm); it.alto=aiNum(x.alto_cm);
      } else if(it.tipo==='caja'){
        it.tarifa=aiNum(x.tarifa)||3900; it.ancho=aiNum(x.ancho_cm); it.alto=aiNum(x.alto_cm);
      } else {
        it.pz=Math.round(aiNum(x.piezas))||1; it.pu=aiNum(x.precio_unitario);
        if(!it.desc) it.desc=aiTxt(x.notas);
      }
      nuevos.push(it);
    });
    const conservadas=aiMerge?Q.items.filter(it=>!itemVacio(it)):[];
    Q.items=conservadas.concat(nuevos);
    // La cotización vuelve a borrador: cualquier precio autorizado antes ya no aplica
    // a estas partidas nuevas.
    Q.estado='borrador'; Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth='';
    sincronizarPlegado();
    renderItems();
    if(conservadas.length) toast(`${conservadas.length} partida${conservadas.length>1?'s':''} tuya${conservadas.length>1?'s':''} + ${nuevos.length} de la IA`,'ok',3600);
    return nuevos.length;
  }
  /* Devuelve cuántas partidas creó. Antes no devolvía nada y quien llamaba daba por hecho
     que había funcionado: con una respuesta sin partidas la pantalla anunciaba éxito en
     verde y cerraba el modal, sin que se hubiera agregado una sola. */
  /* Por esta rama se sale habiendo escrito el cliente y el proyecto —arriba— y nada más.
     Los inputs se llenaron a mano, y asignarle `.value` a un input NO dispara su `oninput`,
     así que `upd()` nunca corre: sin este repintado la barra de completitud, el ámbar de
     los huecos y el candado de las partidas se quedaban con la cuenta anterior, diciendo
     que falta el cliente con el cliente ya escrito por la IA. Y sin el guardado, un
     recargón se llevaba los dos datos que sí llegaron. */
  updProg(); saveState();
  return 0;
}

