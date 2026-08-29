import { execFile } from 'node:child_process';
import type { PathLike, RmOptions } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  createReceipt,
  type GateDecision,
  type Receipt,
} from '../../packages/evidence-core/src/index.js';
import { buildSites } from '../../scripts/build-sites.js';
import { collectFixturePair } from '../../scripts/evidence-cli.js';
import { escapeHtml } from '../../sites/shared/render.js';

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
const temporaryDirectories: string[] = [];
let testEvidenceDirectory: string;
let outputDirectory: string;

async function writeReceipt(receipt: Receipt): Promise<string> {
  const path = join(
    testEvidenceDirectory,
    'receipts',
    receipt.payload.siteId,
    `${receipt.id}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalJson(receipt));
  return path;
}

function testReceipt(options: {
  decision?: GateDecision;
  siteId?: keyof typeof SITE_HEADINGS;
  sourceId: string;
  sourceUrl?: string;
}): Receipt {
  return createReceipt({
    siteId: options.siteId ?? 'search-receipt',
    sourceId: options.sourceId,
    observedAt: '2026-08-29T12:30:00.000Z',
    sourceUrl: options.sourceUrl ?? 'https://example.invalid/source',
    manifestSha256: 'a'.repeat(64),
    rawSha256: 'b'.repeat(64),
    normalizedSha256: 'c'.repeat(64),
    policy: {
      decision: options.decision ?? 'PASS',
      reasonCodes: ['SOURCE_FACTS_ONLY'],
    },
  });
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

async function runProductionBuild(): Promise<void> {
  const command =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const arguments_ =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run build']
      : ['run', 'build'];
  await execFileAsync(command, arguments_, { cwd: projectRoot });
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
      expect(html).toContain('href="styles.css"');
      expect(styles).toContain('--accent');
    }

    expect(Object.keys(await fileInventory(outputDirectory)).sort()).toEqual([
      'search-receipt/index.html',
      'search-receipt/styles.css',
      'skill-ledger/index.html',
      'skill-ledger/styles.css',
      'workflow-test-lab/index.html',
      'workflow-test-lab/styles.css',
    ]);
  });

  it('makes an incremental build byte-equal to a clean build after evidence changes', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    await writeReceipt(testReceipt({ sourceId: 'newly-accepted-record' }));
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
    await writeReceipt(testReceipt({ sourceId: 'cleanup-debt-new-record' }));
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
    ).toContain('cleanup-debt-new-record');
    const marker = JSON.parse(
      await readFile(join(backupDirectory, BACKUP_OWNER_MARKER), 'utf8'),
    ) as unknown;
    expect(marker).toEqual({
      formatVersion: 1,
      outputDirectory: resolve(outputDirectory),
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
    ).toContain('cleanup-debt-new-record');
  });

  it('keeps compiler artifacts outside the real production site output', async () => {
    await runProductionBuild();

    expect(
      Object.keys(
        await fileInventory(join(projectRoot, 'dist', 'sites')),
      ).sort(),
    ).toEqual([
      'search-receipt/index.html',
      'search-receipt/styles.css',
      'skill-ledger/index.html',
      'skill-ledger/styles.css',
      'workflow-test-lab/index.html',
      'workflow-test-lab/styles.css',
    ]);
    await expect(
      readFile(
        join(projectRoot, 'dist', 'runtime', 'scripts', 'build-sites.js'),
        'utf8',
      ),
    ).resolves.toContain('buildSites');
  });

  it('omits a REVIEW_REQUIRED record from public pages', async () => {
    await writeReceipt(
      testReceipt({
        decision: 'REVIEW_REQUIRED',
        sourceId: 'held-record-must-not-render',
      }),
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const html = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(html).not.toContain('held-record-must-not-render');
  });

  it('escapes hostile source text rather than rendering markup', async () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    await writeReceipt(
      testReceipt({ sourceId: '<script>alert("receipt")</script>' }),
    );
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const html = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(html).not.toContain('<script>alert("receipt")</script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;receipt&quot;)&lt;/script&gt;',
    );
  });

  it('escapes all five HTML-sensitive characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('renders an invalid source URL as inert escaped text', async () => {
    await writeReceipt(
      testReceipt({
        sourceId: 'invalid-url-record',
        sourceUrl: 'javascript:<script>alert(1)</script>',
      }),
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const html = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain(
      'Invalid source URL: javascript:&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('rejects a mutated receipt before rendering any public page', async () => {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, 'previous.html'), 'previous output');
    const receipt = testReceipt({ sourceId: 'mutation-target' });
    const path = await writeReceipt(receipt);
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
