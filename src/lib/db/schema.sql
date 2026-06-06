CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  website_url TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,

  robots_found INTEGER NOT NULL DEFAULT 0,
  sitemap_found INTEGER NOT NULL DEFAULT 0,
  sitemap_url TEXT,

  pages_analyzed INTEGER NOT NULL DEFAULT 0,
  analyzed_pages_json TEXT NOT NULL,

  final_score INTEGER NOT NULL,
  discoverability_score INTEGER NOT NULL,
  business_understanding_score INTEGER NOT NULL,
  trust_authority_score INTEGER NOT NULL,
  online_presence_score INTEGER NOT NULL,
  market_authority_score INTEGER NOT NULL DEFAULT 0,

  strengths_json TEXT NOT NULL,
  weaknesses_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,

  signals_json TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_domain
ON analyses(normalized_domain);

CREATE INDEX IF NOT EXISTS idx_analyses_created_at
ON analyses(created_at);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER,
  domain TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
ON leads(created_at);
