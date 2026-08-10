import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramNotifier } from "../src/notifications/notifier.js";

describe("TelegramNotifier", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envía la misma alerta a todos los chats configurados", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const notifier = new TelegramNotifier("token-test", "6579754152, 1566518876");

    await notifier.notify({ channel: "whatsapp", customerId: "cliente-1", reason: "demora", messages: ["no llegó"] });

    expect(request).toHaveBeenCalledTimes(2);
    const chatIds = request.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).chat_id);
    expect(chatIds).toEqual(["6579754152", "1566518876"]);
    const bodies = request.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).text as string);
    expect(bodies.every(body => body.includes("Mensaje del cliente: no llegó"))).toBe(true);
    expect(bodies.every(body => body.includes("Acciones internas:"))).toBe(true);
  });

  it("enmascara secuencias financieras largas en Telegram", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status:200 }));
    const notifier = new TelegramNotifier("token-test", "6579754152");
    await notifier.notify({ channel:"whatsapp", customerId:"cliente", reason:"pago", messages:["Mi CVU es 0000003100052918257843"] });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)).text as string;
    expect(body).toContain("***7843"); expect(body).not.toContain("0000003100052918257843");
  });
});
