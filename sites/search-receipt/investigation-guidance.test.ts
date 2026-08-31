import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { searchReceiptSite } from './index.js';

const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);

describe('Search Receipt evidence-to-investigation guidance', () => {
  it('keeps uncertainty while directing a visitor to compare official and site evidence', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const retrievalFilterOffer = ledger.experiments.find(
      (experiment: { id: string }) =>
        experiment.id === 'retrieval-filter-offer-v1',
    );
    const currentnessDisclosure = ledger.experiments.find(
      (experiment: { id: string }) =>
        experiment.id === 'currentness-disclosure-v1',
    );
    const investigationGuidance = ledger.experiments.find(
      (experiment: { id: string }) =>
        experiment.id === 'evidence-to-investigation-guidance-v1',
    );

    expect(searchReceiptSite.interpretationBoundary).toContain(
      'one admitted observation',
    );
    expect(searchReceiptSite.interpretationBoundary).toContain(
      'does not prove a current incident',
    );
    expect(searchReceiptSite.interpretationBoundary).toContain(
      'cause for a site change',
    );
    expect(searchReceiptSite.interpretationBoundary).toContain(
      "compare a verified official source's timestamp/status with one's own site evidence",
    );
    expect(searchReceiptSite.interpretationBoundary).toContain(
      'retain uncertainty if that does not establish a connection',
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
    });
    expect(investigationGuidance).toMatchObject({
      id: 'evidence-to-investigation-guidance-v1',
      rank: 3,
      status: 'OBSERVATION_BLOCKED',
      hypothesis:
        'Giving a visitor a bounded manual sequence to compare timestamp and status from a verified official source with their own site evidence before considering an investigation may support uncertainty-aware interpretation without claiming current status or cause.',
      firstUserOutcome:
        'Compare timestamp and status from a verified official source with their own site evidence before considering an investigation, while retaining uncertainty if no connection is established.',
      metric:
        'Unmeasured methodology-guidance comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
    });
  });
});
