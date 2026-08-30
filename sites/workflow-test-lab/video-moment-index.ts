export type MomentState = 'active' | 'corrected' | 'removed';
export type MomentClassification = 'mention' | 'discussion';
export type RetrievalMode = 'exact' | 'semantic';

export interface VideoMoment {
  id: string;
  videoId: string;
  videoSlug: string;
  syntheticUrl: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  topic: string;
  expectedClassification: MomentClassification;
  provenanceLabel: string;
  confidence: number;
  state: MomentState;
}

export interface VideoRecord {
  id: string;
  slug: string;
  title: string;
  syntheticUrl: string;
}

export interface VideoMomentCorpus {
  label: string;
  videos: readonly VideoRecord[];
  moments: readonly VideoMoment[];
}

export interface SyntheticCorpusValidation {
  valid: boolean;
  diagnostics: readonly string[];
}

const semanticExpansions: Readonly<Record<string, readonly string[]>> = {
  assurance: ['validation'],
  quality: ['testing'],
  testing: ['validation', 'deterministic'],
  validation: ['testing', 'checks'],
};

function isNonempty(value: string): boolean {
  return value.trim().length > 0;
}

function isSyntheticUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'synthetic.invalid';
  } catch {
    return false;
  }
}

function videoUrlMatchesSlug(video: VideoRecord): boolean {
  try {
    return (
      isSyntheticUrl(video.syntheticUrl) &&
      new URL(video.syntheticUrl).pathname.endsWith(video.slug)
    );
  } catch {
    return false;
  }
}

export function validateSyntheticCorpus(
  corpus: VideoMomentCorpus,
): SyntheticCorpusValidation {
  const diagnostics: string[] = [];
  const videoIds = new Set<string>();
  const videoSlugs = new Set<string>();
  const momentIds = new Set<string>();
  const videosById = new Map<string, VideoRecord>();

  if (
    !isNonempty(corpus.label) ||
    !/\bSYNTHETIC\b/.test(corpus.label) ||
    !/\bNOT LIVE DATA\b/.test(corpus.label)
  ) {
    diagnostics.push('CORPUS_LABEL_INVALID');
  }

  for (const video of corpus.videos) {
    if (!isNonempty(video.id)) diagnostics.push('VIDEO_ID_INVALID');
    else if (videoIds.has(video.id))
      diagnostics.push(`VIDEO_ID_DUPLICATE:${video.id}`);
    else {
      videoIds.add(video.id);
      videosById.set(video.id, video);
    }

    if (!isNonempty(video.slug)) diagnostics.push('VIDEO_SLUG_INVALID');
    else if (videoSlugs.has(video.slug))
      diagnostics.push(`VIDEO_SLUG_DUPLICATE:${video.slug}`);
    else videoSlugs.add(video.slug);

    if (!videoUrlMatchesSlug(video))
      diagnostics.push(`VIDEO_URL_INVALID:${video.id}`);
  }

  for (const moment of corpus.moments) {
    if (!isNonempty(moment.id)) diagnostics.push('MOMENT_ID_INVALID');
    else if (momentIds.has(moment.id))
      diagnostics.push(`MOMENT_ID_DUPLICATE:${moment.id}`);
    else momentIds.add(moment.id);

    const linkedVideo = videosById.get(moment.videoId);
    if (
      !linkedVideo ||
      linkedVideo.slug !== moment.videoSlug ||
      linkedVideo.syntheticUrl !== moment.syntheticUrl
    ) {
      diagnostics.push(`MOMENT_VIDEO_LINK_INVALID:${moment.id}`);
    }

    if (!isSyntheticUrl(moment.syntheticUrl))
      diagnostics.push(`MOMENT_URL_INVALID:${moment.id}`);

    if (
      !Number.isInteger(moment.startSeconds) ||
      !Number.isInteger(moment.endSeconds) ||
      moment.startSeconds < 0 ||
      moment.endSeconds < 0 ||
      moment.startSeconds >= moment.endSeconds
    ) {
      diagnostics.push(`MOMENT_TIMING_INVALID:${moment.id}`);
    }

    if (
      !Number.isInteger(moment.confidence) ||
      moment.confidence < 0 ||
      moment.confidence > 100
    ) {
      diagnostics.push(`MOMENT_CONFIDENCE_INVALID:${moment.id}`);
    }

    if (
      moment.expectedClassification !== 'mention' &&
      moment.expectedClassification !== 'discussion'
    ) {
      diagnostics.push(`MOMENT_CLASSIFICATION_INVALID:${moment.id}`);
    }

    if (
      moment.state !== 'active' &&
      moment.state !== 'corrected' &&
      moment.state !== 'removed'
    ) {
      diagnostics.push(`MOMENT_STATE_INVALID:${moment.id}`);
    }

    if (moment.provenanceLabel !== 'first-party synthetic fixture')
      diagnostics.push(`MOMENT_PROVENANCE_INVALID:${moment.id}`);
  }

  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return {
    valid: stableDiagnostics.length === 0,
    diagnostics: stableDiagnostics,
  };
}

function assertSyntheticCorpus(corpus: VideoMomentCorpus): void {
  const validation = validateSyntheticCorpus(corpus);
  if (!validation.valid)
    throw new Error(
      `Invalid synthetic corpus: ${validation.diagnostics.join(', ')}`,
    );
}

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

export function classifyMoment(moment: VideoMoment): MomentClassification {
  const words = tokens(moment.text);
  const explanatoryTerms = new Set([
    'discussion',
    'detailed',
    'validation',
    'deterministic',
    'checks',
    'because',
    'how',
  ]);
  const explanatoryMatches = words.filter((word) =>
    explanatoryTerms.has(word),
  ).length;
  return words.length >= 8 && explanatoryMatches >= 2
    ? 'discussion'
    : 'mention';
}

export function buildTimestampDeepLink(moment: VideoMoment): string {
  return `${moment.syntheticUrl}?t=${moment.startSeconds}`;
}

export function validateLocalReplay(
  moment: VideoMoment,
  observedSeconds: number,
): { valid: boolean; deltaSeconds: number } {
  const deltaSeconds = Math.abs(observedSeconds - moment.startSeconds);
  return { valid: deltaSeconds <= 2, deltaSeconds };
}

export function canonicalVideoPath(slug: string): string {
  return `/video/${slug}/`;
}

function semanticQueryTokens(query: string): string[] {
  const expanded = new Set(tokens(query));
  for (const token of [...expanded]) {
    for (const equivalent of semanticExpansions[token] ?? [])
      expanded.add(equivalent);
  }
  return [...expanded].sort();
}

export function retrieve(
  corpus: VideoMomentCorpus,
  query: string,
  mode: RetrievalMode,
) {
  assertSyntheticCorpus(corpus);
  const queryTokens =
    mode === 'semantic' ? semanticQueryTokens(query) : tokens(query);
  return corpus.moments
    .filter((moment) => moment.state !== 'removed')
    .map((moment) => {
      if (mode === 'exact') {
        return {
          moment,
          score:
            moment.topic.toLowerCase() === query.trim().toLowerCase() ? 100 : 0,
        };
      }
      const searchable = new Set(tokens(`${moment.topic} ${moment.text}`));
      const score = queryTokens.reduce(
        (total, token) => total + (searchable.has(token) ? 25 : 0),
        0,
      );
      return { moment, score };
    })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.moment.id.localeCompare(right.moment.id),
    );
}

function renderMoment(moment: VideoMoment): string {
  return `<article data-moment-id="${escapeHtml(moment.id)}"><h2>${escapeHtml(moment.id)}</h2><p>${escapeHtml(moment.text)}</p><p>Classification: ${classifyMoment(moment)}</p><p>State: ${moment.state}</p><p>Provenance: ${escapeHtml(moment.provenanceLabel)}</p><p>Confidence: ${moment.confidence}</p><a href="${escapeHtml(buildTimestampDeepLink(moment))}">Synthetic timestamp replay</a></article>`;
}

export function renderCanonicalVideo(
  corpus: VideoMomentCorpus,
  slug: string,
): { canonicalPath: string; html: string } {
  assertSyntheticCorpus(corpus);
  const video = corpus.videos.find((candidate) => candidate.slug === slug);
  if (!video) throw new Error(`Unknown synthetic video slug: ${slug}`);
  const moments = corpus.moments.filter(
    (moment) => moment.videoId === video.id && moment.state !== 'removed',
  );
  const html = `<main data-synthetic-pilot="true"><p>SYNTHETIC VIDEO MOMENT INDEX PILOT — NOT LIVE DATA</p><h1>${escapeHtml(video.title)}</h1>${moments.map(renderMoment).join('')}<p>Removed records are excluded from this synthetic rendering.</p></main>`;
  return { canonicalPath: canonicalVideoPath(video.slug), html };
}

export function renderTransientQuery(
  corpus: VideoMomentCorpus,
  query: string,
  mode: RetrievalMode,
): { robots: 'noindex,nofollow'; html: string } {
  assertSyntheticCorpus(corpus);
  const results = retrieve(corpus, query, mode);
  const html = `<meta name="robots" content="noindex,nofollow"><main data-synthetic-pilot="true"><p>SYNTHETIC VIDEO MOMENT INDEX PILOT — NOT LIVE DATA</p><h1>Transient query: ${escapeHtml(query)}</h1>${results.map((result) => renderMoment(result.moment)).join('')}</main>`;
  return { robots: 'noindex,nofollow', html };
}
