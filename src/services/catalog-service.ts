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
  async stock(sku: string) { const p = (await this.provider.products()).find(x => x.sku === sku); return { available: !!p && available(p), quantity: p?.stock ?? 0 }; }
  async price(sku: string) { return (await this.provider.products()).find(x => x.sku === sku)?.price ?? null; }
  async wholesale(quantity: number): Promise<WholesaleTier | null> { return (await this.provider.wholesaleTiers()).find(t => quantity >= t.from && (t.to == null || quantity <= t.to)) ?? null; }
  business(key: string) { return this.provider.businessValue(key); }
}
