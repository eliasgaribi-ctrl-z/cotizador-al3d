-- =====================================================================================================
-- 0030_candado_volver_a_la_hoja.sql — VOLVER A LA HOJA, CON CANDADO (auditoría 2026-10-26, T1-5; decidido por Elías)
-- =====================================================================================================
-- Desde el 2026-10-25 la empresa está en 'base' (docs/BASE-MANDA.md): la app escribe en la base y la hoja se queda en solo lectura.
-- Hasta aquí, regresar era `modo_cambiar('hoja')` y nada más. Y regresar tiene un precio que no se veía: con la hoja mandando, la copia de
-- cada 3 horas (supabase/functions/importar-diario → scripts/importador/sql.mjs) vuelve a dejar la base COMO DICE LA HOJA. Todo lo que se
-- capturó en la base mientras mandaba —un cobro, una venta nueva con su V-### de la base, una cita, un cambio de etapa, un gasto, un
-- movimiento del almacén— no está en la hoja (el espejo a la hoja está apagado: puente/ESPEJO.md), así que la primera copia lo pisa: la
-- liquidación vuelve a la de la hoja, la etapa también, a los gastos que la hoja no tiene les pone lápida, y la venta nueva sale como
-- «conflicto» que nadie ve. Nada de eso avisaba: el cambio contestaba `ok` y el dinero se movía solo tres horas después.
--
-- LO QUE DECIDIÓ ELÍAS: volver a la hoja con candado. `modo_cambiar('hoja')` se NIEGA mientras la base tenga cambios hechos con la base
-- mandando que la hoja no tiene, y dice cuáles: cuántos, de qué tipo y sus folios. Sin nada pendiente, cambia como siempre.
--
-- QUÉ CUENTA COMO PENDIENTE: lo que la copia pisaría. Las tablas que escribe el importador, con algo hecho DESDE `empresas.modo_desde` (la
-- hora en que la base empezó a mandar; `modo_cambiar` la pone y el Editor SQL del paso 7 también):
--   · venta_nueva   proyectos con V-### creados desde entonces (`ganar_proyecto`, `alta_venta`)
--   · cobro         ventas de antes con su dinero cambiado (`registrar_cobro`, `corregir_venta`, el anticipo, la liquidación…)
--   · abono         abonos de comisión, repartos y correcciones (`registrar_abono_comision`, `repartir_abono_fifo`, `corregir_abono`)
--   · etapa         ventas de antes que cambiaron de etapa (la línea `etapa` de la bitácora: `mover_etapa`, `registrar_cobro` al instalar)
--   · cita          ventas de antes con su cita nueva o movida (`instalacion_guardar`)
--   · datos         ventas de antes con cualquier otro cambio (`proyecto_actualizar`: notas, teléfono, ubicación, entrega, plazo…)
--   · gasto         gastos registrados o anulados (`gasto_registrar`, `gasto_anular`)
--   · almacen       movimientos del almacén (`almacen_aplicar`)
--   · compra        renglones de la lista de compra (requerimientos)
--   · catalogo      materiales y constantes del catálogo
-- Una venta puede salir en más de un tipo (un cobro y un cambio de etapa): se nombra en los dos. «datos» es lo que sobra, para no repetir
-- una venta que ya salió por su cobro, su etapa o su cita (un cobro también le toca la fila del proyecto: el estatus).
--
-- QUÉ NO CUENTA, Y POR QUÉ: lo que la hoja no tiene pero la copia NO pisa, porque el importador no lo escribe o no lo sobrescribe —las
-- cotizaciones y sus imágenes (las sube cada teléfono; un talón de la hoja no pisa una completa, 0021), los clientes fiscales, las facturas y
-- las cuentas disponibles (0027: la copia ni conoce esas tablas), las personas y las pantallas—, y las tarifas, que con la base mandando ya
-- se copian a la pestaña «Tarifas» cada vez que Dirección las guarda (docs/BASE-MANDA.md, paso 4).
--
-- CÓMO SE QUITA EL CANDADO: no hay botón ni parámetro para saltárselo. El candado mira la HORA de cada cambio, no la hoja (la base no puede
-- leerla), así que pasar los cambios a la hoja a mano no lo abre: el regreso, ya con la hoja al día, lo hace el dueño en el Editor SQL, igual
-- que el paso 5 del día del cambio (docs/BASE-MANDA.md, «Cómo se regresa»). Así el regreso que mueve dinero queda siempre como una decisión
-- de Dirección hecha a propósito, después de leer la lista.
--
-- Y SI LA BASE NO SABE DESDE CUÁNDO MANDA (`modo_desde` vacío y sin línea `modo` en la bitácora: alguien la pasó a 'base' por SQL sin la
-- hora): no se puede saber qué cambios no tiene la hoja. Se niega con esa razón, en vez de contar como pendiente todo lo que la base tiene.
--
-- LA AUDITORÍA: ninguna función de `public` nueva y ninguna firma cambia (`modo_cambiar(text, text)` se reemplaza tal cual). La de `interno`
-- es nueva y no la ejecuta nadie más que su dueño (la llama `modo_cambiar`, SECURITY DEFINER): las listas cerradas de `interno.auditoria()`
-- (la de 0027) siguen correctas, y la aduana corre al final, como en cada migración.
--
-- Depende de: 0001…0028 (`empresas.modo` y `modo_desde` son de 0024; la bitácora, de 0001; los gastos, de 0020). Idempotente (create or
-- replace). Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. interno.pendientes_de_la_hoja: lo que la base tiene desde `p_desde` y la copia pisaría
-- -----------------------------------------------------------------------------------------------------
-- Devuelve {total, desde, tipos: [{tipo, n, nombre, folios, mas}], resumen}. `folios` son los primeros 20 (sin repetir, en orden); `mas`,
-- cuántos distintos quedaron fuera de la lista. `resumen` es la frase que lee Dirección: «2 cobros (V-210, V-215); 1 gasto (2026-10-26 Vinil)».
-- Los gastos sin folio de venta se nombran por su día y su concepto (los primeros 40 caracteres); los movimientos del almacén, por su material.
-- `>=` y no `>`: un cambio en el mismo instante que el paso a la base también cuenta (sobra decirlo de más; faltaría decirlo de menos).
create or replace function interno.pendientes_de_la_hoja(p_empresa text, p_desde timestamptz) returns jsonb
language plpgsql stable set search_path = '' as $$
declare r record; v_tipos jsonb := '[]'::jsonb; v_total integer := 0; v_partes text[] := '{}';
        c_tope constant integer := 20;
begin
  for r in
    with
      nuevas as (select p.id, p.folio_hoja as ref from public.proyectos p
                  where p.empresa_id = p_empresa and p.folio_hoja is not null and p.deleted_at is null and p.created_at >= p_desde),
      viejas as (select p.id, p.folio_hoja as ref, p.updated_at from public.proyectos p
                  where p.empresa_id = p_empresa and p.folio_hoja is not null and p.created_at < p_desde),
      cobros as (select v.id, v.ref from viejas v join public.ventas_dinero d on d.empresa_id = p_empresa and d.proyecto_id = v.id
                  where d.updated_at >= p_desde),
      etapas as (select distinct v.id, v.ref from viejas v join public.bitacora b
                     on b.empresa_id = p_empresa and b.entidad = 'proyecto' and b.entidad_id = v.id and b.accion = 'etapa'
                  where b.ts >= p_desde),
      citas  as (select distinct v.id, v.ref from viejas v join public.instalaciones i on i.empresa_id = p_empresa and i.proyecto_id = v.id
                  where i.updated_at >= p_desde),
      datos  as (select v.id, v.ref from viejas v
                  where v.updated_at >= p_desde
                    and v.id not in (select id from cobros union select id from etapas union select id from citas)),
      todo (orden, tipo, uno, varios, ref) as (
                  select 1, 'venta_nueva', 'venta nueva', 'ventas nuevas', ref from nuevas
        union all select 2, 'cobro', 'venta con cobro o cambio de dinero', 'ventas con cobros o cambios de dinero', ref from cobros
        union all select 3, 'abono', 'abono de comisión', 'abonos de comisión', a.folio_hoja from public.abonos a
                   where a.empresa_id = p_empresa and a.created_at >= p_desde
        union all select 4, 'etapa', 'cambio de etapa', 'cambios de etapa', ref from etapas
        union all select 5, 'cita', 'cita de instalación', 'citas de instalación', ref from citas
        union all select 6, 'datos', 'venta con otros datos cambiados', 'ventas con otros datos cambiados', ref from datos
        union all select 7, 'gasto', 'gasto', 'gastos', coalesce(nullif(g.folio, ''), g.fecha::text || ' ' || left(g.concepto, 40)) from public.gastos g
                   where g.empresa_id = p_empresa and g.updated_at >= p_desde
        union all select 8, 'almacen', 'movimiento del almacén', 'movimientos del almacén', m.material_id from public.almacen_movimientos m
                   where m.empresa_id = p_empresa and m.updated_at >= p_desde
        union all select 9, 'compra', 'renglón de la lista de compra', 'renglones de la lista de compra', coalesce(p.folio_hoja, q.proyecto_id)
                    from public.requerimientos q left join public.proyectos p on p.empresa_id = q.empresa_id and p.id = q.proyecto_id
                   where q.empresa_id = p_empresa and q.updated_at >= p_desde
        union all select 10, 'catalogo', 'material o constante del catálogo', 'materiales y constantes del catálogo', x.ref from (
                    select mt.id as ref from public.materiales mt where mt.empresa_id = p_empresa and mt.updated_at >= p_desde
                    union all
                    select k.clave from public.constantes k where k.empresa_id = p_empresa and k.updated_at >= p_desde) x)
    select t.orden, t.tipo, min(t.uno) as uno, min(t.varios) as varios, count(*)::int as n,
           count(distinct t.ref)::int as distintos, (array_agg(distinct t.ref order by t.ref))[1:c_tope] as folios
      from todo t group by t.orden, t.tipo order by t.orden
  loop
    v_total := v_total + r.n;
    v_tipos := v_tipos || jsonb_build_array(jsonb_build_object(
                 'tipo', r.tipo, 'n', r.n, 'nombre', case when r.n = 1 then r.uno else r.varios end,
                 'folios', to_jsonb(coalesce(r.folios, '{}'::text[])), 'mas', greatest(r.distintos - c_tope, 0)));
    v_partes := v_partes || (r.n::text || ' ' || case when r.n = 1 then r.uno else r.varios end ||
                             case when coalesce(cardinality(r.folios), 0) = 0 then ''
                                  else ' (' || array_to_string(r.folios, ', ') ||
                                       case when r.distintos > c_tope then ' y ' || (r.distintos - c_tope)::text || ' más' else '' end || ')' end);
  end loop;
  return jsonb_build_object('total', v_total, 'desde', p_desde, 'tipos', v_tipos, 'resumen', array_to_string(v_partes, '; '));
end $$;
-- Solo la llama `modo_cambiar` (SECURITY DEFINER, como su dueño): ningún rol de la aplicación la ejecuta (GR-08).
revoke all on function interno.pendientes_de_la_hoja(text, timestamptz) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. modo_cambiar: la de 0024, con el candado para volver a la hoja (marcado «0030:»)
-- -----------------------------------------------------------------------------------------------------
create or replace function public.modo_cambiar(p_modo text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_antes text; v_desde timestamptz; v_pend jsonb; v_n integer;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if coalesce(p_modo, '') not in ('hoja', 'base') then return interno.err('DATO_INVALIDO', 'El modo es «hoja» o «base».'); end if;
  select modo, modo_desde into v_antes, v_desde from public.empresas where id = (pre.c).empresa_id for update;
  if v_antes = p_modo then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true, 'modo', v_antes); end if;
  -- 0030: el candado. Con el FOR UPDATE de arriba puesto: `alta_venta` y `ganar_proyecto` leen el modo con FOR SHARE (0026, 0028) y esperan
  --       a que esto termine, así que una venta nueva no se cuela entre la cuenta y el cambio.
  if p_modo = 'hoja' then
    v_desde := coalesce(v_desde, (select max(b.ts) from public.bitacora b
                                   where b.empresa_id = (pre.c).empresa_id and b.accion = 'modo' and b.entidad = 'plataforma' and b.entidad_id = 'base'));
    if v_desde is null then
      return interno.err('DATO_INVALIDO', 'No se puede volver a la hoja: la base no sabe desde cuándo manda (falta la hora del cambio, empresas.modo_desde), ' ||
                                          'así que no puede decir qué cambios no tiene la hoja. Ver docs/BASE-MANDA.md, «Cómo se regresa».',
                         pg_catalog.jsonb_build_object('pendientes', null));
    end if;
    v_pend := interno.pendientes_de_la_hoja((pre.c).empresa_id, v_desde);
    v_n := (v_pend ->> 'total')::integer;
    if v_n > 0 then
      return interno.err('DATO_INVALIDO',
        'No se puede volver a la hoja: la base tiene ' || v_n::text || case when v_n = 1 then ' cambio hecho' else ' cambios hechos' end ||
        ' con la base mandando que la hoja no tiene, y la copia de cada 3 horas ' || case when v_n = 1 then 'lo pisaría' else 'los pisaría' end ||
        ': ' || (v_pend ->> 'resumen') || '. Primero pásalos a la hoja (docs/BASE-MANDA.md, «Cómo se regresa»).',
        pg_catalog.jsonb_build_object('pendientes', v_pend));
    end if;
  end if;
  update public.empresas set modo = p_modo, modo_desde = pg_catalog.now() where id = (pre.c).empresa_id;
  perform interno.anotar(pre.c, 'direccion', 'modo', 'plataforma', p_modo,
                         case p_modo when 'base' then 'La base pasa a mandar: la hoja ya no es la fuente'
                                     else 'La hoja vuelve a mandar: la base recibe la copia' end,
                         '', pg_catalog.jsonb_build_object('modo', v_antes), pg_catalog.jsonb_build_object('modo', p_modo));
  return pg_catalog.jsonb_build_object('ok', true, 'modo', p_modo);
end $$;
revoke all on function public.modo_cambiar(text, text) from public, anon, authenticated, service_role;
grant execute on function public.modo_cambiar(text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez (la auditoría de 0027: las listas cerradas no cambian)
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0030): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
