-- =====================================================================================================
-- 0032_fecha_del_anticipo.sql — «Datos de la venta» corrige también la fecha del anticipo
-- =====================================================================================================
-- La auditoría del 2026-10-26 (T1-6) encontró que la fecha del anticipo de una venta no la podía corregir nadie desde un teléfono: no
-- estaba en «Datos de la venta» (js/mod/pagos-supa.js, paso 6 de docs/BASE-MANDA.md) porque `corregir_venta` (0007) no la acepta, y la
-- única puerta era `proyecto_actualizar` desde el Editor SQL. Es justo la fecha que decide en qué MES se cuenta la venta (la W de
-- `ventas_calculadas`, el Resumen de Control, «Cuentas»), y la que el Cotizador decía «se corrige en Cobros y abonos» sin que hubiera
-- dónde.
--
-- QUÉ CAMBIA (copia íntegra de la de 0007 con los cambios marcados «0032:», el patrón de 0013–0028):
--   public.corregir_venta   acepta `fecha_anticipo` («AAAA-MM-DD»), con las mismas reglas que el resto de sus campos: valor ABSOLUTO
--                           (mandarlo dos veces deja lo mismo y no escribe otra línea), un valor que no pasa va a `rechazadas` sin
--                           abortar el resto, y la línea de nivel dinero de la bitácora lleva lo de antes y lo de después. No se vacía
--                           (null es «no es válido»): una venta sin fecha de anticipo se cae de los totales del mes. La respuesta trae
--                           `fecha_anticipo` en `venta`, como los demás campos.
--
-- QUIÉN: la lista de `proyecto_actualizar` del área en la matriz (`interno.matriz_permisos()`), que desde 0002 ya dice quién escribe la
--   fecha del anticipo —solo Dirección—. Así no hay una segunda lista que mantener, y la matriz NO se vuelve a escribir aquí (una copia de
--   la matriz en esta migración pisaría cualquier cambio que otra posterior a 0028 le hubiera hecho). Pagos la sigue sin poder corregir
--   (ni por aquí ni por `proyecto_actualizar`), como decidió Elías para «Datos de la venta» (solo Dirección, 2026-10-25). Lo demás de la
--   función no cambia: sus campos siguen saliendo de la clave `corregir_venta` de la matriz.
--
-- LA COPIA DE CADA 3 HORAS no llama a `corregir_venta` (escribe directo con service_role) y con la empresa en 'base' ni siquiera aplica.
-- EL TELÉFONO: la app pide el campo solo a quien la matriz deja (`puedeCorregirLaFechaDelAnticipo` en js/datos/pagos-supa.js). Si la app
--   se publica antes de aplicar esto, la base contesta «no puede escribir esta propiedad» por ese campo y la pantalla lo dice («falta
--   aplicar la migración 0032»); los demás campos de la misma corrección se escriben igual.
--
-- LA AUDITORÍA: ninguna función, tabla, vista ni publicación nueva; ninguna firma cambia. Las listas cerradas de `interno.auditoria()`
--   (la de 0027) siguen siendo correctas tal cual, y la aduana corre al final, como en cada migración.
--
-- Depende de: 0001…0028 (`interno.fecha_json` es de 0006; la matriz, de 0028). El número 0032 lo asignó la tanda 1 de la auditoría del
-- 2026-10-26 (0029–0031 son de los otros frentes de esa tanda). Idempotente (create or replace). Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- corregir_venta: la de 0007, con la fecha del anticipo
-- -----------------------------------------------------------------------------------------------------
create or replace function public.corregir_venta(p_proyecto text, p_cambios jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; p public.proyectos; d public.ventas_dinero; k text; v jsonb; v_permitidos jsonb; v_rec jsonb := '[]'::jsonb; v_esc text[] := '{}';
  v_nombre text; v_sub numeric; v_anti numeric; v_liq numeric; v_cuenta text; v_est text; v_fliq date; v_pct numeric; v_iva boolean; v_iva_pedido boolean; v_hay_iva boolean := false;
  v_n numeric; v_antes jsonb := '{}'::jsonb; v_desp jsonb := '{}'::jsonb; v_ok boolean; v_quedara boolean; v_p2 public.proyectos; v_d2 public.ventas_dinero;
  v_fant date; v_deja_fant boolean;       -- 0032
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_cambios) is distinct from 'object' or p_cambios = '{}'::jsonb then return interno.err('DATO_INVALIDO', 'No hay cambios que aplicar.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id for update;
  v_permitidos := interno.matriz_permisos() -> (pre.c).area -> 'corregir_venta';
  -- 0032: quién escribe la fecha del anticipo lo dice la lista de `proyecto_actualizar` del área (solo Dirección), no una lista nueva.
  v_deja_fant := coalesce(interno.matriz_permisos() -> (pre.c).area -> 'proyecto_actualizar', '[]'::jsonb) ? 'fecha_anticipo';
  v_nombre := p.nombre; v_sub := d.subtotal; v_anti := d.anticipo; v_liq := d.liquidacion; v_cuenta := d.cuenta; v_est := p.estatus; v_fliq := d.fecha_liquidacion;
  v_pct := d.pct_comision; v_iva := p.iva;
  v_fant := p.fecha_anticipo;             -- 0032
  for k, v in select e.key, e.value from pg_catalog.jsonb_each(p_cambios) e order by e.key loop
    if not ((v_permitidos ? k) or (k = 'fecha_anticipo' and v_deja_fant)) then      -- 0032: o la fecha del anticipo, con su lista
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
    elsif k = 'fecha_anticipo' then
      -- 0032: una fecha «AAAA-MM-DD» que exista. Sin vaciarla: una venta sin fecha de anticipo se cae de los totales de su mes.
      if interno.fecha_json(v) is null then v_ok := false; else v_fant := interno.fecha_json(v); end if;
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
             'fecha_liquidacion', d.fecha_liquidacion, 'pct_comision', d.pct_comision,
             'fecha_anticipo', p.fecha_anticipo));                                       -- 0032
  end if;
  update public.proyectos set nombre = v_nombre, estatus = v_est, iva = v_iva,
                              fecha_anticipo = v_fant                                     -- 0032
   where id = p.id;
  update public.ventas_dinero set subtotal = v_sub, anticipo = v_anti, liquidacion = v_liq, cuenta = v_cuenta, fecha_liquidacion = v_fliq, pct_comision = v_pct where proyecto_id = p.id;
  perform interno.normalizar_iva(p.id);
  if v_est is distinct from p.estatus and v_est in ('COBRANDO', 'LIQUIDADO') then perform interno.etapa_por_cobro(p.id, pre.c); end if;
  select * into v_p2 from public.proyectos x where x.id = p.id;
  select * into v_d2 from public.ventas_dinero x where x.proyecto_id = p.id;
  -- antes/despues: SOLO lo que cambió
  if v_p2.nombre is distinct from p.nombre then v_antes := v_antes || pg_catalog.jsonb_build_object('nombre', p.nombre); v_desp := v_desp || pg_catalog.jsonb_build_object('nombre', v_p2.nombre); end if;
  if v_p2.estatus is distinct from p.estatus then v_antes := v_antes || pg_catalog.jsonb_build_object('estatus', p.estatus); v_desp := v_desp || pg_catalog.jsonb_build_object('estatus', v_p2.estatus); end if;
  if v_p2.iva is distinct from p.iva then v_antes := v_antes || pg_catalog.jsonb_build_object('iva', p.iva); v_desp := v_desp || pg_catalog.jsonb_build_object('iva', v_p2.iva); end if;
  -- 0032: la fecha del anticipo, como los demás
  if v_p2.fecha_anticipo is distinct from p.fecha_anticipo then v_antes := v_antes || pg_catalog.jsonb_build_object('fecha_anticipo', p.fecha_anticipo); v_desp := v_desp || pg_catalog.jsonb_build_object('fecha_anticipo', v_p2.fecha_anticipo); end if;
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
           'iva', v_p2.iva, 'fecha_liquidacion', v_d2.fecha_liquidacion, 'pct_comision', v_d2.pct_comision,
           'fecha_anticipo', v_p2.fecha_anticipo));                                       -- 0032
end $$;
revoke all on function public.corregir_venta(text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.corregir_venta(text, jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez (la auditoría de 0027: las listas cerradas no cambian)
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0032): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
