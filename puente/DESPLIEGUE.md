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

Desde `puente-sheets-6` hay dos secretos más, en el mismo lugar y por la misma razón:

| Propiedad | Qué es | Cómo se crea |
|---|---|---|
| `SELLO_AUTORIZACION` | La clave con la que la hoja firma cada precio autorizado | Sola, la primera vez que alguien autoriza, o con **⚡ AL3D → Preparar las autorizaciones selladas** |
| `IA_KEYS` | Las llaves de Qwen, DeepSeek y Gemini | **⚡ AL3D → Llaves de IA** |

**El secreto del sello no se rota nunca.** Cambiarlo hace que TODOS los PDF ya entregados
verifiquen como «no auténtica». Por eso ningún botón lo regenera; si de verdad se filtrara,
se borra la propiedad a mano sabiendo lo que cuesta.

Para retirar una autorización ya entregada —se canceló el trabajo, se equivocó el precio—,
desde el editor: `revocarAutorizacion('COT-0042@K7QM')`. El renglón se queda en
«Autorizaciones» y el QR de ese PDF pasa a decir «revocada».

## Cuando cambies el código

Guardar **no** publica. Hay que ir a **Implementar → Gestionar implementaciones → lápiz →
Versión: Versión nueva → Implementar**. La URL no cambia: los teléfonos no se tocan.

Y si tocas el `.gs` en el repo, acuérdate de que la copia que manda es la de la hoja: hay
que pegarlo allá. `pruebas/puente.mjs` compara los dos lados y falla si los vocabularios se
separan; la plataforma, al «Probar», compara la versión que contesta la hoja con la que ella
espera y avisa si quedó vieja.

**Al pasar a `puente-sheets-4`** (septiembre de 2026) hace falta que exista la columna
**AD «Porcentaje comision»**, y no es opcional: `ULTIMA_COL` pasó a 30, así que `/jalar` pide
treinta columnas y **truena** si la hoja tiene veintinueve. La crea
`prepararHojaParaElPuente()`, que corre al final de **⚡ AL3D → Actualizar formato y vistas**
(`mejorarTodo`). Si no quieres reescribir el diseño entero solo por una columna, basta con
escribir el encabezado a mano en `AD1`: eso es lo que el puente busca.

Lo que **no** cambia es la fórmula de la comisión. En AL3D la comisión es fija —10 % del
subtotal, sin IVA— y `R` se queda así. La columna AD viaja por el puente para que el teléfono
y la hoja guarden el mismo dato, pero la hoja no la lee.

**Cuidado con el selector de funciones del editor.** Tiene 97 nombres y
`prepararHojaParaElPuente` está a dos renglones de `mejorarTodo`. Peor: el selector revierte
la elección si cierras la lista con Esc o Enter, así que es fácil creer que elegiste una y
ejecutar otra. Si vas a correr algo desde ahí, confírmalo en **Ejecuciones** —dice qué función
corrió de verdad— antes de dar por hecho que pasó.

Estado al 19 de septiembre de 2026: la hoja corre `puente-sheets-4`, implementada como
**Versión 5**, en la misma URL de siempre.

### Al pasar a `puente-sheets-6` (el notario y la IA) — el orden importa

Desde esta versión **el cotizador ya no autoriza un precio sin que la hoja lo selle**, y la IA
ya no tiene llaves en los teléfonos. Si la app nueva se publica antes que el puente nuevo,
nadie puede autorizar y la IA no contesta. Así que, en este orden:

1. Pega el `puente/hoja-apps-script.gs` de hoy en la hoja y guarda.
2. **Implementar → Gestionar implementaciones → lápiz → Versión nueva → Implementar.** La URL
   no cambia.
3. Recarga la hoja para que salga el menú nuevo y corre **⚡ AL3D → Preparar las
   autorizaciones selladas**. Crea la pestaña oculta «Autorizaciones», la visible
   «Solicitudes de autorización» y el secreto del sello. Apps Script va a pedir permiso una
   vez más: ahora el puente sale a internet para hablar con la IA.
4. **⚡ AL3D → Llaves de IA**: pega la llave de Qwen, la de DeepSeek y la de Gemini (las que
   estaban en el cotizador; ahí ya no se ven). Hasta cuatro por proveedor, una por renglón.
5. En la pestaña **Accesos**, confirma que quien autoriza precios está como `direccion`, y que
   quien cotiza sin autorizar está como `pagos` o `fabricacion`: esos solicitan y Dirección
   autoriza desde su teléfono.
6. Solo entonces se publica la app (merge a `main` con `APP_VERSION` subido).

Para comprobarlo: en **Ajustes → El puente → Probar** tiene que decir `puente-sheets-6`, y en
el cotizador, **Cotizar con IA → Proveedores de IA** tiene que marcar «listo» en los que
tengan llave.

## Las cabeceras del sitio

En la raíz del repo hay un `_headers`, que Cloudflare Pages lee y GitHub Pages ignora.
Pages publica el repositorio entero, así que `docs/`, `pruebas/`, `puente/` y
`herramientas/` también se sirven: no son secretos —el repo es público—, pero ese archivo
les pone `X-Robots-Tag: noindex` para que un buscador no los enseñe antes que la app, y le
pone a todo `X-Content-Type-Options: nosniff`.

**Ojo con esto ahora que el `.gs` vive en el repo:** no contiene ningún secreto (los tokens
están en las propiedades del script), pero sí describe el esquema completo de la hoja. Si
eso te incomoda, el repo tendría que volverse privado; no se arregla con `_headers`.
