import { describe, expect, it, vi } from "vitest";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { CartService } from "../src/services/cart-service.js";
import { TakeoverService } from "../src/services/takeover-service.js";
describe("carrito y takeover", () => {
  it("suma y corrige cantidades sin agregar productos", () => { const r=new ConversationRepository(":memory:"); const c=new CartService(r); c.add("whatsapp","1","M1",2); c.add("whatsapp","1","T1",1); c.set("whatsapp","1","M1",1); expect(c.get("whatsapp","1")).toEqual([{sku:"T1",quantity:1},{sku:"M1",quantity:1}]); });
  it("bloquea IA durante takeover y reanuda explícitamente", async () => { const r=new ConversationRepository(":memory:"); const notify=vi.fn(); const t=new TakeoverService(r,{notify}); await t.request("whatsapp","1","Mayorista",50); expect(t.canAiReply("whatsapp","1")).toBe(false); t.humanMessage("whatsapp","1","por 50 te los dejo a 19.500"); expect(r.getOrCreate("whatsapp","1").negotiatedPrice?.unitPrice).toBe(19500); expect(t.canAiReply("whatsapp","1")).toBe(false); t.resume("whatsapp","1"); expect(t.canAiReply("whatsapp","1")).toBe(true); });
  it("mantiene la pausa humana hasta una reanudación explícita", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-09T15:00:00Z"));
    const r=new ConversationRepository(":memory:"); const t=new TakeoverService(r,{notify:vi.fn()});
    await t.request("whatsapp","demora","Pedido Flex demorado");
    const pausedUntil=r.getOrCreate("whatsapp","demora").pausedUntil;
    vi.setSystemTime(new Date("2026-08-09T15:30:00Z")); const c=r.getOrCreate("whatsapp","demora"); c.lastActivity=new Date().toISOString(); r.save(c);
    expect(r.getOrCreate("whatsapp","demora").pausedUntil).toBe(pausedUntil); expect(t.canAiReply("whatsapp","demora")).toBe(false);
    vi.setSystemTime(new Date("2026-08-09T20:00:01Z")); expect(t.canAiReply("whatsapp","demora")).toBe(false); expect(r.getOrCreate("whatsapp","demora").pausedUntil).toBeNull();
    t.resume("whatsapp", "demora"); expect(t.canAiReply("whatsapp", "demora")).toBe(true);
    vi.useRealTimers();
  });
});
