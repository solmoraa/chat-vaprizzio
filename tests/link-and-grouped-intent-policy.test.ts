import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("intención agrupada y enlaces comerciales", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");
  const plugin = readFileSync(new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url), "utf8");

  it("prioriza el asunto posterior a un saludo agrupado", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("ya compré por la web");
      expect(instructions).toMatch(/(?:nunca|no) preguntes `?Buscabas algún vape\?/i);
      expect(instructions).toContain("Dale! Cuando tengas el comprobante mandamelo por acá 😊");
    }
    expect(plugin).toContain("reportsWebPurchase");
    expect(plugin).toContain("REGLA AUTOMATICA DE COMPRA YA HECHA");
  });

  it("no manda la web ante una consulta de disponibilidad sola", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(/disponibilidad[^.]{0,90}sin (?:link|URL)/i);
      expect(instructions).toMatch(/(?:solo|únicamente) (?:si|cuando) (?:el cliente )?(?:quiera comprar|quiere comprar|también quiere comprar)/i);
    }
    expect(plugin).toContain("no envíes URL: es una consulta de disponibilidad, no una compra");
  });

  it("manda solo la web general cuando hay intención explícita de compra", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("https://vaprizzio.com/");
      expect(instructions).toMatch(/quiere comprar, pide (?:link|enlace)\/?página\/catálogo|pide link\/página\/catálogo/i);
      expect(instructions).toContain("Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊");
    }
    expect(plugin).toContain("REGLA AUTOMATICA DE ENLACES PARA ESTE TURNO");
    expect(plugin).toContain("no muestres enlaces individuales");
  });
});
