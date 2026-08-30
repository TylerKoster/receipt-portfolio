import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);

describe('Search Receipt product experiment ledger', () => {
  it('preserves synthetic usability evidence and the ranked retrieval-filter-offer experiment', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.evidenceClassification).toEqual({
      kind: 'SYNTHETIC_HEURISTIC_USABILITY_EVIDENCE',
      limitations: expect.arrayContaining([
        'Not real users, demand, traffic, revenue, willingness-to-pay, or source truth.',
      ]),
    });
    expect(ledger.syntheticUsabilityPacket.personas).toEqual([
      {
        persona: 'agency SEO operator',
        task: 'Determine whether a current Google incident explained volatility.',
        outcome:
          'Unable to decide whether a current Google incident explained volatility.',
      },
      {
        persona: 'governance analyst',
        task: 'Inspect integrity and correction information.',
        outcome: 'Completed only the integrity/correction inspection.',
      },
      {
        persona: 'independent publisher',
        task: 'Search, filter, and subscribe.',
        outcome: 'Unable to search, filter, or subscribe.',
      },
    ]);
    expect(ledger.syntheticUsabilityPacket.outcomes).toEqual({
      completion: '1/3',
      returnIntent: '0/3',
      willingnessToPay: '0/3',
    });
    expect(ledger.syntheticUsabilityPacket.p0Findings).toEqual(
      expect.arrayContaining([
        'All public records are controlled fixtures.',
        'The example.invalid source is unreachable.',
        'There is no search input, filtering, status/date/service navigation, alert or digest CTA, offer, analytics, or conversion event.',
      ]),
    );

    expect(ledger.experiments[0]).toMatchObject({
      id: 'retrieval-filter-offer-v1',
      rank: 1,
      status: 'ACTIVE_BLOCKED',
      firstUserOutcome:
        'Enter a query/filter over source-bound records with explicit empty and error states.',
      metric:
        'Unmeasured filter-to-record completion after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      blockedBy:
        'Coordinator-owned shared renderer/static-build/CSP adapter; public functional surface is not shipped.',
    });
  });
});
