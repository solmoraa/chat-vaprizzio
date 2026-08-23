import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

describe("conocimiento compartido entre canales", () => {
  it.each([agents, skill])("declara WhatsApp como política canónica para los tres canales", instructions => {
    expect(instructions).toContain("POLITICA_CANONICA_WHATSAPP");
    expect(instructions.toLowerCase()).toContain("whatsapp");
    expect(instructions.toLowerCase()).toContain("messenger");
    expect(instructions.toLowerCase()).toContain("instagram");
    expect(instructions).toContain("espera configurada");
    expect(instructions).toMatch(/reinicio (por|de) 12 horas/i);
  });

  it.each([agents, skill])("recuerda el comprobante al enviar a comprar por transferencia", instructions => {
    expect(instructions).toContain("Si pagás por transferencia, cuando termines la compra mandame el comprobante por acá 😊");
    expect(instructions).toMatch(/WhatsApp, Messenger e Instagram/i);
    expect(instructions).toMatch(/solamente para mirar stock, sabores, modelos, precios o información/i);
  });
});
