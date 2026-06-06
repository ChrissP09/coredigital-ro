export const prerender = false;

import type { APIRoute } from 'astro';
import database from '../../lib/config/database.js';
import { sendTelegramMessage } from '../../lib/utils/telegram.js';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { name, phone, email, role, analysisId, domain } = body;

  if (!name?.trim() || !phone?.trim()) {
    return Response.json({ error: 'Nume și telefon sunt obligatorii.' }, { status: 400 });
  }

  await database.run(
    'INSERT INTO leads (analysis_id, domain, name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
    [analysisId || null, domain || null, name.trim(), phone.trim(), email?.trim() || null, role?.trim() || null]
  );

  const lines = [
    `🔔 <b>Lead nou</b>`,
    `👤 ${name.trim()}${role?.trim() ? ` · ${role.trim()}` : ''}`,
    `📞 ${phone.trim()}`,
    email?.trim() ? `📧 ${email.trim()}` : null,
    domain ? `🌐 ${domain}` : null,
    analysisId ? `📊 Raport: /analiza-ai/rezultat/${analysisId}` : null
  ].filter(Boolean).join('\n');

  sendTelegramMessage(lines);

  return Response.json({ ok: true });
};
