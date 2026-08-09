import { google, type sheets_v4 } from "googleapis";
import type { CatalogProvider } from "./provider.js";
import type { Flavor, Product, Sale, WholesaleTier } from "../domain/types.js";

const yes = (v: unknown) => String(v).trim().toUpperCase() === "SI";
const number = (v: unknown) => Number(String(v ?? "0").replace(/[.$\s]/g, "").replace(",", "."));

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
    const [, ...rows] = await this.rows("PRODUCTOS!A:I");
    return rows.filter(r => r[0]).map(r => ({ sku: String(r[0]), brand: String(r[1] ?? ""), model: String(r[2] ?? ""), flavor: String(r[3] ?? ""), stock: number(r[4]), price: number(r[5]), profile: String(r[6] ?? "").split(",").map(x => x.trim()).filter(Boolean), description: String(r[7] ?? ""), active: yes(r[8]) }));
  }
  async flavors(): Promise<Flavor[]> {
    const [, ...rows] = await this.rows("SABORES!A:F");
    return rows.filter(r => r[0]).map(r => ({ flavor: String(r[0]), type: String(r[1] ?? ""), sweetness: number(r[2]), freshness: number(r[3]), description: String(r[4] ?? ""), similarTo: String(r[5] ?? "").split(",").map(x => x.trim()).filter(Boolean) }));
  }
  async wholesaleTiers(): Promise<WholesaleTier[]> {
    const [, ...rows] = await this.rows("PRODUCTOS!T:V");
    let currentModel = "";
    const tiers: WholesaleTier[] = [];
    for (const row of rows) {
      if (String(row[0] ?? "").trim()) currentModel = String(row[0]).trim();
      const from = number(row[1]);
      const unitPriceUsd = number(row[2]);
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
    const values = await this.rows("PRODUCTOS!A:I");
    const updates = lines.map(line => {
      const index = values.findIndex((r, i) => i > 0 && String(r[0]) === line.sku);
      if (index < 1) throw new Error(`SKU_NOT_FOUND:${line.sku}`);
      const stock = number(values[index]![4]);
      if (stock < line.quantity) throw new Error(`INSUFFICIENT_STOCK:${line.sku}`);
      return { range: `PRODUCTOS!E${index + 1}`, values: [[stock - line.quantity]] };
    });
    await (await this.client()).spreadsheets.values.batchUpdate({ spreadsheetId: this.sheetId, requestBody: { valueInputOption: "RAW", data: updates } });
  }
}
