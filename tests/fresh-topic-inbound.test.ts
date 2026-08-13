import { describe, expect, it } from "vitest";
import { isArrivalUpdate, opensFreshTopic } from "../src/services/fresh-topic.js";

describe("reactivación de temas nuevos al ingresar mensajes", () => {
  it.each([
    "/new",
    "Hola",
    "hola! los de ignite de cuantos puff son?",
    "tenés stock de Lost Mary?",
    "qué sabores tienen?"
  ])("reactiva con %s", message => {
    expect(opensFreshTopic(message)).toBe(true);
  });

  it.each([
    "cómo seguimos con mi pedido?",
    "cuánto sale ese envío?",
    "seguimos con el Uber que coordinamos"
  ])("mantiene la intervención con %s", message => {
    expect(opensFreshTopic(message)).toBe(false);
  });
  it.each([
    "estoy a dos cuadras",
    "ya estoy a la vuelta",
    "llegue, estoy afuera",
    "en 5 minutos estoy"
  ])("deja pasar la llegada %s durante una pausa humana", message => {
    expect(isArrivalUpdate(message)).toBe(true);
  });

  it.each([
    "puedo pagar mitad transferencia y mitad efectivo?",
    "a que hora puedo pasar?",
    "cuanto sale el envio?"
  ])("no confunde una continuacion comercial con una llegada: %s", message => {
    expect(isArrivalUpdate(message)).toBe(false);
  });
});
