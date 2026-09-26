/* ============================================================================
   Cotizador · ia.js

   Cotizar con IA: proveedores, API keys, el archivo a analizar, arrastrar y pegar, reintentos y respaldo entre proveedores.

   Es un script CLÁSICO, no un módulo ES, y el orden de carga lo fija cotizador.html. Los
   once archivos comparten el mismo ámbito global —como cuando eran un solo <script> en
   línea—, así que un `let` o una `function` de un archivo se ve desde los demás, y los
   161 manejadores en línea del marcado (onclick, oninput…) siguen resolviendo contra ese
   ámbito. Portarlo a módulos ES los dejaría mudos en silencio: ver js/mod/cotizador.js.

   Hasta septiembre de 2026 todo esto vivía en línea dentro de cotizador.html, en un solo
   bloque de diez mil líneas. Se repartió por dominio, sin cambiar una línea de lógica.
   ============================================================================ */

/* ===================== IA (Qwen, DeepSeek y Gemini) ===================== */
const PROMPT_IA = `Eres un asistente experto en cotizacion para "AL3D", empresa que fabrica letras 3D (caras de acrilico, cantos de aluminio o de acero inoxidable), recortes de acrilico, bastidores y cajas de luz.

Analiza la imagen o PDF y DESGLOSA CADA ELEMENTO por separado en distintas partidas. Devuelve SOLO un JSON valido, sin texto adicional:
{"proyecto":"","cliente":"","direccion":"","partidas":[{"tipo":"letras|recorte|bastidor|caja|manual","material":"al-paint|al-brush|acr-vol|acr-vinil|acero","complejidad":"recta|cursiva|compleja","acabado":"sencillo|vinil|sandwich","bastidor":"lamina|alucobond","altura_cm":0,"n_letras":0,"iluminacion":true,"tarifa":0,"ancho_cm":0,"alto_cm":0,"descripcion":"","piezas":1,"precio_unitario":0,"notas":""}]}

=== CÓMO DISTINGUIR tipos (LEE ESTO PRIMERO — ORDEN DE PRIORIDAD) ===
- tipo "letras": ES EL TIPO POR DEFECTO. Texto, letras, iconos y logos con profundidad/volumen. Ante CUALQUIER DUDA entre letras y recorte, SIEMPRE elige letras. Es el tipo más común en todos los proyectos.
- tipo "caja": cuando hay una SILUETA COMPLETA de logotipo, figura, mascota, animal o icono que funciona como una forma unica iluminada (no son letras individuales separadas). REGLA: si la imagen muestra un dibujo, figura o logo completo como silueta → SIEMPRE tipo "caja" con tarifa 4600 (tipo nube/silueta). Incluye ancho_cm y alto_cm.
- tipo "recorte": Dos casos, y solo dos. (a) OBLIGATORIO POR ALTURA: si el elemento mide MENOS DE 10 cm de alto, es recorte SIEMPRE, sin excepcion y aunque el plano diga "letras 3D", "cantos en aluminio" o "iluminado": a esa medida no hay volumen que fabricar, el taller lo corta plano en acrilico. (b) ULTIMO RECURSO: cuando el diseno especifica EXPLICITAMENTE que el elemento es plano/2D, sin profundidad y sin iluminacion interna. Fuera de esos dos casos NUNCA uses recorte si tienes la minima duda — elige letras en su lugar.
REGLA DE ORO: letras (default para todo texto e iconos) > caja (silueta o figura completa) > bastidor (panel de fondo) > recorte (solo si el cliente lo pide explicitamente, muy raro). La regla de oro NO aplica por debajo de 10 cm de altura: ahi manda la regla de los 10 cm y el tipo es "recorte", venga de donde venga el elemento.

=== REGLA PRINCIPAL: DESGLOSA SIEMPRE ===
NUNCA pongas un logotipo completo como una sola partida. Separa cada elemento:
1. Si hay un SIMBOLO, ICONO o LOGOTIPO con VOLUMEN/PROFUNDIDAD (dice "Cantos en Aluminio", "3D", o se ven los lados en la imagen) → tipo "letras". Si es PLANO y sin profundidad → tipo "recorte".
2. Si hay TEXTO principal (nombre/marca) → partida tipo "letras", cuenta CADA letra individual (sin espacios).
3. Si hay SLOGAN o texto secundario con diferente tamaño o tipografia → partida tipo "letras" SEPARADA.
4. Si hay diferentes alturas en el mismo texto → crea una partida por cada grupo de altura distinta.
5. Si hay diferentes materiales en el mismo diseno → una partida por material.
6. PERO un bastidor o una caja de luz es UN elemento aunque lleve DOS cotas: su ancho y su alto van en la MISMA partida (ancho_cm y alto_cm), nunca en dos. Desglosar es separar elementos distintos, no partir un elemento por sus lados.

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
- REGLA DE CORCHETES — LA UNICA EXCEPCION (EL PAR ANCHO + ALTO): un bastidor y una caja de luz NO se cobran por altura sino por AREA, asi que se acotan con DOS corchetes del MISMO elemento: uno horizontal (el ANCHO) y uno vertical (el ALTO). Ese par NO son dos partidas: es UNA SOLA partida con ancho_cm y alto_cm. Una caja de luz con un corchete de 200 cm horizontal y otro de 100 cm vertical = UNA partida tipo caja con ancho_cm=200 y alto_cm=100; NUNCA una partida de 200 y otra de 100. Al contar corchetes, cada par ancho+alto del mismo elemento cuenta como 1.
- NUNCA devuelvas una partida de tipo bastidor o caja con una sola de las dos medidas. Si solo ves un corchete, busca el otro lado en la imagen; si de verdad no esta, deja el que falta en 0 y dilo en "notas" — pero no partas el elemento en dos partidas.
- REGLA DE CORCHETES — PASO 3: Verifica antes de responder que el numero de partidas en tu JSON coincide con el numero de corchetes que contaste, contando cada par ancho+alto de un bastidor o una caja como uno solo. Si no coincide, agrega las partidas faltantes.
- REGLA DE TEXTOS DESCRIPTIVOS: Los planos suelen tener bloques de texto con especificaciones (ej. "Letras Individuales 3D: Cara en Acrilico Blanco, Cantos en Aluminio Blanco"). Cada bloque de texto descriptivo aplica al elemento visual mas cercano o al que apunta. Cuando hay DOS bloques de texto distintos → son elementos distintos con especificaciones distintas. LEE y USA esos textos para rellenar material, tipo e iluminacion de CADA partida. NUNCA dejes una partida sin descripcion ni sin material si hay texto en la imagen que la describa.
- REGLA ANTI-PARTIDA-VACIA: Una partida con todos los campos en 0 o vacios es invalida. Si creaste una partida para cumplir el conteo de corchetes pero no la llenaste, busca en la imagen el elemento visual y el texto descriptivo que corresponden a ese corchete y rellena todos sus campos.
- altura_cm: el valor numerico que muestra el corchete apuntando a ese elemento. En letras y recorte no importa si el corchete es vertical u horizontal: usa ese numero tal cual como centimetros. NUNCA ignores un corchete porque sea horizontal o apunte al ancho. En bastidor y caja SI importa: el corchete horizontal va en ancho_cm y el vertical en alto_cm, los dos en la MISMA partida (ver la excepcion del par ancho + alto).
- Cuando hay MULTIPLES corchetes: asigna el valor de cada corchete al elemento al que apunta. NUNCA uses la misma medida para elementos distintos. NUNCA omitas un corchete.
- Ejemplo para imagen con 2 bloques de texto + 3 corchetes (92cm ondas, 19cm circulo, 62cm letras): → Partida 1: ondas, acr-vinil, altura_cm=92, n_letras=4 (piezas de onda). Partida 2: circulo, acr-vinil, altura_cm=19, n_letras=1. Partida 3: letras "National", acr-vol, altura_cm=62, n_letras=8. TRES partidas completas, ninguna vacia.
- Material de letras: al-paint=Aluminio pintado ($30/cm), al-brush=Aluminio brush cepillado ($35/cm), acr-vol=Acrilico+Aluminio con volumen ($40/cm), acr-vinil=Acrilico+Vinil ($45/cm), acero=Acero Inoxidable ($55/cm).
- Deteccion de material por descripcion: "Cara en Acrilico" + "rotulacion de vinil" + "Cantos en Aluminio" → material="acr-vinil". "Cara en Acrilico" + "Cantos en Aluminio" sin vinil → material="acr-vol". "Cantos en Aluminio Blanco/Negro/Pintado" sin acrilico → material="al-paint". "Acero Inoxidable", "Inoxidable", "Inox", "Stainless" o "Acero Espejo" (en cantos o caras) → material="acero", tenga o no acrilico.
- complejidad: recta (tipografia recta/imprenta), cursiva (manuscrita/script/italica), compleja (muy ornamentada o muy detallada).
- iluminacion: true salvo que diga explicitamente "sin luz" o "sin iluminacion".
- tipo "recorte": acabado sencillo=$20/cm, vinil=$25/cm, sandwich=$55/cm (+$5 si es compleja). Se cobra altura_cm x n_letras (piezas). Toda partida con altura_cm menor a 10 tiene que salir con tipo "recorte": revisalo antes de responder, elemento por elemento.
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
  const DIR={h:'horizontal (es un ANCHO)',v:'vertical (es un ALTO)'};
  const lista=medidas.map((m,i)=>`${i+1}. ${scFmtCm(m.cm)} cm${DIR[m.dir]?' · '+DIR[m.dir]:''}${m.label?' — '+m.label:''}`).join('\n');
  return `

=== MEDIDAS YA CALIBRADAS — MANDAN SOBRE CUALQUIER ESTIMACION ===
Esta imagen viene del escalador de AL3D: se calibro contra una referencia real y las
cotas dibujadas encima son medidas EXACTAS en centimetros, no estimaciones.

Medidas tomadas (${n}):
${lista}

1. Usa EXACTAMENTE estos numeros. En las partidas de tipo letras y recorte van en
   altura_cm; en bastidor y caja, en el lado que corresponda (ancho_cm o alto_cm).
   No los redondees, no los cambies y no los sustituyas por una estimacion tuya.
2. Genera una partida por cada medida de la lista y en el mismo orden —${n} medidas =
   ${n} partidas— SALVO por el par ancho + alto de la regla 3, que es la unica excepcion.
3. UNICA EXCEPCION a la regla 2 — EL PAR ANCHO + ALTO: cuando una medida horizontal
   (ANCHO) y una vertical (ALTO) describen EL MISMO bastidor o LA MISMA caja de luz,
   las dos van juntas en UNA SOLA partida: la horizontal en ancho_cm y la vertical en
   alto_cm. Ese par cuenta como UNA partida, asi que salen menos partidas que medidas
   y eso es CORRECTO. Ejemplo: medida 1 = 200 cm horizontal y medida 2 = 100 cm
   vertical de la misma caja de luz -> UNA partida tipo caja con ancho_cm=200 y
   alto_cm=100. NUNCA una partida de 200 y otra de 100.
   Fuera de ese caso —dos alturas de letras, dos elementos distintos— sigue mandando
   la regla 2: una partida por medida.
4. El texto que acompaña a una medida lo escribio el vendedor sobre ese elemento:
   usalo para decidir el tipo de partida y para la descripcion.
5. IGNORA por completo la seccion "CUANDO NO HAY CORCHETES NI COTAS": aqui si hay
   cotas y son fiables.
6. Lo que si tienes que deducir de la imagen es QUE es cada elemento: tipo, material,
   complejidad, iluminacion y, en las de tipo letras, cuantas letras tiene el texto.`;
}

/* ----- Las llaves ya no viven aquí -----
   Hasta septiembre de 2026 este archivo guardaba hasta ocho llaves por proveedor en el
   teléfono, ofuscadas con una sal escrita en este mismo código: quien tuviera el teléfono las
   sacaba en una línea desde la consola, y quitar a alguien de «Accesos» no le quitaba la IA,
   que se seguía cobrando a la cuenta de AL3D.

   Ahora viven en la hoja —⚡ AL3D → Llaves de IA— y cada intento sale por el puente, que las
   pone del otro lado (rutaIA en puente/hoja-apps-script.gs). Lo que se quedó aquí es lo que
   tiene que verse mientras se espera: el orden de los proveedores, los reintentos y el
   «probando con Qwen…» con el cliente enfrente, que Apps Script no podría decir a media
   ejecución.

   El orden de la lista ES el orden en que se intenta: primero Qwen, luego DeepSeek y al final
   Gemini. Los dos primeros cuestan centavos; Gemini cierra la cadena porque es el único que lee
   PDF: un PDF va directo a él y las imágenes solo le llegan si los otros dos fallaron. */
const AI_PROVS=['qwen','deepseek','gemini'];
/* Lo que la versión anterior dejó en el teléfono: las llaves, su turno, el proveedor y el
   modelo elegidos. Se borra una vez al arrancar: una llave que se queda donde ya nadie la lee
   sigue siendo una llave que se puede copiar. */
const AI_CLAVES_VIEJAS=/^(al3d_kxs?_|ai_key|ai_model|ai_provider)/;
function aiOlvidarLlavesLocales(){
  try{
    const quitar=[];
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&AI_CLAVES_VIEJAS.test(k)) quitar.push(k); }
    quitar.forEach(k=>localStorage.removeItem(k));
  }catch(_){}
}
/* Qué proveedores tienen llave en la hoja, según /salud. null = todavía no se sabe, y mientras
   tanto se intenta con todos: la hoja contesta «sin llave» por los que falten. */
let _iaEnHoja=null;
async function aiConsultarHoja(){
  try{ const r=await hablarHoja('salud',{}); if(r&&r.ok&&r.ia) _iaEnHoja=r.ia; }catch(_){}
  aiPintarProveedores();
}
function aiPintarProveedores(){
  const el=$('ai-estado'); if(!el) return;
  if(!_iaEnHoja){ el.textContent='Consultando la hoja…'; return; }
  const filas=AI_PROVS.map((p,i)=>`<li class="${_iaEnHoja[p]?'ok':'falta'}">${i+1} · ${AI_NOMBRE[p]} — ${_iaEnHoja[p]?'listo':'sin llave en la hoja'}${p==='gemini'?' · el único que lee PDF':''}</li>`).join('');
  el.innerHTML=`<ul class="ai-prov-lista">${filas}</ul>`
    +(AI_PROVS.some(p=>_iaEnHoja[p])?'':'<p>Ningún proveedor tiene llave todavía: Dirección las pega en la hoja, en <b>⚡ AL3D → Llaves de IA</b>.</p>');
}

/* Una partida recién agregada está en blanco: no cuenta como trabajo capturado.
   El material HEREDADO tampoco cuenta: lo puso la app, no la persona. Sin esa
   salvedad, una cotización recién abierta decía tener «1 partida ya capturada» y la
   IA avisaba de que iba a reemplazar trabajo que nadie había hecho. Solo el material
   elegido a mano —el que ya no trae matAuto— es trabajo. */
function itemVacio(it){
  const matPropio=!!it.material && !it.matAuto;
  /* `tarifa` va en la lista con los otros tres campos de elección. Es donde la caja de luz
     guarda su tipo, y desde que la caja dejó de autoelegirse el precio —arranca en $0 y el
     chip lo pone una persona— tocar «Estándar» o «Tipo nube» ES trabajo capturado: son
     $3,900 o $4,600 el m² decididos a mano. Sin ella, una caja con el tipo ya elegido y sin
     medidas se declaraba «completamente vacía» y el aviso de partidas sin terminar ofrecía
     Quitar: un toque y se iba la elección. Solo es distinta de 0 cuando alguien eligió un
     chip o tecleó una tarifa, así que no reabre el caso que este comentario protege. */
  return !(it.desc||'').trim() && !it.altura && !it.n && !it.ancho && !it.alto && !it.pu
      && !it.tarifa && !matPropio && !it.acab && !it.bas;
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
  /* El <input type=file> conserva su selección entre aperturas: sin limpiarlo, volver a
     abrir el modal y darle a Analizar re-analizaba —y volvía a pagar— el archivo del
     análisis anterior, sin que nada en pantalla dijera cuál era. */
  aiOlvidarArchivo();
  _aiDragN=0; aiPintarArrastre(false);
  aiPintarProveedores(); aiConsultarHoja();
  aiPintarTrabajando(aiTrabajando);
  aiStatus(aiTrabajando?'Hay un análisis en curso…':''
    ,aiTrabajando?'work':'');
  $('aimodal').classList.add('show');
}
/* Cerrar el modal cancela lo que estuviera corriendo. Antes el análisis seguía en marcha
   con aiTrabajando en true, así que al reabrir el modal el botón Analizar estaba gris y
   sin ninguna explicación, y no había forma de cancelar. */
/* Cancelar sin cerrar: el análisis tarda de diez segundos a un minuto con el cliente enfrente,
   y hasta ahora la única manera de pararlo era cerrar el modal. La petición va por la hoja y no
   se puede cortar a medio vuelo; lo que se corta es la cadena: lo que conteste se tira y no se
   intenta con nadie más. */
function aiCancelar(){
  if(!aiTrabajando) return;
  _aiRun++; aiTrabajando=false;
  aiPintarTrabajando(false);
  aiStatus('Análisis cancelado. El archivo sigue elegido: vuelve a darle a Analizar cuando quieras.','');
}
function aiPintarTrabajando(si){
  const go=$('ai-go-btn'), no=$('ai-cancel-btn');
  if(go){ go.disabled=si; go.classList.toggle('trabajando',si); }
  if(no) no.hidden=!si;
}
function aiClose(){
  _aiRun++;
  $('aimodal').classList.remove('show');
  aiThumbsSoltarTodas();
  aiCancelar();
}
/* Con la imagen del escalador el modal cambia de cara: en vez de pedir un archivo
   enseña lo que se va a analizar, y deja la puerta abierta por si el usuario prefiere
   subir otra cosa. */
const AI_INTRO_ARCHIVO='Dale una foto (JPG o PNG) o un PDF del diseño/boceto. La IA detecta texto, medidas, material e iluminación, <b>describe qué está cotizando en cada partida</b> y muestra una miniatura del archivo para que lo compares. Arma un <b>borrador</b> que tú revisas y autorizas antes de usarlo.';
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
   anterior, por lo mismo que en aiOpen. Con un análisis en curso no se cambia nada: la
   fuente es la que se está pagando, y cambiarla a media petición tiraba la respuesta con
   «Cannot read properties of null». Para cambiarla, se cierra —que cancela— o se espera. */
const AI_OCUPADO='Hay un análisis en curso: espera a que termine, o cierra la ventana para cancelarlo';
function aiUsarArchivo(){
  if(aiTrabajando){ toast(AI_OCUPADO,'',3600); return; }
  aiSrc=null; aiOlvidarArchivo(); aiPintarFuente();
}

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
  /* Soltar, pegar o elegir otro archivo mientras se analiza no cambia la fuente: ver
     aiUsarArchivo. El selector se vacía para que no se quede con uno que no se va a usar. */
  if(aiTrabajando){
    const fi=$('ai-file'); if(fi) fi.value='';
    toast(AI_OCUPADO,'',3600);
    return false;
  }
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
  /* Igual que aiUsarArchivo: con un análisis en curso la fuente es la que se está pagando.
     Quitarla solo borraba la miniatura y el aviso, y su respuesta se aplicaba igual. */
  if(aiTrabajando){ toast(AI_OCUPADO,'',3600); return; }
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
  /* Sin el modo JSON del API —no todos los modelos de visión lo aceptan con imagen—
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
const AI_NOMBRE={qwen:'Qwen',deepseek:'DeepSeek',gemini:'Gemini'};
const AI_DEFAULTS={qwen:'qwen3.7-flash',deepseek:'deepseek-flash',gemini:'gemini-3.1-flash-lite'};
/* Modelos hermanos a los que se cae cuando el elegido está saturado o no existe. Sirven
   también de red para un nombre de modelo mal escrito a mano, que si no dejaba al proveedor
   inservible hasta corregirlo. DeepSeek no tiene hermano: solo su Flash ve imágenes. */
const AI_RESPALDO={
  qwen:['qwen3.7-flash','qwen3.6-flash'],
  deepseek:[],
  gemini:['gemini-3.1-flash-lite','gemini-3.6-flash']
};
/* 100 s y no 90: el intento da una vuelta más, teléfono → hoja → proveedor. */
const AI_TIMEOUT=100000;
/* Con el proveedor elegido se insiste de verdad —4 intentos, hasta 11 s de esperas—
   porque es el que el usuario quiere usar. Con los de respaldo no: si el primero
   está caído, lo que importa es contestar pronto, no agotar la cola de cada uno. */
const AI_ESPERAS=[1200,3000,7000];
const AI_ESPERAS_RESPALDO=[1500];
const AI_IMG_MAX=1600, AI_IMG_Q=0.85;
const aiSleep=ms=>new Promise(r=>setTimeout(r,ms));
const aiEtq=c=>`${AI_NOMBRE[c.prov]||c.prov} · ${c.model}`;


/* Una foto de celular pesa entre 3 y 8 MB y en base64 crece otro 33%. Gemini lo
   aguanta; Qwen acepta 10 MB como mucho y en 4G la subida tarda tanto que parece que
   la app se colgó. 1600 px es lo mismo que manda el escalador y de sobra para leer
   una cota. Si el navegador no sabe abrir el archivo —HEIC de iPhone en Android—
   se manda tal cual y que conteste el proveedor.

   Tal cual, pero solo si el proveedor lo lee: Gemini acepta PNG, JPEG, WEBP, HEIC y HEIF, y
   nada más. Un SVG, un GIF o un BMP pasan el filtro de image/* del selector, y chicos se
   mandaban crudos con su tipo: cada key contestaba 400 y se gastaban todas en el mismo error.
   Ahora lo que no es JPG, PNG o WEBP pasa siempre por el lienzo y sale JPEG; y lo que el
   navegador no sabe abrir y tampoco es HEIC/HEIF (un TIFF, un PSD) se detiene aquí, antes de
   pagar una sola petición, diciendo qué hacer con él. */
async function aiImagen(f){
  const crudo=async()=>({b64:await fileToB64(f),mime:f.type||'image/jpeg'});
  if(f.type==='application/pdf') return crudo();
  const directo=/^image\/(jpeg|png|webp)$/i.test(f.type||'');
  const heic=/^image\/hei[cf]$/i.test(f.type||'')||/\.hei[cf]$/i.test(f.name||'');
  const noSeLee=()=>{
    /* Un JPG que el navegador no abre no es un formato raro: viene dañado. */
    if(directo) return new Error(`no se pudo abrir «${f.name||'la imagen'}» — puede estar dañada. Ábrela y guárdala otra vez como JPG o PNG, y vuelve a intentar`);
    const m=/\.([a-z0-9]+)$/i.exec(f.name||''), fmt=((m&&m[1])||(f.type||'').split('/')[1]||'').replace(/\+xml$/i,'').toUpperCase();
    return new Error(`la IA no lee ${fmt?'archivos '+fmt:'ese formato'} — ábrelo y expórtalo como JPG o PNG, y vuelve a intentar`);
  };
  try{
    const img=await new Promise((res,rej)=>{
      const u=URL.createObjectURL(f), im=new Image();
      im.onload=()=>{ URL.revokeObjectURL(u); res(im); };
      im.onerror=()=>{ URL.revokeObjectURL(u); rej(new Error('no se pudo abrir la imagen')); };
      im.src=u;
    });
    const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    if(!w||!h){ if(heic) return crudo(); throw noSeLee(); }
    const k=Math.min(1,AI_IMG_MAX/Math.max(w,h));
    if(directo&&k===1&&f.size<=1200000) return crudo();  // ya es ligera: no se recomprime de gratis
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
    const ctx=c.getContext('2d');
    /* Fondo blanco ANTES de dibujar. La salida es JPEG, que no tiene transparencia: lo que en
       el PNG del cliente era «nada» salía NEGRO. Un logotipo azul sobre fondo transparente
       llegaba a la IA como un logotipo sobre negro —y a la IA le cuesta más leerlo así—, y esa
       misma imagen es la que se guarda en Q.aiFile y se imprime en el PDF como «Plano y
       referencia del proyecto». Medido con un PNG de 2000 px con el fondo transparente: la
       esquina salía (0,0,0). */
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,c.width,c.height);
    return {b64:c.toDataURL('image/jpeg',AI_IMG_Q).split(',')[1],mime:'image/jpeg'};
  }catch(_){
    if(heic) return crudo();
    throw noSeLee();
  }
}

/* Un intento, por la hoja. La hoja ya contesta en el idioma de antes —estado, si vale la pena
   reintentar, una frase que se pueda leer (iaRespuesta en el .gs)—, así que aquí solo se
   vuelve Error lo que llegó. Cerrar el modal no corta la petición, pero sí la cadena. */
async function aiPedirHoja(cuerpo,run){
  aiSigue(run);   // un reintento que quedó en espera de una corrida ya cancelada no sale
  let r;
  try{ r=await hablarHoja('ia',cuerpo,AI_TIMEOUT); }
  catch(e){
    if(run!==_aiRun) throw aiCancelacion();
    /* Sin puente, o una cuenta que la hoja ya no deja entrar: reintentar no lo arregla. */
    const definitivo=e&&(e.codigo==='SIN_PUENTE'||e.codigo==='ROL_SIN_PERMISO');
    const err=new Error(definitivo?e.message:'no se pudo llegar a la hoja de AL3D (revisa tu conexión)');
    err.transitorio=!definitivo; err.definitivo=definitivo;
    throw err;
  }
  aiSigue(run);
  return r;
}
/* El proveedor contestó, pero sin nada: sus filtros taparon la imagen, se cortó a medio JSON,
   o un hipo sin motivo, que es el único de los tres que vale la pena reintentar. */
function aiVacio(prov,razon){
  const n=AI_NOMBRE[prov]||prov, r=String(razon||'').toUpperCase();
  const err=new Error(
    /SAFETY|BLOCK|RECITATION|PROHIBIT/.test(r) ? `${n} bloqueó la imagen con sus filtros de contenido`
    : /MAX_TOKEN|LENGTH/.test(r)               ? `${n} cortó la respuesta antes de terminar el JSON`
    : `${n} respondió vacío`);
  err.transitorio=!r;
  return err;
}
function aiErrorDeHoja(r,c){
  if(r&&r.codigo==='VACIO') return aiVacio(c.prov,r.razon);
  const err=new Error((r&&r.mensaje)||`${AI_NOMBRE[c.prov]||c.prov} no contestó`);
  err.status=r&&r.status; err.crudo=(r&&r.crudo)||''; err.transitorio=!!(r&&r.transitorio);
  if(r&&r.codigo==='SIN_LLAVE') err.sinLlave=true;
  /* El cupo del día y una cuenta sin permiso son de la PERSONA, no del proveedor: probar con
     el siguiente da lo mismo. */
  if(r&&(r.codigo==='CUPO_AGOTADO'||r.codigo==='ROL_SIN_PERMISO')) err.definitivo=true;
  return err;
}
async function aiLlamar(c,prompt,b64,mime,sinJson,run){
  const r=await aiPedirHoja({modo:'cotizar',prov:c.prov,model:c.model,prompt,imagen:{b64,mime},sinJson:!!sinJson},run);
  if(!r||r.ok!==true){
    const err=aiErrorDeHoja(r,c);
    /* Buena parte de los modelos de visión no aceptan el modo JSON del API cuando va una
       imagen en la misma petición, y contestan un 400 que reintentar no arregla. Quitar la
       opción sí lo arregla: el prompt ya pide «SOLO un JSON valido» y extractJSON sabe pelar
       el ```json. */
    if(!sinJson&&err.status===400&&/json|response_format|schema|format/i.test(err.crudo||''))
      return aiLlamar(c,prompt,b64,mime,true,run);
    throw err;
  }
  return extractJSON(String(r.texto||''));
}

/* Un candidato = un proveedor con un modelo. Se insiste con él mientras el fallo sea
   pasajero; lo demás se devuelve enseguida para que la cadena pase al siguiente. */
async function aiCandidato(c,prompt,b64,mime,verbo,esperas,hayMas,run){
  const E=esperas||AI_ESPERAS;
  for(let i=0;;i++){
    /* Al despertar de la espera se pregunta antes que nada si el análisis sigue siendo el
       vigente: si el modal se cerró mientras dormía, ni se paga otra petición ni se escribe
       en la barra de estado de un modal que quizá ya es de otro análisis. */
    aiSigue(run);
    try{
      aiStatus(`${verbo} con ${aiEtq(c)}…${i?` (intento ${i+1} de ${E.length+1})`:''}`,'work');
      return await aiLlamar(c,prompt,b64,mime,false,run);
    }catch(e){
      /* Cerrar aborta la petición en vuelo, y ese aborto no es «el proveedor tardó»: con el
         modal reabierto _aiCancelado ya volvió a false, así que manda el número de corrida. */
      if(e.cancelado||(run!==undefined&&run!==_aiRun)) throw aiCancelacion();
      /* Un 429 es cuota de ESA key: esperar no la devuelve, y si hay otra key u otro
         proveedor esperando turno, probarlo es más rápido y más seguro que dormir. */
      if(e.status===429&&hayMas) throw e;
      if(e.cancelado||e.definitivo||e.sinLlave) throw e;
      if(!e.transitorio||i>=E.length) throw e;
      aiStatus(`⏳ ${e.message} · reintentando en ${Math.round(E[i]/1000)} s…`,'work');
      await aiSleep(E[i]);
    }
  }
}
/* El orden en que se va a intentar: los proveedores en el orden de AI_PROVS, cada uno con su
   modelo y después sus hermanos de respaldo, porque un modelo saturado no comparte cola con su
   hermano. Los proveedores que la hoja dice que no tienen llave se saltan de entrada. La
   rotación entre llaves de un mismo proveedor la hace la hoja, que es la que las tiene. */
const AI_MAX_INTENTOS=12;
function aiCadena(esPdf){
  const out=[];
  AI_PROVS.forEach(p=>{
    if(esPdf&&p!=='gemini') return;   // Qwen y DeepSeek no leen PDF
    if(_iaEnHoja&&!_iaEnHoja[p]) return;
    [AI_DEFAULTS[p]].concat(AI_RESPALDO[p]||[]).forEach(m=>{
      if(m&&!out.some(x=>x.prov===p&&x.model===m)) out.push({prov:p,model:m});
    });
  });
  return out.slice(0,AI_MAX_INTENTOS);
}

let aiTrabajando=false;
/* Qué se intentó de verdad en la última corrida, para que el mensaje de error no cuente
   keys que la cadena excluyó a propósito. */
let _aiIntentados=0, _aiProvsProbados=0, _aiEraPdf=false;
/* El análisis en curso, para poder cancelarlo al cerrar el modal. */
/* El número del análisis vigente. Cada aiAnalyze toma el suyo al arrancar, y cerrar o cancelar
   lo sube; después de cada espera —la imagen, la petición, el sueño entre reintentos— el
   análisis compara y, si ya no es el vigente, se retira sin pagar, sin aplicar y sin tocar la
   pantalla. Una bandera de «cancelado» no bastaba: cancelar y volver a analizar la bajaba otra
   vez, y la respuesta del análisis viejo se aplicaba encima del nuevo. */
let _aiRun=0;
function aiCancelacion(){ const c=new Error('análisis cancelado'); c.cancelado=true; return c; }
function aiSigue(run){ if(run!==undefined&&run!==_aiRun) throw aiCancelacion(); }

async function aiAnalyze(){
  if(aiTrabajando) return;   // el botón queda deshabilitado, pero el Enter del teclado no
  /* La misma guarda que ya tiene scCotizarConIA. Sin ella, un análisis sobre una
     cotización autorizada la devolvía a borrador y le borraba el precio: había que volver
     a pedir la autorización con el cliente enfrente. */
  if(locked()){ aiStatus('La cotización está autorizada · usa «Editar partidas» antes de analizar','err'); return; }
  /* La fuente se toma UNA vez, aquí, y de aquí en adelante solo se lee `src`. aiSrc es de la
     pantalla: «Analizar otro archivo» o soltar un archivo lo ponen en null, y releerlo después
     de las esperas reventaba con «Cannot read properties of null (reading 'name')» y tiraba
     una respuesta ya pagada. */
  const src=aiSrc, f=aiArchivo;
  if(!src && !f){ aiStatus('Arrastra aquí el archivo, pégalo, o toca el recuadro para elegirlo.','err'); return; }
  const esPdf=!src && f.type==='application/pdf';
  /* Sin señal no hay IA: contesta desde la hoja. Se dice antes de leer el archivo. */
  if(navigator.onLine===false){ aiStatus('Sin señal no se puede analizar: la IA contesta a través de la hoja de AL3D.','err'); return; }
  /* Un PDF solo lo lee Gemini. Si la hoja ya dijo que Gemini no tiene llave, se dice antes
     de intentar nada en vez de dejar que Qwen y DeepSeek lo rechacen uno por uno. */
  if(esPdf&&_iaEnHoja&&!_iaEnHoja.gemini){
    aiStatus('Los PDF solo los lee Gemini, y Gemini no tiene llave en la hoja. Sube el diseño como JPG o PNG, o pídele a Dirección que pegue la de Gemini.','err');
    return;
  }
  if(_iaEnHoja&&!AI_PROVS.some(p=>_iaEnHoja[p])){ aiStatus('Ningún proveedor de IA tiene llave en la hoja. Dirección la pega en ⚡ AL3D → Llaves de IA.','err'); return; }
  const verbo=src?'Analizando la imagen medida':'Analizando';
  aiStatus(verbo+'…','work');
  const run=++_aiRun; aiTrabajando=true; aiPintarTrabajando(true);
  /* La cuenta de intentos es de ESTE análisis: si falla antes de la cadena —un formato que la IA
     no lee—, el mensaje no puede contar los intentos del anterior. */
  _aiIntentados=0; _aiProvsProbados=0; _aiEraPdf=esPdf;
  try{
    /* La imagen del escalador ya viene lista en base64 —la dibuja scImagenParaIA con
       sus cotas encima y ya reducida—, así que no hay archivo que leer ni que
       comprimir. Y como esas cotas son medidas reales, al prompt se le añade la
       lista para que las use tal cual. */
    const {b64,mime}=src?{b64:src.url.split(',')[1],mime:src.mime||'image/jpeg'}:await aiImagen(f);
    if(run!==_aiRun) return;   // se cerró mientras se preparaba la imagen
    const prompt=src?PROMPT_IA+promptMedidas(src.medidas):PROMPT_IA;
    const cadena=aiCadena(esPdf);
    if(!cadena.length) throw new Error('ningún proveedor de IA tiene llave en la hoja para este archivo');
    let parsed=null,usado=null,ultimo=null;
    let intentados=0;
    /* Los proveedores se cuentan mientras se prueban. Contarlos sobre los primeros N de la
       cadena fallaba cuando un 404 se saltaba las otras keys del mismo modelo: con Groq ya
       probado, el mensaje decía «en 1 proveedor». */
    const provs=new Set();
    for(let i=0;i<cadena.length;i++){
      intentados++; provs.add(cadena[i].prov);
      try{ parsed=await aiCandidato(cadena[i],prompt,b64,mime,verbo,i?AI_ESPERAS_RESPALDO:AI_ESPERAS,i<cadena.length-1,run); usado=cadena[i]; break; }
      catch(e){
        ultimo=e;
        if(e.cancelado||e.definitivo||run!==_aiRun) break;   // el modal se cerró, o el problema es de la persona y no del proveedor
        /* Sin llave en la hoja para ese proveedor: sus hermanos tampoco tienen, y se recuerda
           para el siguiente análisis. */
        if(e.sinLlave){
          if(_iaEnHoja) _iaEnHoja[cadena[i].prov]=false;
          while(i+1<cadena.length&&cadena[i+1].prov===cadena[i].prov) i++;
        }
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
    /* El usuario cerró el modal a media petición —o durante una espera—: lo que haya
       llegado ya no es de nadie, y no se aplica ni se cuenta. */
    if(run!==_aiRun) return;
    _aiIntentados=intentados;
    _aiProvsProbados=provs.size;
    if(!parsed) throw ultimo||new Error('No se pudo analizar el archivo.');
    /* ----- La imagen SÍ se guarda, también la del escalador -----
       Aquí decía que la foto del escalador no se guarda «porque ya se ve, con sus cotas, en
       la vista previa del escalador que está junto a las partidas, y duplicarla repetiría la
       misma imagen dos veces en la pantalla». La razón es buena y se conserva —por eso
       `deEscalador`, que es lo que hace que renderAiPreview no la pinte—, pero era una
       razón de PANTALLA aplicada a un dato que también usa el PAPEL: `Q.aiFile` es de donde
       el PDF saca la figura del anuncio, y su comentario promete exactamente esta imagen
       —«la que salió del escalador con las cotas ya dibujadas encima, que es exactamente lo
       que pegan en Canva»—. Con el `if(!aiSrc)`, cotizar midiendo sobre una foto sacaba el
       PDF sin una sola figura: el único camino que de verdad produce un plano cotado era el
       único que no lo entregaba.

       Y de paso la entrada del historial deja de quedarse sin imagen: guardarEnHistorial
       toma de aquí la referencia visual, y una cotización hecha con el escalador no tenía
       ninguna. Al reabrirla del historial el flag no viaja —solo viajan name, type y url— y
       entonces sí se pinta, que es lo correcto: ahí el escalador ya no está al lado. */
    /* Se guarda y se pinta aquí mismo: si la IA no devolvió partidas, applyAi no
       re-renderiza y antes la miniatura del archivo analizado no llegaba a aparecer. */
    Q.aiFile = src
      ? {name:'medidas-al3d.jpg', type:src.mime||'image/jpeg', url:src.url, deEscalador:true}
      : {name:f.name,type:mime,url:'data:'+mime+';base64,'+b64};
    saveState(); renderAiPreview();
    const medidas=(src&&src.origen==='escalador')?src.medidas.length:0;
    const creadas=applyAi(parsed);
    /* Lo que la IA leyó del cliente o del proyecto y no se escribió porque ya había algo
       (ver applyAi): va al final del aviso de éxito, que es el que se queda en pantalla. */
    const leyo=_aiLeido.length?` · la IA leyó ${_aiLeido.join(' y ')}; se dejó lo que escribiste`:'';
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
      /* Se le pidió una partida por medida, pero el modelo puede saltarse elementos. Si
         alguna medida se quedó sin partida conviene decirlo: quien midió sabe cuántas cosas
         midió y es el único que puede notar la que falta.

         Lo que se compara ya no son partidas contra medidas, sino MEDIDAS CUBIERTAS contra
         medidas: desde que el ancho y el alto de una caja de luz caben en una sola partida,
         menos partidas que medidas es el resultado correcto y no una advertencia. */
      const faltan=Math.max(0,medidas-_aiCubiertas);
      toast((faltan
        ? `⚠️ La IA devolvió ${creadas} ${creadas===1?'partida':'partidas'} y ${faltan===1?'una medida se quedó':`${faltan} medidas se quedaron`} sin partida — revisa cuál falta`
        : `${medidas} ${medidas===1?'medida cotizada':'medidas cotizadas'} con IA (borrador)`)+leyo,
        faltan?'':'ok', faltan||leyo?6000:3200);
    } else {
      toast('Cotización IA lista (borrador)'+leyo,'ok',leyo?6000:2600);
    }
    /* Se cierra solo si en ese segundo y medio nadie lo cerró ni arrancó otro análisis: si
       no, este cierre tardío tumbaba el modal que ya se había vuelto a abrir. */
    setTimeout(()=>{ if(run===_aiRun) aiClose(); },1500);
  }catch(e){
    if((e&&e.cancelado)||run!==_aiRun) return;   // se canceló a propósito: no hay error que enseñar
    /* Si solo hay una API cargada, insistir más no arregla nada: lo que lo arregla es
       tener a dónde caerse. Se dice aquí, que es cuando duele.
       Y se cuenta lo que se intentó, no lo que hay guardado. «Se probaron las 5 APIs
       cargadas» era falso al analizar un PDF: ahí la cadena solo lleva Gemini, porque Qwen
       y DeepSeek no leen PDF, y el mensaje culpaba a keys que nadie tocó. */
    const probados=_aiIntentados;
    const nota=probados>1
      ? ' · Se probaron '+probados+' combinaciones en '+_aiProvsProbados+(_aiProvsProbados===1?' proveedor':' proveedores')+'.'
        +((_aiEraPdf&&_aiProvsProbados===1)?' Qwen y DeepSeek no leen PDF, así que no se intentaron.':'')
      : (e.transitorio
          ? ' · Ya reintenté varias veces. Si sigue pasando, Dirección puede agregar otra llave en la hoja (⚡ AL3D → Llaves de IA) y la app cambiará sola.'
          : '');
    aiStatus('Error: '+e.message+nota,'err');
  }finally{
    /* Si se canceló, aiCancelar() ya soltó el botón y quizá ya arrancó otro análisis: no se le
       pisa el estado a ése. */
    if(run===_aiRun){ aiTrabajando=false; aiPintarTrabajando(false); }
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
/* ----- Dos partidas que son un solo letrero -----
   Un bastidor y una caja de luz se cobran por área, así que en el plano llevan dos cotas:
   una horizontal —el ancho— y una vertical —el alto—. El modelo tiene una instrucción de
   hierro que dice «cada corchete es una partida», y con ella una caja de luz de 2 × 1 m
   volvía partida en dos: una de 200 cm de ancho sin alto y otra de 100 cm de alto sin
   ancho. Las dos valen $0 —el área de cualquiera de ellas es cero— y la cotización enseña
   dos letreros donde hay uno.

   El prompt ya pide que ese par vaya junto. Esto lo junta pase lo que pase, que no es lo
   mismo: el prompt es una petición a un modelo que puede tener un mal día, y de este lado
   está la cotización que firma un cliente.

   Se fusionan solo partidas SEGUIDAS, del MISMO tipo y con lados COMPLEMENTARIOS —una trae
   el ancho y la otra el alto—, que es exactamente la forma que tiene un elemento partido en
   dos. Dos cajas distintas, cada una con un solo lado, también caerían aquí; pero esas dos
   partidas ya venían rotas —a las dos les falta la mitad de su medida y las dos valen $0—,
   así que una caja completa con las dos medidas a la vista es mejor punto de partida que
   dos mitades en cero, y corregirla es cambiar un número. */
function fusionarParesDeArea(items){
  const media=it=>(it.tipo==='bastidor'||it.tipo==='caja')&&((it.ancho>0)!==(it.alto>0));
  let fusionadas=0;
  /* De arriba hacia abajo, que es el orden en el que el modelo las escribió: para un
     letrero manda el ancho y luego el alto, así que la primera de cada dos es la que se
     queda. Con un número impar de mitades —tres cotas de área en la respuesta— la que sobra
     es la última y no la primera, que es donde quien revisa la va a buscar.

     La segunda se vacía dentro de la primera y se quita de la lista; al avanzar el índice
     se cae justo en la siguiente pareja, y la ya completa no vuelve a entrar porque deja de
     tener «media medida». */
  for(let i=0;i<items.length-1;i++){
    const a=items[i], b=items[i+1];
    if(!media(a)||!media(b)||a.tipo!==b.tipo) continue;
    if((a.ancho>0)===(b.ancho>0)) continue;   // las dos traen el mismo lado: no son un par
    a.ancho=a.ancho||b.ancho;
    a.alto =a.alto ||b.alto;
    /* Lo que decía la segunda y a la primera le faltaba: el tipo de caja, el material del
       bastidor y la descripción, que a veces es la única que nombra el elemento. */
    if(!a.tarifa&&b.tarifa) a.tarifa=b.tarifa;
    if(a.tipo==='bastidor'&&!basOf(a.bas)&&basOf(b.bas)) a.bas=b.bas;
    if(!(a.desc||'').trim()&&(b.desc||'').trim()){ a.desc=b.desc; a.descAi=b.descAi; }
    items.splice(i+1,1);
    fusionadas++;
  }
  return fusionadas;
}
/* ----- Cuántas de las medidas enviadas quedan explicadas -----
   El escalador manda N medidas y después se comprueba que vuelvan N partidas, para poder
   avisar de la que falta. Con el par ancho + alto esa cuenta dejó de ser N a N: una partida
   de área con sus dos lados puestos explica DOS medidas, y sin esto el aviso de «devolvió 1
   partida para 2 medidas» saltaba justo cuando el modelo acertó. */
let _aiCubiertas=0;
function medidasCubiertas(items){
  return items.reduce((s,it)=>s+((((it.tipo==='bastidor')||(it.tipo==='caja'))&&it.ancho>0&&it.alto>0)?2:1),0);
}
/* Excepción deliberada a «ninguna puerta abierta»: aquí NO se vuelve a preguntar por los
   datos del cliente. `aiOpen` ya los pidió al abrir el modal; la escritura ocurre medio
   minuto después, cuando el análisis ya se pagó y ya terminó, y frenarlo aquí lo tiraría a
   la basura para impedir un caso que exige borrar el teléfono a propósito mientras la IA
   trabaja. Además el teléfono no lo saca de un JPG nunca, así que revalidar aquí fallaría
   casi siempre por el único dato que no puede traer. Lo que pasa es lo correcto: las
   partidas entran, y el candado se vuelve a cerrar sobre ellas si de verdad falta algo.
   No se pierde nada. */
/* Lo que la IA leyó del cliente o del proyecto y NO se escribió, para que aiAnalyze lo diga. */
let _aiLeido=[];
function applyAi(p){
  _aiLeido=[];
  if(!p||typeof p!=='object') return 0;
  _aiCubiertas=0;
  if(locked()) return 0;
  p.proyecto=aiTxt(p.proyecto); p.cliente=aiTxt(p.cliente); p.direccion=aiTxt(p.direccion);
  /* El cliente y el proyecto, igual que la dirección de abajo: solo si están vacíos. aiOpen
     exige teclearlos ANTES de abrir el modal, así que aquí casi siempre traen lo que escribió
     el vendedor —«Juan Pérez Gómez», el que paga— y la IA lee lo que dice el letrero
     —«Farmacia San Juan»—. Escribirlos sin preguntar borraba el dato bueno en silencio, y el
     teléfono de uno quedaba con el nombre del otro. Lo que leyó y no se usó se dice en el
     aviso de éxito, por si de verdad era mejor. */
  const mismo=(a,b)=>a.toLowerCase()===String(b||'').trim().toLowerCase();
  if(p.proyecto){
    if(!(Q.proy||'').trim()){ Q.proy=p.proyecto; if($('f-proy')) $('f-proy').value=p.proyecto; }
    else if(!mismo(p.proyecto,Q.proy)) _aiLeido.push(`el proyecto «${p.proyecto}»`);
  }
  if(p.cliente){
    if(!(Q.cliente||'').trim()){ Q.cliente=p.cliente; if($('f-cli')) $('f-cli').value=p.cliente; }
    else if(!mismo(p.cliente,Q.cliente)) _aiLeido.push(`el cliente «${p.cliente}»`);
  }
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
        it.alto=it.alto||aiNum(x.altura_cm);
      } else if(it.tipo==='caja'){
        it.tarifa=aiNum(x.tarifa)||3900; it.ancho=aiNum(x.ancho_cm); it.alto=aiNum(x.alto_cm);
        /* El alto de un elemento de área puede llegar en `altura_cm`: el prompt pide
           ancho_cm y alto_cm, pero cuando el modelo ve un solo corchete escribe el número
           en el campo de altura, que es el que usa en las otras tres cuartas partes de las
           partidas. Se leía como cero y la medida se perdía —una caja sin alto vale $0—,
           así que se recoge de ahí, y solo si el alto venía vacío. */
        it.alto=it.alto||aiNum(x.altura_cm);
      } else {
        it.pz=Math.round(aiNum(x.piezas))||1; it.pu=aiNum(x.precio_unitario);
        if(!it.desc) it.desc=aiTxt(x.notas);
      }
      /* La regla de los 10 cm se aplica AQUÍ y no solo en el prompt: el prompt es una
         petición y esto es la regla. Un modelo que devuelve letras de 6 cm —porque el plano
         dice «letras 3D» y él le hace caso— dejaría una partida imposible de fabricar
         cotizada al catálogo equivocado. Ver ALTURA_MIN_LETRAS en catalogo.js. */
      forzarRecortePorAltura(it);
      nuevos.push(it);
    });
    /* Y lo mismo con el par ancho + alto: el prompt lo pide junto y esto lo junta. */
    fusionarParesDeArea(nuevos);
    _aiCubiertas=medidasCubiertas(nuevos);
    const conservadas=aiMerge?Q.items.filter(it=>!itemVacio(it)):[];
    Q.items=conservadas.concat(nuevos);
    // La cotización vuelve a borrador: cualquier precio autorizado antes ya no aplica
    // a estas partidas nuevas.
    Q.estado='borrador'; Q.precioAuth=0; Q.itemsAuth={}; Q.huellaAuth=''; Q.sello=null; Q.solicitud=null;
    sincronizarPlegado();
    renderItems();
    if(conservadas.length) toast(`${conservadas.length} partida${conservadas.length>1?'s':''} tuya${conservadas.length>1?'s':''} + ${nuevos.length} de la IA`,'ok',3600);
    return nuevos.length;
  }
  /* Devuelve cuántas partidas creó. Antes no devolvía nada y quien llamaba daba por hecho
     que había funcionado: con una respuesta sin partidas la pantalla anunciaba éxito en
     verde y cerraba el modal, sin que se hubiera agregado una sola. */
  /* Por esta rama se sale habiendo escrito, si estaban vacíos, el cliente y el proyecto
     —arriba— y nada más.
     Los inputs se llenaron a mano, y asignarle `.value` a un input NO dispara su `oninput`,
     así que `upd()` nunca corre: sin este repintado la barra de completitud, el ámbar de
     los huecos y el candado de las partidas se quedaban con la cuenta anterior, diciendo
     que falta el cliente con el cliente ya escrito por la IA. Y sin el guardado, un
     recargón se llevaba los dos datos que sí llegaron. */
  updProg(); saveState();
  return 0;
}

