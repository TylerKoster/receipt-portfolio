import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { searchReceiptSite } from './index.js';
import { renderSite } from '../shared/render.js';

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

    expect(searchReceiptSite.proposition).toContain(
      'do not establish the cause of a change on your own site',
    );
    expect(searchReceiptSite.proposition).toContain(
      'check a verified official source before investigating',
    );
    const header = renderSite(searchReceiptSite, []).match(
      /<header class="site-header">[\s\S]*?<\/header>/,
    )?.[0];
    const page = renderSite(searchReceiptSite, []);

    expect(page).toContain(
      '<meta name="description" content="Search source-bound controlled examples by phrase or topic. They are not current incident evidence and do not explain a change on your own site.">',
    );

    expect(header).toContain(
      'Search source-bound controlled examples by phrase or topic.',
    );
    expect(header).toContain(
      'do not establish the cause of a change on your own site',
    );
    expect(header).toContain(
      'check a verified official source before investigating',
    );
    expect(retrievalFilterOffer).toMatchObject({
      id: 'retrieval-filter-offer-v1',
      rank: 1,
      status: 'OBSERVATION_BLOCKED',
    });
    expect(currentnessDisclosure).toMatchObject({
      id: 'currentness-disclosure-v1',
      rank: 2,
      status: 'OBSERVATION_BLOCKED',
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
