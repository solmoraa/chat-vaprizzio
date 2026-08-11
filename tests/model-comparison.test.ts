import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogService, extractProductDescription, extractProductSpecifications } from "../src/services/catalog-service.js";
import { fixture } from "./helpers.js";

describe("comparación verificada de modelos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extrae la descripción pública de la ficha de Tiendanube", () => {
    expect(extractProductDescription('<meta property="og:description" content="Vape recargable con pantalla y batería de larga duración.">'))
      .toBe("Vape recargable con pantalla y batería de larga duración.");
  });

  it("conserva literalmente la cantidad de pitadas de la descripción", () => {
    expect(extractProductSpecifications("Vape Ignite v-nano de mil pitadas con batería integrada."))
      .toEqual({ puffs:"1.000 pitadas" });
    expect(extractProductSpecifications("Ofrece 1mil pitadas, una vapeada suave y constante."))
      .toEqual({ puffs:"1.000 pitadas" });
    expect(extractProductSpecifications("Equipo de hasta 25.000 puffs con pantalla."))
      .toEqual({ puffs:"25.000 puffs" });
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

  it("consulta la ficha real para preguntas técnicas de una marca", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url:string) => new Response(
      `<meta name="description" content="${url.includes("mixer") ? "Hasta 30.000 puffs" : "Hasta 5.000 puffs"}, según la ficha real.">`,
      { status:200, headers:{ "content-type":"text/html" } }
    )));

    const result = await new CatalogService(fixture()).productInfo("Lost Mary");

    expect(result).toEqual([
      expect.objectContaining({
        brand:"Lost Mary",
        model:"MO 5k",
        description:"Hasta 5.000 puffs, según la ficha real.",
        source:"tiendanube"
      }),
      expect.objectContaining({
        brand:"Lost Mary",
        model:"Mixer",
        description:"Hasta 30.000 puffs, según la ficha real.",
        source:"tiendanube"
      })
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("agrega el control de frescura como dato verificado del Ice King", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '<meta name="description" content="Descripción pública verificada del producto Ice King.">',
      { status:200 }
    )));
    const result = await new CatalogService(fixture()).compareModels(["Elfbar Ice King 40K"]);
    expect(result[0]).toMatchObject({ model:"Ice King 40K", verifiedFacts:["Tiene un botón para controlar la frescura."] });
  });
});
