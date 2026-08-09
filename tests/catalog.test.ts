import { describe, expect, it } from "vitest";
import { CatalogService } from "../src/services/catalog-service.js";
import { fixture } from "./helpers.js";
describe("catálogo anti-alucinación", () => {
  it("busca un sabor en todas las marcas y excluye inactivos", async () => { const r = await new CatalogService(fixture()).byFlavor("Miami Mint"); expect(r.matches.map(x=>x.sku)).toEqual(["M1","M2"]); });
  it("tolera un error razonable", async () => { const r = await new CatalogService(fixture()).byFlavor("maimi mint"); expect(r.matches).toHaveLength(2); });
  it("no ofrece agotados al listar modelo", async () => { const r = await new CatalogService(fixture()).byModel("Ice King"); expect(r.matches.map(x=>x.sku)).toEqual(expect.arrayContaining(["M1","T1"])); expect(r.matches.map(x=>x.sku)).not.toContain("OOS"); });
  it("recomienda solo disponibles", async () => { const r = await new CatalogService(fixture()).byProfile("dulce"); expect(r.map(x=>x.sku)).toEqual(["T1"]); });
  it("no inventa mayorista fuera de la tabla", async () => { const s = new CatalogService(fixture()); expect((await s.wholesale(10))?.unitPrice).toBe(22000); expect((await s.wholesale(50))?.action).toBe("CONSULTAR"); expect(await s.wholesale(2)).toBeNull(); });
});
