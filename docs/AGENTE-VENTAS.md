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
4. **El portal del cliente** — un link por proyecto: la cotización, aceptar, la cuenta de
   depósito (fija, nunca escrita por la IA), subir el comprobante y los archivos, y ver en qué
   etapa va. Pendiente.
5. **«Necesita tu decisión» en el teléfono de Elías** — cada ficha que el agente no puede
   cobrar llega con su razón y se aprueba en un toque. Ya existe el lugar en el Tablero.
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

