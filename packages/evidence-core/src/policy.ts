export type GateDecision = 'PASS' | 'REVIEW_REQUIRED' | 'REJECTED';

export interface GateResult {
  readonly decision: GateDecision;
  readonly reasonCodes: readonly string[];
}

export interface Candidate {
  readonly manifestValid: boolean;
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

  if (candidate.ambiguous || candidate.diffRatio > 0.6) {
    return {
      decision: 'REVIEW_REQUIRED',
      reasonCodes: ['AMBIGUOUS_OR_LARGE_CHANGE'],
    };
  }

  return { decision: 'PASS', reasonCodes: ['SOURCE_FACTS_ONLY'] };
}
