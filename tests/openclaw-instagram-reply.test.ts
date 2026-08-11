import { describe, expect, it, vi } from "vitest";
import { OpenClawClient } from "../src/agent/openclaw-client.js";

describe("respuesta de OpenClaw para Instagram", () => {
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
      "--json"
    ]));
    expect(runner.mock.calls[0]![1]).toContain("[Canal: instagram]\n[CustomerId: ig-123]\nhola\ntenés Miami Mint?");
  });
  it("lee el texto desde result.payloads en versiones nuevas de OpenClaw", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout:'{"status":"ok","result":{"payloads":[{"text":"Hola! Buscabas algun vape?","mediaUrl":null}]}}'
    });
    const client = new OpenClawClient("http://127.0.0.1:18789", "token", "vaprizzio-sales-test", "openclaw", runner);

    await expect(client.reply("messenger", "fb-123", ["hola"])).resolves.toBe("Hola! Buscabas algun vape?");
  });
});
