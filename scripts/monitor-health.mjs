import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { alertDue, emptyMonitorState, nextMonitorState, normalizeMonitorState } from "./health-monitor-policy.mjs";

const baseUrl = `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "3000"}`;
const openClawBaseUrl = process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789";
const stateFile = resolve(process.env.HEALTH_MONITOR_STATE_FILE || "./data/health-monitor-state.json");
const positiveNumber = (value, fallback, minimum) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
};
const threshold = positiveNumber(process.env.HEALTH_FAILURE_THRESHOLD, 3, 2);
const readyThreshold = positiveNumber(process.env.HEALTH_READY_FAILURE_THRESHOLD, 10, threshold);
const cooldownMs = positiveNumber(process.env.HEALTH_ALERT_COOLDOWN_MINUTES, 30, 5) * 60_000;
const criticalTimeoutMs = positiveNumber(process.env.HEALTH_CRITICAL_TIMEOUT_MS, 8_000, 2_000);
const externalTimeoutMs = positiveNumber(process.env.EXTERNAL_REQUEST_TIMEOUT_MS, 10_000, 2_000);
// /ready consulta Google Sheets. Su espera siempre debe superar la de la
// dependencia para que el monitor no aborte una operación que todavía es válida.
const readyTimeoutMs = Math.max(
  positiveNumber(process.env.HEALTH_READY_TIMEOUT_MS, 15_000, 5_000),
  externalTimeoutMs + 5_000,
);
const telegramTimeoutMs = positiveNumber(process.env.HEALTH_TELEGRAM_TIMEOUT_MS, 8_000, 2_000);
const readState = () => {
  try { return normalizeMonitorState(JSON.parse(readFileSync(stateFile, "utf8"))); }
  catch { return emptyMonitorState(); }
};
const saveState = state => { mkdirSync(dirname(stateFile), { recursive:true }); writeFileSync(stateFile, JSON.stringify(state), { mode:0o600 }); };

const describeError = error => {
  if (!(error instanceof Error)) return "sin respuesta";
  return error.name === "TimeoutError" || /aborted|timeout/i.test(error.message)
    ? "tiempo de espera agotado"
    : error.message;
};
const probe = async (label, url, timeoutMs, accepts) => {
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(timeoutMs) });
    return accepts(response) ? "" : `${label}: HTTP ${response.status}`;
  } catch (error) {
    return `${label}: ${describeError(error)}`;
  }
};

const [healthFailure, readyFailure, gatewayFailure] = await Promise.all([
  probe("/health", `${baseUrl}/health`, criticalTimeoutMs, response => response.ok),
  probe("/ready", `${baseUrl}/ready`, readyTimeoutMs, response => response.ok),
  probe("OpenClaw gateway", openClawBaseUrl, criticalTimeoutMs, response => response.status < 500),
]);
const criticalFailure = [healthFailure, gatewayFailure].filter(Boolean).join("; ");
const previous = readState();
const state = nextMonitorState(previous, {
  criticalFailed:Boolean(criticalFailure),
  readyFailed:Boolean(readyFailure),
});
const now = Date.now();
const due = alertDue(state, { criticalThreshold:threshold, readyThreshold, cooldownMs, now });
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatIds = (process.env.HUMAN_NOTIFICATION_CHAT_ID || "").split(",").map(value => value.trim()).filter(Boolean);

const sendTelegram = async text => {
  if (!token || !chatIds.length) return false;
  const deliveries = await Promise.allSettled(chatIds.map(async chat_id => {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ chat_id, text }),
      signal:AbortSignal.timeout(telegramTimeoutMs),
    });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  }));
  return deliveries.some(result => result.status === "fulfilled");
};

if (due === "critical") {
  const sent = await sendTelegram(
    `🚨 VAPRIZZIO: FALLA CONFIRMADA DE SERVICIO 🚨\n${state.consecutiveCriticalFailures} controles críticos consecutivos fallaron.\n${criticalFailure}`,
  );
  if (sent) state.lastCriticalAlertAt = now;
} else if (due === "ready") {
  const sent = await sendTelegram(
    `⚠️ VAPRIZZIO: CATÁLOGO NO DISPONIBLE ⚠️\nEl backend y el gateway siguen activos, pero Google Sheets falló durante ${state.consecutiveReadyFailures} controles consecutivos.\n${readyFailure}`,
  );
  if (sent) state.lastReadyAlertAt = now;
}
saveState(state);

if (!criticalFailure && !readyFailure) {
  console.log("Vaprizzio health OK");
  process.exit(0);
}
if (criticalFailure) {
  console.warn(`Falla crítica ${state.consecutiveCriticalFailures}/${threshold}: ${criticalFailure}`);
}
if (readyFailure) {
  console.warn(`Catálogo temporalmente no disponible ${state.consecutiveReadyFailures}/${readyThreshold}: ${readyFailure}`);
}
process.exit(
  state.consecutiveCriticalFailures >= threshold || state.consecutiveReadyFailures >= readyThreshold ? 1 : 0,
);
