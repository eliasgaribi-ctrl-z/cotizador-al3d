// Las políticas de Storage de las CONSTANCIAS DE SITUACIÓN FISCAL — `supabase/opcional/constancias.sql` (0027, decidido por Elías el 2026-10-25).
//
// ESTO NO ES STORAGE: el mismo sustituto mínimo que usa notario/imagenes-storage.mjs (comun/storage.js), con `storage.sql` y `constancias.sql` encima.
// Lo que SÍ demuestra: que el archivo es SQL válido e idempotente, que deja el bucket privado con su tope y sus tipos, que convive con el de las imágenes
// (cada uno vuelve a correr sin que la comprobación del otro se queje), que cada política hace lo que dice y que la comprobación final se detiene si
// algo quedó abierto. Lo que NO: el servicio de Storage (la subida, las URLs firmadas) ni la forma exacta de `storage.objects` del proyecto real
// (lo repite el bloque 14 de `prueba-de-humo.sql`).
//
// La regla: leer y subir, Dirección y Pagos de la empresa de la carpeta (subir, solo en la carpeta de un RFC que ya es cliente fiscal, con la forma
// <empresa>/<RFC>/csf-<id>.<pdf|jpg|png|webp>); cambiar y borrar, solo Dirección; Fabricación nada, nunca.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, sql, conCopia, como, una, sembrarProyectos } from '../comun/semilla.js';
import { crearBaseNotario } from '../comun/notario.js';
import { SUSTITUTO_STORAGE, TEXTO_STORAGE, TEXTO_CONSTANCIAS } from '../comun/storage.js';

const B = 'constancias-fiscales';
const RFC = 'ABC010203XY1', RFC2 = 'GOMA850615H2A', RFC_OTRA = 'XYZ991231AB1', NO_CLIENTE = 'NOC010101AA1';
const R = {
  a:    `al3d/${RFC}/csf-11111111-aaaa.pdf`,
  b:    `al3d/${RFC2}/csf-22222222-bbbb.jpg`,
  otra: `otra/${RFC_OTRA}/csf-99999999-cccc.pdf`,
};
const NEGADO = /row-level security|42501/;

const plantilla = dato(async () => {
  const db = await crearBaseNotario();
  await sembrarProyectos(db);
  await sql(db, SUSTITUTO_STORAGE);
  await sql(db, TEXTO_STORAGE);
  await sql(db, TEXTO_CONSTANCIAS);
  await sql(db, `insert into public.clientes_fiscales (empresa_id, rfc, razon_social) values ('al3d', $1, 'ABC'), ('al3d', $2, 'Ana'), ('otra', $3, 'De otra')`, [RFC, RFC2, RFC_OTRA]);
  for (const [k, nombre] of Object.entries(R)) await sql(db, `insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [B, nombre, k]);
  await sql(db, `insert into storage.objects (bucket_id, name) values ('cotizacion-imagenes', 'al3d/COT-0001-B@K7QM/img-1.jpg'), ('otros', 'al3d/${RFC}/csf-ajena-0000.pdf')`);
  return db;
}, { limpiar: db => db.close() });
const ver = async (db, quien) => (await sesionDe(db, db.u[quien]).query(`select name from storage.objects where bucket_id = $1 order by name`, [B])).map(r => r.name);
const subir = (db, quien, nombre, bucket = B) => sesionDe(db, db.u[quien]).query(`insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [bucket, nombre, db.u[quien].uid]);

describir('CS-01 el bucket y su aplicación', () => {
  prueba('queda PRIVADO, con tope de 5 MB y solo PDF, JPG, PNG y WebP; el de las imágenes y el ajeno no se tocan', async () => {
    const db = await plantilla();
    const b = await una(db, `select public, file_size_limit::int as limite, allowed_mime_types as tipos from storage.buckets where id = $1`, [B]);
    igual([b.public, b.limite, b.tipos], [false, 5242880, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']]);
    igual((await una(db, `select file_size_limit::int as l from storage.buckets where id = 'cotizacion-imagenes'`)).l, 2097152, 'el de las imágenes sigue igual');
    igual((await una(db, `select public from storage.buckets where id = 'otros'`)).public, true);
  });
  prueba('es IDEMPOTENTE y convive con storage.sql: los dos se vuelven a correr en cualquier orden sin que la comprobación del otro se queje; y cierra un bucket que alguien abrió', () => conCopia(plantilla, async db => {
    await sql(db, `update storage.buckets set public = true, file_size_limit = 999999999 where id = $1`, [B]);
    await sql(db, TEXTO_CONSTANCIAS);
    await sql(db, TEXTO_STORAGE);
    await sql(db, TEXTO_CONSTANCIAS);
    igual(Object.values(await una(db, `select public, file_size_limit::int from storage.buckets where id = $1`, [B])), [false, 5242880]);
    igual((await sql(db, `select polname from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'constancias%' order by 1`)).map(p => p.polname),
      ['constancias_fiscales_borrar', 'constancias_fiscales_cambiar', 'constancias_fiscales_leer', 'constancias_fiscales_subir']);
  }));
  prueba('se NIEGA a correr sin el esquema storage y sin 0027; no crea ninguna función y la auditoría sigue limpia', async () => {
    const base = await crearBaseNotario();
    try {
      await esperarError(sql(base, TEXTO_CONSTANCIAS), /necesita el esquema storage/);
      await sql(base, SUSTITUTO_STORAGE);
      await sql(base, `alter table public.clientes_fiscales rename to clientes_fiscales_x`);
      await esperarError(sql(base, TEXTO_CONSTANCIAS), /Faltan las migraciones/);
    } finally { await base.close(); }
    cierto(!/create\s+(or\s+replace\s+)?function/i.test(TEXTO_CONSTANCIAS.replace(/--.*$/gm, '')), 'constancias.sql no tiene create function');
    igual((await una(await plantilla(), `select coalesce(cardinality(interno.auditoria()), -1) as n`)).n, 0);
  });
  prueba('la comprobación final se DETIENE si una política suelta abre el bucket o vale para todos los buckets; una restrictiva o la de otro bucket, no', () => conCopia(plantilla, async db => {
    await sql(db, `create policy abierta on storage.objects for select to authenticated using (bucket_id = 'constancias-fiscales')`);
    await esperarError(sql(db, TEXTO_CONSTANCIAS), /AUDITORIA.*no son de este archivo.*abierta/);
    await sql(db, `drop policy abierta on storage.objects; create policy todo on storage.objects for select to authenticated using (true)`);
    await esperarError(sql(db, TEXTO_CONSTANCIAS), /AUDITORIA.*no miran bucket_id.*todo/);
    await sql(db, `drop policy todo on storage.objects; create policy cierra on storage.objects as restrictive for select to authenticated using (true)`);
    await sql(db, TEXTO_CONSTANCIAS);
    await sql(db, `drop policy cierra on storage.objects; create policy de_otro on storage.objects for select to anon using (bucket_id = 'otros')`);
    await sql(db, TEXTO_CONSTANCIAS);
  }));
});

describir('CS-02 leer: Dirección y Pagos de la empresa; Fabricación nada', () => {
  prueba('Dirección (las dos) y Pagos (los dos) ven las constancias de al3d, y nada de otra empresa ni del bucket ajeno', async () => {
    const db = await plantilla();
    for (const q of ['dir', 'dir2', 'pag', 'pag2']) igual([q, await ver(db, q)], [q, [R.a, R.b].sort()]);
  });
  prueba('Fabricación, la ajena, la baja, la invitación sin reclamar y anon: ninguna (ni la lista de nombres)', async () => {
    const db = await plantilla();
    for (const q of ['fab', 'ext', 'baja', 'inv', 'noverif']) igual([q, await ver(db, q)], [q, []]);
    igual((await como(db, { rol: 'anon' }).query(`select name from storage.objects where bucket_id = $1`, [B])).length, 0);
  });
  prueba('otra empresa ve solo la suya; multi (Dirección en al3d, Fabricación en otra) ve las de al3d y NO la de otra', async () => {
    const db = await plantilla();
    igual(await ver(db, 'otra'), [R.otra]);
    igual(await ver(db, 'multi'), [R.a, R.b].sort());
  });
});

describir('CS-03 subir: Dirección y Pagos, en la carpeta de un cliente fiscal de su empresa, con la forma exacta', () => {
  prueba('Pagos y Dirección suben un PDF, un JPG, un PNG y un WebP a la carpeta de un cliente', async () => {
    const db = await plantilla();
    await subir(db, 'pag', `al3d/${RFC}/csf-aaaaaaaa-0001.pdf`);
    await subir(db, 'pag2', `al3d/${RFC}/csf-aaaaaaaa-0002.jpg`);
    await subir(db, 'dir', `al3d/${RFC2}/csf-aaaaaaaa-0003.png`);
    await subir(db, 'dir', `al3d/${RFC2}/csf-aaaaaaaa-0004.webp`);
  });
  prueba('NO a la carpeta de un RFC que no es cliente fiscal, ni al de otra empresa, ni con una ruta que no es la forma (también Dirección)', async () => {
    const db = await plantilla();
    await esperarError(subir(db, 'pag', `al3d/${NO_CLIENTE}/csf-aaaaaaaa-0001.pdf`), NEGADO, 'RFC que no es cliente');
    await esperarError(subir(db, 'dir', `al3d/${RFC_OTRA}/csf-aaaaaaaa-0001.pdf`), NEGADO, 'cliente de otra empresa, en la carpeta de al3d');
    await esperarError(subir(db, 'dir', `otra/${RFC_OTRA}/csf-aaaaaaaa-0001.pdf`), NEGADO, 'la carpeta de otra empresa');
    for (const nombre of [`al3d/${RFC}/csf-corto.pdf`, `al3d/${RFC}/constancia.pdf`, `al3d/${RFC}/csf-aaaaaaaa-0001.html`, `al3d/${RFC}/csf-aaaaaaaa-0001.pdf.html`,
                          `al3d/${RFC}/x/csf-aaaaaaaa-0001.pdf`, `al3d/${RFC.toLowerCase()}/csf-aaaaaaaa-0001.pdf`, `AL3D/${RFC}/csf-aaaaaaaa-0001.pdf`,
                          `al3d/${RFC}/../csf-aaaaaaaa-0001.pdf`, `al3d/csf-aaaaaaaa-0001.pdf`, `al3d/${RFC}/csf-aaaa aaaa-01.pdf`]) {
      await esperarError(subir(db, 'dir', nombre), NEGADO, nombre);
    }
  });
  prueba('Fabricación NUNCA sube; tampoco la ajena, la baja, la invitación, otra empresa ni anon', async () => {
    const db = await plantilla();
    for (const q of ['fab', 'ext', 'baja', 'inv', 'otra']) await esperarError(subir(db, q, `al3d/${RFC}/csf-aaaaaaaa-0009.pdf`), NEGADO, q);
    await esperarError(como(db, { rol: 'anon' }).query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [B, `al3d/${RFC}/csf-aaaaaaaa-0009.pdf`]), NEGADO, 'anon');
  });
});

describir('CS-04 cambiar y borrar: solo Dirección', () => {
  const cambiar = (db, q, nombre) => sesionDe(db, db.u[q]).query(`update storage.objects set metadata = '{"x":1}'::jsonb where bucket_id = $1 and name = $2`, [B, nombre]);
  const borrar = (db, q, nombre) => sesionDe(db, db.u[q]).query(`delete from storage.objects where bucket_id = $1 and name = $2 returning name`, [B, nombre]);
  prueba('cambiar: Dirección sí; Pagos, Fabricación y otra empresa no (0 filas)', async () => {
    const db = await plantilla();
    igual((await cambiar(db, 'dir', R.a)).afectadas, 1);
    for (const q of ['pag', 'fab', 'otra', 'ext']) igual([q, (await cambiar(db, q, R.a)).afectadas], [q, 0]);
  });
  prueba('borrar: Pagos, Fabricación, otra empresa y anon no; Dirección sí (y no en otra empresa)', async () => {
    const db = await plantilla();
    for (const q of ['pag', 'fab', 'otra']) igual([q, (await borrar(db, q, R.a)).length], [q, 0]);
    igual((await como(db, { rol: 'anon' }).query(`delete from storage.objects where bucket_id = $1 returning name`, [B])).length, 0);
    igual((await borrar(db, 'dir', R.a)).map(r => r.name), [R.a]);
    igual((await borrar(db, 'dir', R.otra)).length, 0);
  });
  prueba('un cambio de Dirección no puede mover la constancia a otra empresa ni a otra forma de ruta', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.dir).query(`update storage.objects set name = $3 where bucket_id = $1 and name = $2`, [B, R.a, `otra/${RFC}/csf-11111111-aaaa.pdf`]), NEGADO);
    await esperarError(sesionDe(db, db.u.dir).query(`update storage.objects set name = $3 where bucket_id = $1 and name = $2`, [B, R.a, 'al3d/suelta.pdf']), NEGADO);
  });
});

await resumen();
