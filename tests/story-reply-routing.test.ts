import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

const sign = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("respuestas informales a historias", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function sendStoryReply(channel: "instagram" | "messenger", text: string, asAd = false) {
    const debounce = { push:vi.fn() };
    const instagram = { send:vi.fn(), isAutomatedEcho:vi.fn(), diagnostics:vi.fn() };
    const openclaw = { reply:vi.fn().mockResolvedValue("respuesta comercial") };
    const config = loadConfig({
      META_APP_SECRET:"messenger-secret",
      META_INSTAGRAM_APP_SECRET:"instagram-secret",
    });
    const event = {
      sender:{ id:"cliente" },
      recipient:{ id:"cuenta" },
      message:{
        text,
        ...(asAd ? {} : { reply_to:{ story:{ id:"historia-1" } } }),
      },
      ...(asAd ? { referral:{ source:"ADS", type:"OPEN_THREAD", ad_id:"anuncio-1" } } : {}),
    };
    const body = JSON.stringify({ object:channel === "messenger" ? "page" : "instagram", entry:[{ messaging:[event] }] });
    const app = createApp({
      config,
      tools:{ catalog:{ priceList:vi.fn() }, execute:vi.fn() } as never,
      conversations:{ getOrCreate:vi.fn().mockReturnValue({ lastMessages:[], lastActivity:"" }), save:vi.fn() } as never,
      debounce:debounce as never,
      openclaw:openclaw as never,
      takeover:{ resume:vi.fn(), canAiReply:vi.fn().mockReturnValue(true), humanMessage:vi.fn() } as never,
      instagram:instagram as never,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/instagram`, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-hub-signature-256":sign(body, channel === "messenger" ? "messenger-secret" : "instagram-secret"),
      },
      body,
    });
    const handler = debounce.push.mock.calls[0]?.[2] as ((messages:string[]) => Promise<void>) | undefined;
    return { response, debounce, instagram, openclaw, handler };
  }

  it.each(["instagram", "messenger"] as const)("contesta una reacci\u00f3n casual de %s sin vender", async channel => {
    const result = await sendStoryReply(channel, "al finnn blvkkk");
    expect(result.response.status).toBe(200);
    expect(result.handler).toBeTypeOf("function");
    await result.handler!(["al finnn blvkkk"]);
    expect(result.instagram.send).toHaveBeenCalledWith(channel, "cliente", "Sii, entraron un mont\u00f3n de sabores \ud83d\ude0e\ud83d\udd25");
    expect(result.openclaw.reply).not.toHaveBeenCalled();
  });

  it("reconoce tambi\u00e9n una respuesta a una historia promocionada", async () => {
    const result = await sendStoryReply("instagram", "por finnn", true);
    await result.handler!(["por finnn"]);
    expect(result.instagram.send).toHaveBeenCalledWith("instagram", "cliente", "Sii, entraron un mont\u00f3n de sabores \ud83d\ude0e\ud83d\udd25");
  });

  it("mantiene el flujo normal si la respuesta a la historia pregunta por precio", async () => {
    const result = await sendStoryReply("instagram", "Cu\u00e1nto sale?");
    expect(result.response.status).toBe(200);
    expect(result.debounce.push).toHaveBeenCalledWith("instagram:cliente", "Cu\u00e1nto sale?", expect.any(Function));
    await result.handler!(["Cu\u00e1nto sale?"]);
    expect(result.openclaw.reply).toHaveBeenCalledWith("instagram", "cliente", ["Cu\u00e1nto sale?"]);
    expect(result.instagram.send).toHaveBeenCalledWith("instagram", "cliente", "respuesta comercial");
  });
});
