-- =====================================================================================================
-- 0007_rpc_pagos.sql — lo que Pagos hace hoy en la hoja, ahora como funciones de la base (R6, Q-01)
-- =====================================================================================================
-- Qué deja (todas `SECURITY DEFINER`, `search_path = ''`, EXECUTE solo para `authenticated`):
--   · `registrar_cobro` (liquidación acumulativa), `registrar_abono_comision`, `repartir_abono_fifo` y su `vista_previa_reparto`;
--   · `corregir_venta` (nombre, subtotal, anticipo, liquidación, cuenta, estatus, fecha, % y —solo Dirección— IVA) y `corregir_abono`;
--   · `interno.etapa_por_cobro` (la transición automática 2 de etapa).
--
-- Depende de: 0004 (vistas de fórmulas, `normalizar_iva`) y, por lo que lee y escribe, 0003. Las PANTALLAS de Pagos NO entran en esta rama
-- (DEC Q-01): la base ya las soporta; la hoja no pasa a solo lectura hasta que existan y haya siete días de cuadre.
--
-- Reglas comunes (todas se comprueban ANTES de escribir; los mensajes nunca llevan importes):
--   · Fabricación recibe `ROL_SIN_PERMISO` IGUAL para un proyecto que existe y para uno que no (el área se decide antes de leer nada: no se
--     revela ni la existencia ni un dato);
--   · `Liquidación` es ACUMULATIVA: un reintento sin idempotencia la sumaría dos veces. Por eso `registrar_cobro`, `registrar_abono_comision`,
--     `repartir_abono_fifo` y `corregir_abono` llevan `op_id` y devuelven lo mismo ante un reintento;
--   · el dinero no se sella (la última RPC gana) y todo queda en `bitacora` de nivel `dinero` con `antes/despues`;
--   · `numeric` exacto en todo; el redondeo es el de la vista (`interno.neto`, `interno.comision`).
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La transición automática 2: cobro ⇒ instalado (solo en filas importadas)
-- -----------------------------------------------------------------------------------------------------
-- Cuando una venta pasa a COBRANDO o a LIQUIDADO se da por instalada, pero SOLO si es una fila importada (`fuente` = 'hoja' o 'manual', no
-- histórica) cuya etapa está entre «ganado» y «listo». SIN emitir salidas (el cliente lo hacía solo de su lado, sin encolar) y sellando `etapa`
-- con la hora del SERVIDOR (Q-A12): así una operación vieja de la bandeja no puede revertirla. Una cotización de la plataforma, una histórica y
-- un proyecto en garantía o ya instalado no cambian. Devuelve true si movió la etapa.
create or replace function interno.etapa_por_cobro(p_id text, p_ctx interno.contexto_t) returns boolean language plpgsql set search_path = '' as $$
declare p public.proyectos; v_ord int;
begin
  select * into p from public.proyectos x where x.id = p_id;
  if not found then return false; end if;
  v_ord := interno.orden_etapa(p.etapa);
  if p.fuente in ('hoja', 'manual') and not p.historica and v_ord is not null and v_ord between 0 and 4 then
    update public.proyectos set etapa = 'instalado', sellos = sellos || pg_catalog.jsonb_build_object('etapa', interno.ahora_ms()) where id = p.id;
    perform interno.anotar(p_ctx, 'general', 'etapa', 'proyecto', p.id, p.nombre || ' pasó a ' || interno.etapa_nombre('instalado'),
                           'Estaba en ' || interno.etapa_nombre(p.etapa) || ' y la venta pasó a cobro', pg_catalog.jsonb_build_object('etapa', p.etapa),
                           pg_catalog.jsonb_build_object('etapa', 'instalado'));
    return true;
  end if;
  return false;
end $$;
revoke all on function interno.etapa_por_cobro(text, interno.contexto_t) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. registrar_cobro («Registrar un cobro»)
-- -----------------------------------------------------------------------------------------------------
-- Suma `p_monto` a la Liquidación (numeric exacto; la hoja sumaba doubles), pone la fecha de liquidación (la dada o HOY de México: la hoja solo la
-- escribía si el formulario la mandaba, y siempre la manda) y, con `p_liquidar` (por omisión sí), marca la venta LIQUIDADO y aplica la transición
-- automática 2. Con `p_liquidar = false` el estatus no cambia y el IVA se normaliza por la cuenta. Un cobro es siempre un importe MAYOR A CERO (el
-- formulario no validaba el signo: Q-A07); para corregir hacia abajo está `corregir_venta`. Idempotente por `p_op_id`: se guarda en la bitácora
-- DESPUÉS de tener el candado de la fila, así dos reintentos concurrentes no pasan juntos.
create or replace function public.registrar_cobro(p_proyecto text, p_monto numeric, p_fecha date default null, p_liquidar boolean default true,
                                                  p_op_id text default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; d public.ventas_dinero; r jsonb; v_saldo numeric; v_resp jsonb; v_fecha date; v_antes jsonb; v_est text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto <= 0 then
    return interno.err('DATO_INVALIDO', 'Un cobro es un importe mayor a cero; para corregir usa la corrección de la venta.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id for update;
  if p_op_id is not null then
    select b.resultado into r from public.bitacora b where b.empresa_id = p.empresa_id and b.op_id = 'cobro:' || p_op_id;
    if found and r is not null then return r; end if;       -- idempotente: Liquidación es ACUMULATIVA
  end if;
  v_fecha := coalesce(p_fecha, interno.hoy_mx());
  v_antes := pg_catalog.jsonb_build_object('liquidacion', d.liquidacion, 'fecha_liquidacion', d.fecha_liquidacion, 'estatus', p.estatus);
  update public.ventas_dinero set liquidacion = liquidacion + p_monto, fecha_liquidacion = v_fecha where proyecto_id = p.id;
  if coalesce(p_liquidar, true) then
    update public.proyectos set estatus = 'LIQUIDADO' where id = p.id;
    perform interno.etapa_por_cobro(p.id, pre.c);
  else
    perform interno.normalizar_iva(p.id);
  end if;
  select round(interno.neto(y.subtotal, x.iva) - y.anticipo - y.liquidacion, 2), x.estatus, y.liquidacion, y.fecha_liquidacion
    into v_saldo, v_est, d.liquidacion, d.fecha_liquidacion
    from public.proyectos x join public.ventas_dinero y on y.proyecto_id = x.id where x.id = p.id;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'liquidacion', d.liquidacion, 'saldo', v_saldo, 'estatus', v_est, 'fecha_liquidacion', d.fecha_liquidacion,
                                          'en_ceros', v_saldo <= 0.004);
  perform interno.anotar(pre.c, 'dinero', 'cobro', 'venta', p.id, 'Cobro de ' || interno.pesos(p_monto) || ' registrado en ' || p.folio_hoja, '', v_antes,
                         pg_catalog.jsonb_build_object('liquidacion', d.liquidacion, 'fecha_liquidacion', d.fecha_liquidacion, 'estatus', v_est),
                         case when p_op_id is not null then 'cobro:' || p_op_id end, v_resp);
  return v_resp;
end $$;
revoke all on function public.registrar_cobro(text, numeric, date, boolean, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_cobro(text, numeric, date, boolean, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 3. registrar_abono_comision, repartir_abono_fifo y vista_previa_reparto
-- -----------------------------------------------------------------------------------------------------

-- Un abono de comisión a UNA venta (`registrarAbonoDesdePuente`). Va en positivo y es de menos de $10,000,000 (los negativos son `corregir_abono`).
-- La fecha es un `date` (el puente guardaba la hora con la fecha y «Comisiones por periodo», que mira `D <= TODAY()`, lo excluía hasta el día
-- siguiente); sin fecha, HOY de México; sin nota, «Registrado desde la plataforma». El abono puede ser MAYOR que la comisión: se acepta, T queda
-- negativo y la vista lo marca «Comisión pagada de más» (no se impide). Se serializa con el reparto y con otros abonos (candado `fifo`).
create or replace function public.registrar_abono_comision(p_proyecto text, p_monto numeric, p_fecha date default null, p_nota text default '',
                                                           p_op_id text default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; d public.ventas_dinero; v_s numeric; v_t numeric; v_repetida boolean := false; v_importe numeric;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto <= 0 or p_monto >= 10000000 then
    return interno.err('DATO_INVALIDO', 'Un abono de comisión va en positivo y es de menos de diez millones de pesos.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.empresa_id || ':fifo', 0));
  if p_op_id is not null then
    select a.importe into v_importe from public.abonos a where a.empresa_id = p.empresa_id and a.op_id = p_op_id and a.folio_hoja = p.folio_hoja limit 1;
    v_repetida := found;
  end if;
  if not v_repetida then
    insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, tipo, op_id, registrado_por)
    values (p.empresa_id, p.folio_hoja, p_monto, coalesce(p_fecha, interno.hoy_mx()), coalesce(nullif(pg_catalog.btrim(p_nota), ''), 'Registrado desde la plataforma'),
            'abono', p_op_id, (pre.c).usuario_id);
    v_importe := p_monto;
    perform interno.anotar(pre.c, 'dinero', 'abono', 'abono', p.id, 'Abono de comisión de ' || interno.pesos(p_monto) || ' en ' || p.folio_hoja, '', null,
                           pg_catalog.jsonb_build_object('importe', p_monto));
  end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id;
  select coalesce(sum(a.importe), 0) into v_s from public.abonos a where a.empresa_id = p.empresa_id and a.folio_hoja = p.folio_hoja;
  v_t := round(interno.comision(d.subtotal) - v_s, 2);
  return pg_catalog.jsonb_build_object('ok', true, 'importe', v_importe, 'abonado', v_s, 'restante', v_t) || case when v_repetida then '{"repetida": true}'::jsonb else '{}'::jsonb end;
end $$;
revoke all on function public.registrar_abono_comision(text, numeric, date, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_abono_comision(text, numeric, date, text, text, text) to authenticated;

-- El reparto FIFO calculado, sin escribir (`calcularReparto`): recorre las comisiones pendientes de la MÁS ANTIGUA a la más nueva (el folio es
-- cronológico, así que ordena por su NÚMERO, no por el texto) mientras quede dinero (> 0.004). Cada renglón: lo que pide, lo que se le abona y lo
-- que le queda. Lo que sobra NO se aplica. Lo usan `vista_previa_reparto` y `repartir_abono_fifo`, para que la vista previa y el reparto no puedan
-- diferir. Corre con los privilegios del dueño de la RPC (lee las vistas sin que RLS le estorbe: la RPC ya comprobó el área).
create or replace function interno.calcular_reparto(p_empresa text, p_monto numeric) returns jsonb language plpgsql stable set search_path = '' as $$
declare f record; v_resta numeric := round(p_monto, 2); v_toca numeric; v_filas jsonb := '[]'::jsonb; v_total numeric := 0; v_cuantas int := 0;
begin
  for f in select v.folio, v.nombre, v.pend from public.comisiones_pendientes v where v.empresa_id = p_empresa order by v.numero_folio asc loop
    v_total := v_total + f.pend; v_cuantas := v_cuantas + 1;
    if v_resta > 0.004 then
      v_toca := round(least(v_resta, f.pend), 2);
      v_resta := round(v_resta - v_toca, 2);
      v_filas := v_filas || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('folio', f.folio, 'nombre', f.nombre, 'pend', f.pend, 'abono', v_toca, 'queda', round(f.pend - v_toca, 2)));
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('filas', v_filas, 'sobrante', v_resta, 'total_pendiente', v_total, 'cuantas', v_cuantas);
end $$;
revoke all on function interno.calcular_reparto(text, numeric) from public, anon, authenticated, service_role;

create or replace function public.vista_previa_reparto(p_monto numeric, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or round(p_monto, 2) <= 0 then return interno.err('DATO_INVALIDO', 'Escribe un importe mayor a cero.'); end if;
  return pg_catalog.jsonb_build_object('ok', true) || interno.calcular_reparto((pre.c).empresa_id, p_monto);
end $$;
revoke all on function public.vista_previa_reparto(numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.vista_previa_reparto(numeric, text) to authenticated;

-- Un depósito de comisión que se reparte entre las ventas con comisión pendiente (`guardarRepartoConCandado_`): un renglón por proyecto, TODOS o
-- ninguno (una transacción), con el MISMO `pago_id` (`P-###`; la hoja desbordaba a «P-000» al llegar a 1000: aquí sale P-1000). Idempotente por
-- `p_op_id`: repetirlo no escribe renglones nuevos y devuelve el mismo reparto. Se serializa con los abonos sueltos (candado `fifo`).
create or replace function public.repartir_abono_fifo(p_monto numeric, p_fecha date default null, p_nota text default '', p_op_id text default null,
                                                      p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_calc jsonb; f jsonb; v_pago text; v_nota text; v_prev jsonb; v_rep jsonb := '[]'::jsonb; v_tot numeric := 0; v_fecha date; v_n int; v_resp jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or round(p_monto, 2) <= 0 then return interno.err('DATO_INVALIDO', 'Escribe un importe mayor a cero.'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((pre.c).empresa_id || ':fifo', 0));
  if p_op_id is not null and exists (select 1 from public.abonos a where a.empresa_id = (pre.c).empresa_id and a.op_id = p_op_id) then
    -- la respuesta de la primera vez se guardó en la bitácora: se devuelve IGUAL (más `repetida`); si no está (renglones anteriores), se reconstruye de los abonos
    select x.resultado into v_prev from public.bitacora x where x.empresa_id = (pre.c).empresa_id and x.op_id = 'reparto:' || p_op_id;
    if v_prev is not null then return v_prev || '{"repetida": true}'::jsonb; end if;
    select pg_catalog.jsonb_build_object('ok', true, 'repetida', true, 'pago_id', min(a.pago_id),
             'repartido', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('folio', a.folio_hoja, 'abono', a.importe) order by a.id),
             'repartido_total', sum(a.importe))
      into v_prev from public.abonos a where a.empresa_id = (pre.c).empresa_id and a.op_id = p_op_id;
    return v_prev;
  end if;
  v_calc := interno.calcular_reparto((pre.c).empresa_id, p_monto);
  if (v_calc ->> 'cuantas')::int = 0 then return interno.err('DATO_INVALIDO', 'No hay comisiones pendientes que abonar.'); end if;
  v_pago := interno.folio_texto('P', interno.siguiente((pre.c).empresa_id, 'P', '', 1));
  v_nota := case when coalesce(p_nota, '') <> '' then p_nota || ' · ' else '' end || 'Reparto ' || v_pago || ' de ' || interno.pesos(p_monto);
  v_fecha := coalesce(p_fecha, interno.hoy_mx());
  for f in select e.value from pg_catalog.jsonb_array_elements(v_calc -> 'filas') e loop
    insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo, op_id, registrado_por)
    values ((pre.c).empresa_id, f ->> 'folio', (f ->> 'abono')::numeric, v_fecha, v_nota, v_pago, 'reparto', p_op_id, (pre.c).usuario_id);
    v_rep := v_rep || pg_catalog.jsonb_build_array(f);
    v_tot := v_tot + (f ->> 'abono')::numeric;
  end loop;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'pago_id', v_pago, 'repartido', v_rep, 'sobrante', (v_calc ->> 'sobrante')::numeric, 'repartido_total', v_tot);
  perform interno.anotar(pre.c, 'dinero', 'reparto', 'abono', v_pago, 'Reparto de ' || interno.pesos(p_monto) || ' (' || v_pago || ')', '', null,
                         pg_catalog.jsonb_build_object('pago_id', v_pago, 'repartido', v_tot), case when p_op_id is not null then 'reparto:' || p_op_id end, v_resp);
  return v_resp;
end $$;
revoke all on function public.repartir_abono_fifo(numeric, date, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.repartir_abono_fifo(numeric, date, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 4. corregir_venta: lo que Pagos hace «a mano» en la hoja
-- -----------------------------------------------------------------------------------------------------
-- Dirección y Pagos, con la matriz de `matriz_permisos()` (clave `corregir_venta`): TODOS los campos para Dirección; Pagos todos menos `iva`.
-- Cada cambio trae un valor ABSOLUTO (por eso es idempotente). Un campo fuera de la matriz, o que no pasa su validación, va a `rechazadas`
-- y NO aborta el resto. Validaciones: `subtotal` un número finito (puede ser negativo); `anticipo` y `liquidacion` ≥ 0 («un anticipo o una
-- liquidación negativos son dinero que “sale” de una venta»); `cuenta` una de las cinco y NO se puede vaciar; `estatus` uno de los cuatro (también
-- para Pagos: Q-A04); `fecha_liquidacion` «YYYY-MM-DD» o null; `pct_comision` 0..100 o null (es INFORMATIVO: ninguna fórmula lo lee); `nombre`
-- no vacío y de ≤ 2000. `iva`: solo Dirección y solo si QUEDA (la venta es LIQUIDADO o no tiene cuenta); si no, «la cuenta dicta el IVA».
-- Después de aplicar, el IVA se normaliza por la cuenta (salvo ventas LIQUIDADAS o sin cuenta). Un estatus que pasa a COBRANDO o LIQUIDADO
-- dispara la transición automática 2 de etapa. Todo queda en `bitacora` de nivel `dinero` con `antes/despues` SOLO de lo que cambió.
create or replace function public.corregir_venta(p_proyecto text, p_cambios jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; p public.proyectos; d public.ventas_dinero; k text; v jsonb; v_permitidos jsonb; v_rec jsonb := '[]'::jsonb; v_esc text[] := '{}';
  v_nombre text; v_sub numeric; v_anti numeric; v_liq numeric; v_cuenta text; v_est text; v_fliq date; v_pct numeric; v_iva boolean; v_iva_pedido boolean; v_hay_iva boolean := false;
  v_n numeric; v_antes jsonb := '{}'::jsonb; v_desp jsonb := '{}'::jsonb; v_ok boolean; v_quedara boolean; v_p2 public.proyectos; v_d2 public.ventas_dinero;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_cambios) is distinct from 'object' or p_cambios = '{}'::jsonb then return interno.err('DATO_INVALIDO', 'No hay cambios que aplicar.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id for update;
  v_permitidos := interno.matriz_permisos() -> (pre.c).area -> 'corregir_venta';
  v_nombre := p.nombre; v_sub := d.subtotal; v_anti := d.anticipo; v_liq := d.liquidacion; v_cuenta := d.cuenta; v_est := p.estatus; v_fliq := d.fecha_liquidacion;
  v_pct := d.pct_comision; v_iva := p.iva;
  for k, v in select e.key, e.value from pg_catalog.jsonb_each(p_cambios) e order by e.key loop
    if not (v_permitidos ? k) then
      v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', k, 'por', 'el rol ' || (pre.c).area || ' no puede escribir esta propiedad'));
      continue;
    end if;
    v_ok := true; v_n := interno.num(v);
    if k = 'nombre' then
      if pg_catalog.jsonb_typeof(v) <> 'string' or pg_catalog.btrim(v #>> '{}') = '' or pg_catalog.length(v #>> '{}') > 2000 then v_ok := false; else v_nombre := v #>> '{}'; end if;
    elsif k = 'subtotal' then
      if v_n is null then v_ok := false; else v_sub := v_n; end if;
    elsif k = 'anticipo' then
      if v_n is null or v_n < 0 then v_ok := false; else v_anti := v_n; end if;
    elsif k = 'liquidacion' then
      if v_n is null or v_n < 0 then v_ok := false; else v_liq := v_n; end if;
    elsif k = 'cuenta' then
      if pg_catalog.jsonb_typeof(v) <> 'string' or (v #>> '{}') <> all (array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']) then v_ok := false; else v_cuenta := v #>> '{}'; end if;
    elsif k = 'estatus' then
      if pg_catalog.jsonb_typeof(v) <> 'string' or (v #>> '{}') <> all (array['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']) then v_ok := false; else v_est := v #>> '{}'; end if;
    elsif k = 'fecha_liquidacion' then
      if pg_catalog.jsonb_typeof(v) = 'null' then v_fliq := null;
      elsif interno.fecha_json(v) is null then v_ok := false; else v_fliq := interno.fecha_json(v); end if;
    elsif k = 'pct_comision' then
      if pg_catalog.jsonb_typeof(v) = 'null' then v_pct := null;
      elsif v_n is null or v_n < 0 or v_n > 100 then v_ok := false; else v_pct := v_n; end if;
    else      -- iva: se decide al final, cuando ya se sabe cómo quedan la cuenta y el estatus
      if pg_catalog.jsonb_typeof(v) <> 'boolean' then v_ok := false; else v_hay_iva := true; v_iva_pedido := (v #>> '{}')::boolean; end if;
    end if;
    if k <> 'iva' then
      if v_ok then v_esc := v_esc || k;
      else v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', k, 'por', 'el valor de ' || k || ' no es válido')); end if;
    elsif not v_ok then
      v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', k, 'por', 'el IVA es verdadero o falso'));
    end if;
  end loop;
  if v_hay_iva then
    v_quedara := v_est = 'LIQUIDADO' or v_cuenta is null;
    if v_quedara then v_iva := v_iva_pedido; v_esc := v_esc || 'iva'::text;
    else v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'iva', 'por', 'la cuenta dicta el IVA: cámbiala o liquida la venta para fijarlo a mano')); end if;
  end if;
  if pg_catalog.cardinality(v_esc) = 0 then
    return pg_catalog.jsonb_build_object('ok', true, 'escritos', '[]'::jsonb, 'rechazadas', v_rec, 'venta', pg_catalog.jsonb_build_object(
             'nombre', p.nombre, 'subtotal', d.subtotal, 'anticipo', d.anticipo, 'liquidacion', d.liquidacion, 'cuenta', d.cuenta, 'estatus', p.estatus, 'iva', p.iva,
             'fecha_liquidacion', d.fecha_liquidacion, 'pct_comision', d.pct_comision));
  end if;
  update public.proyectos set nombre = v_nombre, estatus = v_est, iva = v_iva where id = p.id;
  update public.ventas_dinero set subtotal = v_sub, anticipo = v_anti, liquidacion = v_liq, cuenta = v_cuenta, fecha_liquidacion = v_fliq, pct_comision = v_pct where proyecto_id = p.id;
  perform interno.normalizar_iva(p.id);
  if v_est is distinct from p.estatus and v_est in ('COBRANDO', 'LIQUIDADO') then perform interno.etapa_por_cobro(p.id, pre.c); end if;
  select * into v_p2 from public.proyectos x where x.id = p.id;
  select * into v_d2 from public.ventas_dinero x where x.proyecto_id = p.id;
  -- antes/despues: SOLO lo que cambió
  if v_p2.nombre is distinct from p.nombre then v_antes := v_antes || pg_catalog.jsonb_build_object('nombre', p.nombre); v_desp := v_desp || pg_catalog.jsonb_build_object('nombre', v_p2.nombre); end if;
  if v_p2.estatus is distinct from p.estatus then v_antes := v_antes || pg_catalog.jsonb_build_object('estatus', p.estatus); v_desp := v_desp || pg_catalog.jsonb_build_object('estatus', v_p2.estatus); end if;
  if v_p2.iva is distinct from p.iva then v_antes := v_antes || pg_catalog.jsonb_build_object('iva', p.iva); v_desp := v_desp || pg_catalog.jsonb_build_object('iva', v_p2.iva); end if;
  if v_d2.subtotal is distinct from d.subtotal then v_antes := v_antes || pg_catalog.jsonb_build_object('subtotal', d.subtotal); v_desp := v_desp || pg_catalog.jsonb_build_object('subtotal', v_d2.subtotal); end if;
  if v_d2.anticipo is distinct from d.anticipo then v_antes := v_antes || pg_catalog.jsonb_build_object('anticipo', d.anticipo); v_desp := v_desp || pg_catalog.jsonb_build_object('anticipo', v_d2.anticipo); end if;
  if v_d2.liquidacion is distinct from d.liquidacion then v_antes := v_antes || pg_catalog.jsonb_build_object('liquidacion', d.liquidacion); v_desp := v_desp || pg_catalog.jsonb_build_object('liquidacion', v_d2.liquidacion); end if;
  if v_d2.cuenta is distinct from d.cuenta then v_antes := v_antes || pg_catalog.jsonb_build_object('cuenta', d.cuenta); v_desp := v_desp || pg_catalog.jsonb_build_object('cuenta', v_d2.cuenta); end if;
  if v_d2.fecha_liquidacion is distinct from d.fecha_liquidacion then v_antes := v_antes || pg_catalog.jsonb_build_object('fecha_liquidacion', d.fecha_liquidacion); v_desp := v_desp || pg_catalog.jsonb_build_object('fecha_liquidacion', v_d2.fecha_liquidacion); end if;
  if v_d2.pct_comision is distinct from d.pct_comision then v_antes := v_antes || pg_catalog.jsonb_build_object('pct_comision', d.pct_comision); v_desp := v_desp || pg_catalog.jsonb_build_object('pct_comision', v_d2.pct_comision); end if;
  if v_desp <> '{}'::jsonb then
    perform interno.anotar(pre.c, 'dinero', 'cambio', 'venta', p.id, 'Se corrigió ' || p.folio_hoja, 'Campos: ' || pg_catalog.array_to_string(v_esc, ', '), v_antes, v_desp);
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'escritos', pg_catalog.to_jsonb(v_esc), 'rechazadas', v_rec, 'venta', pg_catalog.jsonb_build_object(
           'nombre', v_p2.nombre, 'subtotal', v_d2.subtotal, 'anticipo', v_d2.anticipo, 'liquidacion', v_d2.liquidacion, 'cuenta', v_d2.cuenta, 'estatus', v_p2.estatus,
           'iva', v_p2.iva, 'fecha_liquidacion', v_d2.fecha_liquidacion, 'pct_comision', v_d2.pct_comision));
end $$;
revoke all on function public.corregir_venta(text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.corregir_venta(text, jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 5. corregir_abono: el contra-asiento
-- -----------------------------------------------------------------------------------------------------
-- Los abonos son un LIBRO y no se editan: una corrección es otro renglón `tipo = 'correccion'` (lo que hoy se hace «a mano en la pestaña»; aquí sí
-- se admiten negativos). SOLO Dirección. El monto no puede ser cero ni de diez millones o más, y la nota es obligatoria (la corrección se explica).
-- Idempotente por `p_op_id` y por folio. Mismo candado `fifo` que el reparto.
create or replace function public.corregir_abono(p_proyecto text, p_monto numeric, p_nota text, p_fecha date default null, p_op_id text default null,
                                                 p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; d public.ventas_dinero; v_s numeric; v_t numeric; v_repetida boolean := false; v_importe numeric;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto = 0 or abs(p_monto) >= 10000000 then
    return interno.err('DATO_INVALIDO', 'La corrección no puede ser de cero ni de diez millones de pesos o más.'); end if;
  if pg_catalog.btrim(coalesce(p_nota, '')) = '' then return interno.err('DATO_INVALIDO', 'Una corrección se explica: escribe la nota.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.empresa_id || ':fifo', 0));
  if p_op_id is not null then
    select a.importe into v_importe from public.abonos a where a.empresa_id = p.empresa_id and a.op_id = p_op_id and a.folio_hoja = p.folio_hoja limit 1;
    v_repetida := found;
  end if;
  if not v_repetida then
    insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, tipo, op_id, registrado_por)
    values (p.empresa_id, p.folio_hoja, p_monto, coalesce(p_fecha, interno.hoy_mx()), pg_catalog.btrim(p_nota), 'correccion', p_op_id, (pre.c).usuario_id);
    v_importe := p_monto;
    perform interno.anotar(pre.c, 'dinero', 'correccion', 'abono', p.id, 'Corrección de abono de ' || interno.pesos(p_monto) || ' en ' || p.folio_hoja,
                           pg_catalog.btrim(p_nota), null, pg_catalog.jsonb_build_object('importe', p_monto));
  end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id;
  select coalesce(sum(a.importe), 0) into v_s from public.abonos a where a.empresa_id = p.empresa_id and a.folio_hoja = p.folio_hoja;
  v_t := round(interno.comision(d.subtotal) - v_s, 2);
  return pg_catalog.jsonb_build_object('ok', true, 'importe', v_importe, 'abonado', v_s, 'restante', v_t) || case when v_repetida then '{"repetida": true}'::jsonb else '{}'::jsonb end;
end $$;
revoke all on function public.corregir_abono(text, numeric, text, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.corregir_abono(text, numeric, text, date, text, text) to authenticated;
