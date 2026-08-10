import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("recordatorio urgente de cliente afuera", () => {
  it("vuelve a notificar inmediatamente y con mayor urgencia", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("reportar_llegada_retiro", { channel:"whatsapp", customerId:"esperando", status:"afuera", product:"Ignite" });
    const reminder = await tools.execute("reportar_recordatorio_afuera", { channel:"whatsapp", customerId:"esperando", context:"retiro", product:"Ignite", triggerMessage:"sigo afuera, salen?" });

    expect(notify).toHaveBeenCalledTimes(2);
    const urgentReason = notify.mock.calls[1]?.[0]?.reason as string;
    expect(urgentReason).toContain("🚨🚨🚨");
    expect(urgentReason).toContain("SALIR URGENTE");
    expect(urgentReason).toContain("PARA RETIRAR UNA COMPRA");
    expect(reminder).toMatchObject({ action:"RECORDATORIO_URGENTE", customerMessage:"Ya salgo! Disculpá la demora" });
  });
});
