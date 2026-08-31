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
  readonly eventType: MeasurementEventType;
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

function safeTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.toISOString() === value)
      return value;
  }
  return new Date().toISOString();
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
  payload: Record<string, unknown> = {},
): MeasurementEvent {
  const event: Record<string, string | number> = {
    schemaVersion: 1,
    eventType,
    occurredAt: safeTimestamp(payload.occurredAt),
  };
  for (const field of [...commonFields, ...fieldsByEventType[eventType]]) {
    if (field === 'occurredAt') continue;
    const value = allowedValue(field, payload[field]);
    if (value !== undefined) event[field] = value;
  }
  return event as unknown as MeasurementEvent;
}

/**
 * No endpoint is approved for this slice. Delivery is deliberately local and
 * reports a discard rather than storing or transmitting the event.
 */
export function deliverMeasurementEvent(
  event: MeasurementEvent,
): MeasurementDelivery {
  return {
    measurementStatus: 'not-configured',
    disposition: 'discarded',
    eventType: event.eventType,
  };
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
const allowedEvidenceClassifications = new Set([
  'heuristic-preview-gate',
  'not-yet-testable',
  'no-data',
]);
const allowedTestability = new Set([
  'preview-testable-heuristic',
  'not-yet-testable',
]);

export interface ExperimentLedgerValidation {
  readonly diagnostics: readonly string[];
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Validates the local operator ledger without accepting outcome claims. */
export function validateExperimentLedger(
  value: unknown,
): ExperimentLedgerValidation {
  const diagnostics: string[] = [];
  const ledger = objectRecord(value);
  if (ledger === undefined)
    return { diagnostics: ['ledger must be an object'] };
  if (ledger.schemaVersion !== 1)
    diagnostics.push('schemaVersion must equal 1');
  if (ledger.siteId !== 'video-moment-search')
    diagnostics.push('siteId must identify video-moment-search');
  if (!nonBlank(ledger.relationshipToReleasedHistoricalArtifact)) {
    diagnostics.push('relationshipToReleasedHistoricalArtifact is required');
  }
  if (ledger.measurementStatus !== 'not-configured') {
    diagnostics.push(
      'measurementStatus must be not-configured without an approved endpoint',
    );
  }

  const metrics = ledger.requiredMetrics;
  if (
    !Array.isArray(metrics) ||
    metrics.length !== requiredMetrics.length ||
    !requiredMetrics.every((metric) => metrics.includes(metric))
  ) {
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
      if (
        record === undefined ||
        !allowedTestability.has(String(record.testability))
      ) {
        diagnostics.push(
          `personas[${index}].testability must be a bounded heuristic or not-yet-testable state`,
        );
      }
      if (record === undefined || !nonBlank(record.description)) {
        diagnostics.push(`personas[${index}].description is required`);
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
  const expectedRanks = experiments.map((_, index) => index + 1);
  experiments.forEach((experiment, index) => {
    const record = objectRecord(experiment);
    const prefix = `experiments[${index}]`;
    if (record === undefined) {
      diagnostics.push(`${prefix} must be an object`);
      return;
    }
    if (record.rank !== expectedRanks[index])
      diagnostics.push(`${prefix}.rank must preserve the ranked order`);
    for (const field of [
      'id',
      'hypothesis',
      'metric',
      'baseline',
      'target',
      'stopRule',
      'status',
    ] as const) {
      if (!nonBlank(record[field]))
        diagnostics.push(`${prefix}.${field} is required`);
    }
    if (nonBlank(record.target) && !/\d/u.test(record.target)) {
      diagnostics.push(`${prefix}.target must be numerically measurable`);
    }
    if (
      !Array.isArray(record.evidencePaths) ||
      record.evidencePaths.length === 0 ||
      !record.evidencePaths.every(nonBlank)
    ) {
      diagnostics.push(
        `${prefix}.evidencePaths must name supporting local evidence`,
      );
    }
    if (
      !allowedEvidenceClassifications.has(String(record.evidenceClassification))
    ) {
      diagnostics.push(
        `${prefix}.evidenceClassification must state its bounded evidence status`,
      );
    }
  });
  return { diagnostics };
}
