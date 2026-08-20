const commercialIntent = /(?:[?\u00bf]|\b(?:precio|precios|cu[a\u00e1]nto|cuanto|sale|salen|ten[e\u00e9]s|tenes|hay|stock|disponible|sabor|sabores|modelo|modelos|quiero|comprar|compra|pedido|env[i\u00ed]o|envio|retir|mayorista|link|web|puff|pitadas|pagar|pago|efectivo|transferencia)\b)/i;

const arrivalReaction = /\b(?:al\s+fin+|por\s+fin+|llegaron|lleg[o\u00f3]|entraron|vamos+)\b/i;

export function isCasualStoryReaction(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 0 && value.length <= 160 && !commercialIntent.test(value);
}

export function casualStoryReply(text: string) {
  return arrivalReaction.test(text)
    ? "Sii, entraron un mont\u00f3n de sabores \ud83d\ude0e\ud83d\udd25"
    : "\ud83d\ude0e\ud83d\udd25";
}
