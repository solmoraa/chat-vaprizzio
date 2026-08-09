import type { Flavor, Product, Sale, WholesaleTier } from "../domain/types.js";

export interface CatalogProvider {
  products(): Promise<Product[]>;
  flavors(): Promise<Flavor[]>;
  wholesaleTiers(): Promise<WholesaleTier[]>;
  wholesaleExchangeRate(): Promise<number | null>;
  businessValue(key: string): Promise<string | null>;
  registerSale(sale: Sale): Promise<void>;
  decrementStock(lines: Array<{ sku: string; quantity: number }>): Promise<void>;
}

export const available = (p: Product) => p.active && p.stock > 0;
