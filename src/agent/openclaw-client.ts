import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WHATSAPP_PARITY_CONTEXT = "[Política de canal: aplicá exactamente los mismos conocimientos, respuestas, tono, herramientas, validaciones, pausas humanas, alertas y reglas comerciales vigentes de WhatsApp. El canal solo cambia el transporte.]";
type AgentRunner = (file: string, args: string[]) => Promise<{ stdout: string }>;
const defaultRunner: AgentRunner = async (file, args) => {
  const result = await execFileAsync(file, args, { timeout:120_000, maxBuffer:2_000_000 });
  return { stdout:String(result.stdout) };
};

export class OpenClawClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly agentId: string, private readonly cliPath = "openclaw", private readonly runner: AgentRunner = defaultRunner) {}
  async dispatch(channel: string, customerId: string, messages: string[]) {
    if (!this.token) throw new Error("OPENCLAW_NOT_CONFIGURED");
    const res = await fetch(`${this.baseUrl}/hooks/agent`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` }, body: JSON.stringify({ agentId: this.agentId, sessionKey: `${channel}:${customerId}`, message: messages.join("\n"), deliver: true }) });
    if (!res.ok) throw new Error(`OPENCLAW_ERROR:${res.status}`);
  }

  async sendDirect(channel: "whatsapp", customerId: string, message: string, account?: string) {
    const target = /^\d{8,15}$/.test(customerId)
      ? `+${customerId}`
      : customerId.endsWith("@s.whatsapp.net")
        ? `+${customerId.slice(0, -"@s.whatsapp.net".length)}`
        : customerId;
    const args = ["message", "send", "--channel", channel, "--target", target, "--message", message, "--json"];
    if (account) args.push("--account", account);
    await this.runner(this.cliPath, args);
  }

  async reply(channel: string, customerId: string, messages: string[]) {
    const prompt = `[Canal: ${channel}]\n[CustomerId: ${customerId}]\n${WHATSAPP_PARITY_CONTEXT}\n${messages.join("\n")}`;
    const { stdout } = await this.runner(this.cliPath, [
      "agent", "--agent", this.agentId,
      "--session-key", `${channel}:${customerId}`,
      "--message", prompt,
      "--timeout", "120",
      "--json"
    ]);
    const start = stdout.indexOf("{");
    if (start < 0) throw new Error("OPENCLAW_REPLY_INVALID_JSON");
    const payload = JSON.parse(stdout.slice(start)) as Record<string, unknown>;
    const result = payload.result as Record<string, unknown> | undefined;
    const resultPayloads = Array.isArray(result?.payloads)
      ? result.payloads as Array<Record<string, unknown>>
      : [];
    const text = [payload.finalAssistantVisibleText, payload.finalAssistantRawText, result?.finalAssistantVisibleText, result?.finalAssistantRawText, ...resultPayloads.map(item => item.text)]
      .find(value => typeof value === "string" && value.trim());
    if (typeof text !== "string") throw new Error("OPENCLAW_REPLY_EMPTY");
    return text.trim();
  }
}
