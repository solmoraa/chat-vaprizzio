import { randomUUID } from "node:crypto";
import type { CatalogProvider } from "../catalog/provider.js";
import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel, Sale, SaleLine } from "../domain/types.js";

export class SalesService {
  constructor(private readonly provider: CatalogProvider, private readonly conversations: ConversationRepository, private readonly confirmationMode: "disabled" | "explicit_internal_command") {}
  async quote(channel: Channel, customerId: string): Promise<{ lines: SaleLine[]; total: number }> {
    const c = this.conversations.getOrCreate(channel, customerId); const products = await this.provider.products();
    const lines = c.cart.map(item => {
      const p = products.find(x => x.sku === item.sku); if (!p) throw new Error(`SKU_NOT_FOUND:${item.sku}`);
      let unitPrice = p.price; let priceType: SaleLine["priceType"] = "retail";
      if (c.negotiatedPrice && c.negotiatedPrice.quantity === c.cart.reduce((n, x) => n + x.quantity, 0)) { unitPrice = c.negotiatedPrice.unitPrice; priceType = "negotiated"; }
      return { sku: item.sku, quantity: item.quantity, unitPrice, priceType };
    });
    return { lines, total: lines.reduce((sum, x) => sum + x.quantity * x.unitPrice, 0) };
  }
  async confirm(channel: Channel, customerId: string, explicitInternalCommand: boolean): Promise<Sale> {
    if (this.confirmationMode === "disabled") throw new Error("SALE_CONFIRMATION_UNDEFINED");
    if (!explicitInternalCommand) throw new Error("SALE_CONFIRMATION_REQUIRES_INTERNAL_COMMAND");
    const c = this.conversations.getOrCreate(channel, customerId); const products = await this.provider.products();
    for (const item of c.cart) { const p = products.find(x => x.sku === item.sku); if (!p || !p.active || p.stock < item.quantity) throw new Error(`INSUFFICIENT_STOCK:${item.sku}`); }
    const quote = await this.quote(channel, customerId);
    const sale: Sale = { id: randomUUID(), date: new Date().toISOString(), customerId, channel, lines: quote.lines, total: quote.total, negotiatedPrice: c.negotiatedPrice?.unitPrice ?? null };
    await this.provider.registerSale(sale); await this.provider.decrementStock(c.cart);
    c.cart = []; this.conversations.save(c); return sale;
  }
}
