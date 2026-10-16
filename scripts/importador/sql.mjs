/* ============================================================================
   DEL PLAN AL SQL — lo que una persona pega en el Editor SQL de Supabase (o corre con psql).

   El importador no se conecta a ninguna base: escribe dos archivos.
     importar.sql  la carga. IDEMPOTENTE: cada tabla se escribe con «insert … on conflict» y una
                   fila solo se reescribe si algo cambió de verdad (`is distinct from`), así que la
                   segunda corrida con las mismas entradas no mueve ni un `updated_at` (IM-02).
                   Va en lotes de ≤ 200 filas, cada uno en su transacción (DISENO.md §5.13). Lo que
                   hizo queda en la tabla temporal _imp_cambios y se enseña al final.
     cuadre.sql    la comparación por folio de H, K, R, S, T, X, O, V y W de la hoja contra
                   `ventas_calculadas` (tolerancia 0.004 en importes) y el `cuadre_hoja` completo.
                   Cero renglones de diferencias = cuadra.

   La función `importar-diario` (la copia de cada madrugada, desde el 2026-10-16) usa este mismo SQL
   con `{ externa: true }`: sin los begin/commit por lote, dentro de UNA transacción que abre ella, y
   después `sqlDeDiferencias` (la primera consulta de cuadre.sql).

   Escribe directo a las tablas (como `service_role` o el dueño), NO por las funciones del
   cliente: no debe disparar el IVA por cuenta, los folios ni las transiciones automáticas.
   Los textos van como literales SQL estándar ('…' con la comilla doblada): con
   standard_conforming_strings (el valor de siempre en Postgres y Supabase) la diagonal invertida
   es un carácter más y no hay nada más que escapar.
   ============================================================================ */

export const LOTE = 200;

/* ----- Literales ----- */
const TIPO_SQL = { t: 'text', n: 'numeric', f: 'double precision', i: 'integer', b: 'boolean', d: 'date', j: 'jsonb', a: 'text[]', ts: 'timestamptz', bi: 'bigint' };
const cadena = s => "'" + String(s).replace(/'/g, "''") + "'";

/* Lo que Postgres no guarda en text ni en jsonb: el NUL y la mitad suelta de un emoji (un sustituto UTF-16 sin pareja, que
   JSON.stringify escribe como \udXXX y jsonb rechaza). Se quita el NUL y el sustituto suelto se vuelve «�», a cualquier
   profundidad: una sola celda así tumbaría su lote entero. */
const RE_NO_GUARDABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const guardable = s => String(s).replace(RE_NO_GUARDABLE, m => (m === '\u0000' ? '' : '�'));
function profundo(v) {
  if (typeof v === 'string') return guardable(v);
  if (Array.isArray(v)) return v.map(profundo);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [guardable(k), profundo(x)]));
  return v;
}

export function lit(v, tipo) {
  if (v === null || v === undefined) return 'NULL::' + TIPO_SQL[tipo];
  switch (tipo) {
    case 't': return cadena(guardable(v)) + '::text';
    case 'n': case 'f': case 'i': case 'bi': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error('número no finito: ' + v);
      return cadena(String(n)) + '::' + TIPO_SQL[tipo];
    }
    case 'b': return v ? 'true' : 'false';
    case 'd': if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error('fecha no válida: ' + v); return cadena(v) + '::date';
    case 'j': return cadena(JSON.stringify(profundo(v))) + '::jsonb';
    case 'a': return 'ARRAY[' + v.map(x => cadena(guardable(x))).join(',') + ']::text[]';
    case 'ts': { const n = Number(v); return n > 0 ? `to_timestamp(${Math.trunc(n)} / 1000.0)` : 'NULL::timestamptz'; }
    default: throw new Error('tipo desconocido: ' + tipo);
  }
}

/* ----- Las tablas: columnas del lote y cómo entran ----- */
const COLS = {
  proyectos: [['id', 't'], ['empresa_id', 't'], ['folio_hoja', 't'], ['folio_global', 't'], ['folio_local', 't'], ['dispositivo', 't'], ['fuente', 't'],
    ['historica', 'b'], ['nombre', 't'], ['contacto', 't'], ['negocio', 't'], ['tel', 't'], ['etapa', 't'], ['tipo_trabajo', 'a'], ['fecha_anticipo', 'd'],
    ['compromiso_texto', 't'], ['dir_texto', 't'], ['entrecalles', 't'], ['maps_url', 't'], ['lat', 'f'], ['lng', 'f'], ['geo_fuente', 't'],
    ['ubicacion_pendiente', 'b'], ['entrega', 't'], ['plazo_k', 'i'], ['notas', 't'], ['estatus', 't'], ['iva', 'b'], ['fecha_instalacion_hist', 'd'],
    ['sellos', 'j'], ['origen', 'j'], ['procedencia', 'j'], ['creado_ms', 'ts']],
  ventas_dinero: [['proyecto_id', 't'], ['empresa_id', 't'], ['subtotal', 'n'], ['anticipo', 'n'], ['liquidacion', 'n'], ['cuenta', 't'],
    ['fecha_liquidacion', 'd'], ['pct_comision', 'n'], ['precio_auth', 'n'], ['origen', 'j'], ['venta_local', 'j'], ['procedencia', 'j']],
  abonos: [['empresa_id', 't'], ['folio_hoja', 't'], ['importe', 'n'], ['fecha', 'd'], ['nota', 't'], ['pago_id', 't'], ['tipo', 't'], ['op_id', 't'], ['procedencia', 'j']],
  miembros: [['empresa_id', 't'], ['correo', 't'], ['area', 't'], ['nota', 't']],
  instalaciones: [['id', 't'], ['empresa_id', 't'], ['proyecto_id', 't'], ['fecha', 'd'], ['hora', 't'], ['ventana', 't'], ['duracion_min', 'i'], ['estado', 't'],
    ['movida', 'i'], ['notas', 't'], ['procedencia', 'j'], ['creado_ms', 'ts']],
  materiales: [['empresa_id', 't'], ['id', 't'], ['nombre', 't'], ['familia', 't'], ['unidad_compra', 't'], ['unidad_consumo', 't'], ['medida', 't'], ['factor', 'n'],
    ['factor_origen', 't'], ['largo_cm', 'n'], ['ancho_cm', 'n'], ['espesor', 't'], ['merma_pct', 'n'], ['fraccionable', 'b'], ['min_compra', 'n'], ['min_stock', 'n'],
    ['proveedor', 't'], ['tel_proveedor', 't'], ['activo', 'b'], ['sellos', 'j'], ['procedencia', 'j'], ['creado_ms', 'ts']],
  almacen_costos: [['empresa_id', 't'], ['material_id', 't'], ['movimiento_id', 't'], ['importe', 'n'], ['sello', 'bi']],
  constantes: [['empresa_id', 't'], ['clave', 't'], ['valor', 'n'], ['unidad', 't'], ['nota', 't'], ['version', 't'], ['actualizado_por', 't']],
  requerimientos: [['empresa_id', 't'], ['id', 't'], ['proyecto_id', 't'], ['material_id', 't'], ['cantidad_consumo', 'n'], ['unidad_consumo', 't'], ['cantidad_compra', 'n'],
    ['unidad_compra', 't'], ['partidas', 'j'], ['formula', 't'], ['confianza', 't'], ['requiere', 't'], ['constantes_version', 't'], ['cantidad_ajustada', 'n'],
    ['motivo_ajuste', 't'], ['ajustado_por', 't'], ['ajustado_ms', 'bi'], ['estado', 't'], ['sellos', 'j'], ['procedencia', 'j'], ['creado_ms', 'ts']],
  almacen_movimientos: [['orden', 'i'], ['empresa_id', 't'], ['id', 't'], ['material_id', 't'], ['tipo', 't'], ['cantidad', 'n'], ['unidad_compra', 't'], ['origen', 't'],
    ['nota', 't'], ['usuario', 't'], ['rol', 't'], ['dispositivo', 't'], ['proyecto_id', 't'], ['requerimiento_id', 't'], ['firma', 't'], ['ts', 'bi'],
    ['procedencia', 'j'], ['creado_ms', 'ts']],
  autorizaciones: [['orden', 'i'], ['empresa_id', 't'], ['folio_global', 't'], ['huella', 't'], ['sub_calc_txt', 't'], ['precio_auth_txt', 't'], ['items_auth', 't'],
    ['total_txt', 't'], ['proyecto', 't'], ['autorizo', 't'], ['ts_iso', 't'], ['renglones', 't'], ['cliente', 't'], ['ajuste_pct', 'n'], ['solicito', 't'],
    ['codigo', 't'], ['firma', 't'], ['estado', 't'], ['nota', 't'], ['clave_id', 't'], ['codificacion', 't'], ['origen', 't'], ['fila_hoja', 'i']],
  cotizaciones: [['empresa_id', 't'], ['folio_global', 't'], ['folio', 't'], ['disp', 't'], ['estado', 't'], ['datos', 'j'], ['hitos', 'j'], ['procedencia', 'j']],
};

/* Cómo entra el lote a su tabla. `l` es el lote (temporal). Cada sentencia devuelve (llave, nuevo). */
const ESCRIBIR = {
  proyectos: `
    insert into _imp_cambios (tabla, llave, accion)
      select 'proyectos', l.id, 'conflicto: su folio ya es de ' || p.id
        from _lote l join public.proyectos p on p.empresa_id = l.empresa_id and p.id <> l.id
                                              and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global);
    -- lo que la base no deja cambiar de un proyecto (histórica/viva, de dónde viene): se reporta y la fila no se toca
    insert into _imp_cambios (tabla, llave, accion)
      select 'proyectos', l.id, 'conflicto: en la base es ' || case when p.historica then 'histórica' else 'viva' end || ' de ' || p.fuente
                                || ' y ahora sería ' || case when l.historica then 'histórica' else 'viva' end || ' de ' || l.fuente
        from _lote l join public.proyectos p on p.empresa_id = l.empresa_id and p.id = l.id
       where (p.historica, p.fuente) is distinct from (l.historica, l.fuente);
    with w as (
      insert into public.proyectos as t (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel,
             etapa, tipo_trabajo, fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k,
             notas, estatus, iva, fecha_instalacion_hist, sellos, origen_obra, procedencia, created_at)
      select l.id, l.empresa_id, l.folio_hoja, l.folio_global, l.folio_local, l.dispositivo, l.fuente, l.historica, l.nombre, l.contacto, l.negocio, l.tel,
             l.etapa, l.tipo_trabajo, l.fecha_anticipo, l.compromiso_texto, l.dir_texto, l.entrecalles, l.maps_url, l.lat, l.lng, l.geo_fuente, l.ubicacion_pendiente,
             l.entrega, l.plazo_k, l.notas, l.estatus, l.iva, l.fecha_instalacion_hist, l.sellos,
             case when l.origen is null then null else (select o.obra from interno.partir_origen(l.origen) o) end,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where not exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id <> l.id
                                                          and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global))
         and not exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.id
                                                          and (p.historica, p.fuente) is distinct from (l.historica, l.fuente))
      on conflict (id) do update set
             folio_hoja = coalesce(t.folio_hoja, excluded.folio_hoja), folio_global = coalesce(t.folio_global, excluded.folio_global),
             nombre = excluded.nombre, contacto = excluded.contacto, negocio = excluded.negocio, tel = excluded.tel, etapa = excluded.etapa,
             tipo_trabajo = excluded.tipo_trabajo, fecha_anticipo = excluded.fecha_anticipo, compromiso_texto = excluded.compromiso_texto,
             dir_texto = excluded.dir_texto, entrecalles = excluded.entrecalles, maps_url = excluded.maps_url, lat = excluded.lat, lng = excluded.lng,
             geo_fuente = excluded.geo_fuente, ubicacion_pendiente = excluded.ubicacion_pendiente, entrega = excluded.entrega, plazo_k = excluded.plazo_k,
             notas = excluded.notas, estatus = excluded.estatus, iva = excluded.iva, fecha_instalacion_hist = excluded.fecha_instalacion_hist,
             sellos = excluded.sellos, origen_obra = excluded.origen_obra, procedencia = excluded.procedencia
       where (t.folio_hoja, t.folio_global, t.nombre, t.contacto, t.negocio, t.tel, t.etapa, t.tipo_trabajo, t.fecha_anticipo, t.compromiso_texto, t.dir_texto,
              t.entrecalles, t.maps_url, t.lat, t.lng, t.geo_fuente, t.ubicacion_pendiente, t.entrega, t.plazo_k, t.notas, t.estatus, t.iva,
              t.fecha_instalacion_hist, t.sellos, t.origen_obra, t.procedencia)
             is distinct from
             (coalesce(t.folio_hoja, excluded.folio_hoja), coalesce(t.folio_global, excluded.folio_global), excluded.nombre, excluded.contacto, excluded.negocio,
              excluded.tel, excluded.etapa, excluded.tipo_trabajo, excluded.fecha_anticipo, excluded.compromiso_texto, excluded.dir_texto, excluded.entrecalles,
              excluded.maps_url, excluded.lat, excluded.lng, excluded.geo_fuente, excluded.ubicacion_pendiente, excluded.entrega, excluded.plazo_k, excluded.notas,
              excluded.estatus, excluded.iva, excluded.fecha_instalacion_hist, excluded.sellos, excluded.origen_obra, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'proyectos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  ventas_dinero: `
    with w as (
      insert into public.ventas_dinero as t (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth,
             origen_dinero, procedencia)
      select l.proyecto_id, l.empresa_id, l.subtotal, l.anticipo, l.liquidacion, l.cuenta, l.fecha_liquidacion, l.pct_comision, l.precio_auth,
             case when l.origen is null and l.venta_local is null then null
                  else case when l.origen is null then '{}'::jsonb else (select o.dinero from interno.partir_origen(l.origen) o) end
                       || case when l.venta_local is null then '{}'::jsonb else jsonb_build_object('venta', l.venta_local) end end,
             l.procedencia
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id and p.folio_hoja is not null)
      on conflict (proyecto_id) do update set
             subtotal = excluded.subtotal, anticipo = excluded.anticipo, liquidacion = excluded.liquidacion, cuenta = excluded.cuenta,
             fecha_liquidacion = excluded.fecha_liquidacion, pct_comision = excluded.pct_comision, precio_auth = excluded.precio_auth,
             origen_dinero = excluded.origen_dinero, procedencia = excluded.procedencia
       where (t.subtotal, t.anticipo, t.liquidacion, t.cuenta, t.fecha_liquidacion, t.pct_comision, t.precio_auth, t.origen_dinero, t.procedencia)
             is distinct from (excluded.subtotal, excluded.anticipo, excluded.liquidacion, excluded.cuenta, excluded.fecha_liquidacion,
                               excluded.pct_comision, excluded.precio_auth, excluded.origen_dinero, excluded.procedencia)
      returning t.proyecto_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'ventas_dinero', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  abonos: `
    with w as (
      insert into public.abonos as t (empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo, op_id, procedencia)
      select l.empresa_id, l.folio_hoja, l.importe, l.fecha, l.nota, l.pago_id, l.tipo, l.op_id, l.procedencia from _lote l
      on conflict (empresa_id, op_id, folio_hoja) where op_id is not null do nothing
      returning t.op_id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'abonos', llave, 'alta' from w;`,

  miembros: `
    with w as (
      insert into public.miembros as t (empresa_id, correo, area, nota)
      select l.empresa_id, l.correo, l.area, l.nota from _lote l
      on conflict (empresa_id, correo) do nothing
      returning t.correo as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'miembros', llave, 'alta' from w;`,

  instalaciones: `
    -- una cita viva por proyecto: la que la base ya tenga y el plan no traiga (p. ej. la «hoja-V-…» de una corrida anterior sin teléfonos)
    -- se cancela antes de escribir la viva del plan, sin tocar el calendario
    with w as (
      update public.instalaciones t set estado = 'cancelada', procedencia = t.procedencia || jsonb_build_object('fusionada_en', l.id)
        from _lote l
       where l.estado <> 'cancelada' and t.empresa_id = l.empresa_id and t.proyecto_id = l.proyecto_id and t.id <> l.id
         and t.estado <> 'cancelada' and t.deleted_at is null
      returning t.id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'instalaciones', llave, 'cambio: cancelada (otra cita es la viva)' from w;
    with w as (
      insert into public.instalaciones as t (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas, procedencia, created_at)
      select l.id, l.empresa_id, l.proyecto_id, l.fecha, l.hora, l.ventana, l.duracion_min, l.estado, l.movida, 'inst-' || l.id || '@al3d.mx', l.notas,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
       order by (l.estado <> 'cancelada'), l.id
      on conflict (id) do update set
             fecha = excluded.fecha, hora = excluded.hora, ventana = excluded.ventana, duracion_min = excluded.duracion_min, estado = excluded.estado,
             movida = greatest(t.movida, excluded.movida), notas = excluded.notas, procedencia = excluded.procedencia
       where (t.fecha, t.hora, t.ventana, t.duracion_min, t.estado, t.movida, t.notas, t.procedencia)
             is distinct from (excluded.fecha, excluded.hora, excluded.ventana, excluded.duracion_min, excluded.estado,
                               greatest(t.movida, excluded.movida), excluded.notas, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'instalaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  materiales: `
    with w as (
      insert into public.materiales as t (empresa_id, id, nombre, familia, unidad_compra, unidad_consumo, medida, factor, factor_origen, largo_cm, ancho_cm,
             espesor, merma_pct, fraccionable, min_compra, min_stock, proveedor, tel_proveedor, activo, sellos, procedencia, created_at)
      select l.empresa_id, l.id, l.nombre, l.familia, l.unidad_compra, l.unidad_consumo, l.medida, l.factor, l.factor_origen, l.largo_cm, l.ancho_cm,
             l.espesor, l.merma_pct, l.fraccionable, l.min_compra, l.min_stock, l.proveedor, l.tel_proveedor, l.activo, l.sellos, l.procedencia,
             coalesce(l.creado_ms, now())
        from _lote l
      on conflict (empresa_id, id) do update set
             nombre = excluded.nombre, familia = excluded.familia, unidad_compra = excluded.unidad_compra, unidad_consumo = excluded.unidad_consumo,
             medida = excluded.medida, factor = excluded.factor, factor_origen = excluded.factor_origen, largo_cm = excluded.largo_cm,
             ancho_cm = excluded.ancho_cm, espesor = excluded.espesor, merma_pct = excluded.merma_pct, fraccionable = excluded.fraccionable,
             min_compra = excluded.min_compra, min_stock = excluded.min_stock, proveedor = excluded.proveedor, tel_proveedor = excluded.tel_proveedor,
             activo = excluded.activo, sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.nombre, t.familia, t.unidad_compra, t.unidad_consumo, t.medida, t.factor, t.factor_origen, t.largo_cm, t.ancho_cm, t.espesor, t.merma_pct,
              t.fraccionable, t.min_compra, t.min_stock, t.proveedor, t.tel_proveedor, t.activo, t.sellos, t.procedencia)
             is distinct from (excluded.nombre, excluded.familia, excluded.unidad_compra, excluded.unidad_consumo, excluded.medida, excluded.factor,
                               excluded.factor_origen, excluded.largo_cm, excluded.ancho_cm, excluded.espesor, excluded.merma_pct, excluded.fraccionable,
                               excluded.min_compra, excluded.min_stock, excluded.proveedor, excluded.tel_proveedor, excluded.activo, excluded.sellos,
                               excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'materiales', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  almacen_costos: `
    with w as (
      insert into public.almacen_costos as t (empresa_id, material_id, importe, sello)
      select l.empresa_id, l.material_id, l.importe, l.sello from _lote l
       where l.material_id is not null and exists (select 1 from public.materiales m where m.empresa_id = l.empresa_id and m.id = l.material_id)
      on conflict (empresa_id, material_id) where material_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.material_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;
    with w as (
      insert into public.almacen_costos as t (empresa_id, movimiento_id, importe, sello)
      select l.empresa_id, l.movimiento_id, l.importe, l.sello from _lote l
       where l.movimiento_id is not null and exists (select 1 from public.almacen_movimientos m where m.empresa_id = l.empresa_id and m.id = l.movimiento_id)
      on conflict (empresa_id, movimiento_id) where movimiento_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.movimiento_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  constantes: `
    with w as (
      insert into public.constantes as t (empresa_id, clave, valor, unidad, nota, version, actualizado_por)
      select l.empresa_id, l.clave, l.valor, l.unidad, l.nota, l.version, l.actualizado_por from _lote l
      on conflict (empresa_id, clave) do update set valor = excluded.valor, unidad = excluded.unidad, nota = excluded.nota,
             version = excluded.version, actualizado_por = excluded.actualizado_por
       where (t.valor, t.unidad, t.nota, t.version, t.actualizado_por)
             is distinct from (excluded.valor, excluded.unidad, excluded.nota, excluded.version, excluded.actualizado_por)
      returning t.clave as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'constantes', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  requerimientos: `
    with w as (
      insert into public.requerimientos as t (empresa_id, id, proyecto_id, material_id, cantidad_consumo, unidad_consumo, cantidad_compra, unidad_compra,
             partidas, formula, confianza, requiere, constantes_version, cantidad_ajustada, motivo_ajuste, ajustado_por, ajustado_ms, estado, sellos,
             procedencia, created_at)
      select l.empresa_id, l.id, l.proyecto_id, l.material_id, l.cantidad_consumo, l.unidad_consumo, l.cantidad_compra, l.unidad_compra, l.partidas,
             l.formula, l.confianza, l.requiere, l.constantes_version, l.cantidad_ajustada, l.motivo_ajuste, l.ajustado_por, l.ajustado_ms, l.estado,
             l.sellos, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
      on conflict (empresa_id, id) do update set
             cantidad_consumo = excluded.cantidad_consumo, unidad_consumo = excluded.unidad_consumo, cantidad_compra = excluded.cantidad_compra,
             unidad_compra = excluded.unidad_compra, partidas = excluded.partidas, formula = excluded.formula, confianza = excluded.confianza,
             requiere = excluded.requiere, constantes_version = excluded.constantes_version, cantidad_ajustada = excluded.cantidad_ajustada,
             motivo_ajuste = excluded.motivo_ajuste, ajustado_por = excluded.ajustado_por, ajustado_ms = excluded.ajustado_ms, estado = excluded.estado,
             sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.cantidad_consumo, t.unidad_consumo, t.cantidad_compra, t.unidad_compra, t.partidas, t.formula, t.confianza, t.requiere,
              t.constantes_version, t.cantidad_ajustada, t.motivo_ajuste, t.ajustado_por, t.ajustado_ms, t.estado, t.sellos, t.procedencia)
             is distinct from (excluded.cantidad_consumo, excluded.unidad_consumo, excluded.cantidad_compra, excluded.unidad_compra, excluded.partidas,
                               excluded.formula, excluded.confianza, excluded.requiere, excluded.constantes_version, excluded.cantidad_ajustada,
                               excluded.motivo_ajuste, excluded.ajustado_por, excluded.ajustado_ms, excluded.estado, excluded.sellos, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'requerimientos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,

  almacen_movimientos: `
    with w as (
      insert into public.almacen_movimientos as t (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo,
             proyecto_id, requerimiento_id, firma, ts, procedencia, created_at)
      select l.empresa_id, l.id, l.material_id, l.tipo, l.cantidad, l.unidad_compra, l.origen, l.nota, l.usuario, l.rol, l.dispositivo,
             l.proyecto_id, l.requerimiento_id, l.firma, l.ts, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l order by l.orden
      on conflict (empresa_id, id) do nothing
      returning t.id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_movimientos', llave, 'alta' from w;`,

  autorizaciones: `
    with w as (
      update public.autorizaciones t set estado = l.estado
        from _lote l
       where t.empresa_id = l.empresa_id and t.folio_global = l.folio_global and t.firma = l.firma
         and t.estado = 'vigente' and l.estado <> 'vigente'
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'cambio' from w;
    with w as (
      insert into public.autorizaciones as t (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo,
             ts_iso, renglones, cliente, ajuste_pct, solicito, codigo, firma, estado, nota, clave_id, codificacion, origen, fila_hoja)
      select l.empresa_id, l.folio_global, l.huella, l.sub_calc_txt, l.precio_auth_txt, l.items_auth, l.total_txt, l.proyecto, l.autorizo,
             l.ts_iso, l.renglones, l.cliente, l.ajuste_pct, l.solicito, l.codigo, l.firma, l.estado, l.nota, l.clave_id, l.codificacion, l.origen, l.fila_hoja
        from _lote l
       where not exists (select 1 from public.autorizaciones a where a.empresa_id = l.empresa_id and a.folio_global = l.folio_global and a.firma = l.firma)
       order by (l.estado = 'vigente'), l.orden
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'alta' from w;`,

  cotizaciones: `
    with w as (
      insert into public.cotizaciones as t (empresa_id, folio_global, folio, disp, estado, datos, hitos, procedencia)
      select l.empresa_id, l.folio_global, l.folio, l.disp, l.estado, interno.datos_cotizacion(l.datos), l.hitos, l.procedencia from _lote l
      on conflict (empresa_id, folio_global) do update set datos = excluded.datos, hitos = excluded.hitos, procedencia = excluded.procedencia
       where (t.datos, t.hitos, t.procedencia) is distinct from (excluded.datos, excluded.hitos, excluded.procedencia)
      returning t.folio_global as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
};

/* El orden importa: los hijos después de sus padres (FK), los costos después de lo que cuestan. */
const ORDEN = ['proyectos', 'ventas_dinero', 'abonos', 'miembros', 'instalaciones', 'materiales', 'constantes', 'requerimientos',
  'almacen_movimientos', 'almacen_costos', 'autorizaciones', 'cotizaciones'];

function lotes(tabla, filas, conTransaccion) {
  const cols = COLS[tabla];
  const [ini, fin] = conTransaccion ? ['begin;\n', '\ncommit;'] : ['', ''];
  const out = [];
  for (let i = 0; i < filas.length; i += LOTE) {
    const trozo = filas.slice(i, i + LOTE);
    const valores = trozo.map((f, k) => '  (' + cols.map(([c, tipo]) => lit(c === 'orden' ? i + k : f[c], tipo)).join(', ') + ')').join(',\n');
    out.push(`-- ${tabla}: filas ${i + 1} a ${i + trozo.length}\n${ini}drop table if exists _lote;\ncreate temp table _lote as\nselect * from (values\n${valores}\n) as v(${cols.map(c => c[0]).join(', ')});${ESCRIBIR[tabla]}${fin}\n`);
  }
  return out;
}

/**
 * El archivo de carga completo.
 * @param {{hecho?: string, ensayo?: boolean, externa?: boolean}} [o]  ensayo: todo en UNA transacción que al final se deshace
 *   (rollback), para probar el archivo en un proyecto sin dejar nada escrito; las consultas del final enseñan lo que habría hecho.
 *   externa: la transacción la abre y la cierra QUIEN LLAMA (la función `importar-diario`): sin ningún begin/commit adentro, sin
 *   el error del ensayo y sin la consulta final; lo que hizo queda en la tabla temporal _imp_cambios para que lo lea.
 */
export function sqlDeImportacion(plan, { hecho = '', ensayo = false, externa = false } = {}) {
  const e = cadena(plan.empresa);
  const propias = !ensayo && !externa;           // ¿lleva sus propias transacciones (un begin/commit por lote)?
  const partes = [
    `-- Importación de la hoja y los teléfonos a Supabase (scripts/importar-hoja.mjs). ${hecho}`,
    '-- IDEMPOTENTE: correrlo dos veces con las mismas entradas no cambia nada la segunda vez.',
    '-- Es para correrse MIENTRAS LA HOJA ES LA FUENTE (hasta la fase 4): lo que alguien haya cambiado en la base desde la plataforma, lo pisa con la hoja.',
    '-- CONTIENE DATOS DE CLIENTES: no lo subas al repositorio ni lo mandes por chat.',
    ...(ensayo ? ['-- ENSAYO: todo va en UNA transacción que al final se DESHACE (rollback). No queda nada escrito.', 'begin;'] : []),
    '',
    'create temp table if not exists _imp_cambios (tabla text not null, llave text, accion text not null);',
    'truncate _imp_cambios;',
    '',
  ];
  for (const t of ORDEN) {
    let filas = plan.tablas[t] || [];
    // las canceladas, todas antes que cualquier viva: el índice de «una viva por proyecto» no distingue lotes
    if (t === 'instalaciones') filas = [...filas.filter(f => f.estado === 'cancelada'), ...filas.filter(f => f.estado !== 'cancelada')];
    partes.push(...lotes(t, filas, propias));
  }
  // un abono importado antes que ya no está en la hoja (alguien corrigió su importe o su fecha): no se borra —es un libro—, se avisa
  const ops = (plan.tablas.abonos || []).map(a => a.op_id);
  partes.push(`-- abonos de una corrida anterior que ya no están en la hoja
insert into _imp_cambios (tabla, llave, accion)
  select 'abonos', a.folio_hoja || ' ' || a.importe || ' (fila ' || coalesce(a.procedencia->>'fila_hoja', '?') || ')',
         'conflicto: ya no está en la hoja; si se corrigió, va una corrección a mano'
    from public.abonos a
   where a.empresa_id = ${e} and a.op_id like 'hoja:abono:%' and a.op_id <> all (${lit(ops, 'a')});
`);
  // el vínculo cotización → autorización (DISENO.md §3.4): la vigente o, si no hay, la de mayor id; la revocación con fecha de hoy
  partes.push(`-- cotizaciones ↔ autorizaciones
${propias ? 'begin;' : ''}
with ult as (
  select distinct on (a.folio_global) a.folio_global, a.id from public.autorizaciones a where a.empresa_id = ${e}
   order by a.folio_global, (a.estado = 'vigente') desc, a.id desc),
w as (
  update public.cotizaciones c set autorizacion_id = u.id from ult u
   where c.empresa_id = ${e} and c.folio_global = u.folio_global and c.autorizacion_id is distinct from u.id
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: autorización' from w;
with ult as (
  select distinct on (a.folio_global) a.folio_global, a.estado from public.autorizaciones a where a.empresa_id = ${e}
   order by a.folio_global, a.id desc),
w as (
  update public.cotizaciones c set revocada_en = now() from ult u
   where c.empresa_id = ${e} and c.folio_global = u.folio_global and u.estado = 'revocada' and c.revocada_en is null
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: revocada' from w;
${propias ? 'commit;' : ''}
`);
  partes.push('-- contadores: nunca bajan (contador_sembrar toma el mayor)');
  for (const c of plan.contadores) partes.push(`select public.contador_sembrar(${e}, ${cadena(c.clave)}, ${Math.trunc(Number(c.n) || 0)});`);
  if (externa) return partes.join('\n') + '\n';
  partes.push('', '-- lo que hizo esta corrida (vacío = nada cambió)',
    "select tabla, accion, count(*)::int as filas from _imp_cambios group by tabla, accion order by tabla, accion;");
  // En ensayo el final es un error a propósito: el Editor SQL enseña su mensaje (lo que habría hecho) y el error deshace TODO,
  // aunque quien lo corre envuelva el archivo en su propia transacción. Un `rollback` al final no enseñaría nada.
  if (ensayo) {
    partes.push(`do $$ begin
  raise exception 'ENSAYO TERMINADO SIN ERRORES (no se escribió nada): %',
    (select coalesce(string_agg(tabla || ' ' || accion || ' ' || n, ', ' order by tabla, accion), 'sin cambios')
       from (select tabla, accion, count(*) as n from _imp_cambios group by tabla, accion) x);
end $$;`);
  }
  return partes.join('\n') + '\n';
}

/* ----- El cuadre ----- */
function valorHoja(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.$fecha === 'string') return v.$fecha;
  return v;
}

/** cuadre.sql: un renglón por diferencia (cero renglones = cuadra) y, aparte, `cuadre_hoja`. */
export function sqlDeCuadre(plan) {
  return sqlDeDiferencias(plan) + `
select public.cuadre_hoja(${cadena(plan.empresa)}) as cuadre;
`;
}

/** La primera consulta de cuadre.sql, sola: un renglón (folio, col, en_hoja, en_base) por diferencia; cero renglones = cuadra.
 *  La corre también la función `importar-diario`, que de cada renglón guarda solo el folio y la columna (nunca los importes). */
export function sqlDeDiferencias(plan) {
  const e = cadena(plan.empresa);
  const n = v => { const x = valorHoja(v); return x === null || !Number.isFinite(Number(x)) ? 'NULL::numeric' : cadena(String(Number(x))) + '::numeric'; };
  const t = v => { const x = valorHoja(v); return x === null ? 'NULL::text' : cadena(String(x)) + '::text'; };
  const w = v => { const x = valorHoja(v); return x === null ? 'NULL::text' : cadena(String(x).slice(0, 7)) + '::text'; };
  const filas = plan.esperado.map(x => `  (${cadena(x.folio)}, ${n(x.h)}, ${n(x.k)}, ${n(x.r)}, ${n(x.s)}, ${n(x.t)}, ${t(x.x)}, ${n(x.o)}, ${n(x.v)}, ${w(x.w)})`);
  const valores = filas.length ? filas.join(',\n') : "  (NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::text, NULL::numeric, NULL::numeric, NULL::text)";
  return `-- Cuadre de la importación: la hoja (getValues de las fórmulas) contra ventas_calculadas, por folio.
-- CERO renglones en la primera consulta = cuadra. Tolerancia: 0.004 en importes (DISENO.md §10.15, IM-01).
-- CONTIENE DATOS DE CLIENTES: no lo subas al repositorio.
with hoja (folio, h, k, r, s, t, x, o, v, w) as (values
${valores}
), hoja_ok as (select * from hoja where folio is not null),
base as (select * from public.ventas_calculadas where empresa_id = ${e}),
dif as (
  select h.folio, c.col, c.en_hoja, c.en_base
    from hoja_ok h left join base b on b.a_folio = h.folio
    cross join lateral (values
      ('fila', 'sí', case when b.a_folio is null then 'no está' else 'sí' end, b.a_folio is null),
      ('H', h.h::text, b.h_neto::text, abs(coalesce(h.h, 0) - coalesce(b.h_neto, 0)) > 0.004),
      ('K', h.k::text, b.k_saldo::text, abs(coalesce(h.k, 0) - coalesce(b.k_saldo, 0)) > 0.004),
      ('R', h.r::text, b.r_comision::text, abs(coalesce(h.r, 0) - coalesce(b.r_comision, 0)) > 0.004),
      ('S', h.s::text, b.s_abonado::text, abs(coalesce(h.s, 0) - coalesce(b.s_abonado, 0)) > 0.004),
      ('T', h.t::text, b.t_restante::text, abs(coalesce(h.t, 0) - coalesce(b.t_restante, 0)) > 0.004),
      ('X', coalesce(h.x, ''), coalesce(b.x_revisar, ''), coalesce(h.x, '') <> coalesce(b.x_revisar, '')),
      ('O', h.o::text, b.o_dias_cobro::text, h.o is distinct from b.o_dias_cobro::numeric),
      ('V', h.v::text, b.v_anio::text, h.v is distinct from b.v_anio::numeric),
      ('W', h.w, b.w_mes, h.w is distinct from b.w_mes)
    ) as c(col, en_hoja, en_base, distinto)
   where c.distinto and (b.a_folio is not null or c.col = 'fila')
  union all
  select b.a_folio, 'fila', 'no está', 'sí' from base b where not exists (select 1 from hoja_ok h where h.folio = b.a_folio)
)
select * from dif order by folio, col;
`;
}
