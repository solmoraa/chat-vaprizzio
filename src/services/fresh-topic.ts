const normalized = (value: string) => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9!?/ ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const opensFreshTopic = (value: string) => {
  const text = normalized(value);
  if (/^\/new\b/.test(text)) return true;

  const continuation = /\b(mi pedido|mi comprobante|ese envio|el envio que|el uber que|el didi que|lo de antes|lo anterior|seguimos con|sigo con|coordinar|coordinamos)\b/.test(text);
  if (continuation) return false;

  const greeting = /^(hola|holaa+|buenas|buen dia|buenos dias|buenas tardes|buenas noches|como estas)(\b|[!?])/.test(text);
  const commercialQuestion = /\b(vape|vapes|vaper|vaporizador|vaporizadores|marca|marcas|modelo|modelos|sabor|sabores|gusto|gustos|stock|precio|precios|puff|puffs|pitada|pitadas|mayorista|mayoristas|catalogo)\b/.test(text);
  return greeting || commercialQuestion;
};

export const isArrivalUpdate = (value: string) => {
  const text = normalized(value);
  return /\b(afuera|en la puerta|ya llegue|llegue al local|estoy llegando|estoy cerca|a la vuelta|a pocas cuadras|a unas? cuadras|a (?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) cuadras|por llegar|proximo a llegar|llego en \d+|en \d+ (?:minutos?|mins?|min) (?:llego|estoy))\b/.test(text);
};
