import { describe, expect, it } from "vitest";
import { opensFreshTopic } from "../src/services/fresh-topic.js";

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
});
