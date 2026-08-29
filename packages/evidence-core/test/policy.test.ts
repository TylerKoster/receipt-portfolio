import { describe, expect, it } from 'vitest';
import { evaluatePublication, type Candidate } from '../src/index.js';

const completeCandidate: Candidate = {
  manifestValid: true,
  enabled: true,
  publicationMode: 'auto-facts-only',
  evidenceClass: 'live-source',
  rawSha256: '1'.repeat(64),
  normalizedSha256: '2'.repeat(64),
  ambiguous: false,
  diffRatio: 0.1,
};

describe('publication policy', () => {
  it('rejects disabled and hold-only production manifests before policy can pass', () => {
    expect(
      evaluatePublication({
        ...completeCandidate,
        enabled: false,
        publicationMode: 'auto-facts-only',
        evidenceClass: 'live-source',
      } as unknown as Candidate),
    ).toEqual({ decision: 'REJECTED', reasonCodes: ['SOURCE_DISABLED'] });

    expect(
      evaluatePublication({
        ...completeCandidate,
        enabled: true,
        publicationMode: 'hold-only',
        evidenceClass: 'live-source',
      } as unknown as Candidate),
    ).toEqual({
      decision: 'REVIEW_REQUIRED',
      reasonCodes: ['PUBLICATION_HOLD'],
    });
  });

  it('admits only an enabled authenticated controlled example through fixture-example mode', () => {
    expect(
      evaluatePublication({
        ...completeCandidate,
        enabled: true,
        publicationMode: 'fixture-example',
        evidenceClass: 'controlled-example',
      } as unknown as Candidate),
    ).toEqual({
      decision: 'PASS',
      reasonCodes: ['CONTROLLED_FIXTURE_EXAMPLE'],
    });
  });

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
