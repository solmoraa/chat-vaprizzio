import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("notificaciones consecutivas", () => {
  it("envía cada alerta durante la pausa sin extenderla", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T15:00:00Z"));
    const repo = new ConversationRepository(":memory:");
    const notify = vi.fn();
    const takeover = new TakeoverService(repo, { notify });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never);

    await tools.execute("solicitar_intervencion_humana", { channel:"whatsapp", customerId:"repetido", reason:"Primer evento" });
    const firstPause = repo.getOrCreate("whatsapp", "repetido").pausedUntil;
    vi.setSystemTime(new Date("2026-08-09T15:20:00Z"));
    const second = await tools.execute("solicitar_intervencion_humana", { channel:"whatsapp", customerId:"repetido", reason:"Segundo evento" });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(second).not.toMatchObject({ blocked:true });
    expect(repo.getOrCreate("whatsapp", "repetido").pausedUntil).toBe(firstPause);
    vi.useRealTimers();
  });
});
