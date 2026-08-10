import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

const setup = () => {
  const repo = new ConversationRepository(":memory:");
  const notify = vi.fn();
  const takeover = new TakeoverService(repo, { notify });
  return { notify, takeover, tools:new AgentToolService({} as never, {} as never, takeover, {} as never) };
};

describe("consultas fuera del horario", () => {
  it("entre las 19 y las 23 alerta y deja la conversación al humano", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T01:30:00Z"));
    const { notify, takeover, tools } = setup();
    const result = await tools.execute("reportar_consulta_fuera_horario", { channel:"whatsapp", customerId:"nocturno", triggerMessage:"hola están?" });
    expect(notify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ action:"ATENCION_HUMANA", customerMessage:expect.stringContaining("consulto a los chicos") });
    expect(takeover.canAiReply("whatsapp", "nocturno")).toBe(false);
    vi.useRealTimers();
  });

  it("desde las 23 informa horario y web sin alertar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T02:00:00Z"));
    const { notify, takeover, tools } = setup();
    const result = await tools.execute("reportar_consulta_fuera_horario", { channel:"whatsapp", customerId:"muy-tarde", triggerMessage:"quiero un vape" });
    expect(notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action:"PEDIDO_MANANA", customerMessage:expect.stringContaining("10 a 19 hs") });
    expect(result).toMatchObject({ customerMessage:expect.stringContaining("https://www.vaprizzio.com/productos/") });
    expect(takeover.canAiReply("whatsapp", "muy-tarde")).toBe(true);
    vi.useRealTimers();
  });
});
