import * as cheerio from "cheerio";
import { countWords, compactWhitespace, containsAny, unique } from "../utils/text.js";
import { isSameDomain, resolveUrl } from "../utils/url.js";
import { detectSchema } from "./schemaDetection.service.js";
import { classifyUrl, isRelevantResource } from "./pageDiscovery.service.js";

const cityPatterns = [
  "bucuresti",
  "cluj",
  "timisoara",
  "iasi",
  "constanta",
  "brasov",
  "sibiu",
  "oradea",
  "craiova",
  "arad",
  "ploiesti",
  "pitesti",
  "galati",
  "braila",
  "romania",
  "sector"
];

const servicePatterns = [
  "servicii",
  "service",
  "produse",
  "products",
  "solutions",
  "solutii",
  "oferta",
  "preturi",
  "abonamente"
];

const faqPatterns = [
  "faq",
  "intrebari frecvente",
  "întrebări frecvente",
  "cum functioneaza",
  "cum funcționează",
  "ce este",
  "cat costa",
  "cât costă"
];

const trustPatterns = [
  "testimoniale",
  "recenzii",
  "review",
  "reviews",
  "studii de caz",
  "case study",
  "clienti",
  "clienți"
];

const credentialPatterns = [
  "certificat",
  "certificare",
  "autorizat",
  "acreditat",
  "premiu",
  "award",
  "licenta",
  "licență",
  "partener"
];

const differentiationPatterns = [
  "specializat",
  "personalizat",
  "rapid",
  "garantie",
  "garanție",
  "experienta",
  "experiență",
  "expertiza",
  "profesionist",
  "premium"
];

const socialHosts = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"]
};

const directoryHosts = [
  "google.com/maps",
  "maps.google.",
  "maps.app.goo.gl",
  "goo.gl/maps",
  "g.page",
  "business.site",
  "trustpilot.",
  "tripadvisor.",
  "clutch.co",
  "booking.com",
  "olx.ro",
  "emag.ro",
  "marketplace.emag.ro",
  "listafirme.ro",
  "termene.ro",
  "firme.info",
  "compari.ro",
  "storia.ro",
  "autovit.ro"
];

function getPageType(url, text) {
  const lower = `${url} ${text}`.toLowerCase();
  const urlType = classifyUrl(url, text);

  if (urlType !== "other") return urlType;

  if (containsAny(lower, ["contact"])) return "contact";
  if (containsAny(lower, ["privacy", "confidentialitate", "confidențialitate", "gdpr", "termeni", "cookies"])) return "legal";
  if (containsAny(lower, ["faq", "intrebari frecvente", "întrebări frecvente"])) return "faq";
  if (containsAny(lower, ["studiu de caz", "studii de caz", "case study", "portfolio", "portofoliu"])) return "case_study";
  if (containsAny(lower, ["locatie", "locație", "locatii", "locații", "service area", "zona deservita", "zonă deservită"])) return "location";
  if (containsAny(lower, ["despre", "about", "echipa", "companie"])) return "about";
  if (containsAny(lower, servicePatterns)) return "services";
  if (containsAny(lower, faqPatterns) || containsAny(lower, ["blog", "resurse", "resources", "articole"]) || isRelevantResource(url, text)) return "resource";
  return "homepage";
}

function extractLinks($, baseUrl) {
  const internalLinks = [];
  const externalLinks = [];

  $("a[href]").each((_, element) => {
    const resolved = resolveUrl($(element).attr("href"), baseUrl);
    if (!resolved || !/^https?:\/\//i.test(resolved)) {
      return;
    }

    if (isSameDomain(resolved, baseUrl)) {
      internalLinks.push(resolved);
    } else {
      externalLinks.push(resolved);
    }
  });

  $("iframe[src]").each((_, element) => {
    const resolved = resolveUrl($(element).attr("src"), baseUrl);
    if (!resolved || !/^https?:\/\//i.test(resolved)) {
      return;
    }

    if (isSameDomain(resolved, baseUrl)) {
      internalLinks.push(resolved);
    } else {
      externalLinks.push(resolved);
    }
  });

  return {
    internalLinks: unique(internalLinks),
    externalLinks: unique(externalLinks)
  };
}

function detectSocialLinks(links) {
  const result = {
    facebook: [],
    instagram: [],
    linkedin: [],
    tiktok: [],
    youtube: []
  };

  links.forEach((link) => {
    const lower = link.toLowerCase();
    Object.entries(socialHosts).forEach(([platform, hosts]) => {
      if (hosts.some((host) => lower.includes(host))) {
        result[platform].push(link);
      }
    });
  });

  Object.keys(result).forEach((key) => {
    result[key] = unique(result[key]);
  });

  return result;
}

function detectDirectoryLinks(links) {
  return links.filter((link) => {
    const lower = link.toLowerCase();
    return directoryHosts.some((host) => lower.includes(host));
  });
}

function extractRatingData(text, schema) {
  const ratingPatterns = [
    /(\d(?:[.,]\d)?)\s*(?:\/\s*5|din\s*5|stele|stars)/i,
    /rating\s*:?\s*(\d(?:[.,]\d)?)/i,
    /(\d(?:[.,]\d)?)\s+din\s+\d+\s+(?:recenzii|review-uri|reviews|evaluari|evaluări)/i
  ];
  const countPatterns = [
    /(\d{1,6})\s+(?:recenzii|review-uri|reviews|evaluari|evaluări)/i,
    /(?:recenzii|review-uri|reviews|evaluari|evaluări)\s*:?\s*(\d{1,6})/i
  ];
  const ratingMatch = ratingPatterns.map((pattern) => text.match(pattern)).find(Boolean);
  const countMatch = countPatterns.map((pattern) => text.match(pattern)).find(Boolean);
  const ratingValue = schema.ratingValue ?? (ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : null);
  const reviewCount = schema.reviewCount ?? (countMatch ? Number(countMatch[1]) : null);

  return {
    ratingValue: Number.isFinite(ratingValue) ? ratingValue : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    hasRatingSignal: Boolean(ratingMatch || schema.hasAggregateRating),
    hasReviewCountSignal: Boolean(countMatch || schema.reviewCount)
  };
}

function extractFirstParagraph($) {
  const candidates = $("main p, article p, section p, .content p, p").filter((_, el) => {
    const text = $(el).text().trim();
    return text.length > 60;
  });
  return compactWhitespace(candidates.first().text());
}

function extractPage(fetchResult, baseUrl) {
  const $ = cheerio.load(fetchResult.html || "");
  const schema = detectSchema($);

  const robotsMeta = $("meta[name='robots'], meta[name='googlebot']").attr("content") || "";
  const hasNoindex = /noindex/i.test(robotsMeta);
  const canonicalUrl = $("link[rel='canonical']").attr("href") || null;
  const firstParagraph = extractFirstParagraph($);
  const firstParaWordCount = countWords(firstParagraph);

  $("script, style, noscript, svg").remove();

  const title = compactWhitespace($("title").first().text());
  const metaDescription = compactWhitespace(
    $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || ""
  );
  const h1 = compactWhitespace($("h1").first().text());
  const headings = [];

  $("h1, h2, h3").each((_, element) => {
    const text = compactWhitespace($(element).text());
    if (text) {
      headings.push({
        level: element.tagName.toLowerCase(),
        text
      });
    }
  });

  const bodyText = compactWhitespace($("body").text());
  const lowerText = bodyText.toLowerCase();
  const { internalLinks, externalLinks } = extractLinks($, fetchResult.url || baseUrl);
  const socialLinks = detectSocialLinks(externalLinks);
  const directoryLinks = detectDirectoryLinks(externalLinks);
  const ratingData = extractRatingData(bodyText, schema);

  const emailMatches = unique(bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
  const phoneMatches = unique(
    bodyText.match(/(?:\+40|0040|0)(?:\s|\.)?[237][0-9](?:\s|\.|-)?[0-9]{3}(?:\s|\.|-)?[0-9]{3}/g) || []
  );

  const hasAddress =
    /(strada|str\.|bulevardul|bd\.|calea|piata|piața|nr\.|numarul|numărul)\s+[a-z0-9\s.-]{3,}/i.test(bodyText) ||
    /judetul|județul|sector\s+\d/i.test(bodyText);

  const signals = {
    hasTitle: Boolean(title),
    hasMetaDescription: Boolean(metaDescription),
    hasH1: Boolean(h1),
    hasHeadingStructure: headings.filter((heading) => heading.level !== "h1").length >= 2,
    wordCount: countWords(bodyText),
    hasServiceContent: containsAny(lowerText, servicePatterns),
    hasFaqContent: containsAny(lowerText, faqPatterns) || /\?\s/.test(bodyText),
    hasAboutContent: containsAny(lowerText, ["despre noi", "about us", "echipa", "compania", "misiunea"]),
    hasContactContent: containsAny(lowerText, ["contact", "telefon", "email", "program"]),
    hasLocationMention: containsAny(lowerText, cityPatterns),
    hasTestimonials: containsAny(lowerText, trustPatterns),
    hasCredentials: containsAny(lowerText, credentialPatterns),
    hasDifferentiation: containsAny(lowerText, differentiationPatterns),
    hasLegalContent: containsAny(lowerText, ["privacy", "confidentialitate", "confidențialitate", "gdpr", "termeni", "cookies"]),
    hasEmail: emailMatches.length > 0,
    hasPhone: phoneMatches.length > 0,
    hasAddress,
    hasMapsSignal: containsAny(lowerText, ["google maps", "harta", "hartă", "directii", "direcții", "program"]) ||
      externalLinks.some((link) => /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|g\.page|goo\.gl\/maps/i.test(link)) ||
      schema.hasLocalBusiness,
    hasReviewSignal:
      containsAny(lowerText, ["recenzii google", "google reviews", "trustpilot", "review-uri", "evaluari", "evaluări", "rating", "stele"]) ||
      ratingData.hasRatingSignal ||
      ratingData.hasReviewCountSignal,
    hasNoindex,
    hasCanonical: Boolean(canonicalUrl),
    hasDirectAnswerPositioning: firstParaWordCount >= 20 && firstParaWordCount <= 150,
    hasBreadcrumbSchema: schema.hasBreadcrumb,
    hasArticleSchema: schema.hasArticle,
    hasAuthorSchema: schema.hasAuthor,
    hasDateModifiedSchema: schema.hasDateModified
  };

  return {
    url: fetchResult.url || fetchResult.requestedUrl,
    requestedUrl: fetchResult.requestedUrl,
    status: fetchResult.status,
    ok: fetchResult.ok,
    title,
    metaDescription,
    h1,
    headings,
    wordCount: signals.wordCount,
    textSample: bodyText.slice(0, 1200),
    pageType: getPageType(fetchResult.url || fetchResult.requestedUrl, `${title} ${h1} ${bodyText.slice(0, 400)}`),
    internalLinks,
    externalLinks,
    socialLinks,
    directoryLinks,
    schema,
    ratingData,
    emails: emailMatches,
    phones: phoneMatches,
    canonicalUrl,
    signals
  };
}

export { extractPage };
