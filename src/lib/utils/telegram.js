import env from '../config/env.js';

// Escape user-supplied text before it goes into a parse_mode:'HTML' message,
// so '<', '>' or '&' can't break formatting, inject links, or make the
// Telegram API reject the whole message.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

export { sendTelegramMessage, escapeHtml };
