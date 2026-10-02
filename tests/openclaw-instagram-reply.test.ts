import { describe, expect, it, vi } from "vitest";
import { OpenClawClient } from "../src/agent/openclaw-client.js";

describe("respuesta de OpenClaw para Instagram", () => {
  it("envia una respuesta directa por la cuenta correcta de WhatsApp", async () => {
    const runner = vi.fn().mockResolvedValue({ stdout:'{"ok":true}' });
    const client = new OpenClawClient("http://127.0.0.1:18789", "token", "vaprizzio-sales-test", "openclaw", runner);

    await client.sendDirect("whatsapp", "5491157174460@s.whatsapp.net", "Ya salgo!", "vaprizzio-sales");

    expect(runner).toHaveBeenCalledWith("openclaw", [
      "message", "send", "--channel", "whatsapp",
      "--target", "+5491157174460",
      "--message", "Ya salgo!", "--json",
      "--account", "vaprizzio-sales"
    ]);
  });
  it("ejecuta una sesión aislada y devuelve el texto visible", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout:'OpenClaw banner\n{"finalAssistantVisibleText":"Hola! Cómo estás?"}'
    });
    const client = new OpenClawClient("http://127.0.0.1:18789", "token", "vaprizzio-sales-test", "openclaw", runner);

    const reply = await client.reply("instagram", "ig-123", ["hola", "tenés Miami Mint?"]);

    expect(reply).toBe("Hola! Cómo estás?");
    expect(runner).toHaveBeenCalledWith("openclaw", expect.arrayContaining([
      "--agent", "vaprizzio-sales-test",
      "--session-key", "instagram:ig-123",
      "--timeout", "60",
      "--json"
    ]));
    const args = runner.mock.calls[0]![1];
    const prompt = args[args.indexOf("--message") + 1];
    expect(prompt).toContain("[Canal: instagram]\n[CustomerId: ig-123]");
    expect(prompt).toContain("mismos conocimientos, respuestas, tono, herramientas");
    expect(prompt).toContain("[INTERVENCION_AGRUPADA]");
expect(prompt).toContain("Cantidad de mensajes: 2");
expect(prompt).toContain("El primer mensaje comienza con un saludo: SI");
expect(prompt).toContain("El saludo no cambia la intención de los mensajes posteriores");
expect(prompt).toContain("[Mensaje del cliente 1/2]\nhola");
expect(prompt).toContain("[Mensaje del cliente 2/2]\ntenés Miami Mint?");
expect(prompt).toContain("[FIN_INTERVENCION_AGRUPADA]");
  });
  it("prioriza una compra ya hecha después de un saludo agrupado", async () => {
    const runner = vi.fn().mockResolvedValue({ stdout:'{"finalAssistantVisibleText":"Dale! Cuando tengas el comprobante mandamelo por acá 😊"}' });
    const client = new OpenClawClient("http://127.0.0.1:18789", "token", "vaprizzio-sales-test", "openclaw", runner);

    await client.reply("whatsapp", "wa-123", ["Hola", "ya compré por la web"]);

    const args = runner.mock.calls[0]![1];
    const prompt = args[args.indexOf("--message") + 1];
    expect(prompt).toContain("[Mensaje del cliente 2/2]\nya compré por la web");
    expect(prompt).toContain("nunca preguntes 'Buscabas algún vape?'");
  });
  it("lee el texto desde result.payloads en versiones nuevas de OpenClaw", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout:'{"status":"ok","result":{"payloads":[{"text":"Hola! Buscabas algun vape?","mediaUrl":null}]}}'
    });
    const client = new OpenClawClient("http://127.0.0.1:18789", "token", "vaprizzio-sales-test", "openclaw", runner);

    await expect(client.reply("messenger", "fb-123", ["hola"])).resolves.toBe("Hola! Buscabas algun vape?");
    const args = runner.mock.calls[0]![1];
    const prompt = args[args.indexOf("--message") + 1];
    expect(prompt).toContain("reglas comerciales vigentes de WhatsApp");
  });
});
