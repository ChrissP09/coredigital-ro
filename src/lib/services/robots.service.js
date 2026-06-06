import { getOrigin } from "../utils/url.js";
import { fetchText } from "./pageFetch.service.js";

function extractSitemaps(robotsText = "") {
  return robotsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:/i, "").trim())
    .filter(Boolean);
}

async function inspectRobots(websiteUrl) {
  const robotsUrl = `${getOrigin(websiteUrl)}/robots.txt`;
  const result = await fetchText(robotsUrl);
  const sitemaps = result.ok ? extractSitemaps(result.text) : [];

  return {
    found: result.ok,
    url: robotsUrl,
    status: result.status,
    text: result.text || "",
    sitemaps
  };
}

export { inspectRobots };
