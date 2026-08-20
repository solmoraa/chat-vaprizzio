import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertDue, emptyMonitorState, nextMonitorState, normalizeMonitorState } from "../scripts/health-monitor-policy.mjs";

const source = readFileSync(new URL("../scripts/monitor-health.mjs", import.meta.url), "utf8");
const telegramWatchdog = readFileSync(new URL("../deploy/openclaw-telegram-watchdog.sh", import.meta.url), "utf8");

describe("alertas del monitor de salud", () => {
  it("exige fallas consecutivas y aplica un período de enfriamiento", () => {
    expect(source).toContain("HEALTH_FAILURE_THRESHOLD");
    expect(source).toContain("HEALTH_READY_FAILURE_THRESHOLD");
    expect(source).toContain("HEALTH_ALERT_COOLDOWN_MINUTES");
    expect(source).toContain("FALLA CONFIRMADA DE SERVICIO");
    expect(source).toContain("CATÁLOGO NO DISPONIBLE");
    expect(source).toContain("OPENCLAW_BASE_URL");
    expect(source).toContain("OpenClaw gateway");
  });

  it("no confunde una demora transitoria de Google Sheets con una caída del servicio", () => {
    let state = emptyMonitorState();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = nextMonitorState(state, { criticalFailed:false, readyFailed:true });
    }
    expect(state.consecutiveCriticalFailures).toBe(0);
    expect(state.consecutiveReadyFailures).toBe(3);
    expect(alertDue(state, { criticalThreshold:3, readyThreshold:10, cooldownMs:30 * 60_000, now:Date.now() })).toBeNull();
  });

  it("mantiene la alerta rápida para una caída real del backend o gateway", () => {
    let state = emptyMonitorState();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = nextMonitorState(state, { criticalFailed:true, readyFailed:false });
    }
    expect(alertDue(state, { criticalThreshold:3, readyThreshold:10, cooldownMs:30 * 60_000, now:Date.now() })).toBe("critical");
  });

  it("alerta por catálogo únicamente después de diez controles fallidos continuos", () => {
    let state = emptyMonitorState();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      state = nextMonitorState(state, { criticalFailed:false, readyFailed:true });
    }
    expect(alertDue(state, { criticalThreshold:3, readyThreshold:10, cooldownMs:30 * 60_000, now:Date.now() })).toBe("ready");
    state = nextMonitorState(state, { criticalFailed:false, readyFailed:false });
    expect(state.consecutiveReadyFailures).toBe(0);
  });

  it("descarta el contador antiguo que mezclaba readiness con caídas críticas", () => {
    expect(normalizeMonitorState({ consecutiveFailures:99, lastAlertAt:Date.now() })).toEqual(emptyMonitorState());
  });

  it("recupera el gateway si Telegram vaprizziobot pierde conexión en dos controles", () => {
    expect(telegramWatchdog).toContain("Telegram vaprizziobot (vaprizziobot):");
    expect(telegramWatchdog).toContain("running, connected");
    expect(telegramWatchdog).toContain("failures < 2");
    expect(telegramWatchdog).toContain("systemctl restart openclaw-gateway.service");
  });
});
