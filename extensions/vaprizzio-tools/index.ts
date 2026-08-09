import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const identity = { channel: Type.Union([Type.Literal("whatsapp"), Type.Literal("instagram")]), customerId: Type.String({ minLength: 1 }) };
const schemas: Record<string, object> = {
  buscar_sabor: Type.Object({ ...identity, query: Type.String() }), buscar_modelo: Type.Object({ ...identity, query: Type.String() }),
  buscar_producto: Type.Object({ ...identity, model: Type.String(), flavor: Type.String() }), buscar_por_perfil: Type.Object({ ...identity, profile: Type.String() }),
  consultar_stock: Type.Object({ ...identity, sku: Type.String() }), consultar_precio: Type.Object({ ...identity, sku: Type.String() }),
  consultar_negocio: Type.Object({ ...identity, key: Type.String() }), consultar_mayorista: Type.Object({ ...identity, quantity: Type.Integer({ minimum: 1 }) }),
  carrito_agregar: Type.Object({ ...identity, sku: Type.String(), quantity: Type.Integer({ minimum: 1 }) }), carrito_establecer: Type.Object({ ...identity, sku: Type.String(), quantity: Type.Integer({ minimum: 0 }) }),
  carrito_consultar: Type.Object(identity), resumir_pedido: Type.Object(identity), solicitar_intervencion_humana: Type.Object({ ...identity, reason: Type.String() })
};
const descriptions: Record<string, string> = {
  buscar_sabor:"Busca el sabor en todas las marcas y solo devuelve productos disponibles.", buscar_modelo:"Lista sabores disponibles de un modelo.", buscar_producto:"Busca un producto específico por modelo y sabor.", buscar_por_perfil:"Recomienda pocos productos disponibles por perfil.", consultar_stock:"Verifica disponibilidad; no reveles quantity salvo pregunta explícita.", consultar_precio:"Obtiene el precio actual por SKU.", consultar_negocio:"Obtiene una regla comercial desde NEGOCIO.", consultar_mayorista:"Obtiene el tramo mayorista o escala al humano.", carrito_agregar:"Suma una cantidad pedida al carrito.", carrito_establecer:"Corrige la cantidad exacta en carrito.", carrito_consultar:"Lee el carrito persistente.", resumir_pedido:"Cotiza el pedido sin confirmarlo ni descontar stock.", solicitar_intervencion_humana:"Pausa la IA y notifica al vendedor."
};
export default definePluginEntry({ id:"vaprizzio-tools", name:"Vaprizzio Commercial Tools", description:"Herramientas comerciales verificadas", register(api) {
  for (const [name, parameters] of Object.entries(schemas)) api.registerTool({ name, description:descriptions[name] ?? name, parameters,
    async execute(_id, params) { const configured=(api as unknown as {pluginConfig?:{baseUrl?:string}}).pluginConfig?.baseUrl; const baseUrl=configured ?? "http://127.0.0.1:3000"; const response=await fetch(`${baseUrl}/api/tools/${name}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(params)}); const details=await response.json(); if(!response.ok) throw new Error(`VAPRIZZIO_TOOL_ERROR:${response.status}`); return {content:[{type:"text",text:JSON.stringify(details)}],details}; }
  }, { optional:true });
}});
