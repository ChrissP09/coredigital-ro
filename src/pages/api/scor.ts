export const prerender = false;

import type { APIRoute } from 'astro';
import { normalizeWebsiteUrl, getDomain } from '../../lib/utils/url.js';
import { findRecentAnalysis, createAnalysis } from '../../lib/repositories/analysis.repository.js';
import { analyzeWebsite } from '../../lib/services/ruleScoring.service.js';

export const POST: APIRoute = async ({ request, redirect }) => {
  let websiteUrl: string;

  try {
    const body = await request.formData();
    const raw = body.get('websiteUrl')?.toString() || '';

    const honeypot = body.get('website_confirm')?.toString() || '';
    if (honeypot.trim() !== '') {
      return new Response('Bad request', { status: 400 });
    }

    websiteUrl = normalizeWebsiteUrl(raw);
  } catch {
    return redirect('/?error=url');
  }

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';

  if (!forceRefresh) {
    const domain = getDomain(websiteUrl);
    const cachedId = await findRecentAnalysis(domain);
    if (cachedId) return redirect(`/analiza-ai/rezultat/${cachedId}?cached=1`);
  }

  try {
    const result = await analyzeWebsite(websiteUrl);
    const id = await createAnalysis(result);
    return redirect(`/analiza-ai/rezultat/${id}`);
  } catch (err: any) {
    const msg = err?.publicMessage || 'Eroare la analiză. Verifică URL-ul și încearcă din nou.';
    return redirect(`/analiza-ai?error=${encodeURIComponent(msg)}`);
  }
};
