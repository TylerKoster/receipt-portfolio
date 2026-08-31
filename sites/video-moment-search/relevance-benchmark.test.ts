import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  evaluateBenchmark,
  searchMoments,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import {
  canonicalVideoCorpusSemanticSha256,
  validateExperimentLedger,
  validateResearcherRelevanceBenchmarkCorpus,
} from './measurement.js';

type BenchmarkCase = {
  readonly query: string;
  readonly queryBasis:
    | 'title'
    | 'title-and-topic'
    | 'title-and-original-editorial-annotation'
    | 'synthetic-unrelated-negative-control';
  readonly expectedMomentId: string | null;
  readonly expectedStartSeconds: number | null;
  readonly expectedTimestampSuffix: string | null;
};

type ResearcherRelevanceBenchmark = {
  readonly schemaVersion: number;
  readonly siteId: string;
  readonly evidenceClassification: string;
  readonly limitations: {
    readonly benchmarkStrings: string;
    readonly transcriptDerivedCases: string;
    readonly prohibitedClaims: readonly string[];
    readonly evaluatedCorpusSemanticSha256: string;
  };
  readonly corpusId: string;
  readonly target: {
    readonly minimumTopThreePercent: number;
    readonly maximumTimestampLandingErrorSeconds: number;
    readonly negativeControlFalsePositiveCount: number;
  };
  readonly cases: readonly BenchmarkCase[];
  readonly expectedEvaluation: {
    readonly positiveTopThreeHits: {
      readonly numerator: number;
      readonly denominator: number;
    };
    readonly negativeZeroResults: {
      readonly numerator: number;
      readonly denominator: number;
    };
    readonly aggregateZeroResultRate: {
      readonly numerator: number;
      readonly denominator: number;
    };
    readonly maximumTimestampLandingErrorSeconds: number;
  };
};

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;

const ledger = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/video-moment-search/experiment-ledger.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function loadBenchmark(): ResearcherRelevanceBenchmark {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../docs/video-moment-search/researcher-relevance-benchmark.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as ResearcherRelevanceBenchmark;
}

describe('controlled researcher-relevance benchmark', () => {
  it('binds rank 3 to the controlled benchmark evidence path', () => {
    expect(validateExperimentLedger(ledger).diagnostics).toEqual([]);
    expect(ledger.experiments[2].evidencePaths).toContainEqual({
      role: 'heuristic-relevance-benchmark',
      path: 'docs/video-moment-search/researcher-relevance-benchmark.json',
    });
  });

  it('keeps the immutable artifact contract limited to controlled synthetic retrieval regression', () => {
    const benchmark = loadBenchmark();

    expect(Object.keys(benchmark).sort()).toEqual([
      'cases',
      'corpusId',
      'evidenceClassification',
      'expectedEvaluation',
      'limitations',
      'schemaVersion',
      'siteId',
      'target',
    ]);
    expect(benchmark.schemaVersion).toBe(1);
    expect(benchmark.siteId).toBe('video-moment-search');
    expect(benchmark.evidenceClassification).toBe('heuristic-regression-only');
    expect(benchmark.corpusId).toBe('wikimedia-commons-ai-video-reviewed-v1');
    expect(benchmark.limitations).toEqual({
      benchmarkStrings: 'controlled-synthetic-not-raw-user-queries',
      transcriptDerivedCases: 'prohibited',
      prohibitedClaims: [
        'user',
        'usability',
        'demand',
        'creator',
        'referral',
        'conversion',
        'revenue',
      ],
      evaluatedCorpusSemanticSha256:
        'd727dca3d41aa10714d53a872b1326198575b96f3ebc9b0af6f29ea7f69d9557',
    });
    expect(benchmark.target).toEqual({
      minimumTopThreePercent: 80,
      maximumTimestampLandingErrorSeconds: 0,
      negativeControlFalsePositiveCount: 0,
    });
  });

  it('stops before evaluation when a valid corpus changes without changing retrieval outcomes', () => {
    const benchmark = loadBenchmark();
    const driftedCorpus = structuredClone(fixture) as Mutable<VideoCorpus>;
    driftedCorpus.videos[0]!.creatorName = 'University of the Drifted';

    expect(
      validateResearcherRelevanceBenchmarkCorpus(benchmark, fixture)
        .diagnostics,
    ).toEqual([]);
    expect(buildSearchIndex(driftedCorpus).entries).toHaveLength(1);
    expect(
      searchMoments(buildSearchIndex(driftedCorpus), 'robots control', 3),
    ).toMatchObject([
      {
        momentId: 'moment-robots-control',
        startSeconds: 132,
      },
    ]);
    expect(
      validateResearcherRelevanceBenchmarkCorpus(benchmark, driftedCorpus)
        .diagnostics,
    ).toContain('benchmark corpus semantic digest does not match the artifact');
  });

  it('uses a key-order-stable semantic digest for the released corpus', () => {
    const reorderedCorpus = {
      moments: fixture.moments,
      cues: fixture.cues,
      rights: fixture.rights,
      videos: fixture.videos,
      label: fixture.label,
      corpusId: fixture.corpusId,
    };

    expect(canonicalVideoCorpusSemanticSha256(fixture)).toBe(
      'd727dca3d41aa10714d53a872b1326198575b96f3ebc9b0af6f29ea7f69d9557',
    );
    expect(canonicalVideoCorpusSemanticSha256(reorderedCorpus)).toBe(
      canonicalVideoCorpusSemanticSha256(fixture),
    );
  });

  it('retrieves the five released positive cases at the stored moment and timestamp', () => {
    const benchmark = loadBenchmark();
    expect(
      validateResearcherRelevanceBenchmarkCorpus(benchmark, fixture)
        .diagnostics,
    ).toEqual([]);
    const index = buildSearchIndex(fixture);
    const positiveCases = benchmark.cases.filter(
      (benchmarkCase) => benchmarkCase.expectedMomentId !== null,
    );

    expect(positiveCases).toEqual([
      {
        query: 'robots control',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'keep robots under control',
        queryBasis: 'title',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'robots',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'control',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'lecture robots',
        queryBasis: 'title-and-original-editorial-annotation',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
    ]);

    const evaluation = evaluateBenchmark(
      index,
      positiveCases.map((benchmarkCase) => ({
        query: benchmarkCase.query,
        expectedTopThreeMomentIds: [benchmarkCase.expectedMomentId!],
      })),
    );
    expect({
      numerator: evaluation.cases.filter((result) => result.topThreeHit).length,
      denominator: evaluation.cases.length,
    }).toEqual(benchmark.expectedEvaluation.positiveTopThreeHits);
    expect(evaluation.topThreeRecall * 100).toBe(100);
    expect(evaluation.topThreeRecall * 100).toBeGreaterThanOrEqual(
      benchmark.target.minimumTopThreePercent,
    );
    expect(evaluation.maximumTimestampLandingErrorSeconds).toBe(
      benchmark.target.maximumTimestampLandingErrorSeconds,
    );

    for (const benchmarkCase of positiveCases) {
      const result = searchMoments(index, benchmarkCase.query, 3).find(
        (candidate) => candidate.momentId === benchmarkCase.expectedMomentId,
      );
      expect(result, benchmarkCase.query).toMatchObject({
        momentId: benchmarkCase.expectedMomentId,
        startSeconds: benchmarkCase.expectedStartSeconds,
      });
      expect(new URL(result!.timestampUrl).hash, benchmarkCase.query).toBe(
        benchmarkCase.expectedTimestampSuffix,
      );
    }
  });

  it('keeps four synthetic unrelated negative controls at zero results', () => {
    const benchmark = loadBenchmark();
    const index = buildSearchIndex(fixture);
    const negativeCases = benchmark.cases.filter(
      (benchmarkCase) => benchmarkCase.expectedMomentId === null,
    );

    expect(negativeCases).toEqual([
      {
        query: 'neural networks',
        queryBasis: 'synthetic-unrelated-negative-control',
        expectedMomentId: null,
        expectedStartSeconds: null,
        expectedTimestampSuffix: null,
      },
      {
        query: 'gardening tomatoes',
        queryBasis: 'synthetic-unrelated-negative-control',
        expectedMomentId: null,
        expectedStartSeconds: null,
        expectedTimestampSuffix: null,
      },
      {
        query: 'quantum computing',
        queryBasis: 'synthetic-unrelated-negative-control',
        expectedMomentId: null,
        expectedStartSeconds: null,
        expectedTimestampSuffix: null,
      },
      {
        query: 'climate adaptation',
        queryBasis: 'synthetic-unrelated-negative-control',
        expectedMomentId: null,
        expectedStartSeconds: null,
        expectedTimestampSuffix: null,
      },
    ]);
    expect(
      negativeCases.filter(
        (benchmarkCase) => searchMoments(index, benchmarkCase.query).length > 0,
      ),
    ).toHaveLength(benchmark.target.negativeControlFalsePositiveCount);
    const controlledZeroResults = benchmark.cases.filter(
      (benchmarkCase) => searchMoments(index, benchmarkCase.query).length === 0,
    );
    expect({
      numerator: controlledZeroResults.length,
      denominator: benchmark.cases.length,
    }).toEqual(benchmark.expectedEvaluation.aggregateZeroResultRate);
    expect({
      numerator: negativeCases.length,
      denominator: negativeCases.length,
    }).toEqual(benchmark.expectedEvaluation.negativeZeroResults);
  });

  it('records the fixed descriptive fixture-regression evaluation only', () => {
    const benchmark = loadBenchmark();

    expect(benchmark.expectedEvaluation).toEqual({
      positiveTopThreeHits: { numerator: 5, denominator: 5 },
      negativeZeroResults: { numerator: 4, denominator: 4 },
      aggregateZeroResultRate: { numerator: 4, denominator: 9 },
      maximumTimestampLandingErrorSeconds: 0,
    });
  });
});
