import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
const string = (extra = {}) => ({ type: "string", ...extra });
const integer = (extra = {}) => ({ type: "integer", ...extra });
const boolean = () => ({ type: "boolean" });
const object = (properties) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const identity = { channel: string({ enum: ["whatsapp", "instagram", "messenger", "web"] }), customerId: string({ minLength: 1 }) };
const schemas = {
    buscar_sabor: object({ ...identity, query: string() }), buscar_modelo: object({ ...identity, query: string() }),
    buscar_producto: object({ ...identity, model: string(), flavor: string() }), buscar_por_perfil: object({ ...identity, profile: string() }),
    consultar_ficha_producto: object({ ...identity, query: string() }),
    comparar_modelos: object({ ...identity, models: { type: "array", minItems: 2, maxItems: 5, items: string() } }),
    listar_catalogo: object({}),
    consultar_stock: object({ ...identity, sku: string() }),
    consultar_precio: { type: "object", additionalProperties: false, properties: { ...identity, sku: string({
                description: "SKU exacto o nombre de modelo si el cliente todavía no eligió sabor"
            }), quantity: integer({ minimum: 1, description: "Cantidad de este SKU" }), orderQuantity: integer({ minimum: 1, description: "Cantidad total de vapes del pedido, sumando todos los modelos y sabores" }), customerConfirmed: boolean(), confirmedProducts: { type: "array", minItems: 1, items: string({ description: "Producto confirmado con su cantidad, modelo y sabor" }) } }, required: ["channel", "customerId", "sku"] },
    consultar_entrega: { type: "object", additionalProperties: false, properties: { ...identity, method: string({ enum: ["opciones", "retiro", "flex", "nacional"] }), locality: string() }, required: ["channel", "customerId", "method"] },
    solicitar_envio_app: {
        type: "object",
        additionalProperties: false,
        properties: {
            ...identity,
            address: string()
        },
        required: ["channel", "customerId"]
    },
    reportar_demora_envio: { type: "object", additionalProperties: false, properties: { ...identity, carrier: string({ enum: ["flex", "correo_argentino", "uber_didi", "otro"] }), promisedEndHour: integer({ minimum: 0, maximum: 23 }), orderReference: string() }, required: ["channel", "customerId", "carrier"] },
    reportar_cambio_envio: { type: "object", additionalProperties: false, properties: { ...identity, product: string(), address: string(), reason: string() }, required: ["channel", "customerId"] },
    reportar_llegada_cambio: { type: "object", additionalProperties: false, properties: { ...identity, status: string(), product: string() }, required: ["channel", "customerId", "status"] },
    reportar_llegada_retiro: { type: "object", additionalProperties: false, properties: { ...identity, status: string(), product: string() }, required: ["channel", "customerId", "status"] },
    reportar_recordatorio_afuera: { type: "object", additionalProperties: false, properties: { ...identity, context: string({ enum: ["retiro", "cambio"] }), product: string() }, required: ["channel", "customerId", "context"] },
    coordinar_visita_local: { type: "object", additionalProperties: false, properties: { ...identity, visitType: string({ enum: ["retiro", "cambio"] }), product: string(), preferredTime: string() }, required: ["channel", "customerId", "visitType"] },
    evaluar_producto_fallado: { type: "object", additionalProperties: false, properties: { ...identity, daysSincePurchase: integer({ minimum: 0 }), product: string(), problem: string() }, required: ["channel", "customerId", "daysSincePurchase"] },
    cerrar_conversacion: object(identity),
    iniciar_nuevo_tema: { type: "object", additionalProperties: false, properties: { ...identity, triggerMessage: string() }, required: ["channel", "customerId", "triggerMessage"] },
    reportar_comprobante_web: { type: "object", additionalProperties: false, properties: { ...identity, deliveryMode: string({ enum: ["sin_definir", "envio", "uber_didi", "punto_retiro"] }), paymentTiming: string({ enum: ["antes_envio", "vehiculo_enviado", "al_recibir"] }), orderReference: string() }, required: ["channel", "customerId", "deliveryMode"] },
    reportar_consulta_post_comprobante: { type: "object", additionalProperties: false, properties: { ...identity, question: string(), requestedMethod: string({ enum: ["uber_didi", "flex", "retiro", "otro"] }) }, required: ["channel", "customerId", "question", "requestedMethod"] },
    reportar_condicion_pago: { type: "object", additionalProperties: false, properties: { ...identity, proposedTiming: string({ enum: ["vehiculo_enviado", "al_recibir"] }) }, required: ["channel", "customerId", "proposedTiming"] },
    reportar_solicitud_media: { type: "object", additionalProperties: false, properties: { ...identity, mediaType: string({ enum: ["foto", "video", "fotos_y_video"] }), product: string() }, required: ["channel", "customerId", "mediaType"] },
    reportar_llegada_sin_producto: { type: "object", additionalProperties: false, properties: { ...identity, arrivalStatus: string() }, required: ["channel", "customerId", "arrivalStatus"] },
    reportar_llegada_sin_horario: { type: "object", additionalProperties: false, properties: { ...identity, arrivalStatus: string(), product: string() }, required: ["channel", "customerId", "arrivalStatus"] },
    reportar_pedido_inmediato_app: {
        type: "object",
        additionalProperties: false,
        properties: {
            ...identity,
            product: string(),
            address: string(),
            productUrl: string()
        },
        required: ["channel", "customerId"]
    },
    reportar_consulta_fuera_horario: { type: "object", additionalProperties: false, properties: { ...identity, triggerMessage: string() }, required: ["channel", "customerId", "triggerMessage"] },
    consultar_negocio: object({ ...identity, key: string() }), consultar_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 1 }) }, required: ["channel", "customerId", "model"] },
    listar_mayorista: object({}),
    preparar_venta_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 10 }), items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, properties: { model: string(), quantity: integer({ minimum: 10 }) }, required: ["model", "quantity"] } }, paymentMethod: string({ enum: ["transferencia", "efectivo"] }), deliveryMode: string({ enum: ["retiro", "envio"] }), shippingCostArs: integer({ minimum: 0 }), customerConfirmed: boolean() }, required: ["channel", "customerId", "paymentMethod", "deliveryMode", "customerConfirmed"] },
    reportar_comprobante_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 10 }), deliveryMethod: string() }, required: ["channel", "customerId", "model", "quantity", "deliveryMethod"] },
    carrito_agregar: object({ ...identity, sku: string(), quantity: integer({ minimum: 1 }) }), carrito_establecer: object({ ...identity, sku: string(), quantity: integer({ minimum: 0 }) }),
    carrito_consultar: object(identity), resumir_pedido: object(identity), solicitar_intervencion_humana: object({ ...identity, reason: string() })
};
const alertToolNames = ["consultar_precio", "consultar_mayorista", "preparar_venta_mayorista", "reportar_comprobante_mayorista", "solicitar_envio_app",
    "reportar_pedido_inmediato_app", "reportar_consulta_fuera_horario", "reportar_consulta_post_comprobante", "reportar_condicion_pago", "reportar_demora_envio", "reportar_cambio_envio", "evaluar_producto_fallado", "reportar_llegada_cambio", "reportar_llegada_retiro", "reportar_recordatorio_afuera", "coordinar_visita_local", "reportar_comprobante_web", "reportar_solicitud_media", "reportar_llegada_sin_producto", "reportar_llegada_sin_horario", "solicitar_intervencion_humana"];
for (const name of alertToolNames) {
    const schema = schemas[name];
    if (schema?.properties)
        schema.properties.triggerMessage = string({ description: "Texto exacto del último mensaje del cliente que dispara esta acción" });
}
const descriptions = {
    consultar_ficha_producto: "OBLIGATORIA ante cualquier pregunta sobre puffs, bateria, pantalla, carga, modos, controles, nicotina o caracteristicas de un producto o marca. Para puffs copia exactamente products[].specifications.puffs. Responde el dato directamente: nunca menciones herramientas, fuentes, fichas, descripciones, Tiendanube ni procesos internos. Nunca deduzcas datos desde el nombre del modelo.",
    comparar_modelos: "Compara modelos o marcas usando exclusivamente las descripciones verificadas de sus fichas públicas de Tiendanube. Nunca inventes diferencias si falta una descripción.",
    reportar_llegada_retiro: "OBLIGATORIA cuando un cliente llega o está por llegar para retirar una compra, incluso durante una pausa humana. Notifica a Telegram como retiro de venta, nunca como cambio. Si está afuera, responde únicamente Ya salgo!.",
    reportar_recordatorio_afuera: "OBLIGATORIA si un cliente que ya avisó que está afuera vuelve a insistir o apura, incluso durante una pausa humana. Reenvía siempre una alerta mucho más urgente a Telegram.",
    reportar_consulta_post_comprobante: "OBLIGATORIA para consultas posteriores a un comprobante. La primera puede responder y alertar; las siguientes esperan al humano sin responder ni repetir alertas.",
    preparar_venta_mayorista: "Cierra una venta mayorista de uno o varios modelos fuera de la web. Para pedidos mixtos enviá items con cada modelo y cantidad. Valida stock, calcula el total conjunto en pesos y coordina pago, retiro o envío.",
    reportar_comprobante_mayorista: "OBLIGATORIA al recibir el comprobante de una venta mayorista con envío. Notifica a Telegram para preparar y despachar.",
    reportar_condicion_pago: "OBLIGATORIA si el cliente propone pagar al salir el vehículo o al recibir el producto. Notifica a Telegram y pausa la IA para que una persona decida.",
    iniciar_nuevo_tema: "Reinicio suave ante un saludo o consulta comercial claramente nueva: reactiva la IA, conserva el historial y evita arrastrar el asunto anterior salvo referencia explícita.",
    reportar_consulta_fuera_horario: "No la uses ante consultas de productos, marcas, sabores, precios o compras, aunque sea después de las 19. Solo corresponde si el cliente pregunta explícitamente por retirar, pasar o venir al punto de retiro; para ese caso usá preferentemente coordinar_visita_local.",
    buscar_sabor: "OBLIGATORIA cuando el cliente nombra o elige un sabor específico, incluso si escribe solamente el sabor. Devuelve disponibles y distingue OUT_OF_STOCK de NOT_FOUND. Tras responder el resultado, no compartas URL por una consulta de disponibilidad. Solo si también quiere comprar o pide link/página/catálogo, compartí una vez https://vaprizzio.com/ y el recordatorio de comprobante si va a concretar la compra. Nunca muestres productUrl individuales ni llames listar_catalogo para resolver un sabor específico.",
    buscar_modelo: "Busca una marca o modelo concreto y devuelve sus sabores y precios disponibles, distinguiendo agotados. No uses listar_catalogo para una marca o modelo específico. No compartas URL por una consulta de disponibilidad; solo si también quiere comprar o pide link/página/catálogo, compartí una vez https://vaprizzio.com/. Nunca muestres productUrl individuales.",
    buscar_producto: "OBLIGATORIA cuando el cliente ya indicó modelo y sabor. Devuelve AVAILABLE, OUT_OF_STOCK o NOT_FOUND. Tras responder el resultado, no compartas URL por una consulta de disponibilidad. Solo si también quiere comprar o pide link/página/catálogo, compartí una vez https://vaprizzio.com/ y el recordatorio de comprobante si va a concretar la compra. Nunca enumeres productos ajenos, muestres productUrl individuales ni ejecutes listar_catalogo.",
    buscar_por_perfil: "Recomienda pocos productos disponibles por perfil. No incluyas URLs salvo pedido explícito de compra, enlace o catálogo.",
    listar_catalogo: "Usala ÚNICAMENTE si el cliente pide de forma explícita catálogo, lista completa, todos los modelos o todo lo disponible. Está prohibida para un sabor, marca, modelo o producto específico y para una selección breve como Cherry Strazz. Devuelve modelos, precios y sabores con stock; nunca solicites intervención si devuelve models.",
    consultar_stock: "Verifica disponibilidad; no reveles quantity salvo pregunta explícita.",
    consultar_precio: "Cotiza un SKU según la cantidad. En pedidos mixtos pasá quantity para esa línea y orderQuantity con el total de vapes. De 5 a 9 aplica $2.000 ARS menos por unidad y devuelve MAYORISTA_5_A_9: la operación se hace fuera de la web. Cuando el cliente confirme los productos y cantidades, llamala otra vez con customerConfirmed true y confirmedProducts para notificar a Telegram y pausar la IA. Desde 10 usa la tabla mayorista; si el modelo no existe, notifica a Telegram y pausa la IA.",
    consultar_entrega: "Cotiza el punto de retiro gratuito o envío Flex y prepara la cotización nacional.",
    solicitar_envio_app: "OBLIGATORIA en cuanto el cliente elige Uber o Didi como medio de entrega o pide coordinar un envío por Uber/Didi. Debe alertar inmediatamente a Telegram y pausar la IA para que una persona continúe la conversación. La dirección es opcional: si ya está disponible enviala, pero no la pidas antes de derivar. Está prohibido mandar al cliente a la web, enviar productUrl, pedir comprobante, datos de pago o seguir coordinando la venta después de esta herramienta. Respondé únicamente su customerMessage.",
    reportar_pedido_inmediato_app: "Herramienta de compatibilidad para un pedido con Uber o Didi. Debe alertar inmediatamente a Telegram y pausar la IA para que una persona continúe la venta y coordine el envío. Nunca debe mandar al cliente a comprar por la web ni pedir comprobante.",
    reportar_demora_envio: "OBLIGATORIA ante un pedido no recibido. Correo indica seguimiento; Flex vencido, Uber/Didi u otro medio envían alerta privada a Telegram y pausan la IA.",
    reportar_cambio_envio: "Coordina el envío de un cambio ya autorizado. Notifica a Telegram y pausa la IA.",
    evaluar_producto_fallado: "OBLIGATORIA ante un producto fallado cuando el cliente ya informó hace cuántos días lo compró, incluso en el mismo mensaje. No vuelvas a preguntarlo si ya dijo el plazo: convertí hoy=0, ayer=1 y expresiones como hace dos días=2. Más de 2 días rechaza; 2 o menos notifica a Telegram y pausa la IA.",
    reportar_llegada_cambio: "OBLIGATORIA si un cliente con un cambio dice que está afuera, viniendo, cerca o por llegar, incluso durante una pausa humana. Notifica a Telegram; si está afuera responde únicamente Ya salgo!.",
    coordinar_visita_local: "OBLIGATORIA ante cualquier intención de retirar o cambiar un producto en el punto de retiro, especialmente si propone día u horario. Desde las 19 informa que hoy terminó y coordina mañana. Siempre notifica a Telegram, nunca confirma el horario y pausa la IA por igual en WhatsApp, Instagram y Messenger.",
    reportar_comprobante_web: "OBLIGATORIA cuando el cliente envía un comprobante de una compra web. Agradece, notifica a Telegram y pausa la IA para verificar el pago y continuar según la entrega.",
    reportar_solicitud_media: "OBLIGATORIA cuando el cliente pide una foto o video. Notifica a Telegram, responde que ya se lo mandan y pausa la IA.", reportar_llegada_sin_producto: "Herramienta de llegada sin producto decidido; funciona durante una pausa humana y si está afuera responde Ya salgo!.", reportar_llegada_sin_horario: "OBLIGATORIA si el cliente ya está viniendo al punto de retiro y no acordó horario, tenga o no producto decidido, incluso durante una pausa humana. Notifica; si está afuera responde únicamente Ya salgo!.", cerrar_conversacion: "Limpia el estado comercial cuando el cliente confirma que terminó. El siguiente mensaje comienza una conversación nueva.", consultar_negocio: "Obtiene una regla comercial desde NEGOCIO.", consultar_mayorista: "Lista todos los precios mayoristas finales en USD cripto para un modelo específico; si no existe, pausa la IA y notifica al humano.", listar_mayorista: "Devuelve automáticamente todos los modelos y precios mayoristas de Google Sheets. Usala para una consulta mayorista general y nunca solicites intervención.", carrito_agregar: "Guarda internamente un producto elegido; nunca menciones carrito al cliente.", carrito_establecer: "Corrige internamente una cantidad; nunca menciones carrito.", carrito_consultar: "Lee la selección interna sin mencionar carrito.", resumir_pedido: "Cotiza el pedido sin confirmarlo ni descontar stock.", solicitar_intervencion_humana: "Usala solo ante un caso comercial realmente desconocido; nunca después de listar_catalogo o listar_mayorista exitoso.",
};
descriptions.consultar_entrega = "Ante toda consulta general de envios usa method opciones: devuelve todas las alternativas y aplica automaticamente el corte Flex de las 13 hs. Usa los otros metodos solo para una alternativa especifica.";
const normalizeInboundText = (value) => String(value ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9!? ]/g, " ").replace(/\s+/g, " ").trim();
/*
 * El prompt de OpenClaw puede contener partes de turnos anteriores. Las
 * decisiones comerciales se toman exclusivamente con la intervención que
 * llegó ahora; de lo contrario un "hola" o un link viejo reaparece en cada
 * respuesta.
 */
const currentInboundText = (value) => {
    const prompt = String(value ?? "");
    const block = [...prompt.matchAll(/\[INTERVENCION_AGRUPADA\]([\s\S]*?)\[FIN_INTERVENCION_AGRUPADA\]/g)].at(-1);
    if (!block)
        return prompt;
    const messages = [...block[1].matchAll(/\[Mensaje del cliente \d+\/\d+\]\s*\n([\s\S]*?)(?=\n\n\[Mensaje del cliente|\s*$)/g)]
        .map((match) => match[1].trim())
        .filter(Boolean);
    return messages.join("\n");
};
const isOnlyGreeting = (value) => /^(hola|holaa+|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas)[!? ]*$/.test(normalizeInboundText(currentInboundText(value)));
const startsFreshTopic = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    const startsWithGreeting = /^(hola|holaa+|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas)(\b|[!?])/.test(text);
    const explicitContinuation = /\b(mi pedido|mi comprobante|ese envio|el envio que|el uber que|el didi que|lo de antes|lo anterior|seguimos con|sigo con)\b/.test(text);
    return startsWithGreeting && !explicitContinuation;
};
const requestsShoppingLink = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    return /\b(pasame|mandame|dame|quiero|necesito|tenes)\s+(?:el )?(link|enlace|pagina|web)\b/.test(text)
        || /\b(pasame|mandame|dame|quiero ver|mostrame)\s+(?:el )?catalogo\b/.test(text)
        || /\bcatalogo\s*[?¡!]?$/.test(text)
        || /\b(como|donde)\s+(compro|comprar|hago el pedido|hago la compra)\b/.test(text)
        || /\b(quiero|quisiera|voy a)\s+(comprar|pedir|hacer el pedido)\b/.test(text)
        || /\b(no se|quiero ver|mostrame|pasame)\b[\s\S]{0,35}\b(cual|cuales|modelos|vapes|catalogo)\b/.test(text);
};
const requestsExplicitCatalog = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    return /\b(catalogo|lista (?:completa|de precios)|todos los (?:vapes|modelos|sabores)|todo lo (?:que tienen|disponible)|que (?:vapes|modelos) tienen)\b/.test(text);
};
const reportsWebPurchase = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    return /\b(ya|recien)\s+(compre|hice la compra|hice un pedido)\b[\s\S]{0,35}\b(web|pagina|tienda)\b/.test(text)
        || /\bcompre\s+por\s+(la\s+)?(web|pagina|tienda)\b/.test(text);
};
const requestsPickupVisit = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    return /\b(retir\w*|pasar|venir|punto de retiro|larrazabal)\b/.test(text);
};
const requestsFiveToNineVapes = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    const hasQuantity = /\b(5|6|7|8|9|cinco|seis|siete|ocho|nueve)\b/.test(text);
    const hasPurchaseContext = /\b(vapes?|vaporizadores?|unidades?|compro|comprar|llevo|llevar|llevando|quiero|pedir|pedido|precio|cuanto|queda|quedan)\b/.test(text);
    return hasQuantity && hasPurchaseContext;
};
const requestsPriceQuote = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    return /\b(cuanto|precio|sale|salen|queda|quedan|costaria|cuesta)\b/.test(text);
};
const requestsUberDidiHandoff = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    const mentionsUberDidi = /\b(uber|didi)\b/.test(text);
    const isDeliveryProblem = /\b(no llego|no llega|demora|demorado|seguimiento|tarda|tardo)\b/.test(text);
    return mentionsUberDidi && !isDeliveryProblem;
};
const defectivePurchaseAge = (value) => {
    const text = normalizeInboundText(currentInboundText(value));
    if (!/\b(fallad[oa]?|falla|anda mal|no funciona|roto|quemado|problema)\b/.test(text))
        return null;
    if (/\b(hoy|lo compre hoy|compre hoy)\b/.test(text))
        return 0;
    if (/\b(ayer|lo compre ayer|compre ayer)\b/.test(text))
        return 1;
    if (/\b(anteayer|antes de ayer)\b/.test(text))
        return 2;
    const words = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
    const match = text.match(/\bhace\s+(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+dias?\b/);
    if (!match)
        return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : words[match[1]] ?? null;
};
const isVaprizzioSalesAgent = (agentId) => ["vaprizzio-sales", "vaprizzio-sales-test"].includes(String(agentId ?? ""));
export default definePluginEntry({ id: "vaprizzio-tools", name: "Vaprizzio Commercial Tools", description: "Herramientas comerciales verificadas", register(api) {
        const alertedRuns = new Set();
        const suppressedRuns = new Set();
        const requiredCustomerMessages = new Map();
        const linkAllowedRuns = new Map();
        const onlyGreetingRuns = new Map();
        api.on("after_tool_call", async (event) => {
            if (!event?.runId || event.error)
                return;
            const runId = String(event.runId);
            const candidates = [
                event?.result?.details?.result?.customerMessage,
                event?.result?.result?.customerMessage,
                event?.details?.result?.customerMessage,
                event?.result?.customerMessage
            ];
            let customerMessage = candidates.find((value) => typeof value === "string" && value.trim() && value !== "NO_REPLY");
            const blocked = event?.result?.details?.result?.blocked === true
                || event?.result?.result?.blocked === true
                || event?.details?.result?.blocked === true
                || event?.result?.blocked === true;
            const noReply = candidates.some(value => value === "NO_REPLY");
            if (blocked || noReply) {
                suppressedRuns.add(runId);
                return;
            }
            if (!alertToolNames.includes(String(event.toolName)))
                return;
            alertedRuns.add(runId);
            if (!customerMessage && Array.isArray(event?.result?.content)) {
                for (const item of event.result.content) {
                    if (item?.type !== "text" || typeof item.text !== "string")
                        continue;
                    try {
                        const parsed = JSON.parse(item.text);
                        const value = parsed?.result?.customerMessage ?? parsed?.customerMessage;
                        if (typeof value === "string" && value.trim() && value !== "NO_REPLY") {
                            customerMessage = value;
                            break;
                        }
                    }
                    catch { }
                }
            }
            if (customerMessage)
                requiredCustomerMessages.set(runId, customerMessage);
        });
        api.on("before_agent_finalize", async (event, ctx) => {
            if (!isVaprizzioSalesAgent(ctx?.agentId))
                return;
            const text = String(event?.lastAssistantMessage ?? "");
            const runId = String(event?.runId ?? "");
            if (runId && !linkAllowedRuns.get(runId) && /https?:\/\/\S+/i.test(text)) {
                return {
                    action: "revise",
                    reason: "El cliente no pidió comprar ni recibir un enlace en esta intervención.",
                    retry: {
                        instruction: "Quitá toda URL de la respuesta. Respondé solo la consulta actual; no ofrezcas ni repitas la web.",
                        idempotencyKey: `vaprizzio-unrequested-link:${runId}`,
                        maxAttempts: 1
                    }
                };
            }
            if (runId && !onlyGreetingRuns.get(runId) && /buscabas\s+alg[uú]n\s+vape/i.test(text)) {
                return {
                    action: "revise",
                    reason: "El saludo genérico solo corresponde a un saludo sin consulta.",
                    retry: {
                        instruction: "No preguntes 'Buscabas algún vape?'. Respondé directamente el asunto del mensaje actual, sin arrastrar saludos de turnos anteriores.",
                        idempotencyKey: `vaprizzio-greeting-only:${runId}`,
                        maxAttempts: 1
                    }
                };
            }
            if (runId && suppressedRuns.has(runId) && text.trim() !== "NO_REPLY") {
                return {
                    action: "revise",
                    reason: "La conversación está en pausa humana estricta.",
                    retry: {
                        instruction: "Respondé exactamente NO_REPLY. No ejecutes herramientas, no envíes alertas y no expliques la pausa.",
                        idempotencyKey: `vaprizzio-human-pause:${runId}`,
                        maxAttempts: 1
                    }
                };
            }
            const requiredMessage = runId ? requiredCustomerMessages.get(runId) : undefined;
            if (requiredMessage && text.trim() !== requiredMessage.trim()) {
                return {
                    action: "revise",
                    reason: "La herramienta envió la alerta pero falta entregar su respuesta obligatoria al cliente.",
                    retry: {
                        instruction: `No ejecutes ninguna herramienta nuevamente. Respondé ahora exactamente con este mensaje, sin agregar ni quitar nada: ${JSON.stringify(requiredMessage)}`,
                        idempotencyKey: `vaprizzio-required-customer-message:${runId}`,
                        maxAttempts: 1
                    }
                };
            }
            const promisesConsultation = /\b(dame|dejame|aguardame|esperame)\b[\s\S]{0,45}\b(segundo|minuto|momento|consult|revis|averigu)/i.test(text);
            if (!promisesConsultation || (runId && alertedRuns.has(runId)))
                return;
            return {
                action: "revise",
                reason: "La respuesta promete consultar pero no se ejecutó ninguna herramienta de alerta.",
                retry: {
                    instruction: "Antes de responder, ejecutá obligatoriamente la herramienta específica de alerta. Si es una foto de un producto que no podés identificar o una consulta comercial desconocida, ejecutá solicitar_intervencion_humana con triggerMessage y un motivo concreto. Solo después devolvé el customerMessage de la herramienta. Nunca prometas consultar sin haber enviado la alerta.",
                    idempotencyKey: `vaprizzio-missing-alert:${runId || event?.turnId || "turn"}`,
                    maxAttempts: 1
                }
            };
        }, { priority: 100, timeoutMs: 10000 });
        api.on("agent_end", async (event) => {
            if (!event?.runId)
                return;
            alertedRuns.delete(String(event.runId));
            suppressedRuns.delete(String(event.runId));
            requiredCustomerMessages.delete(String(event.runId));
            linkAllowedRuns.delete(String(event.runId));
            onlyGreetingRuns.delete(String(event.runId));
        });
        api.on("before_prompt_build", async (event, ctx) => {
            if (!isVaprizzioSalesAgent(ctx?.agentId))
                return;
            const prompt = String(event?.prompt ?? "");
            const inbound = currentInboundText(prompt);
            const freshTopic = startsFreshTopic(inbound);
            const purchaseAge = defectivePurchaseAge(inbound);
            const channel = String(ctx?.channel ?? ctx?.messageProvider ?? "");
            const customerId = String(ctx?.senderId ?? "");
            const fiveToNineVapes = requestsFiveToNineVapes(inbound);
            const explicitCatalog = requestsExplicitCatalog(inbound);
            const pickupVisit = requestsPickupVisit(inbound);
            const priceQuote = requestsPriceQuote(inbound);
            const shoppingLink = requestsShoppingLink(inbound);
            const webPurchaseAlreadyMade = reportsWebPurchase(inbound);
            const uberDidiHandoff = requestsUberDidiHandoff(inbound);
            if (event?.runId) {
                linkAllowedRuns.set(String(event.runId), shoppingLink && !webPurchaseAlreadyMade && !fiveToNineVapes);
                onlyGreetingRuns.set(String(event.runId), isOnlyGreeting(inbound));
            }
            const rules = webPurchaseAlreadyMade
                ? [
                    "REGLA AUTOMATICA DE COMPRA YA HECHA: el cliente ya compró por la web. No respondas 'Buscabas algún vape?' aunque haya empezado con saludo y no envíes otra URL. Si todavía no adjuntó comprobante real, respondé exactamente: Dale! Cuando tengas el comprobante mandamelo por acá 😊. No ejecutes reportar_comprobante_web ni alertes a Telegram hasta recibir el comprobante."
                ]
                : uberDidiHandoff
                    ? [
                        "REGLA AUTOMATICA PRIORITARIA UBER/DIDI: el cliente mencionó Uber o Didi como opción de entrega. Ejecutá OBLIGATORIAMENTE solicitar_envio_app inmediatamente, aunque todavía no haya dado dirección, producto o comprobante. Si ya conocés la dirección podés enviarla; si no, dejala vacía. Respondé únicamente con el customerMessage de la herramienta. Después de ejecutarla la conversación queda en manos de una persona. Está terminantemente prohibido enviar la web, productUrl, pedir comprobante, pedir transferencia, pedir que complete primero la compra o seguir coordinando el envío. Esta regla tiene prioridad sobre las reglas minoristas, de compra web y de horario."
                    ]
                    : fiveToNineVapes
                        ? [
                            "REGLA AUTOMATICA PRIORITARIA PARA ESTE TURNO: el cliente menciona entre 5 y 9 vapes, incluso frases como '5 del Ice King'. Es una venta mayorista especial fuera de la web con $2.000 ARS menos por unidad. 'Ice King' significa Elfbar Ice King. Esta prohibido enviar la pagina, un productUrl, decir que el descuento es automatico en la tienda o pedir comprobante web. Si pregunta por un modelo sin elegir sabor, no le pidas sabor solo para cotizar: ejecuta consultar_precio pasando en sku el nombre del modelo, quantity con la cantidad pedida y orderQuantity con el total. Informa unitPriceArs y lineTotalArs. Si ya confirmo productos y cantidades, ejecuta consultar_precio con customerConfirmed=true, confirmedProducts y triggerMessage; responde solo su customerMessage para alertar a Telegram y pausar la IA."
                        ]
                        : priceQuote
                            ? [
                                `REGLA AUTOMATICA PRIORITARIA DE PRECIO: si el cliente pregunta cuanto sale o a cuanto le queda un modelo, cotizalo con consultar_precio. Si no indico sabor, podes pasar el nombre del modelo en sku; no inventes un SKU ni digas que no esta disponible antes de resolver el modelo. 'Ice King' significa Elfbar Ice King. Si indico cantidad, pasa quantity y orderQuantity y responde con el precio unitario y el total devueltos. No envíes web por una cotización sola.${shoppingLink ? " Como además pidió comprar o un enlace, compartí únicamente https://vaprizzio.com/ y, si va a concretar la compra, agregá exactamente: Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊." : ""} No apliques esto a pedidos de 5 o más, que se gestionan fuera de la web.`
                            ]
                            : shoppingLink
                                ? [
                                    "REGLA AUTOMATICA DE ENLACES PARA ESTE TURNO: el cliente pidió comprar, ver el catálogo o recibir un enlace. Compartí únicamente la web general https://vaprizzio.com/ y aclarale que allí puede encontrar los productos disponibles y comprarlos; no muestres enlaces individuales ni repitas la URL en el mismo tema. Si lo enviás a completar una compra, agregá exactamente: Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊."
                                ]
                                : [
                                    "REGLA AUTOMATICA PRIORITARIA PARA PRODUCTOS ESPECIFICOS: si el cliente nombra o elige un sabor, marca, modelo o producto concreto —aunque escriba solamente algo como Cherry Strazz— busca exclusivamente esa opción con buscar_sabor, buscar_modelo o buscar_producto. Está prohibido usar listar_catalogo o enumerar productos no relacionados. Después de responder el resultado, no envíes URL: es una consulta de disponibilidad, no una compra. Nunca muestres productUrl individuales. Si es OUT_OF_STOCK, decí claramente que no queda stock. Si es NOT_FOUND, decí que no lo tenemos. Para una consulta simple de disponibilidad no agregues características; la descripción de Tiendanube y datos como el botón de frescura del Ice King se usan solamente si piden información, comparación o recomendación. Podés cerrar con 'Tenés alguna consulta?' si resulta natural."
                                ];
            if (!explicitCatalog)
                rules.push("PROHIBICION DE CATALOGO COMPLETO: este turno no contiene un pedido explícito de catálogo o lista completa. No ejecutes listar_catalogo. Si hay un sabor, marca, modelo o producto concreto, resolvelo solamente con buscar_sabor, buscar_modelo o buscar_producto y no nombres artículos ajenos.");
            if (!pickupVisit)
                rules.push("REGLA AUTOMATICA DE RETIRO: el cliente no mencionó retirar, pasar, venir al punto de retiro ni Larrazábal. Aunque sea después de las 19, está prohibido hablar del cierre, horario o punto de retiro, ejecutar reportar_consulta_fuera_horario o derivar a una persona. Respondé únicamente la consulta comercial.");
            if (freshTopic && ["whatsapp", "instagram", "messenger", "web"].includes(channel) && customerId) {
                const config = (event?.context?.pluginConfig ?? api.pluginConfig);
                const baseUrl = config?.baseUrl ?? "http://127.0.0.1:3000";
                const response = await fetch(`${baseUrl}/api/tools/iniciar_nuevo_tema`, {
                    method: "POST",
                    headers: { "content-type": "application/json", ...(config?.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}) },
                    body: JSON.stringify({ channel, customerId, triggerMessage: inbound })
                });
                if (!response.ok)
                    throw new Error(`VAPRIZZIO_TOPIC_RESET_ERROR:${response.status}`);
                rules.push("REGLA AUTOMATICA YA EJECUTADA: este saludo abre una conversacion nueva. Si es solo un saludo, saluda y pregunta si buscaba algun vape. Si incluye una consulta, respondela normalmente. No menciones comprobantes, coordinaciones, pausas ni el tema anterior, salvo que el cliente lo relacione explicitamente.");
            }
            if (purchaseAge !== null)
                rules.push(`DATO YA INFORMADO POR EL CLIENTE: compró el producto hace ${purchaseAge} día(s). Está prohibido volver a preguntar hace cuántos días lo compró. Ejecutá ahora evaluar_producto_fallado con daysSincePurchase=${purchaseAge} y respondé únicamente su customerMessage.`);
            return rules.length ? { prependSystemContext: rules.join("\n") } : undefined;
        }, { priority: 100, timeoutMs: 10000 });
        for (const [name, parameters] of Object.entries(schemas))
            api.registerTool({ name, description: descriptions[name] ?? name, parameters,
                async execute(_id, params) { const config = api.pluginConfig; const baseUrl = config?.baseUrl ?? "http://127.0.0.1:3000"; const response = await fetch(`${baseUrl}/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json", ...(config?.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}) }, body: JSON.stringify(params) }); const details = await response.json(); if (!response.ok)
                    throw new Error(`VAPRIZZIO_TOOL_ERROR:${response.status}`); return { content: [{ type: "text", text: JSON.stringify(details) }], details }; }
            }, { optional: true });
    } });
