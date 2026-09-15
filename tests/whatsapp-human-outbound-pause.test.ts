import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { MessageDebouncer } from "../src/services/debouncer.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("mensaje manual saliente de WhatsApp", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it("cancela el despacho pendiente y bloquea dos horas aun sin takeover previo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T15:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const dispatch = vi.fn();
    const debounce = new MessageDebouncer(1_000);
    const app = createApp({
      config: loadConfig({ OPENCLAW_HOOK_TOKEN: "hook-token", DEBOUNCE_MS: "1000" }),
      tools: { catalog: { priceList: vi.fn() }, execute: vi.fn() } as never,
      conversations: repo,
      debounce,
      openclaw: { dispatch, sendDirect: vi.fn(), reply: vi.fn() } as never,
      takeover: new TakeoverService(repo, { notify: vi.fn() }),
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const url = `http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`;
    const send = (body: Record<string, unknown>) => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hook-token" },
      body: JSON.stringify(body),
    });

    await send({ channel: "whatsapp", customerId: "cliente", message: "Cuánto sale?", direction: "inbound" });
    const response = await send({
      channel: "whatsapp",
      customerId: "cliente",
      message: "Ya salgo, disculpá la demora",
      direction: "outbound",
      fromMe: true,
      senderType: "human",
    });

    await expect(response.json()).resolves.toMatchObject({
      accept: false,
      queued: false,
      state: "HUMAN_ACTIVE",
      pausedUntil: "2026-09-14T17:00:00.000Z",
    });

    await send({ channel: "whatsapp", customerId: "cliente", message: "Hola, seguís ahí?", direction: "inbound" });
    await vi.advanceTimersByTimeAsync(1_001);
    expect(dispatch).not.toHaveBeenCalled();
    expect(repo.getOrCreate("whatsapp", "cliente")).toMatchObject({
      state: "HUMAN_ACTIVE",
      pausedUntil: "2026-09-14T17:00:00.000Z",
    });
    vi.useRealTimers();
  });

  it("no confunde un envío automático con una intervención humana", async () => {
    const repo = new ConversationRepository(":memory:");
    const takeover = new TakeoverService(repo, { notify: vi.fn() });
    const app = createApp({
      config: loadConfig({ OPENCLAW_HOOK_TOKEN: "hook-token", DEBOUNCE_MS: "0" }),
      tools: { catalog: { priceList: vi.fn() }, execute: vi.fn() } as never,
      conversations: repo,
      debounce: new MessageDebouncer(0),
      openclaw: { dispatch: vi.fn(), sendDirect: vi.fn(), reply: vi.fn() } as never,
      takeover,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hook-token" },
      body: JSON.stringify({
        channel: "whatsapp", customerId: "cliente", message: "Respuesta automática",
        direction: "outbound", fromMe: true, senderType: "automation",
      }),
    });

    expect(response.status).toBe(200);
    expect(takeover.canAiReply("whatsapp", "cliente")).toBe(true);
  });

  it("acepta el nombre isFromMe que usan algunos relays", async () => {
    const repo = new ConversationRepository(":memory:");
    const app = createApp({
      config: loadConfig({ OPENCLAW_HOOK_TOKEN: "hook-token" }),
      tools: { catalog: { priceList: vi.fn() }, execute: vi.fn() } as never,
      conversations: repo,
      debounce: new MessageDebouncer(0),
      openclaw: { dispatch: vi.fn(), sendDirect: vi.fn(), reply: vi.fn() } as never,
      takeover: new TakeoverService(repo, { notify: vi.fn() }),
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");

    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hook-token" },
      body: JSON.stringify({
        channel: "whatsapp", customerId: "cliente", message: "Te esperamos",
        direction: "sent", isFromMe: true,
      }),
    });

    await expect(response.json()).resolves.toMatchObject({ state: "HUMAN_ACTIVE" });
  });

  it("no interrumpe cuando el humano inició la conversación y el cliente responde con una foto", async () => {
    const repo = new ConversationRepository(":memory:");
    const dispatch = vi.fn();
    const app = createApp({
      config: loadConfig({ OPENCLAW_HOOK_TOKEN: "hook-token", DEBOUNCE_MS: "0" }),
      tools: { catalog: { priceList: vi.fn() }, execute: vi.fn() } as never,
      conversations: repo,
      debounce: new MessageDebouncer(0),
      openclaw: { dispatch, sendDirect: vi.fn(), reply: vi.fn() } as never,
      takeover: new TakeoverService(repo, { notify: vi.fn() }),
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const url = `http://127.0.0.1:${address.port}/webhooks/openclaw/inbound`;
    const send = (body: Record<string, unknown>) => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer hook-token" },
      body: JSON.stringify(body),
    });

    const humanReply = await send({
      channel: "whatsapp",
      customerId: "postventa",
      message: "Hola! Cómo te llegó el vape?",
      direction: "outbound",
      fromMe: true,
      senderType: "human",
    });
    await expect(humanReply.json()).resolves.toMatchObject({
      accept: false,
      state: "HUMAN_ACTIVE",
    });

    const customerReply = await send({
      channel: "whatsapp",
      customerId: "postventa",
      message: "[El cliente envió una foto: todo bien]",
      direction: "inbound",
    });
    await expect(customerReply.json()).resolves.toMatchObject({
      accept: false,
      queued: false,
      state: "HUMAN_ACTIVE",
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
