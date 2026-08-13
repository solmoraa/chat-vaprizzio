import { afterEach, describe, expect, it, vi } from "vitest";
import { InstagramClient } from "../src/channels/instagram/client.js";

describe("nombre del cliente de Meta", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prioriza el username de Instagram", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ username:"sol_cliente", name:"Sol" }), { status:200 }));
    const client = new InstagramClient("token", "v26.0");
    expect(await client.customerName("instagram", "123")).toBe("@sol_cliente");
    expect(String(request.mock.calls[0]?.[0])).toContain("fields=username%2Cname");
  });

  it("usa el nombre visible de Messenger", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ first_name:"Sol", last_name:"Mora" }), { status:200 }));
    const client = new InstagramClient("token", "v26.0");
    expect(await client.customerName("messenger", "456")).toBe("Sol Mora");
  });

  it("vuelve al ID si Meta no permite leer el perfil", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status:403 }));
    const client = new InstagramClient("token", "v26.0");
    expect(await client.customerName("instagram", "789")).toBeNull();
  });

  it("diagnostica token y campos suscriptos sin exponer credenciales", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:"ig-account", username:"vaprizzio" }), { status:200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data:[{ id:"app-id", subscribed_fields:["messages", "messaging_postbacks"] }] }), { status:200 }));
    const client = new InstagramClient("page-token", "v26.0", "instagram-token", "ig-account");

    await expect(client.diagnostics()).resolves.toMatchObject({
      instagram:{
        configured:true,
        configuredAccountId:"ig-account",
        tokenAccount:{ ok:true, id:"ig-account", username:"vaprizzio" },
        subscription:{ ok:true, messages:true, messagingPostbacks:true, appIds:["app-id"] },
      },
    });
    expect(request.mock.calls.every(call => !String(call[0]).includes("page-token"))).toBe(true);
    expect(String(request.mock.calls[1]?.[0])).toContain("/ig-account/subscribed_apps");
  });
});
