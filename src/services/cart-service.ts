import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel } from "../domain/types.js";

export class CartService {
  constructor(private readonly conversations: ConversationRepository) {}
  set(channel: Channel, customerId: string, sku: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error("INVALID_QUANTITY");
    const c = this.conversations.getOrCreate(channel, customerId);
    c.cart = c.cart.filter(x => x.sku !== sku);
    if (quantity > 0) c.cart.push({ sku, quantity });
    c.lastActivity = new Date().toISOString(); this.conversations.save(c); return c.cart;
  }
  add(channel: Channel, customerId: string, sku: string, quantity: number) {
    const c = this.conversations.getOrCreate(channel, customerId); const current = c.cart.find(x => x.sku === sku)?.quantity ?? 0;
    return this.set(channel, customerId, sku, current + quantity);
  }
  get(channel: Channel, customerId: string) { return this.conversations.getOrCreate(channel, customerId).cart; }
}
