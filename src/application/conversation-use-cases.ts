import type { ConversationRepository } from "../database/conversation-repository.js";
import type { Channel } from "../domain/types.js";
import type { TakeoverService } from "../services/takeover-service.js";

/**
 * Casos de uso de conversaciones.
 *
 * Esta capa orquesta el dominio sin conocer Express, SQLite ni los canales.
 * Los controladores HTTP pueden reutilizarla sin duplicar reglas de negocio.
 */
export class ConversationUseCases {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly takeover: TakeoverService,
  ) {}

  get(channel: Channel, customerId: string) {
    return this.conversations.find(channel, customerId);
  }

  recordHumanMessage(channel: Channel, customerId: string, text: string) {
    return this.takeover.humanMessage(channel, customerId, text);
  }

  resume(channel: Channel, customerId: string) {
    return this.takeover.resume(channel, customerId);
  }
}
