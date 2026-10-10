# supabase/ — la base de AL3D (en construcción, apagada)

Esta carpeta es la migración a Supabase del plan [`docs/PLAN-SUPABASE.md`](../docs/PLAN-SUPABASE.md). **Está apagada:**
la app, el puente y la hoja de Google siguen funcionando exactamente igual y no hay ningún dato real en Supabase.
Qué está hecho y qué falta, con la evidencia: [`docs/ESTADO-SUPABASE.md`](../docs/ESTADO-SUPABASE.md).

| Carpeta o archivo | Qué es |
|---|---|
| [`DISENO.md`](DISENO.md) | El diseño del esquema: tablas, reglas de acceso, funciones, vista de fórmulas, plan de pruebas |
| `migrations/` | Las 12 migraciones SQL, en orden (`0001` a `0012`); ver [`migrations/README.md`](migrations/README.md) |
| `tests/` | Pruebas de la base con PGlite (PostgreSQL en WASM, sin Docker): `sh supabase/tests/correr.sh`; ver [`tests/README.md`](tests/README.md) |
| `functions/` | Funciones del servidor (Deno): `salud`, `verificar`, `maps`, `ia`, `espejo`, con su código compartido en `_shared/` |
| `opcional/` | Lo que no corre en PGlite: `prueba-de-humo.sql` (para un proyecto real), `storage.sql`, `semilla_materiales.mjs`, `keepalive.md` |
| `config.toml` | Configuración de las funciones (todas con `verify_jwt = false`: las llaves nuevas de Supabase no son JWT, cada función valida a la persona en su código) |

## Cómo se aplica a un proyecto de Supabase

1. **Crear el proyecto** con «Enable Data API» encendido, «Automatically expose new tables» **apagado** y «Enable automatic RLS»
   encendido (cada migración declara sus propios `GRANT`/`REVOKE`; con la exposición automática encendida los privilegios finales
   quedan iguales, y una prueba lo demuestra).
2. **Correr `migrations/0001` … `0012` en orden** en el Editor SQL del panel (o `supabase db push`). Cada archivo es completo y
   se corre de una vez. `0011` es la **auditoría**: si algo quedó mal protegido, aborta nombrando la regla (GR-xx); `0012` es el
   endurecimiento que dejó la revisión adversarial. Después de `0012` conviene volver a correr `0011` (es idempotente).
   Si Supabase pregunta por «operaciones destructivas» es el aviso genérico por los `REVOKE`/`ALTER`; en un proyecto vacío es seguro.
3. **Correr `opcional/prueba-de-humo.sql`** completo. Simula a las tres áreas y siempre se deshace; el «error» final
   `HUMO_RESULTADO {"fallos":0,…}` es el resultado esperado (verde = `fallos` en 0).
4. **Auth → Sign In / Providers → Google**: habilitar con el Client ID público de la app (`js/nucleo/ingreso.js`); el flujo de
   «ID token» no pide secreto. **Auth → URL Configuration**: Site URL y las redirecciones de GitHub Pages y pages.dev.
5. **Dar de alta a la primera persona de Dirección**, a mano en el Editor SQL (a propósito no viene sembrada: un repositorio
   público no debe llevar correos). Una sola vez por proyecto, con el correo en minúsculas:
   ```sql
   insert into public.miembros (empresa_id, correo, area, estado) values ('al3d', 'correo@ejemplo.com', 'direccion', 'invitado');
   ```
   Al entrar con Google y reclamar el acceso (`reclamar_acceso`) queda vinculada a su cuenta. Las demás personas las da de alta
   Dirección desde la plataforma con `miembro_alta`; quien entra con una cuenta que no está en `miembros` ve `sin_acceso` y nada más.

En `al3d-pruebas` los pasos 1 a 4 ya están hechos (2026-10-10).

## Secretos: qué es cada uno, dónde vive y quién lo carga

Ninguno va al repositorio, a la hoja ni al chat (regla del plan §4.12). Aquí solo van los **nombres**.

| Secreto | Dónde vive | Quién lo carga | Para qué |
|---|---|---|---|
| `SELLO_AUTORIZACION` | Secretos de las funciones de Supabase | **Elías**, desde el Apps Script actual. **No se rota** (cambiarla invalida todos los PDF ya entregados); guardar una copia fuera de línea | Firmar y verificar los sellos de autorización |
| `IA_KEYS` (JSON con las llaves de Qwen, DeepSeek y Gemini) | Secretos de las funciones | **Elías** | La función `ia` (las llaves salen del navegador) |
| `ESPEJO_SECRETO_FUNCION`, `ESPEJO_URL`, `ESPEJO_SECRETO`, `ESPEJO_EMPRESA` (opcional) | Secretos de las funciones | **Elías** | La función `espejo`; `ESPEJO_SECRETO` es el mismo valor que la propiedad del Apps Script (ver [`puente/ESPEJO.md`](../puente/ESPEJO.md)) |
| Contraseña de la base de datos | Gestor de contraseñas de Elías | **Elías** | Acceso directo a PostgreSQL (`supabase link` / `db push`) |
| Llave secreta (`sb_secret_…`) | La inyecta Supabase a las funciones; nunca fuera de ahí | Supabase | Que las funciones lean con privilegios de servicio |
| Llave pública (`sb_publishable_…`) y URL del proyecto | En el código de la app y en la variable `SUPABASE_PROYECTOS` de GitHub | Cualquiera | Es pública por diseño; la protege RLS |

Un secreto propio **no puede** empezar con `SUPABASE_` (nombres reservados de la plataforma). Para cargar los secretos:
`supabase secrets set --env-file <archivo temporal fuera del repositorio>` o el panel; nunca escritos en la línea de comandos.

## Cómo se prueba

```sh
sh supabase/tests/correr.sh          # la base: migraciones, RLS, reglas de negocio (PGlite)
sh pruebas/correr.sh                 # las pruebas de node del repositorio, incluidas las de las funciones
```

PGlite valida el SQL y las políticas pero **no es Supabase** (límites en [`tests/README.md`](tests/README.md)): por eso existe
`opcional/prueba-de-humo.sql`, que se corre en el proyecto real. Las pruebas de las funciones bajo Deno se corren si hay `deno`
en el PATH (o con `AL3D_DENO=<ruta>`) y se saltan con aviso si no.
