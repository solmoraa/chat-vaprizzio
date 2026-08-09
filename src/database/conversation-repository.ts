import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { Channel, Conversation, ConversationState, NegotiatedPrice } from "../domain/types.js";

export class ConversationRepository {
  private readonly db: DatabaseSync;
  constructor(path: string, private readonly idleMinutes = 120) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, channel TEXT NOT NULL, customer_id TEXT NOT NULL, state TEXT NOT NULL,
      current_product TEXT, current_flavor TEXT, cart TEXT NOT NULL, negotiated_quantity INTEGER,
      negotiated_price TEXT, customer_city TEXT, last_messages TEXT NOT NULL, last_activity TEXT NOT NULL,
      paused_until TEXT,
      UNIQUE(channel, customer_id)
    )`);
    const columns = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
    if (!columns.some(column => column.name === "paused_until")) this.db.exec("ALTER TABLE conversations ADD COLUMN paused_until TEXT");
  }
  id(channel: Channel, customerId: string) { return `${channel}:${customerId}`; }
  private fresh(channel: Channel, customerId: string): Conversation {
    return { id: this.id(channel, customerId), channel, customerId, state: "AI_ACTIVE", currentProduct: null, currentFlavor: null, cart: [], negotiatedQuantity: null, negotiatedPrice: null, customerCity: null, lastMessages: [], lastActivity: new Date().toISOString(), pausedUntil: null };
  }
  getOrCreate(channel: Channel, customerId: string): Conversation {
    const id = this.id(channel, customerId);
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (row) {
      const existing = this.map(row);
      if (Date.now() - new Date(existing.lastActivity).getTime() <= this.idleMinutes * 60_000) return existing;
      const fresh = this.fresh(channel, customerId); this.save(fresh); return fresh;
    }
    const c = this.fresh(channel, customerId);
    this.save(c); return c;
  }
  close(channel: Channel, customerId: string) { const c = this.fresh(channel, customerId); this.save(c); return c; }
  save(c: Conversation) {
    this.db.prepare(`INSERT INTO conversations (id,channel,customer_id,state,current_product,current_flavor,cart,negotiated_quantity,negotiated_price,customer_city,last_messages,last_activity,paused_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state,current_product=excluded.current_product,current_flavor=excluded.current_flavor,cart=excluded.cart,negotiated_quantity=excluded.negotiated_quantity,negotiated_price=excluded.negotiated_price,customer_city=excluded.customer_city,last_messages=excluded.last_messages,last_activity=excluded.last_activity,paused_until=excluded.paused_until`)
      .run(c.id, c.channel, c.customerId, c.state, c.currentProduct, c.currentFlavor, JSON.stringify(c.cart), c.negotiatedQuantity, c.negotiatedPrice ? JSON.stringify(c.negotiatedPrice) : null, c.customerCity, JSON.stringify(c.lastMessages.slice(-30)), c.lastActivity, c.pausedUntil);
  }
  setState(channel: Channel, customerId: string, state: ConversationState, pausedUntil?: string | null) { const c = this.getOrCreate(channel, customerId); c.state = state; if (pausedUntil !== undefined) c.pausedUntil = pausedUntil; c.lastActivity = new Date().toISOString(); this.save(c); return c; }
  setNegotiatedPrice(channel: Channel, customerId: string, price: NegotiatedPrice) { const c = this.getOrCreate(channel, customerId); c.negotiatedQuantity = price.quantity; c.negotiatedPrice = price; this.save(c); return c; }
  private map(r: Record<string, unknown>): Conversation { return { id: String(r.id), channel: String(r.channel) as Channel, customerId: String(r.customer_id), state: String(r.state) as ConversationState, currentProduct: r.current_product as string | null, currentFlavor: r.current_flavor as string | null, cart: JSON.parse(String(r.cart)), negotiatedQuantity: r.negotiated_quantity == null ? null : Number(r.negotiated_quantity), negotiatedPrice: r.negotiated_price ? JSON.parse(String(r.negotiated_price)) : null, customerCity: r.customer_city as string | null, lastMessages: JSON.parse(String(r.last_messages)), lastActivity: String(r.last_activity), pausedUntil: r.paused_until == null ? null : String(r.paused_until) }; }
}
