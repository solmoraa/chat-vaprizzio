import type { CatalogService } from "../services/catalog-service.js";
import type { CartService } from "../services/cart-service.js";
import type { SalesService } from "../services/sales-service.js";
import type { TakeoverService } from "../services/takeover-service.js";
import type { Channel } from "../domain/types.js";
import { DeliveryService, buenosAiresHour } from "../services/delivery-service.js";

export class AgentToolService {
  constructor(readonly catalog: CatalogService, readonly cart: CartService, readonly takeover: TakeoverService, readonly sales: SalesService, readonly delivery = new DeliveryService()) {}
  async execute(name: string, args: Record<string, unknown>) {
    const channel = args.channel as Channel; const customerId = String(args.customerId ?? "");
    const triggerMessage = String(args.triggerMessage ?? "").trim();
    if (channel && customerId && triggerMessage) this.takeover.recordCustomerMessage(channel, customerId, triggerMessage);
    const alertTools = new Set(["consultar_mayorista", "solicitar_envio_app", "reportar_demora_envio", "reportar_cambio_envio", "evaluar_producto_fallado", "reportar_llegada_cambio", "coordinar_visita_local", "reportar_comprobante_web", "reportar_solicitud_media", "solicitar_intervencion_humana"]);
    if (channel && customerId && !this.takeover.canAiReply(channel, customerId) && name !== "get_conversation_state" && !alertTools.has(name)) return { blocked: true, reason: "AI_NOT_ACTIVE" };
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
      case "reportar_demora_envio": {
        const carrier = String(args.carrier ?? "").toLowerCase();
        if (carrier === "correo_argentino") return { action: "REVISAR_SEGUIMIENTO", customerMessage: "Revisá el código de seguimiento que te llegó por mail para ver el estado del envío" };
        if (carrier !== "flex") {
          const label = carrier === "uber_didi" ? "Uber o Didi" : "otro medio";
          const result = await this.takeover.request(channel, customerId, `Pedido enviado por ${label} no entregado`, undefined, [String(args.orderReference ?? "")]);
          return { action: "CONSULTAR", customerMessage: "Aguardame un momento que lo consulto", state: result.state, pausedUntil: result.pausedUntil };
        }
        const promisedEndHour = Number(args.promisedEndHour);
        if (!Number.isInteger(promisedEndHour) || promisedEndHour < 0 || promisedEndHour > 23) return { action: "PREGUNTAR_HORARIO", customerMessage: "En qué horario te tenía que llegar?" };
        if (buenosAiresHour() < promisedEndHour) return { action: "DENTRO_DE_HORARIO", customerMessage: `Todavía está dentro del horario informado, hasta las ${promisedEndHour} hs` };
        const result = await this.takeover.request(channel, customerId, "Pedido Flex demorado", undefined, [String(args.orderReference ?? "")]);
        return { action: "CONSULTAR", customerMessage: "Aguardame un momento que lo consulto", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_cambio_envio": {
        const product = String(args.product ?? "");
        const address = String(args.address ?? "");
        const reason = String(args.reason ?? "Producto fallado");
        const details = [product, address, reason].filter(Boolean);
        const result = await this.takeover.request(channel, customerId, "Coordinar cambio de producto con envío", undefined, details);
        return { action: "CONSULTAR", customerMessage: "Dame un segundo que coordino el cambio y el envío", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "evaluar_producto_fallado": {
        const daysSincePurchase = Number(args.daysSincePurchase);
        if (!Number.isInteger(daysSincePurchase) || daysSincePurchase < 0) throw new Error("DAYS_SINCE_PURCHASE_INVALID");
        if (daysSincePurchase > 2) return {
          action: "FUERA_DE_PLAZO",
          eligible: false,
          customerMessage: "Disculpá, los cambios o devoluciones por productos fallados se aceptan dentro de los 2 días de la compra, como se aclara en la página. En este caso no podemos realizar el cambio ni la devolución."
        };
        const product = String(args.product ?? "");
        const problem = String(args.problem ?? "Producto fallado");
        const result = await this.takeover.request(channel, customerId, `Revisar producto fallado comprado hace ${daysSincePurchase} día(s)`, undefined, [product, problem].filter(Boolean));
        return { action: "CONSULTAR", eligible: true, customerMessage: "Dame un minuto que lo consulto", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_llegada_cambio": {
        const status = String(args.status ?? "próximo a llegar");
        const product = String(args.product ?? "");
        const isOutside = /\bafuera\b/i.test(status);
        const reason = isOutside
          ? `🚨🚨 CLIENTE AFUERA DEL LOCAL PARA REALIZAR UN CAMBIO 🚨🚨 Estado: ${status}`
          : `Cliente por llegar para realizar un cambio: ${status}`;
        const result = await this.takeover.request(channel, customerId, reason, undefined, product ? [product] : undefined);
        const customerMessage = isOutside ? "Ya salgo!" : "Dale, te esperamos";
        return { action: "AVISADO", customerMessage, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "coordinar_visita_local": {
        const visitType = String(args.visitType ?? "retiro").toLowerCase();
        const product = String(args.product ?? "");
        const preferredTime = String(args.preferredTime ?? "");
        const label = visitType === "cambio" ? "cambio de producto en el local" : "retiro en el local";
        const details = [product, preferredTime ? `Horario propuesto: ${preferredTime}` : ""].filter(Boolean);
        const result = await this.takeover.request(channel, customerId, `Coordinar horario para ${label}`, undefined, details.length ? details : undefined);
        return { action: "COORDINAR_HORARIO", customerMessage: "Dame un segundo que coordinamos el horario", address: "Av. Larrazábal 3437, Villa Lugano, CABA", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_comprobante_web": {
        const deliveryMode = String(args.deliveryMode ?? "envio").toLowerCase();
        const orderReference = String(args.orderReference ?? "");
        const base = "Gracias por enviarnos el comprobante! Apenas confirmemos el pago, confirmamos el envío y empezamos a preparar tu pedido.";
        const customerMessage = deliveryMode === "uber_didi"
          ? `${base} Nos vamos a comunicar para avisarte cuando salga el vehículo. Para cualquier cosa estamos en contacto.`
          : deliveryMode === "punto_retiro"
            ? "Gracias por enviarnos el comprobante! Apenas confirmemos el pago, empezamos a preparar tu pedido. Nos vamos a comunicar para coordinar el punto de retiro. Para cualquier cosa estamos en contacto."
            : `${base} Para cualquier cosa estamos en contacto.`;
        const modeLabel = deliveryMode === "uber_didi" ? "Uber/Didi" : deliveryMode === "punto_retiro" ? "punto de retiro" : "envío";
        const result = await this.takeover.request(channel, customerId, `Comprobante recibido de compra web - modalidad: ${modeLabel}`, undefined, orderReference ? [orderReference] : undefined);
        return { action: "VERIFICAR_PAGO", customerMessage, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_solicitud_media": {
        const mediaType = String(args.mediaType ?? "foto").toLowerCase();
        const product = String(args.product ?? "");
        const details = product ? [product] : undefined;
        const result = await this.takeover.request(channel, customerId, `Cliente solicita ${mediaType} de un producto`, undefined, details);
        return { action: "ENVIAR_MEDIA", customerMessage: "Dale, dame un segundo ya te mando", mediaType, state: result.state, pausedUntil: result.pausedUntil };
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
      case "listar_mayorista": return { action: "AUTOMATICO", currency: "USD", exchangeRate: "DOLAR_CRIPTO", finalPrice: true, models: await this.catalog.wholesaleList() };
      case "cerrar_conversacion": return { action: "CONVERSACION_CERRADA", customerMessage: "Gracias por escribirnos!", freshContextNextMessage: true, conversation: this.takeover.close(channel, customerId) };
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
