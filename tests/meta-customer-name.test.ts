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
});
