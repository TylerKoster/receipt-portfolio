import {
  isReviewedSourceEvidenceSubstantive,
  searchMoments,
  validateVideoCorpus,
  type SearchIndex,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import {
  escapeHtml,
  normalizePublicBaseUrl,
} from '../shared/render.js';
import { videoMomentSearchSite } from './index.js';
import type {
  PublicSearchEntry,
  PublicSearchIndex,
} from './search-client.js';
import { validateCommonsSourceEvidence } from './source-evidence.js';

function routePath(baseUrl: string, suffix = ''): string {
  const path = new URL(normalizePublicBaseUrl(baseUrl)).pathname;
  return `${path}video-moment-search/${suffix}`;
}

function routeUrl(baseUrl: string, suffix = ''): string {
  return `${normalizePublicBaseUrl(baseUrl)}video-moment-search/${suffix}`;
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
): PublicSearchIndex {
  const validation = validateVideoCorpus(corpus);
  if (!validation.ok) {
    throw new Error(`Invalid video corpus: ${validation.diagnostics.join(', ')}`);
  }
  if (sourceEvidence !== undefined) {
    const evidenceValidation = validateCommonsSourceEvidence(
      corpus,
      sourceEvidence,
    );
    if (!evidenceValidation.ok) {
      throw new Error(
        `Invalid Commons source evidence: ${evidenceValidation.diagnostics.join(', ')}`,
      );
    }
  }
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
    const reviewEvidence = grant.reviewEvidence;
    if (
      reviewEvidence !== undefined &&
      !isReviewedSourceEvidenceSubstantive(reviewEvidence)
    ) {
      throw new Error(`Invalid reviewed-source evidence for ${entry.moment.id}`);
    }
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
        reviewEvidence?.reviewedOn ?? grant.permissionVerifiedAt.slice(0, 10),
      provenance:
        reviewEvidence === undefined
          ? `Corpus ${corpus.corpusId}; rights grant ${grant.id}; cue ${cueIds.join(', ')}`
          : `Corpus ${corpus.corpusId}; evidence ${reviewEvidence.evidenceId}; immutable rights revision ${reviewEvidence.immutableRightsRevisionUrl}; reviewed by ${reviewEvidence.reviewer} on ${reviewEvidence.reviewedOn}; rights grant ${grant.id}; cue ${cueIds.join(', ')}`,
      timestampUrl,
      timestampStrategy:
        entry.video.timestampStrategy ?? 'query-parameter',
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
    ['Verification date', entry.verificationDate],
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
        'Review record',
        `${entry.reviewEvidence.reviewer} · ${entry.reviewEvidence.reviewedOn}`,
      ],
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

function renderEntry(entry: PublicSearchEntry): string {
  const timestampUrl = exactTimestampUrl(
    entry.sourceUrl,
    entry.startSeconds,
    entry.timestampStrategy,
  );
  const link =
    timestampUrl === null || timestampUrl !== entry.timestampUrl
      ? '<span class="invalid-source">Exact source link unavailable</span>'
      : `<a href="${escapeHtml(timestampUrl)}">${escapeHtml(entry.videoTitle)} at ${escapeHtml(formatSeconds(entry.startSeconds))}</a>`;
  return `<article class="moment-card" data-moment-id="${escapeHtml(entry.momentId)}" aria-labelledby="heading-${escapeHtml(entry.momentId)}">
  <p class="eyebrow">Controlled fixture moment</p>
  <h3 id="heading-${escapeHtml(entry.momentId)}">${link}</h3>
  <dl class="moment-meta">${detailRows(entry)}</dl>
</article>`;
}

function renderEntries(entries: readonly PublicSearchEntry[]): string {
  return `<div class="moment-list">${entries.map(renderEntry).join('\n')}</div>`;
}

export function renderSearchResults(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  query: string,
): string {
  if (query.trim().length === 0) {
    return '<p class="guidance">Enter a phrase such as “robots control”.</p>';
  }
  const publicIndex = serializePublicSearchIndex(corpus, searchIndex);
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

function page(
  title: string,
  body: string,
  baseUrl: string,
  suffix = '',
  includeClient = false,
): string {
  const canonical = routeUrl(baseUrl, suffix);
  const styles = routePath(baseUrl, 'styles.css');
  const client = routePath(baseUrl, 'search-client.js');
  const script = includeClient
    ? `\n  <script type="module" src="${escapeHtml(client)}"></script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; style-src 'self'; script-src 'self'; connect-src 'self'">
  <meta name="description" content="${escapeHtml(videoMomentSearchSite.description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${escapeHtml(styles)}">${script}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to moment search</a>
  <header class="site-header"><div class="shell">
    <p class="eyebrow">Controlled fixture experiment</p>
    <h1>${escapeHtml(videoMomentSearchSite.name)}</h1>
    <p class="proposition">${escapeHtml(videoMomentSearchSite.proposition)}</p>
  </div></header>
  <main id="main-content" class="shell">${body}</main>
  <footer><div class="shell">Local deterministic integration candidate · No accounts, analytics, query retention, scraping, media download, or external communication.</div></footer>
</body>
</html>
`;
}

function initialResults(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
): readonly PublicSearchEntry[] {
  return serializePublicSearchIndex(corpus, searchIndex).entries;
}

export function renderSearchShell(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  baseUrl: string,
  sourceEvidence?: unknown,
): string {
  const initial =
    sourceEvidence === undefined
      ? initialResults(corpus, searchIndex)
      : serializePublicSearchIndex(corpus, searchIndex, sourceEvidence).entries;
  const allInitialEntriesReviewed =
    initial.length > 0 &&
    initial.every((entry) => entry.reviewEvidence !== undefined);
  const searchHeading = allInitialEntriesReviewed
    ? 'Search the reviewed public-source moment fixture'
    : 'Search the controlled moment fixture';
  const initialHeading = allInitialEntriesReviewed
    ? 'Initial reviewed moments'
    : 'Initial controlled moments';
  const rightsBoundary = allInitialEntriesReviewed
    ? 'This reviewed Commons source provides a timestamp link plus an original editorial annotation only. It does not host, embed, or distribute media or transcripts; claim endorsement or inferred permission; represent a live creator library; or provide usability, demand, or revenue evidence. It is not a live creator library.'
    : 'Each controlled result exposes its stored rights, provenance, and correction state. Review status is shown only when a validated evidence record is present. This route does not host, embed, or distribute media or transcripts; claim endorsement or inferred permission; represent a live creator library; or provide usability, demand, or revenue evidence.';
  const body = `<section id="moment-search-controls" class="search-panel" aria-labelledby="search-heading">
    <p class="eyebrow">Find an exact explanation</p>
    <h2 id="search-heading">${escapeHtml(searchHeading)}</h2>
    <form class="search-controls" role="search" data-moment-search>
      <div><label for="moment-query">What explanation do you remember?</label><input id="moment-query" name="q" type="search" autocomplete="off" data-moment-query></div>
      <button type="submit">Search moments</button>
    </form>
    <p class="search-status" aria-live="polite" data-search-status>Enter a phrase; the initial controlled moments remain available below.</p>
    <p class="error" data-search-error hidden>Search could not load. The initial controlled moments remain available below.</p>
    <div class="moment-list" data-client-results></div>
  </section>
  <section class="information-panel" aria-labelledby="start-heading">
    <h2 id="start-heading">Recover the explanation, then verify its context</h2>
    <p><strong>For:</strong> ${escapeHtml(videoMomentSearchSite.audience)}</p>
    <p><strong>Use this when:</strong> ${escapeHtml(videoMomentSearchSite.useCase)}</p>
    <h3>How to use it</h3><ol>${videoMomentSearchSite.howTo.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    <p><strong>What you get:</strong> ${escapeHtml(videoMomentSearchSite.outcome)}</p>
    <p class="boundary"><strong>Rights boundary:</strong> ${escapeHtml(rightsBoundary)}</p>
  </section>
  <section aria-labelledby="initial-heading" data-server-results>
    <p class="eyebrow">Available without JavaScript</p>
    <h2 id="initial-heading">${escapeHtml(initialHeading)}</h2>
    ${renderEntries(initial)}
  </section>`;
  return page(videoMomentSearchSite.title, body, baseUrl, '', true);
}

export function renderVideoMomentHome(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  baseUrl: string,
  sourceEvidence?: unknown,
): string {
  return renderSearchShell(corpus, searchIndex, baseUrl, sourceEvidence);
}

function filteredPage(
  title: string,
  entries: readonly PublicSearchEntry[],
  baseUrl: string,
  suffix: string,
): string {
  const content =
    entries.length === 0
      ? '<p class="guidance">No controlled fixture moments are available for this view.</p>'
      : renderEntries(entries);
  return page(
    title,
    `<section><h2>${escapeHtml(title)}</h2>${content}</section>`,
    baseUrl,
    suffix,
  );
}

export function renderVideoPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  videoId: string,
  baseUrl: string,
): string {
  return filteredPage(
    'Video moments',
    initialResults(corpus, searchIndex).filter(
      (entry) => entry.videoId === videoId,
    ),
    baseUrl,
    `videos/${encodeURIComponent(videoId)}/`,
  );
}

export function renderMomentPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  momentId: string,
  baseUrl: string,
): string {
  return filteredPage(
    'Moment detail',
    initialResults(corpus, searchIndex).filter(
      (entry) => entry.momentId === momentId,
    ),
    baseUrl,
    `moments/${encodeURIComponent(momentId)}/`,
  );
}

export function renderTopicPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  topicSlug: string,
  baseUrl: string,
): string {
  return filteredPage(
    `Topic: ${topicSlug}`,
    initialResults(corpus, searchIndex).filter((entry) =>
      entry.topicSlugs.includes(topicSlug),
    ),
    baseUrl,
    `topics/${encodeURIComponent(topicSlug)}/`,
  );
}

export function renderCreatorPage(
  corpus: VideoCorpus,
  searchIndex: SearchIndex,
  creatorId: string,
  baseUrl: string,
): string {
  return filteredPage(
    'Creator moments',
    initialResults(corpus, searchIndex).filter(
      (entry) => entry.creatorId === creatorId,
    ),
    baseUrl,
    `creators/${encodeURIComponent(creatorId)}/`,
  );
}

export function renderGuidePage(baseUrl: string): string {
  return page(
    'How to recover a moment',
    '<article><h2>How to recover a moment</h2><ol><li>Search the phrase you remember.</li><li>Inspect rights, provenance, and correction state.</li><li>Open the exact second and verify the surrounding source context.</li></ol><p>This guide applies only to the controlled fixture experiment.</p></article>',
    baseUrl,
    'guide/',
  );
}
