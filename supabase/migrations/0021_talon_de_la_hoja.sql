-- =====================================================================================================
-- 0021_talon_de_la_hoja.sql — la subida única llena el TALÓN que dejó la copia de la hoja (2026-10-24)
-- =====================================================================================================
-- Lo encontró la primera subida de verdad (2026-10-24, el aparato 5D93 de Elías, el único con cotizaciones): de 55 cotizaciones entraron 50
-- y las 5 AUTORIZADAS (COT-0056 a COT-0060@5D93) salieron «conflicto». La copia diaria de la hoja (desde el 2026-10-17) ya había creado, por
-- cada fila de «Autorizaciones», un TALÓN de su cotización (`procedencia.stub = 'Autorizaciones'`: proyecto, cliente y subtotal, sin
-- partidas), y `subida_unica` no sobrescribe datos distintos. Así, justo las cotizaciones autorizadas no podían subir nunca.
--
-- El cambio, uno solo, marcado «0021:» en la copia de abajo (lo demás es idéntico a 0013): si lo que hay en la base es un TALÓN y quien sube es
-- Dirección, la cotización del aparato lo llena —datos, hitos y procedencia—; el talón queda entero en `procedencia.talon`; el estado y la
-- autorización ligada NO cambian. Pagos y Fabricación siguen como antes (el talón no tiene autor: lo ajeno no se compara).
--
-- Su par en el importador (scripts/importador/sql.mjs): un talón de la copia diaria ya no pisa una cotización que no es talón. Sin eso, la
-- copia de la madrugada siguiente volvía a dejar el talón.
--
-- Ninguna firma, tabla ni privilegio nuevo: las listas cerradas de 0011 no cambian. Depende de: 0001…0020. Idempotente; termina con la auditoría.
-- =====================================================================================================

create or replace function public.subida_unica(p_lote jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_disp text; v_acuse jsonb := '[]'::jsonb; e jsonb; q jsonb; b jsonb; k text; v jsonb; v_max bigint := 0; v_n bigint; v_disp_e text; v_fg text; co public.cotizaciones;
  v_datos jsonb; v_inferido boolean; v_creadas int := 0; v_ya int := 0; v_conf int := 0; v_rech int := 0; v_cot jsonb; v_corr text := coalesce(interno.correo_verificado(), '');
  v_nivel text; v_ts timestamptz; v_ent text; v_cnt int; v_folio text; v_motivo text; v_idb text; v_nota text; v_hitos jsonb;
  v_aut public.autorizaciones; v_cod_local text; v_valido boolean; v_ts_cliente timestamptz;      -- 0013
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_lote) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'El lote está mal formado.'); end if;
  v_disp := nullif(p_lote ->> 'disp', '');
  if v_disp is not null and v_disp !~ '^[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El aparato del lote no es válido.'); end if;
  for k in select unnest(array['cotizaciones', 'cola', 'bitacora']) loop
    if p_lote ? k and pg_catalog.jsonb_typeof(p_lote -> k) not in ('array', 'null') then return interno.err('DATO_INVALIDO', 'El lote está mal formado: «' || k || '» debe ser una lista.'); end if;
  end loop;
  for k in select unnest(array['hitos', 'canva', 'cuadernos']) loop
    if p_lote ? k and pg_catalog.jsonb_typeof(p_lote -> k) not in ('object', 'null') then return interno.err('DATO_INVALIDO', 'El lote está mal formado: «' || k || '» debe ser un objeto.'); end if;
  end loop;
  if pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'cotizaciones', 'null'::jsonb), '[]'::jsonb)) > 50
     or pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) > 50
     or pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'bitacora', 'null'::jsonb), '[]'::jsonb)) > 200 then
    return interno.err('DATO_INVALIDO', 'El lote excede el tope (50 cotizaciones, 50 de la cola y 200 de bitácora).'); end if;
  v_max := coalesce(interno.num(p_lote -> 'folio_max'), 0);
  if v_max < 0 or v_max > 1000000000 then return interno.err('DATO_INVALIDO', 'El folio máximo del aparato no es válido.'); end if;
  v_hitos := coalesce(nullif(p_lote -> 'hitos', 'null'::jsonb), '{}'::jsonb);
  -- 1. el contador del aparato: el mayor entre lo que ya tiene, el `folio_max` y el número más alto de la cola (también los renglones «fantasma»: autorizada + q nulo)
  for q in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) x loop
    if pg_catalog.jsonb_typeof(q) = 'object' then
      v_folio := pg_catalog.substring(coalesce(q ->> 'folio', ''), '[0-9]+');
      if v_folio is not null and pg_catalog.length(v_folio) <= 9 and v_folio::bigint > v_max then v_max := v_folio::bigint; end if;
    end if;
  end loop;
  if v_disp is not null then
    insert into public.contadores as ct (empresa_id, clave, ventana, n) values ('*', 'folio_cot:' || v_disp, '', v_max)
    on conflict (empresa_id, clave, ventana) do update set n = greatest(ct.n, excluded.n), updated_at = clock_timestamp();
  end if;
  -- 2. las cotizaciones del historial
  for e in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cotizaciones', 'null'::jsonb), '[]'::jsonb)) x loop
    v_folio := case when pg_catalog.jsonb_typeof(e) = 'object' then e ->> 'folio' end;
    if v_folio is null or v_folio !~ '^[A-Za-z0-9-]{1,24}$' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', coalesce(v_folio, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    v_inferido := false;                              -- solo se INFIERE cuando no hay de dónde sacar el aparato (abajo): el del sello y el del lote son exactos
    v_disp_e := coalesce(nullif(e ->> 'disp', ''), nullif(pg_catalog.split_part(coalesce(e #>> '{sello,folio}', ''), '@', 2), ''), v_disp);
    if v_disp_e is null then
      v_disp_e := 'HIST' || pg_catalog.left(pg_catalog.md5(v_folio || coalesce(e ->> 'cliente', '') || coalesce(e ->> 'fecha', '')), 6); v_inferido := true; end if;
    v_fg := v_folio || '@' || v_disp_e;
    v_datos := interno.datos_cotizacion(e);
    if v_disp_e !~ '^[A-Za-z0-9_-]{1,24}$' or pg_catalog.length(v_datos::text) > 200000 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_folio, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    select * into co from public.cotizaciones x where x.empresa_id = c.empresa_id and x.folio_global = v_fg for update;
    if not found then
      -- 0013 (H-2): «autorizada» solo con la fila vigente del servidor y el MISMO código que el sello local; si no, «retirada»
      v_cod_local := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(case when pg_catalog.jsonb_typeof(e -> 'sello') = 'object' then e #>> '{sello,codigo}' end, ''), '[^0-9A-Fa-f]', '', 'g'));
      select * into v_aut from public.autorizaciones a where a.empresa_id = c.empresa_id and a.folio_global = v_fg and a.estado = 'vigente';
      v_valido := found and pg_catalog.length(v_cod_local) = 12 and pg_catalog.replace(v_aut.codigo, '-', '') = v_cod_local;
      insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, hitos, procedencia, autorizacion_id)
      values (c.empresa_id, v_fg, v_folio, v_disp_e, c.usuario_id, case when v_valido then 'autorizada' else 'retirada' end, v_datos,
              coalesce(v_hitos -> v_folio, '{}'::jsonb) || case when pg_catalog.jsonb_typeof(p_lote -> 'canva' -> v_folio) = 'object'
                                                               then pg_catalog.jsonb_build_object('propuesta', p_lote -> 'canva' -> v_folio) else '{}'::jsonb end,
              pg_catalog.jsonb_build_object('telefonos', case when v_disp is null then '[]'::jsonb else pg_catalog.jsonb_build_array(v_disp) end,
                                            'sello_local', e -> 'sello', 'disp_inferido', v_inferido, 'subida_unica', now())
              || case when v_valido then '{}'::jsonb else '{"sin_sello_valido": true}'::jsonb end,
              case when v_valido then v_aut.id end);
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'creada')); v_creadas := v_creadas + 1;
    elsif co.procedencia ? 'stub' and c.area = 'direccion' then      -- 0021
      -- 0021: el TALÓN que dejó la copia de la hoja (una autorización de «Autorizaciones» sin su cotización) se llena con la del aparato que
      -- emitió el folio. Lo que decía el talón queda entero en procedencia.talon; el estado y la autorización ligada no se tocan (los da la
      -- hoja, no el teléfono). Solo Dirección: el talón no tiene autor y lo ajeno no se compara (abajo).
      update public.cotizaciones x
         set datos = v_datos,
             hitos = x.hitos || coalesce(v_hitos -> v_folio, '{}'::jsonb) || case when pg_catalog.jsonb_typeof(p_lote -> 'canva' -> v_folio) = 'object'
                                                                                 then pg_catalog.jsonb_build_object('propuesta', p_lote -> 'canva' -> v_folio) else '{}'::jsonb end,
             procedencia = (x.procedencia - 'stub') || pg_catalog.jsonb_build_object('talon', x.procedencia,
                             'telefonos', case when v_disp is null then '[]'::jsonb else pg_catalog.jsonb_build_array(v_disp) end,
                             'sello_local', e -> 'sello', 'disp_inferido', v_inferido, 'subida_unica', now()),
             creado_por = coalesce(x.creado_por, c.usuario_id)
       where x.empresa_id = c.empresa_id and x.folio_global = v_fg;
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'creada', 'talon', true)); v_creadas := v_creadas + 1;
    elsif c.area <> 'direccion' and co.creado_por is distinct from c.usuario_id then      -- se decide PRIMERO: lo ajeno no se compara ni se revela
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'rechazada', 'motivo', 'ROL_SIN_PERMISO')); v_rech := v_rech + 1;
    elsif interno.datos_cotizacion(co.datos) = v_datos then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    else      -- datos distintos: NO se sobrescribe; se anota qué teléfono la trae
      if v_disp is not null and not (coalesce(co.procedencia -> 'telefonos', '[]'::jsonb) ? v_disp) then
        update public.cotizaciones set procedencia = pg_catalog.jsonb_set(procedencia, '{telefonos}', coalesce(procedencia -> 'telefonos', '[]'::jsonb) || pg_catalog.to_jsonb(v_disp))
         where empresa_id = c.empresa_id and folio_global = v_fg;
      end if;
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'conflicto', 'motivo', 'Los datos son distintos de los que ya hay: no se sobrescribe.'));
      v_conf := v_conf + 1;
    end if;
  end loop;
  -- 3. la cola de pendientes: crea la cotización y la solicitud `pendiente`; los «fantasma» (sin `q`) solo aportaron su folio al contador
  for q in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) x loop
    v_folio := case when pg_catalog.jsonb_typeof(q) = 'object' then q ->> 'folio' end;
    if v_folio is null or v_folio !~ '^[A-Za-z0-9-]{1,24}$' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', coalesce(v_folio, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    if q ->> 'estado' is distinct from 'pendiente' or pg_catalog.jsonb_typeof(q -> 'q') is distinct from 'object' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_folio, 'estado', 'ya_estaba', 'motivo', 'Sin datos que subir.')); v_ya := v_ya + 1; continue;
    end if;
    if v_disp is null then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_folio, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    v_fg := v_folio || '@' || v_disp;
    v_cot := interno.limpiar_cotizacion(q -> 'q');
    if v_cot ? 'error' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'rechazada', 'motivo', v_cot ->> 'error')); v_rech := v_rech + 1; continue;
    end if;
    if exists (select 1 from public.cotizaciones x where x.empresa_id = c.empresa_id and x.folio_global = v_fg)
       or exists (select 1 from public.solicitudes x where x.empresa_id = c.empresa_id and x.folio_global = v_fg and x.estado = 'pendiente') then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'ya_estaba')); v_ya := v_ya + 1; continue;
    end if;
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, procedencia)
    values (c.empresa_id, v_fg, v_folio, v_disp, c.usuario_id, 'pendiente',
            pg_catalog.jsonb_build_object('proy', v_cot ->> 'proyecto', 'cliente', v_cot ->> 'cliente', 'iva', v_cot -> 'iva', 'subtotal', v_cot -> 'subtotal', 'items', v_cot -> 'items'),
            pg_catalog.jsonb_build_object('telefonos', pg_catalog.jsonb_build_array(v_disp), 'subida_unica', now()));
    insert into public.solicitudes (empresa_id, folio_global, proyecto, cliente, subtotal, iva, cotizacion, solicito_id, solicito_texto, estado, nota, procedencia)
    values (c.empresa_id, v_fg, v_cot ->> 'proyecto', v_cot ->> 'cliente', (v_cot ->> 'subtotal')::numeric, (v_cot ->> 'iva')::boolean, v_cot, c.usuario_id, v_corr, 'pendiente',
            pg_catalog.left(coalesce(q ->> 'nota', ''), 500), pg_catalog.jsonb_build_object('subida_unica', now()));
    v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'creada')); v_creadas := v_creadas + 1;
  end loop;
  -- 4a. los cuadernos de cliente (la nota es POR AUTOR; una distinta de la que ya hay no se sobrescribe)
  for k, v in select x.key, x.value from pg_catalog.jsonb_each(coalesce(nullif(p_lote -> 'cuadernos', 'null'::jsonb), '{}'::jsonb)) x loop
    if k !~ '^(tel:[0-9]{10}|nom:.{1,200})$' or pg_catalog.jsonb_typeof(v) <> 'string' or pg_catalog.length(v #>> '{}') > 1200 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO')); v_rech := v_rech + 1; continue;
    end if;
    v_nota := null;
    select n.nota into v_nota from public.cuaderno_notas n where n.empresa_id = c.empresa_id and n.clave = k and n.autor_id = c.usuario_id and n.deleted_at is null;
    if v_nota is null then
      insert into public.cuaderno_notas (empresa_id, clave, autor_id, nota) values (c.empresa_id, k, c.usuario_id, v #>> '{}')
      on conflict (empresa_id, clave, autor_id) do update set nota = excluded.nota, deleted_at = null;
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'creada')); v_creadas := v_creadas + 1;
    elsif v_nota = v #>> '{}' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    else
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'conflicto', 'motivo', 'Ya hay otra nota: no se sobrescribe.')); v_conf := v_conf + 1;
    end if;
  end loop;
  -- 4b. la bitácora local: idempotente por op_id; el nivel sale de una LISTA BLANCA de acciones sin importes (etapa y agenda → general); todo lo demás es de dinero
  --     porque `ganar` anota precio y anticipo en el detalle y `actualizar` guarda antes/después de la cuenta y los anticipos
  for b in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'bitacora', 'null'::jsonb), '[]'::jsonb)) x loop
    v_idb := case when pg_catalog.jsonb_typeof(b) = 'object' then nullif(b ->> 'id', '') end;
    if v_idb is null or v_disp is null or pg_catalog.length(v_idb) > 100 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', coalesce(v_idb, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO')); v_rech := v_rech + 1; continue;
    end if;
    v_nivel := case when b ->> 'accion' in ('etapa', 'agendo', 'reagendo', 'marco', 'cancelo') then 'general' else 'dinero' end;
    v_ent := case when b ->> 'entidad' in ('proyecto','instalacion','material','constante','almacen','cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema')
                  then b ->> 'entidad' else 'plataforma' end;
    -- 0013 (H-1): la hora es la del servidor; la que dice el teléfono queda en procedencia.ts_cliente si es una fecha razonable (2020 … mañana)
    v_ts := now(); v_ts_cliente := null;
    begin
      if pg_catalog.jsonb_typeof(b -> 'ts') = 'number' and (b ->> 'ts')::numeric > 0 then v_ts_cliente := pg_catalog.to_timestamp(((b ->> 'ts')::numeric) / 1000.0);
      elsif pg_catalog.jsonb_typeof(b -> 'ts') = 'string' then v_ts_cliente := (b ->> 'ts')::timestamptz; end if;
    exception when others then v_ts_cliente := null; end;
    if v_ts_cliente is not null and (v_ts_cliente < '2020-01-01'::timestamptz or v_ts_cliente > now() + interval '1 day') then v_ts_cliente := null; end if;
    insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues, usuario_id, usuario_texto, rol, dispositivo, op_id, procedencia)
    values (c.empresa_id, v_ts, v_nivel, coalesce(nullif(pg_catalog.left(b ->> 'accion', 80), ''), 'subida'), v_ent, pg_catalog.left(coalesce(b ->> 'entidad_id', ''), 200),
            pg_catalog.left(coalesce(nullif(pg_catalog.btrim(b ->> 'titulo'), ''), 'Evento de un teléfono'), 200), pg_catalog.left(coalesce(b ->> 'detalle', ''), 600),
            case when pg_catalog.jsonb_typeof(b -> 'antes') in ('object', 'array') then b -> 'antes' end, case when pg_catalog.jsonb_typeof(b -> 'despues') in ('object', 'array') then b -> 'despues' end,
            c.usuario_id, v_corr, c.area, v_disp, 'tel:' || c.usuario_id::text || ':' || v_disp || ':' || v_idb,      -- 0013 (H-1): quién, su área y el op_id con su uid
            pg_catalog.jsonb_build_object('subida_unica', true, 'sello', b -> 'sello')
              || case when v_ts_cliente is null then '{}'::jsonb else pg_catalog.jsonb_build_object('ts_cliente', v_ts_cliente) end)
    on conflict (empresa_id, op_id) where op_id is not null do nothing;
    get diagnostics v_cnt = row_count;
    if v_cnt = 1 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', v_idb, 'estado', 'creada')); v_creadas := v_creadas + 1;
    else
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', v_idb, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'acuse', v_acuse,
           'resumen', pg_catalog.jsonb_build_object('creadas', v_creadas, 'ya_estaban', v_ya, 'conflictos', v_conf, 'rechazadas', v_rech));
end $$;
revoke all on function public.subida_unica(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.subida_unica(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0021): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
