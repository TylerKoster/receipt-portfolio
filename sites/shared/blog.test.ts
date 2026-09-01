import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  validateProductBlogRegistries,
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
  return validateProductBlogRegistries(registries).diagnostics;
}

describe('evidence-bound product blog contract', () => {
  it('admits the complete controlled registry as a Search-owned namespace', () => {
    const result = validateProductBlogRegistries([fixture]);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.registries).toHaveLength(1);
    expect(result.registries[0]?.siteId).toBe('search-receipt');
  });

  it('rejects the controlled invalid fixture without admitting any registry', () => {
    const result = validateProductBlogRegistries([invalidFixture]);

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
      'missing author disclosure',
      (candidate: ProductBlogRegistry) => {
        candidate.posts[0]!.author.name = '';
      },
      'BLOG_EDITORIAL_DISCLOSURE_MISSING:0:0',
    ],
  ])('fails closed for %s', (_label, mutate, expectedDiagnostic) => {
    const candidate = structuredClone(fixture);
    mutate(candidate);

    const result = validateProductBlogRegistries([candidate]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain(expectedDiagnostic);
    expect(result.registries).toEqual([]);
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
      ]),
    );
  });
});
