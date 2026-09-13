import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel } from "../domain/types.js";
import type { HumanNotifier } from "../notifications/notifier.js";

export class TakeoverService {
  private readonly recentAlerts = new Map<string, number>();
  private static readonly HUMAN_MESSAGE_PAUSE_MS = 2 * 60 * 60 * 1_000;
  constructor(private readonly repo: ConversationRepository, private readonly notifier: HumanNotifier) {}
  canAiReply(channel: Channel, customerId: string, now = new Date()) {
    const conversation = this.repo.getOrCreate(channel, customerId);
    if (
      conversation.state === "HUMAN_ACTIVE" &&
      conversation.pausedUntil &&
      new Date(conversation.pausedUntil).getTime() <= now.getTime()
    ) {
      this.repo.setState(channel, customerId, "AI_ACTIVE", null);
      return true;
    }
    return conversation.state === "AI_ACTIVE";
  }
  async request(channel: Channel, customerId: string, reason: string, quantity?: number, products?: string[], forceNotification = false) {
    const current = this.repo.getOrCreate(channel, customerId);
    if (current.state !== "AI_ACTIVE" && !forceNotification) return current;
    const c = this.repo.setState(channel, customerId, "WAITING_HUMAN", null);
    const latest = c.lastMessages.at(-1) ?? ""; const alertKey = `${channel}|${customerId}|${reason}|${latest}`; const lastSent = this.recentAlerts.get(alertKey) ?? 0;
    if (forceNotification || Date.now() - lastSent >= 60_000) { await this.notifier.notify({ channel, customerId, messages: c.lastMessages.slice(-5), reason, ...(quantity == null ? {} : { quantity }), ...(products ? { products } : {}) }); this.recentAlerts.set(alertKey, Date.now()); }
    return c;
  }
  humanMessage(
  channel: Channel,
  customerId: string,
  text: string
) {
  this.repo.recordHumanMessage(
    channel,
    customerId,
    text
  );

  const pausedUntil = new Date(
    Date.now() + TakeoverService.HUMAN_MESSAGE_PAUSE_MS,
  ).toISOString();

  let c = this.repo.setState(
    channel,
    customerId,
    "HUMAN_ACTIVE",
    pausedUntil,
  );

  const match = text.match(
    /(?:por\s+)?(\d+)\D{1,20}(?:\$\s*)?([\d.]{4,})/i
  );

  if (match?.[1] && match[2]) {
    c = this.repo.setNegotiatedPrice(
      channel,
      customerId,
      {
        quantity: Number(match[1]),
        unitPrice: Number(
          match[2].replace(/\./g, "")
        ),
        conditions: text,
        timestamp: new Date().toISOString()
      }
    );
  }

  return c;
}
  // Sólo se usa para una reanudación humana explícita (/reanudar).
  resume(channel: Channel, customerId: string) { return this.repo.setState(channel, customerId, "AI_ACTIVE", null); }
  resumeFromCustomerMessage(channel: Channel, customerId: string, now = new Date()) {
    const conversation = this.repo.getOrCreate(channel, customerId);
    if (
      conversation.state === "HUMAN_ACTIVE" &&
      conversation.pausedUntil &&
      new Date(conversation.pausedUntil).getTime() > now.getTime()
    ) return conversation;
    return this.repo.setState(channel, customerId, "AI_ACTIVE", null);
  }
  close(channel: Channel, customerId: string) { return this.repo.close(channel, customerId); }
  recordCustomerMessage(channel: Channel, customerId: string, message: string) { return this.repo.appendMessage(channel, customerId, message); }
}
