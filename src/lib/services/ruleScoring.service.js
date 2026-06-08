import { getDomain } from "../utils/url.js";
import { clamp, roundScore, scoreRatio } from "../utils/scoring.js";
import { inspectRobots } from "./robots.service.js";
import { discoverSitemap } from "./sitemap.service.js";
import { fetchPage, checkUrlAccessible } from "./pageFetch.service.js";
import { extractPage } from "./contentExtract.service.js";
import { selectImportantPages } from "./pageDiscovery.service.js";
import { evaluateExternalPresence, extractBrandName } from "./externalPresence.service.js";
import { buildScoreBreakdown } from "./scoreBreakdown.service.js";
import { inspectAiReadinessFiles } from "./aiReadinessFiles.service.js";

function any(pages, predicate) {
  return pages.some(predicate);
}

function sum(pages, selector) {
  return pages.reduce((total, page) => total + selector(page), 0);
}

function uniqueFlat(values) {
  return Array.from(new Set(values.flat().filter(Boolean)));
}

function getAllSocialLinks(pages) {
  return {
    facebook: uniqueFlat(pages.map((page) => page.socialLinks.facebook)),
    instagram: uniqueFlat(pages.map((page) => page.socialLinks.instagram)),
    linkedin: uniqueFlat(pages.map((page) => page.socialLinks.linkedin)),
    tiktok: uniqueFlat(pages.map((page) => page.socialLinks.tiktok || [])),
    youtube: uniqueFlat(pages.map((page) => page.socialLinks.youtube))
  };
}

function includesPattern(text = "", pattern) {
  return pattern.test(String(text).toLowerCase());
}

function getQuestionCount(page) {
  const text = `${page.title || ""} ${page.h1 || ""} ${page.textSample || ""}`;
  return (text.match(/\?/g) || []).length;
}

function hasQuestionHeading(page) {
  return page.headings.some((heading) =>
    /^(ce|cum|cat|cât|cand|când|unde|de ce|care|cine)\b|\?/.test(heading.text.toLowerCase())
  );
}


function getHomepageClarityScoreV2(homepage) {
  if (!homepage || !homepage.ok) {
    return 0;
  }

  const text = `${homepage.title} ${homepage.h1} ${homepage.textSample}`.toLowerCase();
  let score = 0;

  if (homepage.signals.hasTitle && homepage.signals.hasH1) score += 3;
  if (homepage.wordCount >= 600) score += 5;
  else if (homepage.wordCount >= 300) score += 4;
  else if (homepage.wordCount >= 150) score += 2;
  if (homepage.signals.hasServiceContent || includesPattern(text, /servicii|produse|solutii|soluții|platforma|platformă|cabinet|clinica|clinică|agentie|agenție|consultanta|consultanță/)) score += 6;
  if (includesPattern(text, /pentru|ajutam|ajutăm|clienti|clienți|companii|afaceri|antreprenori|pacienti|pacienți|local|romania|românia|bucuresti|bucurești|cluj|iasi|iași|timisoara|timișoara/)) score += 4;
  if (homepage.signals.hasLocationMention) score += 3;
  if (homepage.signals.hasDifferentiation) score += 3;
  if (homepage.signals.hasHeadingStructure) score += 1;

  return clamp(score, 0, 25);
}

function getServiceQualityScoreV2(pages) {
  const servicePages = pages.filter((page) => page.pageType === "services" || page.signals.hasServiceContent);
  if (!servicePages.length) {
    return 0;
  }

  const best = servicePages.reduce((top, page) => (page.wordCount > top.wordCount ? page : top), servicePages[0]);
  let score = servicePages.some((page) => page.pageType === "services") ? 6 : 3;

  if (best.wordCount >= 900) score += 8;
  else if (best.wordCount >= 600) score += 7;
  else if (best.wordCount >= 350) score += 5;
  else if (best.wordCount >= 180) score += 3;
  if (servicePages.length >= 5) score += 4;
  else if (servicePages.length >= 2) score += 3;
  if (best.signals.hasHeadingStructure) score += 3;
  if (best.signals.hasDifferentiation) score += 2;
  if (best.signals.hasFaqContent || getQuestionCount(best) >= 2) score += 2;

  return clamp(score, 0, 25);
}

function hasRealFaq(pages) {
  return pages.some((page) => {
    const text = `${page.url} ${page.title} ${page.h1} ${page.textSample}`.toLowerCase();
    const hasFaqContext = /faq|intrebari-frecvente|întrebări-frecvente|intrebari frecvente|întrebări frecvente|q&a|questions/.test(text);
    const questionHeadings = page.headings.filter((heading) =>
      /^(ce|cum|cat|cât|cand|când|unde|de ce|care|cine)\b|\?/.test(heading.text.toLowerCase())
    ).length;
    const hasFaqSchema = page.schema.types.some((type) => /faqpage/i.test(type));

    return hasFaqSchema || (hasFaqContext && (questionHeadings >= 2 || getQuestionCount(page) >= 3));
  });
}

function hasMeaningfulAbout(pages) {
  return pages.some((page) => {
    const aboutUrl = /\/(despre|about|echipa|companie|cine-suntem)(\/|$|-)/i.test(page.url);

    if (!aboutUrl) {
      return false;
    }

    const text = `${page.title} ${page.h1} ${page.textSample}`.toLowerCase();
    return page.wordCount >= 160 && /echipa|companie|despre|misiune|experienta|experiență|fondat|istoric|valori|cine suntem/.test(text);
  });
}

function getContactMethodsCount(pages) {
  const hasPhone = any(pages, (page) => page.signals.hasPhone);
  const hasEmail = any(pages, (page) => page.signals.hasEmail);
  const hasAddress = any(pages, (page) => page.signals.hasAddress);
  const hasContactPage = any(pages, (page) => page.pageType === "contact" || page.signals.hasContactContent);

  return [hasPhone, hasEmail, hasAddress, hasContactPage].filter(Boolean).length;
}

function hasRepetitiveOrGenericContent(pages) {
  const successfulPages = pages.filter((page) => page.ok);
  const titles = successfulPages.map((page) => String(page.title || "").trim().toLowerCase()).filter(Boolean);
  const uniqueTitles = new Set(titles);
  const genericTitles = titles.filter((title) => /home|homepage|welcome|bun venit|index|untitled/.test(title)).length;
  const thinPages = successfulPages.filter((page) => page.wordCount < 120).length;

  return (
    (titles.length >= 3 && uniqueTitles.size <= Math.ceil(titles.length / 2)) ||
    genericTitles >= 2 ||
    thinPages >= Math.max(2, Math.ceil(successfulPages.length / 2))
  );
}

function getAggregateSignals(context) {
  const pages = context.pages;
  const discoveryStats = context.discoveryStats || {};
  const successfulPages = pages.filter((page) => page.ok);
  const homepage = pages[0];
  const socialLinks = getAllSocialLinks(pages);
  const schemaTypes = uniqueFlat(pages.map((page) => page.schema.types));
  const sameAs = uniqueFlat(pages.map((page) => page.schema.sameAs));
  const directoryLinks = uniqueFlat(pages.map((page) => page.directoryLinks));
  const externalLinks = uniqueFlat(pages.map((page) => page.externalLinks));
  const ratingValues = pages.map((page) => page.ratingData?.ratingValue ?? page.schema?.ratingValue).filter((value) => value !== null && value !== undefined).map(Number).filter(Number.isFinite);
  const reviewCounts = pages.map((page) => page.ratingData?.reviewCount ?? page.schema?.reviewCount).filter((value) => value !== null && value !== undefined).map(Number).filter(Number.isFinite);
  const meaningfulAbout = hasMeaningfulAbout(pages);
  const contactMethodsCount = getContactMethodsCount(pages);
  const realFaq = hasRealFaq(pages);
  const serviceQualityScore = getServiceQualityScoreV2(pages);
  const homepageClarityScore = getHomepageClarityScoreV2(homepage);

  return {
    robotsFound: context.robots.found,
    sitemapFound: context.sitemap.found,
    homepageAccessible: Boolean(homepage?.ok),
    pagesAnalyzed: pages.length,
    total_pages_discovered: discoveryStats.totalPagesDiscovered || pages.length,
    total_pages_analyzed: discoveryStats.totalPagesAnalyzed || pages.length,
    page_types_count: discoveryStats.pageTypesCount || {},
    discovered_page_types_count: discoveryStats.discoveredPageTypesCount || {},
    blog_pages_found: discoveryStats.blogPagesFound || 0,
    blog_pages_analyzed: discoveryStats.blogPagesAnalyzed || 0,
    service_pages_found: discoveryStats.servicePagesFound || 0,
    location_pages_found: discoveryStats.locationPagesFound || 0,
    faq_pages_found: discoveryStats.faqPagesFound || 0,
    successfulPages: successfulPages.length,
    enoughImportantPages: successfulPages.length >= 3,
    allPagesOk: pages.length > 0 && pages.every((page) => page.ok),
    internalLinksFound: uniqueFlat(pages.map((page) => page.internalLinks || [])).length > 0,
    hasKeyInternalLinks: Boolean(homepage?.internalLinks?.some((link) => /servicii|services|produse|products|despre|about|contact|faq|blog|resurse/i.test(link))),

    titleCoverage: scoreRatio(pages.filter((page) => page.signals.hasTitle).length, pages.length),
    metaCoverage: scoreRatio(pages.filter((page) => page.signals.hasMetaDescription).length, pages.length),
    h1Coverage: scoreRatio(pages.filter((page) => page.signals.hasH1).length, pages.length),
    headingCoverage: scoreRatio(pages.filter((page) => page.signals.hasHeadingStructure).length, pages.length),
    totalWords: sum(pages, (page) => page.wordCount),
    homepageClarityScore,
    homepageClear: homepageClarityScore >= 17,

    hasServicesPage: any(pages, (page) => page.pageType === "services" || page.signals.hasServiceContent),
    serviceQualityScore,
    hasDescriptiveServices: serviceQualityScore >= 17,
    hasAboutPage: any(pages, (page) => page.pageType === "about" || page.signals.hasAboutContent),
    hasMeaningfulAbout: meaningfulAbout,
    hasContactPage: any(pages, (page) => page.pageType === "contact" || page.signals.hasContactContent),
    hasResourcePage: any(pages, (page) => page.pageType === "resource"),
    hasFaq: realFaq,
    hasLocationMention: any(pages, (page) => page.signals.hasLocationMention),
    hasDifferentiation: any(pages, (page) => page.signals.hasDifferentiation),
    distinctPageTypes: new Set(pages.map((page) => page.pageType)).size,
    hasRepetitiveOrGenericContent: hasRepetitiveOrGenericContent(pages),

    contactMethodsCount,
    hasContactInfo: contactMethodsCount >= 2,
    hasPhone: any(pages, (page) => page.signals.hasPhone),
    hasEmail: any(pages, (page) => page.signals.hasEmail),
    hasAddress: any(pages, (page) => page.signals.hasAddress),
    hasBusinessIdentity: meaningfulAbout || any(pages, (page) => page.schema.hasOrganization || page.schema.hasLocalBusiness),
    hasTestimonials: any(pages, (page) => page.signals.hasTestimonials),
    hasCredentials: any(pages, (page) => page.signals.hasCredentials),
    hasLegalPage: any(pages, (page) => page.signals.hasLegalContent || /privacy|confidentialitate|confidențialitate|gdpr|termeni|cookies/i.test(page.url)),
    hasSchema: any(pages, (page) => page.schema.hasSchema),
    hasOrganizationSchema: any(pages, (page) => page.schema.hasOrganization),
    hasLocalBusinessSchema: any(pages, (page) => page.schema.hasLocalBusiness),
    hasNapConsistency: any(pages, (page) => page.signals.hasPhone) && any(pages, (page) => page.signals.hasAddress),
    hasTrustSignals: contactMethodsCount >= 2 || meaningfulAbout || any(pages, (page) => page.signals.hasTestimonials || page.signals.hasCredentials),

    socialLinks,
    hasFacebook: socialLinks.facebook.length > 0,
    hasInstagram: socialLinks.instagram.length > 0,
    hasLinkedin: socialLinks.linkedin.length > 0,
    hasTiktok: socialLinks.tiktok.length > 0,
    hasYoutube: socialLinks.youtube.length > 0,
    hasSameAs: sameAs.length > 0,
    sameAs,
    hasMapsSignal: any(pages, (page) => page.signals.hasMapsSignal),
    hasDirectoryLinks: directoryLinks.length > 0,
    directoryLinks,
    hasReviewIndicators: any(pages, (page) => page.signals.hasReviewSignal || page.signals.hasTestimonials),
    passiveRatingValue: ratingValues.length ? Math.max(...ratingValues) : null,
    passiveReviewCount: reviewCounts.length ? Math.max(...reviewCounts) : null,
    hasExternalMentions: externalLinks.some((link) => !/facebook|instagram|linkedin|tiktok|youtube|youtu\.be|google\./i.test(link)),
    schemaTypes,

    hasNoindex: any(pages, (page) => page.signals.hasNoindex),
    homepageHasNoindex: Boolean(pages[0]?.signals?.hasNoindex),
    hasCanonical: any(pages, (page) => page.signals.hasCanonical),
    hasDirectAnswerPositioning: Boolean(pages[0]?.signals?.hasDirectAnswerPositioning),
    hasBreadcrumbSchema: any(pages, (page) => page.signals.hasBreadcrumbSchema),
    hasArticleWithAuthor: any(pages, (page) => page.signals.hasArticleSchema && page.signals.hasAuthorSchema),
    hasDateModifiedSchema: any(pages, (page) => page.signals.hasDateModifiedSchema),
    sitemapHasLastmod: Boolean(context.sitemap.hasLastmod)
  };
}

async function checkSocialAccessibility(signals) {
  const links = [
    ...signals.socialLinks.facebook.slice(0, 1),
    ...signals.socialLinks.instagram.slice(0, 1),
    ...signals.socialLinks.linkedin.slice(0, 1),
    ...signals.socialLinks.tiktok.slice(0, 1),
    ...signals.socialLinks.youtube.slice(0, 1)
  ].slice(0, 5);

  if (links.length === 0) {
    return false;
  }

  const checks = await Promise.all(links.map((link) => checkUrlAccessible(link)));
  return checks.some(Boolean);
}

function hasGoogleBusinessSignal(signals) {
  const google = signals.externalPresence?.googleBusiness;
  return Boolean(
    google?.hasMapsLink ||
      google?.hasEmbeddedMap ||
      google?.hasGPage ||
      google?.hasLocalBusinessSchema ||
      google?.hasReviewMentions ||
      signals.hasMapsSignal ||
      signals.hasLocalBusinessSchema
  );
}

function getTechnicalDiscoveryDebug(signals) {
  const analyzedTypesCount = Object.keys(signals.page_types_count || {}).length || signals.distinctPageTypes || 0;
  const statusCoverage = signals.pagesAnalyzed ? signals.successfulPages / signals.pagesAnalyzed : 0;
  const debug = {
    homepageAccessible: signals.homepageAccessible ? 12 : 0,
    pagesAnalyzed: signals.pagesAnalyzed >= 20 ? 18 : signals.pagesAnalyzed >= 10 ? 14 : signals.pagesAnalyzed >= 3 ? 8 : signals.pagesAnalyzed > 0 ? 4 : 0,
    successfulPages: statusCoverage >= 0.95 && signals.successfulPages >= 5 ? 18 : statusCoverage >= 0.8 ? 14 : signals.successfulPages > 0 ? 8 : 0,
    internalLinks: signals.hasKeyInternalLinks ? 12 : signals.internalLinksFound ? 8 : 0,
    sitemap: signals.sitemapFound ? 4 : 0,
    robots: signals.robotsFound ? 2 : 0,
    aiReadyFiles: signals.aiReadinessFiles?.found ? Math.min(6, Math.ceil((signals.aiReadinessFiles.score || 0) * 0.3)) : 0,
    pageTypeDiversity: analyzedTypesCount >= 6 ? 14 : analyzedTypesCount >= 4 ? 10 : analyzedTypesCount >= 3 ? 6 : analyzedTypesCount >= 2 ? 3 : 0,
    crawlDepth: signals.total_pages_discovered >= 50 && signals.pagesAnalyzed >= 20 ? 10 : signals.total_pages_discovered >= 10 && signals.pagesAnalyzed >= 10 ? 6 : 0,
    canonical: signals.hasCanonical ? 3 : 0,
    sitemapLastmod: signals.sitemapHasLastmod ? 2 : 0,
    breadcrumbSchema: signals.hasBreadcrumbSchema ? 2 : 0,
    dateModified: signals.hasDateModifiedSchema ? 2 : 0,
    noindexPenalty: signals.homepageHasNoindex ? -15 : signals.hasNoindex ? -5 : 0
  };

  const total = Object.values(debug).reduce((sum, value) => sum + value, 0);

  return {
    ...debug,
    total: roundScore(total),
    rawTotal: total,
    notes: {
      missingSitemapPenaltyOnly: !signals.sitemapFound,
      missingRobotsPenaltyOnly: !signals.robotsFound
    }
  };
}

function getTrustAuthorityDebug(signals) {
  const external = signals.externalPresence;
  const debug = {
    phone: signals.hasPhone ? 5 : 0,
    email: signals.hasEmail ? 5 : 0,
    contactPage: signals.hasContactPage ? 7 : 0,
    aboutPage: signals.hasMeaningfulAbout ? 8 : signals.hasAboutPage ? 4 : 0,
    addressLocation: signals.hasAddress ? 6 : signals.hasLocationMention ? 3 : 0,
    businessIdentity: signals.hasBusinessIdentity ? 6 : 0,
    schema: signals.hasOrganizationSchema || signals.hasLocalBusinessSchema ? 10 : signals.hasSchema ? 5 : 0,
    reviewsTestimonials: signals.hasReviewIndicators || signals.hasTestimonials ? 8 : 0,
    credentials: signals.hasCredentials ? 6 : 0,
    legalPage: signals.hasLegalPage ? 4 : 0,
    napConsistency: signals.hasNapConsistency ? 5 : 0,
    externalTrustSignals: external?.subScores?.externalValidation ? Math.round(external.subScores.externalValidation * 0.08) : 0
  };

  return {
    ...debug,
    total: Object.values(debug).reduce((total, value) => total + value, 0)
  };
}

function calculateMarketAuthorityScore(signals) {
  const external = signals.externalPresence || {};
  const google = external.googleBusiness || {};
  const sourceTypes = external.sourceTypes || [];
  const discovery = external.discovery || {};
  const socialQuality = external.socialProfileQuality || {};
  const ratingValue = google.ratingValue ?? null;
  const reviewCount = google.reviewCount ?? null;
  const confirmedMaps = google.hasMapsLink || google.hasEmbeddedMap || google.hasGPage;
  const inferredMaps = !confirmedMaps && (google.hasLocalBusinessSchema || signals.hasMapsSignal || signals.hasLocalBusinessSchema);
  const hasConfirmedReviewData = Boolean(ratingValue || reviewCount || google.hasAggregateRating);
  const hasReviewStrength = hasConfirmedReviewData || google.hasReviewMentions || signals.hasReviewIndicators;
  const hasVerifiedReviewSource = Boolean(google.hasAggregateRating || reviewCount > 0 || (confirmedMaps && google.hasReviewMentions));
  const hasCityConfidence = Boolean(external.city || signals.location_pages_found > 0 || signals.hasLocationMention);
  const hasCategoryConfidence = Boolean(external.serviceCategory || signals.hasDescriptiveServices || signals.service_pages_found > 0);
  const authorityPlatformCount = Object.keys(external.authorityLinks || {}).length;
  const externalMentionDomains = discovery.externalMentionDomains || [];
  const externalMentionCount = externalMentionDomains.length;
  const officialSocialPlatforms = socialQuality.officialPlatforms || [];
  const officialProfileCount = socialQuality.officialCount || 0;
  const weakProfileCount = socialQuality.weakCount || 0;
  const shareLinkCount = socialQuality.shareCount || 0;
  const hasConcreteExternalAuthority = Boolean(
    officialProfileCount > 0 ||
      confirmedMaps ||
      authorityPlatformCount > 0 ||
      externalMentionCount > 0 ||
      hasVerifiedReviewSource
  );
  const sourceQualityRaw = clamp(
      (socialQuality.qualityPoints || 0) +
      (confirmedMaps ? 8 : 0) +
      (hasVerifiedReviewSource ? 5 : 0) +
      (authorityPlatformCount >= 2 ? 6 : authorityPlatformCount === 1 ? 3 : 0) +
      (externalMentionCount >= 4 ? 5 : externalMentionCount >= 2 ? 3 : externalMentionCount === 1 ? 1 : 0),
    0,
    25
  );
  const realSourceTypes = [
    "website",
    officialSocialPlatforms.length > 0 ? "official_social" : null,
    confirmedMaps ? "confirmed_maps" : inferredMaps ? "inferred_maps" : null,
    hasReviewStrength ? "reviews" : null,
    authorityPlatformCount > 0 ? "authority_platforms" : null,
    externalMentionCount > 0 ? "external_mentions" : null,
    discovery.sourceTypes?.includes("news") ? "news" : null,
    discovery.sourceTypes?.includes("directories") ? "directories" : null,
    discovery.discovered ? "search_discovery" : null
  ].filter(Boolean);
  const sourceDiversityRaw = clamp(
    (hasConcreteExternalAuthority ? 2 : 0) +
      Math.min(officialSocialPlatforms.length, 3) * 3 +
      (confirmedMaps ? 5 : 0) +
      (hasVerifiedReviewSource ? 3 : 0) +
      (authorityPlatformCount > 0 ? 4 : 0) +
      (externalMentionCount >= 3 ? 3 : externalMentionCount > 0 ? 1 : 0) +
      (discovery.concreteDiscovered ? 2 : 0),
    0,
    20
  );
  const uniqueDiscoverySourceTypes = (discovery.sourceTypes || []).length;
  const brandDiscoveryUncapped = clamp(
    (external.entitySignals?.brandConfidence ? 4 : 0) +
      (external.entitySignals?.brandTokens?.some((token) => String(external.domain || "").includes(token)) ? 4 : 0) +
      (discovery.independentMatchedQueries >= 4 ? 7 : discovery.independentMatchedQueries >= 2 ? 5 : discovery.independentMatchedQueries === 1 ? 2 : discovery.matchedQueries > 0 ? 1 : 0) +
      (hasConcreteExternalAuthority ? (uniqueDiscoverySourceTypes >= 4 ? 5 : uniqueDiscoverySourceTypes >= 3 ? 4 : uniqueDiscoverySourceTypes >= 2 ? 2 : uniqueDiscoverySourceTypes === 1 ? 1 : 0) : 0) +
      (externalMentionCount >= 4 ? 3 : externalMentionCount >= 2 ? 2 : externalMentionCount === 1 ? 1 : 0) +
      (external.entitySignals?.hasContactIdentity ? 2 : 0) +
      (external.entitySignals?.hasDomainConnectedProfiles ? 3 : 0),
    0,
    25
  );
  const brandDiscoveryRaw = hasConcreteExternalAuthority ? brandDiscoveryUncapped : Math.min(brandDiscoveryUncapped, 8);
  const authorityPlatformRaw = clamp(
    (authorityPlatformCount >= 4 ? 12 : authorityPlatformCount >= 2 ? 9 : authorityPlatformCount === 1 ? 6 : 0) +
      (externalMentionCount >= 6 ? 6 : externalMentionCount >= 3 ? 4 : externalMentionCount >= 1 ? 2 : 0),
    0,
    15
  );
  const localReviewRaw = clamp(
    (confirmedMaps ? 5 : 0) +
      (google.hasLocalBusinessSchema ? 3 : 0) +
      (ratingValue >= 4.5 ? 3 : ratingValue >= 4 ? 2 : ratingValue ? 1 : 0) +
      (reviewCount >= 50 ? 3 : reviewCount >= 10 ? 2 : reviewCount > 0 ? 1 : 0) +
      (hasVerifiedReviewSource ? 2 : google.hasReviewMentions ? 1 : 0) +
      (hasCityConfidence && hasCategoryConfidence ? 2 : hasCityConfidence || hasCategoryConfidence ? 1 : 0),
    0,
    15
  );

  const debug = {
    sourceDiversity: sourceDiversityRaw,
    sourceQuality: sourceQualityRaw,
    brandDiscoveryStrength: brandDiscoveryRaw,
    authorityPlatformScore: authorityPlatformRaw,
    localReviewVerification: localReviewRaw,
    googleBusinessSignals: confirmedMaps ? 5 : inferredMaps ? 2 : 0,
    reviewSignals: hasVerifiedReviewSource ? 5 : hasReviewStrength ? 1 : 0,
    ratingQuality: ratingValue >= 4.5 ? 3 : ratingValue >= 4 ? 2 : ratingValue ? 1 : 0,
    reviewVolume: reviewCount >= 50 ? 3 : reviewCount >= 10 ? 2 : reviewCount > 0 ? 1 : 0,
    brandMentionFrequency: discovery.independentMatchedQueries >= 4 ? 7 : discovery.independentMatchedQueries >= 2 ? 5 : discovery.independentMatchedQueries === 1 ? 2 : discovery.matchedQueries > 0 ? 1 : 0,
    authorityPlatforms: authorityPlatformRaw,
    shareLinksIgnored: shareLinkCount,
    weakProfilesDetected: weakProfileCount,
    officialProfilesDetected: officialProfileCount,
    externalMentionDomains: externalMentionCount,
    externalMentionExamples: externalMentionDomains.slice(0, 6)
  };
  const rawScore = sourceDiversityRaw + sourceQualityRaw + brandDiscoveryRaw + authorityPlatformRaw + localReviewRaw;
  const cappedRawScore = !hasConcreteExternalAuthority
    ? Math.min(rawScore, 20)
    : !hasVerifiedReviewSource
      ? Math.min(rawScore, 25)
      : rawScore;

  return {
    score: roundScore(clamp(cappedRawScore, 0, 100)),
    debug: {
      ...debug,
      ratingValue,
      reviewCount,
      confirmedMaps,
      inferredMaps,
      hasConfirmedReviewData,
      hasVerifiedReviewSource,
      hasConcreteExternalAuthority,
      sourceTypes,
      realSourceTypes,
      officialSocialPlatforms,
      matchedQueries: discovery.matchedQueries || 0,
      independentMatchedQueries: discovery.independentMatchedQueries || 0,
      exactBrandMatchedQueries: discovery.exactBrandMatchedQueries || 0,
      uniqueDiscoverySourceTypes,
      externalMentionDomains,
      city: external.city || null,
      serviceCategory: external.serviceCategory || null,
      rawBeforeCaps: roundScore(clamp(rawScore, 0, 100)),
      total: roundScore(clamp(cappedRawScore, 0, 100))
    }
  };
}

function confidenceFromCounts({ direct = 0, inferred = 0, unknown = 0 }) {
  if (direct >= 4 && unknown <= 1) return "High";
  if (direct >= 2 || inferred >= 3) return unknown >= 3 ? "Medium" : "High";
  if (direct >= 1 || inferred >= 1) return "Medium";
  return "Low";
}

function buildCategoryDiagnostics(signals, categoryScores) {
  const external = signals.externalPresence || {};
  const google = external.googleBusiness || {};
  const marketDebug = signals.market_authority_debug || {};
  const diagnostics = {
    businessUnderstanding: {
      confidence: confidenceFromCounts({
        direct: [signals.homepageAccessible, signals.hasServicesPage, signals.hasFaq, signals.totalWords >= 650, signals.headingCoverage > 0].filter(Boolean).length,
        inferred: [signals.hasLocationMention, signals.hasDifferentiation, signals.hasResourcePage].filter(Boolean).length,
        unknown: 0
      }),
      positiveSignals: ["homepage", "services", "faq", "contentDepth", "headingStructure"].filter((key) => ({
        homepage: signals.homepageClear,
        services: signals.hasDescriptiveServices,
        faq: signals.hasFaq,
        contentDepth: signals.totalWords >= 650,
        headingStructure: signals.headingCoverage > 0
      })[key]),
      missingSignals: [
        !signals.hasServicesPage ? "service_pages" : null,
        !signals.hasFaq ? "faq_content" : null,
        signals.totalWords < 650 ? "content_depth" : null
      ].filter(Boolean),
      unknownSignals: []
    },
    onlinePresence: {
      confidence: confidenceFromCounts({
        direct: [external.hasAnyExternalSignal, external.entitySignals?.hasDomainConnectedProfiles, external.entitySignals?.hasSameAs, external.concreteExternalSignals > 0].filter(Boolean).length,
        inferred: [external.entitySignals?.hasContactIdentity, external.discovery?.discovered, external.entitySignals?.brandConfidence].filter(Boolean).length,
        unknown: [!external.discovery?.concreteDiscovered ? 1 : 0, !external.hasAnyExternalSignal ? 1 : 0].filter(Boolean).length
      }),
      positiveSignals: external.externalSignalsFound || [],
      missingSignals: [
        !external.hasAnyExternalSignal ? "external_footprint" : null,
        external.discovery?.discovered && !external.discovery?.concreteDiscovered ? "brand_lookup_only" : null
      ].filter(Boolean),
      unknownSignals: [
        !external.discovery?.concreteDiscovered ? "independent_public_discovery_unknown" : null,
        !external.hasAnyExternalSignal ? "external_validation_missing" : null
      ].filter(Boolean)
    },
    marketAuthority: {
      confidence: (() => {
        const unknownCount = [!marketDebug.ratingValue, !marketDebug.reviewCount, !marketDebug.confirmedMaps && marketDebug.inferredMaps].filter(Boolean).length;
        const directCount = [marketDebug.confirmedMaps, marketDebug.hasVerifiedReviewSource, marketDebug.hasConcreteExternalAuthority].filter(Boolean).length;
        const inferredCount = [marketDebug.inferredMaps, marketDebug.matchedQueries >= 2, marketDebug.city, marketDebug.serviceCategory].filter(Boolean).length;
        const baseConfidence = confidenceFromCounts({ direct: directCount, inferred: inferredCount, unknown: unknownCount });
        return unknownCount >= 2 && directCount < 3 ? "Medium" : baseConfidence;
      })(),
      positiveSignals: [
        marketDebug.confirmedMaps ? "confirmed_maps" : null,
        marketDebug.inferredMaps ? "inferred_maps" : null,
        marketDebug.hasVerifiedReviewSource ? "verified_review_source" : null,
        marketDebug.independentMatchedQueries >= 1 ? "independent_brand_mentions" : null,
        marketDebug.matchedQueries >= 1 && marketDebug.independentMatchedQueries < 1 ? "brand_lookup_only" : null,
        (external.sourceTypes || []).length >= 3 ? "source_diversity" : null
      ].filter(Boolean),
      missingSignals: [
        (external.sourceTypes || []).length <= 1 ? "source_diversity" : null,
        !marketDebug.hasConcreteExternalAuthority ? "external_authority_evidence" : null,
        !marketDebug.hasVerifiedReviewSource ? "verified_review_source" : null
      ].filter(Boolean),
      unknownSignals: [
        !google.ratingValue ? "google_rating_unknown" : null,
        !google.reviewCount ? "google_review_count_unknown" : null,
        !marketDebug.confirmedMaps && !marketDebug.inferredMaps ? "google_business_unknown" : null
      ].filter(Boolean)
    },
    trustAuthority: {
      confidence: confidenceFromCounts({
        direct: [signals.hasPhone, signals.hasEmail, signals.hasContactPage, signals.hasAddress, signals.hasMeaningfulAbout, signals.hasSchema].filter(Boolean).length,
        inferred: [signals.hasTestimonials, signals.hasCredentials, signals.hasReviewIndicators].filter(Boolean).length,
        unknown: 0
      }),
      positiveSignals: ["phone", "email", "contact_page", "address", "about_page", "schema", "reviews", "credentials", "legal_page"].filter((key) => ({
        phone: signals.hasPhone,
        email: signals.hasEmail,
        contact_page: signals.hasContactPage,
        address: signals.hasAddress,
        about_page: signals.hasMeaningfulAbout,
        schema: signals.hasSchema,
        reviews: signals.hasReviewIndicators || signals.hasTestimonials,
        credentials: signals.hasCredentials,
        legal_page: signals.hasLegalPage
      })[key]),
      missingSignals: [
        !signals.hasPhone ? "phone" : null,
        !signals.hasEmail ? "email" : null,
        !signals.hasContactPage ? "contact_page" : null,
        !signals.hasAddress ? "address" : null,
        !signals.hasSchema ? "schema" : null
      ].filter(Boolean),
      unknownSignals: []
    },
    discoverability: {
      confidence: confidenceFromCounts({
        direct: [signals.homepageAccessible, signals.pagesAnalyzed > 0, signals.successfulPages > 0, signals.internalLinksFound].filter(Boolean).length,
        inferred: [signals.sitemapFound, signals.robotsFound, Object.keys(signals.page_types_count || {}).length >= 3].filter(Boolean).length,
        unknown: 0
      }),
      positiveSignals: ["homepage_accessible", "pages_analyzed", "2xx_pages", "internal_links", "sitemap", "robots"].filter((key) => ({
        homepage_accessible: signals.homepageAccessible,
        pages_analyzed: signals.pagesAnalyzed > 0,
        "2xx_pages": signals.successfulPages > 0,
        internal_links: signals.internalLinksFound,
        sitemap: signals.sitemapFound,
        robots: signals.robotsFound
      })[key]),
      missingSignals: [
        !signals.internalLinksFound ? "internal_links" : null,
        !signals.sitemapFound ? "sitemap" : null,
        !signals.robotsFound ? "robots" : null
      ].filter(Boolean),
      unknownSignals: []
    }
  };

  return Object.fromEntries(
    Object.entries(diagnostics).map(([key, value]) => [
      key,
      {
        ...value,
        score: key === "marketAuthority" ? signals.marketAuthorityScore || 0 : categoryScores[key]
      }
    ])
  );
}

function calculateCategoryScores(signals) {
  const relevantResourcePages = (signals.page_types_count.resource || 0) + (signals.page_types_count.case_study || 0);
  const coverageBonus =
    (signals.service_pages_found >= 5 ? 6 : signals.service_pages_found >= 2 ? 4 : signals.service_pages_found >= 1 ? 2 : 0) +
    (signals.faq_pages_found >= 1 || signals.hasFaq ? 5 : 0) +
    (signals.location_pages_found >= 1 ? 3 : 0) +
    (relevantResourcePages >= 5 ? 4 : relevantResourcePages >= 2 ? 3 : relevantResourcePages >= 1 ? 1 : 0);

  const technicalDiscoveryDebug = getTechnicalDiscoveryDebug(signals);
  const discoverability = technicalDiscoveryDebug.total;

  const businessUnderstanding =
    signals.homepageClarityScore +
    signals.serviceQualityScore +
    (signals.aiReadinessFiles?.found ? Math.min(5, Math.ceil((signals.aiReadinessFiles.score || 0) * 0.25)) : 0) +
    coverageBonus +
    (signals.hasLocationMention ? 6 : 0) +
    (signals.hasFaq ? 8 : 0) +
    (signals.headingCoverage >= 0.75 ? 6 : signals.headingCoverage >= 0.45 ? 3 : 0) +
    (signals.totalWords >= 5000 ? 8 : signals.totalWords >= 2500 ? 6 : signals.totalWords >= 1200 ? 4 : signals.totalWords >= 650 ? 2 : 0) +
    (signals.distinctPageTypes >= 6 ? 4 : signals.distinctPageTypes >= 4 ? 3 : signals.distinctPageTypes >= 3 ? 1 : 0) +
    (signals.hasDirectAnswerPositioning ? 5 : 0) +
    (signals.hasArticleWithAuthor ? 3 : 0);

  const trustAuthorityDebug = getTrustAuthorityDebug(signals);
  const trustAuthority = trustAuthorityDebug.total;

  const socialProfileCount = [
    signals.hasFacebook,
    signals.hasInstagram,
    signals.hasLinkedin,
    signals.hasTiktok,
    signals.hasYoutube
  ].filter(Boolean).length;

  const fallbackOnlinePresence =
    (socialProfileCount >= 4 ? 18 : socialProfileCount >= 3 ? 14 : socialProfileCount >= 2 ? 9 : socialProfileCount === 1 ? 3 : 0) +
    (signals.hasSameAs ? 12 : 0) +
    (signals.hasMapsSignal ? 12 : 0) +
    (signals.hasDirectoryLinks ? 10 : 0) +
    (signals.hasReviewIndicators ? 10 : 0) +
    (signals.socialProfilesAccessible ? 6 : 0) +
    (signals.hasExternalMentions ? 6 : 0) +
    (signals.hasOrganizationSchema || signals.hasLocalBusinessSchema ? 5 : 0);

  let entityTrust = signals.externalPresence?.score ?? fallbackOnlinePresence;
  if (signals.externalPresence) {
    const external = signals.externalPresence;
    const hasOfficialProfiles = (external.socialProfileQuality?.officialCount || 0) > 0;
    const hasAuthorityLinks = Object.keys(external.authorityLinks || {}).length > 0;
    const hasConfirmedMaps = external.googleBusiness?.hasMapsLink || external.googleBusiness?.hasEmbeddedMap || external.googleBusiness?.hasGPage;
    const hasVerifiedReviews = external.googleBusiness?.hasAggregateRating || external.googleBusiness?.reviewCount > 0 || (hasConfirmedMaps && external.googleBusiness?.hasReviewMentions);
    const hasExternalMentions = (external.discovery?.externalMentionDomains || []).length > 0;
    const hasConcreteExternalEvidence = hasOfficialProfiles || hasAuthorityLinks || hasConfirmedMaps || hasVerifiedReviews || hasExternalMentions || external.discovery?.concreteDiscovered;

    if (!hasConcreteExternalEvidence) entityTrust = Math.min(entityTrust, external.discovery?.discovered ? 35 : 30);
    else if (!hasOfficialProfiles && !hasAuthorityLinks && !hasConfirmedMaps) entityTrust = Math.min(entityTrust, 45);
  }
  signals.technical_discovery_debug = technicalDiscoveryDebug;
  signals.trust_authority_debug = trustAuthorityDebug;

  return {
    discoverability: roundScore(discoverability),
    businessUnderstanding: roundScore(signals.hasRepetitiveOrGenericContent ? businessUnderstanding - 10 : businessUnderstanding),
    trustAuthority: roundScore(trustAuthority),
    onlinePresence: roundScore(entityTrust)
  };
}

function calculateBaseScore(categoryScores, signals = {}) {
  const marketAuthorityScore = signals.marketAuthorityScore ?? signals.marketAuthority?.score ?? 0;

  return roundScore(
    categoryScores.businessUnderstanding * 0.25 +
      categoryScores.onlinePresence * 0.3 +
      marketAuthorityScore * 0.25 +
      categoryScores.trustAuthority * 0.15 +
      categoryScores.discoverability * 0.05
  );
}


function hasOnlinePresence(signals) {
  return (
    signals.hasFacebook ||
    signals.hasInstagram ||
    signals.hasLinkedin ||
    signals.hasTiktok ||
    signals.hasYoutube ||
    signals.hasSameAs ||
    signals.hasMapsSignal ||
    signals.hasDirectoryLinks ||
    signals.hasReviewIndicators ||
    signals.hasExternalMentions
  );
}

function getScoreCapsV2(signals) {
  const caps = [];
  const external = signals.externalPresence;
  const socialProfileCount = external ? Object.values(external.profiles || {}).filter((urls) => urls.length > 0).length : 0;
  const authorityCount = external ? Object.keys(external.authorityLinks || {}).length : 0;
  const hasExternalProfiles = socialProfileCount > 0 || authorityCount > 0 || Boolean(external?.entitySignals?.hasSameAs);
  const hasOfficialProfiles = (external?.socialProfileQuality?.officialCount || 0) > 0;
  const hasConfirmedMaps = external?.googleBusiness?.hasMapsLink || external?.googleBusiness?.hasEmbeddedMap || external?.googleBusiness?.hasGPage;
  const hasVerifiedReviews = external?.googleBusiness?.hasAggregateRating || external?.googleBusiness?.reviewCount > 0 || (hasConfirmedMaps && external?.googleBusiness?.hasReviewMentions);
  const hasExternalMentions = (external?.discovery?.externalMentionDomains || []).length > 0;
  const hasConcreteExternalEvidence = Boolean(hasOfficialProfiles || authorityCount > 0 || hasConfirmedMaps || hasVerifiedReviews || hasExternalMentions || external?.discovery?.concreteDiscovered);
  const likelyLocalBusiness =
    signals.hasAddress ||
    signals.hasLocalBusinessSchema ||
    signals.location_pages_found > 0 ||
    (signals.hasLocationMention && signals.hasPhone);
  const addCap = (condition, maxScore, reason, confidence = "High") => {
    if (condition) caps.push({ value: maxScore, maxScore, reason, confidence });
  };

  addCap(!hasConcreteExternalEvidence, 40, "Nu am găsit surse externe independente care să confirme că afacerea există dincolo de propriul site", "High");
  addCap(!hasExternalProfiles && authorityCount === 0, 45, "Lipsesc profilurile oficiale și prezența pe platforme externe de specialitate", "High");
  addCap(likelyLocalBusiness && !hasConfirmedMaps && !signals.hasPhone && !signals.hasAddress, 40, "Nu am putut confirma Google Business, telefon sau adresă pentru această afacere locală", "High");
  addCap(!signals.hasDescriptiveServices, 70, "Serviciile sau produsele nu sunt explicate suficient de clar pe site", "High");
  addCap(signals.successfulPages <= 1, 50, "A fost analizată doar pagina principală — site-ul are prea puține pagini accesibile", "High");
  addCap(signals.totalWords < 650, 65, "Conținutul site-ului este foarte scurt și oferă puține informații despre afacere", "High");
  addCap(!external?.entitySignals?.brandConfidence, 68, "Numele afacerii nu poate fi identificat cu claritate din site și sursele conectate", "High");
  addCap(external?.discovery?.discovered && !external?.discovery?.concreteDiscovered && !hasConcreteExternalEvidence, 38, "Afacerea apare în căutări exacte, dar nu există dovezi că ar fi recomandată independent de sisteme AI", "High");

  return caps;
}

function applyScoreCaps(score, signals) {
  const caps = getScoreCapsV2(signals);
  const cap = caps.reduce((lowest, item) => Math.min(lowest, item.value), 100);

  return {
    score: Math.min(score, cap),
    caps
  };
}

function calculateFinalScore(categoryScores, signals) {
  const baseScore = calculateBaseScore(categoryScores, signals);
  return roundScore(applyScoreCaps(baseScore, signals).score);
}

function getImprovementIssues(signals, categoryScores) {
  const issues = [];

  const addIssue = (condition, impact, weakness, recommendation) => {
    if (condition) {
      issues.push({ impact, weakness, recommendation });
    }
  };

  addIssue(
    !signals.hasDescriptiveServices,
    10,
    signals.hasServicesPage
      ? "Ai pagini de servicii, dar descrierile sunt prea scurte — un client nu înțelege clar ce primește și pentru cine ești potrivit."
      : "Nu am găsit o pagină care să explice clar ce oferi, cui te adresezi și ce te diferențiază.",
    "Extinde descrierea serviciilor cu detalii concrete: ce include, cui se adresează, ce rezultate oferă și în ce zone activezi."
  );
  addIssue(
    !signals.homepageClear,
    9,
    "Prima pagină a site-ului nu spune imediat ce faci, pentru cine și unde ești localizat.",
    "Rescrie introducerea paginii principale astfel încât orice vizitator să înțeleagă în 5 secunde ce oferi și cum te poate contacta."
  );
  addIssue(
    !signals.hasFaq,
    8,
    "Site-ul nu conține întrebări frecvente — o secțiune importantă pe care sistemele AI o caută pentru a înțelege serviciile tale.",
    "Adaugă o secțiune cu întrebările pe care le primești cel mai des de la clienți, cu răspunsuri clare și specifice."
  );
  addIssue(
    !signals.hasOrganizationSchema && !signals.hasLocalBusinessSchema,
    8,
    "Site-ul nu conține date structurate despre afacere, informații pe care sistemele AI le folosesc pentru a te identifica și recomanda.",
    "Adaugă date structurate cu numele afacerii, adresa, telefonul, site-ul și profilurile oficiale — un specialist web le poate implementa rapid."
  );
  addIssue(
    categoryScores.trustAuthority < 60,
    7,
    "Site-ul oferă puține dovezi că afacerea este reală și de încredere — lipsesc date de contact clare, testimoniale sau informații despre echipă.",
    "Adaugă număr de telefon, adresă, email, pagina Despre noi, testimoniale de la clienți și, dacă e cazul, certificări profesionale."
  );
  addIssue(
    categoryScores.onlinePresence < 55,
    10,
    "Nu am găsit suficiente surse externe care să confirme că afacerea ta există și este activă — sistemele AI nu te pot recomanda cu încredere.",
    "Creează sau actualizează profilul Google Business, conectează profilurile sociale la site și înscrie afacerea în directoare relevante."
  );
  addIssue(
    signals.externalPresence?.discovery?.discovered && !signals.externalPresence?.discovery?.concreteDiscovered,
    10,
    "Afacerea ta poate fi găsită dacă cineva caută exact numele tău, dar nu apare în recomandări independente ale sistemelor AI.",
    "Construiește prezență externă reală: profil Google Business activ, profiluri sociale oficiale, recenzii verificabile și mențiuni pe alte site-uri."
  );
  addIssue(
    signals.externalPresence && signals.externalPresence.subScores.entityConsistency < 55,
    8,
    "Numele afacerii, telefonul sau adresa nu sunt folosite consistent pe toate platformele — ceea ce creează confuzie pentru sistemele AI.",
    "Asigură-te că folosești același nume, telefon și adresă pe site, Google Business, Facebook și orice alt profil extern."
  );
  addIssue(
    signals.externalPresence && signals.externalPresence.subScores.sourceDiversity < 55,
    8,
    "Afacerea ta apare pe prea puține tipuri de platforme externe — ceea ce reduce credibilitatea în fața sistemelor AI.",
    "Extinde prezența pe platforme diferite: rețele sociale, Google Business, directoare de specialitate, platforme de recenzii."
  );
  addIssue(
    signals.externalPresence && signals.externalPresence.subScores.externalValidation < 45,
    7,
    "Nu am găsit suficiente confirmări externe — recenzii, listări pe platforme sau mențiuni pe alte site-uri.",
    "Înscrie afacerea pe platformele relevante și încurajează clienții mulțumiți să lase recenzii publice."
  );
  addIssue(
    (signals.marketAuthorityScore || 0) < 55,
    9,
    "Reputația online a afacerii tale este limitată — nu am găsit suficiente mențiuni independente sau recenzii care să te poziționeze ca o opțiune de încredere.",
    "Lucrează la recenzii pe Google și platforme relevante, obține mențiuni în presa locală și fii activ pe platformele unde caută clienții tăi."
  );
  addIssue(
    signals.externalPresence && !signals.externalPresence.entitySignals.brandConfidence,
    7,
    "Numele afacerii tale nu este suficient de clar și consistent pe site și platformele externe.",
    "Folosește același nume al afacerii în titlul paginii principale, în descrieri și pe toate profilurile externe."
  );
  addIssue(
    signals.totalWords < 900,
    6,
    "Site-ul are prea puțin conținut scris — sistemele AI nu au suficiente informații despre ce faci și pentru cine.",
    "Adaugă texte mai detaliate pe paginile de servicii, pe pagina Despre noi și pe homepage."
  );
  addIssue(
    signals.hasRepetitiveOrGenericContent,
    5,
    "Unele pagini ale site-ului par similare sau cu conținut generic care nu diferențiază afacerea ta.",
    "Scrie texte unice pentru fiecare serviciu și evită să copiezi același text pe mai multe pagini."
  );
  addIssue(
    !signals.sitemapFound,
    2,
    "Nu am găsit harta site-ului (sitemap) — un fișier care ajută sistemele automate să găsească toate paginile tale.",
    "Publică un fișier sitemap.xml — orice platformă web modernă îl poate genera automat."
  );

  addIssue(
    !signals.aiReadinessFiles?.found,
    7,
    "Nu am găsit un fișier de tip llms.txt sau o hartă AI-ready care să explice structura website-ului pentru sisteme AI.",
    "Adaugă un fișier /llms.txt cu descrierea afacerii, serviciile principale, paginile importante, FAQ-ul, resursele utile și datele de contact. Opțional, menționează-l în robots.txt."
  );

  addIssue(
    signals.homepageHasNoindex,
    12,
    "Homepage-ul blochează indexarea prin meta robots noindex — sistemele AI nu pot citi sau cita conținutul.",
    "Elimină tag-ul <meta name='robots' content='noindex'> de pe homepage și paginile importante."
  );

  addIssue(
    !signals.hasDirectAnswerPositioning,
    6,
    "Primul paragraf al homepage-ului este prea scurt sau prea lung pentru extragere directă de către sistemele AI (optim: 20-150 de cuvinte).",
    "Rescrie primul paragraf ca un răspuns direct și complet: ce face afacerea, pentru cine și unde, în 2-4 propoziții clare."
  );

  addIssue(
    !signals.hasBreadcrumbSchema,
    4,
    "Nu am găsit schema BreadcrumbList — semnalul de navigație ierarhică lipsește pentru motoarele AI.",
    "Adaugă schema BreadcrumbList pe paginile interioare pentru a clarifica structura site-ului față de sistemele automate."
  );

  addIssue(
    signals.hasResourcePage && !signals.hasArticleWithAuthor,
    4,
    "Paginile de blog sau resurse nu au schema Article cu informații despre autor — reduce credibilitatea conținutului în ochii AI.",
    "Adaugă schema Article sau BlogPosting cu câmpul 'author' pe articolele și resursele publicate."
  );

  return issues.sort((a, b) => b.impact - a.impact);
}

function calculatePotentialScore(currentScore, improvementIssues) {
  const lift = improvementIssues.slice(0, 3).reduce((total, issue) => total + issue.impact, 0);
  return roundScore(Math.min(100, currentScore + lift));
}

function buildFindings(signals, categoryScores, currentScore) {
  const strengths = [];

  const addStrength = (condition, text) => {
    if (condition) strengths.push(text);
  };

  addStrength(signals.homepageClear, "Homepage-ul explică clar ce face afacerea și oferă context pentru sistemele AI.");
  addStrength(signals.hasDescriptiveServices, "Paginile de servicii oferă conținut descriptiv, nu doar o listă de oferte.");
  addStrength(signals.hasFaq, "Website-ul include conținut de tip întrebare-răspuns, util pentru potrivirea cu întrebările clienților.");
  addStrength(signals.hasOrganizationSchema || signals.hasLocalBusinessSchema, "Website-ul folosește schema Organization sau LocalBusiness pentru claritatea entității.");
  addStrength(signals.aiReadinessFiles?.found, "Website-ul include un fișier AI-ready de tip llms.txt sau o variantă similară pentru orientarea sistemelor AI.");
  addStrength(categoryScores.trustAuthority >= 70, "Există semnale solide de încredere și identitate a afacerii.");
  addStrength(categoryScores.onlinePresence >= 70, "Afacerea are semnale externe conectate, utile pentru încrederea în entitate.");
  addStrength(signals.externalPresence?.subScores.sourceDiversity >= 70, "Am detectat diversitate bună de surse externe care confirmă entitatea.");
  addStrength(signals.externalPresence?.subScores.externalValidation >= 70, "Am detectat indicatori de validare externă precum Google Maps, recenzii sau platforme relevante.");
  addStrength(signals.marketAuthorityScore >= 70, "Afacerea are semnale de autoritate locală sau de nișă peste nivelul de bază al unei entități verificabile.");
  addStrength(signals.totalWords >= 1800, "Conținutul analizat oferă suficient context pentru înțelegerea afacerii.");
  addStrength(signals.hasDirectAnswerPositioning, "Homepage-ul are un prim paragraf optim pentru extragere directă de către sistemele AI.");
  addStrength(signals.hasBreadcrumbSchema, "Schema BreadcrumbList este prezentă — ajută AI să înțeleagă structura site-ului.");
  addStrength(signals.hasArticleWithAuthor, "Conținutul editorial include schema Article cu autor — semnal de credibilitate pentru AI.");
  addStrength(signals.sitemapHasLastmod, "Sitemapul include date lastmod — ajută sistemele AI să prioritizeze conținutul proaspăt.");

  const improvementIssues = getImprovementIssues(signals, categoryScores);

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: improvementIssues.map((issue) => issue.weakness).slice(0, 3),
    recommendations: improvementIssues.map((issue) => issue.recommendation).slice(0, 5),
    improvementIssues,
    currentScore,
    potentialScore: calculatePotentialScore(currentScore, improvementIssues)
  };
}

async function crawlPages(websiteUrl, sitemapUrls, homepagePage) {
  const selection = selectImportantPages(websiteUrl, sitemapUrls, homepagePage.internalLinks || []);
  const importantUrls = selection.urls;
  const urlsToFetch = importantUrls.filter((url) => url !== homepagePage.requestedUrl && url !== homepagePage.url);
  const fetched = await Promise.all(urlsToFetch.map((url) => fetchPage(url)));
  const extracted = fetched.map((result) => extractPage(result, websiteUrl));

  return {
    pages: [homepagePage, ...extracted].slice(0, 25),
    discoveryStats: selection.stats
  };
}

async function analyzeWebsite(websiteUrl) {
  const normalizedDomain = getDomain(websiteUrl);
  const robots = await inspectRobots(websiteUrl);
  const [sitemap, homepageFetch, aiReadinessFiles] = await Promise.all([
    discoverSitemap(websiteUrl, robots.sitemaps),
    fetchPage(websiteUrl),
    inspectAiReadinessFiles(websiteUrl, robots)
  ]);

  if (!homepageFetch.ok || !homepageFetch.html) {
    const error = new Error("Homepage inaccesibil");
    error.statusCode = 400;
    error.publicMessage =
      "Nu am putut accesa homepage-ul. Verifică dacă URL-ul este corect și website-ul este online.";
    throw error;
  }

  const homepagePage = extractPage(homepageFetch, websiteUrl);
  const crawlResult = await crawlPages(websiteUrl, sitemap.pageUrls, homepagePage);
  const pages = crawlResult.pages;
  const externalPresence = await evaluateExternalPresence({
    pages,
    domain: normalizedDomain,
    brandName: extractBrandName(pages, normalizedDomain)
  });
  const signals = getAggregateSignals({
    robots,
    sitemap,
    pages,
    discoveryStats: crawlResult.discoveryStats
  });

  signals.socialProfilesAccessible = await checkSocialAccessibility(signals);
  signals.aiReadinessFiles = aiReadinessFiles;
  signals.externalPresence = externalPresence;
  signals.externalPresenceScore = externalPresence.score;
  signals.marketAuthority = calculateMarketAuthorityScore(signals);
  signals.marketAuthorityScore = signals.marketAuthority.score;
  signals.market_authority_debug = signals.marketAuthority.debug;

  const categoryScores = calculateCategoryScores(signals);
  signals.categoryDiagnostics = buildCategoryDiagnostics(signals, categoryScores);
  signals.categoryConfidence = Object.fromEntries(
    Object.entries(signals.categoryDiagnostics).map(([key, value]) => [key, value.confidence])
  );
  const baseScore = calculateBaseScore(categoryScores, signals);
  const capped = applyScoreCaps(baseScore, signals);
  const aiVizResult = signals.externalPresence?.aiVisibility;
  const aiBonus = !aiVizResult ? 0 : aiVizResult.mentionedCount === aiVizResult.totalQueries ? 10 : aiVizResult.mentionedCount > 0 ? 5 : 0;
  const aiFloor = !aiVizResult ? 0 : aiVizResult.mentionedCount === aiVizResult.totalQueries ? 50 : aiVizResult.mentionedCount > 0 ? 35 : 0;
  const finalScore = roundScore(Math.min(100, Math.max(aiFloor, capped.score + aiBonus)));
  const findings = buildFindings(signals, categoryScores, finalScore);
  const finalSignals = {
    ...signals,
    currentScore: finalScore,
    potentialScore: findings.potentialScore,
    baseScore,
    appliedCaps: capped.caps,
    improvementIssues: findings.improvementIssues,
    pages: pages.map((page) => ({
      url: page.url,
      status: page.status,
      pageType: page.pageType,
      title: page.title,
      h1: page.h1,
      wordCount: page.wordCount,
      schemaTypes: page.schema.types
    }))
  };
  finalSignals.scoreBreakdown = buildScoreBreakdown({
    finalScore,
    categoryScores,
    signals: finalSignals
  });

  return {
    websiteUrl,
    normalizedDomain,
    robotsFound: robots.found,
    sitemapFound: sitemap.found,
    sitemapUrl: sitemap.url,
    pagesAnalyzed: pages.length,
    analyzedPages: pages.map((page) => ({
      url: page.url,
      status: page.status,
      title: page.title,
      pageType: page.pageType,
      wordCount: page.wordCount
    })),
    finalScore,
    categoryScores,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    recommendations: findings.recommendations,
    signals: finalSignals
  };
}

export { analyzeWebsite };
