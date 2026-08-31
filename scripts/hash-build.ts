import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalJson, sha256 } from '../packages/evidence-core/src/index.js';

const PUBLIC_SITE_ROOTS = [
  'search-receipt',
  'skill-ledger',
  'video-moment-search',
  'workflow-test-lab',
] as const;
const ROOT_SHELL_FILES = [
  'favicon.ico',
  'index.html',
  'portfolio.css',
] as const;
const RECEIPT_SITE_FILES = [
  'index.html',
  'methodology/index.html',
  'robots.txt',
  'sitemap.xml',
  'sources/index.html',
  'styles.css',
] as const;
const REQUIRED_SITE_FILES: Readonly<
  Record<(typeof PUBLIC_SITE_ROOTS)[number], readonly string[]>
> = {
  'search-receipt': [
    ...RECEIPT_SITE_FILES,
    'search-interface.css',
    'search-interface.js',
  ],
  'skill-ledger': RECEIPT_SITE_FILES,
  'video-moment-search': [
    'index.html',
    'search-client.js',
    'search-index.json',
    'styles.css',
  ],
  'workflow-test-lab': RECEIPT_SITE_FILES,
};

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
  if (basename(parentDirectory) === 'dist') return dirname(parentDirectory);
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
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real non-symbolic directory`);
  }
}

function allowedSiteFile(
  siteRoot: (typeof PUBLIC_SITE_ROOTS)[number],
  siteRelativePath: string,
): boolean {
  return (
    REQUIRED_SITE_FILES[siteRoot].includes(siteRelativePath) ||
    (siteRoot !== 'video-moment-search' &&
      (/^receipts\/[a-f0-9]{64}\/index\.html$/.test(siteRelativePath) ||
        /^topics\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(
          siteRelativePath,
        )))
  );
}

async function strictPublicFiles(outputDirectory: string): Promise<string[]> {
  await requireRealDirectory(outputDirectory, 'Public output root');
  const roots = (await readdir(outputDirectory, { withFileTypes: true })).sort(
    (left, right) => compareText(left.name, right.name),
  );
  for (const entry of roots) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Public output root must not be symbolic: ${entry.name}`);
    }
    const allowedProductDirectory =
      entry.isDirectory() &&
      PUBLIC_SITE_ROOTS.includes(
        entry.name as (typeof PUBLIC_SITE_ROOTS)[number],
      );
    const allowedRootFile =
      entry.isFile() &&
      ROOT_SHELL_FILES.includes(
        entry.name as (typeof ROOT_SHELL_FILES)[number],
      );
    if (!allowedProductDirectory && !allowedRootFile) {
      throw new Error(`Unexpected public output root: ${entry.name}`);
    }
  }
  const productDirectories = roots.filter((entry) => entry.isDirectory());
  if (productDirectories.length !== PUBLIC_SITE_ROOTS.length) {
    throw new Error(
      'Incomplete public output: expected exactly four site roots',
    );
  }
  for (const rootFile of ROOT_SHELL_FILES) {
    if (!roots.some((entry) => entry.isFile() && entry.name === rootFile)) {
      throw new Error(`Incomplete public output: missing ${rootFile}`);
    }
  }

  const files = ROOT_SHELL_FILES.map((path) => join(outputDirectory, path));
  async function visit(
    siteRoot: (typeof PUBLIC_SITE_ROOTS)[number],
    directory: string,
  ): Promise<void> {
    await requireRealDirectory(directory, `Public ${siteRoot} directory`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const siteRelativePath = relative(join(outputDirectory, siteRoot), path)
        .split(sep)
        .join('/');
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Public output must not be symbolic: ${siteRoot}/${siteRelativePath}`,
        );
      }
      if (entry.isDirectory()) await visit(siteRoot, path);
      else if (
        !entry.isFile() ||
        !allowedSiteFile(siteRoot, siteRelativePath)
      ) {
        throw new Error(
          `Unexpected public output file: ${siteRoot}/${siteRelativePath}`,
        );
      } else files.push(path);
    }
  }

  for (const siteRoot of PUBLIC_SITE_ROOTS) {
    await visit(siteRoot, join(outputDirectory, siteRoot));
    const siteFiles = files
      .filter(
        (path) => relative(outputDirectory, path).split(sep)[0] === siteRoot,
      )
      .map((path) =>
        relative(join(outputDirectory, siteRoot), path).split(sep).join('/'),
      );
    for (const fixed of REQUIRED_SITE_FILES[siteRoot]) {
      if (!siteFiles.includes(fixed)) {
        throw new Error(
          `Incomplete public output: missing ${siteRoot}/${fixed}`,
        );
      }
    }
    if (
      siteRoot !== 'video-moment-search' &&
      !siteFiles.some((path) => /^receipts\//.test(path))
    ) {
      throw new Error(
        `Incomplete public output: ${siteRoot} has no receipt detail`,
      );
    }
    if (
      siteRoot !== 'video-moment-search' &&
      !siteFiles.some((path) => /^topics\//.test(path))
    ) {
      throw new Error(
        `Incomplete public output: ${siteRoot} has no topic page`,
      );
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
  return {
    digest: sha256(new TextEncoder().encode(canonicalJson(inventory))),
    inventory,
  };
}

export async function runHashBuildCli(
  options: {
    readonly outputDirectory?: string;
    readonly writeOutput?: (value: string) => void;
  } = {},
): Promise<0> {
  const manifest = await hashPublicBuild(
    options.outputDirectory ?? join(projectRoot(), 'dist', 'sites'),
  );
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
