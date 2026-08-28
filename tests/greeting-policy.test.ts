import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agents = readFileSync(
  new URL("../openclaw/workspace/AGENTS.md", import.meta.url),
  "utf8"
);

const skill = readFileSync(
  new URL("../skills/ventas/SKILL.md", import.meta.url),
  "utf8"
);

describe("saludos con consulta concreta", () => {
  it.each([agents, skill])(
    "saluda antes de responder si el cliente saludó",
    instructions => {
      expect(instructions).toContain(
        "saludá primero de forma breve"
      );

      expect(instructions).toContain(
        "No preguntes `Buscabas algún vape?` cuando el cliente ya hizo una consulta concreta"
      );
    }
  );
});