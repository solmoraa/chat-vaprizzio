import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel } from "../domain/types.js";
import type { HumanNotifier } from "../notifications/notifier.js";

export class TakeoverService {
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
    await this.notifier.notify({ channel, customerId, messages: c.lastMessages.slice(-5), reason, ...(quantity == null ? {} : { quantity }), ...(products ? { products } : {}) });
    return c;
  }
  humanMessage(channel: Channel, customerId: string, text: string) {
    const c = this.repo.setState(channel, customerId, "HUMAN_ACTIVE");
    const match = text.match(/(?:por\s+)?(\d+)\D{1,20}(?:\$\s*)?([\d.]{4,})/i);
    if (match?.[1] && match[2]) this.repo.setNegotiatedPrice(channel, customerId, { quantity: Number(match[1]), unitPrice: Number(match[2].replace(/\./g, "")), conditions: text, timestamp: new Date().toISOString() });
    return c;
  }
  resume(channel: Channel, customerId: string) { return this.repo.setState(channel, customerId, "AI_ACTIVE", null); }
}
