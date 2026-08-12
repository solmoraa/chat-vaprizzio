import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

const signature = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function buildApp() {
  const config = loadConfig({
    META_APP_SECRET:"messenger-secret",
    META_INSTAGRAM_APP_SECRET:"instagram-secret",
  });
  return createApp({
    config,
    tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
    conversations:{ getOrCreate:vi.fn().mockReturnValue({ lastMessages:[], lastActivity:"" }), save:vi.fn() } as never,
    debounce:{ push:vi.fn() } as never,
    openclaw:{} as never,
    takeover:{ resume:vi.fn(), canAiReply:vi.fn().mockReturnValue(true), humanMessage:vi.fn() } as never,
  });
}

function buildInspectableApp() {
  const debounce = { push:vi.fn() };
  const app = createApp({
    config:loadConfig({ META_APP_SECRET:"messenger-secret", META_INSTAGRAM_APP_SECRET:"instagram-secret" }),
    tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
    conversations:{ getOrCreate:vi.fn().mockReturnValue({ lastMessages:[], lastActivity:"" }), save:vi.fn() } as never,
    debounce:debounce as never,
    openclaw:{} as never,
    takeover:{ resume:vi.fn(), canAiReply:vi.fn().mockReturnValue(true), humanMessage:vi.fn() } as never,
  });
  return { app, debounce };
}

describe("firmas separadas de Meta", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function post(body: string, secret: string) {
    server = buildApp().listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    return fetch(`http://127.0.0.1:${address.port}/webhooks/instagram`, {
      method:"POST",
      headers:{ "content-type":"application/json", "x-hub-signature-256":signature(body, secret) },
      body,
    });
  }

  it("acepta Instagram con la clave de la app de Instagram", async () => {
    const body = JSON.stringify({ object:"instagram", entry:[] });
    expect((await post(body, "instagram-secret")).status).toBe(200);
  });

  it("mantiene Messenger con la clave general de Meta", async () => {
    const body = JSON.stringify({ object:"page", entry:[] });
    expect((await post(body, "messenger-secret")).status).toBe(200);
  });

  it("acepta eventos de Instagram dentro de changes.value", async () => {
    const body = JSON.stringify({ object:"instagram", entry:[{ changes:[{ field:"messages", value:{ sender:{ id:"cliente" }, recipient:{ id:"cuenta" }, message:{ text:"Hola" } } }] }] });
    expect((await post(body, "instagram-secret")).status).toBe(200);
  });

  it("encola el formato changes.value.messages de Instagram", async () => {
    const { app, debounce } = buildInspectableApp();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const body = JSON.stringify({ object:"instagram", entry:[{ changes:[{ field:"messages", value:{ messages:[{ from:{ id:"cliente" }, to:{ id:"cuenta" }, text:"Hola" }] } }] }] });
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/instagram`, {
      method:"POST",
      headers:{ "content-type":"application/json", "x-hub-signature-256":signature(body, "instagram-secret") },
      body,
    });
    expect(response.status).toBe(200);
    expect(debounce.push).toHaveBeenCalledWith("instagram:cliente", "Hola", expect.any(Function));
  });
});
