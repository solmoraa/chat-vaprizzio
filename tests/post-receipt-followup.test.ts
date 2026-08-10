import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("consultas posteriores al comprobante", () => {
  it("responde una vez por Uber y luego solo vuelve a alertar", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("reportar_comprobante_web", { channel:"whatsapp", customerId:"post-pago", deliveryMode:"sin_definir", triggerMessage:"comprobante" });
    const first = await tools.execute("reportar_consulta_post_comprobante", { channel:"whatsapp", customerId:"post-pago", question:"puede ser envío por Uber?", requestedMethod:"uber_didi", triggerMessage:"puede ser envío por Uber?" });
    const second = await tools.execute("reportar_consulta_post_comprobante", { channel:"whatsapp", customerId:"post-pago", question:"me confirmás?", requestedMethod:"otro", triggerMessage:"me confirmás?" });

    expect(first).toMatchObject({ action:"RESPONDER_Y_DERIVAR", customerMessage:"Sii, se puede enviar por Uber. Dame un segundo que lo coordino" });
    expect(second).toMatchObject({ action:"SOLO_NOTIFICAR", customerMessage:"NO_REPLY" });
    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify.mock.calls[2]?.[0]?.reason).toContain("RESPONDER URGENTE");
  });
});
