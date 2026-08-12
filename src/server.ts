import { loadConfig } from "./config/env.js";
import { FixtureCatalogProvider } from "./catalog/fixture-provider.js";
import { GoogleSheetsCatalogProvider } from "./catalog/sheets-provider.js";
import { ConversationRepository } from "./database/conversation-repository.js";
import { CatalogService } from "./services/catalog-service.js";
import { CartService } from "./services/cart-service.js";
import { SalesService } from "./services/sales-service.js";
import { TakeoverService } from "./services/takeover-service.js";
import { ConsoleNotifier, TelegramNotifier } from "./notifications/notifier.js";
import { AgentToolService } from "./agent/tool-service.js";
import { MessageDebouncer } from "./services/debouncer.js";
import { OpenClawClient } from "./agent/openclaw-client.js";
import { InstagramClient } from "./channels/instagram/client.js";
import { createApp } from "./app.js";
import products from "../fixtures/products.json" with { type: "json" };
import flavors from "../fixtures/flavors.json" with { type: "json" };
import wholesale from "../fixtures/wholesale.json" with { type: "json" };
import type { Flavor, Product, WholesaleTier } from "./domain/types.js";
import { statSync } from "node:fs";

const config = loadConfig();
const provider = config.CATALOG_PROVIDER === "sheets"
  ? new GoogleSheetsCatalogProvider(config.GOOGLE_SHEET_ID, config.GOOGLE_SERVICE_ACCOUNT_FILE)
  : new FixtureCatalogProvider(products as Product[], flavors as Flavor[], wholesale as WholesaleTier[], { envios: "Configurar en pestaña NEGOCIO" });
if (config.APP_ENV === "production" && config.GOOGLE_SERVICE_ACCOUNT_FILE && (statSync(config.GOOGLE_SERVICE_ACCOUNT_FILE).mode & 0o077) !== 0) throw new Error("PRODUCTION_BLOCKED: la credencial de Google debe tener permisos 600");
const conversations = new ConversationRepository(config.DATABASE_PATH, config.CONVERSATION_IDLE_MINUTES, config.CONVERSATION_RETENTION_DAYS);
const instagram = new InstagramClient(config.META_ACCESS_TOKEN, config.META_GRAPH_VERSION, config.META_INSTAGRAM_ACCESS_TOKEN, config.INSTAGRAM_ACCOUNT_ID);
const notifier = config.TELEGRAM_BOT_TOKEN && config.HUMAN_NOTIFICATION_CHAT_ID ? new TelegramNotifier(config.TELEGRAM_BOT_TOKEN, config.HUMAN_NOTIFICATION_CHAT_ID, (channel, customerId) => instagram.customerName(channel, customerId)) : new ConsoleNotifier();
const takeover = new TakeoverService(conversations, notifier);
const tools = new AgentToolService(new CatalogService(provider), new CartService(conversations), takeover, new SalesService(provider, conversations, config.SALE_CONFIRMATION_MODE), undefined, conversations);
const app = createApp({ config, tools, conversations, takeover, debounce: new MessageDebouncer(config.DEBOUNCE_MS), openclaw: new OpenClawClient(config.OPENCLAW_BASE_URL, config.OPENCLAW_HOOK_TOKEN, config.OPENCLAW_AGENT_ID, config.OPENCLAW_CLI_PATH), instagram });
app.listen(config.PORT, config.HOST, () => console.info(`Vaprizzio ${config.APP_ENV} listening on ${config.HOST}:${config.PORT}`));
