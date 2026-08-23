Repo verified: 6 files, `index.html` at 689 KB / 10 075 líneas, `sw.js` con `CACHE='al3d-v1'` y `BASICOS` de 5 entradas, registro en L8694. Y encontré algo que cambia el diagnóstico: **el eslabón perdido no falta, está a medio construir en producción** (L8769 `copiarFilaVenta`). Lo cito abajo.

---

# Plataforma AL3D — arquitectura

## 1. Tesis

Este usuario ya intentó exactamente lo que pide y fracasó, y el fracaso está medido: la copia (B) de Notion tiene el calendario de instalaciones, el mapa por `Ubicación entrega` y el `Tipo de proyecto` de 7 valores, con **0 de 142 filas llenas** en `Tipo de proyecto`, **0 de 142** en `Cliente` y **1 fila** en `Registro de clientes`. No le faltó esquema: le faltó que los datos llegaran solos. Por eso la arquitectura correcta aquí no se define por su base de datos sino por su **presupuesto de captura humana**, y ese presupuesto es de aproximadamente tres toques por proyecto ganado — unos 5 proyectos al mes, según los 199 de tres años. Ahora bien: dentro de ese presupuesto sí hace falta un backend relacional con autenticación y RLS, y no por elegancia. Hace falta porque tres departamentos van a escribir sobre el mismo registro desde tres dispositivos, y el inventario es el único dato del sistema en el que **dos escrituras concurrentes no producen una versión vieja: producen un número falso**. Si fabricación descuenta 3 láminas en su tablet y dirección descuenta 2 en el teléfono, `localStorage` no tiene manera de resolverlo — y el modelo actual ya declara el problema por escrito: *«El folio no es único entre dispositivos… Dos teléfonos generan `COT-0008` en paralelo»*. Sumado a que hoy el rol es un `<div class="seg">` que el propio usuario cambia con `setRol('autorizador')` y un string de texto libre en `al3d_autorizador` escrito en cada tecla (`oninput="Q.autorizador=this.value"`), la conclusión es dura: **el control de acceso actual es una cortesía, no una frontera**, y con dinero, material y agenda separados por departamento eso hay que arreglarlo antes de que haya a quién culpar. La forma correcta de hacerlo sin repetir el fracaso de la copia (B) es invertir la dirección habitual: **`localStorage` sigue siendo el escritorio y Postgres es el archivo** — nunca al revés. La app abre y pinta sin red, con los datos del dispositivo; el servidor recibe después. Cualquier diseño en el que la primera pantalla espere un `fetch` rompe la propiedad que hace que el cotizador se use hoy en la calle delante del cliente.

---

## 2. Notion vs Google Calendar — gana Google Calendar

**Decisión: Google Calendar es el canal de recordatorio. Notion es destino de escritura de solo-espejo, unidireccional, asíncrono y desechable.**

Las cuatro razones, en orden de peso:

1. **Un recordatorio tiene que sonar en el teléfono de quien debe actuar, sin que abra nada.** Calendar hace eso nativo (`reminders.overrides`, popup a 30 y a 1440 min). Notion notifica *dentro* de Notion: el de fabricación tendría que tener la app instalada, con sesión, y mirar la campanita. Eso es precisamente la clase de paso manual que vació la copia (B).
2. **Calendar es alcanzable desde el navegador sin servidor y sin secreto.** GIS token model, scope `calendar.events`, publishing status *Testing* (tope de 100 test users, y aquí son 3). La API de Notion **no manda cabeceras CORS** y exige `Authorization: Bearer secret_…` más `Notion-Version` (cabecera no simple → preflight). Aun si Notion arreglara CORS, el token es de escritura total sobre el workspace y no puede vivir en el HTML de GitHub Pages. Notion obliga a un Cloudflare Worker; Calendar no obliga a nada. Un componente menos que se cae y que el usuario no puede arreglar.
3. **Tres teléfonos distintos, un solo evento.** Calendar tiene `attendees` y calendarios compartidos. Notion requiere que los tres sean miembros del workspace con asiento.
4. **La suscripción ICS no sustituye nada**: refresca cada 12–24 h y no hay forma de forzarla. Sirve para una agenda de consulta que tolere un día de atraso, no para «acabo de agendar y quiero verlo».

**El papel exacto de Notion, que sí lo tiene y es importante:** ahí viven los 199 proyectos reales de tres años y $3,713,419.41 acumulados, y el usuario no va a dejar de abrir Notion. Si la plataforma no escribe ahí, él va a mantener las dos cosas a mano y volvemos al fracaso. Entonces:

- Al marcar un proyecto ganado, la plataforma encola una fila para `Ventas - AL3D` de la copia **(A) ELIAS** — la viva, `collection://56fa21d8-8e7d-4e16-b874-455fd6c65643` — respetando los nombres tal cual, **incluidos los espacios finales de `Precio Neto ` y `Cuenta `**.
- **Notion nunca es fuente de lectura.** Ninguna pantalla depende de un `fetch` a Notion. Si el Worker está caído, la plataforma funciona idéntica y la fila espera en la cola con un botón «copiar fila» de respaldo. Eso es lo que convierte al eslabón débil en eslabón desechable.
- La copia (B) OMAR y la (C) CLAUDE se declaran **archivo muerto**. De (B) se hereda solo el vocabulario (`Tipo de proyecto` de 7 valores, `Tiempo de entrega` 1–4 semanas), y se hereda porque ahora se puede **derivar** en vez de capturar.

### El hallazgo: el puente ya existe y está roto en cuatro puntos

`copiarFilaVenta()` (L8769) ya arma la fila TSV de 15 columnas **en el orden exacto del CSV de Ventas de Notion**, con el comentario que lo dice. El botón «ganamos» ya está en producción. Lo que le falta:

| # | Qué está mal | Evidencia | Consecuencia |
|---|---|---|---|
| 1 | **No persiste nada.** `copiarFilaVenta` solo escribe `al3d_rv_pct` y `al3d_rv_cuenta` | L8780 | El evento «ganada» no deja rastro en ningún sistema. **Este es el eslabón perdido, literalmente** |
| 2 | Los estatus del `<select>` son `ANTICIPO / LIQUIDADO / CANCELADO / PENDIENTE` | L10031 | En Notion los reales son `REPARANDO / COBRANDO / FABRICACION / LIQUIDADO`. Solo coincide uno. Pegar `ANTICIPO` en una columna *status* **crea una opción nueva** y ensucia el esquema en silencio |
| 3 | Las cuentas son `Elias BBVA / Moni MPago / Constru BNT / Otra` | L10024-28 | Faltan `Rul HSBC` y `Tatis BNT`; `Otra` no existe en Notion → misma contaminación |
| 4 | `rv-fecha` es `<input type="text">` precargado con `Q.fecha` = `'22 ago 2026'` | L8739 | La columna de Notion es *date* `DD/MM/YYYY`. El texto es-MX no es parseable sin mapa de meses |

Arreglar esos cuatro puntos y persistir la fila **es la Fase 0 entera y no requiere ninguna cuenta nueva.**

---

## 3. Modelo de datos

### 3.0 Fuente de la verdad, declarada dato por dato

| Dato | Fuente de la verdad | Quién más lo tiene | Regla |
|---|---|---|---|
| Catálogo de **precios de venta** | `index.html`: `MATERIALES`, `COMPLEJIDAD`, `RECORTES`, `RECORTE_COMP_EXTRA`, `BASTIDORES`, `CAJAS` (L2728-2760) | nadie | Postgres **no** los duplica. Congela `_lt` por partida, por la misma razón documentada en L6640-6643 |
| Cotización (partidas, precio, cliente) | `al3d_historial` del dispositivo que la autorizó | Postgres guarda un **snapshot inmutable** al ganar | El cotizador nunca lee de Postgres. Un solo sentido |
| Cotizaciones pendientes de autorizar | `al3d_queue` de ese dispositivo | nadie | La plataforma la lee para el módulo de Inicio, jamás la escribe |
| Contador de folio | `al3d_folio` (local, monótono) | — | Postgres desambigua con `folio_global` |
| **Proyecto ganado** | **Postgres** | Notion recibe espejo | Nuevo. No existía en ningún sistema |
| **Instalación agendada** | **Postgres** | Google Calendar recibe espejo | Nuevo. `Fecha Anticipo e Instalacion` de Notion es **un solo campo para dos eventos** y no se puede arreglar escribiendo ahí |
| Material, existencia, movimiento | **Postgres** | nadie | Nuevo. Confirmado inexistente en Notion y en Drive |
| Constantes de conversión | **Postgres** (`constante`) | congeladas en `requerimiento.origen` | Igual que `_lt`: recalcular con constantes nuevas reescribiría el pasado |
| Cobranza real (`anti_recibido`) | **Postgres**, escrito por PAGOS | Notion espejo | Hoy solo existe `anti` **pactado**; la especificación lo dice: *«No hay registro de pagos»* |

### 3.1 Cómo se engancha sin corromper lo que existe

Tres reglas, no negociables:

1. **Ninguna clave de `localStorage` existente cambia de forma.** `al3d_historial`, `al3d_q`, `al3d_queue`, `al3d_folio` mantienen su shape exacto. La plataforma añade claves nuevas con prefijo propio: `al3d_pf_*`.
2. **`RESPALDO_KEYS` (L6856) se extiende en los dos lados.** `restaurarDesde` **ignora en silencio** cualquier clave que no esté en la lista, así que si añado `al3d_pf_sync` sin tocar la constante, el respaldo del usuario pierde la cola de sincronización sin avisar. Es un cambio de dos líneas en `index.html` y es obligatorio.
3. **El cotizador solo gana un enlace y un exportador.** Nada más. Cero riesgo sobre las 10 075 líneas en producción.

Claves nuevas:

```
al3d_pf_disp     string  — UUID del dispositivo, generado una vez. Desambigua folios
al3d_pf_ganadas  JSON    — Array<GanadaLocal>: el registro local del evento «ganamos»
al3d_pf_sync     JSON    — cola de operaciones pendientes de subir {op,tabla,payload,ts,intentos}
al3d_pf_cache    JSON    — última respuesta del servidor por tabla, para pintar sin red
al3d_pf_sesion   JSON    — lo que escribe supabase-js (persistSession)
al3d_pf_rol      string  — rol cacheado, SOLO para pintar. La autoridad es el JWT
```

`GanadaLocal` es el esqueleto de la Fase 0 y funciona sin backend:

```js
{ id:'uuid', folio:'COT-0007', disp:'uuid-dispositivo',
  ts_hist: 1755900000000,          // el `ts` de la entrada de al3d_historial
  huella: '...',                    // Q.huellaAuth, para detectar que se editó después
  fecha_ganado:'2026-08-22',
  fecha_instalacion:'2026-09-01',   // el ÚNICO dato nuevo que se teclea
  snapshot: {...} }                 // JSON.parse(JSON.stringify(entradaHistorial))
```

### 3.2 Esquema relacional

```sql
-- ═══════ Identidad y multiempresa ═══════
create table empresa (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                 -- 'AL3D', y la nueva
  prefijo_folio text not null default 'COT-',
  activa boolean not null default true
);

create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresa(id),
  nombre text not null,
  rol text not null check (rol in ('direccion','fabricacion','pagos')),
  telefono text, email_gcal text,       -- el correo con el que se le invita a los eventos
  activo boolean not null default true
);
-- Los instaladores NO tienen fila aquí. Decisión explícita del usuario.

-- ═══════ Puente con el cotizador ═══════
create table cotizacion_ganada (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  folio_local text not null,            -- 'COT-0007' tal cual
  dispositivo_id text not null,         -- al3d_pf_disp
  folio_global text generated always as (dispositivo_id||'/'||folio_local) stored,
  ts_historial bigint not null,         -- el `ts` de la entrada. Ojo: NO es inmutable en origen
  huella_auth text,                     -- Q.huellaAuth al ganar
  snapshot jsonb not null,              -- la entrada de al3d_historial, VERBATIM
  -- desnormalizado para consultar sin abrir el jsonb:
  cliente text, tel text, proyecto text, dir_raw text, maps_url text,
  sub numeric(12,2), neto numeric(12,2), precio_auth numeric(12,2),
  anti_pactado numeric(12,2), anti_manual boolean, iva boolean,
  fecha_cotizacion text,                -- '22 ago 2026', string es-MX, se guarda tal cual
  importado_en timestamptz not null default now(),
  importado_por uuid not null references perfil(id),
  unique (empresa_id, folio_global)
);
-- INSERT-only. Una corrección es otra fila con ts_historial mayor.
create index on cotizacion_ganada (empresa_id, importado_en desc);

-- ═══════ Operación ═══════
create table cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  nombre text not null, telefono text, email text,
  empresa_org text, rfc text, csf_url text, notas text,
  creado_en timestamptz default now()
);
-- Se crea SOLO, por nombre, desde clientesConocidos(). Cero captura.
create unique index on cliente (empresa_id, lower(nombre));

create table proyecto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  nombre text not null,                 -- DERIVADO: 'Contacto - Negocio (tipo)'
  cliente_id uuid references cliente(id),
  estado text not null default 'ganado' check (estado in
    ('ganado','fabricacion','listo_taller','agendado','instalado',
     'cobrando','liquidado','reparando','cancelado')),
  tipos_derivados text[] not null default '{}',   -- los 7 valores de la copia OMAR
  -- dinero (invisible para FABRICACION, ver §RLS)
  neto numeric(12,2), anti_pactado numeric(12,2),
  anti_recibido numeric(12,2), fecha_anti_recibido date,
  liquidacion numeric(12,2), fecha_liquidacion date,
  comision_pct numeric(5,2), comision_abonada numeric(12,2),
  cuenta text check (cuenta in                   -- las 5 REALES de Notion
    ('Moni MPago','Rul HSBC','Tatis BNT','Constru BNT','Elias BBVA')),
  -- tiempo
  fecha_ganado date not null default current_date,
  compromiso_texto text,                -- Q.entrega crudo: 'Viernes 15 de Agosto'
  compromiso_fecha date,                 -- parseada si se pudo. NULL es válido
  -- lugar
  dir_texto text, entrecalles text, maps_url text,
  lat numeric(9,6), lng numeric(9,6),
  geo_fuente text check (geo_fuente in ('maps_regex','nominatim','manual','fallido')),
  geo_confirmada boolean not null default false,
  -- espejos
  notion_page_id text, notion_estado text default 'pendiente'
    check (notion_estado in ('pendiente','enviado','fallido','manual')),
  creado_en timestamptz default now(), actualizado_en timestamptz default now()
);
create index on proyecto (empresa_id, estado);
create index on proyecto (empresa_id, fecha_ganado desc);

create table proyecto_cotizacion (      -- N:M real: un proyecto puede venir de dos
  proyecto_id uuid references proyecto(id) on delete cascade,
  cotizacion_ganada_id uuid references cotizacion_ganada(id),
  primary key (proyecto_id, cotizacion_ganada_id)
);

create table instalacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  proyecto_id uuid not null references proyecto(id) on delete cascade,
  fecha date not null,
  hora_inicio time,                     -- NULL: 'en la mañana' es una respuesta válida
  ventana text check (ventana in ('manana','tarde','noche','madrugada')),
  duracion_min integer default 180,
  nocturna boolean not null default false,   -- caso real: 'Instalacion nocturna'
  estado text not null default 'confirmada' check (estado in
    ('propuesta','confirmada','reagendada','hecha','cancelada')),
  reagendada_de uuid references instalacion(id),
  -- opcionales de obra: NULLABLE y NADA depende de ellos (ver nota)
  altura_montaje_m numeric(4,1), requiere_andamio boolean, requiere_grua boolean,
  contacto_sitio text, tel_sitio text, notas text,
  gcal_event_id text, gcal_estado text default 'pendiente',
  creado_en timestamptz default now(), creado_por uuid references perfil(id)
);
create index on instalacion (empresa_id, fecha);
```

> **Nota de disciplina sobre `altura_montaje_m`, `requiere_andamio`, `requiere_grua`, `contacto_sitio`.** Son los únicos campos de captura pura de todo el modelo. Existen porque el brief los pide como necesidad de obra real, y se permiten con **una sola condición: ninguna consulta, vista, regla de automatización o cálculo los usa como entrada obligatoria.** Si mañana están vacíos en 100 % de las filas —y lo estarán, como `Tipo de proyecto` en la copia (B)— no se rompe nada. `requiere_andamio` se pregunta como un chip sí/no en la pantalla donde el usuario ya está agendando, con default *no*; es un toque, no un formulario.

```sql
-- ═══════ Material ═══════
create table proveedor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  nombre text not null, telefono text, whatsapp text,
  contacto text, dias_entrega integer, notas text
);

create table material (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  clave text not null,                  -- 'acrilico-3mm-blanco'
  nombre text not null,
  familia text not null check (familia in
    ('acrilico','aluminio','acero','lamina','alucobond','vinil','tubular',
     'led','fuente','consumible','tornilleria')),
  unidad_consumo text not null check (unidad_consumo in ('m2','m','pza','L')),
  unidad_compra  text not null check (unidad_compra  in
    ('lamina','panel','rollo','tramo','bolsa','caja','litro','metro','pza')),
  factor numeric(10,4) not null,        -- consumo que rinde 1 unidad de compra
  factor_nota text not null,            -- DE DÓNDE salió el número. Obligatorio
  merma_pct numeric(5,2) not null default 10,
  -- geometría de la unidad de compra: sirve para saber si la PIEZA cabe, no solo el área
  largo_cm numeric(8,2), ancho_cm numeric(8,2), espesor text,
  costo_unidad_compra numeric(12,2), costo_actualizado_en date,
  min_stock numeric(10,2) not null default 0,   -- en unidad de COMPRA
  proveedor_id uuid references proveedor(id),
  activo boolean not null default true,
  unique (empresa_id, clave)
);

create table existencia (               -- CACHÉ mantenida por trigger, no fuente
  empresa_id uuid not null references empresa(id),
  material_id uuid not null references material(id),
  ubicacion text not null default 'taller',
  cantidad numeric(12,3) not null default 0,     -- unidad de compra, con fracción
  actualizado_en timestamptz default now(),
  primary key (material_id, ubicacion)
);

create table movimiento_material (      -- LA FUENTE. Inmutable
  id bigserial primary key,
  empresa_id uuid not null references empresa(id),
  material_id uuid not null references material(id),
  ubicacion text not null default 'taller',
  tipo text not null check (tipo in
    ('compra','consumo','apartado','liberacion','ajuste','merma','devolucion')),
  cantidad numeric(12,3) not null,      -- CON SIGNO: + entra, − sale
  proyecto_id uuid references proyecto(id),
  requerimiento_id uuid references requerimiento(id),
  costo_total numeric(12,2), proveedor_id uuid references proveedor(id),
  folio_factura text, nota text,
  creado_en timestamptz not null default now(),
  creado_por uuid not null references perfil(id)
);
-- Sin UPDATE ni DELETE (revocados). Una corrección es un movimiento tipo 'ajuste'.
create index on movimiento_material (empresa_id, material_id, creado_en desc);
create index on movimiento_material (proyecto_id) where proyecto_id is not null;

create table requerimiento (            -- lo que UN proyecto necesita
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  proyecto_id uuid not null references proyecto(id) on delete cascade,
  material_id uuid not null references material(id),
  -- el cálculo, auditable de punta a punta
  cantidad_consumo numeric(12,4) not null,   -- 16.26 (m lineales)
  unidad_consumo text not null,              -- 'm'
  cantidad_compra numeric(12,3) not null,    -- 0.542 (rollos), ya con merma
  unidad_compra text not null,               -- 'rollo'
  origen jsonb not null,                     -- {partida_id, tipo, formula, constantes:{...}}
  confianza text not null check (confianza in ('exacta','estimada','requiere_dato')),
  -- la corrección de fabricación
  cantidad_ajustada numeric(12,3), ajustado_por uuid references perfil(id),
  ajustado_en timestamptz, motivo_ajuste text,
  estado text not null default 'calculado' check (estado in
    ('calculado','apartado','comprado','consumido','sobra','descartado')),
  creado_en timestamptz default now()
);
create index on requerimiento (proyecto_id, estado);

-- ═══════ Recordatorios ═══════
create table recordatorio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id),
  regla text not null,                  -- 'R2_material_3dias'
  proyecto_id uuid references proyecto(id) on delete cascade,
  instalacion_id uuid references instalacion(id) on delete cascade,
  requerimiento_id uuid references requerimiento(id) on delete cascade,
  destino_rol text not null check (destino_rol in ('direccion','fabricacion','pagos')),
  destino_usuario uuid references perfil(id),
  titulo text not null, cuerpo text,
  severidad text not null default 'aviso' check (severidad in ('info','aviso','urgente')),
  vence_en timestamptz not null,        -- cuándo debe aparecer
  canal text not null default 'app' check (canal in ('app','gcal','whatsapp_manual')),
  gcal_event_id text,
  estado text not null default 'pendiente' check (estado in
    ('pendiente','mostrado','hecho','descartado','vencido')),
  -- LA COLUMNA QUE HACE SEGURA LA AUTOMATIZACIÓN:
  idempotencia text not null,
  resuelto_en timestamptz, resuelto_por uuid references perfil(id),
  creado_en timestamptz default now(),
  unique (empresa_id, idempotencia)
);
create index on recordatorio (empresa_id, destino_rol, estado, vence_en);

-- ═══════ Constantes ═══════
create table constante (
  empresa_id uuid not null references empresa(id),
  clave text not null,                  -- 'k_ancho_recta'
  valor numeric(12,4) not null,
  unidad text, nota text not null,      -- de dónde salió. Obligatorio
  actualizado_en timestamptz default now(),
  actualizado_por uuid references perfil(id),
  primary key (empresa_id, clave)
);
```

**El trigger que mantiene `existencia` y hace las escrituras concurrentes seguras:**

```sql
create or replace function aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into existencia (empresa_id, material_id, ubicacion, cantidad, actualizado_en)
  values (new.empresa_id, new.material_id, new.ubicacion, new.cantidad, now())
  on conflict (material_id, ubicacion) do update
    set cantidad = existencia.cantidad + new.cantidad,   -- lectura-modificación ATÓMICA
        actualizado_en = now();
  return new;
end $$;
create trigger t_aplicar_movimiento after insert on movimiento_material
  for each row execute function aplicar_movimiento();
```

Ese `on conflict … set cantidad = existencia.cantidad + new.cantidad` es el argumento del backend reducido a una línea: es la operación que `localStorage` **no puede** hacer bien con dos dispositivos.

**La vista sin dinero (RLS es por fila; el dinero es por columna):**

```sql
create view proyecto_taller
with (security_invoker = true) as
select id, empresa_id, nombre, cliente_id, estado, tipos_derivados,
       fecha_ganado, compromiso_texto, compromiso_fecha,
       dir_texto, entrecalles, lat, lng, geo_confirmada
from proyecto;
revoke all on proyecto from authenticated;   -- se concede por policy, no en bloque
grant select on proyecto_taller to authenticated;
```

**RLS, las políticas que importan:**

```sql
alter table perfil enable row level security;
create policy p_propio on perfil for select to authenticated using (id = auth.uid());

create or replace function mi_rol() returns text
  language sql stable security definer set search_path = public
as $$ select rol from perfil where id = auth.uid() $$;
create or replace function mi_empresa() returns uuid
  language sql stable security definer set search_path = public
as $$ select empresa_id from perfil where id = auth.uid() $$;
-- SECURITY DEFINER es obligatorio: sin él, cualquier policy que consulte
-- `perfil` reevalúa el RLS de `perfil` y entra en recursión infinita.

alter table proyecto enable row level security;
create policy proy_direccion on proyecto for all to authenticated
  using      (mi_rol()='direccion' and empresa_id = mi_empresa())
  with check (mi_rol()='direccion' and empresa_id = mi_empresa());
create policy proy_pagos_lee on proyecto for select to authenticated
  using (mi_rol()='pagos' and empresa_id = mi_empresa());
create policy proy_pagos_cobra on proyecto for update to authenticated
  using      (mi_rol()='pagos' and empresa_id = mi_empresa())
  with check (mi_rol()='pagos' and empresa_id = mi_empresa());
-- FABRICACION no tiene NINGUNA policy en `proyecto`: entra por proyecto_taller.

alter table movimiento_material enable row level security;
create policy mov_lee on movimiento_material for select to authenticated
  using (empresa_id = mi_empresa());
create policy mov_escribe on movimiento_material for insert to authenticated
  with check (empresa_id = mi_empresa()
              and mi_rol() in ('direccion','fabricacion')
              and creado_por = auth.uid());
-- PAGOS no escribe material. INSERT-only: no hay policy de update/delete, y RLS
-- es deny-by-default, así que el movimiento es inmutable por construcción.

alter table cotizacion_ganada enable row level security;
create policy cot_no_taller on cotizacion_ganada for select to authenticated
  using (empresa_id = mi_empresa() and mi_rol() in ('direccion','pagos'));
-- el snapshot trae precios: fabricación no lo ve. Ve `requerimiento`, que no trae dinero.
```

Dos trampas que hay que decir en voz alta: **varias policies del mismo comando se combinan con OR** (son permisivas — para restringir se quitan policies, no se añaden), y hay que **indexar toda columna que use una policy** o los seq-scans matan el rendimiento.

---

## 4. Cómo se deriva el material

### 4.1 Primero, lo que ya sale gratis y nadie está usando

**`tipos_derivados` — el campo que quedó en 0/142 en la copia (B) — es 100 % derivable de `Q.items`.** Cero captura:

```js
// mod/derivar.js  — función pura, sin DOM, sin red
const TIPO_OMAR = it => {
  if (it.tipo==='letras')   return it.luz ? 'Letras 3D con iluminación' : 'Letras 3D sin iluminación';
  if (it.tipo==='caja')     return it.tarifa>=4600 ? 'Custome / Proyecto Especial'
                                                   : 'Caja de luz con iluminación';
  if (it.tipo==='recorte')  return it.acab==='vinil'    ? 'Rotulación de vinil'
                                : it.acab==='sandwich'  ? 'Caja de luz con iluminación'
                                                        : 'Recorte acrílico';
  if (it.tipo==='bastidor') return 'Custome / Proyecto Especial';
  return 'Custome / Proyecto Especial';   // manual
};
export const tiposDerivados = items => [...new Set(items.map(TIPO_OMAR))];
```

Y el nombre del proyecto sigue la convención real de Notion (`Contacto - Negocio (tipo de trabajo)`) armándose con lo que el cotizador ya obliga a capturar: `${cliente} - ${proy} (${tipos[0]})`.

### 4.2 Los dos números que faltan, y de dónde sacarlos sin preguntar

Para una partida `letras` el catálogo da `material`, `comp`, `luz`, `ilumTipo`, `altura` (cm) y `n` (piezas) — todo exacto. Lo que el material físico necesita y no existe:

**(a) Ancho de la letra.** No hay campo, y depende del glifo y de la tipografía. Tres fuentes en orden de preferencia, todas de costo humano cero:

1. **El escalador ya lo mide y lo tira a la basura.** `SC.items` guarda `{cm, type}` con `type = SC.mMode ∈ {'h','v','libre'}` (L8264), pero `scAgregarPartida` (L8476) solo usa `m.cm` y lo mete en `it.altura` — **descarta el `type`**. Una medida trazada en modo `'h'` es un ANCHO que hoy se cotiza como altura. Arreglo: si `type==='h'`, escribir `it.anchoMedido` en vez de `it.altura`. Es una condición de tres líneas sobre código que ya existe y ya se usa, y le da al módulo de material el dato exacto medido con el dedo sobre la foto.
2. **`textoAuto`.** `autoContarLetras` (L3611) guarda el texto tecleado cuando alguien usa el autocontador. Con el texto real se puede sumar el ancho por glifo con una tabla de anchos relativos en vez de un promedio ciego. Es opcional y suele faltar (la IA no lo llena: el item de L5905 no trae `textoAuto`), así que es un refinamiento, no una base.
3. **El factor de caja, cuando no hay nada mejor.**

**(b) Profundidad del canto (el retorno).** No existe y no es derivable. **Pero no es una decisión por proyecto: es un estándar de taller.** AL3D usa una o dos profundidades fijas. Por eso va en `constante`, se declara **una vez** en una pantalla de ajustes, y admite un override por partida para el trabajo raro. Esa es la diferencia entre «capturar profundidad en cada partida» (se muere) y «declarar el estándar del taller una vez» (sobrevive).

### 4.3 Las constantes, con su valor inicial y su procedencia

Todas viven en `constante`, las edita solo DIRECCION, y **se congelan en `requerimiento.origen.constantes`** al calcular — misma lección que `_lt`: recalcular con constantes nuevas reescribiría hacia atrás lo que ya se compró.

| clave | valor inicial | unidad | de dónde sale |
|---|---|---|---|
| `k_ancho_recta` | **0.72** | ancho/altura | Relación ancho-medio/altura-de-caja de un glifo en caja alta de palo seco, que es como se fabrica el 90 % de la letrería de fachada. Se calibra con los `type:'h'` del escalador |
| `k_ancho_cursiva` | **0.62** | — | Una script es más estrecha por letra que una caja alta |
| `k_ancho_compleja` | **0.85** | — | Los remates y ornamentos ensanchan la caja |
| `k_relleno_recta` | **0.62** | glifo/caja | Fracción de la caja que es material pintado. Una caja alta de palo seco cubre ~⅗ de su rectángulo |
| `k_relleno_cursiva` | **0.48** | — | Los trazos finos y los enlaces dejan mucho hueco |
| `k_relleno_compleja` | **0.70** | — | |
| `k_perim_recta` | **2.6** | ×(alt+anch) | El perímetro de un rectángulo es 2.0×(a+b); una caja alta suma ~30 % por contraformas (O, A, B, D, P, R) |
| `k_perim_cursiva` | **3.2** | — | Los enlaces multiplican el contorno |
| `k_perim_compleja` | **3.8** | — | |
| `prof_canto_cm` | **5.0** | cm | Estándar de taller para letra ≤50 cm. **A confirmar con el usuario: es el único número que le voy a preguntar** |
| `prof_caja_cm` | **15.0** | cm | Caja de luz a muro, una cara |
| `merma_acrilico_pct` | **25** | % | Nesting de formas irregulares en hoja rectangular. Es la merma alta del taller |
| `merma_lamina_pct` | **8** | % | Cortes rectos, nesting fácil |
| `merma_fleje_pct` | **12** | % | Esquinas y traslapes del doblez de canto |
| `merma_vinil_pct` | **15** | % | |
| `led_mod_m2` | **45** | mód/m² | Densidad de módulo para iluminación posterior a 5 cm de canto |
| `w_por_modulo` | **0.72** | W | Módulo de 3 chips 2835, el estándar del mercado |
| `margen_fuente_pct` | **20** | % | Nadie carga una fuente al 100 % |
| `silicon_L_m2` | **0.15** | L/m² | |
| `separadores_por_letra` | **4** | pza | |
| `travesano_cada_cm` | **60** | cm | Separación de refuerzo en bastidor |

**Cada valor de esta tabla es una hipótesis, no un hecho.** Por eso `requerimiento.confianza` existe y por eso el bucle de calibración de §4.6 no es opcional.

### 4.4 El catálogo semilla, con unidad de compra ≠ unidad de consumo

Esto es la corrección 2 del usuario, resuelta. `factor` = cuánto consumo rinde una unidad de compra.

| clave | familia | u. consumo | u. compra | factor | geometría | factor_nota |
|---|---|---|---|---|---|---|
| `acrilico-3mm-blanco` | acrilico | m² | lamina | **2.9768** | 122 × 244 cm | Hoja estándar 4′×8′ del mercado mexicano. **Verificar con proveedor: también se vende 122×183** |
| `acrilico-6mm-transp` | acrilico | m² | lamina | 2.9768 | 122 × 244 | idem |
| `fleje-alum-pintado-5cm` | aluminio | m | rollo | **30** | ancho 5 cm | Rollo de canto de 30 m en el **ancho = profundidad de la letra**. Por eso el consumo es metro lineal, no m² |
| `fleje-alum-brush-5cm` | aluminio | m | rollo | 30 | ancho 5 | idem |
| `fleje-inox-espejo-5cm` | acero | m | rollo | **30** | ancho 5 | idem |
| `lamina-galv-c24` | lamina | m² | lamina | **2.2204** | 91 × 244 cm | Calibre 24, hoja 3′×8′ |
| `alucobond-4mm` | alucobond | m² | panel | **2.9768** | 122 × 244 cm | Panel ACM estándar |
| `vinil-corte-blanco` | vinil | m² | rollo | **61** | ancho 122 cm × 50 m | Rollo de 1.22 m × 50 m |
| `tubular-1pulg` | tubular | m | tramo | **6** | 6 m | Tramo comercial de PTR de 1″ |
| `led-mod-6500k` | led | pza | caja | **100** | — | Caja de 100 módulos |
| `led-mod-3000k` | led | pza | caja | 100 | — | idem |
| `fuente-12v-60w` | fuente | pza | pza | **1** | — | |
| `fuente-12v-150w` | fuente | pza | pza | 1 | — | |
| `silicon-transp` | consumible | L | litro | **1** | — | Cartucho/bote de 1 L |
| `separador-inox-20mm` | tornilleria | pza | bolsa | **100** | — | Bolsa de 100 |

Nota de honestidad: las medidas de hoja son estándares del mercado mexicano, **no las leí de una factura de AL3D** — en Drive no hay ni una hoja de materiales, y en Notion las únicas categorías de insumo son `Laminas` ($33,280 en 11 gastos), `Iluminacion` ($12,372), `Graficos` ($22,577) y `Maquila` ($20,668), **sin desglose por proyecto**. Cada `factor` se confirma con el proveedor en la primera compra, y ahí es donde `factor_nota` gana su razón de ser.

### 4.5 La cadena completa, con el ejemplo del brief

**Entrada: 8 letras de 40 cm de acero inoxidable, rectas, con luz fría.**
`{tipo:'letras', material:'acero', comp:'recta', luz:true, ilumTipo:'fria', altura:40, n:8}`

```
1) Ancho              anchoMedido ?? 40 × k_ancho_recta(0.72)      = 28.8 cm
2) Caja/letra         40 × 28.8                                    = 1 152 cm²
3) Glifo/letra        1 152 × k_relleno_recta(0.62)                = 714.2 cm²
4) Cara de acrílico   714.2 × 8                             = 5 713.9 cm² = 0.5714 m²
5) + merma 25 %       0.5714 × 1.3333                              = 0.762 m²
   → acrilico-3mm-blanco: 0.762 / 2.9768                    = 0.256 lámina  → 1 lámina
6) Perímetro/letra    k_perim_recta(2.6) × (40 + 28.8)             = 178.9 cm
7) Canto total        178.9 × 8                             = 1 431 cm = 14.31 m
8) + merma 12 %       14.31 × 1.1364                               = 16.3 m
   → fleje-inox-espejo-5cm: 16.3 / 30                       = 0.542 rollo  → 1 rollo
9) LED                0.5714 m² × led_mod_m2(45)                   = 25.7 → 26 módulos
   → led-mod-6500k: 26 / 100                                = 0.26 caja
10) Fuente            26 × 0.72 W = 18.7 W × 1.20                  = 22.5 W
   → fuente-12v-60w                                                = 1 pza
11) Silicón           0.5714 × 0.15                                = 0.086 L → 0 (hay bote)
12) Separadores       8 × 4                                        = 32 pza → 0 (hay bolsa)
```

Y la respuesta útil **no es «0.256 láminas»**. Es lo que el módulo pinta:

> **Acero inoxidable — 8 letras de 40 cm**
> Acrílico 3 mm blanco · faltan **0** — hay 2.4 láminas, esto usa 0.26
> Fleje inox espejo 5 cm · **FALTAN 16.3 m** — no hay rollo abierto. Comprar 1 rollo (Prov. X, WhatsApp)
> LED 6500 K · faltan 0 — hay 180 módulos, esto usa 26
> Fuente 60 W · faltan 0 — hay 3
> *Estimado.* El ancho salió del factor de caja (0.72), no de una medida. Mide el ancho en el escalador para afinar.

**Segundo ejemplo, con datos reales de Notion** — *Andrey - Healthylicious (Panel Alucobond)*, «Medidas 1 m x 2.95 m»:
`{tipo:'bastidor', bas:'alucobond', ancho:100, alto:295}`

```
m² real       100 × 295 / 10 000 = 2.95 m²   ← área REAL, no la cobrada
              (m2Total cobra Math.max(m2,1); para comprar se usa el área real)
+ merma 8 %   3.186 m²  →  3.186 / 2.9768 = 1.07 panel  →  2 paneles
Tubular       perímetro 2×(100+295) = 790 cm = 7.9 m
              travesaños: 295/60 = 4.9 → 4 × 100 cm = 4 m
              total 11.9 m / 6 = 1.98 tramo → 2 tramos
```

Y aquí el módulo tiene que decir algo que el área esconde, y es la clase de detalle que separa un cálculo de una herramienta:

> ⚠ La pieza mide **2.95 m** y el panel de Alucobond mide **2.44 m**. No sale de una pieza: hay junta, o hay que pedir panel de 3.05 m.

Por eso `material.largo_cm` / `ancho_cm` están en el esquema: **la dimensión mayor de la pieza se compara contra la geometría de la hoja, no solo su área.**

### 4.6 Confianza y calibración

```js
confianza =
  (tipo==='bastidor' || tipo==='caja')            ? 'exacta'        // el área es real
: (tipo==='letras' && it.anchoMedido)             ? 'exacta'        // ancho medido
: (tipo==='letras' || tipo==='recorte')           ? 'estimada'      // factor de caja
: (tipo==='manual')                               ? 'requiere_dato' // es una línea de importe
: 'requiere_dato';
```

**El caso `requiere_dato` que hay que declarar sin rodeos: `altura` está contaminada.** El propio `PROMPT_IA` (L5228) instruye: *«No importa si el corchete es vertical u horizontal: usa ese numero tal cual como centimetros. NUNCA ignores un corchete porque sea horizontal o apunte al ancho»*, y su ejemplo trabajado pone `altura_cm=92, n_letras=4` para unas ondas — 92 cm es evidentemente un ancho. Para el precio da igual (la regla es `$/cm × altura × n`); para el material es un error de un orden de magnitud. Por eso el módulo aplica un **cordón de plausibilidad**: si `altura × k_ancho × n > 1 200 cm` de frente de anuncio, marca `requiere_dato` y pide **una** confirmación («¿los 92 cm son de alto o de ancho?»), un toque, y solo en las partidas raras.

**El bucle que corrige los factores sin trabajo humano nuevo:** cuando fabricación cierra un requerimiento con `cantidad_ajustada`, la diferencia contra `cantidad_compra` queda registrada junto con `origen.constantes`. Después de ~20 proyectos, dirección ve: «tu `k_ancho_recta` real es 0.68, no 0.72 — cambiarlo». La calibración sale de las correcciones que fabricación ya iba a hacer de todos modos.

---

## 5. Arquitectura de archivos

```
/index.html                    ← EL COTIZADOR EN PRODUCCIÓN. Se le añaden ~40 líneas. Nada más
/app.html                      ← la plataforma. Shell + <nav> + router por hash. Sin lógica
/version.json                  ← {"v":"<sha>"} lo escribe CI. Lo lee el SW para invalidar
/manifest.webmanifest          ← + "shortcuts" a #/inicio, #/agenda, #/material
/sw.js                         ← dos estrategias, una por ruta (abajo)
/logo-al3d.png · logo-al3d-dark.png

/mod/estilo.css                ← el sistema de diseño. COPIA generada de index.html L26-2101
/mod/ui.js                     ← $, money, esc, ico, toast, voz, chip, grupo, _ABRIBLE,
                                 _CAPAS, el MutationObserver de modales, el patrón .hist
/mod/nucleo.js                 ← sesión, rol, cliente Supabase, cola de sync, el bus de estado
/mod/puente.js                 ← lee al3d_historial/al3d_queue/al3d_folio. SOLO LECTURA
/mod/derivar.js                ← tiposDerivados() + material(). FUNCIÓN PURA, sin DOM, sin red
/mod/geo.js                    ← parseGmaps() + cola Nominatim de 1 req/s + caché
/mod/gcal.js                   ← GIS token model. initTokenClient / crearEvento
/mod/ics.js                    ← buildICS() con plegado a 75 OCTETOS. Respaldo de gcal.js
/mod/automatiza.js             ← el motor de reglas R1..R11
/mod/inicio.js /proyectos.js /agenda.js /material.js /mapa.js   ← los cinco módulos nuevos

/vendor/leaflet.css
/vendor/leaflet-src.esm.js     ← COPIADOS al repo, no CDN: la app abre sin señal
/vendor/images/*

/datos/semilla.json            ← catálogo de material y constantes iniciales
/sql/01_esquema.sql  02_rls.sql  03_semilla.sql  04_triggers.sql
/herramientas/extraer-estilo.sh ← regenera mod/estilo.css desde index.html
/.github/workflows/version.yml keep-alive.yml respaldo.yml
```

### Lo que se le toca a `index.html` — y solo esto

1. Un botón `.btn-gho` en la topbar: `Plataforma →` a `app.html`. Un `<a>`.
2. `al3d_pf_disp`: generar un UUID una vez si no existe.
3. **`RESPALDO_KEYS` (L6856) crece con `al3d_pf_ganadas` y `al3d_pf_sync`.** Sin esto, el respaldo del usuario pierde en silencio lo que la plataforma no ha subido.
4. `scAgregarPartida` (L8476): tres líneas que respetan `m.type==='h'` como ancho.
5. `copiarFilaVenta` (L8769): los 4 arreglos de §2 + persistir en `al3d_pf_ganadas`.

No se toca ni una regla de CSS, ni el PDF, ni el escalador, ni el vectorizador, ni la IA, ni el flujo de autorización.

### Cómo se cargan sin build

`app.html` es HTML plano con un `<link rel="stylesheet" href="mod/estilo.css">` y un único punto de entrada:

```html
<script type="module">
  import { arrancar } from './mod/nucleo.js';
  arrancar();                       // el router hace import() dinámico por ruta
</script>
```

Módulos ES nativos, `import` con rutas relativas y extensión explícita — GitHub Pages los sirve con `Content-Type: text/javascript` y no hace falta nada más. Leaflet, tal como exige su 1.9.4: `import * as L from '../vendor/leaflet-src.esm.js'` (**namespace import**: ese archivo no tiene default export, `import L from` da `undefined`), y `window.L = L` solo si algún día entra un plugin UMD. El CSS de Leaflet va por `<link>`, no hay CSS modules sin bundler.

Router: `location.hash` → `import('./mod/'+nombre+'.js')`. Cada módulo exporta `montar(contenedor, ctx)` y `desmontar()`. Sin framework, sin dependencias.

### El service worker

El SW actual es **red-primero-caché-de-respaldo**, y su comentario explica por qué: *«el sitio se publica subiendo index.html a la rama main, así que una caché que mande siempre serviría la versión vieja»*. Correcto para un archivo. **Fatal para trece.** Con red-primero y mala señal, `nucleo.js` llega de la red (v2) y `material.js` de la caché (v1), y la app lanza una excepción de import. Por eso: **dos estrategias, una por ruta.**

```js
const V = 'al3d-app-v1';      // se bumpea leyendo version.json, no a mano
const APP  = ['./app.html','./mod/estilo.css','./mod/ui.js','./mod/nucleo.js', /* … */
              './vendor/leaflet.css','./vendor/leaflet-src.esm.js','./datos/semilla.json'];

// 1) './' e './index.html'  → red-primero, EXACTAMENTE como hoy. No se toca.
// 2) '/mod/*','/vendor/*','/app.html' → caché-primero con revalidación ATÓMICA:
//    se sirve la copia al instante; en segundo plano se bajan TODOS los archivos de
//    la versión nueva a una caché aparte y solo cuando el conjunto está completo se
//    promueve. Un módulo nuevo con un módulo viejo es una app rota, no una app vieja.
// 3) version.json → red-primero, sin caché. Es el disparador de la promoción.
// 4) *.supabase.co, googleapis.com → NO se interceptan (ya excluidos por
//    `url.origin !== self.location.origin`). Nada de datos de negocio en la caché del SW.
```

El versionado sin build: `.github/workflows/version.yml` escribe `version.json` con el SHA del commit al publicar. Es un paso de compilación, sí — **pero corre en CI, no en la máquina del usuario, y el repositorio sigue sin node en producción.** Esa es la línea que estoy dispuesto a cruzar y no más.

**La deuda que no voy a esconder:** `mod/estilo.css` es una **copia** del sistema de diseño que vive en el `<style>` de `index.html`. No puedo extraerlo del archivo original sin romper la propiedad de un solo archivo offline y sin arriesgar la «ley de la hoja» (el orden manda; la capa de barro gana por estar al final). Así que hay dos copias y pueden divergir. Mitigación: `herramientas/extraer-estilo.sh` la regenera mecánicamente de las líneas 26–2101, y el README dice que un cambio en el sistema de diseño se aplica dos veces. Es deuda real, está acotada y es reversible.

---

## 6. Los seis módulos × tres roles

Regla transversal: **la primera pantalla de cada módulo pinta desde `localStorage` sin una sola petición.** El servidor rellena después y la diferencia se anuncia con una banda, no con una pantalla de error.

### 1 · Inicio / Recordatorios
| | |
|---|---|
| **DIRECCIÓN** | El tablero. Recordatorios propios ordenados por severidad; «ganadas sin agendar» (R6); «autorizadas sin decidir» (R8, la más valiosa); dinero del mes; **la fila de espejo a Notion pendiente con el botón «copiar fila»**; acceso a constantes y a usuarios |
| **FABRICACIÓN** | Solo lo que fabrica. «Material faltante para las 3 próximas instalaciones» (R1, R2); «bajo mínimo» con el WhatsApp del proveedor (R5); lo que hay que cortar esta semana. **Sin un solo importe en pantalla** |
| **PAGOS** | «Anticipo pactado no recibido» (R4); «instalado sin cobrar a 7 días» (R7); comisiones por abonar. Ve dinero, no ve material |

### 2 · Proyectos
| | |
|---|---|
| **DIRECCIÓN** | Lista y ficha completa: snapshot de la cotización, precio, anticipo, `tipos_derivados`, estado, instalación, requerimientos, espejo. Cambia estado, reabre, cancela |
| **FABRICACIÓN** | Vista `proyecto_taller`: nombre, cliente, tipos, partidas **con medidas y materiales pero sin importes**, fecha de compromiso, dirección. La cotización en modo memoria técnica |
| **PAGOS** | Nombre, cliente, teléfono, neto, anticipo pactado/recibido, liquidación, cuenta, estatus. Escribe cobros. **No ve partidas ni medidas** |

### 3 · Agenda
| | |
|---|---|
| **DIRECCIÓN** | Calendario mensual + lista semanal de **proyectos ganados**, nunca de cotizaciones. Agenda, reagenda (deja rastro en `reagendada_de`), marca nocturna, crea el evento de Calendar con los tres como invitados |
| **FABRICACIÓN** | El mismo calendario en solo-lectura, con el semáforo de material sobrepuesto: verde = cubierto, ámbar = estimado sin confirmar, rojo = falta. Marca «listo de taller» |
| **PAGOS** | Solo las fechas, para saber cuándo toca cobrar. Sin editar |

### 4 · Material
| | |
|---|---|
| **FABRICACIÓN** | **El dueño.** Catálogo, existencia, movimientos, requerimientos por proyecto. El botón que lo hace viable: **«consumido según lo calculado»** — un toque acepta el cálculo completo del proyecto y solo se corrige lo que no cuadró. Registra compras y conteos (`ajuste`) |
| **DIRECCIÓN** | Todo lo anterior más el costo: cuánto material se llevó cada proyecto, qué se está comprando, qué está bajo mínimo. Edita las constantes y ve el informe de calibración |
| **PAGOS** | Solo las compras con factura y su costo, para conciliar. No mueve existencias |

### 5 · Mapa
| | |
|---|---|
| **DIRECCIÓN** | Leaflet con OSM. Pines por estado: ámbar = por instalar, verde = instalado, rojo = reparando. Filtro por fecha y por estado. Corrige a mano la ubicación de un pin (`geo_fuente='manual'`, `geo_confirmada=true`) |
| **FABRICACIÓN** | El mismo mapa, filtrado a lo que se instala en los próximos 15 días, para armar ruta y saber si hay que cargar andamio |
| **PAGOS** | Sin acceso. No hay nada que hacer ahí |

Google Maps queda **previsto y no implementado**, exactamente como pidió: `mod/mapa.js` habla con un adaptador de dos métodos (`crearMapa`, `ponerPin`) y `TILES` sale de configuración. Cambiar de proveedor es cambiar un objeto, no reescribir el módulo. La atribución de OSM es visible y no se pone `Referrer-Policy` restrictivo — la política de tiles exige el `Referer` desde páginas web y quitarlo es violarla explícitamente.

### 6 · Cotizador
Es `index.html` sin tocar, en su propia pestaña, para los tres roles. No se reescribe ni se embute en un iframe. La plataforma **lee** su `localStorage` y le añade una salida. **La razón de fondo:** el cotizador se usa sin señal delante del cliente, y ese es el requisito que ninguna integración vale romper.

---

## 7. Automatizaciones

**El problema del disparador, resuelto.** GitHub Pages no tiene servidor, así que no hay cron que corra lógica de la app. La solución no es un truco: **los recordatorios no son notificaciones que la plataforma envía, son eventos de calendario que la plataforma creó por adelantado.** Se evalúan en dos momentos — al escribir (se crea el evento futuro ahora) y al abrir (se recalcula lo vencido) — y el teléfono suena aunque nadie abra nada.

| # | Regla | Qué la dispara | Quién la recibe | Canal | Qué la hace posible |
|---|---|---|---|---|---|
| **R1** | Proyecto ganado sin material suficiente | El `INSERT` de `requerimiento` al ganar | FABRICACIÓN + DIRECCIÓN | Tarjeta + evento GCal hoy | Un `SELECT` con `LEFT JOIN` a `existencia` menos apartados, en el navegador de quien gana |
| **R2** | **Tres días antes de instalar, si falta material** | Al agendar se crea el evento GCal en `fecha − 3d, 08:00`, «Revisar material: <proyecto>». Al abrir, se recalcula | FABRICACIÓN (dueño), DIRECCIÓN (copia) | GCal popup + tarjeta roja | El evento ya existe en el calendario del teléfono desde el día que se agendó. Cero servidor |
| **R3** | Instalación mañana / en 30 min | El propio evento de instalación lleva `overrides` de 1440 y 30 min (`TRIGGER:-P1D`, `-PT30M` en la variante ICS) | los tres, como `attendees` | GCal nativo | Se crea una vez al agendar |
| **R4** | Anticipo pactado y no recibido a 3 días de instalar | Al abrir: `anti_pactado>0 AND anti_recibido IS NULL AND fecha−hoy≤3` | PAGOS | Tarjeta urgente + GCal | PAGOS es el único que escribe `anti_recibido`: su ausencia **es** la señal |
| **R5** | Material bajo mínimo | **Trigger de Postgres** en `movimiento_material` cuando `existencia < min_stock` | FABRICACIÓN | Fila en `recordatorio` + tarjeta con el WhatsApp del proveedor | Postgres corre triggers gratis. Es el único disparador servidor de la Fase 1 |
| **R6** | Ganado hace 15 días sin instalación agendada | Al abrir | DIRECCIÓN | Tarjeta | El hueco que hoy nadie ve: se ganó y se olvidó |
| **R7** | Instalado y sin cobrar a 7 días | Al abrir | PAGOS | Tarjeta + espejo `Estatus → COBRANDO` | Ataca los 6 proyectos en COBRANDO por $131,817 que hay hoy |
| **R8** | **Autorizada hace 10 días sin decidir ganada/perdida** | Al abrir: `al3d_historial` local, `ts+10d < hoy`, sin `GanadaLocal` con ese folio | DIRECCIÓN | Tarjeta con dos botones: «ganamos» / «se perdió» | **La más valiosa del sistema**: es la única que fuerza el registro del eslabón perdido. Y **funciona 100 % offline, sin backend, en la Fase 0** |
| **R9** | La huella de una ganada cambió | Al abrir: `huellaAuth` guardada ≠ `huellaTrabajo()` de hoy | DIRECCIÓN | Tarjeta | Reutiliza el mecanismo que ya existe (L3255-3280): el proyecto se editó después de ganarse y el material calculado ya no corresponde |
| **R10** | Sobrante tras consumir | `cantidad_ajustada < cantidad_compra` | nadie (silencioso) | — | El delta vuelve a `existencia` como `devolucion` y alimenta la calibración de constantes |
| **R11** | Espejo a Notion pendiente >24 h | Al abrir: `notion_estado='pendiente'` | DIRECCIÓN | Tarjeta con el botón «copiar fila» que **ya existe** | Degradación honesta: si el Worker falla, el camino manual sigue ahí |

**Idempotencia.** Como las reglas se evalúan en cada apertura, `recordatorio.idempotencia` es `regla|entidad_id|fecha_objetivo` con `UNIQUE`. Abrir la app diez veces en un día crea un recordatorio, no diez. Sin esa columna, el módulo de Inicio se llena de basura en una semana y el usuario deja de mirarlo — que es el modo exacto en que muere un sistema de recordatorios.

**Un detalle de operación de GCal que decide el diseño:** el token dura ~1 h y en el navegador **no hay refresh token**. Si el de fabricación no tiene sesión Google viva, su evento no se crea. Por eso **el creador de todos los eventos es siempre el dispositivo de DIRECCIÓN**, con los otros dos como `attendees`. Un solo consentimiento que sostener, no tres.

---

## 8. Riesgos y límites

**Supabase se pausa a la semana de inactividad.** El usuario se va dos semanas y la plataforma amanece muerta; restaurar es un botón en un panel que él no sabe dónde está. Mitigación técnica: `keep-alive.yml` con cron lunes y jueves. Mitigación de diseño, que importa más: **la app abre igual** con `al3d_pf_cache` y una banda ámbar «sin conexión con el servidor — trabajando con la copia de este dispositivo». Lo que ve el usuario en el peor caso es una app degradada, no una pantalla de error. **Pero seamos claros: la continuidad de su negocio queda dependiendo de un cron de GitHub Actions que él no puede leer ni depurar.**

**El plan gratuito no tiene respaldos: cero días de retención.** Un `DROP` accidental o una migración mal escrita pierde el almacén completo y no hay a qué volver. `respaldo.yml` con `pg_dump` semanal a un artifact no es opcional, es parte del entregable. Y el artifact caduca a los 90 días.

**RLS mal configurada filtra en silencio.** La anon key es pública por diseño y la seguridad la da RLS; el 83 % de las exposiciones de Supabase son RLS mal configurada, y basta **una** tabla con RLS apagada para que la anon key lea esa tabla entera. Mitigación: un script de prueba que intente leer `proyecto`, `cotizacion_ganada` y `movimiento_material` **sin sesión** y falle en las tres, corriendo en CI. Si ese test pasa, hay un agujero.

**La pantalla «Google no ha verificado esta app».** Los tres usuarios la ven y tienen que darle a *Avanzado → Ir a (no seguro)*. Es permanente en *Testing*, y publicar **no la quita** (solo cambia el mecanismo del límite de 100 usuarios). Desaparece solo con Google Workspace y pantalla de consentimiento *Internal*; con `@gmail.com` no existe esa opción.

**Sin señal.** La agenda, los proyectos y el material se leen de caché y se ven completos. Lo que **no** funciona sin red: crear un evento de Calendar (se encola y se avisa), geocodificar una dirección nueva, y ver los movimientos de material que hizo otro dispositivo hoy. El mapa muestra los tiles que alcanzó a guardar; **precargar zonas está prohibido por la política de OSM** (bajar más de 250 tiles en zoom ≥13 para uso offline es explícitamente inaceptable), así que un mapa en una colonia nueva sin señal sale gris. Eso es un límite, no un bug, y hay que decírselo.

**Los tiles de OSM pueden cortarse sin aviso.** La política es cualitativa, no numérica: *«no SLA or guarantees»*, y advierte específicamente a los servicios comerciales que el acceso puede retirarse en cualquier momento. Por eso `TILES` es configuración desde el día 1 y CARTO (5 M/mes, el único free tier verificado sin cláusula de no-comercial) es el plan B a una línea de distancia.

**Nominatim: 1 petición por segundo, caché obligatoria, y autocompletar está prohibido.** El input de dirección **no puede** geocodificar mientras se teclea; tiene que ser un botón explícito. Repetir la misma consulta es causa de bloqueo.

**Los links cortos de Google Maps no se pueden expandir desde el navegador. Nunca.** `maps.app.goo.gl` no manda CORS, `no-cors` devuelve una respuesta opaca sin cabeceras legibles, y `redirect:'manual'` tampoco sirve. Lo que ve el usuario: «ese link es corto y el navegador no puede abrirlo — ábrelo, espera el mapa y copia el link de la barra». Feo, y es la única respuesta honesta sin un proxy.

**Los factores de conversión van a estar mal el primer trimestre.** El usuario va a ver «faltan 2 láminas» y le va a sobrar una. Mitigación: `confianza` visible en cada renglón, el bucle de calibración, y la regla de no comprar por el número sino por el semáforo.

**Y el riesgo que ninguna arquitectura elimina, dicho sin adornos: el inventario exige que alguien registre el consumo.** Si fabricación no toca «consumido», las existencias se separan de la realidad y en tres meses el módulo miente — que es exactamente cómo murió la copia (B) de Notion. Lo único que se puede hacer es que registrar cueste **un toque por proyecto** (~5 al mes) en vez de un renglón por material, y que el número que aparezca sea el calculado en vez de una casilla vacía. Si aun así no se toca, el módulo de material hay que apagarlo y decirlo, no dejarlo mintiendo.

**Quién mantiene esto.** El usuario no es programador. Añadir un campo es un SQL en un editor web; una policy mal escrita es una fuga silenciosa; un módulo ES con un `import` roto es una pantalla blanca. Lo que sí puede hacer solo, y hay que diseñarlo para que pueda: editar constantes, editar el catálogo de material, corregir un pin, y **exportar todo a JSON con un botón** — el mismo `armarRespaldo()` que ya conoce. Lo que no va a poder hacer solo: una migración, un arreglo de RLS, un despliegue de Worker. **Eso es el costo real de esta arquitectura y no se paga con dinero, se paga con dependencia.** La contramedida honesta es que las Fases 0 y 1 sean útiles por sí solas: si el mantenimiento se detiene, lo que queda en pie sigue sirviendo.

---

## 9. Fases

### Fase 0 — hoy, cero cuentas, cero infraestructura, funciona sin señal
Todo en `localStorage`. `app.html` + los módulos + `mod/estilo.css` + Leaflet local.

- Lee `al3d_historial` y `al3d_queue` con `mod/puente.js`.
- **El botón «Ganamos este proyecto»** — es el «Registrar Venta» que ya existe, con sus 4 arreglos y persistiendo en `al3d_pf_ganadas`.
- `tiposDerivados()` llenando gratis el campo que quedó en 0/142.
- Un solo dato nuevo por proyecto: **la fecha de instalación**.
- Agenda con calendario propio y **descarga de `.ics`** (variante UTC, sin `VTIMEZONE`, que elimina de un golpe la clase entera de bugs de zona horaria).
- Mapa OSM con Leaflet servido del repo; `parseGmaps()` sobre `Q.maps` sin una sola petición.
- Módulo de material completo, calculando desde las partidas, con catálogo y constantes en `datos/semilla.json` y existencias en `localStorage`.
- Reglas R6, R8, R9 y R11 funcionando: **tarjetas, sin notificaciones**.
- `scAgregarPartida` respetando `type:'h'` como ancho.

**Esto ya resuelve los 5 requisitos para un usuario en un dispositivo.** Lo único que le pido al usuario: confirmar `prof_canto_cm` y `prof_caja_cm`, y decir si la hoja de acrílico de su proveedor es 122×244 o 122×183.

### Fase 1 — 1 cuenta (Supabase), pegar 2 llaves, correr 4 SQL
Multiusuario real. Tres roles, RLS, almacén compartido con movimientos inmutables, el trigger de existencia, la vista `proyecto_taller`, R1/R5/R7/R10. Login por magic link (sin contraseñas que perder). Los dos workflows de keep-alive y respaldo.
**Lo que tiene que hacer el usuario:** crear el proyecto, copiar `URL` + `anon key` en `mod/nucleo.js`, pegar cuatro SQL en el editor, dar de alta tres usuarios. Una tarde acompañada.

### Fase 2 — 1 cuenta (Google Cloud), pegar 1 client ID
Google Calendar. R2, R3 y R4 pasan de tarjeta a notificación en el teléfono. Publishing status *Testing*, scope `calendar.events`, sin secreto, sin verificación.
**Lo que tiene que hacer el usuario:** crear el proyecto, habilitar la API, crear el OAuth Client de tipo Web con `https://<usuario>.github.io` como origin, listar los tres correos como test users, pegar el client ID. Y aceptar una vez la pantalla de «app no verificada».

### Fase 3 — 1 cuenta (Cloudflare), desplegar 1 Worker, pegar 1 token de Notion
El espejo automático a `Ventas - AL3D`. 20 líneas de Worker, `wrangler secret put NOTION_TOKEN`, allowlist de origen y de path. Es la única fase **opcional**: si no se hace, el botón «copiar fila» de la Fase 0 sigue cubriendo el caso, con un toque más.

---

## Divergencia de precios: mencionada, no arreglada

La página *¿Cómo Cotizar?* (en las 3 copias) documenta `Altura × Tipo de letra × Número de letras`, con $30 sin iluminación / $35 rectas / $40 puntas pronunciadas / $50 manuscrita, y «restar el 20 % sin iluminación». El cotizador cobra por **material** (`al-paint` $30, `al-brush` $35, `acr-vol` $40, `acr-vinil` $45, `acero` $55) más complejidad (`cursiva` +$5, `compleja` +$10) y aplica el ×0.8 sin luz. Son dos ejes distintos: la página mezcla material y forma de letra en una sola escala; el cotizador los separa. **El catálogo del cotizador manda** — es más nuevo, más granular y es el que está en producción. La plataforma no toca ninguno de los dos: congela `_lt` por partida, igual que el historial, por la misma razón ya documentada en el código.

Y queda el hueco de fondo, que la plataforma no puede cerrar sola: **la regla escrita solo cubre letras.** No hay fórmula documentada para cajas de luz, vinil, neón flex, recorte de acrílico ni panel Alucobond, y esos trabajos sí se venden — aparecen en los nombres reales de proyecto («Caja Luz Mostrador», «Panel Alucobond», «Neón Flex "Enjoy"»). El cotizador ya tiene tarifa para cajas ($3,900 / $4,600 por m², mínimo 1 m²), bastidores ($950 / $1,500 por m²) y recortes ($20 / $25 / $55 por cm). **Neón flex no está en ningún catálogo de ningún sistema, y se vende.** Ese es un vacío de negocio, no de arquitectura, y el lugar donde aparecerá es `tipo:'manual'` — la partida que el módulo de material tiene que excluir por diseño porque es una línea de importe sin nada físico derivable.