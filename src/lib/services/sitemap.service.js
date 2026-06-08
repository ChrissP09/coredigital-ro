import { XMLParser } from "fast-xml-parser";
import { getOrigin } from "../utils/url.js";
import { fetchText } from "./pageFetch.service.js";

const parser = new XMLParser({
  ignoreAttributes: false
});

function ensureArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function extractUrlsFromXml(xml) {
  try {
    const parsed = parser.parse(xml);
    const urlEntries = ensureArray(parsed?.urlset?.url);
    const sitemapEntries = ensureArray(parsed?.sitemapindex?.sitemap);

    const pageUrls = urlEntries.map((entry) => entry?.loc).filter(Boolean);
    const nestedSitemaps = sitemapEntries.map((entry) => entry?.loc).filter(Boolean);
    const hasLastmod = urlEntries.some((entry) => Boolean(entry?.lastmod));

    return {
      pageUrls,
      nestedSitemaps,
      hasLastmod
    };
  } catch {
    return {
      pageUrls: [],
      nestedSitemaps: []
    };
  }
}

async function discoverSitemap(websiteUrl, robotsSitemaps = []) {
  const candidates = [
    ...robotsSitemaps,
    `${getOrigin(websiteUrl)}/sitemap.xml`,
    `${getOrigin(websiteUrl)}/sitemap_index.xml`
  ];

  const uniqueCandidates = Array.from(new Set(candidates));

  for (const candidate of uniqueCandidates) {
    const response = await fetchText(candidate, "application/xml,text/xml,*/*;q=0.8");
    if (!response.ok || !response.text) {
      continue;
    }

    const extracted = extractUrlsFromXml(response.text);

    if (extracted.pageUrls.length > 0) {
      return {
        found: true,
        url: response.url || candidate,
        pageUrls: extracted.pageUrls.slice(0, 200),
        hasLastmod: extracted.hasLastmod
      };
    }

    for (const nested of extracted.nestedSitemaps.slice(0, 3)) {
      const nestedResponse = await fetchText(nested, "application/xml,text/xml,*/*;q=0.8");
      if (!nestedResponse.ok || !nestedResponse.text) {
        continue;
      }

      const nestedExtracted = extractUrlsFromXml(nestedResponse.text);
      if (nestedExtracted.pageUrls.length > 0) {
        return {
          found: true,
          url: response.url || candidate,
          pageUrls: nestedExtracted.pageUrls.slice(0, 200),
          hasLastmod: nestedExtracted.hasLastmod
        };
      }
    }
  }

  return {
    found: false,
    url: null,
    pageUrls: [],
    hasLastmod: false
  };
}

export { discoverSitemap };
