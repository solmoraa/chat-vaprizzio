import type { CatalogService } from "../services/catalog-service.js";
import type { CartService } from "../services/cart-service.js";
import type { SalesService } from "../services/sales-service.js";
import type { TakeoverService } from "../services/takeover-service.js";
import type { Channel } from "../domain/types.js";
import { DeliveryService, buenosAiresHour } from "../services/delivery-service.js";
import type { ConversationRepository } from "../database/conversation-repository.js";

export class AgentToolService {
  constructor(readonly catalog: CatalogService, readonly cart: CartService, readonly takeover: TakeoverService, readonly sales: SalesService, readonly delivery = new DeliveryService(), readonly conversations?: ConversationRepository) {}
  async execute(name: string, args: Record<string, unknown>) {
    const channel = args.channel as Channel; const customerId = String(args.customerId ?? "");
    const triggerMessage = String(args.triggerMessage ?? "").trim();
    if (channel && customerId && triggerMessage) this.takeover.recordCustomerMessage(channel, customerId, triggerMessage);
    const alertTools = new Set(["consultar_mayorista", "preparar_venta_mayorista", "reportar_comprobante_mayorista", "solicitar_envio_app", "reportar_pedido_inmediato_app", "reportar_consulta_fuera_horario", "reportar_condicion_pago", "reportar_demora_envio", "reportar_cambio_envio", "evaluar_producto_fallado", "reportar_llegada_cambio", "coordinar_visita_local", "reportar_comprobante_web", "reportar_solicitud_media", "reportar_llegada_sin_producto", "reportar_llegada_sin_horario", "solicitar_intervencion_humana"]);
    if (channel && customerId && !this.takeover.canAiReply(channel, customerId) && name !== "get_conversation_state" && name !== "iniciar_nuevo_tema" && !alertTools.has(name)) return { blocked: true, reason: "AI_NOT_ACTIVE" };
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
        if (buenosAiresHour() >= 22) return { action:"PROGRAMAR_MANANA", customerMessage:"A esta hora los envíos salen mañana. Podés hacer el pedido tranquilo y mañana lo despachamos" };
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
        if (buenosAiresHour() >= 22) return { action:"PROGRAMAR_MANANA", customerMessage:"Perdón, pero el horario para retiros y envíos ya terminó. Si querés, hacé tu pedido por la web y con envío Flex te llegaría mañana, o podemos coordinar por este medio un Didi o Uber para mañana y que sea más rápido:\nhttps://www.vaprizzio.com/productos/" };
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
        const paymentTiming = String(args.paymentTiming ?? "antes_envio").toLowerCase();
        const orderReference = String(args.orderReference ?? "");
        const base = paymentTiming === "vehiculo_enviado"
          ? "Gracias por mandarnos el comprobante! 💚🙌 Recibimos el pago acordado después de enviar el vehículo. Apenas lo verifiquemos te confirmamos."
          : paymentTiming === "al_recibir"
            ? "Gracias por mandarnos el comprobante! 💚🙌 Recibimos el pago acordado al llegar el pedido. Apenas lo verifiquemos te confirmamos."
            : "Gracias por mandarnos el comprobante! 💚🙌 Apenas confirmemos el pago, confirmamos el envío y empezamos a preparar tu pedido.";
        const customerMessage = deliveryMode === "uber_didi"
          ? paymentTiming === "antes_envio"
            ? `${base} Nos vamos a comunicar para avisarte cuando salga el vehículo 🚗 Para cualquier cosa estamos en contacto.`
            : `${base} Para cualquier cosa estamos en contacto 😊`
          : deliveryMode === "punto_retiro"
            ? "Gracias por mandarnos el comprobante! 💚🙌 Apenas confirmemos el pago, empezamos a preparar tu pedido. Nos vamos a comunicar para coordinar el punto de retiro. Para cualquier cosa estamos en contacto 😊"
            : `${base} Para cualquier cosa estamos en contacto 😊`;
        const modeLabel = deliveryMode === "uber_didi" ? "Uber/Didi" : deliveryMode === "punto_retiro" ? "punto de retiro" : "envío";
        const result = await this.takeover.request(channel, customerId, `Comprobante recibido de compra web - modalidad: ${modeLabel}`, undefined, orderReference ? [orderReference] : undefined);
        return { action: "VERIFICAR_PAGO", customerMessage, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_condicion_pago": {
        const proposedTiming = String(args.proposedTiming ?? "vehiculo_enviado").toLowerCase();
        const label = proposedTiming === "al_recibir" ? "pagar cuando recibe el producto" : "pagar una vez que salga el vehículo";
        const result = await this.takeover.request(channel, customerId, `Cliente propone ${label}`);
        return { action: "CONSULTAR_CONDICION_PAGO", customerMessage: "Dale, dame un segundo que lo consulto", proposedTiming, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_solicitud_media": {
        const mediaType = String(args.mediaType ?? "foto").toLowerCase();
        const product = String(args.product ?? "");
        const details = product ? [product] : undefined;
        const result = await this.takeover.request(channel, customerId, `Cliente solicita ${mediaType} de un producto`, undefined, details);
        return { action: "ENVIAR_MEDIA", customerMessage: "Dale, dame un segundo ya te mando", mediaType, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_llegada_sin_producto": {
        const arrivalStatus = String(args.arrivalStatus ?? "ya está viniendo");
        const result = await this.takeover.request(channel, customerId, `🚨 CLIENTE VINIENDO AL LOCAL SIN VAPE DECIDIDO 🚨 Estado: ${arrivalStatus}`);
        return { action: "ATENCION_HUMANA", customerMessage: "Dale, ya te atiendo!", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_llegada_sin_horario": {
        if (buenosAiresHour() >= 22) return { action:"PROGRAMAR_MANANA", customerMessage:"Perdón, pero el horario para retiros y envíos ya terminó. Si querés, hacé tu pedido por la web y con envío Flex te llegaría mañana, o podemos coordinar por este medio un Didi o Uber para mañana y que sea más rápido:\nhttps://www.vaprizzio.com/productos/" };
        const arrivalStatus = String(args.arrivalStatus ?? "ya está viniendo");
        const product = String(args.product ?? "");
        const result = await this.takeover.request(channel, customerId, `🚨 CLIENTE VINIENDO AL LOCAL SIN HORARIO ACORDADO 🚨 Estado: ${arrivalStatus}`, undefined, product ? [product] : undefined);
        return { action: "ATENCION_HUMANA", customerMessage: "Dale, dame un segundo que verifico que haya alguien para recibirte", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_pedido_inmediato_app": {
        if (buenosAiresHour() >= 22) return { action:"PROGRAMAR_MANANA", customerMessage:"A esta hora los envíos salen mañana. Podés hacer el pedido tranquilo y mañana lo despachamos" };
        const product = String(args.product ?? "").trim();
        const address = String(args.address ?? "").trim();
        if (!product || !address) return { action:"PEDIR_DATOS", requires:[...(!product ? ["product"] : []), ...(!address ? ["address"] : [])], customerMessage:"Decime qué vape querés y pasame la dirección" };
        const result = await this.takeover.request(channel, customerId, "Pedido inmediato confirmado para enviar por Uber o Didi", undefined, [product, `Dirección: ${address}`]);
        return { action:"COORDINAR_ENVIO_APP", customerMessage:"Dale, dame un segundo que coordinamos el envío por Uber o Didi", state:result.state, pausedUntil:result.pausedUntil };
      }
      case "reportar_consulta_fuera_horario": {
        if (buenosAiresHour() >= 23) return { action:"PEDIDO_MANANA", customerMessage:"Buenas! La tienda está cerrada. Nuestro horario es de 10 a 19 hs. Si querés hacer un pedido para recibirlo mañana, podés hacerlo desde nuestra web:\nhttps://www.vaprizzio.com/productos/" };
        const result = await this.takeover.request(channel, customerId, "Posible pedido o pedido fuera del horario de atención", undefined, triggerMessage ? [triggerMessage] : undefined);
        return { action:"ATENCION_HUMANA", customerMessage:"Buenas! Cómo estás? La tienda está cerrada, pero dejame que consulto a los chicos. Uno de ellos te va a responder. Muchas gracias por escribirnos!", state:result.state, pausedUntil:result.pausedUntil };
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
      case "preparar_venta_mayorista": {
        const model = String(args.model ?? "");
        const quantity = Number(args.quantity);
        const paymentMethod = String(args.paymentMethod ?? "transferencia").toLowerCase();
        const deliveryMode = String(args.deliveryMode ?? "retiro").toLowerCase();
        const shippingCostArs = args.shippingCostArs == null ? null : Number(args.shippingCostArs);
        const customerConfirmed = args.customerConfirmed === true;
        if (paymentMethod === "efectivo" && deliveryMode !== "retiro") return { action:"PAGO_INVALIDO", customerMessage:"En efectivo es únicamente retirando por el local. Para envíos trabajamos con transferencia." };
        const quote = await this.catalog.wholesaleTotalArs(model, quantity);
        if (!quote) return { action:"MODELO_O_CANTIDAD_INVALIDA", customerMessage:"Dame un segundo que lo consulto" };
        if (!quote.exchangeRateArs || quote.subtotalArs == null) {
          const result = await this.takeover.request(channel, customerId, "Falta valor USDT para cerrar venta mayorista", quantity, [model]);
          return { action:"CONSULTAR_CAMBIO", customerMessage:"Dame un segundo que reviso el cambio", state:result.state, pausedUntil:result.pausedUntil };
        }
        if (deliveryMode === "envio" && shippingCostArs == null) return { action:"COTIZAR_ENVIO", customerMessage:"Pasame la dirección y el código postal así te cotizo el envío", subtotalArs:quote.subtotalArs };
        const totalArs = quote.subtotalArs + (shippingCostArs ?? 0);
        const money = new Intl.NumberFormat("es-AR").format(totalArs);
        const bank = { alias:"Fabri.moraa", cvu:"0000003100052918257843", holder:"Fabrizio Tomas Mora" };
        const stock = await this.catalog.wholesaleAvailableStock(model);
        const reservedByOthers = this.conversations?.reservedWholesaleByOthers(channel, customerId, stock?.model ?? model) ?? 0;
        const availableToReserve = Math.max(0, (stock?.quantity ?? 0) - reservedByOthers);
        if (!stock || availableToReserve < quantity) return { action:"STOCK_INSUFICIENTE", customerMessage:"Dame un segundo que reviso bien el stock disponible", available:availableToReserve };
        const summary = { model:quote.model, quantity, unitPriceUsd:quote.selected!.unitPriceUsd, exchangeRateArs:quote.exchangeRateArs, unitPriceArs:quote.unitPriceArs, subtotalArs:quote.subtotalArs, shippingCostArs:shippingCostArs ?? 0, totalArs, paymentMethod, deliveryMode };
        if (!customerConfirmed) return { action:"PEDIR_CONFIRMACION", customerMessage:`Te queda así: ${quantity} unidades de ${quote.model}, total $${money}${shippingCostArs ? " con envío incluido" : ""}. Confirmame si está bien y avanzamos`, summary };
        const reservation = this.conversations?.reserveWholesale(channel, customerId, stock.model, quantity);
        if (deliveryMode === "retiro") {
          const result = await this.takeover.request(channel, customerId, `Venta mayorista para coordinar retiro - pago ${paymentMethod}`, quantity, [model, `Total: $${money}`]);
          const paymentText = paymentMethod === "efectivo" ? `El total en efectivo es $${money}.` : `El total es $${money}. Podés transferir al alias ${bank.alias}, CVU ${bank.cvu}, a nombre de ${bank.holder}.`;
          return { action:"COORDINAR_RETIRO", customerMessage:`${paymentText} Dame un segundo que coordinamos el día y horario de retiro`, ...quote, shippingCostArs:0, totalArs, reservation, bank:paymentMethod === "transferencia" ? bank : undefined, state:result.state, pausedUntil:result.pausedUntil };
        }
        return { action:"ESPERAR_COMPROBANTE", customerMessage:`El total con envío es $${money}. Podés transferir al alias ${bank.alias}, CVU ${bank.cvu}, a nombre de ${bank.holder}. Cuando transfieras mandame el comprobante 🙌`, ...quote, shippingCostArs, totalArs, reservation, bank };
      }
      case "reportar_comprobante_mayorista": {
        const model = String(args.model ?? "");
        const quantity = Number(args.quantity);
        const deliveryMethod = String(args.deliveryMethod ?? "envío");
        const result = await this.takeover.request(channel, customerId, "Comprobante recibido de venta mayorista: preparar y coordinar envío", quantity, [model, deliveryMethod]);
        return { action:"PREPARAR_Y_ENVIAR", customerMessage:"Gracias por mandarnos el comprobante! 💚🙌 Apenas confirmemos el pago empezamos a preparar todo y coordinamos el envío. Para cualquier cosa estamos en contacto 😊", state:result.state, pausedUntil:result.pausedUntil };
      }
      case "cerrar_conversacion": { this.conversations?.releaseWholesaleReservation(channel, customerId); return { action: "CONVERSACION_CERRADA", customerMessage: "Gracias por escribirnos!", freshContextNextMessage: true, conversation: this.takeover.close(channel, customerId) }; }
      case "iniciar_nuevo_tema": {
        const normalizedMessage = triggerMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const greetingOnly = /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas|hola como estas|hola buen dia|hola buenos dias)$/.test(normalizedMessage);
        if (greetingOnly) return { action:"MANTENER_ATENCION_HUMANA", customerMessage:"NO_REPLY", state:"WAITING_HUMAN", contextPreserved:true };
        const resumed = this.takeover.resume(channel, customerId);
        return { action:"NUEVO_TEMA", state:resumed.state, contextPreserved:true, instruction:"Respondé la consulta actual sin mencionar el tema anterior. Usá el historial solo si el cliente lo relaciona explícitamente." };
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
