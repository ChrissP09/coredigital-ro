import env from "../config/env.js";
import { isSameDomain } from "../utils/url.js";

const excludedPathPatterns = [
  /\/(admin|wp-admin|login|signin|sign-in|register|account|cont|cart|cos|checkout|plata)(\/|$)/i,
  /\/(tag|tags|category|categorie|archive|author|page)\/?\d*/i,
  /\/feed\/?$/i,
  /\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|rar|doc|docx|xls|xlsx|ppt|pptx|css|js|mp4|mp3|avi|mov)$/i
];

const typeRules = [
  {
    type: "contact",
    patterns: [/contact/i]
  },
  {
    type: "legal",
    patterns: [/privacy|confidentialitate|confidențialitate|gdpr|termeni|cookies|legal/i]
  },
  {
    type: "faq",
    patterns: [/faq|intrebari-frecvente|întrebări-frecvente|intrebari-frecvente|intrebari|întrebări|q-a|questions/i]
  },
  {
    type: "case_study",
    patterns: [/case-stud|studiu-de-caz|studii-de-caz|portfolio|portofoliu|proiecte|clienti|clienți/i]
  },
  {
    type: "location",
    patterns: [/locatii|locații|location|locations|oras|oraș|judet|județ|bucuresti|bucurești|cluj|timisoara|timișoara|iasi|iași|constanta|constanța|brasov|brașov|sibiu|oradea/i]
  },
  {
    type: "services",
    patterns: [/servicii|services|produse|products|solutii|soluții|solutions|oferta|abonamente|preturi|prețuri/i]
  },
  {
    type: "about",
    patterns: [/despre|about|companie|echipa|cine-suntem|misiune/i]
  },
  {
    type: "resource",
    patterns: [/blog|resurse|resources|articole|ghid|guide|cum-sa|cum-să|tutorial|sfaturi|probleme|intrebari|întrebări/i]
  }
];

const resourceRelevancePatterns = [
  /ghid|guide|cum-sa|cum-să|cum\s+s[aă]|intrebari|întrebări|faq|servicii|produse|probleme|solutii|soluții|cost|pret|preț|alege|client|business|afacere|strategie|tips|sfaturi/i
];

function normalizeCandidateUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";

    const allowedParams = new Set(["p", "page_id"]);
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (!allowedParams.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    });

    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

function shouldExcludeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const path = decodeURIComponent(parsed.pathname || "/");
  return excludedPathPatterns.some((pattern) => pattern.test(path));
}

function classifyUrl(url, text = "") {
  const lower = `${url} ${text}`.toLowerCase();

  if (new URL(url).pathname === "/") {
    return "homepage";
  }

  const match = typeRules.find((rule) => rule.patterns.some((pattern) => pattern.test(lower)));
  return match ? match.type : "other";
}

function isRelevantResource(url, text = "") {
  const lower = `${url} ${text}`.toLowerCase();
  return resourceRelevancePatterns.some((pattern) => pattern.test(lower));
}

function scoreCandidate(url, type) {
  const path = new URL(url).pathname.toLowerCase();
  const depth = path.split("/").filter(Boolean).length;
  let score = 0;

  const typeScores = {
    homepage: 1000,
    services: 900,
    about: 760,
    contact: 740,
    faq: 720,
    location: 700,
    resource: 620,
    case_study: 610,
    legal: 300,
    other: 120
  };

  score += typeScores[type] || 0;
  score -= depth * 8;

  if (type === "resource" && isRelevantResource(url)) score += 120;
  if (type === "other" && isRelevantResource(url)) score += 160;
  if (/\/blog\/\d{4}\/\d{2}/i.test(path)) score -= 80;

  return score;
}

function countTypes(urls) {
  return urls.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
}

function buildDiscoveryStats(allCandidates, selected) {
  return {
    totalPagesDiscovered: allCandidates.length,
    totalPagesAnalyzed: selected.length,
    pageTypesCount: countTypes(selected),
    discoveredPageTypesCount: countTypes(allCandidates),
    blogPagesFound: allCandidates.filter((item) => item.type === "resource").length,
    blogPagesAnalyzed: selected.filter((item) => item.type === "resource").length,
    servicePagesFound: allCandidates.filter((item) => item.type === "services").length,
    locationPagesFound: allCandidates.filter((item) => item.type === "location").length,
    faqPagesFound: allCandidates.filter((item) => item.type === "faq").length
  };
}

function addByType(selected, candidates, type, limit) {
  candidates
    .filter((item) => item.type === type)
    .slice(0, limit)
    .forEach((item) => {
      if (!selected.some((selectedItem) => selectedItem.url === item.url)) {
        selected.push(item);
      }
    });
}

function selectImportantPages(homepageUrl, sitemapUrls = [], internalLinks = []) {
  const maxPages = Math.max(1, Math.min(env.maxPagesToAnalyze, 25));
  const rawCandidates = [homepageUrl, ...sitemapUrls, ...internalLinks];
  const byUrl = new Map();

  rawCandidates.forEach((rawUrl) => {
    const normalized = normalizeCandidateUrl(rawUrl);
    if (!normalized || !isSameDomain(normalized, homepageUrl) || shouldExcludeUrl(normalized)) {
      return;
    }

    const type = classifyUrl(normalized);
    byUrl.set(normalized, {
      url: normalized,
      type,
      score: scoreCandidate(normalized, type)
    });
  });

  const allCandidates = Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
  const selected = [];
  const homepage = byUrl.get(normalizeCandidateUrl(homepageUrl));

  if (homepage) selected.push(homepage);

  addByType(selected, allCandidates, "services", 8);
  addByType(selected, allCandidates, "about", 2);
  addByType(selected, allCandidates, "contact", 2);
  addByType(selected, allCandidates, "faq", 3);
  addByType(selected, allCandidates, "location", 4);
  addByType(selected, allCandidates, "resource", 8);
  addByType(selected, allCandidates, "case_study", 4);
  addByType(selected, allCandidates, "legal", 2);

  allCandidates.forEach((item) => {
    if (selected.length >= maxPages) return;
    if (!selected.some((selectedItem) => selectedItem.url === item.url)) {
      selected.push(item);
    }
  });

  const limited = selected.slice(0, maxPages);

  return {
    urls: limited.map((item) => item.url),
    selected: limited,
    stats: buildDiscoveryStats(allCandidates, limited)
  };
}

export { selectImportantPages, classifyUrl, isRelevantResource };
