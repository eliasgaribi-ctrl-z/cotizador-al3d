# Mantener despierto el proyecto de Supabase (plan gratuito)

El flujo ya existe y está probado: [`.github/workflows/mantener-activo.yml`](../../.github/workflows/mantener-activo.yml).
Este archivo solo explica el porqué y cómo se configura; no hay que instalar nada más.

## Por qué hace falta

El plan gratuito **pausa el proyecto tras una semana sin actividad** y no trae respaldos automáticos
(verificado en supabase.com/pricing el 2026-10-10). Un proyecto pausado es una plataforma que no abre y unas
autorizaciones que no se pueden verificar con el PDF en la mano. Un aviso semanal no deja margen, así que el flujo
llama **cada 2 días**.

## Qué llama, y por qué eso

Comprobado contra el proyecto real de pruebas el 2026-10-10: `/rest/v1/` a secas **ya no sirve** (el sistema nuevo de
llaves lo reserva a la llave secreta y contesta 401). Sí contestan con la llave pública: la salud de Auth
(`/auth/v1/health`, 200) y una consulta a una tabla (`/rest/v1/empresas?select=id&limit=1`), que llega hasta la base
(200, 401 o 403 según los permisos; lo que importa es que no sea un error 5xx ni un proyecto pausado). Si el proyecto
ya está pausado el flujo se pone en **rojo** y GitHub avisa por correo.

NO se verificó (no hay forma de verlo desde fuera) que Supabase cuente esas llamadas como «actividad» para la pausa.
Es la práctica común y lo más cercano a trabajo real que se puede hacer sin una llave secreta; cuando exista la función
`salud` desplegada, `salud?db=1` hace una lectura con la llave de servicio dentro de la función y es la opción más
fuerte. Si el proyecto se pausara a pesar del flujo, el aviso en rojo lo dice y se reactiva desde el panel.

## Cómo se configura

Una sola vez, en el repositorio: *Settings → Secrets and variables → Actions → Variables*:

| Variable | Valor |
|---|---|
| `SUPABASE_PROYECTOS` | una línea por proyecto: `<URL del proyecto> <llave pública sb_publishable_…>` |

La llave pública es pública por diseño (la protege RLS), por eso va en una **variable** y no en un secreto. La llave
secreta (`service_role`, `sb_secret_…`) **nunca** entra aquí. Con `gh`:

```sh
gh variable set SUPABASE_PROYECTOS --body "https://<ref>.supabase.co sb_publishable_…"
```

Al crear el proyecto de producción, se agrega una segunda línea (con el valor completo en una sola llamada, porque
`gh variable set` reemplaza la variable entera). GitHub solo ejecuta los flujos programados del archivo que está en la
rama principal.
