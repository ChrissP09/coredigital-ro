export const prerender = false;

import type { APIRoute } from 'astro';
import { sendTelegramMessage, escapeHtml } from '../../lib/utils/telegram.js';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, email, phone, company, service, message, website_confirm } = body;

  // honeypot
  if (website_confirm) return Response.json({ ok: true });

  if (!name?.trim() || !email?.trim()) {
    return Response.json({ error: 'Numele și emailul sunt obligatorii.' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    return Response.json({ error: 'Adresa de email nu este validă.' }, { status: 400 });
  }

  const serviceLabels: Record<string, string> = {
    website: 'Construire website',
    reviews: 'Recenzii online',
    ai: 'Chatbot AI',
    'all-in-one': 'Pachet All-in-One',
    custom: 'Soluție personalizată',
  };

  const lines = [
    `📩 <b>Mesaj nou din Contact</b>`,
    `👤 ${escapeHtml(name.trim())}${company?.trim() ? ` · ${escapeHtml(company.trim())}` : ''}`,
    `📧 ${escapeHtml(email.trim())}`,
    phone?.trim() ? `📞 ${escapeHtml(phone.trim())}` : null,
    service ? `🎯 ${escapeHtml(serviceLabels[service] || service)}` : null,
    message?.trim() ? `💬 ${escapeHtml(message.trim().slice(0, 800))}` : null,
  ].filter(Boolean).join('\n');

  sendTelegramMessage(lines);

  return Response.json({ ok: true });
};
