/* La ventana de taller: cuándo empezar, cuándo tiene que estar el material, cuándo listo, y
   si vas tarde. Es aritmética de fechas encima de un plazo en cubos, y un error aquí no se
   ve: sale una fecha plausible, un día corrida, y se descubre el día de la instalación con
   el anuncio sin armar.
   
   Por eso los casos de abajo miran sobre todo donde una implementación razonable da un
   número plausible y falso: el redondeo del plazo (10 en vez de 11), el fin de mes, el 29 de
   febrero, el cruce de año, el proyecto sin instalación, el que ya se instaló, la instalación
   en el pasado, y —el más importante— que la ventana NUNCA se ancle en hoy.
   
   Se corre con pruebas/correr.sh, como todas.
*/
import * as T from '../js/datos/taller.js';
import { diasEntre, masDias, partesISO } from '../js/nucleo/fechas.js';
import { readFileSync } from 'fs';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};
const cierto = (nombre, cond, detalle) => {
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + nombre + (cond ? '' : '  → ' + (detalle || '')));
  if (!cond) fallos++;
};

/* Partidas como las guarda el cotizador, para el tamaño de la pieza. */
const letras   = (o = {}) => ({ tipo: 'letras',   altura: 40, n: 8, luz: true, ...o });
const bastidor = (o = {}) => ({ tipo: 'bastidor', ancho: 100, alto: 295, ...o });
const proy = (o = {}) => ({ id: 'p1', nombre: 'Tacos Don Beto', etapa: 'ganado',
  tipo_trabajo: ['Letras 3D con iluminacion'], fecha_ganado: '2026-09-01', plazo_k: null,
  origen: { items: [letras()] }, ...o });
const inst = (o = {}) => ({ fecha: '2026-09-30', estado: 'confirmada', ...o });

console.log('\nA · LA TABLA DE PLAZOS');
eq('los cinco cubos dan 7, 11, 14, 18, 21', T.PLAZOS.map(p => p.dias), [7, 11, 14, 18, 21]);
eq('1.5 semanas redondea ARRIBA: 11, no 10', T.plazo(2).dias, 11);
eq('2.5 semanas redondea ARRIBA: 18, no 17', T.plazo(4).dias, 18);
eq('las etiquetas son las palabras del dueño', T.PLAZOS.map(p => p.etiqueta),
   ['1 semana', '1.5 semanas', '2 semanas', '2.5 semanas', '3 semanas o más']);
for (const malo of [0, 6, 'dos', null, undefined, NaN, 2.5]) {
  cierto('plazo(' + String(malo) + ') cae al cubo por defecto, nunca undefined',
    T.plazo(malo) && T.plazo(malo).k === T.PLAZO_DEFECTO, 'dio ' + JSON.stringify(T.plazo(malo)));
}

console.log('\nB · LA PROPUESTA, con cero captura');
eq('solo vinil → 1 semana', T.plazoSugerido(['Rotulacion de vinil']).k, 1);
eq('solo recorte → 1 semana', T.plazoSugerido(['Recorte acrilico']).k, 1);
eq('letras sin luz → 1.5', T.plazoSugerido(['Letras 3D sin iluminacion']).k, 2);
eq('letras con luz → 2', T.plazoSugerido(['Letras 3D con iluminacion']).k, 3);
eq('Custome → 2.5', T.plazoSugerido(['Custome / Proyecto Especial']).k, 4);
eq('letras con luz + vinil → 2.5 (3 + 1 por el segundo tipo)',
   T.plazoSugerido(['Letras 3D con iluminacion', 'Rotulacion de vinil']).k, 4);
eq('los siete tipos a la vez → 5, no 10: el tope funciona', T.plazoSugerido([
  'Caja de luz con iluminacion', 'Caja de luz sin iluminacion', 'Letras 3D con iluminacion',
  'Letras 3D sin iluminacion', 'Rotulacion de vinil', 'Recorte acrilico', 'Custome / Proyecto Especial']).k, 5);
eq('sin tipos → el mismo cubo que Custome', T.plazoSugerido([]).k, T.PLAZO_DEFECTO);
eq('null no truena y cae al defecto', T.plazoSugerido(null).k, T.PLAZO_DEFECTO);
eq('basura adentro se ignora', T.plazoSugerido(['Rotulacion de vinil', 'lo que sea', 42, null]).k, 1);
eq('pieza de 295 cm (el Alucobond real de Andrey) → +1 cubo',
   T.plazoSugerido(['Letras 3D sin iluminacion'], [bastidor()]).k, 3);
eq('pieza de 244 cm EXACTOS no sube: cabe en la lámina, es > y no >=',
   T.plazoSugerido(['Letras 3D sin iluminacion'], [bastidor({ alto: 244 })]).k, 2);
eq('letra de 40 cm no sube nada', T.plazoSugerido(['Letras 3D con iluminacion'], [letras()]).k, 3);
cierto('la razón nunca queda vacía y nombra el número', /2 semanas/.test(T.plazoSugerido(['Letras 3D con iluminacion']).razon));
cierto('y dice por qué subió', /295 cm/.test(T.plazoSugerido(['Letras 3D sin iluminacion'], [bastidor()]).razon));

console.log('\nC · LA VENTANA ANCLADA EN LA INSTALACIÓN — el caso trabajado');
{
  /* Instalación el 30 de septiembre, 2 semanas (14 días), colchón 1. */
  const v = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-01' });
  eq('ancla', v.ancla, 'instalacion');
  eq('el plazo elegido manda: 14 días', v.plazo_dias, 14);
  eq('y se dice que fue elegido', v.plazo_fuente, 'elegido');
  eq('empezar = 30 sep − 14 = 16 sep', v.empezar, '2026-09-16');
  eq('cortado = 16 + round(13/3)=4 → 20 sep', v.hitos.cortado, '2026-09-20');
  eq('armado = 16 + round(26/3)=9 → 25 sep', v.hitos.armado, '2026-09-25');
  eq('listo = la víspera, 29 sep', v.listo, '2026-09-29');
  eq('instalado = la fecha real, sin correr', v.hitos.instalado, '2026-09-30');
  eq('el material tiene que estar para cortar: 20 sep', v.material, '2026-09-20');
  eq('y se compra 3 días antes: 17 sep', v.comprar, '2026-09-17');
  eq('de empezar a instalar son exactamente los 14 días del plazo', diasEntre(v.empezar, v.instalacion), 14);
  eq('el 1 de sep todavía no toca empezar', v.etapa_esperada, 'ganado');
  eq('y va a tiempo', v.estado, 'a_tiempo');
  eq('con 15 días de holgura', v.holgura_dias, 15);
  cierto('el texto dice cuándo toca empezar', /16 sep/.test(v.texto), v.texto);
}
{
  /* Sin elegir: se propone desde el tipo. Letras con luz → 2 semanas. */
  const v = T.ventanaTaller(proy(), inst(), { hoy: '2026-09-01' });
  eq('sin plazo_k se deriva del tipo: 2 semanas', v.plazo_k, 3);
  eq('y se dice que fue derivado', v.plazo_fuente, 'derivado');
  cierto('con la razón escrita', /Letras 3D con iluminacion/.test(v.plazo_razon), v.plazo_razon);
}
console.log('\n  monotonía: empezar ≤ cortado ≤ armado ≤ listo ≤ instalación, en los cinco cubos');
for (const k of [1, 2, 3, 4, 5]) {
  const v = T.ventanaTaller(proy({ plazo_k: k }), inst(), { hoy: '2026-09-01' });
  const h = v.hitos;
  cierto('cubo ' + k + ' (' + v.plazo_dias + ' días)',
    h.en_diseno <= h.cortado && h.cortado <= h.armado && h.armado <= h.listo && h.listo <= h.instalado &&
    diasEntre(h.en_diseno, h.instalado) === v.plazo_dias, JSON.stringify(h));
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 1 }), inst(), { hoy: '2026-09-01' });
  cierto('con 1 semana, comprar cae ANTES de empezar, y es correcto, no un bug', v.comprar < v.empezar,
    v.comprar + ' vs ' + v.empezar);
}

console.log('\nD · LOS QUE DAN UN NÚMERO PLAUSIBLE Y EQUIVOCADO');
{
  const v = T.ventanaTaller(proy({ plazo_k: 5 }), inst({ fecha: '2026-03-01' }), { hoy: '2026-01-01' });
  eq('fin de mes: 1 mar − 21 = 8 feb, no 2026-02-31', v.empezar, '2026-02-08');
}
{
  const a = T.ventanaTaller(proy({ plazo_k: 1 }), inst({ fecha: '2028-03-01' }), { hoy: '2028-01-01' });
  const b = T.ventanaTaller(proy({ plazo_k: 1 }), inst({ fecha: '2026-03-01' }), { hoy: '2026-01-01' });
  eq('bisiesto: 1 mar 2028 − 7 = 23 feb', a.empezar, '2028-02-23');
  eq('normal: 1 mar 2026 − 7 = 22 feb (los dos juntos, o el primero aprueba un febrero de 28 fijo)', b.empezar, '2026-02-22');
}
{
  const a = T.ventanaTaller(proy({ plazo_k: 5 }), inst({ fecha: '2028-03-01' }), { hoy: '2028-01-01' });
  const b = T.ventanaTaller(proy({ plazo_k: 5 }), inst({ fecha: '2026-03-01' }), { hoy: '2026-01-01' });
  eq('bisiesto con plazo largo: 1 mar 2028 − 21 = 9 feb', a.empezar, '2028-02-09');
  eq('normal con plazo largo: 1 mar 2026 − 21 = 8 feb', b.empezar, '2026-02-08');
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 5 }), inst({ fecha: '2027-01-05' }), { hoy: '2026-12-01' });
  eq('cambio de año: 5 ene 2027 − 21 = 15 dic 2026', v.empezar, '2026-12-15');
}
{
  /* Instalación hace 10 días, etapa armado, nadie la marcó. */
  const v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'armado' }), inst({ fecha: '2026-09-20' }), { hoy: '2026-09-30' });
  eq('instalación en el pasado: no llega', v.estado, 'no_llega');
  cierto('con atraso positivo', v.atraso_dias > 0, String(v.atraso_dias));
  cierto('y ni un solo campo NaN o «NaN-NaN-NaN»', !JSON.stringify(v).includes('NaN'), JSON.stringify(v));
  cierto('el texto dice las dos salidas', /se termina hoy|mover la fecha/.test(v.texto), v.texto);
}
{
  /* Instalación MAÑANA con 3 semanas: empezar fue hace 20 días. NO se recorta a hoy. */
  const v = T.ventanaTaller(proy({ plazo_k: 5 }), inst({ fecha: '2026-10-01' }), { hoy: '2026-09-30' });
  eq('el plazo cae antes de hoy: empezar se queda en el pasado, no se recorta a hoy', v.empezar, '2026-09-10');
  eq('y la etapa esperada hoy ya es listo', v.etapa_esperada, 'listo');
  eq('con el proyecto en ganado, va tarde', v.estado === 'tarde' || v.estado === 'no_llega', true);
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'instalado' }), inst({ fecha: '2026-09-10' }), { hoy: '2026-09-30' });
  eq('ya instalado: hecho, aunque todos los hitos hayan pasado', v.estado, 'hecho');
  eq('y sin atraso', v.atraso_dias, 0);
  cierto('y el texto no regaña', !/tarde/.test(v.texto), v.texto);
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'armado' }), inst({ fecha: '2026-09-10', estado: 'hecha' }), { hoy: '2026-09-30' });
  eq('instalación «hecha» con la etapa en armado (nadie la movió): también hecho', v.estado, 'hecho');
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'cancelado' }), inst(), { hoy: '2026-09-01' });
  eq('proyecto cancelado: no se calcula nada', v.estado, 'cancelado');
  eq('hitos nulos', v.hitos, { en_diseno: null, cortado: null, armado: null, listo: null, instalado: null });
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3 }), inst({ estado: 'cancelada' }), { hoy: '2026-09-01' });
  eq('instalación cancelada: se ignora y se ancla en la fecha de venta', v.ancla, 'ganado');
  eq('sin fecha de instalación en la salida', v.instalacion, null);
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3 }), null, { hoy: '2026-09-01' });
  eq('sin instalación: ancla en ganado', v.ancla, 'ganado');
  eq('empezar = la fecha de venta', v.empezar, '2026-09-01');
  eq('listo = venta + 13', v.listo, '2026-09-14');
  eq('y se DICE una entrega estimada, que no se llama fecha', v.entrega_estimada, '2026-09-15');
  eq('instalado es null: nadie la prometió', v.hitos.instalado, null);
  cierto('y el texto avisa que cuenta desde la venta', /desde el día que se ganó/.test(v.texto), v.texto);
}
{
  const a = T.ventanaTaller(proy({ plazo_k: 3, fecha_ganado: '' }), null, { hoy: '2026-09-01' });
  const b = T.ventanaTaller(proy({ plazo_k: 3, fecha_ganado: '' }), null, { hoy: '2027-03-15' });
  eq('sin instalación y sin venta: sin_fecha', a.estado, 'sin_fecha');
  eq('todo null', [a.empezar, a.listo, a.material, a.comprar], [null, null, null, null]);
  eq('y con OTRO hoy devuelve exactamente lo mismo: NUNCA se ancla en hoy', JSON.stringify(a), JSON.stringify(b));
}
{
  const a = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-05' });
  const b = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-05' });
  const c = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-22' });
  eq('determinista: dos llamadas iguales, mismo objeto', JSON.stringify(a), JSON.stringify(b));
  eq('cambiar hoy no mueve un solo hito', a.hitos, c.hitos);
  cierto('solo mueve lo que depende de hoy', a.etapa_esperada !== c.etapa_esperada);
}
{
  /* Barrido duro: 5 cubos × 366 fechas de 2028 → cada hito es una fecha válida y la
     distancia empezar→instalación es exactamente el plazo. 1 830 casos. */
  let mal = 0, n = 0, f = '2028-01-01';
  for (let i = 0; i < 366; i++) {
    for (const k of [1, 2, 3, 4, 5]) {
      const v = T.ventanaTaller(proy({ plazo_k: k }), inst({ fecha: f }), { hoy: '2027-06-01' });
      const h = v.hitos;
      if (!Object.values(h).every(partesISO) || !partesISO(v.comprar) ||
          diasEntre(v.empezar, v.instalacion) !== v.plazo_dias) mal++;
      n++;
    }
    f = masDias(f, 1);
  }
  eq('1 830 ventanas por el 2028 completo, todas con hitos válidos y el plazo exacto', mal, 0);
  eq('y se corrieron las 1 830', n, 1830);
}

console.log('\nE · LA ETAPA ESPERADA Y EL ATRASO');
{
  const base = () => proy({ plazo_k: 3 });   // empezar 16 sep, cortado 20, armado 25, listo 29, inst 30
  let v = T.ventanaTaller(base(), inst(), { hoy: '2026-09-10' });
  eq('antes de empezar: esperada ganado, a tiempo', [v.etapa_esperada, v.estado], ['ganado', 'a_tiempo']);
  v = T.ventanaTaller(base(), inst(), { hoy: '2026-09-16' });
  eq('el día de empezar con la etapa en ganado: esperada en_diseno, justo', [v.etapa_esperada, v.estado], ['en_diseno', 'justo']);
  cierto('y el texto dice «hoy toca»', /Hoy toca/.test(v.texto), v.texto);
  v = T.ventanaTaller(base(), inst(), { hoy: '2026-09-23' });
  eq('el 23 con la etapa en ganado: esperada cortado, 7 días tarde (desde el 16)', [v.etapa_esperada, v.atraso_dias, v.estado], ['cortado', 7, 'tarde']);
  cierto('el texto nombra desde cuándo', /desde el 16 sep/.test(v.texto), v.texto);
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'en_diseno' }), inst(), { hoy: '2026-09-23' });
  eq('misma fecha, etapa en_diseno: debía estar cortado desde el 20 → 3 tarde', v.atraso_dias, 3);
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'armado' }), inst(), { hoy: '2026-09-23' });
  eq('etapa por DELANTE de la esperada: atraso 0, holgura hasta listo (29): 6', [v.atraso_dias, v.holgura_dias, v.estado], [0, 6, 'a_tiempo']);
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'listo' }), inst(), { hoy: '2026-09-29' });
  eq('listo la víspera: falta instalar mañana, holgura 1', [v.holgura_dias, v.estado], [1, 'a_tiempo']);
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'listo' }), inst(), { hoy: '2026-10-03' });
  eq('listo y la instalación pasó hace 3 días sin marcar: 3 tarde (es la regla A10)', [v.atraso_dias, v.estado], [3, 'tarde']);
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'garantia' }), inst(), { hoy: '2026-10-03' });
  eq('en garantía: hecho', v.estado, 'hecho');
  v = T.ventanaTaller(proy({ plazo_k: 3, etapa: 'lo-que-sea' }), inst(), { hoy: '2026-09-23' });
  eq('etapa desconocida (basura de un respaldo): no truena, atraso 0', v.atraso_dias, 0);
}

console.log('\nF · LAS CONSTANTES');
{
  const v = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-01', cts: { PLAZO_COLCHON_DIAS: 3, PLAZO_PROVEEDOR_DIAS: 5 } });
  eq('colchón 3: listo el 27', v.listo, '2026-09-27');
  eq('proveedor 5: comprar = cortado − 5', diasEntre(v.comprar, v.material), 5);
  eq('empezar no cambia con el colchón: sigue siendo 30 − 14', v.empezar, '2026-09-16');
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 3 }), inst(), { hoy: '2026-09-01', cts: { PLAZO_COLCHON_DIAS: 'x', PLAZO_PROVEEDOR_DIAS: -40 } });
  eq('constante ilegible cae al valor del repo (colchón 1)', v.listo, '2026-09-29');
  eq('constante fuera de rango se acota (proveedor −40 → 0)', v.comprar, v.material);
  cierto('y nada es NaN', !JSON.stringify(v).includes('NaN'));
}
{
  const v = T.ventanaTaller(proy({ plazo_k: 1 }), inst(), { hoy: '2026-09-01', cts: { PLAZO_COLCHON_DIAS: 7 } });
  cierto('colchón igual al plazo: listo se queda en empezar y los hitos siguen ordenados',
    v.hitos.en_diseno <= v.hitos.cortado && v.hitos.cortado <= v.hitos.armado && v.hitos.armado <= v.hitos.listo, JSON.stringify(v.hitos));
}

console.log('\nG · LA CARGA DE UN DÍA');
{
  const hoy = '2026-09-01';
  const A = T.ventanaTaller(proy({ id: 'a', nombre: 'A', plazo_k: 3 }), inst({ fecha: '2026-09-30' }), { hoy });  // 16–29 sep
  const B = T.ventanaTaller(proy({ id: 'b', nombre: 'B', plazo_k: 1 }), inst({ fecha: '2026-09-22' }), { hoy });  // 15–21 sep
  const C = T.ventanaTaller(proy({ id: 'c', nombre: 'C', plazo_k: 2 }), inst({ fecha: '2026-09-25' }), { hoy });  // 14–24 sep
  const X = T.ventanaTaller(proy({ id: 'x', nombre: 'X', plazo_k: 3, etapa: 'cancelado' }), inst({ fecha: '2026-09-30' }), { hoy });
  const H = T.ventanaTaller(proy({ id: 'h', nombre: 'H', plazo_k: 3, etapa: 'instalado' }), inst({ fecha: '2026-09-30' }), { hoy });
  const G = T.ventanaTaller(proy({ id: 'g', nombre: 'G', plazo_k: 3, fecha_ganado: '2026-09-10' }), null, { hoy });  // ganado, sin inst
  const todas = [A, B, C, X, H, G];

  let c = T.cargaDeDia('2026-09-18', todas);
  eq('el 18: A, B y C están en el taller; X y H no cuentan', c.total, 3);
  eq('por etapa cuadra con el total', Object.values(c.por_etapa).reduce((s, n) => s + n, 0), 3);
  eq('G (ganado sin fecha, con el reloj corriendo) va en sin_fecha, no en total', c.sin_fecha, 1);
  c = T.cargaDeDia('2026-09-16', todas);
  eq('el 16 arranca A', c.empiezan.map(q => q.id), ['a']);
  c = T.cargaDeDia('2026-09-21', todas);
  eq('el 21 debe quedar listo B', c.listos.map(q => q.id), ['b']);
  cierto('y el texto lo dice', /debe quedar listo B/.test(c.texto), c.texto);
  c = T.cargaDeDia('2026-09-12', todas);
  eq('el 12 no hay nadie con fecha (A, B y C arrancan del 14 en adelante)', c.total, 0);
  eq('pero G ya corre desde el 10, y el texto no dice «libre»', /sin fecha/.test(c.texto), true);
  c = T.cargaDeDia('2026-09-05', todas);
  eq('el 5 ni G ha arrancado: taller libre de verdad', c.texto, 'Taller libre.');
  c = T.cargaDeDia('2026-08-20', todas);
  eq('un día sin nada: la carga vacía, nunca undefined', [c.total, c.empiezan, c.listos, c.texto], [0, [], [], 'Taller libre.']);
  eq('fecha inválida no truena', T.cargaDeDia('nada', todas).total, 0);
  eq('null no truena', T.cargaDeDia(null, null).texto, 'Taller libre.');
  {
    /* Una ventana que empieza el mes anterior cuenta el día 1: es el caso que se pierde si
       quien lee el mes no ensancha el rango hacia atrás. */
    const V = T.ventanaTaller(proy({ id: 'v', nombre: 'V', plazo_k: 5 }), inst({ fecha: '2026-10-10' }), { hoy });  // 19 sep – 9 oct
    eq('una ventana que arrancó en septiembre cuenta el 1 de octubre', T.cargaDeDia('2026-10-01', [V]).total, 1);
  }
}

console.log('\nH · EL COTIZADOR DICE LO MISMO');
{
  /* El cotizador es un solo archivo sin módulos y lleva su propio eco de la tabla y de la
     regla de propuesta. Si se separan, el vendedor ve «2 semanas» al capturar y la plataforma
     pinta otra cosa al ganar. Es la misma clase de prueba que ata catalogo-precios.js al
     catálogo del cotizador, en la otra dirección. */
  const html = readFileSync(new URL('../js/cotizador/historial.js', import.meta.url), 'utf8');
  const tabla = (/const PLAZOS_COT=\[([\s\S]*?)\];/.exec(html) || [, ''])[1];
  const filas = [...tabla.matchAll(/\{k:(\d),etiqueta:'([^']+)'\}/g)].map(m => ({ k: +m[1], etiqueta: m[2] }));
  eq('el cotizador tiene los cinco cubos', filas.length, 5);
  eq('con las mismas llaves y las mismas palabras', filas, T.PLAZOS.map(p => ({ k: p.k, etiqueta: p.etiqueta })));
  const mapa = (/const CUBO_POR_TIPO_COT=\{([\s\S]*?)\};/.exec(html) || [, ''])[1];
  const cubos = Object.fromEntries([...mapa.matchAll(/'([^']+)':(\d)/g)].map(m => [m[1], +m[2]]));
  eq('y los siete tipos proponen el mismo cubo que la plataforma',
     cubos, Object.fromEntries(Object.keys(cubos).map(t => [t, T.plazoSugerido([t]).k])));
  eq('los siete, no seis', Object.keys(cubos).length, 7);
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLa ventana de taller cuadra.');
process.exit(fallos ? 1 : 0);
