import { describe, expect, it } from 'vitest';
import {
  STATIC_SIGNAL_BOUNDARY,
  compareSkillInventory,
  declaredMetadataFacetSummary,
  filterSkillInventory,
  assessControlledGuideDraftAdmission,
  assessSourceBoundSkillReceiptQuality,
  recordSyntheticOfferEvent,
  sourceBoundSkillInventory,
  summarizeSkillInventoryComparison,
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
  it('admits a controlled guide draft only when its source-bound receipt is quality-gated', () => {
    const draft = {
      guideId: 'controlled-guide-archive-skill',
      title: 'Controlled archive skill guide',
      summary: 'A controlled draft bound to a quality-gated source receipt.',
      declaredSourceRole: 'original-guide',
      sourcePublisher: 'Controlled test publisher',
      sourceReceipt: receiptA,
    };

    expect(assessControlledGuideDraftAdmission(draft)).toEqual({
      kind: 'ready',
      issues: [],
      boundary:
        'Guide draft admission does not establish currentness, original authorship, real provenance, safety, adoption, demand, or suitability.',
    });
  });

  it('reports guide admission issues in fixed order without mutating the draft or source receipt behavior', () => {
    const invalidSourceReceipt = {
      ...receiptA,
      receipt: { ...receiptA.receipt, id: '' },
    } satisfies SourceBoundSkillReceipt;
    const draft = {
      guideId: ' ',
      title: '',
      summary: '\t',
      declaredSourceRole: 'source-guide',
      sourcePublisher: ' ',
      sourceReceipt: invalidSourceReceipt,
    };
    const draftBefore = structuredClone(draft);
    const sourceQualityBefore =
      assessSourceBoundSkillReceiptQuality(invalidSourceReceipt);

    expect(assessControlledGuideDraftAdmission(draft)).toEqual({
      kind: 'not-ready',
      issues: [
        'missing-guide-id',
        'missing-guide-title',
        'missing-guide-summary',
        'invalid-declared-source-role',
        'missing-source-publisher',
        'source-receipt-not-ready',
      ],
      boundary:
        'Guide draft admission does not establish currentness, original authorship, real provenance, safety, adoption, demand, or suitability.',
    });
    expect(draft).toEqual(draftBefore);
    expect(assessSourceBoundSkillReceiptQuality(invalidSourceReceipt)).toEqual(
      sourceQualityBefore,
    );
  });

  it('assesses a complete controlled source-bound receipt as ready without issues', () => {
    expect(assessSourceBoundSkillReceiptQuality(receiptA)).toEqual({
      kind: 'ready',
      issues: [],
      boundary:
        'Field validation does not establish real provenance, safety, adoption, demand, or suitability.',
    });
  });

  it('reports source-bound receipt quality issues in fixed field order', () => {
    const malformedReceipt = {
      ...receiptA,
      receipt: { ...receiptA.receipt, id: '' },
      source: {
        ...receiptA.source,
        sourceId: '',
        url: 'http://example.invalid/archive',
        observedAt: 'not-a-time',
      },
      hashes: {
        manifestSha256: 'A'.repeat(64),
        rawSha256: 'short',
        normalizedSha256: 'f'.repeat(63),
      },
      provenance: {},
      publicFacts: {
        ...receiptA.publicFacts,
        packageId: '',
        contentsSha256: '0'.repeat(65),
      },
    } satisfies SourceBoundSkillReceipt;

    expect(assessSourceBoundSkillReceiptQuality(malformedReceipt)).toEqual({
      kind: 'not-ready',
      issues: [
        'missing-receipt-id',
        'missing-source-id',
        'invalid-source-url',
        'invalid-observed-at',
        'missing-package-id',
        'missing-provenance',
        'invalid-manifest-sha256',
        'invalid-raw-sha256',
        'invalid-normalized-sha256',
        'invalid-contents-sha256',
      ],
      boundary:
        'Field validation does not establish real provenance, safety, adoption, demand, or suitability.',
    });
  });

  it('rejects a calendar-normalized invalid ISO UTC observed timestamp', () => {
    const invalidDateReceipt = {
      ...receiptA,
      receipt: { ...receiptA.receipt, id: 'receipt-invalid-date' },
      source: {
        ...receiptA.source,
        observedAt: '2026-02-30T00:00:00.000Z',
      },
    } satisfies SourceBoundSkillReceipt;

    expect(
      assessSourceBoundSkillReceiptQuality(invalidDateReceipt),
    ).toMatchObject({
      kind: 'not-ready',
      issues: ['invalid-observed-at'],
    });
    expect(sourceBoundSkillInventory([invalidDateReceipt])).toEqual([]);
  });

  it('excludes an otherwise accepted receipt when source-bound quality is not ready', () => {
    const malformedReceipt = {
      ...receiptA,
      source: { ...receiptA.source, url: 'http://example.invalid/archive' },
    } satisfies SourceBoundSkillReceipt;

    expect(sourceBoundSkillInventory([receiptA, malformedReceipt])).toEqual([
      expect.objectContaining({ receiptId: 'receipt-a' }),
    ]);
  });

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

  it('summarizes controlled source-bound field differences in a fixed order without conclusions', () => {
    const records = sourceBoundSkillInventory([receiptA, receiptB]);
    const comparison = compareSkillInventory(records, [
      'receipt-a',
      'receipt-b',
    ]);

    expect(summarizeSkillInventoryComparison(comparison)).toEqual({
      kind: 'ready',
      fields: [
        {
          field: 'source-id',
          left: 'archive-index',
          right: 'curated-catalog',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'source-url',
          left: 'https://example.invalid/archive',
          right: 'https://example.invalid/catalog',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'manifest-sha256',
          left: 'a'.repeat(64),
          right: 'e'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'raw-sha256',
          left: 'b'.repeat(64),
          right: 'f'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'normalized-sha256',
          left: 'c'.repeat(64),
          right: '0'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'contents-sha256',
          left: 'd'.repeat(64),
          right: '1'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'declared-license',
          left: 'MIT',
          right: 'Apache-2.0',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'dependency-state',
          left: 'none',
          right: 'declared',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'static-signal-presence',
          left: 'no-static-signals',
          right: 'static-signals-present',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
      ],
    });
  });

  it('keeps equal source identifiers as same while preserving other controlled field differences', () => {
    const receiptWithSharedSourceId = {
      ...receiptB,
      receipt: { ...receiptB.receipt, id: 'receipt-shared-source-id' },
      source: { ...receiptB.source, sourceId: 'archive-index' },
    } satisfies SourceBoundSkillReceipt;
    const records = sourceBoundSkillInventory([
      receiptA,
      receiptWithSharedSourceId,
    ]);

    expect(
      summarizeSkillInventoryComparison(
        compareSkillInventory(records, [
          'receipt-a',
          'receipt-shared-source-id',
        ]),
      ),
    ).toEqual({
      kind: 'ready',
      fields: [
        {
          field: 'source-id',
          left: 'archive-index',
          right: 'archive-index',
          status: 'same',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'source-url',
          left: 'https://example.invalid/archive',
          right: 'https://example.invalid/catalog',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'manifest-sha256',
          left: 'a'.repeat(64),
          right: 'e'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'raw-sha256',
          left: 'b'.repeat(64),
          right: 'f'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'normalized-sha256',
          left: 'c'.repeat(64),
          right: '0'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'contents-sha256',
          left: 'd'.repeat(64),
          right: '1'.repeat(64),
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'declared-license',
          left: 'MIT',
          right: 'Apache-2.0',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'dependency-state',
          left: 'none',
          right: 'declared',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
        {
          field: 'static-signal-presence',
          left: 'no-static-signals',
          right: 'static-signals-present',
          status: 'different',
          boundary:
            'Field differences do not establish real provenance, safety, adoption, demand, or suitability conclusions.',
        },
      ],
    });
  });

  it('returns the exact not-ready comparison summary when two records are not selected', () => {
    const records = sourceBoundSkillInventory([receiptA, receiptB]);

    expect(
      summarizeSkillInventoryComparison(
        compareSkillInventory(records, ['receipt-a']),
      ),
    ).toEqual({
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
