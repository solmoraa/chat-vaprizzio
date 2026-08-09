import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("cliente próximo sin producto decidido", () => {
  it("envía alerta urgente con el mensaje original y pausa", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Estoy a dos cuadras pero todavía no sé cuál llevar";

    const result = await tools.execute("reportar_llegada_sin_producto", { channel:"whatsapp", customerId:"indeciso-cerca", arrivalStatus:"a dos cuadras", triggerMessage:message });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ reason:expect.stringContaining("SIN VAPE DECIDIDO"), messages:[message] }));
    expect(result).toMatchObject({ action:"ATENCION_HUMANA", customerMessage:"Dale, ya te atiendo!", state:"WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "indeciso-cerca")).toBe(false);
  });
});
