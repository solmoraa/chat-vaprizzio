import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("intención de ver todos los vapes", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

  it("obliga a listar catálogo y enviar la página", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("no sé qué vape quiero");
      expect(instructions).toContain("listar_catalogo");
      expect(instructions).toContain("https://www.vaprizzio.com/productos/");
      expect(instructions).toMatch(/todos los (vapes|modelos) disponibles/i);
    }
  });

  it("prohíbe derivar antes de mostrar opciones", () => {
    expect(agents).toContain("no pidas intervención humana");
    expect(skill).toContain("pedir intervención humana");
  });
});
