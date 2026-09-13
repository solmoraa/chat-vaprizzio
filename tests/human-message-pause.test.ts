import { describe, expect, it, vi } from "vitest";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("pausa automática por mensaje humano", () => {
  it("bloquea la IA durante dos horas incluso ante un saludo del cliente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T15:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const takeover = new TakeoverService(repo, { notify: vi.fn() });

    takeover.humanMessage("whatsapp", "cliente", "Ya salgo! Disculpá la demora");
    expect(repo.getOrCreate("whatsapp", "cliente").pausedUntil).toBe("2026-09-13T17:00:00.000Z");

    vi.setSystemTime(new Date("2026-09-13T16:00:00Z"));
    takeover.resumeFromCustomerMessage("whatsapp", "cliente");
    expect(takeover.canAiReply("whatsapp", "cliente")).toBe(false);

    vi.setSystemTime(new Date("2026-09-13T17:00:01Z"));
    expect(takeover.canAiReply("whatsapp", "cliente")).toBe(true);
    expect(repo.getOrCreate("whatsapp", "cliente")).toMatchObject({
      state: "AI_ACTIVE",
      pausedUntil: null,
    });
    vi.useRealTimers();
  });
});
