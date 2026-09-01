import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateProductBlogRegistries,
  type ProductBlogEvidenceObject,
} from '../shared/blog.js';

const registryPath = new URL('./blog-registry.json', import.meta.url);
const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);
const coordinatorReleaseEvidence = {
  releaseHead: '366fd53948f46388036ad404c0fad828c86d64af',
  tag: 'v0.1.64',
  provenance: 'Coordinator-provided accepted release evidence.',
};
const statusRawObject = new URL(
  '../../evidence/objects/raw/23ae3be78b87801c0dc74c1501fa120c3b441d055519f35f367aa59125c30f55.bin',
  import.meta.url,
);
const centralRawObject = new URL(
  '../../evidence/objects/raw/6a00c8c2b2077ffb4238451ecb51f5145c3ebda0fc713112fbc3095a27ac6a9c.bin',
  import.meta.url,
);

const evidenceObjects: readonly ProductBlogEvidenceObject[] = [
  {
    receiptId:
      '754c45ef8cf59a085e5e4edd0a11136b6fc7ede71f94f399b45b16a629f06960',
    sourceId: 'google-search-status',
    url: 'https://status.search.google.com/incidents.json',
    observedAt: '2026-09-01T14:05:27.778Z',
    sha256: '23ae3be78b87801c0dc74c1501fa120c3b441d055519f35f367aa59125c30f55',
    policyDecision: 'PASS',
    bytes: readFileSync(statusRawObject),
  },
  {
    receiptId:
      'fb99243b2f13791e98ee43e8424c235e73568b0272693db5f12790481994b361',
    sourceId: 'google-search-central-blog',
    url: 'https://feeds.feedburner.com/blogspot/amDG',
    observedAt: '2026-09-01T14:05:27.745Z',
    sha256: '6a00c8c2b2077ffb4238451ecb51f5145c3ebda0fc713112fbc3095a27ac6a9c',
    policyDecision: 'PASS',
    bytes: readFileSync(centralRawObject),
  },
];

function assertBlogReleaseEvidenceMatchesLedger(
  registry: Record<string, unknown>,
  ledger: Record<string, unknown>,
) {
  const publication = registry.publication as Record<string, unknown>;
  const experiments = ledger.experiments as Array<Record<string, unknown>>;
  const rankFourteen = experiments.find((experiment) => experiment.rank === 14);

  expect(publication).toMatchObject({ status: 'ROUTE_RELEASE_VERIFIED' });
  expect(publication.coordinatorReleaseEvidence).toEqual(
    coordinatorReleaseEvidence,
  );
  expect(rankFourteen).toMatchObject({
    id: 'source-bound-evergreen-blog-post-v1',
    rank: 14,
    status: 'ROUTE_RELEASE_VERIFIED',
  });
  expect(rankFourteen?.coordinatorReleaseEvidence).toEqual(
    publication.coordinatorReleaseEvidence,
  );
}

describe('Search Receipt public blog registry', () => {
  it('records the accepted public release only from coordinator evidence', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    assertBlogReleaseEvidenceMatchesLedger(registry, ledger);
  });

  it('rejects a stale blog release-evidence mutation', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const mutatedRegistry = structuredClone(registry);

    mutatedRegistry.publication = {
      status: 'ROUTE_RELEASE_VERIFIED',
      coordinatorReleaseEvidence: {
        ...coordinatorReleaseEvidence,
        releaseHead: 'stale-release-head',
      },
    };

    expect(() =>
      assertBlogReleaseEvidenceMatchesLedger(mutatedRegistry, ledger),
    ).toThrow();
  });

  it('admits the first source-bound decision-time post without outcome claims', () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

    expect(registry).toMatchObject({
      schemaVersion: 1,
      siteId: 'search-receipt',
      title: 'Search Receipt notes',
      posts: [
        expect.objectContaining({
          id: 'separate-google-search-status-from-site-evidence',
          slug: 'separate-google-search-status-from-site-evidence',
          feedId:
            'urn:receipt-portfolio:search-receipt:separate-google-search-status-from-site-evidence',
          author: {
            name: 'Search Receipt editorial desk',
            role: 'Project-original editor',
          },
          sourceBindings: expect.arrayContaining([
            expect.objectContaining({
              sourceId: 'google-search-status',
              url: 'https://status.search.google.com/incidents.json',
            }),
          ]),
          boundaries: {
            currentness: expect.stringContaining(
              'does not report a current status or incident',
            ),
            noCausation: expect.stringContaining('does not establish cause'),
          },
        }),
      ],
    });

    const post = registry.posts[0];
    const scheduledPublicationAt = '2026-09-01T15:15:00.000Z';
    const sourceObservationTimes = post.sourceBindings.map(
      (binding: { observedAt: string }) => binding.observedAt,
    );
    expect(post.publishedAt).toBe(post.modifiedAt);
    expect(post.publishedAt).toBe(scheduledPublicationAt);
    expect(sourceObservationTimes).not.toContain(post.publishedAt);
    expect(
      sourceObservationTimes.every(
        (observedAt: string) =>
          new Date(post.publishedAt).getTime() > new Date(observedAt).getTime(),
      ),
    ).toBe(true);
    expect(post.sourceBindings).toEqual([
      {
        receiptId:
          '754c45ef8cf59a085e5e4edd0a11136b6fc7ede71f94f399b45b16a629f06960',
        sourceId: 'google-search-status',
        url: 'https://status.search.google.com/incidents.json',
        observedAt: '2026-09-01T14:05:27.778Z',
        sha256:
          '23ae3be78b87801c0dc74c1501fa120c3b441d055519f35f367aa59125c30f55',
        purpose:
          'Official Google Search Status observation with 10 admitted incident records.',
      },
      {
        receiptId:
          'fb99243b2f13791e98ee43e8424c235e73568b0272693db5f12790481994b361',
        sourceId: 'google-search-central-blog',
        url: 'https://feeds.feedburner.com/blogspot/amDG',
        observedAt: '2026-09-01T14:05:27.745Z',
        sha256:
          '6a00c8c2b2077ffb4238451ecb51f5145c3ebda0fc713112fbc3095a27ac6a9c',
        purpose:
          'Official Google Search Central feed observation with 10 admitted entry records; feed bodies are not source facts.',
      },
    ]);
    const validation = validateProductBlogRegistries(
      [registry],
      evidenceObjects,
    );
    expect(validation).toMatchObject({ ok: true, diagnostics: [] });
    expect(post.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Search controlled records',
          href: '/search-receipt/',
          kind: 'internal',
        }),
        expect.objectContaining({
          label: 'Filter controlled records',
          href: '/search-receipt/',
          kind: 'internal',
        }),
        expect.objectContaining({
          href: '/search-receipt/checklists/record-before-escalating-google-search-change/',
          kind: 'internal',
        }),
        expect.objectContaining({
          href: '/search-receipt/worksheets/compare-google-search-status-with-site-evidence/',
          kind: 'internal',
        }),
        expect.objectContaining({
          href: 'https://feeds.feedburner.com/blogspot/amDG',
          kind: 'external',
        }),
        expect.objectContaining({
          href: 'https://status.search.google.com/incidents.json',
          kind: 'external',
        }),
      ]),
    );
    expect(post.sections).toHaveLength(3);
    expect(
      post.sections.map((section: { heading: string }) => section.heading),
    ).toEqual([
      'For site owners separating two evidence tracks',
      'A three-step decision-time workflow',
      'Currentness, uncertainty, and corrections',
    ]);
    expect(JSON.stringify(registry)).not.toMatch(
      /(?:traffic|demand|conversion|willingness to pay|revenue)/iu,
    );
  });
});
