function compactWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function countWords(text = "") {
  const normalized = compactWhitespace(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function containsAny(text = "", patterns = []) {
  const lower = text.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    }
    return lower.includes(String(pattern).toLowerCase());
  });
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

export {
  compactWhitespace,
  countWords,
  containsAny,
  unique
};
