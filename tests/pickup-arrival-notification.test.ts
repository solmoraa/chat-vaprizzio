import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("llegada para retirar una compra", () => {
  it("notifica como venta y no como cambio", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const result = await tools.execute("reportar_llegada_retiro", {
      channel:"whatsapp", customerId:"retiro-venta", status:"afuera", product:"Ignite Watermelon"
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      reason:expect.stringContaining("PARA RETIRAR UNA COMPRA"), products:["Ignite Watermelon"]
    }));
    expect(notify.mock.calls[0]?.[0]?.reason).not.toContain("CAMBIO");
    expect(result).toMatchObject({ action:"AVISADO_RETIRO", customerMessage:"Ya salgo!" });
  });
});
