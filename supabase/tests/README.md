# Pruebas de base de datos (PGlite)

Un **Supabase de mentiras, en memoria**, para probar las migraciones SQL, las políticas RLS y las funciones RPC del proyecto **sin Docker, sin red y sin la CLI de Supabase**. Usa [PGlite](https://pglite.dev) (`@electric-sql/pglite` **0.5.8**, fijado en el `package-lock.json`): PostgreSQL 18.3 compilado a WASM, dentro del propio proceso de node.

> **Esto es una imitación, no Supabase.** Atrapa los errores de permisos y de seguridad que más duelen (un `GRANT` olvidado, una política que deja pasar de más, una función `SECURITY DEFINER` sin `search_path`) en segundos y en tu computadora. **No** da por buena una migración: la validación definitiva es contra el proyecto de pruebas de Supabase. Lo que no cubre está en [Límites](#límites-lo-que-no-es).

## Para qué sirve

Lo que se vuelve una prueba de una línea:

- «Fabricación **no** ve `ventas_dinero`» (RLS filtra a cero filas) y «`anon` recibe `permission denied`» (falta de `GRANT`).
- «Esta función solo la llama Pagos»: la prueba llama como cada rol y mira el sqlstate.
- «La migración 14 aplica sobre las 13 anteriores» y, si no, **en qué archivo y en qué línea** truena.
- «Ninguna tabla de `public` quedó sin RLS, ninguna vista salta RLS, ninguna `SECURITY DEFINER` quedó sin `search_path`, ninguna función quedó ejecutable por `anon`» (`auditarRLS`).

## Cómo correrlo

Hace falta node 24 (probado con la 24.17). Desde la raíz del repo:

```sh
sh supabase/tests/correr.sh                  # todas las pruebas (la primera vez hace npm ci)
sh supabase/tests/correr.sh autoprueba       # solo las que tengan «autoprueba» en la ruta
node supabase/tests/autoprueba.mjs           # una sola, directo (después de `npm ci` en supabase/tests)
```

`correr.sh` entra a su propia carpeta, instala con `npm ci` si falta `node_modules`, corre **cada `*.mjs` de esta carpeta** (y de sus subcarpetas de un nivel) **menos `arnes/`**, suma los archivos que fallaron y sale con 1 si hubo alguno. Por eso una prueba nueva solo tiene que ser un `.mjs` suelto que termine con código de salida, como las de `pruebas/`. También hay `npm test` (= `sh correr.sh`).

Cuánto tarda (medido en Windows 11 con node 24.17): la autoprueba, unos 14 s; **arrancar una base**, de 1 a 1,7 s; **copiar** una ya armada con `clonarBase`, unos 0,4 s. Cada instancia de PGlite ocupa unos **250 MB de RAM** (el mínimo de memoria de su WASM no se puede bajar): ciérralas (`await db.close()`) y no abras decenas a la vez.

## Qué hay en esta carpeta

```
supabase/tests/
  package.json, package-lock.json   PGlite 0.5.8, fijado y con su hash
  correr.sh                         corre todas las pruebas
  autoprueba.mjs                    prueba el propio arnés (y exporta auditarRLS)
  arnes/
    shim.sql                        el Supabase de mentiras: roles, esquemas, auth.*, Realtime…
    arnes.mjs                       crearBase, como, sql, crearUsuarioAuth, auditarRLS, clonarBase…
    marco.mjs                       el mini marco: describir, prueba, dato, igual, esperarError…
  acceso/ rls-y-dinero/ formulas/   las pruebas de las migraciones (supabase/migrations), una carpeta por
  obra-y-etapas/ pagos/ almacen/    área; cada caso lleva el id de supabase/DISENO.md §10 (AC-, SE-, ET-, PG-,
  notario/ cupos/                   FM-, CU-, GR-, R1-, …), permitido Y denegado por rol
  sync-e-importacion/ auditoria/
  comun/                            ayudantes compartidos (semilla de personas y empresas, notario, oráculo)
  node_modules/                     (ignorado por git)
```

Las migraciones están en `supabase/migrations/`; las pruebas las aplican todas con `crearBase()` y comprueban lo que
importa: quién ve y qué puede hacer cada área, las fórmulas de la hoja al centavo y las reglas de negocio. `0011`
(auditoría) aborta la migración si algún objeto nuevo queda mal protegido. Estado de la corrida y lo que PGlite NO
valida (PostgREST, Realtime, Storage, las funciones del servidor, la concurrencia entre conexiones): `docs/ESTADO-SUPABASE.md`.
Para correr en un proyecto REAL de Supabase lo mismo que más importa: `supabase/opcional/prueba-de-humo.sql`.

## Qué simula el shim

`arnes/shim.sql` se carga una vez, como superusuario, **antes** de las migraciones del proyecto.

| Pieza | Qué trae | Ojo |
|---|---|---|
| Roles | `anon`, `authenticated`, `service_role` (`BYPASSRLS`), `authenticator` (`login`, miembro de los otros tres). Todos `noinherit`. | `service_role` salta RLS pero **no** los `GRANT`. |
| `extensions` + pgcrypto | `extensions.hmac`, `extensions.digest`, `gen_random_bytes`; `USAGE` para los tres roles. | Dentro de una función con `search_path = ''` hay que escribir `extensions.hmac`, no `hmac`. Más contribs de PGlite con la opción `extensiones`. |
| `auth.users` | Mínima: `id`, `aud`, `role`, `email`, `email_confirmed_at`, `raw_app_meta_data`, `raw_user_meta_data`, `created_at`, `updated_at`, `last_sign_in_at`. Índice único en `email`. | `anon` y `authenticated` **no** la leen; una clave foránea hacia ella sí funciona para ellos. |
| `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` | Las de Supabase tal cual: leen `request.jwt.claims` (y la clave suelta antigua `request.jwt.claim.sub`), con `nullif(…, '')`. | |
| Realtime | La publicación `supabase_realtime`, vacía. | Se puede probar que una migración le agrega tablas; no que Realtime entregue algo. |
| `public` | `USAGE` para los tres roles; **nadie puede crear**. | |
| **Sin privilegios por defecto** | `pg_default_acl` vacío: una tabla nueva nace cerrada para todos. Es lo que debe pasar en el proyecto real, que según `docs/DECISIONES-SUPABASE.md` tiene «exponer tablas automáticamente» apagado (no lo comprobé en su panel). | Si una migración olvida un `GRANT`, la prueba falla con `permission denied`. |
| Funciones nuevas | Se deja el comportamiento de Postgres: `EXECUTE` a `PUBLIC`. | A propósito: es el comportamiento por defecto de Postgres y, hasta donde sé, también el del proyecto real (no lo verifiqué contra él). `auditarRLS` lo encuentra; si el shim lo cerrara por defecto, el defecto quedaría escondido. |
| `search_path` | Base: `"$user", public, extensions`. Cada petición: `public, extensions` (como PostgREST). | |
| Zona horaria | **UTC**, como Supabase. | La de PGlite sale del equipo donde corre (aquí era UTC−6) y haría que `current_date` diera otro día según la máquina. |

No hay un evento que active RLS automáticamente en tablas nuevas: lo sustituye `auditarRLS`.

### Qué hace `como()` en cada petición

Como PostgREST: abre una transacción; deja los claims en `request.jwt.claims` (y `request.jwt.claim.sub`), las cabeceras en `request.headers` y el `search_path`; pasa la sesión a `authenticator` y de ahí hace `SET LOCAL ROLE`; corre tu consulta; y **deshace** (o confirma, con `{confirmar: true}`). Todo es `LOCAL`: al terminar, el rol y los claims desaparecen. Pase lo que pase —un error, un `commit` tuyo, un `set role` sin `local`, una tabla temporal, un `set session authorization` confirmado— lo que quede se limpia antes de la siguiente petición. Cada petición pasa además por una cola por base, así que dos sesiones lanzadas a la vez (`Promise.all`) no se mezclan.

## Escribir una prueba nueva

Cada archivo es un script de node suelto, con el idioma de siempre (`✓`/`✗`, contador de fallos, código de salida). Los ejemplos de abajo se ejecutaron contra el arnés de verdad con una migración de ejemplo.

### El esqueleto

```js
// supabase/tests/rls-dinero.mjs
import { crearBase, crearUsuarioAuth, como, sql, exigirAuditoriaLimpia } from './arnes/arnes.mjs';
import { describir, prueba, dato, igual, esperarError, resumen } from './arnes/marco.mjs';

// La base se arma UNA vez (shim + todo supabase/migrations) y se cierra al terminar.
// Las rutas relativas se cuentan desde supabase/tests/, no desde donde lances node.
const base = dato(() => crearBase({ migraciones: '../migrations' }), { limpiar: db => db.close() });

const PAGOS = '00000000-0000-4000-8000-00000000aa01';
const FABRICACION = '00000000-0000-4000-8000-00000000aa02';

describir('dinero: quién lo ve', () => {
  prueba('siembra: dos usuarios con su área y una venta', async () => {
    const db = await base();
    await crearUsuarioAuth(db, { uid: PAGOS, correo: 'pagos@pruebas.invalid' });
    await crearUsuarioAuth(db, { uid: FABRICACION, correo: 'taller@pruebas.invalid' });
    await sql(db, `insert into public.miembros values ('${PAGOS}', 'pagos'), ('${FABRICACION}', 'fabricacion');
                   insert into public.ventas_dinero values (1, 1500.50)`);
  });

  prueba('Pagos ve la venta', async () => {
    const db = await base();
    const filas = await como(db, { sub: PAGOS }).query('select id, subtotal::text from public.ventas_dinero');
    igual(filas, [{ id: 1, subtotal: '1500.50' }]);
  });

  prueba('Fabricación no ve ni una fila (RLS) y anon recibe permission denied (no hay GRANT)', async () => {
    const db = await base();
    igual(await como(db, { sub: FABRICACION }).query('select * from public.ventas_dinero'), []);
    await esperarError(como(db, { rol: 'anon' }).query('select * from public.ventas_dinero'), '42501');
  });

  prueba('la auditoría de seguridad no encuentra nada', async () => {
    await exigirAuditoriaLimpia(await base());
  });
});

await resumen();     // espera a todas, imprime el total y sale con 1 si algo falló
```

Las pruebas **no necesitan `await`**: corren una tras otra, en el orden en que se declaran. Lo que dejan en la base (`sql()` o `{confirmar: true}`) lo ven las siguientes; lo que hace `como()` por omisión, no.

<details>
<summary>La migración de ejemplo sobre la que corren estos ejemplos (no es del proyecto)</summary>

```sql
-- supabase/migrations/20261010000000_ejemplo.sql
create table public.miembros (
  usuario_id uuid primary key references auth.users (id),
  area text not null check (area in ('direccion', 'fabricacion', 'pagos'))
);
create table public.ventas_dinero (
  id int primary key,
  subtotal numeric not null
);
alter table public.miembros enable row level security;
alter table public.ventas_dinero enable row level security;
grant select on public.miembros to authenticated;
grant select, insert on public.ventas_dinero to authenticated;
grant select, insert on public.ventas_dinero to service_role;

-- El área de quien llama. SECURITY DEFINER con search_path vacío: por eso todo va calificado.
create function public.area_de_usuario() returns text
language sql stable security definer set search_path = '' as $$
  select area from public.miembros where usuario_id = auth.uid()
$$;
revoke all on function public.area_de_usuario() from public;
grant execute on function public.area_de_usuario() to authenticated;

create policy miembros_propio on public.miembros for select to authenticated
  using (usuario_id = auth.uid());
create policy dinero_pagos_direccion on public.ventas_dinero for select to authenticated
  using (public.area_de_usuario() in ('pagos', 'direccion'));
create policy dinero_pagos_alta on public.ventas_dinero for insert to authenticated
  with check (public.area_de_usuario() in ('pagos', 'direccion'));

-- Una RPC: solo Pagos y Dirección cobran.
create function public.registrar_cobro(venta int, monto numeric) returns numeric
language plpgsql security definer set search_path = '' as $$
begin
  if public.area_de_usuario() not in ('pagos', 'direccion') then
    raise exception 'sin permiso para cobrar' using errcode = '42501';
  end if;
  return monto;
end $$;
revoke all on function public.registrar_cobro(int, numeric) from public;
grant execute on function public.registrar_cobro(int, numeric) to authenticated;
```

Notas de esa migración que explican las pruebas: `anon` no tiene ningún `GRANT` (por eso recibe `permission denied`); Fabricación sí tiene `GRANT select` pero ninguna política le abre filas (por eso ve cero filas, sin error); y cada función hace `revoke … from public` antes de dar `execute` a quien debe.

</details>

### Probar una función (RPC), una transacción y copias

```js
// supabase/tests/rpc-cobros.mjs
import { crearBase, crearUsuarioAuth, como, sql, clonarBase } from './arnes/arnes.mjs';
import { describir, prueba, dato, igual, esperarError, resumen } from './arnes/marco.mjs';

const PAGOS = '00000000-0000-4000-8000-00000000aa01';
const FABRICACION = '00000000-0000-4000-8000-00000000aa02';

// Una plantilla con los usuarios ya sembrados y CONFIRMADOS (sql() confirma): cada prueba que modifica datos usa su copia.
const plantilla = dato(async () => {
  const db = await crearBase({
    migraciones: '../migrations',
    antes: './dobles/pg_cron.sql',        // un archivo (o carpeta) que se carga ANTES de las migraciones
  });
  await crearUsuarioAuth(db, { uid: PAGOS, correo: 'pagos@pruebas.invalid' });
  await crearUsuarioAuth(db, { uid: FABRICACION, correo: 'taller@pruebas.invalid' });
  await sql(db, `insert into public.miembros values ('${PAGOS}', 'pagos'), ('${FABRICACION}', 'fabricacion')`);
  return db;
}, { limpiar: db => db.close() });

describir('registrar_cobro', () => {
  prueba('Pagos cobra; Fabricación no', async () => {
    const db = await plantilla();
    // rpc() llama con argumentos con nombre: select * from public.registrar_cobro(venta => $1, monto => $2)
    const r = await como(db, { sub: PAGOS }).rpc('registrar_cobro', { venta: 1, monto: 500 });
    igual(r, [{ registrar_cobro: '500' }]);                // numeric llega como texto: no pierde precisión
    // esperarError acepta un sqlstate, un texto o una regex
    await esperarError(como(db, { sub: FABRICACION }).rpc('registrar_cobro', { venta: 1, monto: 500 }), /sin permiso/);
    // intentar() no lanza: devuelve {ok, filas, error: {codigo, mensaje}}
    const x = await como(db, { rol: 'anon' }).intentar('select public.registrar_cobro(1, 500)');
    igual([x.ok, x.error.codigo], [false, '42501']);
  });

  prueba('varias sentencias en UNA petición; por omisión todo se deshace', async () => {
    const copia = await clonarBase(await plantilla());     // una copia independiente, ya sembrada
    try {
      const r = await como(copia, { sub: PAGOS }).transaccion(async t => {
        await t.query('insert into public.ventas_dinero values (2, 100)');
        const dup = await t.intentar('insert into public.ventas_dinero values (2, 100)');   // no aborta la petición
        return { duplicado: dup.error.codigo, total: (await t.query('select count(*)::int n from public.ventas_dinero'))[0].n };
      });
      igual(r, { duplicado: '23505', total: 1 });
      igual(await sql(copia, 'select count(*)::int n from public.ventas_dinero'), [{ n: 0 }], 'la fila 2 no quedó: se deshizo');

      // {confirmar: true} la deja
      await como(copia, { sub: PAGOS }).query('insert into public.ventas_dinero values (3, 10)', [], { confirmar: true });
      igual(await sql(copia, 'select id from public.ventas_dinero'), [{ id: 3 }]);
    } finally { await copia.close(); }
  });
});

await resumen();
```

Con **muchas** pruebas que modifican datos, la receta es esa: **una plantilla** (shim + migraciones + usuarios sembrados) y **una copia por prueba** (0,4 s) en vez de una base nueva (1 a 1,7 s). Con pocas, basta una base compartida y dejar que cada petición se deshaga sola.

### Cosas que el shim no trae

Si una migración llama a `cron.schedule(...)` o a algo de `vault`, tronaría: el shim no trae pg_cron ni Vault. Se le da un doble en un `.sql` que se carga **antes** de las migraciones:

```sql
-- supabase/tests/dobles/pg_cron.sql
create schema cron;
create function cron.schedule(nombre text, horario text, orden text) returns bigint
language sql as 'select 1::bigint';
```

Con `antes: './dobles/pg_cron.sql'` (o `['./dobles']` para toda una carpeta). Para sembrar datos comunes **después** de las migraciones, `extra: [...]`. Para una contrib de PGlite, `extensiones: ['uuid_ossp']` (la migración sigue haciendo su `create extension … with schema extensions`).

### Auditoría de seguridad

```js
import { auditarRLS, describirAuditoria, exigirAuditoriaLimpia } from './arnes/arnes.mjs';   // o de './autoprueba.mjs'

prueba('seguridad: nada se quedó abierto', async () => {
  await exigirAuditoriaLimpia(await base(), {
    permitir: { funciones: ['public.verificar_pdf'] },     // públicas A PROPÓSITO (todas las sobrecargas; o con argumentos)
  });
});
```

Revisa, en `public` e `interno`: tablas **sin RLS**; vistas **sin** `security_invoker = true`; vistas materializadas legibles por `anon`/`authenticated` (no admiten RLS); funciones `SECURITY DEFINER` **sin** `search_path` fijado. Y en `public`: funciones **ejecutables por `anon`** (por `PUBLIC` o por `GRANT` directo). Ignora lo que es de una extensión. `auditarRLS()` devuelve el reporte sin lanzar (`{ok, total, tablasSinRLS, vistasSinSecurityInvoker, …}`); `exigirAuditoriaLimpia()` lanza con un mensaje que dice qué y cómo arreglarlo. Opciones: `esquemas` (por omisión `['public','interno']`), `expuestos` (`['public']`) y `permitir: {tablas, vistas, definer, funciones}`.

### Leer un error de migración

```
ErrorDeMigracion: Falló «20261010000100_politicas.sql», línea 5: relation "public.ventas_dinero" does not exist [42P01]
    > create policy ver_dinero on public.ventas_dinero for select to authenticated
```

El error trae `archivo`, `linea`, `sentencia`, `codigo` (el sqlstate) y el `message` es el de Postgres. Si Postgres no da posición (un `INSERT` que viola una restricción, un `RAISE`), el arnés repite el archivo sentencia por sentencia dentro de una transacción que se deshace para ubicarla. **Si el archivo trae varios bloques `BEGIN … COMMIT` y ya se confirmó uno, se informa el archivo sin línea** antes que inventar una. Un archivo que termina con un `BEGIN` sin `COMMIT` también se reporta (con la línea del último `BEGIN`).

## Referencia

**`arnes/arnes.mjs`**

| | |
|---|---|
| `crearBase({migraciones, extra, antes, extensiones})` | Base nueva: shim → `antes` → migraciones (`*.sql` en orden alfabético) → `extra`. Cada opción acepta un valor o una lista. Rutas relativas desde `supabase/tests/`; también URL. Sin `migraciones`, solo el shim. |
| `clonarBase(db)` | Copia independiente de una base armada (datos incluidos). |
| `como(db, {rol, sub, correo, verificado, claims, cabeceras, confirmar})` | Sesión como PostgREST. `rol`: `anon`, `authenticated` (por omisión; pide `sub`, un uuid) o `service_role`. `uid` vale como `sub`: `como(db, {rol: 'authenticated', ...usuario})` con lo que devuelve `crearUsuarioAuth`. `claims` pisa/agrega claims; `cabeceras` va a `request.headers`. |
| `sesion.query(sql, params, {confirmar})` | Una sentencia → **filas**, con `.afectadas` y `.comando` (un `UPDATE` que RLS filtra da `.afectadas === 0`, sin error). Lanza `ErrorDeBase` (`.codigo`/`.code` = sqlstate). |
| `sesion.intentar(sql, params, opts)` | No lanza: `{ok, filas, afectadas, error: {codigo, mensaje, detalle, pista, tabla, restriccion, columna}}`. |
| `sesion.rpc(nombre, args, opts)` | `select * from "public"."nombre"(a => $1, …)`. `nombre` puede llevar esquema. Un objeto se manda como JSON (a un `jsonb` y también a un `text`); un arreglo lo serializa PGlite según el tipo. |
| `sesion.transaccion(async t => {…}, opts)` | Varias sentencias en una misma petición. `t` tiene `query`, `intentar` (usa `SAVEPOINT`) y `rpc`. Dentro **no** se llama a `sql()` ni a otra sesión de la misma base (se detecta y avisa). |
| `sesion.con(cambios)` / `sesion.claims` | La misma sesión con otras opciones (`s.con({confirmar: true})`) / copia de los claims que viajan. |
| `sql(db, texto, params)` | Como superusuario, para sembrar. Sin `params` acepta varias sentencias (atómico) y devuelve las filas de la última. No limpia la sesión después. |
| `crearUsuarioAuth(db, {uid, correo, verificado, metadatos})` | Alta en `auth.users` como GoTrue tras entrar con Google (con tus disparadores). Devuelve `{uid, correo, verificado}`. |
| `auditarRLS`, `describirAuditoria`, `exigirAuditoriaLimpia` | Ver arriba. |
| `partirSql(texto)` | El divisor de SQL en sentencias (entiende `$$`, comentarios anidados, `E'…'`, `BEGIN ATOMIC`). |
| `ErrorDeBase`, `ErrorDeMigracion`, `ROLES` | Los errores y la lista de roles. |

**`arnes/marco.mjs`** (el idioma de siempre, más lo justo para lo asíncrono)

| | |
|---|---|
| `describir(titulo, fn)` | Agrupa. `fn` se ejecuta al declarar y **no** puede ser async. |
| `prueba(titulo, fn, {tiempo})` | Una prueba (puede ser async). Si lanza, falla y se sigue con la siguiente. Se corta a los 60 s. |
| `dato(fabrica, {limpiar})` | Un valor perezoso: se fabrica al primer uso, se reutiliza, y se limpia en `resumen()`. Para la base. |
| `igual(actual, esperado, mensaje)`, `cierto(valor, mensaje)` | Aserciones que lanzan. `igual` es profunda y estricta (`1` ≠ `'1'`, `1n` ≠ `1`). |
| `esperarError(promesa, patron)` | Espera un fallo. `patron`: una regex sobre «`<sqlstate> <mensaje>`» (sirve `/permission denied/` igual que `/42501/`), un sqlstate suelto (`'42501'`) o un texto. Devuelve el error. |
| `bien(m)`, `mal(m)`, `contadores()` | El idioma de `pruebas/ics.mjs`, por si prefieres escribir así. |
| `resumen()` | Espera, limpia los `dato()`, imprime el total y **sale con el código** (1 si algo falló). |

## Trampas que conviene saber

- **`service_role` salta RLS, no los `GRANT`.** Con «exponer tablas automáticamente» apagado, las Edge Functions que usan `service_role` también necesitan su `GRANT` en cada tabla (y `EXECUTE` en cada función). La autoprueba lo demuestra.
- **Una función nueva es ejecutable por `PUBLIC`**, y por tanto por `anon`, hasta que alguien la revoque: `revoke all on function … from public;` y luego `grant execute … to authenticated;`. `auditarRLS` lo caza.
- **Una vista normal salta RLS** (corre como su dueño); con `security_invoker = true`, no. **Un `GRANT` sin RLS entrega la tabla entera.** **Una `SECURITY DEFINER` sin chequeo salta RLS.** Todo esto está ejecutado, como prueba, en el «laboratorio» de `autoprueba.mjs`.
- **`query()` corre una sola sentencia.** Para varias: `transaccion()`.
- **Por omisión todo se deshace.** Para que persista, `{confirmar: true}` (en la llamada o en `como()`), o siembra con `sql()`. Si una prueba confirma, limpia lo suyo o usa `clonarBase`.
- **Una restricción `DEFERRABLE INITIALLY DEFERRED` se revisa aunque se deshaga**, como lo haría el `COMMIT` de verdad (no se te cuela un fallo que en producción sí ocurriría).
- **Un error atrapado dentro de `transaccion()` sin `SAVEPOINT` deja la transacción abortada**: el arnés lo avisa, también al confirmar (donde Postgres la deshace en silencio). Para una sentencia que debe fallar, `t.intentar()`.
- **Tipos que llegan de PGlite**: `numeric` → texto (sin perder precisión), `int8` → número, o `BigInt` si no cabe, `timestamptz`/`date` → `Date`, `json`/`jsonb` → objeto, `uuid` → texto. Para comparar sin sorpresas, castea en el SQL (`::text`, `::int`).
- **Memoria**: ~250 MB por instancia. Cierra lo que abras.
- **Para probar lógica que depende de la hora** no hay reloj de prueba (ver Límites): siembra filas con fechas relativas a `now()`, o haz que la función reciba el instante como parámetro.

## Límites: lo que NO es

- **No es Supabase.** Es PostgreSQL 18.3 en WASM; el proyecto real corre **la versión que tenga su panel** (no necesariamente la 18). Un comportamiento que cambió entre versiones puede pasar aquí y fallar allá, o al revés.
- **No hay PostgREST.** El ruteo de roles (rol por JWT, claims, `search_path`) se imita a mano en `como()`. No se prueban filtros de la API, `Prefer`, `max_rows`, la lista de esquemas expuestos ni su caché de esquema; se prueba SQL.
- **No hay GoTrue (Auth).** `auth.users` es una tabla mínima; no hay sesiones, identidades, MFA ni *hooks* de token. Los claims los fabrica el arnés con la forma de los de Supabase **tal como la recuerdo, sin haberla comparado con un token real** (`iss`, `sub`, `aud`, `role`, `email`, `app_metadata`, `user_metadata.email_verified`, `session_id`…); nadie valida un JWT. Si el proyecto usa un *hook* que agrega claims, se simulan con la opción `claims`.
- **El arnés fija la clave suelta antigua `request.jwt.claim.sub`**, además de `request.jwt.claims`. Según tengo entendido PostgREST actual solo pone la segunda (no lo he verificado): una función que lea la clave suelta pasaría aquí y podría fallar allá. Usa `auth.uid()` y `auth.jwt()`, que leen las dos.
- **No hay Realtime, Storage, Edge Functions, Vault, pg_cron, pg_net ni pg_graphql.** Solo la publicación `supabase_realtime` existe (y no la regla de que los `DELETE` no pasan por RLS). Los dobles de lo demás se escriben tú (ver `antes`).
- **El superusuario `postgres` es superusuario de verdad.** En un proyecto de Supabase, según tengo entendido, no lo es (y por eso una migración que necesite un privilegio que `postgres` no tenga allá pasaría aquí y fallaría allá). No lo he verificado contra el proyecto: compruébalo en el de pruebas con `select rolsuper from pg_roles where rolname = 'postgres'`.
- **Dentro de una petición, `set session authorization postgres` sí escala** (en Supabase el usuario autenticado de la conexión es `authenticator` y no puede). `reset role` y `set role postgres` **no** escalan, como en Supabase. Está comprobado en la autoprueba («LÍMITE CONOCIDO»).
- **Una sola conexión.** No se pueden probar bloqueos, carreras entre sesiones ni *deadlocks*. Los planes de consulta y el rendimiento no representan a producción (sin paralelismo, sin `fsync`).
- **La colación es `C`** (orden por bytes; lo comprobé en PGlite). La de un proyecto de Supabase es, según tengo entendido, `en_US.UTF-8` (no lo verifiqué): un `order by` de texto con mayúsculas o acentos puede salir distinto. La zona horaria sí se fuerza a UTC.
- **No hay reloj de prueba.** Lo probé: `now()` sí sigue a un `Date.now` parchado, pero al saltar la hora aparece una cascada de `TimeoutOverflowWarning` (la causa probable son los temporizadores internos de Postgres en WASM; es una inferencia, lo observado son los avisos). Por eso no se ofrece.
- **El arnés depende de comportamientos internos de PGlite 0.5.8** (modo monousuario, `startParams`, `dumpDataDir`/`loadDataDir`). Subir la versión exige volver a correr la autoprueba: cubre cada uno de ellos.
- **Probado en Windows 11 con Git Bash y node 24.17.** No se ha corrido en Linux, macOS ni con otra versión de node, ni hay flujo de CI todavía.
- **Archivos `.sh` y CRLF.** Con `core.autocrlf=true` (el de este equipo) Git deja los `.sh` con CRLF en el árbol de trabajo de Windows (aquí `pruebas/correr.sh` está así). Con el `sh` de Git Bash de este equipo da igual: comprobé que un script con CRLF corre completo. En Linux o WSL, sobre ese mismo árbol, un `.sh` con CRLF suele fallar con errores que no se parecen a la causa (no lo probé aquí). Un `.gitattributes` con `*.sh text eol=lf` lo evita; hoy el repo no tiene uno.

## Cómo se verificó el propio arnés

`autoprueba.mjs` (71 verificaciones, ~14 s) comprueba cada promesa de arriba: el shim, lo que Postgres hace con RLS/`GRANT`/`SECURITY DEFINER`/vistas, que `como()` no filtre estado entre sesiones (ni aunque la prueba lo intente), los errores de migración con archivo y línea, la auditoría contra defectos sembrados a propósito, el divisor de SQL y el marco con procesos hijos de verdad (código de salida, formato, tiempo máximo). Los ejemplos de este README se extrajeron tal cual y se corrieron contra el arnés.

Que una prueba pase no demuestra que tenga dientes, así que además se probó **rompiendo el arnés a propósito**: 61 mutaciones, cada una en una copia (quitar un `GRANT` del shim, el `reset`, la cola, el `set constraints`, el `search_path`, la zona horaria, el divisor de SQL…). La autoprueba detecta **56**. Las otras **5** son capas redundantes entre sí, donde quitar una sola no cambia nada observable: el orden de `DISCARD ALL` y de fijar la autorización de sesión, inicializar la conexión al crear o al clonar (la limpieza final ya lo hace), el `ROLLBACK` defensivo dentro de la limpieza, y una guarda contra posiciones de consultas internas que, en el caso probado (un error dentro de una función), Postgres no necesita. Siguen ahí como defensa en profundidad.

`auditarRLS` se exporta también desde `autoprueba.mjs` y **importarla no ejecuta las pruebas**.
