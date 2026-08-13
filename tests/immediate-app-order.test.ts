import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("pedido inmediato por Uber o Didi", () => {
  const channels = ["whatsapp", "messenger", "instagram"] as const;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T20:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it.each(channels)("manda primero a comprar por la web en %s y recuerda el comprobante sin alertar antes", async channel => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Dale, mandame el Pulse X Miami Mint a Av Siempre Viva 742";

    const result = await tools.execute("reportar_pedido_inmediato_app", {
      channel, customerId: `pedido-ya-${channel}`, product: "Geek Bar Pulse X Miami Mint",
      address: "Av Siempre Viva 742", productUrl:"https://www.vaprizzio.com/productos/geek-bar-pulse-x1/", triggerMessage: message
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action:"COMPLETAR_COMPRA_WEB",
      productUrl:"https://www.vaprizzio.com/productos/geek-bar-pulse-x1/",
      notificationSent:false,
      customerMessage:expect.stringContaining("Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊")
    });
    expect(takeover.canAiReply(channel, `pedido-ya-${channel}`)).toBe(true);
  });

  it("pide lo que falta sin enviar una alerta prematura", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_pedido_inmediato_app", {
      channel: "whatsapp", customerId: "pedido-incompleto", product: "", address: ""
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: "PEDIR_PRODUCTO", requires: ["product"] });
  });

  it("desde las 22 no ofrece envío inmediato ni notifica", async () => {
    vi.setSystemTime(new Date("2026-08-10T01:05:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_pedido_inmediato_app", {
      channel:"whatsapp", customerId:"pedido-22", product:"Pulse X", address:"Dirección 123"
    });

    expect(result).toMatchObject({
      action:"PROGRAMAR_MANANA",
      customerMessage:expect.stringContaining("Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊")
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
