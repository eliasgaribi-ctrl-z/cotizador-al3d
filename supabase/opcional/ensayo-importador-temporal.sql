-- Importación de la hoja y los teléfonos a Supabase (scripts/importar-hoja.mjs). 
-- IDEMPOTENTE: correrlo dos veces con las mismas entradas no cambia nada la segunda vez.
-- CONTIENE DATOS DE CLIENTES: no lo subas al repositorio ni lo mandes por chat.
-- ENSAYO: todo va en UNA transacción que al final se DESHACE (rollback). No queda nada escrito.
begin;

create temp table if not exists _imp_cambios (tabla text not null, llave text, accion text not null);
truncate _imp_cambios;

-- proyectos: filas 1 a 54
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('proy-a1'::text, 'al3d'::text, 'V-010'::text, 'COT-0001@K7QM'::text, 'COT-0001'::text, 'K7QM'::text, 'cotizacion'::text, false, 'Ana - Tacos Ana'::text, 'Ana'::text, 'Tacos Ana'::text, '33 1234 5678'::text, 'cortado'::text, ARRAY['Letras 3D con iluminacion']::text[], '2026-09-01'::date, ''::text, ''::text, ''::text, ''::text, '20.6597'::double precision, '-103.3496'::double precision, 'maps_pin'::text, false, 'instalacion'::text, '3'::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{"etapa":3000,"instalacion":2500}'::jsonb, '{"folio":"COT-0001","proy":"Tacos Ana","cliente":"Ana","precioAuth":14500,"sub":12500,"items":[{"id":1,"tipo":"Letras","n":8,"pu":1500,"desc":"x"}]}'::jsonb, '{"fila_hoja":2,"celdas":{"B":"Ana - Tacos Ana (Letras 3D con iluminacion)"},"telefonos":["telA","telB"],"actualizado_ms":1700000000000}'::jsonb, to_timestamp(1000 / 1000.0)),
  ('proy-hoja-V-011'::text, 'al3d'::text, 'V-011'::text, NULL::text, 'V-011'::text, 'hoja'::text, 'hoja'::text, false, 'Beto - Taller Beto'::text, 'Ana'::text, 'Tacos Ana'::text, ''::text, 'armado'::text, ARRAY[]::text[], '2026-10-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, 'nota de la hoja'::text, 'FABRICACION'::text, true, NULL::date, '{"etapa":5000}'::jsonb, NULL::jsonb, '{"fila_hoja":3,"telefonos":["telB"],"actualizado_ms":1700000000000}'::jsonb, to_timestamp(3000 / 1000.0)),
  ('proy-hoja-V-012'::text, 'al3d'::text, 'V-012'::text, NULL::text, 'V-012'::text, 'hoja'::text, 'hoja'::text, true, 'Caro - Café Caro'::text, 'Caro'::text, 'Café Caro'::text, ''::text, NULL::text, ARRAY[]::text[], '2025-03-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, false, '2025-03-10'::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":4}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-013'::text, 'al3d'::text, 'V-013'::text, NULL::text, 'V-013'::text, 'hoja'::text, 'hoja'::text, true, 'Dani - Dental Dani'::text, 'Dani'::text, 'Dental Dani'::text, ''::text, NULL::text, ARRAY[]::text[], '2025-04-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":5}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-100'::text, 'al3d'::text, 'V-100'::text, NULL::text, 'V-100'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 0 - Negocio 0'::text, 'Cliente 0'::text, 'Negocio 0'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":6}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-101'::text, 'al3d'::text, 'V-101'::text, NULL::text, 'V-101'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 1 - Negocio 1'::text, 'Cliente 1'::text, 'Negocio 1'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-02'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":7}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-102'::text, 'al3d'::text, 'V-102'::text, NULL::text, 'V-102'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 2 - Negocio 2'::text, 'Cliente 2'::text, 'Negocio 2'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-03'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":8}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-103'::text, 'al3d'::text, 'V-103'::text, NULL::text, 'V-103'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 3 - Negocio 3'::text, 'Cliente 3'::text, 'Negocio 3'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-04'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":9}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-104'::text, 'al3d'::text, 'V-104'::text, NULL::text, 'V-104'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 4 - Negocio 4'::text, 'Cliente 4'::text, 'Negocio 4'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-05'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":10}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-105'::text, 'al3d'::text, 'V-105'::text, NULL::text, 'V-105'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 5 - Negocio 5'::text, 'Cliente 5'::text, 'Negocio 5'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-06'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":11}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-106'::text, 'al3d'::text, 'V-106'::text, NULL::text, 'V-106'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 6 - Negocio 6'::text, 'Cliente 6'::text, 'Negocio 6'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-07'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":12}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-107'::text, 'al3d'::text, 'V-107'::text, NULL::text, 'V-107'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 7 - Negocio 7'::text, 'Cliente 7'::text, 'Negocio 7'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":13}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-108'::text, 'al3d'::text, 'V-108'::text, NULL::text, 'V-108'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 8 - Negocio 8'::text, 'Cliente 8'::text, 'Negocio 8'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-02'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":14}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-109'::text, 'al3d'::text, 'V-109'::text, NULL::text, 'V-109'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 9 - Negocio 9'::text, 'Cliente 9'::text, 'Negocio 9'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-03'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":15}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-110'::text, 'al3d'::text, 'V-110'::text, NULL::text, 'V-110'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 10 - Negocio 10'::text, 'Cliente 10'::text, 'Negocio 10'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-04'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":16}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-111'::text, 'al3d'::text, 'V-111'::text, NULL::text, 'V-111'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 11 - Negocio 11'::text, 'Cliente 11'::text, 'Negocio 11'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-05'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":17}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-112'::text, 'al3d'::text, 'V-112'::text, NULL::text, 'V-112'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 12 - Negocio 12'::text, 'Cliente 12'::text, 'Negocio 12'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-06'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":18}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-113'::text, 'al3d'::text, 'V-113'::text, NULL::text, 'V-113'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 13 - Negocio 13'::text, 'Cliente 13'::text, 'Negocio 13'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-07'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":19}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-114'::text, 'al3d'::text, 'V-114'::text, NULL::text, 'V-114'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 14 - Negocio 14'::text, 'Cliente 14'::text, 'Negocio 14'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-08'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":20}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-115'::text, 'al3d'::text, 'V-115'::text, NULL::text, 'V-115'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 15 - Negocio 15'::text, 'Cliente 15'::text, 'Negocio 15'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-09'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":21}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-116'::text, 'al3d'::text, 'V-116'::text, NULL::text, 'V-116'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 16 - Negocio 16'::text, 'Cliente 16'::text, 'Negocio 16'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-10'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":22}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-117'::text, 'al3d'::text, 'V-117'::text, NULL::text, 'V-117'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 17 - Negocio 17'::text, 'Cliente 17'::text, 'Negocio 17'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-06-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":23}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-118'::text, 'al3d'::text, 'V-118'::text, NULL::text, 'V-118'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 18 - Negocio 18'::text, 'Cliente 18'::text, 'Negocio 18'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-06-02'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":24}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-119'::text, 'al3d'::text, 'V-119'::text, NULL::text, 'V-119'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 19 - Negocio 19'::text, 'Cliente 19'::text, 'Negocio 19'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-10-01'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":25}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-120'::text, 'al3d'::text, 'V-120'::text, NULL::text, 'V-120'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 20 - Negocio 20'::text, 'Cliente 20'::text, 'Negocio 20'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-10-02'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":26}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-121'::text, 'al3d'::text, 'V-121'::text, NULL::text, 'V-121'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 21 - Negocio 21'::text, 'Cliente 21'::text, 'Negocio 21'::text, ''::text, NULL::text, ARRAY[]::text[], NULL::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":27}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-122'::text, 'al3d'::text, 'V-122'::text, NULL::text, 'V-122'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 22 - Negocio 22'::text, 'Cliente 22'::text, 'Negocio 22'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-01-10'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":28}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-123'::text, 'al3d'::text, 'V-123'::text, NULL::text, 'V-123'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 23 - Negocio 23'::text, 'Cliente 23'::text, 'Negocio 23'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-02-11'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":29}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-124'::text, 'al3d'::text, 'V-124'::text, NULL::text, 'V-124'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 24 - Negocio 24'::text, 'Cliente 24'::text, 'Negocio 24'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-03-12'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":30}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-125'::text, 'al3d'::text, 'V-125'::text, NULL::text, 'V-125'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 25 - Negocio 25'::text, 'Cliente 25'::text, 'Negocio 25'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-04-13'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":31}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-126'::text, 'al3d'::text, 'V-126'::text, NULL::text, 'V-126'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 26 - Negocio 26'::text, 'Cliente 26'::text, 'Negocio 26'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-05-14'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":32}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-127'::text, 'al3d'::text, 'V-127'::text, NULL::text, 'V-127'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 27 - Negocio 27'::text, 'Cliente 27'::text, 'Negocio 27'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-06-15'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":33}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-128'::text, 'al3d'::text, 'V-128'::text, NULL::text, 'V-128'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 28 - Negocio 28'::text, 'Cliente 28'::text, 'Negocio 28'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-07-16'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":34}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-129'::text, 'al3d'::text, 'V-129'::text, NULL::text, 'V-129'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 29 - Negocio 29'::text, 'Cliente 29'::text, 'Negocio 29'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-08-17'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":35}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-130'::text, 'al3d'::text, 'V-130'::text, NULL::text, 'V-130'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 30 - Negocio 30'::text, 'Cliente 30'::text, 'Negocio 30'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-09-18'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":36}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-131'::text, 'al3d'::text, 'V-131'::text, NULL::text, 'V-131'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 31 - Negocio 31'::text, 'Cliente 31'::text, 'Negocio 31'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-01-19'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":37}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-132'::text, 'al3d'::text, 'V-132'::text, NULL::text, 'V-132'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 32 - Negocio 32'::text, 'Cliente 32'::text, 'Negocio 32'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-02-10'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":38}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-133'::text, 'al3d'::text, 'V-133'::text, NULL::text, 'V-133'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 33 - Negocio 33'::text, 'Cliente 33'::text, 'Negocio 33'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-03-11'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":39}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-134'::text, 'al3d'::text, 'V-134'::text, NULL::text, 'V-134'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 34 - Negocio 34'::text, 'Cliente 34'::text, 'Negocio 34'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-04-12'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":40}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-135'::text, 'al3d'::text, 'V-135'::text, NULL::text, 'V-135'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 35 - Negocio 35'::text, 'Cliente 35'::text, 'Negocio 35'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-05-13'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":41}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-136'::text, 'al3d'::text, 'V-136'::text, NULL::text, 'V-136'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 36 - Negocio 36'::text, 'Cliente 36'::text, 'Negocio 36'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-06-14'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":42}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-137'::text, 'al3d'::text, 'V-137'::text, NULL::text, 'V-137'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 37 - Negocio 37'::text, 'Cliente 37'::text, 'Negocio 37'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-07-15'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":43}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-138'::text, 'al3d'::text, 'V-138'::text, NULL::text, 'V-138'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 38 - Negocio 38'::text, 'Cliente 38'::text, 'Negocio 38'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-16'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":44}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-139'::text, 'al3d'::text, 'V-139'::text, NULL::text, 'V-139'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 39 - Negocio 39'::text, 'Cliente 39'::text, 'Negocio 39'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-09-17'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":45}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-140'::text, 'al3d'::text, 'V-140'::text, NULL::text, 'V-140'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 40 - Negocio 40'::text, 'Cliente 40'::text, 'Negocio 40'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-01-18'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":46}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-141'::text, 'al3d'::text, 'V-141'::text, NULL::text, 'V-141'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 41 - Negocio 41'::text, 'Cliente 41'::text, 'Negocio 41'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-02-19'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":47}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-142'::text, 'al3d'::text, 'V-142'::text, NULL::text, 'V-142'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 42 - Negocio 42'::text, 'Cliente 42'::text, 'Negocio 42'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-03-10'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":48}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-143'::text, 'al3d'::text, 'V-143'::text, NULL::text, 'V-143'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 43 - Negocio 43'::text, 'Cliente 43'::text, 'Negocio 43'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-04-11'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":49}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-144'::text, 'al3d'::text, 'V-144'::text, NULL::text, 'V-144'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 44 - Negocio 44'::text, 'Cliente 44'::text, 'Negocio 44'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-05-12'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":50}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-145'::text, 'al3d'::text, 'V-145'::text, NULL::text, 'V-145'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 45 - Negocio 45'::text, 'Cliente 45'::text, 'Negocio 45'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-06-13'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":51}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-146'::text, 'al3d'::text, 'V-146'::text, NULL::text, 'V-146'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 46 - Negocio 46'::text, 'Cliente 46'::text, 'Negocio 46'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-07-14'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'COBRANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":52}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-147'::text, 'al3d'::text, 'V-147'::text, NULL::text, 'V-147'::text, 'hoja'::text, 'hoja'::text, true, 'Cliente 47 - Negocio 47'::text, 'Cliente 47'::text, 'Negocio 47'::text, ''::text, NULL::text, ARRAY[]::text[], '2026-08-15'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'LIQUIDADO'::text, false, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":53}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-148'::text, 'al3d'::text, 'V-148'::text, NULL::text, 'V-148'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 48 - Negocio 48'::text, 'Cliente 48'::text, 'Negocio 48'::text, ''::text, 'en_diseno'::text, ARRAY[]::text[], '2026-09-16'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'FABRICACION'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":54}'::jsonb, NULL::timestamptz),
  ('proy-hoja-V-149'::text, 'al3d'::text, 'V-149'::text, NULL::text, 'V-149'::text, 'hoja'::text, 'hoja'::text, false, 'Cliente 49 - Negocio 49'::text, 'Cliente 49'::text, 'Negocio 49'::text, ''::text, 'ganado'::text, ARRAY[]::text[], '2026-01-17'::date, ''::text, ''::text, ''::text, ''::text, NULL::double precision, NULL::double precision, 'sin_ubicar'::text, false, NULL::text, NULL::integer, ''::text, 'REPARANDO'::text, true, NULL::date, '{}'::jsonb, NULL::jsonb, '{"fila_hoja":55}'::jsonb, NULL::timestamptz)
) as v(id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel, etapa, tipo_trabajo, fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k, notas, estatus, iva, fecha_instalacion_hist, sellos, origen, procedencia, creado_ms);
    insert into _imp_cambios (tabla, llave, accion)
      select 'proyectos', l.id, 'conflicto: su folio ya es de ' || p.id
        from _lote l join public.proyectos p on p.empresa_id = l.empresa_id and p.id <> l.id
                                              and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global);
    with w as (
      insert into public.proyectos as t (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel,
             etapa, tipo_trabajo, fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k,
             notas, estatus, iva, fecha_instalacion_hist, sellos, origen_obra, procedencia, created_at)
      select l.id, l.empresa_id, l.folio_hoja, l.folio_global, l.folio_local, l.dispositivo, l.fuente, l.historica, l.nombre, l.contacto, l.negocio, l.tel,
             l.etapa, l.tipo_trabajo, l.fecha_anticipo, l.compromiso_texto, l.dir_texto, l.entrecalles, l.maps_url, l.lat, l.lng, l.geo_fuente, l.ubicacion_pendiente,
             l.entrega, l.plazo_k, l.notas, l.estatus, l.iva, l.fecha_instalacion_hist, l.sellos,
             case when l.origen is null then null else (select o.obra from interno.partir_origen(l.origen) o) end,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where not exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id <> l.id
                                                          and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global))
      on conflict (id) do update set
             folio_hoja = coalesce(t.folio_hoja, excluded.folio_hoja), folio_global = coalesce(t.folio_global, excluded.folio_global),
             nombre = excluded.nombre, contacto = excluded.contacto, negocio = excluded.negocio, tel = excluded.tel, etapa = excluded.etapa,
             tipo_trabajo = excluded.tipo_trabajo, fecha_anticipo = excluded.fecha_anticipo, compromiso_texto = excluded.compromiso_texto,
             dir_texto = excluded.dir_texto, entrecalles = excluded.entrecalles, maps_url = excluded.maps_url, lat = excluded.lat, lng = excluded.lng,
             geo_fuente = excluded.geo_fuente, ubicacion_pendiente = excluded.ubicacion_pendiente, entrega = excluded.entrega, plazo_k = excluded.plazo_k,
             notas = excluded.notas, estatus = excluded.estatus, iva = excluded.iva, fecha_instalacion_hist = excluded.fecha_instalacion_hist,
             sellos = excluded.sellos, origen_obra = excluded.origen_obra, procedencia = excluded.procedencia
       where (t.folio_hoja, t.folio_global, t.nombre, t.contacto, t.negocio, t.tel, t.etapa, t.tipo_trabajo, t.fecha_anticipo, t.compromiso_texto, t.dir_texto,
              t.entrecalles, t.maps_url, t.lat, t.lng, t.geo_fuente, t.ubicacion_pendiente, t.entrega, t.plazo_k, t.notas, t.estatus, t.iva,
              t.fecha_instalacion_hist, t.sellos, t.origen_obra, t.procedencia)
             is distinct from
             (coalesce(t.folio_hoja, excluded.folio_hoja), coalesce(t.folio_global, excluded.folio_global), excluded.nombre, excluded.contacto, excluded.negocio,
              excluded.tel, excluded.etapa, excluded.tipo_trabajo, excluded.fecha_anticipo, excluded.compromiso_texto, excluded.dir_texto, excluded.entrecalles,
              excluded.maps_url, excluded.lat, excluded.lng, excluded.geo_fuente, excluded.ubicacion_pendiente, excluded.entrega, excluded.plazo_k, excluded.notas,
              excluded.estatus, excluded.iva, excluded.fecha_instalacion_hist, excluded.sellos, excluded.origen_obra, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'proyectos', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- ventas_dinero: filas 1 a 54
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('proy-a1'::text, 'al3d'::text, '12500'::numeric, '6000'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '14500'::numeric, '{"folio":"COT-0001","proy":"Tacos Ana","cliente":"Ana","precioAuth":14500,"sub":12500,"items":[{"id":1,"tipo":"Letras","n":8,"pu":1500,"desc":"x"}]}'::jsonb, '{"sub":12500,"neto":14500}'::jsonb, '{"fila_hoja":2}'::jsonb),
  ('proy-hoja-V-011'::text, 'al3d'::text, '800'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '928'::numeric, NULL::jsonb, '{"sub":null,"neto":null}'::jsonb, '{"fila_hoja":3}'::jsonb),
  ('proy-hoja-V-012'::text, 'al3d'::text, '500'::numeric, '500'::numeric, '0'::numeric, 'Elias BBVA'::text, '2025-03-15'::date, NULL::numeric, '500'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":4}'::jsonb),
  ('proy-hoja-V-013'::text, 'al3d'::text, '300'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '348'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":5}'::jsonb),
  ('proy-hoja-V-100'::text, 'al3d'::text, '10000'::numeric, '5800'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '11600'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":6}'::jsonb),
  ('proy-hoja-V-101'::text, 'al3d'::text, '10000'::numeric, '0'::numeric, '0'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '10000'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":7}'::jsonb),
  ('proy-hoja-V-102'::text, 'al3d'::text, '1.45'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '1.68'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":8}'::jsonb),
  ('proy-hoja-V-103'::text, 'al3d'::text, '2.35'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '2.73'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":9}'::jsonb),
  ('proy-hoja-V-104'::text, 'al3d'::text, '0.05'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '0.06'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":10}'::jsonb),
  ('proy-hoja-V-105'::text, 'al3d'::text, '-1.45'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '-1.68'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":11}'::jsonb),
  ('proy-hoja-V-106'::text, 'al3d'::text, '4310.34'::numeric, '5000'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '4999.99'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":12}'::jsonb),
  ('proy-hoja-V-107'::text, 'al3d'::text, '1000'::numeric, '500'::numeric, '100'::numeric, 'Constru BNT'::text, '2026-07-20'::date, NULL::numeric, '1160'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":13}'::jsonb),
  ('proy-hoja-V-108'::text, 'al3d'::text, '1000'::numeric, '1160'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '1160'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":14}'::jsonb),
  ('proy-hoja-V-109'::text, 'al3d'::text, '1000'::numeric, '1000'::numeric, '200'::numeric, NULL::text, NULL::date, NULL::numeric, '1160'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":15}'::jsonb),
  ('proy-hoja-V-110'::text, 'al3d'::text, '1000'::numeric, '1160'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '1160'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":16}'::jsonb),
  ('proy-hoja-V-111'::text, 'al3d'::text, '1000'::numeric, '2000'::numeric, '0'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '1160'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":17}'::jsonb),
  ('proy-hoja-V-112'::text, 'al3d'::text, '800'::numeric, '0'::numeric, '0'::numeric, 'Rul HSBC'::text, NULL::date, NULL::numeric, '800'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":18}'::jsonb),
  ('proy-hoja-V-113'::text, 'al3d'::text, '800'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '800'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":19}'::jsonb),
  ('proy-hoja-V-114'::text, 'al3d'::text, '0'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '0'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":20}'::jsonb),
  ('proy-hoja-V-115'::text, 'al3d'::text, '-500'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '-580'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":21}'::jsonb),
  ('proy-hoja-V-116'::text, 'al3d'::text, '100.005'::numeric, '0.001'::numeric, '0.002'::numeric, NULL::text, NULL::date, NULL::numeric, '116.01'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":22}'::jsonb),
  ('proy-hoja-V-117'::text, 'al3d'::text, '10000'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '10000'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":23}'::jsonb),
  ('proy-hoja-V-118'::text, 'al3d'::text, '2000'::numeric, '2320'::numeric, '0'::numeric, 'Moni MPago'::text, '2026-06-14'::date, NULL::numeric, '2320'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":24}'::jsonb),
  ('proy-hoja-V-119'::text, 'al3d'::text, '3500.5'::numeric, '1000'::numeric, '0'::numeric, 'Tatis BNT'::text, NULL::date, NULL::numeric, '4060.58'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":25}'::jsonb),
  ('proy-hoja-V-120'::text, 'al3d'::text, '0.01'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '0.01'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":26}'::jsonb),
  ('proy-hoja-V-121'::text, 'al3d'::text, '0.01'::numeric, '0'::numeric, '0'::numeric, NULL::text, NULL::date, NULL::numeric, '0.01'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":27}'::jsonb),
  ('proy-hoja-V-122'::text, 'al3d'::text, '0.005'::numeric, '0'::numeric, '0'::numeric, NULL::text, '2026-09-20'::date, NULL::numeric, '0.01'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":28}'::jsonb),
  ('proy-hoja-V-123'::text, 'al3d'::text, '791.9'::numeric, '3.7'::numeric, '12.25'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '791.9'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":29}'::jsonb),
  ('proy-hoja-V-124'::text, 'al3d'::text, '158.38'::numeric, '7.4'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '183.72'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":30}'::jsonb),
  ('proy-hoja-V-125'::text, 'al3d'::text, '23.757'::numeric, '0'::numeric, '0'::numeric, 'Moni MPago'::text, NULL::date, NULL::numeric, '27.56'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":31}'::jsonb),
  ('proy-hoja-V-126'::text, 'al3d'::text, '31676'::numeric, '14.8'::numeric, '0'::numeric, 'Rul HSBC'::text, NULL::date, NULL::numeric, '36744.16'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":32}'::jsonb),
  ('proy-hoja-V-127'::text, 'al3d'::text, '3959.505'::numeric, '18.5'::numeric, '12.25'::numeric, 'Tatis BNT'::text, NULL::date, NULL::numeric, '4593.03'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":33}'::jsonb),
  ('proy-hoja-V-128'::text, 'al3d'::text, '475.14'::numeric, '0'::numeric, '0'::numeric, NULL::text, '2026-09-26'::date, NULL::numeric, '551.16'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":34}'::jsonb),
  ('proy-hoja-V-129'::text, 'al3d'::text, '55.433'::numeric, '25.9'::numeric, '0'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '64.3'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":35}'::jsonb),
  ('proy-hoja-V-130'::text, 'al3d'::text, '63352'::numeric, '29.6'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '73488.32'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":36}'::jsonb),
  ('proy-hoja-V-131'::text, 'al3d'::text, '-7127.1'::numeric, '0'::numeric, '12.25'::numeric, 'Moni MPago'::text, NULL::date, NULL::numeric, '-8267.44'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":37}'::jsonb),
  ('proy-hoja-V-132'::text, 'al3d'::text, '791.905'::numeric, '37'::numeric, '0'::numeric, 'Rul HSBC'::text, NULL::date, NULL::numeric, '918.61'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":38}'::jsonb),
  ('proy-hoja-V-133'::text, 'al3d'::text, '87.109'::numeric, '40.7'::numeric, '0'::numeric, 'Tatis BNT'::text, NULL::date, NULL::numeric, '101.05'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":39}'::jsonb),
  ('proy-hoja-V-134'::text, 'al3d'::text, '5028'::numeric, '0'::numeric, '0'::numeric, NULL::text, '2026-09-22'::date, NULL::numeric, '5832.48'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":40}'::jsonb),
  ('proy-hoja-V-135'::text, 'al3d'::text, '1294.7'::numeric, '48.1'::numeric, '12.25'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '1294.7'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":41}'::jsonb),
  ('proy-hoja-V-136'::text, 'al3d'::text, '208.66'::numeric, '51.8'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '208.66'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":42}'::jsonb),
  ('proy-hoja-V-137'::text, 'al3d'::text, '28.79'::numeric, '0'::numeric, '0'::numeric, 'Moni MPago'::text, NULL::date, NULL::numeric, '33.4'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":43}'::jsonb),
  ('proy-hoja-V-138'::text, 'al3d'::text, '36704'::numeric, '59.2'::numeric, '0'::numeric, 'Rul HSBC'::text, NULL::date, NULL::numeric, '42576.64'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":44}'::jsonb),
  ('proy-hoja-V-139'::text, 'al3d'::text, '4462.3'::numeric, '62.9'::numeric, '12.25'::numeric, 'Tatis BNT'::text, NULL::date, NULL::numeric, '5176.27'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":45}'::jsonb),
  ('proy-hoja-V-140'::text, 'al3d'::text, '-525.42'::numeric, '0'::numeric, '0'::numeric, NULL::text, '2026-09-28'::date, NULL::numeric, '-609.49'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":46}'::jsonb),
  ('proy-hoja-V-141'::text, 'al3d'::text, '60.461'::numeric, '70.3'::numeric, '0'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '60.46'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":47}'::jsonb),
  ('proy-hoja-V-142'::text, 'al3d'::text, '68380.005'::numeric, '74'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '79320.81'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":48}'::jsonb),
  ('proy-hoja-V-143'::text, 'al3d'::text, '7629.9'::numeric, '0'::numeric, '12.25'::numeric, 'Moni MPago'::text, NULL::date, NULL::numeric, '7629.9'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":49}'::jsonb),
  ('proy-hoja-V-144'::text, 'al3d'::text, '842.18'::numeric, '81.4'::numeric, '0'::numeric, 'Rul HSBC'::text, NULL::date, NULL::numeric, '976.93'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":50}'::jsonb),
  ('proy-hoja-V-145'::text, 'al3d'::text, '2.137'::numeric, '85.1'::numeric, '0'::numeric, 'Tatis BNT'::text, NULL::date, NULL::numeric, '2.48'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":51}'::jsonb),
  ('proy-hoja-V-146'::text, 'al3d'::text, '10056'::numeric, '0'::numeric, '0'::numeric, NULL::text, '2026-09-24'::date, NULL::numeric, '11664.96'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":52}'::jsonb),
  ('proy-hoja-V-147'::text, 'al3d'::text, '1797.505'::numeric, '92.5'::numeric, '12.25'::numeric, 'Elias BBVA'::text, NULL::date, NULL::numeric, '1797.51'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":53}'::jsonb),
  ('proy-hoja-V-148'::text, 'al3d'::text, '258.94'::numeric, '96.2'::numeric, '0'::numeric, 'Constru BNT'::text, NULL::date, NULL::numeric, '300.37'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":54}'::jsonb),
  ('proy-hoja-V-149'::text, 'al3d'::text, '-33.813'::numeric, '0'::numeric, '0'::numeric, 'Moni MPago'::text, NULL::date, NULL::numeric, '-39.22'::numeric, NULL::jsonb, NULL::jsonb, '{"fila_hoja":55}'::jsonb)
) as v(proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth, origen, venta_local, procedencia);
    with w as (
      insert into public.ventas_dinero as t (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth,
             origen_dinero, procedencia)
      select l.proyecto_id, l.empresa_id, l.subtotal, l.anticipo, l.liquidacion, l.cuenta, l.fecha_liquidacion, l.pct_comision, l.precio_auth,
             case when l.origen is null and l.venta_local is null then null
                  else case when l.origen is null then '{}'::jsonb else (select o.dinero from interno.partir_origen(l.origen) o) end
                       || case when l.venta_local is null then '{}'::jsonb else jsonb_build_object('venta', l.venta_local) end end,
             l.procedencia
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id and p.folio_hoja is not null)
      on conflict (proyecto_id) do update set
             subtotal = excluded.subtotal, anticipo = excluded.anticipo, liquidacion = excluded.liquidacion, cuenta = excluded.cuenta,
             fecha_liquidacion = excluded.fecha_liquidacion, pct_comision = excluded.pct_comision, precio_auth = excluded.precio_auth,
             origen_dinero = excluded.origen_dinero, procedencia = excluded.procedencia
       where (t.subtotal, t.anticipo, t.liquidacion, t.cuenta, t.fecha_liquidacion, t.pct_comision, t.precio_auth, t.origen_dinero, t.procedencia)
             is distinct from (excluded.subtotal, excluded.anticipo, excluded.liquidacion, excluded.cuenta, excluded.fecha_liquidacion,
                               excluded.pct_comision, excluded.precio_auth, excluded.origen_dinero, excluded.procedencia)
      returning t.proyecto_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'ventas_dinero', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- abonos: filas 1 a 16
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, 'V-010'::text, '250'::numeric, '2026-09-20'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:5aea6a7e018edb99:1'::text, '{"fila_hoja":2}'::jsonb),
  ('al3d'::text, 'V-110'::text, '150'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:196712561d797c87:1'::text, '{"fila_hoja":3}'::jsonb),
  ('al3d'::text, 'V-117'::text, '100'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:9000a5c8585d4261:1'::text, '{"fila_hoja":4}'::jsonb),
  ('al3d'::text, 'V-117'::text, '200'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:98dbcf617ea949bc:1'::text, '{"fila_hoja":5}'::jsonb),
  ('al3d'::text, 'V-117'::text, '50.55'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:59cb980ed41f4459:1'::text, '{"fila_hoja":6}'::jsonb),
  ('al3d'::text, 'V-117'::text, '-50'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'correccion'::text, 'hoja:abono:4c04127326291cf3:1'::text, '{"fila_hoja":7}'::jsonb),
  ('al3d'::text, 'V-122'::text, '1.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:fb3ccf3e30d848a3:1'::text, '{"fila_hoja":8}'::jsonb),
  ('al3d'::text, 'V-125'::text, '4.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:0fb25a89e8925460:1'::text, '{"fila_hoja":9}'::jsonb),
  ('al3d'::text, 'V-128'::text, '7.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:5b2cd1e6683875fe:1'::text, '{"fila_hoja":10}'::jsonb),
  ('al3d'::text, 'V-131'::text, '10.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:026d2a5c30d772b4:1'::text, '{"fila_hoja":11}'::jsonb),
  ('al3d'::text, 'V-134'::text, '13.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:407b36c78df97371:1'::text, '{"fila_hoja":12}'::jsonb),
  ('al3d'::text, 'V-137'::text, '16.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:cf58ac82d5c07d73:1'::text, '{"fila_hoja":13}'::jsonb),
  ('al3d'::text, 'V-140'::text, '19.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:f792d2dbdbb5fac7:1'::text, '{"fila_hoja":14}'::jsonb),
  ('al3d'::text, 'V-143'::text, '22.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:f1aab731d1324f7c:1'::text, '{"fila_hoja":15}'::jsonb),
  ('al3d'::text, 'V-146'::text, '25.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:343379a7b74aee74:1'::text, '{"fila_hoja":16}'::jsonb),
  ('al3d'::text, 'V-149'::text, '28.1'::numeric, '2026-09-15'::date, 'abono'::text, NULL::text, 'historico'::text, 'hoja:abono:c32157382fca8174:1'::text, '{"fila_hoja":17}'::jsonb)
) as v(empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo, op_id, procedencia);
    with w as (
      insert into public.abonos as t (empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo, op_id, procedencia)
      select l.empresa_id, l.folio_hoja, l.importe, l.fecha, l.nota, l.pago_id, l.tipo, l.op_id, l.procedencia from _lote l
      on conflict (empresa_id, op_id, folio_hoja) where op_id is not null do nothing
      returning t.op_id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'abonos', llave, 'alta' from w;

-- miembros: filas 1 a 2
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, 'dueno@al3d.test'::text, 'direccion'::text, 'El dueño de la hoja.'::text),
  ('al3d'::text, 'pagos@al3d.test'::text, 'pagos'::text, ''::text)
) as v(empresa_id, correo, area, nota);
    with w as (
      insert into public.miembros as t (empresa_id, correo, area, nota)
      select l.empresa_id, l.correo, l.area, l.nota from _lote l
      on conflict (empresa_id, correo) do nothing
      returning t.correo as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'miembros', llave, 'alta' from w;

-- instalaciones: filas 1 a 3
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('ins-a'::text, 'al3d'::text, 'proy-a1'::text, '2026-10-20'::date, NULL::text, 'dia'::text, '180'::integer, 'cancelada'::text, '1'::integer, ''::text, '{"telefono":"telA","fusionada_en":"ins-b"}'::jsonb, to_timestamp(1000 / 1000.0)),
  ('ins-b'::text, 'al3d'::text, 'proy-a1'::text, '2026-10-22'::date, '09:00'::text, 'dia'::text, '120'::integer, 'reagendada'::text, '2'::integer, 'Movida del 20 al 22'::text, '{"telefono":"telB"}'::jsonb, to_timestamp(2000 / 1000.0)),
  ('hoja-V-119'::text, 'al3d'::text, 'proy-hoja-V-119'::text, '2026-10-25'::date, NULL::text, 'dia'::text, '180'::integer, 'confirmada'::text, '0'::integer, 'Agendada desde la hoja.'::text, '{"hoja":true}'::jsonb, NULL::timestamptz)
) as v(id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, notas, procedencia, creado_ms);
    with w as (
      insert into public.instalaciones as t (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas, procedencia, created_at)
      select l.id, l.empresa_id, l.proyecto_id, l.fecha, l.hora, l.ventana, l.duracion_min, l.estado, l.movida, 'inst-' || l.id || '@al3d.mx', l.notas,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
       order by (l.estado <> 'cancelada'), l.id
      on conflict (id) do update set
             fecha = excluded.fecha, hora = excluded.hora, ventana = excluded.ventana, duracion_min = excluded.duracion_min, estado = excluded.estado,
             movida = greatest(t.movida, excluded.movida), notas = excluded.notas, procedencia = excluded.procedencia
       where (t.fecha, t.hora, t.ventana, t.duracion_min, t.estado, t.movida, t.notas, t.procedencia)
             is distinct from (excluded.fecha, excluded.hora, excluded.ventana, excluded.duracion_min, excluded.estado,
                               greatest(t.movida, excluded.movida), excluded.notas, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'instalaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- materiales: filas 1 a 19
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, 'acr-3mm'::text, 'Acrílico blanco/opal 3 mm'::text, 'acrilico'::text, 'lamina'::text, 'm2'::text, '1.22 × 2.44 m'::text, '2.9768'::numeric, '1.22 m × 2.44 m = 2.9768 m² por lámina. Merma 25%: el nesting de letras deja recortes que casi nunca se reusan.'::text, '244'::numeric, '122'::numeric, ''::text, '0.25'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'acr-6mm'::text, 'Acrílico blanco 6 mm'::text, 'acrilico'::text, 'lamina'::text, 'm2'::text, '1.22 × 2.44 m'::text, '2.9768'::numeric, 'Igual que el de 3 mm: la lámina mide lo mismo, cambia el espesor. Se usa en letras de más de 40 cm y en caras de caja de luz, donde el 3 mm se pandea.'::text, '244'::numeric, '122'::numeric, ''::text, '0.25'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'al-pintado'::text, 'Lámina aluminio pintado'::text, 'aluminio'::text, 'lamina'::text, 'm2'::text, '1.22 × 2.44 m'::text, '2.9768'::numeric, '1.22 × 2.44 = 2.9768 m². Merma 12%, menor que el acrílico: el aluminio se dobla en vez de cortarse en silueta.'::text, '244'::numeric, '122'::numeric, ''::text, '0.12'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'al-brush'::text, 'Lámina aluminio brush cepillado'::text, 'aluminio'::text, 'lamina'::text, 'm2'::text, '1.22 × 2.44 m'::text, '2.9768'::numeric, 'Igual que el pintado. OJO: el cepillado tiene dirección, así que en la práctica la merma puede ser mayor si las piezas tienen que ir todas al mismo hilo.'::text, '244'::numeric, '122'::numeric, ''::text, '0.12'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'fleje-al-pintado'::text, 'Fleje aluminio pintado 5 cm'::text, 'fleje'::text, 'metro'::text, 'm'::text, 'rollo de 30 m'::text, '1'::numeric, 'Se compra por metro y se consume por metro: factor 1. El mínimo es el rollo de 30 m porque nadie vende 4 m de fleje.'::text, '3000'::numeric, '5'::numeric, ''::text, '0.12'::numeric, false, '30'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'fleje-al-brush'::text, 'Fleje aluminio brush 5 cm'::text, 'fleje'::text, 'metro'::text, 'm'::text, 'rollo de 30 m'::text, '1'::numeric, 'Igual que el pintado.'::text, '3000'::numeric, '5'::numeric, ''::text, '0.12'::numeric, false, '30'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'fleje-inox'::text, 'Fleje acero inoxidable espejo 5 cm'::text, 'fleje'::text, 'lamina'::text, 'm'::text, '1.22 × 2.44 m'::text, '58.56'::numeric, 'El inox no viene en rollo: se compra la lámina y se corta en tiras. floor(122 cm / 5 cm) = 24 tiras × 2.44 m = 58.56 m de fleje por lámina. Los 2 cm que sobran a lo ancho son el desperdicio ya contado.'::text, '244'::numeric, '122'::numeric, ''::text, '0.15'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'lam-galv'::text, 'Lámina galvanizada calibre 24'::text, 'lamina'::text, 'lamina'::text, 'm2'::text, '1.22 × 2.44 m'::text, '2.9768'::numeric, '1.22 × 2.44 = 2.9768 m². Es el panel del bastidor y la trasera y el marco de la caja de luz.'::text, '244'::numeric, '122'::numeric, ''::text, '0.1'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'alucobond'::text, 'Alucobond 4 mm'::text, 'lamina'::text, 'lamina'::text, 'm2'::text, '1.25 × 2.50 m'::text, '3.125'::numeric, '1.25 × 2.50 = 3.125 m². Su lámina es más grande que la de acrílico y aluminio: 2.50 m de largo, no 2.44. Importa cuando una pieza mide 2.45 m.'::text, '250'::numeric, '125'::numeric, ''::text, '0.1'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'vinil-corte'::text, 'Vinil de corte'::text, 'vinil'::text, 'metro'::text, 'm2'::text, 'rollo de 1.22 m de ancho'::text, '1.22'::numeric, 'Un metro lineal de un rollo de 1.22 m de ancho da 1.22 m². Merma 20%: el vinil se corta con márgenes de agarre y las piezas no tesela.'::text, NULL::numeric, '122'::numeric, ''::text, '0.2'::numeric, true, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'led-6500'::text, 'Módulo LED 12 V 6500 K (luz fría)'::text, 'iluminacion'::text, 'caja'::text, 'pieza'::text, 'caja de 100 módulos'::text, '100'::numeric, 'Caja de 100. La temperatura NO cambia la cantidad: son dos claves distintas del catálogo, y hasta hoy nadie sabía cuál pedir hasta abrir la caja.'::text, NULL::numeric, NULL::numeric, ''::text, '0.03'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'led-3000'::text, 'Módulo LED 12 V 3000 K (luz cálida)'::text, 'iluminacion'::text, 'caja'::text, 'pieza'::text, 'caja de 100 módulos'::text, '100'::numeric, 'Caja de 100, igual que la fría.'::text, NULL::numeric, NULL::numeric, ''::text, '0.03'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'fuente-60'::text, 'Fuente 12 V 60 W'::text, 'iluminacion'::text, 'unidad'::text, 'pieza'::text, ''::text, '1'::numeric, 'Se compra por pieza. 12 V 5 A = 60 W nominales; el cálculo de cuántas hacen falta usa 48 W útiles (ver DERATE_FUENTE).'::text, NULL::numeric, NULL::numeric, ''::text, '0'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'tubular-1'::text, 'Tubular 1" calibre 18'::text, 'estructura'::text, 'unidad'::text, 'cm'::text, 'tramo de 6 m'::text, '600'::numeric, 'Un tramo de 6 m son 600 cm. Se consume en cm porque el bastidor se mide en cm en el cotizador. El tubular de 1" está nombrado tal cual en la descripción que el cotizador imprime.'::text, '600'::numeric, NULL::numeric, ''::text, '0.08'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'remache-18'::text, 'Remache 1/8"'::text, 'herraje'::text, 'caja'::text, 'pieza'::text, 'caja de 500'::text, '500'::numeric, 'Caja de 500.'::text, NULL::numeric, NULL::numeric, ''::text, '0.03'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'pija-taquete'::text, 'Taquete + pija 1/4 × 2"'::text, 'herraje'::text, 'bolsa'::text, 'pieza'::text, 'bolsa de 100 juegos'::text, '100'::numeric, 'Bolsa de 100 juegos. Se cuenta el juego completo como una pieza: nadie pone el taquete sin la pija.'::text, NULL::numeric, NULL::numeric, ''::text, '0.03'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'separador-20'::text, 'Separador inox 20 mm'::text, 'herraje'::text, 'bolsa'::text, 'pieza'::text, 'bolsa de 50'::text, '50'::numeric, 'Bolsa de 50. Es lo que separa la letra del muro para que la luz posterior se vea.'::text, NULL::numeric, NULL::numeric, ''::text, '0.03'::numeric, false, '1'::numeric, '0'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'silicon'::text, 'Silicón estructural'::text, 'consumible'::text, 'unidad'::text, 'm'::text, 'cartucho'::text, '12'::numeric, 'Un cartucho de 300 ml da ~12 m de cordón de 5 mm. VERIFICAR: depende del grosor del cordón que use tu gente.'::text, NULL::numeric, NULL::numeric, ''::text, '0'::numeric, false, '1'::numeric, '1'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'solvente'::text, 'Limpiador / solvente'::text, 'consumible'::text, 'litro'::text, 'm2'::text, ''::text, '25'::numeric, 'Un litro alcanza para ~25 m² de limpieza de acrílico y aluminio antes de armar. Es un consumible: no se pide por proyecto, se repone por mínimo.'::text, NULL::numeric, NULL::numeric, ''::text, '0'::numeric, true, '1'::numeric, '2'::numeric, ''::text, ''::text, true, '{"_editado":1}'::jsonb, '{"de":"semilla"}'::jsonb, NULL::timestamptz)
) as v(empresa_id, id, nombre, familia, unidad_compra, unidad_consumo, medida, factor, factor_origen, largo_cm, ancho_cm, espesor, merma_pct, fraccionable, min_compra, min_stock, proveedor, tel_proveedor, activo, sellos, procedencia, creado_ms);
    with w as (
      insert into public.materiales as t (empresa_id, id, nombre, familia, unidad_compra, unidad_consumo, medida, factor, factor_origen, largo_cm, ancho_cm,
             espesor, merma_pct, fraccionable, min_compra, min_stock, proveedor, tel_proveedor, activo, sellos, procedencia, created_at)
      select l.empresa_id, l.id, l.nombre, l.familia, l.unidad_compra, l.unidad_consumo, l.medida, l.factor, l.factor_origen, l.largo_cm, l.ancho_cm,
             l.espesor, l.merma_pct, l.fraccionable, l.min_compra, l.min_stock, l.proveedor, l.tel_proveedor, l.activo, l.sellos, l.procedencia,
             coalesce(l.creado_ms, now())
        from _lote l
      on conflict (empresa_id, id) do update set
             nombre = excluded.nombre, familia = excluded.familia, unidad_compra = excluded.unidad_compra, unidad_consumo = excluded.unidad_consumo,
             medida = excluded.medida, factor = excluded.factor, factor_origen = excluded.factor_origen, largo_cm = excluded.largo_cm,
             ancho_cm = excluded.ancho_cm, espesor = excluded.espesor, merma_pct = excluded.merma_pct, fraccionable = excluded.fraccionable,
             min_compra = excluded.min_compra, min_stock = excluded.min_stock, proveedor = excluded.proveedor, tel_proveedor = excluded.tel_proveedor,
             activo = excluded.activo, sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.nombre, t.familia, t.unidad_compra, t.unidad_consumo, t.medida, t.factor, t.factor_origen, t.largo_cm, t.ancho_cm, t.espesor, t.merma_pct,
              t.fraccionable, t.min_compra, t.min_stock, t.proveedor, t.tel_proveedor, t.activo, t.sellos, t.procedencia)
             is distinct from (excluded.nombre, excluded.familia, excluded.unidad_compra, excluded.unidad_consumo, excluded.medida, excluded.factor,
                               excluded.factor_origen, excluded.largo_cm, excluded.ancho_cm, excluded.espesor, excluded.merma_pct, excluded.fraccionable,
                               excluded.min_compra, excluded.min_stock, excluded.proveedor, excluded.tel_proveedor, excluded.activo, excluded.sellos,
                               excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'materiales', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- requerimientos: filas 1 a 2
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, 'proy-a1:acr-3mm'::text, 'proy-a1'::text, 'acr-3mm'::text, '0'::numeric, ''::text, '1'::numeric, 'lamina'::text, '[]'::jsonb, ''::text, 'estimada'::text, ''::text, ''::text, NULL::numeric, ''::text, ''::text, '0'::bigint, 'comprado'::text, '{"_editado":100}'::jsonb, '{"de":"telB","id_local":"proy-b1:acr-3mm","proyecto_id_local":"proy-b1"}'::jsonb, NULL::timestamptz),
  ('al3d'::text, 'proy-a1:vinil'::text, 'proy-a1'::text, 'vinil'::text, '0'::numeric, ''::text, '1'::numeric, 'metro'::text, '[]'::jsonb, ''::text, 'estimada'::text, ''::text, ''::text, NULL::numeric, ''::text, ''::text, '0'::bigint, 'calculado'::text, '{"_editado":500}'::jsonb, '{"de":"telA"}'::jsonb, NULL::timestamptz)
) as v(empresa_id, id, proyecto_id, material_id, cantidad_consumo, unidad_consumo, cantidad_compra, unidad_compra, partidas, formula, confianza, requiere, constantes_version, cantidad_ajustada, motivo_ajuste, ajustado_por, ajustado_ms, estado, sellos, procedencia, creado_ms);
    with w as (
      insert into public.requerimientos as t (empresa_id, id, proyecto_id, material_id, cantidad_consumo, unidad_consumo, cantidad_compra, unidad_compra,
             partidas, formula, confianza, requiere, constantes_version, cantidad_ajustada, motivo_ajuste, ajustado_por, ajustado_ms, estado, sellos,
             procedencia, created_at)
      select l.empresa_id, l.id, l.proyecto_id, l.material_id, l.cantidad_consumo, l.unidad_consumo, l.cantidad_compra, l.unidad_compra, l.partidas,
             l.formula, l.confianza, l.requiere, l.constantes_version, l.cantidad_ajustada, l.motivo_ajuste, l.ajustado_por, l.ajustado_ms, l.estado,
             l.sellos, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
      on conflict (empresa_id, id) do update set
             cantidad_consumo = excluded.cantidad_consumo, unidad_consumo = excluded.unidad_consumo, cantidad_compra = excluded.cantidad_compra,
             unidad_compra = excluded.unidad_compra, partidas = excluded.partidas, formula = excluded.formula, confianza = excluded.confianza,
             requiere = excluded.requiere, constantes_version = excluded.constantes_version, cantidad_ajustada = excluded.cantidad_ajustada,
             motivo_ajuste = excluded.motivo_ajuste, ajustado_por = excluded.ajustado_por, ajustado_ms = excluded.ajustado_ms, estado = excluded.estado,
             sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.cantidad_consumo, t.unidad_consumo, t.cantidad_compra, t.unidad_compra, t.partidas, t.formula, t.confianza, t.requiere,
              t.constantes_version, t.cantidad_ajustada, t.motivo_ajuste, t.ajustado_por, t.ajustado_ms, t.estado, t.sellos, t.procedencia)
             is distinct from (excluded.cantidad_consumo, excluded.unidad_consumo, excluded.cantidad_compra, excluded.unidad_compra, excluded.partidas,
                               excluded.formula, excluded.confianza, excluded.requiere, excluded.constantes_version, excluded.cantidad_ajustada,
                               excluded.motivo_ajuste, excluded.ajustado_por, excluded.ajustado_ms, excluded.estado, excluded.sellos, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'requerimientos', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- almacen_movimientos: filas 1 a 3
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('0'::integer, 'al3d'::text, 'mov-e1'::text, 'acr-3mm'::text, 'entrada'::text, '5'::numeric, 'lamina'::text, 'compra'::text, ''::text, ''::text, ''::text, ''::text, NULL::text, NULL::text, ''::text, '50'::bigint, '{"de":"telA"}'::jsonb, NULL::timestamptz),
  ('1'::integer, 'al3d'::text, 'mov-salida:proy-a1:acr-3mm'::text, 'acr-3mm'::text, 'salida'::text, '-1'::numeric, 'lamina'::text, 'derivado'::text, ''::text, 'Ana'::text, 'fabricacion'::text, 'K7QM'::text, 'proy-a1'::text, 'proy-a1:acr-3mm'::text, 'Ana · Fabricación (K7QM)'::text, '100'::bigint, '{"de":"telA"}'::jsonb, NULL::timestamptz),
  ('2'::integer, 'al3d'::text, 'mov-x'::text, 'vinil'::text, 'salida'::text, '-2'::numeric, 'metro'::text, 'manual'::text, ''::text, ''::text, ''::text, ''::text, NULL::text, NULL::text, ''::text, '300'::bigint, '{"de":"telB","proyecto_id_local":"proy-desconocido"}'::jsonb, NULL::timestamptz)
) as v(orden, empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo, proyecto_id, requerimiento_id, firma, ts, procedencia, creado_ms);
    with w as (
      insert into public.almacen_movimientos as t (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo,
             proyecto_id, requerimiento_id, firma, ts, procedencia, created_at)
      select l.empresa_id, l.id, l.material_id, l.tipo, l.cantidad, l.unidad_compra, l.origen, l.nota, l.usuario, l.rol, l.dispositivo,
             l.proyecto_id, l.requerimiento_id, l.firma, l.ts, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l order by l.orden
      on conflict (empresa_id, id) do nothing
      returning t.id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_movimientos', llave, 'alta' from w;

-- almacen_costos: filas 1 a 1
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, NULL::text, 'mov-e1'::text, '4250'::numeric, '50'::bigint)
) as v(empresa_id, material_id, movimiento_id, importe, sello);
    with w as (
      insert into public.almacen_costos as t (empresa_id, material_id, importe, sello)
      select l.empresa_id, l.material_id, l.importe, l.sello from _lote l
       where l.material_id is not null and exists (select 1 from public.materiales m where m.empresa_id = l.empresa_id and m.id = l.material_id)
      on conflict (empresa_id, material_id) where material_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.material_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;
    with w as (
      insert into public.almacen_costos as t (empresa_id, movimiento_id, importe, sello)
      select l.empresa_id, l.movimiento_id, l.importe, l.sello from _lote l
       where l.movimiento_id is not null and exists (select 1 from public.almacen_movimientos m where m.empresa_id = l.empresa_id and m.id = l.movimiento_id)
      on conflict (empresa_id, movimiento_id) where movimiento_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.movimiento_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- autorizaciones: filas 1 a 3
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('0'::integer, 'al3d'::text, 'COT-0001@K7QM'::text, 'c|1:x'::text, '12500.00'::text, '0.00'::text, ''::text, '14500.00'::text, 'Tacos Ana'::text, 'dir@al3d.test'::text, '2026-08-30T16:00:00.000Z'::text, ''::text, 'Cliente'::text, NULL::numeric, 'pag@al3d.test'::text, 'DF9E-AE1A-5193'::text, 'df9eae1a5193330bd5fb619ba1492fbadb6214811fcb8be1a5a36cf3d7d65086'::text, 'vigente'::text, ''::text, 'k1'::text, 'utf-8'::text, 'importada_hoja'::text, '2'::integer),
  ('1'::integer, 'al3d'::text, 'COT-0102@K7QM'::text, 'c|1:x'::text, '12500.00'::text, '0.00'::text, ''::text, '14500.00'::text, 'Taquería «El Güero»'::text, 'dir@al3d.test'::text, '2026-09-02T16:00:00.000Z'::text, ''::text, 'Cliente'::text, NULL::numeric, 'pag@al3d.test'::text, '5E1F-F571-D8D1'::text, '5e1ff571d8d1f58a32f4603d367fbbadebd2aacde5343b6c6eb295a704254e75'::text, 'vigente'::text, ''::text, 'k1'::text, 'ascii-?'::text, 'importada_hoja'::text, '3'::integer),
  ('2'::integer, 'al3d'::text, 'COT-0103@K7QM'::text, 'c|1:x'::text, '12500.00'::text, '0.00'::text, ''::text, '14500.00'::text, 'Café Ñandú'::text, 'dir@al3d.test'::text, '2026-09-03T16:00:00.000Z'::text, '[["Letras",8,12500]]'::text, 'Cliente'::text, NULL::numeric, 'pag@al3d.test'::text, '42A4-13C0-FB63'::text, '42a413c0fb638d6d1b361901d6715a820a27af6bbb5b6d9ae02e1c1a7474779a'::text, 'vigente'::text, ''::text, 'k1'::text, 'utf-8'::text, 'importada_hoja'::text, '4'::integer)
) as v(orden, empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo, ts_iso, renglones, cliente, ajuste_pct, solicito, codigo, firma, estado, nota, clave_id, codificacion, origen, fila_hoja);
    with w as (
      update public.autorizaciones t set estado = l.estado
        from _lote l
       where t.empresa_id = l.empresa_id and t.folio_global = l.folio_global and t.firma = l.firma
         and t.estado = 'vigente' and l.estado <> 'vigente'
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'cambio' from w;
    with w as (
      insert into public.autorizaciones as t (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo,
             ts_iso, renglones, cliente, ajuste_pct, solicito, codigo, firma, estado, nota, clave_id, codificacion, origen, fila_hoja)
      select l.empresa_id, l.folio_global, l.huella, l.sub_calc_txt, l.precio_auth_txt, l.items_auth, l.total_txt, l.proyecto, l.autorizo,
             l.ts_iso, l.renglones, l.cliente, l.ajuste_pct, l.solicito, l.codigo, l.firma, l.estado, l.nota, l.clave_id, l.codificacion, l.origen, l.fila_hoja
        from _lote l
       where not exists (select 1 from public.autorizaciones a where a.empresa_id = l.empresa_id and a.folio_global = l.folio_global and a.firma = l.firma)
       order by (l.estado = 'vigente'), l.orden
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'alta' from w;

-- cotizaciones: filas 1 a 4
drop table if exists _lote;
create temp table _lote as
select * from (values
  ('al3d'::text, 'COT-0001@K7QM'::text, 'COT-0001'::text, 'K7QM'::text, 'autorizada'::text, '{"folio":"COT-0001","disp":"K7QM","cliente":"Ana","proy":"Tacos Ana","fecha":"2026-08-30","items":[]}'::jsonb, '{}'::jsonb, '{"telefonos":["telA"]}'::jsonb),
  ('al3d'::text, 'COT-0500@HISTb46df1'::text, 'COT-0500'::text, 'HISTb46df1'::text, 'autorizada'::text, '{"folio":"COT-0500","cliente":"Zoe","proy":"Zapatería Zoe","fecha":"2026-05-01","items":[]}'::jsonb, '{}'::jsonb, '{"telefonos":["telC"],"disp_inferido":true}'::jsonb),
  ('al3d'::text, 'COT-0102@K7QM'::text, 'COT-0102'::text, 'K7QM'::text, 'autorizada'::text, '{"proy":"Taquería «El Güero»","cliente":"Cliente","subtotal":12500,"huellaAuth":"c|1:x","items":[]}'::jsonb, '{}'::jsonb, '{"stub":"Autorizaciones","fila_hoja":3}'::jsonb),
  ('al3d'::text, 'COT-0103@K7QM'::text, 'COT-0103'::text, 'K7QM'::text, 'autorizada'::text, '{"proy":"Café Ñandú","cliente":"Cliente","subtotal":12500,"huellaAuth":"c|1:x","items":[]}'::jsonb, '{}'::jsonb, '{"stub":"Autorizaciones","fila_hoja":4}'::jsonb)
) as v(empresa_id, folio_global, folio, disp, estado, datos, hitos, procedencia);
    with w as (
      insert into public.cotizaciones as t (empresa_id, folio_global, folio, disp, estado, datos, hitos, procedencia)
      select l.empresa_id, l.folio_global, l.folio, l.disp, l.estado, interno.limpiar_cotizacion(l.datos), l.hitos, l.procedencia from _lote l
      on conflict (empresa_id, folio_global) do update set datos = excluded.datos, hitos = excluded.hitos, procedencia = excluded.procedencia
       where (t.datos, t.hitos, t.procedencia) is distinct from (excluded.datos, excluded.hitos, excluded.procedencia)
      returning t.folio_global as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;

-- cotizaciones ↔ autorizaciones

with ult as (
  select distinct on (a.folio_global) a.folio_global, a.id from public.autorizaciones a where a.empresa_id = 'al3d'
   order by a.folio_global, (a.estado = 'vigente') desc, a.id desc),
w as (
  update public.cotizaciones c set autorizacion_id = u.id from ult u
   where c.empresa_id = 'al3d' and c.folio_global = u.folio_global and c.autorizacion_id is distinct from u.id
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: autorización' from w;
with ult as (
  select distinct on (a.folio_global) a.folio_global, a.estado from public.autorizaciones a where a.empresa_id = 'al3d'
   order by a.folio_global, a.id desc),
w as (
  update public.cotizaciones c set revocada_en = now() from ult u
   where c.empresa_id = 'al3d' and c.folio_global = u.folio_global and u.estado = 'revocada' and c.revocada_en is null
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: revocada' from w;


-- contadores: nunca bajan (contador_sembrar toma el mayor)
select public.contador_sembrar('al3d', 'V', 149);
select public.contador_sembrar('al3d', 'P', 0);
select public.contador_sembrar('al3d', 'alm', 0);
select public.contador_sembrar('al3d', 'folio_cot:HISTb46df1', 500);
select public.contador_sembrar('al3d', 'folio_cot:K7QM', 7);

-- lo que hizo esta corrida (vacío = nada cambió)
select tabla, accion, count(*)::int as filas from _imp_cambios group by tabla, accion order by tabla, accion;
do $$ begin
  raise exception 'ENSAYO TERMINADO SIN ERRORES (no se escribió nada): %',
    (select coalesce(string_agg(tabla || ' ' || accion || ' ' || n, ', ' order by tabla, accion), 'sin cambios')
       from (select tabla, accion, count(*) as n from _imp_cambios group by tabla, accion) x);
end $$;
