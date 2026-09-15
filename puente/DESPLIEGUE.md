# Cómo se monta el puente

Diez minutos, una vez. Ya no hay cuenta de Cloudflare, ni `wrangler`, ni secretos que
guardar fuera del repo: el puente vive dentro de la hoja.

## Lo que hay montado

| Qué | Dónde |
|---|---|
| El sitio | GitHub Pages, desde `main` |
| El puente | Apps Script de la hoja **«Finanzas AL3D — Ventas y Comisiones»**, publicado como aplicación web |
| El código del puente | `puente/hoja-apps-script.gs` (este directorio), versionado para poder compararlo |

El sitio se sigue redesplegando solo con cada push. **El puente no**: es código de Apps
Script y se publica desde su editor.

## Los pasos

1. Abre la hoja → **Extensiones → Apps Script**.
2. Pega el contenido de `puente/hoja-apps-script.gs` en `Código.gs` y guarda.
3. **Implementar → Nueva implementación → Aplicación web**, con:
   - *Ejecutar como*: **Yo**. Es lo que le da acceso a la hoja sin pedirle nada a nadie.
   - *Quién tiene acceso*: **Cualquier usuario**. Si queda en *Solo yo*, el teléfono recibe
     la pantalla de inicio de sesión de Google en vez de JSON, y «Probar» lo dice.
4. Copia la **URL** que termina en `/exec`.
5. En la hoja: **⚡ AL3D → Tokens del puente**. Ahí están la liga y los tres tokens, uno por
   rol. Se generan solos la primera vez.
6. En cada teléfono: **Ajustes → El puente**, pega la liga y el token que le toca a ese
   departamento. Dale **Probar**.

## Dónde viven los secretos

Los tres tokens de dispositivo se guardan en las **propiedades del script**
(`PropertiesService`), no en el código, para que no acaben en el historial del repositorio.
Se generan con `Utilities.getUuid()` y se rotan desde la misma pantalla con
*Generar tokens nuevos* — ojo, eso deja fuera a los tres teléfonos hasta que pegues los
nuevos.

No hay nada más que esconder. El token de Notion, que era la razón de ser del Worker, ya no
existe.

## Cuando cambies el código

Guardar **no** publica. Hay que ir a **Implementar → Gestionar implementaciones → lápiz →
Versión: Versión nueva → Implementar**. La URL no cambia: los teléfonos no se tocan.

Y si tocas el `.gs` en el repo, acuérdate de que la copia que manda es la de la hoja: hay
que pegarlo allá. `pruebas/puente.mjs` compara los dos lados y falla si los vocabularios se
separan; la plataforma, al «Probar», compara la versión que contesta la hoja con la que ella
espera y avisa si quedó vieja.

**Al pasar a `puente-sheets-4`** (septiembre de 2026), además de pegar e implementar hay que
correr una vez **⚡ AL3D → Actualizar formato y vistas** (`mejorarTodo`): crea la columna
**AD «Porcentaje comision»** y cambia la fórmula de la comisión para leerla. Las filas que ya
estaban no cambian: con la celda vacía la fórmula sigue dando el 10 %. Correrlo dos veces ya no
rompe nada —la guardia que insertaba una columna de más en la segunda corrida está corregida—.

## Las cabeceras del sitio

En la raíz del repo hay un `_headers`, que Cloudflare Pages lee y GitHub Pages ignora.
Pages publica el repositorio entero, así que `docs/`, `pruebas/`, `puente/` y
`herramientas/` también se sirven: no son secretos —el repo es público—, pero ese archivo
les pone `X-Robots-Tag: noindex` para que un buscador no los enseñe antes que la app, y le
pone a todo `X-Content-Type-Options: nosniff`.

**Ojo con esto ahora que el `.gs` vive en el repo:** no contiene ningún secreto (los tokens
están en las propiedades del script), pero sí describe el esquema completo de la hoja. Si
eso te incomoda, el repo tendría que volverse privado; no se arregla con `_headers`.
