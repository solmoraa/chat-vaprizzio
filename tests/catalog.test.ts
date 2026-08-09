import { describe, expect, it } from "vitest";
import { CatalogService } from "../src/services/catalog-service.js";
import { fixture } from "./helpers.js";
describe("catálogo anti-alucinación", () => {
  it("busca un sabor en todas las marcas y excluye inactivos", async () => { const r = await new CatalogService(fixture()).byFlavor("Miami Mint"); expect(r.matches.map(x=>x.sku)).toEqual(["M1","M2"]); });
  it("tolera un error razonable", async () => { const r = await new CatalogService(fixture()).byFlavor("maimi mint"); expect(r.matches).toHaveLength(2); });
  it("no ofrece agotados al listar modelo", async () => { const r = await new CatalogService(fixture()).byModel("Ice King"); expect(r.matches.map(x=>x.sku)).toEqual(expect.arrayContaining(["M1","T1"])); expect(r.matches.map(x=>x.sku)).not.toContain("OOS"); });
  it("recomienda solo disponibles", async () => { const r = await new CatalogService(fixture()).byProfile("dulce"); expect(r.map(x=>x.sku)).toEqual(["T1"]); });
  it("arma la lista completa sin productos agotados ni inactivos", async () => { const r = await new CatalogService(fixture()).priceList(); expect(r.flatMap(x => x.variants.map(v => v.flavor))).not.toContain("Cherry Fuse"); expect(r.map(x => `${x.brand} ${x.model}`)).not.toContain("Fake Fake"); expect(r.find(x => x.brand === "Elfbar")?.variants).toEqual(expect.arrayContaining([{flavor:"Miami Mint",price:26000},{flavor:"Tiger Blood",price:26000}])); });
  it("devuelve la escala mayorista completa y selecciona el tramo", async () => { const s = new CatalogService(fixture()); const quote = await s.wholesale("elfbar king", 52); expect(quote?.tiers.map(x => x.from)).toEqual([10,20,50,100,200]); expect(quote?.selected?.unitPriceUsd).toBe(11.80); });
  it("no inventa un modelo mayorista que no existe", async () => { expect(await new CatalogService(fixture()).wholesale("Modelo inexistente", 20)).toBeNull(); });
  it("lista automáticamente todos los modelos y escalas mayoristas", async () => {
    const result = await new CatalogService(fixture()).wholesaleList();
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(item => item.tiers.length > 0)).toBe(true);
  });
});
