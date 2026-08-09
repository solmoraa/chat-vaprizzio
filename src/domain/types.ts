export type Channel = "whatsapp" | "instagram";
export type ConversationState = "AI_ACTIVE" | "WAITING_HUMAN" | "HUMAN_ACTIVE";

export interface Product {
  sku: string;
  brand: string;
  model: string;
  flavor: string;
  stock: number;
  price: number;
  profile: string[];
  description: string;
  active: boolean;
  productUrl?: string;
}

export interface Flavor {
  flavor: string;
  type: string;
  sweetness: number;
  freshness: number;
  description: string;
  similarTo: string[];
}

export interface WholesaleTier {
  model: string;
  from: number;
  unitPriceUsd: number;
}

export interface CartItem { sku: string; quantity: number; }
export interface NegotiatedPrice {
  quantity: number;
  unitPrice: number;
  conditions: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  channel: Channel;
  customerId: string;
  state: ConversationState;
  currentProduct: string | null;
  currentFlavor: string | null;
  cart: CartItem[];
  negotiatedQuantity: number | null;
  negotiatedPrice: NegotiatedPrice | null;
  customerCity: string | null;
  lastMessages: string[];
  lastActivity: string;
  pausedUntil: string | null;
}

export interface SaleLine {
  sku: string;
  quantity: number;
  unitPrice: number;
  priceType: "retail" | "wholesale" | "negotiated";
}

export interface Sale {
  id: string;
  date: string;
  customerId: string;
  channel: Channel;
  lines: SaleLine[];
  total: number;
  negotiatedPrice: number | null;
}
