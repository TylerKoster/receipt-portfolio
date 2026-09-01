import {
  searchMoments,
  validateVideoCorpus,
  type SearchIndex,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import { escapeHtml, normalizePublicBaseUrl } from '../shared/render.js';
import { videoMomentSearchSite } from './index.js';
import type { PublicSearchEntry, PublicSearchIndex } from './search-client.js';
import {
  eligibleDiscoveryRoutes,
  type DiscoveryRoutes,
  type EligibleDiscoveryRoutes,
  type FeedGuide,
  type OriginalSynthesis,
} from './seo.js';
import {
  parseVideoSourceEvidenceManifest,
  validateCommonsSourceEvidence,
} from './source-evidence.js';

function routePath(baseUrl: string, suffix = ''): string {
  const path = new URL(normalizePublicBaseUrl(baseUrl)).pathname;
  return `${path}video-moment-search/${suffix}`;
}

function routeUrl(baseUrl: string, suffix = ''): string {
  return `${normalizePublicBaseUrl(baseUrl)}video-moment-search/${suffix}`;
}

function sameIndexValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameIndexValue(value, right[index]))
    );
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        sameIndexValue(leftRecord[key], rightRecord[key]),
    )
  );
}

function normalizeIndexText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{Pd}_]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function indexTokens(value: string): readonly string[] {
  return normalizeIndexText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function assertSearchIndexMatchesCorpus(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
): void {
  const publicMoments = corpus.moments.filter(
    (moment) => moment.state === 'active' || moment.state === 'corrected',
  );
  if (searchIndex.entries.length !== publicMoments.length) {
    throw new Error('Search index does not match validated corpus');
  }
  const videos = new Map(corpus.videos.map((video) => [video.id, video]));
  for (const [index, moment] of publicMoments.entries()) {
    const entry = searchIndex.entries[index];
    const video = videos.get(moment.videoId);
    if (entry === undefined || video === undefined) {
      throw new Error('Search index does not match validated corpus');
    }
    const title = normalizeIndexText(video.title);
    const topics = normalizeIndexText(moment.topicSlugs.join(' '));
    const excerpt = normalizeIndexText(moment.excerpt);
    const expectedTokens = new Set(
      indexTokens(`${title} ${topics} ${excerpt}`),
    );
    if (
      !sameIndexValue(entry.moment, moment) ||
      !sameIndexValue(entry.video, video) ||
      entry.title !== title ||
      entry.topics !== topics ||
      entry.excerpt !== excerpt ||
      entry.tokens.size !== expectedTokens.size ||
      [...expectedTokens].some((token) => !entry.tokens.has(token))
    ) {
      throw new Error('Search index does not match validated corpus');
    }
  }
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function exactTimestampUrl(
  sourceUrl: string,
  startSeconds: number,
  strategy: 'query-parameter' | 'media-fragment' = 'query-parameter',
): string | null {
  try {
    if (!Number.isInteger(startSeconds) || startSeconds < 0) return null;
    const source = new URL(sourceUrl);
    if (
      source.protocol !== 'https:' ||
      source.username !== '' ||
      source.password !== '' ||
      source.search !== '' ||
      source.hash !== ''
    ) {
      return null;
    }
    if (strategy === 'media-fragment') source.hash = `t=${startSeconds}`;
    else source.searchParams.set('t', String(startSeconds));
    return source.href;
  } catch {
    return null;
  }
}

export function serializePublicSearchIndex(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): PublicSearchIndex {
  const containsReviewedRecords =
    corpus.videos.some((video) => video.reviewEvidenceId !== undefined) ||
    corpus.rights.some((grant) => grant.reviewEvidence !== undefined);
  if (containsReviewedRecords && sourceEvidence === undefined) {
    throw new Error(
      'Evidence manifest is required for reviewed corpus records',
    );
  }
  if (containsReviewedRecords) {
    const evidenceValidation = validateCommonsSourceEvidence(
      corpus,
      sourceEvidence,
      validationNow,
    );
    if (!evidenceValidation.ok) {
      throw new Error(
        `Invalid evidence manifest: ${evidenceValidation.diagnostics.join(', ')}`,
      );
    }
  } else {
    const validation = validateVideoCorpus(corpus);
    if (!validation.ok) {
      throw new Error(
        `Invalid video corpus: ${validation.diagnostics.join(', ')}`,
      );
    }
  }
  assertSearchIndexMatchesCorpus(corpus, searchIndex);
  const evidenceRecords =
    sourceEvidence === undefined
      ? new Map()
      : new Map(
          parseVideoSourceEvidenceManifest(sourceEvidence).records.map(
            (record) => [record.evidenceId, record],
          ),
        );
  const grants = new Map(corpus.rights.map((grant) => [grant.id, grant]));
  const cuesByVideo = new Map(
    corpus.videos.map((video) => [
      video.id,
      corpus.cues.filter((cue) => cue.videoId === video.id),
    ]),
  );

  const entries = searchIndex.entries.map((entry): PublicSearchEntry => {
    const grant = grants.get(entry.moment.rightsGrantId);
    if (grant === undefined) {
      throw new Error(`Missing validated rights grant for ${entry.moment.id}`);
    }
    const timestampUrl = exactTimestampUrl(
      entry.video.sourceUrl,
      entry.moment.startSeconds,
      entry.video.timestampStrategy,
    );
    if (timestampUrl === null) {
      throw new Error(`Invalid exact timestamp URL for ${entry.moment.id}`);
    }
    const historicalReview = grant.reviewEvidence;
    const evidenceRecord =
      historicalReview === undefined
        ? undefined
        : evidenceRecords.get(historicalReview.evidenceId);
    const reviewEvidence =
      historicalReview === undefined || evidenceRecord === undefined
        ? undefined
        : {
            ...historicalReview,
            roles: evidenceRecord.roles,
            annotationSha256: evidenceRecord.annotation.sha256,
            observedStatus: evidenceRecord.observedStatus,
          };
    const cueIds = (cuesByVideo.get(entry.video.id) ?? [])
      .filter(
        (cue) =>
          cue.startSeconds <= entry.moment.startSeconds &&
          cue.endSeconds >= entry.moment.endSeconds,
      )
      .map((cue) => cue.id);
    return {
      corpusId: corpus.corpusId,
      momentId: entry.moment.id,
      videoId: entry.video.id,
      videoSlug: entry.video.slug,
      sourceUrl: entry.video.sourceUrl,
      videoTitle: entry.video.title,
      creatorId: entry.video.creatorId,
      creatorName: entry.video.creatorName,
      startSeconds: entry.moment.startSeconds,
      endSeconds: entry.moment.endSeconds,
      excerpt: entry.moment.excerpt,
      topicSlugs: entry.moment.topicSlugs,
      correctionState: entry.moment.state,
      rightsGrantId: grant.id,
      cueIds,
      confidenceClass:
        reviewEvidence !== undefined
          ? 'Reviewed public source; original editorial annotation, not transcript text'
          : 'Rights-validated controlled fixture match',
      rightsStatus:
        reviewEvidence === undefined
          ? grant.licenseNote
          : `${reviewEvidence.licenseIdentifier}; ${reviewEvidence.productBoundary.included.join(' plus ')} only; no inferred permission or endorsement.`,
      verificationDate:
        reviewEvidence?.observedStatus.observedOn ??
        grant.permissionVerifiedAt.slice(0, 10),
      provenance:
        reviewEvidence === undefined
          ? `Corpus ${corpus.corpusId}; rights grant ${grant.id}; cue ${cueIds.join(', ')}`
          : `Corpus ${corpus.corpusId}; evidence ${reviewEvidence.evidenceId}; immutable rights revision ${reviewEvidence.immutableRightsRevisionUrl}; reviewed by ${reviewEvidence.reviewer} on ${reviewEvidence.reviewedOn}; rights grant ${grant.id}; cue ${cueIds.join(', ')}`,
      timestampUrl,
      timestampStrategy: entry.video.timestampStrategy ?? 'query-parameter',
      reviewEvidence,
    };
  });

  return {
    schemaVersion: 1,
    corpusId: corpus.corpusId,
    entries,
  };
}

function detailRows(entry: PublicSearchEntry): string {
  const rows: [string, string][] = [
    ['Source title', entry.videoTitle],
    ['Creator', entry.creatorName],
    ['Excerpt', entry.excerpt],
    [
      'Start / end',
      `${formatSeconds(entry.startSeconds)}–${formatSeconds(entry.endSeconds)}`,
    ],
    ['Topics', entry.topicSlugs.join(', ')],
    ['Confidence class', entry.confidenceClass],
    ['Rights status', entry.rightsStatus],
    [
      entry.reviewEvidence === undefined ? 'Verification date' : 'Observed on',
      entry.reviewEvidence === undefined
        ? entry.verificationDate
        : `${entry.verificationDate} (date precision)`,
    ],
    ['Provenance', entry.provenance],
  ];
  if (entry.reviewEvidence !== undefined) {
    rows.push(
      ['Evidence ID', entry.reviewEvidence.evidenceId],
      ['License', entry.reviewEvidence.licenseIdentifier],
      ['License URL', entry.reviewEvidence.licenseUrl],
      ['Canonical rights page', entry.reviewEvidence.canonicalRightsPageUrl],
      [
        'Immutable rights revision',
        entry.reviewEvidence.immutableRightsRevisionUrl,
      ],
      [
        'Historical license review',
        `${entry.reviewEvidence.reviewer} · ${entry.reviewEvidence.reviewedOn}`,
      ],
      [
        'Observed source record',
        `Observed on ${entry.reviewEvidence.observedStatus.observedOn} (date precision) · freshness expires ${entry.reviewEvidence.observedStatus.expiresAt}`,
      ],
      ['Publisher', entry.reviewEvidence.roles.publisher.name],
      ['Uploader', entry.reviewEvidence.roles.uploader.name],
      ['Attributed creator', entry.reviewEvidence.roles.attributedCreator.name],
      [
        'Rights authority / licensor',
        entry.reviewEvidence.roles.rightsAuthority.name,
      ],
      ['Evidence issuer', entry.reviewEvidence.roles.evidenceIssuer.name],
      [
        'Product boundary',
        `Included: ${entry.reviewEvidence.productBoundary.included.join(', ')}; excluded: ${entry.reviewEvidence.productBoundary.excluded.join(', ')}`,
      ],
    );
  }
  rows.push(['Correction state', entry.correctionState]);
  return rows
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
}

const noDiscoveryRoutes: EligibleDiscoveryRoutes = { topics: [], guides: [] };

function sameStringValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameTopicRecord(
  left: { readonly slug: string; readonly synthesis: OriginalSynthesis },
  right: { readonly slug: string; readonly synthesis: OriginalSynthesis },
): boolean {
  return (
    left.slug === right.slug &&
    left.synthesis.text === right.synthesis.text &&
    left.synthesis.isProjectOriginal === right.synthesis.isProjectOriginal
  );
}

function sameGuideRecord(left: FeedGuide, right: FeedGuide): boolean {
  return (
    left.id === right.id &&
    left.slug === right.slug &&
    left.title === right.title &&
    left.summary === right.summary &&
    left.updatedAt === right.updatedAt &&
    sameStringValues(left.sourceMomentIds, right.sourceMomentIds) &&
    left.synthesis.text === right.synthesis.text &&
    left.synthesis.isProjectOriginal === right.synthesis.isProjectOriginal
  );
}

function contextualLinks(
  entry: PublicSearchEntry,
  baseUrl: string,
  discovery: EligibleDiscoveryRoutes,
): string {
  const root = routeUrl(baseUrl);
  const links = [
    ['Portfolio', normalizePublicBaseUrl(baseUrl)],
    ['Search', root],
    ['Video', routeUrl(baseUrl, `videos/${entry.videoSlug}/`)],
    ['Moment', routeUrl(baseUrl, `moments/${entry.momentId}/`)],
    ['Creator', routeUrl(baseUrl, `creators/${entry.creatorId}/`)],
    ...discovery.topics
      .filter((topic) => entry.topicSlugs.includes(topic.slug))
      .map(
        (topic) =>
          [
            `Topic: ${topic.slug.replaceAll('-', ' ')}`,
            routeUrl(baseUrl, `topics/${topic.slug}/`),
          ] as const,
      ),
    ...discovery.guides
      .filter((guide) => guide.sourceMomentIds.includes(entry.momentId))
      .map(
        (guide) =>
          [
            `Guide: ${guide.title}`,
            routeUrl(baseUrl, `guides/${guide.slug}/`),
          ] as const,
      ),
  ];
  return `<nav aria-label="Related pages">${links
    .map(
      ([label, href]) =>
        `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`,
    )
    .join(' · ')}</nav>`;
}

function renderEntry(
  entry: PublicSearchEntry,
  baseUrl?: string,
  discovery: EligibleDiscoveryRoutes = noDiscoveryRoutes,
): string {
  const timestampUrl = exactTimestampUrl(
    entry.sourceUrl,
    entry.startSeconds,
    entry.timestampStrategy,
  );
  const link =
    timestampUrl === null || timestampUrl !== entry.timestampUrl
      ? '<span class="invalid-source">Exact source link unavailable</span>'
      : `<a href="${escapeHtml(timestampUrl)}" data-measurement-event="moment_click" data-measurement-status="not-configured">${escapeHtml(entry.videoTitle)} at ${escapeHtml(formatSeconds(entry.startSeconds))}</a>`;
  return `<article class="moment-card" data-moment-id="${escapeHtml(entry.momentId)}" aria-labelledby="heading-${escapeHtml(entry.momentId)}">
  <p class="eyebrow">Controlled fixture moment</p>
  <h3 id="heading-${escapeHtml(entry.momentId)}">${link}</h3>
  <dl class="moment-meta">${detailRows(entry)}</dl>${baseUrl === undefined ? '' : `\n  ${contextualLinks(entry, baseUrl, discovery)}`}
</article>`;
}

function renderEntries(
  entries: readonly PublicSearchEntry[],
  baseUrl?: string,
  discovery: EligibleDiscoveryRoutes = noDiscoveryRoutes,
): string {
  return `<div class="moment-list">${entries
    .map((entry) => renderEntry(entry, baseUrl, discovery))
    .join('\n')}</div>`;
}

export function renderSearchResults(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  query: string,
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  const publicIndex = serializePublicSearchIndex(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  );
  if (query.trim().length === 0) {
    return '<p class="guidance">Enter a phrase such as “robots control”.</p>';
  }
  const byMomentId = new Map(
    publicIndex.entries.map((entry) => [entry.momentId, entry]),
  );
  const found = searchMoments(searchIndex, query)
    .map((result) => byMomentId.get(result.momentId))
    .filter((entry): entry is PublicSearchEntry => entry !== undefined);
  return found.length === 0
    ? '<p class="guidance">No moments match this phrase. Try fewer or different words.</p>'
    : renderEntries(found);
}

interface PageMetadata {
  readonly indexable: boolean;
  readonly description: string;
  readonly openGraphType?: 'article' | 'video.other' | 'website';
  readonly structuredData?: readonly object[];
}

function jsonForHtml(value: object): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function page(
  title: string,
  body: string,
  baseUrl: string,
  suffix = '',
  includeClient = false,
  metadata: PageMetadata = {
    indexable: false,
    description: videoMomentSearchSite.description,
  },
): string {
  const canonical = routeUrl(baseUrl, suffix);
  const favicon = `${new URL(normalizePublicBaseUrl(baseUrl)).pathname}favicon.ico`;
  const styles = routePath(baseUrl, 'styles.css');
  const client = routePath(baseUrl, 'search-client.js');
  const script = includeClient
    ? `\n  <script type="module" src="${escapeHtml(client)}"></script>`
    : '';
  const socialMetadata = metadata.indexable
    ? `\n  <meta property="og:type" content="${escapeHtml(metadata.openGraphType ?? 'article')}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metadata.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metadata.description)}">`
    : '';
  const structuredData = (metadata.structuredData ?? [])
    .map(
      (data) =>
        `\n  <script type="application/ld+json">${jsonForHtml(data)}</script>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${metadata.indexable ? 'index,follow' : 'noindex,nofollow'}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; style-src 'self'; script-src 'self'; connect-src 'self'">
  <meta name="description" content="${escapeHtml(metadata.description)}">${socialMetadata}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="${escapeHtml(favicon)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(styles)}">${script}${structuredData}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="site-header"><div class="shell">
    <p class="eyebrow">Controlled fixture experiment</p>
    <h1>${escapeHtml(videoMomentSearchSite.name)}</h1>
    <p class="proposition">${escapeHtml(videoMomentSearchSite.proposition)}</p>
  </div></header>
  <main id="main-content" class="shell">${body}</main>
  <footer><div class="shell">Search queries stay in this page and are not stored or sent. Opening a result leaves this site and loads media from Wikimedia under its policies. No accounts, analytics, scraping, or media hosting.</div></footer>
</body>
</html>
`;
}

function initialResults(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): readonly PublicSearchEntry[] {
  return serializePublicSearchIndex(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  ).entries;
}

export function renderSearchShell(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  baseUrl: string,
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  const initial = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  );
  const allInitialEntriesReviewed =
    initial.length > 0 &&
    initial.every((entry) => entry.reviewEvidence !== undefined);
  const searchHeading = allInitialEntriesReviewed
    ? 'Search the reviewed public-source moment fixture'
    : 'Search the controlled moment fixture';
  const initialHeading = allInitialEntriesReviewed
    ? 'Initial reviewed moments'
    : 'Initial controlled moments';
  const reviewedOnDates = [
    ...new Set(
      initial.flatMap((entry) =>
        entry.reviewEvidence === undefined
          ? []
          : [entry.reviewEvidence.reviewedOn],
      ),
    ),
  ].sort();
  const observedWindows = [
    ...new Set(
      initial.flatMap((entry) =>
        entry.reviewEvidence === undefined
          ? []
          : [
              `observed on ${entry.reviewEvidence.observedStatus.observedOn} (date precision); freshness expires ${entry.reviewEvidence.observedStatus.expiresAt}`,
            ],
      ),
    ),
  ].sort();
  const historicalReviewBoundary = allInitialEntriesReviewed
    ? ` Historical license review dates: ${reviewedOnDates.join(', ')}. Fresh source-record status: ${observedWindows.join(', ')}. These are separate evidence facts; neither is a permission grant.`
    : '';
  const rightsBoundary = allInitialEntriesReviewed
    ? `These reviewed Commons source records. Each provides a timestamp link plus an original editorial annotation only.${historicalReviewBoundary} It does not host, embed, or distribute media or transcripts; claim endorsement or inferred permission; represent a live creator library; or provide usability, demand, or revenue evidence. It is not a live creator library.`
    : 'Each controlled result exposes its stored rights, provenance, and correction state. Review status is shown only when a validated evidence record is present. This route does not host, embed, or distribute media or transcripts; claim endorsement or inferred permission; represent a live creator library; or provide usability, demand, or revenue evidence.';
  const body = `<section class="information-panel" aria-labelledby="start-heading">
    <h2 id="start-heading">Recover the explanation, then verify its context</h2>
    <p><strong>For:</strong> ${escapeHtml(videoMomentSearchSite.audience)}</p>
    <p><strong>Use this when:</strong> ${escapeHtml(videoMomentSearchSite.useCase)}</p>
    <h3>How to use it</h3><ol>${videoMomentSearchSite.howTo.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    <p><strong>What you get:</strong> ${escapeHtml(videoMomentSearchSite.outcome)}</p>
    <p class="boundary"><strong>Rights boundary:</strong> ${escapeHtml(rightsBoundary)}</p>
  </section>
  <section id="moment-search-controls" class="search-panel" aria-labelledby="search-heading">
    <p class="eyebrow">Find an exact explanation</p>
    <h2 id="search-heading">${escapeHtml(searchHeading)}</h2>
    <form class="search-controls" action="${escapeHtml(routeUrl(baseUrl))}" method="get" role="search" data-moment-search data-measurement-event="search" data-measurement-status="not-configured">
      <div><label for="moment-query">What explanation do you remember?</label><input id="moment-query" type="search" autocomplete="off" data-moment-query></div>
      <button type="submit">Search moments</button>
    </form>
    <p class="boundary" data-measurement-status="not-configured">No measurement endpoint is configured. Future measurement hooks do not send or store search text or event data.</p>
    <noscript><p class="guidance">Interactive search requires JavaScript; the admitted initial moments remain available below without sending your query.</p></noscript>
    <p class="search-status" aria-live="polite" data-search-status>Enter a phrase; the initial controlled moments remain available below.</p>
    <p class="error" data-search-error hidden>Search could not load. The initial controlled moments remain available below.</p>
    <div class="moment-list" data-client-results></div>
    <section class="handoff-panel" aria-labelledby="handoff-heading" data-moment-page-base="${escapeHtml(routeUrl(baseUrl, 'moments/'))}">
      <p class="eyebrow">Current page only</p>
      <h3 id="handoff-heading">Temporary timestamp and rights handoff</h3>
      <p>Selected reviewed moments stay only in this open page. Copy the plain text below or clear it before leaving.</p>
      <ol data-selected-moments></ol>
      <label for="moment-handoff-text">Plain text handoff</label>
      <textarea id="moment-handoff-text" data-handoff-text readonly rows="12" aria-describedby="handoff-status"></textarea>
      <div class="handoff-actions"><button type="button" data-copy-handoff disabled>Copy handoff text</button><button type="button" data-clear-handoff disabled>Clear handoff</button></div>
      <p id="handoff-status" class="search-status" role="status" aria-live="polite" tabindex="-1" data-handoff-status>No reviewed moments are selected.</p>
    </section>
  </section>
  <section aria-labelledby="initial-heading" data-server-results>
    <p class="eyebrow">Available without JavaScript</p>
    <h2 id="initial-heading">${escapeHtml(initialHeading)}</h2>
    ${renderEntries(initial, baseUrl)}
  </section>`;
  return page(videoMomentSearchSite.title, body, baseUrl, '', true, {
    indexable: initial.length > 0,
    description: videoMomentSearchSite.description,
    openGraphType: 'website',
  });
}

export function renderVideoMomentHome(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  baseUrl: string,
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  return renderSearchShell(
    corpus,
    searchIndex,
    baseUrl,
    sourceEvidence,
    validationNow,
  );
}

function breadcrumbs(
  baseUrl: string,
  currentName: string,
  suffix: string,
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'AI Moment Index',
        item: routeUrl(baseUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: currentName,
        item: routeUrl(baseUrl, suffix),
      },
    ],
  };
}

function filteredPage(
  title: string,
  description: string,
  entries: readonly PublicSearchEntry[],
  baseUrl: string,
  suffix: string,
  structuredData: readonly object[] = [breadcrumbs(baseUrl, title, suffix)],
  customBody?: string,
  openGraphType?: PageMetadata['openGraphType'],
  discovery: EligibleDiscoveryRoutes = noDiscoveryRoutes,
  indexable = entries.length > 0,
): string {
  const content =
    entries.length === 0
      ? '<p class="guidance">No controlled fixture moments are available for this view.</p>'
      : renderEntries(entries, baseUrl, discovery);
  const reviewedOnDates = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.reviewEvidence === undefined
          ? []
          : [entry.reviewEvidence.reviewedOn],
      ),
    ),
  ].sort();
  const observedWindows = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.reviewEvidence === undefined
          ? []
          : [
              `observed on ${entry.reviewEvidence.observedStatus.observedOn} (date precision); freshness expires ${entry.reviewEvidence.observedStatus.expiresAt}`,
            ],
      ),
    ),
  ].sort();
  const currentnessBoundary =
    reviewedOnDates.length === 0
      ? 'Review status is unavailable for this controlled page.'
      : `Historical license review dates: ${reviewedOnDates.join(', ')}. Fresh source-record status: ${observedWindows.join(', ')}. These are separate evidence facts; neither is a permission grant.`;
  const directPageHowTo = [
    'Review the excerpt and evidence details.',
    'Inspect the rights, provenance, and correction state.',
    'Open the exact source-time link and confirm the surrounding context.',
  ];
  const orientation = `<section class="information-panel" aria-labelledby="direct-page-start-heading"><h2 id="direct-page-start-heading">How to use this evidence-bound page</h2><p><strong>For:</strong> ${escapeHtml(videoMomentSearchSite.audience)}</p><p><strong>Use this when:</strong> ${escapeHtml(videoMomentSearchSite.useCase)}</p><h3>How to use it</h3><ol>${directPageHowTo.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol><p><a href="${escapeHtml(routeUrl(baseUrl, ''))}">Search another phrase</a></p><p class="boundary"><strong>Currentness boundary:</strong> ${escapeHtml(currentnessBoundary)}</p></section>`;
  return page(
    title,
    `${orientation}${customBody ?? `<section><h2>${escapeHtml(title)}</h2>${content}</section>`}`,
    baseUrl,
    suffix,
    false,
    {
      indexable,
      description,
      structuredData,
      openGraphType,
    },
  );
}

export function renderVideoPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  videoId: string,
  baseUrl: string,
  discoveryRoutes: DiscoveryRoutes = {},
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  const video = corpus.videos.find(
    (candidate) => candidate.id === videoId || candidate.slug === videoId,
  );
  const entries = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  ).filter((entry) => entry.videoId === video?.id);
  if (video === undefined) {
    return filteredPage(
      'Video unavailable | AI Moment Index',
      'No verified video moments are available for this page.',
      [],
      baseUrl,
      `videos/${encodeURIComponent(videoId)}/`,
    );
  }
  const title = `${video.title} moments | AI Moment Index`;
  const suffix = `videos/${encodeURIComponent(video.slug)}/`;
  const discovery = eligibleDiscoveryRoutes(corpus, baseUrl, discoveryRoutes);
  return filteredPage(
    title,
    `Reviewed moments from ${video.title} by ${video.creatorName}, with exact source timestamps and evidence boundaries.`,
    entries,
    baseUrl,
    suffix,
    [breadcrumbs(baseUrl, video.title, suffix)],
    undefined,
    undefined,
    discovery,
  );
}

export function renderMomentPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  momentId: string,
  baseUrl: string,
  discoveryRoutes: DiscoveryRoutes = {},
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  const entry = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  ).find((candidate) => candidate.momentId === momentId);
  const title =
    entry === undefined
      ? 'Moment unavailable | AI Moment Index'
      : `${entry.videoTitle} at ${formatSeconds(entry.startSeconds)} | AI Moment Index`;
  const suffix = `moments/${encodeURIComponent(momentId)}/`;
  const discovery = eligibleDiscoveryRoutes(corpus, baseUrl, discoveryRoutes);
  return filteredPage(
    title,
    entry === undefined
      ? 'No verified moment is available for this page.'
      : `${entry.excerpt} Open the verified source at the stored exact second.`,
    entry === undefined ? [] : [entry],
    baseUrl,
    suffix,
    undefined,
    undefined,
    undefined,
    discovery,
  );
}

export function renderTopicPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  topicSlug: string,
  baseUrl: string,
  synthesis?: OriginalSynthesis,
  discoveryRoutes: DiscoveryRoutes = {},
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string | null {
  const entries = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  ).filter((entry) => entry.topicSlugs.includes(topicSlug));
  const discovery = eligibleDiscoveryRoutes(corpus, baseUrl, {
    topics:
      synthesis === undefined
        ? discoveryRoutes.topics
        : [
            { slug: topicSlug, synthesis },
            ...(discoveryRoutes.topics ?? []).filter(
              (topic) =>
                !sameTopicRecord(topic, { slug: topicSlug, synthesis }),
            ),
          ],
    guides: discoveryRoutes.guides,
  });
  const admittedTopic = discovery.topics.find(
    (topic) => topic.slug === topicSlug,
  );
  if (admittedTopic === undefined) {
    return null;
  }
  const topicName = topicSlug.replaceAll('-', ' ');
  const title = `${topicName} video moments | AI Moment Index`;
  const suffix = `topics/${encodeURIComponent(topicSlug)}/`;
  const body = `<article><h2>${escapeHtml(title)}</h2><p>${escapeHtml(admittedTopic.synthesis.text)}</p>${renderEntries(entries, baseUrl, discovery)}</article>`;
  return filteredPage(
    title,
    `A project-original comparison of reviewed moments from different source URLs about ${topicName}.`,
    entries,
    baseUrl,
    suffix,
    [breadcrumbs(baseUrl, topicName, suffix)],
    body,
    undefined,
    discovery,
  );
}

export function renderCreatorPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  creatorId: string,
  baseUrl: string,
  discoveryRoutes: DiscoveryRoutes = {},
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  const entries = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  ).filter((entry) => entry.creatorId === creatorId);
  const creatorName = entries[0]?.creatorName ?? creatorId;
  const title = `${creatorName} video moments | AI Moment Index`;
  const discovery = eligibleDiscoveryRoutes(corpus, baseUrl, discoveryRoutes);
  return filteredPage(
    title,
    `Reviewed source moments attributed to ${creatorName}, with exact timestamps and rights provenance.`,
    entries,
    baseUrl,
    `creators/${encodeURIComponent(creatorId)}/`,
    undefined,
    undefined,
    undefined,
    discovery,
  );
}

export function renderGuidePage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  baseUrl: string,
  guide?: FeedGuide,
  discoveryRoutes: DiscoveryRoutes = {},
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string | null {
  const publicationEntries = initialResults(
    corpus,
    searchIndex,
    sourceEvidence,
    validationNow,
  );
  if (guide === undefined) return null;
  const discovery = eligibleDiscoveryRoutes(corpus, baseUrl, {
    topics: discoveryRoutes.topics,
    guides: [
      guide,
      ...(discoveryRoutes.guides ?? []).filter(
        (candidate) => !sameGuideRecord(candidate, guide),
      ),
    ],
  });
  const admittedGuide = discovery.guides.find(
    (candidate) => candidate.slug === guide.slug,
  );
  if (admittedGuide === undefined) {
    return null;
  }
  const entries = publicationEntries.filter((entry) =>
    admittedGuide.sourceMomentIds.includes(entry.momentId),
  );
  const title = `${admittedGuide.title} | AI Moment Index`;
  const description = admittedGuide.summary;
  const suffix = `guides/${encodeURIComponent(admittedGuide.slug)}/`;
  const body = `<article><h2>${escapeHtml(title)}</h2><p>${escapeHtml(admittedGuide.synthesis.text)}</p><ol><li>Search the phrase you remember.</li><li>Inspect rights, provenance, and correction state.</li><li>Open the exact second and verify the surrounding source context.</li></ol>${renderEntries(entries, baseUrl, discovery)}</article>`;
  return page(title, body, baseUrl, suffix, false, {
    indexable: true,
    description,
    structuredData: [breadcrumbs(baseUrl, admittedGuide.title, suffix)],
  });
}
