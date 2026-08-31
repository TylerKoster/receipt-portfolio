import { isReviewedSourceEvidenceSubstantive } from '../../packages/video-moment-core/src/index.js';

export interface PublicReviewEvidence {
  readonly classification: 'reviewed-public-source';
  readonly evidenceId: string;
  readonly licenseIdentifier: string;
  readonly licenseUrl: string;
  readonly canonicalRightsPageUrl: string;
  readonly immutableRightsRevisionUrl: string;
  readonly reviewer: string;
  readonly reviewedOn: string;
  readonly productBoundary: {
    readonly included: readonly string[];
    readonly excluded: readonly string[];
  };
}

export interface PublicSearchEntry {
  readonly corpusId: string;
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
  readonly rightsGrantId: string;
  readonly cueIds: readonly string[];
  readonly confidenceClass: string;
  readonly rightsStatus: string;
  readonly verificationDate: string;
  readonly provenance: string;
  readonly timestampUrl: string;
  readonly timestampStrategy?: 'query-parameter' | 'media-fragment';
  readonly reviewEvidence?: PublicReviewEvidence;
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeReviewEvidence(value: unknown): value is PublicReviewEvidence {
  if (!isReviewedSourceEvidenceSubstantive(value)) {
    return false;
  }
  const review = value as PublicReviewEvidence;
  try {
    return [
      review.licenseUrl,
      review.canonicalRightsPageUrl,
      review.immutableRightsRevisionUrl,
    ].every((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    });
  } catch {
    return false;
  }
}

const REVIEWED_CONFIDENCE =
  'Reviewed public source; original editorial annotation, not transcript text';
const CONTROLLED_CONFIDENCE = 'Rights-validated controlled fixture match';

function expectedRightsStatus(review: PublicReviewEvidence): string {
  return `${review.licenseIdentifier}; ${review.productBoundary.included.join(' plus ')} only; no inferred permission or endorsement.`;
}

function expectedProvenance(
  entry: Pick<
    PublicSearchEntry,
    'corpusId' | 'rightsGrantId' | 'cueIds' | 'reviewEvidence'
  >,
): string {
  const prefix = `Corpus ${entry.corpusId}; `;
  const lineage = `rights grant ${entry.rightsGrantId}; cue ${entry.cueIds.join(', ')}`;
  const review = entry.reviewEvidence;
  return review === undefined
    ? `${prefix}${lineage}`
    : `${prefix}evidence ${review.evidenceId}; immutable rights revision ${review.immutableRightsRevisionUrl}; reviewed by ${review.reviewer} on ${review.reviewedOn}; ${lineage}`;
}

function claimsMatchEvidence(entry: PublicSearchEntry): boolean {
  const review = entry.reviewEvidence;
  if (review === undefined) {
    return (
      entry.confidenceClass === CONTROLLED_CONFIDENCE &&
      entry.provenance === expectedProvenance(entry) &&
      !/\breviewed\b/iu.test(
        `${entry.confidenceClass} ${entry.rightsStatus} ${entry.verificationDate} ${entry.provenance}`,
      )
    );
  }
  return (
    entry.confidenceClass === REVIEWED_CONFIDENCE &&
    entry.rightsStatus === expectedRightsStatus(review) &&
    entry.verificationDate === review.reviewedOn &&
    entry.provenance === expectedProvenance(entry)
  );
}

function safeTimestampEntry(
  value: unknown,
  expectedCorpusId: string,
): value is PublicSearchEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<PublicSearchEntry>;
  if (
    entry.corpusId !== expectedCorpusId ||
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
    typeof entry.rightsGrantId !== 'string' ||
    !Array.isArray(entry.cueIds) ||
    !entry.cueIds.every((cueId) => typeof cueId === 'string') ||
    typeof entry.confidenceClass !== 'string' ||
    typeof entry.rightsStatus !== 'string' ||
    typeof entry.verificationDate !== 'string' ||
    typeof entry.provenance !== 'string' ||
    typeof entry.timestampUrl !== 'string' ||
    (entry.timestampStrategy !== undefined &&
      entry.timestampStrategy !== 'query-parameter' &&
      entry.timestampStrategy !== 'media-fragment') ||
    (entry.reviewEvidence !== undefined &&
      !safeReviewEvidence(entry.reviewEvidence))
  ) {
    return false;
  }
  if (!claimsMatchEvidence(entry as PublicSearchEntry)) return false;
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
    if (entry.timestampStrategy === 'media-fragment') {
      expected.hash = 't=' + String(entry.startSeconds);
    } else {
      expected.searchParams.set('t', String(entry.startSeconds));
    }
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
  const candidateIndex = value as Partial<PublicSearchIndex>;
  if (
    typeof value !== 'object' ||
    value === null ||
    candidateIndex.schemaVersion !== 1 ||
    typeof candidateIndex.corpusId !== 'string' ||
    !Array.isArray(candidateIndex.entries) ||
    normalize(query).length === 0 ||
    limit <= 0
  ) {
    return [];
  }
  return candidateIndex.entries
    .filter((entry) => safeTimestampEntry(entry, candidateIndex.corpusId!))
    .map((entry) => ({ entry, score: score(entry, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareText(left.entry.videoSlug, right.entry.videoSlug) ||
        left.entry.startSeconds - right.entry.startSeconds ||
        compareText(left.entry.momentId, right.entry.momentId),
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
    .replace(/[\p{Pd}_]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const tokens = (value) => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
  const containsPhrase = (value, phrase) => {
    const phraseTokens = tokens(phrase);
    const valueTokens = tokens(value);
    return phraseTokens.length > 0 && phraseTokens.length <= valueTokens.length &&
      valueTokens.some((_, start) =>
        phraseTokens.every((token, offset) => valueTokens[start + offset] === token));
  };
  const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const reviewedConfidence = 'Reviewed public source; original editorial annotation, not transcript text';
  const controlledConfidence = 'Rights-validated controlled fixture match';
  const nonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
  const validReviewDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const reviewSafe = (review) => {
    try {
      if (!review || typeof review !== 'object' ||
          review.classification !== 'reviewed-public-source' ||
          !nonBlank(review.evidenceId) ||
          !nonBlank(review.licenseIdentifier) ||
          typeof review.licenseUrl !== 'string' ||
          typeof review.canonicalRightsPageUrl !== 'string' ||
          typeof review.immutableRightsRevisionUrl !== 'string' ||
          !nonBlank(review.reviewer) ||
          !validReviewDate(review.reviewedOn) ||
          !review.productBoundary || typeof review.productBoundary !== 'object' ||
          !Array.isArray(review.productBoundary.included) ||
          !Array.isArray(review.productBoundary.excluded) ||
          review.productBoundary.included.length === 0 ||
          review.productBoundary.excluded.length === 0 ||
          !review.productBoundary.included.every(nonBlank) ||
          !review.productBoundary.excluded.every(nonBlank)) return false;
      return [review.licenseUrl, review.canonicalRightsPageUrl,
        review.immutableRightsRevisionUrl].every((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      });
    } catch {
      return false;
    }
  };
  const expectedRights = (review) => review.licenseIdentifier + '; ' +
    review.productBoundary.included.join(' plus ') +
    ' only; no inferred permission or endorsement.';
  const expectedProvenance = (entry) => {
    const prefix = 'Corpus ' + entry.corpusId + '; ';
    const lineage = 'rights grant ' + entry.rightsGrantId + '; cue ' +
      entry.cueIds.join(', ');
    const review = entry.reviewEvidence;
    return !review ? prefix + lineage : prefix + 'evidence ' + review.evidenceId +
      '; immutable rights revision ' + review.immutableRightsRevisionUrl +
      '; reviewed by ' + review.reviewer + ' on ' + review.reviewedOn + '; ' + lineage;
  };
  const claimsMatch = (entry) => {
    const review = entry.reviewEvidence;
    if (!review) return entry.confidenceClass === controlledConfidence &&
      entry.provenance === expectedProvenance(entry) &&
      !/\breviewed\b/iu.test(entry.confidenceClass + ' ' + entry.rightsStatus + ' ' +
        entry.verificationDate + ' ' + entry.provenance);
    return entry.confidenceClass === reviewedConfidence &&
      entry.rightsStatus === expectedRights(review) &&
      entry.verificationDate === review.reviewedOn &&
      entry.provenance === expectedProvenance(entry);
  };
  const safe = (entry, expectedCorpusId) => {
    try {
      if (!entry || typeof entry !== 'object' ||
          entry.corpusId !== expectedCorpusId ||
          typeof entry.momentId !== 'string' ||
          typeof entry.videoId !== 'string' ||
          typeof entry.videoSlug !== 'string' ||
          typeof entry.sourceUrl !== 'string' ||
          typeof entry.videoTitle !== 'string' ||
          typeof entry.creatorId !== 'string' ||
          typeof entry.creatorName !== 'string' ||
          !Number.isInteger(entry.startSeconds) || entry.startSeconds < 0 ||
          !Number.isInteger(entry.endSeconds) || entry.endSeconds <= entry.startSeconds ||
          typeof entry.excerpt !== 'string' ||
          !Array.isArray(entry.topicSlugs) ||
          !entry.topicSlugs.every((topic) => typeof topic === 'string') ||
          (entry.correctionState !== 'active' && entry.correctionState !== 'corrected') ||
          typeof entry.rightsGrantId !== 'string' ||
          !Array.isArray(entry.cueIds) ||
          !entry.cueIds.every((cueId) => typeof cueId === 'string') ||
          typeof entry.confidenceClass !== 'string' ||
          typeof entry.rightsStatus !== 'string' ||
          typeof entry.verificationDate !== 'string' ||
          typeof entry.provenance !== 'string' ||
          typeof entry.timestampUrl !== 'string' ||
          (entry.timestampStrategy !== undefined &&
           entry.timestampStrategy !== 'query-parameter' &&
           entry.timestampStrategy !== 'media-fragment') ||
          (entry.reviewEvidence !== undefined &&
           !reviewSafe(entry.reviewEvidence))) return false;
      if (!claimsMatch(entry)) return false;
      const source = new URL(entry.sourceUrl);
      const timestamp = new URL(entry.timestampUrl);
      if (source.protocol !== 'https:' || source.username || source.password ||
          source.search || source.hash) return false;
      const expected = new URL(source.href);
      if (entry.timestampStrategy === 'media-fragment') {
        expected.hash = 't=' + String(entry.startSeconds);
      } else {
        expected.searchParams.set('t', String(entry.startSeconds));
      }
      return timestamp.href === expected.href;
    } catch {
      return false;
    }
  };
  const validIndex = (value) => {
    try {
      return !!value && typeof value === 'object' &&
        value.schemaVersion === 1 && typeof value.corpusId === 'string' &&
        Array.isArray(value.entries) &&
        value.entries.every((entry) => safe(entry, value.corpusId));
    } catch {
      return false;
    }
  };
  const find = (query) => {
    const queryTokens = tokens(query);
    if (queryTokens.length === 0 || !index) return [];
    return index.entries.filter((entry) => safe(entry, index.corpusId)).map((entry) => {
      const title = normalize(entry.videoTitle);
      const topics = normalize(entry.topicSlugs.join(' '));
      const excerpt = normalize(entry.excerpt);
      const values = new Set(tokens(title + ' ' + topics + ' ' + excerpt));
      if (!queryTokens.every((token) => values.has(token))) return { entry, score: 0 };
      return { entry, score:
        (containsPhrase(title, query) ? 10000 : 0) +
        (containsPhrase(topics, query) ? 10000 : 0) +
        (containsPhrase(excerpt, query) ? 10000 : 0) +
        queryTokens.filter((token) => tokens(title).includes(token)).length * 100 +
        queryTokens.filter((token) => tokens(topics).includes(token)).length * 50 +
        queryTokens.filter((token) => tokens(excerpt).includes(token)).length * 10 };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score ||
        compareText(a.entry.videoSlug, b.entry.videoSlug) ||
        a.entry.startSeconds - b.entry.startSeconds ||
        compareText(a.entry.momentId, b.entry.momentId))
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
    if (entry.reviewEvidence) {
      addText(metadata, 'Evidence ID', entry.reviewEvidence.evidenceId);
      addText(metadata, 'License', entry.reviewEvidence.licenseIdentifier);
      addText(metadata, 'License URL', entry.reviewEvidence.licenseUrl);
      addText(metadata, 'Canonical rights page', entry.reviewEvidence.canonicalRightsPageUrl);
      addText(metadata, 'Immutable rights revision', entry.reviewEvidence.immutableRightsRevisionUrl);
      addText(metadata, 'Review record', entry.reviewEvidence.reviewer + ' · ' + entry.reviewEvidence.reviewedOn);
      addText(metadata, 'Product boundary', 'Included: ' +
        entry.reviewEvidence.productBoundary.included.join(', ') + '; excluded: ' +
        entry.reviewEvidence.productBoundary.excluded.join(', '));
    }
    addText(metadata, 'Correction state', entry.correctionState);
    const related = document.createElement('a');
    related.href = 'moments/' + encodeURIComponent(entry.momentId) + '/';
    related.textContent = 'Open the evidence-bound moment page';
    article.append(heading, metadata, related);
    return article;
  };
  const showLoadError = () => {
    error.hidden = false;
    status.textContent = 'Interactive search is unavailable; initial controlled moments remain below.';
  };
  const showSearchError = () => {
    error.hidden = false;
    status.textContent = 'Search could not load. The initial controlled moments remain available below.';
  };

  fetch('search-index.json', { credentials: 'same-origin' })
    .then((response) => {
      if (!response.ok) throw new Error('index load failed');
      return response.json();
    })
    .then((value) => {
      if (!validIndex(value)) throw new Error('index validation failed');
      index = value;
      error.hidden = true;
      status.textContent = 'Search is ready. Enter a phrase such as “robots control”.';
    })
    .catch(() => {
      index = null;
      showLoadError();
    });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!index) {
        showSearchError();
        return;
      }
      const query = input.value.trim();
      if (query.length === 0) {
        results.replaceChildren();
        status.textContent = 'Enter a phrase such as “robots control”.';
        return;
      }
      const found = find(query);
      results.replaceChildren(...found.map(card));
      error.hidden = true;
      status.textContent = found.length === 0
        ? 'No moments match this phrase. Try fewer or different words.'
        : 'Showing ' + found.length + (found.length === 1 ? ' moment.' : ' moments.');
    } catch {
      showSearchError();
    }
  });
})();`;
