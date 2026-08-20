import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CatalogService } from "../src/services/catalog-service.js";
import { fixture } from "./helpers.js";

describe("selección de un sabor o producto específico", () => {
  it("devuelve solo el producto disponible y su enlace exacto", async () => {
    const provider = fixture();
    const originalProducts = await provider.products();
    provider.products = async () => [
      ...originalProducts,
      {
        sku:"CS1",
        brand:"Elfbar",
        model:"Ice King 40K",
        flavor:"Cherry Strazz",
        stock:2,
        price:26000,
        profile:["dulce"],
        description:"Cereza frutal",
        active:true,
        productUrl:"https://www.vaprizzio.com/productos/elfbar-ice-king-40k/"
      }
    ];
    const result = await new CatalogService(provider).byFlavor("Cherry Strazz");

    expect(result).toMatchObject({ status:"AVAILABLE", ambiguous:false, unavailableMatches:[] });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      sku:"CS1",
      flavor:"Cherry Strazz",
      productUrl:"https://www.vaprizzio.com/productos/elfbar-ice-king-40k/"
    });
  });

  it("distingue un producto agotado de uno inexistente", async () => {
    const service = new CatalogService(fixture());
    const exhausted = await service.specific("Elfbar Ice King 40K", "Cherry Fuse");
    const missing = await service.byFlavor("Sabor que no existe");

    expect(exhausted).toMatchObject({ status:"OUT_OF_STOCK", matches:[] });
    expect(exhausted.unavailableMatches.map(product => product.sku)).toEqual(["OOS"]);
    expect(missing).toMatchObject({ status:"NOT_FOUND", matches:[], unavailableMatches:[] });
  });

  it("prohíbe usar el catálogo completo y limita el dato del Ice King", () => {
    const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
    const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");
    const plugin = readFileSync(new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url), "utf8");

    for (const instructions of [agents, skill, plugin]) {
      expect(instructions).toContain("Cherry Strazz");
      expect(instructions).toMatch(/(prohibido|nunca).+listar_catalogo/is);
      expect(instructions).toMatch(/OUT_OF_STOCK.+(no queda stock|agotado)/is);
      expect(instructions).toMatch(/botón.+frescura.+(únicamente|solamente).+(información|características|comparación|recomendación)/is);
    }
  });
});
