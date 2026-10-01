import type { CatalogService } from "../services/catalog-service.js";
import type { CartService } from "../services/cart-service.js";
import type { SalesService } from "../services/sales-service.js";
import type { TakeoverService } from "../services/takeover-service.js";
import type { Channel } from "../domain/types.js";
import { DeliveryService, buenosAiresHour } from "../services/delivery-service.js";
import type { ConversationRepository } from "../database/conversation-repository.js";
import { opensFreshTopic } from "../services/fresh-topic.js";

export class AgentToolService {
  constructor(readonly catalog: CatalogService, readonly cart: CartService, readonly takeover: TakeoverService, readonly sales: SalesService, readonly delivery = new DeliveryService(), readonly conversations?: ConversationRepository) {}
  async execute(name: string, args: Record<string, unknown>) {
    const channel = args.channel as Channel; const customerId = String(args.customerId ?? "");
    const triggerMessage = String(args.triggerMessage ?? "").trim();
    if (channel && customerId && triggerMessage) this.takeover.recordCustomerMessage(channel, customerId, triggerMessage);
    if (channel && customerId && triggerMessage && opensFreshTopic(triggerMessage)) this.takeover.resumeFromCustomerMessage(channel, customerId);
    const newTopicReadTools = new Set(["buscar_sabor", "buscar_modelo", "buscar_producto", "buscar_por_perfil", "consultar_ficha_producto", "comparar_modelos", "listar_catalogo", "consultar_stock", "consultar_precio", "consultar_negocio"]);
    const arrivalTools = new Set(["reportar_llegada_cambio", "reportar_llegada_retiro", "reportar_recordatorio_afuera", "reportar_llegada_sin_producto", "reportar_llegada_sin_horario"]);
    if (channel && customerId && !this.takeover.canAiReply(channel, customerId)) {
      const latestMessage = triggerMessage || this.conversations?.getOrCreate(channel, customerId).lastMessages.at(-1) || "";
      if (newTopicReadTools.has(name) && opensFreshTopic(latestMessage)) this.takeover.resumeFromCustomerMessage(channel, customerId);
      else if (name !== "get_conversation_state" && name !== "iniciar_nuevo_tema" && !arrivalTools.has(name)) return {
        blocked:true,
        reason:"HUMAN_COORDINATION_ACTIVE",
        customerMessage:"NO_REPLY",
        notificationSent:false,
        instruction:"Una persona ya está atendiendo esta conversación. No respondas y no envíes otra alerta. Solo un saludo o tema nuevo reactiva el bot; las llegadas al punto de retiro usan sus herramientas específicas."
      };
    }
    switch (name) {
      case "buscar_sabor": return this.catalog.byFlavor(String(args.query));
      case "buscar_modelo": return this.catalog.byModel(String(args.query));
      case "buscar_producto": return this.catalog.specific(String(args.model), String(args.flavor));
      case "buscar_por_perfil": return this.catalog.byProfile(String(args.profile));
      case "consultar_ficha_producto": return { products:await this.catalog.productInfo(String(args.query)), verifiedSource:"TIENDANUBE_PRODUCT_DESCRIPTION" };
      case "comparar_modelos": return { comparisons:await this.catalog.compareModels(Array.isArray(args.models) ? args.models.map(String) : []), verifiedSource:"TIENDANUBE_PRODUCT_DESCRIPTION" };
      case "listar_catalogo": return { models: await this.catalog.priceList(), onlyAvailable: true };
      case "consultar_stock": return this.catalog.stock(String(args.sku));
      case "consultar_precio": {
        const quantity = args.quantity == null ? 1 : Number(args.quantity);
        const orderQuantity = args.orderQuantity == null ? quantity : Number(args.orderQuantity);
        const customerConfirmed = args.customerConfirmed === true;
        const confirmedProducts = Array.isArray(args.confirmedProducts)
          ? args.confirmedProducts.map(String).map(item => item.trim()).filter(Boolean)
          : [];
        const priceTarget = String(args.sku ?? "");

const retailQuote = await this.catalog.priceForOrder(
  priceTarget,
  quantity,
  orderQuantity
);

if (!retailQuote) {
  const modelMatch = await this.catalog.byModel(priceTarget);

  if (modelMatch.status === "AVAILABLE") {
    return {
      action: "ELEGIR_VARIANTE",
      available: true,
      customerMessage:
        "Ese modelo tiene precios distintos según el sabor. Decime cuál querés y te paso el precio exacto."
    };
  }

  return {
    action: "NO_DISPONIBLE",
    available: false,
    customerMessage:
      "Ese producto no está disponible en este momento"
  };
}
        if (orderQuantity >= 10) {
          const model = `${retailQuote.product.brand} ${retailQuote.product.model}`;
          const wholesaleQuote = await this.catalog.wholesale(model, orderQuantity);
          if (!wholesaleQuote) {
            const result = await this.takeover.request(channel, customerId, "Producto mayorista no encontrado", orderQuantity, [model]);
            return { action:"CONSULTAR", replyAllowed:true, customerMessage:"Dame un segundo que lo consulto", reason:"PRODUCTO_MAYORISTA_NO_ENCONTRADO", state:result.state, pausedUntil:result.pausedUntil };
          }
          const lineTotalUsd = wholesaleQuote.selected
  ? Math.round(
      wholesaleQuote.selected.unitPriceUsd *
      quantity *
      100
    ) / 100
  : null;

return {
  action: "MAYORISTA",
  currency: "USD",
  exchangeRate: "DOLAR_CRIPTO",
  finalPrice: true,

  quantity,
  orderQuantity,
  product: retailQuote.product,

  ...(lineTotalUsd != null
    ? { lineTotalUsd }
    : {}),

  ...wholesaleQuote
};
}
        if (orderQuantity >= 5) {
          const productLabel = `${quantity} ${retailQuote.product.brand} ${retailQuote.product.model} ${retailQuote.product.flavor}`.trim();
          if (customerConfirmed) {
            const products = confirmedProducts.length ? confirmedProducts : [productLabel];
            const result = await this.takeover.request(
              channel,
              customerId,
              "Venta de 5 a 9 unidades confirmada: coordinar fuera de la web",
              orderQuantity,
              products,
              true
            );
            return {
              action:"COORDINAR_MAYORISTA_5_A_9",
              customerMessage:"Dale, dame un segundo que coordinamos todo 😊",
              currency:"ARS",
              finalPrice:true,
              purchaseFlow:"FUERA_DE_LA_WEB",
              webCheckoutAllowed:false,
              notificationSent:true,
              state:result.state,
              pausedUntil:result.pausedUntil,
              ...retailQuote
            };
          }
          return {
            action:"MAYORISTA_5_A_9",
            currency:"ARS",
            finalPrice:true,
            promotion:"DESCUENTO_2000_POR_UNIDAD",
            purchaseFlow:"FUERA_DE_LA_WEB",
            webCheckoutAllowed:false,
            requiresExplicitConfirmation:true,
            humanHandoffOnConfirmation:true,
            ...retailQuote
          };
        }
        return {
          action:"MINORISTA",
          currency:"ARS",
          finalPrice:true,
          promotion:null,
          ...retailQuote
        };
      }
      case "consultar_negocio": return { value: await this.catalog.business(String(args.key)) };
      case "consultar_entrega": {
        const method = String(args.method ?? "").toLowerCase();
        if (method === "opciones") return this.delivery.options();
        if (method === "retiro") return this.delivery.pickup();
        if (method === "flex") return this.delivery.flex(String(args.locality ?? ""));
        if (method === "nacional") return { action: "COTIZAR_TIENDANUBE", requires: ["address", "postalCode"], carriers: ["Andreani", "Correo Argentino", "Vía Cargo"] };
        throw new Error("DELIVERY_METHOD_INVALID");
      }
      case "solicitar_envio_app": {
  const address = String(args.address ?? "").trim();

  const details = address
    ? [`Dirección informada: ${address}`]
    : undefined;

  const result = await this.takeover.request(
    channel,
    customerId,
    "Cliente eligió Uber/Didi como medio de entrega: continuar conversación y coordinar envío",
    undefined,
    details
  );

  return {
    action: "INTERVENCION_HUMANA_UBER_DIDI",
    customerMessage:
      "Dale, dame un segundo que coordinamos el envío por Uber/Didi 😊",
    notificationSent: true,
    state: result.state,
    pausedUntil: result.pausedUntil
  };
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
          ? `🚨🚨 CLIENTE AFUERA DEL PUNTO DE RETIRO PARA REALIZAR UN CAMBIO 🚨🚨 Estado: ${status}`
          : `Cliente por llegar para realizar un cambio: ${status}`;
        const result = await this.takeover.request(channel, customerId, reason, undefined, product ? [product] : undefined, true);
        const customerMessage = isOutside ? "Ya salgo!" : "Dale, te esperamos";
        return { action: "AVISADO", customerMessage, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_llegada_retiro": {
        const status = String(args.status ?? "está afuera");
        const product = String(args.product ?? "");
        const isOutside = /afuera|en la puerta|llegu[eé]|ya estoy/i.test(status);
        const result = await this.takeover.request(channel, customerId, `🚨 CLIENTE ${isOutside ? "AFUERA" : "LLEGANDO"} PARA RETIRAR UNA COMPRA 🚨 Estado: ${status}`, undefined, product ? [product] : undefined, true);
        return { action:"AVISADO_RETIRO", customerMessage:isOutside ? "Ya salgo!" : "Dale, te esperamos", state:result.state, pausedUntil:result.pausedUntil };
      }
      case "reportar_recordatorio_afuera": {
        const context = String(args.context ?? "retiro").toLowerCase();
        const product = String(args.product ?? "");
        const label = context === "cambio" ? "POR UN CAMBIO" : "PARA RETIRAR UNA COMPRA";
        const reason = `🚨🚨🚨⚠️⚠️ CLIENTE SIGUE AFUERA ${label} — SALIR URGENTE ⚠️⚠️🚨🚨🚨`;
        const result = await this.takeover.request(channel, customerId, reason, undefined, product ? [product] : undefined, true);
        return { action:"RECORDATORIO_URGENTE", customerMessage:"Ya salgo! Disculpá la demora", state:result.state, pausedUntil:result.pausedUntil };
      }
      case "coordinar_visita_local": {
        const visitType = String(args.visitType ?? "retiro").toLowerCase();
        const product = String(args.product ?? "");
        const preferredTime = String(args.preferredTime ?? "");
        if (visitType !== "cambio") {
          this.conversations?.recordPickupCoordination(
          channel,
          customerId,
          preferredTime
          );
        }
        const label = visitType === "cambio" ? "cambio de producto en el punto de retiro" : "retiro en el punto de retiro";
        const details = [product, preferredTime ? `Horario propuesto: ${preferredTime}` : ""].filter(Boolean);
        if (buenosAiresHour() >= 19) {
          const result = await this.takeover.request(channel, customerId, `Coordinar mañana: el horario de ${label} terminó por hoy`, undefined, details.length ? details : undefined);
          return { action:"COORDINAR_MANANA", customerMessage:"ℹ️ Información importante\nEl horario de retiro por Av. Larrazábal 3437 es de 10 a 19 hs.\n\nEl horario de retiro por hoy ya terminó. Podrías pasar mañana; dame un segundo que coordinamos el horario.", address:"Av. Larrazábal 3437, Villa Lugano, CABA", pickupType:"PUNTO_DE_RETIRO_GRATUITO", scheduleConfirmed:false, state:result.state, pausedUntil:result.pausedUntil };
        }
        const result = await this.takeover.request(channel, customerId, `Coordinar horario para ${label}`, undefined, details.length ? details : undefined);
        return { action: "COORDINAR_HORARIO", customerMessage: "Dame un segundo que coordinamos el horario", address: "Av. Larrazábal 3437, Villa Lugano, CABA", pickupType:"PUNTO_DE_RETIRO_GRATUITO", scheduleConfirmed:false, state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_comprobante_web": {
  const requestedDeliveryMode =
    String(
      args.deliveryMode ?? "sin_definir"
    ).toLowerCase();

  const paymentTiming =
    String(
      args.paymentTiming ?? "antes_envio"
    ).toLowerCase();

  const orderReference =
    String(args.orderReference ?? "");

  const conversation =
    this.conversations?.getOrCreate(
      channel,
      customerId
    );

  const memory = conversation?.memory;

  /*
   * Si el modelo manda sin_definir pero la memoria
   * ya sabe cómo se entrega, usamos la memoria.
   */
  const rememberedMode =
    memory?.deliveryMode ?? "sin_definir";

  const deliveryMode =
    requestedDeliveryMode === "sin_definir" &&
    rememberedMode !== "sin_definir"
      ? rememberedMode
      : requestedDeliveryMode;

  this.conversations?.markReceiptReceived(
    channel,
    customerId,
    deliveryMode === "punto_retiro" ||
    deliveryMode === "uber_didi" ||
    deliveryMode === "envio"
      ? deliveryMode
      : "sin_definir"
  );

  /*
   * Volvemos a leerla porque markReceiptReceived()
   * acaba de persistir cambios.
   */
  const updatedConversation =
    this.conversations?.getOrCreate(
      channel,
      customerId
    );

  const updatedMemory =
    updatedConversation?.memory;

  const base =
    paymentTiming === "vehiculo_enviado"
      ? "Gracias por mandarnos el comprobante! 💜🙌 Recibimos el pago acordado después de enviar el vehículo. Apenas lo verifiquemos te confirmamos."
      : paymentTiming === "al_recibir"
        ? "Gracias por mandarnos el comprobante! 💜🙌 Recibimos el pago acordado al llegar el pedido. Apenas lo verifiquemos te confirmamos."
        : "Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago, confirmamos el envío y empezamos a preparar tu pedido.";

  let customerMessage: string;

  if (deliveryMode === "sin_definir") {
    customerMessage =
      "Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago, empezamos a preparar tu pedido. Para cualquier cosa estamos en contacto 😊";
  } else if (deliveryMode === "uber_didi") {
    customerMessage =
      paymentTiming === "antes_envio"
        ? "Gracias por tu compra! 💜🙌 Ahora nos vamos a comunicar para organizar el envío con el auto. Para cualquier cosa estamos en contacto 😊"
        : `${base} Para cualquier cosa estamos en contacto 😊`;
  } else if (deliveryMode === "punto_retiro") {
    /*
     * Caso ideal:
     * tenemos horario explícitamente confirmado
     * por una intervención humana registrada.
     */
    if (
      updatedMemory?.pickupConfirmed &&
      updatedMemory.pickupConfirmedTime
    ) {
      customerMessage =
        `Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago, empezamos a preparar tu pedido. ` +
        `Ya tenemos coordinado el retiro para las ${updatedMemory.pickupConfirmedTime} hs. ` +
        `Para cualquier cosa estamos en contacto 😊`;
    }

    /*
     * Ya hubo coordinación/intervención por retiro,
     * aunque no podemos asegurar un horario exacto.
     *
     * NO volvemos a decir que "nos vamos a comunicar
     * para coordinar".
     */
    else if (
      updatedMemory?.pickupCoordinationStarted
    ) {
      customerMessage =
        "Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago, empezamos a preparar tu pedido. Como ya veníamos coordinando el retiro, seguimos con lo acordado. Para cualquier cosa estamos en contacto 😊";
    }

    /*
     * Solo usamos la frase vieja si realmente nunca
     * hubo una coordinación previa.
     */
    else {
      customerMessage =
        "Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago, empezamos a preparar tu pedido. Nos vamos a comunicar para coordinar el día y horario en el punto de retiro. Para cualquier cosa estamos en contacto 😊";
    }
  } else {
    customerMessage =
      `${base} Para cualquier cosa estamos en contacto 😊`;
  }

  const modeLabel =
    deliveryMode === "sin_definir"
      ? "entrega sin definir"
      : deliveryMode === "uber_didi"
        ? "Uber/Didi"
        : deliveryMode === "punto_retiro"
          ? "punto de retiro"
          : "envío";

  const result =
    await this.takeover.request(
      channel,
      customerId,
      `Comprobante recibido de compra web - modalidad: ${modeLabel}`,
      undefined,
      orderReference
        ? [orderReference]
        : undefined
    );

  return {
    action: "VERIFICAR_PAGO",
    customerMessage,
    deliveryMode,
    rememberedPickupCoordination:
      updatedMemory?.pickupCoordinationStarted ??
      false,
    state: result.state,
    pausedUntil: result.pausedUntil
  };
}
      case "reportar_consulta_post_comprobante": {
        return { action:"ESPERAR_HUMANO", customerMessage:"NO_REPLY", notificationSent:false, state:"WAITING_HUMAN" };
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
        const isOutside = /afuera|en la puerta|llegu[eé]|ya estoy/i.test(arrivalStatus);
        const result = await this.takeover.request(channel, customerId, `🚨 CLIENTE ${isOutside ? "AFUERA" : "VINIENDO"} AL PUNTO DE RETIRO SIN VAPE DECIDIDO 🚨 Estado: ${arrivalStatus}`, undefined, undefined, true);
        return { action: "ATENCION_HUMANA", customerMessage: isOutside ? "Ya salgo!" : "Dale, ya te atiendo!", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_llegada_sin_horario": {
        if (buenosAiresHour() >= 22) return { action:"PROGRAMAR_MANANA", customerMessage:"Perdón, pero el horario para retiros y envíos ya terminó. Si querés, hacé tu pedido por la web y con envío Flex te llegaría mañana, o podemos coordinar por este medio un Didi o Uber para mañana y que sea más rápido:\nhttps://www.vaprizzio.com/productos/\n\nSi pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊" };
        const arrivalStatus = String(args.arrivalStatus ?? "ya está viniendo");
        const product = String(args.product ?? "");
        const isOutside = /afuera|en la puerta|llegu[eé]|ya estoy/i.test(arrivalStatus);
        const result = await this.takeover.request(channel, customerId, `🚨 CLIENTE ${isOutside ? "AFUERA" : "VINIENDO"} AL PUNTO DE RETIRO SIN HORARIO ACORDADO 🚨 Estado: ${arrivalStatus}`, undefined, product ? [product] : undefined, true);
        return { action: "ATENCION_HUMANA", customerMessage: isOutside ? "Ya salgo!" : "Dale, dame un segundo que verifico que haya alguien para recibirte", state: result.state, pausedUntil: result.pausedUntil };
      }
      case "reportar_pedido_inmediato_app": {
  const product = String(args.product ?? "").trim();
  const address = String(args.address ?? "").trim();

  const details = [
    product ? `Producto: ${product}` : "",
    address ? `Dirección: ${address}` : ""
  ].filter(Boolean);

  const result = await this.takeover.request(
    channel,
    customerId,
    "Cliente eligió Uber/Didi como medio de entrega: continuar venta y coordinar envío",
    undefined,
    details.length ? details : undefined
  );

  return {
    action: "INTERVENCION_HUMANA_UBER_DIDI",
    customerMessage:
      "Dale, dame un segundo que coordinamos el envío por Uber/Didi 😊",
    notificationSent: true,
    state: result.state,
    pausedUntil: result.pausedUntil
  };
}
      case "reportar_consulta_fuera_horario": {
        if (buenosAiresHour() >= 23) return { action:"PEDIDO_MANANA", customerMessage:"Buenas! El punto de retiro está cerrado. Nuestro horario es de 10 a 19 hs. Si querés hacer un pedido para recibirlo mañana, podés hacerlo desde nuestra web:\nhttps://www.vaprizzio.com/productos/\n\nSi pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊" };
        const result = await this.takeover.request(channel, customerId, "Posible pedido o pedido fuera del horario de atención", undefined, triggerMessage ? [triggerMessage] : undefined);
        return { action:"ATENCION_HUMANA", customerMessage:"Buenas! Cómo estás? El punto de retiro está cerrado, pero dejame que consulto a los chicos. Uno de ellos te va a responder. Muchas gracias por escribirnos!", state:result.state, pausedUntil:result.pausedUntil };
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
        const totalUsd =
  quantity != null && quote.selected
    ? Math.round(
        quote.selected.unitPriceUsd *
        quantity *
        100
      ) / 100
    : null;

return {
  action: "AUTOMATICO",
  currency: "USD",
  exchangeRate: "DOLAR_CRIPTO",
  finalPrice: true,

  ...(totalUsd != null
    ? { totalUsd }
    : {}),

  ...quote
};
      }
      case "listar_mayorista": return { action: "AUTOMATICO", currency: "USD", exchangeRate: "DOLAR_CRIPTO", finalPrice: true, models: await this.catalog.wholesaleList() };
      case "preparar_venta_mayorista": {
        const requestedItems = Array.isArray(args.items)
          ? args.items.map(item => ({ model:String((item as Record<string, unknown>).model ?? ""), quantity:Number((item as Record<string, unknown>).quantity) }))
          : [{ model:String(args.model ?? ""), quantity:Number(args.quantity) }];
        const paymentMethod = String(args.paymentMethod ?? "transferencia").toLowerCase();
        const deliveryMode = String(args.deliveryMode ?? "retiro").toLowerCase();
        const shippingCostArs = args.shippingCostArs == null ? null : Number(args.shippingCostArs);
        const customerConfirmed = args.customerConfirmed === true;
        if (paymentMethod === "efectivo" && deliveryMode !== "retiro") return { action:"PAGO_INVALIDO", customerMessage:"En efectivo es únicamente retirando en el punto de retiro. Para envíos trabajamos con transferencia." };
        if (!requestedItems.length || requestedItems.some(item => !item.model || !Number.isInteger(item.quantity) || item.quantity < 10)) return { action:"MODELO_O_CANTIDAD_INVALIDA", customerMessage:"Dame un segundo que lo consulto" };
        const quotedItems = [] as Array<{ model:string; quantity:number; unitPriceUsd:number; unitPriceArs:number; subtotalArs:number; exchangeRateArs:number; stockModel:string }>;
        for (const item of requestedItems) {
          const quote = await this.catalog.wholesaleTotalArs(item.model, item.quantity);
          if (!quote) {
            const result = await this.takeover.request(channel, customerId, "Producto mayorista no encontrado", item.quantity, [item.model]);
            return { action:"MODELO_O_CANTIDAD_INVALIDA", customerMessage:"Dame un segundo que lo consulto", state:result.state, pausedUntil:result.pausedUntil };
          }
          if (!quote.exchangeRateArs || quote.subtotalArs == null || quote.unitPriceArs == null) {
            const result = await this.takeover.request(channel, customerId, "Falta valor USDT para cerrar venta mayorista", item.quantity, [item.model]);
            return { action:"CONSULTAR_CAMBIO", customerMessage:"Dame un segundo que reviso el cambio", state:result.state, pausedUntil:result.pausedUntil };
          }
          const stock = await this.catalog.wholesaleAvailableStock(item.model);
          const reservedByOthers = this.conversations?.reservedWholesaleByOthers(channel, customerId, stock?.model ?? item.model) ?? 0;
          const available = Math.max(0, (stock?.quantity ?? 0) - reservedByOthers);
          if (!stock || available < item.quantity) {
            const result = await this.takeover.request(channel, customerId, "Stock mayorista insuficiente", item.quantity, [item.model, `Disponible: ${available}`]);
            return { action:"STOCK_INSUFICIENTE", customerMessage:"Dame un segundo que reviso bien el stock disponible", model:item.model, requested:item.quantity, available, state:result.state, pausedUntil:result.pausedUntil };
          }
          quotedItems.push({ model:quote.model, quantity:item.quantity, unitPriceUsd:quote.selected!.unitPriceUsd, unitPriceArs:quote.unitPriceArs, subtotalArs:quote.subtotalArs, exchangeRateArs:quote.exchangeRateArs, stockModel:stock.model });
        }
        const exchangeRateArs = quotedItems[0]!.exchangeRateArs;
        const subtotalArs = quotedItems.reduce((total, item) => total + item.subtotalArs, 0);
        const totalQuantity = quotedItems.reduce((total, item) => total + item.quantity, 0);
        const itemLabels = quotedItems.map(item => `${item.quantity} ${item.model}`);
        if (!exchangeRateArs) {
          const result = await this.takeover.request(channel, customerId, "Falta valor USDT para cerrar venta mayorista", totalQuantity, itemLabels);
          return { action:"CONSULTAR_CAMBIO", customerMessage:"Dame un segundo que reviso el cambio", state:result.state, pausedUntil:result.pausedUntil };
        }
        if (deliveryMode === "envio" && shippingCostArs == null) return { action:"COTIZAR_ENVIO", customerMessage:"Pasame la dirección y el código postal así te cotizo el envío", items:quotedItems, subtotalArs };
        const totalArs = subtotalArs + (shippingCostArs ?? 0);
        const money = new Intl.NumberFormat("es-AR").format(totalArs);
        const bank = { alias:"Fabri.moraa", cvu:"0000003100052918257843", holder:"Fabrizio Tomas Mora" };
        const summary = { items:quotedItems, exchangeRateArs, subtotalArs, shippingCostArs:shippingCostArs ?? 0, totalArs, paymentMethod, deliveryMode };
        if (!customerConfirmed) return { action:"PEDIR_CONFIRMACION", customerMessage:`Te queda así: ${itemLabels.join(" + ")}, total $${money}${shippingCostArs ? " con envío incluido" : ""}. Confirmame si está bien y avanzamos`, summary };
        const reservations = quotedItems.map(item => this.conversations?.reserveWholesale(channel, customerId, item.stockModel, item.quantity)).filter(Boolean);
        if (deliveryMode === "retiro") {
          const result = await this.takeover.request(channel, customerId, `Venta mayorista para coordinar retiro - pago ${paymentMethod}`, totalQuantity, [...itemLabels, `Total: $${money}`]);
          const paymentText = paymentMethod === "efectivo" ? `El total en efectivo es $${money}.` : `El total es $${money}. Podés transferir al alias ${bank.alias}, CVU ${bank.cvu}, a nombre de ${bank.holder}.`;
          return { action:"COORDINAR_RETIRO", customerMessage:`${paymentText} Dame un segundo que coordinamos el día y horario de retiro`, items:quotedItems, exchangeRateArs, subtotalArs, shippingCostArs:0, totalArs, reservations, bank:paymentMethod === "transferencia" ? bank : undefined, state:result.state, pausedUntil:result.pausedUntil };
        }
        return { action:"ESPERAR_COMPROBANTE", customerMessage:`El total con envío es $${money}. Podés transferir al alias ${bank.alias}, CVU ${bank.cvu}, a nombre de ${bank.holder}. Cuando transfieras mandame el comprobante 🙌`, items:quotedItems, exchangeRateArs, subtotalArs, shippingCostArs, totalArs, reservations, bank };
      }
      case "reportar_comprobante_mayorista": {
        const model = String(args.model ?? "");
        const quantity = Number(args.quantity);
        const deliveryMethod = String(args.deliveryMethod ?? "envío");
        const result = await this.takeover.request(channel, customerId, "Comprobante recibido de venta mayorista: preparar y coordinar envío", quantity, [model, deliveryMethod]);
        return { action:"PREPARAR_Y_ENVIAR", customerMessage:"Gracias por mandarnos el comprobante! 💜🙌 Apenas confirmemos el pago empezamos a preparar todo y coordinamos el envío. Para cualquier cosa estamos en contacto 😊", state:result.state, pausedUntil:result.pausedUntil };
      }
      case "cerrar_conversacion": { this.conversations?.releaseWholesaleReservation(channel, customerId); return { action: "CONVERSACION_CERRADA", customerMessage: "Gracias por escribirnos!", freshContextNextMessage: true, conversation: this.takeover.close(channel, customerId) }; }
      case "iniciar_nuevo_tema": {
        const resumed = this.takeover.resumeFromCustomerMessage(channel, customerId);
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
