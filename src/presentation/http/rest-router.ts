import { timingSafeEqual } from "node:crypto";
import { Router, json, type RequestHandler } from "express";
import { z } from "zod";
import type { CatalogUseCases } from "../../application/catalog-use-cases.js";
import type { ConversationUseCases } from "../../application/conversation-use-cases.js";
import type { Channel } from "../../domain/types.js";

const channelSchema = z.enum(["whatsapp", "instagram", "messenger", "web"]);
const customerIdSchema = z.string().trim().min(1).max(256);
const humanMessageSchema = z
  .object({ text: z.string().trim().min(1).max(2_000) })
  .strict();

export interface RestRouterDependencies {
  token: string;
  catalog: CatalogUseCases;
  conversations: ConversationUseCases;
}

const readIdentity = (channelValue: string, customerIdValue: string) => ({
  channel: channelSchema.parse(channelValue) as Channel,
  customerId: customerIdSchema.parse(customerIdValue),
});

const hasValidBearerToken = (authorization: string | undefined, token: string) => {
  const received = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);

  return received.length === expected.length && timingSafeEqual(received, expected);
};

/**
 * API REST administrativa. Los webhooks continúan separados porque son
 * eventos entrantes de terceros, no recursos REST consultados por un cliente.
 */
export function createRestRouter(d: RestRouterDependencies) {
  const router = Router();

  const authorize: RequestHandler = (req, res, next) => {
    if (!d.token) {
      return res.status(503).json({ ok: false, error: "REST_API_TOKEN_NOT_CONFIGURED" });
    }
    if (!hasValidBearerToken(req.header("authorization"), d.token)) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    return next();
  };

  router.use(authorize);
  router.use(json({ limit: "32kb" }));

  router.get("/catalog", async (req, res) => {
    try {
      const model =
        typeof req.query.model === "string" ? req.query.model.trim() : "";
      const flavor =
        typeof req.query.flavor === "string" ? req.query.flavor.trim() : "";
      const result =
        model || flavor
          ? await d.catalog.search({
              ...(model ? { model } : {}),
              ...(flavor ? { flavor } : {}),
            })
          : await d.catalog.list();
      return res.json({ ok: true, data: result });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "INVALID_REQUEST",
      });
    }
  });

  router.get("/conversations/:channel/:customerId", (req, res) => {
    try {
      const identity = readIdentity(
        String(req.params.channel),
        String(req.params.customerId),
      );
      const conversation = d.conversations.get(identity.channel, identity.customerId);
      if (!conversation)
        return res
          .status(404)
          .json({ ok: false, error: "CONVERSATION_NOT_FOUND" });
      return res.json({ ok: true, data: conversation });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "INVALID_REQUEST",
      });
    }
  });

  router.post("/conversations/:channel/:customerId/human-messages", (req, res) => {
    try {
      const identity = readIdentity(
        String(req.params.channel),
        String(req.params.customerId),
      );
      const body = humanMessageSchema.parse(req.body);
      const conversation = d.conversations.recordHumanMessage(
        identity.channel,
        identity.customerId,
        body.text,
      );
      return res.status(202).json({ ok: true, data: conversation });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "INVALID_REQUEST",
      });
    }
  });

  router.post("/conversations/:channel/:customerId/resume", (req, res) => {
    try {
      const identity = readIdentity(
        String(req.params.channel),
        String(req.params.customerId),
      );
      const conversation = d.conversations.resume(identity.channel, identity.customerId);
      return res.json({ ok: true, data: conversation });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "INVALID_REQUEST",
      });
    }
  });

  return router;
}
