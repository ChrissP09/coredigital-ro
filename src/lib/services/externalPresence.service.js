import { getDomain } from "../utils/url.js";
import { roundScore, clamp } from "../utils/scoring.js";
import { unique } from "../utils/text.js";
import { checkUrlAccessible } from "./pageFetch.service.js";
import { fetchLiveReviewData, getSourceLabel } from "./liveReviews.service.js";
import { evaluateAiVisibility } from "./aiVisibility.service.js";
import env from "../config/env.js";

const socialPlatforms = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"]
};

const authorityPlatforms = {
  trustpilot: ["trustpilot."],
  clutch: ["clutch.co"],
  booking: ["booking.com"],
  tripadvisor: ["tripadvisor."],
  emag: ["emag.ro", "marketplace.emag.ro"],
  olx: ["olx.ro"],
  storia: ["storia.ro"],
  autovit: ["autovit.ro"],
  listafirme: ["listafirme.ro"],
  termene: ["termene.ro"],
  risco: ["risco.ro"],
  confidas: ["confidas.ro"],
  cylex: ["cylex.ro"],
  paginiaurii: ["paginiaurii.ro"],
  firmeInfo: ["firme.info"],
  compari: ["compari.ro"],
  ceccar: ["ceccar.ro"],
  cafr: ["cafr.ro"],
  anevar: ["anevar.ro"],
  unpir: ["unpir.ro"]
};

const newsDomains = [
  "hotnews.ro",
  "startupcafe.ro",
  "wall-street.ro",
  "zf.ro",
  "profit.ro",
  "forbes.ro",
  "businessmagazin.ro",
  "republica.ro",
  "iqads.ro",
  "paginademedia.ro"
];

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getBrandTokens(brandName, domain) {
  const domainName = String(domain || "").split(".")[0];
  const tokens = normalizeText(`${brandName || ""} ${domainName}`)
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !["www", "com", "net", "org", "online", "servicii", "contact", "firma", "site", "example", "domain", "test", "demo", "home"].includes(token));

  return unique(tokens).slice(0, 6);
}

const GENERIC_BRAND_WORDS = new Set([
  "servicii", "service", "solutii", "soluții", "produse", "products",
  "online", "digital", "software", "platforma", "platformă", "sistem",
  "contabilitate", "accounting", "consultanta", "consultanță", "management",
  "agentie", "agenție", "agency", "firma", "companie", "company",
  "transport", "constructii", "construcții", "imobiliare", "medical",
  "clinica", "clinică", "cabinet", "restaurant", "hotel", "magazin", "shop"
]);

function isBrandLike(text, domain) {
  if (!text) return false;
  const words = text.trim().split(/\s+/);
  const domainRoot = String(domain || "").split(".")[0].toLowerCase();
  const lower = text.toLowerCase();
  // Prefer if it matches domain root
  if (lower.includes(domainRoot) && domainRoot.length >= 3) return true;
  // Prefer if short (1-3 words) and not all generic
  const genericCount = words.filter((w) => GENERIC_BRAND_WORDS.has(w.toLowerCase())).length;
  return words.length <= 3 && genericCount < words.length;
}

function extractBrandName(pages, domain) {
  const homepage = pages[0];
  const domainRoot = String(domain || "").split(".")[0];
  const candidates = [
    homepage?.schema?.names?.[0],
    homepage?.title,
    homepage?.h1,
    domain
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parts = String(candidate)
      .split(/\s[|–—\-]\s|✔|·/)
      .map((p) => p.trim())
      .filter(Boolean);

    // Prefer the part that looks like a brand (matches domain or is short & non-generic)
    const brandPart = parts.find((p) => isBrandLike(p, domain));
    if (brandPart) return brandPart;
  }

  // Fallback: use domain root (e.g. "keez" from "keez.ro")
  return domainRoot || domain;
}

// Extract the business name embedded in a Google Maps embed URL (!2sNAME pattern)
function extractNameFromMapsEmbed(mapsUrl) {
  if (!mapsUrl) return null;
  try {
    const decoded = decodeURIComponent(mapsUrl);
    // After the CID (!1s...), the next !2s is the business name
    const m = decoded.match(/!1s[^!]+!2s([^!]+)/);
    if (m && m[1] && m[1].length > 1) {
      return m[1].trim();
    }
  } catch { /* ignore */ }
  return null;
}

// Infer city from Maps embed coordinates (covers major Romanian cities)
function inferCityFromCoords(lat, lng) {
  const cities = [
    { name: "bucuresti", lat: 44.43, lng: 26.10, r: 0.3 },
    { name: "cluj",      lat: 46.77, lng: 23.59, r: 0.2 },
    { name: "timisoara", lat: 45.75, lng: 21.23, r: 0.2 },
    { name: "iasi",      lat: 47.16, lng: 27.59, r: 0.2 },
    { name: "brasov",    lat: 45.65, lng: 25.61, r: 0.2 },
    { name: "constanta", lat: 44.18, lng: 28.65, r: 0.2 },
    { name: "sibiu",     lat: 45.80, lng: 24.15, r: 0.15 },
    { name: "oradea",    lat: 47.07, lng: 21.92, r: 0.15 },
    { name: "craiova",   lat: 44.32, lng: 23.80, r: 0.15 },
    { name: "galati",    lat: 45.44, lng: 28.05, r: 0.15 }
  ];
  for (const city of cities) {
    if (Math.abs(lat - city.lat) < city.r && Math.abs(lng - city.lng) < city.r) return city.name;
  }
  return "";
}

function inferCityFromMapsEmbed(mapsUrls = []) {
  for (const url of mapsUrls) {
    try {
      const decoded = decodeURIComponent(url);
      const latM = decoded.match(/!3d([-\d.]+)/);
      const lngM = decoded.match(/!2d([-\d.]+)/);
      if (latM && lngM) {
        const city = inferCityFromCoords(parseFloat(latM[1]), parseFloat(lngM[1]));
        if (city) return city;
      }
    } catch { /* ignore */ }
  }
  return "";
}

function collectExternalLinks(pages) {
  return unique([
    ...pages.flatMap((page) => page.externalLinks || []),
    ...pages.flatMap((page) => page.schema?.sameAs || [])
  ]);
}

function collectSocialProfiles(links) {
  const profiles = {
    facebook: [],
    instagram: [],
    linkedin: [],
    tiktok: [],
    youtube: []
  };

  links.forEach((link) => {
    const lower = link.toLowerCase();
    Object.entries(socialPlatforms).forEach(([platform, hosts]) => {
      if (hosts.some((host) => lower.includes(host))) {
        profiles[platform].push(link);
      }
    });
  });

  Object.keys(profiles).forEach((key) => {
    profiles[key] = unique(profiles[key]);
  });

  return profiles;
}

function isShareOrUtilitySocialLink(link) {
  const lower = String(link || "").toLowerCase();

  return /\/sharer|sharer\.php|sharearticle|\/share\/|intent\/|\/plugins\/|\/dialog\/|addthis|pinterest\.com\/pin\/create|wa\.me\/\?text=|mailto:|help\.instagram\.com|l\.facebook\.com|lm\.facebook\.com/.test(lower);
}

function getUrlPathParts(link) {
  try {
    const url = new URL(link);
    return url.pathname.split("/").map((part) => part.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function canonicalExternalUrl(link) {
  try {
    const url = new URL(link);
    url.hash = "";
    if (!/sharer|sharearticle|intent/i.test(url.href)) {
      url.search = "";
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return String(link || "").replace(/\/+$/, "").toLowerCase();
  }
}

function uniqueProfileItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = canonicalExternalUrl(item.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifySocialProfileLink(link, platform, brandTokens, domain) {
  const lower = String(link || "").toLowerCase();
  const pathParts = getUrlPathParts(link);
  const brandMatch = profileMatchesBrand(link, brandTokens, domain);
  const item = {
    url: link,
    platform,
    brandMatch,
    type: "unknown",
    quality: 0,
    confidence: "low"
  };

  if (isShareOrUtilitySocialLink(link)) {
    return { ...item, type: "share", quality: 0, confidence: "high" };
  }

  if (platform === "linkedin") {
    if (pathParts[0] === "company" || pathParts[0] === "school" || pathParts[0] === "showcase") {
      return { ...item, type: "official", quality: brandMatch ? 6 : 4, confidence: brandMatch ? "high" : "medium" };
    }
    if (pathParts[0] === "in" || pathParts[0] === "pub") {
      return { ...item, type: "personal", quality: brandMatch ? 2 : 1, confidence: "medium" };
    }
    return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
  }

  if (platform === "facebook") {
    if (pathParts[0] === "business" || pathParts[0] === "help" || pathParts[0] === "login") {
      return { ...item, type: "generic", quality: 0, confidence: "high" };
    }
    if (pathParts[0] === "profile.php") {
      return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
    }
    if (pathParts.length >= 1 && !["pages", "events", "groups", "watch", "marketplace", "login"].includes(pathParts[0])) {
      return brandMatch
        ? { ...item, type: "official", quality: 5, confidence: "high" }
        : { ...item, type: "generic", quality: 1, confidence: "low" };
    }
    return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
  }

  if (platform === "instagram") {
    if (pathParts.length === 1 && !["p", "reel", "explore", "accounts", "about", "developer"].includes(pathParts[0])) {
      return brandMatch
        ? { ...item, type: "official", quality: 5, confidence: "high" }
        : { ...item, type: "generic", quality: 1, confidence: "low" };
    }
    return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
  }

  if (platform === "youtube") {
    if (/youtube\.com\/(@|channel\/|c\/|user\/)/i.test(lower)) {
      return { ...item, type: "official", quality: brandMatch ? 4 : 3, confidence: brandMatch ? "high" : "medium" };
    }
    return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
  }

  if (platform === "tiktok") {
    if (/tiktok\.com\/@/i.test(lower)) {
      return { ...item, type: "official", quality: brandMatch ? 4 : 3, confidence: brandMatch ? "high" : "medium" };
    }
    return { ...item, type: "generic", quality: brandMatch ? 2 : 1, confidence: "low" };
  }

  return { ...item, type: brandMatch ? "official" : "generic", quality: brandMatch ? 3 : 1, confidence: brandMatch ? "medium" : "low" };
}

function classifySocialProfiles(profiles, brandTokens, domain) {
  const details = Object.fromEntries(
    Object.entries(profiles).map(([platform, urls]) => [
      platform,
      uniqueProfileItems(urls.map((url) => classifySocialProfileLink(url, platform, brandTokens, domain)))
    ])
  );
  const officialProfiles = Object.fromEntries(
    Object.entries(details).map(([platform, items]) => [
      platform,
      items.filter((item) => item.type === "official")
    ])
  );
  const weakProfiles = Object.fromEntries(
    Object.entries(details).map(([platform, items]) => [
      platform,
      items.filter((item) => item.type === "generic" || item.type === "personal")
    ])
  );
  const shareLinks = Object.fromEntries(
    Object.entries(details).map(([platform, items]) => [
      platform,
      items.filter((item) => item.type === "share")
    ])
  );

  return {
    details,
    officialProfiles,
    weakProfiles,
    shareLinks,
    officialCount: Object.values(officialProfiles).flat().length,
    officialPlatforms: Object.entries(officialProfiles).filter(([, items]) => items.length > 0).map(([platform]) => platform),
    weakCount: Object.values(weakProfiles).flat().length,
    shareCount: Object.values(shareLinks).flat().length,
    qualityPoints: clamp(Object.values(details).flat().reduce((total, item) => total + item.quality, 0), 0, 25)
  };
}

function collectAuthorityLinks(links) {
  const platforms = {};

  Object.entries(authorityPlatforms).forEach(([platform, hosts]) => {
    platforms[platform] = links.filter((link) => hosts.some((host) => link.toLowerCase().includes(host)));
  });

  return Object.fromEntries(Object.entries(platforms).filter(([, urls]) => urls.length > 0));
}

function getGoogleBusinessIndicators(links, pages) {
  const allText = pages.map((page) => page.textSample || "").join(" ").toLowerCase();
  const mapsLinks = links.filter((link) => /google\.[a-z.]+\/maps|goo\.gl\/maps|g\.page|business\.site/i.test(link));
  const embeds = links.filter((link) => /google\.[a-z.]+\/maps\/embed/i.test(link));
  const reviewMentions =
    /recenzii google|google reviews|review-uri google|evaluari google|evaluări google|\d+\s+(recenzii|review-uri|reviews|evaluari|evaluări)/i.test(allText);

  return {
    hasMapsLink: mapsLinks.length > 0,
    hasGPage: links.some((link) => /g\.page/i.test(link)),
    hasEmbeddedMap: embeds.length > 0,
    hasReviewMentions: reviewMentions,
    mapsLinks: unique([...mapsLinks, ...embeds])
  };
}

function getEnhancedGoogleBusinessIndicators(links, pages) {
  const allText = pages.map((page) => page.textSample || "").join(" ").toLowerCase();
  const mapsLinks = links.filter((link) => /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|business\.site/i.test(link));
  const embeds = links.filter((link) => /google\.[a-z.]+\/maps\/embed|maps\.google\.[a-z.]+\/maps\/embed/i.test(link));
  const sameAsMaps = pages
    .flatMap((page) => page.schema?.sameAs || [])
    .filter((link) => /google\.[a-z.]+\/maps|maps\.google\.|g\.page|business\.site/i.test(link));
  const hasLocalBusinessSchema = pages.some((page) => page.schema?.hasLocalBusiness);
  const hasAggregateRating = pages.some((page) => page.schema?.hasAggregateRating);
  const ratingValues = pages
    .map((page) => page.ratingData?.ratingValue ?? page.schema?.ratingValue)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  const reviewCounts = pages
    .map((page) => page.ratingData?.reviewCount ?? page.schema?.reviewCount)
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  const reviewMentions =
    /recenzii google|google reviews|review-uri google|evaluari google|evaluări google|rating|stele|\d(?:[.,]\d)?\s*(?:\/\s*5|din\s*5)|\d+\s+(recenzii|review-uri|reviews|evaluari|evaluări)/i.test(allText) ||
    hasAggregateRating ||
    ratingValues.length > 0 ||
    reviewCounts.length > 0;

  return {
    hasMapsLink: mapsLinks.length > 0 || sameAsMaps.length > 0,
    hasGPage: links.some((link) => /g\.page/i.test(link)),
    hasEmbeddedMap: embeds.length > 0,
    hasReviewMentions: reviewMentions,
    hasLocalBusinessSchema,
    hasAggregateRating,
    ratingValue: ratingValues.length ? Math.max(...ratingValues) : null,
    reviewCount: reviewCounts.length ? Math.max(...reviewCounts) : null,
    confidence:
      mapsLinks.length > 0 || embeds.length > 0 || sameAsMaps.length > 0
        ? "high"
        : hasLocalBusinessSchema || reviewMentions
          ? "medium"
          : "low",
    mapsLinks: unique([...mapsLinks, ...embeds, ...sameAsMaps])
  };
}

function countSocialPlatforms(profiles) {
  return Object.values(profiles).filter((urls) => urls.length > 0).length;
}

function profileMatchesBrand(link, brandTokens, domain) {
  const normalizedLink = normalizeText(link);
  const domainToken = String(domain || "").split(".")[0].toLowerCase();

  return brandTokens.some((token) => normalizedLink.includes(token)) || normalizedLink.includes(domainToken);
}

async function checkProfiles(profiles) {
  const links = Object.values(profiles)
    .flat()
    .map((item) => (typeof item === "string" ? item : item.url))
    .filter(Boolean)
    .slice(0, 6);

  const results = await Promise.all(
    links.map(async (url) => ({
      url,
      accessible: await checkUrlAccessible(url)
    }))
  );

  return results;
}

async function fetchSearchHtml(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        "user-agent": "AIVisibilityGrader/1.0",
        accept: "text/html,*/*;q=0.8"
      }
    });

    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function extractSearchResultUrls(html = "") {
  const urls = [];
  const hrefPattern = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1].replace(/&amp;/g, "&");

    try {
      if (href.startsWith("http")) {
        urls.push(href);
        continue;
      }

      const absolute = new URL(href, "https://duckduckgo.com");
      const redirected = absolute.searchParams.get("uddg");
      if (redirected) urls.push(decodeURIComponent(redirected));
    } catch {
      // Ignore malformed search-result URLs.
    }
  }

  return unique(urls);
}

function getHost(value = "") {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isIgnoredExternalMention(url, domain) {
  const host = getHost(url);
  const ownDomain = String(domain || "").replace(/^www\./, "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();

  if (!host || host === ownDomain || host.endsWith(`.${ownDomain}`)) return true;
  if (!host.endsWith(".ro") && !lowerUrl.includes(ownDomain)) return true;
  if (/duckduckgo\.com|bing\.com|google\.com|yahoo\.com|wikipedia\.org|schema\.org/.test(host)) return true;
  if (/facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com/.test(host)) return true;
  if (/gstatic\.com|googleusercontent\.com|cloudflare\.com|wordpress\.org|w3\.org/.test(host)) return true;

  return false;
}

function classifySourceFromText(text) {
  const lower = text.toLowerCase();
  const types = new Set();

  if (/facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be/.test(lower)) types.add("social");
  if (/google\.[a-z.]+\/maps|g\.page|business\.site|google business|google reviews|recenzii google/.test(lower)) types.add("maps");
  if (/trustpilot|tripadvisor|booking\.com|google reviews|recenzii google/.test(lower)) types.add("reviews");
  if (Object.values(authorityPlatforms).flat().some((host) => lower.includes(host))) types.add("industry");
  if (newsDomains.some((host) => lower.includes(host))) types.add("news");
  if (/case-study|studiu-de-caz|comunicat/.test(lower)) types.add("partner");
  if (/listafirme|termene\.ro|firme\.info|catalog|director|directory/.test(lower)) types.add("directories");

  return Array.from(types);
}

async function discoverEntityPublicly({ brandName, domain, city, serviceCategory }) {
  const brand = brandName || domain;
  const normalizedBrand = normalizeText(brand);
  const queries = unique([
    brand,
    city ? `${brand} ${city}` : null,
    serviceCategory ? `${brand} ${serviceCategory}` : null,
    `${brand} reviews`,
    `${brand} facebook`,
    `${brand} linkedin`,
    `${brand} instagram`,
    `${brand} google maps`
  ]).slice(0, 8);

  const results = await Promise.all(
    queries.map(async (query) => {
      const html = await fetchSearchHtml(query);
      const normalized = normalizeText(html);
      const domainToken = String(domain || "").replace(/^www\./, "").toLowerCase();
      const brandTokens = getBrandTokens(brandName, domain);
      const normalizedQuery = normalizeText(query);
      const isExactBrandLookup = normalizedQuery === normalizedBrand || normalizedQuery === normalizeText(domain);
      const isPlatformLookup = /\b(reviews?|recenzii|facebook|linkedin|instagram|google maps|maps)\b/i.test(query);
      const hasDomain = html.toLowerCase().includes(domainToken);
      const matchedTokens = brandTokens.filter((token) => normalized.includes(token));
      const hasUsableBrand = brandTokens.length > 0;
      const sourceTypes = hasUsableBrand && (hasDomain || matchedTokens.length > 0) ? classifySourceFromText(html) : [];
      const externalMentions = hasUsableBrand && (hasDomain || matchedTokens.length > 0)
        ? extractSearchResultUrls(html)
            .filter((url) => !isIgnoredExternalMention(url, domain))
            .filter((url) => {
              const normalizedUrl = normalizeText(url);
              return brandTokens.some((token) => normalizedUrl.includes(token)) || normalized.includes(`${normalizeText(getHost(url))} ${matchedTokens[0] || ""}`);
            })
            .slice(0, 8)
        : [];

      return {
        query,
        found: hasUsableBrand && Boolean(html) && (hasDomain || matchedTokens.length > 0),
        hasDomain,
        matchedTokens,
        sourceTypes,
        externalMentions,
        isExactBrandLookup,
        isPlatformLookup,
        hasIndependentEvidence: externalMentions.length > 0 || (hasDomain && sourceTypes.length > 0 && !isExactBrandLookup),
        snippetText: isPlatformLookup && html ? html.slice(0, 30000) : null
      };
    })
  );
  const externalMentions = unique(results.flatMap((result) => result.externalMentions || []));
  const externalMentionDomains = unique(externalMentions.map(getHost).filter(Boolean));
  const concreteResults = results.filter((result) => result.hasIndependentEvidence);
  const snippetTexts = results.map((result) => result.snippetText).filter(Boolean);

  return {
    queries,
    results,
    discovered: results.some((result) => result.found),
    concreteDiscovered: concreteResults.length > 0,
    sourceTypes: unique([
      ...results.flatMap((result) => result.sourceTypes),
      ...(externalMentionDomains.length ? ["external_mentions"] : [])
    ]),
    matchedQueries: results.filter((result) => result.found).length,
    exactBrandMatchedQueries: results.filter((result) => result.found && result.isExactBrandLookup).length,
    platformLookupMatchedQueries: results.filter((result) => result.found && result.isPlatformLookup).length,
    independentMatchedQueries: concreteResults.length,
    externalMentions,
    externalMentionDomains,
    snippetTexts
  };
}

function inferServiceCategory(pages) {
  // Use only titles and H1s — body text often mentions accessories/components
  // that confuse the query generator (e.g. "feronerie" in a window company's product desc)
  const lines = [];
  for (const page of pages.slice(0, 10)) {
    const title = (page.title || "").trim();
    const h1 = (page.h1 || "").trim();
    if (title) lines.push(title);
    if (h1 && h1 !== title) lines.push(h1);
  }
  return lines.join(" | ").substring(0, 500);
}

const CITY_TO_JUDET = {
  bucuresti: "bucuresti", "sector 1": "bucuresti", "sector 2": "bucuresti", "sector 3": "bucuresti",
  cluj: "cluj", "cluj-napoca": "cluj",
  timisoara: "timis",
  iasi: "iasi",
  constanta: "constanta",
  brasov: "brasov",
  sibiu: "sibiu",
  oradea: "bihor",
  craiova: "dolj",
  galati: "galati",
  pitesti: "arges",
  bacau: "bacau",
  arad: "arad",
  ploiesti: "prahova",
  targu: "mures", "targu mures": "mures",
  buzau: "buzau",
  satu: "satu mare", "satu mare": "satu mare",
  baia: "maramures", "baia mare": "maramures",
  ramnicu: "valcea", "ramnicu valcea": "valcea",
  suceava: "suceava",
  botosani: "botosani",
  drobeta: "mehedinti", "drobeta-turnu severin": "mehedinti",
  alexandria: "teleorman",
  giurgiu: "giurgiu",
  slobozia: "ialomita",
  calarasi: "calarasi",
  urziceni: "ialomita",
  tulcea: "tulcea",
  vaslui: "vaslui",
  focsani: "vrancea",
  alba: "alba", "alba iulia": "alba",
  deva: "hunedoara",
  resita: "caras-severin",
  sfantu: "covasna", "sfantu gheorghe": "covasna",
  targoviste: "dambovita",
  zalau: "salaj",
  miercurea: "harghita", "miercurea ciuc": "harghita",
  dej: "cluj", turda: "cluj", campia: "cluj",
};

const KNOWN_CITIES = Object.keys(CITY_TO_JUDET);

function inferLocation(pages, mapsUrls = []) {
  const mapsCity = inferCityFromMapsEmbed(mapsUrls);

  let city = mapsCity || "";

  if (!city) {
    const addressKeywords = /str\.|strada|adresa|sediu|contact|locatie|județ|judet|sector/i;
    for (const page of pages) {
      if (!page.signals?.hasLocationMention && page.pageType !== "location" && page.pageType !== "contact") continue;
      const text = normalizeText(`${page.title} ${page.h1} ${page.textSample}`);
      if (!addressKeywords.test(text)) continue;
      const found = KNOWN_CITIES.find((c) => text.includes(c));
      if (found) { city = found; break; }
    }
  }

  if (!city) {
    const counts = {};
    for (const page of pages) {
      const text = normalizeText(`${page.title || ""} ${page.textSample || ""}`);
      for (const c of KNOWN_CITIES) {
        if (text.includes(c)) counts[c] = (counts[c] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) city = sorted[0][0];
  }

  const judet = city ? (CITY_TO_JUDET[city] || city) : "";
  return { city, judet };
}

function inferCity(pages, mapsUrls = []) {
  return inferLocation(pages, mapsUrls).city;
}

function collectEntitySignals({ pages, domain, brandName, profiles, socialProfileQuality, authorityLinks, googleBusiness }) {
  const phones = unique(pages.flatMap((page) => page.phones || []));
  const emails = unique(pages.flatMap((page) => page.emails || []));
  const hasAddress = pages.some((page) => page.signals.hasAddress);
  const hasLocation = pages.some((page) => page.signals.hasLocationMention);
  const sameAs = unique(pages.flatMap((page) => page.schema?.sameAs || []));
  const brandTokens = getBrandTokens(brandName, domain);
  const profileLinks = Object.values(socialProfileQuality?.officialProfiles || profiles)
    .flat()
    .map((item) => (typeof item === "string" ? item : item.url))
    .filter(Boolean);
  const authorityUrls = Object.values(authorityLinks).flat();
  const brandMatchedProfiles = profileLinks.filter((link) => profileMatchesBrand(link, brandTokens, domain));
  const brandConfidence = brandTokens.length >= 2 || (brandTokens.length === 1 && !/^[a-z]{2,4}$/.test(brandTokens[0]));

  return {
    brandName,
    brandTokens,
    brandConfidence,
    phones,
    emails,
    hasAddress,
    hasLocation,
    sameAs,
    hasSameAs: sameAs.length > 0,
    hasContactIdentity: phones.length > 0 || emails.length > 0,
    hasLocalIdentity: hasAddress || hasLocation || googleBusiness.hasMapsLink,
    brandMatchedProfiles,
    hasDomainConnectedProfiles: profileLinks.length > 0 || sameAs.length > 0,
    externalAuthorityCount: authorityUrls.length
  };
}

function calculateSourceDiversity({ socialProfileQuality, googleBusiness, authorityLinks, discovery }) {
  const sourceTypes = new Set(["website"]);

  if ((socialProfileQuality?.officialPlatforms || []).length > 0) sourceTypes.add("social");
  if (googleBusiness.hasMapsLink || googleBusiness.hasEmbeddedMap || googleBusiness.hasLocalBusinessSchema) sourceTypes.add("maps");
  if (googleBusiness.hasAggregateRating || googleBusiness.reviewCount > 0 || (googleBusiness.hasReviewMentions && (googleBusiness.hasMapsLink || googleBusiness.hasEmbeddedMap))) sourceTypes.add("reviews");
  if (Object.keys(authorityLinks).length > 0) sourceTypes.add("industry");
  if (discovery.sourceTypes.includes("external_mentions")) sourceTypes.add("external_mentions");
  if (discovery.concreteDiscovered) sourceTypes.add("search_discovery");

  return Array.from(sourceTypes);
}

function calculateSubscores({ profiles, socialProfileQuality, profileChecks, googleBusiness, authorityLinks, entitySignals, pages, discovery, sourceTypes }) {
  const socialCount = (socialProfileQuality?.officialPlatforms || []).length || countSocialPlatforms(profiles);
  const accessibleCount = profileChecks.filter((item) => item.accessible).length;
  const brandMatchedCount = entitySignals.brandMatchedProfiles.length;
  const authorityCount = Object.keys(authorityLinks).length;
  const externalMentionCount = (discovery.externalMentionDomains || []).length;
  const confirmedMaps = googleBusiness.hasMapsLink || googleBusiness.hasEmbeddedMap || googleBusiness.hasGPage;
  const hasVerifiedReviews = googleBusiness.hasAggregateRating || googleBusiness.reviewCount > 0 || (confirmedMaps && googleBusiness.hasReviewMentions);
  const concreteExternalSignals = [
    socialCount > 0,
    confirmedMaps,
    authorityCount > 0,
    externalMentionCount > 0,
    hasVerifiedReviews
  ].filter(Boolean).length;

  const entityDiscoveryPoints =
    (entitySignals.brandConfidence ? 4 : 0) +
    (entitySignals.hasContactIdentity ? 4 : 0) +
    (entitySignals.hasDomainConnectedProfiles ? 5 : 0) +
    (discovery.concreteDiscovered ? 6 : discovery.discovered ? 2 : 0) +
    (discovery.independentMatchedQueries >= 3 ? 4 : discovery.independentMatchedQueries >= 1 ? 2 : 0) +
    (externalMentionCount >= 3 ? 3 : externalMentionCount >= 1 ? 1 : 0);

  const sourceDiversityPoints =
    (sourceTypes.length >= 6 ? 25 : sourceTypes.length >= 5 ? 21 : sourceTypes.length >= 4 ? 17 : sourceTypes.length >= 3 ? 12 : sourceTypes.length >= 2 ? 6 : 2);

  const entityConsistencyPoints =
    (entitySignals.brandConfidence ? 6 : 0) +
    (entitySignals.hasDomainConnectedProfiles ? 5 : 0) +
    (entitySignals.hasContactIdentity ? 5 : 0) +
    (entitySignals.hasLocalIdentity ? 4 : 0) +
    (entitySignals.hasSameAs ? 3 : 0) +
    (brandMatchedCount > 0 ? 2 : 0);

  const localBusinessSchema = pages.some((page) => page.schema?.hasLocalBusiness);
  const externalValidationPoints =
    (confirmedMaps ? 6 : 0) +
    (googleBusiness.hasEmbeddedMap ? 3 : 0) +
    (googleBusiness.hasLocalBusinessSchema ? 2 : 0) +
    (hasVerifiedReviews ? 5 : googleBusiness.hasReviewMentions ? 1 : 0) +
    (googleBusiness.reviewCount >= 50 ? 3 : googleBusiness.reviewCount >= 10 ? 2 : googleBusiness.reviewCount > 0 ? 1 : 0) +
    (googleBusiness.ratingValue >= 4.5 ? 2 : googleBusiness.ratingValue >= 4 ? 1 : 0) +
    (authorityCount >= 2 ? 5 : authorityCount === 1 ? 3 : 0) +
    (socialCount >= 2 ? 3 : socialCount === 1 ? 1 : 0) +
    (accessibleCount >= 2 ? 2 : accessibleCount === 1 ? 1 : 0) +
    (localBusinessSchema ? 1 : 0);

  const rawPoints = {
    entityDiscovery: clamp(entityDiscoveryPoints, 0, 25),
    sourceDiversity: clamp(sourceDiversityPoints, 0, 25),
    entityConsistency: clamp(entityConsistencyPoints, 0, 25),
    externalValidation: clamp(externalValidationPoints, 0, 25)
  };

  if (concreteExternalSignals === 0) {
    rawPoints.entityDiscovery = Math.min(rawPoints.entityDiscovery, 10);
    rawPoints.sourceDiversity = Math.min(rawPoints.sourceDiversity, 4);
    rawPoints.externalValidation = Math.min(rawPoints.externalValidation, 3);
  } else if (concreteExternalSignals === 1) {
    rawPoints.entityDiscovery = Math.min(rawPoints.entityDiscovery, 14);
    rawPoints.sourceDiversity = Math.min(rawPoints.sourceDiversity, 8);
    rawPoints.externalValidation = Math.min(rawPoints.externalValidation, 8);
  }

  return {
    entityDiscovery: roundScore((rawPoints.entityDiscovery / 25) * 100),
    sourceDiversity: roundScore((rawPoints.sourceDiversity / 25) * 100),
    entityConsistency: roundScore((rawPoints.entityConsistency / 25) * 100),
    externalValidation: roundScore((rawPoints.externalValidation / 25) * 100),
    points: rawPoints,
    concreteExternalSignals
  };
}

function buildExternalSignals({ profiles, socialProfileQuality, googleBusiness, authorityLinks, discovery, sourceTypes }) {
  const found = [];
  const missing = [];
  const confirmedMaps = googleBusiness.hasMapsLink || googleBusiness.hasEmbeddedMap || googleBusiness.hasGPage;
  const hasVerifiedReviews = googleBusiness.hasAggregateRating || googleBusiness.reviewCount > 0 || (confirmedMaps && googleBusiness.hasReviewMentions);

  if ((socialProfileQuality?.officialCount || 0) > 0) found.push("Profiluri sociale verificate și conectate la site");
  else if ((socialProfileQuality?.shareCount || 0) > 0) missing.push("Am găsit butoane de share social, dar nu profiluri oficiale ale afacerii tale.");
  else missing.push("Nu am găsit profiluri sociale ale afacerii conectate la site");

  if (confirmedMaps || googleBusiness.hasLocalBusinessSchema) found.push("Profil Google Business detectat");
  else missing.push("Profilul Google Business nu a fost detectat pe site");

  if (hasVerifiedReviews || googleBusiness.reviewSource) {
    const rating = googleBusiness.ratingValue ? googleBusiness.ratingValue.toFixed(1) : null;
    const count = googleBusiness.reviewCount ? `${googleBusiness.reviewCount} recenzii` : null;
    const sourceLabel = getSourceLabel(googleBusiness.reviewSource) || "surse externe";
    const details = [rating ? `${rating} ★` : null, count].filter(Boolean).join(" · ");
    found.push(details ? `Recenzii găsite online: ${details} (${sourceLabel})` : `Recenzii găsite online (${sourceLabel})`);
  } else if (googleBusiness.hasReviewMentions || confirmedMaps) {
    missing.push("Recenziile nu au putut fi extrase automat");
  } else {
    missing.push("Nu am găsit recenzii ale afacerii tale pe platforme externe");
  }

  if (Object.keys(authorityLinks).length > 0) found.push("Afacerea ta apare pe platforme de specialitate");
  else if ((discovery.externalMentionDomains || []).length > 0) found.push("Afacerea ta este menționată pe alte site-uri");
  else missing.push("Afacerea ta nu apare pe platforme externe de specialitate");

  if (discovery.concreteDiscovered) found.push("Afacerea ta apare în surse independente pe web");
  else if (discovery.discovered) missing.push("Afacerea poate fi găsită dacă știi exact numele, dar nu apare organic în recomandări AI.");
  else missing.push("Afacerea ta este greu de găsit de sisteme AI în mod independent");

  if (sourceTypes.length >= 4) found.push("Prezentă pe mai multe platforme diferite");
  else missing.push("Prezență limitată — afacerea ta apare pe prea puține platforme externe");

  return { found, missing };
}

async function evaluateExternalPresence({ pages, domain, brandName }) {
  const externalLinks = collectExternalLinks(pages);
  const detectedBrandName = brandName || extractBrandName(pages, domain);
  const brandTokens = getBrandTokens(detectedBrandName, domain);
  const profiles = collectSocialProfiles(externalLinks);
  const socialProfileQuality = classifySocialProfiles(profiles, brandTokens, domain);
  const authorityLinks = collectAuthorityLinks(externalLinks);
  const googleBusiness = getEnhancedGoogleBusinessIndicators(externalLinks, pages);
  const { city, judet } = inferLocation(pages, googleBusiness.mapsLinks || []);
  const serviceCategory = inferServiceCategory(pages);

  // If brand name looks generic, try to extract the real name from Maps embed URL
  const mapsEmbedName = extractNameFromMapsEmbed((googleBusiness.mapsLinks || []).find((u) => u.includes("embed")));
  const resolvedBrandName = (mapsEmbedName && mapsEmbedName.length >= 2 && mapsEmbedName !== detectedBrandName)
    ? mapsEmbedName
    : detectedBrandName;

  const authorityUrls = Object.values(authorityLinks).flat();
  const socialProfileUrls = Object.values(socialProfileQuality.officialProfiles || {})
    .flat()
    .map((item) => (typeof item === "string" ? item : item?.url))
    .filter(Boolean);

  const [profileChecks, discovery, liveReviewDataDirect, aiVisibility] = await Promise.all([
    checkProfiles(socialProfileQuality.officialProfiles),
    discoverEntityPublicly({ brandName: resolvedBrandName, domain, city, serviceCategory }),
    fetchLiveReviewData({ domain, brandName: resolvedBrandName, city, authorityUrls, socialProfileUrls, snippetTexts: [] }),
    evaluateAiVisibility({ domain, brandName: resolvedBrandName, city, judet, serviceCategory, apiKey: env.openaiApiKey })
  ]);

  // If direct fetch found nothing, try extracting from DuckDuckGo snippets collected in discovery
  const liveReviewData = liveReviewDataDirect ||
    (discovery.snippetTexts?.length
      ? await fetchLiveReviewData({ domain, brandName: detectedBrandName, city, snippetTexts: discovery.snippetTexts })
      : null);

  if (liveReviewData?.ratingValue) {
    googleBusiness.ratingValue = liveReviewData.ratingValue;
    googleBusiness.reviewCount = liveReviewData.reviewCount || googleBusiness.reviewCount;
    googleBusiness.hasAggregateRating = true;
    googleBusiness.reviewSource = liveReviewData.source;
    googleBusiness.reviewConfidence = liveReviewData.confidence;
    if (liveReviewData.source === "trustpilot") {
      googleBusiness.hasTrustpilot = true;
      googleBusiness.trustpilotUrl = liveReviewData.url;
    }
    if (liveReviewData.placeId) googleBusiness.googlePlaceId = liveReviewData.placeId;
  }
  const entitySignals = collectEntitySignals({
    pages,
    domain,
    brandName: resolvedBrandName,
    profiles,
    socialProfileQuality,
    authorityLinks,
    googleBusiness
  });
  const sourceTypes = calculateSourceDiversity({
    socialProfileQuality,
    googleBusiness,
    authorityLinks,
    discovery
  });
  const subscores = calculateSubscores({
    profiles,
    socialProfileQuality,
    profileChecks,
    googleBusiness,
    authorityLinks,
    entitySignals,
    pages,
    discovery,
    sourceTypes
  });
  const score = roundScore(
    subscores.points.entityDiscovery +
      subscores.points.sourceDiversity +
      subscores.points.entityConsistency +
      subscores.points.externalValidation
  );
  const externalSignals = buildExternalSignals({
    profiles,
    socialProfileQuality,
    googleBusiness,
    authorityLinks,
    discovery,
    sourceTypes
  });

  return {
    score,
    subScores: {
      entityDiscovery: subscores.entityDiscovery,
      sourceDiversity: subscores.sourceDiversity,
      entityConsistency: subscores.entityConsistency,
      externalValidation: subscores.externalValidation,
      points: subscores.points
    },
    brandName: resolvedBrandName,
    domain: domain || getDomain(pages[0]?.url || ""),
    city,
    serviceCategory,
    profiles,
    socialProfileQuality,
    profileChecks,
    authorityLinks,
    googleBusiness,
    discovery,
    sourceTypes,
    concreteExternalSignals: subscores.concreteExternalSignals,
    entitySignals,
    externalSignalsFound: externalSignals.found,
    externalSignalsMissing: externalSignals.missing,
    liveReviewData: liveReviewData || null,
    aiVisibility: aiVisibility || null,
    hasAnyExternalSignal:
      socialProfileQuality.officialCount > 0 ||
      Object.keys(authorityLinks).length > 0 ||
      googleBusiness.hasMapsLink ||
      googleBusiness.hasEmbeddedMap ||
      googleBusiness.hasLocalBusinessSchema ||
      googleBusiness.hasAggregateRating ||
      googleBusiness.reviewCount > 0 ||
      Boolean(liveReviewData?.ratingValue) ||
      (googleBusiness.hasReviewMentions && (googleBusiness.hasMapsLink || googleBusiness.hasEmbeddedMap)) ||
      (discovery.externalMentionDomains || []).length > 0 ||
      discovery.concreteDiscovered
  };
}

export { evaluateExternalPresence, extractBrandName };
