export class MessageDebouncer {
  private pending = new Map<string, { messages: string[]; timer: NodeJS.Timeout }>();
  constructor(private readonly delayMs: number) {}
  push(key: string, message: string, handler: (messages: string[]) => Promise<void>): void {
    const existing = this.pending.get(key); if (existing) clearTimeout(existing.timer);
    const messages = [...(existing?.messages ?? []), message];
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void Promise.resolve().then(() => handler(messages)).catch(error => console.error("debounced_handler_failed", error));
    }, this.delayMs);
    this.pending.set(key, { messages, timer });
  }
  cancel(key: string) { const p = this.pending.get(key); if (p) clearTimeout(p.timer); this.pending.delete(key); }
}
