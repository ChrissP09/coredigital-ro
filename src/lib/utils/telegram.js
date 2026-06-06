import env from '../config/env.js';

async function sendTelegramMessage(text) {
  if (!env.telegramBotToken || !env.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.telegramChatId, text, parse_mode: 'HTML' })
    });
  } catch { }
}

export { sendTelegramMessage };
