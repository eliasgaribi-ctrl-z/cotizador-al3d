/* LA PANTALLA DEL TALLER (pedida por Elías el 2026-10-24), PROBADA CON DOBLES. Sin Supabase, en node.

   La función `pantalla` (supabase/functions/pantalla/) y lo que se vigila:
     1. La puerta: solo POST, solo los dos orígenes de la plataforma (o sin Origin), el cuerpo con tope y en JSON.
     2. Pedir un código: el secreto se inventa aquí y a la base solo le llega su huella; el código, sin letras que se confundan;
        un código repetido se vuelve a pedir; el tope por IP.
     3. El tablero: cada estado de la pantalla tal cual, y el secreto viaja en el cuerpo y no vuelve.
     4. La vista: los atrasos son EXACTAMENTE los de `Taller.ventanaTaller()` (el mismo archivo que el Tablero de la app), el
        orden de las fichas es el del Tablero, las próximas instalaciones, y que hacia la TV no salgan las piezas de la cotización.
     5. El archivo para pegar en el panel (desplegar/index.ts): al día con sus fuentes.

   Todo es de mentiras. Se corre con pruebas/correr.sh (o node pruebas/supabase-pantalla.mjs). */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const seccion = t => console.log('\n' + t);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const url = r => pathToFileURL(join(RAIZ, r)).href;

const H = await import(url('supabase/functions/pantalla/handler.js'));
const Taller = await import(url('js/datos/taller.js'));

const AHORA = Date.parse('2026-10-24T18:00:00.000Z');
const ORIGEN = 'https://eliasgaribi-ctrl-z.github.io';
const sha = t => createHash('sha256').update(t, 'utf8').digest('hex');

/** Un cliente de mentiras: contesta con `respuestas[nombre]` (una función de los argumentos) y anota cada llamada. */
function cliente(respuestas) {
  const llamadas = [];
  return { llamadas, async rpcServicio(nombre, args) { llamadas.push({ nombre, args }); return respuestas[nombre](args, llamadas.length); } };
}
const deps = (c, extra = {}) => ({ ahora: () => AHORA, entorno: () => undefined, clienteBase: c, ...extra });
const pedir = (cuerpo, o = {}) => new Request('https://x.supabase.co/functions/v1/pantalla', {
  method: o.metodo || 'POST',
  headers: { ...(o.origen === null ? {} : { origin: o.origen || ORIGEN }), 'content-type': 'text/plain', ...(o.ip ? { 'x-forwarded-for': o.ip } : {}) },
  body: o.metodo === 'GET' || o.metodo === 'OPTIONS' ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
});
const leerJson = async r => [r.status, await r.json()];

seccion('1. LA PUERTA');
{
  const m = H.crearManejador(), c = cliente({});
  eq('otro origen: 403 sin tocar la base', (await m(pedir({ accion: 'pedir' }, { origen: 'https://malo.example' }), deps(c))).status, 403);
  const pre = await m(pedir(null, { metodo: 'OPTIONS' }), deps(c));
  eq('preflight de un origen de la plataforma: 204 con su origen', [pre.status, pre.headers.get('access-control-allow-origin')], [204, ORIGEN]);
  eq('GET: 405', (await m(pedir(null, { metodo: 'GET' }), deps(c))).status, 405);
  eq('cuerpo de más de 2 KB: 413', (await m(pedir('x'.repeat(3000)), deps(c))).status, 413);
  eq('cuerpo que no es JSON: 400', (await m(pedir('{no'), deps(c))).status, 400);
  eq('una acción que no existe: 400', (await m(pedir({ accion: 'borrar' }), deps(c))).status, 400);
  eq('nada de lo anterior llamó a la base', c.llamadas.length, 0);
}

seccion('2. PEDIR UN CÓDIGO');
{
  let n = 0;
  const azar = k => Uint8Array.from({ length: k }, () => (n++ * 37 + 11) % 256);
  const c = cliente({ pantalla_solicitar: (a, i) => i === 1 ? { data: { ok: false, codigo: 'DUPLICADO' } } : { data: { ok: true, codigo: a.p_codigo, vence: '2026-10-24T18:15:00Z' } } });
  const [st, r] = await leerJson(await H.crearManejador()(pedir({ accion: 'pedir' }), deps(c, { azar })));
  eq('200 y ok', [st, r.ok], [200, true]);
  cierto('el secreto: 32 bytes en base64url (43 letras)', /^[A-Za-z0-9_-]{43}$/.test(r.secreto));
  cierto('el código: 6 del alfabeto sin I, L, O, 0 ni 1', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(r.codigo));
  eq('un código repetido se vuelve a pedir: dos llamadas', c.llamadas.length, 2);
  eq('a la base le llega la HUELLA del secreto que vuelve, no el secreto', c.llamadas[1].args.p_secreto_hash, sha(r.secreto));
  cierto('y el secreto no viaja en ningún argumento', !JSON.stringify(c.llamadas).includes(r.secreto));
  eq('el código que vuelve es el que la base guardó', c.llamadas[1].args.p_codigo, r.codigo);

  const lleno = cliente({ pantalla_solicitar: () => ({ data: { ok: false, codigo: 'CUPO_AGOTADO', mensaje: 'Hay demasiadas…' } }) });
  eq('demasiadas esperando: 429 con el aviso de la base', (await H.crearManejador()(pedir({ accion: 'pedir' }), deps(lleno))).status, 429);
  const caida = cliente({ pantalla_solicitar: () => ({ data: null, error: { code: '08006', message: 'sin red' } }) });
  const [st2, r2] = await leerJson(await H.crearManejador()(pedir({ accion: 'pedir' }), deps(caida)));
  eq('la base no contesta: 503 SIN_RED', [st2, r2.codigo], [503, 'SIN_RED']);
  const m = H.crearManejador(), ok = cliente({ pantalla_solicitar: a => ({ data: { ok: true, codigo: a.p_codigo, vence: 'x' } }) });
  const estados = [];
  for (let i = 0; i < 7; i++) estados.push((await m(pedir({ accion: 'pedir' }, { ip: '203.0.113.9' }), deps(ok))).status);
  eq('el tope por IP: seis por cada 10 minutos', estados, [200, 200, 200, 200, 200, 200, 429]);
}

seccion('3. EL TABLERO, ESTADO POR ESTADO');
{
  const SECRETO = 'A'.repeat(43);
  const con = data => cliente({ pantalla_tablero: () => ({ data }) });
  const preguntar = async (data, s = SECRETO) => { const c = con(data); const [st, r] = await leerJson(await H.crearManejador()(pedir({ accion: 'tablero', secreto: s }), deps(c))); return { st, r, c }; };
  eq('sin secreto o con uno raro: 400 sin preguntar', [(await preguntar({}, '')).st, (await preguntar({}, 'corto')).st], [400, 400]);
  const p = await preguntar({ ok: true, estado: 'pendiente', codigo: 'ABC234', vence: 'v' });
  eq('esperando: el código para enseñar', p.r, { ok: true, estado: 'pendiente', codigo: 'ABC234', vence: 'v' });
  eq('a la base le llega la huella del secreto', p.c.llamadas[0].args, { p_secreto_hash: sha(SECRETO) });
  eq('vencida y revocada, tal cual', [(await preguntar({ ok: true, estado: 'vencida' })).r, (await preguntar({ ok: true, estado: 'revocada' })).r],
    [{ ok: true, estado: 'vencida' }, { ok: true, estado: 'revocada' }]);
  eq('la base no la conoce: 200 con NO_ENCONTRADO (la TV olvida su secreto)', (await preguntar({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'x' })).r.codigo, 'NO_ENCONTRADO');
  const caida = cliente({ pantalla_tablero: () => ({ data: null, error: { code: 'PGRST', message: 'x' } }) });
  eq('la base no contesta: 503', (await H.crearManejador()(pedir({ accion: 'tablero', secreto: SECRETO }), deps(caida))).status, 503);
}

seccion('4. LA VISTA: los atrasos de taller.js, el orden del Tablero y nada de más');
{
  const hoy = '2026-10-24';
  const items = [{ titulo: 'Caja de luz', ancho: 300, alto: 90, cantidad: 1 }];
  const obras = [
    { id: 'a1', nombre: 'Ana - Tacos (Caja)', negocio: 'Tacos', etapa: 'en_diseno', tipo_trabajo: ['Caja de luz con iluminacion'], fecha_ganado: '2026-10-01', plazo_k: 2, origen: { items } },
    { id: 'a2', nombre: 'Beto - Gym (Letras)', negocio: 'Gym', etapa: 'armado', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_ganado: '2026-10-20', plazo_k: null, origen: { items: [] } },
    { id: 'a3', nombre: 'Caro - Café', negocio: 'Café', etapa: 'armado', tipo_trabajo: [], fecha_ganado: null, plazo_k: null, origen: null },
    { id: 'a4', nombre: 'Dani - Bar', negocio: 'Bar', etapa: 'listo', tipo_trabajo: ['Rotulacion de vinil'], fecha_ganado: '2026-10-10', plazo_k: 1, origen: { items: [] } },
    { id: 'a5', nombre: 'Eli - Pan', negocio: 'Pan', etapa: 'armado', tipo_trabajo: ['Rotulacion de vinil'], fecha_ganado: '2026-10-01', plazo_k: 1, origen: { items: [] } },
  ];
  const instalaciones = [
    { proyecto_id: 'a4', fecha: '2026-10-27', hora: '10:00', ventana: 'dia', estado: 'confirmada' },
    { proyecto_id: 'a2', fecha: '2026-10-29', hora: null, ventana: 'dia', estado: 'propuesta' },
    { proyecto_id: 'a2', fecha: '2026-10-28', hora: '09:00', ventana: 'dia', estado: 'reagendada' },
    { proyecto_id: 'a1', fecha: '2026-11-30', hora: '09:00', ventana: 'dia', estado: 'propuesta' },
    { proyecto_id: 'a5', fecha: '2026-10-25', hora: '08:00', ventana: 'dia', estado: 'hecha' },
  ];
  const cts = { PLAZO_COLCHON_DIAS: 1, PLAZO_PROVEEDOR_DIAS: 2 };
  const v = H.vista({ nombre: 'Taller', hoy, actualizado: '2026-10-24T18:00:00Z', constantes: cts, obras, instalaciones });

  eq('las cinco estaciones, con los nombres de la app', v.estaciones.map(e => [e.etapa, e.nombre]),
    [['ganado', 'Ganado'], ['en_diseno', 'En diseño'], ['cortado', 'Cortado'], ['armado', 'Armado'], ['listo', 'Listo para instalar']]);
  // la instalación viva de cada obra, como la elige el Tablero: la primera en el orden del día
  const viva = { a1: instalaciones[3], a2: instalaciones[2], a4: instalaciones[0], a5: instalaciones[4] };
  const todas = v.estaciones.flatMap(e => e.fichas);
  for (const o of obras) {
    const f = todas.find(x => x.id === o.id);
    const t = Taller.ventanaTaller({ ...o }, viva[o.id] || null, { hoy, cts });
    eq('«' + o.nombre + '»: estado, atraso y texto IDÉNTICOS a ventanaTaller', [f.estado, f.atraso_dias, f.texto], [t.estado, t.atraso_dias || 0, t.texto]);
  }
  const arm = v.estaciones.find(e => e.etapa === 'armado').fichas;
  eq('dentro de una estación, el orden del Tablero (PESO: no_llega, tarde, justo, a tiempo, sin fecha)',
    arm.map(f => f.estado), arm.map(f => f.estado).slice().sort((a, b) => ({ no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4, hecho: 5 }[a] - { no_llega: 0, tarde: 1, justo: 2, a_tiempo: 3, sin_fecha: 4, hecho: 5 }[b])));
  eq('próximas: las que vienen en dos semanas, en orden, sin la hecha ni la de noviembre',
    v.proximas.map(p => [p.titulo, p.fecha, p.hora, p.confirmada]),
    [['Dani - Bar', '2026-10-27', '10:00', true], ['Beto - Gym (Letras)', '2026-10-28', '09:00', false], ['Beto - Gym (Letras)', '2026-10-29', null, false]]);
  eq('el resumen cuenta obras, tarde y justo', Object.keys(v.resumen), ['obras', 'tarde', 'justo']);
  const texto = JSON.stringify(v);
  for (const no of ['origen', 'items', 'ancho', 'Caja de luz', 'tipo_trabajo', 'fecha_ganado', 'plazo_k']) cierto('hacia la TV no sale «' + no + '»', !texto.includes(no));

  // y por la función completa: lo que va al cable es esa vista, sin el secreto
  const SECRETO = 'B'.repeat(43);
  const c = cliente({ pantalla_tablero: () => ({ data: { ok: true, estado: 'activa', nombre: 'Taller', hoy, actualizado: null, constantes: cts, obras, instalaciones } }) });
  const [st, r] = await leerJson(await H.crearManejador()(pedir({ accion: 'tablero', secreto: SECRETO }), deps(c)));
  const esperada = H.vista({ nombre: 'Taller', hoy, actualizado: null, constantes: cts, obras, instalaciones });
  for (const o of esperada.ordenes) { delete o.imagen_ruta; o.imagen = null; }      // sin `firmar`, las órdenes van sin plano
  eq('activa, por la función: 200 y la misma vista', [st, JSON.stringify(r) === JSON.stringify(esperada)], [200, true]);
  cierto('el secreto no vuelve en la respuesta', !JSON.stringify(r).includes(SECRETO));
}

seccion('4b. LA ORDEN DE TRABAJO: las reglas de la impresa, las de producción, sin datos del cliente, y el plano firmado');
{
  // las reglas de la orden impresa (js/cotizador/entrega.js y nucleo.js) siguen siendo las que copia `pieza`
  const entrega = leer('js/cotizador/entrega.js'), nucleo = leer('js/cotizador/nucleo.js');
  eq('el cotizador sigue con los mismos títulos, medidas y piezas (si cambian allá, cambiar `pieza`)', [
    "tit='Letras Individuales 3D'", "tit='Recorte de Acrílico'", "tit='Bastidor para Letras 3D'", "tit='Caja de Luz'",
    'return `${cifra(it.altura)}cm alt.`', 'return `${cifra(it.altura)}cm × pieza`', 'return `${cifra(it.ancho)}×${cifra(it.alto)} cm`',
  ].filter(x => !entrega.includes(x)).concat(["if(it.tipo==='letras'||it.tipo==='recorte') return it.n||0;", 'return it.pz||1;'].filter(x => !nucleo.includes(x))), []);
  eq('letras con luz cálida y texto libre', H.pieza({ tipo: 'letras', altura: 40, n: 8, luz: true, ilumTipo: 'calida', desc: 'Logo arriba' }),
    { titulo: 'Letras Individuales 3D', detalle: 'Con iluminación LED cálida (3000K). Logo arriba', medidas: '40cm alt.', piezas: 8 });
  eq('caja de luz: una pieza, ancho por alto', H.pieza({ tipo: 'caja', ancho: 300, alto: 90 }),
    { titulo: 'Caja de Luz', detalle: 'Caras en acrílico con iluminación LED fría', medidas: '300×90 cm', piezas: 1 });
  eq('una altura que no es número se imprime 0, como en el cotizador', H.pieza({ tipo: 'recorte', altura: '"><img src=x>', n: 3 }).medidas, '0cm × pieza');
  eq('una partida libre: su texto como título', H.pieza({ desc: 'Vinil en vitrina', pz: 2 }), { titulo: 'Vinil en vitrina', detalle: '', medidas: '—', piezas: 2 });
  eq('con opciones sin elegir, el «Ojo» de la orden impresa',
    /Ojo: el cliente aún no elige entre 2 opciones/.test(H.pieza({ tipo: 'bastidor', ancho: 1, alto: 1, opciones: { activa: 1, lista: [{ k: 1 }, { k: 2 }] } }).detalle), true);

  const hoy = '2026-10-24';
  const it = (n, extra = {}) => ({ tipo: 'letras', altura: 30, n, luz: false, ...extra });
  const obras = [
    { id: 'b1', nombre: 'Uno - Tacos', negocio: 'Tacos', etapa: 'armado', tipo_trabajo: [], fecha_ganado: '2026-10-20', plazo_k: 2, folio_global: 'COT-0001@K7QM',
      origen: { items: [it(5, { plano: 'img_plano1' }), it(3)], entrega: 'viernes 30 de octubre', notaCliente: 'Con brillo', renders: ['img_r1'], tel: '33 1234 5678', cliente: 'Juan Pérez' } },
    { id: 'b2', nombre: 'Dos - Gym', negocio: 'Gym', etapa: 'en_diseno', tipo_trabajo: [], fecha_ganado: '2026-10-20', plazo_k: 2, folio_global: 'COT-0002@K7QM',
      origen: { items: Array.from({ length: 10 }, (_, i) => it(i + 1)), renders: ['img_r2'] } },
    { id: 'b3', nombre: 'Tres - Bar', negocio: 'Bar', etapa: 'cortado', tipo_trabajo: [], fecha_ganado: '2026-10-20', plazo_k: 2, folio_global: null, origen: { items: [] } },
    { id: 'b4', nombre: 'Cuatro - Pan', negocio: 'Pan', etapa: 'listo', tipo_trabajo: [], fecha_ganado: '2026-10-20', plazo_k: 2, folio_global: 'COT-0004@K7QM', origen: { items: [it(1)] } },
    { id: 'b5', nombre: 'Cinco - Café', negocio: 'Café', etapa: 'ganado', tipo_trabajo: [], fecha_ganado: '2026-10-20', plazo_k: 2, folio_global: 'COT-0005@K7QM', origen: { items: [it(1)] } },
  ];
  const d = { nombre: 'Taller', hoy, empresa: 'al3d', actualizado: null, constantes: {}, obras, instalaciones: [] };
  const v = H.vista(d);
  eq('solo las de producción (diseño, corte, armado) y con piezas, en el orden del tablero', v.ordenes.map(o => [o.id, o.etapa_nombre]), [['b2', 'En diseño'], ['b1', 'Armado']]);
  const uno = v.ordenes.find(o => o.id === 'b1'), dos = v.ordenes.find(o => o.id === 'b2');
  eq('el límite y la nota de la cotización', [uno.limite, uno.nota], ['viernes 30 de octubre', 'Con brillo']);
  eq('el plano de la primera partida que lo trae, en la carpeta de SU cotización', uno.imagen_ruta, 'al3d/COT-0001@K7QM/img_plano1.jpg');
  eq('sin plano en las partidas, el primer render', dos.imagen_ruta, 'al3d/COT-0002@K7QM/img_r2.jpg');
  eq('ocho piezas a lo más, y cuántas faltan', [dos.piezas.length, dos.mas_piezas], [8, 2]);
  const texto = JSON.stringify(v.ordenes);
  for (const no of ['33 1234 5678', 'Juan Pérez', 'tel', 'cliente']) eq('la orden no lleva «' + no + '»', texto.includes(no), false);

  // el plano firmado, por la función
  const SECRETO = 'C'.repeat(43);
  const c = cliente({ pantalla_tablero: () => ({ data: { ok: true, estado: 'activa', ...d } }) });
  const firmas = [];
  const firmar = async (bucket, ruta, s) => { firmas.push([bucket, ruta, s]); return 'https://x.supabase.co/storage/v1/object/sign/' + bucket + '/' + ruta + '?token=t' + firmas.length; };
  const m = H.crearManejador();
  const [, r1] = await leerJson(await m(pedir({ accion: 'tablero', secreto: SECRETO }), deps(c, { firmar })));
  eq('firma cada plano en el bucket privado por una hora', firmas,
    [['cotizacion-imagenes', 'al3d/COT-0002@K7QM/img_r2.jpg', 3600], ['cotizacion-imagenes', 'al3d/COT-0001@K7QM/img_plano1.jpg', 3600]]);
  eq('la TV recibe la liga, no la ruta', [r1.ordenes.every(o => /^https:\/\//.test(o.imagen)), r1.ordenes.some(o => 'imagen_ruta' in o)], [true, false]);
  await m(pedir({ accion: 'tablero', secreto: SECRETO }), deps(c, { firmar }));
  eq('la vuelta siguiente reusa las ligas: no vuelve a firmar', firmas.length, 2);
  const falla = async () => { throw new Error('Object not found'); };
  const [st3, r3] = await leerJson(await H.crearManejador()(pedir({ accion: 'tablero', secreto: SECRETO }), deps(c, { firmar: falla })));
  eq('si Storage no la tiene, la orden sale sin plano y el tablero no falla', [st3, r3.ordenes.map(o => o.imagen)], [200, [null, null]]);
  const rara = async () => 'javascript:alert(1)';
  eq('una «liga» que no es https no pasa',
    (await leerJson(await H.crearManejador()(pedir({ accion: 'tablero', secreto: SECRETO }), deps(c, { firmar: rara }))))[1].ordenes.map(o => o.imagen), [null, null]);
}

seccion('5. EL ARCHIVO PARA EL PANEL (desplegar/index.ts) — al día con sus fuentes');
{
  const txt = leer('supabase/functions/pantalla/desplegar/index.ts');
  const fuentes = [...txt.matchAll(/^\/\/ {3}([0-9a-f]{16}) {2}(\S+)$/gm)].map(m => ({ h: m[1], f: m[2] }));
  const huella = t => createHash('sha256').update(t.replace(/\r\n/g, '\n'), 'utf8').digest('hex').slice(0, 16);
  eq('cada fuente de su cabecera tiene la huella de hoy (si falla: node supabase/functions/pantalla/desplegar/armar.mjs)',
    fuentes.filter(x => !existsSync(join(RAIZ, x.f)) || huella(readFileSync(join(RAIZ, x.f), 'utf8')) !== x.h).map(x => x.f), []);
  const deben = ['supabase/functions/pantalla/index.ts', 'supabase/functions/pantalla/handler.js', 'js/datos/taller.js', 'js/datos/proyectos.js', 'supabase/functions/_shared/http.js'];
  eq('y lleva las fuentes que tiene que llevar (la regla de atrasos de la app adentro)', deben.filter(f => !fuentes.some(x => x.f === f)), []);
  eq('lo único de fuera: supabase-js 2', [...new Set([...txt.matchAll(/^import .* from "([^"]+)";$/gm)].map(m => m[1]))].sort(), ['npm:@supabase/supabase-js@2']);
  cierto('empieza con @ts-nocheck', txt.startsWith('// @ts-nocheck\n'));
  const esbuild = join(RAIZ, 'supabase/functions/pantalla/desplegar/node_modules/esbuild/package.json');
  if (existsSync(esbuild)) {
    const r = spawnSync(process.execPath, [join(RAIZ, 'supabase/functions/pantalla/desplegar/armar.mjs'), '--comprobar'], { encoding: 'utf8' });
    eq('con esbuild a la mano: armado otra vez sale IDÉNTICO', r.status, 0);
  } else console.log('  ·    (esbuild no está instalado en desplegar/: la comparación byte por byte se salta; las huellas de arriba sí corrieron)');
}

console.log('\n' + (mal ? mal + ' FALLA(S) de ' + (bien + mal) + '.' : 'Todo pasa. ' + bien + ' comprobaciones.'));
process.exit(mal ? 1 : 0);
