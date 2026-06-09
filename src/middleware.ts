import type { MiddlewareHandler } from 'astro';

// Fixed-window, per-IP rate limiting for the POST API routes. The app runs as a
// single Node process (the entry.mjs child behind the proxy), so an in-memory
// map is sufficient — no shared store needed.
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Max requests per IP per window, per endpoint. The OpenAI-backed routes are
// the most expensive, so they get the tightest limits.
const LIMITS: Record<string, number> = {
  '/api/scor': 8,
  '/api/custom-search': 6,
  '/api/contact': 6,
  '/api/lead': 8,
};

const hits = new Map<string, number[]>();

function clientIp(request: Request, fallback?: string): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return fallback || 'unknown';
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);
  const limit = LIMITS[url.pathname];

  if (limit && request.method === 'POST') {
    const ip = clientIp(request, context.clientAddress);
    const key = `${ip}:${url.pathname}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

    if (recent.length >= limit) {
      return new Response(
        JSON.stringify({ error: 'Prea multe cereri. Încearcă din nou în câteva minute.' }),
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '600' } }
      );
    }

    recent.push(now);
    hits.set(key, recent);
  }

  return next();
};
