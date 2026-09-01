import {
  sha256Utf8,
  validateVideoCorpus,
} from '../../packages/video-moment-core/src/index.js';

export const measurementEventTypes = [
  'search',
  'zero_result',
  'moment_click',
  'creator_referral',
  'offer_click',
  'return_session',
] as const;

export type MeasurementEventType = (typeof measurementEventTypes)[number];

export interface MeasurementEvent {
  readonly schemaVersion: 1;
  readonly eventType: MeasurementEventType;
  readonly occurredAt: string;
  readonly pageId?: string;
  readonly resultCount?: number;
  readonly queryTokenCount?: number;
  readonly momentId?: string;
  readonly resultPosition?: number;
  readonly referralCampaignId?: string;
  readonly offerId?: string;
}

export interface MeasurementDelivery {
  readonly measurementStatus: 'not-configured';
  readonly disposition: 'discarded';
  readonly eventType?: MeasurementEventType;
}

type AllowedField = Exclude<
  keyof MeasurementEvent,
  'schemaVersion' | 'eventType'
>;

const commonFields: readonly AllowedField[] = ['occurredAt', 'pageId'];
const fieldsByEventType: Readonly<
  Record<MeasurementEventType, readonly AllowedField[]>
> = {
  search: ['resultCount', 'queryTokenCount'],
  zero_result: ['queryTokenCount'],
  moment_click: ['momentId', 'resultPosition'],
  creator_referral: ['referralCampaignId'],
  offer_click: ['offerId', 'referralCampaignId'],
  return_session: [],
};

function isMeasurementEventType(value: unknown): value is MeasurementEventType {
  return (
    typeof value === 'string' &&
    measurementEventTypes.includes(value as MeasurementEventType)
  );
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(value)
    ? value
    : undefined;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function safePositiveCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function safeTimestamp(value: unknown): string | undefined {
  return isIsoTimestamp(value) ? value : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function allowedValue(
  field: AllowedField,
  value: unknown,
): string | number | undefined {
  switch (field) {
    case 'occurredAt':
      return safeTimestamp(value);
    case 'resultCount':
    case 'queryTokenCount':
      return safeCount(value);
    case 'resultPosition':
      return safePositiveCount(value);
    case 'pageId':
    case 'momentId':
    case 'referralCampaignId':
    case 'offerId':
      return safeIdentifier(value);
  }
}

/**
 * Constructs a local-only, data-minimized event. Unknown fields are discarded.
 */
export function createMeasurementEvent(
  eventType: MeasurementEventType,
  payload?: Record<string, unknown>,
): MeasurementEvent | undefined;

export function createMeasurementEvent(
  eventType: unknown,
  payload?: unknown,
): MeasurementEvent | undefined;

export function createMeasurementEvent(
  eventType: unknown,
  payload: unknown = {},
): MeasurementEvent | undefined {
  return createMeasurementEventFromUnknown(eventType, payload);
}

function createMeasurementEventFromUnknown(
  eventType: unknown,
  payload: unknown,
): MeasurementEvent | undefined {
  if (!isMeasurementEventType(eventType)) return undefined;
  const fields = objectRecord(payload) ?? {};
  const occurredAt = Object.prototype.hasOwnProperty.call(fields, 'occurredAt')
    ? safeTimestamp(fields.occurredAt)
    : new Date().toISOString();
  if (occurredAt === undefined) return undefined;
  const event: Record<string, string | number> = {
    schemaVersion: 1,
    eventType,
    occurredAt,
  };
  for (const field of [...commonFields, ...fieldsByEventType[eventType]]) {
    if (field === 'occurredAt') continue;
    const value = allowedValue(field, fields[field]);
    if (value !== undefined) event[field] = value;
  }
  return event as unknown as MeasurementEvent;
}

/**
 * No endpoint is approved for this slice. Delivery is deliberately local and
 * reports a discard rather than storing or transmitting the event.
 */
export function deliverMeasurementEvent(event: unknown): MeasurementDelivery {
  if (!isMeasurementEvent(event)) {
    return {
      measurementStatus: 'not-configured',
      disposition: 'discarded',
    };
  }
  return {
    measurementStatus: 'not-configured',
    disposition: 'discarded',
    eventType: event.eventType,
  };
}

function isMeasurementEvent(value: unknown): value is MeasurementEvent {
  const event = objectRecord(value);
  if (
    event === undefined ||
    event.schemaVersion !== 1 ||
    !isMeasurementEventType(event.eventType) ||
    !isIsoTimestamp(event.occurredAt)
  ) {
    return false;
  }
  const allowedFields = new Set([
    'schemaVersion',
    'eventType',
    ...commonFields,
    ...fieldsByEventType[event.eventType],
  ]);
  return Object.entries(event).every(([field, fieldValue]) => {
    if (!allowedFields.has(field)) return false;
    if (field === 'schemaVersion' || field === 'eventType') return true;
    const sanitized = allowedValue(field as AllowedField, fieldValue);
    return sanitized !== undefined && sanitized === fieldValue;
  });
}

function canonicalizeSemanticValue(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical semantic values must be finite');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeSemanticValue).join(',')}]`;
  }
  const record = objectRecord(value);
  if (record === undefined) {
    throw new Error('canonical semantic values must be JSON values');
  }
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeSemanticValue(record[key])}`,
    )
    .join(',')}}`;
}

/**
 * Produces a stable semantic digest only for a production-valid video corpus.
 * Object-key order and source-file formatting do not affect the digest.
 */
export function canonicalVideoCorpusSemanticSha256(
  value: unknown,
): string | undefined {
  if (!validateVideoCorpus(value).ok) return undefined;
  return sha256Utf8(canonicalizeSemanticValue(value));
}

export interface ResearcherRelevanceBenchmarkCorpusValidation {
  readonly diagnostics: readonly string[];
}

/**
 * Stops controlled retrieval evaluation when its admitted corpus no longer
 * matches the immutable semantic binding recorded in the benchmark artifact.
 */
export function validateResearcherRelevanceBenchmarkCorpus(
  benchmarkValue: unknown,
  corpusValue: unknown,
): ResearcherRelevanceBenchmarkCorpusValidation {
  const diagnostics: string[] = [];
  const benchmark = objectRecord(benchmarkValue);
  const limitations = objectRecord(benchmark?.limitations);
  const corpus = objectRecord(corpusValue);
  const digest = canonicalVideoCorpusSemanticSha256(corpusValue);

  if (digest === undefined) {
    diagnostics.push(
      'benchmark corpus must satisfy the released corpus contract',
    );
    return { diagnostics };
  }
  if (benchmark?.corpusId !== corpus?.corpusId) {
    diagnostics.push('benchmark corpus ID does not match the artifact');
  }
  if (limitations?.evaluatedCorpusSemanticSha256 !== digest) {
    diagnostics.push(
      'benchmark corpus semantic digest does not match the artifact',
    );
  }
  return { diagnostics };
}

const requiredMetrics = [
  'top-three relevance',
  'timestamp landing error',
  'zero-result rate',
  'exact-moment click rate',
  'correction rate',
  'creator referral clicks',
  'task completion',
  'time-to-value',
] as const;

const requiredPersonaIds = ['researcher', 'creator', 'ld-lead'] as const;
const allowedLedgerKeys = new Set([
  'schemaVersion',
  'siteId',
  'historicalArtifact',
  'measurementStatus',
  'noDataState',
  'requiredMetrics',
  'personas',
  'experiments',
]);
const allowedPersonaKeys = new Set([
  'id',
  'testability',
  'testableCapabilities',
  'unsupportedCapabilities',
]);
const allowedExperimentKeys = new Set([
  'rank',
  'id',
  'hypothesis',
  'metric',
  'measures',
  'baseline',
  'target',
  'stopRule',
  'status',
  'evidenceClassification',
  'evidencePaths',
]);

const expectedHistoricalArtifact = {
  relationship: 'supplements',
  replacementPolicy: 'does-not-replace',
  path: 'sites/video-moment-search/product-experiment-ledger.json',
  role: 'released-single-experiment-historical-artifact',
} as const;

const expectedNoDataState = {
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

const expectedPersonas = [
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
    testability: 'not-yet-testable',
    testableCapabilities: [],
    unsupportedCapabilities: [
      'rights-cleared-library-submission',
      'moment-correction-or-removal',
      'creator-referral-evidence',
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

const expectedExperiments = [
  {
    rank: 1,
    id: 'creator-authorization',
    hypothesis: 'bounded-rights-review-admission',
    metric: 'creator referral clicks',
    measures: ['creator referral clicks', 'correction rate'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'authority-review',
    },
    target: {
      classification: 'approved-spec-gate',
      authorizedCreators: 3,
      coveredVideos: 100,
    },
    stopRule: {
      action: 'stop',
      when: 'authority-or-rights-evidence-is-ambiguous',
    },
    status: 'proposed',
    evidenceClassification: 'not-yet-testable',
    evidencePaths: [
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
      {
        role: 'released-historical-artifact',
        path: 'sites/video-moment-search/product-experiment-ledger.json',
      },
    ],
  },
  {
    rank: 2,
    id: 'corpus-growth',
    hypothesis: 'authorized-corpus-growth-with-review-controls',
    metric: 'correction rate',
    measures: ['correction rate'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'authorized-evidence',
    },
    target: { classification: 'approved-spec-gate', verifiedMoments: 500 },
    stopRule: {
      action: 'stop',
      when: 'rights-routing-or-correction-evidence-is-missing',
    },
    status: 'proposed',
    evidenceClassification: 'not-yet-testable',
    evidencePaths: [
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
      {
        role: 'authorized-corpus-fixture',
        path: 'fixtures/video-moment-search/authorized-ai-video-v1.json',
      },
    ],
  },
  {
    rank: 3,
    id: 'researcher-relevance',
    hypothesis: 'heuristic-search-to-exact-moment-routing',
    metric: 'top-three relevance',
    measures: [
      'top-three relevance',
      'timestamp landing error',
      'zero-result rate',
      'task completion',
      'time-to-value',
    ],
    baseline: {
      evidenceState: 'heuristic-only',
      interpretation: 'not-measured',
      blocker: 'measured-user-evidence',
    },
    target: { classification: 'approved-spec-gate', minimumPercent: 80 },
    stopRule: {
      action: 'stop',
      when: 'target-is-not-met-or-routing-integrity-fails',
      targetReference: 'target',
      additionalGate: 'zero-results-require-review',
    },
    status: 'proposed',
    evidenceClassification: 'heuristic-preview-gate',
    evidencePaths: [
      {
        role: 'exact-routing-regression',
        path: 'sites/video-moment-search/site.test.ts',
      },
      {
        role: 'controlled-query-recovery-regression',
        path: 'sites/video-moment-search/site.test.ts',
      },
      {
        role: 'released-historical-artifact',
        path: 'sites/video-moment-search/product-experiment-ledger.json',
      },
      {
        role: 'heuristic-relevance-benchmark',
        path: 'docs/video-moment-search/researcher-relevance-benchmark.json',
      },
    ],
  },
  {
    rank: 4,
    id: 'exact-moment-routing',
    hypothesis: 'approved-measurement-exact-moment-usefulness',
    metric: 'exact-moment click rate',
    measures: ['exact-moment click rate', 'timestamp landing error'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'approved-measurement',
    },
    target: {
      classification: 'approved-spec-gate',
      minimumPercent: 30,
      denominator: 'successful-searches',
    },
    stopRule: {
      action: 'stop',
      when: 'target-is-not-met-or-timestamp-routing-fails',
      targetReference: 'target',
      inferenceBoundary: 'clicks-do-not-prove-task-completion',
    },
    status: 'proposed',
    evidenceClassification: 'no-data',
    evidencePaths: [
      {
        role: 'measurement-contract',
        path: 'sites/video-moment-search/measurement.ts',
      },
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
    ],
  },
  {
    rank: 5,
    id: 'non-branded-discovery',
    hypothesis: 'bounded-non-branded-impression-observation',
    metric: 'non-branded impressions',
    measures: ['non-branded impressions'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'approved-measurement',
    },
    target: {
      classification: 'provisional-operator-hypothesis',
      observationTarget: 100,
      days: 90,
    },
    stopRule: {
      action: 'stop',
      when: 'target-is-not-observed-or-attribution-integrity-fails',
      targetReference: 'target',
      belowTargetConclusion: 'unknown',
    },
    status: 'proposed',
    evidenceClassification: 'no-data',
    evidencePaths: [
      {
        role: 'measurement-contract',
        path: 'sites/video-moment-search/measurement.ts',
      },
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
    ],
  },
  {
    rank: 6,
    id: 'offer-interest',
    hypothesis: 'bounded-offer-click-observation',
    metric: 'offer clicks',
    measures: ['offer clicks'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'approved-measurement',
    },
    target: {
      classification: 'provisional-operator-hypothesis',
      observationTarget: 10,
      days: 90,
    },
    stopRule: {
      action: 'stop',
      when: 'target-is-not-observed-or-private-attribution-is-required',
      targetReference: 'target',
      belowTargetConclusion: 'no-demand-conclusion',
    },
    status: 'proposed',
    evidenceClassification: 'no-data',
    evidencePaths: [
      {
        role: 'measurement-contract',
        path: 'sites/video-moment-search/measurement.ts',
      },
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
    ],
  },
  {
    rank: 7,
    id: 'paid-pilot-evidence',
    hypothesis: 'rights-safe-paid-pilot-signal',
    metric: 'paid pilot evidence',
    measures: ['paid pilot evidence'],
    baseline: {
      evidenceState: 'no-data',
      interpretation: 'unknown-or-blocked',
      blocker: 'paid-pilot-evidence',
    },
    target: {
      classification: 'approved-spec-gate',
      minimumCommitments: 1,
      days: 90,
    },
    stopRule: {
      action: 'stop',
      when: 'target-is-not-met-or-permissions-pricing-or-provenance-is-unresolved',
      targetReference: 'target',
      belowTargetConclusion: 'no-established-revenue',
    },
    status: 'proposed',
    evidenceClassification: 'no-data',
    evidencePaths: [
      {
        role: 'operator-procedure',
        path: 'docs/video-moment-search/operator-runbook.md',
      },
      {
        role: 'ranked-operator-ledger',
        path: 'docs/video-moment-search/experiment-ledger.json',
      },
    ],
  },
] as const;

export interface ExperimentLedgerValidation {
  readonly diagnostics: readonly string[];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function sameStrings(actual: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sameExactStructure(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => sameExactStructure(value, expected[index]))
    );
  }
  const expectedRecord = objectRecord(expected);
  if (expectedRecord !== undefined) {
    const actualRecord = objectRecord(actual);
    if (actualRecord === undefined) return false;
    const expectedKeys = Object.keys(expectedRecord);
    return (
      Object.keys(actualRecord).length === expectedKeys.length &&
      expectedKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(actualRecord, key) &&
          sameExactStructure(actualRecord[key], expectedRecord[key]),
      )
    );
  }
  return actual === expected;
}

function sameGate(
  actual: unknown,
  expected: Readonly<Record<string, string | number | boolean>>,
): boolean {
  const gate = objectRecord(actual);
  if (gate === undefined) return false;
  const expectedEntries = Object.entries(expected);
  return (
    Object.keys(gate).length === expectedEntries.length &&
    expectedEntries.every(([key, expectedValue]) => gate[key] === expectedValue)
  );
}

/** Validates the local operator ledger without accepting outcome claims. */
export function validateExperimentLedger(
  value: unknown,
): ExperimentLedgerValidation {
  const diagnostics: string[] = [];
  const ledger = objectRecord(value);
  if (ledger === undefined)
    return { diagnostics: ['ledger must be an object'] };
  const unsupportedLedgerKeys = Object.keys(ledger)
    .filter((key) => !allowedLedgerKeys.has(key))
    .sort();
  if (unsupportedLedgerKeys.length > 0) {
    diagnostics.push(
      `ledger has unsupported top-level key(s): ${unsupportedLedgerKeys.join(', ')}`,
    );
  }
  if (ledger.schemaVersion !== 1)
    diagnostics.push('schemaVersion must equal 1');
  if (ledger.siteId !== 'video-moment-search')
    diagnostics.push('siteId must identify video-moment-search');
  if (
    !sameExactStructure(ledger.historicalArtifact, expectedHistoricalArtifact)
  ) {
    diagnostics.push(
      'historicalArtifact must match the released artifact contract',
    );
  }
  if (ledger.measurementStatus !== 'not-configured') {
    diagnostics.push(
      'measurementStatus must be not-configured without an approved endpoint',
    );
  }
  if (!sameExactStructure(ledger.noDataState, expectedNoDataState)) {
    diagnostics.push('noDataState must match the no-data claim boundary');
  }

  const metrics = ledger.requiredMetrics;
  if (!sameStrings(metrics, requiredMetrics)) {
    diagnostics.push(
      'requiredMetrics must include every approved measurement metric',
    );
  }

  const personas = ledger.personas;
  if (
    !Array.isArray(personas) ||
    personas.length !== requiredPersonaIds.length
  ) {
    diagnostics.push('personas must contain the three supplied personas');
  } else {
    const personaIds = personas.map((persona) => objectRecord(persona)?.id);
    if (!requiredPersonaIds.every((id) => personaIds.includes(id))) {
      diagnostics.push(
        'personas must identify researcher, creator, and ld-lead',
      );
    }
    personas.forEach((persona, index) => {
      const record = objectRecord(persona);
      if (record === undefined) {
        diagnostics.push(`personas[${index}] must be an object`);
        return;
      }
      const unsupportedKeys = Object.keys(record)
        .filter((key) => !allowedPersonaKeys.has(key))
        .sort();
      if (unsupportedKeys.length > 0) {
        diagnostics.push(
          `personas[${index}] has unsupported persona key(s): ${unsupportedKeys.join(', ')}`,
        );
      }
      const expected = expectedPersonas.find(
        (candidate) => candidate.id === record.id,
      );
      if (expected !== undefined && !sameExactStructure(record, expected)) {
        diagnostics.push(
          `personas[${index}] must match the ${expected.id} persona contract`,
        );
      }
    });
  }

  const experiments = ledger.experiments;
  if (!Array.isArray(experiments) || experiments.length !== 7) {
    diagnostics.push(
      'experiments must contain the seven ranked 90-day experiments',
    );
    return { diagnostics };
  }
  experiments.forEach((experiment, index) => {
    const record = objectRecord(experiment);
    const prefix = `experiments[${index}]`;
    const expected = expectedExperiments[index]!;
    if (record === undefined) {
      diagnostics.push(`${prefix} must be an object`);
      return;
    }
    const unsupportedKeys = Object.keys(record)
      .filter((key) => !allowedExperimentKeys.has(key))
      .sort();
    if (unsupportedKeys.length > 0) {
      diagnostics.push(
        `${prefix} has unsupported experiment key(s): ${unsupportedKeys.join(', ')}`,
      );
    }
    if (record.rank !== expected.rank)
      diagnostics.push(`${prefix}.rank must preserve the ranked order`);
    if (record.id !== expected.id)
      diagnostics.push(
        `${prefix}.id must match the approved ranked experiment`,
      );
    if (record.metric !== expected.metric)
      diagnostics.push(
        `${prefix}.metric must match the approved primary measure`,
      );
    if (!sameStrings(record.measures, expected.measures)) {
      diagnostics.push(
        `${prefix}.measures must match the approved operating measures`,
      );
    }
    if (!sameGate(record.target, expected.target)) {
      diagnostics.push(`${prefix}.target must match the approved gate`);
    }
    if (record.hypothesis !== expected.hypothesis) {
      diagnostics.push(
        `${prefix}.hypothesis must match the approved operator hypothesis`,
      );
    }
    if (!sameExactStructure(record.baseline, expected.baseline)) {
      diagnostics.push(
        `${prefix}.baseline must match the approved evidence baseline`,
      );
    }
    if (!sameExactStructure(record.stopRule, expected.stopRule)) {
      diagnostics.push(`${prefix}.stopRule must match the approved stop rule`);
    }
    if (record.status !== expected.status) {
      diagnostics.push(`${prefix}.status must equal proposed`);
    }
    if (record.evidenceClassification !== expected.evidenceClassification) {
      diagnostics.push(
        `${prefix}.evidenceClassification must match the ranked evidence state`,
      );
    }
    if (!sameExactStructure(record.evidencePaths, expected.evidencePaths)) {
      diagnostics.push(
        `${prefix}.evidencePaths must match the approved evidence roles`,
      );
    }
  });
  return { diagnostics };
}
