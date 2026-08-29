import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  verifyReceipt,
  type Receipt,
} from '../../packages/evidence-core/src/index.js';
import {
  collectFixturePair,
  runEvidenceMutationCheck,
  verifyEvidenceTree,
} from '../../scripts/evidence-cli.js';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const temporaryDirectories: string[] = [];
let testEvidenceDirectory: string;

async function receiptTreeInventory(
  evidenceDirectory: string,
): Promise<Record<string, string>> {
  const receiptsDirectory = join(evidenceDirectory, 'receipts');
  const inventory: Record<string, string> = {};

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        inventory[relative(receiptsDirectory, path).split(sep).join('/')] = (
          await readFile(path)
        ).toString('base64');
      }
    }
  }

  await visit(receiptsDirectory);
  return inventory;
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-pipeline-'));
  temporaryDirectories.push(directory);
  testEvidenceDirectory = join(directory, 'evidence');
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('fixture-backed evidence pipeline', () => {
  it('creates a verifiable, source-bound receipt from a changed status fixture', async () => {
    const result = await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );

    expect(result.receipt.payload.policy.decision).toBe('PASS');
    expect(() => verifyReceipt(result.receipt)).not.toThrow();
    expect(result.receipt.payload.predecessorReceiptId).toBeDefined();
  });

  it.each([
    [
      'workflow-test-lab',
      'structured-extraction-v1.json',
      'structured-extraction',
    ],
    ['skill-ledger', 'skill-inventory-v1.json', 'example-skill-archive'],
  ] as const)(
    'creates a valid PASS first-seen receipt for %s',
    async (siteId, fixtureName, expectedSourceId) => {
      const result = await collectFixturePair(siteId, undefined, fixtureName, {
        evidenceDirectory: testEvidenceDirectory,
      });

      expect(result.receipt.payload.sourceId).toBe(expectedSourceId);
      expect(result.receipt.payload.policy.decision).toBe('PASS');
      expect(result.receipt.payload.predecessorReceiptId).toBeUndefined();
      expect(() => verifyReceipt(result.receipt)).not.toThrow();
      await expect(
        verifyEvidenceTree(testEvidenceDirectory),
      ).resolves.toBeUndefined();
    },
  );

  it('accepts an idempotent rerun only when canonical receipt bytes are equal', async () => {
    const first = await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    const firstBytes = await readFile(first.path);

    const second = await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );

    expect(second.path).toBe(first.path);
    expect(await readFile(second.path)).toEqual(firstBytes);
  });

  it('rejects an append-only receipt collision with unequal existing bytes', async () => {
    const result = await collectFixturePair(
      'workflow-test-lab',
      undefined,
      'structured-extraction-v1.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    await writeFile(result.path, `${await readFile(result.path, 'utf8')}\n`);

    await expect(
      collectFixturePair(
        'workflow-test-lab',
        undefined,
        'structured-extraction-v1.json',
        { evidenceDirectory: testEvidenceDirectory },
      ),
    ).rejects.toThrow(/RECEIPT_COLLISION/);
  });

  it('detects a mutated receipt payload', async () => {
    const result = await collectFixturePair(
      'skill-ledger',
      undefined,
      'skill-inventory-v1.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    const receipt = JSON.parse(await readFile(result.path, 'utf8')) as Receipt;
    const mutatedReceipt = {
      ...receipt,
      payload: {
        ...receipt.payload,
        sourceUrl: `${receipt.payload.sourceUrl}/mutated`,
      },
    };
    await writeFile(result.path, canonicalJson(mutatedReceipt));

    await expect(verifyEvidenceTree(testEvidenceDirectory)).rejects.toThrow(
      /digest/i,
    );
  });

  it('detects any non-canonical receipt byte mutation', async () => {
    const result = await collectFixturePair(
      'workflow-test-lab',
      undefined,
      'structured-extraction-v1.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    await writeFile(result.path, `${await readFile(result.path, 'utf8')}\n`);

    await expect(verifyEvidenceTree(testEvidenceDirectory)).rejects.toThrow(
      /canonical bytes/i,
    );
  });

  it('rejects a valid receipt stored under the wrong filename', async () => {
    const result = await collectFixturePair(
      'workflow-test-lab',
      undefined,
      'structured-extraction-v1.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    await rename(result.path, join(dirname(result.path), 'wrong.json'));

    await expect(verifyEvidenceTree(testEvidenceDirectory)).rejects.toThrow(
      /filename/i,
    );
  });

  it('ignores unrelated JSON outside the receipts tree', async () => {
    await collectFixturePair(
      'workflow-test-lab',
      undefined,
      'structured-extraction-v1.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    const unrelatedPath = join(
      testEvidenceDirectory,
      'objects',
      'snapshot.json',
    );
    await mkdir(dirname(unrelatedPath), { recursive: true });
    await writeFile(unrelatedPath, canonicalJson({ snapshot: true }));

    await expect(
      verifyEvidenceTree(testEvidenceDirectory),
    ).resolves.toBeUndefined();
  });

  it.each(['txt', 'JSON'])(
    'rejects a receipt renamed with the unexpected .%s extension',
    async (extension) => {
      const result = await collectFixturePair(
        'workflow-test-lab',
        undefined,
        'structured-extraction-v1.json',
        { evidenceDirectory: testEvidenceDirectory },
      );
      const renamedPath = result.path.replace(/\.json$/, `.${extension}`);
      await rename(result.path, renamedPath);

      await expect(verifyEvidenceTree(testEvidenceDirectory)).rejects.toThrow(
        /filename/i,
      );
    },
  );

  it('rejects invalid JSON found in the evidence tree', async () => {
    const invalidPath = join(
      testEvidenceDirectory,
      'receipts',
      'search-receipt',
      `${'a'.repeat(64)}.json`,
    );
    await mkdir(dirname(invalidPath), { recursive: true });
    await writeFile(invalidPath, '{invalid');

    await expect(verifyEvidenceTree(testEvidenceDirectory)).rejects.toThrow();
  });

  it('detects byte, predecessor, and filename mutations without changing canonical evidence', async () => {
    await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );
    const canonicalFiles = await receiptTreeInventory(testEvidenceDirectory);

    const result = await runEvidenceMutationCheck(testEvidenceDirectory);

    expect(result).toEqual({
      detected: ['byte-content', 'predecessor', 'filename'],
      escaped: [],
      exitCode: 0,
      output:
        'MUTATION_CHECK PASS detected=3/3 byte-content,predecessor,filename canonical=unchanged',
    });
    expect(await receiptTreeInventory(testEvidenceDirectory)).toEqual(
      canonicalFiles,
    );
  });

  it('returns failure when a mutation escapes verification', async () => {
    await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );

    const result = await runEvidenceMutationCheck(testEvidenceDirectory, {
      verifyTree: async () => undefined,
    });

    expect(result).toEqual({
      detected: [],
      escaped: ['byte-content', 'predecessor', 'filename'],
      exitCode: 1,
      output:
        'MUTATION_CHECK FAIL detected=0/3 escaped=byte-content,predecessor,filename canonical=unchanged',
    });
  });

  it('does not count a verifier infrastructure failure as mutation detection', async () => {
    await collectFixturePair(
      'search-receipt',
      'status-v1.json',
      'status-v2.json',
      { evidenceDirectory: testEvidenceDirectory },
    );

    await expect(
      runEvidenceMutationCheck(testEvidenceDirectory, {
        verifyTree: async () => {
          throw new Error('verifier unavailable');
        },
      }),
    ).rejects.toThrow(/verifier unavailable/);
  });

  it('fails an unknown CLI command with concise usage', async () => {
    const command =
      process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
    const arguments_ =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm run evidence -- unknown-command']
        : ['run', 'evidence', '--', 'unknown-command'];
    let failure: unknown;

    try {
      await execFileAsync(command, arguments_, { cwd: projectRoot });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: 1 });
    expect(failure).toMatchObject({
      stderr: expect.stringContaining(
        'Usage: evidence <collect-fixtures|verify --all>',
      ),
    });
  });
});
