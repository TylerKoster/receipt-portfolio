import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  createReceipt,
  type Receipt,
} from '../../packages/evidence-core/src/index.js';
import { buildSites } from '../../scripts/build-sites.js';
import {
  collectFixturePair,
  verifyEvidenceTree,
} from '../../scripts/evidence-cli.js';

const temporaryDirectories: string[] = [];
let evidenceDirectory: string;

async function collectExamples(directory = evidenceDirectory): Promise<void> {
  await collectFixturePair(
    'search-receipt',
    'status-v1.json',
    'status-v2.json',
    { evidenceDirectory: directory },
  );
  await collectFixturePair(
    'workflow-test-lab',
    undefined,
    'structured-extraction-v1.json',
    { evidenceDirectory: directory },
  );
  await collectFixturePair(
    'skill-ledger',
    undefined,
    'skill-inventory-v1.json',
    { evidenceDirectory: directory },
  );
}

async function receiptPaths(directory = evidenceDirectory): Promise<string[]> {
  const paths: string[] = [];
  const root = join(directory, 'receipts');

  for (const site of await readdir(root)) {
    for (const name of await readdir(join(root, site))) {
      paths.push(join(root, site, name));
    }
  }

  return paths.sort();
}

async function readReceipt(path: string): Promise<Receipt> {
  return JSON.parse(await readFile(path, 'utf8')) as Receipt;
}

async function replaceReceipt(path: string, receipt: Receipt): Promise<string> {
  const replacement = createReceipt(
    receipt.payload as unknown as Parameters<typeof createReceipt>[0],
  );
  const replacementPath = join(dirname(path), `${replacement.id}.json`);
  await rm(path);
  await writeFile(replacementPath, canonicalJson(replacement));
  return replacementPath;
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-final-wave-'));
  temporaryDirectories.push(directory);
  evidenceDirectory = join(directory, 'evidence');
  await collectExamples();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('authenticated examples and retained objects', () => {
  it('binds every controlled fixture receipt to explicit example provenance and content-addressed objects', async () => {
    for (const path of await receiptPaths()) {
      const receipt = (await readReceipt(path)) as unknown as {
        payload: {
          provenance?: { publicationMode?: string; evidenceClass?: string };
          rawObjectPath?: string;
          normalizedObjectPath?: string;
          publicFacts?: unknown;
          interpretation?: string;
          unknowns?: readonly string[];
          gateInputs?: unknown;
        };
      };

      expect(receipt.payload.provenance).toMatchObject({
        publicationMode: 'fixture-example',
        evidenceClass: 'controlled-example',
      });
      expect(receipt.payload.rawObjectPath).toMatch(
        /^objects\/raw\/[a-f0-9]{64}\.bin$/,
      );
      expect(receipt.payload.normalizedObjectPath).toMatch(
        /^objects\/normalized\/[a-f0-9]{64}\.json$/,
      );
      expect(receipt.payload.publicFacts).toBeDefined();
      expect(receipt.payload.interpretation).toEqual(expect.any(String));
      expect(receipt.payload.unknowns).not.toHaveLength(0);
      expect(receipt.payload.gateInputs).toBeDefined();
    }

    await expect(
      verifyEvidenceTree(evidenceDirectory),
    ).resolves.toBeUndefined();
  });

  it('rejects changed retained object bytes even when receipt bytes are untouched', async () => {
    const receipt = (await readReceipt(
      (await receiptPaths())[0]!,
    )) as unknown as {
      payload: { rawObjectPath?: string };
    };
    expect(receipt.payload.rawObjectPath).toEqual(expect.any(String));
    await writeFile(
      join(evidenceDirectory, receipt.payload.rawObjectPath!),
      'changed',
    );

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /object|hash/i,
    );
  });
});

describe('manifest, receipt path, and chain authority', () => {
  it('rejects a canonical re-key bound to a fabricated manifest digest', async () => {
    const path = (await receiptPaths())[0]!;
    const receipt = await readReceipt(path);
    await replaceReceipt(path, {
      ...receipt,
      payload: { ...receipt.payload, manifestSha256: 'f'.repeat(64) },
    });

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /manifest/i,
    );
  });

  it('rejects a canonical re-key with a deleted predecessor', async () => {
    const paths = await receiptPaths();
    let actualChildPath: string | undefined;
    for (const path of paths) {
      if (
        (await readReceipt(path)).payload.predecessorReceiptId !== undefined
      ) {
        actualChildPath = path;
        break;
      }
    }
    expect(actualChildPath).toEqual(expect.any(String));
    const child = await readReceipt(actualChildPath!);
    await replaceReceipt(actualChildPath!, {
      ...child,
      payload: {
        ...child.payload,
        predecessorReceiptId: '0'.repeat(64),
      },
    });

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /predecessor/i,
    );
  });

  it('rejects a canonical cross-source predecessor and a policy re-key', async () => {
    const paths = await receiptPaths();
    const search = await readReceipt(
      paths.find((path) => basename(dirname(path)) === 'search-receipt')!,
    );
    const skillPath = paths.find(
      (path) => basename(dirname(path)) === 'skill-ledger',
    )!;
    const skill = await readReceipt(skillPath);
    const crossSourcePath = await replaceReceipt(skillPath, {
      ...skill,
      payload: {
        ...skill.payload,
        predecessorReceiptId: search.id,
      },
    });

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /predecessor|source/i,
    );

    await rm(crossSourcePath);
    await writeFile(skillPath, canonicalJson(skill));
    await replaceReceipt(skillPath, {
      ...skill,
      payload: {
        ...skill.payload,
        policy: { decision: 'REJECTED', reasonCodes: ['INCOMPLETE_EVIDENCE'] },
      },
    });
    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /policy/i,
    );
  });

  it('rejects duplicate IDs and receipts outside the exact site/id path', async () => {
    const path = (await receiptPaths())[0]!;
    const duplicateDirectory = join(
      evidenceDirectory,
      'receipts',
      'workflow-test-lab',
    );
    await cp(path, join(duplicateDirectory, basename(path)));
    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /duplicate/i,
    );

    await rm(join(duplicateDirectory, basename(path)));
    const nestedDirectory = join(dirname(path), 'nested');
    await mkdir(nestedDirectory);
    await rename(path, join(nestedDirectory, basename(path)));
    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /path/i,
    );
  });

  it('rejects a linked receipts entry without reading its external target', async () => {
    const external = join(dirname(evidenceDirectory), 'external-receipts');
    await mkdir(external);
    const sentinel = join(external, 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    await symlink(
      external,
      join(evidenceDirectory, 'receipts', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toThrow(
      /symbolic|linked|regular/i,
    );
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });
});

describe('distinct factual product and SEO surfaces', () => {
  it('renders recognizable allowlisted facts and the required deterministic surface inventory', async () => {
    const outputDirectory = join(dirname(evidenceDirectory), 'sites');
    await buildSites({ evidenceDirectory, outputDirectory });

    const expectedFacts = {
      'search-receipt': ['resolved', 'Search availability'],
      'workflow-test-lab': [
        'structured field extraction',
        'local-rights-cleared-example-v1',
      ],
      'skill-ledger': ['example-static-skill-package', 'MIT'],
    } as const;

    for (const [siteId, facts] of Object.entries(expectedFacts)) {
      const home = await readFile(
        join(outputDirectory, siteId, 'index.html'),
        'utf8',
      );
      expect(home).toContain('Controlled fixture example');
      expect(home).toContain(
        `<link rel="canonical" href="https://receipt-portfolio.example/${siteId}/">`,
      );
      expect(home).toContain('Content-Security-Policy');
      expect(home).toContain('<nav aria-label="Primary navigation">');
      expect(home).toContain('<main id="main-content"');
      expect(home).not.toContain('application/ld+json');
      expect(home).not.toMatch(/<script\s+src=|<img\s|fonts\.|@import/i);
      for (const fact of facts) expect(home).toContain(fact);
      await expect(
        lstat(join(outputDirectory, siteId, 'methodology', 'index.html')),
      ).resolves.toMatchObject({});
      await expect(
        lstat(join(outputDirectory, siteId, 'sources', 'index.html')),
      ).resolves.toMatchObject({});
      await expect(
        readFile(join(outputDirectory, siteId, 'sitemap.xml'), 'utf8'),
      ).resolves.toContain('/receipts/');
      await expect(
        readFile(join(outputDirectory, siteId, 'robots.txt'), 'utf8'),
      ).resolves.toContain('Sitemap:');

      const receiptIds = await readdir(
        join(outputDirectory, siteId, 'receipts'),
      );
      expect(receiptIds.length).toBeGreaterThan(0);
      const detail = await readFile(
        join(outputDirectory, siteId, 'receipts', receiptIds[0]!, 'index.html'),
        'utf8',
      );
      expect(detail).toContain(
        `<link rel="canonical" href="https://receipt-portfolio.example/${siteId}/receipts/${receiptIds[0]}/">`,
      );
      expect(detail).toContain('application/ld+json');
      expect(detail).toContain('"@type":"Article"');
      expect(detail).toContain('<h2>Receipt detail</h2>');
    }

    const inventory: string[] = [];
    async function visit(path: string): Promise<void> {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) await visit(entryPath);
        else
          inventory.push(
            relative(outputDirectory, entryPath).split(sep).join('/'),
          );
      }
    }
    await visit(outputDirectory);
    expect(
      inventory.some((path) =>
        /\/receipts\/[a-f0-9]{64}\/index\.html$/.test(path),
      ),
    ).toBe(true);
    expect(
      inventory.some((path) => /\/topics\/[a-z0-9-]+\/index\.html$/.test(path)),
    ).toBe(true);
  });
});
