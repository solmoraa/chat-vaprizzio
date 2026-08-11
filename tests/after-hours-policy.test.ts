import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atención después del cierre del local", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

  it("mantiene el chat activo y exige la compra web antes de coordinar el auto", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Desde las 19 y antes de las 22 hs");
      expect(instructions).toContain("productUrl");
      expect(instructions).toContain("reportar_comprobante_web");
      expect(instructions).toMatch(/no alertes.+todavía/i);
      expect(instructions).toMatch(/chat (continúa|sigue) atendiendo/i);
      expect(instructions).toContain("Buscabas algún vape?");
      expect(instructions).toContain("Hola! Cómo estás? Buscabas algún vape?");
    }
  });

  it("después de las 22 vende pero despacha al día siguiente", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Desde las 22 hs");
      expect(instructions).toContain("mañana lo despachamos");
    }
  });

  it("después de las 22 rechaza retiros inmediatos sin generar alertas", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("horario para retiros y envíos ya terminó");
      expect(instructions).toContain("Didi o Uber para mañana");
      expect(instructions).toMatch(/no ejecutes.+alerta/is);
      expect(instructions).toMatch(/no (digas|prometas).+(verificar|retiro)/is);
    }
  });

  it("deja al humano decidir una llegada sin horario", () => {
    expect(agents).toContain("si no hay nadie disponible, acuerda otro horario");
    expect(agents).toContain("/reanudar");
  });

  it("solo menciona el cierre cuando quieren retirar", () => {
    expect(agents).toContain("Solo si pregunta si puede retirar, pasar o venir al local fuera del horario");
    expect(agents).toContain("no mandes la página automáticamente ante un saludo");
  });

  it("no mezcla un saludo simple con la respuesta de disponibilidad", () => {
    expect(agents).toContain("En un saludo simple está prohibido decir `sii, estamos`");
    expect(agents).toContain("o usar el nombre del cliente");
  });
});
