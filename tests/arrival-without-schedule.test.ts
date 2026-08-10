import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("cliente viniendo sin horario acordado", () => {
  it("alerta aunque el producto ya esté decidido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T21:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Ya estoy yendo, llevo el Geek Bar Pulse X Miami Mint";

    const result = await tools.execute("reportar_llegada_sin_horario", {
      channel: "whatsapp", customerId: "llegada-sin-horario", arrivalStatus: "ya estoy yendo",
      product: "Geek Bar Pulse X Miami Mint", triggerMessage: message
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.stringContaining("SIN HORARIO ACORDADO"), messages: [message],
      products: ["Geek Bar Pulse X Miami Mint"]
    }));
    expect(result).toMatchObject({ action: "ATENCION_HUMANA", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "llegada-sin-horario")).toBe(false);
    vi.useRealTimers();
  });

  it("después de las 22 rechaza la visita sin alertar ni pausar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T02:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_llegada_sin_horario", {
      channel: "whatsapp", customerId: "llegada-nocturna", arrivalStatus: "llego en 30 minutos",
      product: "Ignite Watermelon", triggerMessage: "puedo pasar en 30m?"
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: "PROGRAMAR_MANANA",
      customerMessage: expect.stringContaining("horario para retiros y envíos ya terminó")
    });
    expect(result).toMatchObject({ customerMessage: expect.stringContaining("Didi o Uber para mañana") });
    expect(takeover.canAiReply("whatsapp", "llegada-nocturna")).toBe(true);
    vi.useRealTimers();
  });
});
