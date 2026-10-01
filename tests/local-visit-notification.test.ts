import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import type { Channel } from "../src/domain/types.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("punto de retiro y coordinación humana", () => {
  it("prueba 1: informa un punto de retiro gratuito, no un local a la calle", async () => {
    const repo = new ConversationRepository(":memory:");
    const tools = new AgentToolService({} as never, {} as never, new TakeoverService(repo, { notify:vi.fn() }), {} as never);

    const result = await tools.execute("consultar_entrega", {
      channel:"whatsapp", customerId:"direccion-retiro", method:"retiro"
    });

    expect(result).toEqual({
      method:"RETIRO",
      type:"PUNTO_DE_RETIRO_GRATUITO",
      price:0,
      address:"Av. Larrazábal 3437, Villa Lugano, CABA",
      storefront:false
    });
    expect(JSON.stringify(result)).not.toMatch(/local a la calle|tienda f[ií]sica/i);
  });

  it.each<Channel>(["whatsapp", "instagram", "messenger"])("prueba 2: %s alerta por el horario propuesto, no lo confirma y queda en silencio", async (channel) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T18:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never, undefined, repo);
    const customerId = `horario-${channel}`;

    const result = await tools.execute("coordinar_visita_local", {
      channel,
      customerId,
      visitType:"retiro",
      product:"Geek Bar",
      preferredTime:"tipo 16 hs",
      triggerMessage:"Sisi tenía pensado ir tipo 16 hs aprox"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      channel,
      customerId,
      reason:expect.stringContaining("punto de retiro"),
      products:expect.arrayContaining(["Geek Bar", "Horario propuesto: tipo 16 hs"])
    }));
    expect(result).toMatchObject({
      action:"COORDINAR_HORARIO",
      customerMessage:"Dame un segundo que coordinamos el horario",
      pickupType:"PUNTO_DE_RETIRO_GRATUITO",
      scheduleConfirmed:false,
      state:"WAITING_HUMAN"
    });
    expect(JSON.stringify(result)).not.toMatch(/te esperamos a las|horario confirmado/i);

    const followingMessage = await tools.execute("consultar_entrega", {
      channel,
      customerId,
      method:"retiro",
      triggerMessage:"puedo pagar en efectivo?"
    });
    expect(followingMessage).toMatchObject({
      blocked:true,
      customerMessage:"NO_REPLY",
      notificationSent:false
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(takeover.canAiReply(channel, customerId)).toBe(false);
    vi.useRealTimers();
  });

  it.each<Channel>(["whatsapp", "instagram", "messenger"])("fuera de horario informa mañana y alerta a %s", async (channel) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T22:30:00Z")); // 19:30 en Buenos Aires
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never, undefined, repo);

    const result = await tools.execute("coordinar_visita_local", {
      channel,
      customerId:`manana-${channel}`,
      visitType:"retiro",
      product:"Elfbar Ice King",
      preferredTime:"mañana a las 11",
      triggerMessage:"Puedo pasar mañana a las 11?"
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      channel,
      reason:expect.stringContaining("terminó por hoy")
    }));
    expect(result).toMatchObject({
      action:"COORDINAR_MANANA",
      customerMessage:"ℹ️ Información importante\nEl horario de retiro por Av. Larrazábal 3437 es de 10 a 19 hs.\n\nEl horario de retiro por hoy ya terminó. Podrías pasar mañana; dame un segundo que coordinamos el horario.",
      state:"WAITING_HUMAN"
    });
    expect(JSON.stringify(result)).not.toMatch(/vaprizzio\.com|Uber|Didi/i);
    vi.useRealTimers();
  });
});
