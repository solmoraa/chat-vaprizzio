import type { CatalogProvider } from "../catalog/provider.js";
import { available } from "../catalog/provider.js";
import type { Product, WholesaleTier } from "../domain/types.js";
import { normalize, similarity } from "../utils/normalize.js";

export interface MatchResult { matches: Product[]; ambiguous: boolean; }

export class CatalogService {
  constructor(private readonly provider: CatalogProvider) {}
  private async live() { return (await this.provider.products()).filter(available); }
  async byFlavor(query: string): Promise<MatchResult> {
    const products = await this.live();
    const exact = products.filter(p => normalize(p.flavor) === normalize(query));
    if (exact.length) return { matches: exact, ambiguous: false };
    const scored = products.map(p => ({ p, score: similarity(p.flavor, query) })).filter(x => x.score >= 0.72).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score;
    if (best == null) return { matches: [], ambiguous: false };
    const candidates = scored.filter(x => best - x.score < 0.08).map(x => x.p);
    return { matches: candidates, ambiguous: new Set(candidates.map(x => normalize(x.flavor))).size > 1 };
  }
  async byModel(query: string): Promise<MatchResult> {
    const products = await this.live();
    const scored = products.map(p => ({ p, score: Math.max(similarity(p.model, query), similarity(`${p.brand} ${p.model}`, query)) })).filter(x => x.score >= 0.72).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score;
    return { matches: best == null ? [] : scored.filter(x => best - x.score < 0.08).map(x => x.p), ambiguous: false };
  }
  async specific(model: string, flavor: string) { const m = await this.byModel(model); return m.matches.filter(p => similarity(p.flavor, flavor) >= 0.72); }
  async byProfile(profile: string, limit = 3) {
    const products = await this.live(); const flavors = await this.provider.flavors(); const q = normalize(profile);
    return products.map(p => { const f = flavors.find(x => normalize(x.flavor) === normalize(p.flavor)); const score = p.profile.some(x => normalize(x).includes(q)) || normalize(f?.type ?? "").includes(q) ? 2 : Math.max(similarity(p.description, q), similarity(f?.description ?? "", q)); return { p, score }; }).filter(x => x.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
  }
  async priceList() {
    const products = await this.live();
    const groups = new Map<string, { brand: string; model: string; productUrl?: string; variants: Array<{ flavor: string; price: number }> }>();
    for (const product of products) {
      const key = `${normalize(product.brand)}|${normalize(product.model)}`;
      const group = groups.get(key) ?? { brand: product.brand, model: product.model, ...(product.productUrl ? { productUrl: product.productUrl } : {}), variants: [] };
      group.variants.push({ flavor: product.flavor, price: product.price });
      groups.set(key, group);
    }
    return [...groups.values()]
      .map(group => ({ ...group, variants: group.variants.sort((a, b) => a.flavor.localeCompare(b.flavor, "es")) }))
      .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`, "es"));
  }
  async stock(sku: string) { const p = (await this.provider.products()).find(x => x.sku === sku); return { available: !!p && available(p), quantity: p?.stock ?? 0 }; }
  async price(sku: string) { return (await this.provider.products()).find(x => x.sku === sku)?.price ?? null; }
  async wholesale(model: string, quantity?: number): Promise<{ model: string; tiers: WholesaleTier[]; selected: WholesaleTier | null } | null> {
    const all = await this.provider.wholesaleTiers();
    const names = [...new Set(all.map(t => t.model))];
    const queryTokens = normalize(model).split(" ").filter(token => token.length >= 2);
    const scored = names.map(name => {
      const nameTokens = new Set(normalize(name).split(" "));
      const tokenCoverage = queryTokens.length > 0 && queryTokens.every(token => nameTokens.has(token)) ? 0.92 : 0;
      return { name, score: Math.max(similarity(name, model), tokenCoverage) };
    }).sort((a, b) => b.score - a.score);
    const matched = scored[0];
    if (!matched || matched.score < 0.72) return null;
    const tiers = all.filter(t => normalize(t.model) === normalize(matched.name)).sort((a, b) => a.from - b.from);
    const selected = quantity == null ? null : [...tiers].reverse().find(t => quantity >= t.from) ?? null;
    return { model: matched.name, tiers, selected };
  }
  async wholesaleList(): Promise<Array<{ model: string; tiers: WholesaleTier[] }>> {
    const groups = new Map<string, { model: string; tiers: WholesaleTier[] }>();
    for (const tier of await this.provider.wholesaleTiers()) {
      const key = normalize(tier.model);
      const group = groups.get(key) ?? { model: tier.model, tiers: [] };
      group.tiers.push(tier);
      groups.set(key, group);
    }
    return [...groups.values()]
      .map(group => ({ ...group, tiers: group.tiers.sort((a, b) => a.from - b.from) }))
      .sort((a, b) => a.model.localeCompare(b.model, "es"));
  }
  async wholesaleTotalArs(model: string, quantity: number) {
    const quote = await this.wholesale(model, quantity);
    if (!quote?.selected) return null;
    const exchangeRateArs = await this.provider.wholesaleExchangeRate();
    if (!exchangeRateArs) return { ...quote, exchangeRateArs: null, unitPriceArs: null, subtotalArs: null };
    const unitPriceArs = Math.round(quote.selected.unitPriceUsd * exchangeRateArs);
    return { ...quote, exchangeRateArs, unitPriceArs, subtotalArs: unitPriceArs * quantity };
  }
  async wholesaleAvailableStock(model: string) {
    const match = await this.byModel(model);
    if (!match.matches.length) return null;
    return { model:`${match.matches[0]!.brand} ${match.matches[0]!.model}`, quantity:match.matches.reduce((total, product) => total + product.stock, 0) };
  }
  business(key: string) { return this.provider.businessValue(key); }
}
