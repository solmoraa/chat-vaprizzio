import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("API REST por capas", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function start() {
    const conversations = new ConversationRepository(":memory:");
    conversations.appendMessage("whatsapp", "cliente-1", "Hola");
    const takeover = new TakeoverService(conversations, { notify:vi.fn() });
    const catalog = { priceList:vi.fn().mockResolvedValue([{ model:"Ice King" }]) };
    const app = createApp({
      config:loadConfig({ TOOL_API_TOKEN:"token-rest-seguro-de-prueba-123456789" }),
      tools:{ catalog, execute:vi.fn() } as never,
      conversations,
      debounce:{ push:vi.fn(), cancel:vi.fn() } as never,
      openclaw:{} as never,
      takeover,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    return `http://127.0.0.1:${address.port}`;
  }

  it("protege todos los recursos con Bearer token", async () => {
    const base = await start();
    expect((await fetch(`${base}/api/v1/catalog`)).status).toBe(401);
  });

  it("expone catálogo y conversaciones como recursos REST", async () => {
    const base = await start();
    const headers = { authorization:"Bearer token-rest-seguro-de-prueba-123456789" };
    const catalog = await fetch(`${base}/api/v1/catalog`, { headers });
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toMatchObject({ ok:true, data:[{ model:"Ice King" }] });

    const conversation = await fetch(`${base}/api/v1/conversations/whatsapp/cliente-1`, { headers });
    expect(conversation.status).toBe(200);
    expect(await conversation.json()).toMatchObject({ ok:true, data:{ channel:"whatsapp", customerId:"cliente-1" } });
  });

  it("permite marcar intervención humana y reanudar sin duplicar reglas", async () => {
    const base = await start();
    const headers = {
      authorization:"Bearer token-rest-seguro-de-prueba-123456789",
      "content-type":"application/json",
    };
    const paused = await fetch(`${base}/api/v1/conversations/whatsapp/cliente-1/human-messages`, {
      method:"POST", headers, body:JSON.stringify({ text:"Lo sigo yo" }),
    });
    expect(paused.status).toBe(202);
    expect(await paused.json()).toMatchObject({ data:{ state:"HUMAN_ACTIVE" } });

    const resumed = await fetch(`${base}/api/v1/conversations/whatsapp/cliente-1/resume`, {
      method:"POST", headers, body:"{}",
    });
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({ data:{ state:"AI_ACTIVE" } });
  });
});
