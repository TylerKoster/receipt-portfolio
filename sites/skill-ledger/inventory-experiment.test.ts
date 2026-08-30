import { describe, expect, it } from 'vitest';
import {
  STATIC_SIGNAL_BOUNDARY,
  compareSkillInventory,
  declaredMetadataFacetSummary,
  filterSkillInventory,
  recordSyntheticOfferEvent,
  sourceBoundSkillInventory,
  summarizeSyntheticOfferEvents,
  type SourceBoundSkillReceipt,
  type SyntheticOfferEvent,
} from './inventory-experiment.js';

const receiptA = {
  receipt: {
    id: 'receipt-a',
    siteId: 'skill-ledger',
    status: 'PASS',
    kind: 'skill-inventory',
    evidenceClass: 'controlled-structural-test',
  },
  source: {
    sourceId: 'archive-index',
    url: 'https://example.invalid/archive',
    observedAt: '2026-08-30T00:00:00.000Z',
  },
  hashes: {
    manifestSha256: 'a'.repeat(64),
    rawSha256: 'b'.repeat(64),
    normalizedSha256: 'c'.repeat(64),
  },
  provenance: {
    collector: 'controlled-test-fixture',
    method: 'static-receipt',
  },
  publicFacts: {
    kind: 'skill-inventory',
    packageId: 'archive-skill',
    declaredLicense: 'MIT',
    manifestPresent: true,
    declaredDependencies: [],
    contentsSha256: 'd'.repeat(64),
    staticRiskFlags: [],
  },
} satisfies SourceBoundSkillReceipt;

const receiptB = {
  receipt: {
    id: 'receipt-b',
    siteId: 'skill-ledger',
    status: 'PASS',
    kind: 'skill-inventory',
    evidenceClass: 'controlled-structural-test',
  },
  source: {
    sourceId: 'curated-catalog',
    url: 'https://example.invalid/catalog',
    observedAt: '2026-08-30T00:05:00.000Z',
  },
  hashes: {
    manifestSha256: 'e'.repeat(64),
    rawSha256: 'f'.repeat(64),
    normalizedSha256: '0'.repeat(64),
  },
  provenance: {
    collector: 'controlled-test-fixture',
    method: 'static-receipt',
  },
  publicFacts: {
    kind: 'skill-inventory',
    packageId: 'catalog-skill',
    declaredLicense: 'Apache-2.0',
    manifestPresent: true,
    declaredDependencies: ['zod'],
    contentsSha256: '1'.repeat(64),
    staticRiskFlags: ['network-reference'],
  },
} satisfies SourceBoundSkillReceipt;

describe('source-bound SkillLedger inventory experiment', () => {
  it('keeps receipt, source, hashes, provenance, declared metadata, and static signals distinct', () => {
    const records = sourceBoundSkillInventory([
      receiptA,
      receiptB,
      { ...receiptA, receipt: { ...receiptA.receipt, siteId: 'other-site' } },
      { ...receiptA, receipt: { ...receiptA.receipt, status: 'FAIL' } },
      { ...receiptA, receipt: { ...receiptA.receipt, kind: 'search-status' } },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      receiptId: 'receipt-a',
      receipt: receiptA.receipt,
      source: receiptA.source,
      hashes: receiptA.hashes,
      provenance: receiptA.provenance,
      declaredMetadata: {
        packageId: 'archive-skill',
        sourceId: 'archive-index',
        license: 'MIT',
        dependencies: [],
        dependencyState: 'none',
      },
      staticRiskFlags: [],
    });
  });

  it('searches package and source identifiers and applies exact declared filters', () => {
    const records = sourceBoundSkillInventory([receiptA, receiptB]);

    expect(
      filterSkillInventory(records, {
        query: 'ARCHIVE',
        dependencyState: 'none',
      }),
    ).toHaveLength(1);
    expect(
      filterSkillInventory(records, { query: 'CURATED-CATALOG' }),
    ).toMatchObject([{ receiptId: 'receipt-b' }]);
    expect(
      filterSkillInventory(records, {
        declaredLicense: 'Apache-2.0',
        dependencyState: 'declared',
        staticSignalPresent: true,
      }),
    ).toMatchObject([{ receiptId: 'receipt-b' }]);
  });

  it('summarizes declared metadata facets in deterministic controlled-record order', () => {
    const records = sourceBoundSkillInventory([receiptA, receiptB]);

    expect(declaredMetadataFacetSummary(records)).toEqual([
      {
        facet: 'declared-license',
        value: 'Apache-2.0',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'declared-license',
        value: 'MIT',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'dependency-state',
        value: 'none',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'dependency-state',
        value: 'declared',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'no-static-signals',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'static-signals-present',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
    ]);
  });

  it('counts duplicate declared metadata values across controlled records without inventing license buckets', () => {
    const receiptC = {
      ...receiptA,
      receipt: { ...receiptA.receipt, id: 'receipt-c' },
      publicFacts: {
        ...receiptA.publicFacts,
        packageId: 'archive-skill-static',
        declaredDependencies: ['zod'],
        staticRiskFlags: ['controlled-static-signal'],
      },
    } satisfies SourceBoundSkillReceipt;
    const receiptD = {
      ...receiptB,
      receipt: { ...receiptB.receipt, id: 'receipt-d' },
      publicFacts: {
        ...receiptB.publicFacts,
        packageId: 'catalog-skill-no-dependency',
        declaredLicense: 'MIT',
        declaredDependencies: [],
      },
    } satisfies SourceBoundSkillReceipt;

    const rows = declaredMetadataFacetSummary(
      sourceBoundSkillInventory([receiptA, receiptB, receiptC, receiptD]),
    );

    expect(rows).toEqual([
      {
        facet: 'declared-license',
        value: 'Apache-2.0',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'declared-license',
        value: 'MIT',
        count: 3,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'dependency-state',
        value: 'none',
        count: 2,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'dependency-state',
        value: 'declared',
        count: 2,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'no-static-signals',
        count: 1,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'static-signals-present',
        count: 3,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
    ]);
    expect(rows).not.toContainEqual(
      expect.objectContaining({
        facet: 'declared-license',
        value: 'missing-license',
      }),
    );
  });

  it('returns zero-count non-license facet rows when there are no records', () => {
    expect(declaredMetadataFacetSummary([])).toEqual([
      {
        facet: 'dependency-state',
        value: 'none',
        count: 0,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'dependency-state',
        value: 'declared',
        count: 0,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'no-static-signals',
        count: 0,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
      {
        facet: 'static-signal-presence',
        value: 'static-signals-present',
        count: 0,
        boundary:
          'Declared metadata facets are not safety, adoption, demand, or provenance conclusions.',
      },
    ]);
  });

  it('compares exactly two distinct source-bound records without an adoption or safety conclusion', () => {
    const records = sourceBoundSkillInventory([receiptA, receiptB]);

    expect(
      compareSkillInventory(records, ['receipt-a', 'receipt-b']),
    ).toMatchObject({
      kind: 'ready',
      records: [{ receiptId: 'receipt-a' }, { receiptId: 'receipt-b' }],
    });
    expect(compareSkillInventory(records, ['receipt-a'])).toEqual({
      kind: 'not-ready',
      reason: 'Select two distinct source-bound records to compare.',
    });
    expect(compareSkillInventory(records, ['receipt-a', 'receipt-a'])).toEqual({
      kind: 'not-ready',
      reason: 'Select two distinct source-bound records to compare.',
    });
  });

  it('returns a no-identity, non-persistent synthetic offer event', () => {
    expect(recordSyntheticOfferEvent('team-inventory', 'selected')).toEqual({
      offerId: 'team-inventory',
      action: 'selected',
      evidenceClass: 'synthetic-only',
      identityCaptured: false,
      persisted: false,
    });
    expect(recordSyntheticOfferEvent('watchlist', 'viewed')).toMatchObject({
      offerId: 'watchlist',
      action: 'viewed',
      evidenceClass: 'synthetic-only',
      identityCaptured: false,
      persisted: false,
    });
    expect(STATIC_SIGNAL_BOUNDARY).toBe(
      'Static-risk flags are limited signals, not a security assessment.',
    );
  });

  it('summarizes controlled synthetic offer events in fixed offer order', () => {
    const events = [
      {
        offerId: 'team-inventory',
        action: 'selected',
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
      },
      {
        offerId: 'watchlist',
        action: 'viewed',
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
      },
      {
        offerId: 'watchlist',
        action: 'selected',
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
      },
      {
        offerId: 'watchlist',
        action: 'viewed',
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
      },
    ] satisfies readonly SyntheticOfferEvent[];

    expect(summarizeSyntheticOfferEvents(events)).toEqual([
      {
        offerId: 'watchlist',
        viewed: 2,
        selected: 1,
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
        interpretationBoundary:
          'Synthetic event counts are not real demand, adoption, conversion, revenue, or willingness-to-pay evidence.',
      },
      {
        offerId: 'team-inventory',
        viewed: 0,
        selected: 1,
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
        interpretationBoundary:
          'Synthetic event counts are not real demand, adoption, conversion, revenue, or willingness-to-pay evidence.',
      },
    ]);
  });

  it('returns ordered zero-count rows for absent controlled synthetic events', () => {
    expect(summarizeSyntheticOfferEvents([])).toEqual([
      {
        offerId: 'watchlist',
        viewed: 0,
        selected: 0,
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
        interpretationBoundary:
          'Synthetic event counts are not real demand, adoption, conversion, revenue, or willingness-to-pay evidence.',
      },
      {
        offerId: 'team-inventory',
        viewed: 0,
        selected: 0,
        evidenceClass: 'synthetic-only',
        identityCaptured: false,
        persisted: false,
        interpretationBoundary:
          'Synthetic event counts are not real demand, adoption, conversion, revenue, or willingness-to-pay evidence.',
      },
    ]);
  });
});
