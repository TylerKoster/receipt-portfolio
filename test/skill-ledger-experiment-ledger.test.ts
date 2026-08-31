import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SyntheticUsabilityLedger {
  evidenceClass: string;
  experimentPortfolio: Array<{
    area: string;
    rank: number;
    experiment: string;
    status: string;
    metric: string;
    target: string;
    stopRule: string;
  }>;
  experimentHistory: Array<{
    experiment: string;
    status: string;
    boundary: string;
  }>;
  rejectedCandidates: Array<{
    experiment: string;
    status: string;
    candidate: string;
    reason: string;
  }>;
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
  it('keeps the exact seven-area ranked portfolio and completed experiment history', () => {
    const ledgerPath = resolve(
      process.cwd(),
      'docs/skill-ledger/experiments/2026-08-30-synthetic-usability.json',
    );
    const ledger = JSON.parse(
      readFileSync(ledgerPath, 'utf8'),
    ) as SyntheticUsabilityLedger;

    expect(ledger.experimentPortfolio).toEqual([
      {
        area: 'searchable-filterable-discovery',
        rank: 1,
        experiment: 'public-source-bound-inventory-v1',
        status: 'active',
        metric: 'controlled public adapter utility contract',
        target:
          'A controlled two-record adapter supports search, declared filters, count, empty, loading, error, reset, selection, and exactly-two comparison without network or persistence.',
        stopRule:
          'Controlled adapter interaction does not establish real users, demand, conversion, revenue, provenance, currentness, safety, adoption, or public deployment.',
      },
      {
        area: 'current-original-guides',
        rank: 2,
        experiment: 'controlled-guide-draft-admission-contract',
        status: 'completed-internal',
        metric: 'controlled guide draft admission coverage',
        target:
          'Each controlled guide draft requires nonempty guide/source bindings and a quality-gated source receipt.',
        stopRule:
          'Guide draft admission does not establish currentness, original authorship, real provenance, safety, adoption, demand, suitability, or public UI readiness.',
      },
      {
        area: 'source-bound-comparison',
        rank: 3,
        experiment: 'controlled-comparison-field-differences',
        status: 'completed-internal',
        metric: 'controlled comparison field-difference coverage',
        target:
          'Exactly two quality-gated controlled records produce deterministic source, hash, declared-metadata, and static-signal-presence differences.',
        stopRule:
          'Field differences do not establish real provenance, safety, adoption, demand, suitability, or public UI readiness.',
      },
      {
        area: 'discoverability',
        rank: 4,
        experiment: 'public-discoverability-evaluation',
        status: 'blocked',
        metric: 'public discovery evidence',
        target: 'Requires authorized public UI and real provenance.',
        stopRule:
          'Blocked without public UI, real provenance, and authority; no adoption, revenue, demand, or safety claim.',
      },
      {
        area: 'measurement',
        rank: 5,
        experiment: 'internal-controlled-measurement',
        status: 'completed-internal',
        metric: 'synthetic event accounting',
        target:
          'Controlled synthetic event counts remain non-persistent and identity-free.',
        stopRule:
          'Internal synthetic measurement is not evidence of adoption, revenue, demand, or safety.',
      },
      {
        area: 'conversion',
        rank: 6,
        experiment: 'real-user-conversion-evaluation',
        status: 'not-started',
        metric: 'authorized real-user conversion evidence',
        target: 'Requires actual users, public UI, and authority.',
        stopRule:
          'Not started without actual users, public UI, and authority; no adoption, revenue, demand, or safety claim.',
      },
      {
        area: 'monetization',
        rank: 7,
        experiment: 'authorized-monetization-evaluation',
        status: 'not-started',
        metric: 'authorized payment evidence',
        target:
          'Requires actual users, pricing authority, and payment capability.',
        stopRule:
          'Not started without actual users and authority; no adoption, revenue, demand, or safety claim.',
      },
    ]);
    expect(ledger.experimentHistory).toEqual([
      {
        experiment: 'declared-metadata-taxonomy-facets',
        status: 'completed-internal',
        boundary:
          'Declared metadata taxonomy facets remain controlled-record-only and do not establish safety, adoption, demand, or provenance.',
      },
      {
        experiment: 'source-bound-record-quality-gate',
        status: 'completed-internal',
        boundary:
          'Field validation does not establish real provenance, safety, adoption, demand, or public UI readiness.',
      },
      {
        experiment: 'controlled-comparison-field-differences',
        status: 'completed-internal',
        boundary:
          'Field differences do not establish real provenance, safety, adoption, demand, suitability, or public UI readiness.',
      },
      {
        experiment: 'controlled-guide-draft-admission-contract',
        status: 'completed-internal',
        boundary:
          'Guide draft admission does not establish currentness, original authorship, real provenance, safety, adoption, demand, suitability, or public UI readiness.',
      },
    ]);
    expect(ledger.rejectedCandidates).toEqual([
      {
        experiment: 'controlled-guide-draft-admission-measurement',
        status: 'killed-superseded',
        candidate: '6830f757a9dee1b81861e2653e4389a2fe50149f',
        reason: 'It had no delivered public/user/monetization utility.',
      },
    ]);
  });

  it('preserves the supplied synthetic-only baseline and its evidence boundary', () => {
    const ledgerPath = resolve(
      process.cwd(),
      'docs/skill-ledger/experiments/2026-08-30-synthetic-usability.json',
    );
    const ledger = JSON.parse(
      readFileSync(ledgerPath, 'utf8'),
    ) as SyntheticUsabilityLedger;

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
        finding:
          'Partially understood the boundary but could not decide adoption.',
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
        scope:
          'Inspect static-risk signals without treating them as safety conclusions.',
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
