import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("consultas posteriores al comprobante", () => {
  it("responde y alerta una vez por Uber, luego espera en silencio", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("reportar_comprobante_web", { channel:"whatsapp", customerId:"post-pago", deliveryMode:"sin_definir", triggerMessage:"comprobante" });
    const first = await tools.execute("reportar_consulta_post_comprobante", { channel:"whatsapp", customerId:"post-pago", question:"puede ser envío por Uber?", requestedMethod:"uber_didi", triggerMessage:"puede ser envío por Uber?" });
    const second = await tools.execute("reportar_consulta_post_comprobante", { channel:"whatsapp", customerId:"post-pago", question:"me confirmás?", requestedMethod:"otro", triggerMessage:"me confirmás?" });

    expect(first).toMatchObject({ action:"RESPONDER_Y_DERIVAR", customerMessage:"Sii, se puede enviar por Uber. Dame un segundo que lo coordino" });
    expect(second).toMatchObject({ action:"ESPERAR_HUMANO", customerMessage:"NO_REPLY", notificationSent:false });
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
