export const prerender = false;

import type { APIRoute } from 'astro';
import database from '../../lib/config/database.js';
import { sendTelegramMessage } from '../../lib/utils/telegram.js';
import { checkBrandInAiResponse } from '../../lib/services/aiVisibility.service.js';
import env from '../../lib/config/env.js';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { query1, query2, email, brandName, domain, analysisId } = body;

  if (!query1?.trim() || !query2?.trim()) {
    return Response.json({ error: 'Cele 2 cuvinte cheie sunt obligatorii.' }, { status: 400 });
  }
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    return Response.json({ error: 'Adresa de email nu este validă.' }, { status: 400 });
  }

  await database.run(
    'INSERT INTO leads (analysis_id, domain, name, phone, email, role) VALUES (?, ?, ?, ?, ?, ?)',
    [analysisId || null, domain || null, 'Custom Search', '-', email.trim(), 'custom-search']
  );

  const lines = [
    `🔍 <b>Custom Search</b>`,
    `📧 ${email.trim()}`,
    domain ? `🌐 ${domain}` : null,
    `❓ ${query1.trim()}`,
    `❓ ${query2.trim()}`,
    analysisId ? `📊 Raport: /analiza-ai/rezultat/${analysisId}` : null
  ].filter(Boolean).join('\n');
  sendTelegramMessage(lines);

  const cleanBrand = (brandName || domain || '').trim();
  const [r1, r2] = await Promise.all([
    checkBrandInAiResponse(query1.trim(), cleanBrand, domain || '', env.openaiApiKey),
    checkBrandInAiResponse(query2.trim(), cleanBrand, domain || '', env.openaiApiKey)
  ]);

  return Response.json({ results: [r1, r2] });
};
