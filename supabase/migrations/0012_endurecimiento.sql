-- =====================================================================================================================================================
-- 0012_endurecimiento.sql — lo que encontró la revisión adversarial del SQL (2026-10-10): lo barato y lo crítico
-- =====================================================================================================================================================
-- Un revisor que NO escribió estas migraciones intentó romperlas en el arnés (cientos de intentos y 96 mutaciones diseñadas). Resultado: cero fugas de
-- dinero hacia Fabricación, cero escaladas por membresía, privilegios y auditoría limpios; y problemas de VALIDACIÓN DE DATOS que se corrigen aquí:
--
--   A-1 (ALTA)  `NaN`, `Infinity` y valores enormes pasaban la guarda `p_monto <= 0` (en numeric, NaN ordena como el mayor y NO es <= 0). Con
--               `repartir_abono_fifo('NaN')` Pagos liquidaba TODAS las comisiones pendientes sin un depósito, y los abonos son un libro solo-agregar.
--               Ahora las tres RPC de cobro y reparto exigen 0 < monto < 1e9, y las tablas lo exigen también (una cota superior rechaza NaN e Infinity).
--   M-5         un `subtotal` enorme (9e131071) rompía la vista de fórmulas y `cuadre_hoja` para todos.
--   M-2         un requerimiento con cantidad NaN o >= 1e7 rompía `emitir_salidas_derivadas` y el corte de etapa para todos.
--   M-1         `emitir_salidas_derivadas(p_hoy)` confiaba en la fecha del cliente: Pagos con `p_hoy = 2099-12-31` consumía material de forma irreversible.
--   M-3         textos sin tope (filas de 8 MB que sincronizan todos los teléfonos; 62 MB en un reparto, permanentes en un libro).
--   M-6         el planificador usa estadísticas de las filas que la RLS oculta (operadores leakproof de text y date): se apagan en las tablas de dinero.
--   Config      `correo_verificado()` confiaba solo en `email_confirmed_at`; con «Confirm email» apagado alguien con contraseña reclamaba una invitación.
--               Ahora exige además el proveedor Google.
--
-- Lo que NO se arregla aquí (decisión o diseño; queda en docs/ESTADO-SUPABASE.md): la holgura de +10 min de los sellos, `subida_unica` que acepta
-- usuario, rol y ts del cliente en la bitácora, los ids y contadores globales entre empresas (hoy solo existe `al3d`), la alta de requerimientos por
-- Pagos con campos de más y el tope de `almacen_movimientos.ts`. Es de esquema o de cliente y no se puede encender sin resolverlo.
--
-- Idempotente: se puede volver a correr (funciones con CREATE OR REPLACE; restricciones con manejo de duplicado).

-- ---- A-1: importes finitos y acotados en las tres RPC de cobro y reparto ---------------------------------------------------------------------------------
create or replace function public.registrar_cobro(p_proyecto text, p_monto numeric, p_fecha date default null, p_liquidar boolean default true,
                                                  p_op_id text default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; d public.ventas_dinero; r jsonb; v_saldo numeric; v_resp jsonb; v_fecha date; v_antes jsonb; v_est text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto <= 0 or p_monto >= 1000000000 then
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

create or replace function public.vista_previa_reparto(p_monto numeric, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto >= 1000000000 or round(p_monto, 2) <= 0 then return interno.err('DATO_INVALIDO', 'Escribe un importe mayor a cero.'); end if;
  return pg_catalog.jsonb_build_object('ok', true) || interno.calcular_reparto((pre.c).empresa_id, p_monto);
end $$;
revoke all on function public.vista_previa_reparto(numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.vista_previa_reparto(numeric, text) to authenticated;

create or replace function public.repartir_abono_fifo(p_monto numeric, p_fecha date default null, p_nota text default '', p_op_id text default null,
                                                      p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_calc jsonb; f jsonb; v_pago text; v_nota text; v_prev jsonb; v_rep jsonb := '[]'::jsonb; v_tot numeric := 0; v_fecha date; v_n int; v_resp jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto >= 1000000000 or round(p_monto, 2) <= 0 then return interno.err('DATO_INVALIDO', 'Escribe un importe mayor a cero.'); end if;
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

-- ---- M-1: la fecha de «hoy» de las salidas derivadas la decide el servidor -----------------------------------------------------------------------------
create or replace function public.emitir_salidas_derivadas(p_hoy date default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; v_dia date; v_proy int := 0; v_mov int := 0; v_n int; v_fecha date;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  v_dia := interno.hoy_mx();
  if p_hoy is not null and p_hoy between v_dia - 1 and v_dia + 1 then v_dia := p_hoy; end if;     -- el día lo manda el SERVIDOR; el del cliente solo cuenta si difiere a lo más 1 día (zona horaria)
  for p in select x.* from public.proyectos x
            where x.empresa_id = (pre.c).empresa_id and x.deleted_at is null and x.etapa is distinct from 'cancelado'
              and exists (select 1 from public.instalaciones i where i.empresa_id = x.empresa_id and i.proyecto_id = x.id
                             and i.estado <> 'cancelada' and i.deleted_at is null and i.fecha - v_dia <= 1)
            order by x.id loop
    select min(i.fecha) into v_fecha from public.instalaciones i
     where i.empresa_id = p.empresa_id and i.proyecto_id = p.id and i.estado <> 'cancelada' and i.deleted_at is null;
    v_n := interno.emitir_salidas(p, 'derivado', 'Derivado, nunca confirmado: se instala ' || v_fecha::text || ' y nadie marcó el corte.', pre.c);
    if v_n > 0 then v_proy := v_proy + 1; v_mov := v_mov + v_n; end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'proyectos', v_proy, 'movimientos', v_mov);
end $$;
revoke all on function public.emitir_salidas_derivadas(date, text) from public, anon, authenticated, service_role;
grant execute on function public.emitir_salidas_derivadas(date, text) to authenticated;

-- ---- A-1 y M-5: lo mismo, a nivel de tabla (red de seguridad: ninguna ruta de escritura futura puede guardar NaN, Infinity ni un exponente absurdo) -----------
do $$ begin
  alter table public.ventas_dinero add constraint ventas_dinero_importes_acotados
    check (subtotal > -1000000000 and subtotal < 1000000000 and anticipo < 1000000000 and liquidacion < 1000000000);
exception when duplicate_object then null; end $$;

-- ---- M-2: cantidades del almacén finitas y por debajo del tope del libro (1e7) ----------------------------------------------------------------------------
do $$ begin
  alter table public.requerimientos add constraint requerimientos_cantidades_acotadas
    check (cantidad_compra < 10000000 and (cantidad_ajustada is null or cantidad_ajustada < 10000000));
exception when duplicate_object then null; end $$;

-- ---- M-3: topes de texto (Fabricación y Pagos escriben estos campos; sin tope, una fila de varios MB viaja a cada teléfono) ------------------------------
do $$ begin
  alter table public.proyectos add constraint proyectos_textos_acotados check (length(maps_url) <= 2000 and length(geo_fuente) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.abonos add constraint abonos_nota_acotada check (length(nota) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.almacen_movimientos add constraint almacen_movimientos_textos_acotados
    check (length(nota) <= 500 and length(usuario) <= 200 and length(firma) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.instalaciones add constraint instalaciones_notas_acotadas check (length(notas) <= 20000);
exception when duplicate_object then null; end $$;

-- ---- M-6: sin estadísticas en las columnas de texto y fecha de las tablas de dinero -----------------------------------------------------------------------
-- Fabricación tiene SELECT en estas tablas (la RLS le da 0 filas), pero el planificador estima con estadísticas de TODAS las filas y los operadores de
-- text y date son «leakproof»: un `EXPLAIN` o un `count=planned` revelaría la distribución de importes. Con 0 no se recolecta nada (las tablas son chicas).
do $$ declare r record; begin
  for r in select c.relname, a.attname
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('ventas_dinero', 'abonos', 'autorizaciones', 'bitacora', 'almacen_costos')
              and a.attnum > 0 and not a.attisdropped and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype, 'date'::regtype) loop
    execute format('alter table public.%I alter column %I set statistics 0', r.relname, r.attname);
  end loop;
end $$;

-- ---- Config: el correo solo cuenta si la cuenta es de Google -------------------------------------------------------------------------------------------------
-- Con «Confirm email» apagado, una cuenta de correo y contraseña nace con `email_confirmed_at` puesto y podía reclamar la invitación de Dirección. Aquí el
-- proveedor tiene que ser Google (lo pone Supabase en `raw_app_meta_data`; la persona no lo edita). El proyecto además debe tener el proveedor de correo
-- apagado (supabase/config.toml, [auth.email]).
create or replace function interno.correo_verificado() returns text
language sql stable security definer set search_path = '' as $$
  select pg_catalog.lower(pg_catalog.btrim(u.email)) from auth.users u
   where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
     and u.raw_app_meta_data ->> 'provider' = 'google'
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
revoke all on function interno.correo_verificado() from public, anon, authenticated, service_role;
