import { describe, expect, it } from 'vitest';

const harness = await import('./video-moment-index.js').catch(() => null);

const corpus = {
  label: 'SYNTHETIC VIDEO MOMENT INDEX PILOT — NOT LIVE DATA',
  videos: [
    {
      id: 'video-alpha',
      slug: 'synthetic-alpha',
      title: 'Synthetic Alpha',
      syntheticUrl: 'https://synthetic.invalid/watch/synthetic-alpha',
    },
    {
      id: 'video-beta',
      slug: 'synthetic-beta',
      title: 'Synthetic Beta',
      syntheticUrl: 'https://synthetic.invalid/watch/synthetic-beta',
    },
  ],
  moments: [
    {
      id: 'moment-alpha-mention',
      videoId: 'video-alpha',
      videoSlug: 'synthetic-alpha',
      syntheticUrl: 'https://synthetic.invalid/watch/synthetic-alpha',
      startSeconds: 12,
      endSeconds: 18,
      replayObservedSeconds: 13,
      text: 'The testing harness is mentioned once.',
      topic: 'testing',
      expectedClassification: 'mention',
      provenanceLabel: 'first-party synthetic fixture',
      confidence: 91,
      state: 'active',
    },
    {
      id: 'moment-alpha-discussion',
      videoId: 'video-alpha',
      videoSlug: 'synthetic-alpha',
      syntheticUrl: 'https://synthetic.invalid/watch/synthetic-alpha',
      startSeconds: 30,
      endSeconds: 55,
      replayObservedSeconds: 32,
      text: 'This is a detailed discussion of tests, validation, and deterministic checks.',
      topic: 'testing',
      expectedClassification: 'discussion',
      provenanceLabel: 'first-party synthetic fixture',
      confidence: 96,
      state: 'corrected',
    },
    {
      id: 'moment-beta-removed',
      videoId: 'video-beta',
      videoSlug: 'synthetic-beta',
      syntheticUrl: 'https://synthetic.invalid/watch/synthetic-beta',
      startSeconds: 9,
      endSeconds: 11,
      replayObservedSeconds: 9,
      text: 'An obsolete synthetic mention.',
      topic: 'obsolete',
      expectedClassification: 'mention',
      provenanceLabel: 'first-party synthetic fixture',
      confidence: 51,
      state: 'removed',
    },
  ],
} as const;

function api() {
  expect(
    harness,
    'video moment index harness module must exist',
  ).not.toBeNull();
  return harness!;
}

describe('synthetic Video Moment Index pilot', () => {
  it('retrieves active moments by exact topic with deterministic score and ID tie-breaking', () => {
    const results = api().retrieve(corpus, 'testing', 'exact');
    expect(results.map((result) => [result.moment.id, result.score])).toEqual([
      ['moment-alpha-discussion', 100],
      ['moment-alpha-mention', 100],
    ]);
  });

  it('uses an explicit deterministic token expansion for semantic retrieval', () => {
    const results = api().retrieve(corpus, 'quality assurance', 'semantic');
    expect(results.map((result) => result.moment.id)).toEqual([
      'moment-alpha-discussion',
      'moment-alpha-mention',
    ]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('classifies a short single reference as mention and an extended explanation as discussion', () => {
    expect(api().classifyMoment(corpus.moments[0])).toBe('mention');
    expect(api().classifyMoment(corpus.moments[1])).toBe('discussion');
  });

  it('constructs timestamp deep links from canonical synthetic video URLs', () => {
    expect(api().buildTimestampDeepLink(corpus.moments[0])).toBe(
      'https://synthetic.invalid/watch/synthetic-alpha?t=12',
    );
  });

  it('validates local replay observations within plus or minus two seconds only', () => {
    expect(api().validateLocalReplay(corpus.moments[0], 14)).toEqual({
      valid: true,
      deltaSeconds: 1,
    });
    expect(api().validateLocalReplay(corpus.moments[0], 15)).toEqual({
      valid: false,
      deltaSeconds: 2,
    });
  });

  it('renders synthetic provenance, confidence, and corrected state for a canonical video', () => {
    const rendered = api().renderCanonicalVideo(corpus, 'synthetic-alpha');
    expect(rendered.canonicalPath).toBe('/video/synthetic-alpha/');
    expect(rendered.html).toContain('SYNTHETIC');
    expect(rendered.html).toContain('first-party synthetic fixture');
    expect(rendered.html).toContain('Confidence: 96');
    expect(rendered.html).toContain('State: corrected');
  });

  it('renders transient queries with a noindex,nofollow robots directive', () => {
    const rendered = api().renderTransientQuery(corpus, 'testing', 'exact');
    expect(rendered.robots).toBe('noindex,nofollow');
    expect(rendered.html).toContain(
      '<meta name="robots" content="noindex,nofollow">',
    );
  });

  it('derives exactly one stable canonical path for each video slug', () => {
    expect(api().canonicalVideoPath('synthetic-alpha')).toBe(
      '/video/synthetic-alpha/',
    );
    expect(api().canonicalVideoPath('synthetic-beta')).toBe(
      '/video/synthetic-beta/',
    );
  });

  it('excludes removed moments from retrieval while retaining corrected moments in video rendering', () => {
    expect(api().retrieve(corpus, 'obsolete', 'exact')).toEqual([]);
    expect(
      api().renderCanonicalVideo(corpus, 'synthetic-alpha').html,
    ).toContain('moment-alpha-discussion');
  });
});
