import {
  buildTimestampUrl,
  validateVideoCorpus,
  type VideoCorpus,
  type VideoMoment,
  type VideoRecord,
} from '../../packages/video-moment-core/src/index.js';
import { normalizePublicBaseUrl } from '../shared/render.js';

export interface OriginalSynthesis {
  readonly text: string;
  readonly isProjectOriginal: boolean;
}

export interface SeoDocument {
  readonly title: string;
  readonly description: string;
  readonly canonical: string;
  readonly body: string;
}

export interface SeoValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export interface ClipStructuredData {
  readonly '@type': 'Clip';
  readonly name: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly url: string;
}

export interface VideoObjectStructuredData {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'VideoObject';
  readonly name: string;
  readonly description?: string;
  readonly contentUrl: string;
  readonly duration: string;
  readonly url: string;
  readonly hasPart: readonly ClipStructuredData[];
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

function isoDuration(seconds: number): string {
  return `PT${seconds}S`;
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

export function videoStructuredData(
  video: VideoRecord,
  moments: readonly VideoMoment[],
  origin: string,
): VideoObjectStructuredData {
  const publicMoments = moments
    .filter((moment) => moment.videoId === video.id && isPublicMoment(moment))
    .toSorted(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.id.localeCompare(right.id),
    );
  const description = publicMoments[0]?.excerpt;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    ...(description === undefined ? {} : { description }),
    contentUrl: video.sourceUrl,
    duration: isoDuration(video.durationSeconds),
    url: canonicalUrl(origin, `videos/${encodeURIComponent(video.slug)}/`),
    hasPart: publicMoments.map((moment) => ({
      '@type': 'Clip',
      name: moment.excerpt,
      startOffset: moment.startSeconds,
      endOffset: moment.endSeconds,
      url: buildTimestampUrl(video, moment.startSeconds),
    })),
  };
}

function bodyWords(body: string): Set<string> {
  return new Set(
    body
      .replace(/<[^>]*>/gu, ' ')
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim()
      .split(/\s+/u)
      .filter(Boolean),
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
  ] as const;
  for (const [label, select] of fields) {
    const seen = new Set<string>();
    documents.forEach((document, index) => {
      const value = select(document).normalize('NFKC').trim().toLowerCase();
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
  if (
    synthesis?.isProjectOriginal !== true ||
    synthesis.text.trim().length === 0
  ) {
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
  const normalizedSynthesis = [...bodyWords(synthesis.text)].join(' ');
  return !moments.some(
    (moment) =>
      [...bodyWords(moment.excerpt)].join(' ') === normalizedSynthesis,
  );
}

export function eligibleDiscoveryRoutes(
  corpus: VideoCorpus,
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
    .filter(
      (topic, index, candidates) =>
        candidates.findIndex((candidate) => candidate.slug === topic.slug) ===
        index,
    )
    .toSorted((left, right) => left.slug.localeCompare(right.slug));
  const guides = (routes.guides ?? [])
    .filter(
      (guide) =>
        hasCompleteFeedMetadata(guide) &&
        isDiscoveryPageEligible(corpus, guide.sourceMomentIds, guide.synthesis),
    )
    .filter(
      (guide, index, candidates) =>
        candidates.findIndex((candidate) => candidate.slug === guide.slug) ===
        index,
    )
    .toSorted((left, right) => left.slug.localeCompare(right.slug));
  return { topics, guides };
}

export function renderSitemap(
  corpus: VideoCorpus,
  origin: string,
  discoveryRoutes: DiscoveryRoutes = {},
): string {
  assertValidCorpus(corpus);
  const publicMoments = corpus.moments.filter(isPublicMoment);
  const videoIds = new Set(publicMoments.map((moment) => moment.videoId));
  const creatorIds = new Set(
    corpus.videos
      .filter((video) => videoIds.has(video.id))
      .map((video) => video.creatorId),
  );
  const discovery = eligibleDiscoveryRoutes(corpus, discoveryRoutes);
  const locations = [
    ...corpus.videos
      .filter((video) => videoIds.has(video.id))
      .map((video) => canonicalUrl(origin, `videos/${video.slug}/`)),
    ...publicMoments.map((moment) =>
      canonicalUrl(origin, `moments/${moment.id}/`),
    ),
    ...[...creatorIds].map((creatorId) =>
      canonicalUrl(origin, `creators/${creatorId}/`),
    ),
    ...discovery.topics.map((topic) =>
      canonicalUrl(origin, `topics/${topic.slug}/`),
    ),
    ...discovery.guides.map((guide) =>
      canonicalUrl(origin, `guides/${guide.slug}/`),
    ),
  ].sort();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map((location) => `  <url><loc>${xml(location)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderVideoSitemap(
  corpus: VideoCorpus,
  origin: string,
): string {
  assertValidCorpus(corpus);
  const urls = corpus.videos.flatMap((video) => {
    const moments = corpus.moments
      .filter((moment) => moment.videoId === video.id && isPublicMoment(moment))
      .toSorted(
        (left, right) =>
          left.startSeconds - right.startSeconds ||
          left.id.localeCompare(right.id),
      );
    if (moments.length === 0) return [];
    const first = moments[0]!;
    return [
      `  <url>\n    <loc>${xml(canonicalUrl(origin, `videos/${video.slug}/`))}</loc>\n    <video:video>\n      <video:title>${xml(video.title)}</video:title>\n      <video:description>${xml(first.excerpt)}</video:description>\n      <video:player_loc>${xml(buildTimestampUrl(video, first.startSeconds))}</video:player_loc>\n      <video:duration>${video.durationSeconds}</video:duration>\n    </video:video>\n  </url>`,
    ];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderSitemapIndex(origin: string): string {
  const sitemaps = ['sitemap.xml', 'video-sitemap.xml'].map((file) =>
    canonicalUrl(origin, file),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((location) => `  <sitemap><loc>${xml(location)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

export function renderAtomFeed(
  corpus: VideoCorpus,
  origin: string,
  guides: readonly FeedGuide[] = [],
): string {
  assertValidCorpus(corpus);
  const videos = new Map(corpus.videos.map((video) => [video.id, video]));
  const grants = new Map(corpus.rights.map((grant) => [grant.id, grant]));
  const moments = corpus.moments.filter(isPublicMoment);
  const eligibleGuides = eligibleDiscoveryRoutes(corpus, { guides }).guides;
  const updates = [
    ...moments.map(
      (moment) => grants.get(moment.rightsGrantId)!.permissionVerifiedAt,
    ),
    ...eligibleGuides.map((guide) => guide.updatedAt),
  ].sort();
  const updated = updates.at(-1);
  if (updated === undefined) {
    throw new Error('No verified feed entries');
  }
  const momentEntries = moments.map((moment) => {
    const video = videos.get(moment.videoId)!;
    const grant = grants.get(moment.rightsGrantId)!;
    const canonical = canonicalUrl(origin, `moments/${moment.id}/`);
    const exactSource = buildTimestampUrl(video, moment.startSeconds);
    return `  <entry>\n    <id>${xml(canonical)}</id>\n    <title>${xml(`${video.title} at ${formatSeconds(moment.startSeconds)}`)}</title>\n    <updated>${xml(grant.permissionVerifiedAt)}</updated>\n    <link rel="alternate" href="${xml(canonical)}"/>\n    <link rel="related" href="${xml(exactSource)}"/>\n    <summary>${xml(moment.excerpt)}</summary>\n  </entry>`;
  });
  const guideEntries = eligibleGuides.map((guide) => {
    const canonical = canonicalUrl(origin, `guides/${guide.slug}/`);
    return `  <entry>\n    <id>${xml(`${siteRoot(origin)}feed-guide-${guide.id}`)}</id>\n    <title>${xml(guide.title)}</title>\n    <updated>${xml(guide.updatedAt)}</updated>\n    <link rel="alternate" href="${xml(canonical)}"/>\n    <summary>${xml(guide.summary)}</summary>\n  </entry>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <id>${xml(siteRoot(origin))}</id>\n  <title>AI Moment Index verified updates</title>\n  <updated>${xml(updated)}</updated>\n  <link rel="self" href="${xml(canonicalUrl(origin, 'feed.xml'))}"/>\n${[...momentEntries, ...guideEntries].join('\n')}\n</feed>\n`;
}
