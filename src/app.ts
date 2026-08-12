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
import type { InstagramClient } from "./channels/instagram/client.js";
import type { Channel } from "./domain/types.js";
import { opensFreshTopic } from "./services/fresh-topic.js";

export interface AppDependencies { config: AppConfig; tools: AgentToolService; conversations: ConversationRepository; debounce: MessageDebouncer; openclaw: OpenClawClient; takeover: TakeoverService; instagram?: Pick<InstagramClient, "send" | "isAutomatedEcho">; }

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

  const verifyMetaWebhook: express.RequestHandler = (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === d.config.META_VERIFY_TOKEN) return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    return res.sendStatus(403);
  };
  app.get("/webhooks/instagram", verifyMetaWebhook);
  app.get("/webhooks/meta", verifyMetaWebhook);

  const receiveMetaWebhook: express.RequestHandler = (req, res) => {
    const raw = req.body as Buffer;
    type MetaMessage = { text?: string; is_echo?: boolean; app_id?: string | number; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
    type MetaEvent = {
      sender?: { id?: string }; recipient?: { id?: string };
      from?: { id?: string }; to?: { id?: string };
      sender_id?: string; recipient_id?: string;
      message?: MetaMessage; text?: string;
    };
    type MetaChangeValue = MetaEvent & { messaging?: MetaEvent[]; messages?: MetaEvent[] };
    const body = JSON.parse(raw.toString("utf8")) as { object?: string; entry?: Array<{ messaging?: MetaEvent[]; changes?: Array<{ field?:string; value?:MetaChangeValue }> }> };
    const signatureSecret = body.object === "page"
      ? d.config.META_APP_SECRET
      : d.config.META_INSTAGRAM_APP_SECRET || d.config.META_APP_SECRET;
    if (!verifyMetaSignature(raw, req.header("x-hub-signature-256"), signatureSecret)) return res.sendStatus(401);
    const channel: Channel = body.object === "page" ? "messenger" : "instagram";
    const events = body.entry?.flatMap(entry => [
      ...(entry.messaging ?? []),
      ...(entry.changes ?? []).flatMap(change => {
        const value = change.value;
        if (!value) return [];
        if (value.messaging?.length) return value.messaging;
        if (value.messages?.length) return value.messages;
        return [value];
      }),
    ]) ?? [];
    req.log.info({ channel, eventCount:events.length }, "meta_webhook_received");
    for (const event of events) {
      if (event.message?.is_echo) {
        if (event.message.app_id != null) continue;
        const customerId = event.recipient?.id;
        const echoText = event.message.text ?? "[mensaje multimedia]";
        if (customerId && d.instagram?.isAutomatedEcho(channel, customerId, echoText)) continue;
        if (customerId) d.takeover.humanMessage(channel, customerId, echoText);
        continue;
      }
      const customerId = event.sender?.id ?? event.from?.id ?? event.sender_id;
      const attachments = event.message?.attachments ?? [];
      const attachmentText = attachments.map(item => {
        const label = item.type === "image" ? "imagen" : item.type === "video" ? "video" : item.type === "audio" ? "audio" : "archivo";
        return `[El cliente envió ${label}${item.payload?.url ? `: ${item.payload.url}` : ""}]`;
      }).join("\n");
      const text = [event.message?.text?.trim() ?? event.text?.trim(), attachmentText].filter(Boolean).join("\n");
      if (!customerId || !text) continue;
      const c = d.conversations.getOrCreate(channel, customerId); c.lastMessages.push(text); c.lastActivity = new Date().toISOString(); d.conversations.save(c);
      if (opensFreshTopic(text)) d.takeover.resume(channel, customerId);
      if (!d.takeover.canAiReply(channel, customerId)) { req.log.info({ channel }, "meta_message_paused"); continue; }
      req.log.info({ channel }, "meta_message_queued");
      d.debounce.push(`${channel}:${customerId}`, text, async messages => {
        if (!d.instagram) throw new Error("INSTAGRAM_NOT_CONFIGURED");
        const reply = await d.openclaw.reply(channel, customerId, messages);
        await d.instagram.send(channel, customerId, reply);
        logger.info({ channel }, "meta_reply_sent");
      });
    }
    res.sendStatus(200);
  };
  const metaBody = express.raw({ type: "application/json", limit: "256kb" });
  app.post("/webhooks/instagram", metaBody, receiveMetaWebhook);
  app.post("/webhooks/meta", metaBody, receiveMetaWebhook);

  app.post("/webhooks/openclaw/inbound", express.json({ limit: "64kb" }), (req, res) => {
    if (req.header("authorization") !== `Bearer ${d.config.OPENCLAW_HOOK_TOKEN}`) return res.sendStatus(401);
    const { channel, customerId, message } = req.body as { channel: "whatsapp"; customerId: string; message: string };
    if (channel !== "whatsapp" || !customerId || !message) return res.sendStatus(400);
    const c = d.conversations.getOrCreate(channel, customerId); c.lastMessages.push(message); c.lastActivity = new Date().toISOString(); d.conversations.save(c);
    if (opensFreshTopic(message)) d.takeover.resume(channel, customerId);
    const accept = d.takeover.canAiReply(channel, customerId);
    if (accept) d.debounce.push(`${channel}:${customerId}`, message, messages => d.openclaw.dispatch(channel, customerId, messages));
    res.json({ accept, queued: accept, state: accept ? "AI_ACTIVE" : c.state });
  });

  app.post("/webhooks/internal", express.json({ limit: "32kb" }), (req, res) => {
    if (!d.config.INTERNAL_WEBHOOK_SECRET || req.header("x-internal-secret") !== d.config.INTERNAL_WEBHOOK_SECRET) return res.sendStatus(401);
    const { command, channel, customerId, text, quantity, unitPrice, conditions } = req.body as Record<string, unknown>;
    try {
      if (command === "resume") return res.json(d.takeover.resume(channel as Channel, String(customerId)));
      if (command === "human_message") return res.json(d.takeover.humanMessage(channel as Channel, String(customerId), String(text ?? "")));
      if (command === "set_negotiated_price") { const c = d.conversations.setNegotiatedPrice(channel as Channel, String(customerId), { quantity: Number(quantity), unitPrice: Number(unitPrice), conditions: String(conditions ?? ""), timestamp: new Date().toISOString() }); return res.json(c); }
      return res.status(400).json({ error: "UNKNOWN_COMMAND" });
    } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }); }
  });
  return app;
}
