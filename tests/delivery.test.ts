import { describe, expect, it } from "vitest";
import { DeliveryService } from "../src/services/delivery-service.js";

describe("opciones de entrega", () => {
  const service = new DeliveryService();
  it("ofrece retiro gratis en la dirección configurada", () => expect(service.pickup()).toEqual({ method:"RETIRO", price:0, address:"Av. Larrazábal 3437, Villa Lugano, CABA" }));
  it.each([["CABA",3500],["Morón",5000],["Tigre",6000],["La Plata",8000]])("cotiza Flex para %s", (locality, price) => expect(service.flex(locality, new Date("2026-08-09T14:00:00Z"))).toMatchObject({ action:"AUTOMATICO", price }));
  it("después de las 13 ofrece Didi o Uber sin inventar precio", () => expect(service.flex("CABA", new Date("2026-08-09T17:00:00Z"))).toMatchObject({ action:"OFRECER_APP" }));
  it("pide ubicación cuando no reconoce la zona", () => expect(service.flex("Lugar desconocido", new Date("2026-08-09T14:00:00Z"))).toMatchObject({ action:"PEDIR_LOCALIDAD" }));
});
