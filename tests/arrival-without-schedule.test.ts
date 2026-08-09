import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("cliente viniendo sin horario acordado", () => {
  it("alerta aunque el producto ya esté decidido", async () => {
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
  });
});
