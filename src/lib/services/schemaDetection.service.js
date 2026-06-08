function collectTypesFromJsonLd(node, types = []) {
  if (!node) {
    return types;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectTypesFromJsonLd(item, types));
    return types;
  }

  if (typeof node === "object") {
    if (node["@type"]) {
      if (Array.isArray(node["@type"])) {
        types.push(...node["@type"]);
      } else {
        types.push(node["@type"]);
      }
    }

    if (node["@graph"]) {
      collectTypesFromJsonLd(node["@graph"], types);
    }
  }

  return types;
}

function collectSameAsFromJsonLd(node, sameAs = []) {
  if (!node) {
    return sameAs;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectSameAsFromJsonLd(item, sameAs));
    return sameAs;
  }

  if (typeof node === "object") {
    if (node.sameAs) {
      if (Array.isArray(node.sameAs)) {
        sameAs.push(...node.sameAs);
      } else {
        sameAs.push(node.sameAs);
      }
    }

    if (node["@graph"]) {
      collectSameAsFromJsonLd(node["@graph"], sameAs);
    }
  }

  return sameAs;
}

function collectNamesFromJsonLd(node, names = []) {
  if (!node) {
    return names;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectNamesFromJsonLd(item, names));
    return names;
  }

  if (typeof node === "object") {
    if (node.name && typeof node.name === "string") {
      names.push(node.name);
    }

    if (node.legalName && typeof node.legalName === "string") {
      names.push(node.legalName);
    }

    if (node["@graph"]) {
      collectNamesFromJsonLd(node["@graph"], names);
    }
  }

  return names;
}

function collectArticleDataFromJsonLd(node, result = { hasArticle: false, hasAuthor: false, hasDateModified: false }) {
  if (!node) return result;

  if (Array.isArray(node)) {
    node.forEach((item) => collectArticleDataFromJsonLd(item, result));
    return result;
  }

  if (typeof node === "object") {
    const type = String(node["@type"] || "").toLowerCase();
    if (/article|blogposting|newsarticle|technicalarticle/i.test(type)) {
      result.hasArticle = true;
      if (node.author) result.hasAuthor = true;
      if (node.dateModified || node.datePublished) result.hasDateModified = true;
    }
    if (node["@graph"]) collectArticleDataFromJsonLd(node["@graph"], result);
  }

  return result;
}

function collectRatingsFromJsonLd(node, ratings = []) {
  if (!node) {
    return ratings;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectRatingsFromJsonLd(item, ratings));
    return ratings;
  }

  if (typeof node === "object") {
    if (node.aggregateRating && typeof node.aggregateRating === "object") {
      ratings.push({
        ratingValue: node.aggregateRating.ratingValue || null,
        reviewCount: node.aggregateRating.reviewCount || node.aggregateRating.ratingCount || null
      });
    }

    if (/aggregaterating/i.test(String(node["@type"] || ""))) {
      ratings.push({
        ratingValue: node.ratingValue || null,
        reviewCount: node.reviewCount || node.ratingCount || null
      });
    }

    if (node["@graph"]) {
      collectRatingsFromJsonLd(node["@graph"], ratings);
    }
  }

  return ratings;
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : null;
}

function detectSchema($) {
  const schemaTypes = [];
  const sameAs = [];
  const names = [];
  const ratings = [];

  const articleData = { hasArticle: false, hasAuthor: false, hasDateModified: false };

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).contents().text();

    try {
      const parsed = JSON.parse(raw);
      collectTypesFromJsonLd(parsed, schemaTypes);
      collectSameAsFromJsonLd(parsed, sameAs);
      collectNamesFromJsonLd(parsed, names);
      collectRatingsFromJsonLd(parsed, ratings);
      collectArticleDataFromJsonLd(parsed, articleData);
    } catch {
      const matches = raw.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
      matches.forEach((match) => {
        const type = match.split(":").pop().replace(/"/g, "").trim();
        if (type) {
          schemaTypes.push(type);
        }
      });
    }
  });

  $("[itemscope][itemtype]").each((_, element) => {
    const itemType = $(element).attr("itemtype");
    if (itemType) {
      schemaTypes.push(itemType.split("/").pop());
    }
  });

  const normalizedTypes = Array.from(
    new Set(schemaTypes.map((type) => String(type).replace(/^https?:\/\/schema.org\//, "").trim()))
  ).filter(Boolean);
  const ratingValues = ratings.map((item) => parseNumber(item.ratingValue)).filter((value) => value !== null);
  const reviewCounts = ratings.map((item) => parseNumber(item.reviewCount)).filter((value) => value !== null);

  return {
    hasSchema: normalizedTypes.length > 0,
    types: normalizedTypes,
    hasOrganization: normalizedTypes.some((type) => /organization/i.test(type)),
    hasLocalBusiness: normalizedTypes.some((type) => /localbusiness|restaurant|dentist|store|hotel|medicalbusiness/i.test(type)),
    hasAggregateRating: normalizedTypes.some((type) => /aggregaterating|review/i.test(type)) || ratings.length > 0,
    hasBreadcrumb: normalizedTypes.some((type) => /breadcrumb/i.test(type)),
    hasArticle: articleData.hasArticle,
    hasAuthor: articleData.hasAuthor,
    hasDateModified: articleData.hasDateModified,
    ratingValue: ratingValues.length ? Math.max(...ratingValues) : null,
    reviewCount: reviewCounts.length ? Math.max(...reviewCounts) : null,
    sameAs: Array.from(new Set(sameAs.filter(Boolean))),
    names: Array.from(new Set(names.filter(Boolean)))
  };
}

export { detectSchema };
