import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("comprobantes de compras web", () => {
  it.each([
    ["sin_definir", "empezamos a preparar tu pedido"],
    ["envio", "empezamos a preparar tu pedido"],
    ["uber_didi", "cuando salga el vehículo"],
    ["punto_retiro", "coordinar el día y horario de retiro en el local"]
  ])("notifica, agradece y pausa para %s", async (deliveryMode, expectedText) => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_comprobante_web", { channel:"whatsapp", customerId:`comprobante-${deliveryMode}`, deliveryMode, orderReference:"ORD-123" });

    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action:"VERIFICAR_PAGO", state:"WAITING_HUMAN" });
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("Gracias por mandarnos el comprobante!");
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("💜🙌");
    expect(String((result as {customerMessage:string}).customerMessage)).toContain(expectedText);
    expect(String((result as {customerMessage:string}).customerMessage)).toContain("Para cualquier cosa estamos en contacto");
    expect(takeover.canAiReply("whatsapp", `comprobante-${deliveryMode}`)).toBe(false);
  });

  it("omite entrega y retiro cuando la modalidad no está definida", async () => {
    const repo = new ConversationRepository(":memory:");
    const takeover = new TakeoverService(repo, { notify: vi.fn() });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_comprobante_web", {
      channel:"whatsapp", customerId:"comprobante-sin-modalidad", deliveryMode:"sin_definir"
    });
    const message = String((result as {customerMessage:string}).customerMessage);

    expect(message).not.toMatch(/coordinar|entrega|envío|retiro|punto de retiro/i);
  });

  it.each([
    ["vehiculo_enviado", "después de enviar el vehículo"],
    ["al_recibir", "al llegar el pedido"]
  ])("adapta el agradecimiento al momento de pago %s", async (paymentTiming, expectedText) => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_comprobante_web", {
      channel:"whatsapp", customerId:`pago-${paymentTiming}`, deliveryMode:"uber_didi", paymentTiming
    });

    expect(String((result as {customerMessage:string}).customerMessage)).toContain(expectedText);
    expect(String((result as {customerMessage:string}).customerMessage)).not.toContain("cuando salga el vehículo");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("notifica cuando propone pagar después", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Te pago cuando me llegue";

    const result = await tools.execute("reportar_condicion_pago", {
      channel:"whatsapp", customerId:"condicion-pago", proposedTiming:"al_recibir", triggerMessage:message
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ messages:[message], reason:expect.stringContaining("cuando recibe") }));
    expect(result).toMatchObject({ action:"CONSULTAR_CONDICION_PAGO", state:"WAITING_HUMAN" });
  });
});
