# Cómo se despliega el puente — ya no se pega a mano

El runbook de `README.md` decía «se pega en el editor de Cloudflare». Eso sigue
funcionando, pero ya no es el camino: el Worker está conectado a este repo.

## Lo que hay montado

| Qué | Dónde |
|---|---|
| El sitio | Cloudflare Pages, proyecto `cotizador-al3d` → `https://cotizador-al3d.pages.dev` |
| El puente | Cloudflare Worker `puente-al3d` → `https://puente-al3d.eliasgaribi.workers.dev` |
| La configuración del puente | `puente/wrangler.jsonc` (este directorio) |

Los dos se redespliegan solos con cada push a `main`. El Worker solo se rehace
cuando el cambio toca `puente/*`, así que trabajar en el cotizador no gasta builds.

## Qué vive en el repo y qué no

En el repo, en `wrangler.jsonc`, y por lo tanto versionado:

- `DS_VENTAS` — la base de ventas en Notion.
- `ORIGENES` — los dominios que el puente acepta. **Si publicas el sitio en otro
  dominio, agrégalo aquí**, separado por comas y sin barra final, o el navegador
  lo rechaza por CORS y el mensaje no dice por qué.

Fuera del repo, en Cloudflare → Worker `puente-al3d` → *Settings* →
*Variables and Secrets*, tipo **Secret**:

- `NOTION_TOKEN` — el token de la integración de Notion.
- `TOKENS` — el JSON de los tres tokens de dispositivo.

`npx wrangler deploy` respeta los secrets: no los borra ni los pisa. Lo que sí
pisa en cada deploy son las variables públicas, y es a propósito — el repo es la
verdad de `ORIGENES`, no el dashboard.

## Si algo sale mal

El build vive en Cloudflare → Workers & Pages → `puente-al3d` → *Deployments*.
Ahí está el log completo. Un deploy que falla no tira el que está corriendo: el
puente anterior sigue en pie hasta que uno nuevo entra bien.

El runbook de fallas en tiempo de uso —los 401, los 403, el esquema de Notion—
sigue siendo el de `README.md`. Este archivo solo cubre cómo llega el código.
