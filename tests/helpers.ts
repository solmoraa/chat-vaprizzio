import { FixtureCatalogProvider } from "../src/catalog/fixture-provider.js";
import type { Flavor, Product, WholesaleTier } from "../src/domain/types.js";
export const products: Product[] = [
  { sku:"M1", brand:"Elfbar", model:"Ice King 40K", flavor:"Miami Mint", stock:7, price:26000, profile:["fresco"], description:"Menta fresca", active:true },
  { sku:"M2", brand:"Ignite", model:"V250", flavor:"Miami Mint", stock:3, price:25000, profile:["fresco"], description:"Menta fresca", active:true },
  { sku:"T1", brand:"Elfbar", model:"Ice King 40K", flavor:"Tiger Blood", stock:4, price:26000, profile:["dulce"], description:"Frutal", active:true },
  { sku:"LM1", brand:"Lost Mary", model:"MO 5k", flavor:"Sour Gummy Mint", stock:2, price:13000, profile:["mentolado"], description:"Menta intensa", active:true, productUrl:"https://www.vaprizzio.com/productos/lost-mary-mo-5k1/" },
  { sku:"OOS", brand:"Elfbar", model:"Ice King 40K", flavor:"Cherry Fuse", stock:0, price:26000, profile:["dulce"], description:"Cereza", active:true },
  { sku:"OFF", brand:"Fake", model:"Fake", flavor:"Miami Mint", stock:50, price:1, profile:[], description:"", active:false }
];
export const flavors: Flavor[] = [{ flavor:"Miami Mint",type:"mentolado",sweetness:2,freshness:10,description:"Menta",similarTo:[] },{ flavor:"Tiger Blood",type:"dulce",sweetness:9,freshness:2,description:"Frutal",similarTo:[] }];
export const tiers: WholesaleTier[] = [
  { model:"Elfbar Ice King 40K",from:10,unitPriceUsd:12.80 },
  { model:"Elfbar Ice King 40K",from:20,unitPriceUsd:12.20 },
  { model:"Elfbar Ice King 40K",from:50,unitPriceUsd:11.80 },
  { model:"Elfbar Ice King 40K",from:100,unitPriceUsd:11.40 },
  { model:"Elfbar Ice King 40K",from:200,unitPriceUsd:11.20 }
];
export const fixture = () => new FixtureCatalogProvider(structuredClone(products), flavors, tiers, { VALOR_USDT:"1200" });
