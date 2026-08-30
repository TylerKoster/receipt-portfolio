export interface PublicSearchEntry {
  readonly momentId: string;
  readonly videoId: string;
  readonly videoSlug: string;
  readonly sourceUrl: string;
  readonly videoTitle: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly excerpt: string;
  readonly topicSlugs: readonly string[];
  readonly correctionState: 'active' | 'corrected';
  readonly confidenceClass: string;
  readonly rightsStatus: string;
  readonly verificationDate: string;
  readonly provenance: string;
  readonly timestampUrl: string;
}

export interface PublicSearchIndex {
  readonly schemaVersion: 1;
  readonly corpusId: string;
  readonly entries: readonly PublicSearchEntry[];
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
  return (
    phraseTokens.length > 0 &&
    phraseTokens.length <= valueTokens.length &&
    valueTokens.some((_, start) =>
      phraseTokens.every(
        (token, offset) => valueTokens[start + offset] === token,
      ),
    )
  );
}

function safeTimestampEntry(value: unknown): value is PublicSearchEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<PublicSearchEntry>;
  if (
    typeof entry.momentId !== 'string' ||
    typeof entry.videoId !== 'string' ||
    typeof entry.videoSlug !== 'string' ||
    typeof entry.sourceUrl !== 'string' ||
    typeof entry.videoTitle !== 'string' ||
    typeof entry.creatorId !== 'string' ||
    typeof entry.creatorName !== 'string' ||
    !Number.isInteger(entry.startSeconds) ||
    !Number.isInteger(entry.endSeconds) ||
    (entry.startSeconds ?? -1) < 0 ||
    (entry.endSeconds ?? -1) <= (entry.startSeconds ?? -1) ||
    typeof entry.excerpt !== 'string' ||
    !Array.isArray(entry.topicSlugs) ||
    !entry.topicSlugs.every((topic) => typeof topic === 'string') ||
    (entry.correctionState !== 'active' &&
      entry.correctionState !== 'corrected') ||
    typeof entry.confidenceClass !== 'string' ||
    typeof entry.rightsStatus !== 'string' ||
    typeof entry.verificationDate !== 'string' ||
    typeof entry.provenance !== 'string' ||
    typeof entry.timestampUrl !== 'string'
  ) {
    return false;
  }
  try {
    const source = new URL(entry.sourceUrl);
    const timestamp = new URL(entry.timestampUrl);
    if (
      source.protocol !== 'https:' ||
      source.username !== '' ||
      source.password !== '' ||
      source.search !== '' ||
      source.hash !== ''
    ) {
      return false;
    }
    const expected = new URL(source);
    expected.searchParams.set('t', String(entry.startSeconds));
    return timestamp.href === expected.href;
  } catch {
    return false;
  }
}

function score(entry: PublicSearchEntry, query: string): number {
  const queryTokens = tokens(query);
  const title = normalize(entry.videoTitle);
  const topics = normalize(entry.topicSlugs.join(' '));
  const excerpt = normalize(entry.excerpt);
  const allTokens = new Set(tokens(`${title} ${topics} ${excerpt}`));
  if (
    queryTokens.length === 0 ||
    !queryTokens.every((token) => allTokens.has(token))
  ) {
    return 0;
  }
  return (
    (containsPhrase(title, query) ? 10_000 : 0) +
    (containsPhrase(topics, query) ? 10_000 : 0) +
    (containsPhrase(excerpt, query) ? 10_000 : 0) +
    queryTokens.filter((token) => tokens(title).includes(token)).length * 100 +
    queryTokens.filter((token) => tokens(topics).includes(token)).length * 50 +
    queryTokens.filter((token) => tokens(excerpt).includes(token)).length * 10
  );
}

export function searchPublicIndex(
  value: unknown,
  query: string,
  limit = 10,
): readonly PublicSearchEntry[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as Partial<PublicSearchIndex>).entries) ||
    normalize(query).length === 0 ||
    limit <= 0
  ) {
    return [];
  }
  return (value as PublicSearchIndex).entries
    .filter(safeTimestampEntry)
    .map((entry) => ({ entry, score: score(entry, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.videoSlug.localeCompare(right.entry.videoSlug) ||
        left.entry.startSeconds - right.entry.startSeconds ||
        left.entry.momentId.localeCompare(right.entry.momentId),
    )
    .slice(0, Math.floor(limit))
    .map((candidate) => candidate.entry);
}

export const VIDEO_MOMENT_SEARCH_CLIENT = String.raw`(() => {
  'use strict';
  const form = document.querySelector('[data-moment-search]');
  const input = document.querySelector('[data-moment-query]');
  const status = document.querySelector('[data-search-status]');
  const results = document.querySelector('[data-client-results]');
  const error = document.querySelector('[data-search-error]');
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement) ||
      !(status instanceof HTMLElement) || !(results instanceof HTMLElement) ||
      !(error instanceof HTMLElement)) return;

  let index = null;
  const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[\\p{Pd}_]/gu, ' ').replace(/\\s+/gu, ' ').trim();
  const tokens = (value) => normalize(value).match(/[\\p{L}\\p{N}]+/gu) || [];
  const safe = (entry) => {
    try {
      if (!Number.isInteger(entry.startSeconds) || entry.startSeconds < 0) return false;
      const source = new URL(entry.sourceUrl);
      const timestamp = new URL(entry.timestampUrl);
      if (source.protocol !== 'https:' || source.username || source.password ||
          source.search || source.hash) return false;
      const expected = new URL(source.href);
      expected.searchParams.set('t', String(entry.startSeconds));
      return timestamp.href === expected.href;
    } catch {
      return false;
    }
  };
  const find = (query) => {
    const queryTokens = tokens(query);
    if (queryTokens.length === 0 || !index || !Array.isArray(index.entries)) return [];
    return index.entries.filter(safe).map((entry) => {
      const title = normalize(entry.videoTitle);
      const topics = normalize(entry.topicSlugs.join(' '));
      const excerpt = normalize(entry.excerpt);
      const values = new Set(tokens(title + ' ' + topics + ' ' + excerpt));
      if (!queryTokens.every((token) => values.has(token))) return { entry, score: 0 };
      return { entry, score:
        queryTokens.filter((token) => tokens(title).includes(token)).length * 100 +
        queryTokens.filter((token) => tokens(topics).includes(token)).length * 50 +
        queryTokens.filter((token) => tokens(excerpt).includes(token)).length * 10 };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score ||
        a.entry.videoSlug.localeCompare(b.entry.videoSlug) ||
        a.entry.startSeconds - b.entry.startSeconds ||
        a.entry.momentId.localeCompare(b.entry.momentId))
      .slice(0, 10).map((item) => item.entry);
  };
  const addText = (parent, name, value) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = name;
    detail.textContent = value;
    row.append(term, detail);
    parent.append(row);
  };
  const format = (seconds) => Math.floor(seconds / 60) + ':' +
    String(seconds % 60).padStart(2, '0');
  const card = (entry) => {
    const article = document.createElement('article');
    article.className = 'moment-card';
    article.dataset.momentId = entry.momentId;
    const heading = document.createElement('h3');
    const link = document.createElement('a');
    link.href = entry.timestampUrl;
    link.textContent = entry.videoTitle + ' at ' + format(entry.startSeconds);
    heading.append(link);
    const metadata = document.createElement('dl');
    metadata.className = 'moment-meta';
    addText(metadata, 'Source title', entry.videoTitle);
    addText(metadata, 'Creator', entry.creatorName);
    addText(metadata, 'Excerpt', entry.excerpt);
    addText(metadata, 'Start / end', format(entry.startSeconds) + '–' + format(entry.endSeconds));
    addText(metadata, 'Topics', entry.topicSlugs.join(', '));
    addText(metadata, 'Confidence class', entry.confidenceClass);
    addText(metadata, 'Rights status', entry.rightsStatus);
    addText(metadata, 'Verification date', entry.verificationDate);
    addText(metadata, 'Provenance', entry.provenance);
    addText(metadata, 'Correction state', entry.correctionState);
    article.append(heading, metadata);
    return article;
  };

  fetch('search-index.json', { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error('index load failed');
      return response.json();
    })
    .then((value) => { index = value; })
    .catch(() => {
      error.hidden = false;
      status.textContent = 'Interactive search is unavailable; initial reviewed moments remain below.';
    });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!index) {
      error.hidden = false;
      status.textContent = 'Search could not load. The initial reviewed moments remain available below.';
      return;
    }
    const query = input.value.trim();
    if (query.length === 0) {
      results.replaceChildren();
      status.textContent = 'Enter a phrase such as “agent evaluation”.';
      return;
    }
    const found = find(query);
    results.replaceChildren(...found.map(card));
    status.textContent = found.length === 0
      ? 'No moments match this phrase. Try fewer or different words.'
      : 'Showing ' + found.length + (found.length === 1 ? ' moment.' : ' moments.');
  });
})();`;
