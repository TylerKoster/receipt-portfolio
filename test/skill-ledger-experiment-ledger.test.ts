import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SyntheticUsabilityLedger {
  evidenceClass: string;
  baseline: {
    fullCompletion: number;
    partialCompletion: number;
    returnIntent: number;
    willingnessToPay: number;
  };
  personas: Array<{ id: string }>;
  offerMeasurement: { syntheticOnly: boolean };
  limits: string[];
}

describe('SkillLedger synthetic usability ledger', () => {
  it('preserves the supplied synthetic-only baseline and its evidence boundary', () => {
    const ledgerPath = resolve(
      process.cwd(),
      'docs/skill-ledger/experiments/2026-08-30-synthetic-usability.json',
    );
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as SyntheticUsabilityLedger;

    expect(ledger.evidenceClass).toBe('synthetic-heuristic-usability');
    expect(ledger.baseline).toEqual({
      fullCompletion: 0,
      partialCompletion: 2,
      returnIntent: 0,
      willingnessToPay: 0,
    });
    expect(ledger.personas.map((persona) => persona.id)).toEqual([
      'platform-lead',
      'security-reviewer',
      'automation-consultant',
    ]);
    expect(ledger.offerMeasurement.syntheticOnly).toBe(true);
    expect(ledger.limits).toContain(
      'No real demand, adoption, safety, revenue, or willingness-to-pay conclusion is established.',
    );
  });
});
