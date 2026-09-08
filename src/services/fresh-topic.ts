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
  // Una consulta comercial no es, por sí sola, una conversación nueva.
  // Si una persona ya tomó el chat, sólo un saludo explícito (o /new)
  // devuelve el control al bot. Así evitamos que responda nuevamente a
  // mensajes posteriores de una coordinación humana.
  return greeting;
};

export type ArrivalUpdateKind = "outside" | "near";

export const arrivalUpdateKind = (value: string): ArrivalUpdateKind | null => {
  const text = normalized(value);
  if (!text) return null;

  const outside = /\b(afuera+|afura+|afuer|en (?:la )?puerta|puerta|en (?:el )?porton|porton|aca afuera|aca en la puerta)\b/.test(text)
    || /\b(?:estoy|toy|stoi|aca) fuera\b/.test(text)
    || /^(?:ya )?(?:estoy|toy|stoi|aca|llegue|llege|yegue)(?: al local)?$/i.test(text);
  if (outside) return "outside";

  const near = /\b(estoy llegando|toy llegando|stoi llegando|ya voy llegando|voy llegando|estoy cerca|toy cerca|a la vuelta|a pocas cuadras|a unas? cuadras|a (?:\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) cuadras|por llegar|proximo a llegar|llego en \d+|en \d+ (?:minutos?|mins?|min) (?:llego|estoy))\b/.test(text);
  return near ? "near" : null;
};

export const isArrivalUpdate = (value: string) => arrivalUpdateKind(value) !== null;
