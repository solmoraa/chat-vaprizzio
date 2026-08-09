import { describe, expect, it, vi } from "vitest";
import { ConversationRepository } from "../src/database/conversation-repository.js";

describe("ciclo de conversación", () => {
  it("limpia todo el estado al cerrar explícitamente", () => {
    const repo = new ConversationRepository(":memory:", 120);
    const conversation = repo.getOrCreate("whatsapp", "cliente");
    conversation.currentProduct = "Vape anterior";
    conversation.cart = [{ sku:"SKU", quantity:2 }];
    conversation.lastMessages = ["conversación anterior"];
    repo.save(conversation);

    const closed = repo.close("whatsapp", "cliente");
    expect(closed).toMatchObject({ state:"AI_ACTIVE", currentProduct:null, cart:[], lastMessages:[], pausedUntil:null });
  });

  it("reinicia automáticamente después del tiempo de inactividad", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:00:00Z"));
    const repo = new ConversationRepository(":memory:", 120);
    const conversation = repo.getOrCreate("whatsapp", "cliente-idle");
    conversation.currentProduct = "Vape anterior"; repo.save(conversation);
    vi.setSystemTime(new Date("2026-08-09T12:00:01Z"));
    expect(repo.getOrCreate("whatsapp", "cliente-idle")).toMatchObject({ currentProduct:null, cart:[], lastMessages:[], state:"AI_ACTIVE" });
    vi.useRealTimers();
  });
});
