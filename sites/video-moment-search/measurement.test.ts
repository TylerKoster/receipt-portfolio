import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createMeasurementEvent,
  deliverMeasurementEvent,
  validateExperimentLedger,
} from './measurement.js';
import {
  buildSearchIndex,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import { renderSearchShell } from './render.js';
import type { VideoSourceEvidenceManifest } from './source-evidence.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;
const evidenceManifest = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/video-source-evidence-manifest-v2.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoSourceEvidenceManifest;
const ledger = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/video-moment-search/experiment-ledger.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const runbook = readFileSync(
  new URL(
    '../../docs/video-moment-search/operator-runbook.md',
    import.meta.url,
  ),
  'utf8',
);

const canonicalHistoricalArtifact = {
  relationship: 'supplements',
  replacementPolicy: 'does-not-replace',
  path: 'sites/video-moment-search/product-experiment-ledger.json',
  role: 'released-single-experiment-historical-artifact',
} as const;

const canonicalNoDataState = {
  measurementEvidence: 'not-measured',
  missingDataInterpretation: 'unknown-or-blocked',
  zeroDemandInference: 'prohibited',
  prohibitedOutcomeClaims: [
    'measured-users',
    'creator-onboarding',
    'creator-referrals',
    'usability',
    'demand',
    'revenue',
    'task-completion',
    'ld-workflow',
    'paid-pilot-evidence',
  ],
} as const;

const canonicalPersonas = [
  {
    id: 'researcher',
    testability: 'preview-testable-heuristic',
    testableCapabilities: [
      'concept-search',
      'ranked-results',
      'exact-moment-routing',
    ],
    unsupportedCapabilities: [
      'measured-task-completion',
      'measured-time-to-value',
      'usability-evidence',
      'demand-evidence',
    ],
  },
  {
    id: 'creator',
    testability: 'preview-testable-heuristic',
    testableCapabilities: [
      'controlled-reviewed-fixture-inspection',
      'page-memory-correction-preview',
      'page-memory-removal-preview',
      'not-configured-referral-measurement-status-inspection',
    ],
    unsupportedCapabilities: [
      'rights-cleared-library-submission',
      'publication-correction-or-removal',
      'attributable-creator-referral-evidence',
      'measured-task-completion',
      'measured-time-to-value',
      'usability-evidence',
      'demand-evidence',
      'conversion-evidence',
      'revenue-evidence',
    ],
  },
  {
    id: 'ld-lead',
    testability: 'preview-testable-heuristic',
    testableCapabilities: [
      'controlled-fixture-search',
      'stored-historical-evidence-inspection',
      'exact-source-context-routing',
      'timestamp-list-copy-share',
    ],
    unsupportedCapabilities: [
      'approved-library-search',
      'current-permission-verification',
      'collaboration-or-retention',
      'measured-task-completion',
      'measured-time-to-value',
      'usability-evidence',
      'demand-evidence',
    ],
  },
] as const;

describe('privacy-preserving measurement contract', () => {
  it('constructs a strict allowlisted search payload without query text or personal data', () => {
    const event = createMeasurementEvent('search', {
      pageId: 'search-home',
      resultCount: 4,
      queryTokenCount: 3,
      occurredAt: '2026-08-31T12:00:00.000Z',
      query: 'agent evaluation',
      email: 'person@example.test',
      crossSiteId: 'visitor-7',
      fingerprint: 'canvas-hash',
      unknown: 'discard me',
    });

    expect(event).toEqual({
      schemaVersion: 1,
      eventType: 'search',
      pageId: 'search-home',
      resultCount: 4,
      queryTokenCount: 3,
      occurredAt: '2026-08-31T12:00:00.000Z',
    });
    expect(JSON.stringify(event)).not.toContain('agent evaluation');
    expect(JSON.stringify(event)).not.toContain('person@example.test');
  });

  it.each([
    ['search', { resultCount: 2, queryTokenCount: 2 }],
    ['zero_result', { queryTokenCount: 3 }],
    ['moment_click', { momentId: 'moment-robots-control', resultPosition: 1 }],
    ['creator_referral', { referralCampaignId: 'creator-preview-a' }],
    ['offer_click', { offerId: 'ld-pilot' }],
    ['return_session', { pageId: 'search-home' }],
  ] as const)(
    'constructs the %s event with only its approved fields',
    (eventType, payload) => {
      const event = createMeasurementEvent(eventType, {
        ...payload,
        pageId: 'search-home',
        occurredAt: '2026-08-31T12:00:00.000Z',
        rawQuery: 'robots control',
      });

      expect(event).toBeDefined();
      if (event === undefined) throw new Error('expected a valid event');
      expect(event.eventType).toBe(eventType);
      expect(event.pageId).toBe('search-home');
      expect(event.occurredAt).toBe('2026-08-31T12:00:00.000Z');
      expect(JSON.stringify(event)).not.toContain('robots control');
    },
  );

  it('generates a canonical current timestamp only when occurredAt is omitted', () => {
    const before = Date.now();
    const event = createMeasurementEvent('search', { resultCount: 1 });
    const after = Date.now();

    expect(event).toBeDefined();
    expect(new Date(event!.occurredAt).toISOString()).toBe(event!.occurredAt);
    expect(Date.parse(event!.occurredAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(event!.occurredAt)).toBeLessThanOrEqual(after);
  });

  it.each([
    ['explicit undefined', undefined],
    ['an invalid string', 'not-a-timestamp'],
    ['a number', 1_777_777_777_777],
    ['a noncanonical ISO form', '2026-08-31T12:00:00Z'],
  ])('rejects %s when occurredAt is explicitly present', (_, occurredAt) => {
    expect(
      createMeasurementEvent('search', {
        resultCount: 1,
        occurredAt,
      }),
    ).toBeUndefined();
  });

  it('explicitly discards events while no approved measurement endpoint exists', () => {
    const delivery = deliverMeasurementEvent(
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
    );

    expect(delivery).toEqual({
      measurementStatus: 'not-configured',
      disposition: 'discarded',
      eventType: 'moment_click',
    });
  });

  it('rejects an unknown runtime event type without throwing or echoing it', () => {
    const untrustedType: unknown = 'browser-extension-event';

    expect(() =>
      createMeasurementEvent(untrustedType, {
        occurredAt: '2026-08-31T12:00:00.000Z',
        query: 'agent evaluation',
      }),
    ).not.toThrow();
    expect(
      createMeasurementEvent(untrustedType, {
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      schemaVersion: 1,
      eventType: 'browser-extension-event',
      occurredAt: '2026-08-31T12:00:00.000Z',
    },
    {
      schemaVersion: 1,
      eventType: 'search',
      occurredAt: '2026-08-31T12:00:00.000Z',
      query: 'agent evaluation',
    },
  ])(
    'discards fabricated delivery input without echoing its event type',
    (input) => {
      expect(deliverMeasurementEvent(input)).toEqual({
        measurementStatus: 'not-configured',
        disposition: 'discarded',
      });
    },
  );

  it.each([
    [
      'an explicitly undefined numeric field',
      createMeasurementEvent('search', {
        resultCount: 2,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'resultCount',
      undefined,
    ],
    [
      'an invalid numeric field',
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'resultPosition',
      0,
    ],
    [
      'an explicitly undefined string field',
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'momentId',
      undefined,
    ],
    [
      'a malformed string field',
      createMeasurementEvent('creator_referral', {
        referralCampaignId: 'creator-preview-a',
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'referralCampaignId',
      'creator preview',
    ],
  ] as const)(
    'discards a fabricated event with %s',
    (_, event, field, value) => {
      expect(deliverMeasurementEvent({ ...event, [field]: value })).toEqual({
        measurementStatus: 'not-configured',
        disposition: 'discarded',
      });
    },
  );

  it('keeps future measurement hooks non-executing and preserves the released exact source href', () => {
    const html = renderSearchShell(
      fixture,
      buildSearchIndex(fixture),
      'https://receipt-portfolio.example/',
      evidenceManifest,
      new Date('2026-08-31T12:00:00.000Z'),
    );

    expect(html).toContain('data-measurement-event="search"');
    expect(html).toContain('data-measurement-status="not-configured"');
    expect(html).toContain('No measurement endpoint is configured');
    expect(html).toContain('data-measurement-event="moment_click"');
    expect(html).toContain(
      'href="https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132"',
    );
    expect(html).not.toContain('name="q"');
    expect(html).not.toContain('?q=');
  });

  it('accepts a ranked 90-day ledger with required metrics, personas, targets, stop rules, and evidence boundaries', () => {
    expect(validateExperimentLedger(ledger).diagnostics).toEqual([]);
  });

  it('fails closed when the controlled literal match-explanation gate is absent or altered', () => {
    expect(ledger.controlledLiteralMatchExplanationGate).toEqual({
      evidenceClassification: 'synthetic-heuristic-only',
      metric: 'deterministic literal match-explanation integrity',
      baseline: 'ranked results expose no field-level reason',
      target: {
        controlledQueries: 3,
        truthfulReasons: 3,
        exactTimestampLandingError: 0,
        falseReasons: 0,
        rawQueryReflection: 0,
        extraRequests: 0,
        retainedOrTransmittedMeasurementRecords: 0,
      },
      stopRule:
        'stop on any unsupported reason, query reflection, ranking or routing change, persistence or transmission, extra network, fallback loss, semantic relevance claim, or user-outcome claim',
      evidencePath: 'sites/video-moment-search/site.test.ts',
    });

    const invalid = structuredClone(ledger);
    delete invalid.controlledLiteralMatchExplanationGate;
    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'controlledLiteralMatchExplanationGate must match the approved controlled literal match-explanation gate',
    );

    const altered = structuredClone(ledger);
    altered.controlledLiteralMatchExplanationGate.target.extraRequests = 1;
    expect(validateExperimentLedger(altered).diagnostics).toContain(
      'controlledLiteralMatchExplanationGate must match the approved controlled literal match-explanation gate',
    );
  });

  it('binds the rank-3 regression to controlled query recovery', () => {
    expect(ledger.experiments[2].evidencePaths).toContainEqual({
      role: 'controlled-query-recovery-regression',
      path: 'sites/video-moment-search/site.test.ts',
    });

    const invalid = structuredClone(ledger);
    invalid.experiments[2].evidencePaths =
      invalid.experiments[2].evidencePaths.filter(
        (path: { role: string }) =>
          path.role !== 'controlled-query-recovery-regression',
      );

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[2].evidencePaths must match the approved evidence roles',
    );
  });

  it('documents controlled query recovery as a synthetic integrity gate without outcome claims', () => {
    expect(runbook).toContain(
      'Metric: **deterministic controlled-query recovery integrity**.',
    );
    expect(runbook).toContain(
      'Target: **3/3 controls recover from an unrelated zero-result state to the expected unique moment at 132/18/75 with timestamp landing error 0, native navigations 0, extra requests 0, and retained or transmitted measurement data 0**.',
    );
    expect(runbook).toContain(
      'Stop: any wrong/multiple result, timestamp mismatch, native navigation, query/history/storage/telemetry persistence, extra network destination, loss of the server fallback, unsupported or transcript-derived example, or prohibited outcome claim.',
    );
    expect(runbook).toContain(
      'This fixed synthetic recovery gate is not user research or evidence of any user outcome.',
    );
  });

  it('uses exact structured source authority, no-data, and persona contracts', () => {
    expect(ledger.historicalArtifact).toEqual(canonicalHistoricalArtifact);
    expect(ledger.noDataState).toEqual(canonicalNoDataState);
    expect(ledger).not.toHaveProperty(
      'relationshipToReleasedHistoricalArtifact',
    );
    expect(ledger).not.toHaveProperty('noDataBoundary');
    expect(ledger.personas).toEqual(canonicalPersonas);
  });

  it.each([
    ['relationship', 'replaces'],
    ['replacementPolicy', 'may-replace'],
    ['path', 'docs/video-moment-search/experiment-ledger.json'],
    ['role', 'current-source-of-truth'],
  ] as const)(
    'rejects false historical artifact authority in %s',
    (field, value) => {
      const invalid = structuredClone(ledger);
      invalid.historicalArtifact = {
        ...structuredClone(canonicalHistoricalArtifact),
        [field]: value,
      };

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        'historicalArtifact must match the released artifact contract',
      );
    },
  );

  it('rejects a missing structured no-data state', () => {
    const invalid = structuredClone(ledger);
    delete invalid.noDataState;

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'noDataState must match the no-data claim boundary',
    );
  });

  it.each([
    ['measurementEvidence', 'measured'],
    ['missingDataInterpretation', 'zero-demand'],
    ['zeroDemandInference', 'allowed'],
  ] as const)('rejects a false no-data state in %s', (field, value) => {
    const invalid = structuredClone(ledger);
    invalid.noDataState = {
      ...structuredClone(canonicalNoDataState),
      [field]: value,
    };

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'noDataState must match the no-data claim boundary',
    );
  });

  it('rejects removal of a prohibited outcome claim', () => {
    const invalid = structuredClone(ledger);
    invalid.noDataState = {
      ...structuredClone(canonicalNoDataState),
      prohibitedOutcomeClaims:
        canonicalNoDataState.prohibitedOutcomeClaims.filter(
          (claim) => claim !== 'demand',
        ),
    };

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'noDataState must match the no-data claim boundary',
    );
  });

  it('rejects an extra top-level outcome claim', () => {
    const invalid = structuredClone(ledger);
    invalid.outcomeClaim = 'Measured creator demand';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'ledger has unsupported top-level key(s): outcomeClaim',
    );
  });

  it('binds preview capabilities to persona identity rather than accepting a state swap', () => {
    const invalid = structuredClone(ledger);
    [
      invalid.personas[0].testableCapabilities,
      invalid.personas[1].testableCapabilities,
    ] = [
      invalid.personas[1].testableCapabilities,
      invalid.personas[0].testableCapabilities,
    ];

    const diagnostics = validateExperimentLedger(invalid).diagnostics;
    expect(diagnostics).toContain(
      'personas[0] must match the researcher persona contract',
    );
    expect(diagnostics).toContain(
      'personas[1] must match the creator persona contract',
    );
  });

  it.each([['creator', 1]] as const)(
    'rejects not-yet-testable for the %s persona',
    (personaId, index) => {
      const invalid = structuredClone(ledger);
      invalid.personas[index].testability = 'not-yet-testable';

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        `personas[${index}] must match the ${personaId} persona contract`,
      );
    },
  );

  it('rejects not-yet-testable for the narrowed L&D persona', () => {
    const invalid = structuredClone(ledger);
    invalid.personas[2].testability = 'not-yet-testable';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'personas[2] must match the ld-lead persona contract',
    );
  });

  it.each([
    ['description', 'Creator onboarding produced measured demand'],
    ['outcomeClaim', 'Creator onboarding succeeded'],
  ] as const)(
    'rejects persona outcome prose in an extra %s field',
    (field, value) => {
      const invalid = structuredClone(ledger);
      invalid.personas[1][field] = value;

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        `personas[1] has unsupported persona key(s): ${field}`,
      );
    },
  );

  it('rejects an extra persona key', () => {
    const invalid = structuredClone(ledger);
    invalid.personas[0].operatorNote = 'Treat this as measured';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'personas[0] has unsupported persona key(s): operatorNote',
    );
  });

  it.each([
    ['missing', undefined],
    ['changed', ['creator-referral-evidence']],
  ] as const)(
    'rejects %s creator unsupported capabilities',
    (_, unsupportedCapabilities) => {
      const invalid = structuredClone(ledger);
      if (unsupportedCapabilities === undefined) {
        delete invalid.personas[1].unsupportedCapabilities;
      } else {
        invalid.personas[1].unsupportedCapabilities = unsupportedCapabilities;
      }

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        'personas[1] must match the creator persona contract',
      );
    },
  );

  it('rejects active experiments that lose their measurable stop rule or evidence classification', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].stopRule = '';
    invalid.experiments[1].evidenceClassification = 'measured';

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[0].stopRule');
    expect(diagnostics).toContain('experiments[1].evidenceClassification');
  });

  it('rejects an invalid rank, invalid target shape, missing required metric, and an unsupported persona assertion', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].rank = 2;
    invalid.experiments[2].target = {
      classification: 'approved-spec-gate',
      minimumPercent: '80',
    };
    invalid.requiredMetrics = invalid.requiredMetrics.filter(
      (metric: string) => metric !== 'time-to-value',
    );
    invalid.personas[1].testability = 'measured-success';

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[0].rank');
    expect(diagnostics).toContain('experiments[2].target');
    expect(diagnostics).toContain('requiredMetrics');
    expect(diagnostics).toContain(
      'personas[1] must match the creator persona contract',
    );
  });

  it('rejects a reordered or substituted experiment even when its rank remains numeric', () => {
    const reordered = structuredClone(ledger);
    [reordered.experiments[0], reordered.experiments[1]] = [
      reordered.experiments[1],
      reordered.experiments[0],
    ];
    const substituted = structuredClone(ledger);
    substituted.experiments[3].id = 'alternate-routing';

    expect(
      validateExperimentLedger(reordered).diagnostics.join('\n'),
    ).toContain('experiments[0].id');
    expect(
      validateExperimentLedger(substituted).diagnostics.join('\n'),
    ).toContain('experiments[3].id');
  });

  it('binds each ranked experiment to its primary metric, required measures, and exact target gate', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[2].metric = 'exact-moment click rate';
    invalid.experiments[2].measures = invalid.experiments[2].measures.filter(
      (metric: string) => metric !== 'time-to-value',
    );
    invalid.experiments[2].target = {
      classification: 'approved-spec-gate',
      minimumPercent: 1,
    };

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[2].metric');
    expect(diagnostics).toContain('experiments[2].measures');
    expect(diagnostics).toContain('experiments[2].target');
  });

  it.each(['complete', 'measured'])(
    'rejects an experiment lifecycle status of %s',
    (status) => {
      const invalid = structuredClone(ledger);
      invalid.experiments[0].status = status;

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        'experiments[0].status must equal proposed',
      );
    },
  );

  it('binds evidence classification to experiment rank', () => {
    const invalid = structuredClone(ledger);
    [
      invalid.experiments[1].evidenceClassification,
      invalid.experiments[2].evidenceClassification,
    ] = [
      invalid.experiments[2].evidenceClassification,
      invalid.experiments[1].evidenceClassification,
    ];

    const diagnostics = validateExperimentLedger(invalid).diagnostics;
    expect(diagnostics).toContain(
      'experiments[1].evidenceClassification must match the ranked evidence state',
    );
    expect(diagnostics).toContain(
      'experiments[2].evidenceClassification must match the ranked evidence state',
    );
  });

  it('rejects arbitrary nonblank evidence paths', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].evidencePaths = ['README.md'];

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[0].evidencePaths must match the approved evidence roles',
    );
  });

  it.each([
    ['removal', (paths: { role: string; path: string }[]) => paths.slice(0, 2)],
    [
      'role rename',
      (paths: { role: string; path: string }[]) =>
        paths.map((entry) =>
          entry.role === 'heuristic-relevance-benchmark'
            ? { ...entry, role: 'relevance-benchmark' }
            : entry,
        ),
    ],
    [
      'path substitution',
      (paths: { role: string; path: string }[]) =>
        paths.map((entry) =>
          entry.role === 'heuristic-relevance-benchmark'
            ? {
                ...entry,
                path: 'docs/video-moment-search/other-benchmark.json',
              }
            : entry,
        ),
    ],
  ] as const)(
    'rejects rank-3 relevance-benchmark evidence %s',
    (_, mutatePaths) => {
      const invalid = structuredClone(ledger);
      invalid.experiments[2].evidencePaths = mutatePaths(
        invalid.experiments[2].evidencePaths,
      );

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        'experiments[2].evidencePaths must match the approved evidence roles',
      );
    },
  );

  it('rejects a fabricated measured-outcome baseline', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].baseline =
      'Measured creator demand and successful onboarding.';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[0].baseline must match the approved evidence baseline',
    );
  });

  it('rejects a conflicting legacy continuation gate as a second target source', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].continuationGate = {
      classification: 'approved-spec-gate',
      authorizedCreators: 30,
      coveredVideos: 1_000,
    };

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[0] has unsupported experiment key(s): continuationGate',
    );
  });

  it('rejects an unknown experiment-level key', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[1].operatorNote = 'Treat the target as optional';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[1] has unsupported experiment key(s): operatorNote',
    );
  });

  it('rejects an experiment with no target', () => {
    const invalid = structuredClone(ledger);
    delete invalid.experiments[2].target;

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[2].target must match the approved gate',
    );
  });

  it.each([
    [0, 'provisional-operator-hypothesis'],
    [4, 'approved-spec-gate'],
  ] as const)(
    'rejects the wrong approved/provisional target classification at experiment index %d',
    (index, classification) => {
      const invalid = structuredClone(ledger);
      invalid.experiments[index].target.classification = classification;

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        `experiments[${index}].target must match the approved gate`,
      );
    },
  );

  it.each([
    [
      'decimal expansion',
      2,
      { classification: 'approved-spec-gate', minimumPercent: 80.5 },
    ],
    [
      'comma-equivalent click-rate expansion',
      3,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 30000,
        denominator: 'successful-searches',
      },
    ],
    [
      'comma-equivalent impression expansion',
      4,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 100000,
        days: 90,
      },
    ],
    [
      'word expansion',
      6,
      {
        classification: 'approved-spec-gate',
        minimumCommitments: 'One hundred',
        days: 90,
      },
    ],
    [
      'prefix expansion',
      0,
      {
        classification: 'approved-spec-gate',
        authorizedCreators: 13,
        coveredVideos: 100,
      },
    ],
    [
      'suffix representation',
      2,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 80,
        suffix: '%',
      },
    ],
    [
      'negative alternate representation',
      1,
      { classification: 'approved-spec-gate', verifiedMoments: -500 },
    ],
  ] as const)('rejects a target with %s', (_, index, target) => {
    const invalid = structuredClone(ledger);
    invalid.experiments[index].target = target;

    expect(validateExperimentLedger(invalid).diagnostics.join('\n')).toContain(
      `experiments[${index}].target`,
    );
  });

  it.each([
    [
      0,
      {
        classification: 'approved-spec-gate',
        authorizedCreators: 3,
        coveredVideos: 100,
      },
    ],
    [1, { classification: 'approved-spec-gate', verifiedMoments: 500 }],
    [2, { classification: 'approved-spec-gate', minimumPercent: 80 }],
    [
      3,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 30,
        denominator: 'successful-searches',
      },
    ],
    [
      4,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 100,
        days: 90,
      },
    ],
    [
      5,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 10,
        days: 90,
      },
    ],
    [
      6,
      {
        classification: 'approved-spec-gate',
        minimumCommitments: 1,
        days: 90,
      },
    ],
  ] as const)(
    'accepts the exact structured target for rank %d',
    (index, target) => {
      const candidate = structuredClone(ledger);
      candidate.experiments[index].target = target;

      expect(validateExperimentLedger(candidate).diagnostics).toEqual([]);
    },
  );

  it('fails closed when the controlled creator review gate changes', () => {
    const invalid = structuredClone(ledger);
    invalid.controlledCreatorReviewGate.target.extraRequests = 1;

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'controlledCreatorReviewGate must match the approved controlled creator review gate',
    );
  });
});
