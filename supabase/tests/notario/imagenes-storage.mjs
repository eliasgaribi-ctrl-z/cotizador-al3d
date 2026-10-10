// Las políticas de Storage de las imágenes de las cotizaciones — A.md §3.5; `supabase/opcional/storage.sql`.
//
// ESTO NO ES STORAGE. PGlite no trae el esquema `storage` de Supabase, así que aquí se crea un SUSTITUTO MÍNIMO (las tablas `storage.buckets` y `storage.objects`
// con las columnas que las políticas usan y la función `storage.foldername`, copiada de su definición) y se aplica `storage.sql` encima. Lo que esta prueba SÍ
// demuestra: que el archivo es SQL válido, que es idempotente, que deja el bucket privado, que cada política hace lo que dice (por empresa, por área y por
// dueño) y que la comprobación final se detiene si algo quedó abierto. Lo que NO demuestra: el comportamiento del servicio de Storage ni la forma exacta de
// `storage.objects` en la versión del proyecto real (repetir en el proyecto de pruebas; EX-* de A.md §10.17).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, sql, conCopia, como, una } from '../comun/semilla.js';
import { crearBaseNotario } from '../comun/notario.js';

const TEXTO = readFileSync(fileURLToPath(new URL('../../opcional/storage.sql', import.meta.url)), 'utf8');
const SUSTITUTO = `
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now());
  create function storage.foldername(name text) returns text[] language plpgsql as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $$;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;      -- en Supabase la función es ejecutable por los tres
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;                    -- como en Supabase: la RLS decide
  grant select on storage.buckets to anon, authenticated, service_role;
  insert into storage.buckets (id, name, public) values ('otros', 'otros', true);       -- un bucket ajeno, PÚBLICO, que este archivo no debe tocar
`;
const plantilla = dato(async () => {
  const db = await crearBaseNotario();
  await sql(db, SUSTITUTO);
  await sql(db, TEXTO);
  const objeto = (bucket, nombre, owner) => sql(db, `insert into storage.objects (bucket_id, name, owner_id, owner) values ($1, $2, $3::text, $3::uuid)`, [bucket, nombre, owner]);
  await objeto('cotizacion-imagenes', 'al3d/COT-0001-B@K7QM/img-1.jpg', db.u.pag.uid);
  await objeto('cotizacion-imagenes', 'al3d/COT-0002-B@K7QM/img-2.jpg', db.u.fab.uid);
  await objeto('cotizacion-imagenes', 'otra/COT-0009-B@ZZZZ/img-9.jpg', db.u.otra.uid);
  await objeto('otros', 'al3d/COT-0001-B@K7QM/ajena.jpg', db.u.pag.uid);
  return db;
}, { limpiar: db => db.close() });
const ver = async (db, quien) => (await sesionDe(db, db.u[quien]).query(`select name from storage.objects order by name`)).map(r => r.name);

describir('el bucket y su aplicación', () => {
  prueba('el bucket cotizacion-imagenes queda PRIVADO, con tope de 2 MB y solo imágenes; el bucket ajeno no se toca', async () => {
    const db = await plantilla();
    const b = await una(db, `select public, file_size_limit::int as limite, allowed_mime_types as tipos from storage.buckets where id = 'cotizacion-imagenes'`);
    igual([b.public, b.limite, b.tipos], [false, 2097152, ['image/jpeg', 'image/png', 'image/webp']]);
    igual((await una(db, `select public from storage.buckets where id = 'otros'`)).public, true, 'este archivo no toca los buckets de otros usos');
  });
  prueba('es IDEMPOTENTE: aplicarlo otra vez no falla ni duplica políticas, y vuelve a cerrar un bucket que alguien abrió', () => conCopia(plantilla, async db => {
    await sql(db, `update storage.buckets set public = true where id = 'cotizacion-imagenes'`);
    await sql(db, TEXTO);
    await sql(db, TEXTO);
    igual((await una(db, `select public from storage.buckets where id = 'cotizacion-imagenes'`)).public, false);
    igual((await sql(db, `select polname from pg_policy where polrelid = 'storage.objects'::regclass order by 1`)).map(p => p.polname), ['cotizacion_imagenes_borrar', 'cotizacion_imagenes_cambiar', 'cotizacion_imagenes_leer', 'cotizacion_imagenes_subir']);
  }));
  prueba('se NIEGA a correr sin el esquema storage (en una base común) y sin las migraciones', async () => {
    const base = await crearBaseNotario();
    try {
      await esperarError(sql(base, TEXTO), /necesita el esquema storage/);
      await sql(base, SUSTITUTO);
      await sql(base, `drop function interno.empresas_donde(text[]) cascade`);
      await esperarError(sql(base, TEXTO), /Faltan las migraciones/);
    } finally { await base.close(); }
  });
  prueba('la comprobación final se DETIENE si una política suelta (de otro uso) deja el bucket abierto a anon o a PUBLIC, o si el bucket quedó público por otra vía', () => conCopia(plantilla, async db => {
    await sql(db, `create policy abierta on storage.objects for select using (bucket_id = 'cotizacion-imagenes')`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*abiertas a anon\/PUBLIC.*abierta/);
    await sql(db, `drop policy abierta on storage.objects; create policy abierta_anon on storage.objects for select to anon using (bucket_id = 'cotizacion-imagenes')`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*abierta_anon/);
    await sql(db, `drop policy abierta_anon on storage.objects; create policy de_otro on storage.objects for select to anon using (bucket_id = 'otros')`);
    await sql(db, TEXTO);          // una política de OTRO bucket para anon no es asunto de este archivo
  }));
});

describir('leer: cualquier miembro activo, solo de su empresa', () => {
  prueba('Dirección, Fabricación y Pagos de al3d leen los objetos de al3d (y no los de otra, ni los del bucket ajeno); la persona de otra empresa, solo los suyos', async () => {
    const db = await plantilla();
    for (const quien of ['dir', 'fab', 'pag']) igual([quien, await ver(db, quien)], [quien, ['al3d/COT-0001-B@K7QM/img-1.jpg', 'al3d/COT-0002-B@K7QM/img-2.jpg']]);
    igual(await ver(db, 'otra'), ['otra/COT-0009-B@ZZZZ/img-9.jpg']);
    igual(await ver(db, 'multi'), ['al3d/COT-0001-B@K7QM/img-1.jpg', 'al3d/COT-0002-B@K7QM/img-2.jpg', 'otra/COT-0009-B@ZZZZ/img-9.jpg'], 'multi es miembro de las dos');
  });
  prueba('sin acceso (ext), de baja, con invitación sin reclamar y anon: 0 objetos (la lista de nombres tampoco se ve)', async () => {
    const db = await plantilla();
    for (const quien of ['ext', 'baja', 'inv', 'noverif']) igual([quien, await ver(db, quien)], [quien, []]);
    igual((await como(db, { rol: 'anon' }).query(`select name from storage.objects`)).length, 0);
  });
});

describir('subir: cualquier miembro, solo en el prefijo de su empresa y con la forma <empresa>/<folio>/<archivo>', () => {
  const subir = (db, quien, nombre, bucket = 'cotizacion-imagenes') => sesionDe(db, db.u[quien]).query(`insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [bucket, nombre, db.u[quien].uid]);
  for (const quien of ['dir', 'fab', 'pag']) {
    prueba(`(${quien}) sube a su empresa con la forma correcta: permitido`, async () => {
      const db = await plantilla();
      await subir(db, quien, 'al3d/COT-0100-B@K7QM/img-100.jpg');
    });
  }
  prueba('denegado: el prefijo de OTRA empresa, una sola carpeta, cuatro niveles, otro bucket, sin sesión, sin acceso, de baja, invitación sin reclamar', async () => {
    const db = await plantilla();
    await esperarError(subir(db, 'pag', 'otra/COT-0100-B@K7QM/img.jpg'), /row-level security|42501/, 'otra empresa');
    await esperarError(subir(db, 'pag', 'al3d/img.jpg'), /row-level security|42501/, 'sin carpeta de folio');
    await esperarError(subir(db, 'pag', 'al3d/COT-1@K7QM/extra/img.jpg'), /row-level security|42501/, 'cuatro niveles');
    await esperarError(subir(db, 'pag', 'al3d/COT-1@K7QM/img.jpg', 'otros'), /row-level security|42501|foreign key|violates/, 'otro bucket');
    await esperarError(como(db, { rol: 'anon' }).query(`insert into storage.objects (bucket_id, name) values ('cotizacion-imagenes', 'al3d/COT-1@K7QM/a.jpg')`), /row-level security|42501/, 'anon');
    for (const quien of ['ext', 'baja', 'inv', 'noverif', 'otra']) await esperarError(subir(db, quien, 'al3d/COT-0100-B@K7QM/img.jpg'), /row-level security|42501/, quien);
  });
  prueba('una persona con dos empresas sube a las dos, cada una en su prefijo', async () => {
    const db = await plantilla();
    await subir(db, 'multi', 'al3d/COT-0100-B@K7QM/m1.jpg');
    await subir(db, 'multi', 'otra/COT-0100-B@K7QM/m2.jpg');
    await esperarError(subir(db, 'multi', 'tercera/COT-0100-B@K7QM/m3.jpg'), /row-level security|42501/);
  });
});

describir('cambiar y borrar: quien lo subió, o Dirección de esa empresa', () => {
  const cambiar = (db, quien, nombre) => sesionDe(db, db.u[quien]).query(`update storage.objects set metadata = '{"cambio": true}'::jsonb where bucket_id = 'cotizacion-imagenes' and name = $1`, [nombre]);
  const borrar = (db, quien, nombre) => sesionDe(db, db.u[quien]).query(`delete from storage.objects where bucket_id = 'cotizacion-imagenes' and name = $1 returning name`, [nombre]);
  const DE_PAG = 'al3d/COT-0001-B@K7QM/img-1.jpg';
  prueba('cambiar: el dueño (Pagos) y Dirección sí (1 fila); Fabricación que NO es el dueño, otra empresa y sin acceso, no (0 filas, sin error)', async () => {
    const db = await plantilla();
    for (const quien of ['pag', 'dir', 'dir2']) igual([quien, (await cambiar(db, quien, DE_PAG)).afectadas], [quien, 1]);
    for (const quien of ['fab', 'otra', 'ext', 'baja', 'inv']) igual([quien, (await cambiar(db, quien, DE_PAG)).afectadas], [quien, 0]);
    igual((await cambiar(db, 'fab', 'al3d/COT-0002-B@K7QM/img-2.jpg')).afectadas, 1, 'Fabricación sí cambia lo SUYO');
  });
  prueba('borrar: el dueño y Dirección sí; Fabricación que no es el dueño, Pagos que no es el dueño, otra empresa y anon, no', async () => {
    const db = await plantilla();
    igual((await borrar(db, 'fab', DE_PAG)).length, 0);
    igual((await borrar(db, 'otra', DE_PAG)).length, 0);
    igual((await como(db, { rol: 'anon' }).query(`delete from storage.objects where bucket_id = 'cotizacion-imagenes' returning name`)).length, 0);
    igual((await borrar(db, 'pag', DE_PAG)).map(r => r.name), [DE_PAG], 'el dueño');
    igual((await borrar(db, 'dir', 'al3d/COT-0002-B@K7QM/img-2.jpg')).map(r => r.name), ['al3d/COT-0002-B@K7QM/img-2.jpg'], 'Dirección borra lo de otro');
    igual((await borrar(db, 'dir', 'otra/COT-0009-B@ZZZZ/img-9.jpg')).length, 0, 'pero no en otra empresa');
  });
  prueba('Dirección de una empresa y Fabricación en otra (multi): cambia lo ajeno en la primera y NO en la segunda', async () => {
    const db = await plantilla();
    igual((await cambiar(db, 'multi', DE_PAG)).afectadas, 1);
    igual((await cambiar(db, 'multi', 'otra/COT-0009-B@ZZZZ/img-9.jpg')).afectadas, 0);
  });
  prueba('un cambio no puede mover el objeto a otra empresa ni a otra forma de ruta (with check)', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.pag).query(`update storage.objects set name = 'otra/COT-0001-B@K7QM/img-1.jpg' where bucket_id = 'cotizacion-imagenes' and name = $1`, [DE_PAG]), /row-level security|42501/);
    await esperarError(sesionDe(db, db.u.pag).query(`update storage.objects set name = 'al3d/suelto.jpg' where bucket_id = 'cotizacion-imagenes' and name = $1`, [DE_PAG]), /row-level security|42501/);
  });
});

await resumen();
