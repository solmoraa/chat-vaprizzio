import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { CatalogService } from "../src/services/catalog-service.js";
import { TakeoverService } from "../src/services/takeover-service.js";
import { fixture } from "./helpers.js";

const setup = () => {
  const repo = new ConversationRepository(":memory:");
  const notify = vi.fn();
  const takeover = new TakeoverService(repo, { notify });
  const tools = new AgentToolService(new CatalogService(fixture()), {} as never, takeover, {} as never, undefined, repo);
  return { tools, notify };
};

describe("precios por cantidad", () => {
  it("mantiene el precio normal hasta 4 y descuenta $2.000 entre 5 y 9", async () => {
    const catalog = new CatalogService(fixture());
    expect(await catalog.priceForOrder("M1", 4, 4)).toMatchObject({ unitPriceArs:26_000, discountPerUnitArs:0, lineTotalArs:104_000 });
    expect(await catalog.priceForOrder("M1", 5, 5)).toMatchObject({ unitPriceArs:24_000, discountPerUnitArs:2_000, lineTotalArs:120_000 });
    expect(await catalog.priceForOrder("M1", 9, 9)).toMatchObject({ unitPriceArs:24_000, discountPerUnitArs:2_000, lineTotalArs:216_000 });
  });

  it("aplica la promoción al total de un pedido mixto", async () => {
    const { tools } = setup();
    const elfbar = await tools.execute("consultar_precio", { channel:"whatsapp", customerId:"mixto", sku:"M1", quantity:3, orderQuantity:5 });
    const ignite = await tools.execute("consultar_precio", { channel:"whatsapp", customerId:"mixto", sku:"M2", quantity:2, orderQuantity:5 });
    expect(elfbar).toMatchObject({ action:"PROMOCION_5_A_9", unitPriceArs:24_000, lineTotalArs:72_000 });
    expect(ignite).toMatchObject({ action:"PROMOCION_5_A_9", unitPriceArs:23_000, lineTotalArs:46_000 });
  });

  it("desde 10 usa la tabla mayorista y no el descuento minorista", async () => {
    const { tools, notify } = setup();
    const result = await tools.execute("consultar_precio", { channel:"instagram", customerId:"mayorista", sku:"M1", quantity:10, orderQuantity:10 });
    expect(result).toMatchObject({ action:"MAYORISTA", currency:"USD", selected:{ from:10, unitPriceUsd:12.8 } });
    expect(result).not.toHaveProperty("discountPerUnitArs");
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifica y pausa si el modelo mayorista no figura en Google Sheets", async () => {
    const { tools, notify } = setup();
    const result = await tools.execute("consultar_precio", { channel:"messenger", customerId:"sin-tabla", sku:"M2", quantity:10, orderQuantity:10, triggerMessage:"Quiero 10 Ignite V250" });
    expect(result).toMatchObject({ action:"CONSULTAR", customerMessage:"Dame un segundo que lo consulto", state:"WAITING_HUMAN" });
    expect(notify).toHaveBeenCalledOnce();
  });
});

describe("uso contextual de enlaces", () => {
  it("prohíbe repetir la web y mantiene los enlaces solo cuando son necesarios", () => {
    const skill = readFileSync("skills/ventas/SKILL.md", "utf8");
    const agents = readFileSync("openclaw/workspace/AGENTS.md", "utf8");
    for (const text of [skill, agents]) {
      expect(text).toMatch(/no (?:lo )?repitas/i);
      expect(text).toContain("precio, stock, sabores, características");
      expect(text).toMatch(/pide el enlace|pide.*cómo comprar/i);
    }
  });
});
