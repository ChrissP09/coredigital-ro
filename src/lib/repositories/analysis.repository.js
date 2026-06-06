import database from '../config/database.js';

function toJson(value) {
  return JSON.stringify(value || null);
}

async function createAnalysis(payload) {
  const result = await database.run(
    `INSERT INTO analyses (
      website_url, normalized_domain, robots_found, sitemap_found, sitemap_url,
      pages_analyzed, analyzed_pages_json, final_score, discoverability_score,
      business_understanding_score, trust_authority_score, online_presence_score,
      market_authority_score, strengths_json, weaknesses_json, recommendations_json, signals_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.websiteUrl, payload.normalizedDomain,
      payload.robotsFound ? 1 : 0, payload.sitemapFound ? 1 : 0, payload.sitemapUrl || null,
      payload.pagesAnalyzed, toJson(payload.analyzedPages), payload.finalScore,
      payload.categoryScores.discoverability, payload.categoryScores.businessUnderstanding,
      payload.categoryScores.trustAuthority, payload.categoryScores.onlinePresence,
      payload.signals?.marketAuthorityScore || 0,
      toJson(payload.strengths), toJson(payload.weaknesses),
      toJson(payload.recommendations), toJson(payload.signals)
    ]
  );
  return result.id;
}

async function findAnalysisById(id) {
  const row = await database.get('SELECT * FROM analyses WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    websiteUrl: row.website_url,
    normalizedDomain: row.normalized_domain,
    robotsFound: Boolean(row.robots_found),
    sitemapFound: Boolean(row.sitemap_found),
    sitemapUrl: row.sitemap_url,
    pagesAnalyzed: row.pages_analyzed,
    analyzedPages: JSON.parse(row.analyzed_pages_json),
    finalScore: row.final_score,
    categoryScores: {
      discoverability: row.discoverability_score,
      businessUnderstanding: row.business_understanding_score,
      trustAuthority: row.trust_authority_score,
      onlinePresence: row.online_presence_score,
      marketAuthority: row.market_authority_score || 0
    },
    strengths: JSON.parse(row.strengths_json),
    weaknesses: JSON.parse(row.weaknesses_json),
    recommendations: JSON.parse(row.recommendations_json),
    signals: JSON.parse(row.signals_json),
    createdAt: row.created_at
  };
}

async function findScoreHistory(normalizedDomain) {
  const rows = await database.all(
    'SELECT id, final_score, created_at FROM analyses WHERE normalized_domain = ? ORDER BY created_at ASC',
    [normalizedDomain]
  );
  return rows.map(r => ({ id: r.id, score: r.final_score, date: r.created_at }));
}

async function findRecentAnalysis(normalizedDomain) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = await database.get(
    'SELECT id FROM analyses WHERE normalized_domain = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1',
    [normalizedDomain, cutoff]
  );
  return row ? row.id : null;
}

export { createAnalysis, findAnalysisById, findScoreHistory, findRecentAnalysis };
