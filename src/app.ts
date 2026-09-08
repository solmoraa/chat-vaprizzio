import express from "express";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import type { AppConfig } from "./config/env.js";
import type { AgentToolService } from "./agent/tool-service.js";
import type { ConversationRepository } from "./database/conversation-repository.js";
import type { MessageDebouncer } from "./services/debouncer.js";
import type { OpenClawClient } from "./agent/openclaw-client.js";
import type { TakeoverService } from "./services/takeover-service.js";
import { verifyMetaSignature } from "./channels/instagram/signature.js";
import type { InstagramClient } from "./channels/instagram/client.js";
import type { Channel } from "./domain/types.js";
import {
  arrivalUpdateKind,
  opensFreshTopic,
  type ArrivalUpdateKind,
} from "./services/fresh-topic.js";
import {
  casualStoryReply,
  isCasualStoryReaction,
} from "./services/story-reply.js";

const piriMessageSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(128),
    message: z.string().trim().min(1).max(1000),
  })
  .strict();

function isOpenClawTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const details = error as Error & {
    killed?: boolean;
    code?: string;
  };

  return (
    details.killed === true ||
    details.code === "ETIMEDOUT" ||
    /timeout|timed out/i.test(error.message)
  );
}

const piriJson = express.json({
  limit: "8kb",
});

const parsePiriJson: express.RequestHandler = (req, res, next) => {
  piriJson(req, res, (error) => {
    if (!error) return next();

    const status = (error as { status?: number }).status === 413 ? 413 : 400;

    return res.status(status).json({
      ok: false,
      error: status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON",
    });
  });
};

export interface AppDependencies {
  config: AppConfig;
  tools: AgentToolService;
  conversations: ConversationRepository;
  debounce: MessageDebouncer;
  openclaw: OpenClawClient;
  takeover: TakeoverService;
  instagram?: Pick<InstagramClient, "send" | "isAutomatedEcho" | "diagnostics">;
}

export function createApp(d: AppDependencies) {
  const app = express();
  const logger = pino({
    level: d.config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-internal-secret",
        "*.token",
        "*.accessToken",
      ],
      censor: "[REDACTED]",
    },
  });
  app.use(pinoHttp({ logger }));
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      env: d.config.APP_ENV,
      productionAllowed: d.config.ALLOW_PRODUCTION,
      catalog: d.config.CATALOG_PROVIDER,
      responseDelayMs: d.config.DEBOUNCE_MS,
      catalogCacheMs: d.config.CATALOG_CACHE_MS,
    }),
  );
  app.get("/ready", async (req, res) => {
    try {
      await d.tools.catalog.priceList();
      res.json({ ok: true, catalog: true });
    } catch (error) {
      req.log.warn({ err: error }, "catalog_readiness_failed");
      res.status(503).json({ ok: false, catalog: false });
    }
  });
  app.get("/diagnostics/meta", async (req, res) => {
    if (!d.config.TOOL_API_TOKEN)
      return res
        .status(503)
        .json({ ok: false, error: "DIAGNOSTICS_TOKEN_NOT_CONFIGURED" });
    if (req.header("authorization") !== `Bearer ${d.config.TOOL_API_TOKEN}`)
      return res.sendStatus(401);
    if (!d.instagram)
      return res
        .status(503)
        .json({ ok: false, error: "META_CLIENT_NOT_CONFIGURED" });
    const channels = await d.instagram.diagnostics();
    const instagram = channels.instagram;
    const ok =
      instagram.configured &&
      instagram.tokenAccount?.ok === true &&
      instagram.subscription?.messages === true &&
      instagram.subscription?.messagingPostbacks === true;
    return res.status(ok ? 200 : 503).json({ ok, channels });
  });

  const deliverPausedArrival = async (
    channel: Channel,
    customerId: string,
    messages: string[],
    kind: ArrivalUpdateKind,
  ) => {
    const customerMessage =
      kind === "outside" ? "Ya salgo!" : "Dale, te esperamos";
    const status = messages.join(" | ");
    const reason =
      kind === "outside"
        ? `🚨🚨🚨 CLIENTE AFUERA O EN LA PUERTA DEL PUNTO DE RETIRO 🚨🚨🚨 Estado: ${status}`
        : `🚨 CLIENTE LLEGANDO O CERCA DEL PUNTO DE RETIRO 🚨 Estado: ${status}`;
    // Primero se confirma la alerta. Si Telegram no la recibió, no enviamos
    // un "Ya salgo" que dejaría al cliente esperando sin que el equipo sepa.
    await d.takeover.request(
      channel,
      customerId,
      reason,
      undefined,
      undefined,
      true,
    );
    if (channel === "whatsapp") {
      await d.openclaw.sendDirect(
        channel,
        customerId,
        customerMessage,
        d.config.WHATSAPP_ACCOUNT,
      );
    } else if (channel === "instagram" || channel === "messenger") {
      if (!d.instagram) {
        throw new Error("INSTAGRAM_NOT_CONFIGURED");
      }

      await d.instagram.send(channel, customerId, customerMessage);
    }

    logger.info({ channel, kind }, "paused_arrival_handled");

    return customerMessage;
  };

  const rate = new Map<string, { minute: number; count: number }>();
  app.use("/api/tools", (req, res, next) => {
    if (
      d.config.TOOL_API_TOKEN &&
      req.header("authorization") !== `Bearer ${d.config.TOOL_API_TOKEN}`
    )
      return res.sendStatus(401);
    const minute = Math.floor(Date.now() / 60_000);
    const key = req.ip || "local";
    const current = rate.get(key);
    const entry = current?.minute === minute ? current : { minute, count: 0 };
    entry.count += 1;
    rate.set(key, entry);
    if (entry.count > d.config.TOOL_RATE_LIMIT_PER_MINUTE)
      return res.status(429).json({ ok: false, error: "RATE_LIMITED" });
    return next();
  });

  app.post(
    "/api/tools/:name",
    express.json({ limit: "64kb" }),
    async (req, res) => {
      const toolName = String(req.params.name);
      try {
        res.json({
          ok: true,
          result: await d.tools.execute(
            toolName,
            req.body as Record<string, unknown>,
          ),
        });
      } catch (error) {
        req.log.error({ err: error, tool: toolName }, "tool_failed");
        res.status(400).json({
          ok: false,
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      }
    },
  );

  const verifyMetaWebhook: express.RequestHandler = (req, res) => {
    if (
      req.query["hub.mode"] === "subscribe" &&
      req.query["hub.verify_token"] === d.config.META_VERIFY_TOKEN
    )
      return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    return res.sendStatus(403);
  };
  app.get("/webhooks/instagram", verifyMetaWebhook);
  app.get("/webhooks/meta", verifyMetaWebhook);

  const receiveMetaWebhook: express.RequestHandler = (req, res) => {
    const raw = req.body as Buffer;
    type MetaReferral = { source?: string; type?: string; ad_id?: string };
    type MetaMessage = {
      text?: string;
      is_echo?: boolean;
      app_id?: string | number;
      attachments?: Array<{ type?: string; payload?: { url?: string } }>;
      reply_to?: { story?: { id?: string; url?: string } };
      referral?: MetaReferral;
    };
    type MetaEvent = {
      sender?: { id?: string };
      recipient?: { id?: string };
      from?: { id?: string };
      to?: { id?: string };
      sender_id?: string;
      recipient_id?: string;
      message?: MetaMessage;
      text?: string;
      referral?: MetaReferral;
    };
    type MetaChangeValue = MetaEvent & {
      messaging?: MetaEvent[];
      messages?: MetaEvent[];
    };
    const body = JSON.parse(raw.toString("utf8")) as {
      object?: string;
      entry?: Array<{
        messaging?: MetaEvent[];
        changes?: Array<{ field?: string; value?: MetaChangeValue }>;
      }>;
    };
    const signatureSecrets =
      body.object === "page"
        ? [d.config.META_APP_SECRET]
        : [d.config.META_INSTAGRAM_APP_SECRET, d.config.META_APP_SECRET].filter(
            Boolean,
          );
    if (
      !signatureSecrets.some((secret) =>
        verifyMetaSignature(raw, req.header("x-hub-signature-256"), secret),
      )
    ) {
      req.log.warn(
        {
          object: body.object ?? "unknown",
          hasSignature: Boolean(req.header("x-hub-signature-256")),
        },
        "meta_webhook_signature_rejected",
      );
      return res.sendStatus(401);
    }
    const channel: Channel = body.object === "page" ? "messenger" : "instagram";
    const events =
      body.entry?.flatMap((entry) => [
        ...(entry.messaging ?? []),
        ...(entry.changes ?? []).flatMap((change) => {
          const value = change.value;
          if (!value) return [];
          if (value.messaging?.length) return value.messaging;
          if (value.messages?.length) return value.messages;
          return [value];
        }),
      ]) ?? [];
    req.log.info(
      { channel, eventCount: events.length },
      "meta_webhook_received",
    );
    if (events.length === 0) {
      req.log.warn(
        {
          channel,
          object: body.object ?? "unknown",
          entryKeys: body.entry?.map((entry) => Object.keys(entry)) ?? [],
          changeFields:
            body.entry?.flatMap(
              (entry) =>
                entry.changes?.map((change) => change.field ?? "unknown") ?? [],
            ) ?? [],
        },
        "meta_webhook_unhandled",
      );
    }
    for (const event of events) {
      if (event.message?.is_echo) {
        if (event.message.app_id != null) continue;

        const customerId = event.recipient?.id;
        const echoText = event.message.text ?? "[mensaje multimedia]";

        if (
          customerId &&
          d.instagram?.isAutomatedEcho(channel, customerId, echoText)
        ) {
          continue;
        }

        if (customerId) {
          // Si una persona tomó la conversación, cancelamos cualquier
          // respuesta automática que todavía esté esperando el debounce.
          d.debounce.cancel(`${channel}:${customerId}`);

          d.takeover.humanMessage(channel, customerId, echoText);
        }

        continue;
      }
      const customerId = event.sender?.id ?? event.from?.id ?? event.sender_id;
      const attachments = event.message?.attachments ?? [];
      const attachmentText = attachments
        .map((item) => {
          const label =
            item.type === "image"
              ? "imagen"
              : item.type === "video"
                ? "video"
                : item.type === "audio"
                  ? "audio"
                  : "archivo";
          return `[El cliente envió ${label}${item.payload?.url ? `: ${item.payload.url}` : ""}]`;
        })
        .join("\n");
      const text = [
        event.message?.text?.trim() ?? event.text?.trim(),
        attachmentText,
      ]
        .filter(Boolean)
        .join("\n");
      if (!customerId || !text) continue;
      const c = d.conversations.getOrCreate(channel, customerId);
      c.lastMessages.push(text);
      c.lastActivity = new Date().toISOString();
      d.conversations.save(c);
      const arrivalKind = arrivalUpdateKind(text);
      if (arrivalKind) {
        req.log.info({ channel, arrivalKind }, "meta_arrival_queued");
        d.debounce.push(`${channel}:${customerId}`, text, async (messages) => {
          await deliverPausedArrival(
            channel,
            customerId,
            messages,
            arrivalKind,
          );
        });
        continue;
      }
      if (opensFreshTopic(text)) d.takeover.resume(channel, customerId);
      if (!d.takeover.canAiReply(channel, customerId)) {
        req.log.info({ channel }, "meta_message_paused");
        continue;
      }
      const isStoryContext = Boolean(
        event.message?.reply_to?.story ||
        event.referral?.source?.toUpperCase() === "ADS" ||
        event.message?.referral?.source?.toUpperCase() === "ADS",
      );

      if (isStoryContext && isCasualStoryReaction(text)) {
        req.log.info({ channel }, "meta_story_reaction_queued");

        d.debounce.push(`${channel}:${customerId}`, text, async (messages) => {
          if (!d.instagram) {
            throw new Error("INSTAGRAM_NOT_CONFIGURED");
          }

          if (!d.takeover.canAiReply(channel, customerId)) {
            logger.info(
              { channel, customerId },
              "meta_story_reply_cancelled_human_active",
            );
            return;
          }

          const combined = messages.join("\n");

          if (!isCasualStoryReaction(combined)) {
            const reply = await d.openclaw.reply(channel, customerId, messages);

            if (!d.takeover.canAiReply(channel, customerId)) {
              logger.info(
                { channel, customerId },
                "meta_story_generated_reply_cancelled_human_active",
              );
              return;
            }

            await d.instagram.send(channel, customerId, reply);

            return;
          }

          if (!d.takeover.canAiReply(channel, customerId)) {
            logger.info(
              { channel, customerId },
              "meta_story_reply_cancelled_human_active",
            );
            return;
          }

          await d.instagram.send(
            channel,
            customerId,
            casualStoryReply(combined),
          );

          logger.info(
            {
              channel,
              customerId,
              messageCount: messages.length,
            },
            "meta_story_reaction_sent",
          );
        });

        continue;
      }

      req.log.info({ channel }, "meta_message_queued");

      d.debounce.push(`${channel}:${customerId}`, text, async (messages) => {
        if (!d.instagram) {
          throw new Error("INSTAGRAM_NOT_CONFIGURED");
        }

        if (!d.takeover.canAiReply(channel, customerId)) {
          logger.info(
            { channel, customerId },
            "meta_debounced_reply_cancelled_human_active",
          );
          return;
        }

        const startedAt = Date.now();

        const reply = await d.openclaw.reply(channel, customerId, messages);

        const agentMs = Date.now() - startedAt;

        if (!d.takeover.canAiReply(channel, customerId)) {
          logger.info(
            { channel, customerId },
            "meta_generated_reply_cancelled_human_active",
          );
          return;
        }

        await d.instagram.send(channel, customerId, reply);

        logger.info(
          {
            channel,
            customerId,
            messageCount: messages.length,
            configuredDelayMs: d.config.DEBOUNCE_MS,
            agentMs,
            deliveryMs: Date.now() - startedAt - agentMs,
            processingMs: Date.now() - startedAt,
          },
          "meta_reply_sent",
        );
      });
    }

    res.sendStatus(200);
  };

  const metaBody = express.raw({
    type: "application/json",
    limit: "256kb",
  });

  app.post("/webhooks/instagram", metaBody, receiveMetaWebhook);

  app.post("/webhooks/meta", metaBody, receiveMetaWebhook);

  app.post(
    "/webhooks/openclaw/inbound",
    express.json({ limit: "64kb" }),
    (req, res) => {
      if (
        req.header("authorization") !== `Bearer ${d.config.OPENCLAW_HOOK_TOKEN}`
      ) {
        return res.sendStatus(401);
      }

      const { channel, customerId, message } = req.body as {
        channel: "whatsapp";
        customerId: string;
        message: string;
      };

      if (channel !== "whatsapp" || !customerId || !message) {
        return res.sendStatus(400);
      }

      const c = d.conversations.getOrCreate(channel, customerId);

      c.lastMessages.push(message);
      c.lastActivity = new Date().toISOString();
      d.conversations.save(c);

      const arrivalKind = arrivalUpdateKind(message);

      if (arrivalKind) {
        d.debounce.push(
          `${channel}:${customerId}`,
          message,
          async (messages) => {
            await deliverPausedArrival(
              channel,
              customerId,
              messages,
              arrivalKind,
            );
          },
        );

        return res.json({
          accept: true,
          queued: true,
          state: c.state,
          arrival: true,
        });
      }

      if (opensFreshTopic(message)) {
        d.takeover.resume(channel, customerId);
      }

      const accept = d.takeover.canAiReply(channel, customerId);

      if (accept) {
        d.debounce.push(
          `${channel}:${customerId}`,
          message,
          async (messages) => {
            if (!d.takeover.canAiReply(channel, customerId)) {
              logger.info(
                { channel, customerId },
                "whatsapp_dispatch_cancelled_human_active",
              );
              return;
            }

            const startedAt = Date.now();

            await d.openclaw.dispatch(channel, customerId, messages);

            logger.info(
              {
                channel,
                customerId,
                messageCount: messages.length,
                configuredDelayMs: d.config.DEBOUNCE_MS,
                dispatchMs: Date.now() - startedAt,
              },
              "whatsapp_dispatch_accepted",
            );
          },
        );
      }

      return res.json({
        accept,
        queued: accept,
        state: accept ? "AI_ACTIVE" : c.state,
      });
    },
  );

  app.post("/internal/piri/message", parsePiriJson, async (req, res) => {
    if (!d.config.PIRI_INTERNAL_SECRET) {
      return res.status(503).json({
        ok: false,
        error: "PIRI_NOT_CONFIGURED",
      });
    }

    if (req.header("x-internal-secret") !== d.config.PIRI_INTERNAL_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const parsed = piriMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_REQUEST",
      });
    }

    const channel: Channel = "web";
    const customerId = parsed.data.sessionId;
    const message = parsed.data.message;

    try {
      /*
       * Guardamos el mensaje usando la misma memoria
       * de conversaciones que los demás canales.
       */
      d.takeover.recordCustomerMessage(channel, customerId, message);

      /*
       * Mantenemos la misma excepción de llegada
       * física durante una intervención humana.
       */
      const arrivalKind = arrivalUpdateKind(message);

      if (arrivalKind) {
        const reply = await deliverPausedArrival(
          channel,
          customerId,
          [message],
          arrivalKind,
        );

        const conversation = d.conversations.getOrCreate(channel, customerId);

        return res.json({
          ok: true,
          reply,
          state: conversation.state,
        });
      }

      /*
       * Exactamente igual que WhatsApp/Meta: sólo un saludo
       * explícito puede reactivar la IA después de un takeover.
       */
      if (opensFreshTopic(message)) {
        d.takeover.resume(channel, customerId);
      }

      /*
       * Si la conversación sigue en takeover humano,
       * no llamamos a OpenClaw.
       */
      if (!d.takeover.canAiReply(channel, customerId)) {
        const conversation = d.conversations.getOrCreate(channel, customerId);

        return res.json({
          ok: true,
          reply: null,
          state: conversation.state,
        });
      }

      /*
       * MISMO OpenClawClient y MISMO agente.
       *
       * OpenClawClient ya construye:
       * sessionKey = `${channel}:${customerId}`
       *
       * Por lo tanto:
       * web:<sessionId>
       */
      const reply = await d.openclaw.reply(channel, customerId, [message]);

      const conversation = d.conversations.getOrCreate(channel, customerId);

      return res.json({
        ok: true,
        reply: reply === "NO_REPLY" ? null : reply,
        state: conversation.state,
      });
    } catch (error) {
      /*
       * El logger ya redacta x-internal-secret.
       * No devolvemos stack ni detalles internos.
       */
      req.log.error(
        {
          err: error,
          channel,
          customerId,
        },
        "piri_message_failed",
      );

      if (isOpenClawTimeoutError(error)) {
        return res.status(504).json({
          ok: false,
          error: "OPENCLAW_TIMEOUT",
        });
      }

      return res.status(502).json({
        ok: false,
        error: "AGENT_ERROR",
      });
    }
  });

  app.post(
    "/webhooks/internal",
    express.json({ limit: "32kb" }),
    (req, res) => {
      if (
        !d.config.INTERNAL_WEBHOOK_SECRET ||
        req.header("x-internal-secret") !== d.config.INTERNAL_WEBHOOK_SECRET
      )
        return res.sendStatus(401);
      const {
        command,
        channel,
        customerId,
        text,
        quantity,
        unitPrice,
        conditions,
      } = req.body as Record<string, unknown>;
      try {
        if (command === "resume")
          return res.json(
            d.takeover.resume(channel as Channel, String(customerId)),
          );
        if (command === "human_message") {
          const parsedChannel = channel as Channel;
          const parsedCustomerId = String(customerId);

          // Cancelamos cualquier respuesta pendiente del bot.
          d.debounce.cancel(`${parsedChannel}:${parsedCustomerId}`);

          return res.json(
            d.takeover.humanMessage(
              parsedChannel,
              parsedCustomerId,
              String(text ?? ""),
            ),
          );
        }
        if (command === "set_negotiated_price") {
          const c = d.conversations.setNegotiatedPrice(
            channel as Channel,
            String(customerId),
            {
              quantity: Number(quantity),
              unitPrice: Number(unitPrice),
              conditions: String(conditions ?? ""),
              timestamp: new Date().toISOString(),
            },
          );
          return res.json(c);
        }
        return res.status(400).json({ error: "UNKNOWN_COMMAND" });
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      }
    },
  );
  return app;
}
