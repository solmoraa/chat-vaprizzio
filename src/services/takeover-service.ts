import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel } from "../domain/types.js";
import type { HumanNotifier } from "../notifications/notifier.js";

export class TakeoverService {
  private readonly recentAlerts = new Map<string, number>();
  constructor(private readonly repo: ConversationRepository, private readonly notifier: HumanNotifier) {}
  canAiReply(channel: Channel, customerId: string, now = new Date()) {
    const conversation = this.repo.getOrCreate(channel, customerId);
    if (conversation.state === "AI_ACTIVE") return true;
    if (conversation.pausedUntil && now.getTime() >= new Date(conversation.pausedUntil).getTime()) {
      this.repo.setState(channel, customerId, "AI_ACTIVE", null);
      return true;
    }
    return false;
  }
  async request(channel: Channel, customerId: string, reason: string, quantity?: number, products?: string[]) {
    const current = this.repo.getOrCreate(channel, customerId);
    const existingPauseIsActive = current.state !== "AI_ACTIVE" && !!current.pausedUntil && Date.now() < new Date(current.pausedUntil).getTime();
    const pausedUntil = existingPauseIsActive ? current.pausedUntil : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const c = this.repo.setState(channel, customerId, "WAITING_HUMAN", pausedUntil);
    const latest = c.lastMessages.at(-1) ?? ""; const alertKey = `${channel}|${customerId}|${reason}|${latest}`; const lastSent = this.recentAlerts.get(alertKey) ?? 0;
    if (Date.now() - lastSent >= 60_000) { await this.notifier.notify({ channel, customerId, messages: c.lastMessages.slice(-5), reason, ...(quantity == null ? {} : { quantity }), ...(products ? { products } : {}) }); this.recentAlerts.set(alertKey, Date.now()); }
    return c;
  }
  humanMessage(channel: Channel, customerId: string, text: string) {
    const c = this.repo.setState(channel, customerId, "HUMAN_ACTIVE");
    const match = text.match(/(?:por\s+)?(\d+)\D{1,20}(?:\$\s*)?([\d.]{4,})/i);
    if (match?.[1] && match[2]) this.repo.setNegotiatedPrice(channel, customerId, { quantity: Number(match[1]), unitPrice: Number(match[2].replace(/\./g, "")), conditions: text, timestamp: new Date().toISOString() });
    return c;
  }
  take(channel: Channel, customerId: string, operator: string) { this.repo.assignHuman(channel, customerId, operator); return this.repo.setState(channel, customerId, "HUMAN_ACTIVE", null); }
  resume(channel: Channel, customerId: string) { this.repo.clearHumanAssignment(channel, customerId); return this.repo.setState(channel, customerId, "AI_ACTIVE", null); }
  close(channel: Channel, customerId: string) { return this.repo.close(channel, customerId); }
  recordCustomerMessage(channel: Channel, customerId: string, message: string) { return this.repo.appendMessage(channel, customerId, message); }
}
