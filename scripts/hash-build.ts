import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson, sha256 } from '../packages/evidence-core/src/index.js';

const PUBLIC_FILES = [
  'search-receipt/index.html',
  'search-receipt/styles.css',
  'skill-ledger/index.html',
  'skill-ledger/styles.css',
  'workflow-test-lab/index.html',
  'workflow-test-lab/styles.css',
] as const;
const PUBLIC_SITE_ROOTS = [
  'search-receipt',
  'skill-ledger',
  'workflow-test-lab',
] as const;

export interface PublicBuildInventoryEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface PublicBuildManifest {
  readonly digest: string;
  readonly inventory: readonly PublicBuildInventoryEntry[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const parentDirectory = dirname(moduleDirectory);

  if (basename(parentDirectory) === 'dist') {
    return dirname(parentDirectory);
  }

  const grandparentDirectory = dirname(parentDirectory);

  return basename(grandparentDirectory) === 'dist'
    ? dirname(grandparentDirectory)
    : parentDirectory;
}

async function requireRealDirectory(
  path: string,
  label: string,
): Promise<void> {
  const stats = await lstat(path);

  if (stats.isSymbolicLink()) {
    throw new Error(`${label} must not be symbolic`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} must be a real directory`);
  }
}

async function strictPublicFiles(outputDirectory: string): Promise<string[]> {
  await requireRealDirectory(outputDirectory, 'Public output root');
  const rootEntries = (await readdir(outputDirectory)).sort(compareText);

  for (const entry of rootEntries) {
    if (
      !PUBLIC_SITE_ROOTS.includes(entry as (typeof PUBLIC_SITE_ROOTS)[number])
    ) {
      throw new Error(`Unexpected public output root: ${entry}`);
    }
  }

  for (const siteRoot of PUBLIC_SITE_ROOTS) {
    if (!rootEntries.includes(siteRoot)) {
      throw new Error(`Incomplete public output: missing ${siteRoot}`);
    }

    await requireRealDirectory(
      join(outputDirectory, siteRoot),
      `Public site root ${siteRoot}`,
    );
  }

  const files: string[] = [];

  for (const siteRoot of PUBLIC_SITE_ROOTS) {
    const directory = join(outputDirectory, siteRoot);
    const entries = (await readdir(directory)).sort(compareText);

    for (const entry of entries) {
      const path = join(directory, entry);
      const stats = await lstat(path);
      const relativePath = relative(outputDirectory, path).split(sep).join('/');

      if (stats.isSymbolicLink()) {
        throw new Error(`Public output must not be symbolic: ${relativePath}`);
      }

      if (
        !stats.isFile() ||
        !PUBLIC_FILES.includes(relativePath as (typeof PUBLIC_FILES)[number])
      ) {
        throw new Error(`Unexpected public output file: ${relativePath}`);
      }

      files.push(path);
    }
  }

  const relativeFiles = files
    .map((path) => relative(outputDirectory, path).split(sep).join('/'))
    .sort(compareText);

  for (const expectedFile of PUBLIC_FILES) {
    if (!relativeFiles.includes(expectedFile)) {
      throw new Error(`Incomplete public output: missing ${expectedFile}`);
    }
  }

  return files.sort((left, right) =>
    compareText(
      relative(outputDirectory, left),
      relative(outputDirectory, right),
    ),
  );
}

export async function hashPublicBuild(
  outputDirectory: string,
): Promise<PublicBuildManifest> {
  const resolvedOutput = resolve(outputDirectory);
  const files = await strictPublicFiles(resolvedOutput);
  const inventory: PublicBuildInventoryEntry[] = [];

  for (const path of files) {
    inventory.push({
      path: relative(resolvedOutput, path).split(sep).join('/'),
      sha256: sha256(await readFile(path)),
    });
  }

  const digest = sha256(new TextEncoder().encode(canonicalJson(inventory)));
  return { digest, inventory };
}

export async function runHashBuildCli(
  options: {
    readonly outputDirectory?: string;
    readonly writeOutput?: (value: string) => void;
  } = {},
): Promise<0> {
  const outputDirectory =
    options.outputDirectory ?? join(projectRoot(), 'dist', 'sites');
  const manifest = await hashPublicBuild(outputDirectory);
  (options.writeOutput ?? console.log)(manifest.digest);
  return 0;
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runHashBuildCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
