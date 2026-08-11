import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";
import { InstagramClient } from "../src/channels/instagram/client.js";
import type { Channel } from "../src/domain/types.js";

const channels: Channel[] = ["whatsapp", "messenger", "instagram"];

describe("paridad entre canales comerciales", () => {
  it.each(channels)("aplica la misma pausa humana y alerta en %s", async channel => {
    const repo = new ConversationRepository(":memory:", 720);
    const notify = vi.fn().mockResolvedValue(undefined);
    const takeover = new TakeoverService(repo, { notify });
    takeover.recordCustomerMessage(channel, "cliente", "necesito ayuda");

    await takeover.request(channel, "cliente", "Prueba de intervención");

    expect(takeover.canAiReply(channel, "cliente")).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ channel, customerId:"cliente", messages:["necesito ayuda"] }));
  });

  it.each(channels)("reinicia el estado después de 12 horas en %s", channel => {
    const repo = new ConversationRepository(":memory:", 720);
    const conversation = repo.getOrCreate(channel, "cliente");
    conversation.state = "WAITING_HUMAN";
    conversation.lastMessages = ["tema anterior"];
    conversation.lastActivity = new Date(Date.now() - 721 * 60_000).toISOString();
    repo.save(conversation);

    expect(repo.getOrCreate(channel, "cliente")).toMatchObject({ state:"AI_ACTIVE", lastMessages:[], pausedUntil:null });
  });
});

describe("formato de respuestas Meta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envía los bloques separados igual que el chat de WhatsApp", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok:true, status:200 });
    vi.stubGlobal("fetch", fetchMock);
    const client = new InstagramClient("token", "v26.0");

    await client.send("cliente", "Primer mensaje\n\nSegundo mensaje\n\nTercer mensaje");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).message.text)).toEqual(["Primer mensaje", "Segundo mensaje", "Tercer mensaje"]);
  });
});
