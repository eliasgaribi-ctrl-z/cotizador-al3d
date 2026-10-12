# Prompt para una revisión independiente del PR de Supabase

Para abrir en **otra sesión** (por ejemplo con Opus 5.5), con ojos frescos: el PR lo escribió un modelo con varios agentes en
paralelo y se verificó en parte; esta revisión busca lo que se le escapó. Pegar tal cual, desde el bloque de abajo.

```text
Eres un revisor independiente (segunda opinión) de un PR grande y de alto riesgo. Contexto: AL3D es un negocio de anuncios
luminosos en Guadalajara. Su sistema (app web estática en GitHub Pages + un Apps Script sobre una hoja de Google) se está
migrando a Supabase. El PR #100 (rama claude/supabase-fase-0-1, repo eliasgaribi-ctrl-z/cotizador-al3d) es la primera
entrega: 11 migraciones SQL, pruebas con PGlite, funciones del servidor (Deno), una ruta nueva `espejo` en el Apps Script y
documentación. TODO está APAGADO por diseño (la hoja sigue siendo la fuente de verdad). Lo escribió otro modelo con agentes en
paralelo y se verificó en parte: necesito que encuentres lo que se le escapó.

PREPARACIÓN
- `gh pr checkout 100` (o `git fetch && git checkout claude/supabase-fase-0-1`).
- Lee primero: docs/ESTADO-SUPABASE.md (qué se verificó y qué NO), docs/DECISIONES-SUPABASE.md, supabase/DISENO.md (§0, §4
  seguridad, §5 funciones, §11 riesgos) y docs/supabase/mapas/00-critico.md (los huecos que ya se conocían).
- Corre: `sh supabase/tests/correr.sh` (la primera vez hace `npm ci` dentro de supabase/tests; ~4 min), `sh pruebas/correr.sh`
  (~4.5 min) y `node pruebas/supabase-sello.mjs pruebas/supabase-espejo.mjs pruebas/supabase-funciones.mjs` uno por uno.
- No hay Docker ni CLI de Supabase: el SQL se prueba con PGlite (PostgreSQL 18 en WASM) y un arnés (supabase/tests/README.md).

REGLAS
- NO modifiques la rama del PR ni nada en producción. No pidas ni uses secretos. No toques la hoja ni el Apps Script reales.
  Tus scripts de ataque y copias mutadas van FUERA del repo. Si propones arreglos, como parche en texto dentro del informe.
- No des por cierto lo que dicen comentarios, documentos o el cuerpo del PR: verifica ejecutando.
- Otra revisión de seguridad del SQL corre en paralelo en la sesión original: no la repitas a ciegas; busca por estos ángulos.

QUÉ REVISAR (de más a menos riesgo)
1. Regla central: Fabricación NO puede ver NINGÚN dinero por NINGUNA vía (tablas, vistas, funciones, columnas jsonb como
   origen_obra/procedencia/bitácora/cotizaciones, mensajes de error, Realtime, planes de consulta). Intenta romperla con consultas
   reales en el arnés (`como(db, {...})`), no leyendo el diseño.
2. Acceso por correo: invitación sin usuario, `reclamar_acceso` con correo verificado, bajas, cambio de área, usuarios anónimos,
   dos empresas, correos con mayúsculas/puntos/espacios, claims manipulados. ¿Cómo entra la primera persona de Dirección?
3. Cambio que SÍ llega a producción cuando se pegue: `git diff origin/main -- puente/hoja-apps-script.gs` (+817 líneas, ruta
   `espejo` y parche de `expandirLiga_`). Con MODO_ESPEJO apagado nada debe cambiar: busca regresiones, efectos en `alEditar`,
   `normalizarIvaActivos`, `ordenarVentas`, límites de Apps Script (6 min, LockService, cuotas) y si el parche del SSRF rechaza
   algún enlace legítimo de Google Maps o deja otra evasión.
4. Sello de los PDF ya impresos (supabase/functions/_shared/sello.js): se comprobó en Apps Script real que la firma HMAC de
   2 argumentos codifica ASCII con «?» por cada punto de código no ASCII (pruebas/datos/hmac-apps-script-real.json). Cuestiona los
   bordes: claves de más de 64 bytes, sustitutos sueltos, U+0000, texto ya escapado por JSON.stringify, y si la codificación
   guardada por fila (`autorizaciones.codificacion`) puede dejar pasar un sello alterado.
5. Fórmulas al centavo (migrations/0004_formulas.sql vs puente/hoja-apps-script.gs:170-210): redondeo, vacíos, IVA por cuenta,
   comisión fija del 10 % sobre el subtotal, antigüedad, «revisar». Compuerta de sellos por campo (interno.compuerta vs
   .gs:2881-2929 y js/datos/puente.js obraDeLaFila) y etapa por rol.
6. Pruebas que pasan por la razón equivocada: rompe a propósito 15 defensas en una COPIA de las migraciones (política,
   GRANT, search_path, chequeo de rol, compuerta) y mira si alguna prueba falla.
7. Honestidad: ¿alguna afirmación de docs/ESTADO-SUPABASE.md o del cuerpo del PR no está respaldada por lo que ejecutaste?
8. Flujos de GitHub (.github/workflows), .gitignore, _headers: ¿algo expone datos o falla en Linux?

ENTREGA: un informe con (a) veredicto: listo para fusionar / con cambios / no; (b) hallazgos por severidad (crítica, alta,
media, baja), cada uno con evidencia reproducible (comando y salida) y arreglo sugerido; (c) lo que verificaste y salió bien;
(d) lo que NO pudiste verificar. Sin relleno: si una categoría salió limpia, dilo en una línea.
```

Si quieres que esa sesión también compruebe algo contra el proyecto real de pruebas (`al3d-pruebas`), lo único autorizado es
ejecutar `supabase/opcional/prueba-de-humo.sql` en su Editor SQL (siempre se deshace sola); nada de datos ni secretos.
