// UN TELÉFONO DE VERDAD contra la base de PGlite (auditoría 2026-10-26, T1-7).
//
// Es un módulo de AYUDA, no una prueba (por eso `.js`: correr.sh solo lanza los `*.mjs`).
//
// La auditoría del 26 encontró que se escapaban fallas porque las pruebas mandaban a la base operaciones ARMADAS A MANO, con la forma que
// el que escribía la prueba creía que tenían. Aquí el teléfono es el de la app: js/datos (proyectos, material, stock, la agenda, «Qué
// atender») con una IndexedDB de mentiras en memoria (pruebas/comun/base-de-mentiras.mjs), su bandeja de verdad (js/datos/sync.js) y el
// relevo de verdad (js/datos/supa-relevo.js) con el traductor de verdad. Lo único de mentiras es el cliente de supabase-js, que aquí habla
// con PGlite en vez de con PostgREST —con la misma forma: `rpc()` perezoso que se puede `.setHeader()` antes de mandarse, como el de
// supabase-js, y la consulta por folios que hace el relevo— con la RLS y las cabeceras de la cuenta. Las operaciones que llegan a la base
// son las que el teléfono encoló al tocar el botón, no las que alguien imaginó.
//
//   const T = await montarTelefono({ rol: 'fabricacion' });      // los globales del navegador y los módulos de js/datos
//   const rel = await relevoDe(db, 'fab', T);                     // el relevo con la sesión de esa cuenta, ya enchufado a la bandeja
//   await T.Proy.avanzarEtapa('proy-1', 'cortado'); await T.S.bombear();
//
// Los globales son del proceso: UN teléfono por archivo de prueba. Los módulos de la app se cargan con `import()` dentro de `montarTelefono`
// —nunca estáticos—, para que pruebas/comun/material-encendido.mjs, importado antes, alcance a cambiar el interruptor de Material.
import { idbConIndices } from '../../../pruebas/comun/base-de-mentiras.mjs';
import { CAB, llamar, sesionDe } from './semilla.js';

/**
 * Pone los globales que js/datos espera del navegador y carga los módulos.
 * @param {{rol?:string, disp?:string, nombre?:string, base?:boolean}} [o] `base`: el interruptor de Supabase encendido y el último modo
 *   oído en 'base' (lo que lee `laBaseManda()`): la empresa con la base mandando, como hoy.
 */
export async function montarTelefono(o = {}) {
  const guardado = {
    al3d_pf_rol: o.rol || 'fabricacion', al3d_pf_disp: o.disp || 'K7QM', al3d_pf_nombre: o.nombre || 'Omar',
    /* Con la base mandando el puente sigue configurado (Drive y los links de Maps siguen en el Apps Script) y es lo que deja
       bombear a la bandeja (`Prefs.hayPuente`). Nadie le habla: el relevo de la base no usa la red de la hoja. */
    al3d_pf_puente: JSON.stringify({ url: 'https://puente.test/exec', token: 'd'.repeat(40) }),
  };
  if (o.base !== false) {
    guardado.al3d_pf_supa = JSON.stringify({ encendido: true });
    guardado.al3d_pf_supa_modo = JSON.stringify({ modo: 'base', empresa: 'al3d' });
  }
  globalThis.window = globalThis;
  globalThis.indexedDB = idbConIndices();
  globalThis.IDBKeyRange = { only: v => ({ only: v }), bound: (a, b) => ({ bound: [a, b] }) };
  globalThis.localStorage = { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); },
                              removeItem: k => { delete guardado[k]; } };
  /* La red de la hoja no existe aquí: si algo la pidiera, que truene a la vista. */
  globalThis.fetch = async url => { throw new TypeError('Failed to fetch (prueba sin red: ' + url + ')'); };

  const DB = await import('../../../js/datos/db.js');
  const S = await import('../../../js/datos/sync.js');
  const Proy = await import('../../../js/datos/proyectos.js');
  const Agenda = await import('../../../js/datos/agenda.js');
  const Reglas = await import('../../../js/datos/reglas.js');
  const Relevo = await import('../../../js/datos/supa-relevo.js');
  if (!(await DB.abrir())) throw new Error('la IndexedDB de mentiras no abrió');
  return { DB, S, Proy, Agenda, Reglas, Relevo, guardado };
}

/**
 * Lo que supabase-js le daría al relevo, sobre una sesión de PGlite. `rpc()` es PEREZOSO como el de supabase-js: no sale hasta que se
 * espera, y `.setHeader(k, v)` antes de eso le agrega una cabecera a ESA llamada (llega a `request.headers`, como con PostgREST).
 * `from().select().or().limit()` es la única consulta que hace el relevo al escribir (buscar un proyecto por sus folios), con la RLS
 * de la cuenta. `llamadas` y `cabeceras` quedan para que la prueba vea qué salió y con qué.
 */
export function clienteDe(sesion) {
  const c = {
    llamadas: [],
    cabeceras: [],
    rpc(nombre, args) {
      let extra = null, promesa = null;
      const mandar = () => {
        c.llamadas.push(nombre);
        c.cabeceras.push(extra);
        const s = extra ? sesion.con({ cabeceras: { ...CAB, ...extra } }) : sesion;
        return llamar(s, nombre, args).then(
          data => ({ data, error: null }),
          e => ({ data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }));
      };
      const b = {
        setHeader(k, v) { extra = { ...(extra || {}), [String(k).toLowerCase()]: String(v) }; return b; },
        then(si, no) { promesa = promesa || mandar(); return promesa.then(si, no); },
      };
      return b;
    },
    from(tabla) {
      let cols = '*', ors = [];
      const q = {
        select(x) { cols = x; return q; },
        or(f) { ors = f.split(',').map(x => { const [k] = x.split('.'); return [k, x.slice(k.length + 4)]; }); return q; },
        async limit(n) {
          const filas = await sesion.query(`select ${cols} from public.${tabla} where ${ors.map((o, i) => o[0] + ' = $' + (i + 1)).join(' or ')} limit ${n}`,
                                           ors.map(o => o[1]));
          return { data: filas.map(r => ({ ...r })), error: null };
        },
      };
      return q;
    },
  };
  return c;
}

/**
 * El relevo de este teléfono con la sesión de `quien` (su área y sus permisos salen de `mi_acceso`), enchufado a la bandeja de verdad
 * (`sync.registrar`). Sin bajar: lo que se prueba es lo que sube. `extra` va a `crearRelevo` tal cual.
 */
export async function relevoDe(db, quien, T, extra = {}) {
  const sesion = sesionDe(db, db.u[quien], { confirmar: true });
  const c = clienteDe(sesion);
  const acceso = async () => {
    const r = await llamar(sesion, 'mi_acceso', {});
    const e = (r.empresas || []).find(x => x.empresa_id === 'al3d' && x.estado === 'activo');
    return { estado: r.estado, area: e ? e.area : '', permisos: r.permisos, correo: r.usuario && r.usuario.correo, modo: r.modo };
  };
  const r = T.Relevo.crearRelevo({ cliente: async () => c, haySesion: async () => true, acceso, lector: {}, fuente: {}, ...extra });
  T.S.registrar(r);
  return { r, c };
}

/** Un material del catálogo del teléfono (el libro solo mueve lo que está en el catálogo: js/datos/stock.js, `apendice`). */
export const materialDelCatalogo = (o = {}) => ({ id: 'acr-3mm', empresa_id: 'al3d', nombre: 'Acrílico blanco 3 mm', familia: 'acrilico',
  unidad_consumo: 'm2', unidad_compra: 'lamina', medida: '1.22 × 2.44 m', factor: 2.9768, factor_origen: 'Hoja 4×8', largo_cm: 244, ancho_cm: 122,
  espesor: '3 mm', merma_pct: 0.25, fraccionable: true, min_compra: 1, min_stock: 0, proveedor: 'Plásticos GDL', tel_proveedor: '3312345678',
  activo: true, sync: 0, creado_en: 1792860000000, actualizado_en: 1792860000000, ...o });

/** Una línea de la lista de compra como la deja js/datos/material.js en el teléfono. */
export const requerimiento = (o = {}) => ({ id: 'proy-1:acr-3mm', empresa_id: 'al3d', proyecto_id: 'proy-1', material_id: 'acr-3mm',
  cantidad_consumo: 4.1, unidad_consumo: 'm2', cantidad_compra: 2, unidad_compra: 'lamina', partidas: [1], formula: '0.75×40²×8 = 0.5714 m²',
  confianza: 'estimada', requiere: '', constantes_version: 'c-2026-10.prueba', cantidad_ajustada: null, motivo_ajuste: '', ajustado_por: '',
  ajustado_en: 0, estado: 'calculado', creado_en: 1792860000000, actualizado_en: 1792860000000, sync: 0, ...o });

/** Lo que el teléfono tiene en la bandeja ahora, por almacén y tipo (para ver qué se encoló, sin mandarlo). */
export async function bandeja(T) {
  return (await T.S.pendientes()).map(op => op.almacen + ':' + op.tipo + ':' + op.registro_id);
}
