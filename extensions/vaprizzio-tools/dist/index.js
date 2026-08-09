import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
const string = (extra = {}) => ({ type: "string", ...extra });
const integer = (extra = {}) => ({ type: "integer", ...extra });
const object = (properties) => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const identity = { channel: string({ enum: ["whatsapp", "instagram"] }), customerId: string({ minLength: 1 }) };
const schemas = {
    buscar_sabor: object({ ...identity, query: string() }), buscar_modelo: object({ ...identity, query: string() }),
    buscar_producto: object({ ...identity, model: string(), flavor: string() }), buscar_por_perfil: object({ ...identity, profile: string() }),
    consultar_stock: object({ ...identity, sku: string() }), consultar_precio: object({ ...identity, sku: string() }),
    consultar_negocio: object({ ...identity, key: string() }), consultar_mayorista: { type: "object", additionalProperties: false, properties: { ...identity, model: string(), quantity: integer({ minimum: 1 }) }, required: ["channel", "customerId", "model"] },
    carrito_agregar: object({ ...identity, sku: string(), quantity: integer({ minimum: 1 }) }), carrito_establecer: object({ ...identity, sku: string(), quantity: integer({ minimum: 0 }) }),
    carrito_consultar: object(identity), resumir_pedido: object(identity), solicitar_intervencion_humana: object({ ...identity, reason: string() })
};
const descriptions = {
    buscar_sabor: "Busca el sabor en todas las marcas y solo devuelve productos disponibles.", buscar_modelo: "Lista sabores disponibles de un modelo.", buscar_producto: "Busca un producto específico por modelo y sabor.", buscar_por_perfil: "Recomienda pocos productos disponibles por perfil.", consultar_stock: "Verifica disponibilidad; no reveles quantity salvo pregunta explícita.", consultar_precio: "Obtiene el precio actual por SKU.", consultar_negocio: "Obtiene una regla comercial desde NEGOCIO.", consultar_mayorista: "Lista todos los precios mayoristas finales en USD cripto para un modelo; si no existe, pausa la IA y notifica al humano.", carrito_agregar: "Suma una cantidad pedida al carrito.", carrito_establecer: "Corrige la cantidad exacta en carrito.", carrito_consultar: "Lee el carrito persistente.", resumir_pedido: "Cotiza el pedido sin confirmarlo ni descontar stock.", solicitar_intervencion_humana: "Pausa la IA y notifica al vendedor."
};
export default definePluginEntry({ id: "vaprizzio-tools", name: "Vaprizzio Commercial Tools", description: "Herramientas comerciales verificadas", register(api) {
        for (const [name, parameters] of Object.entries(schemas))
            api.registerTool({ name, description: descriptions[name] ?? name, parameters,
                async execute(_id, params) { const configured = api.pluginConfig?.baseUrl; const baseUrl = configured ?? "http://127.0.0.1:3000"; const response = await fetch(`${baseUrl}/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params) }); const details = await response.json(); if (!response.ok)
                    throw new Error(`VAPRIZZIO_TOOL_ERROR:${response.status}`); return { content: [{ type: "text", text: JSON.stringify(details) }], details }; }
            }, { optional: true });
    } });
