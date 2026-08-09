import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

const setup = () => {
  const repo = new ConversationRepository(":memory:");
  const notify = vi.fn();
  const takeover = new TakeoverService(repo, { notify });
  const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
  return { notify, takeover, tools };
};

describe("plazo para productos fallados", () => {
  it("notifica y pausa si pasaron 2 días o menos", async () => {
    const { notify, takeover, tools } = setup();
    const result = await tools.execute("evaluar_producto_fallado", { channel:"whatsapp", customerId:"dentro-plazo", daysSincePurchase:2, product:"Vape", problem:"No funciona" });
    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action:"CONSULTAR", eligible:true, customerMessage:"Dame un minuto que lo consulto", state:"WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "dentro-plazo")).toBe(false);
  });

  it("rechaza cordialmente sin notificar si pasaron más de 2 días", async () => {
    const { notify, takeover, tools } = setup();
    const result = await tools.execute("evaluar_producto_fallado", { channel:"whatsapp", customerId:"fuera-plazo", daysSincePurchase:3 });
    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action:"FUERA_DE_PLAZO", eligible:false });
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("como se aclara en la página");
    expect(takeover.canAiReply("whatsapp", "fuera-plazo")).toBe(true);
  });
});
