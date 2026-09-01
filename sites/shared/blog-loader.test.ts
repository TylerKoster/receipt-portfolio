import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProductBlogRegistries, type ProductBlogRegistry } from './blog.js';

const registry: ProductBlogRegistry = {
  schemaVersion: 1,
  siteId: 'search-receipt',
  title: 'Controlled registry',
  description: 'A controlled registry used only by fixed-path loader tests.',
  posts: [
    {
      id: 'controlled-loader-post',
      slug: 'controlled-loader-post',
      feedId: 'urn:receipt-portfolio:search-receipt:controlled-loader-post',
      title: 'Prepare a bounded handoff',
      description: 'Separate a source observation from own-site evidence.',
      publishedAt: '2026-08-30T12:00:00.000Z',
      modifiedAt: '2026-08-30T12:00:00.000Z',
      author: { name: 'Controlled editor', role: 'Test-only editor' },
      editorialDisclosure: 'This is a controlled loader fixture.',
      sourceBindings: [
        {
          sourceId: 'google-search-status',
          url: 'https://status.search.google.com/incidents.json',
          observedAt: '2026-08-30T11:00:00.000Z',
          sha256: 'a'.repeat(64),
          purpose: 'Controlled source binding.',
        },
      ],
      sections: [
        {
          heading: 'Record separately',
          paragraphs: [
            {
              text: 'Keep the official observation separate from site evidence.',
              sourceBindingIds: ['google-search-status'],
            },
          ],
        },
      ],
      links: [],
      boundaries: {
        currentness: 'This post does not report a current status or incident.',
        noCausation:
          'This post does not diagnose a change and does not establish cause.',
      },
    },
  ],
};

const temporaryRoots: string[] = [];

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'product-blog-loader-'));
  temporaryRoots.push(path);
  return path;
}

async function writeRegistry(
  projectRoot: string,
  pathSiteId: string,
  value: unknown,
): Promise<void> {
  const directory = join(projectRoot, 'sites', pathSiteId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'blog-registry.json'), JSON.stringify(value));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe('fixed product blog registry discovery', () => {
  it('treats missing and empty approved registries as no public blog routes', async () => {
    const projectRoot = await root();
    expect(await loadProductBlogRegistries(projectRoot)).toEqual({
      ok: true,
      diagnostics: [],
      registries: [],
    });

    await writeRegistry(projectRoot, 'search-receipt', {
      schemaVersion: 1,
      siteId: 'search-receipt',
      title: 'Empty Search blog',
      description: 'No posts have been admitted.',
      posts: [],
    });
    const empty = await loadProductBlogRegistries(projectRoot);
    expect(empty.ok).toBe(true);
    expect(empty.registries).toHaveLength(1);
    expect(empty.registries[0]?.posts).toEqual([]);
  });

  it('loads a Search-owned registry only from the fixed Search path', async () => {
    const projectRoot = await root();
    await writeRegistry(projectRoot, 'search-receipt', registry);

    const result = await loadProductBlogRegistries(projectRoot);
    expect(result.ok).toBe(true);
    expect(result.registries.map((entry) => entry.siteId)).toEqual([
      'search-receipt',
    ]);
  });

  it('rejects a product that claims another product namespace', async () => {
    const projectRoot = await root();
    await writeRegistry(projectRoot, 'skill-ledger', registry);

    const result = await loadProductBlogRegistries(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.registries).toEqual([]);
    expect(result.diagnostics).toContain(
      'BLOG_REGISTRY_NAMESPACE_MISMATCH:skill-ledger',
    );
  });

  it('rejects the whole union when one product registry is invalid', async () => {
    const projectRoot = await root();
    await writeRegistry(projectRoot, 'search-receipt', registry);
    await writeRegistry(projectRoot, 'skill-ledger', {
      schemaVersion: 1,
      siteId: 'unapproved-site',
      title: 'Invalid',
      description: 'Invalid namespace.',
      posts: [],
    });

    const result = await loadProductBlogRegistries(projectRoot);
    expect(result.ok).toBe(false);
    expect(result.registries).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        'BLOG_REGISTRY_NAMESPACE_MISMATCH:skill-ledger',
        'BLOG_SITE_ID_NOT_APPROVED:1',
      ]),
    );
  });

  it('rejects a registry reached through a linked product directory', async () => {
    const rootPath = await root();
    const external = await root();
    await writeRegistry(external, 'search-receipt', registry);
    await mkdir(join(rootPath, 'sites'), { recursive: true });
    await symlink(
      join(external, 'sites', 'search-receipt'),
      join(rootPath, 'sites', 'search-receipt'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await loadProductBlogRegistries(rootPath);
    expect(result.ok).toBe(false);
    expect(result.registries).toEqual([]);
    expect(result.diagnostics).toContain(
      'BLOG_REGISTRY_PATH_INVALID:search-receipt',
    );
  });
});
