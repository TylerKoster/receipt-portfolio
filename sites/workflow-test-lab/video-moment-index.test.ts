import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as api from './video-moment-index.js';
import type { VideoMomentCorpus } from './video-moment-index.js';

const corpus = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/workflow-test-lab/synthetic-video-moment-index-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoMomentCorpus;

function cloneCorpus(): VideoMomentCorpus {
  return structuredClone(corpus);
}

describe('synthetic Video Moment Index pilot', () => {
  it('accepts the committed synthetic fixture before retrieval or rendering', () => {
    expect(api.validateSyntheticCorpus(corpus)).toEqual({
      valid: true,
      diagnostics: [],
    });
  });

  it.each([
    [
      'an absent synthetic-only label',
      (candidate: VideoMomentCorpus) => {
        candidate.label = '';
      },
      ['CORPUS_LABEL_INVALID'],
    ],
    [
      'a duplicate video slug',
      (candidate: VideoMomentCorpus) => {
        candidate.videos[1]!.slug = candidate.videos[0]!.slug;
      },
      [
        'MOMENT_VIDEO_LINK_INVALID:moment-beta-active',
        'MOMENT_VIDEO_LINK_INVALID:moment-beta-removed',
        'VIDEO_SLUG_DUPLICATE:synthetic-alpha',
        'VIDEO_URL_INVALID:video-beta',
      ],
    ],
    [
      'a duplicate moment ID',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[1]!.id = candidate.moments[0]!.id;
      },
      ['MOMENT_ID_DUPLICATE:moment-alpha-mention'],
    ],
    [
      'a non-synthetic video host',
      (candidate: VideoMomentCorpus) => {
        candidate.videos[0]!.syntheticUrl =
          'https://example.com/watch/synthetic-alpha';
      },
      [
        'MOMENT_VIDEO_LINK_INVALID:moment-alpha-discussion',
        'MOMENT_VIDEO_LINK_INVALID:moment-alpha-mention',
        'VIDEO_URL_INVALID:video-alpha',
      ],
    ],
    [
      'a mismatched moment video link',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.videoSlug = 'synthetic-beta';
      },
      ['MOMENT_VIDEO_LINK_INVALID:moment-alpha-mention'],
    ],
    [
      'invalid moment timing',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.endSeconds = candidate.moments[0]!.startSeconds;
      },
      ['MOMENT_TIMING_INVALID:moment-alpha-mention'],
    ],
    [
      'invalid moment confidence',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.confidence = 101;
      },
      ['MOMENT_CONFIDENCE_INVALID:moment-alpha-mention'],
    ],
    [
      'an invalid moment state',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.state =
          'pending' as VideoMomentCorpus['moments'][number]['state'];
      },
      ['MOMENT_STATE_INVALID:moment-alpha-mention'],
    ],
    [
      'an invalid moment classification',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.expectedClassification =
          'summary' as VideoMomentCorpus['moments'][number]['expectedClassification'];
      },
      ['MOMENT_CLASSIFICATION_INVALID:moment-alpha-mention'],
    ],
    [
      'an invalid provenance label',
      (candidate: VideoMomentCorpus) => {
        candidate.moments[0]!.provenanceLabel = 'external';
      },
      ['MOMENT_PROVENANCE_INVALID:moment-alpha-mention'],
    ],
  ])(
    'rejects %s with stable diagnostics',
    (_description, mutate, diagnostics) => {
      const candidate = cloneCorpus();
      mutate(candidate);
      expect(api.validateSyntheticCorpus(candidate)).toEqual({
        valid: false,
        diagnostics,
      });
    },
  );

  it('fails closed before retrieval and rendering when the corpus label is invalid', () => {
    const candidate = cloneCorpus();
    candidate.label = 'SYNTHETIC VIDEO MOMENT INDEX PILOT';
    expect(() => api.retrieve(candidate, 'testing', 'exact')).toThrow(
      'Invalid synthetic corpus: CORPUS_LABEL_INVALID',
    );
    expect(() =>
      api.renderCanonicalVideo(candidate, 'synthetic-alpha'),
    ).toThrow('Invalid synthetic corpus: CORPUS_LABEL_INVALID');
    expect(() =>
      api.renderTransientQuery(candidate, 'testing', 'exact'),
    ).toThrow('Invalid synthetic corpus: CORPUS_LABEL_INVALID');
  });

  it('retrieves active moments by exact topic with deterministic score and ID tie-breaking', () => {
    const results = api.retrieve(corpus, 'testing', 'exact');
    expect(results.map((result) => [result.moment.id, result.score])).toEqual([
      ['moment-alpha-discussion', 100],
      ['moment-alpha-mention', 100],
    ]);
  });

  it('uses an explicit deterministic token expansion for semantic retrieval', () => {
    const results = api.retrieve(corpus, 'quality assurance', 'semantic');
    expect(results.map((result) => result.moment.id)).toEqual([
      'moment-alpha-discussion',
      'moment-alpha-mention',
    ]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('classifies a short single reference as mention and an extended explanation as discussion', () => {
    for (const moment of corpus.moments) {
      expect(api.classifyMoment(moment)).toBe(moment.expectedClassification);
    }
  });

  it('constructs timestamp deep links from canonical synthetic video URLs', () => {
    for (const moment of corpus.moments) {
      expect(api.buildTimestampDeepLink(moment)).toBe(
        `${moment.syntheticUrl}?t=${moment.startSeconds}`,
      );
    }
  });

  it('validates local replay observations inclusively at plus or minus two seconds from the deep-link start', () => {
    const moment = corpus.moments.find(
      (candidate) => candidate.id === 'moment-alpha-mention',
    )!;
    expect(api.validateLocalReplay(moment, 10)).toEqual({
      valid: true,
      deltaSeconds: 2,
    });
    expect(api.validateLocalReplay(moment, 14)).toEqual({
      valid: true,
      deltaSeconds: 2,
    });
    expect(api.validateLocalReplay(moment, 9)).toEqual({
      valid: false,
      deltaSeconds: 3,
    });
  });

  it('renders synthetic provenance, confidence, and corrected state for a canonical video', () => {
    const rendered = api.renderCanonicalVideo(corpus, 'synthetic-alpha');
    expect(rendered.canonicalPath).toBe('/video/synthetic-alpha/');
    expect(rendered.html).toContain('SYNTHETIC');
    expect(rendered.html).toContain('first-party synthetic fixture');
    expect(rendered.html).toContain('Confidence: 96');
    expect(rendered.html).toContain('State: corrected');
  });

  it('renders transient queries with a noindex,nofollow robots directive', () => {
    const rendered = api.renderTransientQuery(corpus, 'testing', 'exact');
    expect(rendered.robots).toBe('noindex,nofollow');
    expect(rendered.html).toContain(
      '<meta name="robots" content="noindex,nofollow">',
    );
  });

  it('renders exactly one distinct stable canonical page for every fixture video', () => {
    const rendered = corpus.videos.map((video) =>
      api.renderCanonicalVideo(corpus, video.slug),
    );
    expect(new Set(rendered.map((page) => page.canonicalPath)).size).toBe(
      corpus.videos.length,
    );
    expect(rendered.map((page) => page.canonicalPath)).toEqual(
      corpus.videos.map((video) => api.canonicalVideoPath(video.slug)),
    );
  });

  it('excludes removed moments from retrieval while retaining corrected moments in video rendering', () => {
    expect(api.retrieve(corpus, 'obsolete', 'exact')).toEqual([]);
    expect(api.renderCanonicalVideo(corpus, 'synthetic-alpha').html).toContain(
      'moment-alpha-discussion',
    );
    expect(
      api.renderCanonicalVideo(corpus, 'synthetic-beta').html,
    ).not.toContain('moment-beta-removed');
  });
});
