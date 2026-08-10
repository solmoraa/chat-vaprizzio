import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

describe("seguridad de la API comercial", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it("exige token, limita solicitudes y expone readiness", async () => {
    const execute = vi.fn().mockResolvedValue({ value:"ok" });
    const app = createApp({
      config:loadConfig({ TOOL_API_TOKEN:"token-seguro", TOOL_RATE_LIMIT_PER_MINUTE:"1" }),
      tools:{ execute, catalog:{ priceList:vi.fn().mockResolvedValue([]) } } as never,
      conversations:{} as never, debounce:{} as never, openclaw:{} as never, takeover:{} as never
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("NO_ADDRESS");
    const base = `http://127.0.0.1:${address.port}`;

    expect((await fetch(`${base}/api/tools/prueba`, { method:"POST", headers:{"content-type":"application/json"}, body:"{}" })).status).toBe(401);
    expect((await fetch(`${base}/api/tools/prueba`, { method:"POST", headers:{"content-type":"application/json",authorization:"Bearer token-seguro"}, body:"{}" })).status).toBe(200);
    expect((await fetch(`${base}/api/tools/prueba`, { method:"POST", headers:{"content-type":"application/json",authorization:"Bearer token-seguro"}, body:"{}" })).status).toBe(429);
    expect((await fetch(`${base}/ready`)).status).toBe(200);
  });
});
