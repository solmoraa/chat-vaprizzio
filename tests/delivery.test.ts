import { describe, expect, it } from "vitest";
import { DeliveryService } from "../src/services/delivery-service.js";

describe("opciones de entrega", () => {
  const service = new DeliveryService();
  it("lo presenta como punto de retiro gratuito y no como local a la calle", () => expect(service.pickup()).toEqual({ method:"RETIRO", type:"PUNTO_DE_RETIRO_GRATUITO", price:0, address:"Av. Larrazábal 3437, Villa Lugano, CABA", storefront:false }));
  it.each([["CABA",3500],["Morón",5000],["Tigre",6000],["La Plata",8000]])("cotiza Flex para %s", (locality, price) => expect(service.flex(locality, new Date("2026-08-09T14:00:00Z"))).toMatchObject({ action:"AUTOMATICO", price }));
  it("después de las 13 ofrece Didi o Uber y aclara la llegada de Flex", () => expect(service.flex("CABA", new Date("2026-08-09T17:00:00Z"))).toMatchObject({ action:"OFRECER_APP", flexTomorrow:{ deliveryWindow:"16 a 20 hs" }, customerMessage:expect.stringContaining("te llegaría mañana entre las 16 y las 20 hs") }));
  it("desde las 22 programa el despacho para el día siguiente", () => expect(service.flex("CABA", new Date("2026-08-10T01:00:00Z"))).toMatchObject({ action:"PROGRAMAR_MANANA", customerMessage:expect.stringContaining("mañana") }));
  it("pide ubicación cuando no reconoce la zona", () => expect(service.flex("Lugar desconocido", new Date("2026-08-09T14:00:00Z"))).toMatchObject({ action:"PEDIR_LOCALIDAD" }));
  it("después de las 13 lista Flex para mañana y Uber/Didi para hoy", () => {
    expect(service.options(new Date("2026-08-09T17:00:00Z"))).toMatchObject({
      sameDayFlexAvailable:false,
      flex:{ dispatch:"MANANA", arrival:"LLEGA_MANANA_ENTRE_16_Y_20", reason:"CORTE_13HS", deliveryWindow:"16 a 20 hs" },
      uberDidi:{ availableToday:true },
      national:{ carriers:["Andreani", "Correo Argentino", "Via Cargo"] }
    });
  });
  it("antes de las 13 permite Flex en el día", () => expect(service.options(new Date("2026-08-09T14:00:00Z"))).toMatchObject({ sameDayFlexAvailable:true, flex:{ dispatch:"HOY" } }));
});
