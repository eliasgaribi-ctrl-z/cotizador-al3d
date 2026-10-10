// El orden de las migraciones y lo que cada archivo nombra — A.md §9.1: «un archivo no depende de nada posterior».
//
// Dos comprobaciones que ninguna otra prueba hace:
//   1. ESTÁTICA, sobre el texto de los once archivos: cada objeto (`interno.x`, `public.x`) que un archivo nombra —también DENTRO del cuerpo de una función plpgsql, que
//      Postgres no revisa al crearla— existe, y lo define ese mismo archivo o uno ANTERIOR. Un nombre mal escrito en un cuerpo de función solo truena el día que alguien
//      llama a esa función; aquí truena al correr las pruebas.
//   2. DINÁMICA: cada archivo carga sobre una base que tiene SOLO sus dependencias declaradas (la tabla «Depende de» de §9.1) y un archivo no carga sin ellas.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describir, prueba, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBase, sql } from '../arnes/arnes.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe } from '../comun/semilla.js';

const CARPETA = fileURLToPath(new URL('../../migrations/', import.meta.url));
const ARCHIVOS = readdirSync(CARPETA).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const TEXTOS = Object.fromEntries(ARCHIVOS.map(f => [f, readFileSync(join(CARPETA, f), 'utf8')]));
const NUM = f => Number(f.slice(0, 4));

/** El texto sin comentarios de línea (`-- …`) que no estén dentro de una cadena: la prosa de los comentarios nombra objetos que no son referencias. */
function sinComentarios(texto) {
  return texto.split('\n').map(l => {
    let abierta = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === "'") abierta = !abierta;
      else if (!abierta && l[i] === '-' && l[i + 1] === '-') return l.slice(0, i);
    }
    return l;
  }).join('\n');
}
/** Lo que cada archivo DEFINE: funciones, tablas, vistas y tipos de `public` e `interno` (con el número del archivo). */
function definiciones() {
  const def = new Map();                                       // 'esquema.nombre' → número del archivo
  const poner = (q, f) => { if (!def.has(q)) def.set(q, NUM(f)); };
  for (const [f, t0] of Object.entries(TEXTOS)) {
    const t = sinComentarios(t0);
    for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public|interno)\.([a-z_0-9]+)/gi)) poner(`${m[1]}.${m[2]}`, f);
    for (const m of t.matchAll(/create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(public|interno)\.([a-z_0-9]+)/gi)) poner(`${m[1]}.${m[2]}`, f);
    for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(public|interno)\.([a-z_0-9]+)/gi)) poner(`${m[1]}.${m[2]}`, f);
    for (const m of t.matchAll(/create\s+schema\s+(?:if\s+not\s+exists\s+)?(interno)/gi)) poner('esquema.interno', f);
    for (const m of t.matchAll(/'create type (interno)\.([a-z_0-9]+)/gi)) poner(`${m[1]}.${m[2]}`, f);       // el tipo contexto_t se crea con `execute` dentro de un bloque DO
    for (const m of t.matchAll(/create\s+type\s+(interno)\.([a-z_0-9]+)/gi)) poner(`${m[1]}.${m[2]}`, f);
  }
  return def;
}
const DEF = definiciones();

/** Los objetos que cada archivo NOMBRA (calificados con `public.` o `interno.`). */
function referencias(texto0) {
  const t = sinComentarios(texto0);
  const refs = new Set();
  for (const m of t.matchAll(/(?<![A-Za-z0-9_."])(public|interno)\.([a-z_][a-z_0-9]*)/g)) refs.add(`${m[1]}.${m[2]}`);
  return refs;
}

describir('referencias estáticas: todo lo que un archivo nombra existe y es de ese archivo o de uno anterior', () => {
  prueba('hay once archivos numerados del 0001 al 0011 sin huecos', () => {
    igual(ARCHIVOS.map(NUM), Array.from({ length: 11 }, (_, i) => i + 1));
    cierto(DEF.size > 100, 'se encontraron las definiciones: ' + DEF.size);
  });
  prueba('ningún archivo nombra un objeto que NO exista en ninguna migración (un nombre mal escrito en el cuerpo de una función solo truena al llamarla)', () => {
    const huerfanas = [];
    for (const [f, t] of Object.entries(TEXTOS)) for (const r of referencias(t)) if (!DEF.has(r)) huerfanas.push(`${f}: ${r}`);
    igual(huerfanas, []);
  });
  prueba('ningún archivo nombra un objeto que defina un archivo POSTERIOR (el orden 0001…0011 es suficiente y necesario)', () => {
    const adelantadas = [];
    for (const [f, t] of Object.entries(TEXTOS)) for (const r of referencias(t)) if (DEF.has(r) && DEF.get(r) > NUM(f)) adelantadas.push(`${f} nombra ${r}, que define 000${DEF.get(r)}`.replace('000' + DEF.get(r), String(DEF.get(r)).padStart(4, '0')));
    igual(adelantadas, []);
  });
  prueba('cada archivo es idempotente por escrito: toda tabla/índice con `if not exists`, toda función con `create or replace`, toda política y todo trigger precedidos de su `drop … if exists`', () => {
    const malas = [];
    for (const [f, t0] of Object.entries(TEXTOS)) {
      const t = sinComentarios(t0);
      for (const m of t.matchAll(/create\s+table\s+(?!if\s+not\s+exists)([a-z_.]+)/gi)) malas.push(`${f}: create table ${m[1]} sin if not exists`);
      for (const m of t.matchAll(/create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)([a-z_]+)/gi)) malas.push(`${f}: create index ${m[1]} sin if not exists`);
      for (const m of t.matchAll(/create\s+function\s+([a-z_.]+)/gi)) malas.push(`${f}: create function ${m[1]} sin or replace`);
      for (const m of t.matchAll(/create\s+policy\s+([a-z_0-9]+)\s+on\s+([a-z_.]+)/gi)) if (!new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${m[1]}\\s+on\\s+${m[2].replace('.', '\\.')}`, 'i').test(t)) malas.push(`${f}: la política ${m[1]} no tiene su drop policy if exists`);
      for (const m of t.matchAll(/create\s+trigger\s+([a-z_0-9]+)\s+(?:before|after)[^;]*?\son\s+([a-z_.]+)/gis)) if (!new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${m[1]}\\s+on\\s+${m[2].replace('.', '\\.')}`, 'i').test(t)) malas.push(`${f}: el trigger ${m[1]} no tiene su drop trigger if exists`);
    }
    igual(malas, []);
  });
  prueba('ninguna migración usa extensiones de Supabase ni de Postgres fuera del núcleo: nada de pgcrypto, pg_cron, pg_net, vault, extensions.*, ni CREATE EXTENSION', () => {
    for (const [f, t0] of Object.entries(TEXTOS)) {
      const t = sinComentarios(t0);
      for (const prohibido of [/create\s+extension/i, /\bpgcrypto\b/i, /\bpg_cron\b/i, /\bpg_net\b/i, /\bvault\./i, /\bextensions\./i, /\bgen_random_bytes\b/i, /\bdigest\s*\(/i, /\bhmac\s*\(/i]) {
        igual([f, prohibido.source, prohibido.test(t)], [f, prohibido.source, false]);
      }
    }
  });
  prueba('ninguna migración trae una clave, un token ni una URL de proyecto: cero secretos en el repositorio', () => {
    for (const [f, t0] of Object.entries(TEXTOS)) {
      for (const sospechoso of [/eyJ[A-Za-z0-9_-]{20,}/, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/, /https:\/\/[a-z0-9]{15,}\.supabase\.co/, /service_role_key/i, /SELLO_AUTORIZACION\s*=/]) {
        igual([f, sospechoso.source, sospechoso.test(t0)], [f, sospechoso.source, false]);
      }
    }
  });
});

describir('idempotencia dinámica: volver a aplicar todo sobre una base ya migrada y con datos', () => {
  prueba('los once archivos se aplican DOS veces más sin error, no tocan un solo dato, no cambian lo que cada rol ve ni lo que puede ejecutar, y la auditoría sigue limpia', async () => {
    const db = await crearBaseDePruebas();
    try {
      db.u = await sembrarUsuarios(db);
      await sembrarProyectos(db);
      await sembrarAlmacen(db);
      const foto = async () => ({
        filas: (await sql(db, `select 'proyectos' as t, count(*)::int as n, max(updated_at)::text as u from public.proyectos union all select 'ventas_dinero', count(*)::int, max(updated_at)::text from public.ventas_dinero
                               union all select 'abonos', count(*)::int, max(updated_at)::text from public.abonos union all select 'materiales', count(*)::int, max(updated_at)::text from public.materiales
                               union all select 'contadores', count(*)::int, max(updated_at)::text from public.contadores union all select 'empresas', count(*)::int, max(updated_at)::text from public.empresas`)),
        catalogo: (await sql(db, `select (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'interno')) as funciones,
                                         (select count(*)::int from pg_policy) as politicas, (select count(*)::int from pg_trigger where not tgisinternal) as triggers,
                                         (select count(*)::int from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') as indices,
                                         (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime') as publicadas`))[0],
        // la ACL como CONJUNTO ordenado: revocar y volver a dar un privilegio cambia el orden de los elementos del arreglo, no lo que cada rol puede
        acls: (await sql(db, `select c.relname, array(select (case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end) || ':' || a.privilege_type from aclexplode(c.relacl) a order by 1) as acl
                                from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1`)),
        fab: (await sesionDe(db, db.u.fab).query(`select (select count(*)::int from public.ventas_dinero) as dinero, (select count(*)::int from public.proyectos) as proyectos`))[0],
      });
      const antes = await foto();
      for (let vuelta = 1; vuelta <= 2; vuelta++) for (const f of ARCHIVOS) await sql(db, TEXTOS[f]);
      igual(await foto(), antes);
      igual((await sql(db, `select interno.auditoria() as p`))[0].p, []);
    } finally { await db.close(); }
  }, { tiempo: 120_000 });
});

describir('carga dinámica: cada archivo carga con SOLO sus dependencias declaradas (A.md §9.1)', () => {
  /** Dependencias DECLARADAS en §9.1 («Depende de»), cerradas transitivamente. */
  const DIRECTAS = { 1: [], 2: [1], 3: [1, 2], 4: [3], 5: [1, 2, 3], 6: [3, 4, 5], 7: [4], 8: [2, 3], 9: [1] };
  const cierre = n => { const s = new Set([n]); const q = [n]; while (q.length) for (const d of DIRECTAS[q.pop()] ?? []) if (!s.has(d)) { s.add(d); q.push(d); } return [...s].sort((a, b) => a - b); };
  const archivo = n => join(CARPETA, ARCHIVOS.find(f => NUM(f) === n));
  const SONDAS = {
    1: `select interno.folio_texto('V', 1000) as v`, 2: `select public.version_contrato() ->> 'actual' as v`, 3: `select count(*)::text as v from public.proyectos`,
    4: `select count(*)::text as v from public.ventas_calculadas`, 5: `select count(*)::text as v from public.materiales`, 6: `select interno.etapa_nombre('listo') as v`,
    7: `select interno.calcular_reparto('al3d', 1) ->> 'cuantas' as v`, 8: `select interno.datos_cotizacion('{"aiFile": {"url": "x"}}'::jsonb)::text as v`, 9: `select public.ia_turno('x', 3)::text as v`,
  };
  for (let n = 1; n <= 9; n++) {
    prueba(`el ${String(n).padStart(4, '0')} carga sobre {${cierre(n).map(x => String(x).padStart(4, '0')).join(', ')}} y responde a una sonda`, async () => {
      const db = await crearBase({ migraciones: cierre(n).map(archivo) });
      try { cierto((await sql(db, SONDAS[n]))[0].v !== undefined, 'la sonda contestó'); }
      finally { await db.close(); }
    });
  }
  prueba('sin sus dependencias NO carga: el 0003 sin el 0002 y el 0004 sin el 0003 fallan con el nombre del archivo', async () => {
    await esperarError(crearBase({ migraciones: [archivo(1), archivo(3)] }), /0003_proyectos\.sql/);
    await esperarError(crearBase({ migraciones: [archivo(1), archivo(2), archivo(4)] }), /0004_formulas\.sql/);
    await esperarError(crearBase({ migraciones: [archivo(9)] }), /0009_cupos\.sql/);
  });
  prueba('el 0010 y el 0011 piden TODAS las anteriores (la aduana se detiene sin las vistas, las funciones o las tablas que audita)', async () => {
    await esperarError(crearBase({ migraciones: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(n => n !== 8).map(archivo) }), /0010_sync_espejo\.sql|0011_auditoria\.sql/);
  });
});

await resumen();
