-- =====================================================================================================
-- 0031_material_en_mantenimiento.sql — con Material en mantenimiento, la base tampoco saca material del almacén
-- =====================================================================================================
-- Auditoría del 2026-10-26, frente T1-7 («Material en mantenimiento de verdad»). Material está en mantenimiento desde el 25-oct (decisión de
-- Elías, ratificada el 26: «un solo interruptor esconde avisos, pestaña, tarjeta del almacén y la alarma de conteo»): el interruptor único
-- es `MATERIAL_EN_MANTENIMIENTO` en js/datos/agenda.js. Escondía la pantalla, pero el almacén se seguía moviendo solo, y con la base mandando
-- cada salida va al libro COMPARTIDO. El teléfono ya no emite ninguna con el interruptor puesto (js/datos/proyectos.js); faltaba la base:
-- la salida del corte también la emite ella, dentro de `mover_etapa` y de `instalacion_guardar` cuando la obra cruza el corte
-- (`interno.mover_etapa_core` → `interno.emitir_salidas`, 0006), y la derivada en `emitir_salidas_derivadas` (0012). Marcar «Cortado» desde
-- el teléfono, o una instalación «hecha» de un proyecto en «Ganado», sacaba del almacén lo que diga la lista de compra de la base.
--
-- LA BASE NO TIENE UN INTERRUPTOR PROPIO, A PROPÓSITO: alguien tendría que acordarse de moverlo junto con el del teléfono, y el día que no,
-- uno de los dos descuenta solo. Lo que hace es OÍR el del teléfono. Mientras esté puesto, el relevo (js/datos/supa-relevo.js,
-- `conCabeceraDeMaterial`) manda en cada llamada la cabecera `x-al3d-material: mantenimiento` —como ya manda `x-al3d-contrato` (0002)—, y
-- `interno.emitir_salidas` no escribe nada si la oye. El día que se encienda Material, el teléfono deja de mandarla y la base vuelve a emitir
-- sin tocar esta migración.
--
-- Por qué así:
--   · una cabecera que la base no conoce no rompe nada. Si la app llega antes que esta migración, la base descuenta como antes; si la
--     migración llega antes, un teléfono viejo no manda la cabecera y la base descuenta como antes. Ningún orden de despliegue traba la
--     bandeja. Un parámetro nuevo en `mover_etapa` sí la trababa: un teléfono nuevo contra una base sin la migración recibiría «esa
--     función no existe» y la bandeja se detendría en esa operación, con todo lo de atrás esperando;
--   · `emitir_salidas` es la única que escribe la salida del corte y la derivada: las tres puertas quedan cubiertas con un solo cambio, sin
--     copiar ninguna de las tres RPC;
--   · el requerimiento NO se marca 'consumido': no salió nada del almacén, y decir que sí sería inventar un hecho que el libro no tiene.
--     La etapa, la cita y la bitácora del cambio de etapa se escriben igual (con «salieron 0 materiales», o sea, sin esa frase);
--   · lo que llegue sin la cabecera (la copia de cada 3 horas, que escribe directo; un teléfono que todavía no se actualizó) se porta como
--     siempre.
--
-- Lo otro del frente —una sola salida por requerimiento al cortar una venta de antes del cambio— se arregló del lado del teléfono, sin tocar
-- la base: el relevo traduce también el id de la salida (`mov-salida:<requerimiento de la base>`), y la de `mover_etapa` y la del teléfono
-- son el mismo renglón (supabase/tests/sync-e-importacion/una-salida-por-corte.mjs).
--
-- QUÉ CAMBIA: `interno.material_en_mantenimiento()` (nueva; sin privilegios para nadie: la llama `emitir_salidas`, que corre con los de la
-- RPC que la llama) y la copia íntegra de `interno.emitir_salidas` de 0006 con el cambio marcado «0031:». Ninguna firma pública, tabla ni
-- privilegio nuevo: las listas cerradas de la auditoría no cambian. Idempotente; termina corriendo la auditoría.
-- Prueba: supabase/tests/sync-e-importacion/material-en-mantenimiento.mjs (el teléfono de verdad, con su bandeja y su relevo, contra esta base).


-- -----------------------------------------------------------------------------------------------------
-- 1. ¿El teléfono que llama tiene Material en mantenimiento?
-- -----------------------------------------------------------------------------------------------------
-- Lee la cabecera que PostgREST deja en `request.headers` (llaves en minúsculas), igual que `x-al3d-contrato` en 0002. Sin petición de
-- PostgREST (la copia de cada 3 horas entra directo a la base) no hay cabeceras y es falso: lo de siempre.
create or replace function interno.material_en_mantenimiento() returns boolean language sql stable set search_path = '' as $$
  select coalesce((nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb) ->> 'x-al3d-material', '') = 'mantenimiento' $$;
revoke all on function interno.material_en_mantenimiento() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. interno.emitir_salidas (copia de 0006 con el cambio marcado «0031:»)
-- -----------------------------------------------------------------------------------------------------
-- La salida de material de un proyecto: una por requerimiento, idempotente por `mov-salida:<req.id>` (`ON CONFLICT DO NOTHING`): si otro teléfono
-- (o una llamada anterior) ya la emitió, solo se marca el requerimiento. Los `descartado` no se emiten; una línea en cero tampoco (ni desaparece);
-- `cantidad_ajustada`, si existe, MANDA sobre `cantidad_compra`. Devuelve cuántas salidas insertó. Corre con los privilegios de la RPC que la llama.
create or replace function interno.emitir_salidas(p public.proyectos, p_origen text, p_nota text, p_ctx interno.contexto_t) returns int
language plpgsql set search_path = '' as $$
declare r record; v_cant numeric; v_n int := 0; v_ins int; v_ts bigint := interno.ahora_ms(); v_correo text := coalesce(interno.correo_verificado(), '');
begin
  -- 0031: con Material en mantenimiento en el teléfono que llama, no sale nada del almacén ni se marca nada consumido
  if interno.material_en_mantenimiento() then return 0; end if;
  for r in select q.* from public.requerimientos q
            where q.empresa_id = p.empresa_id and q.proyecto_id = p.id and q.estado not in ('consumido', 'descartado')
            order by q.material_id loop
    v_cant := coalesce(r.cantidad_ajustada, r.cantidad_compra);
    if not (v_cant > 0) then continue; end if;
    insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo, proyecto_id,
                                            requerimiento_id, firma, ts, usuario_id)
    values (p.empresa_id, 'mov-salida:' || r.id, r.material_id, 'salida', -v_cant, r.unidad_compra, p_origen, coalesce(p_nota, ''), v_correo, coalesce(p_ctx.area, ''),
            'srv', p.id, r.id, v_correo || ' · ' || coalesce(p_ctx.area, '') || ' (srv)', v_ts, p_ctx.usuario_id)
    on conflict (empresa_id, id) do nothing;
    get diagnostics v_ins = row_count;
    update public.requerimientos set estado = 'consumido', sellos = sellos || pg_catalog.jsonb_build_object('estado', v_ts)
     where empresa_id = r.empresa_id and id = r.id;                                  -- uno por uno, como el cliente
    v_n := v_n + v_ins;
  end loop;
  return v_n;
end $$;
revoke all on function interno.emitir_salidas(public.proyectos, text, text, interno.contexto_t) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez (las listas cerradas no cambian)
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0031): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
