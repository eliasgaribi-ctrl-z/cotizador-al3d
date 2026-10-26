-- =====================================================================================================
-- 0028_auditoria_base.sql — lo que la auditoría del 2026-10-25 encontró en la base, con la base mandando
-- =====================================================================================================
-- La auditoría visual y funcional del día del cambio (docs/AUDITORIA-SUPABASE-2026-10.md) dejó tres arreglos del lado de la base. Elías pidió
-- aplicarlo todo («para que todo quede al 100 %») y se tomaron las decisiones recomendadas en el informe:
--
--   · CZ-1 Pagos registra desde el Cotizador una venta que NUNCA llegaba a la base. `ganar_proyecto` era solo de Dirección (su preámbulo y la
--     matriz de 0017), así que la bandeja del teléfono de Pagos la apartaba para siempre («Dala de alta desde el de Dirección») mientras el
--     recibo decía que el folio «llega solo». Pagos ya podía dar de alta una venta SIN cotización (`alta_venta`, Q-A03); ahora también la que
--     viene de una cotización. Fabricación sigue sin poder.
--   · DN-2 «Repartir un depósito» le pagaba comisión a ventas canceladas («No se dio»): la vista `comisiones_pendientes` (0004), que recorre el
--     reparto FIFO, no miraba la etapa. La pestaña Comisiones de Control sí las salta, así que las dos pantallas daban cifras distintas y el
--     reparto no se deshace. Elías ya había decidido que el reparto paga aunque la venta no esté LIQUIDADA; las canceladas, no.
--   · DN-3 (lo mínimo) `registrar_cobro` PISABA `fecha_liquidacion` con la fecha del último cobro capturado, aunque fuera más vieja: capturar
--     hoy un cobro olvidado de septiembre mandaba toda la liquidación de la venta a septiembre y el «Disponible» de octubre bajaba.
--
-- Y una que la auditoría pedía y NO hace falta (dicho para que nadie la busque aquí):
--   · CZ-5 «el IVA lo manda la cuenta» al ganar. Ya era así desde 0006: `ganar_proyecto` llama a `interno.normalizar_iva` después de escribir la
--     venta, igual que `alta_venta`, `corregir_venta` y `registrar_cobro` (una venta en Elias BBVA queda sin IVA aunque la cotización lo traiga;
--     una LIQUIDADA no se toca). Lo comprueba supabase/tests/obra-y-etapas/ganar-y-alta.mjs («el IVA lo manda la cuenta») y, con Pagos,
--     supabase/tests/pagos/auditoria-0028.mjs (A28-05). Lo que estaba mal era el TEXTO del Cotizador, que decía «la hoja le quita el IVA».
--
-- QUÉ CAMBIA (copias íntegras con el cambio marcado «0028:», el patrón de 0013–0017):
--   1. interno.matriz_permisos   la de 0017, con `pagos.alta.ganar_proyecto = true`. `mi_acceso()` se la entrega al teléfono como `permisos`,
--                                así que el relevo de Pagos (js/datos/supa-relevo.js, `porArea`) deja de apartar la venta sin otro cambio.
--   2. public.ganar_proyecto     la de 0015, con tres cambios:
--        · el preámbulo admite a Pagos (la matriz es lo que lee el teléfono; el preámbulo, lo que decide la base);
--        · Pagos, solo con la base mandando (como `alta_venta` desde 0026): con la empresa en 'hoja' la venta se registra en la hoja, y aquí
--          gastaría un V-### del contador de la base que la hoja no conoce. Mismo orden que 0026: el área, la validación, «ya existía» (el
--          reintento de una venta que SÍ entró dice la verdad aunque ya se haya vuelto a la hoja) y entonces el modo, con FOR SHARE frente al
--          FOR UPDATE de `modo_cambiar`. DATO_INVALIDO definitivo, por la misma razón que en 0026. Dirección no cambia: con la hoja mandando la
--          sombra la sigue usando con el V-### de la hoja (0015);
--        · la cita que trae la venta nace `confirmada` si la da Dirección y `propuesta` si la da Pagos, como en `alta_venta`: Pagos no confirma
--          la agenda (en la matriz su `instalacion` es null);
--        · lo encontró la prueba de este archivo y venía desde 0006: el reintento de un «Se ganó» que SÍ entró CON su cita (la respuesta se
--          perdió: lo normal con mala señal) preguntaba «¿ese id de instalación ya existe?» ANTES de «ya existía», encontraba su propia cita y
--          contestaba DATO_INVALIDO definitivo. La bandeja lo apartaba y el teléfono nunca recibía su V-###. Ahora esa pregunta va después de
--          «ya existía» (y del modo), como en `alta_venta` desde 0026, y el reintento contesta «ya existía» con el mismo folio.
--   3. public.registrar_cobro    la de 0012: la fecha de liquidación solo AVANZA (`greatest`). La liquidación sigue siendo una cifra acumulada
--                                con la fecha del cobro más reciente; contar cada cobro en su mes es trabajo del teléfono (las líneas `cobro:<op>`
--                                de la bitácora ya traen monto y fecha).
--   4. public.comisiones_pendientes  la de 0004, sin las ventas en `cancelado`. La usan `interno.calcular_reparto` (y con ella
--                                `vista_previa_reparto` y `repartir_abono_fifo`). Las mismas columnas, `security_invoker` y los mismos GRANT.
--                                Una fila histórica (sin etapa) sigue entrando, como antes. `ventas_calculadas` no cambia: su T sigue siendo el
--                                de la hoja, y el cuadre (0010, `cuadre_hoja`) suma lo mismo que antes.
--
-- LA COPIA DE CADA 3 HORAS no depende de nada de esto: escribe proyectos, ventas_dinero, abonos… directo con service_role
--   (scripts/importador/sql.mjs, supabase/functions/importar-diario/copia.js) y nunca llama a `ganar_proyecto`, `registrar_cobro` ni a la vista;
--   con la empresa en 'base' ni siquiera aplica.
--
-- LA AUDITORÍA: ninguna función, tabla, vista ni publicación nueva; ninguna firma cambia. Las listas cerradas de `interno.auditoria()` (la de 0027)
--   siguen siendo correctas tal cual, y la aduana corre al final, como en cada migración.
--
-- Depende de: 0001…0027 (`empresas.modo` es de 0024). Idempotente (create or replace). Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La matriz de permisos (CZ-1): Pagos da de alta la venta que viene de una cotización
-- -----------------------------------------------------------------------------------------------------
-- La fuente única de 0002 (mi_acceso() la entrega al cliente). Solo cambia `pagos.alta.ganar_proyecto`.
create or replace function interno.matriz_permisos() returns jsonb language sql immutable set search_path = '' as $$
  -- 0017: «etapas» de Fabricación y de Pagos = todas menos «cancelado», en origen y en destino (Q-05, Elías, 2026-10-16).
  -- 0028: Pagos `ganar_proyecto` = true (CZ-1, auditoría del 2026-10-25): la venta del Cotizador entra a la base desde su teléfono, como ya
  --       entraba la venta sin cotización (`alta_venta`). Solo con la base mandando: lo decide `ganar_proyecto`, no la matriz.
  select '{
    "direccion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles",
                              "ubicacion_pendiente","contacto","negocio","tipo_trabajo","compromiso_texto","fecha_anticipo","origen"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision","iva"],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"]},
      "instalacion": "confirmada",
      "alta": {"ganar_proyecto": true, "descartar_cotizacion": true, "alta_venta": true},
      "ve_dinero": true
    },
    "fabricacion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles","ubicacion_pendiente"],
      "corregir_venta": [],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"]},
      "instalacion": "propuesta",
      "alta": {"ganar_proyecto": false, "descartar_cotizacion": false, "alta_venta": false},
      "ve_dinero": false
    },
    "pagos": {
      "proyecto_actualizar": ["notas","tel"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision"],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"]},
      "instalacion": null,
      "alta": {"ganar_proyecto": true, "descartar_cotizacion": false, "alta_venta": true},
      "ve_dinero": true
    }
  }'::jsonb $$;
revoke all on function interno.matriz_permisos() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. ganar_proyecto (CZ-1): Pagos entra, solo con la base mandando; su cita nace propuesta
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0015 con los cambios marcados «0028:». Lo demás —validación, idempotencia por id y folio de cotización, el folio de la hoja, la
-- entrada partida, la venta, el IVA que pone la cuenta (`normalizar_iva`), la bitácora— es idéntico.
create or replace function public.ganar_proyecto(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_id text; v_fg text; v_venta jsonb; v_nombre text; e public.proyectos; v_obra jsonb; v_din jsonb; v_folio text;
  v_ahora bigint := interno.ahora_ms(); v_sub numeric; v_anti numeric; v_liq numeric; v_cuenta text; v_estatus text; v_iva boolean; v_pct numeric; v_prec numeric;
  v_tel text; v_tipo text[]; v_entrega text; v_plazo smallint; v_lat double precision; v_lng double precision; v_fant date; v_fliq date; v_notas text;
  v_finst date; v_hora text; v_inst_id text; v_sellos jsonb; v_disp text; v_vtipo jsonb; v_neto numeric;
  v_folio_pedido text; v_otro text;      -- 0015
  v_modo text;                           -- 0028
begin
  -- 0028: Dirección y Pagos (antes, solo Dirección). Fabricación sigue recibiendo ROL_SIN_PERMISO, sin mirar el modo.
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := p_op ->> 'id'; v_fg := p_op ->> 'folio_global'; v_venta := coalesce(p_op -> 'venta', '{}'::jsonb); v_nombre := p_op ->> 'nombre';
  -- validar (todo antes de escribir)
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id del proyecto no es válido.'); end if;
  if v_fg is null or v_fg !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El folio de la cotización necesita su aparato (COT-0042-B@K7QM).'); end if;
  if pg_catalog.btrim(coalesce(v_nombre, '')) = '' or pg_catalog.length(v_nombre) > 2000 then return interno.err('DATO_INVALIDO', 'Falta el nombre del proyecto.'); end if;
  if pg_catalog.jsonb_typeof(v_venta) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'Los datos de la venta están mal formados.'); end if;
  v_sub := interno.num(v_venta -> 'sub');
  if v_sub is null then return interno.err('DATO_INVALIDO', 'El subtotal de la venta debe ser un número.'); end if;
  v_cuenta := nullif(v_venta ->> 'cuenta', '');
  if v_cuenta is not null and v_cuenta <> all (array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']) then
    return interno.err('DATO_INVALIDO', 'La cuenta no es una de las cuentas de AL3D.'); end if;
  v_estatus := coalesce(nullif(v_venta ->> 'estatus', ''), 'FABRICACION');
  if v_estatus <> all (array['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']) then return interno.err('DATO_INVALIDO', 'El estatus de cobro no existe.'); end if;
  v_anti := coalesce(interno.num(v_venta -> 'anti'), 0);
  if v_anti < 0 then return interno.err('DATO_INVALIDO', 'El anticipo no puede ser negativo.'); end if;
  v_pct := coalesce(interno.num(v_venta -> 'pct_comision'), 10);
  if v_pct < 0 or v_pct > 100 then return interno.err('DATO_INVALIDO', 'El porcentaje de comisión va de 0 a 100.'); end if;
  v_prec := interno.num(v_venta -> 'precio_auth');
  v_iva := case when pg_catalog.jsonb_typeof(v_venta -> 'iva') = 'boolean' then (v_venta ->> 'iva')::boolean else true end;
  v_neto := interno.neto(v_sub, v_iva);
  if v_venta ? 'liquidacion' and pg_catalog.jsonb_typeof(v_venta -> 'liquidacion') <> 'null' then
    v_liq := interno.num(v_venta -> 'liquidacion');
    if v_liq is null or v_liq < 0 then return interno.err('DATO_INVALIDO', 'La liquidación no puede ser negativa.'); end if;
  else
    v_liq := case when v_estatus = 'LIQUIDADO' then greatest(0, v_neto - v_anti) else 0 end;      -- el modal con estatus LIQUIDADO
  end if;
  v_fliq := interno.fecha_json(v_venta -> 'fecha_liquidacion');
  v_tel := coalesce(interno.telefono_limpio(p_op ->> 'tel'), '');
  if p_op ? 'tipo_trabajo' and pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'null' then
    if pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'array' or exists (select 1 from pg_catalog.jsonb_array_elements(p_op -> 'tipo_trabajo') x where pg_catalog.jsonb_typeof(x) <> 'string') then
      return interno.err('DATO_INVALIDO', 'Los tipos de trabajo deben ser una lista de textos.'); end if;
    v_tipo := array(select pg_catalog.jsonb_array_elements_text(p_op -> 'tipo_trabajo'));
    if not (v_tipo <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion','Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']) then
      return interno.err('DATO_INVALIDO', 'Uno de los tipos de trabajo no existe.'); end if;
  else v_tipo := '{}'; end if;
  v_entrega := nullif(p_op ->> 'entrega', '');
  if v_entrega is not null and v_entrega <> all (array['instalacion','paqueteria','recoleccion']) then return interno.err('DATO_INVALIDO', 'La forma de entrega no existe.'); end if;
  if p_op ? 'plazo_k' and pg_catalog.jsonb_typeof(p_op -> 'plazo_k') <> 'null' then
    if interno.num(p_op -> 'plazo_k') is null or interno.num(p_op -> 'plazo_k') <> pg_catalog.trunc(interno.num(p_op -> 'plazo_k')) or interno.num(p_op -> 'plazo_k') not between 1 and 5 then
      return interno.err('DATO_INVALIDO', 'El plazo de taller va de 1 a 5.'); end if;
    v_plazo := interno.num(p_op -> 'plazo_k')::smallint;
  end if;
  v_lat := interno.num(p_op -> 'lat'); v_lng := interno.num(p_op -> 'lng');
  if v_lat is not null or v_lng is not null then
    if v_lat is null or v_lng is null or abs(v_lat) > 90 or abs(v_lng) > 180 or (v_lat = 0 and v_lng = 0) then
      return interno.err('DATO_INVALIDO', 'Las coordenadas no son válidas.'); end if;
  end if;
  v_notas := coalesce(p_op ->> 'notas', '');
  if pg_catalog.length(v_notas) > 40000 or pg_catalog.length(coalesce(p_op ->> 'dir_texto', '')) > 2000 then return interno.err('DATO_INVALIDO', 'Un texto del proyecto es demasiado largo.'); end if;
  v_fant := coalesce(interno.fecha_json(p_op -> 'fecha_anticipo'), interno.hoy_mx());
  v_disp := coalesce(p_op ->> 'dispositivo', '');
  if v_disp !~ '^[A-Za-z0-9_-]{0,24}$' then return interno.err('DATO_INVALIDO', 'El aparato no es válido.'); end if;
  -- 0015: el V-### que la hoja ya le dio a esta venta (lo manda la sombra). Opcional; si viene, escrito como lo escribe la base (V-042, V-1000).
  if p_op ? 'folio_hoja' and pg_catalog.jsonb_typeof(p_op -> 'folio_hoja') <> 'null' then
    if pg_catalog.jsonb_typeof(p_op -> 'folio_hoja') <> 'string' or (p_op ->> 'folio_hoja') !~ '^V-[0-9]{3,7}$'
       or (p_op ->> 'folio_hoja') <> interno.folio_texto('V', pg_catalog.substr(p_op ->> 'folio_hoja', 3)::bigint) then
      return interno.err('DATO_INVALIDO', 'El folio de la hoja no tiene el formato del libro (V- y el número con al menos tres dígitos: V-042).'); end if;
    v_folio_pedido := p_op ->> 'folio_hoja';
  end if;
  v_finst := interno.fecha_json(p_op -> 'fecha_instalacion');
  if p_op ? 'fecha_instalacion' and pg_catalog.jsonb_typeof(p_op -> 'fecha_instalacion') <> 'null' and v_finst is null then
    return interno.err('DATO_INVALIDO', 'La fecha de instalación no es válida.'); end if;
  if v_finst is not null then
    v_hora := p_op ->> 'hora';
    if v_hora is not null and v_hora <> '' then
      if v_hora !~ '^[0-9]{1,2}:[0-9]{2}$' then return interno.err('DATO_INVALIDO', 'La hora de instalación no es válida.'); end if;
      v_hora := pg_catalog.lpad(pg_catalog.split_part(v_hora, ':', 1), 2, '0') || ':' || pg_catalog.split_part(v_hora, ':', 2);
      if v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return interno.err('DATO_INVALIDO', 'La hora de instalación no es válida.'); end if;
    else v_hora := null; end if;
    v_inst_id := coalesce(nullif(p_op ->> 'instalacion_id', ''), 'inst-' || v_id);
    if v_inst_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id de la instalación no es válido.'); end if;
    -- 0028: «Ese id de instalación ya existe» se pregunta más abajo, DESPUÉS de «ya existía» (como en alta_venta, 0026). Aquí, el reintento de un
    --       «Se ganó» que SÍ entró con su cita (la respuesta se perdió) encontraba su propia cita y contestaba DATO_INVALIDO definitivo: la bandeja
    --       lo apartaba y el teléfono nunca recibía su V-###.
  end if;
  -- serializa dos «Se ganó» de la misma cotización
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':' || v_fg, 0));
  select * into e from public.proyectos x where x.empresa_id = c.empresa_id and x.folio_global = v_fg;
  if found then
    if e.id = v_id and e.folio_hoja is not null then      -- reintento idempotente: NO mueve la etapa
      return pg_catalog.jsonb_build_object('ok', true, 'ya_existia', true, 'proyecto_id', e.id, 'folio_hoja', e.folio_hoja)
             || case when v_folio_pedido is not null and v_folio_pedido <> e.folio_hoja      -- 0015: lo dice, sin cambiar nada
                     then pg_catalog.jsonb_build_object('folio_hoja_pedido', v_folio_pedido) else '{}'::jsonb end; end if;
    return interno.err('DUPLICADO', 'Esa cotización ya es otro proyecto.', pg_catalog.jsonb_build_object('proyecto_id', e.id));
  end if;
  if exists (select 1 from public.proyectos x where x.id = v_id) then return interno.err('DATO_INVALIDO', 'Ese id de proyecto ya existe.'); end if;
  -- 0028: Pagos, solo con la base mandando (CZ-1). Con la hoja, la venta se registra en la hoja: aquí saldría con un V-### que la hoja no conoce.
  --       Después de «ya existía» (el reintento de una que SÍ entró dice la verdad) y antes de escribir nada y de repartir el folio; FOR SHARE frente
  --       al FOR UPDATE de modo_cambiar. Dirección no cambia (con la hoja mandando, la sombra la usa con el V-### de la hoja: 0015).
  if c.area = 'pagos' then
    select x.modo into v_modo from public.empresas x where x.id = c.empresa_id for share;
    if v_modo is distinct from 'base' then
      return interno.err('DATO_INVALIDO', 'La empresa todavía trabaja con la hoja: la venta se registra en la hoja. '
                                          || 'Aquí saldría con un V-### que la hoja no conoce.');
    end if;
  end if;
  -- 0028: aquí, después de «ya existía» (arriba, en la validación, solo el formato del id).
  if v_finst is not null and exists (select 1 from public.instalaciones i where i.id = v_inst_id) then
    return interno.err('DATO_INVALIDO', 'Ese id de instalación ya existe.'); end if;
  -- la entrada se parte en obra (los tres roles) y dinero (Dirección y Pagos)
  if pg_catalog.jsonb_typeof(p_op -> 'entrada') = 'object' then select o.obra, o.dinero into v_obra, v_din from interno.partir_origen(p_op -> 'entrada') o;
  else select o.obra, o.dinero into v_obra, v_din from interno.partir_origen('{}'::jsonb) o; end if;
  -- 0015: con el folio de la hoja, ese (si nadie lo tiene); sin él, el del contador, como siempre. Al insertar, el trigger
  -- proyectos_folio_contador sube el contador hasta el folio de la hoja.
  if v_folio_pedido is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':folio:' || v_folio_pedido, 0));
    select x.id into v_otro from public.proyectos x where x.empresa_id = c.empresa_id and x.folio_hoja = v_folio_pedido;
    if found then
      return interno.err('DATO_INVALIDO', 'El folio ' || v_folio_pedido || ' de la hoja ya es de otro proyecto en la base: la venta no se da de alta con un folio repetido.',
                         pg_catalog.jsonb_build_object('causa', 'folio_ocupado', 'folio_hoja', v_folio_pedido, 'proyecto_id', v_otro));
    end if;
    v_folio := v_folio_pedido;
  else
    v_folio := interno.folio_texto('V', interno.siguiente(c.empresa_id, 'V', '', 1));     -- nunca se reparte dos veces
  end if;
  v_sellos := interno.sellos_limpios(p_op -> 'sellos', v_ahora);
  v_vtipo := pg_catalog.jsonb_build_object('sub', v_sub, 'neto', v_neto, 'anti', v_anti, 'iva', v_iva, 'precio_auth', v_prec);
  insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel, etapa, tipo_trabajo,
                                fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k, notas,
                                estatus, iva, sellos, origen_obra, creado_por)
  values (v_id, c.empresa_id, v_folio, v_fg, coalesce(p_op ->> 'folio_local', ''), v_disp, 'cotizacion', false, v_nombre, coalesce(p_op ->> 'contacto', ''),
          coalesce(p_op ->> 'negocio', ''), v_tel, 'ganado', v_tipo, v_fant, coalesce(p_op ->> 'compromiso_texto', ''), coalesce(p_op ->> 'dir_texto', ''),
          coalesce(p_op ->> 'entrecalles', ''), coalesce(p_op ->> 'maps_url', ''), v_lat, v_lng, coalesce(p_op ->> 'geo_fuente', ''),
          case when pg_catalog.jsonb_typeof(p_op -> 'ubicacion_pendiente') = 'boolean' then (p_op ->> 'ubicacion_pendiente')::boolean else false end,
          v_entrega, v_plazo, v_notas, v_estatus, v_iva, v_sellos, v_obra, c.usuario_id);
  insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth, origen_dinero)
  values (v_id, c.empresa_id, v_sub, v_anti, v_liq, v_cuenta, v_fliq, v_pct, v_prec, v_din || pg_catalog.jsonb_build_object('venta', v_vtipo));
  perform interno.normalizar_iva(v_id);
  if v_finst is not null then
    -- 0028: `confirmada` si la da Dirección, `propuesta` si la da Pagos (como en alta_venta: Pagos no confirma la agenda).
    insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, creado_por)
    values (v_inst_id, c.empresa_id, v_id, v_finst, v_hora, 'dia', 180, case when c.area = 'direccion' then 'confirmada' else 'propuesta' end, 0,
            'inst-' || v_inst_id || '@al3d.mx', c.usuario_id);
  end if;
  perform interno.anotar(c, 'general', 'gano', 'proyecto', v_id, 'Se ganó ' || v_nombre);
  perform interno.anotar(c, 'dinero', 'gano', 'venta', v_id, 'Venta ganada ' || v_folio, '', null,
                         pg_catalog.jsonb_build_object('subtotal', v_sub, 'anticipo', v_anti, 'cuenta', v_cuenta, 'estatus', v_estatus, 'precio_auth', v_prec));
  return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v_id, 'folio_hoja', v_folio);
end $$;
revoke all on function public.ganar_proyecto(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.ganar_proyecto(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 3. registrar_cobro (DN-3): la fecha de liquidación solo avanza
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0012 con el cambio marcado «0028:». Lo demás —0 < monto < 1e9, idempotente por op_id, la liquidación ACUMULATIVA, LIQUIDADO y la etapa
-- por cobro, el IVA por cuenta, la bitácora— es idéntico.
create or replace function public.registrar_cobro(p_proyecto text, p_monto numeric, p_fecha date default null, p_liquidar boolean default true,
                                                  p_op_id text default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; d public.ventas_dinero; r jsonb; v_saldo numeric; v_resp jsonb; v_fecha date; v_antes jsonb; v_est text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_monto is null or p_monto <= 0 or p_monto >= 1000000000 then
    return interno.err('DATO_INVALIDO', 'Un cobro es un importe mayor a cero; para corregir usa la corrección de la venta.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.folio_hoja is not null and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Esa venta no existe en el libro.'); end if;
  select * into d from public.ventas_dinero x where x.empresa_id = p.empresa_id and x.proyecto_id = p.id for update;
  if p_op_id is not null then
    select b.resultado into r from public.bitacora b where b.empresa_id = p.empresa_id and b.op_id = 'cobro:' || p_op_id;
    if found and r is not null then return r; end if;       -- idempotente: Liquidación es ACUMULATIVA
  end if;
  v_fecha := coalesce(p_fecha, interno.hoy_mx());
  v_antes := pg_catalog.jsonb_build_object('liquidacion', d.liquidacion, 'fecha_liquidacion', d.fecha_liquidacion, 'estatus', p.estatus);
  -- 0028: la fecha del cobro MÁS RECIENTE, no la del último que se capturó (DN-3): un cobro olvidado que se captura hoy con su fecha vieja no
  --       manda toda la liquidación a ese mes. `greatest` ignora el null: una venta sin fecha toma la del cobro.
  update public.ventas_dinero set liquidacion = liquidacion + p_monto, fecha_liquidacion = greatest(fecha_liquidacion, v_fecha) where proyecto_id = p.id;
  if coalesce(p_liquidar, true) then
    update public.proyectos set estatus = 'LIQUIDADO' where id = p.id;
    perform interno.etapa_por_cobro(p.id, pre.c);
  else
    perform interno.normalizar_iva(p.id);
  end if;
  select round(interno.neto(y.subtotal, x.iva) - y.anticipo - y.liquidacion, 2), x.estatus, y.liquidacion, y.fecha_liquidacion
    into v_saldo, v_est, d.liquidacion, d.fecha_liquidacion
    from public.proyectos x join public.ventas_dinero y on y.proyecto_id = x.id where x.id = p.id;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'liquidacion', d.liquidacion, 'saldo', v_saldo, 'estatus', v_est, 'fecha_liquidacion', d.fecha_liquidacion,
                                          'en_ceros', v_saldo <= 0.004);
  perform interno.anotar(pre.c, 'dinero', 'cobro', 'venta', p.id, 'Cobro de ' || interno.pesos(p_monto) || ' registrado en ' || p.folio_hoja, '', v_antes,
                         pg_catalog.jsonb_build_object('liquidacion', d.liquidacion, 'fecha_liquidacion', d.fecha_liquidacion, 'estatus', v_est),
                         case when p_op_id is not null then 'cobro:' || p_op_id end, v_resp);
  return v_resp;
end $$;
revoke all on function public.registrar_cobro(text, numeric, date, boolean, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_cobro(text, numeric, date, boolean, text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 4. comisiones_pendientes (DN-2): sin las ventas canceladas
-- -----------------------------------------------------------------------------------------------------
-- La de 0004 (`pendientesFIFO` del .gs: el reparto recorre `numero_folio` de menor a mayor), con el cambio marcado. Mismas columnas, en el mismo
-- orden (`create or replace view` no deja quitar ni mover columnas), `security_invoker` y los mismos GRANT.
create or replace view public.comisiones_pendientes with (security_invoker = true) as
select v.empresa_id, v.a_folio as folio, v.b_proyecto as nombre, v.t_restante as pend,
       (substring(v.a_folio from 3))::int as numero_folio
  from public.ventas_calculadas v
 where v.t_restante > 0.004
   -- 0028: una venta «No se dio» no paga comisión (DN-2). `is distinct from`: una fila histórica, sin etapa, sigue entrando como antes.
   and v.etapa is distinct from 'cancelado';

-- Solo Dirección y Pagos la leen (la RLS de las tablas base ya deja a Fabricación sin filas); `anon` nada; `service_role` sí (las Edge Functions).
revoke all on public.comisiones_pendientes from public, anon, authenticated, service_role;
grant select on public.comisiones_pendientes to authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez (la auditoría de 0027: las listas cerradas no cambian)
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0028): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
