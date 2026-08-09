import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atención después del cierre del local", () => {
  const agents = readFileSync(new URL("../openclaw/workspace/AGENTS.md", import.meta.url), "utf8");
  const skill = readFileSync(new URL("../skills/ventas/SKILL.md", import.meta.url), "utf8");

  it("mantiene el chat activo y deriva pedidos inmediatos después de las 19", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Después de las 19 hs");
      expect(instructions).toContain("reportar_pedido_inmediato_app");
      expect(instructions).toMatch(/chat (continúa|sigue) atendiendo/i);
    }
  });

  it("deja al humano decidir una llegada sin horario", () => {
    expect(agents).toContain("si no hay nadie disponible, acuerda otro horario");
    expect(agents).toContain("/reanudar");
  });
});
