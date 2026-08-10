import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
const string = (extra = {}) => ({ type: "string", ...extra });
const integer = (extra = {}) => ({ type: "integer", ...extra });
const boolean = () => ({ type: "boolean" });
const object = (properties) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const identity = { channel: string({ enum: ["whatsapp", "instagram"] }), customerId: string({ minLength: 1 }) };
const schemas = {
    buscar_sabor: object({ ...identity, query: string() }), buscar_modelo: object({ ...identity, query: string() }),
    buscar_producto: object({ ...identity, model: string(), flavor: string() }), buscar_por_perfil: object({ ...identity, profile: string() }),
    comparar_modelos: object({ ...identity, models: { type: "array", minItems: 2, maxItems: 5, items: string() } }),
    listar_catalogo: object({}),
    consultar_stock: object({ ...identity, sku: string() }), consultar_precio: object({ ...identity, sku: string() }),
    consultar_entrega: { type: "object", additionalProperties: false, properties: { ...identity, method: string({ enum: ["retiro", "flex", "nacional"] }), locality: string() }, required: ["channel", "customerId", "method"] },
    solicitar_envio_app: object({ ...identity, address: string() }),
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
    reportar_pedido_inmediato_app: { type: "object", additionalProperties: false, properties: { ...identity, product: string(), address: string() }, required: ["channel", "customerId", "product", "address"] },
    reportar_consulta_fuera_horario: { type: "object", additionalProperties: false, properties: { ...identity, triggerMessage: string() }, required: ["channel", "customerId", "triggerMessage"] },
    consultar_negocio: object({ ...identity, key: string() }), consultar_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 1 }) }, required: ["channel", "customerId", "model"] },
    listar_mayorista: object({}),
    preparar_venta_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 10 }), items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, properties: { model: string(), quantity: integer({ minimum: 10 }) }, required: ["model", "quantity"] } }, paymentMethod: string({ enum: ["transferencia", "efectivo"] }), deliveryMode: string({ enum: ["retiro", "envio"] }), shippingCostArs: integer({ minimum: 0 }), customerConfirmed: boolean() }, required: ["channel", "customerId", "paymentMethod", "deliveryMode", "customerConfirmed"] },
    reportar_comprobante_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 10 }), deliveryMethod: string() }, required: ["channel", "customerId", "model", "quantity", "deliveryMethod"] },
    carrito_agregar: object({ ...identity, sku: string(), quantity: integer({ minimum: 1 }) }), carrito_establecer: object({ ...identity, sku: string(), quantity: integer({ minimum: 0 }) }),
    carrito_consultar: object(identity), resumir_pedido: object(identity), solicitar_intervencion_humana: object({ ...identity, reason: string() })
};
const alertToolNames = ["consultar_mayorista", "preparar_venta_mayorista", "reportar_comprobante_mayorista", "solicitar_envio_app", "reportar_pedido_inmediato_app", "reportar_consulta_fuera_horario", "reportar_consulta_post_comprobante", "reportar_condicion_pago", "reportar_demora_envio", "reportar_cambio_envio", "evaluar_producto_fallado", "reportar_llegada_cambio", "reportar_llegada_retiro", "reportar_recordatorio_afuera", "coordinar_visita_local", "reportar_comprobante_web", "reportar_solicitud_media", "reportar_llegada_sin_producto", "reportar_llegada_sin_horario", "solicitar_intervencion_humana"];
for (const name of alertToolNames) {
    const schema = schemas[name];
    if (schema?.properties)
        schema.properties.triggerMessage = string({ description: "Texto exacto del último mensaje del cliente que dispara esta acción" });
}
const descriptions = {
    comparar_modelos: "Compara modelos o marcas usando exclusivamente las descripciones verificadas de sus fichas públicas de Tiendanube. Nunca inventes diferencias si falta una descripción.",
    reportar_llegada_retiro: "OBLIGATORIA cuando un cliente llega o está por llegar para retirar una compra. Notifica a Telegram como retiro de venta, nunca como cambio.",
    reportar_recordatorio_afuera: "OBLIGATORIA si un cliente que ya avisó que está afuera vuelve a insistir o apura. Reenvía siempre una alerta mucho más urgente a Telegram.",
    reportar_consulta_post_comprobante: "OBLIGATORIA para consultas posteriores a un comprobante. La primera puede responder y alertar; las siguientes esperan al humano sin responder ni repetir alertas.",
    preparar_venta_mayorista: "Cierra una venta mayorista de uno o varios modelos fuera de la web. Para pedidos mixtos enviá items con cada modelo y cantidad. Valida stock, calcula el total conjunto en pesos y coordina pago, retiro o envío.",
    reportar_comprobante_mayorista: "OBLIGATORIA al recibir el comprobante de una venta mayorista con envío. Notifica a Telegram para preparar y despachar.",
    reportar_condicion_pago: "OBLIGATORIA si el cliente propone pagar al salir el vehículo o al recibir el producto. Notifica a Telegram y pausa la IA para que una persona decida.",
    iniciar_nuevo_tema: "Reinicio suave ante un saludo que abre otro tema: reactiva la IA, conserva el historial y evita arrastrar el asunto anterior salvo referencia explícita.",
    reportar_consulta_fuera_horario: "OBLIGATORIA entre las 19 y las 23 ante una consulta con posible intención de compra, pedido o visita. Notifica a Telegram y pausa la IA.",
    buscar_sabor: "Busca el sabor en todas las marcas y solo devuelve productos disponibles.", buscar_modelo: "Lista sabores disponibles de un modelo.", buscar_producto: "Busca un producto específico por modelo y sabor.", buscar_por_perfil: "Recomienda pocos productos disponibles por perfil.", listar_catalogo: "Devuelve la lista completa de modelos, precios y sabores con stock. Si devuelve models, respondé con la lista y nunca solicites intervención.", consultar_stock: "Verifica disponibilidad; no reveles quantity salvo pregunta explícita.", consultar_precio: "Obtiene el precio actual por SKU.", consultar_entrega: "Cotiza retiro o envío Flex y prepara la cotización nacional.", solicitar_envio_app: "Consulta el costo variable de Uber o Didi, notifica a Telegram y pausa la IA.", reportar_pedido_inmediato_app: "OBLIGATORIA cuando el cliente confirma un pedido inmediato, eligió vape y pasó dirección. Notifica a Telegram y pausa la IA para gestionar Uber o Didi.", reportar_demora_envio: "OBLIGATORIA ante un pedido no recibido. Correo indica seguimiento; Flex vencido, Uber/Didi u otro medio envían alerta privada a Telegram y pausan la IA.", reportar_cambio_envio: "Coordina el envío de un cambio ya autorizado. Notifica a Telegram y pausa la IA.", evaluar_producto_fallado: "OBLIGATORIA ante un producto fallado cuando el cliente ya informó hace cuántos días lo compró, incluso en el mismo mensaje. No vuelvas a preguntarlo si ya dijo el plazo: convertí hoy=0, ayer=1 y expresiones como hace dos días=2. Más de 2 días rechaza; 2 o menos notifica a Telegram y pausa la IA.", reportar_llegada_cambio: "OBLIGATORIA si un cliente con un cambio dice que está afuera, viniendo, cerca o por llegar. Notifica a Telegram y pausa la IA.", coordinar_visita_local: "OBLIGATORIA cuando el cliente decide retirar o cambiar un producto en el local. Notifica a Telegram y pausa la IA para acordar el horario.", reportar_comprobante_web: "OBLIGATORIA cuando el cliente envía un comprobante de una compra web. Agradece, notifica a Telegram y pausa la IA para verificar el pago y continuar según la entrega.", reportar_solicitud_media: "OBLIGATORIA cuando el cliente pide una foto o video. Notifica a Telegram, responde que ya se lo mandan y pausa la IA.", reportar_llegada_sin_producto: "Herramienta anterior para llegada sin producto decidido.", reportar_llegada_sin_horario: "OBLIGATORIA si el cliente ya está viniendo al local y no acordó horario, tenga o no producto decidido. Notifica y pausa la IA.", cerrar_conversacion: "Limpia el estado comercial cuando el cliente confirma que terminó. El siguiente mensaje comienza una conversación nueva.", consultar_negocio: "Obtiene una regla comercial desde NEGOCIO.", consultar_mayorista: "Lista todos los precios mayoristas finales en USD cripto para un modelo específico; si no existe, pausa la IA y notifica al humano.", listar_mayorista: "Devuelve automáticamente todos los modelos y precios mayoristas de Google Sheets. Usala para una consulta mayorista general y nunca solicites intervención.", carrito_agregar: "Guarda internamente un producto elegido; nunca menciones carrito al cliente.", carrito_establecer: "Corrige internamente una cantidad; nunca menciones carrito.", carrito_consultar: "Lee la selección interna sin mencionar carrito.", resumir_pedido: "Cotiza el pedido sin confirmarlo ni descontar stock.", solicitar_intervencion_humana: "Usala solo ante un caso comercial realmente desconocido; nunca después de listar_catalogo o listar_mayorista exitoso."
};
const normalizeInboundText = (value) => String(value ?? "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9!? ]/g, " ").replace(/\s+/g, " ").trim();
const startsFreshTopic = (value) => {
    const text = normalizeInboundText(value);
    const startsWithGreeting = /^(hola|holaa+|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas)(\b|[!?])/.test(text);
    const explicitContinuation = /\b(mi pedido|mi comprobante|ese envio|el envio que|el uber que|el didi que|lo de antes|lo anterior|seguimos con|sigo con)\b/.test(text);
    return startsWithGreeting && !explicitContinuation;
};
const defectivePurchaseAge = (value) => {
    const text = normalizeInboundText(value);
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
export default definePluginEntry({ id: "vaprizzio-tools", name: "Vaprizzio Commercial Tools", description: "Herramientas comerciales verificadas", register(api) {
        const alertedRuns = new Set();
        const requiredCustomerMessages = new Map();
        api.on("after_tool_call", async (event) => {
            if (!event?.runId || !alertToolNames.includes(String(event.toolName)) || event.error)
                return;
            const runId = String(event.runId);
            alertedRuns.add(runId);
            const candidates = [
                event?.result?.details?.result?.customerMessage,
                event?.result?.result?.customerMessage,
                event?.details?.result?.customerMessage,
                event?.result?.customerMessage
            ];
            let customerMessage = candidates.find((value) => typeof value === "string" && value.trim() && value !== "NO_REPLY");
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
            if (ctx?.agentId !== "vaprizzio-sales-test")
                return;
            const text = String(event?.lastAssistantMessage ?? "");
            const runId = String(event?.runId ?? "");
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
            requiredCustomerMessages.delete(String(event.runId));
        });
        api.on("before_prompt_build", async (event, ctx) => {
            if (ctx?.agentId !== "vaprizzio-sales-test")
                return;
            const freshTopic = startsFreshTopic(event?.prompt);
            const purchaseAge = defectivePurchaseAge(event?.prompt);
            if (!freshTopic && purchaseAge === null)
                return;
            const channel = String(ctx?.channel ?? ctx?.messageProvider ?? "");
            const customerId = String(ctx?.senderId ?? "");
            const rules = [];
            if (freshTopic && ["whatsapp", "instagram"].includes(channel) && customerId) {
                const config = (event?.context?.pluginConfig ?? api.pluginConfig);
                const baseUrl = config?.baseUrl ?? "http://127.0.0.1:3000";
                const response = await fetch(`${baseUrl}/api/tools/iniciar_nuevo_tema`, {
                    method: "POST",
                    headers: { "content-type": "application/json", ...(config?.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}) },
                    body: JSON.stringify({ channel, customerId, triggerMessage: String(event.prompt) })
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
