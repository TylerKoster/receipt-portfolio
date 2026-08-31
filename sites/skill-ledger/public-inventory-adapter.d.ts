export interface ControlledPublicSkillLedgerRecord {
  readonly receiptId: string;
  readonly evidenceClass: 'controlled-only';
  readonly source: {
    readonly sourceId: string;
    readonly url: string;
    readonly observedAt: string;
  };
  readonly hashes: {
    readonly manifestSha256: string;
    readonly rawSha256: string;
    readonly normalizedSha256: string;
  };
  readonly declaredMetadata: {
    readonly packageId: string;
    readonly license: string;
    readonly manifestPresent: boolean;
    readonly dependencies: readonly string[];
    readonly contentsSha256: string;
  };
  readonly staticSignals: readonly string[];
}

export interface SourceBoundPublicSkillLedgerRecord {
  readonly receiptId: string;
  readonly evidenceClass: 'source-bound-observation';
  readonly source: {
    readonly sourceId: string;
    readonly url: string;
    readonly observedAt: string;
    readonly publisher: string;
    readonly repository: string;
    readonly commit: string;
    readonly path: string;
  };
  readonly hashes: {
    readonly manifestSha256: string;
    readonly rawSha256: string;
    readonly normalizedSha256: string;
  };
  readonly declaredMetadata: {
    readonly packageId: string;
    readonly description: string;
    readonly license: string;
    readonly contentsSha256: string;
  };
  readonly inheritedLicense: {
    readonly url: string;
    readonly sha256: string;
  };
  readonly coverage: {
    readonly manifest: 'not-assessed';
    readonly dependencies: 'not-assessed';
    readonly staticSignals: 'not-assessed';
    readonly instructionBody: 'not-published-or-executed';
  };
  readonly boundary: string;
}

export type PublicSkillLedgerRecord =
  ControlledPublicSkillLedgerRecord | SourceBoundPublicSkillLedgerRecord;

export interface PublicSkillLedgerFilters {
  readonly query: string;
  readonly declaredLicense: string;
  readonly evidenceClass: '' | 'source-bound-observation' | 'controlled-only';
  readonly dependencyState: '' | 'none' | 'declared';
  readonly staticSignalPresence: '' | 'absent' | 'present';
}

export interface PublicSkillLedgerFilterOverrides {
  readonly query?: string;
  readonly declaredLicense?: string;
  readonly evidenceClass?: string;
  readonly dependencyState?: string;
  readonly staticSignalPresence?: string;
}

export type PublicSkillLedgerComparison =
  | Readonly<{
      kind: 'ready';
      records: readonly [PublicSkillLedgerRecord, PublicSkillLedgerRecord];
    }>
  | Readonly<{
      kind: 'not-ready';
      reason: string;
    }>;

export interface PublicSkillLedgerInventoryOptions {
  readonly phase?: 'loading' | 'ready' | 'error';
  readonly filters?: PublicSkillLedgerFilterOverrides;
  readonly selectedReceiptIds?: readonly string[];
  readonly errorMessage?: string;
}

export interface PublicSkillLedgerInventoryState {
  readonly phase: 'loading' | 'ready' | 'error';
  readonly filters: PublicSkillLedgerFilters;
  readonly selectedReceiptIds: readonly string[];
  readonly visibleRecords: readonly PublicSkillLedgerRecord[];
  readonly count: number;
  readonly total: number;
  readonly empty: boolean;
  readonly statusMessage: string;
  readonly sourceBoundComparisonReadinessMessage: string;
  readonly errorMessage: string;
  readonly comparison: PublicSkillLedgerComparison;
}

export interface PublicSkillLedgerSelectionResult {
  readonly selectedReceiptIds: readonly string[];
  readonly errorMessage: string;
}

export type PublicSkillLedgerRoot = HTMLElement;

export const PUBLIC_SKILL_LEDGER_BOUNDARY: string;
export const PUBLIC_SKILL_LEDGER_SELECTION_ERROR: string;
export const CONTROLLED_PUBLIC_SKILL_RECORDS: readonly PublicSkillLedgerRecord[];

export function createPublicSkillLedgerFilters(
  overrides?: PublicSkillLedgerFilterOverrides,
): PublicSkillLedgerFilters;

export function filterPublicSkillLedgerRecords(
  records: readonly PublicSkillLedgerRecord[],
  filters: PublicSkillLedgerFilterOverrides,
): PublicSkillLedgerRecord[];

export function createPublicSkillLedgerComparison(
  records: readonly PublicSkillLedgerRecord[],
  receiptIds: readonly string[],
): PublicSkillLedgerComparison;

export function createPublicSkillLedgerInventoryState(
  records: readonly PublicSkillLedgerRecord[],
  options?: PublicSkillLedgerInventoryOptions,
): PublicSkillLedgerInventoryState;

export function updatePublicSkillLedgerSelection(
  selectedReceiptIds: readonly string[],
  receiptId: string,
  selected: boolean,
): PublicSkillLedgerSelectionResult;

export function initializePublicSkillLedgerInventory(
  root: PublicSkillLedgerRoot,
  records?: readonly PublicSkillLedgerRecord[],
): boolean;
