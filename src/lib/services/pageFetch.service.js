import env from "../config/env.js";
import { assertHostAllowed } from "../utils/ssrf.js";

const USER_AGENT =
  "AIVisibilityGrader/1.0 (+https://localhost; rule-based website readiness check)";

const MAX_REDIRECTS = 5;

// SSRF-safe fetch: validates the host (no private/loopback/link-local targets)
// before every hop and follows redirects manually so a public URL can't bounce
// us into the internal network.
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || env.requestTimeoutMs);

  try {
    let currentUrl = url;
    let response;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertHostAllowed(new URL(currentUrl).hostname);

      response = await fetch(currentUrl, {
        method: options.method || "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: options.accept || "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
        }
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url) {
  try {
    const response = await fetchWithTimeout(url);
    const contentType = response.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");
    const html = isHtml ? await response.text() : "";

    return {
      url: response.url || url,
      requestedUrl: url,
      ok: response.ok,
      status: response.status,
      contentType,
      html,
      error: null
    };
  } catch (error) {
    return {
      url,
      requestedUrl: url,
      ok: false,
      status: 0,
      contentType: "",
      html: "",
      error: error.name === "AbortError" ? "Timeout la incarcarea paginii." : error.message
    };
  }
}

async function fetchText(url, accept = "text/plain,*/*;q=0.8") {
  try {
    const response = await fetchWithTimeout(url, { accept });
    const text = response.ok ? await response.text() : "";

    return {
      url: response.url || url,
      ok: response.ok,
      status: response.status,
      text,
      error: null
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      text: "",
      error: error.name === "AbortError" ? "Timeout la incarcare." : error.message
    };
  }
}

async function checkUrlAccessible(url) {
  try {
    const response = await fetchWithTimeout(url, {
      method: "HEAD",
      timeout: 5000,
      accept: "*/*"
    });
    return response.ok;
  } catch {
    return false;
  }
}

export { fetchPage, fetchText, checkUrlAccessible };
