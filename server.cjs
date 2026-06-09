'use strict';
const { spawn } = require('child_process');
const { createServer, request: httpRequest } = require('http');
const path = require('path');

const CHILD_PORT = 3001;
const PORT = Number(process.env.PORT || 3000);

// Child runs entry.mjs with --experimental-sqlite on internal port 3001
const child = spawn(
  process.execPath,
  ['--experimental-sqlite', path.join(__dirname, 'server/entry.mjs')],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(CHILD_PORT), HOST: '127.0.0.1' }
  }
);

child.on('error', err => process.stderr.write('Child error: ' + err.message + '\n'));
child.on('exit', code => process.exit(code ?? 0));

// Security headers applied to every response (static pages + SSR). CSP allows
// our own inline styles/scripts and the Cloudflare Turnstile widget/iframe.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

function withSecurityHeaders(headers) {
  return {
    ...headers,
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'content-security-policy': CSP,
  };
}

// Forward request to child, retry up to `retries` times if child isn't ready yet
function forward(req, res, body, retries) {
  const pr = httpRequest(
    {
      hostname: '127.0.0.1',
      port: CHILD_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        'content-length': body.length,
        // Hostinger terminates SSL up front; tell the child the real scheme
        // so Astro builds https:// origins (canonical, og:url, redirects).
        'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
      },
    },
    r => { res.writeHead(r.statusCode, withSecurityHeaders(r.headers)); r.pipe(res); }
  );
  pr.write(body);
  pr.end();
  pr.on('error', err => {
    if (retries > 0 && err.code === 'ECONNREFUSED')
      setTimeout(() => forward(req, res, body, retries - 1), 300);
    else if (!res.headersSent) { res.writeHead(502); res.end('Bad Gateway'); }
  });
}

// Proxy server — Passenger intercepts this listen() call
const proxyServer = createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => forward(req, res, Buffer.concat(chunks), 10));
});

proxyServer.listen(PORT, '127.0.0.1');

process.on('SIGTERM', () => { child.kill('SIGTERM'); proxyServer.close(); process.exit(0); });
process.on('SIGINT',  () => { child.kill('SIGINT');  proxyServer.close(); process.exit(0); });
