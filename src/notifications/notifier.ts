export interface HumanNotification { channel: string; customerId: string; quantity?: number; products?: string[]; messages: string[]; reason: string; }
export interface HumanNotifier { notify(value: HumanNotification): Promise<void>; }
export class ConsoleNotifier implements HumanNotifier { async notify(value: HumanNotification) { console.info(JSON.stringify({ event: "human_notification", ...value })); } }
export class TelegramNotifier implements HumanNotifier {
  constructor(private readonly token: string, private readonly chatId: string) {}
  async notify(v: HumanNotification) {
    if (!this.token || !this.chatId) throw new Error("TELEGRAM_NOT_CONFIGURED");
    const text = [`INTERVENCION HUMANA`, `Canal: ${v.channel}`, `Cliente: ${v.customerId}`, v.quantity ? `Cantidad: ${v.quantity}` : "", v.products?.length ? `Productos: ${v.products.join(", ")}` : "", `Motivo: ${v.reason}`, `Mensajes: ${v.messages.join(" | ")}`].filter(Boolean).join("\n");
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: this.chatId, text }) });
    if (!res.ok) throw new Error(`TELEGRAM_ERROR:${res.status}`);
  }
}
