-- =====================================================================================================
-- 0018_cuadre_diario.sql — la bitácora de la COPIA DIARIA hoja → nube y su cuadre (decidido por Elías el 2026-10-16)
-- =====================================================================================================
-- El equipo sigue capturando directo en la hoja «Finanzas AL3D», así que la escritura en sombra no mantiene la nube al día. Elías
-- decidió (2026-10-16): cada madrugada el Apps Script de la hoja (puente/copia-diaria.gs) arma el volcado y se lo manda a la función
-- `importar-diario`, que corre el MISMO importador de la fase 2 (scripts/importador) dentro de UNA transacción y después el cuadre por
-- folio de cuadre.sql. Cada corrida deja aquí UN renglón: si se aplicó, si cuadró, cuántas diferencias y conflictos hubo. Siete días
-- seguidos cuadrando = la hoja puede pasar a solo lectura (ese día lo confirma Elías; Q-01).
--
-- Qué se guarda y qué NO. `resumen` lleva solo cuentas, nombres de pestaña, números de fila, folios V-### y nombres de columna: NUNCA
-- nombres, teléfonos ni importes de clientes (la función los quita antes; pruebas/supabase-importar-diario.mjs lo comprueba). Aun así
-- es información del negocio y solo la lee Dirección.
--
-- Quién puede qué:
--   · leer: solo Dirección de esa empresa (RLS), desde Ajustes;
--   · escribir: nadie desde la app. La función entra con la conexión que Supabase le inyecta (SUPABASE_DB_URL, el dueño `postgres`);
--     `service_role` puede INSERTAR por si algún día la función escribe por la API (tiene UPDATE por uniformidad con las demás tablas,
--     como la bitácora, y lo frena `solo_agregar`);
--   · cambiar o borrar: nadie. Es un libro (`solo_agregar`, `sin_borrar`, sin DELETE para ningún rol: lo exige la auditoría de 0011).
--
-- Una tabla nueva y ninguna función: las listas cerradas de 0011 no cambian y la auditoría debe seguir limpia (se corre al final).
-- Depende de: 0001…0017. Idempotente.
-- =====================================================================================================

create table if not exists public.cuadre_diario (
  id           bigint generated always as identity primary key,
  empresa_id   text not null references public.empresas (id),
  fecha        date not null default ((pg_catalog.now() at time zone 'America/Mexico_City')::date),   -- el día de México de la corrida
  hecho_en     timestamptz not null default pg_catalog.now(),
  aplicado     boolean not null,                              -- ¿se escribió la copia? (no, si el plan traía conflictos o filas que no entran)
  cuadra       boolean not null,
  diferencias  integer not null check (diferencias >= 0),     -- renglones del cuadre por folio (folio × columna)
  conflictos   integer not null check (conflictos >= 0),      -- los del plan más los que encontró la base
  rechazos     integer not null default 0 check (rechazos >= 0),   -- filas de la hoja que no entran
  resumen      jsonb not null default '{}'::jsonb
               check (pg_catalog.jsonb_typeof(resumen) = 'object' and pg_catalog.octet_length(resumen::text) <= 65536),
  duracion_ms  integer not null check (duracion_ms between 0 and 3600000),
  created_at   timestamptz not null default pg_catalog.now(),
  updated_at   timestamptz not null default pg_catalog.clock_timestamp(),
  -- «cuadra» es lo más estricto que hay: se aplicó, sin una diferencia, sin un conflicto y sin una fila fuera
  constraint cuadre_diario_cuadra check (not cuadra or (aplicado and diferencias = 0 and conflictos = 0 and rechazos = 0))
);
create index if not exists cuadre_diario_reciente on public.cuadre_diario (empresa_id, fecha desc, hecho_en desc);

-- Los mismos tres disparadores que la bitácora (0001): la hora de la fila, nada se borra y nada se edita.
drop trigger if exists cuadre_diario_tocar         on public.cuadre_diario;
drop trigger if exists cuadre_diario_sin_borrar    on public.cuadre_diario;
drop trigger if exists cuadre_diario_solo_agregar  on public.cuadre_diario;
create trigger cuadre_diario_tocar        before insert or update on public.cuadre_diario for each row execute function interno.tocar();
create trigger cuadre_diario_sin_borrar   before delete          on public.cuadre_diario for each row execute function interno.sin_borrar();
create trigger cuadre_diario_solo_agregar before update          on public.cuadre_diario for each row execute function interno.solo_agregar();

alter table public.cuadre_diario enable row level security;
revoke all on public.cuadre_diario from public, anon, authenticated, service_role;
grant select on public.cuadre_diario to authenticated;
grant select, insert, update on public.cuadre_diario to service_role;   -- (el UPDATE lo frena `solo_agregar`; el privilegio se da igual por uniformidad, como en la bitácora)

-- Solo Dirección la lee (Ajustes → Supabase: «cuadró X de 7 días»). Ninguna política de escritura: authenticated no tiene INSERT/UPDATE.
drop policy if exists cuadre_diario_sel_direccion on public.cuadre_diario;
create policy cuadre_diario_sel_direccion on public.cuadre_diario for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0018): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
