# CoreDigital — Project Status

**Branch:** `aethel-redesign-clean` → merges into `main`
**Last updated:** 2026-06-09

---

## Pages

### ✅ Complete
| Page | Route | Notes |
|---|---|---|
| Homepage | `/` | Aethel redesign — interactive hero dashboard, animated star canvas |
| Pricing | `/preturi` | Lime theme, PricingCombo component |
| Contact | `/contact` | Telegram backend wired, honeypot + Turnstile CAPTCHA |
| AI Grader landing | `/analiza-ai` | SSR, full scoring pipeline |
| AI Grader result | `/analiza-ai/rezultat/[id]` | SSR, score breakdown |

### ⚠️ Incomplete
| Page | Route | Progress | Remaining |
|---|---|---|---|
| Construire website | `/servicii/construire-website` | ~40% | Features, process, pricing CTA |
| Recenzii online | `/servicii/recenzii-online` | ~50% | Social proof, case studies |
| AI Chatbot | `/servicii/chatbot-ai` | ~50% | Demo section, integrations |
| Optimizare AI | `/servicii/optimizare-ai` | ~30% | Almost everything |
| Întrebări frecvente | `/intrebari-frecvente` | ~10% | Only 3 placeholder questions |
| Despre noi | `/despre-noi` | ~60% | Needs review post-redesign |

---

## Homepage Hero — Interactive Dashboard

Built this session. Features:

- **5-tab sidebar dashboard mockup** — Prezentare generală, Website, Google Business, Recenzii, AI Chatbot
- **Animated star canvas** — ~22% grid density, twinkling at random rates with `shadowBlur` glow, symmetric dark vignette on both sides, exclusion zone around copy text
- **Service pills** — glassmorphism, 4 service categories below dashboard
- **Coverage map** — 5×3 grid of city position circles on Google Business tab, center pulses with `covCellPulse` keyframe
- **SVG sparklines + line chart** — animated stroke-dashoffset on first view (IntersectionObserver)
- **Count-up animations** — numbers animate in on tab switch
- **Touch swipe + keyboard nav** — left/right arrow keys switch tabs

### New files
- `src/styles/components/hero-dashboard.css` — all dashboard component styles
- Star canvas JS — inline `<script>` in `src/pages/index.astro`

---

## Design System — Aethel

- **Colors:** bg `hsl(217 14% 11%)`, lime `#A3E635`, sky `#38BDF8`
- **Typography scale:** `--text-display/h1/h2/h3/h4` + `--fw-*` + `--lh-*` + `--ls-*` in `tokens.css`
- **Fonts:** locally hosted WOFF2 — Inter variable + JetBrains Mono variable (Google Fonts removed)
- **CSS architecture:** `main.css` imports all layers; BEM components via `@layer components`

---

## Integrations

| Integration | Status |
|---|---|
| Telegram contact form | ✅ Live — `POST /api/contact` |
| Cloudflare Turnstile CAPTCHA | ✅ Wired |
| SQLite (analyses + leads) | ✅ Live |
| OpenAI GPT-4o (AI grader) | ✅ Live |
| Local fonts (WOFF2) | ✅ Google Fonts fully removed |

---

## Pending (user action needed)

- [ ] Phone number + WhatsApp link — user to confirm number
- [ ] Social media profiles — user to create and provide links
- [ ] Real FAQ content — currently 3 placeholders
- [ ] Cross-browser test after typography scale refactor

---

## Components Modified This Branch

| Component | File |
|---|---|
| NavHeader | `src/components/Header.astro` |
| Footer | `src/components/Footer.astro` |
| LucideIcon | `src/components/ui/LucideIcon.astro` — added: Wifi, Battery, Activity, Users, ShoppingBag, MousePointer, Bell, RefreshCw, User, Calendar |
| Hero | `src/components/ui/Hero.astro` |
| ProcessSteps | `src/components/ui/ProcessSteps.astro` — rewritten as process-v2 |
| PricingCombo | `src/components/ui/PricingCombo.astro` |
