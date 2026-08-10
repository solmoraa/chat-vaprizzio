import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "3000"}`;
const stateFile = resolve(process.env.HEALTH_MONITOR_STATE_FILE || "./data/health-monitor-state.json");
const threshold = Math.max(2, Number(process.env.HEALTH_FAILURE_THRESHOLD || 3));
const cooldownMs = Math.max(5, Number(process.env.HEALTH_ALERT_COOLDOWN_MINUTES || 30)) * 60_000;
const readState = () => { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch { return { consecutiveFailures:0, lastAlertAt:0 }; } };
const saveState = state => { mkdirSync(dirname(stateFile), { recursive:true }); writeFileSync(stateFile, JSON.stringify(state), { mode:0o600 }); };
let failure = "";
for (const path of ["/health", "/ready"]) {
  try { const response = await fetch(`${baseUrl}${path}`, { signal:AbortSignal.timeout(8000) }); if (!response.ok) failure += `${path}: HTTP ${response.status}; `; }
  catch (error) { failure += `${path}: ${error instanceof Error ? error.message : "sin respuesta"}; `; }
}
if (!failure) { saveState({ consecutiveFailures:0, lastAlertAt:readState().lastAlertAt || 0 }); console.log("Vaprizzio health OK"); process.exit(0); }
const previous = readState();
const state = { consecutiveFailures:Number(previous.consecutiveFailures || 0) + 1, lastAlertAt:Number(previous.lastAlertAt || 0) };
if (state.consecutiveFailures < threshold) {
  saveState(state);
  console.warn(`Falla transitoria ${state.consecutiveFailures}/${threshold}; todavía no se alerta`);
  process.exit(0);
}
const shouldAlert = Date.now() - state.lastAlertAt >= cooldownMs;
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatIds = (process.env.HUMAN_NOTIFICATION_CHAT_ID || "").split(",").map(value => value.trim()).filter(Boolean);
if (shouldAlert && token && chatIds.length) {
  await Promise.allSettled(chatIds.map(chat_id => fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ chat_id, text:`🚨 VAPRIZZIO: FALLA CONFIRMADA DE SERVICIO 🚨\n${state.consecutiveFailures} controles consecutivos fallaron.\n${failure}` }) })));
  state.lastAlertAt = Date.now();
}
saveState(state);
console.error(failure); process.exit(1);
