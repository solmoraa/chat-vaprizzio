import express from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";
import type { AppConfig } from "./config/env.js";
import type { AgentToolService } from "./agent/tool-service.js";
import type { ConversationRepository } from "./database/conversation-repository.js";
import type { MessageDebouncer } from "./services/debouncer.js";
import type { OpenClawClient } from "./agent/openclaw-client.js";
import type { TakeoverService } from "./services/takeover-service.js";
import { verifyMetaSignature } from "./channels/instagram/signature.js";

export interface AppDependencies { config: AppConfig; tools: AgentToolService; conversations: ConversationRepository; debounce: MessageDebouncer; openclaw: OpenClawClient; takeover: TakeoverService; }

export function createApp(d: AppDependencies) {
  const app = express();
  const logger = pino({ level: d.config.LOG_LEVEL, redact: { paths: ["req.headers.authorization", "req.headers.x-internal-secret", "*.token", "*.accessToken"], censor: "[REDACTED]" } });
  app.use(pinoHttp({ logger }));
  app.get("/health", (_req, res) => res.json({ ok: true, env: d.config.APP_ENV, productionAllowed: d.config.ALLOW_PRODUCTION, catalog: d.config.CATALOG_PROVIDER }));
  app.get("/ready", async (_req, res) => { try { await d.tools.catalog.priceList(); res.json({ ok:true, catalog:true }); } catch { res.status(503).json({ ok:false, catalog:false }); } });

  const rate = new Map<string, { minute:number; count:number }>();
  app.use("/api/tools", (req, res, next) => {
    if (d.config.TOOL_API_TOKEN && req.header("authorization") !== `Bearer ${d.config.TOOL_API_TOKEN}`) return res.sendStatus(401);
    const minute = Math.floor(Date.now() / 60_000); const key = req.ip || "local"; const current = rate.get(key);
    const entry = current?.minute === minute ? current : { minute, count:0 }; entry.count += 1; rate.set(key, entry);
    if (entry.count > d.config.TOOL_RATE_LIMIT_PER_MINUTE) return res.status(429).json({ ok:false, error:"RATE_LIMITED" });
    return next();
  });

  app.post("/api/tools/:name", express.json({ limit: "64kb" }), async (req, res) => {
    const toolName = String(req.params.name);
    try { res.json({ ok: true, result: await d.tools.execute(toolName, req.body as Record<string, unknown>) }); }
    catch (error) { req.log.error({ err: error, tool: toolName }, "tool_failed"); res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }); }
  });

  app.get("/webhooks/instagram", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === d.config.META_VERIFY_TOKEN) return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    return res.sendStatus(403);
  });
  app.post("/webhooks/instagram", express.raw({ type: "application/json", limit: "256kb" }), (req, res) => {
    const raw = req.body as Buffer;
    if (!verifyMetaSignature(raw, req.header("x-hub-signature-256"), d.config.META_APP_SECRET)) return res.sendStatus(401);
    const body = JSON.parse(raw.toString("utf8")) as { entry?: Array<{ messaging?: Array<{ sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }> }> };
    for (const event of body.entry?.flatMap(x => x.messaging ?? []) ?? []) {
      const customerId = event.sender?.id; const text = event.message?.text;
      if (!customerId || !text || event.message?.is_echo) continue;
      const c = d.conversations.getOrCreate("instagram", customerId); c.lastMessages.push(text); c.lastActivity = new Date().toISOString(); d.conversations.save(c);
      if (!d.takeover.canAiReply("instagram", customerId)) continue;
      d.debounce.push(`instagram:${customerId}`, text, messages => d.openclaw.dispatch("instagram", customerId, messages));
    }
    res.sendStatus(200);
  });

  app.post("/webhooks/openclaw/inbound", express.json({ limit: "64kb" }), (req, res) => {
    if (req.header("authorization") !== `Bearer ${d.config.OPENCLAW_HOOK_TOKEN}`) return res.sendStatus(401);
    const { channel, customerId, message } = req.body as { channel: "whatsapp"; customerId: string; message: string };
    if (channel !== "whatsapp" || !customerId || !message) return res.sendStatus(400);
    const c = d.conversations.getOrCreate(channel, customerId); c.lastMessages.push(message); c.lastActivity = new Date().toISOString(); d.conversations.save(c);
    const accept = d.takeover.canAiReply(channel, customerId);
    if (accept) d.debounce.push(`${channel}:${customerId}`, message, messages => d.openclaw.dispatch(channel, customerId, messages));
    res.json({ accept, queued: accept, state: accept ? "AI_ACTIVE" : c.state });
  });

  app.post("/webhooks/internal", express.json({ limit: "32kb" }), (req, res) => {
    if (!d.config.INTERNAL_WEBHOOK_SECRET || req.header("x-internal-secret") !== d.config.INTERNAL_WEBHOOK_SECRET) return res.sendStatus(401);
    const { command, channel, customerId, text, quantity, unitPrice, conditions, operator } = req.body as Record<string, unknown>;
    try {
      if (command === "resume") return res.json(d.takeover.resume(channel as "whatsapp" | "instagram", String(customerId)));
      if (command === "take") return res.json(d.takeover.take(channel as "whatsapp" | "instagram", String(customerId), String(operator ?? "operador")));
      if (command === "confirm_payment") return res.json(d.takeover.humanMessage(channel as "whatsapp" | "instagram", String(customerId), "Pago confirmado por operador"));
      if (command === "human_message") return res.json(d.takeover.humanMessage(channel as "whatsapp" | "instagram", String(customerId), String(text ?? "")));
      if (command === "set_negotiated_price") { const c = d.conversations.setNegotiatedPrice(channel as "whatsapp" | "instagram", String(customerId), { quantity: Number(quantity), unitPrice: Number(unitPrice), conditions: String(conditions ?? ""), timestamp: new Date().toISOString() }); return res.json(c); }
      return res.status(400).json({ error: "UNKNOWN_COMMAND" });
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }); }
  });
  return app;
}
