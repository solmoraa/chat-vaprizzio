import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("alertas por pedidos no entregados", () => {
  it("notifica y pausa ante un pedido de Uber o Didi no entregado", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_demora_envio", {
      channel: "whatsapp",
      customerId: "reclamo-app",
      carrier: "uber_didi",
      orderReference: "pedido-1"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action: "CONSULTAR", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "reclamo-app")).toBe(false);
  });
});
