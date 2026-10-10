// La semilla del almacén — A.md §10.10, caso AL-20 («sembrar las 19 filas de semilla dos veces: idempotente»).
//
// `supabase/opcional/semilla_materiales.mjs` lleva `datos/semilla.json` (19 materiales y 20 constantes) a una empresa. La llamada HTTP a PostgREST no se puede
// probar aquí; lo que SÍ se prueba es todo lo demás: que las filas que arma pasan TODOS los CHECK de las tablas reales, que sembrar dos veces no cambia nada, que
// no pisa lo que alguien ya editó, que usa el vocabulario de la base (m² → m2, merma → merma_pct) y que el script se niega a escribir sin sus variables de entorno.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { construirFilas, sembrar, COLUMNAS_SELLADAS } from '../../opcional/semilla_materiales.mjs';

const RUTA_SEMILLA = fileURLToPath(new URL('../../../datos/semilla.json', import.meta.url));
const RUTA_SCRIPT = fileURLToPath(new URL('../../opcional/semilla_materiales.mjs', import.meta.url));
const SEMILLA = JSON.parse(readFileSync(RUTA_SEMILLA, 'utf8'));
const plantilla = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });

/** Lo que haría el servicio con `Prefer: resolution=ignore-duplicates`: INSERT … ON CONFLICT DO NOTHING con los privilegios de service_role; devuelve cuántas entraron. */
async function sembrarEnBase(db, filas) {
  const S = como(db, { rol: 'service_role', confirmar: true });
  // como PostgREST: solo las columnas que el JSON trae (el resto toma su valor por omisión)
  const insertar = async (tabla, lista, conflicto, devuelve) => {
    if (!lista.length) return [];
    const cols = Object.keys(lista[0]).map(c => '"' + c + '"').join(', ');
    return S.query(`insert into public.${tabla} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${tabla}, $1::jsonb) on conflict (${conflicto}) do nothing returning ${devuelve}`, [JSON.stringify(lista)]);
  };
  const m = await insertar('materiales', filas.materiales, 'empresa_id, id', 'id');
  const c = await insertar('constantes', filas.constantes, 'empresa_id, clave', 'clave');
  return { materiales: m.length, constantes: c.length };
}
const foto = db => sql(db, `select 'm' as t, id as k, updated_at::text as u, to_jsonb(m)::text as fila from public.materiales m union all select 'c', clave, updated_at::text, to_jsonb(c)::text from public.constantes c order by 1, 2`);

describir('AL-20 la semilla de verdad (datos/semilla.json)', () => {
  prueba('AL-20 la semilla trae 19 materiales y 20 constantes y se arma sin avisos: nada se omite ni se adivina', () => {
    const f = construirFilas(SEMILLA, 'al3d');
    igual([f.materiales.length, f.constantes.length, f.avisos], [19, 20, []]);
    igual([f.version, new Set(f.materiales.map(m => m.id)).size, new Set(f.constantes.map(c => c.clave)).size], ['c-2026-08', 19, 20]);
  });
  prueba('AL-20 el vocabulario de la base: «m²» → m2, «m de cordón» → m, «m² limpiados» → m2; `merma` → merma_pct; cada campo sellado con 1 y _editado 1; costo_compra no es columna', () => {
    const f = construirFilas(SEMILLA, 'al3d'), por = id => f.materiales.find(m => m.id === id);
    igual([por('acr-3mm').unidad_consumo, por('silicon').unidad_consumo, por('solvente').unidad_consumo, por('fleje-al-pintado').unidad_consumo, por('tubular-1').unidad_consumo], ['m2', 'm', 'm2', 'm', 'cm']);
    igual([por('acr-3mm').merma_pct, por('acr-3mm').factor, por('acr-3mm').unidad_compra, por('acr-3mm').fraccionable, por('acr-3mm').largo_cm, por('acr-3mm').ancho_cm], [0.25, 2.9768, 'lamina', true, 244, 122]);
    for (const m of f.materiales) {
      igual(Object.keys(m.sellos).sort(), [...COLUMNAS_SELLADAS, '_editado'].sort());
      cierto(Object.values(m.sellos).every(v => v === 1), 'el sello más viejo posible');
      cierto(!('costo_compra' in m) && !('merma' in m), m.id);
      cierto(m.factor_origen.length > 10, `${m.id} trae de dónde salió su factor`);
    }
    const c = f.constantes.find(x => x.clave === 'K_ANCHO_CAJA');
    igual([c.valor, c.unidad, c.version, c.actualizado_por, c.nota.startsWith('El ancho de tinta')], [0.75, 'ancho ÷ altura', 'c-2026-08', '', true]);
  });
  prueba('AL-20 las 19 filas y las 20 constantes pasan TODOS los CHECK de las tablas reales (service_role, sin pasar por ninguna RPC)', () => conCopia(plantilla, async db => {
    const r = await sembrarEnBase(db, construirFilas(SEMILLA, 'al3d'));
    igual(r, { materiales: 19, constantes: 20 });
    igual((await una(db, `select count(*)::int as n from public.materiales`)).n, 19);
    const m = await una(db, `select unidad_consumo, merma_pct::text as merma, sellos ->> 'nombre' as s, sellos ->> '_editado' as e, activo from public.materiales where id = 'acr-3mm'`);
    igual([m.unidad_consumo, m.merma, m.s, m.e, m.activo], ['m2', '0.25', '1', '1', true]);
  }));
  prueba('AL-20 sembrar DOS veces es idempotente: la segunda no inserta nada y no cambia ni una fila ni su updated_at', () => conCopia(plantilla, async db => {
    const filas = construirFilas(SEMILLA, 'al3d');
    igual(await sembrarEnBase(db, filas), { materiales: 19, constantes: 20 });
    const f1 = await foto(db);
    await new Promise(r => setTimeout(r, 15));
    igual(await sembrarEnBase(db, filas), { materiales: 0, constantes: 0 });
    igual(await foto(db), f1);
  }));
  prueba('AL-20 NO pisa lo que alguien ya editó: tras cambiar un nombre y una constante, la siembra repetida los respeta; y una empresa distinta recibe su propia copia', () => conCopia(plantilla, async db => {
    const filas = construirFilas(SEMILLA, 'al3d');
    await sembrarEnBase(db, filas);
    const r = await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'almacen_aplicar', { p_ops: [{ id: 'op-ed', almacen: 'materiales', tipo: 'actualizar', registro_id: 'acr-3mm', datos: { id: 'acr-3mm', nombre: 'Acrílico EDITADO', actualizado_en: Date.now() } }] });
    igual(r.resultados[0].ok, true);
    const c = await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'constante_guardar', { p_op: { clave: 'K_ANCHO_CAJA', valor: 0.8, unidad: 'ancho ÷ altura' } });
    igual(c.ok, true);
    igual(await sembrarEnBase(db, filas), { materiales: 0, constantes: 0 });
    igual([(await una(db, `select nombre from public.materiales where id = 'acr-3mm'`)).nombre, (await una(db, `select valor::text as v from public.constantes where clave = 'K_ANCHO_CAJA'`)).v], ['Acrílico EDITADO', '0.8']);
    // otra empresa: sus propias filas (mismos ids, otro empresa_id)
    const otra = await sembrarEnBase(db, construirFilas(SEMILLA, 'otra'));
    igual(otra, { materiales: 19, constantes: 20 });
    igual((await una(db, `select count(*)::int as n from public.materiales where empresa_id = 'otra'`)).n, 19);
  }));
  prueba('AL-20 lo sembrado pierde contra cualquier edición real (sello 1): un cambio con un sello cualquiera gana por la compuerta; uno atrasado (sello 0 → ahora) no', () => conCopia(plantilla, async db => {
    await sembrarEnBase(db, construirFilas(SEMILLA, 'al3d'));
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    const viejo = await llamar(D, 'almacen_aplicar', { p_ops: [{ id: 'op-a', almacen: 'materiales', tipo: 'actualizar', registro_id: 'led-6500', datos: { id: 'led-6500', proveedor: 'Proveedor A', actualizado_en: 2 } }] });
    igual([viejo.resultados[0].ok, (await una(db, `select proveedor from public.materiales where id = 'led-6500'`)).proveedor], [true, 'Proveedor A']);
    await llamar(D, 'almacen_aplicar', { p_ops: [{ id: 'op-b', almacen: 'materiales', tipo: 'actualizar', registro_id: 'led-6500', datos: { id: 'led-6500', proveedor: 'Proveedor B', actualizado_en: 1 } }] });
    igual((await una(db, `select proveedor from public.materiales where id = 'led-6500'`)).proveedor, 'Proveedor A', 'un cambio con sello 1 (empate con la semilla) o menor no pisa uno posterior');
  }));
});

describir('AL-20 construirFilas rechaza lo que la base rechazaría y el script no escribe a ciegas', () => {
  prueba('AL-20 filas inválidas (factor 0, merma 1.5, mínimo negativo, id vacío o repetido, clave de constante mala, valor no numérico) se OMITEN con aviso; lo demás pasa; una semilla sin la forma esperada lanza', () => {
    const mala = { version: 'x', materiales: [
      { id: 'ok', nombre: 'Bueno', unidad_compra: 'lamina', unidad_consumo: 'm²', factor: 2, merma: 0.1, factor_origen: 'x' },
      { id: 'f0', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 0 }, { id: 'm15', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, merma: 1.5 },
      { id: 'neg', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, min_compra: -1 }, { id: '', factor: 1 }, { id: 'ok', factor: 3 },
      { id: 'raro', unidad_compra: 'rollo', unidad_consumo: 'yardas', factor: 1, costo_compra: 50 },
    ], constantes: [{ clave: 'BUENA', valor: 1 }, { clave: 'mala clave', valor: 1 }, { clave: 'SINVALOR', valor: 'x' }, { clave: '_semilla', valor: 0 }, { clave: 'BUENA', valor: 2 }] };
    const f = construirFilas(mala, 'al3d');
    igual(f.materiales.map(m => m.id), ['ok', 'raro']);
    igual([f.materiales[1].unidad_compra, f.materiales[1].unidad_consumo], ['unidad', 'pieza'], 'una unidad fuera del vocabulario cae a la de respaldo, con aviso');
    igual(f.constantes.map(c => c.clave), ['BUENA']);
    cierto(f.avisos.length >= 8, 'cada omisión dice por qué: ' + f.avisos.length);
    for (const forma of [null, {}, { materiales: [] }, { materiales: {}, constantes: [] }]) { let lanzo = false; try { construirFilas(forma); } catch { lanzo = true; } igual(lanzo, true); }
    let empresaMala = false; try { construirFilas(SEMILLA, 'Mala Empresa'); } catch { empresaMala = true; }
    igual(empresaMala, true);
  });
  prueba('AL-20 sembrar() manda ignore-duplicates con la llave SOLO en cabeceras, cuenta lo que entró y no repite el cuerpo de un error (fetch inyectado: no hay red)', async () => {
    const llamadas = [];
    const falso = async (url, init) => { llamadas.push({ url, init }); return { ok: true, status: 201, json: async () => JSON.parse(init.body).slice(0, 3) }; };
    const filas = construirFilas(SEMILLA, 'al3d');
    const r = await sembrar({ url: 'https://ejemplo.invalid/', llave: 'LLAVE-FALSA', filas, fetchImpl: falso });
    igual([r.materiales, r.constantes], [{ nuevas: 3, ya_estaban: 16 }, { nuevas: 3, ya_estaban: 17 }]);
    igual(llamadas.map(l => l.url), ['https://ejemplo.invalid/rest/v1/materiales?on_conflict=empresa_id,id', 'https://ejemplo.invalid/rest/v1/constantes?on_conflict=empresa_id,clave']);
    igual(llamadas[0].init.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    cierto(llamadas.every(l => !l.url.includes('LLAVE-FALSA') && !l.init.body.includes('LLAVE-FALSA')), 'la llave no viaja ni en la URL ni en el cuerpo');
    let msg = '';
    try { await sembrar({ url: 'https://ejemplo.invalid', llave: 'LLAVE-FALSA', filas, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ detalle: 'DATOS-SECRETOS' }) }) }); } catch (e) { msg = e.message; }
    cierto(msg.includes('401') && !msg.includes('DATOS-SECRETOS') && !msg.includes('LLAVE-FALSA'), msg);
    let sin = ''; try { await sembrar({ url: '', llave: '', filas }); } catch (e) { sin = e.message; }
    cierto(/AL3D_SUPABASE_URL/.test(sin), 'sin variables de entorno se niega');
  });
  prueba('AL-20 el script, sin argumentos, hace un SIMULACRO (no toca la red ni pide llave); con --aplicar y sin variables de entorno se NIEGA (código 1) y no imprime ninguna llave', () => {
    const env = { ...process.env }; delete env.AL3D_SUPABASE_URL; delete env.AL3D_SUPABASE_SERVICE_ROLE;
    const simulacro = execFileSync(process.execPath, [RUTA_SCRIPT], { env, encoding: 'utf8' });
    cierto(/19 materiales y 20 constantes/.test(simulacro) && /Simulacro: no se escribió nada/.test(simulacro), simulacro);
    const aplicar = spawnSync(process.execPath, [RUTA_SCRIPT, '--aplicar'], { env, encoding: 'utf8' });
    igual([aplicar.status, /Faltan AL3D_SUPABASE_URL/.test(aplicar.stderr), /No se escribió nada/.test(aplicar.stderr)], [1, true, true]);
    const sinArchivo = spawnSync(process.execPath, [RUTA_SCRIPT, '--semilla', 'no-existe.json'], { env, encoding: 'utf8' });
    igual([sinArchivo.status, /No pude leer la semilla/.test(sinArchivo.stderr)], [1, true]);
    const con = spawnSync(process.execPath, [RUTA_SCRIPT, '--aplicar'], { env: { ...env, AL3D_SUPABASE_URL: 'http://127.0.0.1:9', AL3D_SUPABASE_SERVICE_ROLE: 'LLAVE-FALSA-NO-IMPRIMIR' }, encoding: 'utf8' });
    cierto(!(con.stdout + con.stderr).includes('LLAVE-FALSA-NO-IMPRIMIR'), 'la llave no se imprime ni en un error de red');
  });
});

await resumen();
