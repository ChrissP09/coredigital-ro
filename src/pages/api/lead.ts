export const prerender = false;

import type { APIRoute } from 'astro';
import database from '../../lib/config/database.js';
import { sendTelegramMessage, escapeHtml } from '../../lib/utils/telegram.js';
import { verifyTurnstile } from '../../lib/utils/turnstile.js';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, phone, email, role, analysisId, domain } = body;

  if (!name?.trim() || !phone?.trim()) {
    return Response.json({ error: 'Nume și telefon sunt obligatorii.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress;
  if (!(await verifyTurnstile(body['cf-turnstile-response'], ip))) {
    return Response.json({ error: 'Verificarea anti-bot a eșuat. Reîncarcă pagina.' }, { status: 403 });
  }

  await database.run(
    'INSERT INTO leads (analysis_id, domain, name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
    [analysisId || null, domain || null, name.trim(), phone.trim(), email?.trim() || null, role?.trim() || null]
  );

  const lines = [
    `🔔 <b>Lead nou</b>`,
    `👤 ${escapeHtml(name.trim())}${role?.trim() ? ` · ${escapeHtml(role.trim())}` : ''}`,
    `📞 ${escapeHtml(phone.trim())}`,
    email?.trim() ? `📧 ${escapeHtml(email.trim())}` : null,
    domain ? `🌐 ${escapeHtml(domain)}` : null,
    analysisId ? `📊 Raport: /analiza-ai/rezultat/${escapeHtml(analysisId)}` : null
  ].filter(Boolean).join('\n');

  sendTelegramMessage(lines);

  return Response.json({ ok: true });
};
