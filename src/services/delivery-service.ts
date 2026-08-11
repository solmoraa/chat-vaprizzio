import { normalize } from "../utils/normalize.js";

export type DeliveryZone = "CABA" | "GBA1" | "GBA2" | "GBA3";

const zonePrices: Record<DeliveryZone, number> = { CABA: 3500, GBA1: 5000, GBA2: 6000, GBA3: 8000 };
const locations: Record<DeliveryZone, string[]> = {
  CABA: ["caba", "capital federal", "ciudad autonoma de buenos aires"],
  GBA1: ["vicente lopez", "san isidro", "san fernando", "general san martin", "san martin", "tres de febrero", "hurlingham", "ituzaingo", "moron", "lomas de zamora", "lanus", "avellaneda", "quilmes"],
  GBA2: ["tigre", "jose c paz", "malvinas argentinas", "san miguel", "moreno", "merlo", "la matanza", "esteban echeverria", "ezeiza", "presidente peron", "almirante brown", "florencio varela", "berazategui"],
  GBA3: ["zarate", "campana", "escobar", "pilar", "lujan", "general rodriguez", "marcos paz", "canuelas", "san vicente", "la plata", "ensenada", "berisso"]
};

export const buenosAiresHour = (now = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }).format(now));

export class DeliveryService {
  pickup() { return { method: "RETIRO", price: 0, address: "Av. Larrazábal 3437, Villa Lugano, CABA" }; }

  options(now = new Date()) {
    const hour = buenosAiresHour(now);
    return {
      currentHour: hour,
      sameDayFlexAvailable: hour < 13,
      flex: hour < 13
        ? { dispatch: "HOY", arrival: "LLEGA_HOY_ENTRE_16_Y_20", cutoff: "13:00", deliveryWindow: "16 a 20 hs", prices: zonePrices, payment: "TRANSFERENCIA_ANTICIPADA" }
        : { dispatch: "MANANA", arrival: "LLEGA_MANANA_ENTRE_16_Y_20", reason: "CORTE_13HS", deliveryWindow: "16 a 20 hs", prices: zonePrices, payment: "TRANSFERENCIA_ANTICIPADA" },
      uberDidi: hour < 22
        ? { availableToday: true, price: "CONSULTAR_EN_EL_MOMENTO", payment: "TRANSFERENCIA" }
        : { availableToday: false, dispatch: "MANANA" },
      national: { requires: ["address", "postalCode"], carriers: ["Andreani", "Correo Argentino", "Via Cargo"] },
      pickup: this.pickup()
    };
  }

  flex(locality: string, now = new Date()) {
    const query = normalize(locality);
    const zone = (Object.entries(locations) as Array<[DeliveryZone, string[]]>).find(([, names]) => names.some(name => normalize(name) === query))?.[0];
    if (!zone) return { action: "PEDIR_LOCALIDAD", customerMessage: "Pasame tu localidad y código postal así te confirmo el envío" };
    const hour = buenosAiresHour(now);
    if (hour >= 22) return { action: "PROGRAMAR_MANANA", zone, deliveryWindow:"16 a 20 hs", customerMessage: "A esta hora los envíos salen mañana. Con Envío Flex te llegaría mañana entre las 16 y las 20 hs" };
    if (hour >= 13) return { action: "OFRECER_APP", zone, flexTomorrow:{ price:zonePrices[zone], deliveryWindow:"16 a 20 hs", arrival:"LLEGA_MANANA_ENTRE_16_Y_20" }, customerMessage: "Para hoy podemos pedir un Didi o Uber Envíos. El valor se consulta en el momento y se paga por transferencia. Si preferís Envío Flex, te llegaría mañana entre las 16 y las 20 hs" };
    return { action: "AUTOMATICO", method: "FLEX", zone, price: zonePrices[zone], arrival:"LLEGA_HOY_ENTRE_16_Y_20", deliveryWindow: "16 a 20 hs", cutoff: "13:00", payment: "TRANSFERENCIA_ANTICIPADA" };
  }
}
