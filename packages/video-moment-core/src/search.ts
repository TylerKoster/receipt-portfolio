import {
  validateVideoCorpus,
  type VideoCorpus,
  type VideoMoment,
  type VideoRecord,
} from './contracts.js';

export interface SearchResult {
  readonly momentId: string;
  readonly videoId: string;
  readonly videoSlug: string;
  readonly videoTitle: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly excerpt: string;
  readonly topicSlugs: readonly string[];
  readonly state: 'active' | 'corrected';
  readonly timestampUrl: string;
  readonly score: number;
}

interface SearchIndexEntry {
  readonly moment: VideoMoment & {
    readonly state: 'active' | 'corrected';
  };
  readonly video: VideoRecord;
  readonly title: string;
  readonly topics: string;
  readonly excerpt: string;
  readonly tokens: ReadonlySet<string>;
}

export interface SearchIndex {
  readonly entries: readonly SearchIndexEntry[];
}

export interface BenchmarkCase {
  readonly query: string;
  readonly expectedTopThreeMomentIds: readonly string[];
}

export interface BenchmarkCaseResult {
  readonly query: string;
  readonly expectedTopThreeMomentIds: readonly string[];
  readonly returnedMomentIds: readonly string[];
  readonly topThreeHit: boolean;
  readonly timestampLandingErrorSeconds: number | null;
}

export interface BenchmarkEvaluation {
  readonly cases: readonly BenchmarkCaseResult[];
  readonly topThreeRecall: number;
  readonly maximumTimestampLandingErrorSeconds: number;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{Pd}_]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokens(value: string): readonly string[] {
  return normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function containsPhrase(value: string, phrase: string): boolean {
  const phraseTokens = tokens(phrase);
  const valueTokens = tokens(value);
  if (phraseTokens.length === 0 || phraseTokens.length > valueTokens.length) {
    return false;
  }
  return valueTokens.some((_, start) =>
    phraseTokens.every(
      (token, offset) => valueTokens[start + offset] === token,
    ),
  );
}

function scoreEntry(entry: SearchIndexEntry, query: string): number {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0 || !queryTokens.every((token) => entry.tokens.has(token))) {
    return 0;
  }

  const exactPhraseScore =
    (containsPhrase(entry.title, query) ? 10_000 : 0) +
    (containsPhrase(entry.topics, query) ? 10_000 : 0) +
    (containsPhrase(entry.excerpt, query) ? 10_000 : 0);
  const titleTokenScore = queryTokens.filter((token) =>
    tokens(entry.title).includes(token),
  ).length * 100;
  const topicTokenScore = queryTokens.filter((token) =>
    tokens(entry.topics).includes(token),
  ).length * 50;
  const excerptTokenScore = queryTokens.filter((token) =>
    tokens(entry.excerpt).includes(token),
  ).length * 10;

  return exactPhraseScore + titleTokenScore + topicTokenScore + excerptTokenScore;
}

function compareResults(left: SearchResult, right: SearchResult): number {
  return (
    right.score - left.score ||
    (left.videoSlug < right.videoSlug ? -1 : left.videoSlug > right.videoSlug ? 1 : 0) ||
    left.startSeconds - right.startSeconds ||
    (left.momentId < right.momentId ? -1 : left.momentId > right.momentId ? 1 : 0)
  );
}

function timestampFromUrl(url: string): number | null {
  try {
    const value = new URL(url).searchParams.get('t');
    if (value === null || !/^\d+$/u.test(value)) return null;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

export function buildTimestampUrl(
  video: VideoRecord,
  startSeconds: number,
): string {
  if (!Number.isInteger(startSeconds) || startSeconds < 0) {
    throw new Error('startSeconds must be a non-negative integer');
  }
  const url = new URL(video.sourceUrl);
  url.searchParams.set('t', String(startSeconds));
  return url.toString();
}

export function buildSearchIndex(corpus: VideoCorpus): SearchIndex {
  const validation = validateVideoCorpus(corpus);
  if (!validation.ok) {
    throw new Error(`Invalid video corpus: ${validation.diagnostics.join(', ')}`);
  }

  const videosById = new Map(corpus.videos.map((video) => [video.id, video]));
  const entries = corpus.moments
    .filter(
      (moment): moment is VideoMoment & { readonly state: 'active' | 'corrected' } =>
        moment.state === 'active' || moment.state === 'corrected',
    )
    .map((moment) => {
      const video = videosById.get(moment.videoId);
      if (!video) throw new Error(`Invalid video corpus: missing video ${moment.videoId}`);
      const title = normalize(video.title);
      const topics = normalize(moment.topicSlugs.join(' '));
      const excerpt = normalize(moment.excerpt);
      return {
        moment,
        video,
        title,
        topics,
        excerpt,
        tokens: new Set(tokens(`${title} ${topics} ${excerpt}`)),
      };
    });

  return { entries };
}

export function searchMoments(
  index: SearchIndex,
  query: string,
  limit = 10,
): readonly SearchResult[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0 || limit <= 0) return [];

  return index.entries
    .map((entry) => {
      const score = scoreEntry(entry, normalizedQuery);
      if (score === 0) return null;
      return {
        momentId: entry.moment.id,
        videoId: entry.video.id,
        videoSlug: entry.video.slug,
        videoTitle: entry.video.title,
        startSeconds: entry.moment.startSeconds,
        endSeconds: entry.moment.endSeconds,
        excerpt: entry.moment.excerpt,
        topicSlugs: entry.moment.topicSlugs,
        state: entry.moment.state,
        timestampUrl: buildTimestampUrl(entry.video, entry.moment.startSeconds),
        score,
      } satisfies SearchResult;
    })
    .filter((result): result is SearchResult => result !== null)
    .sort(compareResults)
    .slice(0, Math.floor(limit));
}

export function evaluateBenchmark(
  index: SearchIndex,
  cases: readonly BenchmarkCase[],
): BenchmarkEvaluation {
  const results = cases.map((benchmarkCase) => {
    const found = searchMoments(index, benchmarkCase.query, 3);
    const returnedMomentIds = found.map((result) => result.momentId);
    const matchedResult = found.find((result) =>
      benchmarkCase.expectedTopThreeMomentIds.includes(result.momentId),
    );
    const timestamp = matchedResult
      ? timestampFromUrl(matchedResult.timestampUrl)
      : null;
    return {
      query: benchmarkCase.query,
      expectedTopThreeMomentIds: benchmarkCase.expectedTopThreeMomentIds,
      returnedMomentIds,
      topThreeHit: matchedResult !== undefined,
      timestampLandingErrorSeconds:
        matchedResult === undefined
          ? null
          : timestamp === null
            ? Infinity
            : Math.abs(matchedResult.startSeconds - timestamp),
    };
  });
  const observedLandingErrors = results
    .map((result) => result.timestampLandingErrorSeconds)
    .filter((error): error is number => error !== null);

  return {
    cases: results,
    topThreeRecall:
      results.length === 0
        ? 0
        : results.filter((result) => result.topThreeHit).length / results.length,
    maximumTimestampLandingErrorSeconds:
      observedLandingErrors.length === 0 ? 0 : Math.max(...observedLandingErrors),
  };
}
