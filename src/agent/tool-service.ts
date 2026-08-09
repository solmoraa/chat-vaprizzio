import type { CatalogService } from "../services/catalog-service.js";
import type { CartService } from "../services/cart-service.js";
import type { SalesService } from "../services/sales-service.js";
import type { TakeoverService } from "../services/takeover-service.js";
import type { Channel } from "../domain/types.js";
import { DeliveryService } from "../services/delivery-service.js";

export class AgentToolService {
  constructor(readonly catalog: CatalogService, readonly cart: CartService, readonly takeover: TakeoverService, readonly sales: SalesService, readonly delivery = new DeliveryService()) {}
  async execute(name: string, args: Record<string, unknown>) {
    const channel = args.channel as Channel; const customerId = String(args.customerId ?? "");
    if (channel && customerId && !this.takeover.canAiReply(channel, customerId) && name !== "get_conversation_state") return { blocked: true, reason: "AI_NOT_ACTIVE" };
    switch (name) {
      case "buscar_sabor": return this.catalog.byFlavor(String(args.query));
      case "buscar_modelo": return this.catalog.byModel(String(args.query));
      case "buscar_producto": return this.catalog.specific(String(args.model), String(args.flavor));
      case "buscar_por_perfil": return this.catalog.byProfile(String(args.profile));
      case "listar_catalogo": return { models: await this.catalog.priceList(), onlyAvailable: true };
      case "consultar_stock": return this.catalog.stock(String(args.sku));
      case "consultar_precio": return { price: await this.catalog.price(String(args.sku)) };
      case "consultar_negocio": return { value: await this.catalog.business(String(args.key)) };
      case "consultar_entrega": {
        const method = String(args.method ?? "").toLowerCase();
        if (method === "retiro") return this.delivery.pickup();
        if (method === "flex") return this.delivery.flex(String(args.locality ?? ""));
        if (method === "nacional") return { action: "COTIZAR_TIENDANUBE", requires: ["address", "postalCode"], carriers: ["Andreani", "Correo Argentino", "Vía Cargo"] };
        throw new Error("DELIVERY_METHOD_INVALID");
      }
      case "solicitar_envio_app": {
        const result = await this.takeover.request(channel, customerId, "Cotizar Didi o Uber Envíos", undefined, [String(args.address ?? "")]);
        return { action: "CONSULTAR", customerMessage: "Dame un segundo que consulto el valor del envío", state: result.state };
      }
      case "consultar_mayorista": {
        const model = String(args.model ?? "");
        const quantity = args.quantity == null ? undefined : Number(args.quantity);
        const quote = await this.catalog.wholesale(model, quantity);
        if (!quote) {
          await this.takeover.request(channel, customerId, "Producto mayorista no encontrado", quantity, [model]);
          return { action: "CONSULTAR", replyAllowed: true, customerMessage: "Dame un segundo que lo consulto", reason: "PRODUCTO_NO_ENCONTRADO" };
        }
        if (quantity != null && quantity < 10) return { action: "MINORISTA", minimum: 10 };
        return { action: "AUTOMATICO", currency: "USD", exchangeRate: "DOLAR_CRIPTO", finalPrice: true, ...quote };
      }
      case "carrito_agregar": return { cart: this.cart.add(channel, customerId, String(args.sku), Number(args.quantity)) };
      case "carrito_establecer": return { cart: this.cart.set(channel, customerId, String(args.sku), Number(args.quantity)) };
      case "carrito_consultar": return { cart: this.cart.get(channel, customerId) };
      case "solicitar_intervencion_humana": return this.takeover.request(channel, customerId, String(args.reason ?? "Solicitud del agente"));
      case "resumir_pedido": return this.sales.quote(channel, customerId);
      case "registrar_venta": return this.sales.confirm(channel, customerId, false);
      default: throw new Error(`UNKNOWN_TOOL:${name}`);
    }
  }
}
