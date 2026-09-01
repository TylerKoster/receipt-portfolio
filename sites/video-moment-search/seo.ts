import {
  buildTimestampUrl,
  validateVideoCorpus,
  type VideoCorpus,
  type VideoMoment,
} from '../../packages/video-moment-core/src/index.js';
import { normalizePublicBaseUrl } from '../shared/render.js';
import {
  parseVideoSourceEvidenceManifest,
  validateCommonsSourceEvidence,
} from './source-evidence.js';

export interface OriginalSynthesis {
  readonly text: string;
  readonly isProjectOriginal: boolean;
}

export interface SeoDocument {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly body: string;
  readonly feedId?: string;
}

export interface SeoValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export interface FeedGuide {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly sourceMomentIds: readonly string[];
  readonly synthesis: OriginalSynthesis;
}

export interface TopicDiscoveryPage {
  readonly slug: string;
  readonly synthesis: OriginalSynthesis;
}

export interface DiscoveryRoutes {
  readonly topics?: readonly TopicDiscoveryPage[];
  readonly guides?: readonly FeedGuide[];
}

export interface EligibleDiscoveryRoutes {
  readonly topics: readonly TopicDiscoveryPage[];
  readonly guides: readonly FeedGuide[];
}

function siteRoot(origin: string): string {
  return `${normalizePublicBaseUrl(origin)}video-moment-search/`;
}

function canonicalUrl(origin: string, suffix: string): string {
  return new URL(suffix, siteRoot(origin)).href;
}

function assertValidCorpus(corpus: VideoCorpus): void {
  const validation = validateVideoCorpus(corpus);
  if (!validation.ok) {
    throw new Error(
      `Invalid video corpus: ${validation.diagnostics.join(', ')}`,
    );
  }
}

function assertValidPublication(
  corpus: VideoCorpus,
  sourceEvidence: unknown,
  validationNow: Date,
): void {
  const reviewed =
    corpus.videos.some((video) => video.reviewEvidenceId !== undefined) ||
    corpus.rights.some((grant) => grant.reviewEvidence !== undefined);
  if (!reviewed) {
    assertValidCorpus(corpus);
    return;
  }
  if (sourceEvidence === undefined) {
    throw new Error(
      'Evidence manifest is required for reviewed corpus records',
    );
  }
  const validation = validateCommonsSourceEvidence(
    corpus,
    sourceEvidence,
    validationNow,
  );
  if (!validation.ok) {
    throw new Error(
      `Invalid evidence manifest: ${validation.diagnostics.join(', ')}`,
    );
  }
}

function isPublicMoment(
  moment: VideoMoment,
): moment is VideoMoment & { readonly state: 'active' | 'corrected' } {
  return moment.state === 'active' || moment.state === 'corrected';
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function isCanonicalTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function hasCompleteFeedMetadata(guide: FeedGuide): boolean {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(guide.id) &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(guide.slug) &&
    guide.title.trim().length > 0 &&
    guide.summary.trim().length > 0 &&
    isCanonicalTimestamp(guide.updatedAt)
  );
}

function normalizedWords(value: string): readonly string[] {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function bodyWords(body: string): Set<string> {
  return new Set(normalizedWords(body));
}

function hasSubstantiveOriginalSynthesis(
  synthesis: OriginalSynthesis | undefined,
): synthesis is OriginalSynthesis {
  if (synthesis?.isProjectOriginal !== true) return false;
  const words = normalizedWords(synthesis.text);
  return (
    words.length >= 8 &&
    new Set(words).size >= 6 &&
    words.join(' ').length >= 50
  );
}

function substantiallyIdentical(left: string, right: string): boolean {
  const leftWords = bodyWords(left);
  const rightWords = bodyWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return false;
  const intersection = [...leftWords].filter((word) => rightWords.has(word));
  const union = new Set([...leftWords, ...rightWords]);
  return intersection.length / union.size >= 0.9;
}

export function validateUniqueSeoDocuments(
  documents: readonly SeoDocument[],
): SeoValidation {
  const diagnostics: string[] = [];
  const fields = [
    ['TITLE', (document: SeoDocument) => document.title],
    ['DESCRIPTION', (document: SeoDocument) => document.description],
    ['CANONICAL', (document: SeoDocument) => document.canonical],
    ['FEED_ID', (document: SeoDocument) => document.feedId],
  ] as const;
  for (const [label, select] of fields) {
    const seen = new Set<string>();
    documents.forEach((document, index) => {
      const selected = select(document);
      if (selected === undefined) return;
      const value = selected.normalize('NFKC').trim().toLowerCase();
      if (seen.has(value)) diagnostics.push(`SEO_${label}_DUPLICATE:${index}`);
      seen.add(value);
    });
  }
  documents.forEach((document, index) => {
    if (
      documents
        .slice(0, index)
        .some((prior) => substantiallyIdentical(prior.body, document.body))
    ) {
      diagnostics.push(`SEO_BODY_SUBSTANTIALLY_DUPLICATE:${index}`);
    }
  });
  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return { ok: stableDiagnostics.length === 0, diagnostics: stableDiagnostics };
}

export function isDiscoveryPageEligible(
  corpus: VideoCorpus,
  sourceMomentIds: readonly string[],
  synthesis?: OriginalSynthesis,
): boolean {
  const validation = validateVideoCorpus(corpus);
  if (!validation.ok) return false;
  if (!hasSubstantiveOriginalSynthesis(synthesis)) {
    return false;
  }
  const requestedIds = new Set(sourceMomentIds);
  const moments = corpus.moments.filter(
    (moment) => requestedIds.has(moment.id) && isPublicMoment(moment),
  );
  const videosById = new Map(corpus.videos.map((video) => [video.id, video]));
  const sourceUrls = new Set(
    moments.map(
      (moment) => new URL(videosById.get(moment.videoId)!.sourceUrl).href,
    ),
  );
  if (
    moments.length !== requestedIds.size ||
    requestedIds.size < 2 ||
    sourceUrls.size < 2
  ) {
    return false;
  }
  const normalizedSynthesis = normalizedWords(synthesis.text).join(' ');
  return !moments.some(
    (moment) =>
      normalizedWords(moment.excerpt).join(' ') === normalizedSynthesis,
  );
}

export function eligibleDiscoveryRoutes(
  corpus: VideoCorpus,
  origin: string,
  routes: DiscoveryRoutes = {},
): EligibleDiscoveryRoutes {
  const topics = (routes.topics ?? [])
    .filter(
      (topic) =>
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(topic.slug) &&
        isDiscoveryPageEligible(
          corpus,
          corpus.moments
            .filter((moment) => moment.topicSlugs.includes(topic.slug))
            .map((moment) => moment.id),
          topic.synthesis,
        ),
    )
    .toSorted((left, right) => left.slug.localeCompare(right.slug));
  const guides = (routes.guides ?? [])
    .filter(
      (guide) =>
        hasCompleteFeedMetadata(guide) &&
        isDiscoveryPageEligible(corpus, guide.sourceMomentIds, guide.synthesis),
    )
    .toSorted((left, right) => left.slug.localeCompare(right.slug));
  const documents: SeoDocument[] = [
    ...topics.map((topic) => {
      const topicName = topic.slug.replaceAll('-', ' ');
      return {
        title: `${topicName} video moments | AI Moment Index`,
        description: `A project-original comparison of reviewed ${topicName} moments from different source URLs.`,
        canonical: canonicalUrl(origin, `topics/${topic.slug}/`),
        body: topic.synthesis.text,
      };
    }),
    ...guides.map((guide) => ({
      title: `${guide.title} | AI Moment Index`,
      description: guide.summary,
      canonical: canonicalUrl(origin, `guides/${guide.slug}/`),
      body: guide.synthesis.text,
      feedId: canonicalUrl(origin, `feed-guide-${guide.id}`),
    })),
  ];
  if (!validateUniqueSeoDocuments(documents).ok) {
    return { topics: [], guides: [] };
  }
  return { topics, guides };
}

export function renderSitemap(
  corpus: VideoCorpus,
  origin: string,
  discoveryRoutes: DiscoveryRoutes = {},
  additionalPaths: readonly string[] = [],
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  assertValidPublication(corpus, sourceEvidence, validationNow);
  const publicMoments = corpus.moments.filter(isPublicMoment);
  const videosById = new Map(corpus.videos.map((video) => [video.id, video]));
  const publicVideos = [
    ...new Map(
      publicMoments.map((moment) => {
        const video = videosById.get(moment.videoId)!;
        return [video.id, video] as const;
      }),
    ).values(),
  ];
  const discovery = eligibleDiscoveryRoutes(corpus, origin, discoveryRoutes);
  const locations = [
    siteRoot(origin),
    ...publicVideos.map((video) =>
      canonicalUrl(origin, `videos/${video.slug}/`),
    ),
    ...publicMoments.map((moment) =>
      canonicalUrl(origin, `moments/${moment.id}/`),
    ),
    ...new Set(
      publicVideos.map((video) =>
        canonicalUrl(origin, `creators/${video.creatorId}/`),
      ),
    ),
    ...discovery.topics.map((topic) =>
      canonicalUrl(origin, `topics/${topic.slug}/`),
    ),
    ...discovery.guides.map((guide) =>
      canonicalUrl(origin, `guides/${guide.slug}/`),
    ),
    ...additionalPaths.map((path) =>
      canonicalUrl(origin, path.replace(/^\/+/, '')),
    ),
  ].sort();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map((location) => `  <url><loc>${xml(location)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderSitemapIndex(origin: string): string {
  const sitemaps = [canonicalUrl(origin, 'sitemap.xml')];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((location) => `  <sitemap><loc>${xml(location)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

export function renderAtomFeed(
  corpus: VideoCorpus,
  origin: string,
  guides: readonly FeedGuide[] = [],
  sourceEvidence?: unknown,
  validationNow: Date = new Date(),
): string {
  assertValidPublication(corpus, sourceEvidence, validationNow);
  const videos = new Map(corpus.videos.map((video) => [video.id, video]));
  const grants = new Map(corpus.rights.map((grant) => [grant.id, grant]));
  const evidenceRecords =
    sourceEvidence === undefined
      ? new Map()
      : new Map(
          parseVideoSourceEvidenceManifest(sourceEvidence).records.map(
            (record) => [record.evidenceId, record],
          ),
        );
  const moments = corpus.moments.filter(isPublicMoment);
  const eligibleGuides = eligibleDiscoveryRoutes(corpus, origin, {
    guides,
  }).guides;
  const updates = [
    ...moments.map((moment) => {
      const grant = grants.get(moment.rightsGrantId)!;
      return grant.reviewEvidence === undefined
        ? grant.permissionVerifiedAt
        : evidenceRecords.get(grant.reviewEvidence.evidenceId)!.observedStatus
            .observedAt;
    }),
    ...eligibleGuides.map((guide) => guide.updatedAt),
  ].sort();
  const updated = updates.at(-1);
  if (updated === undefined) {
    throw new Error('No verified feed entries');
  }
  const momentEntries = moments.map((moment) => {
    const video = videos.get(moment.videoId)!;
    const grant = grants.get(moment.rightsGrantId)!;
    const updated =
      grant.reviewEvidence === undefined
        ? grant.permissionVerifiedAt
        : evidenceRecords.get(grant.reviewEvidence.evidenceId)!.observedStatus
            .observedAt;
    const canonical = canonicalUrl(origin, `moments/${moment.id}/`);
    const exactSource = buildTimestampUrl(video, moment.startSeconds);
    return `  <entry>\n    <id>${xml(canonical)}</id>\n    <title>${xml(`${video.title} at ${formatSeconds(moment.startSeconds)}`)}</title>\n    <updated>${xml(updated)}</updated>\n    <link rel="alternate" href="${xml(canonical)}"/>\n    <link rel="related" href="${xml(exactSource)}"/>\n    <summary>${xml(moment.excerpt)}</summary>\n  </entry>`;
  });
  const guideEntries = eligibleGuides.map((guide) => {
    const canonical = canonicalUrl(origin, `guides/${guide.slug}/`);
    return `  <entry>\n    <id>${xml(`${siteRoot(origin)}feed-guide-${guide.id}`)}</id>\n    <title>${xml(guide.title)}</title>\n    <updated>${xml(guide.updatedAt)}</updated>\n    <link rel="alternate" href="${xml(canonical)}"/>\n    <summary>${xml(guide.summary)}</summary>\n  </entry>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <id>${xml(siteRoot(origin))}</id>\n  <title>AI Moment Index verified updates</title>\n  <updated>${xml(updated)}</updated>\n  <link rel="self" href="${xml(canonicalUrl(origin, 'feed.xml'))}"/>\n${[...momentEntries, ...guideEntries].join('\n')}\n</feed>\n`;
}
