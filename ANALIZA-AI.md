# Analiza AI — Documentație tehnică

Modul de scoring AI integrat în proiectul Astro al CoreDigital. Accesibil la `/analiza-ai`.

---

## Structura fișierelor

```
src/
├── pages/
│   ├── analiza-ai/
│   │   ├── index.astro              # Homepage scoring (SSR)
│   │   └── rezultat/[id].astro      # Pagina de rezultat (SSR)
│   └── api/
│       ├── scor.ts                  # POST — rulează analiza, redirect la rezultat
│       ├── lead.ts                  # POST — salvează lead, trimite Telegram
│       └── custom-search.ts         # POST — testează cuvinte cheie în AI Search
│
└── lib/
    ├── config/
    │   ├── env.js                   # Variabile de mediu (citit din .env)
    │   └── database.js              # Conexiune SQLite (sqlite3)
    ├── db/
    │   ├── schema.sql               # Schema tabelelor (analyses + leads)
    │   └── migrate.js               # Script de migrare (rulat manual)
    ├── repositories/
    │   └── analysis.repository.js   # CRUD analyses: create, findById, history, recent
    ├── services/
    │   ├── ruleScoring.service.js   # Orchestrator principal — analyzeWebsite()
    │   ├── robots.service.js        # Fetch robots.txt
    │   ├── sitemap.service.js       # Parse sitemap XML
    │   ├── pageFetch.service.js     # HTTP fetch pagini cu timeout
    │   ├── contentExtract.service.js# Extrage text, titlu, meta din HTML
    │   ├── pageDiscovery.service.js # Crawl și clasificare pagini
    │   ├── schemaDetection.service.js # JSON-LD / Schema.org detection
    │   ├── scoreBreakdown.service.js# Calcul scoruri per categorie
    │   ├── aiReadinessFiles.service.js # llms.txt, ai.txt detection
    │   ├── liveReviews.service.js   # Google reviews via SerpAPI
    │   ├── aiVisibility.service.js  # Testare brand în AI Search (OpenAI)
    │   └── externalPresence.service.js # GMB, social, directoare
    └── utils/
        ├── url.js                   # normalizeWebsiteUrl, getDomain
        ├── text.js                  # cleanText, truncate
        ├── scoring.js               # clamp, roundScore, scoreRatio
        └── telegram.js              # sendTelegramMessage

public/analiza-ai/
├── css/app.css                      # Tailwind compilat din proiectul Express
├── js/app.js                        # JS client: form submit, loading overlay
└── assets/
    ├── core-digital-logo.svg
    ├── ai-map-transparent.webp
    ├── monitorizare-ai.webp
    ├── gow-icon.webp
    ├── target-icon.webp
    ├── shield.webp
    └── Favicon circle dark.png
```

---

## Flow complet

```
User → /analiza-ai (index.astro)
  └─ POST /api/scor
       ├─ honeypot check
       ├─ cache check (24h per domeniu)
       ├─ analyzeWebsite(url) → toate serviciile
       ├─ createAnalysis(result) → INSERT în SQLite
       └─ redirect /analiza-ai/rezultat/{id}
            ├─ findAnalysisById(id)
            ├─ findScoreHistory(domain)
            └─ render pagina de rezultat

User → "Vreau raportul complet" (lead gate)
  └─ POST /api/lead
       ├─ INSERT leads
       ├─ Telegram notification
       └─ { ok: true } → deblochează findings în browser

User → "Testează cuvinte cheie"
  └─ POST /api/custom-search
       ├─ INSERT leads (email)
       ├─ Telegram notification
       ├─ checkBrandInAiResponse(q1), checkBrandInAiResponse(q2)
       └─ { results: [...] }
```

---

## Scorul — categorii și ponderi

| Categorie | Pondere | Ce măsoară |
|---|---|---|
| Claritatea Ofertei | 25% | Servicii, locație, public țintă explicite pe site |
| Prezența Online | 30% | GMB, rețele sociale, directoare, recenzii |
| Reputație Online | 25% | Mențiuni externe independente |
| Credibilitatea Afacerii | 15% | Telefon, adresă, pagina Despre noi, legal |
| Accesibilitate Tehnică | 5% | robots.txt, sitemap, lizibilitate crawler |

Scorul final: 0–100. Potențial score = ce se poate atinge dacă se remediază issues-urile detectate.

---

## Baza de date SQLite

**Tabel `analyses`** — o înregistrare per analiză:
- `website_url`, `normalized_domain`
- `pages_analyzed`, `analyzed_pages_json`
- `final_score`, `discoverability_score`, `business_understanding_score`, `trust_authority_score`, `online_presence_score`, `market_authority_score`
- `strengths_json`, `weaknesses_json`, `recommendations_json`, `signals_json`
- `created_at`

**Tabel `leads`** — un rând per lead:
- `analysis_id`, `domain`, `name`, `phone`, `email`, `role`
- `created_at`

---

## Variabile de mediu necesare

Copiază `.env.example` în `.env` și completează:

| Variabilă | Obligatorie | Descriere |
|---|---|---|
| `OPENAI_API_KEY` | Da | GPT-4o pentru AI visibility testing |
| `TURNSTILE_SITE_KEY` | Recomandat | Cloudflare Turnstile — site key |
| `TURNSTILE_SECRET_KEY` | Recomandat | Cloudflare Turnstile — secret key |
| `TELEGRAM_BOT_TOKEN` | Opțional | Notificări lead-uri noi |
| `TELEGRAM_CHAT_ID` | Opțional | ID chat Telegram pentru notificări |
| `ADMIN_PASS` | Da | Schimbă din default |
| `SQLITE_DB_PATH` | Nu | Default: `./data/app.sqlite` |
| `MAX_PAGES_TO_ANALYZE` | Nu | Default: 25 |
| `REQUEST_TIMEOUT_MS` | Nu | Default: 12000 |

---

## Comenzi

```bash
# Instalare dependențe
npm install

# Migrare bază de date (prima oară și la update de schemă)
npm run migrate

# Server de dezvoltare
npm run dev          # http://localhost:4321

# Build producție
npm run build

# Pornire server în producție (după build)
npm run start        # rulează dist/server/entry.mjs
```

---

## Deploy pe Hostinger (Node.js hosting)

1. `npm run build` local
2. Urcă pe server: `dist/`, `public/`, `package.json`, `.env`
3. Pe server: `npm install --omit=dev && npm run migrate`
4. Setează entry point în Hostinger panel: `dist/server/entry.mjs`
5. Variabile de mediu setate din panelul Hostinger sau `.env` pe server

**Notă:** `data/` (SQLite) se creează automat la primul start. Nu urca în git.

---

## Cloudflare Turnstile

- Widgetul e invizibil (`data-appearance="interaction-only"`, `data-execution="execute"`)
- Se apelează `turnstile.execute()` explicit înainte de fiecare submit
- Pe `localhost` verificarea e sărită automat (middleware bypass)
- Dacă `TURNSTILE_SITE_KEY` lipsește din `.env`, widget-ul nu se randează

---

## Ce mai poate fi adăugat

- [ ] Pagină admin (`/analiza-ai/admin`) — lista analizelor și lead-urilor
- [ ] Rate limiting per IP pentru `/api/scor`
- [ ] Export CSV leads
- [ ] Email automat la lead nou (SendGrid / Resend)
- [ ] Reanaliza automată săptămânală per domeniu
