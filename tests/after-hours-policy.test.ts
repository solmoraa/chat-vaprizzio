import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atención después del cierre del punto de retiro", () => {
  const agents = readFileSync(
    new URL("../openclaw/workspace/AGENTS.md", import.meta.url),
    "utf8"
  );

  const skill = readFileSync(
    new URL("../skills/ventas/SKILL.md", import.meta.url),
    "utf8"
  );

  it("Uber o Didi deriva siempre a atención humana", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("solicitar_envio_app");
      expect(instructions).toContain("Telegram");
      expect(instructions).toContain("WAITING_HUMAN");

      expect(instructions).toMatch(
        /Uber\s*\/?\s*Didi[\s\S]{0,1500}prohibid[oa][\s\S]{0,500}(web|productUrl)/i
      );

      expect(instructions).toMatch(
        /Uber\s*\/?\s*Didi[\s\S]{0,1500}prohibid[oa][\s\S]{0,500}comprobante/i
      );
    }
  });

  it("entre las 19 y las 23 deriva las consultas comerciales", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(
        /Desde las 19:00 y antes de las 23:00/i
      );

      expect(instructions).toContain(
        "reportar_consulta_fuera_horario"
      );

      expect(instructions).toContain("Telegram");
    }
  });

  it("desde las 23 deja los pedidos para el día siguiente", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain("Desde las 23:00 inclusive");
      expect(instructions).toContain("mañana");
    }
  });

  it("después de las 22 rechaza retiros inmediatos sin generar alertas", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toContain(
        "horario para retiros y envíos ya terminó"
      );

      expect(instructions).toContain(
        "Didi o Uber para mañana"
      );

      expect(instructions).toMatch(/no ejecutes.+alerta/is);

      expect(instructions).toMatch(
        /no (digas|prometas).+(verificar|retiro)/is
      );
    }
  });

  it("deja al humano decidir una llegada sin horario", () => {
    expect(agents).toContain(
      "si no hay nadie disponible, acuerda otro horario"
    );

    expect(agents).toContain("/reanudar");
  });

  it("solo menciona el cierre cuando quieren retirar", () => {
    expect(agents).toContain(
      "Solo si pregunta si puede retirar, pasar o venir al punto de retiro fuera del horario"
    );

    expect(agents).toContain(
      "no mandes la página automáticamente ante un saludo"
    );
  });

  it("no mezcla un saludo simple con la respuesta de disponibilidad", () => {
    expect(agents).toContain(
      "En un saludo simple está prohibido decir `sii, estamos`"
    );

    expect(agents).toContain(
      "o usar el nombre del cliente"
    );
  });
});