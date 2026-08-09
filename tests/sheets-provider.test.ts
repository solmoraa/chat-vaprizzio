import { describe, expect, it } from "vitest";
import { GoogleSheetsCatalogProvider, parseProductRows, sheetNumber } from "../src/catalog/sheets-provider.js";

describe("lector de la hoja Productos", () => {
  it("interpreta importes numéricos y formatos habituales", () => {
    expect(sheetNumber(25000)).toBe(25000);
    expect(sheetNumber("$25,000.00")).toBe(25000);
    expect(sheetNumber("$25.000,00")).toBe(25000);
  });

  it("mapea las columnas reales sin confundir costo con precio", () => {
    const [product] = parseProductRows([["Elfbar Ice King 40k", "Miami Mint", 7, "$17,484.50", "$25,000.00", "$7,515.50", "327771488", "1460772980", "LOCATION", "", "SINCRONIZADO"]]);
    expect(product).toMatchObject({ sku: "TN-1460772980", brand: "Elfbar", model: "Ice King 40k", flavor: "Miami Mint", stock: 7, price: 25000, active: true });
  });

  it("conserva marcas de dos palabras", () => {
    const [product] = parseProductRows([["Lost Mary Mixer 30k", "Watermelon Ice", 2, 0, 25000, 0, "", "123", "", "SKU-1", "SINCRONIZADO"]]);
    expect(product).toMatchObject({ sku: "SKU-1", brand: "Lost Mary", model: "Mixer 30k" });
  });

  it("incorpora el enlace exacto del producto cuando la hoja lo provee", () => {
    const [product] = parseProductRows([["Geek Bar Pulse X", "Miami Mint", 1, 0, 23000, 0, "", "123", "", "", "SINCRONIZADO", "https://www.vaprizzio.com/productos/geek-bar-pulse-x1/"]], 11);
    expect(product?.productUrl).toBe("https://www.vaprizzio.com/productos/geek-bar-pulse-x1/");
  });

  it("lee el valor USDT usado para convertir mayorista a pesos", async () => {
    const provider = new GoogleSheetsCatalogProvider("sheet", "credentials");
    (provider as unknown as { rows:(range:string)=>Promise<unknown[][]> }).rows = async () => [["Valor USDT"], ["$1.275,50"]];
    await expect(provider.wholesaleExchangeRate()).resolves.toBe(1275.5);
  });
});
