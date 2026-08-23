import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type {
  Channel,
  Conversation,
  ConversationMemory,
  ConversationState,
  DeliveryMode,
  NegotiatedPrice
} from "../domain/types.js";

export class ConversationRepository {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    private readonly idleMinutes = 720,
    retentionDays = 30
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

    this.db = new DatabaseSync(path);

    this.db.exec(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      state TEXT NOT NULL,
      current_product TEXT,
      current_flavor TEXT,
      cart TEXT NOT NULL,
      negotiated_quantity INTEGER,
      negotiated_price TEXT,
      customer_city TEXT,
      last_messages TEXT NOT NULL,
      last_activity TEXT NOT NULL,
      paused_until TEXT,
      memory TEXT,
      UNIQUE(channel, customer_id)
    )`);

    const columns = this.db
      .prepare("PRAGMA table_info(conversations)")
      .all() as Array<{ name: string }>;

    if (!columns.some(column => column.name === "paused_until")) {
      this.db.exec(
        "ALTER TABLE conversations ADD COLUMN paused_until TEXT"
      );
    }

    if (!columns.some(column => column.name === "memory")) {
      this.db.exec(
        "ALTER TABLE conversations ADD COLUMN memory TEXT"
      );
    }

    this.db.exec(`CREATE TABLE IF NOT EXISTS wholesale_reservations (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      model TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    const retentionCutoff = new Date(
      Date.now() - retentionDays * 86_400_000
    ).toISOString();

    this.db
      .prepare("DELETE FROM conversations WHERE last_activity < ?")
      .run(retentionCutoff);

    this.releaseExpiredWholesaleReservations();
  }

  id(channel: Channel, customerId: string) {
    return `${channel}:${customerId}`;
  }

  private emptyMemory(): ConversationMemory {
    return {
      deliveryMode: "sin_definir",
      pickupCoordinationStarted: false,
      pickupConfirmed: false,
      pickupProposedTime: null,
      pickupConfirmedTime: null,
      humanMessages: [],
      receiptReceived: false
    };
  }

  private normalizeMemory(
    memory?: Partial<ConversationMemory> | null
  ): ConversationMemory {
    return {
      ...this.emptyMemory(),
      ...(memory ?? {}),
      humanMessages: Array.isArray(memory?.humanMessages)
        ? memory.humanMessages.map(String).slice(-10)
        : []
    };
  }

  private fresh(
    channel: Channel,
    customerId: string
  ): Conversation {
    return {
      id: this.id(channel, customerId),
      channel,
      customerId,
      state: "AI_ACTIVE",
      currentProduct: null,
      currentFlavor: null,
      cart: [],
      negotiatedQuantity: null,
      negotiatedPrice: null,
      customerCity: null,
      lastMessages: [],
      memory: this.emptyMemory(),
      lastActivity: new Date().toISOString(),
      pausedUntil: null
    };
  }

  getOrCreate(
    channel: Channel,
    customerId: string
  ): Conversation {
    const id = this.id(channel, customerId);

    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;

    if (row) {
      const existing = this.map(row);

      if (
        Date.now() -
          new Date(existing.lastActivity).getTime() <=
        this.idleMinutes * 60_000
      ) {
        return existing;
      }

      const fresh = this.fresh(channel, customerId);
      this.save(fresh);
      return fresh;
    }

    const c = this.fresh(channel, customerId);
    this.save(c);
    return c;
  }

  close(channel: Channel, customerId: string) {
    const c = this.fresh(channel, customerId);
    this.save(c);
    return c;
  }

  appendMessage(
    channel: Channel,
    customerId: string,
    message: string
  ) {
    const c = this.getOrCreate(channel, customerId);

    if (message && c.lastMessages.at(-1) !== message) {
      c.lastMessages.push(message);
    }

    c.lastActivity = new Date().toISOString();
    this.save(c);

    return c;
  }

  recordPickupCoordination(
    channel: Channel,
    customerId: string,
    preferredTime?: string
  ) {
    const c = this.getOrCreate(channel, customerId);
    const memory = this.normalizeMemory(c.memory);

    memory.deliveryMode = "punto_retiro";
    memory.pickupCoordinationStarted = true;

    const time = preferredTime?.trim();

    if (time) {
      memory.pickupProposedTime = time;
    }

    c.memory = memory;
    c.lastActivity = new Date().toISOString();

    this.save(c);

    return c;
  }

  setDeliveryMode(
    channel: Channel,
    customerId: string,
    deliveryMode: DeliveryMode
  ) {
    const c = this.getOrCreate(channel, customerId);
    const memory = this.normalizeMemory(c.memory);

    memory.deliveryMode = deliveryMode;

    c.memory = memory;
    c.lastActivity = new Date().toISOString();

    this.save(c);

    return c;
  }

  recordHumanMessage(
    channel: Channel,
    customerId: string,
    text: string
  ) {
    const c = this.getOrCreate(channel, customerId);
    const memory = this.normalizeMemory(c.memory);
    const clean = text.trim();

    if (clean) {
      const tagged = `[HUMANO] ${clean}`;

      if (c.lastMessages.at(-1) !== tagged) {
        c.lastMessages.push(tagged);
      }

      if (memory.humanMessages.at(-1) !== clean) {
        memory.humanMessages.push(clean);
        memory.humanMessages =
          memory.humanMessages.slice(-10);
      }

      /*
       * Solo marcamos un horario como CONFIRMADO si
       * el mensaje humano contiene lenguaje explícito
       * de confirmación + un horario.
       *
       * Así no confundimos frases como
       * "estamos hasta las 17 hs" con una cita a las 17.
       */
      if (
        memory.deliveryMode === "punto_retiro" &&
        memory.pickupCoordinationStarted
      ) {
        const confirmation =
          /\b(confirmad[oa]|te esperamos|quedamos|nos vemos|perfecto[, ]+entonces|dale[, ]+entonces)\b/i.test(
            clean
          );

        const timeMatch = clean.match(
          /\b(?:a\s+las?|para\s+las?)\s*(\d{1,2}(?::\d{2})?)\s*(?:hs?|horas?)?\b/i
        );

        if (confirmation && timeMatch?.[1]) {
          memory.pickupConfirmed = true;
          memory.pickupConfirmedTime = timeMatch[1];
        }
      }
    }

    c.memory = memory;
    c.lastActivity = new Date().toISOString();

    this.save(c);

    return c;
  }

  markReceiptReceived(
    channel: Channel,
    customerId: string,
    deliveryMode?: DeliveryMode
  ) {
    const c = this.getOrCreate(channel, customerId);
    const memory = this.normalizeMemory(c.memory);

    memory.receiptReceived = true;

    if (
      deliveryMode &&
      deliveryMode !== "sin_definir"
    ) {
      memory.deliveryMode = deliveryMode;
    }

    c.memory = memory;
    c.lastActivity = new Date().toISOString();

    this.save(c);

    return c;
  }

  save(c: Conversation) {
    const memory = this.normalizeMemory(c.memory);

    this.db
      .prepare(`
        INSERT INTO conversations (
          id,
          channel,
          customer_id,
          state,
          current_product,
          current_flavor,
          cart,
          negotiated_quantity,
          negotiated_price,
          customer_city,
          last_messages,
          last_activity,
          paused_until,
          memory
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(id) DO UPDATE SET
          state=excluded.state,
          current_product=excluded.current_product,
          current_flavor=excluded.current_flavor,
          cart=excluded.cart,
          negotiated_quantity=excluded.negotiated_quantity,
          negotiated_price=excluded.negotiated_price,
          customer_city=excluded.customer_city,
          last_messages=excluded.last_messages,
          last_activity=excluded.last_activity,
          paused_until=excluded.paused_until,
          memory=excluded.memory
      `)
      .run(
        c.id,
        c.channel,
        c.customerId,
        c.state,
        c.currentProduct,
        c.currentFlavor,
        JSON.stringify(c.cart),
        c.negotiatedQuantity,
        c.negotiatedPrice
          ? JSON.stringify(c.negotiatedPrice)
          : null,
        c.customerCity,
        JSON.stringify(c.lastMessages.slice(-30)),
        c.lastActivity,
        c.pausedUntil,
        JSON.stringify(memory)
      );
  }

  setState(
    channel: Channel,
    customerId: string,
    state: ConversationState,
    pausedUntil?: string | null
  ) {
    const c = this.getOrCreate(channel, customerId);

    c.state = state;

    if (pausedUntil !== undefined) {
      c.pausedUntil = pausedUntil;
    }

    c.lastActivity = new Date().toISOString();
    this.save(c);

    return c;
  }

  setNegotiatedPrice(
    channel: Channel,
    customerId: string,
    price: NegotiatedPrice
  ) {
    const c = this.getOrCreate(channel, customerId);

    c.negotiatedQuantity = price.quantity;
    c.negotiatedPrice = price;

    this.save(c);

    return c;
  }

  reserveWholesale(
    channel: Channel,
    customerId: string,
    model: string,
    quantity: number,
    ttlMinutes = 30
  ) {
    this.releaseExpiredWholesaleReservations();

    const id =
      `${channel}:${customerId}:${model.trim().toLowerCase()}`;

    const now = new Date();

    const expiresAt = new Date(
      now.getTime() + ttlMinutes * 60_000
    ).toISOString();

    this.db
      .prepare(`
        INSERT INTO wholesale_reservations (
          id,
          channel,
          customer_id,
          model,
          quantity,
          expires_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(id) DO UPDATE SET
          quantity=excluded.quantity,
          expires_at=excluded.expires_at
      `)
      .run(
        id,
        channel,
        customerId,
        model,
        quantity,
        expiresAt,
        now.toISOString()
      );

    return {
      id,
      model,
      quantity,
      expiresAt
    };
  }

  reservedWholesaleByOthers(
    channel: Channel,
    customerId: string,
    model: string
  ) {
    this.releaseExpiredWholesaleReservations();

    const row = this.db
      .prepare(`
        SELECT COALESCE(SUM(quantity),0) AS total
        FROM wholesale_reservations
        WHERE lower(model)=lower(?)
          AND NOT (channel=? AND customer_id=?)
      `)
      .get(
        model,
        channel,
        customerId
      ) as { total: number };

    return Number(row.total ?? 0);
  }

  releaseWholesaleReservation(
    channel: Channel,
    customerId: string
  ) {
    this.db
      .prepare(`
        DELETE FROM wholesale_reservations
        WHERE channel=? AND customer_id=?
      `)
      .run(channel, customerId);
  }

  releaseExpiredWholesaleReservations(
    now = new Date()
  ) {
    this.db
      .prepare(`
        DELETE FROM wholesale_reservations
        WHERE expires_at <= ?
      `)
      .run(now.toISOString());
  }

  private map(
    r: Record<string, unknown>
  ): Conversation {
    let memory: ConversationMemory;

    try {
      memory = r.memory
        ? this.normalizeMemory(
            JSON.parse(String(r.memory)) as Partial<ConversationMemory>
          )
        : this.emptyMemory();
    } catch {
      memory = this.emptyMemory();
    }

    return {
      id: String(r.id),
      channel: String(r.channel) as Channel,
      customerId: String(r.customer_id),
      state: String(r.state) as ConversationState,
      currentProduct: r.current_product as string | null,
      currentFlavor: r.current_flavor as string | null,
      cart: JSON.parse(String(r.cart)),
      negotiatedQuantity:
        r.negotiated_quantity == null
          ? null
          : Number(r.negotiated_quantity),
      negotiatedPrice: r.negotiated_price
        ? JSON.parse(String(r.negotiated_price))
        : null,
      customerCity:
        r.customer_city as string | null,
      lastMessages:
        JSON.parse(String(r.last_messages)),
      memory,
      lastActivity: String(r.last_activity),
      pausedUntil:
        r.paused_until == null
          ? null
          : String(r.paused_until)
    };
  }
}