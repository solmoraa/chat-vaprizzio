import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("pedido inmediato por Uber o Didi", () => {
  it("notifica cuando ya hay producto, confirmación y dirección", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Dale, mandame el Pulse X Miami Mint a Av Siempre Viva 742";

    const result = await tools.execute("reportar_pedido_inmediato_app", {
      channel: "whatsapp", customerId: "pedido-ya", product: "Geek Bar Pulse X Miami Mint",
      address: "Av Siempre Viva 742", triggerMessage: message
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      reason: "Pedido inmediato confirmado para enviar por Uber o Didi", messages: [message],
      products: ["Geek Bar Pulse X Miami Mint", "Dirección: Av Siempre Viva 742"]
    }));
    expect(result).toMatchObject({ action: "COORDINAR_ENVIO_APP", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "pedido-ya")).toBe(false);
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
    expect(result).toMatchObject({ action: "PEDIR_DATOS", requires: ["product", "address"] });
  });

  it("desde las 22 no ofrece envío inmediato ni notifica", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T01:05:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_pedido_inmediato_app", {
      channel:"whatsapp", customerId:"pedido-22", product:"Pulse X", address:"Dirección 123"
    });

    expect(result).toMatchObject({ action:"PROGRAMAR_MANANA", customerMessage:expect.stringContaining("mañana") });
    expect(notify).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
