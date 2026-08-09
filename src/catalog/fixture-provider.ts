import type { CatalogProvider } from "./provider.js";
import type { Flavor, Product, Sale, WholesaleTier } from "../domain/types.js";

export class FixtureCatalogProvider implements CatalogProvider {
  constructor(
    private readonly productRows: Product[],
    private readonly flavorRows: Flavor[] = [],
    private readonly tiers: WholesaleTier[] = [],
    private readonly business: Record<string, string> = {}
  ) {}
  async products() { return structuredClone(this.productRows); }
  async flavors() { return structuredClone(this.flavorRows); }
  async wholesaleTiers() { return structuredClone(this.tiers); }
  async businessValue(key: string) { return this.business[key] ?? null; }
  async registerSale(_sale: Sale) {}
  async decrementStock(lines: Array<{ sku: string; quantity: number }>) {
    for (const line of lines) {
      const p = this.productRows.find(x => x.sku === line.sku);
      if (!p || p.stock < line.quantity) throw new Error(`INSUFFICIENT_STOCK:${line.sku}`);
    }
    for (const line of lines) this.productRows.find(x => x.sku === line.sku)!.stock -= line.quantity;
  }
}
