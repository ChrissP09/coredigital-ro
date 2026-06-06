import { fetchText } from "./pageFetch.service.js";

const CANDIDATES = [
  { path: "/llms.txt", kind: "standard", basePoints: 8 },
  { path: "/llms-full.txt", kind: "full", basePoints: 7 },
  { path: "/llms.md", kind: "markdown_variant", basePoints: 5 },
  { path: "/llms-full.md", kind: "full_markdown_variant", basePoints: 5 },
  { path: "/llm.txt", kind: "singular_variant", basePoints: 4 },
  { path: "/ai.txt", kind: "ai_variant", basePoints: 3 },
  { path: "/ai.md", kind: "ai_markdown_variant", basePoints: 3 },
  { path: "/ai-sitemap.txt", kind: "ai_sitemap_variant", basePoints: 4 },
  { path: "/ai-sitemap.md", kind: "ai_sitemap_markdown_variant", basePoints: 4 },
  { path: "/humans.txt", kind: "human_context", basePoints: 1 }
];

function rootUrl(websiteUrl) {
  const url = new URL(websiteUrl);
  return `${url.protocol}//${url.hostname}`;
}

function normalizeContent(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function getContentSignals(text = "") {
  const normalized = normalizeContent(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const linkCount = (text.match(/\[[^\]]+\]\([^)]+\)|https?:\/\//gi) || []).length;
  const hasBusinessDescription = /despre|about|companie|firma|business|ce facem|misiune|overview/.test(normalized);
  const hasServices = /servicii|services|produse|products|solutii|oferta/.test(normalized);
  const hasFaq = /faq|intrebari|questions|q&a|cum|ce este|cat costa|de ce/.test(normalized);
  const hasContact = /contact|email|telefon|phone|adresa|address/.test(normalized);
  const hasResources = /blog|resurse|resources|ghid|guide|articol|case study|studiu de caz/.test(normalized);

  return {
    wordCount,
    linkCount,
    hasBusinessDescription,
    hasServices,
    hasFaq,
    hasContact,
    hasResources,
    qualityPoints:
      (wordCount >= 120 ? 2 : wordCount >= 40 ? 1 : 0) +
      (linkCount >= 5 ? 2 : linkCount >= 2 ? 1 : 0) +
      (hasBusinessDescription ? 1 : 0) +
      (hasServices ? 2 : 0) +
      (hasFaq ? 1 : 0) +
      (hasContact ? 1 : 0) +
      (hasResources ? 1 : 0)
  };
}

function mentionsAiFileInRobots(robots, filePath) {
  const text = `${robots?.raw || ""} ${robots?.body || ""} ${robots?.text || ""}`.toLowerCase();
  return text.includes(filePath.toLowerCase()) || /llms\.txt|llms-full\.txt|ai-sitemap/i.test(text);
}

async function inspectAiReadinessFiles(websiteUrl, robots = {}) {
  const base = rootUrl(websiteUrl);
  const checked = await Promise.all(
    CANDIDATES.map(async (candidate) => {
      const url = `${base}${candidate.path}`;
      const result = await fetchText(url, "text/plain,text/markdown,text/x-markdown,*/*;q=0.8");
      const text = result.ok ? result.text.slice(0, 120000) : "";
      const contentSignals = result.ok ? getContentSignals(text) : getContentSignals("");
      const robotsReference = mentionsAiFileInRobots(robots, candidate.path);
      const score = result.ok
        ? Math.min(15, candidate.basePoints + contentSignals.qualityPoints + (robotsReference ? 2 : 0))
        : 0;

      return {
        ...candidate,
        url,
        found: result.ok,
        status: result.status,
        robotsReference,
        score,
        confidence: result.ok && candidate.path === "/llms.txt" ? "High" : result.ok ? "Medium" : "Low",
        contentSignals
      };
    })
  );
  const found = checked.filter((item) => item.found);
  const best = found.sort((a, b) => b.score - a.score)[0] || null;

  return {
    found: found.length > 0,
    best,
    checked,
    foundFiles: found.map((item) => ({
      path: item.path,
      url: item.url,
      kind: item.kind,
      score: item.score,
      confidence: item.confidence,
      contentSignals: item.contentSignals
    })),
    hasStandardLlmsTxt: found.some((item) => item.path === "/llms.txt"),
    hasFullLlmsFile: found.some((item) => item.path === "/llms-full.txt" || item.path === "/llms-full.md"),
    robotsReference: checked.some((item) => item.robotsReference),
    score: Math.min(20, found.reduce((total, item) => Math.max(total, item.score), 0) + (found.length >= 2 ? 3 : 0))
  };
}

export { inspectAiReadinessFiles };
