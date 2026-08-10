import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("alertas del monitor de salud", () => {
  it("exige fallas consecutivas y aplica un período de enfriamiento", () => {
    const source = readFileSync(new URL("../scripts/monitor-health.mjs", import.meta.url), "utf8");
    expect(source).toContain("HEALTH_FAILURE_THRESHOLD");
    expect(source).toContain("consecutiveFailures < threshold");
    expect(source).toContain("HEALTH_ALERT_COOLDOWN_MINUTES");
    expect(source).toContain("FALLA CONFIRMADA DE SERVICIO");
  });
});
