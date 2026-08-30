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
  personas: Array<{
    id: string;
    outcome: string;
    task: string;
    finding: string;
  }>;
  tasks: Array<{ id: string; scope: string; status: string }>;
  offerMeasurement: {
    syntheticOnly: boolean;
    offers: Array<{
      id: string;
      events: string[];
      baselineSelections: number;
    }>;
    identityCaptured: boolean;
    persistence: boolean;
    trackingImplemented: boolean;
  };
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
    expect(ledger.personas).toEqual([
      {
        id: 'platform-lead',
        outcome: 'failed',
        task: 'Find, filter, and compare source-bound skill records.',
        finding: 'Could not find, filter, or compare skills.',
      },
      {
        id: 'security-reviewer',
        outcome: 'partial',
        task: 'Interpret static-risk signals without treating them as safety conclusions.',
        finding: 'Partially understood the boundary but could not decide adoption.',
      },
      {
        id: 'automation-consultant',
        outcome: 'partial',
        task: 'Inspect integrity hashes and assess a watchlist or team-inventory offer.',
        finding: 'Partially inspected hashes; example.invalid was unreachable.',
      },
    ]);
    expect(ledger.tasks).toEqual([
      {
        id: 'search-filter-compare',
        scope: 'Search, filter, and compare source-bound skill records.',
        status: 'not-completed',
      },
      {
        id: 'static-boundary-inspection',
        scope: 'Inspect static-risk signals without treating them as safety conclusions.',
        status: 'partial',
      },
      {
        id: 'hash-provenance-inspection',
        scope: 'Inspect integrity hashes and provenance boundaries.',
        status: 'partial',
      },
      {
        id: 'synthetic-offer-evaluation',
        scope: 'Evaluate synthetic-only watchlist and team-inventory offers.',
        status: 'partial',
      },
    ]);
    expect(ledger.offerMeasurement.syntheticOnly).toBe(true);
    expect(ledger.offerMeasurement.offers).toEqual([
      {
        id: 'watchlist',
        events: ['viewed', 'selected'],
        baselineSelections: 0,
      },
      {
        id: 'team-inventory',
        events: ['viewed', 'selected'],
        baselineSelections: 0,
      },
    ]);
    expect(ledger.offerMeasurement.identityCaptured).toBe(false);
    expect(ledger.offerMeasurement.persistence).toBe(false);
    expect(ledger.offerMeasurement.trackingImplemented).toBe(false);
    expect(ledger.limits).toContain(
      'No real demand, adoption, safety, revenue, or willingness-to-pay conclusion is established.',
    );
  });
});
