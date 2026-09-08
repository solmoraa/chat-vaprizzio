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

describe("llegadas al punto de retiro", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it.each(["AI_ACTIVE", "WAITING_HUMAN", "HUMAN_ACTIVE"] as const)("alerta antes de responder aun si el chat está %s", async initialState => {
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
    const channel: Channel = "whatsapp";
    const customerId = `llegada-${initialState}`;
    repo.setState(channel, customerId, initialState, null);
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

    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`, {
      method:"POST",
      headers:{ "content-type":"application/json", authorization:"Bearer hook-token" },
      body:JSON.stringify({ channel, customerId, message:"toy en la puerta" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ accept:true, queued:true, arrival:true, state:initialState });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ channel, customerId, reason:expect.stringContaining("AFUERA") }));
    expect(sendDirect).toHaveBeenCalledWith("whatsapp", customerId, "Ya salgo!", "vaprizzio-sales");
    expect(sendMeta).not.toHaveBeenCalled();
    expect(takeover.canAiReply(channel, customerId)).toBe(false);
  });

  it("no interpreta datos posteriores como una segunda llegada", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn().mockResolvedValue(undefined);
    const sendDirect = vi.fn().mockResolvedValue(undefined);
    const takeover = new TakeoverService(repo, { notify });
    const app = createApp({
      config:loadConfig({ DEBOUNCE_MS:"0", OPENCLAW_HOOK_TOKEN:"hook-token", WHATSAPP_ACCOUNT:"vaprizzio-sales" }),
      tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
      conversations:repo,
      debounce:new MessageDebouncer(0),
      openclaw:{ sendDirect, dispatch:vi.fn(), reply:vi.fn() } as never,
      takeover,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const send = (message:string) => fetch(`http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`, {
      method:"POST", headers:{ "content-type":"application/json", authorization:"Bearer hook-token" }, body:JSON.stringify({ channel:"whatsapp", customerId:"auto-blanco", message })
    });

    await send("Estoy afuera");
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    await send("Audi blanco");
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(sendDirect).toHaveBeenCalledTimes(1);
  });

  it.each(["instagram", "messenger"] as const)("alerta una llegada aunque %s estuviera activo", async channel => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn().mockResolvedValue(undefined);
    const sendMeta = vi.fn().mockResolvedValue(undefined);
    const customerId = `meta-${channel}`;
    const app = createApp({
      config:loadConfig({ DEBOUNCE_MS:"0", META_APP_SECRET:"messenger-secret", META_INSTAGRAM_APP_SECRET:"instagram-secret" }),
      tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
      conversations:repo,
      debounce:new MessageDebouncer(0),
      openclaw:{ sendDirect:vi.fn(), dispatch:vi.fn(), reply:vi.fn() } as never,
      takeover:new TakeoverService(repo, { notify }),
      instagram:{ send:sendMeta, isAutomatedEcho:vi.fn().mockReturnValue(false), diagnostics:vi.fn() } as never,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const object = channel === "messenger" ? "page" : "instagram";
    const secret = channel === "messenger" ? "messenger-secret" : "instagram-secret";
    const body = JSON.stringify({ object, entry:[{ messaging:[{ sender:{ id:customerId }, message:{ text:"estoy afuera" } }] }] });

    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/instagram`, {
      method:"POST", headers:{ "content-type":"application/json", "x-hub-signature-256":signature(body, secret) }, body,
    });
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(sendMeta).toHaveBeenCalledWith(channel, customerId, "Ya salgo!");
  });
});
