import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("intención general de comprar un vape", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

  it("envía la página y explica cómo elegir", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("no sé qué vape quiero");
      expect(instructions).toContain("elegís el vape de la marca que quieras");
      expect(instructions).toContain("sabores disponibles");
      expect(instructions).toContain("https://www.vaprizzio.com/productos/");
    }
  });

  it("no revisa el catálogo ni deriva la consulta general", () => {
    expect(agents).toContain("no pidas intervención humana");
    expect(skill).toContain("No digas que estás revisando ni pidas intervención humana");
  });
});
