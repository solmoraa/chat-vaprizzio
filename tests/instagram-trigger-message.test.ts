import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("mensaje original en alertas de Instagram", () => {
  it("guarda el texto exacto que disparó la notificación", async () => {
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);
    const message = "Hola, me mandás un video del Pulse X?";

    await tools.execute("reportar_solicitud_media", { channel:"instagram", customerId:"ig-1", mediaType:"video", product:"Pulse X", triggerMessage:message });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ channel:"instagram", messages:[message] }));
  });
});
