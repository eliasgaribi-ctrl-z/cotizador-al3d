-- =====================================================================================================
-- 0010_sync_espejo.sql — lo que cierra la sincronización: el espejo a la hoja, el cuadre y la publicación de Realtime
-- =====================================================================================================
-- Qué deja:
--   · las vistas `espejo_ventas` y `espejo_abonos` (SOLO `service_role`: las lee la Edge Function `espejo`, que escribe la hoja de solo lectura);
--   · `cuadre_hoja(p_empresa)`: el reporte de cuadre de la fase 2 (solo `service_role`);
--   · el CIERRE de la publicación `supabase_realtime`: exactamente las 13 tablas de la lista cerrada, todas con identidad de réplica por DEFAULT.
--
-- Depende de: todas las anteriores. Los índices del cursor de sincronización `(empresa_id, updated_at, llave)` los creó cada tabla en su archivo
-- (`proyectos_sync`, `ventas_dinero_sync`, …): aquí no falta ninguno.
--
-- La hoja espejo contiene TODO el dinero fuera de RLS: su permiso de Drive no debe incluir a Fabricación (riesgo documentado, R-05). El espejo es un
-- reflejo: si falla, la base sigue bien y se reintenta.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. espejo_ventas y espejo_abonos
-- -----------------------------------------------------------------------------------------------------
-- Una fila por venta del libro y SOLO las columnas CAPTURADAS: A:G, I:J, L:N, Y:AI de «Ventas»; nunca H, K, O:X (son fórmulas de la hoja). `ai_sellos` lleva los sellos
-- con los NOMBRES de columna de la hoja. La Edge Function localiza la fila por FOLIO (columna A), nunca por número de fila. `security_invoker = true`
-- igualmente, aunque solo `service_role` las lea.
create or replace view public.espejo_ventas with (security_invoker = true) as
select p.empresa_id, p.updated_at, d.updated_at as dinero_updated_at,
       p.folio_hoja                                           as a_folio,
       p.nombre                                               as b_proyecto,
       p.estatus                                              as c_estatus,
       d.cuenta                                               as d_cuenta,
       array_to_string(p.tipo_trabajo, ', ')                  as e_tipo,
       case when p.iva then 'Sí' else 'No' end                as f_iva,
       d.subtotal                                             as g_subtotal,
       d.anticipo                                             as i_anticipo,
       d.liquidacion                                          as j_liquidacion,
       p.fecha_anticipo                                       as l_fecha_anticipo,
       coalesce(i.fecha, p.fecha_instalacion_hist)            as m_fecha_instalacion,
       d.fecha_liquidacion                                    as n_fecha_liquidacion,
       p.folio_global                                         as y_folio_cotizacion,
       case p.etapa when 'ganado' then 'Ganado' when 'en_diseno' then 'En diseño' when 'cortado' then 'Cortado' when 'armado' then 'Armado'
                    when 'listo' then 'Listo para instalar' when 'instalado' then 'Instalado' when 'garantia' then 'En garantía'
                    when 'cancelado' then 'No se dio' end     as z_etapa,
       i.hora                                                 as aa_hora,
       case when p.lat is not null then p.lat::text || ',' || p.lng::text else p.maps_url end as ab_ubicacion,
       p.dir_texto                                            as ac_direccion,
       d.pct_comision                                         as ad_pct,
       p.tel                                                  as ae_telefono,
       case p.entrega when 'instalacion' then 'Instalación' when 'paqueteria' then 'Paquetería' when 'recoleccion' then 'Recolección en taller' else '' end as af_entrega,
       p.notas                                                as ag_notas,
       case p.plazo_k when 1 then '1 semana' when 2 then '1.5 semanas' when 3 then '2 semanas' when 4 then '2.5 semanas' when 5 then '3 semanas o más' else '' end as ah_plazo,
       (select json_object_agg(m.k, m.v)::text from (values
            ('Etapa de obra',     (p.sellos ->> 'etapa')::bigint),    ('Fecha instalacion', (p.sellos ->> 'instalacion')::bigint),
            ('Ubicacion',         (p.sellos ->> 'ubicacion')::bigint),('Direccion',         (p.sellos ->> 'dir_texto')::bigint),
            ('Telefono',          (p.sellos ->> 'tel')::bigint),      ('Entrega',           (p.sellos ->> 'entrega')::bigint),
            ('Notas',             (p.sellos ->> 'notas')::bigint),    ('Plazo taller',      (p.sellos ->> 'plazo_k')::bigint)) as m(k, v)
         where m.v is not null)                               as ai_sellos
  from public.proyectos p
  join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id
  left join lateral (select x.fecha, x.hora from public.instalaciones x
                      where x.proyecto_id = p.id and x.estado <> 'cancelada' and x.deleted_at is null order by x.fecha limit 1) i on true
 where p.deleted_at is null and d.deleted_at is null and p.folio_hoja is not null;

-- «Abonos comisión»: A, C, D, E, F (B es la fórmula del nombre en la hoja).
create or replace view public.espejo_abonos with (security_invoker = true) as
select a.empresa_id, a.id, a.updated_at, a.folio_hoja as a_folio, a.importe as c_importe, a.fecha as d_fecha, a.nota as e_nota, a.pago_id as f_pago
  from public.abonos a;

-- Ningún rol de cliente las ve (llevan todo el dinero): solo `service_role`.
revoke all on public.espejo_ventas, public.espejo_abonos from public, anon, authenticated, service_role;
grant select on public.espejo_ventas, public.espejo_abonos to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. cuadre_hoja: el reporte de cuadre
-- -----------------------------------------------------------------------------------------------------
-- El script de la fase 2 lo compara con la hoja y con los teléfonos; POR FOLIO compara cada columna H, K, R, S, T, X contra `getValues()` con tolerancia 0.004.
--   invariantes.proyectos_sin_dinero   todo proyecto con `folio_hoja` debe tener su fila en `ventas_dinero` (la otra mitad la impone el trigger del libro)
--   proyectos      total (sin borrados), historicas, vivas (ni históricas ni lápidas), lapidas, por_fuente
--   ventas         filas, suma_subtotal, suma_neto, suma_cobrado, n_saldo (con saldo > 0.004), suma_saldo_positivo, comisiones_generadas, abonado, comisiones_pendientes
--   abonos         n, suma, huerfanos (de un folio que ya no existe)
--   cotizaciones / solicitudes / miembros / autorizaciones   conteos por estado (y v1/v2)
--   almacen        movimientos, materiales, requerimientos, costos
--   contadores     V, P, alm
--   x_revisar      cuántas filas trae cada bandera de la columna X
create or replace function public.cuadre_hoja(p_empresa text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'invariantes', pg_catalog.jsonb_build_object('proyectos_sin_dinero',
        (select count(*)::int from public.proyectos p where p.empresa_id = p_empresa and p.deleted_at is null and p.folio_hoja is not null
            and not exists (select 1 from public.ventas_dinero d where d.empresa_id = p.empresa_id and d.proyecto_id = p.id))),
    'proyectos', (select pg_catalog.jsonb_build_object(
        'total', count(*)::int, 'historicas', (count(*) filter (where p.historica))::int,
        'vivas', (count(*) filter (where not p.historica and p.folio_hoja is not null))::int, 'lapidas', (count(*) filter (where p.folio_hoja is null))::int,
        'por_fuente', coalesce((select pg_catalog.jsonb_object_agg(f.fuente, f.n) from (select y.fuente, count(*)::int as n from public.proyectos y
                                 where y.empresa_id = p_empresa and y.deleted_at is null group by y.fuente) f), '{}'::jsonb))
      from public.proyectos p where p.empresa_id = p_empresa and p.deleted_at is null),
    'ventas', (select pg_catalog.jsonb_build_object(
        'filas', count(*)::int, 'suma_subtotal', coalesce(sum(v.g_subtotal), 0), 'suma_neto', coalesce(sum(v.h_neto), 0),
        'suma_cobrado', coalesce(sum(v.i_anticipo + v.j_liquidacion), 0), 'n_saldo', (count(*) filter (where v.k_saldo > 0.004))::int,
        'suma_saldo_positivo', coalesce(sum(v.k_saldo) filter (where v.k_saldo > 0), 0), 'comisiones_generadas', coalesce(sum(v.r_comision), 0),
        'abonado', coalesce(sum(v.s_abonado), 0), 'comisiones_pendientes', coalesce(sum(v.t_restante) filter (where v.t_restante > 0), 0))
      from public.ventas_calculadas v where v.empresa_id = p_empresa),
    'abonos', (select pg_catalog.jsonb_build_object('n', count(*)::int, 'suma', coalesce(sum(a.importe), 0),
        'huerfanos', (count(*) filter (where not exists (select 1 from public.proyectos p where p.empresa_id = a.empresa_id and p.folio_hoja = a.folio_hoja)))::int)
      from public.abonos a where a.empresa_id = p_empresa),
    'cotizaciones', (select coalesce(pg_catalog.jsonb_object_agg(x.estado, x.n), '{}'::jsonb) from (select c.estado, count(*)::int as n from public.cotizaciones c where c.empresa_id = p_empresa group by c.estado) x),
    'autorizaciones', (select pg_catalog.jsonb_build_object('total', count(*)::int, 'vigentes', (count(*) filter (where a.estado = 'vigente'))::int,
        'superadas', (count(*) filter (where a.estado = 'superada'))::int, 'revocadas', (count(*) filter (where a.estado = 'revocada'))::int,
        'v1', (count(*) filter (where a.formato = 'v1'))::int, 'v2', (count(*) filter (where a.formato = 'v2'))::int) from public.autorizaciones a where a.empresa_id = p_empresa),
    'solicitudes', (select coalesce(pg_catalog.jsonb_object_agg(x.estado, x.n), '{}'::jsonb) from (select s.estado, count(*)::int as n from public.solicitudes s where s.empresa_id = p_empresa group by s.estado) x),
    'miembros', (select coalesce(pg_catalog.jsonb_object_agg(x.estado, x.n), '{}'::jsonb) from (select m.estado, count(*)::int as n from public.miembros m where m.empresa_id = p_empresa group by m.estado) x),
    'almacen', pg_catalog.jsonb_build_object(
        'movimientos', (select count(*)::int from public.almacen_movimientos m where m.empresa_id = p_empresa),
        'materiales', (select count(*)::int from public.materiales m where m.empresa_id = p_empresa),
        'requerimientos', (select count(*)::int from public.requerimientos q where q.empresa_id = p_empresa),
        'costos', (select count(*)::int from public.almacen_costos k where k.empresa_id = p_empresa)),
    'contadores', pg_catalog.jsonb_build_object(
        'V', coalesce((select ct.n from public.contadores ct where ct.empresa_id = p_empresa and ct.clave = 'V' and ct.ventana = ''), 0),
        'P', coalesce((select ct.n from public.contadores ct where ct.empresa_id = p_empresa and ct.clave = 'P' and ct.ventana = ''), 0),
        'alm', coalesce((select ct.n from public.contadores ct where ct.empresa_id = p_empresa and ct.clave = 'alm' and ct.ventana = ''), 0)),
    'x_revisar', (select coalesce(pg_catalog.jsonb_object_agg(x.x_revisar, x.n), '{}'::jsonb)
                    from (select v.x_revisar, count(*)::int as n from public.ventas_calculadas v where v.empresa_id = p_empresa and v.x_revisar <> '' group by v.x_revisar) x))
  into r;
  return r;
end $$;
revoke all on function public.cuadre_hoja(text) from public, anon, authenticated, service_role;
grant execute on function public.cuadre_hoja(text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Realtime: el cierre de la publicación (lista CERRADA)
-- -----------------------------------------------------------------------------------------------------
-- Cada tabla ya se agregó a la publicación en su propio archivo; esto es el cierre, idempotente: deja EXACTAMENTE estas 13 y todas con `REPLICA IDENTITY DEFAULT`.
-- No entran `empresas`, `autorizaciones`, `cuaderno_notas` ni `contadores`. Por qué esto no filtra dinero a Fabricación:
--   (1) Postgres Changes autoriza cada evento INSERT/UPDATE contra cada suscriptor con su JWT: Fabricación no pasa la política de SELECT de `ventas_dinero`,
--       `abonos`, `almacen_costos`, `cotizaciones` ni `solicitudes`, y no recibe el evento;
--   (2) los DELETE no pasan por RLS, pero no existen (trigger `sin_borrar` en toda tabla de negocio) y, si existieran, con `REPLICA IDENTITY DEFAULT` solo
--       llevarían la llave primaria, sin importes;
--   (3) ninguna tabla tiene `REPLICA IDENTITY FULL` (con FULL el `old` completo viajaría en el DELETE: la auditoría de 0011 lo comprueba);
--   (4) la lista es cerrada: una tabla nueva no entra sola.
-- El evento es solo un AVISO: el cliente responde con una lectura incremental por cursor. Una tabla que alguien más haya agregado a la publicación (fuera de
-- este esquema) NO se toca aquí.
do $$ declare t text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['proyectos','ventas_dinero','abonos','instalaciones','cotizaciones','solicitudes','materiales',
                           'requerimientos','almacen_movimientos','almacen_costos','constantes','bitacora','miembros'] loop
    execute format('alter table public.%I replica identity default', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
