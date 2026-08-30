import { describe, expect, it } from 'vitest';
import {
  STATIC_SIGNAL_BOUNDARY,
  compareSkillInventory,
  filterSkillInventory,
  recordSyntheticOfferEvent,
  sourceBoundSkillInventory,
  type SourceBoundSkillReceipt,
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
});
