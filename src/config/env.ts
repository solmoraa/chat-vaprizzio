import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["test", "production"]).default("test"),
  ALLOW_PRODUCTION: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_PATH: z.string().default("./data/vaprizzio-test.sqlite"),
  CATALOG_PROVIDER: z.enum(["fixture", "sheets"]).default("fixture"),
  GOOGLE_SHEET_ID: z.string().default(""),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().default(""),
  OPENCLAW_BASE_URL: z.string().url().default("http://127.0.0.1:18789"),
  OPENCLAW_HOOK_TOKEN: z.string().default(""),
  OPENCLAW_AGENT_ID: z.string().default("vaprizzio-sales"),
  OPENCLAW_CLI_PATH: z.string().default("openclaw"),
  WHATSAPP_ACCOUNT: z.string().default(""),
  WHATSAPP_TEST_ALLOW_FROM: z.string().default(""),
  INSTAGRAM_ACCOUNT_ID: z.string().default(""),
  META_ACCESS_TOKEN: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_VERIFY_TOKEN: z.string().default(""),
  META_GRAPH_VERSION: z.string().default("v23.0"),
  HUMAN_NOTIFICATION_CHANNEL: z.string().default("telegram"),
  HUMAN_NOTIFICATION_CHAT_ID: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  INTERNAL_WEBHOOK_SECRET: z.string().default(""),
  TOOL_API_TOKEN: z.string().default(""),
  TOOL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(8000),
  CONVERSATION_IDLE_MINUTES: z.coerce.number().int().positive().default(720),
  CONVERSATION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SALE_CONFIRMATION_MODE: z.enum(["disabled", "explicit_internal_command"]).default("disabled")
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = schema.parse(source);
  if (config.APP_ENV === "production" && !config.ALLOW_PRODUCTION) {
    throw new Error("PRODUCTION_BLOCKED: APP_ENV=production requiere ALLOW_PRODUCTION=true");
  }
  if (config.APP_ENV === "production" && config.CATALOG_PROVIDER !== "sheets") {
    throw new Error("PRODUCTION_BLOCKED: producción requiere CATALOG_PROVIDER=sheets");
  }
  if (config.APP_ENV === "production" && (config.TOOL_API_TOKEN.length < 32 || config.INTERNAL_WEBHOOK_SECRET.length < 32 || config.OPENCLAW_HOOK_TOKEN.length < 32)) {
    throw new Error("PRODUCTION_BLOCKED: los tokens internos deben tener al menos 32 caracteres");
  }
  return config;
}
