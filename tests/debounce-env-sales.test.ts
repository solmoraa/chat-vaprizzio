import { describe, expect, it, vi } from "vitest";
import { MessageDebouncer } from "../src/services/debouncer.js";
import { loadConfig } from "../src/config/env.js";
import { SalesService } from "../src/services/sales-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { CartService } from "../src/services/cart-service.js";
import { fixture } from "./helpers.js";
describe("seguridad operativa", () => {
  it("espera 10 segundos desde el último mensaje y agrupa la conversación", async () => { vi.useFakeTimers(); const d=new MessageDebouncer(10000); const fn=vi.fn(); d.push("x","Hola",fn); await vi.advanceTimersByTimeAsync(5000); d.push("x","tenes Miami?",fn); await vi.advanceTimersByTimeAsync(9999); expect(fn).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); expect(fn).toHaveBeenCalledWith(["Hola","tenes Miami?"]); vi.useRealTimers(); });
  it("usa 10 segundos como espera predeterminada", () => expect(loadConfig({}).DEBOUNCE_MS).toBe(10000));
  it("impide producción accidental", () => expect(()=>loadConfig({APP_ENV:"production",ALLOW_PRODUCTION:"false"})).toThrow("PRODUCTION_BLOCKED"));
  it("no descuenta stock sin regla de confirmación", async () => { const p=fixture(), r=new ConversationRepository(":memory:"); new CartService(r).add("whatsapp","1","M1",1); await expect(new SalesService(p,r,"disabled").confirm("whatsapp","1",true)).rejects.toThrow("SALE_CONFIRMATION_UNDEFINED"); expect((await p.products()).find(x=>x.sku==="M1")?.stock).toBe(7); });
});
