import type { CatalogProvider } from "../catalog/provider.js";
import { available } from "../catalog/provider.js";
import type { Product, WholesaleTier } from "../domain/types.js";
import { normalize, similarity } from "../utils/normalize.js";

const MODEL_QUERY_IGNORED = new Set([
  "tenes", "tienen", "hay", "el", "la", "los", "las",
  "un", "una", "vape", "vapes", "vaporizador", "vaporizadores",
  "por", "casualidad", "si", "compro", "comprar", "compraria",
  "llevo", "llevar", "llevando", "quiero", "quisiera",
  "de", "del", "al", "cuanto", "cuantos", "me",
  "queda", "quedan", "quedaria", "sale", "salen",
  "precio", "precios", "cada", "unidad", "unidades",
  "mas", "favor",
  "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "veinte", "cincuenta", "cien", "doscientos"
]);

const modelQueryTokens = (query: string) => {
  const tokens = normalize(query)
    .split(" ")
    .filter(
      token =>
        token.length >= 2 &&
        !MODEL_QUERY_IGNORED.has(token) &&
        !/^\d+$/.test(token)
    );

  // Para Vaprizzio, "Ice King" significa Elfbar Ice King.
  if (
    tokens.includes("ice") &&
    tokens.includes("king") &&
    !tokens.includes("elfbar")
  ) {
    tokens.unshift("elfbar");
  }

  return tokens;
};

export type MatchStatus = "AVAILABLE" | "OUT_OF_STOCK" | "NOT_FOUND";
export interface MatchResult {
  matches: Product[];
  unavailableMatches: Product[];
  ambiguous: boolean;
  status: MatchStatus;
}

export class CatalogService {
  constructor(private readonly provider: CatalogProvider) {}
  private async live() { return (await this.provider.products()).filter(available); }
  private matchResult(candidates: Product[], ambiguous = false): MatchResult {
    const matches = candidates.filter(available);
    const unavailableMatches = candidates.filter(product => product.active && !available(product));
    return {
      matches,
      unavailableMatches,
      ambiguous: matches.length > 0 ? ambiguous : false,
      status: matches.length > 0 ? "AVAILABLE" : unavailableMatches.length > 0 ? "OUT_OF_STOCK" : "NOT_FOUND"
    };
  }
  async byFlavor(query: string): Promise<MatchResult> {
    const products = (await this.provider.products()).filter(product => product.active);
    const exact = products.filter(p => normalize(p.flavor) === normalize(query));
    if (exact.length) return this.matchResult(exact);
    const scored = products.map(p => ({ p, score: similarity(p.flavor, query) })).filter(x => x.score >= 0.72).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score;
    if (best == null) return this.matchResult([]);
    const candidates = scored.filter(x => best - x.score < 0.08).map(x => x.p);
    const liveCandidates = candidates.filter(available);
    return this.matchResult(candidates, new Set(liveCandidates.map(x => normalize(x.flavor))).size > 1);
  }
  async byModel(query: string): Promise<MatchResult> {
    const products = (await this.provider.products()).filter(product => product.active);
    const queryTokens = modelQueryTokens(query);
    const scored = products.map(p => {
      const target = `${p.brand} ${p.model}`;
      const targetTokens = new Set(normalize(target).split(" "));
      const tokenCoverage = queryTokens.length > 0 && queryTokens.every(token => targetTokens.has(token)) ? 0.96 : 0;
      return { p, score: Math.max(similarity(p.model, query), similarity(target, query), tokenCoverage) };
    }).filter(x => x.score >= 0.72).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score;
    return this.matchResult(best == null ? [] : scored.filter(x => best - x.score < 0.08).map(x => x.p));
  }
  async specific(model: string, flavor: string): Promise<MatchResult> {
    const modelMatch = await this.byModel(model);
    const modelCandidates = [...modelMatch.matches, ...modelMatch.unavailableMatches];
    const exact = modelCandidates.filter(product => normalize(product.flavor) === normalize(flavor));
    if (exact.length) return this.matchResult(exact);
    const scored = modelCandidates
      .map(product => ({ product, score:similarity(product.flavor, flavor) }))
      .filter(item => item.score >= 0.72)
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.score;
    return this.matchResult(best == null ? [] : scored.filter(item => best - item.score < 0.08).map(item => item.product));
  }
  async compareModels(queries: string[]) {
    const results = [] as Array<{ brand:string; model:string; description:string | null; specifications:ReturnType<typeof extractProductSpecifications>; verifiedFacts:string[]; productUrl?:string; source:"tiendanube" | "unavailable" }>;
    for (const query of queries) {
      const match = await this.byModel(query);
      const product = match.matches[0];
      if (!product) { results.push({ brand:"", model:query, description:null, specifications:{}, verifiedFacts:[], source:"unavailable" }); continue; }
      const productUrl = product.productUrl;
      let description:string | null = null;
      let specifications:ReturnType<typeof extractProductSpecifications> = {};
      if (productUrl) {
        try {
          const response = await fetch(productUrl, { signal:AbortSignal.timeout(8_000), headers:{ accept:"text/html" } });
          if (response.ok) {
            const html = await response.text();
            description = extractProductDescription(html);
            specifications = extractProductSpecifications(decodeHtml(html));
          }
        } catch { description = null; }
      }
      const verifiedFacts = normalize(`${product.brand} ${product.model}`).includes("ice king")
        ? ["Tiene un botón para controlar la frescura."]
        : [];
      results.push({ brand:product.brand, model:product.model, description, specifications, verifiedFacts, ...(productUrl ? { productUrl } : {}), source:description ? "tiendanube" : "unavailable" });
    }
    return results;
  }
  async productInfo(query: string) {
    const match = await this.byModel(query);
    const models = [...new Map(match.matches.map(product => [`${normalize(product.brand)}|${normalize(product.model)}`, `${product.brand} ${product.model}`])).values()];
    return this.compareModels(models);
  }
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
  async priceForOrder(
  skuOrModel: string,
  quantity = 1,
  orderQuantity = quantity
) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(orderQuantity) ||
    orderQuantity < quantity
  ) {
    throw new Error("PRICE_QUANTITY_INVALID");
  }

  const products = await this.provider.products();

  // Primero intenta encontrar un SKU exacto.
  let product = products.find(
    item => item.sku === skuOrModel && available(item)
  );

  let quoteScope: "SKU" | "MODEL" = "SKU";

  // Si no era un SKU, intenta resolverlo como modelo.
  if (!product) {
    const modelMatch = await this.byModel(skuOrModel);

    const modelKeys = new Set(
      modelMatch.matches.map(
        item => `${normalize(item.brand)}|${normalize(item.model)}`
      )
    );

    const prices = new Set(
      modelMatch.matches.map(item => item.price)
    );

    // Podemos cotizar por modelo solamente si todas las variantes
    // disponibles corresponden al mismo modelo y tienen el mismo precio.
    if (modelKeys.size === 1 && prices.size === 1) {
      product = modelMatch.matches[0];
      quoteScope = "MODEL";
    }
  }

  if (!product) return null;

  const discountPerUnitArs =
    orderQuantity >= 5 && orderQuantity < 10
      ? 2_000
      : 0;

  const unitPriceArs = Math.max(
    0,
    product.price - discountPerUnitArs
  );

  return {
    quoteScope,

    product: {
      sku: product.sku,
      brand: product.brand,
      model: product.model,
      flavor: product.flavor,
      ...(product.productUrl
        ? { productUrl: product.productUrl }
        : {})
    },

    quantity,
    orderQuantity,

    regularUnitPriceArs: product.price,
    discountPerUnitArs,
    unitPriceArs,

    lineTotalArs: unitPriceArs * quantity
  };
}
  async wholesale(model: string, quantity?: number): Promise<{ model: string; tiers: WholesaleTier[]; selected: WholesaleTier | null } | null> {
    const all = await this.provider.wholesaleTiers();
    const names = [...new Set(all.map(t => t.model))];
    const queryTokens = modelQueryTokens(model);
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

const decodeHtml = (value:string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_match, code:string) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, " ").trim();

export const extractProductDescription = (html:string):string | null => {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (!/(?:property|name)=["'](?:og:description|description)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (content && decodeHtml(content).length >= 20) return decodeHtml(content);
  }
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(script[1] ?? "null");
      const entries = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ?? [parsed];
      const product = entries.find((entry:Record<string, unknown>) => String(entry?.["@type"] ?? "").toLowerCase() === "product");
      if (typeof product?.description === "string" && decodeHtml(product.description).length >= 20) return decodeHtml(product.description);
    } catch { /* Ignorar JSON-LD inválido y probar la siguiente fuente. */ }
  }
  return null;
};

export const extractProductSpecifications = (description:string | null):{ puffs?:string } => {
  if (!description) return {};
  const match = description.match(/\b((?:\d+\s*mil|\d{1,3}(?:[.,]\d{3})+|\d+|mil))\s*(puffs?|pitadas?|caladas?)\b/i);
  if (!match) return {};
  const rawAmount = match[1]!.replace(/\s+/g, "").toLowerCase();
  const amount = rawAmount === "mil" || rawAmount === "1mil" ? "1.000" : rawAmount;
  return { puffs:`${amount} ${match[2]}` };
};
