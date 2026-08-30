import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  buildTimestampUrl,
  evaluateBenchmark,
  searchMoments,
  type BenchmarkCase,
  type SearchIndex,
  type VideoCorpus,
} from './index.js';

const captionHash =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const validCorpus: VideoCorpus = {
  corpusId: 'search-local-test-v1',
  label: 'LOCAL TEST FIXTURE ONLY — NO CREATOR AUTHORIZATION OR DEMAND',
  videos: [
    {
      id: 'video-agent-evals',
      slug: 'agent-evals',
      title: 'Agent Evaluation Mechanics',
      creatorId: 'local-creator',
      creatorName: 'Local Creator',
      sourceUrl: 'https://video.example/watch/agent-evals',
      durationSeconds: 600,
    },
    {
      id: 'video-datasets',
      slug: 'eval-datasets',
      title: 'Evaluation Dataset Design',
      creatorId: 'local-creator',
      creatorName: 'Local Creator',
      sourceUrl: 'https://video.example/watch/eval-datasets',
      durationSeconds: 600,
    },
    {
      id: 'video-observability',
      slug: 'observability',
      title: 'Agent Observability',
      creatorId: 'local-creator',
      creatorName: 'Local Creator',
      sourceUrl: 'https://video.example/watch/observability',
      durationSeconds: 600,
    },
  ],
  rights: [
    {
      id: 'rights-local',
      creatorId: 'local-creator',
      basis: 'explicit-license',
      coveredVideoIds: [
        'video-agent-evals',
        'video-datasets',
        'video-observability',
      ],
      coveredSourceUrls: [
        'https://video.example/watch/agent-evals',
        'https://video.example/watch/eval-datasets',
        'https://video.example/watch/observability',
      ],
      coveredCaptionHashes: [captionHash],
      allowedUses: {
        commercialUse: true,
        excerpts: true,
        timestampLinks: true,
      },
      maxExcerptCharacters: 280,
      licenseNote: 'LOCAL TEST LICENSE ONLY.',
      permissionVerifiedAt: '2026-08-30T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revocationContact: 'local-test@example.invalid',
    },
  ],
  cues: [
    {
      id: 'cue-agent-evals',
      videoId: 'video-agent-evals',
      startSeconds: 0,
      endSeconds: 600,
      text: 'Agent evaluation mechanics and benchmark design.',
      captionSha256: captionHash,
    },
    {
      id: 'cue-datasets',
      videoId: 'video-datasets',
      startSeconds: 0,
      endSeconds: 600,
      text: 'Evaluation datasets for AI agents.',
      captionSha256: captionHash,
    },
    {
      id: 'cue-observability',
      videoId: 'video-observability',
      startSeconds: 0,
      endSeconds: 600,
      text: 'Agent traces, tool calls, and observability.',
      captionSha256: captionHash,
    },
  ],
  moments: [
    {
      id: 'moment-agent-evals',
      videoId: 'video-agent-evals',
      startSeconds: 132,
      endSeconds: 188,
      excerpt: 'Agent evaluation explains how to score tool-using agents.',
      topicSlugs: ['agent-evaluation', 'benchmarking'],
      state: 'active',
      rightsGrantId: 'rights-local',
    },
    {
      id: 'moment-eval-datasets',
      videoId: 'video-datasets',
      startSeconds: 75,
      endSeconds: 130,
      excerpt: 'Evaluation datasets provide repeatable test cases for agents.',
      topicSlugs: ['agent-evaluation', 'evaluation-datasets'],
      state: 'corrected',
      rightsGrantId: 'rights-local',
      correctsMomentId: 'moment-dataset-prior',
    },
    {
      id: 'moment-dataset-prior',
      videoId: 'video-datasets',
      startSeconds: 50,
      endSeconds: 70,
      excerpt: 'Prior evaluation dataset note.',
      topicSlugs: ['evaluation-datasets'],
      state: 'removed',
      rightsGrantId: 'rights-local',
    },
    {
      id: 'moment-agent-observability',
      videoId: 'video-observability',
      startSeconds: 210,
      endSeconds: 265,
      excerpt: 'Agent traces make tool-call failures observable.',
      topicSlugs: ['agent-observability'],
      state: 'active',
      rightsGrantId: 'rights-local',
    },
  ],
};

function cloneCorpus(): VideoCorpus {
  return structuredClone(validCorpus);
}

const benchmarkCases: readonly BenchmarkCase[] = [
  { query: 'agent evaluation', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'evaluation datasets', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'tool-using agents', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'repeatable test cases', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'tool-call failures', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'agent traces', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'agent benchmarking', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'repeatable agents', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'score agents', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'test cases', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'observable', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'observability', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'agent evaluation mechanics', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'evaluation dataset design', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'traces tool call', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'benchmarking', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'evaluation-datasets', expectedTopThreeMomentIds: ['moment-eval-datasets'] },
  { query: 'agent-observability', expectedTopThreeMomentIds: ['moment-agent-observability'] },
  { query: 'agents evaluation', expectedTopThreeMomentIds: ['moment-agent-evals'] },
  { query: 'failures observable', expectedTopThreeMomentIds: ['moment-agent-observability'] },
];

describe('deterministic rights-bound moment search', () => {
  it('returns a ranked list and routes every result to its stored second', () => {
    const index = buildSearchIndex(validCorpus);
    const results = searchMoments(index, 'agent evaluation', 10);
    expect(results.map((result) => result.momentId)).toEqual([
      'moment-agent-evals',
      'moment-eval-datasets',
    ]);
    expect(results[0]!.timestampUrl).toBe(
      'https://video.example/watch/agent-evals?t=132',
    );
  });

  it('never returns removed, expired, or quarantined moments', () => {
    const statefulCorpus = cloneCorpus() as VideoCorpus & {
      moments: VideoCorpus['moments'][number][];
    };
    statefulCorpus.moments.push({
      ...statefulCorpus.moments[0]!,
      id: 'moment-agent-quarantined',
      startSeconds: 300,
      endSeconds: 350,
      state: 'quarantined',
    });
    const results = searchMoments(buildSearchIndex(statefulCorpus), 'agent', 20);
    expect(
      results.every(
        (result) => result.state === 'active' || result.state === 'corrected',
      ),
    ).toBe(true);
  });

  it('normalizes Unicode and case while ranking an exact phrase above field token matches', () => {
    const results = searchMoments(
      buildSearchIndex(validCorpus),
      '  AGENT\u00a0EVALUATION  ',
      10,
    );
    expect(results.map((result) => result.momentId)).toEqual([
      'moment-agent-evals',
      'moment-eval-datasets',
    ]);
  });

  it('does not award an exact phrase bonus to a Unicode token substring', () => {
    const base = cloneCorpus();
    const corpus: VideoCorpus = {
      ...base,
      videos: base.videos.map((video) => {
        if (video.id === 'video-agent-evals') {
          return { ...video, title: 'Research mechanics' };
        }
        if (video.id === 'video-datasets') {
          return { ...video, title: 'Agent planning' };
        }
        return video;
      }),
      moments: base.moments.map((moment) => {
        if (moment.id === 'moment-agent-evals') {
          return {
            ...moment,
            topicSlugs: ['benchmarking'],
            excerpt: 'An agent evaluation validates an experiment.',
          };
        }
        if (moment.id === 'moment-eval-datasets') {
          return {
            ...moment,
            topicSlugs: ['agent-tracking'],
            excerpt: 'A reagent evaluation workflow.',
          };
        }
        return moment;
      }),
    };

    expect(
      searchMoments(buildSearchIndex(corpus), 'agent evaluation').map(
        (result) => result.momentId,
      ),
    ).toEqual(['moment-agent-evals', 'moment-eval-datasets']);
  });

  it('returns no results for empty or whitespace-only queries', () => {
    const index = buildSearchIndex(validCorpus);
    expect(searchMoments(index, '')).toEqual([]);
    expect(searchMoments(index, '   ')).toEqual([]);
  });

  it('breaks equal scores by video slug, stored start second, then moment ID', () => {
    const corpus = cloneCorpus() as VideoCorpus & {
      moments: VideoCorpus['moments'][number][];
    };
    corpus.moments.push(
      {
        ...corpus.moments[0]!,
        id: 'moment-agent-earlier',
        startSeconds: 100,
        endSeconds: 120,
      },
      {
        ...corpus.moments[0]!,
        id: 'moment-agent-same-time-a',
        startSeconds: 132,
        endSeconds: 160,
      },
    );
    expect(
      searchMoments(buildSearchIndex(corpus), 'benchmarking').map(
        (result) => result.momentId,
      ),
    ).toEqual([
      'moment-agent-earlier',
      'moment-agent-evals',
      'moment-agent-same-time-a',
    ]);
  });

  it('builds a source anchor from the stored URL and integer start second', () => {
    expect(buildTimestampUrl(validCorpus.videos[1]!, 75)).toBe(
      'https://video.example/watch/eval-datasets?t=75',
    );
  });

  it('uses a temporal media fragment only when the source explicitly selects it', () => {
    const directMedia = {
      ...validCorpus.videos[0]!,
      sourceUrl:
        'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm',
      timestampStrategy: 'media-fragment' as const,
    };

    expect(buildTimestampUrl(directMedia, 132)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    );
    expect(buildTimestampUrl(validCorpus.videos[0]!, 132)).toBe(
      'https://video.example/watch/agent-evals?t=132',
    );
  });

  it('preserves query parameters and fragments while setting the timestamp parameter', () => {
    expect(
      buildTimestampUrl(
        {
          ...validCorpus.videos[1]!,
          sourceUrl: 'https://video.example/watch/eval-datasets?lang=en#clip',
        },
        75,
      ),
    ).toBe('https://video.example/watch/eval-datasets?lang=en&t=75#clip');
    expect(
      buildTimestampUrl(
        {
          ...validCorpus.videos[1]!,
          sourceUrl:
            'https://video.example/watch/eval-datasets?lang=en&t=1#clip',
        },
        75,
      ),
    ).toBe('https://video.example/watch/eval-datasets?lang=en&t=75#clip');
  });

  it('reports a fixed synthetic researcher benchmark with top-three recall and zero timestamp landing error', () => {
    const result = evaluateBenchmark(buildSearchIndex(validCorpus), benchmarkCases);
    expect(benchmarkCases).toHaveLength(20);
    expect(result.topThreeRecall).toBeGreaterThanOrEqual(0.8);
    expect(result.maximumTimestampLandingErrorSeconds).toBe(0);
    expect(result.cases.every((entry) => entry.timestampLandingErrorSeconds === 0)).toBe(true);
  });

  it('fails the aggregate timestamp gate when a matched result anchor is unparseable', () => {
    const malformedIndex = {
      entries: [
        {
          moment: {
            ...validCorpus.moments[0]!,
            startSeconds: 9_007_199_254_740_992,
            endSeconds: 9_007_199_254_740_994,
          },
          video: validCorpus.videos[0]!,
          title: 'agent evaluation',
          topics: '',
          excerpt: '',
          tokens: new Set(['agent', 'evaluation']),
        },
      ],
    } as unknown as SearchIndex;

    const result = evaluateBenchmark(malformedIndex, [benchmarkCases[0]!]);

    expect(result.topThreeRecall).toBe(1);
    expect(result.cases[0]!.timestampLandingErrorSeconds).toBe(Infinity);
    expect(result.maximumTimestampLandingErrorSeconds).toBe(Infinity);
  });
});
