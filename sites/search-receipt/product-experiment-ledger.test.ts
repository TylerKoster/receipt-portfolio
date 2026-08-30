import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);

describe('Search Receipt product experiment ledger', () => {
  it('preserves synthetic usability evidence and records the shipped retrieval surface without claiming measurement', () => {
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
      status: 'ACTIVE_NO_MEASUREMENT',
      firstUserOutcome:
        'Enter a query/filter over source-bound records with explicit empty and error states.',
      metric:
        'Unmeasured filter-to-record completion after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      coordinatorReleaseEvidence: {
        releaseHead: '388a3d0c113ceb2e42346315811fdfbb19b7ab86',
        tag: 'v0.1.10',
        provenance: 'Coordinator-provided accepted release evidence.',
      },
      shippedCapability: {
        retrieval:
          'Client-side query and topic filtering shipped with explicit empty and error states.',
        offer:
          'The alert/report interaction is an in-page non-operational preview: it creates no alert or report and sends or retains no data.',
        measurement:
          'No telemetry, session, or interest measurement exists; no real demand or revenue conclusion.',
      },
    });
    expect(ledger.experiments[0]).not.toHaveProperty('blockedBy');
  });

  it('records the interaction currentness boundary without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[4]).toMatchObject({
      id: 'interaction-currentness-boundary-v1',
      rank: 5,
      status: 'ACTIVE_NO_MEASUREMENT',
      hypothesis:
        'Placing a clear controlled-example/no-causation boundary at the search interaction may help visitors interpret matching records without treating them as current incident evidence or an explanation for their own site.',
      firstUserOutcome:
        'Recognize that a filtered record is a controlled example, not current incident evidence or an explanation for their own-site change.',
      metric:
        'Unmeasured interaction-boundary comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the interaction boundary under bounded observation only; no data means no demand or revenue conclusion.',
    });
    expect(
      ledger.experiments
        .slice(0, 4)
        .map((experiment: { rank: number }) => experiment.rank),
    ).toEqual([1, 2, 3, 4]);
  });

  it('records search-scope discoverability without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[5]).toMatchObject({
      id: 'search-scope-discoverability-v1',
      rank: 6,
      status: 'ACTIVE_NO_MEASUREMENT',
      hypothesis:
        'Clearly naming phrase/topic search in the visible header may help a visitor find the available retrieval action while retaining currentness/no-causation limits.',
      firstUserOutcome:
        'Recognize that they can search controlled examples by phrase or topic and that a result is not current incident evidence or proof of their own-site cause.',
      metric:
        'Unmeasured search-scope comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the header search-scope disclosure under bounded observation only; no data means no demand or revenue conclusion.',
    });
  });
});
