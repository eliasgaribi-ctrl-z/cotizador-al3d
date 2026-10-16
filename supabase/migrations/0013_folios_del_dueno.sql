-- =====================================================================================================================================================
-- 0013_folios_del_dueno.sql — un folio solo lo aparta el teléfono de quien lo emite (revisión de seguridad, 2026-10-16)
-- =====================================================================================================================================================
-- Lo que se encontró (sin fuga de datos; solo estorbaba):
--   · `solicitar` y `subida_unica` creaban la fila de `cotizaciones` con CUALQUIER `folio_global` que nadie hubiera usado. Un miembro activo podía apartar
--     el folio que otro teléfono iba a emitir después (`COT-0043-B@K7QM`) y, cuando el dueño real pedía autorización, recibía «Ese folio es de otra persona».
--   · `subida_unica` dejaba esas filas en `estado = 'autorizada'` aunque no existiera ningún sello firmado en `autorizaciones`.
--   · `subida_unica` dejaba subir el contador de folios (`contadores('folio_cot:<disp>')`) de un aparato ajeno, y ocupar los `op_id` de su bitácora.
--
-- El arreglo: cada aparato (`disp`, los 4 caracteres de `al3d_pf_disp`) tiene DUEÑO en cada empresa, y se guarda junto a los contadores
-- (`contadores(<empresa>, 'aparato:<disp>').texto` = el `auth.users.id` del dueño; `n` no se usa). El primer miembro que usa el aparato lo registra a su
-- nombre; desde ahí:
--   · un folio NUEVO de ese aparato solo lo crea su dueño (`solicitar` y `subida_unica`); las filas que ya existen siguen con su regla de siempre (`creado_por`);
--   · el contador del aparato y su bitácora solo los sube su dueño: un lote con el aparato de otra persona se rechaza entero;
--   · Dirección no queda bloqueada (sube lo de cualquiera, como ya era), pero también registra a su nombre el aparato que usa por primera vez;
--   · una entrada del historial nace `autorizada` SOLO si hay un sello `vigente` de ese folio (y queda ligada a él); si no, nace `retirada`
--     (sin solicitud viva). El sello local del teléfono se sigue guardando en `procedencia.sello_local`.
-- Los aparatos inferidos (`HIST` + md5, entradas viejas sin `disp`) no son teléfonos reales y no se registran.
--
-- Al aplicarse, registra el dueño de los aparatos que ya tienen cotizaciones de UNA sola persona; los que tienen de varias quedan sin dueño (los
-- reclama el primero que los vuelva a usar). Si un teléfono cambia de manos, el dueño se corrige a mano en ese renglón de `contadores` (no hay pantalla para eso).
--
-- Depende de: 0001 (`contadores`), 0002 (preámbulo) y 0008 (las dos RPC que se reemplazan). Idempotente: CREATE OR REPLACE y ON CONFLICT.
-- =====================================================================================================================================================


-- ---- el dueño del aparato -------------------------------------------------------------------------------------------------------------------------------
-- ¿El aparato `p_disp` es de quien llama? Si no tiene dueño, queda registrado a su nombre (atómico: dos llamadas a la vez no lo registran a dos personas).
-- Dirección siempre puede (no se le bloquea), pero el aparato sigue siendo de quien lo registró. Un dueño ya registrado no se pisa nunca.
create or replace function interno.aparato_propio(c interno.contexto_t, p_disp text) returns boolean
language plpgsql set search_path = '' as $$
declare v_dueno text;
begin
  if p_disp is null or p_disp !~ '^[A-Za-z0-9_-]{1,24}$' or c.usuario_id is null then return false; end if;
  insert into public.contadores as ct (empresa_id, clave, ventana, n, texto) values (c.empresa_id, 'aparato:' || p_disp, '', 0, c.usuario_id::text)
  on conflict (empresa_id, clave, ventana) do nothing;
  select ct.texto into v_dueno from public.contadores ct where ct.empresa_id = c.empresa_id and ct.clave = 'aparato:' || p_disp and ct.ventana = '';
  return v_dueno = c.usuario_id::text or c.area = 'direccion';
end $$;
revoke all on function interno.aparato_propio(interno.contexto_t, text) from public, anon, authenticated, service_role;

-- Los aparatos que ya tienen cotizaciones de una sola persona quedan a su nombre (no se pisa un dueño ya registrado).
insert into public.contadores (empresa_id, clave, ventana, n, texto)
select x.empresa_id, 'aparato:' || x.disp, '', 0, min(x.creado_por::text)
  from public.cotizaciones x
 where x.creado_por is not null and x.disp ~ '^[A-Za-z0-9_-]{1,24}$' and x.disp !~ '^HIST[0-9a-f]{6}$'
 group by x.empresa_id, x.disp
having count(distinct x.creado_por) = 1
on conflict (empresa_id, clave, ventana) do nothing;


-- ---- solicitar: un folio nuevo solo lo crea el dueño del aparato ---------------------------------------------------------------------------------------
-- solicitar: pide que Dirección autorice el precio de una cotización. Se crea PRIMERO la cotización (solicitudes tiene FK a cotizaciones: al revés, la
-- primera petición de un folio fallaría). NO recalcula el catálogo aquí: el CATALOGO_DESINCRONIZADO lo da la Edge Function `autorizar`.
--   p_op = { folio_global (con @aparato OBLIGATORIO), cotizacion:{proyecto, cliente, iva, subtotal, items[]}, entrada?:{…historial…}, nota?, huella? }
create or replace function public.solicitar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; c interno.contexto_t; v_fg text; v_cot jsonb; co public.cotizaciones; pend public.solicitudes; v_corr text; v_entrada jsonb; v_datos jsonb; v_huella text; v_nota text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La solicitud está mal formada.'); end if;
  v_fg := p_op ->> 'folio_global';
  if v_fg is null or v_fg !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then
    return interno.err('DATO_INVALIDO', 'El folio de la cotización necesita su aparato (COT-0042-B@K7QM).'); end if;
  v_cot := interno.limpiar_cotizacion(p_op -> 'cotizacion');
  if v_cot ? 'error' then return interno.err('DATO_INVALIDO', v_cot ->> 'error'); end if;
  v_entrada := p_op -> 'entrada';
  if v_entrada is not null and pg_catalog.jsonb_typeof(v_entrada) <> 'null' then
    if pg_catalog.jsonb_typeof(v_entrada) <> 'object' or pg_catalog.length(v_entrada::text) > 200000 then
      return interno.err('DATO_INVALIDO', 'La entrada del historial no es válida o es demasiado grande.'); end if;
    v_entrada := interno.datos_cotizacion(v_entrada);
  else v_entrada := null; end if;
  v_huella := coalesce(p_op ->> 'huella', '');
  if pg_catalog.length(v_huella) > 100000 then return interno.err('DATO_INVALIDO', 'La huella es demasiado larga.'); end if;
  v_nota := pg_catalog.left(coalesce(p_op ->> 'nota', ''), 500);
  v_corr := coalesce(interno.correo_verificado(), '');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':sol:' || v_fg, 0));
  select * into co from public.cotizaciones x where x.empresa_id = c.empresa_id and x.folio_global = v_fg for update;
  if found and c.area <> 'direccion' and co.creado_por is distinct from c.usuario_id then
    return interno.err('ROL_SIN_PERMISO', 'Ese folio es de otra persona.'); end if;
  if co.folio_global is null and not interno.aparato_propio(c, pg_catalog.split_part(v_fg, '@', 2)) then      -- 0013: no se aparta el folio de otro teléfono
    return interno.err('ROL_SIN_PERMISO', 'Ese folio es de un teléfono registrado a otra persona.'); end if;
  select * into pend from public.solicitudes x where x.empresa_id = c.empresa_id and x.folio_global = v_fg and x.estado = 'pendiente' for update;
  if found and pend.solicito_id is distinct from c.usuario_id and c.area <> 'direccion' then
    return interno.err('ROL_SIN_PERMISO', 'Ese folio ya tiene una solicitud pendiente de otra persona. Espera a que Dirección la resuelva, o pídele que la cancele.'); end if;
  -- la cotización PRIMERO (la solicitud tiene FK a ella)
  v_datos := coalesce(v_entrada, pg_catalog.jsonb_build_object('proy', v_cot ->> 'proyecto', 'cliente', v_cot ->> 'cliente', 'iva', v_cot -> 'iva',
                                                                 'subtotal', v_cot -> 'subtotal', 'items', v_cot -> 'items'));
  if co.folio_global is null then
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos)
    values (c.empresa_id, v_fg, pg_catalog.split_part(v_fg, '@', 1), pg_catalog.split_part(v_fg, '@', 2), c.usuario_id, 'pendiente', v_datos);
  else      -- un re-pedido sobre una `autorizada` NO cambia su estado: el sello vigente sigue valiendo hasta que se reautorice o se revoque
    update public.cotizaciones set datos = coalesce(v_entrada, datos), estado = case when estado = 'autorizada' then estado else 'pendiente' end
     where empresa_id = c.empresa_id and folio_global = v_fg;
  end if;
  if pend.id is not null then      -- re-pedir sobrescribe la MISMA fila
    update public.solicitudes set ts = now(), proyecto = v_cot ->> 'proyecto', cliente = v_cot ->> 'cliente', subtotal = (v_cot ->> 'subtotal')::numeric,
                                  iva = (v_cot ->> 'iva')::boolean, huella = v_huella, cotizacion = v_cot, nota = v_nota
     where id = pend.id;
  else
    insert into public.solicitudes (empresa_id, folio_global, proyecto, cliente, subtotal, iva, huella, cotizacion, solicito_id, solicito_texto, estado, nota)
    values (c.empresa_id, v_fg, v_cot ->> 'proyecto', v_cot ->> 'cliente', (v_cot ->> 'subtotal')::numeric, (v_cot ->> 'iva')::boolean, v_huella, v_cot,
            c.usuario_id, v_corr, 'pendiente', v_nota);
  end if;
  perform interno.anotar(c, 'dinero', 'solicito', 'cotizacion', v_fg, 'Se pidió autorización de ' || pg_catalog.left(coalesce(v_cot ->> 'proyecto', ''), 100));
  return pg_catalog.jsonb_build_object('ok', true, 'estado', 'pendiente');
end $$;
revoke all on function public.solicitar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.solicitar(jsonb, text) to authenticated;


-- ---- subida_unica: el lote es del dueño del aparato; una entrada nace autorizada solo con sello vigente ------------------------------------------
-- La PUERTA DE SALIDA de los datos que solo existen en un teléfono (`al3d_historial`, `al3d_queue`, hitos, cuadernos, bitácora local, el folio máximo del
-- aparato). Sin esta subida, con acuse POR REGISTRO, el borrado local por revocación no puede habilitarse. Cualquier miembro sube lo SUYO; Fabricación escribe
-- y nunca lee de vuelta. La unión es por `(folio, disp)` y no por «folio cotizacion» a secas; los conflictos NO se resuelven aquí (la subida no decide): quedan
-- en `procedencia` y en el acuse. Idempotente: por `folio_global` en las cotizaciones y por `op_id` (`tel:<disp>:<id>`) en la bitácora.
--   p_lote = { disp, folio_max, cotizaciones:[≤50], cola:[≤50], hitos:{<folio>:{pdf,wa,venta}}, canva:{<folio>:{primera,ultima,veces}}, cuadernos:{<clave>:nota},
--              bitacora:[≤200] }
-- Devuelve {ok, acuse:[{tipo: cotizacion|cola|cuaderno|bitacora, id, estado: creada|ya_estaba|conflicto|rechazada, motivo?}], resumen:{creadas, ya_estaban, conflictos, rechazadas}}.
create or replace function public.subida_unica(p_lote jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_disp text; v_acuse jsonb := '[]'::jsonb; e jsonb; q jsonb; b jsonb; k text; v jsonb; v_max bigint := 0; v_n bigint; v_disp_e text; v_fg text; co public.cotizaciones;
  v_datos jsonb; v_inferido boolean; v_creadas int := 0; v_ya int := 0; v_conf int := 0; v_rech int := 0; v_cot jsonb; v_corr text := coalesce(interno.correo_verificado(), '');
  v_nivel text; v_ts timestamptz; v_ent text; v_cnt int; v_folio text; v_motivo text; v_idb text; v_nota text; v_hitos jsonb; v_aut_id bigint;
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
    if not interno.aparato_propio(c, v_disp) then      -- 0013: ni el contador, ni la cola, ni la bitácora de un teléfono ajeno
      return interno.err('ROL_SIN_PERMISO', 'Ese teléfono está registrado a otra persona: su historial solo lo sube ella (o Dirección).'); end if;
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
    if co.folio_global is null and not v_inferido and not interno.aparato_propio(c, v_disp_e) then      -- 0013: no se aparta el folio de otro teléfono
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'rechazada', 'motivo', 'ROL_SIN_PERMISO')); v_rech := v_rech + 1;
    elsif co.folio_global is null then
      -- 0013: `autorizada` SOLO con un sello vigente en `autorizaciones` (y ligada a él); el sello local del teléfono no es evidencia
      v_aut_id := null;
      select a.id into v_aut_id from public.autorizaciones a where a.empresa_id = c.empresa_id and a.folio_global = v_fg and a.estado = 'vigente';
      insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, autorizacion_id, datos, hitos, procedencia)
      values (c.empresa_id, v_fg, v_folio, v_disp_e, c.usuario_id, case when v_aut_id is not null then 'autorizada' else 'retirada' end, v_aut_id, v_datos,
              coalesce(v_hitos -> v_folio, '{}'::jsonb) || case when pg_catalog.jsonb_typeof(p_lote -> 'canva' -> v_folio) = 'object'
                                                               then pg_catalog.jsonb_build_object('propuesta', p_lote -> 'canva' -> v_folio) else '{}'::jsonb end,
              pg_catalog.jsonb_build_object('telefonos', case when v_disp is null then '[]'::jsonb else pg_catalog.jsonb_build_array(v_disp) end,
                                            'sello_local', e -> 'sello', 'disp_inferido', v_inferido, 'subida_unica', now()));
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'creada')); v_creadas := v_creadas + 1;
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
    v_ts := now();
    begin
      if pg_catalog.jsonb_typeof(b -> 'ts') = 'number' and (b ->> 'ts')::numeric > 0 then v_ts := pg_catalog.to_timestamp(((b ->> 'ts')::numeric) / 1000.0);
      elsif pg_catalog.jsonb_typeof(b -> 'ts') = 'string' then v_ts := (b ->> 'ts')::timestamptz; end if;
    exception when others then v_ts := now(); end;
    insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues, usuario_id, usuario_texto, rol, dispositivo, op_id, procedencia)
    values (c.empresa_id, v_ts, v_nivel, coalesce(nullif(pg_catalog.left(b ->> 'accion', 80), ''), 'subida'), v_ent, pg_catalog.left(coalesce(b ->> 'entidad_id', ''), 200),
            pg_catalog.left(coalesce(nullif(pg_catalog.btrim(b ->> 'titulo'), ''), 'Evento de un teléfono'), 200), pg_catalog.left(coalesce(b ->> 'detalle', ''), 600),
            case when pg_catalog.jsonb_typeof(b -> 'antes') in ('object', 'array') then b -> 'antes' end, case when pg_catalog.jsonb_typeof(b -> 'despues') in ('object', 'array') then b -> 'despues' end,
            c.usuario_id, pg_catalog.left(coalesce(b ->> 'usuario', ''), 200), pg_catalog.left(coalesce(b ->> 'rol', ''), 40), v_disp, 'tel:' || v_disp || ':' || v_idb,
            pg_catalog.jsonb_build_object('subida_unica', true, 'sello', b -> 'sello'))
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
