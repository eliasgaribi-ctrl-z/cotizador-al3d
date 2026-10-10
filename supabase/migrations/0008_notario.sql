-- =====================================================================================================
-- 0008_notario.sql — cotizaciones, solicitudes, sellos de autorización y la subida única (R7)
-- =====================================================================================================
-- Qué deja:
--   · `autorizaciones`: N sellos por folio, evidencia FIRMADA que `/verificar` recalcula (los textos firmados, VERBATIM e inmutables);
--   · `cotizaciones` (copia de trabajo, llave `folio_global`), `solicitudes` (la cola solicitud → resolución) y `cuaderno_notas`;
--   · las RPC de cliente `cotizacion_guardar`, `solicitar`, `cancelar_solicitud`, `rechazar_solicitud`, `revocar_autorizacion`,
--     `estado_solicitudes`, `cuaderno_guardar` y `subida_unica`;
--   · las dos RPC de SERVICIO (solo `service_role`, las llaman las Edge Functions `autorizar` y `verificar`): `registrar_autorizacion`
--     y `autorizacion_para_verificar`.
--
-- Depende de: 0002 (preámbulo, `anotar`) y 0003 (`limpiar_cotizacion`, y las tablas de obra a las que `cotizaciones` se parece).
--
-- LA CLAVE DEL SELLO NO EXISTE EN LA BASE. Ni como columna, ni como función, ni en el Vault. La firma (HMAC-SHA256) la calcula la Edge Function
-- con el único módulo `supabase/functions/_shared/sello.js` y la base solo GUARDA lo firmado: textos tal cual (`text`, nunca `jsonb`,
-- `timestamptz` ni `numeric`: un «2026-10-01T04:30:15.123Z» que volviera como «2026-10-01 04:30:15.123+00» sería otra firma) y rechaza cualquier
-- UPDATE que los toque. Un PDF ya impreso no se reimprime: si cambia un solo byte de lo firmado, todos los que hay en la calle dicen «No auténtica».
--
-- CODIFICACIÓN. Se comprobó en Apps Script real (2026-10-10) que `Utilities.computeHmacSha256Signature(String, String)` vuelve texto y clave
-- bytes como US-ASCII con un «?» por cada carácter no ASCII (no UTF-8). Por eso los sellos NUEVOS se firman igual (`ascii-?`, el valor por
-- omisión de `autorizaciones.codificacion` y de `registrar_autorizacion`): el verificador viejo del Apps Script los sigue aceptando si hay que
-- retroceder. Cada fila recuerda con cuál se firmó (el CHECK admite también `utf-8`, que es más fuerte y convendrá cuando ya no haga falta retroceder).
--
-- Quién ve qué (R1 > Q-02): Dirección todas las cotizaciones, solicitudes y autorizaciones; Pagos solo las SUYAS (cotizaciones y solicitudes; su sello
-- le llega por `estado_solicitudes`, no por la tabla); Fabricación NINGUNA (puede PEDIR autorización y ver el estado SIN importes).
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. autorizaciones: N sellos por folio, evidencia firmada
-- -----------------------------------------------------------------------------------------------------
-- Una fila por fila de la hoja «Autorizaciones» (17 columnas, oculta): N por folio (`vigente` / `superada` / `revocada`). Los diez campos que entran a
-- la firma están en `text` VERBATIM; los tres importes se guardan en su forma firmada `NNNN.NN` y sus `numeric` son columnas GENERADAS a partir de ese
-- texto (única fuente de verdad). `clave_id` es solo una etiqueta para una rotación futura (hoy un único `k1`).
create table if not exists public.autorizaciones (
  id              bigint generated always as identity primary key,
  empresa_id      text not null references public.empresas (id),

  -- FIRMADO: canon = 'AL3D-AUTH-v1'|'AL3D-AUTH-v2' || JSON.stringify([#1..#9 (,#10)])  (.gs:3635-3646)
  folio_global    text not null check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),   -- #1  B «Folio» (COT-0042-B@K7QM)
  huella          text not null,                                                                    -- #2  J «Huella»
  sub_calc_txt    text not null check (sub_calc_txt    ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #3  E «Subtotal calculado»      dinero2()
  precio_auth_txt text not null check (precio_auth_txt ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #4  F «Precio autorizado (neto)» dinero2() ('0.00' = sin ajuste)
  items_auth      text not null default '',                                                         -- #5  I «Ajustes por partida» 'id:1500.00,id2:300.00' o ''
  total_txt       text not null check (total_txt       ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #6  G «Total»                   dinero2()
  proyecto        text not null,                                                                    -- #7  C «Proyecto» (negocio; ya recortado a 140)
  autorizo        text not null check (autorizo <> '' and autorizo = lower(autorizo)),              -- #8  K «Autorizó» (correo, minúsculas)
  ts_iso          text not null check (ts_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'),  -- #9 A «Cuándo (ISO)»
  renglones       text not null default '',                                                         -- #10 Q «Renglones» (JSON como TEXTO; '' = sello v1)

  -- NO firmado (cambiarlo no rompe la firma)
  cliente         text not null default '',                                                         -- D (privado)
  ajuste_pct      numeric,                                                                          -- H «Ajuste %» (informativo)
  solicito        text not null default '',                                                         -- L «Solicitó» (correo, o 'token de pagos' en los históricos)
  codigo          text not null check (codigo ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),          -- M «Código»
  firma           text not null check (firma ~ '^[0-9a-f]{64}$'),                                   -- N «Firma»
  estado          text not null check (estado in ('vigente','superada','revocada')),               -- O «Estado» (lo único que cambia)
  nota            text not null default '' check (length(nota) <= 500),                             -- P «Nota»

  -- derivados del texto firmado (lectura y reportes; jamás se firma desde ellos)
  sub_calc        numeric generated always as (sub_calc_txt::numeric)    stored,
  precio_auth     numeric generated always as (precio_auth_txt::numeric) stored,
  total           numeric generated always as (total_txt::numeric)       stored,
  formato         text    generated always as (case when renglones <> '' then 'v2' else 'v1' end) stored,

  -- trazabilidad
  clave_id        text not null default 'k1',
  codificacion    text not null default 'ascii-?' check (codificacion in ('utf-8','ascii-?')),     -- cómo se vuelven bytes el texto y la clave al firmar (sello.js); los sellos nuevos, como el Apps Script real
  origen          text not null default 'plataforma' check (origen in ('plataforma','importada_hoja')),
  fila_hoja       integer,
  usuario_id      uuid,                                                                             -- quien autorizó (NULL en las importadas)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),

  constraint autorizaciones_codigo_es_firma check (replace(codigo, '-', '') = upper(left(firma, 12)))
);
create unique index if not exists autorizaciones_una_vigente on public.autorizaciones (empresa_id, folio_global) where estado = 'vigente';   -- invariante del candado de hoy
create index        if not exists autorizaciones_folio      on public.autorizaciones (empresa_id, folio_global, id desc);
create index        if not exists autorizaciones_verificar  on public.autorizaciones (upper(split_part(folio_global, '@', 1)), codigo);       -- folio corto + código

-- Todo lo firmado y lo informativo es inmutable; solo cambia `estado` (y `nota`, únicamente junto con el cambio de estado). Una autorización
-- `superada` o `revocada` es terminal: no se resucita (reautorizar un folio crea una `vigente` NUEVA).
create or replace function interno.autorizaciones_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.empresa_id, new.folio_global, new.huella, new.sub_calc_txt, new.precio_auth_txt, new.items_auth,
      new.total_txt, new.proyecto, new.autorizo, new.ts_iso, new.renglones, new.cliente, new.ajuste_pct, new.solicito,
      new.codigo, new.firma, new.clave_id, new.codificacion, new.origen, new.fila_hoja, new.usuario_id, new.created_at)
     is distinct from
     (old.id, old.empresa_id, old.folio_global, old.huella, old.sub_calc_txt, old.precio_auth_txt, old.items_auth,
      old.total_txt, old.proyecto, old.autorizo, old.ts_iso, old.renglones, old.cliente, old.ajuste_pct, old.solicito,
      old.codigo, old.firma, old.clave_id, old.codificacion, old.origen, old.fila_hoja, old.usuario_id, old.created_at)
  then raise exception 'Una autorizacion firmada no se edita' using errcode = 'P0001'; end if;
  if old.estado <> 'vigente' and new.estado is distinct from old.estado then
    raise exception 'Una autorizacion % es terminal', old.estado using errcode = 'P0001'; end if;
  if new.estado = 'vigente' and old.estado <> 'vigente' then
    raise exception 'Una autorizacion no se resucita' using errcode = 'P0001'; end if;
  if new.nota is distinct from old.nota and new.estado is not distinct from old.estado then
    raise exception 'La nota solo cambia al revocar' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function interno.autorizaciones_inmutable() from public, anon, authenticated, service_role;

drop trigger if exists autorizaciones_tocar      on public.autorizaciones;
drop trigger if exists autorizaciones_sin_borrar on public.autorizaciones;
drop trigger if exists autorizaciones_inmutable  on public.autorizaciones;
create trigger autorizaciones_tocar      before insert or update on public.autorizaciones for each row execute function interno.tocar();
create trigger autorizaciones_sin_borrar before delete          on public.autorizaciones for each row execute function interno.sin_borrar();
create trigger autorizaciones_inmutable  before update          on public.autorizaciones for each row execute function interno.autorizaciones_inmutable();

alter table public.autorizaciones enable row level security;
revoke all on public.autorizaciones from public, anon, authenticated, service_role;
grant select on public.autorizaciones to authenticated;
grant select, insert, update on public.autorizaciones to service_role;

-- Solo Dirección la lee (lleva importes). A Pagos le llega SU sello por `estado_solicitudes()` (una proyección), y a Fabricación ni eso con importes.
drop policy if exists autorizaciones_sel_direccion on public.autorizaciones;
create policy autorizaciones_sel_direccion on public.autorizaciones for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));


-- -----------------------------------------------------------------------------------------------------
-- 2. cotizaciones: la copia de trabajo, llave `folio_global`
-- -----------------------------------------------------------------------------------------------------
-- La entrada del historial del cotizador (`al3d_historial`, 31 campos) y las pendientes de `al3d_queue`, POR `(empresa, folio_global)`: el folio corto
-- se repite entre teléfonos, el global (`COT-0042-B@K7QM`) no. La entrada se guarda ENTERA en `datos` (sin `aiFile.url` ni data URLs: las imágenes van a
-- Storage); cuatro columnas (`proy`, `cliente`, `tel`, `huella_auth`) se derivan de ella para no divergir. El registro FIRMABLE vive en `autorizaciones`.
create table if not exists public.cotizaciones (
  empresa_id      text not null references public.empresas (id),
  folio_global    text not null check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),
  folio           text not null,                          -- impreso (COT-0042-B)
  disp            text not null,                          -- aparato que la emitió (entradas sin `disp`: 'HIST'+hash)
  creado_por      uuid,                                   -- autor (auth.users.id): base del RLS «autor + Dirección» (Q-02)
  estado          text not null check (estado in ('pendiente','autorizada','rechazada','retirada')),
  datos           jsonb not null check (jsonb_typeof(datos) = 'object'),    -- la entrada del historial (o el renglón `q` de la cola)
  proy            text generated always as (coalesce(datos ->> 'proy', ''))       stored,     -- NEGOCIO (no la persona)
  cliente         text generated always as (coalesce(datos ->> 'cliente', ''))    stored,     -- PERSONA
  tel             text generated always as (coalesce(datos ->> 'tel', ''))        stored,
  huella_auth     text generated always as (datos ->> 'huellaAuth')               stored,     -- '' = autorización suelta; NULL = anterior a la huella
  hitos           jsonb not null default '{}'::jsonb,     -- {pdf:ms, wa:ms, venta:ms, propuesta:{primera,ultima,veces}}  (al3d_hitos + al3d_canva)
  autorizacion_id bigint references public.autorizaciones (id),             -- la vigente (NULL mientras no haya sello)
  revocada_en     timestamptz,                            -- la revocación NO existe en el cliente; aquí sí
  procedencia     jsonb not null default '{}'::jsonb,     -- {telefonos:[disp…], sello_local:{…}, disp_inferido:bool, subida_unica:ts}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  deleted_at      timestamptz,
  primary key (empresa_id, folio_global),
  constraint cotizaciones_folio_global check (folio_global = folio || '@' || disp)
);
create index if not exists cotizaciones_autor on public.cotizaciones (empresa_id, creado_por) where deleted_at is null;
create index if not exists cotizaciones_sync  on public.cotizaciones (empresa_id, updated_at, folio_global);

drop trigger if exists cotizaciones_tocar      on public.cotizaciones;
drop trigger if exists cotizaciones_sin_borrar on public.cotizaciones;
create trigger cotizaciones_tocar      before insert or update on public.cotizaciones for each row execute function interno.tocar();
create trigger cotizaciones_sin_borrar before delete          on public.cotizaciones for each row execute function interno.sin_borrar();

alter table public.cotizaciones enable row level security;
revoke all on public.cotizaciones from public, anon, authenticated, service_role;
grant select on public.cotizaciones to authenticated;
grant select, insert, update on public.cotizaciones to service_role;

-- Dirección, todas; Pagos, solo las suyas (`creado_por`); Fabricación, NINGUNA (R1 > Q-02: lleva precios).
drop policy if exists cotizaciones_sel_direccion   on public.cotizaciones;
drop policy if exists cotizaciones_sel_autor_pagos on public.cotizaciones;
create policy cotizaciones_sel_direccion   on public.cotizaciones for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy cotizaciones_sel_autor_pagos on public.cotizaciones for select to authenticated
  using (creado_por = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.cotizaciones replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cotizaciones') then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 3. solicitudes: la cola solicitud → resolución
-- -----------------------------------------------------------------------------------------------------
-- «Solicitudes de autorización» (13 columnas): cola operativa, NO evidencia (no está firmada). Una fila por petición; a lo sumo UNA `pendiente` por folio
-- (re-pedir sobrescribe la misma fila).
create table if not exists public.solicitudes (
  id               bigint generated always as identity primary key,
  empresa_id       text not null,
  folio_global     text not null,
  ts               timestamptz not null default now(),                  -- A «Cuándo» (se sobrescribe al re-pedir)
  proyecto         text not null default '',                            -- C
  cliente          text not null default '',                            -- D
  subtotal         numeric not null default 0,                          -- E: el que DECLARÓ el cliente (se verifica al autorizar)
  iva              boolean not null default true,                       -- F
  huella           text not null default '',                            -- G (la declarada; la firmada la recalcula la Edge Function)
  cotizacion       jsonb not null check (jsonb_typeof(cotizacion) = 'object'),  -- H: `limpiar_cotizacion` {proyecto,cliente,iva,subtotal,items[≤80]}
  solicito_id      uuid,                                                -- identidad = persona (auth.uid()), no «token de <rol>»
  solicito_texto   text not null default '',                            -- I «Solicitó»: correo; en las importadas puede ser 'token de pagos'
  estado           text not null check (estado in ('pendiente','autorizada','rechazada','cancelada')),   -- J
  resolvio_id      uuid,                                                -- K
  resolvio_texto   text not null default '',
  ts_resolvio      timestamptz,                                         -- L
  nota             text not null default '' check (length(nota) <= 500),-- M
  autorizacion_id  bigint references public.autorizaciones (id),        -- el sello que resolvió esta solicitud (reemplaza el cotejo por fechas de `selloDeLaSolicitud`)
  procedencia      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default clock_timestamp(),
  foreign key (empresa_id, folio_global) references public.cotizaciones (empresa_id, folio_global)
);
create unique index if not exists solicitudes_una_pendiente on public.solicitudes (empresa_id, folio_global) where estado = 'pendiente';
create index        if not exists solicitudes_folio         on public.solicitudes (empresa_id, folio_global, id desc);
create index        if not exists solicitudes_autor         on public.solicitudes (empresa_id, solicito_id);
create index        if not exists solicitudes_sync          on public.solicitudes (empresa_id, updated_at, id);

drop trigger if exists solicitudes_tocar      on public.solicitudes;
drop trigger if exists solicitudes_sin_borrar on public.solicitudes;
create trigger solicitudes_tocar      before insert or update on public.solicitudes for each row execute function interno.tocar();
create trigger solicitudes_sin_borrar before delete          on public.solicitudes for each row execute function interno.sin_borrar();

alter table public.solicitudes enable row level security;
revoke all on public.solicitudes from public, anon, authenticated, service_role;
grant select on public.solicitudes to authenticated;
grant select, insert, update on public.solicitudes to service_role;

drop policy if exists solicitudes_sel_direccion   on public.solicitudes;
drop policy if exists solicitudes_sel_autor_pagos on public.solicitudes;
create policy solicitudes_sel_direccion   on public.solicitudes for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy solicitudes_sel_autor_pagos on public.solicitudes for select to authenticated
  using (solicito_id = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.solicitudes replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitudes') then
    alter publication supabase_realtime add table public.solicitudes;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 4. cuaderno_notas: la nota de cada «cuaderno de cliente»
-- -----------------------------------------------------------------------------------------------------
-- Destino de `al3d_cuadernos` (máx. 1200 caracteres). La agrupación (por los últimos 10 dígitos del teléfono y luego por nombre normalizado) es una lectura
-- DERIVADA que el cliente sigue haciendo sobre sus cotizaciones; no hay entidad `clientes`. La clave es la del grupo (`tel:<10 dígitos>` o `nom:<nombre
-- normalizado>`) y la nota es POR AUTOR, porque cada quien solo ve las cotizaciones de sus propios clientes (Q-02).
create table if not exists public.cuaderno_notas (
  empresa_id text not null references public.empresas (id),
  clave      text not null check (clave ~ '^(tel:[0-9]{10}|nom:.{1,200})$'),
  autor_id   uuid not null,
  nota       text not null default '' check (length(nota) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (empresa_id, clave, autor_id)
);
create index if not exists cuaderno_notas_sync on public.cuaderno_notas (empresa_id, updated_at, clave);

drop trigger if exists cuaderno_notas_tocar      on public.cuaderno_notas;
drop trigger if exists cuaderno_notas_sin_borrar on public.cuaderno_notas;
create trigger cuaderno_notas_tocar      before insert or update on public.cuaderno_notas for each row execute function interno.tocar();
create trigger cuaderno_notas_sin_borrar before delete          on public.cuaderno_notas for each row execute function interno.sin_borrar();

alter table public.cuaderno_notas enable row level security;
revoke all on public.cuaderno_notas from public, anon, authenticated, service_role;
grant select on public.cuaderno_notas to authenticated;
grant select, insert, update on public.cuaderno_notas to service_role;

drop policy if exists cuaderno_sel_direccion on public.cuaderno_notas;
drop policy if exists cuaderno_sel_propia    on public.cuaderno_notas;
create policy cuaderno_sel_direccion on public.cuaderno_notas for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy cuaderno_sel_propia    on public.cuaderno_notas for select to authenticated
  using (autor_id = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));


-- -----------------------------------------------------------------------------------------------------
-- 5. Ayudantes: las imágenes no entran a la base
-- -----------------------------------------------------------------------------------------------------
-- Las imágenes (`al3d_cot_imgs`, `aiFile.url`, data URLs) van a Storage y no a la base: lo que se guarda en `datos` no trae ninguna. Se quita TODO texto que
-- empiece con «data:» (sea el valor de una llave o un elemento de una lista, sin distinguir mayúsculas): una imagen en base64 pesa cientos de KB y no es un dato.
create or replace function interno.sin_dataurl(j jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; r jsonb := '{}'::jsonb;
begin
  case pg_catalog.jsonb_typeof(j)
    when 'object' then
      for k, v in select e.key, e.value from pg_catalog.jsonb_each(j) e loop
        if pg_catalog.jsonb_typeof(v) = 'string' and (v #>> '{}') ilike 'data:%' then continue; end if;
        r := r || pg_catalog.jsonb_build_object(k, interno.sin_dataurl(v));
      end loop;
      return r;
    when 'array' then
      return coalesce((select pg_catalog.jsonb_agg(interno.sin_dataurl(x.value) order by x.ordinality) from pg_catalog.jsonb_array_elements(j) with ordinality x
                        where not (pg_catalog.jsonb_typeof(x.value) = 'string' and (x.value #>> '{}') ilike 'data:%')), '[]'::jsonb);      -- tampoco las de una lista
    else return j;
  end case;
end $$;
revoke all on function interno.sin_dataurl(jsonb) from public, anon, authenticated, service_role;

-- `datos` de una cotización: sin data URLs y sin `aiFile.url`.
create or replace function interno.datos_cotizacion(j jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select interno.sin_dataurl(j #- '{aiFile,url}') $$;
revoke all on function interno.datos_cotizacion(jsonb) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 6. Solicitar, cancelar, rechazar y revocar
-- -----------------------------------------------------------------------------------------------------
-- Quién puede cada transición (con identidad por PERSONA, `auth.uid()`, y no por «token de <rol>», que hacía de dos aparatos la misma identidad):
--   ∅ → solicitud `pendiente`        solicitar              cualquier miembro (también Fabricación); si ya hay pendiente del MISMO autor o de Dirección, sobrescribe la misma
--   `pendiente` → `cancelada`        cancelar_solicitud     el autor, o Dirección; la cotización vuelve a `retirada` si estaba `pendiente`
--   `pendiente` → `rechazada`        rechazar_solicitud     SOLO Dirección; NO toca una autorización vigente
--   `pendiente` → `autorizada`       registrar_autorizacion SOLO Dirección (la Edge Function lo comprueba con el JWT y la base lo vuelve a comprobar)
--   `vigente` → `revocada`           revocar_autorizacion   SOLO Dirección; terminal: reautorizar el folio crea una `vigente` nueva

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

-- cancelar_solicitud: el teléfono que pidió reabrió la cotización para editarla; lo que pidió ya no es lo que hay. Solo la cancela quien la pidió, o
-- Dirección (antes cualquier rol cancelaba la de cualquiera). Sin pendiente: `estado: null` («no había viva»), no es un error.
create or replace function public.cancelar_solicitud(p_folio_global text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; pend public.solicitudes;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_folio_global is null or p_folio_global !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El folio no se entiende.'); end if;
  select * into pend from public.solicitudes x where x.empresa_id = (pre.c).empresa_id and x.folio_global = p_folio_global and x.estado = 'pendiente' for update;
  if not found then return pg_catalog.jsonb_build_object('ok', true, 'estado', null); end if;
  if pend.solicito_id is distinct from (pre.c).usuario_id and (pre.c).area <> 'direccion' then
    return interno.err('ROL_SIN_PERMISO', 'Esa solicitud la hizo otra persona: solo ella o Dirección la pueden cancelar.'); end if;
  update public.solicitudes set estado = 'cancelada', resolvio_id = (pre.c).usuario_id, resolvio_texto = coalesce(interno.correo_verificado(), ''), ts_resolvio = now()
   where id = pend.id;                                                               -- no toca `nota`
  update public.cotizaciones set estado = 'retirada' where empresa_id = (pre.c).empresa_id and folio_global = p_folio_global and estado = 'pendiente';
  return pg_catalog.jsonb_build_object('ok', true, 'estado', 'cancelada');
end $$;
revoke all on function public.cancelar_solicitud(text, text) from public, anon, authenticated, service_role;
grant execute on function public.cancelar_solicitud(text, text) to authenticated;

-- rechazar_solicitud: SOLO Dirección. NO toca una autorización vigente del mismo folio.
create or replace function public.rechazar_solicitud(p_folio_global text, p_nota text default '', p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; pend public.solicitudes;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  select * into pend from public.solicitudes x where x.empresa_id = (pre.c).empresa_id and x.folio_global = p_folio_global and x.estado = 'pendiente' for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa solicitud ya no está pendiente.'); end if;
  update public.solicitudes set estado = 'rechazada', resolvio_id = (pre.c).usuario_id, resolvio_texto = coalesce(interno.correo_verificado(), ''), ts_resolvio = now(),
                                nota = pg_catalog.left(coalesce(p_nota, ''), 500)
   where id = pend.id;
  update public.cotizaciones set estado = 'rechazada' where empresa_id = (pre.c).empresa_id and folio_global = p_folio_global and estado = 'pendiente';
  perform interno.anotar(pre.c, 'dinero', 'rechazo', 'cotizacion', p_folio_global, 'Se rechazó la solicitud de ' || pg_catalog.left(pend.proyecto, 100));
  return pg_catalog.jsonb_build_object('ok', true, 'estado', 'rechazada');
end $$;
revoke all on function public.rechazar_solicitud(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.rechazar_solicitud(text, text, text) to authenticated;

-- revocar_autorizacion: SOLO Dirección. La vigente pasa a `revocada` (el trigger solo deja cambiar `estado` y, junto con él, `nota`). El PDF impreso pasa
-- a «Revocada» en /verificar, con SU total. Reautorizar el folio crea una `vigente` nueva.
create or replace function public.revocar_autorizacion(p_folio_global text, p_nota text default '', p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; vig public.autorizaciones;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  select * into vig from public.autorizaciones x where x.empresa_id = (pre.c).empresa_id and x.folio_global = p_folio_global and x.estado = 'vigente' for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Ese folio no tiene una autorización vigente.'); end if;
  update public.autorizaciones set estado = 'revocada', nota = pg_catalog.left(coalesce(p_nota, ''), 500) where id = vig.id;
  update public.cotizaciones set revocada_en = now() where empresa_id = (pre.c).empresa_id and folio_global = p_folio_global;
  perform interno.anotar(pre.c, 'dinero', 'revoco', 'autorizacion', p_folio_global, 'Se revocó la autorización de ' || pg_catalog.left(vig.proyecto, 100), '',
                         pg_catalog.jsonb_build_object('estado', 'vigente'), pg_catalog.jsonb_build_object('estado', 'revocada'));
  return pg_catalog.jsonb_build_object('ok', true);
end $$;
revoke all on function public.revocar_autorizacion(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.revocar_autorizacion(text, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 7. estado_solicitudes: la proyección por área (reemplaza a `/estado`)
-- -----------------------------------------------------------------------------------------------------
-- Cada quien solo ve lo SUYO: Dirección todo; los demás, la última solicitud de ESA persona. Hasta 20 folios (el resto se recorta) y los que no cumplen
-- `folioValido` se OMITEN del mapa, como hoy. El sello que se devuelve es el que RESOLVIÓ esa solicitud (`autorizacion_id`), no «el último vigente del
-- folio»: así una solicitud NUEVA (reautorizar) no devuelve el sello viejo. Una solicitud sin resolver tiene `estado: 'pendiente'` y SIN sello.
-- Por área: Dirección y Pagos reciben el sello completo; Fabricación, solo {codigo, correo, ts}: SIN importes ni renglones (R1; Q-A01).
create or replace function public.estado_solicitudes(p_folios text[], p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; f text; sol public.solicitudes; aut public.autorizaciones; v_out jsonb := '{}'::jsonb; v_estado text; v_sello jsonb; v_lista text[]; v_n int;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  v_lista := coalesce(p_folios, '{}');
  v_n := pg_catalog.cardinality(v_lista);
  if v_n > 20 then v_lista := v_lista[1:20]; end if;
  foreach f in array v_lista loop
    if f is null or f !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then continue; end if;
    select * into sol from public.solicitudes x
     where x.empresa_id = (pre.c).empresa_id and x.folio_global = f and ((pre.c).area = 'direccion' or x.solicito_id = (pre.c).usuario_id)
     order by x.id desc limit 1;
    if not found then
      v_out := v_out || pg_catalog.jsonb_build_object(f, pg_catalog.jsonb_build_object('estado', null, 'sello', null, 'resolvio', '', 'nota', ''));
      continue;
    end if;
    aut := null;
    if sol.autorizacion_id is not null then select * into aut from public.autorizaciones x where x.id = sol.autorizacion_id; end if;
    v_estado := case when aut.id is not null then 'autorizada' else sol.estado end;
    if aut.id is null then v_sello := null;
    elsif (pre.c).area = 'fabricacion' then v_sello := pg_catalog.jsonb_build_object('codigo', aut.codigo, 'correo', aut.autorizo, 'ts', aut.ts_iso);
    else v_sello := pg_catalog.jsonb_build_object('codigo', aut.codigo, 'correo', aut.autorizo, 'ts', aut.ts_iso, 'huella', aut.huella, 'subCalc', aut.sub_calc,
                                                  'precioAuth', aut.precio_auth, 'itemsAuth', interno.items_auth_a_json(aut.items_auth), 'total', aut.total,
                                                  'nota', aut.nota, 'renglones', interno.renglones_a_json(aut.renglones));
    end if;
    v_out := v_out || pg_catalog.jsonb_build_object(f, pg_catalog.jsonb_build_object('estado', v_estado, 'sello', v_sello, 'resolvio', sol.resolvio_texto, 'nota', sol.nota));
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'folios', v_out);
end $$;
revoke all on function public.estado_solicitudes(text[], text) from public, anon, authenticated, service_role;
grant execute on function public.estado_solicitudes(text[], text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 8. registrar_autorizacion y autorizacion_para_verificar (SOLO service_role)
-- -----------------------------------------------------------------------------------------------------
-- registrar_autorizacion: la llama la Edge Function `autorizar` DESPUÉS de firmar. Recibe los textos FIRMADOS tal cual (ts_iso, huella, importes
-- 'NNNN.NN', items_auth, proyecto, autorizo, renglones), el código, la firma y la codificación con la que se firmó (lo que devuelve `sellar()` de
-- `_shared/sello.js`), y `p_usuario` = el auth.users.id de quien autoriza (verificado por la Edge Function con su JWT). La base NO tiene la clave y no puede
-- recomputar el HMAC: REVALIDA todo lo demás (defensa en profundidad):
--   · `p_usuario` es miembro ACTIVO con área «direccion» en `p_empresa`, y `p_autorizo` es SU correo (el correo firmado ES el del autorizador);
--   · folio con @aparato; código `XXXX-XXXX-XXXX`; firma de 64 hexadecimales y el código es su prefijo; `ts_iso` con milisegundos y «Z»; importes `NNNN.NN`;
--     `p_codificacion` ∈ {'ascii-?', 'utf-8'}.
-- Idempotencia: la MISMA decisión (huella, importes, ajustes, proyecto y renglones idénticos) no escribe nada, devuelve `repetida: true` y RESUELVE la
-- solicitud pendiente (Q-A06; el .gs la dejaba pendiente). Otra decisión: la vigente pasa a `superada` y entra una `vigente` nueva (el índice único
-- parcial garantiza una sola vigente por folio).
create or replace function public.registrar_autorizacion(
  p_empresa text, p_usuario uuid, p_folio_global text, p_ts_iso text, p_proyecto text, p_cliente text, p_sub_calc_txt text, p_precio_auth_txt text,
  p_total_txt text, p_ajuste_pct numeric, p_items_auth text, p_huella text, p_autorizo text, p_codigo text, p_firma text, p_nota text, p_renglones text,
  p_cotizacion jsonb default null, p_clave_id text default 'k1', p_codificacion text default 'ascii-?') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  vig public.autorizaciones; v_new public.autorizaciones; v_corr text; v_ctx interno.contexto_t; v_sol_id bigint; v_solicito text; v_datos jsonb; v_aut public.autorizaciones;
begin
  -- 1. quién autoriza
  if p_empresa is null or p_usuario is null or not exists (select 1 from public.miembros m where m.usuario_id = p_usuario and m.empresa_id = p_empresa and m.estado = 'activo' and m.area = 'direccion') then
    return interno.err('ROL_SIN_PERMISO', 'Solo una cuenta de Dirección activa de esa empresa autoriza.'); end if;
  select pg_catalog.lower(pg_catalog.btrim(u.email)) into v_corr from auth.users u where u.id = p_usuario;
  -- la forma de lo firmado (cada operando se pregunta por NULL primero: un NULL no puede «aprobar» una validación)
  if p_folio_global is null or p_folio_global !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'
     or p_codigo is null or p_codigo !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'
     or p_firma is null or p_firma !~ '^[0-9a-f]{64}$'
     or pg_catalog.replace(p_codigo, '-', '') <> pg_catalog.upper(pg_catalog.left(p_firma, 12))
     or p_ts_iso is null or p_ts_iso !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
     or p_sub_calc_txt is null or p_sub_calc_txt !~ '^-?[0-9]+[.][0-9]{2}$'
     or p_precio_auth_txt is null or p_precio_auth_txt !~ '^-?[0-9]+[.][0-9]{2}$'
     or p_total_txt is null or p_total_txt !~ '^-?[0-9]+[.][0-9]{2}$'
     or p_huella is null or p_proyecto is null or p_items_auth is null or p_renglones is null
     or p_autorizo is null or v_corr is null or p_autorizo <> v_corr or p_autorizo = ''
     or p_codificacion is null or p_codificacion <> all (array['utf-8', 'ascii-?'])
     or (p_ajuste_pct is not null and pg_catalog.abs(p_ajuste_pct) >= 1000000)
     or pg_catalog.length(coalesce(p_nota, '')) > 500 then
    return interno.err('DATO_INVALIDO', 'Los textos firmados no tienen la forma esperada.'); end if;
  v_ctx := row(p_empresa, 'direccion', p_usuario, 'ok')::interno.contexto_t;
  -- 2. el candado de notario
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_empresa || ':aut:' || p_folio_global, 0));
  -- 3. ¿ya hay una vigente?
  select * into vig from public.autorizaciones x where x.empresa_id = p_empresa and x.folio_global = p_folio_global and x.estado = 'vigente';
  if found then
    if (vig.huella, vig.sub_calc_txt, vig.precio_auth_txt, vig.items_auth, vig.proyecto, vig.renglones)
         is not distinct from (p_huella, p_sub_calc_txt, p_precio_auth_txt, p_items_auth, p_proyecto, p_renglones) then
      -- la MISMA decisión: nada se escribe; se resuelve la pendiente del folio (Q-A06)
      select max(x.id) into v_sol_id from public.solicitudes x where x.empresa_id = p_empresa and x.folio_global = p_folio_global and x.estado = 'pendiente';
      if v_sol_id is not null then
        update public.solicitudes set estado = 'autorizada', resolvio_id = p_usuario, resolvio_texto = v_corr, ts_resolvio = now(),
                                      nota = coalesce(nullif(p_nota, ''), nota), autorizacion_id = vig.id
         where id = v_sol_id;
        update public.cotizaciones set estado = 'autorizada', autorizacion_id = vig.id where empresa_id = p_empresa and folio_global = p_folio_global and estado <> 'autorizada';
      end if;
      return pg_catalog.jsonb_build_object('ok', true, 'repetida', true, 'sello', pg_catalog.jsonb_build_object(
               'codigo', vig.codigo, 'correo', vig.autorizo, 'ts', vig.ts_iso, 'huella', vig.huella, 'subCalc', vig.sub_calc, 'precioAuth', vig.precio_auth,
               'itemsAuth', interno.items_auth_a_json(vig.items_auth), 'total', vig.total, 'nota', vig.nota, 'renglones', interno.renglones_a_json(vig.renglones)));
    end if;
    update public.autorizaciones set estado = 'superada' where id = vig.id;
  end if;
  -- 4. el sello nuevo
  select x.solicito_texto into v_solicito from public.solicitudes x
   where x.empresa_id = p_empresa and x.folio_global = p_folio_global and x.estado = 'pendiente' order by x.id desc limit 1;
  insert into public.autorizaciones (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo, ts_iso, renglones, cliente,
                                     ajuste_pct, solicito, codigo, firma, estado, origen, usuario_id, clave_id, codificacion)
  values (p_empresa, p_folio_global, p_huella, p_sub_calc_txt, p_precio_auth_txt, p_items_auth, p_total_txt, p_proyecto, p_autorizo, p_ts_iso, p_renglones,
          coalesce(p_cliente, ''), p_ajuste_pct, coalesce(v_solicito, v_corr), p_codigo, p_firma, 'vigente', 'plataforma', p_usuario, coalesce(nullif(p_clave_id, ''), 'k1'), p_codificacion)
  returning * into v_new;
  -- 5. la cotización: se crea si falta (stub desde la cotización limpia) y queda `autorizada` con su sello
  v_datos := case when pg_catalog.jsonb_typeof(p_cotizacion) = 'object'
                  then pg_catalog.jsonb_build_object('proy', p_cotizacion -> 'proyecto', 'cliente', p_cotizacion -> 'cliente', 'iva', p_cotizacion -> 'iva',
                                                     'subtotal', p_cotizacion -> 'subtotal', 'items', p_cotizacion -> 'items')
                  else pg_catalog.jsonb_build_object('proy', p_proyecto, 'cliente', coalesce(p_cliente, '')) end;
  insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, autorizacion_id)
  values (p_empresa, p_folio_global, pg_catalog.split_part(p_folio_global, '@', 1), pg_catalog.split_part(p_folio_global, '@', 2), p_usuario, 'autorizada', v_datos, v_new.id)
  on conflict (empresa_id, folio_global) do update set estado = 'autorizada', autorizacion_id = excluded.autorizacion_id, revocada_en = null;
  -- 6. la solicitud pendiente del folio (de quien sea) queda resuelta
  select max(x.id) into v_sol_id from public.solicitudes x where x.empresa_id = p_empresa and x.folio_global = p_folio_global and x.estado = 'pendiente';
  if v_sol_id is not null then
    update public.solicitudes set estado = 'autorizada', resolvio_id = p_usuario, resolvio_texto = v_corr, ts_resolvio = now(),
                                  nota = coalesce(nullif(p_nota, ''), nota), autorizacion_id = v_new.id
     where id = v_sol_id;
  end if;
  -- 7. la bitácora de dinero, sin importes en el título
  perform interno.anotar(v_ctx, 'dinero', 'autorizo', 'autorizacion', p_folio_global, 'Se autorizó ' || pg_catalog.left(p_proyecto, 100), '',
                         case when vig.id is not null then pg_catalog.jsonb_build_object('estado', 'vigente', 'codigo', vig.codigo) end,       -- la que quedó «superada»
                         pg_catalog.jsonb_build_object('estado', 'vigente', 'codigo', v_new.codigo), null, null, v_corr);
  return pg_catalog.jsonb_build_object('ok', true, 'repetida', false, 'sello', pg_catalog.jsonb_build_object(
           'codigo', v_new.codigo, 'correo', v_new.autorizo, 'ts', v_new.ts_iso, 'huella', v_new.huella, 'subCalc', v_new.sub_calc, 'precioAuth', v_new.precio_auth,
           'itemsAuth', interno.items_auth_a_json(v_new.items_auth), 'total', v_new.total, 'nota', v_new.nota, 'renglones', interno.renglones_a_json(v_new.renglones)));
end $$;
revoke all on function public.registrar_autorizacion(text, uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_autorizacion(text, uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text, text, jsonb, text, text) to service_role;

-- autorizacion_para_verificar: la llama la Edge Function pública `verificar` DESPUÉS de `verificar_cupo`. Devuelve las filas de ese folio y ese código, de la MÁS
-- ANTIGUA a la más nueva (hasta 50), con EXACTAMENTE los nombres de columna que espera `leerFilas` de `_shared/verificar.js` (`COLUMNAS_DE_AUTORIZACION` de
-- `sello.js`, más `codificacion`): los importes viajan como el texto firmado 'NNNN.NN' y todo lo demás VERBATIM. El folio puede venir SIN «@aparato»
-- (el PDF imprime «COT-0042»): solo aquí se acepta, porque lo que identifica es el código de doce hexadecimales (los primeros 48 bits del HMAC); un folio
-- corto no le abre la puerta a nada: sin el código bueno no hay fila, y sin la firma buena no hay respuesta.
-- La base NO decide «auténtica»: no tiene la clave. Una forma inválida o un folio/código que no existe → `filas: []`.
create or replace function public.autorizacion_para_verificar(p_folio text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f text := pg_catalog.btrim(coalesce(p_folio, '')); cod text := pg_catalog.left(pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Fa-f]', '', 'g')), 12);
        v_codigo text; v_filas jsonb;
begin
  if f !~ '^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$' or pg_catalog.length(cod) <> 12 then return pg_catalog.jsonb_build_object('ok', true, 'filas', '[]'::jsonb); end if;
  v_codigo := pg_catalog.substr(cod, 1, 4) || '-' || pg_catalog.substr(cod, 5, 4) || '-' || pg_catalog.substr(cod, 9, 4);      -- el código se guarda con sus guiones
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'folio_global', x.folio_global, 'ts_iso', x.ts_iso, 'proyecto', x.proyecto, 'sub_calc', x.sub_calc_txt, 'precio_auth', x.precio_auth_txt, 'total', x.total_txt,
           'items_auth', x.items_auth, 'huella', x.huella, 'autorizo', x.autorizo, 'renglones', x.renglones, 'codigo', x.codigo, 'firma', x.firma, 'estado', x.estado,
           'codificacion', x.codificacion) order by x.id), '[]'::jsonb)
    into v_filas
    from (select a.* from public.autorizaciones a
           where a.codigo = v_codigo
             and (case when pg_catalog.strpos(f, '@') > 0 then a.folio_global = f
                       else pg_catalog.upper(pg_catalog.split_part(a.folio_global, '@', 1)) = pg_catalog.upper(pg_catalog.split_part(f, '@', 1)) end)
           order by a.id limit 50) x;
  return pg_catalog.jsonb_build_object('ok', true, 'filas', v_filas);
end $$;
revoke all on function public.autorizacion_para_verificar(text, text) from public, anon, authenticated, service_role;
grant execute on function public.autorizacion_para_verificar(text, text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 9. cotizacion_guardar y cuaderno_guardar
-- -----------------------------------------------------------------------------------------------------
-- cotizacion_guardar: actualiza la copia de trabajo de una cotización que YA existe (se crea con `solicitar` o con la subida única). El autor, o Dirección.
-- NUNCA toca `estado`, `autorizacion_id` ni `revocada_en`: eso es de las RPC del notario. `datos` no trae data URLs ni `aiFile.url`; `folio` y `disp` de `datos`
-- deben ser coherentes con el folio. `borrar: true` pone `deleted_at` (la fila se queda y la autorización firmada NO se toca: un PDF impreso sigue
-- verificando). No anota los cambios de `datos` ni de `hitos`: no son hechos nuevos y serían ruido (la última escritura gana).
--   p_op = { folio_global, datos?:{…entrada del historial…}, hitos?:{pdf, wa, venta, propuesta:{primera, ultima, veces}}, borrar?:true }
create or replace function public.cotizacion_guardar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_fg text; co public.cotizaciones; v_datos jsonb; v_hitos jsonb; v_borrar boolean;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_fg := p_op ->> 'folio_global';
  if v_fg is null or v_fg !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El folio de la cotización necesita su aparato (COT-0042-B@K7QM).'); end if;
  v_borrar := pg_catalog.jsonb_typeof(p_op -> 'borrar') = 'boolean' and (p_op ->> 'borrar')::boolean;
  select * into co from public.cotizaciones x where x.empresa_id = (pre.c).empresa_id and x.folio_global = v_fg for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa cotización no existe: nace al pedir la autorización o con la subida única.'); end if;
  if (pre.c).area <> 'direccion' and co.creado_por is distinct from (pre.c).usuario_id then return interno.err('ROL_SIN_PERMISO', 'Ese folio es de otra persona.'); end if;
  if v_borrar then
    update public.cotizaciones set deleted_at = coalesce(deleted_at, now()) where empresa_id = co.empresa_id and folio_global = co.folio_global;
    perform interno.anotar(pre.c, 'dinero', 'borro', 'cotizacion', v_fg, 'Se quitó ' || pg_catalog.left(co.proy, 100));
    return pg_catalog.jsonb_build_object('ok', true);
  end if;
  if p_op ? 'datos' and pg_catalog.jsonb_typeof(p_op -> 'datos') <> 'null' then
    v_datos := p_op -> 'datos';
    if pg_catalog.jsonb_typeof(v_datos) <> 'object' or pg_catalog.length(v_datos::text) > 200000 then return interno.err('DATO_INVALIDO', 'La cotización no es válida o es demasiado grande.'); end if;
    v_datos := interno.datos_cotizacion(v_datos);
    if (v_datos ? 'folio' and v_datos ->> 'folio' is distinct from co.folio) or (v_datos ? 'disp' and v_datos ->> 'disp' is distinct from co.disp) then
      return interno.err('DATO_INVALIDO', 'El folio o el aparato de la cotización no coinciden con el folio global.'); end if;
  end if;
  if p_op ? 'hitos' and pg_catalog.jsonb_typeof(p_op -> 'hitos') <> 'null' then
    v_hitos := p_op -> 'hitos';
    if pg_catalog.jsonb_typeof(v_hitos) <> 'object' then return interno.err('DATO_INVALIDO', 'Los hitos deben ser un objeto.'); end if;
  end if;
  update public.cotizaciones set datos = coalesce(v_datos, datos), hitos = hitos || coalesce(v_hitos, '{}'::jsonb) where empresa_id = co.empresa_id and folio_global = co.folio_global;
  return pg_catalog.jsonb_build_object('ok', true);
end $$;
revoke all on function public.cotizacion_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cotizacion_guardar(jsonb, text) to authenticated;

-- cuaderno_guardar: la nota de un cuaderno de cliente, POR AUTOR.
create or replace function public.cuaderno_guardar(p_clave text, p_nota text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_clave is null or p_clave !~ '^(tel:[0-9]{10}|nom:.{1,200})$' or p_nota is null or pg_catalog.length(p_nota) > 1200 then
    return interno.err('DATO_INVALIDO', 'La clave del cuaderno o su nota no son válidas (la nota, hasta 1200 caracteres).'); end if;
  insert into public.cuaderno_notas (empresa_id, clave, autor_id, nota) values ((pre.c).empresa_id, p_clave, (pre.c).usuario_id, p_nota)
  on conflict (empresa_id, clave, autor_id) do update set nota = excluded.nota, deleted_at = null;
  return pg_catalog.jsonb_build_object('ok', true);
end $$;
revoke all on function public.cuaderno_guardar(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.cuaderno_guardar(text, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 10. subida_unica: el historial del cotizador, dentro de la app
-- -----------------------------------------------------------------------------------------------------
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
  v_nivel text; v_ts timestamptz; v_ent text; v_cnt int; v_folio text; v_motivo text; v_idb text; v_nota text; v_hitos jsonb;
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
      insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, hitos, procedencia)
      values (c.empresa_id, v_fg, v_folio, v_disp_e, c.usuario_id, 'autorizada', v_datos,
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
