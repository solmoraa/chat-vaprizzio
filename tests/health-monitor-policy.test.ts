import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../scripts/monitor-health.mjs", import.meta.url), "utf8");
const telegramWatchdog = readFileSync(new URL("../deploy/openclaw-telegram-watchdog.sh", import.meta.url), "utf8");

describe("alertas del monitor de salud", () => {
  it("exige fallas consecutivas y aplica un período de enfriamiento", () => {
    expect(source).toContain("HEALTH_FAILURE_THRESHOLD");
    expect(source).toContain("consecutiveFailures < threshold");
    expect(source).toContain("HEALTH_ALERT_COOLDOWN_MINUTES");
    expect(source).toContain("FALLA CONFIRMADA DE SERVICIO");
    expect(source).toContain("OPENCLAW_BASE_URL");
    expect(source).toContain("OpenClaw gateway");
  });

  it("recupera el gateway si Telegram vaprizziobot pierde conexión en dos controles", () => {
    expect(telegramWatchdog).toContain("Telegram vaprizziobot (vaprizziobot):");
    expect(telegramWatchdog).toContain("running, connected");
    expect(telegramWatchdog).toContain("failures < 2");
    expect(telegramWatchdog).toContain("systemctl restart openclaw-gateway.service");
  });
});
