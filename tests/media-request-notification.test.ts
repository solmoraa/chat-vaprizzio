import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("solicitudes de fotos y videos", () => {
  it.each(["foto", "video", "fotos_y_video"])("notifica y pausa al pedir %s", async (mediaType) => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    const result = await tools.execute("reportar_solicitud_media", { channel:"whatsapp", customerId:`media-${mediaType}`, mediaType, product:"Geek Bar Pulse X" });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.stringContaining(mediaType) }));
    expect(result).toMatchObject({ action:"ENVIAR_MEDIA", customerMessage:"Dale, dame un segundo ya te mando", state:"WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", `media-${mediaType}`)).toBe(false);
  });
});
