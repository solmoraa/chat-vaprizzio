import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("alertas de llegada para cambios", () => {
  it("notifica y pausa cuando el cliente está por llegar", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_llegada_cambio", {
      channel: "whatsapp",
      customerId: "llegada-cambio",
      status: "estoy afuera",
      product: "Elfbar Ice King"
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining("estoy afuera") }));
    expect(result).toMatchObject({ action: "AVISADO", customerMessage: "Dale, te esperamos", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "llegada-cambio")).toBe(false);
  });
});
