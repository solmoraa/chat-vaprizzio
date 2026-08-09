import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("comprobantes de compras web", () => {
  it.each([
    ["envio", "empezamos a preparar tu pedido"],
    ["uber_didi", "cuando salga el vehículo"],
    ["punto_retiro", "coordinar el punto de retiro"]
  ])("notifica, agradece y pausa para %s", async (deliveryMode, expectedText) => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_comprobante_web", { channel:"whatsapp", customerId:`comprobante-${deliveryMode}`, deliveryMode, orderReference:"ORD-123" });

    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action:"VERIFICAR_PAGO", state:"WAITING_HUMAN" });
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("Gracias por enviarnos el comprobante!");
    expect(String((result as {customerMessage:string}).customerMessage)).toContain(expectedText);
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("Para cualquier cosa estamos en contacto.");
    expect(takeover.canAiReply("whatsapp", `comprobante-${deliveryMode}`)).toBe(false);
  });
});
