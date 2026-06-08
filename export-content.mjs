import fs from 'fs';
import path from 'path';

const pages = [
  { route: '/', file: 'src/pages/index.astro' },
  { route: '/preturi', file: 'src/pages/preturi/index.astro' },
  { route: '/despre-noi', file: 'src/pages/despre-noi/index.astro' },
  { route: '/contact', file: 'src/pages/contact/index.astro' },
  { route: '/intrebari-frecvente', file: 'src/pages/intrebari-frecvente/index.astro' },
  { route: '/servicii/construire-website', file: 'src/pages/servicii/construire-website/index.astro' },
  { route: '/servicii/recenzii-online', file: 'src/pages/servicii/recenzii-online/index.astro' },
  { route: '/servicii/chatbot-ai', file: 'src/pages/servicii/chatbot-ai/index.astro' },
  { route: '/servicii/optimizare-ai', file: 'src/pages/servicii/optimizare-ai/index.astro' },
];

const BASE = path.resolve('.');

function extractText(raw) {
  // Remove frontmatter (--- ... ---)
  raw = raw.replace(/^---[\s\S]*?---/m, '');

  // Remove <script> blocks entirely
  raw = raw.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove <style> blocks entirely
  raw = raw.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  raw = raw.replace(/<!--[\s\S]*?-->/g, '');

  // Remove self-closing void elements
  raw = raw.replace(/<(img|input|hr|br|meta|link|source|svg|path|circle|rect|line|polyline|polygon)\b[^>]*\/?>/gi, '\n');

  // Replace closing block tags with newlines for readability
  raw = raw.replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|td|th|tr|ul|ol|blockquote|dt|dd|figure|figcaption|nav|aside|main|form|fieldset|label|option|select|textarea)>/gi, '\n');

  // Remove all remaining HTML tags
  raw = raw.replace(/<[^>]+>/g, '');

  // Remove multi-line JS expressions — Astro {[ ... ].map( ... )} blocks
  // First pass: remove balanced braces content (JS expressions)
  // We do multiple passes to handle nested braces
  for (let i = 0; i < 5; i++) {
    raw = raw.replace(/\{[^{}]*\}/g, ' ');
  }

  // Decode basic HTML entities
  raw = raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '→')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/gi, '');

  // Remove residual JS syntax lines (lines that look like code, not content)
  const junkPatterns = [
    /^[\s]*[\]\[(){},;]+[\s]*$/,          // lines of only brackets/punctuation
    /^\s*\.\s*map\s*\(/,                   // .map(
    /^\s*=>/,                              // arrow functions
    /^\s*const\s+/,                        // const declarations
    /^\s*\?\s+/,                           // ternary ?
    /^\s*&&\s+/,                           // && operator
    /^\s*\|\|\s+/,                         // || operator
    /^\s*:[\s]*$/,                         // lone colon
    /^\s*,\s*$/,                           // lone comma
    /^\s*\.\s*$/,                          // lone dot
    /^\s*\)\s*$/,                          // lone closing paren
    /^\s*}\s*\)\s*}\s*$/,                  // })}
    /^\s*}\s*$/,                           // lone closing brace
  ];

  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(l => {
      if (!l) return false;
      // Remove lines that are pure JS noise
      if (junkPatterns.some(p => p.test(l))) return false;
      // Remove very short lines that are likely code fragments (single char or 2 chars of punctuation)
      if (l.length <= 2 && /^[^a-zA-ZÀ-ž0-9]/.test(l)) return false;
      return true;
    });

  // Deduplicate consecutive identical lines
  const deduped = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) deduped.push(line);
  }

  return deduped.join('\n');
}

const separator = '═'.repeat(60);
const output = [];

for (const page of pages) {
  const filePath = path.join(BASE, page.file);
  if (!fs.existsSync(filePath)) {
    output.push(`${separator}\nPAGINA: ${page.route}\n[fișier negăsit: ${page.file}]\n`);
    continue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const text = extractText(raw);

  output.push(`${separator}\nPAGINA: ${page.route}\nFIȘIER: ${page.file}\n${separator}\n\n${text}\n`);
}

const result = output.join('\n\n');
fs.writeFileSync('content-export.txt', result, 'utf8');
console.log(`✅ Exportat ${pages.length} pagini → content-export.txt (${(result.length / 1024).toFixed(1)} KB)`);
