import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogService, extractProductDescription } from "../src/services/catalog-service.js";
import { fixture } from "./helpers.js";

describe("comparación verificada de modelos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extrae la descripción pública de la ficha de Tiendanube", () => {
    expect(extractProductDescription('<meta property="og:description" content="Vape recargable con pantalla y batería de larga duración.">'))
      .toBe("Vape recargable con pantalla y batería de larga duración.");
  });

  it("compara usando las descripciones de las URLs reales", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url:string) => new Response(
      `<meta name="description" content="Descripción verificada para ${url.includes("mixer") ? "Mixer" : "MO 5k"} desde Tiendanube.">`,
      { status:200, headers:{ "content-type":"text/html" } }
    )));

    const result = await new CatalogService(fixture()).compareModels(["Lost Mary MO 5k", "Lost Mary Mixer"]);

    expect(result).toEqual([
      expect.objectContaining({ model:"MO 5k", description:expect.stringContaining("MO 5k"), source:"tiendanube" }),
      expect.objectContaining({ model:"Mixer", description:expect.stringContaining("Mixer"), source:"tiendanube" })
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
