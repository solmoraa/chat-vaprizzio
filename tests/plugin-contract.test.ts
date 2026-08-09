import { describe, expect, it } from "vitest";
import manifest from "../extensions/vaprizzio-tools/openclaw.plugin.json" with { type: "json" };

describe("contrato del plugin OpenClaw", () => {
  it("declara todas las herramientas comerciales instaladas", () => {
    expect(manifest.contracts.tools).toEqual(expect.arrayContaining([
      "listar_catalogo",
      "listar_mayorista",
      "consultar_entrega",
      "solicitar_envio_app"
    ]));
    for (const tool of manifest.contracts.tools) expect(manifest.toolMetadata).toHaveProperty(tool);
  });
});
