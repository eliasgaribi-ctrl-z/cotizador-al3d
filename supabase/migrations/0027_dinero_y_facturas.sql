-- =====================================================================================================
-- 0027_dinero_y_facturas.sql — EL DINERO DISPONIBLE, LOS CLIENTES FISCALES Y LAS DOS FACTURAS DE CADA VENTA FISCAL
-- =====================================================================================================
-- Lo pidió Elías el 2026-10-25, con la empresa ya en modo 'base' (docs/DINERO-Y-FACTURAS.md):
--   «En el control se debe de ver cuál es el dinero que tengo disponible y que por ende se vaya restando de los gastos que hago. De la
--    cuenta de ConstruImagen, cuando depositan, yo no tengo acceso a ese dinero… También necesito que los pagos que se hacen a las cuentas
--    fiscales, como Tanit, ConstruImagen y Mónica, tengan un apartado para ver la constancia de situación fiscal y dos checkbox: la factura
--    por el anticipo y la factura por la liquidación del proyecto.»
-- Y lo que decidió: solo «Elias BBVA» cuenta como dinero disponible (Dirección lo puede cambiar); solo resta un gasto pagado DESDE una cuenta
-- disponible; la constancia es del CLIENTE (por RFC), no del proyecto; la ven y la suben Dirección y Pagos, y marcan las dos casillas.
-- Fabricación no ve nada de esto, nunca.
--
-- LO QUE HAY AQUÍ (la aritmética del dinero por cuenta NO: se calcula en el teléfono con lo que ya baja, js/datos/dinero-cuentas.js)
--   · `ajustes_dinero`: un renglón por empresa con las CUENTAS DISPONIBLES (las que son dinero de AL3D). Nace con ['Elias BBVA']. Por qué
--     no `constantes` (0005), que era lo primero que se pensó: guarda NÚMEROS, la leen los tres roles (Fabricación también) y
--     `constante_guardar` la escriben Dirección y Fabricación. Una lista de cuentas que solo Dirección cambia y solo ven quienes ven el
--     dinero no cabe ahí sin abrir una de esas tres puertas. Tampoco una columna en `empresas`: esa tabla la leen los tres roles entera.
--   · `clientes_fiscales`: un renglón por RFC (por empresa), con su razón social y la constancia de situación fiscal (CSF): la ruta del
--     archivo en el bucket PRIVADO `constancias-fiscales` (supabase/opcional/constancias.sql), su tipo, su peso y quién y cuándo la subió.
--     Un cliente con varias ventas enseña la MISMA constancia.
--   · `ventas_fiscales`: un renglón por venta de una cuenta fiscal que alguien tocó: a qué RFC se factura (uno por venta) y las dos
--     casillas, «Factura del anticipo» y «Factura de la liquidación», cada una con quién y cuándo. Aparte de `ventas_dinero` a propósito:
--     la copia de cada 3 horas (scripts/importador/sql.mjs) escribe `ventas_dinero` con lo de la hoja y esta tabla no la conoce, así que
--     nunca la pisa; y la RLS es la suya.
--   · Las cuentas FISCALES (las que facturan): 'Constru BNT' (ConstruImagen), 'Tatis BNT' (Tanit) y 'Moni MPago' (Mónica). 'Rul HSBC' y
--     'Elias BBVA' no. Es una lista fija (`interno.cuentas_fiscales()`): cambiarla es otra migración, como la lista de las cinco cuentas.
--
-- LAS CINCO RPC DE CLIENTE (todas SECURITY DEFINER con el preámbulo de siempre: contrato → contexto → área, antes de leer una fila):
--   · `cuentas_disponibles_guardar(p_op)`: SOLO Dirección. La lista de cuentas disponibles (una o más de las cinco, sin repetir, en el
--     orden de siempre). Lo mismo que ya está es «sin cambio» y no anota.
--   · `cliente_fiscal_guardar(p_op)`: Dirección y Pagos. Da de alta un RFC o le corrige la razón social.
--   · `venta_cliente_fiscal(p_op)`: Dirección y Pagos. Liga una venta FISCAL a un RFC (si el RFC no existe y trae la razón social, lo da de
--     alta en el mismo viaje) o la desliga (rfc vacío). Una venta de una cuenta que no factura no se liga.
--   · `venta_factura_marcar(p_op)`: Dirección y Pagos. Marca o desmarca una de las dos casillas. Marcar, solo en una venta fiscal; desmarcar,
--     siempre (para deshacer un error, aunque la venta haya cambiado de cuenta). La pantalla pregunta antes de desmarcar.
--   · `constancia_registrar(p_op)`: Dirección y Pagos. Después de subir el archivo a Storage, el teléfono dice cuál es la constancia del RFC.
--     La ruta tiene que ser <empresa>/<RFC>/csf-<id>.<pdf|jpg|png|webp> y su extensión la del tipo. Reemplazar es subir otra: la de antes se
--     queda en el bucket (evidencia; la borra Dirección desde el panel si estorba).
--     NO comprueba que el archivo exista en `storage.objects`: el dueño de la función (postgres) no necesariamente ve esa tabla en Supabase
--     (su RLS es para `authenticated`) y una comprobación que en producción siempre dijera «no está» rompería la subida. La política de
--     SUBIR del bucket ya exige un cliente fiscal de esa empresa en esa carpeta; lo peor que deja una ruta registrada sin archivo es una
--     constancia que no abre, y la pantalla lo dice.
--   Las cinco son IDEMPOTENTES por `op_id`: el id de la operación (uno por toque) se guarda en la línea de la bitácora con la respuesta
--   (`cuentas:`, `cliente:`, `fiscal:`, `factura:`, `csf:`), y el reintento de una respuesta que se perdió contesta lo mismo. Y además los
--   valores son ABSOLUTOS: mandar dos veces lo mismo no escribe otra línea («sin cambio»).
--
-- LA BITÁCORA. Una línea de nivel DINERO por lo que sí se escribió (Dirección y Pagos la ven; Fabricación no), dentro de la misma transacción.
--   La tabla aprende la entidad `cliente` (el RFC). El CHECK se vuelve a poner aquí y en 0025 (que lo pone con `gasto`), con `cliente` en los
--   dos: volver a correr 0025 sobre una base con líneas de clientes no debe abortar.
--
-- QUIÉN LEE. Las tres tablas: Dirección y Pagos de esa empresa (RLS); Fabricación tiene el GRANT de siempre y cero filas. Nadie escribe directo
--   (authenticated solo SELECT); service_role SELECT/INSERT/UPDATE para el respaldo, sin DELETE; `sin_borrar` en las tres. Sin estadísticas en
--   las columnas de texto y fecha (M-6 de 0012), como las demás tablas de dinero.
--
-- REALTIME: NO. La pantalla de facturas lee la base al abrir, al volver, después de cada toque y cuando el enchufe avisa que cambió el dinero
--   (`ventas_dinero`, que sí está publicada). Así la lista cerrada de la auditoría sigue en 14 y ninguna auditoría de antes tiene que admitir
--   tablas nuevas publicadas.
--
-- LA COPIA DE CADA 3 HORAS no toca nada de esto: escribe proyectos, ventas_dinero, abonos… con su lista de columnas (scripts/importador/sql.mjs)
--   y nunca nombra estas tablas; con la empresa en 'base' ni siquiera aplica. Un proyecto no se borra (`sin_borrar`), así que la llave de
--   `ventas_fiscales` a `proyectos` no estorba a nadie; la purga de 0016 solo borra LÁPIDAS (sin folio_hoja), que no tienen fila aquí.
--
-- LAS AUDITORÍAS DE ANTES. Las cinco funciones entran a la lista cerrada de cliente de TODAS las versiones de `interno.auditoria()` (0011, 0019,
--   0022, 0023, 0024, 0025, 0026 y esta), como hicieron 0024 y 0025: volver a correr un archivo anterior no debe abortar. La de Realtime no cambia.
--
-- Depende de: 0001…0026. Idempotente. Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La bitácora aprende la entidad `cliente`
-- -----------------------------------------------------------------------------------------------------
alter table public.bitacora drop constraint if exists bitacora_entidad_check;
alter table public.bitacora add constraint bitacora_entidad_check
  check (entidad in ('proyecto','instalacion','material','constante','almacen','cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema','gasto','cliente'));


-- -----------------------------------------------------------------------------------------------------
-- 2. Ayudantes (solo los llaman las RPC: nadie más tiene EXECUTE)
-- -----------------------------------------------------------------------------------------------------

-- Las cuentas que FACTURAN. La copia de esta lista vive en js/datos/dinero-cuentas.js (`CUENTAS_FISCALES`); pruebas/dinero-cuentas.mjs las compara.
create or replace function interno.cuentas_fiscales() returns text[] language sql immutable set search_path = '' as $$
  select array['Constru BNT', 'Moni MPago', 'Tatis BNT']::text[] $$;
revoke all on function interno.cuentas_fiscales() from public, anon, authenticated, service_role;

-- Un RFC como se guarda: en mayúsculas (la ñ también: la colación de la base puede no saberlo) y sin espacios, guiones ni puntos. NULL si no
-- trae nada. Es lo mismo que `rfcLimpio` del teléfono.
create or replace function interno.rfc_limpio(p text) returns text language sql immutable set search_path = '' as $$
  select nullif(pg_catalog.replace(pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p, ''), '[[:space:]./-]', '', 'g')), 'ñ', 'Ñ'), '') $$;
revoke all on function interno.rfc_limpio(text) from public, anon, authenticated, service_role;

-- Qué tiene de malo un RFC ya limpio, en una frase; NULL si sirve. La forma del SAT: 3 letras (persona moral) o 4 (física), la fecha
-- AAMMDD que exista y la homoclave (dos letras o números y el dígito verificador, número o A). El dígito verificador no se recalcula:
-- se pide la forma, no se audita al SAT. Los dos genéricos (público en general y extranjero) no son un cliente con constancia.
-- La misma regla que `rfcProblema` del teléfono.
create or replace function interno.rfc_problema(p text) returns text language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  if p is null or p = '' then return 'Falta el RFC.'; end if;
  if p !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]$' then
    return 'Ese RFC no tiene la forma del SAT: 3 o 4 letras, la fecha (AAMMDD) y la homoclave de 3, sin espacios (por ejemplo ABC010203XY1).';
  end if;
  if p in ('XAXX010101000', 'XEXX010101000') then
    return 'Ese es el RFC genérico (público en general o extranjero): no es un cliente con constancia de situación fiscal.';
  end if;
  m := pg_catalog.regexp_match(p, '^[A-ZÑ&]{3,4}([0-9]{2})([0-9]{2})([0-9]{2})');
  begin
    perform pg_catalog.make_date(2000 + m[1]::int, m[2]::int, m[3]::int);
  exception when others then
    return 'La fecha de ese RFC no existe (las seis cifras son AAMMDD).';
  end;
  return null;
end $$;
revoke all on function interno.rfc_problema(text) from public, anon, authenticated, service_role;

-- La venta (proyecto con folio, vivo) de la empresa del contexto, con su cuenta de cobro. NULL si no existe ahí.
create or replace function interno.venta_para_fiscal(p_ctx interno.contexto_t, p_proyecto text)
returns table (proyecto_id text, folio_hoja text, nombre text, cuenta text, anticipo numeric, liquidacion numeric)
language sql stable set search_path = '' as $$
  select p.id, p.folio_hoja, p.nombre, d.cuenta, d.anticipo, d.liquidacion
    from public.proyectos p
    join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id and d.deleted_at is null
   where p.empresa_id = p_ctx.empresa_id and p.id = p_proyecto and p.deleted_at is null and p.folio_hoja is not null $$;
revoke all on function interno.venta_para_fiscal(interno.contexto_t, text) from public, anon, authenticated, service_role;

-- El id de la operación (`op_id`), limpio, o el error que se devuelve tal cual. Lo comparten las cinco RPC.
create or replace function interno.op_fiscal(p_op jsonb, out op text, out e jsonb) language plpgsql immutable set search_path = '' as $$
begin
  if p_op is null or pg_catalog.jsonb_typeof(p_op) <> 'object' then e := interno.err('DATO_INVALIDO', 'La operación está mal formada.'); return; end if;
  op := nullif(pg_catalog.btrim(coalesce(p_op ->> 'op_id', '')), '');
  if pg_catalog.length(op) > 100 then e := interno.err('DATO_INVALIDO', 'El id de la operación es demasiado largo.'); end if;
end $$;
revoke all on function interno.op_fiscal(jsonb) from public, anon, authenticated, service_role;

-- La respuesta guardada de una operación que ya se hizo (el reintento de una respuesta que se perdió), o NULL.
create or replace function interno.op_ya_hecha(p_ctx interno.contexto_t, p_op_id text) returns jsonb language sql stable set search_path = '' as $$
  select b.resultado from public.bitacora b where b.empresa_id = p_ctx.empresa_id and b.op_id = p_op_id and p_op_id is not null $$;
revoke all on function interno.op_ya_hecha(interno.contexto_t, text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. ajustes_dinero: qué cuentas son dinero DISPONIBLE (de AL3D)
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.ajustes_dinero (
  empresa_id          text primary key references public.empresas (id),
  -- una o más de las cinco cuentas (las de `ventas_dinero.cuenta`), sin repetir: el teléfono resta de aquí los gastos que salieron de ellas
  cuentas_disponibles text[] not null default array['Elias BBVA']::text[]
                      check (pg_catalog.cardinality(cuentas_disponibles) between 1 and 5
                             and cuentas_disponibles <@ array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']::text[]),
  actualizado_por     text not null default '' check (pg_catalog.length(actualizado_por) <= 200),
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.clock_timestamp()
);

drop trigger if exists ajustes_dinero_tocar      on public.ajustes_dinero;
drop trigger if exists ajustes_dinero_sin_borrar on public.ajustes_dinero;
create trigger ajustes_dinero_tocar      before insert or update on public.ajustes_dinero for each row execute function interno.tocar();
create trigger ajustes_dinero_sin_borrar before delete          on public.ajustes_dinero for each row execute function interno.sin_borrar();

alter table public.ajustes_dinero enable row level security;
revoke all on public.ajustes_dinero from public, anon, authenticated, service_role;
grant select on public.ajustes_dinero to authenticated;
grant select, insert, update on public.ajustes_dinero to service_role;

drop policy if exists ajustes_dinero_sel_dinero on public.ajustes_dinero;
create policy ajustes_dinero_sel_dinero on public.ajustes_dinero for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

-- Cada empresa que ya existe nace con lo que decidió Elías: solo Elias BBVA. Una empresa nueva no trae renglón y el teléfono y la RPC
-- entienden lo mismo (`DISPONIBLES_POR_OMISION`). Volver a correr esto no cambia lo que Dirección ya eligió.
insert into public.ajustes_dinero (empresa_id) select e.id from public.empresas e on conflict (empresa_id) do nothing;


-- -----------------------------------------------------------------------------------------------------
-- 4. clientes_fiscales: el RFC, su razón social y su constancia
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.clientes_fiscales (
  empresa_id     text not null references public.empresas (id),
  rfc            text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]$'),
  razon_social   text not null check (pg_catalog.length(pg_catalog.btrim(razon_social)) between 1 and 300),
  -- la constancia: <empresa>/<RFC>/csf-<id>.<ext> en el bucket privado `constancias-fiscales` (opcional/constancias.sql)
  csf_ruta       text check (csf_ruta is null or (pg_catalog.length(csf_ruta) <= 300
                                                  and pg_catalog.split_part(csf_ruta, '/', 1) = empresa_id
                                                  and pg_catalog.split_part(csf_ruta, '/', 2) = rfc
                                                  and pg_catalog.split_part(csf_ruta, '/', 3) ~ '^csf-[A-Za-z0-9-]{8,64}\.(pdf|jpg|png|webp)$'
                                                  and pg_catalog.split_part(csf_ruta, '/', 4) = '')),
  csf_tipo       text check (csf_tipo is null or csf_tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  csf_bytes      integer check (csf_bytes is null or csf_bytes between 1 and 5242880),
  csf_subida_en  timestamptz,
  csf_subio      text not null default '' check (pg_catalog.length(csf_subio) <= 200),
  creado_por     text not null default '' check (pg_catalog.length(creado_por) <= 200),
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (empresa_id, rfc),
  -- la ruta, el tipo y el cuándo van juntos: o hay constancia o no hay
  constraint clientes_fiscales_csf check ((csf_ruta is null) = (csf_tipo is null) and (csf_ruta is null) = (csf_subida_en is null))
);

drop trigger if exists clientes_fiscales_tocar      on public.clientes_fiscales;
drop trigger if exists clientes_fiscales_sin_borrar on public.clientes_fiscales;
create trigger clientes_fiscales_tocar      before insert or update on public.clientes_fiscales for each row execute function interno.tocar();
create trigger clientes_fiscales_sin_borrar before delete          on public.clientes_fiscales for each row execute function interno.sin_borrar();

alter table public.clientes_fiscales enable row level security;
revoke all on public.clientes_fiscales from public, anon, authenticated, service_role;
grant select on public.clientes_fiscales to authenticated;
grant select, insert, update on public.clientes_fiscales to service_role;

drop policy if exists clientes_fiscales_sel_dinero on public.clientes_fiscales;
create policy clientes_fiscales_sel_dinero on public.clientes_fiscales for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));


-- -----------------------------------------------------------------------------------------------------
-- 5. ventas_fiscales: a qué RFC se factura cada venta fiscal y sus dos casillas
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.ventas_fiscales (
  proyecto_id              text primary key,
  empresa_id               text not null,
  rfc                      text,                                    -- NULL: todavía sin cliente fiscal (o se le quitó)
  factura_anticipo         boolean not null default false,
  factura_anticipo_por     text not null default '' check (pg_catalog.length(factura_anticipo_por) <= 200),
  factura_anticipo_en      timestamptz,
  factura_liquidacion      boolean not null default false,
  factura_liquidacion_por  text not null default '' check (pg_catalog.length(factura_liquidacion_por) <= 200),
  factura_liquidacion_en   timestamptz,
  created_at               timestamptz not null default pg_catalog.now(),
  updated_at               timestamptz not null default pg_catalog.clock_timestamp(),
  -- la venta y el cliente son de la MISMA empresa que el renglón (las dos llaves llevan `empresa_id`)
  constraint ventas_fiscales_venta   foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  constraint ventas_fiscales_cliente foreign key (empresa_id, rfc) references public.clientes_fiscales (empresa_id, rfc),
  -- quién y cuándo solo existen con la casilla marcada
  constraint ventas_fiscales_anticipo    check (factura_anticipo    = (factura_anticipo_en    is not null) and (factura_anticipo    or factura_anticipo_por    = '')),
  constraint ventas_fiscales_liquidacion check (factura_liquidacion = (factura_liquidacion_en is not null) and (factura_liquidacion or factura_liquidacion_por = ''))
);
create index if not exists ventas_fiscales_por_rfc on public.ventas_fiscales (empresa_id, rfc) where rfc is not null;

drop trigger if exists ventas_fiscales_tocar      on public.ventas_fiscales;
drop trigger if exists ventas_fiscales_sin_borrar on public.ventas_fiscales;
create trigger ventas_fiscales_tocar      before insert or update on public.ventas_fiscales for each row execute function interno.tocar();
create trigger ventas_fiscales_sin_borrar before delete          on public.ventas_fiscales for each row execute function interno.sin_borrar();

alter table public.ventas_fiscales enable row level security;
revoke all on public.ventas_fiscales from public, anon, authenticated, service_role;
grant select on public.ventas_fiscales to authenticated;
grant select, insert, update on public.ventas_fiscales to service_role;

drop policy if exists ventas_fiscales_sel_dinero on public.ventas_fiscales;
create policy ventas_fiscales_sel_dinero on public.ventas_fiscales for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

-- M-6 (0012): sin estadísticas en las columnas de texto y fecha de las tres, como las demás tablas de dinero.
do $$ declare r record; begin
  for r in select c.relname, a.attname
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('ajustes_dinero', 'clientes_fiscales', 'ventas_fiscales')
              and a.attnum > 0 and not a.attisdropped and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype, 'date'::regtype, 'text[]'::regtype) loop
    execute format('alter table public.%I alter column %I set statistics 0', r.relname, r.attname);
  end loop;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 6. Las cinco RPC de cliente
-- -----------------------------------------------------------------------------------------------------

-- p_op = { op_id, cuentas: ['Elias BBVA', …] }                                                            SOLO Dirección
create or replace function public.cuentas_disponibles_guardar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; o record; r jsonb; v_todas text[] := array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']::text[];
        v_lista text[]; v_antes text[]; v_quien text := coalesce(interno.correo_verificado(), ''); v_resp jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  select * into o from interno.op_fiscal(p_op);
  if o.e is not null then return o.e; end if;
  r := interno.op_ya_hecha(pre.c, 'cuentas:' || o.op);
  if r is not null then return r; end if;
  if pg_catalog.jsonb_typeof(p_op -> 'cuentas') is distinct from 'array' then
    return interno.err('DATO_INVALIDO', 'La lista de cuentas está mal formada.'); end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_op -> 'cuentas') x
              where pg_catalog.jsonb_typeof(x) <> 'string' or (x #>> '{}') <> all (v_todas)) then
    return interno.err('DATO_INVALIDO', 'Una de esas cuentas no es de la empresa.'); end if;
  -- en el orden de siempre y sin repetir, la diga el teléfono como la diga
  v_lista := array(select c from pg_catalog.unnest(v_todas) with ordinality as u(c, i)
                    where c in (select pg_catalog.jsonb_array_elements_text(p_op -> 'cuentas')) order by i);
  if pg_catalog.cardinality(v_lista) = 0 then
    return interno.err('DATO_INVALIDO', 'Elige al menos una cuenta: sin ninguna, no habría dinero disponible que enseñar.'); end if;
  select a.cuentas_disponibles into v_antes from public.ajustes_dinero a where a.empresa_id = (pre.c).empresa_id for update;
  v_antes := coalesce(v_antes, array['Elias BBVA']::text[]);
  if v_antes = v_lista then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true, 'cuentas', pg_catalog.to_jsonb(v_lista)); end if;
  insert into public.ajustes_dinero as a (empresa_id, cuentas_disponibles, actualizado_por)
  values ((pre.c).empresa_id, v_lista, pg_catalog.left(v_quien, 200))
  on conflict (empresa_id) do update set cuentas_disponibles = excluded.cuentas_disponibles, actualizado_por = excluded.actualizado_por;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'cuentas', pg_catalog.to_jsonb(v_lista));
  perform interno.anotar(pre.c, 'dinero', 'cambio', 'plataforma', 'cuentas_disponibles',
                         'Dinero disponible: ' || pg_catalog.array_to_string(v_lista, ', '),
                         'Antes: ' || pg_catalog.array_to_string(v_antes, ', '),
                         pg_catalog.jsonb_build_object('cuentas', pg_catalog.to_jsonb(v_antes)), pg_catalog.jsonb_build_object('cuentas', pg_catalog.to_jsonb(v_lista)),
                         'cuentas:' || o.op, v_resp);
  return v_resp;
end $$;
revoke all on function public.cuentas_disponibles_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cuentas_disponibles_guardar(jsonb, text) to authenticated;

-- El alta o el cambio de razón social de un RFC, sin op_id ni preámbulo (lo llaman las dos RPC de abajo, ya con el suyo). Devuelve
-- {rfc, razon_social, creado|cambiado|sin_cambio} o un error.
create or replace function interno.cliente_fiscal_poner(p_ctx interno.contexto_t, p_rfc text, p_razon text, p_op_id text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_rfc text := interno.rfc_limpio(p_rfc); v_mal text; v_razon text; c public.clientes_fiscales; v_quien text := coalesce(interno.correo_verificado(), '');
        v_resp jsonb;
begin
  v_mal := interno.rfc_problema(v_rfc);
  if v_mal is not null then return interno.err('DATO_INVALIDO', v_mal); end if;
  v_razon := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_razon, '')), '[[:space:]]+', ' ', 'g');
  if v_razon = '' then return interno.err('DATO_INVALIDO', 'Falta la razón social, como viene en la constancia.'); end if;
  if pg_catalog.length(v_razon) > 300 then return interno.err('DATO_INVALIDO', 'La razón social es demasiado larga (300 letras a lo más).'); end if;
  select * into c from public.clientes_fiscales x where x.empresa_id = p_ctx.empresa_id and x.rfc = v_rfc for update;
  if found then
    if c.razon_social = v_razon then return pg_catalog.jsonb_build_object('ok', true, 'rfc', v_rfc, 'razon_social', v_razon, 'sin_cambio', true); end if;
    update public.clientes_fiscales set razon_social = v_razon where empresa_id = p_ctx.empresa_id and rfc = v_rfc;
    v_resp := pg_catalog.jsonb_build_object('ok', true, 'rfc', v_rfc, 'razon_social', v_razon, 'cambiado', true);
    perform interno.anotar(p_ctx, 'dinero', 'cambio', 'cliente', v_rfc, 'Razón social de ' || v_rfc || ': ' || v_razon, 'Antes: ' || c.razon_social,
                           pg_catalog.jsonb_build_object('razon_social', c.razon_social), pg_catalog.jsonb_build_object('razon_social', v_razon), p_op_id, v_resp);
    return v_resp;
  end if;
  insert into public.clientes_fiscales (empresa_id, rfc, razon_social, creado_por) values (p_ctx.empresa_id, v_rfc, v_razon, pg_catalog.left(v_quien, 200));
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'rfc', v_rfc, 'razon_social', v_razon, 'creado', true);
  perform interno.anotar(p_ctx, 'dinero', 'alta', 'cliente', v_rfc, 'Cliente fiscal ' || v_rfc || ': ' || v_razon, '',
                         null, pg_catalog.jsonb_build_object('rfc', v_rfc, 'razon_social', v_razon), p_op_id, v_resp);
  return v_resp;
end $$;
revoke all on function interno.cliente_fiscal_poner(interno.contexto_t, text, text, text) from public, anon, authenticated, service_role;

-- p_op = { op_id, rfc, razon_social }                                                                       Dirección y Pagos
create or replace function public.cliente_fiscal_guardar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; o record; r jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  select * into o from interno.op_fiscal(p_op);
  if o.e is not null then return o.e; end if;
  r := interno.op_ya_hecha(pre.c, 'cliente:' || o.op);
  if r is not null then return r; end if;
  return interno.cliente_fiscal_poner(pre.c, p_op ->> 'rfc', p_op ->> 'razon_social', 'cliente:' || o.op);
end $$;
revoke all on function public.cliente_fiscal_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cliente_fiscal_guardar(jsonb, text) to authenticated;

-- p_op = { op_id, proyecto_id, rfc ('' o null: quitarle el cliente), razon_social? (para dar de alta un RFC nuevo en el mismo viaje) }
--                                                                                                            Dirección y Pagos
create or replace function public.venta_cliente_fiscal(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; o record; r jsonb; v record; vf public.ventas_fiscales; v_rfc text; v_mal text; v_cli jsonb; v_razon text; v_resp jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  select * into o from interno.op_fiscal(p_op);
  if o.e is not null then return o.e; end if;
  r := interno.op_ya_hecha(pre.c, 'fiscal:' || o.op);
  if r is not null then return r; end if;
  select * into v from interno.venta_para_fiscal(pre.c, p_op ->> 'proyecto_id');
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no está en la base.'); end if;
  select * into vf from public.ventas_fiscales x where x.proyecto_id = v.proyecto_id for update;
  v_rfc := interno.rfc_limpio(p_op ->> 'rfc');

  if v_rfc is null then
    -- quitarle el cliente: siempre se puede (también si la venta ya no es de una cuenta fiscal)
    if vf.rfc is null then return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'rfc', null, 'sin_cambio', true); end if;
    update public.ventas_fiscales set rfc = null where proyecto_id = v.proyecto_id;
    v_resp := pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'rfc', null);
    perform interno.anotar(pre.c, 'dinero', 'cambio', 'venta', v.proyecto_id, 'Se quitó el cliente fiscal de ' || v.folio_hoja,
                           'Era ' || vf.rfc, pg_catalog.jsonb_build_object('rfc', vf.rfc), pg_catalog.jsonb_build_object('rfc', null), 'fiscal:' || o.op, v_resp);
    return v_resp;
  end if;

  v_mal := interno.rfc_problema(v_rfc);
  if v_mal is not null then return interno.err('DATO_INVALIDO', v_mal); end if;
  if v.cuenta is null or v.cuenta <> all (interno.cuentas_fiscales()) then
    return interno.err('DATO_INVALIDO', v.folio_hoja || case when v.cuenta is null then ' no tiene cuenta de cobro: ' else ' cobra en «' || v.cuenta || '», que no factura: ' end
                                        || 'solo las ventas de una cuenta fiscal llevan cliente fiscal.');
  end if;
  select x.razon_social into v_razon from public.clientes_fiscales x where x.empresa_id = (pre.c).empresa_id and x.rfc = v_rfc;
  if v_razon is null then
    -- un RFC nuevo: se da de alta con su razón social en el mismo viaje (su línea va sin op_id: la de la venta lleva el de la operación)
    if pg_catalog.btrim(coalesce(p_op ->> 'razon_social', '')) = '' then
      return interno.err('DATO_INVALIDO', 'Ese RFC todavía no está dado de alta: escribe también la razón social, como viene en la constancia.');
    end if;
    v_cli := interno.cliente_fiscal_poner(pre.c, v_rfc, p_op ->> 'razon_social', null);
    if not (v_cli ->> 'ok')::boolean then return v_cli; end if;
    v_razon := v_cli ->> 'razon_social';
  end if;
  if vf.rfc is not distinct from v_rfc then
    return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'rfc', v_rfc, 'razon_social', v_razon, 'sin_cambio', true);
  end if;
  insert into public.ventas_fiscales as x (proyecto_id, empresa_id, rfc) values (v.proyecto_id, (pre.c).empresa_id, v_rfc)
  on conflict (proyecto_id) do update set rfc = excluded.rfc;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'rfc', v_rfc, 'razon_social', v_razon,
                                          'cliente_creado', v_cli is not null);
  perform interno.anotar(pre.c, 'dinero', 'cambio', 'venta', v.proyecto_id, 'Cliente fiscal de ' || v.folio_hoja || ': ' || v_rfc,
                         v_razon || ' · ' || v.cuenta || case when vf.rfc is not null then ' · antes ' || vf.rfc else '' end,
                         pg_catalog.jsonb_build_object('rfc', vf.rfc), pg_catalog.jsonb_build_object('rfc', v_rfc), 'fiscal:' || o.op, v_resp);
  return v_resp;
end $$;
revoke all on function public.venta_cliente_fiscal(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.venta_cliente_fiscal(jsonb, text) to authenticated;

-- p_op = { op_id, proyecto_id, cual: 'anticipo' | 'liquidacion', marcada: true | false }                   Dirección y Pagos
create or replace function public.venta_factura_marcar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; o record; r jsonb; v record; vf public.ventas_fiscales; v_cual text; v_marcada boolean; v_antes boolean;
        v_quien text := pg_catalog.left(coalesce(interno.correo_verificado(), ''), 200); v_ahora timestamptz := pg_catalog.now(); v_resp jsonb; v_nombre text;
        v_rfc text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  select * into o from interno.op_fiscal(p_op);
  if o.e is not null then return o.e; end if;
  r := interno.op_ya_hecha(pre.c, 'factura:' || o.op);
  if r is not null then return r; end if;
  v_cual := p_op ->> 'cual';
  if v_cual is null or v_cual not in ('anticipo', 'liquidacion') then
    return interno.err('DATO_INVALIDO', 'La casilla es la de la factura del anticipo o la de la liquidación.'); end if;
  if pg_catalog.jsonb_typeof(p_op -> 'marcada') is distinct from 'boolean' then
    return interno.err('DATO_INVALIDO', 'Falta decir si la factura se marca o se desmarca.'); end if;
  v_marcada := (p_op -> 'marcada') = 'true'::jsonb;
  select * into v from interno.venta_para_fiscal(pre.c, p_op ->> 'proyecto_id');
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no está en la base.'); end if;
  if v_marcada and (v.cuenta is null or v.cuenta <> all (interno.cuentas_fiscales())) then
    return interno.err('DATO_INVALIDO', v.folio_hoja || case when v.cuenta is null then ' no tiene cuenta de cobro: ' else ' cobra en «' || v.cuenta || '», que no factura: ' end
                                        || 'las casillas de factura son de las ventas de una cuenta fiscal.');
  end if;
  select * into vf from public.ventas_fiscales x where x.proyecto_id = v.proyecto_id for update;
  v_antes := coalesce(case v_cual when 'anticipo' then vf.factura_anticipo else vf.factura_liquidacion end, false);
  if v_antes = v_marcada then
    return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'cual', v_cual, 'marcada', v_marcada, 'sin_cambio', true);
  end if;
  if v_cual = 'anticipo' then
    insert into public.ventas_fiscales as x (proyecto_id, empresa_id, factura_anticipo, factura_anticipo_por, factura_anticipo_en)
    values (v.proyecto_id, (pre.c).empresa_id, v_marcada, case when v_marcada then v_quien else '' end, case when v_marcada then v_ahora end)
    on conflict (proyecto_id) do update set factura_anticipo = excluded.factura_anticipo, factura_anticipo_por = excluded.factura_anticipo_por,
                                            factura_anticipo_en = excluded.factura_anticipo_en;
  else
    insert into public.ventas_fiscales as x (proyecto_id, empresa_id, factura_liquidacion, factura_liquidacion_por, factura_liquidacion_en)
    values (v.proyecto_id, (pre.c).empresa_id, v_marcada, case when v_marcada then v_quien else '' end, case when v_marcada then v_ahora end)
    on conflict (proyecto_id) do update set factura_liquidacion = excluded.factura_liquidacion, factura_liquidacion_por = excluded.factura_liquidacion_por,
                                            factura_liquidacion_en = excluded.factura_liquidacion_en;
  end if;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v.proyecto_id, 'cual', v_cual, 'marcada', v_marcada,
                                          'por', case when v_marcada then v_quien else '' end, 'en', case when v_marcada then v_ahora end);
  v_nombre := case v_cual when 'anticipo' then 'la factura del anticipo' else 'la factura de la liquidación' end;
  select x.rfc into v_rfc from public.ventas_fiscales x where x.proyecto_id = v.proyecto_id;
  perform interno.anotar(pre.c, 'dinero', case when v_marcada then 'factura' else 'desmarco' end, 'venta', v.proyecto_id,
                         case when v_marcada then 'Se hizo ' else 'Se desmarcó ' end || v_nombre || ' de ' || v.folio_hoja,
                         (case v_cual when 'anticipo' then 'Anticipo ' || interno.pesos(v.anticipo) else 'Liquidación ' || interno.pesos(v.liquidacion) end)
                           || ' · ' || coalesce(v.cuenta, 'sin cuenta') || case when v_rfc is not null then ' · ' || v_rfc else '' end,
                         pg_catalog.jsonb_build_object('factura_' || v_cual, v_antes), pg_catalog.jsonb_build_object('factura_' || v_cual, v_marcada),
                         'factura:' || o.op, v_resp);
  return v_resp;
end $$;
revoke all on function public.venta_factura_marcar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.venta_factura_marcar(jsonb, text) to authenticated;

-- p_op = { op_id, rfc, ruta, tipo, bytes }                                                                  Dirección y Pagos
-- El archivo ya está en el bucket (lo subió el teléfono con la política de opcional/constancias.sql); esto dice que ES la constancia del RFC.
create or replace function public.constancia_registrar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; o record; r jsonb; v_rfc text; v_mal text; c public.clientes_fiscales; v_ruta text; v_tipo text; v_ext text; v_bytes numeric;
        v_quien text := pg_catalog.left(coalesce(interno.correo_verificado(), ''), 200); v_ahora timestamptz := pg_catalog.now(); v_resp jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  select * into o from interno.op_fiscal(p_op);
  if o.e is not null then return o.e; end if;
  r := interno.op_ya_hecha(pre.c, 'csf:' || o.op);
  if r is not null then return r; end if;
  v_rfc := interno.rfc_limpio(p_op ->> 'rfc');
  v_mal := interno.rfc_problema(v_rfc);
  if v_mal is not null then return interno.err('DATO_INVALIDO', v_mal); end if;
  select * into c from public.clientes_fiscales x where x.empresa_id = (pre.c).empresa_id and x.rfc = v_rfc for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Ese RFC no está dado de alta como cliente fiscal.'); end if;
  v_tipo := p_op ->> 'tipo';
  v_ext := case v_tipo when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null then return interno.err('DATO_INVALIDO', 'La constancia va en PDF o en foto (JPG, PNG o WebP).'); end if;
  v_ruta := coalesce(p_op ->> 'ruta', '');
  if pg_catalog.split_part(v_ruta, '/', 1) <> (pre.c).empresa_id or pg_catalog.split_part(v_ruta, '/', 2) <> v_rfc
     or pg_catalog.split_part(v_ruta, '/', 3) !~ ('^csf-[A-Za-z0-9-]{8,64}\.' || v_ext || '$') or pg_catalog.split_part(v_ruta, '/', 4) <> '' then
    return interno.err('DATO_INVALIDO', 'La ruta de la constancia no es la de ese RFC.');
  end if;
  v_bytes := interno.num(p_op -> 'bytes');
  if v_bytes is null or v_bytes <> pg_catalog.trunc(v_bytes) or v_bytes < 1 or v_bytes > 5242880 then
    return interno.err('DATO_INVALIDO', 'La constancia pesa de más (5 MB a lo más) o no dice cuánto pesa.'); end if;
  if c.csf_ruta = v_ruta then
    return pg_catalog.jsonb_build_object('ok', true, 'rfc', v_rfc, 'ruta', v_ruta, 'sin_cambio', true);
  end if;
  update public.clientes_fiscales set csf_ruta = v_ruta, csf_tipo = v_tipo, csf_bytes = v_bytes::int, csf_subida_en = v_ahora, csf_subio = v_quien
   where empresa_id = (pre.c).empresa_id and rfc = v_rfc;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'rfc', v_rfc, 'ruta', v_ruta, 'tipo', v_tipo, 'bytes', v_bytes::int, 'subida_en', v_ahora,
                                          'reemplaza', c.csf_ruta is not null);
  perform interno.anotar(pre.c, 'dinero', case when c.csf_ruta is null then 'subio' else 'cambio' end, 'cliente', v_rfc,
                         'Constancia de situación fiscal de ' || v_rfc || case when c.csf_ruta is null then '' else ' (otra)' end,
                         c.razon_social || ' · ' || v_ext || case when c.csf_subida_en is not null
                                                                  then ' · reemplaza la del ' || pg_catalog.to_char(c.csf_subida_en at time zone 'America/Mexico_City', 'DD/MM/YYYY') else '' end,
                         pg_catalog.jsonb_build_object('csf_ruta', c.csf_ruta), pg_catalog.jsonb_build_object('csf_ruta', v_ruta), 'csf:' || o.op, v_resp);
  return v_resp;
end $$;
revoke all on function public.constancia_registrar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.constancia_registrar(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 7. La auditoría, con las cinco RPC en la lista cerrada de cliente (Realtime no cambia: 14)
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  c_cliente     constant text[] := array['agente_decidir','almacen_aplicar','alta_venta','cancelar_solicitud','cliente_fiscal_guardar','comisiones_cobradas','constancia_registrar','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','cuentas_disponibles_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','gasto_anular','gasto_registrar','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','modo_cambiar','mover_etapa','pantalla_aprobar','pantalla_revocar','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','tarifas_guardar','tarifas_leer','venta_cliente_fiscal','venta_factura_marcar','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['agente_abrir','agente_guardar','agente_leer','autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','pantalla_solicitar','pantalla_tablero','registrar_autorizacion','tarifas_de','verificar_cupo'];
  c_int_cliente constant text[] := array['comision','empresas_donde','hoy_mx','neto'];
  c_int_servicio constant text[] := array['comision','contiene_dinero','empresas_donde','hoy_mx','neto','sellos_validos'];
  c_vistas_cli  constant text[] := array['comisiones_pendientes','ventas_calculadas'];
  -- 0025: `gastos` entra a Realtime con sus dos RPC. Desde aquí se EXIGE publicada (las auditorías de antes solo la admiten).
  -- 0027: cinco funciones de cliente nuevas y tres tablas que NO van a Realtime: la lista de publicadas es la de 0025.
  c_publicadas  constant text[] := array['abonos','almacen_costos','almacen_movimientos','bitacora','constantes','cotizaciones','gastos','instalaciones','materiales','miembros','proyectos',
                                         'requerimientos','solicitudes','ventas_dinero'];
  v text[] := '{}'; r record; t text;
begin
  -- ---- GR-03: toda tabla de `public` con RLS; `contadores` sin NINGUNA política (denegado por defecto) ---------------------------------------------
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1 loop
    v := v || format('GR-03 la tabla public.%I no tiene RLS encendida', r.relname);
  end loop;
  for r in select p.polname, c.relname from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'contadores' order by 1 loop
    v := v || format('GR-03 public.contadores no debe tener políticas y tiene «%s»', r.polname);
  end loop;

  -- ---- GR-01 y GR-07: funciones de `public` e `interno` ---------------------------------------------------------------------------------------------
  for r in select n.nspname, p.proname, p.oid, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'interno') and p.prokind in ('f', 'p')
              and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
              -- Las funciones de DISPARADOR DE EVENTO no son una puerta: Postgres las rechaza si alguien intenta llamarlas como RPC
              -- («trigger functions can only be called as triggers»). Con «RLS automático» encendido en el proyecto, Supabase instala una
              -- así en `public` (`rls_auto_enable`); lo descubrió la primera corrida de esta auditoría contra el proyecto real de pruebas
              -- (2026-10-10), que abortó por ella. Solo se exime el tipo `event_trigger`: una función `trigger` nuestra sí se audita.
              and p.prorettype <> 'pg_catalog.event_trigger'::regtype
            order by 1, 2, 4 loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      v := v || format('GR-01 la función %s.%s(%s) es ejecutable por anon/PUBLIC (falta su REVOKE)', r.nspname, r.proname, r.args);
    end if;
    if r.prosecdef and not coalesce(r.proconfig, '{}') @> array['search_path=""'] then
      v := v || format('GR-07 la función SECURITY DEFINER %s.%s(%s) no fija search_path = ''''', r.nspname, r.proname, r.args);
    end if;
    -- ---- GR-02: qué ejecuta cada rol en `public` ----------------------------------------------------------------------------------------------
    if r.nspname = 'public' then
      if r.proname = any (c_cliente) then
        if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de cliente public.%s(%s) no es ejecutable por authenticated (falta su GRANT)', r.proname, r.args);
        end if;
      elsif r.proname = any (c_servicio) then
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) es ejecutable por authenticated: solo service_role la llama', r.proname, r.args);
        end if;
        if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) no es ejecutable por service_role (falta su GRANT)', r.proname, r.args);
        end if;
      else
        v := v || format('GR-02 la función public.%s(%s) no está en las listas cerradas (RPC de cliente o de servicio): decide a quién pertenece y agrégala', r.proname, r.args);
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la función public.%s(%s) es ejecutable por authenticated y no es una RPC de cliente', r.proname, r.args);
        end if;
      end if;
    else
      -- ---- GR-08: el esquema `interno` ------------------------------------------------------------------------------------------------------
      if has_function_privilege('authenticated', r.oid, 'EXECUTE') and not r.proname = any (c_int_cliente) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por authenticated y no es de las cuatro que usan las políticas', r.proname, r.args);
      end if;
      if has_function_privilege('service_role', r.oid, 'EXECUTE') and not r.proname = any (c_int_servicio) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por service_role y no es de las seis permitidas', r.proname, r.args);
      end if;
      if r.proname = any (c_int_cliente) and not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
        v := v || format('GR-08 interno.%s(%s) debe ser ejecutable por authenticated: la evalúan las políticas y la vista', r.proname, r.args);
      end if;
    end if;
  end loop;
  if has_schema_privilege('anon', 'interno', 'USAGE') or has_schema_privilege('anon', 'interno', 'CREATE') then
    v := v || 'GR-08 anon tiene privilegios sobre el esquema interno'::text;
  end if;
  foreach t in array array['authenticated', 'service_role'] loop
    if not has_schema_privilege(t, 'interno', 'USAGE') then v := v || format('GR-08 %s no tiene USAGE sobre el esquema interno (las políticas y las vistas no corren)', t); end if;
    if has_schema_privilege(t, 'interno', 'CREATE') then v := v || format('GR-08 %s puede CREAR objetos en el esquema interno', t); end if;
  end loop;
  foreach t in array array['anon', 'authenticated'] loop
    if has_schema_privilege(t, 'public', 'CREATE') then v := v || format('GR-06 %s puede CREAR objetos en el esquema public', t); end if;
  end loop;

  -- ---- GR-04: toda vista con security_invoker (si no, corre con los privilegios de su dueño y SALTA la RLS); nada materializado en `public` -------------
  for r in select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1 loop
    if r.relkind = 'm' then
      v := v || format('GR-04 public.%I es una vista MATERIALIZADA: PostgREST la expondría sin RLS', r.relname);
    elsif not coalesce(r.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1'] then
      v := v || format('GR-04 la vista public.%I no tiene security_invoker = true: saltaría la RLS de sus tablas', r.relname);
    end if;
  end loop;

  -- ---- GR-05: Realtime = lista cerrada, y ninguna con la fila vieja completa ------------------------------------------------------------------------
  for r in select pt.tablename from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' order by 1 loop
    if not r.tablename = any (c_publicadas) then v := v || format('GR-05 public.%I está publicada en supabase_realtime y no es de las 14 de la lista cerrada', r.tablename); end if;
  end loop;
  foreach t in array c_publicadas loop
    if not exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = t) then
      v := v || format('GR-05 public.%I debe estar publicada en supabase_realtime', t);
    end if;
  end loop;
  for r in select c.relname, c.relreplident from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relreplident <> 'd'
              and exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname) order by 1 loop
    v := v || format('GR-05 public.%I está publicada con replica identity «%s» (full/index): un DELETE llevaría la fila vieja a quien no la puede leer', r.relname, r.relreplident);
  end loop;

  -- ---- GR-06: privilegios sobre tablas, vistas y secuencias de `public` -----------------------------------------------------------------------------
  --   anon: NADA. authenticated: solo SELECT, y en tablas solo donde hay política; en vistas, solo las dos de fórmulas. service_role: sin DELETE ni TRUNCATE.
  for r in select c.oid, c.relname, c.relkind, exists (select 1 from pg_policy p where p.polrelid = c.oid) as con_politica
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') order by 2 loop
    if has_table_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or has_any_column_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, REFERENCES') then
      v := v || format('GR-06 anon tiene privilegios sobre public.%I (debe tener ninguno)', r.relname);
    end if;
    if has_any_column_privilege('authenticated', r.oid, 'INSERT') then v := v || format('GR-06 authenticated puede INSERTAR en public.%I: se escribe solo por RPC', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'UPDATE') then v := v || format('GR-06 authenticated puede ACTUALIZAR public.%I: se escribe solo por RPC', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'DELETE') then v := v || format('GR-06 authenticated puede BORRAR en public.%I', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'TRUNCATE, REFERENCES, TRIGGER') then v := v || format('GR-06 authenticated tiene TRUNCATE/REFERENCES/TRIGGER sobre public.%I', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'SELECT') then
      if r.relkind in ('r', 'p') and not r.con_politica then
        v := v || format('GR-06 authenticated puede leer public.%I y la tabla no tiene ninguna política (la RLS la deja cerrada: el GRANT sobra)', r.relname);
      elsif r.relkind in ('v', 'm', 'f') and not r.relname = any (c_vistas_cli) then
        v := v || format('GR-06 authenticated puede leer la vista public.%I y no es de las dos de fórmulas', r.relname);
      end if;
    elsif r.relkind in ('v') and r.relname = any (c_vistas_cli) then
      v := v || format('GR-06 authenticated debe poder leer la vista public.%I (la usa el teléfono)', r.relname);
    end if;
    if has_table_privilege('service_role', r.oid, 'DELETE, TRUNCATE') then
      v := v || format('GR-06 service_role puede BORRAR en public.%I: nada de negocio se borra (BYPASSRLS salta la RLS, no los privilegios, y este no se le da)', r.relname);
    end if;
  end loop;
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind = 'S' order by 2 loop
    if has_sequence_privilege('anon', r.oid, 'USAGE, SELECT, UPDATE') or has_sequence_privilege('authenticated', r.oid, 'USAGE, SELECT, UPDATE') then
      v := v || format('GR-06 anon o authenticated tienen privilegios sobre la secuencia %I', r.relname);
    end if;
  end loop;

  -- ---- GR-09: nada de negocio se borra: toda tabla de `public` (salvo `contadores`, que limpia sus ventanas vencidas, y `pantallas` (0022), que borra
  --      los CÓDIGOS de vinculación que vencieron hace más de un día: una TV que pidió código y nadie aprobó no es negocio) lleva su trigger `sin_borrar` ----
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in ('contadores', 'pantallas')
              and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgenabled <> 'D' and g.tgfoid = 'interno.sin_borrar()'::regprocedure)
            order by 1 loop
    v := v || format('GR-09 la tabla public.%I no tiene su trigger sin_borrar (o está desactivado)', r.relname);
  end loop;

  return v;
end $$;
-- Solo la lee quien administra (el dueño y los superusuarios): ningún rol de la aplicación la ejecuta (GR-08).
revoke all on function interno.auditoria() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0027): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
