import "dotenv/config";

const baseUrl = `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "3000"}`;
let failure = "";
for (const path of ["/health", "/ready"]) {
  try { const response = await fetch(`${baseUrl}${path}`, { signal:AbortSignal.timeout(8000) }); if (!response.ok) failure += `${path}: HTTP ${response.status}; `; }
  catch (error) { failure += `${path}: ${error instanceof Error ? error.message : "sin respuesta"}; `; }
}
if (!failure) { console.log("Vaprizzio health OK"); process.exit(0); }
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatIds = (process.env.HUMAN_NOTIFICATION_CHAT_ID || "").split(",").map(value => value.trim()).filter(Boolean);
if (token && chatIds.length) await Promise.allSettled(chatIds.map(chat_id => fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ chat_id, text:`🚨 VAPRIZZIO: FALLA DE SERVICIO 🚨\n${failure}` }) })));
console.error(failure); process.exit(1);
