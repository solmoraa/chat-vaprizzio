import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { CatalogService } from "../src/services/catalog-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";
import { FixtureCatalogProvider } from "../src/catalog/fixture-provider.js";
import { fixture, flavors, products, tiers } from "./helpers.js";

const setup = () => {
  const repo = new ConversationRepository(":memory:");
  const notify = vi.fn();
  const takeover = new TakeoverService(repo, { notify });
  const tools = new AgentToolService(new CatalogService(fixture()), {} as never, takeover, {} as never, undefined, repo);
  return { tools, notify, takeover, repo };
};

describe("cierre de venta mayorista fuera de la web", () => {
  it("convierte a pesos, suma envío y entrega los datos de transferencia", async () => {
    const { tools, notify } = setup();
    const result = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"mayor-envio", model:"Elfbar Ice King 40K", quantity:10,
      paymentMethod:"transferencia", deliveryMode:"envio", shippingCostArs:5000, customerConfirmed:true
    });
    expect(result).toMatchObject({ action:"ESPERAR_COMPROBANTE", subtotalArs:153600, shippingCostArs:5000, totalArs:158600,
      bank:{ alias:"Fabri.moraa", cvu:"0000003100052918257843", holder:"Fabrizio Tomas Mora" } });
    expect(notify).not.toHaveBeenCalled();
  });

  it("solo permite efectivo cuando retira y notifica para coordinar", async () => {
    const { tools, notify } = setup();
    const invalid = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"efectivo-envio", model:"Elfbar Ice King 40K", quantity:10,
      paymentMethod:"efectivo", deliveryMode:"envio", shippingCostArs:5000, customerConfirmed:true
    });
    expect(invalid).toMatchObject({ action:"PAGO_INVALIDO" });
    expect(notify).not.toHaveBeenCalled();

    const pickup = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"efectivo-retiro", model:"Elfbar Ice King 40K", quantity:10,
      paymentMethod:"efectivo", deliveryMode:"retiro", customerConfirmed:true, triggerMessage:"Pago en efectivo y retiro"
    });
    expect(pickup).toMatchObject({ action:"COORDINAR_RETIRO", totalArs:153600, state:"WAITING_HUMAN" });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("exige confirmación antes de reservar y mostrar datos bancarios", async () => {
    const { tools, repo } = setup();
    const preview = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"confirmacion", model:"Elfbar Ice King 40K", quantity:10,
      paymentMethod:"transferencia", deliveryMode:"retiro", customerConfirmed:false
    });
    expect(preview).toMatchObject({ action:"PEDIR_CONFIRMACION", summary:{ totalArs:153600 } });
    expect(preview).not.toHaveProperty("bank");
    expect(repo.reservedWholesaleByOthers("whatsapp", "otro", "Elfbar Ice King 40K")).toBe(0);
  });

  it("evita reservar las mismas unidades para dos clientes", async () => {
    const { tools, notify } = setup();
    const common = { channel:"whatsapp", model:"Elfbar Ice King 40K", quantity:10, paymentMethod:"transferencia", deliveryMode:"retiro", customerConfirmed:true };
    expect(await tools.execute("preparar_venta_mayorista", { ...common, customerId:"cliente-a" })).toMatchObject({ action:"COORDINAR_RETIRO" });
    expect(await tools.execute("preparar_venta_mayorista", { ...common, customerId:"cliente-b" })).toMatchObject({ action:"STOCK_INSUFICIENTE", available:1 });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("calcula el total conjunto de varios modelos", async () => {
    const stockedProducts = structuredClone(products);
    stockedProducts.find(product => product.model === "V250")!.stock = 25;
    const provider = new FixtureCatalogProvider(stockedProducts, flavors, [
      ...tiers,
      { model:"Ignite V250", from:10, unitPriceUsd:12.50 },
      { model:"Ignite V250", from:20, unitPriceUsd:12.20 }
    ], { VALOR_USDT:"1200" });
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const tools = new AgentToolService(new CatalogService(provider), {} as never, new TakeoverService(repo, { notify }), {} as never, undefined, repo);

    const result = await tools.execute("preparar_venta_mayorista", {
      channel:"whatsapp", customerId:"pedido-mixto",
      items:[{ model:"Elfbar Ice King 40K", quantity:10 }, { model:"Ignite V250", quantity:20 }],
      paymentMethod:"transferencia", deliveryMode:"retiro", customerConfirmed:false
    });

    expect(result).toMatchObject({ action:"PEDIR_CONFIRMACION", customerMessage:expect.stringContaining("10 Elfbar Ice King 40K + 20 Ignite V250"), summary:{ subtotalArs:446400, totalArs:446400 } });
    expect(notify).not.toHaveBeenCalled();
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
