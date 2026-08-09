import { normalize } from "../utils/normalize.js";

export type DeliveryZone = "CABA" | "GBA1" | "GBA2" | "GBA3";

const zonePrices: Record<DeliveryZone, number> = { CABA: 3500, GBA1: 5000, GBA2: 6000, GBA3: 8000 };
const locations: Record<DeliveryZone, string[]> = {
  CABA: ["caba", "capital federal", "ciudad autonoma de buenos aires"],
  GBA1: ["vicente lopez", "san isidro", "san fernando", "general san martin", "san martin", "tres de febrero", "hurlingham", "ituzaingo", "moron", "lomas de zamora", "lanus", "avellaneda", "quilmes"],
  GBA2: ["tigre", "jose c paz", "malvinas argentinas", "san miguel", "moreno", "merlo", "la matanza", "esteban echeverria", "ezeiza", "presidente peron", "almirante brown", "florencio varela", "berazategui"],
  GBA3: ["zarate", "campana", "escobar", "pilar", "lujan", "general rodriguez", "marcos paz", "canuelas", "san vicente", "la plata", "ensenada", "berisso"]
};

export class DeliveryService {
  pickup() { return { method: "RETIRO", price: 0, address: "Av. Larrazábal 3437, Villa Lugano, CABA" }; }

  flex(locality: string, now = new Date()) {
    const query = normalize(locality);
    const zone = (Object.entries(locations) as Array<[DeliveryZone, string[]]>).find(([, names]) => names.some(name => normalize(name) === query))?.[0];
    if (!zone) return { action: "PEDIR_LOCALIDAD", customerMessage: "Pasame tu localidad y código postal así te confirmo el envío" };
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }).format(now));
    if (hour >= 13) return { action: "OFRECER_APP", zone, customerMessage: "Para hoy podemos pedir un Didi o Uber Envíos. El valor se consulta en el momento y se paga por transferencia" };
    return { action: "AUTOMATICO", method: "FLEX", zone, price: zonePrices[zone], deliveryWindow: "16 a 20 hs", cutoff: "13:00", payment: "TRANSFERENCIA_ANTICIPADA" };
  }
}
