import { execFile } from 'node:child_process';
import type { PathLike, RmOptions } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  type Receipt,
} from '../../packages/evidence-core/src/index.js';
import {
  buildSites,
  EVIDENCE_DIRECTORY_ENV,
  OUTPUT_DIRECTORY_ENV,
  PUBLIC_BASE_URL_ENV,
} from '../../scripts/build-sites.js';
import { collectFixturePair } from '../../scripts/evidence-cli.js';
import { searchReceiptSite } from '../../sites/search-receipt/index.js';
import { escapeHtml, renderSite } from '../../sites/shared/render.js';

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );

  return { ...actual, rm: vi.fn(actual.rm) };
});

const realFileSystem =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const mockedRm = vi.mocked(rm);

const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; style-src 'self'; script-src 'none'\">";
const SITE_HEADINGS = {
  'search-receipt': 'Search Receipt',
  'skill-ledger': 'SkillLedger',
  'workflow-test-lab': 'Workflow Test Lab',
} as const;
const BACKUP_OWNER_MARKER = '.receipt-portfolio-backup-owner.json';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];
let testEvidenceDirectory: string;
let outputDirectory: string;

type ProductionBuildExecutor = (
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
  },
) => Promise<unknown>;

const executeProductionBuild: ProductionBuildExecutor = async (
  command,
  arguments_,
  options,
) => {
  await execFileAsync(command, [...arguments_], options);
};

async function searchReceiptEntries(): Promise<
  readonly { readonly path: string; readonly receipt: Receipt }[]
> {
  const directory = join(testEvidenceDirectory, 'receipts', 'search-receipt');
  return Promise.all(
    (await readdir(directory)).map(async (name) => ({
      path: join(directory, name),
      receipt: JSON.parse(
        await readFile(join(directory, name), 'utf8'),
      ) as Receipt,
    })),
  );
}

async function collectAcceptedFixtures(): Promise<void> {
  await collectFixturePair(
    'search-receipt',
    'status-v1.json',
    'status-v2.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
  await collectFixturePair(
    'workflow-test-lab',
    undefined,
    'structured-extraction-v1.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
  await collectFixturePair(
    'skill-ledger',
    undefined,
    'skill-inventory-v1.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
}

async function fileInventory(
  directory: string,
): Promise<Record<string, string>> {
  const inventory: Record<string, string> = {};

  async function visit(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        inventory[relative(directory, path).split(sep).join('/')] = (
          await readFile(path)
        ).toString('base64');
      }
    }
  }

  await visit(directory);
  return inventory;
}

async function runProductionBuild(options?: {
  readonly executor?: ProductionBuildExecutor;
  readonly evidenceDirectory?: string;
  readonly outputDirectory?: string;
  readonly publicBaseUrl?: string;
  readonly runtimeDirectory?: string;
}): Promise<void> {
  const command = options?.runtimeDirectory
    ? process.execPath
    : process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : 'npm';
  const arguments_ = options?.runtimeDirectory
    ? [join(options.runtimeDirectory, 'scripts', 'build-sites.js')]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run build']
      : ['run', 'build'];
  await (options?.executor ?? executeProductionBuild)(command, arguments_, {
    cwd: projectRoot,
    env: {
      ...process.env,
      [EVIDENCE_DIRECTORY_ENV]:
        options?.evidenceDirectory ?? testEvidenceDirectory,
      [OUTPUT_DIRECTORY_ENV]: options?.outputDirectory ?? outputDirectory,
      ...(options?.publicBaseUrl === undefined
        ? {}
        : { [PUBLIC_BASE_URL_ENV]: options.publicBaseUrl }),
    },
  });
}

async function compileIsolatedProductionRuntime(
  runtimeDirectory: string,
): Promise<void> {
  const tscBin = require.resolve('typescript/bin/tsc');
  await execFileAsync(
    process.execPath,
    [tscBin, '-p', 'tsconfig.json', '--outDir', runtimeDirectory],
    { cwd: projectRoot },
  );
}

beforeEach(async () => {
  mockedRm.mockImplementation(realFileSystem.rm);
  const directory = await mkdtemp(join(tmpdir(), 'receipt-sites-'));
  temporaryDirectories.push(directory);
  testEvidenceDirectory = join(directory, 'evidence');
  outputDirectory = join(directory, 'sites');
  await collectAcceptedFixtures();
});

afterEach(async () => {
  mockedRm.mockImplementation(realFileSystem.rm);
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('static receipt site build', () => {
  it('rejects the trusted workspace itself as an output root', async () => {
    const trustedWorkspaceDirectory = join(
      dirname(outputDirectory),
      'trusted-workspace-root',
    );
    await mkdir(trustedWorkspaceDirectory);
    const sentinel = join(trustedWorkspaceDirectory, 'workspace-sentinel.txt');
    await writeFile(sentinel, 'workspace');

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: trustedWorkspaceDirectory,
        trustedWorkspaceDirectory,
      }),
    ).rejects.toThrow(/strict descendant|workspace contract/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('workspace');
  });

  it('rejects a linked output ancestor and preserves the external sentinel', async () => {
    const root = dirname(outputDirectory);
    const project = join(root, 'linked-ancestor-project');
    const external = join(root, 'linked-ancestor-external');
    await mkdir(project);
    await mkdir(join(external, 'sites'), { recursive: true });
    const sentinel = join(external, 'sites', 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    await symlink(
      external,
      join(project, 'dist'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: join(project, 'dist', 'sites'),
      }),
    ).rejects.toThrow(/symbolic|reparse|linked|ancestor/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('rejects a linked output root and preserves the external sentinel', async () => {
    const root = dirname(outputDirectory);
    const project = join(root, 'linked-root-project');
    const external = join(root, 'linked-root-external');
    await mkdir(project);
    await mkdir(external);
    const sentinel = join(external, 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    const linkedOutput = join(project, 'sites');
    await symlink(
      external,
      linkedOutput,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: linkedOutput,
      }),
    ).rejects.toThrow(/symbolic|reparse|linked|output root/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('rejects a linked recovery entry and preserves the external sentinel', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const external = join(dirname(outputDirectory), 'linked-recovery-external');
    await mkdir(external);
    const sentinel = join(external, 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    await symlink(
      external,
      `${outputDirectory}.previous`,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({ evidenceDirectory: testEvidenceDirectory, outputDirectory }),
    ).rejects.toThrow(/recovery|symbolic|reparse|linked|owned/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('renders one named static home page per portfolio site', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    for (const [siteId, heading] of Object.entries(SITE_HEADINGS)) {
      await expect(
        readFile(join(outputDirectory, siteId, 'index.html'), 'utf8'),
      ).resolves.toContain(heading);
    }
  });

  it.each([
    'http://tylerkoster.github.io/receipt-portfolio/',
    '/receipt-portfolio/',
    'https://user@tylerkoster.github.io/receipt-portfolio/',
    'https://tylerkoster.github.io/receipt-portfolio/?',
    'https://tylerkoster.github.io/receipt-portfolio/#',
    'https://tylerkoster.github.io/receipt-portfolio/?#',
    'https://tylerkoster.github.io/receipt-portfolio/?preview=true',
    'https://tylerkoster.github.io/receipt-portfolio/#preview',
  ])('rejects the invalid public base URL %s', async (publicBaseUrl) => {
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl,
    };

    await expect(buildSites(options)).rejects.toThrow(/public base|https/i);
  });

  it('uses the local placeholder base by default', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const home = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(home).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/search-receipt/">',
    );
    expect(home).toContain('href="/search-receipt/styles.css"');
  });

  it('normalizes a production base and includes its project path exactly once on every URL surface', async () => {
    const publicBaseUrl = 'https://tylerkoster.github.io/receipt-portfolio////';
    const productionBase = 'https://tylerkoster.github.io/receipt-portfolio/';
    const projectPath = '/receipt-portfolio/';
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl,
    };
    await buildSites(options);

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      const siteBase = `${productionBase}${siteId}/`;
      const home = await readFile(
        join(outputDirectory, siteId, 'index.html'),
        'utf8',
      );
      const sitemap = await readFile(
        join(outputDirectory, siteId, 'sitemap.xml'),
        'utf8',
      );
      const robots = await readFile(
        join(outputDirectory, siteId, 'robots.txt'),
        'utf8',
      );
      const receiptIds = await readdir(
        join(outputDirectory, siteId, 'receipts'),
      );
      const receiptId = receiptIds[0]!;
      const detail = await readFile(
        join(outputDirectory, siteId, 'receipts', receiptId, 'index.html'),
        'utf8',
      );
      const topicSlugs = await readdir(join(outputDirectory, siteId, 'topics'));
      const nestedPages = await Promise.all([
        readFile(
          join(outputDirectory, siteId, 'methodology', 'index.html'),
          'utf8',
        ),
        readFile(
          join(outputDirectory, siteId, 'sources', 'index.html'),
          'utf8',
        ),
        readFile(
          join(outputDirectory, siteId, 'topics', topicSlugs[0]!, 'index.html'),
          'utf8',
        ),
        Promise.resolve(detail),
      ]);

      expect(home).toContain(`<link rel="canonical" href="${siteBase}">`);
      expect(home).toContain(`href="${projectPath}${siteId}/styles.css"`);
      expect(sitemap).toContain(`<loc>${siteBase}receipts/${receiptId}/</loc>`);
      expect(robots).toContain(`Sitemap: ${siteBase}sitemap.xml`);
      expect(detail).toContain(`"url":"${siteBase}receipts/${receiptId}/"`);
      expect(detail).toContain(`href="${projectPath}${siteId}/methodology/"`);
      expect(detail).toContain(`href="${projectPath}${siteId}/styles.css"`);
      for (const nestedPage of nestedPages) {
        expect(nestedPage).toContain(
          `href="${projectPath}${siteId}/methodology/"`,
        );
        expect(nestedPage).toContain(
          `href="${projectPath}${siteId}/styles.css"`,
        );
        expect(nestedPage).not.toContain(
          '/receipt-portfolio/receipt-portfolio/',
        );
      }
      for (const href of detail.matchAll(/href="(\/[^"#]*)"/g)) {
        expect(href[1]).toMatch(/^\/receipt-portfolio\//);
      }
      expect(`${home}\n${sitemap}\n${robots}\n${detail}`).not.toContain(
        '/receipt-portfolio/receipt-portfolio/',
      );
    }
  });

  it('renders one root portfolio hub alongside exactly three product directories', async () => {
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl: 'https://tylerkoster.github.io/receipt-portfolio/',
    };
    await buildSites(options);

    const entries = await readdir(outputDirectory, { withFileTypes: true });
    expect(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ).toEqual(Object.keys(SITE_HEADINGS).sort());
    expect(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
    ).toEqual(['index.html', 'portfolio.css']);

    const hub = await readFile(join(outputDirectory, 'index.html'), 'utf8');
    expect(hub).toContain('Evidence receipt portfolio');
    expect(hub).toContain(
      'Controlled examples are not live or current source evidence.',
    );
    expect(hub).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/">',
    );
    expect(hub).toContain('href="/receipt-portfolio/portfolio.css"');
    for (const siteId of Object.keys(SITE_HEADINGS)) {
      expect(hub).toContain(`href="/receipt-portfolio/${siteId}/"`);
    }
    expect(hub).toContain('Content-Security-Policy');
    expect(hub).not.toMatch(/<script\b|<img\b|https?:\/\/[^"']+\.(?:css|js)/i);
  });

  it('replaces arbitrary stale roots and files with exactly three standalone sites', async () => {
    await mkdir(join(outputDirectory, 'obsolete-root'), { recursive: true });
    await writeFile(join(outputDirectory, 'obsolete-root', 'old.html'), 'old');

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      await mkdir(join(outputDirectory, siteId), { recursive: true });
      await writeFile(join(outputDirectory, siteId, 'obsolete.js'), 'old');
    }

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const entries = await readdir(outputDirectory, { withFileTypes: true });
    expect(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ).toEqual(Object.keys(SITE_HEADINGS).sort());
    expect(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
    ).toEqual(['index.html', 'portfolio.css']);

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      const html = await readFile(
        join(outputDirectory, siteId, 'index.html'),
        'utf8',
      );
      const styles = await readFile(
        join(outputDirectory, siteId, 'styles.css'),
        'utf8',
      );
      expect(html).toContain(CSP);
      expect(html).toContain(`href="/${siteId}/styles.css"`);
      expect(styles).toContain('--accent');
    }

    const inventory = Object.keys(await fileInventory(outputDirectory));
    for (const siteId of Object.keys(SITE_HEADINGS)) {
      expect(inventory).toEqual(
        expect.arrayContaining([
          `${siteId}/index.html`,
          `${siteId}/methodology/index.html`,
          `${siteId}/sources/index.html`,
          `${siteId}/sitemap.xml`,
          `${siteId}/robots.txt`,
          `${siteId}/styles.css`,
        ]),
      );
    }
    expect(inventory.some((path) => /\/receipts\//.test(path))).toBe(true);
    expect(inventory.some((path) => /\/topics\//.test(path))).toBe(true);
  });

  it('makes an incremental build byte-equal to a clean build after evidence changes', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    await mkdir(join(outputDirectory, 'obsolete-root'), { recursive: true });
    await writeFile(join(outputDirectory, 'obsolete-root', 'old.html'), 'old');
    await writeFile(
      join(outputDirectory, 'search-receipt', 'obsolete.js'),
      'old',
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const incrementalInventory = await fileInventory(outputDirectory);
    const cleanOutputDirectory = join(dirname(outputDirectory), 'clean-sites');
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory: cleanOutputDirectory,
    });

    expect(incrementalInventory).toEqual(
      await fileInventory(cleanOutputDirectory),
    );
  });

  it('refuses an unrelated recovery sibling without changing either tree', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const publicInventory = await fileInventory(outputDirectory);
    const backupDirectory = `${outputDirectory}.previous`;
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(
      join(backupDirectory, 'unrelated-sentinel.txt'),
      'must remain',
    );
    const unrelatedInventory = await fileInventory(backupDirectory);

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).rejects.toThrow(/not builder-owned/i);

    expect(await fileInventory(outputDirectory)).toEqual(publicInventory);
    expect(await fileInventory(backupDirectory)).toEqual(unrelatedInventory);
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.startsWith(`.${basename(outputDirectory)}-stage-`),
      ),
    ).toEqual([]);
  });

  it('reports post-install cleanup debt without failing publication and clears it next run', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const previousInventory = await fileInventory(outputDirectory);
    const cleanupError = Object.assign(new Error('simulated locked backup'), {
      code: 'EPERM',
    });
    mockedRm.mockImplementation(
      async (path: PathLike, options?: RmOptions): Promise<void> => {
        if (String(path).endsWith('.previous')) {
          try {
            await realFileSystem.stat(path);
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              error.code === 'ENOENT'
            ) {
              return realFileSystem.rm(path, options);
            }

            throw error;
          }

          throw cleanupError;
        }

        return realFileSystem.rm(path, options);
      },
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).resolves.toBeUndefined();

    const backupDirectory = `${outputDirectory}.previous`;
    expect(
      await readFile(
        join(outputDirectory, 'search-receipt', 'index.html'),
        'utf8',
      ),
    ).toContain('Controlled fixture example');
    const marker = JSON.parse(
      await readFile(join(backupDirectory, BACKUP_OWNER_MARKER), 'utf8'),
    ) as unknown;
    expect(marker).toEqual({
      canonicalOutputPath: resolve(outputDirectory),
      canonicalParentPath: resolve(dirname(outputDirectory)),
      canonicalRecoveryPath: resolve(backupDirectory),
      formatVersion: 2,
      owner: 'receipt-portfolio-static-site-builder',
    });
    const backupInventory = await fileInventory(backupDirectory);
    delete backupInventory[BACKUP_OWNER_MARKER];
    expect(backupInventory).toEqual(previousInventory);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('SITE_OUTPUT_CLEANUP_DEBT'),
    );

    const publishedInventory = await fileInventory(outputDirectory);
    const recoveryInventory = await fileInventory(backupDirectory);
    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).rejects.toThrow(/Cannot clear prior site output cleanup debt/);
    expect(await fileInventory(outputDirectory)).toEqual(publishedInventory);
    expect(await fileInventory(backupDirectory)).toEqual(recoveryInventory);
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.startsWith(`.${basename(outputDirectory)}-stage-`),
      ),
    ).toEqual([]);

    mockedRm.mockImplementation(realFileSystem.rm);
    warning.mockRestore();
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    await expect(readdir(backupDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      await readFile(
        join(outputDirectory, 'search-receipt', 'index.html'),
        'utf8',
      ),
    ).toContain('Controlled fixture example');
  });

  it('keeps compiler artifacts outside the real production site output', async () => {
    const canonicalEvidenceDirectory = join(projectRoot, 'evidence');
    const originalEvidence = await fileInventory(canonicalEvidenceDirectory);
    await runProductionBuild();

    expect(await fileInventory(canonicalEvidenceDirectory)).toEqual(
      originalEvidence,
    );

    const inventory = Object.keys(await fileInventory(outputDirectory));
    expect(inventory).toContain('search-receipt/methodology/index.html');
    expect(inventory).toContain('skill-ledger/sources/index.html');
    expect(inventory).toContain('workflow-test-lab/sitemap.xml');
    expect(inventory.some((path) => /\/receipts\//.test(path))).toBe(true);
    await expect(
      readFile(
        join(projectRoot, 'dist', 'runtime', 'scripts', 'build-sites.js'),
        'utf8',
      ),
    ).resolves.toContain('buildSites');
  });

  it('uses the CLI environment adapter for the production Pages base', async () => {
    await runProductionBuild({
      publicBaseUrl: 'https://tylerkoster.github.io/receipt-portfolio/',
    });

    const home = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(home).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/">',
    );
    expect(home).toContain(
      'href="/receipt-portfolio/search-receipt/styles.css"',
    );
  });

  it('runs an isolated compiled runtime without invoking npm compilation', async () => {
    const isolatedRuntime = join(dirname(outputDirectory), 'runtime-a');
    const calls: unknown[][] = [];

    await runProductionBuild({
      executor: async (command, arguments_, options) => {
        calls.push([command, arguments_, options.cwd]);
      },
      runtimeDirectory: isolatedRuntime,
    });

    expect(calls).toEqual([
      [
        process.execPath,
        [join(isolatedRuntime, 'scripts', 'build-sites.js')],
        projectRoot,
      ],
    ]);
  });

  it('keeps canonical evidence byte-equal across concurrent production-build processes', async () => {
    const canonicalEvidenceDirectory = join(projectRoot, 'evidence');
    const originalEvidence = await fileInventory(canonicalEvidenceDirectory);
    await realFileSystem.mkdir(join(projectRoot, 'dist'), { recursive: true });
    const isolatedRuntimeRoot = await realFileSystem.mkdtemp(
      join(projectRoot, 'dist', '.concurrent-runtime-'),
    );
    temporaryDirectories.push(isolatedRuntimeRoot);
    const firstOutput = join(isolatedRuntimeRoot, 'output-a');
    const secondOutput = join(isolatedRuntimeRoot, 'output-b');
    const compiledRuntime = join(
      isolatedRuntimeRoot,
      'compiled-runtime-source',
    );
    const firstRuntime = join(isolatedRuntimeRoot, 'runtime-a');
    const secondRuntime = join(isolatedRuntimeRoot, 'runtime-b');
    const firstEvidence = join(isolatedRuntimeRoot, 'evidence-a');
    const secondEvidence = join(isolatedRuntimeRoot, 'evidence-b');
    const acceptedFixtureEvidence = await fileInventory(testEvidenceDirectory);
    await Promise.all([
      realFileSystem.cp(testEvidenceDirectory, firstEvidence, {
        recursive: true,
      }),
      realFileSystem.cp(testEvidenceDirectory, secondEvidence, {
        recursive: true,
      }),
    ]);

    await compileIsolatedProductionRuntime(compiledRuntime);
    await Promise.all([
      realFileSystem.cp(compiledRuntime, firstRuntime, { recursive: true }),
      realFileSystem.cp(compiledRuntime, secondRuntime, { recursive: true }),
    ]);
    await Promise.all([
      realFileSystem.cp(
        join(projectRoot, 'manifests'),
        join(firstRuntime, 'manifests'),
        { recursive: true },
      ),
      realFileSystem.cp(
        join(projectRoot, 'manifests'),
        join(secondRuntime, 'manifests'),
        { recursive: true },
      ),
    ]);
    await Promise.all([
      realFileSystem.copyFile(
        join(projectRoot, 'sites', 'shared', 'styles.css'),
        join(firstRuntime, 'sites', 'shared', 'styles.css'),
      ),
      realFileSystem.copyFile(
        join(projectRoot, 'sites', 'shared', 'styles.css'),
        join(secondRuntime, 'sites', 'shared', 'styles.css'),
      ),
    ]);

    const evidenceRootsUsed: string[] = [];
    const recordingExecutor: ProductionBuildExecutor = async (
      command,
      arguments_,
      options,
    ) => {
      evidenceRootsUsed.push(options.env[EVIDENCE_DIRECTORY_ENV] ?? '');
      await executeProductionBuild(command, arguments_, options);
    };
    await Promise.all([
      runProductionBuild({
        evidenceDirectory: firstEvidence,
        executor: recordingExecutor,
        outputDirectory: firstOutput,
        runtimeDirectory: firstRuntime,
      }),
      runProductionBuild({
        evidenceDirectory: secondEvidence,
        executor: recordingExecutor,
        outputDirectory: secondOutput,
        runtimeDirectory: secondRuntime,
      }),
    ]);

    expect(evidenceRootsUsed.sort()).toEqual(
      [firstEvidence, secondEvidence].sort(),
    );
    expect(await fileInventory(firstEvidence)).toEqual(acceptedFixtureEvidence);
    expect(await fileInventory(secondEvidence)).toEqual(
      acceptedFixtureEvidence,
    );
    expect(await fileInventory(canonicalEvidenceDirectory)).toEqual(
      originalEvidence,
    );
    await expect(
      readFile(join(firstOutput, 'search-receipt', 'index.html'), 'utf8'),
    ).resolves.toContain('Search Receipt');
    await expect(
      readFile(join(secondOutput, 'skill-ledger', 'index.html'), 'utf8'),
    ).resolves.toContain('SkillLedger');
    await expect(
      readFile(join(firstOutput, 'search-receipt', 'index.html'), 'utf8'),
    ).resolves.toContain('Controlled fixture example');
    await expect(
      readFile(join(secondOutput, 'search-receipt', 'index.html'), 'utf8'),
    ).resolves.toContain('Controlled fixture example');
  });

  it('omits a REVIEW_REQUIRED record from public rendering', async () => {
    const receipt = (await searchReceiptEntries())[0]!.receipt;
    const held = {
      ...receipt,
      payload: {
        ...receipt.payload,
        policy: {
          decision: 'REVIEW_REQUIRED' as const,
          reasonCodes: ['AMBIGUOUS_OR_LARGE_CHANGE'],
        },
      },
    };
    expect(renderSite(searchReceiptSite, [held])).not.toContain(
      receipt.payload.sourceId,
    );
  });

  it('escapes hostile source text rather than rendering markup', async () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    const receipt = (await searchReceiptEntries())[0]!.receipt;
    const hostile = {
      ...receipt,
      payload: {
        ...receipt.payload,
        publicFacts: {
          ...receipt.payload.publicFacts,
          summary: '<script>alert("receipt")</script>',
        },
      },
    } as Receipt;
    const html = renderSite(searchReceiptSite, [hostile]);
    expect(html).not.toContain('<script>alert("receipt")</script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;receipt&quot;)&lt;/script&gt;',
    );
  });

  it('escapes all five HTML-sensitive characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('rejects a mutated receipt before rendering any public page', async () => {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, 'previous.html'), 'previous output');
    const entry = (await searchReceiptEntries())[0]!;
    const receipt = entry.receipt;
    const path = entry.path;
    const mutatedReceipt = {
      ...receipt,
      payload: { ...receipt.payload, sourceId: 'mutated-source' },
    };
    await writeFile(path, canonicalJson(mutatedReceipt));

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).rejects.toThrow(/digest/i);
    await expect(
      readFile(join(outputDirectory, 'previous.html'), 'utf8'),
    ).resolves.toBe('previous output');
    expect(await readdir(outputDirectory)).toEqual(['previous.html']);
  });
});
