import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const markerStart = "/* VAPRIZZIO_HUMAN_PAUSE_GUARD_START */";
const markerEnd = "/* VAPRIZZIO_HUMAN_PAUSE_GUARD_END */";
const pluginRoot = process.argv[2] ?? "/home/openclaw/.openclaw/extensions/whatsapp";
const manifestPath = join(pluginRoot, "package.json");
const distDir = join(pluginRoot, "dist");

if (!existsSync(manifestPath) || !existsSync(distDir)) {
  throw new Error(`No encontré el plugin de WhatsApp en ${pluginRoot}. No se modificó nada.`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== "2026.7.1") {
  throw new Error(
    `Este instalador fue verificado para WhatsApp 2026.7.1 y encontró ${manifest.version ?? "una versión desconocida"}. No se modificó nada.`,
  );
}

const monitors = readdirSync(distDir)
  .filter(name => /^monitor-[A-Za-z0-9_-]+\.js$/.test(name))
  .map(name => join(distDir, name));

if (monitors.length !== 1) {
  throw new Error(`Esperaba un único archivo monitor del plugin y encontré ${monitors.length}. No se modificó nada.`);
}

const monitorPath = monitors[0];
let source = readFileSync(monitorPath, "utf8");

if (source.includes(markerStart)) {
  console.log("La protección contra mensajes manuales ya está instalada.");
  process.exit(0);
}

const cryptoImport = 'import { createHash } from "node:crypto";';
const fsImports = `${cryptoImport}\nimport { existsSync as existsSync$1, mkdirSync as mkdirSync$1, readFileSync as readFileSync$1, renameSync as renameSync$1, writeFileSync as writeFileSync$1 } from "node:fs";\nimport { dirname as dirname$1 } from "node:path";`;
if (!source.includes(cryptoImport)) {
  throw new Error("No encontré el punto de instalación esperado del plugin. No se modificó nada.");
}
source = source.replace(cryptoImport, fsImports);

const stateAnchor = "const RECENT_OUTBOUND_MESSAGE_MAX = 5e3;";
const stateBlock = `${stateAnchor}
${markerStart}
const VAPRIZZIO_HUMAN_PAUSE_MS = 2 * 60 * 60 * 1e3;
const VAPRIZZIO_HUMAN_PAUSE_FILE = process.env.VAPRIZZIO_HUMAN_PAUSE_FILE ?? "/home/openclaw/.openclaw/state/vaprizzio-whatsapp-human-pauses.json";
const vaprizzioHumanPauses = /* @__PURE__ */ new Map();
let vaprizzioHumanPausesLoaded = false;
function loadVaprizzioHumanPauses() {
\tif (vaprizzioHumanPausesLoaded) return;
\tvaprizzioHumanPausesLoaded = true;
\ttry {
\t\tconst saved = JSON.parse(readFileSync$1(VAPRIZZIO_HUMAN_PAUSE_FILE, "utf8"));
\t\tconst now = Date.now();
\t\tfor (const [key, value] of Object.entries(saved ?? {})) if (typeof value === "number" && value > now) vaprizzioHumanPauses.set(key, value);
\t} catch (error) {
\t\tif (error?.code !== "ENOENT") defaultRuntime.log(\`[vaprizzio] no se pudo leer la pausa humana de WhatsApp: \${String(error)}\`);
\t}
}
function saveVaprizzioHumanPauses() {
\ttry {
\t\tconst now = Date.now();
\t\tfor (const [key, until] of vaprizzioHumanPauses) if (until <= now) vaprizzioHumanPauses.delete(key);
\t\tmkdirSync$1(dirname$1(VAPRIZZIO_HUMAN_PAUSE_FILE), { recursive: true });
\t\tconst temporary = \`\${VAPRIZZIO_HUMAN_PAUSE_FILE}.tmp\`;
\t\twriteFileSync$1(temporary, JSON.stringify(Object.fromEntries(vaprizzioHumanPauses)), "utf8");
\t\trenameSync$1(temporary, VAPRIZZIO_HUMAN_PAUSE_FILE);
\t} catch (error) {
\t\tdefaultRuntime.log(\`[vaprizzio] no se pudo guardar la pausa humana de WhatsApp: \${String(error)}\`);
\t}
}
function vaprizzioPauseKey(accountId, remoteJid) {
\treturn \`\${accountId}:\${remoteJid}\`;
}
function pauseVaprizzioHumanChat(accountId, remoteJid) {
\tloadVaprizzioHumanPauses();
\tconst until = Date.now() + VAPRIZZIO_HUMAN_PAUSE_MS;
\tvaprizzioHumanPauses.set(vaprizzioPauseKey(accountId, remoteJid), until);
\tsaveVaprizzioHumanPauses();
\treturn until;
}
function getVaprizzioHumanPause(accountId, remoteJid) {
\tloadVaprizzioHumanPauses();
\tconst key = vaprizzioPauseKey(accountId, remoteJid);
\tconst until = vaprizzioHumanPauses.get(key);
\tif (!until) return null;
\tif (until <= Date.now()) {
\t\tvaprizzioHumanPauses.delete(key);
\t\tsaveVaprizzioHumanPauses();
\t\treturn null;
\t}
\treturn until;
}
${markerEnd}`;
if (!source.includes(stateAnchor)) {
  throw new Error("No encontré el estado de mensajes salientes esperado. No se modificó nada.");
}
source = source.replace(stateAnchor, stateBlock);

const loopAnchor = `\t\tfor (const msg of upsert.messages ?? []) {\n\t\t\trememberBaileysMessage(msg.key?.remoteJid, msg.key?.id, msg.message);\n\t\t\tconst receiveOrder = nextReceiveOrder++;`;
const guardedLoop = `\t\tfor (const msg of upsert.messages ?? []) {\n\t\t\trememberBaileysMessage(msg.key?.remoteJid, msg.key?.id, msg.message);\n\t\t\tconst receiveOrder = nextReceiveOrder++;\n\t\t\tconst remoteJid = msg.key?.remoteJid;\n\t\t\tconst messageId = msg.key?.id;\n\t\t\tconst directChat = Boolean(remoteJid && !remoteJid.endsWith("@g.us"));\n\t\t\tif (directChat && Boolean(msg.key?.fromMe)) {\n\t\t\t\tconst automated = Boolean(messageId) && isRecentOutboundMessage({ accountId: options.accountId, remoteJid, messageId });\n\t\t\t\tif (!automated) {\n\t\t\t\t\tconst pausedUntil = pauseVaprizzioHumanChat(options.accountId, remoteJid);\n\t\t\t\t\tdefaultRuntime.log(\`[vaprizzio] mensaje manual detectado; IA pausada hasta \${new Date(pausedUntil).toISOString()} para \${remoteJid}\`);\n\t\t\t\t}\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tif (directChat && remoteJid) {\n\t\t\t\tconst pausedUntil = getVaprizzioHumanPause(options.accountId, remoteJid);\n\t\t\t\tif (pausedUntil) {\n\t\t\t\t\tdefaultRuntime.log(\`[vaprizzio] mensaje del cliente omitido: intervención humana activa hasta \${new Date(pausedUntil).toISOString()} para \${remoteJid}\`);\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\t\t\t}`;
if (!source.includes(loopAnchor)) {
  throw new Error("No encontré el bucle de mensajes esperado. No se modificó nada.");
}
source = source.replace(loopAnchor, guardedLoop);

const backupPath = `${monitorPath}.bak-vaprizzio-human-pause-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(monitorPath, backupPath);
writeFileSync(monitorPath, source, "utf8");
console.log(`Protección instalada. Backup: ${backupPath}`);
