-- =====================================================================================================
-- 0020_gastos.sql — los GASTOS del negocio también en la nube (decidido por Elías el 2026-10-24)
-- =====================================================================================================
-- Desde el 2026-10-23 Control captura lo que sale del negocio (js/datos/gastos.js) y lo manda a la pestaña «Gastos» de la hoja
-- (puente-sheets-15, «LOS GASTOS» en puente/hoja-apps-script.gs). Elías fijó el 2026-10-24 que TODA la información de la plataforma
-- vive en Supabase (en Drive, solo los archivos de diseño), y los gastos eran lo único de dinero que no llegaba aquí. Esta migración
-- les da su casa; la copia diaria (scripts/importador) trae la pestaña cada madrugada, como las ventas y las tarifas.
--
--   · `public.gastos`: un renglón por gasto, con el MISMO id que en la hoja (`gas-…` lo pone el teléfono, `hoja-…` el puente a lo
--     tecleado a mano), así que el teléfono y la hoja y la nube hablan del mismo gasto. Las mismas reglas que `gastoValidar_` del .gs
--     (fecha, concepto de 1 a 200, monto mayor que cero y hasta diez millones, categoría de la lista) y la misma lectura que
--     `gastoDeHoja` del teléfono (la categoría que no está en la lista es «Otros»; la cuenta se queda como venga).
--   · Un gasto no se borra: se ANULA (`anulado`, quién y cuándo), como en la hoja. Y si alguien quita un renglón de la pestaña a mano,
--     la copia no lo borra aquí (`sin_borrar`): le pone `deleted_at` (la lápida de siempre, principio A.6) y se lo quita si vuelve.
--
-- Quién puede qué:
--   · leer: Dirección y Pagos de esa empresa (RLS), los que ven el dinero; Fabricación no (como `GASTOS_ROLES` del .gs);
--   · escribir: nadie desde la app todavía. Mientras la hoja manda, la escribe solo la copia diaria (el dueño `postgres`, por
--     SUPABASE_DB_URL). Las RPC para capturar y anular desde la plataforma llegan cuando se encienda Supabase en los teléfonos;
--     `service_role` tiene SELECT/INSERT/UPDATE por uniformidad con las demás tablas;
--   · borrar: nadie (`sin_borrar`, sin DELETE para ningún rol: lo exige la auditoría de 0011).
--
-- Es dinero: sin estadísticas en sus columnas de texto y fecha, como las tablas de dinero desde 0012 (M-6), para que un `EXPLAIN` de
-- Fabricación no revele cómo se reparten. No va a Realtime (la lista cerrada de 0011 no cambia).
--
-- Una tabla nueva y ninguna función: las listas cerradas de 0011 no cambian y la auditoría debe seguir limpia (se corre al final).
-- Depende de: 0001…0019. Idempotente.
-- =====================================================================================================

create table if not exists public.gastos (
  empresa_id     text not null references public.empresas (id),
  id             text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,79}$'),
  fecha          date not null check (fecha between date '2000-01-01' and date '2100-12-31'),   -- el día en que se pagó: decide el mes
  concepto       text not null check (pg_catalog.length(pg_catalog.btrim(concepto)) between 1 and 200),
  -- Las categorías, EN EL ORDEN DEL DESPLEGABLE: copia de CATEGORIAS de js/datos/gastos.js y de GASTO_CATEGORIAS del .gs
  -- (pruebas/gastos.mjs compara las cuatro, con la de scripts/importador/plan.mjs).
  categoria      text not null check (categoria in ('Material', 'Mano de obra', 'Renta y servicios', 'Herramienta',
                                                    'Transporte y gasolina', 'Publicidad', 'Comisiones y nómina', 'Otros')),
  monto          numeric(12,2) not null check (monto > 0 and monto <= 10000000),
  cuenta         text not null default '' check (pg_catalog.length(cuenta) <= 60),        -- de cuál salió; vacía = efectivo u otra
  folio          text not null default '' check (pg_catalog.length(folio) <= 40),         -- V-042 o COT-0042, si es de una venta
  registro_por   text not null default '' check (pg_catalog.length(registro_por) <= 200), -- nombre, rol y aparato de quien lo capturó
  registrado_en  timestamptz,
  anulado        boolean not null default false,
  anulo          text not null default '' check (pg_catalog.length(anulo) <= 200),
  anulado_en     timestamptz,
  subio          text not null default '' check (pg_catalog.length(subio) <= 200),        -- con qué cuenta entró a la hoja (la columna «Subió»)
  fila_hoja      integer check (fila_hoja is null or fila_hoja >= 2),
  procedencia    jsonb not null default '{}'::jsonb
                 check (pg_catalog.jsonb_typeof(procedencia) = 'object' and pg_catalog.octet_length(procedencia::text) <= 4096),
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.clock_timestamp(),
  deleted_at     timestamptz,                                                             -- ya no está en la hoja (la copia no borra)
  primary key (empresa_id, id),
  -- quién anuló y cuándo solo existen si está anulado (la lectura de la hoja ya los vacía si no)
  constraint gastos_anulacion check (anulado or (anulo = '' and anulado_en is null))
);
create index if not exists gastos_por_fecha on public.gastos (empresa_id, fecha);

drop trigger if exists gastos_tocar      on public.gastos;
drop trigger if exists gastos_sin_borrar on public.gastos;
create trigger gastos_tocar      before insert or update on public.gastos for each row execute function interno.tocar();
create trigger gastos_sin_borrar before delete          on public.gastos for each row execute function interno.sin_borrar();

alter table public.gastos enable row level security;
revoke all on public.gastos from public, anon, authenticated, service_role;
grant select on public.gastos to authenticated;
grant select, insert, update on public.gastos to service_role;

-- Los que ven el dinero (VE_EL_DINERO del .gs). Ninguna política de escritura: authenticated no tiene INSERT/UPDATE.
drop policy if exists gastos_sel_dinero on public.gastos;
create policy gastos_sel_dinero on public.gastos for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));

-- M-6 (0012): sin estadísticas en las columnas de texto y fecha. Fabricación tiene SELECT (la RLS le da 0 filas), y sin esto el
-- planificador estimaría con la distribución de TODAS las filas.
do $$ declare r record; begin
  for r in select a.attname
             from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'gastos'
              and a.attnum > 0 and not a.attisdropped and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype, 'date'::regtype) loop
    execute format('alter table public.gastos alter column %I set statistics 0', r.attname);
  end loop;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0020): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
