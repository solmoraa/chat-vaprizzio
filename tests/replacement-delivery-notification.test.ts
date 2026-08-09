import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("alertas por cambios con envío", () => {
  it("notifica y pausa cuando un reemplazo debe enviarse", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_cambio_envio", {
      channel: "whatsapp",
      customerId: "cambio-envio",
      product: "Elfbar Ice King",
      address: "Villa Lugano",
      reason: "No funciona"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ reason: "Coordinar cambio de producto con envío" }));
    expect(result).toMatchObject({ action: "CONSULTAR", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "cambio-envio")).toBe(false);
  });
});
