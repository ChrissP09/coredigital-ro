import 'dotenv/config';
import path from 'path';

const env = {
  port: Number(process.env.PORT || 3000),
  sqliteDbPath: process.env.SQLITE_DB_PATH || './data/app.sqlite',
  maxPagesToAnalyze: Number(process.env.MAX_PAGES_TO_ANALYZE || 25),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 12000),
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  adminUser: process.env.ADMIN_USER || null,
  adminPass: process.env.ADMIN_PASS || null,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || null
};

env.sqliteAbsolutePath = path.resolve(process.cwd(), env.sqliteDbPath);

export default env;
