# CLAUDE.md — CoreDigital Astro

Project path: `E:\Core Digital\Core Digital Astro\coredigital-ro`
Active branch: `aethel-redesign-clean` → merges into `main`
Dev server: `npm run dev` → `http://localhost:4321`

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Astro 5 (`output: 'static'` + `@astrojs/node` adapter for SSR pages) |
| CSS | Tailwind CSS 3 + custom CSS layers (BEM components) |
| Database | SQLite via `sqlite3` — file at `./data/app.sqlite` |
| Fonts | Locally hosted WOFF2 in `public/fonts/` (Inter variable + JetBrains Mono variable) |
| Icons | `lucide-static` + custom `LucideIcon.astro` component |
| Spam protection | Cloudflare Turnstile CAPTCHA + honeypot field |
| Notifications | Telegram Bot API (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |
| AI scoring | OpenAI GPT-4o (`OPENAI_API_KEY`) — used in `aiVisibility.service.js` |
| Crawling | `cheerio` + `fast-xml-parser` + `pageFetch.service.js` |

---

## Architecture — Hybrid Rendering

Marketing pages are **static** (default Astro behaviour).
SSR pages require `export const prerender = false` at the top of the file.

**SSR pages:**
- `src/pages/analiza-ai/index.astro` — grader landing
- `src/pages/analiza-ai/rezultat/[id].astro` — analysis result
- `src/pages/api/scor.ts` — main grader endpoint
- `src/pages/api/lead.ts` — lead capture
- `src/pages/api/contact.ts` — contact form → Telegram
- `src/pages/api/custom-search.ts` — custom search

---

## Page Map

### Marketing website (static)
```
/                          src/pages/index.astro                ✅ Complete (Aethel redesign)
/preturi                   src/pages/preturi/index.astro         ✅ Complete
/despre-noi                src/pages/despre-noi/index.astro      ⚠️  Needs review post-redesign
/contact                   src/pages/contact/index.astro         ✅ Complete (Telegram backend wired)
/intrebari-frecvente       src/pages/intrebari-frecvente/        ⚠️  Only 3 placeholder questions
/servicii/construire-website                                     ⚠️  ~40% complete
/servicii/recenzii-online                                        ⚠️  ~50% complete
/servicii/chatbot-ai                                             ⚠️  ~50% complete
/servicii/optimizare-ai                                          ⚠️  ~30% complete
```

### AI Grader app (SSR)
```
/analiza-ai                src/pages/analiza-ai/index.astro      ✅ Complete
/analiza-ai/rezultat/[id]  src/pages/analiza-ai/rezultat/[id]    ✅ Complete
```

---

## Design System — Aethel

Dark theme, lime green accent, glassmorphism nav.

**Colors (all HSL via CSS vars):**
- Background: `hsl(217 14% 11%)` — `--color-bg`
- Surface: `hsl(240 5% 10%)` — `--color-surface`
- Text: white — `--color-text`
- Accent lime: `hsl(83 78% 56%)` → `#A3E635` — `--color-lime`
- Accent sky: `hsl(199 93% 60%)` → `#38BDF8` — `--color-sky`
- Brand token: `--brand-color` = `hsl(var(--color-lime))`

**Typography scale** (all defined in `src/styles/base/tokens.css`):
```
--text-display  clamp(2.6rem, 5vw, 4.25rem)    hero h1
--text-h1       clamp(2rem, 3.5vw, 3.25rem)    page title
--text-h2       clamp(1.75rem, 2.5vw, 2.25rem) section heading
--text-h3       clamp(1.15rem, 1.5vw, 1.5rem)  card heading
--text-h4       1.125rem
--text-body-lg  1.125rem                        lead / subtitle
--text-body     1rem
--text-sm       0.875rem
--text-xs       0.75rem

--fw-display 700  --fw-heading 600  --fw-sub 500  --fw-body 400
--lh-display 1.02  --lh-heading 1.1  --lh-body 1.65  --lh-relaxed 1.75
--ls-tight -0.03em  --ls-heading -0.02em  --ls-wide 0.05em
```

**CSS architecture:**
- `src/styles/main.css` — imports all layers in order: fonts → tokens → reset → typography → layout → utilities → components
- `src/styles/base/tokens.css` — all CSS custom properties (colors, spacing, radii, shadows, type scale)
- `src/styles/base/typography.css` — h1-h6 base styles using the type scale vars
- `src/styles/components/*.css` — BEM component styles, all consume tokens via `var(--...)`
- Components use `@layer components { }` — Tailwind utilities override them

**Fonts:**
- `public/fonts/inter-variable.woff2` + `inter-variable-ext.woff2` — Inter, weights 100-900
- `public/fonts/jetbrains-mono-variable.woff2` + `jetbrains-mono-variable-ext.woff2` — JetBrains Mono, weights 100-800
- `public/fonts/fonts.css` — static `@font-face` declarations served to analiza-ai pages
- `src/styles/base/fonts.css` — same declarations, imported by `main.css` for marketing pages
- Google Fonts CDN has been fully removed

**Tailwind config** (`tailwind.config.cjs`):
- `fontFamily.sans` = `['var(--font-sans)']`, `fontFamily.mono` = `['var(--font-mono)']`
- Custom colors: `brand`, `reviews`, `ai`, `ink`, `muted`, `bg`, `surface`, `border` (all via CSS vars)

---

## AI Grader — How It Works

### Scoring pipeline (`/api/scor`)
1. Validate URL → check 24h cache in SQLite
2. Crawl up to 25 pages via `pageDiscovery.service.js`
3. For each page: `contentExtract.service.js` → `schemaDetection.service.js`
4. `sitemap.service.js` → check for `<lastmod>` in sitemap
5. `externalPresence.service.js` → Google Maps, Reviews, social signals
6. `aiVisibility.service.js` → GPT-4o brand mention check
7. `ruleScoring.service.js` → aggregate signals → category scores → final score
8. Save to SQLite → redirect to result page

### Score categories
| Category | Weight | Key signals |
|---|---|---|
| businessUnderstanding | 25% | Schema (Organization/LocalBusiness), direct answer positioning, article+author |
| onlinePresence | 30% | Google Maps, reviews, social media, website quality |
| marketAuthority | 25% | External mentions, backlinks, industry signals |
| trustAuthority | 15% | SSL, privacy policy, contact info, reviews count |
| discoverability | 5% | Sitemap, robots.txt, canonical, noindex check |

### GEO signals implemented
- `hasNoindex` — penalty -15 homepage, -5 other pages
- `hasCanonical` — +3 pts discoverability
- `hasDirectAnswerPositioning` — first paragraph 20-150 words → +5 pts business
- `hasBreadcrumbSchema` — JSON-LD BreadcrumbList → +2 pts
- `hasArticleWithAuthor` — Article + author field → +3 pts business
- `hasDateModifiedSchema` — dateModified present → +2 pts
- `sitemapHasLastmod` — sitemap `<lastmod>` → +2 pts

### Score caps
Dynamic caps applied based on missing signals — e.g., max 40 if no concrete external evidence.

### Database
SQLite tables: `analyses`, `leads`
- `findRecentAnalysis(domain)` — checks for result within 24h
- `findAnalysisById(id)` — loads result page
- `findScoreHistory(domain)` — score trend over time
- Migration: `npm run migrate`

---

## Contact Form

`POST /api/contact` — validates name + email, honeypot check (`website_confirm` field must be empty), sends formatted Telegram notification.

Form at `/contact` submits via `fetch()` with inline success/error feedback — no page reload.

---

## Analiza-AI Pages — Special CSS Setup

These pages do NOT use `BaseLayout.astro` and do NOT load `main.css`.
They load their own stylesheets in `<head>`:
```html
<link rel="stylesheet" href="/fonts/fonts.css">
<style>:root{ --font-sans: ...; --font-mono: ...; [full type scale vars] }</style>
<link rel="stylesheet" href="/analiza-ai/css/app.css">
```

`/analiza-ai/css/app.css` is a pre-compiled Tailwind stylesheet from the codex project.
It uses hardcoded `Inter` and `JetBrains Mono` font names (not CSS vars).
The inline `<style>` block defines all CSS vars so any Astro-side Tailwind CSS works.

---

## Environment Variables

Required in `.env`:
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
OPENAI_API_KEY=
SQLITE_DB_PATH=./data/app.sqlite
```

---

## Key Components

| Component | File | Notes |
|---|---|---|
| NavHeader | `src/components/Header.astro` | Floating pill, glassmorphism, scroll blur |
| Footer | `src/components/Footer.astro` | |
| LucideIcon | `src/components/LucideIcon.astro` | Extended with: Wifi, Battery, Activity, Users, ShoppingBag, MousePointer, Bell |
| Hero | `src/components/ui/Hero.astro` | Marketing homepage hero |
| ProcessSteps | `src/components/ui/ProcessSteps.astro` | Rewritten as process-v2, numbered 01-04, horizontal desktop |
| PricingCombo | `src/components/ui/PricingCombo.astro` | Lime theme pricing bundle |

---

## NPM Cache

npm cache is at `E:\npm-cache` (moved off C: drive).
C: drive has limited free space (~3.6 GB as of 2026-05-31) — keep build artifacts on E:.

---

## What Remains

- [ ] Complete `/servicii/construire-website` — ~60% remaining
- [ ] Complete `/servicii/recenzii-online` — ~50% remaining
- [ ] Complete `/servicii/chatbot-ai` — ~50% remaining
- [ ] Complete `/servicii/optimizare-ai` — ~70% remaining
- [ ] `/intrebari-frecvente` — add real FAQ content (currently 3 placeholders)
- [ ] `/despre-noi` — verify post-redesign
- [ ] Phone number + WhatsApp link (user needs to confirm number)
- [ ] Social media links (user needs to create profiles)
- [ ] Cross-browser test post typography-scale refactor
