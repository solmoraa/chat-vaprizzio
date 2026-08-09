export interface HumanNotification { channel: string; customerId: string; quantity?: number; products?: string[]; messages: string[]; reason: string; }
export interface HumanNotifier { notify(value: HumanNotification): Promise<void>; }
export class ConsoleNotifier implements HumanNotifier { async notify(value: HumanNotification) { console.info(JSON.stringify({ event: "human_notification", ...value })); } }
export class TelegramNotifier implements HumanNotifier {
  private readonly chatIds: string[];

  constructor(private readonly token: string, chatIds: string | string[]) {
    this.chatIds = (Array.isArray(chatIds) ? chatIds : chatIds.split(","))
      .map((chatId) => chatId.trim())
      .filter(Boolean);
  }

  async notify(v: HumanNotification) {
    if (!this.token || this.chatIds.length === 0) throw new Error("TELEGRAM_NOT_CONFIGURED");
    const text = [`INTERVENCION HUMANA`, `Canal: ${v.channel}`, `Cliente: ${v.customerId}`, v.quantity ? `Cantidad: ${v.quantity}` : "", v.products?.length ? `Productos: ${v.products.join(", ")}` : "", `Motivo: ${v.reason}`, `Mensajes: ${v.messages.join(" | ")}`].filter(Boolean).join("\n");
    const results = await Promise.allSettled(this.chatIds.map(async (chatId) => {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
      if (!res.ok) throw new Error(`TELEGRAM_ERROR:${res.status}:chat=${chatId}`);
    }));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), `TELEGRAM_DELIVERY_FAILED:${failures.length}`);
  }
}
