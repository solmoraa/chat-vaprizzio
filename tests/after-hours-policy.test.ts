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

  it("desde las 19 deriva los retiros para coordinar el día siguiente", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(
        /(?:desde|despu[eé]s de las) 19/i
      );

      expect(instructions).toContain(
        "coordinar_visita_local"
      );

      expect(instructions).toContain("Telegram");
    }
  });

  it("aplica la coordinación de mañana también después de las 23", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(/despu[eé]s de las 22.*23|22.*23/is);
      expect(instructions).toContain("mañana");
    }
  });

  it("no reemplaza un retiro fuera de hora con la web o Uber/Didi", () => {
    for (const instructions of [agents, skill]) {
      expect(instructions).toMatch(/no .*web.*Uber\/Didi|web.*Uber\/Didi/is);
      expect(instructions).toMatch(/coordinar.*mañana|mañana.*coordinar/is);
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

  it("no deriva una consulta de producto solo por ser después de las 19", () => {
    const plugin = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8"
    );

    expect(plugin).toContain("requestsPickupVisit");
    expect(plugin).toContain("el cliente no mencionó retirar");
    expect(plugin).toContain("Respondé únicamente la consulta comercial");
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
