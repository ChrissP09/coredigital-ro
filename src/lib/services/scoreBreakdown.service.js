import { roundScore } from "../utils/scoring.js";

const finalWeights = {
  businessUnderstanding: 0.25,
  onlinePresence: 0.3,
  marketAuthority: 0.25,
  trustAuthority: 0.15,
  discoverability: 0.05
};

function add(items, label, value, detected = value > 0, meta = {}) {
  items.push({
    label,
    value,
    detected: Boolean(detected),
    ...meta
  });
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.value || 0), 0);
}

function buildWebsiteUnderstanding(signals, categoryScore) {
  const positives = [];
  const penalties = [];
  const relevantResourcePages = (signals.page_types_count?.resource || 0) + (signals.page_types_count?.case_study || 0);
  const serviceCoverage = signals.service_pages_found >= 5 ? 6 : signals.service_pages_found >= 2 ? 4 : signals.service_pages_found >= 1 ? 2 : 0;
  const faqCoverage = signals.faq_pages_found >= 1 || signals.hasFaq ? 5 : 0;
  const locationCoverage = signals.location_pages_found >= 1 ? 3 : 0;
  const resourceCoverage = relevantResourcePages >= 5 ? 4 : relevantResourcePages >= 2 ? 3 : relevantResourcePages >= 1 ? 1 : 0;
  const headingCoverage = signals.headingCoverage >= 0.75 ? 6 : signals.headingCoverage >= 0.45 ? 3 : 0;
  const contentDepth =
    signals.totalWords >= 5000 ? 8 : signals.totalWords >= 2500 ? 6 : signals.totalWords >= 1200 ? 4 : signals.totalWords >= 650 ? 2 : 0;
  const pageDiversity = signals.distinctPageTypes >= 6 ? 4 : signals.distinctPageTypes >= 4 ? 3 : signals.distinctPageTypes >= 3 ? 1 : 0;

  add(positives, "Claritate homepage", signals.homepageClarityScore || 0, signals.homepageClear, { max: 25 });
  add(positives, "Calitatea paginilor de servicii/produse", signals.serviceQualityScore || 0, signals.hasServicesPage, { max: 25 });
  add(positives, "Acoperire pagini servicii", serviceCoverage, serviceCoverage > 0, { sourceValue: signals.service_pages_found || 0 });
  add(positives, "FAQ sau întrebări reale detectate", faqCoverage, faqCoverage > 0);
  add(positives, "Pagini de locație / zone deservite", locationCoverage, locationCoverage > 0, { sourceValue: signals.location_pages_found || 0 });
  add(positives, "Resurse, articole sau studii de caz relevante", resourceCoverage, resourceCoverage > 0, { sourceValue: relevantResourcePages });
  add(positives, "Mențiuni de locație / piață", signals.hasLocationMention ? 6 : 0, signals.hasLocationMention);
  add(positives, "FAQ real în conținut", signals.hasFaq ? 8 : 0, signals.hasFaq);
  add(positives, "Structură de heading-uri", headingCoverage, headingCoverage > 0, { sourceValue: signals.headingCoverage });
  add(positives, "Profunzime conținut", contentDepth, contentDepth > 0, { sourceValue: signals.totalWords });
  add(positives, "Diversitate tipuri de pagini", pageDiversity, pageDiversity > 0, { sourceValue: signals.distinctPageTypes });

  add(penalties, "Conținut repetitiv, generic sau prea subțire", -10, signals.hasRepetitiveOrGenericContent);

  return {
    label: "Înțelegerea Website-ului",
    weight: "25%",
    rawPositivePoints: sum(positives),
    rawPenaltyPoints: sum(penalties.filter((item) => item.detected)),
    finalCategoryScore: categoryScore,
    positives: positives.filter((item) => item.detected),
    negatives: [
      ...positives.filter((item) => !item.detected).map((item) => ({ label: `Lipsește: ${item.label}`, value: 0 })),
      ...penalties.filter((item) => item.detected)
    ],
    bonuses: positives.filter((item) => item.detected),
    penalties: penalties.filter((item) => item.detected)
  };
}

function buildEntityConfidence(signals, categoryScore) {
  const external = signals.externalPresence || {};
  const points = external.subScores?.points || {
    entityDiscovery: Math.round((external.subScores?.entityDiscovery || 0) / 4),
    sourceDiversity: Math.round((external.subScores?.sourceDiversity || 0) / 4),
    entityConsistency: Math.round((external.subScores?.entityConsistency || 0) / 4),
    externalValidation: Math.round((external.subScores?.externalValidation || 0) / 4)
  };
  const positives = [];
  const negatives = [];

  add(positives, "Descoperire publică a entității", points.entityDiscovery || 0, (points.entityDiscovery || 0) > 0, { max: 25 });
  add(positives, "Diversitate surse externe", points.sourceDiversity || 0, (points.sourceDiversity || 0) > 0, { max: 25, sourceValue: external.sourceTypes || [] });
  add(positives, "Consistență identitate", points.entityConsistency || 0, (points.entityConsistency || 0) > 0, { max: 25 });
  add(positives, "Validare externă", points.externalValidation || 0, (points.externalValidation || 0) > 0, { max: 25 });

  if (!external.hasAnyExternalSignal) negatives.push({ label: "Nu există footprint extern verificabil", value: 0 });
  if (external.discovery?.discovered && !external.discovery?.concreteDiscovered) negatives.push({ label: "Brand exact gasit, dar fara vizibilitate externa independenta", value: 0 });
  if (!external.entitySignals?.brandConfidence) negatives.push({ label: "Brandul nu poate fi extras cu încredere", value: 0 });
  if (!external.entitySignals?.hasDomainConnectedProfiles) negatives.push({ label: "Nu există profiluri externe conectate clar la domeniu", value: 0 });
  if ((external.sourceTypes || []).length < 3) negatives.push({ label: "Diversitate redusă de surse externe", value: 0 });

  return {
    label: "Încredere în Entitate",
    weight: "30%",
    rawPositivePoints: sum(positives),
    rawPenaltyPoints: 0,
    finalCategoryScore: categoryScore,
    positives: positives.filter((item) => item.detected),
    negatives,
    bonuses: positives.filter((item) => item.detected),
    penalties: []
  };
}

function buildMarketAuthority(signals) {
  const debug = signals.market_authority_debug || signals.marketAuthority?.debug || {};
  const positives = [];
  const negatives = [];

  [
    ["Source Diversity", "sourceDiversity"],
    ["Source Quality", "sourceQuality"],
    ["Brand Discovery Strength", "brandDiscoveryStrength"],
    ["Authority Platform Score", "authorityPlatformScore"],
    ["Local / Review Verification", "localReviewVerification"]
  ].forEach(([label, key]) => add(positives, label, debug[key] || 0, (debug[key] || 0) > 0));

  if (debug.shareLinksIgnored > 0) negatives.push({ label: `Linkuri de share ignorate: ${debug.shareLinksIgnored}`, value: 0 });
  if (debug.weakProfilesDetected > 0) negatives.push({ label: `Profiluri sociale slabe/generice: ${debug.weakProfilesDetected}`, value: 0 });
  if (debug.externalMentionDomains > 0) positives.push({
    label: `Mențiuni externe pe domenii terțe`,
    value: 0,
    detected: true,
    sourceValue: debug.externalMentionExamples || []
  });
  if (!debug.ratingValue) negatives.push({ label: "Rating exact nedetectat pasiv", value: 0 });
  if (!debug.reviewCount) negatives.push({ label: "Număr recenzii nedetectat pasiv", value: 0 });
  if (!debug.hasConcreteExternalAuthority) negatives.push({ label: "Fara autoritate externa reala: doar website sau brand lookup", value: 0 });
  if ((debug.matchedQueries || 0) > 0 && (debug.independentMatchedQueries || 0) === 0) negatives.push({ label: "Brandul apare doar in cautari exacte, nu in surse independente validate", value: 0 });
  if ((debug.matchedQueries || 0) < 3) negatives.push({ label: "Frecvență redusă a mențiunilor publice", value: 0 });
  if (!debug.city || !debug.serviceCategory) negatives.push({ label: "Orașul sau categoria businessului nu sunt suficient de clare", value: 0 });

  return {
    label: "Market Authority",
    weight: "25%",
    rawPositivePoints: sum(positives),
    rawPenaltyPoints: 0,
    finalCategoryScore: signals.marketAuthorityScore || 0,
    positives: positives.filter((item) => item.detected),
    negatives,
    bonuses: positives.filter((item) => item.detected),
    penalties: []
  };
}

function buildTrustAuthority(signals, categoryScore) {
  const debug = signals.trust_authority_debug || {};
  const positives = [];
  const negatives = [];

  [
    ["Telefon detectat", "phone"],
    ["Email detectat", "email"],
    ["Pagină de contact", "contactPage"],
    ["Pagină despre / identitate business", "aboutPage"],
    ["Adresă sau locație", "addressLocation"],
    ["Identitate business", "businessIdentity"],
    ["Schema markup", "schema"],
    ["Recenzii / testimoniale", "reviewsTestimonials"],
    ["Credentiale / certificări / parteneri", "credentials"],
    ["Pagină legal/privacy", "legalPage"],
    ["Consistență NAP", "napConsistency"],
    ["Semnale externe de încredere", "externalTrustSignals"]
  ].forEach(([label, key]) => add(positives, label, debug[key] || 0, (debug[key] || 0) > 0));

  positives.filter((item) => !item.detected).forEach((item) => negatives.push({ label: `Lipsește: ${item.label}`, value: 0 }));

  return {
    label: "Încredere & Autoritate",
    weight: "15%",
    rawPositivePoints: debug.total || sum(positives),
    rawPenaltyPoints: 0,
    finalCategoryScore: categoryScore,
    positives: positives.filter((item) => item.detected),
    negatives,
    bonuses: positives.filter((item) => item.detected),
    penalties: []
  };
}

function buildTechnicalDiscovery(signals, categoryScore) {
  const debug = signals.technical_discovery_debug || {};
  const positives = [];
  const negatives = [];

  [
    ["Homepage accesibil", "homepageAccessible"],
    ["Cel puțin o pagină analizată", "pagesAnalyzed"],
    ["Acoperire pagini 2xx", "successfulPages"],
    ["Linkuri interne detectate", "internalLinks"],
    ["Sitemap detectat", "sitemap"],
    ["Robots.txt detectat", "robots"],
    ["Fișier AI-ready / llms.txt detectat", "aiReadyFiles"],
    ["Diversitate tipuri de pagini", "pageTypeDiversity"],
    ["Profunzime crawl", "crawlDepth"]
  ].forEach(([label, key]) => add(positives, label, debug[key] || 0, (debug[key] || 0) > 0));

  if (debug.notes?.missingSitemapPenaltyOnly) negatives.push({ label: "Sitemap lipsă: penalizare mică, nu colapsează scorul", value: 0 });
  if (debug.notes?.missingRobotsPenaltyOnly) negatives.push({ label: "Robots.txt lipsă: penalizare mică, nu colapsează scorul", value: 0 });
  if (!signals.aiReadinessFiles?.found) negatives.push({ label: "Lipsește: fișier AI-ready / llms.txt", value: 0 });
  positives.filter((item) => !item.detected && !["Sitemap detectat", "Robots.txt detectat", "Fișier AI-ready / llms.txt detectat"].includes(item.label)).forEach((item) => {
    negatives.push({ label: `Lipsește: ${item.label}`, value: 0 });
  });

  return {
    label: "Descoperire Tehnică",
    weight: "5%",
    rawPositivePoints: debug.rawTotal || debug.total || sum(positives),
    rawPenaltyPoints: 0,
    finalCategoryScore: categoryScore,
    positives: positives.filter((item) => item.detected),
    negatives,
    bonuses: positives.filter((item) => item.detected),
    penalties: []
  };
}

function buildScoreBreakdown({ finalScore, categoryScores, signals }) {
  const marketAuthorityScore = signals.marketAuthorityScore || 0;
  const baseScore = signals.baseScore ?? roundScore(
    categoryScores.businessUnderstanding * finalWeights.businessUnderstanding +
      categoryScores.onlinePresence * finalWeights.onlinePresence +
      marketAuthorityScore * finalWeights.marketAuthority +
      categoryScores.trustAuthority * finalWeights.trustAuthority +
      categoryScores.discoverability * finalWeights.discoverability
  );
  const categories = {
    businessUnderstanding: buildWebsiteUnderstanding(signals, categoryScores.businessUnderstanding),
    onlinePresence: buildEntityConfidence(signals, categoryScores.onlinePresence),
    marketAuthority: buildMarketAuthority(signals),
    trustAuthority: buildTrustAuthority(signals, categoryScores.trustAuthority),
    discoverability: buildTechnicalDiscovery(signals, categoryScores.discoverability)
  };
  Object.entries(categories).forEach(([key, category]) => {
    const diagnostics = signals.categoryDiagnostics?.[key];
    category.confidence = diagnostics?.confidence || "Medium";
    category.unknownSignals = diagnostics?.unknownSignals || [];
    category.missingSignals = diagnostics?.missingSignals || category.negatives.map((item) => item.label);
    category.positiveSignalKeys = diagnostics?.positiveSignals || [];
  });
  const contributions = Object.fromEntries(
    Object.entries({
      businessUnderstanding: categoryScores.businessUnderstanding,
      onlinePresence: categoryScores.onlinePresence,
      marketAuthority: marketAuthorityScore,
      trustAuthority: categoryScores.trustAuthority,
      discoverability: categoryScores.discoverability
    }).map(([key, score]) => [
      key,
      {
        categoryScore: score,
        weight: finalWeights[key],
        contribution: roundScore(score * finalWeights[key]),
        exactContribution: Number((score * finalWeights[key]).toFixed(2))
      }
    ])
  );
  const caps = signals.appliedCaps || [];
  const notHigher = [
    ...Object.values(categories).flatMap((category) =>
      category.unknownSignals.map((signal) => `${category.label}: ${signal} este necunoscut`)
    ),
    ...Object.values(categories).flatMap((category) =>
      category.negatives.slice(0, 4).map((signal) => `${category.label}: ${signal.label}`)
    ),
    ...caps.map((cap) => `Cap aplicat: ${cap.reason}`)
  ].slice(0, 12);
  const notLower = Object.values(categories)
    .flatMap((category) => category.positives.slice(0, 4).map((signal) => `${category.label}: ${signal.label} (+${signal.value})`))
    .slice(0, 12);

  return {
    finalScore,
    baseScore,
    categoryScores: {
      ...categoryScores,
      marketAuthority: marketAuthorityScore
    },
    finalFormula: {
      weights: finalWeights,
      contributions,
      math: `${categoryScores.businessUnderstanding}*0.25 + ${categoryScores.onlinePresence}*0.30 + ${marketAuthorityScore}*0.25 + ${categoryScores.trustAuthority}*0.15 + ${categoryScores.discoverability}*0.05 = ${baseScore}`
    },
    capsApplied: caps,
    categories,
    confidence: Object.fromEntries(Object.entries(categories).map(([key, category]) => [key, category.confidence])),
    whyScoreIsNotHigher: notHigher,
    whyScoreIsNotLower: notLower,
    allPositiveSignals: Object.values(categories).flatMap((category) => category.positives.map((item) => ({ category: category.label, ...item }))),
    allNegativeSignals: Object.values(categories).flatMap((category) => category.negatives.map((item) => ({ category: category.label, ...item }))),
    allUnknownSignals: Object.values(categories).flatMap((category) => category.unknownSignals.map((item) => ({ category: category.label, label: item, value: null }))),
    allBonuses: Object.values(categories).flatMap((category) => category.bonuses.map((item) => ({ category: category.label, ...item }))),
    allPenalties: Object.values(categories).flatMap((category) => category.penalties.map((item) => ({ category: category.label, ...item })))
  };
}

export { buildScoreBreakdown };
