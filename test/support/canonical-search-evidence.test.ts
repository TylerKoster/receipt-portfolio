import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectFixturePair } from '../../scripts/evidence-cli.js';
import {
  copyCanonicalSearchEvidence,
  trackedCanonicalEvidenceDirectory,
} from './canonical-search-evidence.js';

const temporaryDirectories: string[] = [];

async function newTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('canonical Search evidence fixture support', () => {
  it('copies only the tracked official Search evidence graph byte-for-byte', async () => {
    const destination = join(
      await newTemporaryDirectory('canonical-search-'),
      'evidence',
    );

    const copiedPaths = await copyCanonicalSearchEvidence(destination);

    expect(copiedPaths.length).toBeGreaterThanOrEqual(8);
    expect(
      copiedPaths.every((path) =>
        /^(manifests\/[a-f0-9]{64}\.json|objects\/(raw\/[a-f0-9]{64}\.bin|normalized\/[a-f0-9]{64}\.json)|receipts\/search-receipt\/[a-f0-9]{64}\.json)$/.test(
          path,
        ),
      ),
    ).toBe(true);
    for (const relativePath of copiedPaths) {
      await expect(readFile(join(destination, relativePath))).resolves.toEqual(
        await readFile(join(trackedCanonicalEvidenceDirectory, relativePath)),
      );
    }
  });

  it('ignores unrelated verified canonical evidence while copying the pinned Search graph', async () => {
    const source = join(
      await newTemporaryDirectory('canonical-search-source-'),
      'evidence',
    );
    await cp(trackedCanonicalEvidenceDirectory, source, { recursive: true });
    await collectFixturePair(
      'workflow-test-lab',
      undefined,
      'structured-extraction-v1.json',
      { evidenceDirectory: source },
    );
    const destination = join(
      await newTemporaryDirectory('canonical-search-destination-'),
      'evidence',
    );

    const copiedPaths = await copyCanonicalSearchEvidence(destination, {
      sourceDirectory: source,
    });

    expect(copiedPaths).toHaveLength(8);
    expect(copiedPaths.some((path) => path.includes('workflow-test-lab'))).toBe(
      false,
    );
  });

  it('fails closed when a required canonical object is missing', async () => {
    const source = join(
      await newTemporaryDirectory('canonical-search-source-'),
      'evidence',
    );
    await cp(trackedCanonicalEvidenceDirectory, source, { recursive: true });
    const rawObject = (
      await readdir(join(source, 'objects', 'raw'))
    ).sort()[0]!;
    await unlink(join(source, 'objects', 'raw', rawObject));

    await expect(
      copyCanonicalSearchEvidence(
        join(
          await newTemporaryDirectory('canonical-search-destination-'),
          'evidence',
        ),
        { sourceDirectory: source },
      ),
    ).rejects.toThrow(/canonical Search evidence/i);
  });

  it('fails closed when canonical source bytes are tampered', async () => {
    const source = join(
      await newTemporaryDirectory('canonical-search-source-'),
      'evidence',
    );
    await cp(trackedCanonicalEvidenceDirectory, source, { recursive: true });
    const normalizedObject = (
      await readdir(join(source, 'objects', 'normalized'))
    ).sort()[0]!;
    const objectPath = join(source, 'objects', 'normalized', normalizedObject);
    await writeFile(objectPath, `${await readFile(objectPath, 'utf8')} `);

    await expect(
      copyCanonicalSearchEvidence(
        join(
          await newTemporaryDirectory('canonical-search-destination-'),
          'evidence',
        ),
        { sourceDirectory: source },
      ),
    ).rejects.toThrow(/canonical Search evidence/i);
  });
});
