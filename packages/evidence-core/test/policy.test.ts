import { describe, expect, it } from 'vitest';
import { evaluatePublication, type Candidate } from '../src/index.js';

const completeCandidate: Candidate = {
  manifestValid: true,
  rawSha256: '1'.repeat(64),
  normalizedSha256: '2'.repeat(64),
  ambiguous: false,
  diffRatio: 0.1,
};

describe('publication policy', () => {
  it('holds an ambiguous source change instead of publishing it', () => {
    const ambiguousCandidate: Candidate = {
      ...completeCandidate,
      ambiguous: true,
    };

    expect(evaluatePublication(ambiguousCandidate).decision).toBe(
      'REVIEW_REQUIRED',
    );
  });

  it.each(['rawSha256', 'normalizedSha256'] as const)(
    'rejects evidence missing %s',
    (missingHash) => {
      const candidate = { ...completeCandidate };
      delete candidate[missingHash];

      expect(evaluatePublication(candidate)).toEqual({
        decision: 'REJECTED',
        reasonCodes: ['INCOMPLETE_EVIDENCE'],
      });
    },
  );

  it('rejects evidence with an invalid manifest', () => {
    expect(
      evaluatePublication({ ...completeCandidate, manifestValid: false }),
    ).toEqual({
      decision: 'REJECTED',
      reasonCodes: ['INCOMPLETE_EVIDENCE'],
    });
  });

  it('holds a diff larger than sixty percent', () => {
    expect(
      evaluatePublication({ ...completeCandidate, diffRatio: 0.61 }),
    ).toEqual({
      decision: 'REVIEW_REQUIRED',
      reasonCodes: ['AMBIGUOUS_OR_LARGE_CHANGE'],
    });
  });

  it('passes complete, unambiguous source facts', () => {
    expect(evaluatePublication(completeCandidate)).toEqual({
      decision: 'PASS',
      reasonCodes: ['SOURCE_FACTS_ONLY'],
    });
  });

  it('passes a diff at the sixty-percent boundary', () => {
    expect(
      evaluatePublication({ ...completeCandidate, diffRatio: 0.6 }),
    ).toEqual({
      decision: 'PASS',
      reasonCodes: ['SOURCE_FACTS_ONLY'],
    });
  });
});
