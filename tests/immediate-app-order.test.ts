import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("pedido inmediato por Uber o Didi", () => {
  const channels = ["whatsapp", "messenger", "instagram"] as const;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T20:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it.each(channels)(
    "deriva inmediatamente Uber/Didi a una persona en %s",
    async channel => {
      const repo = new ConversationRepository(":memory:");
      const notify = vi.fn();

      const takeover = new TakeoverService(repo, { notify });

      const tools = new AgentToolService(
        {} as never,
        {} as never,
        takeover,
        {} as never
      );

      const result = await tools.execute(
        "reportar_pedido_inmediato_app",
        {
          channel,
          customerId: `pedido-ya-${channel}`,
          product: "Geek Bar Pulse X Miami Mint",
          address: "Av Siempre Viva 742",
          triggerMessage: "Quiero que me lo manden por Uber"
        }
      );

      expect(notify).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        action: "INTERVENCION_HUMANA_UBER_DIDI",
        notificationSent: true
      });

      expect(
        String(
          (result as { customerMessage: string }).customerMessage
        )
      ).not.toMatch(/comprobante|web|productUrl/i);

      expect(
        takeover.canAiReply(
          channel,
          `pedido-ya-${channel}`
        )
      ).toBe(false);
    }
  );

  it("deriva aunque todavía no tenga producto ni dirección", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();

    const takeover = new TakeoverService(repo, { notify });

    const tools = new AgentToolService(
      {} as never,
      {} as never,
      takeover,
      {} as never
    );

    const result = await tools.execute(
      "reportar_pedido_inmediato_app",
      {
        channel: "whatsapp",
        customerId: "pedido-incompleto",
        product: "",
        address: "",
        triggerMessage: "Quiero envío por Didi"
      }
    );

    expect(notify).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      action: "INTERVENCION_HUMANA_UBER_DIDI",
      notificationSent: true
    });

    expect(
      takeover.canAiReply(
        "whatsapp",
        "pedido-incompleto"
      )
    ).toBe(false);
  });

  it("Uber/Didi deriva a humano incluso después de las 22", async () => {
    vi.setSystemTime(new Date("2026-08-10T01:05:00Z"));

    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();

    const takeover = new TakeoverService(repo, { notify });

    const tools = new AgentToolService(
      {} as never,
      {} as never,
      takeover,
      {} as never
    );

    const result = await tools.execute(
      "reportar_pedido_inmediato_app",
      {
        channel: "whatsapp",
        customerId: "pedido-22",
        product: "Pulse X",
        address: "Dirección 123",
        triggerMessage: "Mandamelo por Uber"
      }
    );

    expect(notify).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      action: "INTERVENCION_HUMANA_UBER_DIDI",
      notificationSent: true
    });

    expect(
      String(
        (result as { customerMessage: string }).customerMessage
      )
    ).not.toMatch(/comprobante|web/i);

    expect(
      takeover.canAiReply(
        "whatsapp",
        "pedido-22"
      )
    ).toBe(false);
  });
});