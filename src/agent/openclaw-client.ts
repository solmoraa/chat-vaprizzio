import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GREETING_RE =
  /^\s*(hola|buenas|buen\s+d[ií]a|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)\b/i;

function formatGroupedMessages(messages: string[]) {
  const cleanMessages = messages
    .map(message => message.trim())
    .filter(Boolean);

  const firstMessage = cleanMessages[0] ?? "";
  const startsWithGreeting = GREETING_RE.test(firstMessage);

  const formattedMessages = cleanMessages
    .map(
      (message, index) =>
        `[Mensaje del cliente ${index + 1}/${cleanMessages.length}]\n${message}`
    )
    .join("\n\n");

  return [
    "[INTERVENCION_AGRUPADA]",
    "Todos los mensajes siguientes fueron recibidos dentro de la misma ventana de espera y forman UNA SOLA intervención del cliente.",
    "Leé todos los mensajes antes de decidir qué responder o qué herramienta ejecutar.",
    `Cantidad de mensajes: ${cleanMessages.length}`,
    `El primer mensaje comienza con un saludo: ${startsWithGreeting ? "SI" : "NO"}`,
    startsWithGreeting
      ? "Si además hay una consulta concreta, saludá una sola vez antes de responderla. No omitas el saludo."
      : "No inventes un saludo previo que el cliente no haya enviado.",
    "",
    formattedMessages,
    "[FIN_INTERVENCION_AGRUPADA]"
  ].join("\n");
}
const WHATSAPP_PARITY_CONTEXT = "[Política de canal: aplicá exactamente los mismos conocimientos, respuestas, tono, herramientas, validaciones, pausas humanas, alertas y reglas comerciales vigentes de WhatsApp. El canal solo cambia el transporte.]";
type AgentRunner = (file: string, args: string[]) => Promise<{ stdout: string }>;
export class OpenClawClient {
  private readonly runner: AgentRunner;
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly agentId: string,
    private readonly cliPath = "openclaw",
    runner?: AgentRunner,
    private readonly requestTimeoutMs = 10000,
    private readonly agentTimeoutSeconds = 60
  ) {
    this.runner = runner ?? (async (file, args) => {
      const result = await execFileAsync(file, args, { timeout:(this.agentTimeoutSeconds + 5) * 1000, maxBuffer:2_000_000 });
      return { stdout:String(result.stdout) };
    });
  }
  async dispatch(channel: string, customerId: string, messages: string[]) {
  if (!this.token) throw new Error("OPENCLAW_NOT_CONFIGURED");

  const groupedMessages = formatGroupedMessages(messages);

  const res = await fetch(`${this.baseUrl}/hooks/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${this.token}`
    },
    body: JSON.stringify({
      agentId: this.agentId,
      sessionKey: `${channel}:${customerId}`,
      message: groupedMessages,
      deliver: true
    }),
    signal: AbortSignal.timeout(this.requestTimeoutMs)
  });

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
   const groupedMessages = formatGroupedMessages(messages);

const prompt =
  `[Canal: ${channel}]\n` +
  `[CustomerId: ${customerId}]\n` +
  `${WHATSAPP_PARITY_CONTEXT}\n` +
  groupedMessages;
    const { stdout } = await this.runner(this.cliPath, [
      "agent", "--agent", this.agentId,
      "--session-key", `${channel}:${customerId}`,
      "--message", prompt,
      "--timeout", String(this.agentTimeoutSeconds),
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
