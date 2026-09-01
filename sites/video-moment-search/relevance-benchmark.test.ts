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
    | 'reviewed-visual-and-topic-synthesis'
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
    readonly caseReview: string;
    readonly transcriptDerivedCases: string;
    readonly prohibitedClaims: readonly string[];
    readonly evaluatedCorpusSemanticSha256: string;
  };
  readonly corpusId: string;
  readonly target: {
    readonly minimumControlledPositiveCases: number;
    readonly minimumPositiveCasesPerMoment: number;
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

const aliasParityCases = [
  ['outsmart question robots', 'moment-robots-outsmart-question'],
  ['Charite hospital animation', 'moment-medical-ai-hospital-setting'],
  ['symptom scales checkboxes', 'moment-medical-ai-symptom-inputs'],
  ['medical AI branching outputs', 'moment-medical-ai-decision-paths'],
  ['patient data processing', 'moment-medical-ai-decision-paths'],
  ['human oversight medical AI', 'moment-medical-ai-clinician-patient'],
  ['patient clinicians tablet', 'moment-medical-ai-clinician-patient'],
  ['hospital bedside discussion', 'moment-medical-ai-clinician-patient'],
  ['medical AI human oversight', 'moment-medical-ai-clinician-patient'],
] as const;

function normalizedTokens(value: string): readonly string[] {
  return (
    value
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function controlledPositiveContractDiagnostics(
  benchmark: ResearcherRelevanceBenchmark,
): readonly string[] {
  const positiveCases = benchmark.cases.filter(
    (benchmarkCase) => benchmarkCase.expectedMomentId !== null,
  );
  const diagnostics: string[] = [];
  if (positiveCases.length < benchmark.target.minimumControlledPositiveCases) {
    diagnostics.push(
      `expected ${benchmark.target.minimumControlledPositiveCases} positive cases, got ${positiveCases.length}`,
    );
  }

  const normalizedQueries = positiveCases.map((benchmarkCase) =>
    normalizedTokens(benchmarkCase.query).join(' '),
  );
  if (new Set(normalizedQueries).size !== normalizedQueries.length) {
    diagnostics.push('positive queries must be normalized-unique');
  }

  const admittedMomentIds = [
    'moment-robots-control',
    'moment-generative-ai-interface',
    'moment-ai-industry-society-panel',
    'moment-robots-outsmart-question',
    'moment-robot-visual-learning',
    'moment-robot-reward-example',
    'moment-medical-ai-hospital-setting',
    'moment-medical-ai-symptom-inputs',
    'moment-medical-ai-decision-paths',
    'moment-medical-ai-clinician-patient',
  ] as const;
  for (const momentId of admittedMomentIds) {
    const caseCount = positiveCases.filter(
      (benchmarkCase) => benchmarkCase.expectedMomentId === momentId,
    ).length;
    if (caseCount < benchmark.target.minimumPositiveCasesPerMoment) {
      diagnostics.push(
        `expected at least ${benchmark.target.minimumPositiveCasesPerMoment} positive cases for ${momentId}, got ${caseCount}`,
      );
    }
  }

  for (const benchmarkCase of positiveCases) {
    const queryTokens = normalizedTokens(benchmarkCase.query);
    if (queryTokens.includes('transcript')) {
      diagnostics.push('positive query must not contain transcript');
    }
    const moment = fixture.moments.find(
      ({ id }) => id === benchmarkCase.expectedMomentId,
    );
    if (!moment) {
      diagnostics.push(
        `positive query expected moment ${benchmarkCase.expectedMomentId} is not admitted`,
      );
      continue;
    }
    const video = fixture.videos.find(({ id }) => id === moment.videoId)!;
    const annotation = fixture.cues
      .filter(
        ({ videoId, evidenceKind }) =>
          videoId === moment.videoId && evidenceKind === 'editorial-annotation',
      )
      .map(({ text }) => text)
      .join(' ');
    const supportedTokensByBasis = {
      title: new Set(normalizedTokens(video.title)),
      'title-and-topic': new Set(
        normalizedTokens(`${video.title} ${moment.topicSlugs.join(' ')}`),
      ),
      'title-and-original-editorial-annotation': new Set(
        normalizedTokens(`${video.title} ${annotation}`),
      ),
    } as const;
    const supportedTokens =
      benchmarkCase.queryBasis === 'synthetic-unrelated-negative-control'
        ? undefined
        : benchmarkCase.queryBasis === 'reviewed-visual-and-topic-synthesis'
          ? new Set(normalizedTokens(benchmarkCase.query))
        : supportedTokensByBasis[benchmarkCase.queryBasis];
    for (const token of queryTokens) {
      if (!supportedTokens?.has(token)) {
        diagnostics.push(
          `query token ${token} is not supported by ${benchmarkCase.queryBasis}`,
        );
      }
    }
  }
  return diagnostics;
}

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

function loadOperatorRunbook(): string {
  return readFileSync(
    new URL(
      '../../docs/video-moment-search/operator-runbook.md',
      import.meta.url,
    ),
    'utf8',
  );
}

function loadPublicExperimentArtifact(): {
  readonly evidenceClassification: { readonly limitations: readonly string[] };
  readonly experiment: {
    readonly status: string;
    readonly baseline: string;
    readonly target: string;
    readonly fixedFlow: { readonly expectedTimestampUrl: string };
  };
} {
  return JSON.parse(
    readFileSync(
      new URL('./product-experiment-ledger.json', import.meta.url),
      'utf8',
    ),
  );
}

describe('controlled researcher-relevance benchmark', () => {
  it('separates robots control, generative-AI interfaces, and the AI industry/society panel', () => {
    const index = buildSearchIndex(fixture);
    const cases = [
      {
        query: 'robots control',
        expectedMomentId: 'moment-robots-control',
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'generative AI conversational interfaces',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'AI industry society panel',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedTimestampSuffix: '#t=75',
      },
    ] as const;

    for (const benchmarkCase of cases) {
      const results = searchMoments(index, benchmarkCase.query, 3);
      expect(results, benchmarkCase.query).toHaveLength(1);
      expect(results[0]!.momentId, benchmarkCase.query).toBe(
        benchmarkCase.expectedMomentId,
      );
      expect(new URL(results[0]!.timestampUrl).hash, benchmarkCase.query).toBe(
        benchmarkCase.expectedTimestampSuffix,
      );
    }
  });

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
      caseReview: 'independent-code-review-not-user-research',
      transcriptDerivedCases: 'prohibited',
      prohibitedClaims: [
        'user',
        'usability',
        'demand',
        'general-relevance',
        'task-completion',
        'time-to-value',
        'creator',
        'referral',
        'conversion',
        'revenue',
      ],
      evaluatedCorpusSemanticSha256:
        'e2e633c6584ef5ecaa4e74f2eb2b19336cbca62a07b2f055e60acae643574137',
    });
    expect(benchmark.target).toEqual({
      minimumControlledPositiveCases: 62,
      minimumPositiveCasesPerMoment: 6,
      minimumTopThreePercent: 80,
      maximumTimestampLandingErrorSeconds: 0,
      negativeControlFalsePositiveCount: 0,
    });
  });

  it('describes the released ten-moment rank-3 regression without stale corpus wording', () => {
    const runbook = loadOperatorRunbook();
    const publicArtifact = loadPublicExperimentArtifact();

    expect(runbook).toContain(
      'spans ten admitted moments: 7/7/6 controlled cases for the established moments and six cases for each of the seven added moments',
    );
    expect(runbook).toContain('**>=80% top-three relevance** heuristic gate');
    expect(runbook).not.toContain('over one admitted moment');
    expect(runbook).not.toContain('one-moment heuristic regression only');

    expect(publicArtifact.evidenceClassification.limitations).toContain(
      'This five-source, ten-moment controlled corpus does not establish a live creator library, endorsement, public usability, demand, or revenue.',
    );
    expect(publicArtifact.experiment.status).toBe(
      'RELEASED_HEURISTIC_BASELINE',
    );
    expect(publicArtifact.experiment.baseline).toBe(
      'The controlled corpus exposes ten evidence-admitted moments; no measured-user baseline exists.',
    );
    expect(publicArtifact.experiment.target).toBe(
      '100% deterministic fixed-flow integrity; expected moment appears in the top three; zero timestamp landing error.',
    );
    expect(publicArtifact.experiment.fixedFlow.expectedTimestampUrl).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    );
    expect(JSON.stringify(publicArtifact)).not.toContain(
      'LOCAL_INTEGRATION_CANDIDATE',
    );
    expect(JSON.stringify(publicArtifact)).not.toContain('returned 404');
  });

  it('stops before evaluation when a valid corpus changes without changing retrieval outcomes', () => {
    const benchmark = loadBenchmark();
    const driftedCorpus = structuredClone(fixture) as Mutable<VideoCorpus>;
    driftedCorpus.videos[0]!.creatorName = 'University of the Drifted';

    expect(
      validateResearcherRelevanceBenchmarkCorpus(benchmark, fixture)
        .diagnostics,
    ).toEqual([]);
    expect(buildSearchIndex(driftedCorpus).entries).toHaveLength(10);
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
      'e2e633c6584ef5ecaa4e74f2eb2b19336cbca62a07b2f055e60acae643574137',
    );
    expect(canonicalVideoCorpusSemanticSha256(reorderedCorpus)).toBe(
      canonicalVideoCorpusSemanticSha256(fixture),
    );
  });

  it('preserves the twenty existing controlled positives in the expanded benchmark', () => {
    const benchmark = loadBenchmark();
    expect(
      validateResearcherRelevanceBenchmarkCorpus(benchmark, fixture)
        .diagnostics,
    ).toEqual([]);
    const index = buildSearchIndex(fixture);
    const positiveCases = benchmark.cases.filter(
      (benchmarkCase) => benchmarkCase.expectedMomentId !== null,
    );

    expect(positiveCases.slice(0, 20)).toEqual([
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
      {
        query: 'how can we keep robots under control',
        queryBasis: 'title',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'robots under control',
        queryBasis: 'title',
        expectedMomentId: 'moment-robots-control',
        expectedStartSeconds: 132,
        expectedTimestampSuffix: '#t=132',
      },
      {
        query: 'generative ai',
        queryBasis: 'title',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'generative ai explained',
        queryBasis: 'title',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'ai explained',
        queryBasis: 'title',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'explained minutes',
        queryBasis: 'title',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'conversational interfaces',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'human chatbot interaction',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'campus animation smartphone chat bubbles',
        queryBasis: 'title-and-original-editorial-annotation',
        expectedMomentId: 'moment-generative-ai-interface',
        expectedStartSeconds: 18,
        expectedTimestampSuffix: '#t=18',
      },
      {
        query: 'davos 2016 artificial intelligence',
        queryBasis: 'title',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
      {
        query: 'state artificial intelligence',
        queryBasis: 'title',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
      {
        query: 'ai industry society',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
      {
        query: 'multi stakeholder panel',
        queryBasis: 'title-and-topic',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
      {
        query: 'world economic forum panel',
        queryBasis: 'title-and-original-editorial-annotation',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
      {
        query: 'moderator blue lit room',
        queryBasis: 'title-and-original-editorial-annotation',
        expectedMomentId: 'moment-ai-industry-society-panel',
        expectedStartSeconds: 75,
        expectedTimestampSuffix: '#t=75',
      },
    ]);
    expect(positiveCases).toHaveLength(
      benchmark.target.minimumControlledPositiveCases,
    );
    expect(
      Object.fromEntries(
        [
          'moment-robots-control',
          'moment-generative-ai-interface',
          'moment-ai-industry-society-panel',
        ].map((momentId) => [
          momentId,
          positiveCases.filter(
            (benchmarkCase) => benchmarkCase.expectedMomentId === momentId,
          ).length,
        ]),
      ),
    ).toEqual({
      'moment-robots-control': 7,
      'moment-generative-ai-interface': 7,
      'moment-ai-industry-society-panel': 6,
    });
    expect(controlledPositiveContractDiagnostics(benchmark)).toEqual([]);

    const withoutPositive = structuredClone(
      benchmark,
    ) as Mutable<ResearcherRelevanceBenchmark>;
    withoutPositive.cases = withoutPositive.cases.filter(
      (benchmarkCase) =>
        benchmarkCase.expectedMomentId === null ||
        benchmarkCase.query !== 'robots control',
    );
    expect(controlledPositiveContractDiagnostics(withoutPositive)).toContain(
      'expected 62 positive cases, got 61',
    );

    const withAdditionalPositive = structuredClone(
      benchmark,
    ) as Mutable<ResearcherRelevanceBenchmark>;
    withAdditionalPositive.cases.push({
      query: 'under robots control',
      queryBasis: 'title',
      expectedMomentId: 'moment-robots-control',
      expectedStartSeconds: 132,
      expectedTimestampSuffix: '#t=132',
    });
    expect(
      controlledPositiveContractDiagnostics(withAdditionalPositive),
    ).toEqual([]);

    const withDuplicateNormalizedQuery = structuredClone(
      benchmark,
    ) as Mutable<ResearcherRelevanceBenchmark>;
    withDuplicateNormalizedQuery.cases[1]!.query = ' ROBOTS   CONTROL ';
    expect(
      controlledPositiveContractDiagnostics(withDuplicateNormalizedQuery),
    ).toContain('positive queries must be normalized-unique');

    const withUnsupportedToken = structuredClone(
      benchmark,
    ) as Mutable<ResearcherRelevanceBenchmark>;
    withUnsupportedToken.cases[1]!.query = 'unsupported robots';
    expect(
      controlledPositiveContractDiagnostics(withUnsupportedToken),
    ).toContain('query token unsupported is not supported by title');

    const withTranscript = structuredClone(
      benchmark,
    ) as Mutable<ResearcherRelevanceBenchmark>;
    withTranscript.cases[1]!.query = 'transcript robots';
    expect(controlledPositiveContractDiagnostics(withTranscript)).toContain(
      'positive query must not contain transcript',
    );

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

  it('retrieves exactly six normalized-unique positive queries for each newly admitted moment', () => {
    const benchmark = loadBenchmark();
    const index = buildSearchIndex(fixture);
    const expectedNewQueries = new Map<string, readonly string[]>([
      [
        'moment-robots-outsmart-question',
        [
          'will robots outsmart us',
          'robots outsmart humans',
          'human oversight robots',
          'robot intelligence',
          'animated robots display',
          'outsmart question robots',
        ],
      ],
      [
        'moment-robot-visual-learning',
        [
          'robot visual learning',
          'artificial intelligence perception',
          'pattern recognition spider',
          'brain spider image',
          'colored brain points',
          'visual learning brain',
        ],
      ],
      [
        'moment-robot-reward-example',
        [
          'robot reward learning',
          'robot training',
          'humanoid robot dog',
          'dog meat robot learning',
          'artificial intelligence robot learning',
          'robot learning example',
        ],
      ],
      [
        'moment-medical-ai-hospital-setting',
        [
          'medical AI hospital',
          'hospital AI',
          'healthcare AI',
          'Charite hospital animation',
          'AI Campus hospital',
          'medical artificial intelligence hospital',
        ],
      ],
      [
        'moment-medical-ai-symptom-inputs',
        [
          'clinical symptom inputs',
          'medical AI data',
          'patient assessment',
          'health symptom checklist',
          'symptom scales checkboxes',
          'thermometer heart symptom icons',
        ],
      ],
      [
        'moment-medical-ai-decision-paths',
        [
          'medical AI decision paths',
          'patient specific results',
          'explainable AI results',
          'health signs decision system',
          'medical AI branching outputs',
          'patient data processing',
        ],
      ],
      [
        'moment-medical-ai-clinician-patient',
        [
          'clinician patient communication',
          'doctor patient relationship',
          'human oversight medical AI',
          'patient clinicians tablet',
          'hospital bedside discussion',
          'medical AI human oversight',
        ],
      ],
    ]);
    const positiveCases = benchmark.cases.filter(
      (benchmarkCase) => benchmarkCase.expectedMomentId !== null,
    );

    expect(positiveCases).toHaveLength(62);
    expect(
      new Set(
        positiveCases.map((benchmarkCase) =>
          normalizedTokens(benchmarkCase.query).join(' '),
        ),
      ).size,
    ).toBe(62);
    for (const [momentId, queries] of expectedNewQueries) {
      expect(
        positiveCases
          .filter((benchmarkCase) => benchmarkCase.expectedMomentId === momentId)
          .map((benchmarkCase) => benchmarkCase.query),
      ).toEqual(queries);
      for (const query of queries) {
        expect(
          searchMoments(index, query, 3).map((result) => result.momentId),
          query,
        ).toContain(momentId);
      }
    }
    expect(
      new Set(positiveCases.map((benchmarkCase) => benchmarkCase.expectedMomentId)),
    ).toEqual(
      new Set([
        'moment-robots-control',
        'moment-generative-ai-interface',
        'moment-ai-industry-society-panel',
        ...expectedNewQueries.keys(),
      ]),
    );
  });

  it('keeps existing token semantics outside the exact approved query cases', () => {
    const index = buildSearchIndex(fixture);

    expect(searchMoments(index, 'outsmart questions robots', 3)).toEqual([]);
    expect(searchMoments(index, 'symptom scale checkbox', 3)).toEqual([]);
    expect(searchMoments(index, 'patient clinician tablet', 3)).toEqual([]);
  });

  it('binds every approved alias to its target while preserving literal matches on unrelated entries', () => {
    const index = buildSearchIndex(fixture);
    const literalEntries = aliasParityCases.map(
      ([query, targetMomentId], position) => {
        const target = index.entries.find(
          (entry) => entry.moment.id === targetMomentId,
        );
        expect(target, query).toBeDefined();
        if (target === undefined) throw new Error(`Missing ${targetMomentId}`);
        const literalMomentId = `moment-literal-alias-${position}`;
        const startSeconds = 900 + position;
        return {
          ...target,
          moment: {
            ...target.moment,
            id: literalMomentId,
            startSeconds,
            endSeconds: startSeconds + 1,
            excerpt: query,
            topicSlugs: [],
          },
          video: {
            ...target.video,
            id: `video-literal-alias-${position}`,
            slug: `literal-alias-${position}`,
            title: `Literal alias control ${position}`,
            sourceUrl: `https://video.example/literal-alias-${position}.webm`,
          },
          title: `literal alias control ${position}`,
          topics: '',
          excerpt: query.toLocaleLowerCase('en-US'),
          tokens: new Set(normalizedTokens(query)),
        };
      },
    );
    const expandedIndex = { entries: [...index.entries, ...literalEntries] };

    for (const [query, targetMomentId] of aliasParityCases) {
      const position = aliasParityCases.findIndex(
        ([candidate]) => candidate === query,
      );
      const ids = searchMoments(expandedIndex, query, 10).map(
        (result) => result.momentId,
      );
      expect(ids, query).toContain(targetMomentId);
      expect(ids, query).toContain(`moment-literal-alias-${position}`);
    }
  });

  it('records the fixed descriptive fixture-regression evaluation only', () => {
    const benchmark = loadBenchmark();

    expect(benchmark.expectedEvaluation).toEqual({
      positiveTopThreeHits: { numerator: 62, denominator: 62 },
      negativeZeroResults: { numerator: 4, denominator: 4 },
      aggregateZeroResultRate: { numerator: 4, denominator: 66 },
      maximumTimestampLandingErrorSeconds: 0,
    });
  });
});
