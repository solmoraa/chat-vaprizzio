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
import { createApp } from "./app.js";
import products from "../fixtures/products.json" with { type: "json" };
import flavors from "../fixtures/flavors.json" with { type: "json" };
import wholesale from "../fixtures/wholesale.json" with { type: "json" };
import type { Flavor, Product, WholesaleTier } from "./domain/types.js";

const config = loadConfig();
const provider = config.CATALOG_PROVIDER === "sheets"
  ? new GoogleSheetsCatalogProvider(config.GOOGLE_SHEET_ID, config.GOOGLE_SERVICE_ACCOUNT_FILE)
  : new FixtureCatalogProvider(products as Product[], flavors as Flavor[], wholesale as WholesaleTier[], { envios: "Configurar en pestaña NEGOCIO" });
const conversations = new ConversationRepository(config.DATABASE_PATH, config.CONVERSATION_IDLE_MINUTES);
const notifier = config.TELEGRAM_BOT_TOKEN && config.HUMAN_NOTIFICATION_CHAT_ID ? new TelegramNotifier(config.TELEGRAM_BOT_TOKEN, config.HUMAN_NOTIFICATION_CHAT_ID) : new ConsoleNotifier();
const takeover = new TakeoverService(conversations, notifier);
const tools = new AgentToolService(new CatalogService(provider), new CartService(conversations), takeover, new SalesService(provider, conversations, config.SALE_CONFIRMATION_MODE));
const app = createApp({ config, tools, conversations, takeover, debounce: new MessageDebouncer(config.DEBOUNCE_MS), openclaw: new OpenClawClient(config.OPENCLAW_BASE_URL, config.OPENCLAW_HOOK_TOKEN, config.OPENCLAW_AGENT_ID) });
app.listen(config.PORT, () => console.info(`Vaprizzio ${config.APP_ENV} listening on :${config.PORT}`));
