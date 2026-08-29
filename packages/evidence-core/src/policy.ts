import type { SourceManifest } from './manifest.js';

export type GateDecision = 'PASS' | 'REVIEW_REQUIRED' | 'REJECTED';
export type EvidenceClass = 'live-source' | 'controlled-example';

export interface GateResult {
  readonly decision: GateDecision;
  readonly reasonCodes: readonly string[];
}

export interface Candidate {
  readonly manifestValid: boolean;
  readonly enabled: boolean;
  readonly publicationMode: SourceManifest['publicationMode'];
  readonly evidenceClass: EvidenceClass;
  readonly rawSha256?: string;
  readonly normalizedSha256?: string;
  readonly ambiguous: boolean;
  readonly diffRatio: number;
}

export function evaluatePublication(candidate: Candidate): GateResult {
  if (
    !candidate.manifestValid ||
    !candidate.rawSha256 ||
    !candidate.normalizedSha256
  ) {
    return { decision: 'REJECTED', reasonCodes: ['INCOMPLETE_EVIDENCE'] };
  }
  if (!candidate.enabled) {
    return { decision: 'REJECTED', reasonCodes: ['SOURCE_DISABLED'] };
  }
  if (candidate.publicationMode === 'hold-only') {
    return {
      decision: 'REVIEW_REQUIRED',
      reasonCodes: ['PUBLICATION_HOLD'],
    };
  }
  if (candidate.ambiguous || candidate.diffRatio > 0.6) {
    return {
      decision: 'REVIEW_REQUIRED',
      reasonCodes: ['AMBIGUOUS_OR_LARGE_CHANGE'],
    };
  }
  if (candidate.publicationMode === 'fixture-example') {
    return candidate.evidenceClass === 'controlled-example'
      ? { decision: 'PASS', reasonCodes: ['CONTROLLED_FIXTURE_EXAMPLE'] }
      : { decision: 'REJECTED', reasonCodes: ['PROVENANCE_MODE_MISMATCH'] };
  }
  if (candidate.evidenceClass !== 'live-source') {
    return {
      decision: 'REJECTED',
      reasonCodes: ['PROVENANCE_MODE_MISMATCH'],
    };
  }
  return { decision: 'PASS', reasonCodes: ['SOURCE_FACTS_ONLY'] };
}
