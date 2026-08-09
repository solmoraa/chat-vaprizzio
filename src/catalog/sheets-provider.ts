import { google, type sheets_v4 } from "googleapis";
import type { CatalogProvider } from "./provider.js";
import type { Flavor, Product, Sale, WholesaleTier } from "../domain/types.js";

export const sheetNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  const raw = String(value ?? "0").replace(/[^0-9,.-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) return Number(comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""));
  if (comma >= 0) return Number(/^[-]?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", "."));
  return Number(raw || "0");
};

const splitProductName = (value: unknown): { brand: string; model: string } => {
  const full = String(value ?? "").trim();
  const knownBrands = ["Lost Mary", "Geek Bar", "Elfbar", "Ignite", "BLVK", "Airmez", "Dummy", "Hookalit", "Maskking"];
  const brand = knownBrands.find(candidate => full.toLowerCase().startsWith(candidate.toLowerCase())) ?? full.split(/\s+/)[0] ?? "";
  const model = full.slice(brand.length).trim() || full;
  return { brand, model };
};

export const parseProductRows = (rows: unknown[][]): Product[] => rows.filter(row => row[0]).map(row => {
  const { brand, model } = splitProductName(row[0]);
  const variantId = String(row[7] ?? "").trim();
  const explicitSku = String(row[9] ?? "").trim();
  const syncState = String(row[10] ?? "").trim().toUpperCase();
  return {
    sku: explicitSku || (variantId ? `TN-${variantId}` : `${brand}-${model}-${String(row[1] ?? "")}`),
    brand,
    model,
    flavor: String(row[1] ?? "").trim(),
    stock: sheetNumber(row[2]),
    price: sheetNumber(row[4]),
    profile: [],
    description: "",
    active: !syncState.includes("INACTIVO") && !syncState.includes("DESACTIVADO")
  };
});

export class GoogleSheetsCatalogProvider implements CatalogProvider {
  private sheets?: sheets_v4.Sheets;
  constructor(private readonly sheetId: string, private readonly credentialsFile: string) {
    if (!sheetId || !credentialsFile) throw new Error("Google Sheets requiere GOOGLE_SHEET_ID y GOOGLE_SERVICE_ACCOUNT_FILE");
  }
  private async client() {
    if (!this.sheets) {
      const auth = new google.auth.GoogleAuth({ keyFile: this.credentialsFile, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
      this.sheets = google.sheets({ version: "v4", auth });
    }
    return this.sheets;
  }
  private async rows(range: string): Promise<unknown[][]> {
    const res = await (await this.client()).spreadsheets.values.get({ spreadsheetId: this.sheetId, range });
    return res.data.values ?? [];
  }
  async products(): Promise<Product[]> {
    const [, ...rows] = await this.rows("Productos!A:K");
    return parseProductRows(rows);
  }
  async flavors(): Promise<Flavor[]> {
    const [, ...rows] = await this.rows("SABORES!A:F");
    return rows.filter(r => r[0]).map(r => ({ flavor: String(r[0]), type: String(r[1] ?? ""), sweetness: sheetNumber(r[2]), freshness: sheetNumber(r[3]), description: String(r[4] ?? ""), similarTo: String(r[5] ?? "").split(",").map(x => x.trim()).filter(Boolean) }));
  }
  async wholesaleTiers(): Promise<WholesaleTier[]> {
    const [, ...rows] = await this.rows("Productos!T:V");
    let currentModel = "";
    const tiers: WholesaleTier[] = [];
    for (const row of rows) {
      if (String(row[0] ?? "").trim()) currentModel = String(row[0]).trim();
      const from = sheetNumber(row[1]);
      const unitPriceUsd = sheetNumber(row[2]);
      if (currentModel && from >= 10 && unitPriceUsd > 0) tiers.push({ model: currentModel, from, unitPriceUsd });
    }
    return tiers;
  }
  async businessValue(key: string): Promise<string | null> {
    const [, ...rows] = await this.rows("NEGOCIO!A:B");
    const row = rows.find(r => String(r[0]).trim().toLowerCase() === key.trim().toLowerCase());
    return row ? String(row[1] ?? "") : null;
  }
  async registerSale(sale: Sale) {
    await (await this.client()).spreadsheets.values.append({ spreadsheetId: this.sheetId, range: "VENTAS!A:I", valueInputOption: "USER_ENTERED", requestBody: { values: [[sale.date, sale.id, sale.customerId, sale.channel, JSON.stringify(sale.lines), sale.total, sale.lines.map(x => x.priceType).join(","), sale.negotiatedPrice ?? "", "CONFIRMADA"]] } });
  }
  async decrementStock(lines: Array<{ sku: string; quantity: number }>) {
    const values = await this.rows("Productos!A:K");
    const updates = lines.map(line => {
      const index = values.findIndex((row, i) => i > 0 && parseProductRows([row])[0]?.sku === line.sku);
      if (index < 1) throw new Error(`SKU_NOT_FOUND:${line.sku}`);
      const stock = sheetNumber(values[index]![2]);
      if (stock < line.quantity) throw new Error(`INSUFFICIENT_STOCK:${line.sku}`);
      return { range: `Productos!C${index + 1}`, values: [[stock - line.quantity]] };
    });
    await (await this.client()).spreadsheets.values.batchUpdate({ spreadsheetId: this.sheetId, requestBody: { valueInputOption: "RAW", data: updates } });
  }
}
