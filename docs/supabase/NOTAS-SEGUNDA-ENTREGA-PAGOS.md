# Pantallas de Pagos en Supabase — notas de la segunda entrega

**Rama `claude/supabase-pantallas-pagos`, 2026-10-16.** Elías no estaba: cada decisión de abajo es la más
conservadora que encontré y es reversible. Están numeradas para que se puedan confirmar o cambiar una por una.
Este documento no reemplaza a [`ESTADO-SUPABASE.md`](../ESTADO-SUPABASE.md) (que no se tocó en esta rama): cuando
se fusione, ahí hay que pasar el renglón «Pantallas de Pagos» de *pendiente* a *hecho, apagado*.

## Qué hay

| Pieza | Archivo | Qué hace |
|---|---|---|
| Capa pura | `js/datos/pagos-supa.js` | Lee montos, arma cada llamada (función + argumentos + texto de la confirmación), clasifica la respuesta (segura o incierta) y la dice en palabras. Recibe el cliente de supabase-js como argumento. Sin DOM ni almacenamiento. |
| Pantalla | `js/mod/pagos-supa.js` | La pestaña «Registrar (Supabase)» de Control: cuatro formularios (cobro o anticipo, abono de comisión, repartir un depósito, corregir). |
| Control | `js/mod/control.js` | Una quinta pestaña **solo** con el interruptor de Supabase encendido en el aparato. |
| Estilos | `css/plataforma.css` (bloque «Control · Registrar (Supabase)») | Errores en rojo como «Datos para la entrega», tabla del reparto con desplazamiento propio. |
| Pruebas | `pruebas/pagos-supa.mjs` | 119 comprobaciones con un doble de supabase-js. |
| Caché | `sw.js` 116 | Los dos módulos nuevos en `APP_FILES` (47 módulos ES, 120 archivos en el conjunto). |

**No hay SQL nuevo**: las funciones de `0007`/`0012` alcanzan, y las ventas se leen de la vista
`ventas_calculadas`, que ya existe y que a Fabricación no le da filas. No se creó `0016_pagos_interfaz.sql`.

## Qué llama cada formulario

| Formulario | Función de la base | op_id | Notas |
|---|---|---|---|
| Cobro (se suma) | `registrar_cobro(p_proyecto, p_monto, p_fecha, p_liquidar, p_op_id)` | sí | `p_liquidar` se manda **siempre explícito** (ver D-3) |
| Anticipo (total) | `corregir_venta(p_proyecto, {anticipo})` | no hace falta | valor absoluto: repetirlo deja lo mismo |
| Abono de comisión | `registrar_abono_comision(p_proyecto, p_monto, p_fecha, p_nota, p_op_id)` | sí | |
| Repartir un depósito | `vista_previa_reparto(p_monto)` y luego `repartir_abono_fifo(p_monto, p_fecha, p_nota, p_op_id)` | sí | solo se reparte sobre una vista previa del mismo monto |
| Corregir un abono | `corregir_abono(p_proyecto, p_monto, p_nota, p_fecha, p_op_id)` | sí | solo Dirección; nota obligatoria; renglón nuevo |
| Corregir la liquidación | `corregir_venta(p_proyecto, {liquidacion})` | no hace falta | valor absoluto; la base guarda el anterior en la bitácora |

## Decisiones (para confirmar)

- **D-1. Dónde vive.** Una pestaña de Control y no una pantalla nueva: Control ya es la pantalla de Pagos y
  Dirección, Fabricación no la tiene, y una ruta nueva le habría agregado un sexto botón a la barra de Pagos
  (`app.js` reparte cinco). Apagado, Control pinta sus cuatro pestañas de siempre y `pagos-supa.js` no se
  descarga; una dirección vieja con `?tab=asientos` cae en «Resumen».
- **D-2. Ajustes no se tocó.** La tarjeta de Supabase sigue siendo solo de Dirección. Enseñársela a Pagos
  habría cambiado su pantalla de Ajustes con el interruptor apagado, que es justo lo que no se podía. Por eso
  la pestaña nueva trae su propio botón de Google (el mismo `botonDeGoogle` de `supa.js`) y su «Apagar
  Supabase en este aparato». **Consecuencia:** en un teléfono de Pagos el interruptor hoy se enciende a mano
  (consola: `localStorage.setItem('al3d_pf_supa', '{"encendido":true}')` y recargar). Si Elías quiere que
  Pagos lo encienda solo, el cambio es una línea en `cardSupabase()` y una en `pruebas/supabase-entrada.mjs`.
- **D-3. «Marcar como LIQUIDADA».** La base liquida por omisión (`p_liquidar` = true), porque así era el
  formulario de la hoja. En la pantalla la casilla nace marcada **solo si con ese cobro el saldo queda en
  ceros**, se puede cambiar, y siempre se manda explícita. Un abono parcial que marcara LIQUIDADO movería
  además la etapa a «instalado» (transición automática 2).
- **D-4. Anticipo = valor total, no suma.** No hay función de «sumar anticipo» con op_id; sumar del lado del
  teléfono con un saldo leído antes podría duplicar. Se usa `corregir_venta` con el anticipo completo: es
  idempotente y la confirmación dice «pasa de $X a $Y».
- **D-5. Qué se corrige.** Abonos de comisión (contra-asiento, solo Dirección, como dice la base) y la
  liquidación de una venta (valor absoluto, Pagos y Dirección). **Fuera por ahora:** subtotal, nombre,
  cuenta, estatus, porcentaje e IVA, que `corregir_venta` también acepta. Son correcciones de la venta, no
  de un movimiento de dinero, y conviene decidir con Elías quién las hace desde el teléfono.
- **D-6. Montos.** Pesos con hasta dos decimales; tres decimales se **rechazan** (no se redondean en
  silencio). Comas solo como separador de miles. Se cuentan en centavos enteros y viajan como el decimal
  exacto. Topes de la base antes de llamar: cobro y reparto `< $1,000,000,000.00` (0012), abono y corrección
  de abono `< $10,000,000.00` (0007). Sin NaN, Infinity ni notación científica.
- **D-7. Fechas.** Vacía es hoy (la pone la base con la hora de México). No se aceptan fechas futuras.
- **D-8. Notas.** Hasta 400 letras: `abonos.nota` admite 500 y el reparto le agrega «· Reparto P-### de $…».
- **D-9. op_id y doble envío.** Nace una vez por formulario (`pf-` + UUID) y se guarda con el borrador en
  `sessionStorage` (muere con la pestaña; no va en `localStorage` ni en los respaldos). Un error **seguro**
  (la base contestó con un código, una restricción o PostgREST rechazó la petición) deja el mismo op_id y dice
  «No se registró nada». Un error **incierto** (sin respuesta, 5xx sin código) **nunca** dice que no se
  registró: ofrece «Reintentar con los mismos datos» (mismo op_id: la base no suma dos veces) o «Empezar otro
  asiento» con advertencia. Cambiar los datos de un envío incierto pide confirmación y entonces sí nace otro
  op_id. El botón se apaga mientras va y hay un candado en memoria antes y después de la confirmación.
- **D-10. Lo escrito no se tira.** Cada tecla va al borrador; un repintado de Control (sincronización,
  cambio de pestaña) lo vuelve a pintar y devuelve el foco al campo donde estaba.
- **D-11. La pantalla avisa que escribe en la base de pruebas y no en la hoja.** Mientras la hoja sea la
  fuente de verdad (hasta la fase 4) lo que se registre aquí hay que registrarlo también allá. Nada de esta
  rama escribe en la hoja.
- **D-12. Fabricación.** Doble candado de pantalla: con el rol de este aparato en Fabricación la pestaña no
  existe ni pinta nada; con el área de la **base** en Fabricación no se piden ventas ni se pinta un importe
  (solo se pregunta `mi_acceso`). La base ya niega todo de su lado (`ROL_SIN_PERMISO` y RLS).

## Cómo se verificó

- `sh pruebas/correr.sh`: ver cifras en el mensaje del commit final / el reporte. `pruebas/pagos-supa.mjs`
  119 de 119.
- En el navegador local (servidor estático sobre el worktree, sin Supabase real):
  - apagado: Control con sus cuatro pestañas y ninguna petición a `supa.js`, `pagos-supa.js` ni `supabase.js`;
  - encendido sin sesión: la quinta pestaña con el aviso de pruebas, el botón de Google (dibujado por Google)
    y «Apagar»;
  - encendido con un doble de supabase-js en la página: formularios, confirmación con el texto correcto,
    envío sin señal → «Reintentar» → mismo op_id en las dos llamadas → éxito y op_id nuevo; el monto escrito
    sobrevive a cambiar de pestaña de Control; error junto al campo con `aria-invalid`; tabla del reparto;
    a 375 px sin desplazamiento horizontal de la página.

## Lo que NO se pudo verificar

- **Contra Supabase real (`al3d-pruebas`)**: no hubo sesión de Google aquí (no se teclean credenciales). Falta
  una corrida de Elías: entrar en la pestaña, registrar un cobro, un abono, un reparto y una corrección sobre
  ventas de prueba, y confirmar en la base y en la bitácora.
- **En iPhone / la PWA instalada**: el teclado decimal, el selector de fecha nativo y el botón de Google ahí.
- **Las pruebas de navegador** (`--navegador`) no corren en esta máquina Windows.
- Un hallazgo ajeno a esta rama: en un clon de Windows con `core.autocrlf=true`, `pruebas/supabase-funciones.mjs`
  falla dos comprobaciones de `supabase/config.toml` porque el archivo llega con CRLF. Ya fallaba en `main`
  antes de esta rama.

## Pendiente para encender esto de verdad

1. Elías confirma D-1 a D-12 (sobre todo D-2, D-3 y D-5).
2. Prueba contra `al3d-pruebas` con las tres áreas.
3. Fase 3: doble escritura (la hoja sigue mandando) y siete días de cuadre antes de pasar la hoja a solo lectura.
