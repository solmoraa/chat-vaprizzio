# Arquitectura de `chat-vaprizzio`

Este documento explica el diseño técnico del agente comercial sin reemplazar
las reglas operativas de `openclaw/workspace/AGENTS.md`.

## 1. Qué problema resuelve

El servicio recibe conversaciones de WhatsApp, Instagram, Messenger y la web,
mantiene un contexto independiente por canal y cliente, consulta catálogo y
precios, invoca al agente de OpenClaw y envía la respuesta por el canal
correcto. Cuando una persona interviene o una regla exige atención humana,
bloquea la respuesta automática y genera la alerta correspondiente.

La API REST agregada no reemplaza esos canales. Es una entrada administrativa
versionada para consultar recursos o registrar una intervención desde otro
sistema sin duplicar reglas de negocio.

## 2. Recorrido de un mensaje

1. **Entrada:** Meta entrega Instagram/Messenger en `/webhooks/meta`; el relay
   de WhatsApp usa `/webhooks/openclaw/inbound`; la web usa
   `/internal/piri/message`.
2. **Presentación:** `src/app.ts` valida firma, token, tamaño y estructura del
   mensaje, identifica `channel` y `customerId` y descarta ecos automáticos.
3. **Conversación:** `ConversationRepository` carga el estado desde SQLite con
   la clave lógica `(channel, customerId)`.
4. **Control humano:** `TakeoverService` decide si la IA puede responder. Un
   mensaje manual pasa el estado a `HUMAN_ACTIVE` durante dos horas.
5. **Debounce:** `MessageDebouncer` agrupa mensajes consecutivos para no
   contestar cada fragmento por separado.
6. **Agente:** `OpenClawClient` envía el texto al agente comercial usando una
   sesión separada por canal y cliente.
7. **Herramientas:** si el agente necesita datos, `AgentToolService` llama a
   servicios deterministas de catálogo, entrega, precios o takeover.
8. **Salida:** el adaptador del canal entrega la respuesta. Antes de enviarla
   se comprueba nuevamente que una persona no haya tomado la conversación
   mientras el agente estaba procesando.

## 3. Arquitectura por capas

### Presentación

- `src/app.ts`: webhooks y adaptadores HTTP de los canales existentes.
- `src/presentation/http/rest-router.ts`: recursos de la API REST `/api/v1`.

Esta capa conoce HTTP, cabeceras, firmas, JSON y códigos de estado. No decide
precios ni modifica directamente el criterio de takeover.

### Aplicación

- `src/application/catalog-use-cases.ts`: casos de uso de consulta de catálogo.
- `src/application/conversation-use-cases.ts`: consulta, intervención humana y
  reanudación de conversaciones.

Esta capa coordina operaciones. Puede ser llamada desde REST, un webhook o una
futura interfaz sin copiar reglas.

### Dominio y reglas

- `src/domain/types.ts`: tipos de conversación, producto, carrito y venta.
- `src/services/*`: reglas deterministas de catálogo, entrega, carrito,
  takeover, venta y agrupación de mensajes.
- `src/agent/tool-service.ts`: contrato seguro de herramientas disponibles para
  el agente.

### Infraestructura

- `src/database/conversation-repository.ts`: persistencia SQLite.
- `src/catalog/*`: lectura de fixtures o Google Sheets.
- `src/channels/*`: integración con los canales.
- `src/notifications/*`: alertas a Telegram.
- `src/agent/openclaw-client.ts`: comunicación con OpenClaw.
- `src/server.ts`: composición de dependencias y arranque del proceso.

La dependencia va desde presentación hacia aplicación y servicios; la
infraestructura implementa la persistencia y las conexiones externas. Los
webhooks se mantienen porque Meta y WhatsApp envían eventos; REST se usa para
recursos administrativos. Son mecanismos complementarios.

## 4. API REST

Todas las rutas usan `Authorization: Bearer <TOOL_API_TOKEN>`. En producción el
token debe tener al menos 32 caracteres. Si no está configurado, la API queda
deshabilitada con `503`.

| Método | Recurso | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/catalog` | Lista catálogo y precios. |
| `GET` | `/api/v1/catalog?model=...&flavor=...` | Filtra por modelo y/o sabor. |
| `GET` | `/api/v1/conversations/{channel}/{customerId}` | Lee una conversación sin crearla ni cambiar su actividad. |
| `POST` | `/api/v1/conversations/{channel}/{customerId}/human-messages` | Registra un mensaje humano y pausa la IA. |
| `POST` | `/api/v1/conversations/{channel}/{customerId}/resume` | Reanuda explícitamente la IA. |

Ejemplo:

```bash
curl -H "Authorization: Bearer $TOOL_API_TOKEN" \
  "http://127.0.0.1:3100/api/v1/catalog?model=Elfbar%20Ice%20King"
```

Los `POST` validan JSON y tienen límites de tamaño. La API reutiliza
`CatalogUseCases`, `ConversationUseCases` y `TakeoverService`; no implementa
una segunda versión de las reglas.

## 5. SQLite y tablas

La ruta se configura con `DATABASE_PATH`. En TEST el valor predeterminado es
`./data/vaprizzio-test.sqlite`. SQLite es un archivo binario real del servidor;
el esquema se crea desde `ConversationRepository` al iniciar.

### Tabla `conversations`

| Campo | Función |
| --- | --- |
| `id` | Clave primaria compuesta en texto: `channel:customerId`. |
| `channel` | `whatsapp`, `instagram`, `messenger` o `web`. |
| `customer_id` | Identificador que asigna el canal; no une identidades entre plataformas. |
| `state` | `AI_ACTIVE`, `WAITING_HUMAN` o `HUMAN_ACTIVE`. |
| `current_product` | Producto contextual de una conversación; se limpia al vencer la sesión. |
| `current_flavor` | Sabor contextual; se conserva por compatibilidad del modelo conversacional. |
| `cart` | JSON con elementos `{sku, quantity}` usados por `CartService` y `SalesService`. |
| `negotiated_quantity` | Cantidad de una negociación; soporte compatible con reglas anteriores. |
| `negotiated_price` | JSON con cantidad, precio unitario, condiciones y fecha. |
| `customer_city` | Ciudad contextual; hoy no decide el costo final y queda disponible para entrega. |
| `last_messages` | JSON con mensajes recientes que dan contexto al agente y a las alertas. |
| `last_activity` | Fecha ISO usada para inactividad, reinicio y retención. |
| `paused_until` | Fin de la pausa automática por intervención humana. |
| `memory` | JSON de memoria estructurada: entrega, retiro, mensajes humanos y comprobante. |

Hay una restricción única sobre `(channel, customer_id)`. Por eso una misma
persona que habla por WhatsApp e Instagram son dos conversaciones distintas:
el sistema no intenta inferir que pertenecen a la misma identidad.

### Tabla `wholesale_reservations`

| Campo | Función |
| --- | --- |
| `id` | Identificador único de la reserva. |
| `channel` | Canal de origen. |
| `customer_id` | Cliente dentro de ese canal. |
| `model` | Modelo reservado. |
| `quantity` | Cantidad temporalmente comprometida. |
| `expires_at` | Momento en que deja de descontarse de la disponibilidad. |
| `created_at` | Auditoría de creación. |

Las reservas vencidas se liberan al iniciar y durante las consultas que las
usan. No son ventas: evitan prometer simultáneamente el mismo stock mayorista.

### Retención

Al abrir la base se eliminan conversaciones cuya `last_activity` supera
`CONVERSATION_RETENTION_DAYS` (30 días por defecto). Tras 12 horas de
inactividad se limpia el estado temporal de compra y la IA puede volver a
atender, conservando la memoria necesaria para consultas relacionadas.

## 6. Auditoría del carrito y campos

`cart` no es un campo muerto. `CartService` agrega, reemplaza y consulta líneas;
`SalesService` calcula totales, valida stock y, solamente con confirmación
interna explícita, puede registrar una venta y descontar inventario.

El flujo comercial vigente no permite que una frase del cliente confirme una
venta: las reglas envían las compras minoristas a Tiendanube y mantienen
`SALE_CONFIRMATION_MODE=disabled` salvo una habilitación interna consciente.
Por eso el carrito puede parecer inactivo en una conversación normal, pero
eliminarlo rompería herramientas, pruebas y el mecanismo protegido de venta.

`current_flavor`, `negotiated_quantity` y `customer_city` tienen poco o ningún
uso activo en el flujo actual. No se eliminaron porque quitar columnas de una
base SQLite ya desplegada exige una migración destructiva y rompería la
compatibilidad con filas y versiones anteriores. No generan llamadas ni costo
operativo relevante. Una migración futura puede retirarlos después de auditar
la base real y mantener un respaldo.

## 7. Reglas de negocio principales

- Nunca mezclar conversaciones entre canales o clientes.
- Agrupar mensajes cercanos antes de pedir una respuesta al agente.
- No responder si el estado no es `AI_ACTIVE`, salvo las excepciones de llegada
  física expresamente definidas.
- Un mensaje manual pausa la IA durante dos horas y cancela respuestas en cola.
- Revalidar el takeover justo antes de enviar una respuesta ya generada.
- Una nueva conversación puede reabrirse por las reglas previstas o después de
  la inactividad; una pausa humana vigente no se levanta por un saludo.
- Catálogo, precio, sabor, stock y enlaces salen de fuentes deterministas, no de
  una invención del modelo.
- Compras de 5 a 9 unidades requieren coordinación humana; 10 o más dependen de
  la tabla mayorista y también escalan si falta precio.
- Una visita al punto de retiro requiere alerta y coordinación humana; no se
  presenta como local abierto al público.
- La IA no registra ni descuenta una venta por una simple confirmación del
  cliente.
- Tokens, firmas, límites de tamaño, rate limit y bloqueo de producción reducen
  el riesgo de llamadas no autorizadas o accidentales.

## 8. Decisiones de diseño

Se eligió una migración evolutiva: primero separar casos de uso y sumar REST
sobre servicios ya probados, sin reescribir de golpe los webhooks que están en
producción. Así se obtiene una interfaz REST y una estructura por capas sin
cambiar el recorrido que hoy recibe y responde mensajes.

SQLite sigue siendo apropiado para una única instancia porque es simple,
transaccional y no requiere otro servidor. Si el sistema necesitara varias
instancias escribiendo simultáneamente, la capa `ConversationRepository` sería
el punto a reemplazar por PostgreSQL o un servicio compatible, conservando los
casos de uso y controladores.
