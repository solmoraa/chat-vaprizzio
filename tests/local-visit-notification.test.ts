import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("coordinación de visitas al local", () => {
  it.each(["retiro", "cambio"])("notifica y pausa para coordinar un %s", async (visitType) => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("coordinar_visita_local", {
      channel: "whatsapp",
      customerId: `visita-${visitType}`,
      visitType,
      product: "Elfbar Ice King",
      preferredTime: "18 hs"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action: "COORDINAR_HORARIO", customerMessage: "Dame un segundo que coordinamos el horario", state: "WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", `visita-${visitType}`)).toBe(false);
  });
});
