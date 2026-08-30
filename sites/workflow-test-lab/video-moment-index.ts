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
  replayObservedSeconds: number;
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

const semanticExpansions: Readonly<Record<string, readonly string[]>> = {
  assurance: ['validation'],
  quality: ['testing'],
  testing: ['validation', 'deterministic'],
  validation: ['testing', 'checks'],
};

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
  const deltaSeconds = Math.abs(observedSeconds - moment.replayObservedSeconds);
  return { valid: deltaSeconds < 2, deltaSeconds };
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
  const results = retrieve(corpus, query, mode);
  const html = `<meta name="robots" content="noindex,nofollow"><main data-synthetic-pilot="true"><p>SYNTHETIC VIDEO MOMENT INDEX PILOT — NOT LIVE DATA</p><h1>Transient query: ${escapeHtml(query)}</h1>${results.map((result) => renderMoment(result.moment)).join('')}</main>`;
  return { robots: 'noindex,nofollow', html };
}
