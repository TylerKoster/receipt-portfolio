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

const EXPECTED_INVENTORY = [
  {
    path: 'search-receipt/index.html',
    sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
  },
  {
    path: 'search-receipt/styles.css',
    sha256: '3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d',
  },
  {
    path: 'skill-ledger/index.html',
    sha256: '2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc6',
  },
  {
    path: 'skill-ledger/styles.css',
    sha256: '18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4',
  },
  {
    path: 'workflow-test-lab/index.html',
    sha256: '3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea',
  },
  {
    path: 'workflow-test-lab/styles.css',
    sha256: '252f10c83610ebca1a059c0bae8255eba2f95be4d1d7bcfa89d7248a82d9f111',
  },
] as const;
const EXPECTED_DIGEST =
  'a18e424995cbcd2aeb29804bbf11d0bcb7944560493a1b676e48c20755eb4e73';

const temporaryDirectories: string[] = [];
let outputDirectory: string;

async function writePublicFile(path: string, contents: string): Promise<void> {
  const destination = join(outputDirectory, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function writeValidPublicTree(): Promise<void> {
  for (const [index, entry] of EXPECTED_INVENTORY.entries()) {
    await writePublicFile(entry.path, String.fromCharCode(97 + index));
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
  it('hashes sorted relative paths and file bytes into the expected aggregate', async () => {
    await expect(hashPublicBuild(outputDirectory)).resolves.toEqual({
      digest: EXPECTED_DIGEST,
      inventory: EXPECTED_INVENTORY,
    });
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
