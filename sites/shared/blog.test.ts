import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchReceiptSite } from '../search-receipt/index.js';
import {
  productBlogRoutes,
  renderProductBlogAtom,
  renderProductBlogIndex,
  renderProductBlogPost,
  validateProductBlogRegistries,
  type ProductBlogEvidenceObject,
  type ProductBlogPost,
  type ProductBlogRegistry,
} from './blog.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/shared/controlled-blog-registry-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as ProductBlogRegistry;

const evidenceObject: ProductBlogEvidenceObject = {
  receiptId: 'b'.repeat(64),
  sourceId: 'google-search-status',
  url: 'https://status.search.google.com/incidents.json',
  observedAt: '2026-08-30T11:30:00.000Z',
  sha256: '553273914b991b391c4fb34fcb6eaaf3ee14d5107a95b942be90554779796b1a',
  policyDecision: 'PASS',
  bytes: new TextEncoder().encode('controlled repository evidence object'),
};

const invalidFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/shared/controlled-blog-registry-invalid-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function diagnosticsFor(registries: readonly unknown[]): readonly string[] {
  return validateProductBlogRegistries(registries, [evidenceObject])
    .diagnostics;
}

describe('evidence-bound product blog contract', () => {
  it('admits the complete controlled registry as a Search-owned namespace', () => {
    const result = validateProductBlogRegistries([fixture], [evidenceObject]);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.registries).toHaveLength(1);
    expect(result.registries[0]?.siteId).toBe('search-receipt');
  });

  it('rejects the controlled invalid fixture without admitting any registry', () => {
    const result = validateProductBlogRegistries(
      [invalidFixture],
      [evidenceObject],
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain('BLOG_SOURCE_BINDING_MISSING:0:0');
    expect(result.registries).toEqual([]);
  });

  it.each([
    [
      'missing source bindings',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sourceBindings = [];
      },
      'BLOG_SOURCE_BINDING_MISSING:0:0',
    ],
    [
      'unknown source reference',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sections[0]!.paragraphs[0]!.sourceBindingIds = [
          'not-admitted',
        ];
      },
      'BLOG_SOURCE_REFERENCE_INVALID:0:0',
    ],
    [
      'missing currentness boundary',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.boundaries.currentness = '';
      },
      'BLOG_CURRENTNESS_BOUNDARY_MISSING:0:0',
    ],
    [
      'missing no-causation boundary',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.boundaries.noCausation = '';
      },
      'BLOG_NO_CAUSATION_BOUNDARY_MISSING:0:0',
    ],
    [
      'current-status claim',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sections[0]!.paragraphs[0]!.text =
          'Google Search is currently down.';
      },
      'BLOG_CURRENT_STATUS_CLAIM:0:0',
    ],
    [
      'causation claim',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sections[0]!.paragraphs[0]!.text =
          'This incident caused the site change.';
      },
      'BLOG_CAUSATION_CLAIM:0:0',
    ],
    [
      'right-now status claim',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sections[0]!.paragraphs[0]!.text =
          'Google Search is down right now.';
      },
      'BLOG_CURRENT_STATUS_CLAIM:0:0',
    ],
    [
      'explains causation claim',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.sections[0]!.paragraphs[0]!.text =
          'This explains the site change.';
      },
      'BLOG_CAUSATION_CLAIM:0:0',
    ],
    [
      'current-status claim appended to currentness boundary',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.boundaries.currentness +=
          ' Google Search is down right now.';
      },
      'BLOG_CURRENT_STATUS_CLAIM:0:0',
    ],
    [
      'causation claim appended to no-causation boundary',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.boundaries.noCausation +=
          ' This explains the site change.';
      },
      'BLOG_CAUSATION_CLAIM:0:0',
    ],
    [
      'invalid published date',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.publishedAt = '2026-02-30T12:00:00.000Z';
      },
      'BLOG_DATE_INVALID:0:0',
    ],
    [
      'modified date before publication',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.modifiedAt = '2026-08-29T12:00:00.000Z';
      },
      'BLOG_DATE_ORDER_INVALID:0:0',
    ],
    [
      'non-allowlisted external link',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.links[1]!.href = 'https://example.com/claim';
      },
      'BLOG_LINK_NOT_ALLOWLISTED:0:0',
    ],
    [
      'cross-product internal link',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.links[0]!.href = '/skill-ledger/inventory/';
      },
      'BLOG_LINK_NOT_ALLOWLISTED:0:0',
    ],
    [
      'path-traversing internal link',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.links[0]!.href =
          '/search-receipt/../skill-ledger/inventory/';
      },
      'BLOG_LINK_NOT_ALLOWLISTED:0:0',
    ],
    [
      'missing links array',
      (candidate: ProductBlogRegistry) => {
        delete (candidate.posts[0] as Partial<ProductBlogPost>).links;
      },
      'BLOG_LINKS_INVALID:0:0',
    ],
    [
      'missing author disclosure',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.author.name = '';
      },
      'BLOG_EDITORIAL_DISCLOSURE_MISSING:0:0',
    ],
  ])('fails closed for %s', (_label, mutate, expectedDiagnostic) => {
    const candidate = structuredClone(fixture);
    mutate(candidate);

    const result = validateProductBlogRegistries([candidate], [evidenceObject]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain(expectedDiagnostic);
    expect(result.registries).toEqual([]);
  });

  it.each([
    ['missing object', [], 'BLOG_EVIDENCE_OBJECT_MISSING:0:0'],
    [
      'object digest mismatch',
      [{ ...evidenceObject, bytes: new TextEncoder().encode('tampered') }],
      'BLOG_EVIDENCE_DIGEST_MISMATCH:0:0',
    ],
    [
      'non-admitted receipt',
      [{ ...evidenceObject, policyDecision: 'REVIEW_REQUIRED' }],
      'BLOG_EVIDENCE_OBJECT_NOT_ADMITTED:0:0',
    ],
    [
      'source URL mismatch',
      [
        {
          ...evidenceObject,
          url: 'https://status.search.google.com/other.json',
        },
      ],
      'BLOG_EVIDENCE_SOURCE_MISMATCH:0:0',
    ],
    [
      'observed timestamp mismatch',
      [{ ...evidenceObject, observedAt: '2026-08-30T11:31:00.000Z' }],
      'BLOG_EVIDENCE_SOURCE_MISMATCH:0:0',
    ],
  ] as const)(
    'rejects a source binding with %s',
    (_label, evidence, expectedDiagnostic) => {
      const result = validateProductBlogRegistries([fixture], evidence);
      expect(result.ok).toBe(false);
      expect(result.registries).toEqual([]);
      expect(result.diagnostics).toContain(expectedDiagnostic);
    },
  );

  it.each([
    [
      'registry title',
      (value: ProductBlogRegistry) => (value.title = 'Active outage now'),
    ],
    [
      'registry description',
      (value: ProductBlogRegistry) =>
        (value.description = 'Google Search is down right now.'),
    ],
  ])('checks claim-bearing %s copy', (_label, mutate) => {
    const candidate = structuredClone(fixture);
    mutate(candidate);
    expect(diagnosticsFor([candidate])).toContain(
      'BLOG_REGISTRY_CURRENT_STATUS_CLAIM:0',
    );
  });

  it.each([
    [
      'editorial disclosure',
      (post: ProductBlogPost) =>
        (post.editorialDisclosure = 'This explains the site change.'),
    ],
    [
      'source purpose',
      (post: ProductBlogPost) =>
        (post.sourceBindings[0]!.purpose = 'The outage is ongoing now.'),
    ],
    [
      'link label',
      (post: ProductBlogPost) =>
        (post.links[0]!.label = 'This caused the site change'),
    ],
    [
      'author name',
      (post: ProductBlogPost) =>
        (post.author.name = 'The outage is active now'),
    ],
    [
      'author role',
      (post: ProductBlogPost) =>
        (post.author.role = 'Explains why the site changed'),
    ],
  ])('checks rendered %s for prohibited claims', (_label, mutate) => {
    const candidate = structuredClone(fixture);
    mutate(candidate.posts[0]!);
    expect(diagnosticsFor([candidate])).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^BLOG_(?:CURRENT_STATUS|CAUSATION)_CLAIM:0:0$/u),
      ]),
    );
  });

  it('rejects unapproved namespaces and duplicate namespace, slug, canonical, or feed identity', () => {
    const unapproved = structuredClone(fixture);
    (unapproved as { siteId: string }).siteId = 'unapproved-site';
    expect(diagnosticsFor([unapproved])).toContain(
      'BLOG_SITE_ID_NOT_APPROVED:0',
    );

    expect(diagnosticsFor([fixture, structuredClone(fixture)])).toContain(
      'BLOG_SITE_NAMESPACE_DUPLICATE:1',
    );

    const duplicates = structuredClone(fixture);
    duplicates.posts.push(structuredClone(duplicates.posts[0]!));
    expect(diagnosticsFor([duplicates])).toEqual(
      expect.arrayContaining([
        'BLOG_SLUG_DUPLICATE:0:1',
        'BLOG_CANONICAL_DUPLICATE:0:1',
        'BLOG_FEED_ID_DUPLICATE:0:1',
        'BLOG_TITLE_DUPLICATE:0:1',
        'BLOG_DESCRIPTION_DUPLICATE:0:1',
      ]),
    );

    const invalidFeedId = structuredClone(fixture);
    invalidFeedId.posts[0]!.feedId = 'not an absolute atom id';
    expect(diagnosticsFor([invalidFeedId])).toContain(
      'BLOG_FEED_ID_INVALID:0:0',
    );
    invalidFeedId.posts[0]!.feedId = 'urn:';
    expect(diagnosticsFor([invalidFeedId])).toContain(
      'BLOG_FEED_ID_INVALID:0:0',
    );
  });

  it('renders a self-canonical index and post with dates, editorial disclosure, and admitted links', () => {
    const index = renderProductBlogIndex(
      searchReceiptSite,
      fixture,
      'https://example.com/receipt-portfolio/',
    );
    const post = renderProductBlogPost(
      searchReceiptSite,
      fixture.posts[0]!,
      'https://example.com/receipt-portfolio/',
    );

    expect(index).toContain(
      '<link rel="canonical" href="https://example.com/receipt-portfolio/search-receipt/blog/">',
    );
    expect(index).toContain(`<title>${fixture.title}</title>`);
    expect(index).toContain(`content="${fixture.description}"`);
    expect(index).toContain(
      'href="/receipt-portfolio/search-receipt/blog/controlled-search-handoff-checklist/"',
    );
    expect(post).toContain(
      '<link rel="canonical" href="https://example.com/receipt-portfolio/search-receipt/blog/controlled-search-handoff-checklist/">',
    );
    expect(post).toContain('<time datetime="2026-08-30T12:00:00.000Z">');
    expect(post).toContain('<time datetime="2026-08-31T12:00:00.000Z">');
    expect(post).toContain(fixture.posts[0]!.author.name);
    expect(post).toContain(fixture.posts[0]!.author.role);
    expect(post).toContain(fixture.posts[0]!.editorialDisclosure);
    expect(post).toContain(
      'href="https://status.search.google.com/incidents.json"',
    );
    expect(post).toContain(
      'href="/receipt-portfolio/search-receipt/guides/is-google-search-down-or-my-site/"',
    );
    expect(post).toContain(fixture.posts[0]!.boundaries.currentness);
    expect(post).toContain(fixture.posts[0]!.boundaries.noCausation);
    expect(post).not.toContain('<form');
    expect(post).not.toContain('<script type="module"');
  });

  it('escapes blog content and emits deterministic Atom plus exact sitemap and inventory paths', () => {
    const hostile = structuredClone(fixture);
    hostile.posts[0]!.sections[0]!.heading = '<script>alert(1)</script>';
    hostile.posts[0]!.links[0]!.label = '<img src=x onerror=alert(1)>';
    const post = renderProductBlogPost(searchReceiptSite, hostile.posts[0]!);
    expect(post).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(post).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(post).not.toContain('<script>alert(1)</script>');
    expect(post).not.toContain('<img src=x');

    const atom = renderProductBlogAtom(
      searchReceiptSite,
      fixture,
      'https://example.com/receipt-portfolio/',
    );
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(atom).toContain(
      '<id>https://example.com/receipt-portfolio/search-receipt/blog/</id>',
    );
    expect(atom).toContain(`<id>${fixture.posts[0]!.feedId}</id>`);
    expect(atom).toContain('<published>2026-08-30T12:00:00.000Z</published>');
    expect(atom).toContain('<updated>2026-08-31T12:00:00.000Z</updated>');
    expect(atom).toContain(
      'href="https://example.com/receipt-portfolio/search-receipt/blog/controlled-search-handoff-checklist/"',
    );

    expect(productBlogRoutes([fixture])).toEqual([
      {
        siteId: 'search-receipt',
        sitemapPaths: ['/blog/', '/blog/controlled-search-handoff-checklist/'],
        inventoryPaths: [
          'blog/feed.xml',
          'blog/index.html',
          'blog/controlled-search-handoff-checklist/index.html',
        ],
      },
    ]);
  });
});
