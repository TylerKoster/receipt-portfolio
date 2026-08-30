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

export type SkillInventoryComparison =
  | Readonly<{ kind: 'ready'; records: readonly SkillInventoryRecord[] }>
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

export function sourceBoundSkillInventory(
  receipts: readonly SourceBoundSkillReceipt[],
): readonly SkillInventoryRecord[] {
  return receipts.filter(isAcceptedSkillLedgerReceipt).map((receipt) => ({
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
