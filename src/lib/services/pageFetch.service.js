import env from "../config/env.js";

const USER_AGENT =
  "AIVisibilityGrader/1.0 (+https://localhost; rule-based website readiness check)";

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || env.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: options.accept || "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });

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
