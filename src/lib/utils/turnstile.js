import env from '../config/env.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Cloudflare Turnstile token server-side.
 * - If no secret key is configured (dev / not set up), verification is skipped
 *   and the request is allowed through.
 * - If a secret IS configured, a missing/invalid token is rejected (fail-closed).
 */
async function verifyTurnstile(token, ip) {
  if (!env.turnstileSecretKey) return true; // not configured → don't block
  if (!token || typeof token !== 'string') return false;

  try {
    const form = new URLSearchParams();
    form.append('secret', env.turnstileSecretKey);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false; // verification failed → reject
  }
}

export { verifyTurnstile };
