// ─── HTML helpers ────────────────────────────────────────────────────────────

function htmlToText(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Extract { url, snippet } pairs from DuckDuckGo HTML results
function extractDuckDuckGoResults(html = "") {
  const results = [];
  const urlRe = /class="result__url"[^>]*>\s*([^<\s]+)/g;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const urls = [], snippets = [];
  let m;
  while ((m = urlRe.exec(html)) !== null) urls.push(m[1].trim());
  while ((m = snippetRe.exec(html)) !== null) snippets.push(htmlToText(m[1]));
  const count = Math.min(urls.length, snippets.length);
  for (let i = 0; i < count; i++) results.push({ url: urls[i], snippet: snippets[i] });
  return results;
}

// Kept for backward compat with snippetTexts fallback
function extractDuckDuckGoSnippets(html = "") {
  return extractDuckDuckGoResults(html).map((r) => r.snippet).filter(Boolean);
}

const KNOWN_AGGREGATORS = /yably\.ro|map24\.ro|cylex\.|firmeinromania|listafirme|firme\.info|paginiaurii|afaceri\.ro|bizoo\.ro/i;

// ─── Rating extraction ───────────────────────────────────────────────────────

function extractRatingFromText(text) {
  if (!text) return { ratingValue: null, reviewCount: null };

  const plain = typeof text === "string" && text.includes("<") ? htmlToText(text) : text;
  let ratingValue = null;
  let reviewCount = null;

  const ratingPatterns = [
    /\b([1-5](?:[.,]\d{1,2}))\s*(?:\/\s*5|din\s*5|stele|stars?|★|out\s*of\s*5)/i,
    /(?:rating|evaluare|scor|nota|notă|rated|evaluat)[:\s]+([1-5](?:[.,]\d{1,2}))/i,
    /([1-5][.,]\d{1,2})\s*(?:rating|stele|stars?|★)/i,
    /\b([1-5][.,]\d)\s*·\s*\d/,
    /\b([1-5][.,]\d)\s*\/\s*5\b/
  ];

  for (const pattern of ratingPatterns) {
    const m = plain.match(pattern);
    if (m) {
      const v = parseFloat(m[1].replace(",", "."));
      if (v >= 1 && v <= 5) { ratingValue = v; break; }
    }
  }

  const countPatterns = [
    /(\d{1,6})\s*(?:recenzii|reviews?|evaluări|evaluari|ratings?|voturi|votes?|opinii|avis)/i,
    /(?:recenzii|reviews?|evaluări|ratings?)[:\s(]+(\d{1,6})/i,
    /based\s+on\s+(\d{1,6})/i
  ];

  for (const pattern of countPatterns) {
    const m = plain.match(pattern);
    if (m) {
      const c = parseInt(m[1], 10);
      if (c > 0 && c < 10000000) { reviewCount = c; break; }
    }
  }

  return { ratingValue, reviewCount };
}

function extractJsonLdRating(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const rating =
          item?.aggregateRating ||
          item?.about?.aggregateRating ||
          item?.mainEntity?.aggregateRating;
        if (rating?.ratingValue) {
          return {
            ratingValue: parseFloat(String(rating.ratingValue).replace(",", ".")),
            reviewCount: parseInt(rating.reviewCount || rating.ratingCount || 0, 10) || null
          };
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const defaultHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "accept-language": "ro-RO,ro;q=0.9,en;q=0.8"
};

async function fetchHtml(url, ms = 5000) {
  try {
    const res = await fetchWithTimeout(url, { headers: defaultHeaders }, ms);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query, ms = 4000) {
  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "user-agent": "AIVisibilityGrader/1.0", accept: "text/html,*/*;q=0.8" } },
      ms
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Platform fetchers ───────────────────────────────────────────────────────

// Generic: fetch a URL and extract rating from JSON-LD or meta/text patterns
async function fetchRatingFromUrl(url, source) {
  if (!url) return null;
  const html = await fetchHtml(url);
  if (!html) return null;

  const jsonLd = extractJsonLdRating(html);
  if (jsonLd?.ratingValue) return { source, ...jsonLd, url };

  // Try meta description (sometimes contains "4.5 stele · 127 recenzii")
  const metaDesc = html.match(/content="([^"]{10,200})"/gi) || [];
  for (const meta of metaDesc) {
    const content = meta.replace(/content=["']/i, "").replace(/["']$/, "");
    const extracted = extractRatingFromText(content);
    if (extracted.ratingValue) return { source, ...extracted, url };
  }
  return null;
}

async function fetchTrustpilotData(domain) {
  const cleanDomain = domain.replace(/^www\./, "");
  return fetchRatingFromUrl(`https://www.trustpilot.com/review/${cleanDomain}`, "trustpilot");
}

// Search DuckDuckGo results — skip known aggregators, prefer authoritative sources
async function searchRatingFromDDG(query) {
  const html = await searchDuckDuckGo(query);
  if (!html) return null;

  const results = extractDuckDuckGoResults(html);

  // First pass: prefer Google Maps results
  for (const { url, snippet } of results) {
    if (/google\.com\/maps|maps\.google\.|g\.page/i.test(url)) {
      const extracted = extractRatingFromText(snippet);
      if (extracted.ratingValue) return { source: "google_maps", ...extracted, url };
    }
  }

  // Second pass: non-aggregator sources (Tripadvisor, Booking, Facebook etc.)
  for (const { url, snippet } of results) {
    if (KNOWN_AGGREGATORS.test(url)) continue;
    const extracted = extractRatingFromText(snippet);
    if (extracted.ratingValue) {
      const source = /tripadvisor\./i.test(url) ? "tripadvisor"
        : /facebook\.com/i.test(url) ? "facebook"
        : /booking\.com/i.test(url) ? "booking"
        : /trustpilot\./i.test(url) ? "trustpilot"
        : null;
      if (source) return { source, ...extracted, url };
    }
  }

  return null;
}

// Proactively search Tripadvisor for the business
async function searchTripadvisor(brandName, city) {
  // Try the TypeAhead JSON API first — fast, returns structured data
  try {
    const query = `${brandName}${city ? " " + city : ""}`;
    const taUrl = `https://www.tripadvisor.com/TypeAheadJson?query=${encodeURIComponent(query)}&max=3&lang=ro&searchNearby=false`;
    const res = await fetchWithTimeout(taUrl, { headers: defaultHeaders }, 4000);
    if (res.ok) {
      const data = await res.json();
      const results = data?.results || [];
      for (const r of results) {
        const ratingValue = r?.rating ? parseFloat(r.rating) : null;
        const reviewCount = r?.ratingCount || r?.reviewCount || null;
        if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
          const detailUrl = r?.url ? `https://www.tripadvisor.com${r.url}` : null;
          return { source: "tripadvisor", ratingValue, reviewCount, url: detailUrl };
        }
      }
    }
  } catch { /* fallthrough */ }

  // Fallback: search DuckDuckGo for "{brand} site:tripadvisor.com", get URL, fetch it
  const ddgHtml = await searchDuckDuckGo(`${brandName}${city ? " " + city : ""} site:tripadvisor.com`);
  if (!ddgHtml) return null;

  const urlMatch = ddgHtml.match(/https?:\/\/(?:www\.)?tripadvisor\.[a-z]+\/(?:Restaurant|Hotel|Attraction|ShowUserReviews)[^\s"'<>]+/i);
  if (!urlMatch) return null;

  return fetchRatingFromUrl(urlMatch[0], "tripadvisor");
}

// Search for the business on Google Maps via DuckDuckGo
async function searchGoogleMaps(brandName, city) {
  const ddgHtml = await searchDuckDuckGo(`${brandName}${city ? " " + city : ""} google maps recenzii`);
  if (!ddgHtml) return null;

  const results = extractDuckDuckGoResults(ddgHtml);
  for (const { url, snippet } of results) {
    if (/google\.com\/maps|maps\.google\.|g\.page/i.test(url)) {
      const extracted = extractRatingFromText(snippet);
      if (extracted.ratingValue) return { source: "google_maps", ...extracted, url };
    }
  }
  return null;
}

// ─── Source metadata ─────────────────────────────────────────────────────────

function detectReviewSource(url) {
  const lower = url.toLowerCase();
  if (lower.includes("tripadvisor.")) return "tripadvisor";
  if (lower.includes("booking.com")) return "booking";
  if (lower.includes("trustpilot.")) return "trustpilot";
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "facebook";
  if (lower.includes("emag.ro")) return "emag";
  if (lower.includes("google.com/maps") || lower.includes("maps.google") || lower.includes("g.page")) return "google_maps";
  return "external";
}

const SOURCE_LABELS = {
  google_maps: "Google Maps",
  google_search: "Google (snippet)",
  trustpilot: "Trustpilot",
  tripadvisor: "Tripadvisor",
  booking: "Booking.com",
  facebook: "Facebook",
  emag: "eMAG",
  external: "surse externe",
  search_snippet: "surse web"
};

function getSourceLabel(source) {
  return SOURCE_LABELS[source] || source || "surse externe";
}

// ─── Main entry point ────────────────────────────────────────────────────────

async function fetchLiveReviewData({
  domain,
  brandName,
  city,
  authorityUrls = [],
  socialProfileUrls = [],
  snippetTexts = []
}) {
  // URLs already detected on the website (Tripadvisor page, Booking page, Facebook page etc.)
  const knownReviewUrls = [
    ...authorityUrls.filter((u) => /tripadvisor\.|booking\.com|trustpilot\.|emag\.ro|facebook\.com/i.test(u)),
    ...socialProfileUrls.filter((u) => /facebook\.com\//i.test(u)).slice(0, 1)
  ].slice(0, 3);

  // Run all in parallel
  const [
    trustpilotResult,
    googleMapsResult,
    tripadvisorResult,
    ...knownResults
  ] = await Promise.all([
    fetchTrustpilotData(domain),
    searchGoogleMaps(brandName, city),
    searchTripadvisor(brandName, city),
    ...knownReviewUrls.map((u) => fetchRatingFromUrl(u, detectReviewSource(u)))
  ]);

  // Also search DDG for non-aggregator sources (Booking, Facebook etc. in snippets)
  const ddgResult = await searchRatingFromDDG(`${brandName}${city ? " " + city : ""} recenzii`);

  // Priority: Google Maps DDG > known platform URLs > Tripadvisor > Trustpilot > DDG snippet
  const candidates = [
    googleMapsResult && { ...googleMapsResult, confidence: "high" },
    ...knownResults.map((r) => r && { ...r, confidence: "high" }),
    tripadvisorResult && { ...tripadvisorResult, confidence: "medium" },
    trustpilotResult && { ...trustpilotResult, confidence: "medium" },
    ddgResult && { ...ddgResult, confidence: "medium" }
  ].filter(Boolean);

  const found = candidates.find((c) => c?.ratingValue);
  if (found) return found;

  // Last resort: already-fetched DuckDuckGo discovery snippets
  for (const text of snippetTexts) {
    const snippets = extractDuckDuckGoSnippets(text);
    for (const snippet of snippets) {
      const extracted = extractRatingFromText(snippet);
      if (extracted.ratingValue) {
        return { source: "search_snippet", ...extracted, confidence: "low" };
      }
    }
  }

  return null;
}

export { fetchLiveReviewData, extractRatingFromText, getSourceLabel };
