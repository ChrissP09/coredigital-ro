const OPENAI_API_BASE = "https://api.openai.com/v1";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function openAiFetch(endpoint, body, apiKey, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Step 1: generate 2 queries the target audience would search ─────────────

async function generateSearchQueries(brandName, city, judet, serviceCategory, apiKey) {
  const locationHint = city && judet && city !== judet
    ? `Afacerea este în orașul ${city}, județul ${judet}.`
    : city
    ? `Afacerea este în ${city}.`
    : "";
  const contextHint = serviceCategory
    ? `Titlurile paginilor site-ului:\n${serviceCategory}`
    : "";

  const data = await openAiFetch(
    "/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești un expert în comportamentul clienților români care caută produse și servicii locale. " +
            "Titlurile paginilor site-ului îți arată ce VINDE această afacere. " +
            "Identifică produsul sau serviciul PRINCIPAL și generează exact 2 query-uri realiste în română. " +
            "REGULI STRICTE: " +
            "(1) Focusează-te pe PRODUSUL PRINCIPAL — ce fabrică sau vinde afacerea, nu componente/accesorii/materiale. " +
            "Exemplu: titluri cu 'ferestre lemn' → query despre FERESTRE, nu 'feronerie' sau 'lemn masiv'. " +
            "(2) NU include numele brandului. " +
            "(3) AMBELE query-uri trebuie să conțină locația: " +
            "Query 1 = produs principal + județ (ex: 'ferestre lemn bihor'). " +
            "Query 2 = produs principal + oraș (ex: 'ferestre lemn oradea'). " +
            "Dacă nu e locație disponibilă, folosește termeni regionali generici. " +
            "(4) Natural, cum scrie un om real pe Google sau ChatGPT. " +
            'Returnează DOAR JSON cu cheia "queries" și array de 2 stringuri.'
        },
        {
          role: "user",
          content: `Brand: ${brandName}. ${locationHint}\n\n${contextHint}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 150
    },
    apiKey,
    12000
  );

  if (!data?.choices?.[0]?.message?.content) return null;
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    const raw = parsed.queries || parsed[Object.keys(parsed)[0]];
    if (!Array.isArray(raw)) return null;
    return raw.filter((q) => typeof q === "string" && q.trim().length > 8).slice(0, 2);
  } catch {
    return null;
  }
}

// ─── Step 2: query AI with web search, check if brand appears ────────────────

async function checkBrandInAiResponse(query, brandName, domain, apiKey) {
  const data = await openAiFetch(
    "/responses",
    {
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: query
    },
    apiKey,
    25000
  );

  const empty = { query, mentioned: false, domainCited: false, position: null, brandSnippet: null, response: "", citedUrls: [] };
  if (!data?.output) return empty;

  const messageOutput = data.output.find((o) => o.type === "message");
  const textContent = messageOutput?.content?.find((c) => c.type === "output_text");
  const responseText = textContent?.text || "";
  if (!responseText) return empty;

  const annotations = textContent?.annotations || [];
  const citedUrls = annotations
    .filter((a) => a.type === "url_citation")
    .map((a) => ({ url: a.url, title: a.title || "" }));

  const lowerText = responseText.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  const cleanDomain = domain.replace(/^www\./, "").toLowerCase();

  const brandMentioned = lowerText.includes(lowerBrand);
  const domainCited = citedUrls.some((c) => c.url.toLowerCase().includes(cleanDomain));

  let position = null;
  if (brandMentioned) {
    const lines = responseText.split("\n").filter((l) => l.trim().length > 5);
    const idx = lines.findIndex((l) => l.toLowerCase().includes(lowerBrand));
    position = idx >= 0 ? idx + 1 : null;
  }

  let brandSnippet = null;
  if (brandMentioned) {
    const sentences = responseText.split(/(?<=[.!?])\s+/);
    const s = sentences.find((sen) => sen.toLowerCase().includes(lowerBrand));
    if (s) {
        brandSnippet = s.trim()
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 200);
      }
  }

  return {
    query,
    mentioned: brandMentioned || domainCited,
    domainCited,
    position,
    brandSnippet,
    response: responseText.substring(0, 1000),
    citedUrls: citedUrls.slice(0, 5)
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function evaluateAiVisibility({ domain, brandName, city, judet, serviceCategory, apiKey }) {
  if (!apiKey || !brandName) return null;

  const queries = await generateSearchQueries(brandName, city, judet, serviceCategory, apiKey);
  if (!queries || queries.length === 0) return null;

  const results = await Promise.all(
    queries.map((q) => checkBrandInAiResponse(q, brandName, domain, apiKey))
  );

  const mentionedCount = results.filter((r) => r.mentioned).length;
  const citedCount = results.filter((r) => r.domainCited).length;
  const score = Math.round((mentionedCount / results.length) * 100);

  return {
    queries,
    results,
    mentionedCount,
    citedCount,
    totalQueries: results.length,
    score
  };
}

export { evaluateAiVisibility, checkBrandInAiResponse };
