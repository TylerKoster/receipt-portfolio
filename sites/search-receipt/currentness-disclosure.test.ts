import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { searchReceiptSite } from './index.js';

const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);

describe('Search Receipt currentness disclosure', () => {
  it('distinguishes controlled examples from current incident evidence before investigation', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const currentnessDisclosure = ledger.experiments.find(
      (experiment: { id: string }) =>
        experiment.id === 'currentness-disclosure-v1',
    );
    const retrievalFilterOffer = ledger.experiments.find(
      (experiment: { id: string }) =>
        experiment.id === 'retrieval-filter-offer-v1',
    );

    expect(searchReceiptSite.description).toContain(
      'controlled examples, not current incident evidence',
    );
    expect(searchReceiptSite.proposition).toContain(
      'do not establish the cause of a change on your own site',
    );
    expect(searchReceiptSite.proposition).toContain(
      'check a verified official source before investigating',
    );
    expect(retrievalFilterOffer).toMatchObject({
      id: 'retrieval-filter-offer-v1',
      rank: 1,
      status: 'ACTIVE_BLOCKED',
    });
    expect(currentnessDisclosure).toMatchObject({
      id: 'currentness-disclosure-v1',
      rank: 2,
      status: 'ACTIVE_NO_MEASUREMENT',
      hypothesis:
        'Clearly distinguishing controlled examples from current incident evidence before a visitor considers investigating their own site may prevent unsupported causal interpretation.',
      firstUserOutcome:
        'Recognize that controlled examples are not current incident evidence before considering an investigation of their own site.',
      metric:
        'Unmeasured currentness-disclosure comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
    });
  });
});
