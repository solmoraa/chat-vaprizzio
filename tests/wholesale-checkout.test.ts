import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { CatalogService } from "../src/services/catalog-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";
import { fixture } from "./helpers.js";

const setup = () => {
  const repo = new ConversationRepository(":memory:");
  const notify = vi.fn();
  const takeover = new TakeoverService(repo, { notify });
  const tools = new AgentToolService(new CatalogService(fixture()), {} as never, takeover, {} as never);
  return { tools, notify, takeover };
};

describe("cierre de venta mayorista fuera de la web", () => {
  it("convierte a pesos, suma envío y entrega los datos de transferencia", async () => {
    const { tools, notify } = setup();
    const result = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"mayor-envio", model:"Elfbar Ice King 40K", quantity:20,
      paymentMethod:"transferencia", deliveryMode:"envio", shippingCostArs:5000
    });
    expect(result).toMatchObject({ action:"ESPERAR_COMPROBANTE", subtotalArs:292800, shippingCostArs:5000, totalArs:297800,
      bank:{ alias:"Fabri.moraa", cvu:"0000003100052918257843", holder:"Fabrizio Tomas Mora" } });
    expect(notify).not.toHaveBeenCalled();
  });

  it("solo permite efectivo cuando retira y notifica para coordinar", async () => {
    const { tools, notify } = setup();
    const invalid = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"efectivo-envio", model:"Elfbar Ice King 40K", quantity:20,
      paymentMethod:"efectivo", deliveryMode:"envio", shippingCostArs:5000
    });
    expect(invalid).toMatchObject({ action:"PAGO_INVALIDO" });
    expect(notify).not.toHaveBeenCalled();

    const pickup = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"efectivo-retiro", model:"Elfbar Ice King 40K", quantity:20,
      paymentMethod:"efectivo", deliveryMode:"retiro", triggerMessage:"Pago en efectivo y retiro"
    });
    expect(pickup).toMatchObject({ action:"COORDINAR_RETIRO", totalArs:292800, state:"WAITING_HUMAN" });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("notifica el comprobante para preparar y enviar", async () => {
    const { tools, notify } = setup();
    const message = "Te mando el comprobante del mayorista";
    const result = await tools.execute("reportar_comprobante_mayorista", {
      channel:"whatsapp", customerId:"comprobante-mayor", model:"Elfbar Ice King 40K", quantity:20,
      deliveryMethod:"Via Cargo", triggerMessage:message
    });
    expect(result).toMatchObject({ action:"PREPARAR_Y_ENVIAR", state:"WAITING_HUMAN" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ messages:[message], reason:expect.stringContaining("venta mayorista") }));
  });
});
