export const STATIC_SIGNAL_BOUNDARY =
  'Static-risk flags are limited signals, not a security assessment.';

export type SourceBoundSkillReceipt = Readonly<{
  receipt: Readonly<{
    id: string;
    siteId: string;
    status: string;
    kind: string;
    evidenceClass: string;
  }>;
  source: Readonly<{
    sourceId: string;
    url: string;
    observedAt: string;
  }>;
  hashes: Readonly<{
    manifestSha256: string;
    rawSha256: string;
    normalizedSha256: string;
  }>;
  provenance: Readonly<Record<string, string>>;
  publicFacts: Readonly<{
    kind: string;
    packageId: string;
    declaredLicense: string;
    manifestPresent: boolean;
    declaredDependencies: readonly string[];
    contentsSha256: string;
    staticRiskFlags: readonly string[];
  }>;
}>;

export type SkillInventoryRecord = Readonly<{
  receiptId: string;
  receipt: SourceBoundSkillReceipt['receipt'];
  source: SourceBoundSkillReceipt['source'];
  hashes: SourceBoundSkillReceipt['hashes'];
  provenance: SourceBoundSkillReceipt['provenance'];
  declaredMetadata: Readonly<{
    packageId: string;
    sourceId: string;
    license: string;
    manifestPresent: boolean;
    dependencies: readonly string[];
    dependencyState: 'none' | 'declared';
    contentsSha256: string;
  }>;
  staticRiskFlags: readonly string[];
}>;

export type SkillInventoryFilters = Readonly<{
  query?: string;
  declaredLicense?: string;
  dependencyState?: 'none' | 'declared';
  staticSignalPresent?: boolean;
}>;

export const DECLARED_METADATA_FACET_BOUNDARY =
  'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.' as const;

export const SOURCE_BOUND_RECEIPT_QUALITY_BOUNDARY =
  'Field validation does not establish real provenance, safety, adoption, demand, or suitability.' as const;

export type SourceBoundSkillReceiptQualityIssue =
  | 'missing-receipt-id'
  | 'missing-source-id'
  | 'invalid-source-url'
  | 'invalid-observed-at'
  | 'missing-package-id'
  | 'missing-provenance'
  | 'invalid-manifest-sha256'
  | 'invalid-raw-sha256'
  | 'invalid-normalized-sha256'
  | 'invalid-contents-sha256';

export type SourceBoundSkillReceiptQualityAssessment =
  | Readonly<{
      kind: 'ready';
      issues: readonly [];
      boundary: typeof SOURCE_BOUND_RECEIPT_QUALITY_BOUNDARY;
    }>
  | Readonly<{
      kind: 'not-ready';
      issues: readonly SourceBoundSkillReceiptQualityIssue[];
      boundary: typeof SOURCE_BOUND_RECEIPT_QUALITY_BOUNDARY;
    }>;

export type DeclaredMetadataFacetSummaryRow = Readonly<{
  facet: 'declared-license' | 'dependency-state' | 'static-signal-presence';
  value: string;
  count: number;
  boundary: typeof DECLARED_METADATA_FACET_BOUNDARY;
}>;

export type SkillInventoryComparison =
  | Readonly<{ kind: 'ready'; records: readonly SkillInventoryRecord[] }>
  | Readonly<{
      kind: 'not-ready';
      reason: 'Select two distinct source-bound records to compare.';
    }>;

export const SKILL_INVENTORY_COMPARISON_BOUNDARY =
  'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.' as const;

export type SkillInventoryComparisonSummaryField = Readonly<{
  field:
    | 'source-id'
    | 'source-url'
    | 'manifest-sha256'
    | 'raw-sha256'
    | 'normalized-sha256'
    | 'contents-sha256'
    | 'declared-license'
    | 'dependency-state'
    | 'static-signal-presence';
  left: string;
  right: string;
  status: 'same' | 'different';
  boundary: typeof SKILL_INVENTORY_COMPARISON_BOUNDARY;
}>;

export type SkillInventoryComparisonSummary =
  | Readonly<{
      kind: 'ready';
      fields: readonly SkillInventoryComparisonSummaryField[];
    }>
  | Readonly<{
      kind: 'not-ready';
      reason: 'Select two distinct source-bound records to compare.';
    }>;

export type SyntheticOfferEvent = Readonly<{
  offerId: 'watchlist' | 'team-inventory';
  action: 'viewed' | 'selected';
  evidenceClass: 'synthetic-only';
  identityCaptured: false;
  persisted: false;
}>;

export const SYNTHETIC_OFFER_EVENT_INTERPRETATION_BOUNDARY =
  'Synthetic event counts are not real demand, adoption, conversion, revenue, or willingness-to-pay evidence.';

export type SyntheticOfferEventSummary = Readonly<{
  offerId: SyntheticOfferEvent['offerId'];
  viewed: number;
  selected: number;
  evidenceClass: 'synthetic-only';
  identityCaptured: false;
  persisted: false;
  interpretationBoundary: typeof SYNTHETIC_OFFER_EVENT_INTERPRETATION_BOUNDARY;
}>;

function isAcceptedSkillLedgerReceipt(
  receipt: SourceBoundSkillReceipt,
): boolean {
  return (
    receipt.receipt.siteId === 'skill-ledger' &&
    receipt.receipt.status === 'PASS' &&
    receipt.receipt.kind === 'skill-inventory' &&
    receipt.publicFacts.kind === 'skill-inventory'
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function isStrictIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function assessSourceBoundSkillReceiptQuality(
  receipt: SourceBoundSkillReceipt,
): SourceBoundSkillReceiptQualityAssessment {
  const issues: SourceBoundSkillReceiptQualityIssue[] = [];

  if (receipt.receipt.id.trim() === '') issues.push('missing-receipt-id');
  if (receipt.source.sourceId.trim() === '') issues.push('missing-source-id');
  if (!isHttpsUrl(receipt.source.url)) issues.push('invalid-source-url');
  if (!isStrictIsoUtcTimestamp(receipt.source.observedAt)) {
    issues.push('invalid-observed-at');
  }
  if (receipt.publicFacts.packageId.trim() === '') {
    issues.push('missing-package-id');
  }
  if (Object.keys(receipt.provenance).length === 0) {
    issues.push('missing-provenance');
  }
  if (!isSha256(receipt.hashes.manifestSha256)) {
    issues.push('invalid-manifest-sha256');
  }
  if (!isSha256(receipt.hashes.rawSha256)) issues.push('invalid-raw-sha256');
  if (!isSha256(receipt.hashes.normalizedSha256)) {
    issues.push('invalid-normalized-sha256');
  }
  if (!isSha256(receipt.publicFacts.contentsSha256)) {
    issues.push('invalid-contents-sha256');
  }

  if (issues.length === 0) {
    return {
      kind: 'ready',
      issues: [],
      boundary: SOURCE_BOUND_RECEIPT_QUALITY_BOUNDARY,
    };
  }

  return {
    kind: 'not-ready',
    issues,
    boundary: SOURCE_BOUND_RECEIPT_QUALITY_BOUNDARY,
  };
}

export function sourceBoundSkillInventory(
  receipts: readonly SourceBoundSkillReceipt[],
): readonly SkillInventoryRecord[] {
  return receipts
    .filter(
      (receipt) =>
        isAcceptedSkillLedgerReceipt(receipt) &&
        assessSourceBoundSkillReceiptQuality(receipt).kind === 'ready',
    )
    .map((receipt) => ({
      receiptId: receipt.receipt.id,
      receipt: receipt.receipt,
      source: receipt.source,
      hashes: receipt.hashes,
      provenance: receipt.provenance,
      declaredMetadata: {
        packageId: receipt.publicFacts.packageId,
        sourceId: receipt.source.sourceId,
        license: receipt.publicFacts.declaredLicense,
        manifestPresent: receipt.publicFacts.manifestPresent,
        dependencies: receipt.publicFacts.declaredDependencies,
        dependencyState:
          receipt.publicFacts.declaredDependencies.length === 0
            ? 'none'
            : 'declared',
        contentsSha256: receipt.publicFacts.contentsSha256,
      },
      staticRiskFlags: receipt.publicFacts.staticRiskFlags,
    }));
}

export function filterSkillInventory(
  records: readonly SkillInventoryRecord[],
  filters: SkillInventoryFilters,
): readonly SkillInventoryRecord[] {
  const query = filters.query?.toLowerCase();

  return records.filter((record) => {
    const matchesQuery =
      query === undefined ||
      record.declaredMetadata.packageId.toLowerCase().includes(query) ||
      record.declaredMetadata.sourceId.toLowerCase().includes(query);
    const matchesLicense =
      filters.declaredLicense === undefined ||
      record.declaredMetadata.license === filters.declaredLicense;
    const matchesDependencyState =
      filters.dependencyState === undefined ||
      record.declaredMetadata.dependencyState === filters.dependencyState;
    const matchesStaticSignal =
      filters.staticSignalPresent === undefined ||
      record.staticRiskFlags.length > 0 === filters.staticSignalPresent;

    return (
      matchesQuery &&
      matchesLicense &&
      matchesDependencyState &&
      matchesStaticSignal
    );
  });
}

export function declaredMetadataFacetSummary(
  records: readonly SkillInventoryRecord[],
): readonly DeclaredMetadataFacetSummaryRow[] {
  const count = (matches: (record: SkillInventoryRecord) => boolean) =>
    records.filter(matches).length;
  const licenses = [
    ...new Set(records.map((record) => record.declaredMetadata.license)),
  ]
    .sort()
    .map((license) => ({
      facet: 'declared-license' as const,
      value: license,
      count: count((record) => record.declaredMetadata.license === license),
      boundary: DECLARED_METADATA_FACET_BOUNDARY,
    }));

  return [
    ...licenses,
    ...(['none', 'declared'] as const).map((dependencyState) => ({
      facet: 'dependency-state' as const,
      value: dependencyState,
      count: count(
        (record) => record.declaredMetadata.dependencyState === dependencyState,
      ),
      boundary: DECLARED_METADATA_FACET_BOUNDARY,
    })),
    ...(
      [
        ['no-static-signals', false],
        ['static-signals-present', true],
      ] as const
    ).map(([value, hasStaticSignals]) => ({
      facet: 'static-signal-presence' as const,
      value,
      count: count(
        (record) => record.staticRiskFlags.length > 0 === hasStaticSignals,
      ),
      boundary: DECLARED_METADATA_FACET_BOUNDARY,
    })),
  ];
}

export function compareSkillInventory(
  records: readonly SkillInventoryRecord[],
  receiptIds: readonly string[],
): SkillInventoryComparison {
  if (receiptIds.length !== 2 || new Set(receiptIds).size !== 2) {
    return {
      kind: 'not-ready',
      reason: 'Select two distinct source-bound records to compare.',
    };
  }

  const selectedRecords = receiptIds
    .map((receiptId) =>
      records.find((record) => record.receiptId === receiptId),
    )
    .filter((record): record is SkillInventoryRecord => record !== undefined);

  if (selectedRecords.length !== 2) {
    return {
      kind: 'not-ready',
      reason: 'Select two distinct source-bound records to compare.',
    };
  }

  return { kind: 'ready', records: selectedRecords };
}

export function summarizeSkillInventoryComparison(
  comparison: SkillInventoryComparison,
): SkillInventoryComparisonSummary {
  if (comparison.kind === 'not-ready') {
    return comparison;
  }

  const [leftRecord, rightRecord] = comparison.records;
  const staticSignalPresence = (record: SkillInventoryRecord) =>
    record.staticRiskFlags.length === 0
      ? 'no-static-signals'
      : 'static-signals-present';
  const fields = [
    ['source-id', leftRecord.source.sourceId, rightRecord.source.sourceId],
    ['source-url', leftRecord.source.url, rightRecord.source.url],
    [
      'manifest-sha256',
      leftRecord.hashes.manifestSha256,
      rightRecord.hashes.manifestSha256,
    ],
    ['raw-sha256', leftRecord.hashes.rawSha256, rightRecord.hashes.rawSha256],
    [
      'normalized-sha256',
      leftRecord.hashes.normalizedSha256,
      rightRecord.hashes.normalizedSha256,
    ],
    [
      'contents-sha256',
      leftRecord.declaredMetadata.contentsSha256,
      rightRecord.declaredMetadata.contentsSha256,
    ],
    [
      'declared-license',
      leftRecord.declaredMetadata.license,
      rightRecord.declaredMetadata.license,
    ],
    [
      'dependency-state',
      leftRecord.declaredMetadata.dependencyState,
      rightRecord.declaredMetadata.dependencyState,
    ],
    [
      'static-signal-presence',
      staticSignalPresence(leftRecord),
      staticSignalPresence(rightRecord),
    ],
  ] as const;

  return {
    kind: 'ready',
    fields: fields.map(([field, left, right]) => ({
      field,
      left,
      right,
      status: left === right ? 'same' : 'different',
      boundary: SKILL_INVENTORY_COMPARISON_BOUNDARY,
    })),
  };
}

export function recordSyntheticOfferEvent(
  offerId: 'watchlist' | 'team-inventory',
  action: 'viewed' | 'selected',
): SyntheticOfferEvent {
  return {
    offerId,
    action,
    evidenceClass: 'synthetic-only',
    identityCaptured: false,
    persisted: false,
  };
}

export function summarizeSyntheticOfferEvents(
  events: readonly SyntheticOfferEvent[],
): readonly SyntheticOfferEventSummary[] {
  return (['watchlist', 'team-inventory'] as const).map((offerId) => ({
    offerId,
    viewed: events.filter(
      (event) => event.offerId === offerId && event.action === 'viewed',
    ).length,
    selected: events.filter(
      (event) => event.offerId === offerId && event.action === 'selected',
    ).length,
    evidenceClass: 'synthetic-only',
    identityCaptured: false,
    persisted: false,
    interpretationBoundary: SYNTHETIC_OFFER_EVENT_INTERPRETATION_BOUNDARY,
  }));
}
