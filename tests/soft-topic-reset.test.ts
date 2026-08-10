import { describe, expect, it, vi } from "vitest";
import { AgentToolService } from "../src/agent/tool-service.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";

describe("reinicio suave de tema", () => {
  it("reactiva la IA sin borrar el historial comercial", async () => {
    const repo = new ConversationRepository(":memory:", 720);
    const takeover = new TakeoverService(repo, { notify:vi.fn() });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never, undefined, repo);
    const conversation = repo.getOrCreate("whatsapp", "cambio-tema");
    conversation.currentProduct = "Lost Mary MO 5k";
    conversation.lastMessages = ["voy para el local", "no hay nadie"];
    repo.save(conversation);
    repo.setState("whatsapp", "cambio-tema", "WAITING_HUMAN", new Date(Date.now() + 3_600_000).toISOString());

    const result = await tools.execute("iniciar_nuevo_tema", {
      channel:"whatsapp", customerId:"cambio-tema", triggerMessage:"hola, tenés Lost Mary?"
    });

    expect(result).toMatchObject({ action:"NUEVO_TEMA", state:"AI_ACTIVE", contextPreserved:true });
    expect(repo.getOrCreate("whatsapp", "cambio-tema")).toMatchObject({
      state:"AI_ACTIVE", currentProduct:"Lost Mary MO 5k",
      lastMessages:expect.arrayContaining(["voy para el local", "no hay nadie", "hola, tenés Lost Mary?"])
    });
  });

  it("mantiene silencio ante un saludo durante una coordinación humana", async () => {
    const repo = new ConversationRepository(":memory:", 720);
    const takeover = new TakeoverService(repo, { notify:vi.fn() });
    const tools = new AgentToolService({} as never, {} as never, takeover, {} as never, undefined, repo);
    repo.setState("whatsapp", "coordinando", "WAITING_HUMAN", new Date(Date.now() + 3_600_000).toISOString());

    const result = await tools.execute("iniciar_nuevo_tema", {
      channel:"whatsapp", customerId:"coordinando", triggerMessage:"hola cómo estás"
    });

    expect(result).toMatchObject({ action:"MANTENER_ATENCION_HUMANA", customerMessage:"NO_REPLY", state:"WAITING_HUMAN" });
    expect(takeover.canAiReply("whatsapp", "coordinando")).toBe(false);
  });

  it("reactiva automáticamente una consulta nueva de stock", async () => {
    const repo = new ConversationRepository(":memory:", 720);
    const takeover = new TakeoverService(repo, { notify:vi.fn() });
    const catalog = { byFlavor:vi.fn().mockResolvedValue({ matches:[] }) };
    const tools = new AgentToolService(catalog as never, {} as never, takeover, {} as never, undefined, repo);
    repo.setState("whatsapp", "nuevo-stock", "WAITING_HUMAN", new Date(Date.now() + 3_600_000).toISOString());

    await tools.execute("buscar_sabor", { channel:"whatsapp", customerId:"nuevo-stock", query:"Watermelon" });

    expect(catalog.byFlavor).toHaveBeenCalledWith("Watermelon");
    expect(takeover.canAiReply("whatsapp", "nuevo-stock")).toBe(true);
  });
});
