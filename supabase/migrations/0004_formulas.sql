-- =====================================================================================================
-- 0004_formulas.sql — la hoja, al centavo (R4)
-- =====================================================================================================
-- Qué deja:
--   · la vista `ventas_calculadas`: las doce columnas fórmula de «Ventas» (H, K, O, P, Q, R, S, T, U, V, W, X) con redondeo
--     decimal EXACTO (`numeric`) y la regla IVA-por-cuenta;
--   · la vista `comisiones_pendientes` (lo que el reparto FIFO recorre);
--   · `interno.normalizar_iva` (la regla «el IVA lo manda la cuenta», que hoy impone el servidor en cada /empujar);
--   · la RPC `comisiones_cobradas` («Comisiones por periodo»).
--
-- Depende de: 0003. Las funciones de aritmética (`neto`, `comision`, `hoy_mx`) las dejó 0001.
--
-- R es el 10 % FIJO del SUBTOTAL (G), no del neto: el IVA no entra y `pct_comision` (col. AD) NO se lee. Una sola aritmética
-- (`interno.neto`, `interno.comision`) la comparten la vista y las RPC de pagos, así la hoja y la base no pueden divergir.
-- Que coincida con `ROUND` de Sheets en los empates reales (centavos en 5, doble precisión) está sin confirmar y lo decide el
-- cuadre contra la hoja viva (FM-35) ANTES de leer de la base: si Sheets diera otro centavo, se documenta y se decide con Elías.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. ventas_calculadas
-- -----------------------------------------------------------------------------------------------------
-- `security_invoker = true`: la vista corre con los privilegios de QUIEN CONSULTA, así que RLS de las tablas base aplica. Una vista
-- normal corre como su dueño y SE SALTA RLS. El JOIN con `ventas_dinero` es INTERNO: sin dinero visible (Fabricación) no llega ni una
-- fila, ni siquiera con el nombre del proyecto. Por eso aquí no hay «vistas por área»: la separación es por tablas y por RLS.
create or replace view public.ventas_calculadas with (security_invoker = true) as
with ab as (                                                   -- S y U: SUMIF/COUNTIF de «Abonos comisión» por folio
  select a.empresa_id, a.folio_hoja, sum(a.importe) as abonado, count(*)::int as pagos
    from public.abonos a group by a.empresa_id, a.folio_hoja
), b as (
  select p.empresa_id, p.id as proyecto_id, p.folio_hoja, p.nombre, p.estatus, d.cuenta, p.tipo_trabajo, p.iva,
         d.subtotal, d.anticipo, d.liquidacion, p.fecha_anticipo,
         coalesce(i.fecha, p.fecha_instalacion_hist)      as fecha_instalacion,   -- M: la instalación viva; en las históricas, la fecha heredada
         d.fecha_liquidacion, d.pct_comision, p.historica, p.fuente, p.etapa, p.folio_global,
         interno.neto(d.subtotal, p.iva)                  as h_neto,              -- H
         interno.comision(d.subtotal)                     as r_comision,          -- R
         coalesce(ab.abonado, 0)                          as s_abonado,           -- S
         coalesce(ab.pagos, 0)                            as u_pagos              -- U
    from public.proyectos p
    join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id     -- JOIN INTERNO: sin ventas_dinero visible (Fabricación), 0 filas
    left join lateral (select x.fecha from public.instalaciones x
                        where x.proyecto_id = p.id and x.estado <> 'cancelada' and x.deleted_at is null
                        order by x.fecha limit 1) i on true                          -- a lo sumo UNA viva (índice único parcial)
    left join ab on ab.empresa_id = p.empresa_id and ab.folio_hoja = p.folio_hoja
   where p.deleted_at is null and d.deleted_at is null and p.folio_hoja is not null  -- la lápida no es venta
), k as (
  select b.*,
         round(b.h_neto - b.anticipo - b.liquidacion, 2)  as k_saldo,              -- K
         round(b.r_comision - b.s_abonado, 2)             as t_restante            -- T
    from b
), pa as (
  select k.*,
         case when k.fecha_anticipo is null or coalesce(k.estatus, '') = 'FABRICACION' then null
              when k.k_saldo > 0.004 then interno.hoy_mx() - coalesce(k.fecha_instalacion, k.fecha_anticipo)   -- P
         end as p_dias
    from k
)
select pa.empresa_id, pa.proyecto_id,
       pa.folio_hoja                        as a_folio,
       pa.nombre                            as b_proyecto,
       pa.estatus                           as c_estatus,
       pa.cuenta                            as d_cuenta,
       pa.tipo_trabajo                      as e_tipo,
       pa.iva                               as f_iva,
       pa.subtotal                          as g_subtotal,
       pa.h_neto,                                                                                              -- H
       pa.anticipo                          as i_anticipo,
       pa.liquidacion                       as j_liquidacion,
       pa.k_saldo,                                                                                             -- K
       pa.fecha_anticipo                    as l_fecha_anticipo,
       pa.fecha_instalacion                 as m_fecha_instalacion,
       pa.fecha_liquidacion                 as n_fecha_liquidacion,
       case when pa.fecha_liquidacion is not null and pa.fecha_anticipo is not null
            then pa.fecha_liquidacion - pa.fecha_anticipo end                               as o_dias_cobro,   -- O
       pa.p_dias,                                                                                              -- P
       case when pa.p_dias is null then null
            when pa.p_dias <= 30 then '0-30 días'  when pa.p_dias <= 60 then '31-60 días'
            when pa.p_dias <= 90 then '61-90 días' else 'Más de 90 días' end                as q_antiguedad,   -- Q
       pa.r_comision,                                                                                          -- R
       pa.s_abonado, pa.t_restante, pa.u_pagos,                                                                -- S, T, U
       extract(year from pa.fecha_anticipo)::int                                            as v_anio,         -- V (de L)
       pg_catalog.to_char(pa.fecha_anticipo, 'YYYY-MM')                                     as w_mes,          -- W (de L)
       case                                                                                                    -- X: la PRIMERA que cumpla, en este orden
         when count(*) over (partition by pa.empresa_id, pa.folio_hoja) > 1                 then 'Folio repetido'          -- inalcanzable con UNIQUE; se conserva por paridad
         when pa.cuenta is not null and pa.iva is distinct from (pa.cuenta <> 'Elias BBVA') then 'IVA no corresponde a la cuenta'
         when pa.k_saldo < -0.004                                                           then 'Cobrado de más'
         when pa.t_restante < -0.004                                                        then 'Comisión pagada de más'
         when pa.estatus = 'LIQUIDADO' and pa.k_saldo > 0.004                               then 'Liquidado con saldo'
         when pa.estatus = 'LIQUIDADO' and pa.fecha_liquidacion is null                     then 'Falta fecha de liquidación'
         else '' end                                                                         as x_revisar,
       pa.historica, pa.fuente, pa.etapa, pa.folio_global, pa.pct_comision
  from pa;

-- `pendientesFIFO` del .gs: el folio es cronológico, así que el reparto recorre `numero_folio` de menor a mayor.
create or replace view public.comisiones_pendientes with (security_invoker = true) as
select v.empresa_id, v.a_folio as folio, v.b_proyecto as nombre, v.t_restante as pend,
       (substring(v.a_folio from 3))::int as numero_folio
  from public.ventas_calculadas v where v.t_restante > 0.004;

-- Solo Dirección y Pagos las leen (la RLS de las tablas base ya deja a Fabricación sin filas); `anon` nada. `service_role` las lee
-- porque las Edge Functions (espejo, cuadre) las consultan; el privilegio de la vista y el de las tablas base se piden por separado.
revoke all on public.ventas_calculadas, public.comisiones_pendientes from public, anon, authenticated, service_role;
grant select on public.ventas_calculadas, public.comisiones_pendientes to authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. normalizar_iva: «el IVA lo manda la cuenta»
-- -----------------------------------------------------------------------------------------------------
-- Hoy la impone el servidor al final de CADA /empujar (`normalizarIvaActivos`) y al editar la columna D a mano. Sin ella, H, K y R
-- no cuadran en ventas abiertas. Para toda venta con cuenta y estatus distinto de LIQUIDADO: iva := (cuenta <> 'Elias BBVA')
-- (`Elias BBVA` no factura; cualquier otra sí). Una venta LIQUIDADA o sin cuenta NO se toca: el histórico no se reescribe.
-- La llaman `ganar_proyecto`, `alta_venta`, `corregir_venta` y `registrar_cobro`. NO la llama la importación: las filas importadas
-- conservan su IVA tal cual y la columna X de la vista marca las que no cuadran. Un IVA mandado por el cliente se descarta si la
-- cuenta dice otra cosa.
create or replace function interno.normalizar_iva(p_proyecto text) returns void language plpgsql set search_path = '' as $$
declare v_cuenta text; v_estatus text; v_iva boolean;
begin
  select d.cuenta, p.estatus, p.iva into v_cuenta, v_estatus, v_iva
    from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id
   where p.id = p_proyecto;
  if v_cuenta is not null and v_estatus is distinct from 'LIQUIDADO' and v_iva is distinct from (v_cuenta <> 'Elias BBVA') then
    update public.proyectos set iva = (v_cuenta <> 'Elias BBVA') where id = p_proyecto;
  end if;
end $$;
revoke all on function interno.normalizar_iva(text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. comisiones_cobradas («Comisiones por periodo»)
-- -----------------------------------------------------------------------------------------------------
-- Dirección y Pagos. `desde` y `hasta` son INCLUSIVOS. Un abono sin fecha no aparece en ningún periodo (ni «Todo»). Replica las cinco
-- celdas de la hoja (A10..E10): el cobrado NO filtra por folio (suma también los abonos de folios que ya no existen), los abonos y los
-- depósitos sí exigen folio, y un renglón sin «Pago» cuenta como UN valor distinto, como `UNIQUE(FILTER(…))`.
create or replace function public.comisiones_cobradas(p_desde date, p_hasta date, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; r record;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    return interno.err('DATO_INVALIDO', 'El periodo necesita una fecha de inicio y una de fin, y el inicio no puede ser posterior al fin.'); end if;
  select coalesce(sum(a.importe), 0)                                                          as cobrado,      -- A10: SIN filtro de folio
         count(*) filter (where a.folio_hoja <> '')                                           as abonos,       -- B10
         count(distinct a.folio_hoja)                                                         as proyectos,    -- C10
         count(distinct coalesce(a.pago_id, '')) filter (where a.folio_hoja <> '')            as depositos     -- D10
    into r
    from public.abonos a where a.empresa_id = (pre.c).empresa_id and a.fecha between p_desde and p_hasta;
  return jsonb_build_object('ok', true, 'cobrado', r.cobrado, 'abonos', r.abonos, 'proyectos', r.proyectos, 'depositos', r.depositos,
                            'promedio', case when r.abonos > 0 then r.cobrado / r.abonos else 0 end);                       -- E10
end $$;
revoke all on function public.comisiones_cobradas(date, date, text) from public, anon, authenticated, service_role;
grant execute on function public.comisiones_cobradas(date, date, text) to authenticated;
