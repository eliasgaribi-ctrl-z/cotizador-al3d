-- =====================================================================================================
-- 0003_proyectos.sql — la tabla unificada de proyectos y el dinero de cada venta
-- =====================================================================================================
-- Qué deja:
--   · `proyectos`: UNA sola tabla para toda fila de la hoja «Ventas» y todo proyecto de la plataforma (R2). Sin tabla
--     `ventas` aparte ni «atadura» entre una fila de hoja y un proyecto: una venta es un proyecto y viceversa;
--   · `ventas_dinero` (1:1, restringida), `abonos` (el libro de comisión, append-only) e `instalaciones` (las citas);
--   · los triggers de inmutabilidad, los índices, las políticas RLS y los privilegios de las cuatro;
--   · `interno.partir_origen` (+ `solo_claves`, `sin_claves`) y `interno.limpiar_cotizacion`.
--
-- Depende de: 0001 (utilidades, triggers comunes) y 0002 (`empresas_donde`).
--
-- R1 — Fabricación no lee dinero POR NINGUNA VÍA. RLS no oculta columnas, así que el dinero vive en TABLAS aparte:
-- `ventas_dinero` y `abonos` no tienen política para Fabricación (la fila ni siquiera llega por la API). Lo que el taller
-- necesita saber del cobro sin ver cifras (`estatus`, `iva`, `fecha_anticipo`; DEC Q-03) vive en `proyectos`. La copia
-- congelada de la cotización se PARTE en dos: la obra (lista blanca, la ven los tres roles) y el dinero (solo Dirección y
-- Pagos). Escribir es solo por RPC (0006 y 0007): aquí no hay INSERT/UPDATE/DELETE para `authenticated`.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. proyectos
-- -----------------------------------------------------------------------------------------------------
-- Lo que distingue a cada fila son dos columnas:
--   fuente    'cotizacion' nació de una cotización autorizada (`ganar_proyecto`, o su lápida `descartar_cotizacion`);
--             'hoja'       importada de una fila de la hoja (una tarjeta viva sin cotización, o una fila histórica);
--             'manual'     alta hecha en la base (`alta_venta`), el menú «Registrar nueva venta» de la hoja.
--   historica true = fila ANTERIOR a la plataforma, sin cotización ni obra (≥199 filas): Control la suma y la UI de
--             obra no la pinta como tarjeta. Solo con fuente='hoja', sin origen_obra, sin folio_global, sin instalaciones.
-- «Filas importadas» (la regla automática de etapa de Q-05) = fuente in ('hoja','manual') and not historica.
-- La LÁPIDA («No se dio» antes de ser venta) es fuente='cotizacion', etapa='cancelado', folio_hoja nulo: existe para que
-- la cotización deje de contar como «sin decidir»; NO entra al libro ni a `ventas_calculadas` (no tiene `ventas_dinero`).
create table if not exists public.proyectos (
  id                     text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$'),
  empresa_id             text not null references public.empresas (id),

  -- identidad y clasificación ------------------------------------------------
  folio_hoja             text check (folio_hoja ~ '^V-[0-9]{3,7}$'),                                -- A «Folio» (V-###); NULL = lápida
  folio_global           text check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),   -- Y «Folio cotizacion» (COT-0042-B@K7QM)
  folio_local            text not null default '',                                                  -- folio impreso (en importados = folio_hoja)
  dispositivo            text not null default '' check (dispositivo ~ '^[A-Za-z0-9_-]{0,24}$'),   -- aparato que ganó la venta; 'hoja' en importados
  fuente                 text not null check (fuente in ('cotizacion','hoja','manual')),
  historica              boolean not null default false,

  -- cliente y obra: visibles a los TRES roles (nada de dinero) -----------------
  nombre                 text not null check (btrim(nombre) <> '' and length(nombre) <= 2000),     -- B «Proyecto» («Contacto - Negocio (Tipo)»)
  contacto               text not null default '' check (length(contacto) <= 2000),
  negocio                text not null default '' check (length(negocio) <= 2000),
  tel                    text not null default '' check (length(tel) <= 30 and tel !~ '[^0-9 +()-]' and (tel = '' or tel ~ '[0-9]')),  -- AE «Telefono»
  etapa                  text check (etapa in ('ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado')),       -- Z «Etapa de obra»
  tipo_trabajo           text[] not null default '{}'
                         check (tipo_trabajo <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion',
                                                      'Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']), -- E
  fecha_anticipo         date,                                                                      -- L (= `fecha_ganado`; Q-03: no es dinero para Fabricación)
  compromiso_texto       text not null default '',                                                  -- texto libre del compromiso (cotizador `entrega`), NO el modo de entrega
  dir_texto              text not null default '' check (length(dir_texto) <= 2000),                -- AC «Direccion»
  entrecalles            text not null default '',
  maps_url               text not null default '',
  lat                    double precision check (lat between -90 and 90),                           -- AB «Ubicacion» (grupo de sello `ubicacion`)
  lng                    double precision check (lng between -180 and 180),
  geo_fuente             text not null default '',                                                  -- libre: maps_pin, maps_camara, manual, sin_ubicar, coordenadas…
  ubicacion_pendiente    boolean not null default false,                                            -- «todavía no la tengo»; no viaja a la hoja
  entrega                text check (entrega in ('instalacion','paqueteria','recoleccion')),        -- AF «Entrega»; NULL = nadie lo dijo (≠ instalación)
  plazo_k                smallint check (plazo_k between 1 and 5),                                  -- AH «Plazo taller»
  notas                  text not null default '' check (length(notas) <= 40000),                   -- AG «Notas»

  -- lo que el taller necesita saber del cobro SIN ver cifras (Q-03) ----------------
  estatus                text check (estatus in ('FABRICACION','REPARANDO','COBRANDO','LIQUIDADO')), -- C «Estatus»
  iva                    boolean not null default true,                                             -- F «IVA» (la cuenta lo dicta en ventas abiertas)

  -- cita heredada de una fila histórica (no hay objeto instalación) ----------------
  fecha_instalacion_hist date,                                                                      -- M de filas históricas; en las demás manda la instalación viva

  -- sellos por dato, epoch-ms: {"etapa":ms,"notas":ms,…} (los 8 grupos, §5.4) -----------
  sellos                 jsonb not null default '{}'::jsonb check (interno.sellos_validos(sellos)), -- AI «Sellos»

  -- copia congelada de la cotización SIN precios (el dinero vive en ventas_dinero.origen_dinero)
  origen_obra            jsonb check (origen_obra is null
                                      or (jsonb_typeof(origen_obra) = 'object' and not interno.contiene_dinero(origen_obra))),

  procedencia            jsonb not null default '{}'::jsonb,
  creado_por             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default clock_timestamp(),
  deleted_at             timestamptz,

  constraint proyectos_unico_con_empresa  unique (empresa_id, id),            -- destino de las FK compuestas de los hijos
  constraint proyectos_folio_hoja_unico   unique (empresa_id, folio_hoja),    -- varios NULL permitidos (lápidas)
  constraint proyectos_folio_global_unico unique (empresa_id, folio_global),  -- Q-07; varios NULL permitidos
  constraint proyectos_pin_valido         check ((lat is null) = (lng is null) and not (lat = 0 and lng = 0)),
  constraint proyectos_etapa_obligatoria  check (etapa is not null or historica),
  constraint proyectos_cotizacion_folio   check (fuente <> 'cotizacion' or folio_global is not null),
  constraint proyectos_libro              check (folio_hoja is not null or (fuente = 'cotizacion' and etapa = 'cancelado')),
  constraint proyectos_historica          check (not historica or (fuente = 'hoja' and folio_hoja is not null
                                                                   and folio_global is null and origen_obra is null)),
  constraint proyectos_cita_historica     check (fecha_instalacion_hist is null or historica)
);
create index if not exists proyectos_sync    on public.proyectos (empresa_id, updated_at, id);
create index if not exists proyectos_etapa   on public.proyectos (empresa_id, etapa)   where deleted_at is null;
create index if not exists proyectos_estatus on public.proyectos (empresa_id, estatus) where deleted_at is null;

-- La identidad de un proyecto no cambia: «la llave que ata la fila a la cotización de un teléfono no se pisa».
-- `folio_hoja` y `folio_global`, una vez fijados, tampoco (pasar de NULL a un valor sí: lo hace la importación al fusionar).
create or replace function interno.proyectos_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.empresa_id, new.fuente, new.historica, new.dispositivo, new.folio_local, new.created_at)
       is distinct from (old.id, old.empresa_id, old.fuente, old.historica, old.dispositivo, old.folio_local, old.created_at)
     or (old.folio_hoja   is not null and new.folio_hoja   is distinct from old.folio_hoja)
     or (old.folio_global is not null and new.folio_global is distinct from old.folio_global) then
    raise exception 'La identidad de un proyecto no se cambia' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function interno.proyectos_inmutable() from public, anon, authenticated, service_role;

drop trigger if exists proyectos_tocar      on public.proyectos;
drop trigger if exists proyectos_sin_borrar on public.proyectos;
drop trigger if exists proyectos_inmutable  on public.proyectos;
create trigger proyectos_tocar      before insert or update on public.proyectos for each row execute function interno.tocar();
create trigger proyectos_sin_borrar before delete          on public.proyectos for each row execute function interno.sin_borrar();
create trigger proyectos_inmutable  before update          on public.proyectos for each row execute function interno.proyectos_inmutable();

alter table public.proyectos enable row level security;
revoke all on public.proyectos from public, anon, authenticated, service_role;
grant select on public.proyectos to authenticated;
grant select, insert, update on public.proyectos to service_role;     -- sin DELETE: ni service_role borra

-- Los tres roles leen TODAS las filas de su empresa, lápidas incluidas (Q-03: `estatus`, `iva` y `fecha_anticipo` no son
-- dinero; `origen_obra` no lleva precios). Los clientes necesitan también las filas con `deleted_at` (tombstones).
drop policy if exists proyectos_sel_todos on public.proyectos;
create policy proyectos_sel_todos on public.proyectos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

-- Realtime: la tabla entra a la publicación (lista cerrada) con su identidad de réplica por DEFAULT (solo la llave primaria en un
-- DELETE; con FULL viajaría la fila vieja completa). El evento es solo un AVISO: el cliente responde con una lectura incremental.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.proyectos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proyectos') then
    alter publication supabase_realtime add table public.proyectos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 2. ventas_dinero (1:1 con el proyecto, restringida a Dirección y Pagos)
-- -----------------------------------------------------------------------------------------------------
-- TODO el dinero de una venta, y solo el dinero. Son los 11 CAMPOS_DE_DINERO del .gs: los 6 que son DATO viven aquí
-- (Subtotal, Anticipo, Liquidación, Cuenta, Fecha liquidación, Porcentaje comisión); los 5 que son FÓRMULA (Precio Neto,
-- Pago Pendiente, Comisiones, Abono Comisión, Comisión Restante) viven en la vista `ventas_calculadas` (0004).
-- Importes en `numeric` SIN escala (la hoja guarda Number(valor) sin redondear): el redondeo está en las fórmulas.
create table if not exists public.ventas_dinero (
  proyecto_id       text primary key,
  empresa_id        text not null,
  subtotal          numeric not null default 0,                                        -- G «Subtotal» (sin IVA, SIN redondear, puede ser negativo)
  anticipo          numeric not null default 0 check (anticipo    >= 0),               -- I «Anticipo»
  liquidacion       numeric not null default 0 check (liquidacion >= 0),               -- J «Liquidación» (acumulativa)
  cuenta            text check (cuenta in ('Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT')),   -- D «Cuenta»
  fecha_liquidacion date,                                                              -- N «Fecha liquidación»
  pct_comision      numeric check (pct_comision between 0 and 100),                    -- AD «Porcentaje comision»: INFORMATIVO, ninguna fórmula lo lee
  precio_auth       numeric,                                                           -- lo que dice la cotización autorizada; informativo
  origen_dinero     jsonb check (origen_dinero is null or jsonb_typeof(origen_dinero) = 'object'),  -- parte con precios de `origen`
  procedencia       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index if not exists ventas_dinero_sync on public.ventas_dinero (empresa_id, updated_at, proyecto_id);

-- Existe EXACTAMENTE una fila por cada proyecto con `folio_hoja` (la crea la misma RPC que crea el proyecto, o la importación);
-- `proyecto_id` NO puede suponer que hay cotización (DEC Q-04). Este trigger impide una fila de dinero para una LÁPIDA. La otra
-- mitad («todo proyecto con folio_hoja tiene su fila») no se puede expresar sin diferir y la comprueba `cuadre_hoja` (0010).
create or replace function interno.ventas_dinero_libro() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.proyectos p
                  where p.empresa_id = new.empresa_id and p.id = new.proyecto_id and p.folio_hoja is not null) then
    raise exception 'ventas_dinero solo existe para un proyecto con folio_hoja (%)', new.proyecto_id using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function interno.ventas_dinero_libro() from public, anon, authenticated, service_role;

drop trigger if exists ventas_dinero_tocar      on public.ventas_dinero;
drop trigger if exists ventas_dinero_sin_borrar on public.ventas_dinero;
drop trigger if exists ventas_dinero_libro      on public.ventas_dinero;
create trigger ventas_dinero_tocar      before insert or update on public.ventas_dinero for each row execute function interno.tocar();
create trigger ventas_dinero_sin_borrar before delete          on public.ventas_dinero for each row execute function interno.sin_borrar();
create trigger ventas_dinero_libro      before insert          on public.ventas_dinero for each row execute function interno.ventas_dinero_libro();

alter table public.ventas_dinero enable row level security;
revoke all on public.ventas_dinero from public, anon, authenticated, service_role;
grant select on public.ventas_dinero to authenticated;
grant select, insert, update on public.ventas_dinero to service_role;

-- Dirección y Pagos. Fabricación NO tiene política: ni una fila, ni por embedding de PostgREST.
drop policy if exists ventas_dinero_sel_dir_pag on public.ventas_dinero;
create policy ventas_dinero_sel_dir_pag on public.ventas_dinero for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.ventas_dinero replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ventas_dinero') then
    alter publication supabase_realtime add table public.ventas_dinero;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 3. abonos (el libro de «Abonos comisión», append-only)
-- -----------------------------------------------------------------------------------------------------
-- Un LIBRO con tres formas de captura (puente, formulario, reparto FIFO), no un cálculo. Se enlaza por el folio `V-###` como
-- TEXTO, como la hoja (SUMIF por la columna A) y no por FK: así los abonos con folio inexistente que ya hay en la hoja
-- («— folio no encontrado —») se conservan y siguen sumando donde hoy suman («Comisiones por periodo»).
create table if not exists public.abonos (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.empresas (id),
  folio_hoja     text not null check (folio_hoja ~ '^V-[0-9]{3,7}$'),                    -- A «Folio» (llave contra Ventas!A)
  importe        numeric not null check (abs(importe) < 10000000),                       -- C «Importe» (<1e7, como el puente)
  fecha          date,                                                                   -- D «Fecha» (NULL = «sin fecha»: no aparece en ningún periodo)
  nota           text not null default '',                                               -- E «Nota»
  pago_id        text check (pago_id ~ '^P-[0-9]{3,}$'),                                 -- F «Pago» (id de depósito; solo el reparto FIFO lo crea)
  tipo           text not null default 'abono' check (tipo in ('abono','reparto','correccion','historico')),
  op_id          text,                                                                   -- idempotencia de cobro/abono/reparto (§7.3)
  registrado_por uuid,
  registrado_en  timestamptz not null default now(),
  procedencia    jsonb not null default '{}'::jsonb,                                     -- {fila_hoja, hora_original, …}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  constraint abonos_signo check ((tipo in ('abono','reparto') and importe > 0) or tipo in ('correccion','historico'))
);
create unique index if not exists abonos_op    on public.abonos (empresa_id, op_id, folio_hoja) where op_id is not null;
create index        if not exists abonos_folio on public.abonos (empresa_id, folio_hoja);
create index        if not exists abonos_pago  on public.abonos (empresa_id, pago_id) where pago_id is not null;
create index        if not exists abonos_sync  on public.abonos (empresa_id, updated_at, id);

-- Los abonos NO se editan ni se borran: una corrección es un renglón `tipo = 'correccion'` con importe negativo (RPC
-- `corregir_abono`, solo Dirección, con nota), lo que hoy se hace «a mano en la pestaña».
drop trigger if exists abonos_tocar         on public.abonos;
drop trigger if exists abonos_sin_borrar    on public.abonos;
drop trigger if exists abonos_solo_agregar  on public.abonos;
create trigger abonos_tocar        before insert or update on public.abonos for each row execute function interno.tocar();
create trigger abonos_sin_borrar   before delete          on public.abonos for each row execute function interno.sin_borrar();
create trigger abonos_solo_agregar before update          on public.abonos for each row execute function interno.solo_agregar();

alter table public.abonos enable row level security;
revoke all on public.abonos from public, anon, authenticated, service_role;
grant select on public.abonos to authenticated;
grant select, insert, update on public.abonos to service_role;

drop policy if exists abonos_sel_dir_pag on public.abonos;
create policy abonos_sel_dir_pag on public.abonos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.abonos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'abonos') then
    alter publication supabase_realtime add table public.abonos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 4. instalaciones (las citas)
-- -----------------------------------------------------------------------------------------------------
-- Una cita es 1:N con el proyecto, pero UNA VIVA por proyecto (hoy solo por convención de `agenda.agendar`; aquí, por índice
-- único parcial). El sello de la cita (grupo `instalacion`) vive en `proyectos.sellos`, no aquí: así no existe el defecto de
-- `sello_hoja_en`, que se re-sella al escribir. No hay `gcal_event_id`: es un campo muerto; el id del evento de Calendar es
-- determinista sobre el UID.
create table if not exists public.instalaciones (
  id           text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$'),
  empresa_id   text not null,
  proyecto_id  text not null,
  fecha        date not null,
  hora         text check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),                -- NULL = sin hora (evento de todo el día)
  ventana      text not null default 'dia' check (ventana in ('dia','noche','madrugada')),
  duracion_min integer not null default 180 check (duracion_min between 1 and 600),
  estado       text not null check (estado in ('propuesta','confirmada','reagendada','hecha','cancelada')),
  movida       integer not null default 0 check (movida >= 0),                      -- = SEQUENCE del .ics; nunca baja
  uid_ics      text not null,
  notas        text not null default '',                                             -- registro acumulativo («Movida del … al …: motivo»)
  procedencia  jsonb not null default '{}'::jsonb,
  creado_por   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  -- inmutable: si el UID cambia, el calendario DUPLICA el evento ya sincronizado
  constraint instalaciones_uid check (uid_ics = 'inst-' || id || '@al3d.mx'),
  constraint instalaciones_unico_id unique (empresa_id, id)
);
create unique index if not exists instalaciones_una_viva on public.instalaciones (proyecto_id) where estado <> 'cancelada' and deleted_at is null;
create index        if not exists instalaciones_fecha    on public.instalaciones (empresa_id, fecha) where deleted_at is null;
create index        if not exists instalaciones_sync     on public.instalaciones (empresa_id, updated_at, id);

-- `id`, `empresa_id`, `proyecto_id` y `uid_ics` no cambian; `movida` solo sube (la RPC la sube al reagendar y AL CANCELAR, para que
-- el .ics de la cancelación no se tome por un evento que el calendario ya conoce).
create or replace function interno.instalaciones_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.empresa_id, new.proyecto_id, new.uid_ics) is distinct from (old.id, old.empresa_id, old.proyecto_id, old.uid_ics) then
    raise exception 'La identidad de una instalacion no se cambia' using errcode = 'P0001';
  end if;
  if new.movida < old.movida then raise exception 'movida solo sube' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function interno.instalaciones_inmutable() from public, anon, authenticated, service_role;

drop trigger if exists instalaciones_tocar      on public.instalaciones;
drop trigger if exists instalaciones_sin_borrar on public.instalaciones;
drop trigger if exists instalaciones_inmutable  on public.instalaciones;
create trigger instalaciones_tocar      before insert or update on public.instalaciones for each row execute function interno.tocar();
create trigger instalaciones_sin_borrar before delete          on public.instalaciones for each row execute function interno.sin_borrar();
create trigger instalaciones_inmutable  before update          on public.instalaciones for each row execute function interno.instalaciones_inmutable();

alter table public.instalaciones enable row level security;
revoke all on public.instalaciones from public, anon, authenticated, service_role;
grant select on public.instalaciones to authenticated;
grant select, insert, update on public.instalaciones to service_role;

-- Los tres roles las leen (Pagos ve el calendario con el filtro «solo días con cobro», que es de pantalla). Escribe `instalacion_guardar`.
drop policy if exists instalaciones_sel_todos on public.instalaciones;
create policy instalaciones_sel_todos on public.instalaciones for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.instalaciones replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'instalaciones') then
    alter publication supabase_realtime add table public.instalaciones;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 5. Partir `origen` en obra y dinero (R1)
-- -----------------------------------------------------------------------------------------------------
-- Hoy `proyectos.origen` es la copia congelada de la entrada del cotizador CON TODOS SUS PRECIOS, y Fabricación la necesita
-- para la orden de trabajo y el material. La base la PARTE en dos para que un cliente que mande `origen` completo no pueda
-- filtrarlo. La llaman `ganar_proyecto`, `descartar_cotizacion` y `proyecto_actualizar` (con `origen`, solo Dirección).
--   obra   = LISTA BLANCA (la ven los tres roles): RAIZ_OBRA e ITEM_OBRA de abajo.
--   dinero = todo lo demás (solo Dirección y Pagos): `precioAuth`, `neto`, `sub`, `anti`…, y por partida `_lt`, `pu`, `tarifa`…
-- `aiFile` queda `{name, type}` (las imágenes van a Storage; la `url` no se guarda). `caja_forma` se conserva solo si es un texto de
-- ≤ 20 caracteres y LA BASE NO LA DERIVA de `tarifa` (no copia el catálogo de precios). Todo lo que se quita se CONSERVA en
-- `dinero` para reconstruir el `origen` completo. Y la POSTCONDICIÓN `not contiene_dinero(obra)` hace que un hueco de la lista
-- blanca (p. ej. un `renders` con una clave de dinero) ABORTE en vez de guardar un precio.
create or replace function interno.solo_claves(j jsonb, p_claves text[]) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(e.key, e.value) filter (where e.key = any (p_claves)), '{}'::jsonb) from pg_catalog.jsonb_each(j) e $$;
revoke all on function interno.solo_claves(jsonb, text[]) from public, anon, authenticated, service_role;

create or replace function interno.sin_claves(j jsonb, p_claves text[]) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(e.key, e.value) filter (where e.key <> all (p_claves)), '{}'::jsonb) from pg_catalog.jsonb_each(j) e $$;
revoke all on function interno.sin_claves(jsonb, text[]) from public, anon, authenticated, service_role;

create or replace function interno.partir_origen(o jsonb) returns table (obra jsonb, dinero jsonb)
language plpgsql immutable set search_path = '' as $$
declare
  v_raiz text[] := array['folio','proy','cliente','tel','dirRaw','direccion','maps','entrecalles','entrega','notaCliente','fecha','plazoK',
                         'disp','fuente','iva','items','renders','propuesta','aiFile'];
  v_item text[] := array['id','tipo','material','matAuto','comp','luz','ilumTipo','altura','n','acab','recComp','bas','ancho','alto','pz','desc',
                         'descAi','textoAuto','showInPdf','plano','nManual','descAuto','medidaTipo','anchoMedido','opciones','caja_forma'];
  v_dado text[] := pg_catalog.array_remove(v_item, 'opciones');                       -- las opciones no se anidan a sí mismas
  v_obra jsonb; v_dinero jsonb; v_items jsonb := '[]'::jsonb; v_din_items jsonb := '{}'::jsonb;
  it jsonb; v_ord bigint; v_it jsonb; v_rest jsonb; v_op jsonb; v_lista jsonb; v_dl jsonb; e jsonb; v_d jsonb; v_opfuera jsonb;
begin
  if pg_catalog.jsonb_typeof(o) is distinct from 'object' then raise exception 'origen debe ser un objeto' using errcode = '22023'; end if;
  v_obra   := interno.solo_claves(o, v_raiz) - 'items' - 'aiFile';
  v_dinero := interno.sin_claves(o, v_raiz);
  if pg_catalog.jsonb_typeof(o -> 'aiFile') = 'object' then                                   -- las imágenes van a Storage: solo {name, type}
    v_obra := v_obra || pg_catalog.jsonb_build_object('aiFile', interno.solo_claves(o -> 'aiFile', array['name','type']));
  end if;
  if pg_catalog.jsonb_typeof(o -> 'items') = 'array' then
    for it, v_ord in select a.value, a.ordinality from pg_catalog.jsonb_array_elements(o -> 'items') with ordinality a loop
      if pg_catalog.jsonb_typeof(it) <> 'object' then continue; end if;
      v_it   := interno.solo_claves(it, v_item);
      v_rest := interno.sin_claves(it, v_item);                                                -- _lt, pu, tarifa, … lo que se quita de la partida
      if v_it ? 'caja_forma' and not (pg_catalog.jsonb_typeof(v_it -> 'caja_forma') = 'string' and pg_catalog.length(v_it ->> 'caja_forma') <= 20) then
        v_it := v_it - 'caja_forma';                                                           -- solo un texto corto que calculó el cliente
      end if;
      if pg_catalog.jsonb_typeof(v_it -> 'opciones') = 'object' then                           -- opciones: activa y lista; cada opción, k y d filtrada
        v_op := v_it -> 'opciones'; v_opfuera := interno.sin_claves(v_op, array['activa','lista']);
        v_lista := '[]'::jsonb; v_dl := '[]'::jsonb;
        if pg_catalog.jsonb_typeof(v_op -> 'lista') = 'array' then
          for e in select a.value from pg_catalog.jsonb_array_elements(v_op -> 'lista') a loop
            if pg_catalog.jsonb_typeof(e) = 'object' then
              v_d := e -> 'd';
              v_lista := v_lista || pg_catalog.jsonb_build_array(interno.solo_claves(e, array['k'])
                           || case when pg_catalog.jsonb_typeof(v_d) = 'object' then pg_catalog.jsonb_build_object('d', interno.solo_claves(v_d, v_dado)) else '{}'::jsonb end);
              v_dl    := v_dl    || pg_catalog.jsonb_build_array(interno.sin_claves(e, array['k','d'])
                           || case when pg_catalog.jsonb_typeof(v_d) = 'object' and interno.sin_claves(v_d, v_dado) <> '{}'::jsonb
                                   then pg_catalog.jsonb_build_object('d', interno.sin_claves(v_d, v_dado)) else '{}'::jsonb end);
            else
              v_lista := v_lista || pg_catalog.jsonb_build_array(e); v_dl := v_dl || pg_catalog.jsonb_build_array('{}'::jsonb);
            end if;
          end loop;
        end if;
        v_it := v_it || pg_catalog.jsonb_build_object('opciones', interno.solo_claves(v_op, array['activa']) || pg_catalog.jsonb_build_object('lista', v_lista));
        if v_opfuera <> '{}'::jsonb or exists (select 1 from pg_catalog.jsonb_array_elements(v_dl) x where x <> '{}'::jsonb) then
          v_rest := v_rest || pg_catalog.jsonb_build_object('opciones_fuera', pg_catalog.jsonb_build_object('raiz', v_opfuera, 'd', v_dl));   -- lo que se quitó, para reconstruir
        end if;
      end if;
      v_items := v_items || pg_catalog.jsonb_build_array(v_it);
      if v_rest <> '{}'::jsonb then v_din_items := v_din_items || pg_catalog.jsonb_build_object(coalesce(it ->> 'id', '#' || v_ord), v_rest); end if;
    end loop;
  end if;
  v_obra := v_obra || pg_catalog.jsonb_build_object('items', v_items);
  if v_din_items <> '{}'::jsonb then v_dinero := v_dinero || pg_catalog.jsonb_build_object('items', v_din_items); end if;
  if interno.contiene_dinero(v_obra) then                                                      -- si esto pasa, la lista blanca tiene un hueco: jamás se guarda
    raise exception 'La parte de obra de origen trae dinero: la lista blanca está incompleta' using errcode = 'P0001';
  end if;
  return query select v_obra, v_dinero;
end $$;
revoke all on function interno.partir_origen(jsonb) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 6. limpiar_cotizacion: lo que llega del teléfono, limpio
-- -----------------------------------------------------------------------------------------------------
-- Port de `limpiarCotizacion` del Apps Script (.gs:3530-3571). Solo lo que el precio y la pantalla de revisión necesitan: cualquier
-- otra llave se tira, y lo que se guarda es este objeto y no una copia de lo que alguien mandó. Devuelve la cotización limpia o
-- `{"error": "…"}` con el MISMO texto del .gs (la RPC `solicitar` lo contesta como DATO_INVALIDO).
--   · 1 a 80 partidas; cada una con `id` (número o texto de ≤ 40 caracteres, ÚNICO en la cotización);
--   · de cada partida SOLO los 14 campos de precio presentes (cada valor null, número, texto de ≤ 60 o booleano) y `desc` (≤ 300);
--   · `proyecto` y `cliente` sin espacios a los lados y de ≤ 140; `iva` booleano; `subtotal` un número finito;
--   · el resultado, de ≤ 100 000 caracteres.
-- En jsonb el orden de las llaves no se conserva y no importa: nada firmado depende de él (la huella se arma con los 14 campos en orden).
create or replace function interno.limpiar_cotizacion(c jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_campos text[] := array['tipo','material','comp','luz','altura','n','acab','recComp','bas','ancho','alto','tarifa','pz','pu'];
  it jsonb; o jsonb; k text; v jsonb; v_items jsonb := '[]'::jsonb; v_ids text[] := '{}'; v_id text; v_res jsonb; v_sub numeric; v_iva boolean;
begin
  if pg_catalog.jsonb_typeof(c) is distinct from 'object' then return pg_catalog.jsonb_build_object('error', 'Falta la cotización.'); end if;
  if pg_catalog.jsonb_typeof(c -> 'items') is distinct from 'array' or pg_catalog.jsonb_array_length(c -> 'items') = 0 then
    return pg_catalog.jsonb_build_object('error', 'La cotización no trae partidas.'); end if;
  if pg_catalog.jsonb_array_length(c -> 'items') > 80 then
    return pg_catalog.jsonb_build_object('error', 'Son demasiadas partidas para una cotización.'); end if;
  for it in select e.value from pg_catalog.jsonb_array_elements(c -> 'items') e loop
    if pg_catalog.jsonb_typeof(it) <> 'object' then return pg_catalog.jsonb_build_object('error', 'Una partida no se entiende.'); end if;
    if coalesce(pg_catalog.jsonb_typeof(it -> 'id'), '') not in ('number', 'string') or pg_catalog.length(coalesce(it ->> 'id', '')) > 40 then      -- sin llave: NULL no es «tiene id»
      return pg_catalog.jsonb_build_object('error', 'Una partida no trae identificador.'); end if;
    v_id := it ->> 'id';
    if v_id = any (v_ids) then return pg_catalog.jsonb_build_object('error', 'Dos partidas con el mismo identificador.'); end if;
    v_ids := v_ids || v_id;
    o := pg_catalog.jsonb_build_object('id', it -> 'id');
    foreach k in array v_campos loop
      if not (it ? k) then continue; end if;
      v := it -> k;
      if pg_catalog.jsonb_typeof(v) not in ('null', 'number', 'string', 'boolean') then
        return pg_catalog.jsonb_build_object('error', 'La partida ' || v_id || ' trae un dato raro en «' || k || '».'); end if;
      if pg_catalog.jsonb_typeof(v) = 'string' and pg_catalog.length(v #>> '{}') > 60 then
        return pg_catalog.jsonb_build_object('error', 'La partida ' || v_id || ' trae un texto demasiado largo en «' || k || '».'); end if;
      o := o || pg_catalog.jsonb_build_object(k, v);
    end loop;
    o := o || pg_catalog.jsonb_build_object('desc', pg_catalog.left(coalesce(it ->> 'desc', ''), 300));       -- `String(it.desc == null ? '' : it.desc).slice(0, 300)`
    v_items := v_items || pg_catalog.jsonb_build_array(o);
  end loop;
  -- `Number(c.subtotal)`: un número, o un texto que lo sea; cualquier otra cosa no es un subtotal
  begin
    v_sub := case when pg_catalog.jsonb_typeof(c -> 'subtotal') in ('number', 'string') and pg_catalog.btrim(c ->> 'subtotal') <> ''
                  then (c ->> 'subtotal')::numeric end;
  exception when others then v_sub := null; end;
  if v_sub is null then return pg_catalog.jsonb_build_object('error', 'La cotización trae un subtotal que no es un número.'); end if;
  -- `!!c.iva` de JavaScript: verdadero para true, números distintos de cero, textos no vacíos, objetos y arreglos
  v_iva := case pg_catalog.jsonb_typeof(c -> 'iva')
             when 'boolean' then (c -> 'iva')::boolean
             when 'number'  then (c ->> 'iva')::numeric <> 0
             when 'string'  then (c ->> 'iva') <> ''
             when 'object'  then true
             when 'array'   then true
             else false end;
  v_res := pg_catalog.jsonb_build_object(
             'proyecto', pg_catalog.left(pg_catalog.regexp_replace(coalesce(c ->> 'proyecto', ''), '^\s+|\s+$', '', 'g'), 140),
             'cliente',  pg_catalog.left(pg_catalog.regexp_replace(coalesce(c ->> 'cliente',  ''), '^\s+|\s+$', '', 'g'), 140),
             'iva', v_iva, 'subtotal', v_sub, 'items', v_items);
  if pg_catalog.length(v_res::text) > 100000 then
    return pg_catalog.jsonb_build_object('error', 'La cotización es demasiado grande. Divídela en dos cotizaciones.'); end if;
  return v_res;
end $$;
revoke all on function interno.limpiar_cotizacion(jsonb) from public, anon, authenticated, service_role;
