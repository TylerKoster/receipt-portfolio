import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPublicBuild, runHashBuildCli } from '../../scripts/hash-build.js';

const EXPECTED_PATHS = [
  'favicon.ico',
  'index.html',
  'portfolio.css',
  'robots.txt',
  'search-receipt/checklists/record-before-escalating-google-search-change/index.html',
  'search-receipt/discover/choose-google-search-guide-or-worksheet/index.html',
  'search-receipt/guides/is-google-search-down-or-my-site/index.html',
  'search-receipt/index.html',
  'search-receipt/investigation-worksheet.js',
  'search-receipt/methodology/index.html',
  `search-receipt/receipts/${'a'.repeat(64)}/index.html`,
  'search-receipt/robots.txt',
  'search-receipt/search-interface.css',
  'search-receipt/search-interface.js',
  'search-receipt/sitemap.xml',
  'search-receipt/sources/index.html',
  'search-receipt/styles.css',
  'search-receipt/topics/example-topic/index.html',
  'search-receipt/worksheets/compare-google-search-status-with-site-evidence/index.html',
  'sitemap.xml',
  'skill-ledger/index.html',
  'skill-ledger/inventory/index.html',
  'skill-ledger/methodology/index.html',
  'skill-ledger/public-inventory-adapter.js',
  'skill-ledger/public-inventory-bootstrap.js',
  'skill-ledger/public-inventory-data.js',
  `skill-ledger/receipts/${'b'.repeat(64)}/index.html`,
  'skill-ledger/robots.txt',
  'skill-ledger/sitemap.xml',
  'skill-ledger/sources/index.html',
  'skill-ledger/styles.css',
  'skill-ledger/topics/example-topic/index.html',
  'video-moment-search/creators/university-of-the-netherlands/index.html',
  'video-moment-search/feed.xml',
  'video-moment-search/index.html',
  'video-moment-search/moments/moment-robots-control/index.html',
  'video-moment-search/search-client.js',
  'video-moment-search/search-index.json',
  'video-moment-search/sitemap-index.xml',
  'video-moment-search/sitemap.xml',
  'video-moment-search/styles.css',
  'video-moment-search/videos/robots-under-control/index.html',
  'workflow-test-lab/index.html',
  'workflow-test-lab/methodology/index.html',
  `workflow-test-lab/receipts/${'c'.repeat(64)}/index.html`,
  'workflow-test-lab/robots.txt',
  'workflow-test-lab/sitemap.xml',
  'workflow-test-lab/sources/index.html',
  'workflow-test-lab/styles.css',
  'workflow-test-lab/topics/example-topic/index.html',
] as const;
const EXPECTED_DIGEST =
  '9b95a02eeb904cd19f4d2ed3c696f8f22f0ec054c0c62c3dcbb2b5de2567583b';

const temporaryDirectories: string[] = [];
let outputDirectory: string;

async function writePublicFile(path: string, contents: string): Promise<void> {
  const destination = join(outputDirectory, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function writeValidPublicTree(): Promise<void> {
  for (const [index, path] of EXPECTED_PATHS.entries()) {
    await writePublicFile(path, `file-${String(index).padStart(2, '0')}`);
  }
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-build-manifest-'));
  temporaryDirectories.push(directory);
  outputDirectory = join(directory, 'sites');
  await writeValidPublicTree();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('public build manifest', () => {
  it('rejects arbitrary blog-like files without an admitted product registry', async () => {
    await writePublicFile(
      'search-receipt/blog/arbitrary/index.html',
      'not admitted',
    );

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /unexpected public output/i,
    );
  });

  it('hashes sorted relative paths and file bytes into the expected aggregate', async () => {
    const manifest = await hashPublicBuild(outputDirectory);
    expect(manifest.digest).toBe(EXPECTED_DIGEST);
    expect(manifest.inventory.map((entry) => entry.path)).toEqual(
      EXPECTED_PATHS,
    );
    expect(manifest.inventory[0]?.sha256).toBe(
      '24d1562a2022b81e26a53f01546bf50f646f747f6a43104d046569199b8f2052',
    );
  });

  it('emits only the stable aggregate digest', async () => {
    const output: string[] = [];

    await expect(
      runHashBuildCli({
        outputDirectory,
        writeOutput: (value) => output.push(value),
      }),
    ).resolves.toBe(0);

    expect(output).toEqual([EXPECTED_DIGEST]);
  });

  it.each([
    ['unexpected root', 'runtime/compiler.js'],
    ['unexpected file', 'search-receipt/compiler.js'],
  ])('rejects an %s in public output', async (_label, path) => {
    await writePublicFile(path, 'compiler artifact');

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /unexpected public output/i,
    );
  });

  it('rejects an incomplete public output inventory', async () => {
    await rm(join(outputDirectory, 'skill-ledger', 'styles.css'));

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /incomplete public output/i,
    );
  });

  it.each(['inventory/index.html', 'public-inventory-adapter.js'])(
    'rejects a missing SkillLedger inventory artifact: %s',
    async (relativePath) => {
      await rm(join(outputDirectory, 'skill-ledger', relativePath));

      await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
        /incomplete public output/i,
      );
    },
  );

  it('rejects a missing Search Receipt investigation handoff route', async () => {
    await rm(
      join(
        outputDirectory,
        'search-receipt',
        'checklists',
        'record-before-escalating-google-search-change',
        'index.html',
      ),
    );

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /incomplete public output/i,
    );
  });

  it.each(['robots.txt', 'sitemap.xml'])(
    'rejects a missing root discovery file: %s',
    async (path) => {
      await rm(join(outputDirectory, path));

      await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
        /incomplete public output/i,
      );
    },
  );

  it('rejects a missing AI Moment Index artifact', async () => {
    await rm(join(outputDirectory, 'video-moment-search', 'search-index.json'));

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /incomplete public output/i,
    );
  });

  it.each([
    'creators/university-of-the-netherlands',
    'moments/moment-robots-control',
    'videos/robots-under-control',
  ])('rejects a missing AI Moment Index discovery route: %s', async (path) => {
    await rm(join(outputDirectory, 'video-moment-search', path), {
      recursive: true,
    });

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /incomplete public output/i,
    );
  });

  it.each([
    'video-moment-search/receipts/unreviewed/index.html',
    'video-moment-search/video-sitemap.xml',
  ])('rejects an unexpected AI Moment Index artifact: %s', async (path) => {
    await writePublicFile(path, 'unreviewed artifact');

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(
      /unexpected public output/i,
    );
  });

  it('rejects a symbolic entry inside AI Moment Index output', async () => {
    const externalDirectory = join(dirname(outputDirectory), 'external-video');
    const linkedDirectory = join(
      outputDirectory,
      'video-moment-search',
      'linked',
    );
    await mkdir(externalDirectory);
    await writeFile(join(externalDirectory, 'index.html'), 'external');
    await symlink(
      externalDirectory,
      linkedDirectory,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(/symbolic/i);
    await expect(
      readFile(join(externalDirectory, 'index.html'), 'utf8'),
    ).resolves.toBe('external');
  });

  it('rejects a symbolic public site root', async () => {
    const linkedSite = join(outputDirectory, 'search-receipt');
    const externalSite = join(dirname(outputDirectory), 'external-site');
    await rm(linkedSite, { recursive: true });
    await mkdir(externalSite);
    await writeFile(join(externalSite, 'index.html'), 'a');
    await writeFile(join(externalSite, 'styles.css'), 'b');
    await symlink(
      externalSite,
      linkedSite,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(hashPublicBuild(outputDirectory)).rejects.toThrow(/symbolic/i);
    await expect(
      readFile(join(externalSite, 'index.html'), 'utf8'),
    ).resolves.toBe('a');
  });
});
