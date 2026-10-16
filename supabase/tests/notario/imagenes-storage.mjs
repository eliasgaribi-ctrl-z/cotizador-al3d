// Las políticas de Storage de las imágenes de las cotizaciones — A.md §3.5; `supabase/opcional/storage.sql`; Q-02 (confirmada por Elías el 2026-10-16).
//
// ESTO NO ES STORAGE. PGlite no trae el esquema `storage` de Supabase, así que aquí se crea un SUSTITUTO MÍNIMO (las tablas `storage.buckets` y `storage.objects`
// con las columnas que las políticas usan y la función `storage.foldername`, copiada de su definición) y se aplica `storage.sql` encima. Lo que esta prueba SÍ
// demuestra: que el archivo es SQL válido, que es idempotente, que deja el bucket privado, que cada política hace lo que dice y que la comprobación final se
// detiene si algo quedó abierto. Lo que NO demuestra: el comportamiento del servicio de Storage ni la forma exacta de `storage.objects` en la versión del
// proyecto real (lo repite el bloque 11 de `supabase/opcional/prueba-de-humo.sql`).
//
// La regla (2026-10-16): leer, quien puede VER la cotización de la carpeta (la RLS de `cotizaciones` decide: Dirección todas, Pagos las suyas, Fabricación
// ninguna) y Dirección todo lo de su empresa; subir, el autor (Pagos, con la cotización en la base) o Dirección; cambiar y borrar, solo Dirección.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, sql, conCopia, como, una } from '../comun/semilla.js';
import { crearBaseNotario } from '../comun/notario.js';
import { SUSTITUTO_STORAGE as SUSTITUTO, TEXTO_STORAGE as TEXTO } from '../comun/storage.js';

const B = 'cotizacion-imagenes';
const R = {
  pag:  'al3d/COT-0001-B@K7QM/img-1.jpg',     // cotización de Pagos (pag)
  fab:  'al3d/COT-0002-B@K7QM/img-2.jpg',     // cotización que pidió Fabricación (`solicitar` se lo permite; la RLS no se la deja ver)
  pag2: 'al3d/COT-0003-B@K7QM/img-3.jpg',     // cotización del OTRO Pagos
  dir:  'al3d/COT-0004-B@K7QM/img-4.jpg',     // cotización de Dirección
  sin:  'al3d/COT-0005-B@K7QM/img-5.jpg',     // su cotización todavía NO está en la base (Dirección la subió desde su teléfono)
  baja: 'al3d/COT-0006-B@K7QM/img-6.jpg',     // cotización de alguien que ya está de baja
  otra: 'otra/COT-0009-B@ZZZZ/img-9.jpg',     // otra empresa
};
const AL3D = [R.pag, R.fab, R.pag2, R.dir, R.sin, R.baja].sort();

const plantilla = dato(async () => {
  const db = await crearBaseNotario();
  await sql(db, SUSTITUTO);
  await sql(db, TEXTO);
  const cot = (empresa, fg, autor) => sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos)
                                                values ($1, $2, split_part($2, '@', 1), split_part($2, '@', 2), $3::uuid, 'pendiente', '{"proy":"Prueba"}')`, [empresa, fg, autor]);
  await cot('al3d', 'COT-0001-B@K7QM', db.u.pag.uid);
  await cot('al3d', 'COT-0002-B@K7QM', db.u.fab.uid);
  await cot('al3d', 'COT-0003-B@K7QM', db.u.pag2.uid);
  await cot('al3d', 'COT-0004-B@K7QM', db.u.dir.uid);
  await cot('al3d', 'COT-0006-B@K7QM', db.u.baja.uid);
  await cot('otra', 'COT-0009-B@ZZZZ', db.u.otra.uid);
  const objeto = (bucket, nombre, owner) => sql(db, `insert into storage.objects (bucket_id, name, owner_id, owner) values ($1, $2, $3::text, $3::uuid)`, [bucket, nombre, owner]);
  for (const [k, ruta] of Object.entries(R)) await objeto(B, ruta, (db.u[k] || db.u.dir).uid);
  await objeto('otros', 'al3d/COT-0001-B@K7QM/ajena.jpg', db.u.pag.uid);
  return db;
}, { limpiar: db => db.close() });
const ver = async (db, quien) => (await sesionDe(db, db.u[quien]).query(`select name from storage.objects where bucket_id = $1 order by name`, [B])).map(r => r.name);

describir('el bucket y su aplicación', () => {
  prueba('el bucket cotizacion-imagenes queda PRIVADO, con tope de 2 MB y solo imágenes; el bucket ajeno no se toca', async () => {
    const db = await plantilla();
    const b = await una(db, `select public, file_size_limit::int as limite, allowed_mime_types as tipos from storage.buckets where id = 'cotizacion-imagenes'`);
    igual([b.public, b.limite, b.tipos], [false, 2097152, ['image/jpeg', 'image/png', 'image/webp']]);
    igual((await una(db, `select public from storage.buckets where id = 'otros'`)).public, true, 'este archivo no toca los buckets de otros usos');
  });
  prueba('es IDEMPOTENTE: aplicarlo otra vez no falla ni duplica políticas, y vuelve a cerrar un bucket que alguien abrió', () => conCopia(plantilla, async db => {
    await sql(db, `update storage.buckets set public = true, file_size_limit = 999999999 where id = 'cotizacion-imagenes'`);
    await sql(db, TEXTO);
    await sql(db, TEXTO);
    igual(Object.values(await una(db, `select public, file_size_limit::int from storage.buckets where id = 'cotizacion-imagenes'`)), [false, 2097152]);
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
  prueba('no crea NINGUNA función (una nueva en `interno` haría tronar la auditoría de 0011 en cada migración que venga) y la auditoría sigue limpia', () => conCopia(plantilla, async db => {
    cierto(!/create\s+(or\s+replace\s+)?function/i.test(TEXTO.replace(/--.*$/gm, '')), 'storage.sql no tiene create function');
    igual((await una(db, `select coalesce(cardinality(interno.auditoria()), -1) as n`)).n, 0);
  }));
  prueba('la comprobación final se DETIENE si una política suelta deja el bucket abierto (a anon, a PUBLIC o a authenticated) o vale para todos los buckets', () => conCopia(plantilla, async db => {
    await sql(db, `create policy abierta on storage.objects for select using (bucket_id = 'cotizacion-imagenes')`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*no son de este archivo.*abierta/);
    await sql(db, `drop policy abierta on storage.objects; create policy abierta_anon on storage.objects for select to anon using (bucket_id = 'cotizacion-imagenes')`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*abierta_anon/);
    await sql(db, `drop policy abierta_anon on storage.objects; create policy fab_lee on storage.objects for select to authenticated using (bucket_id = 'cotizacion-imagenes' and true)`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*fab_lee/, 'una para authenticated también: abriría las imágenes a Fabricación');
    await sql(db, `drop policy fab_lee on storage.objects; create policy todo on storage.objects for select to authenticated using (true)`);
    await esperarError(sql(db, TEXTO), /AUDITORIA.*no miran bucket_id.*todo/, 'una que no mira bucket_id vale para TODOS los buckets');
    await sql(db, `drop policy todo on storage.objects; create policy cierra on storage.objects as restrictive for select to authenticated using (true)`);
    await sql(db, TEXTO);          // una restrictiva solo puede cerrar
    await sql(db, `drop policy cierra on storage.objects; create policy de_otro on storage.objects for select to anon using (bucket_id = 'otros')`);
    await sql(db, TEXTO);          // una política de OTRO bucket, que mira su bucket_id, no es asunto de este archivo
  }));
});

describir('leer: quien puede ver la cotización (Q-02), y Dirección todo lo de su empresa', () => {
  prueba('Dirección (las dos) ve TODO lo de al3d, también la imagen cuya cotización todavía no está en la base; ni lo de otra empresa ni el bucket ajeno', async () => {
    const db = await plantilla();
    for (const quien of ['dir', 'dir2']) igual([quien, await ver(db, quien)], [quien, AL3D]);
  });
  prueba('Pagos ve SOLO las de sus cotizaciones: las de otro Pagos, las de Dirección, la de Fabricación y la que no está en la base, no', async () => {
    const db = await plantilla();
    igual(await ver(db, 'pag'), [R.pag]);
    igual(await ver(db, 'pag2'), [R.pag2]);
  });
  prueba('Fabricación NO ve ninguna, ni la de la cotización que ella misma pidió (lleva precios: R1 manda sobre «cada quien las suyas»)', async () => {
    const db = await plantilla();
    igual(await ver(db, 'fab'), []);
  });
  prueba('otra empresa ve solo lo suyo; multi (Dirección en al3d, Fabricación en otra) ve al3d y NADA de otra', async () => {
    const db = await plantilla();
    igual(await ver(db, 'otra'), [R.otra]);
    igual(await ver(db, 'multi'), AL3D);
  });
  prueba('sin acceso (ext), de baja (aunque sea la autora de COT-0006), invitación sin reclamar y anon: 0 objetos (la lista de nombres tampoco se ve)', async () => {
    const db = await plantilla();
    for (const quien of ['ext', 'baja', 'inv', 'noverif']) igual([quien, await ver(db, quien)], [quien, []]);
    igual((await como(db, { rol: 'anon' }).query(`select name from storage.objects`)).length, 0);
  });
  prueba('cuando la purga de 0016 borra la cotización, Pagos deja de ver sus imágenes en ese momento; Dirección las sigue viendo (y es quien las borra)', () => conCopia(plantilla, async db => {
    igual(await ver(db, 'pag'), [R.pag]);
    const r = (await una(db, `select interno.purgar_cotizaciones_no_ganadas(now() + interval '9 months') as r`)).r;
    igual([r.errores, (await una(db, `select count(*)::int as n from public.cotizaciones where folio_global = 'COT-0001-B@K7QM'`)).n], [[], 0], 'la purga se llevó COT-0001');
    igual(await ver(db, 'pag'), [], 'sin la cotización, la imagen ya no es de nadie que no sea Dirección');
    cierto((await ver(db, 'dir')).includes(R.pag), 'Dirección la sigue viendo');
    igual((await una(db, `select count(*)::int as n from storage.objects where name = $1`, [R.pag])).n, 1, 'la purga NO toca storage.objects (no borra archivos: storage.sql lo explica)');
  }));
});

describir('subir: el autor de la cotización (Pagos, con la cotización en la base) o Dirección; con la forma <empresa>/<folio_global>/<id>.jpg', () => {
  const subir = (db, quien, nombre, bucket = B) => sesionDe(db, db.u[quien]).query(`insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [bucket, nombre, db.u[quien].uid]);
  const NEGADO = /row-level security|42501/;
  prueba('Pagos sube a SU cotización (y el otro Pagos a la suya): permitido', async () => {
    const db = await plantilla();
    await subir(db, 'pag', 'al3d/COT-0001-B@K7QM/img-nueva.jpg');
    await subir(db, 'pag2', 'al3d/COT-0003-B@K7QM/img-nueva.jpg');
  });
  prueba('Pagos NO sube a la cotización de otro Pagos, de Dirección ni de Fabricación, ni a un folio que no está en la base', async () => {
    const db = await plantilla();
    for (const fg of ['COT-0003-B@K7QM', 'COT-0004-B@K7QM', 'COT-0002-B@K7QM', 'COT-0005-B@K7QM', 'COT-7777-B@K7QM']) {
      await esperarError(subir(db, 'pag', `al3d/${fg}/img-x.jpg`), NEGADO, fg);
    }
  });
  prueba('Fabricación NO sube nunca: ni a la cotización que ella pidió, ni a una de Pagos, ni a un folio que no está en la base', async () => {
    const db = await plantilla();
    for (const fg of ['COT-0002-B@K7QM', 'COT-0001-B@K7QM', 'COT-0005-B@K7QM']) await esperarError(subir(db, 'fab', `al3d/${fg}/img-x.jpg`), NEGADO, fg);
  });
  prueba('Dirección sube a cualquier carpeta de SU empresa (también a un folio que todavía no está en la base), y no a la de otra', async () => {
    const db = await plantilla();
    await subir(db, 'dir', 'al3d/COT-0003-B@K7QM/img-dir.jpg');
    await subir(db, 'dir', 'al3d/COT-0005-B@K7QM/img-dir.jpg');
    await subir(db, 'dir', 'al3d/COT-8888-B@K7QM/img-dir.jpg');
    await esperarError(subir(db, 'dir', 'otra/COT-0009-B@ZZZZ/img-dir.jpg'), NEGADO);
  });
  prueba('la forma de la ruta: una sola carpeta, cuatro niveles, otra extensión, un folio sin aparato, mayúsculas en la empresa, «..» o espacios: denegado (también a Dirección)', async () => {
    const db = await plantilla();
    for (const nombre of ['al3d/img.jpg', 'al3d/COT-1@K7QM/extra/img.jpg', 'al3d/COT-0005-B@K7QM/img.png', 'al3d/COT-0005-B@K7QM/img.jpg.html',
                          'al3d/COT-0005-B/img.jpg', 'AL3D/COT-0005-B@K7QM/img.jpg', 'al3d/COT-0005-B@K7QM/../img.jpg', 'al3d/COT-0005-B@K7QM/una imagen.jpg']) {
      await esperarError(subir(db, 'dir', nombre), NEGADO, nombre);
    }
  });
  prueba('denegado: otro bucket, sin sesión, sin acceso, de baja (aunque sea la autora), invitación sin reclamar, otra empresa', async () => {
    const db = await plantilla();
    await esperarError(subir(db, 'pag', 'al3d/COT-0001-B@K7QM/img.jpg', 'otros'), /row-level security|42501|foreign key|violates/, 'otro bucket');
    await esperarError(como(db, { rol: 'anon' }).query(`insert into storage.objects (bucket_id, name) values ('cotizacion-imagenes', 'al3d/COT-0005-B@K7QM/a.jpg')`), NEGADO, 'anon');
    await esperarError(subir(db, 'baja', 'al3d/COT-0006-B@K7QM/img.jpg'), NEGADO, 'de baja, en su propia cotización');
    for (const quien of ['ext', 'inv', 'noverif', 'otra']) await esperarError(subir(db, quien, 'al3d/COT-0001-B@K7QM/img.jpg'), NEGADO, quien);
  });
  prueba('multi (Dirección en al3d, Fabricación en otra): sube en al3d y NO en otra', async () => {
    const db = await plantilla();
    await subir(db, 'multi', 'al3d/COT-0005-B@K7QM/m1.jpg');
    await esperarError(subir(db, 'multi', 'otra/COT-0009-B@ZZZZ/m2.jpg'), NEGADO);
  });
});

describir('cambiar y borrar: solo Dirección de esa empresa', () => {
  const cambiar = (db, quien, nombre) => sesionDe(db, db.u[quien]).query(`update storage.objects set metadata = '{"cambio": true}'::jsonb where bucket_id = 'cotizacion-imagenes' and name = $1`, [nombre]);
  const borrar = (db, quien, nombre) => sesionDe(db, db.u[quien]).query(`delete from storage.objects where bucket_id = 'cotizacion-imagenes' and name = $1 returning name`, [nombre]);
  prueba('cambiar: Dirección sí (1 fila); Pagos ni lo de SU cotización, Fabricación, otra empresa y sin acceso no (0 filas, sin error)', async () => {
    const db = await plantilla();
    for (const quien of ['dir', 'dir2']) igual([quien, (await cambiar(db, quien, R.pag)).afectadas], [quien, 1]);
    for (const quien of ['pag', 'fab', 'otra', 'ext', 'baja', 'inv']) igual([quien, (await cambiar(db, quien, R.pag)).afectadas], [quien, 0]);
  });
  prueba('borrar: Pagos (ni lo de su cotización), Fabricación, otra empresa y anon NO; Dirección sí, pero no en otra empresa', async () => {
    const db = await plantilla();
    for (const quien of ['pag', 'fab', 'otra', 'pag2']) igual([quien, (await borrar(db, quien, R.pag)).length], [quien, 0]);
    igual((await como(db, { rol: 'anon' }).query(`delete from storage.objects where bucket_id = 'cotizacion-imagenes' returning name`)).length, 0);
    igual((await borrar(db, 'dir', R.pag)).map(r => r.name), [R.pag], 'Dirección borra');
    igual((await borrar(db, 'dir', R.otra)).length, 0, 'pero no en otra empresa');
  });
  prueba('multi (Dirección en al3d, Fabricación en otra): cambia en al3d y NO en otra', async () => {
    const db = await plantilla();
    igual((await cambiar(db, 'multi', R.pag)).afectadas, 1);
    igual((await cambiar(db, 'multi', R.otra)).afectadas, 0);
  });
  prueba('un cambio de Dirección no puede mover el objeto a otra empresa ni a otra forma de ruta (with check)', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.dir).query(`update storage.objects set name = 'otra/COT-0001-B@K7QM/img-1.jpg' where bucket_id = 'cotizacion-imagenes' and name = $1`, [R.pag]), /row-level security|42501/);
    await esperarError(sesionDe(db, db.u.dir).query(`update storage.objects set name = 'al3d/suelto.jpg' where bucket_id = 'cotizacion-imagenes' and name = $1`, [R.pag]), /row-level security|42501/);
  });
});

await resumen();
