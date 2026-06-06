function normalizeWebsiteUrl(input) {
  if (!input || typeof input !== "string") {
    throw new Error("URL lipsa");
  }

  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Protocol invalid");
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");

  return parsed.toString();
}

function getDomain(input) {
  return new URL(input).hostname.replace(/^www\./i, "").toLowerCase();
}

function getOrigin(input) {
  return new URL(input).origin;
}

function isSameDomain(url, baseUrl) {
  try {
    return getDomain(url) === getDomain(baseUrl);
  } catch {
    return false;
  }
}

function resolveUrl(href, baseUrl) {
  try {
    const parsed = new URL(href, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePathForMatch(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

export {
  normalizeWebsiteUrl,
  getDomain,
  getOrigin,
  isSameDomain,
  resolveUrl,
  normalizePathForMatch
};
