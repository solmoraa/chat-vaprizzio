import { describe, expect, it, vi } from "vitest";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { CartService } from "../src/services/cart-service.js";
import { TakeoverService } from "../src/services/takeover-service.js";
describe("carrito y takeover", () => {
  it("suma y corrige cantidades sin agregar productos", () => { const r=new ConversationRepository(":memory:"); const c=new CartService(r); c.add("whatsapp","1","M1",2); c.add("whatsapp","1","T1",1); c.set("whatsapp","1","M1",1); expect(c.get("whatsapp","1")).toEqual([{sku:"T1",quantity:1},{sku:"M1",quantity:1}]); });
  it("bloquea IA durante takeover y reanuda explícitamente", async () => { const r=new ConversationRepository(":memory:"); const notify=vi.fn(); const t=new TakeoverService(r,{notify}); await t.request("whatsapp","1","Mayorista",50); expect(t.canAiReply("whatsapp","1")).toBe(false); t.humanMessage("whatsapp","1","por 50 te los dejo a 19.500"); expect(r.getOrCreate("whatsapp","1").negotiatedPrice?.unitPrice).toBe(19500); expect(t.canAiReply("whatsapp","1")).toBe(false); t.resume("whatsapp","1"); expect(t.canAiReply("whatsapp","1")).toBe(true); });
});
