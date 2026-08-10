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

  it("no vuelve a responder ni alertar mientras continúa una persona", async () => {
    const { notify, tools } = setup();
    await tools.execute("evaluar_producto_fallado", {
      channel:"whatsapp", customerId:"reclamo-atendido", daysSincePurchase:2, problem:"Anda mal"
    });

    const followup = await tools.execute("evaluar_producto_fallado", {
      channel:"whatsapp", customerId:"reclamo-atendido", daysSincePurchase:2, problem:"Tiene gusto a quemado"
    });

    expect(followup).toMatchObject({
      blocked:true,
      reason:"HUMAN_COORDINATION_ACTIVE",
      customerMessage:"NO_REPLY",
      notificationSent:false
    });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("un saludo con un reclamo nuevo reactiva aunque el caso anterior estuviera pausado", async () => {
    const { notify, takeover, tools } = setup();
    await takeover.request("whatsapp", "nuevo-reclamo", "Cliente afuera por una compra");
    notify.mockClear();

    const result = await tools.execute("evaluar_producto_fallado", {
      channel:"whatsapp",
      customerId:"nuevo-reclamo",
      daysSincePurchase:2,
      problem:"Anda mal",
      triggerMessage:"hola! compre hace dos dias y anda mal el vape"
    });

    expect(result).toMatchObject({
      action:"CONSULTAR",
      eligible:true,
      customerMessage:"Dame un minuto que lo consulto"
    });
    expect(notify).toHaveBeenCalledOnce();
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
