import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("pausa humana estricta", () => {
  it("suprime respuestas y alertas consecutivas del mismo asunto", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T15:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("solicitar_intervencion_humana", { channel:"whatsapp", customerId:"repetido", reason:"Primer evento" });
    vi.setSystemTime(new Date("2026-08-09T15:20:00Z"));
    const second = await tools.execute("reportar_condicion_pago", { channel:"whatsapp", customerId:"repetido", proposedTiming:"al_recibir", triggerMessage:"puedo pagar mitad por MP y mitad en efectivo?" });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ blocked:true, reason:"HUMAN_COORDINATION_ACTIVE", customerMessage:"NO_REPLY", notificationSent:false });
    expect(repo.getOrCreate("whatsapp", "repetido")).toMatchObject({ state:"WAITING_HUMAN", pausedUntil:null });
    vi.useRealTimers();
  });
  it("no vuelve a alertar aunque cambie el motivo o pase tiempo", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-09T15:00:00Z"));
    const repo = new ConversationRepository(":memory:"); const notify = vi.fn(); const takeover = new TakeoverService(repo, { notify });
    takeover.recordCustomerMessage("whatsapp", "duplicado", "mismo mensaje");
    await takeover.request("whatsapp", "duplicado", "mismo motivo");
    await takeover.request("whatsapp", "duplicado", "otro motivo");
    expect(notify).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await takeover.request("whatsapp", "duplicado", "tercer motivo");
    expect(notify).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("mantiene las alertas de cercanía y la respuesta al estar afuera", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never, undefined, repo);

    await tools.execute("coordinar_visita_local", { channel:"whatsapp", customerId:"llegando", visitType:"retiro", triggerMessage:"a qué hora puedo pasar?" });
    const near = await tools.execute("reportar_llegada_retiro", { channel:"whatsapp", customerId:"llegando", status:"estoy a unas cuadras", triggerMessage:"estoy a unas cuadras" });
    const outside = await tools.execute("reportar_llegada_retiro", { channel:"whatsapp", customerId:"llegando", status:"estoy afuera", triggerMessage:"estoy afuera" });

    expect(notify).toHaveBeenCalledTimes(3);
    expect(near).toMatchObject({ action:"AVISADO_RETIRO", customerMessage:"Dale, te esperamos" });
    expect(outside).toMatchObject({ action:"AVISADO_RETIRO", customerMessage:"Ya salgo!" });
    expect(takeover.canAiReply("whatsapp", "llegando")).toBe(false);
  });
});
