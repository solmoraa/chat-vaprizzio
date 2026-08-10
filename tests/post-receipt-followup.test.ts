import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("consultas posteriores al comprobante", () => {
  it("no interviene ni repite alertas cuando el humano ya coordina el pedido", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("reportar_comprobante_web", { channel:"whatsapp", customerId:"post-pago", deliveryMode:"sin_definir", triggerMessage:"comprobante" });
    const followup = await tools.execute("reportar_consulta_post_comprobante", { channel:"whatsapp", customerId:"post-pago", question:"puede ser envío por Uber?", requestedMethod:"uber_didi", triggerMessage:"puede ser envío por Uber?" });
    const quote = await tools.execute("solicitar_envio_app", { channel:"whatsapp", customerId:"post-pago", address:"San Justo 1221", triggerMessage:"cuanto me sale aca san justo 1221" });

    expect(followup).toMatchObject({ blocked:true, reason:"HUMAN_COORDINATION_ACTIVE", customerMessage:"NO_REPLY", notificationSent:false });
    expect(quote).toMatchObject({ blocked:true, reason:"HUMAN_COORDINATION_ACTIVE", customerMessage:"NO_REPLY", notificationSent:false });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
