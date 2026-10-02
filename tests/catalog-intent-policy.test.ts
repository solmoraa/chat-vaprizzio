import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("intención general de comprar un vape", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

  it("envía la página y explica cómo elegir", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("no sé qué vape quiero");
      expect(instructions).toContain("Te dejo la página para que elijas el vape de la marca que quieras");
      expect(instructions).toContain("sabores disponibles");
      expect(instructions.indexOf("sabores disponibles")).toBeLessThan(instructions.indexOf("https://vaprizzio.com/", instructions.indexOf("no sé qué vape quiero")));
      expect(instructions).toContain("Si tenés alguna otra duda escribime");
      expect(instructions).toContain("https://vaprizzio.com/");
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

  it("no agrega información de entrega que el cliente no consultó", () => {
    expect(agents).toContain("No agregues horarios, retiro, Uber, Didi, envíos ni despacho");
    expect(skill).toContain("No agregues horarios, retiro, Uber, Didi, envíos o despacho");
  });

  it("no vuelve a ofrecer enlaces que ya fueron enviados", () => {
    expect(agents).toContain("No ofrezcas enlaces individuales");
    expect(agents).toContain("Te gusta alguno para que te pase el link?");
    expect(skill).toContain("Nunca incluyas `productUrl` individuales");
    expect(skill).toContain("No repitas la misma web");
  });

  it("lista dinámicamente todos los modelos de una marca", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(/agrupá por modelo/is);
      expect(instructions).toContain("Google Sheets");
      expect(instructions).toContain("https://vaprizzio.com/");
      expect(instructions).toContain("tenemos estos modelos disponibles");
      expect(instructions).toContain("[MODELO");
      expect(instructions).toMatch(/(nunca|prohibido).+Dame un segundo que lo consulto/is);
      expect(instructions).toMatch(/(nunca|prohibido).+alerta de Telegram/is);
    }
  });

  it("invita a seguir las redes cuando no hay fecha de reposición", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Estate atento a nuestras redes");
      expect(instructions).toMatch(/no (manejamos|hay).+fechas? exactas?/is);
      expect(instructions).toMatch(/no (prometas|inventes).+fecha/is);
    }
  });
});
