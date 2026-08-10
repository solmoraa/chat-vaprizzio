import { describe, expect, it, vi } from "vitest";
import { MessageDebouncer } from "../src/services/debouncer.js";
import { loadConfig } from "../src/config/env.js";
import { SalesService } from "../src/services/sales-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { CartService } from "../src/services/cart-service.js";
import { fixture } from "./helpers.js";
describe("seguridad operativa", () => {
  it("espera 6 segundos desde el último mensaje y agrupa la conversación", async () => { vi.useFakeTimers(); const d=new MessageDebouncer(6000); const fn=vi.fn(); d.push("x","Hola",fn); await vi.advanceTimersByTimeAsync(3000); d.push("x","tenes Miami?",fn); await vi.advanceTimersByTimeAsync(5999); expect(fn).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); expect(fn).toHaveBeenCalledWith(["Hola","tenes Miami?"]); vi.useRealTimers(); });
  it("usa 6 segundos como espera predeterminada", () => expect(loadConfig({}).DEBOUNCE_MS).toBe(6000));
  it("conserva el contexto durante 12 horas de inactividad", () => expect(loadConfig({}).CONVERSATION_IDLE_MINUTES).toBe(720));
  it("impide producción accidental", () => expect(()=>loadConfig({APP_ENV:"production",ALLOW_PRODUCTION:"false"})).toThrow("PRODUCTION_BLOCKED"));
  it("impide producción sin tokens internos robustos", () => expect(()=>loadConfig({APP_ENV:"production",ALLOW_PRODUCTION:"true",CATALOG_PROVIDER:"sheets"})).toThrow("tokens internos"));
  it("no descuenta stock sin regla de confirmación", async () => { const p=fixture(), r=new ConversationRepository(":memory:"); new CartService(r).add("whatsapp","1","M1",1); await expect(new SalesService(p,r,"disabled").confirm("whatsapp","1",true)).rejects.toThrow("SALE_CONFIRMATION_UNDEFINED"); expect((await p.products()).find(x=>x.sku==="M1")?.stock).toBe(7); });
});
