import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import type { Channel } from "../src/domain/types.js";
import { MessageDebouncer } from "../src/services/debouncer.js";
import { TakeoverService } from "../src/services/takeover-service.js";

const signature = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("llegadas durante una intervencion humana", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it.each(["whatsapp", "messenger", "instagram"] as const)("alerta y responde directamente en %s", async channel => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn().mockResolvedValue(undefined);
    const takeover = new TakeoverService(repo, { notify });
    const sendMeta = vi.fn().mockResolvedValue(undefined);
    const sendDirect = vi.fn().mockResolvedValue(undefined);
    const config = loadConfig({
      DEBOUNCE_MS:"0",
      OPENCLAW_HOOK_TOKEN:"hook-token",
      WHATSAPP_ACCOUNT:"vaprizzio-sales",
      META_APP_SECRET:"messenger-secret",
      META_INSTAGRAM_APP_SECRET:"instagram-secret",
    });
    const customerId = channel === "whatsapp" ? "5491157174460" : `cliente-${channel}`;
    repo.setState(channel, customerId, "WAITING_HUMAN", null);
    const app = createApp({
      config,
      tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
      conversations:repo,
      debounce:new MessageDebouncer(0),
      openclaw:{ sendDirect, dispatch:vi.fn(), reply:vi.fn() } as never,
      takeover,
      instagram:{ send:sendMeta, isAutomatedEcho:vi.fn().mockReturnValue(false), diagnostics:vi.fn() } as never,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");

    if (channel === "whatsapp") {
      const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`, {
        method:"POST",
        headers:{ "content-type":"application/json", authorization:"Bearer hook-token" },
        body:JSON.stringify({ channel, customerId, message:"toy en la puerta" }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ accept:true, queued:true, arrival:true, state:"WAITING_HUMAN" });
    } else {
      const object = channel === "messenger" ? "page" : "instagram";
      const secret = channel === "messenger" ? "messenger-secret" : "instagram-secret";
      const body = JSON.stringify({ object, entry:[{ messaging:[{ sender:{ id:customerId }, message:{ text:"estoy afura" } }] }] });
      const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/instagram`, {
        method:"POST",
        headers:{ "content-type":"application/json", "x-hub-signature-256":signature(body, secret) },
        body,
      });
      expect(response.status).toBe(200);
    }

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ channel, customerId, reason:expect.stringContaining("AFUERA") }));
    if (channel === "whatsapp") expect(sendDirect).toHaveBeenCalledWith("whatsapp", customerId, "Ya salgo!", "vaprizzio-sales");
    else expect(sendMeta).toHaveBeenCalledWith(channel, customerId, "Ya salgo!");
    expect(takeover.canAiReply(channel as Channel, customerId)).toBe(false);
  });
});
