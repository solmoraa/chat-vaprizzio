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
      expect(instructions).toContain("Te dejo la página para que veas el stock disponible");
      expect(instructions).toContain("Si tenés alguna otra duda escribime");
      expect(instructions).toContain("https://www.vaprizzio.com/productos/");
    }
  });

  it("no revisa el catálogo ni deriva la consulta general", () => {
    expect(agents).toMatch(/no (respondas que estás revisando|digas que estás revisando).+pidas intervención humana/i);
    expect(skill).toContain("No digas que estás revisando ni pidas intervención humana");
  });

  it("prioriza la compra cuando llega junto con un saludo", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Hola! Cómo estás?");
      expect(instructions).toMatch(/saludo.+(quiero comprar un vape|intención general de compra)/is);
      expect(instructions).toMatch(/(no uses.+ni preguntes|nunca preguntes) `?Buscabas algún vape\?/i);
    }
  });
});
