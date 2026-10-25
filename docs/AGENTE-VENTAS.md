# El agente de ventas

Elías entra a trabajar a un despacho fiscal en enero de 2027 y AL3D tiene que seguir cotizando
sin él encima: atender al cliente, cotizar, dar seguimiento, compartir la cuenta de depósito y
juntar los archivos que necesita el taller. Este documento dice cómo se arma y en qué orden.

## La idea en una frase

**El cerebro vive en la plataforma de AL3D; WhatsApp es solo una puerta.** El agente, las
reglas de precio, los pagos y los archivos están en Supabase y en este repositorio. Si Meta
bloquea un número, se cierra esa puerta y no se pierde nada: el agente se conecta a otra.

## Decisiones de Elías (24-oct-2026)

| Tema | Decisión |
|---|---|
| Meta | Nada con el portafolio viejo. El número nuevo con API de WhatsApp va **al final**, en el portafolio «Anuncios Luminosos 3D» (está limpio). Ya hay chip. |
| Precio | El agente cotiza solo **si no lleva logotipo**. Logos, símbolos y medidas dudosas pasan por Elías. |
| Archivos para corte | Los prepara Elías, **después del anticipo**. Cotizar no espera al archivo: el número de letras sale del texto y la altura la da el cliente. |
| Las preguntas del agente | Salen de sus chats ganadores (lista «LIQUIDADO» en WhatsApp Business, 75 chats) y de las 76 órdenes de fabricación. |

## Las piezas

1. **La ficha de obra** — `supabase/functions/_shared/ficha.js` (hecha, con
   `pruebas/ficha-agente.mjs`). Qué se pregunta en cada etapa (cotizar, fabricar, instalar),
   qué decide Dirección y con qué razón, el precio con `precio.js` y las notas de la orden que
   hoy se escriben a mano. El agente no se «acuerda» de preguntar: la ficha se lo exige.
2. **Las tablas** — `supabase/migrations/0023_agente.sql` (hecha, con
   `supabase/tests/agente/agente.mjs`; sin aplicar): conversaciones, mensajes que no se borran,
   la cola «Necesita tu decisión» y los topes de gasto de IA.
3. **La función `agente`** — `supabase/functions/agente` (hecha, con `pruebas/agente-logica.mjs`;
   sin desplegar). Por cada mensaje: la IA saca los datos, la ficha decide qué sigue, la IA
   redacta y el código pone el precio y la cuenta (y le borra a la IA cualquier cantidad de
   dinero). Usa las llaves de IA que ya existen (IA_KEYS): Gemini, luego Qwen, luego DeepSeek.
   Para publicarla faltan: aplicar 0023, pegarla en el panel y cargar `AGENTE_CUENTA` (banco,
   titular y CLABE, en texto) como secreto de la función.
4. **El portal del cliente** — `cotiza.html` + `js/cotiza.js` (hecho, con `pruebas/cotiza.mjs`;
   probado en el navegador con un agente de mentiras). La plática con el agente, sin cuenta: el
   secreto se queda en el teléfono del cliente y, para seguir en otro, va después del «#» del link.
   Mientras espera a Dirección pregunta cada minuto, así la nota de Elías le llega sola.
   Pendiente para después: subir el comprobante y los archivos, y ver en qué etapa va la obra.
5. **«Necesita tu decisión» en el teléfono de Elías** — en el Tablero (hecho; probado en el
   navegador con una nube de mentiras). Solo con la nube encendida en el aparato y para Dirección:
   «El agente de ventas te pregunta», y al tocarlo el panel con el resumen, la razón, la plática,
   el precio y la nota. «Mandar al cliente» (con precio aprueba; solo con nota, corrige) y «No lo
   hacemos» (pide confirmar). Con la nube apagada el Tablero queda idéntico.
6. **Seguimiento** — la lista diaria con el mensaje escrito; con el número nuevo, el agente lo
   manda solo.
7. **El número nuevo con API de WhatsApp** — al final.

## Lo que la ficha supone y falta confirmar con Elías

- **Instalación incluida hasta 4 m** (`ALTURA_INSTALACION_INCLUIDA_M`). Las órdenes dicen 4, 5
  y 6 m; se tomó la más baja para que lo dudoso le llegue a él.
- **Zona metropolitana** (`MUNICIPIOS_ZMG`): Guadalajara, Zapopan, Tlaquepaque, Tonalá,
  Tlajomulco y El Salto. Afuera, el traslado lo decide Dirección.
- **Texto chico**: abajo de 10 cm va en recorte plano, sin volumen ni luz (la misma regla del
  cotizador).
- **La cuenta de depósito**: no hay ninguna dada de alta en el sistema.

## Para publicarlo (en este orden, con el OK de Elías)

1. Aplicar `0023_agente.sql` en `al3d-pruebas` y luego en `al3d-produccion` (la auditoría del final
   tiene que pasar). Lleva también las listas de seguridad al día en `0011`, `0019` y `0022`.
2. Volver a pegar las funciones `respaldo` e `importar-diario` (las dos respaldan ahora 24
   tablas): **solo después** de aplicar `0023`, porque antes fallarían al no encontrar las tres
   del agente.
3. Pegar la función `agente` en el panel (Verify JWT apagado) y cargarle `AGENTE_CUENTA`.
4. Probarla con un link de prueba antes de dárselo a un cliente.


## Lo que salió de los 61 chats ganadores (25-oct-2026)

Elías exportó sus chats con clientes liquidados y con el equipo. Se analizaron en su computadora
(no se suben a ningún lado). Lo que se aplicó al agente:

- **El saludo es el suyo**, con una diferencia: él dice «Soy Elías» y el agente dice que es su
  asistente. Pide nombre y empresa, invita a contar el proyecto y deja el Instagram.
- **El orden de las preguntas es el suyo** (`ORDEN` en `ficha.js`): nombre y empresa → qué
  quiere y medidas → para cuándo → logo → **factura** (en 49 de 61 chats, y temprano: cambia el
  IVA y la cuenta) → dónde va → material, color y luz.
- **Dos cuentas, según factura**, con las tarjetas autorizadas («Sin factura» y «Con factura»).
  El portal las pinta con el mismo diseño. Los datos son dos secretos de la función que pega
  Elías (el repositorio es público):
  - `AGENTE_CUENTA_SIN_FACTURA` = `{"banco":"…","beneficiario":"…","tarjeta":"…"}`
  - `AGENTE_CUENTA_CON_FACTURA` = `{"banco":"…","beneficiario":"…","cta":"…","clabe":"…","rfc":"…"}`
- **Lo que el equipo siempre pregunta para fabricar**: el color exacto (mate o brillante, dorado o
  plata) y, si lleva factura, la constancia fiscal (CIF).
- **Lo que el agente puede decir** (`HECHOS`): el taller con su liga de Maps, el Instagram, el
  WhatsApp de los comprobantes, el anticipo y la vigencia, que el diseño se aprueba antes de
  fabricar y dos supuestos que Elías tiene que confirmar: **de 1 a 3 semanas** después del
  anticipo y **la instalación incluida** en la zona metropolitana hasta 4 m.

Tiempos medidos en esos chats (mediana desde el primer mensaje): cotización día 1, cuenta día 8,
anticipo día 13, instalación y liquidación día 34. Sirven para los seguimientos.

**Regla de Elías (25-oct-2026): del saludo a la cotización, el mismo día.** En sus chats la
cotización salía al día siguiente (mediana); la meta es que salga el mismo día. Por eso el agente
pregunta todo en la misma plática y, cuando algo va a Dirección, le dice al cliente «hoy mismo te
mando tu cotización». En el Tablero, lo que llegó otro día y sigue esperando sale en rojo:
«Cotización del agente que no salió el mismo día».
