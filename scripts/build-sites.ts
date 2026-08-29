import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalJson,
  verifyReceipt,
  type Receipt,
} from '../packages/evidence-core/src/index.js';
import { searchReceiptSite } from '../sites/search-receipt/index.js';
import { renderSite, type SiteId } from '../sites/shared/render.js';
import { skillLedgerSite } from '../sites/skill-ledger/index.js';
import { workflowTestLabSite } from '../sites/workflow-test-lab/index.js';

const SITE_DEFINITIONS = [
  searchReceiptSite,
  workflowTestLabSite,
  skillLedgerSite,
] as const;
const SITE_IDS = new Set<SiteId>(
  SITE_DEFINITIONS.map((definition) => definition.siteId),
);

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
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

async function receiptFiles(directory: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries.toSorted((left, right) =>
    compareText(left.name, right.name),
  )) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await receiptFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function isSiteId(value: string): value is SiteId {
  return SITE_IDS.has(value as SiteId);
}

async function loadVerifiedReceipts(
  evidenceDirectory: string,
): Promise<Receipt[]> {
  const receiptDirectory = join(evidenceDirectory, 'receipts');
  const files = await receiptFiles(receiptDirectory);
  const receipts: Receipt[] = [];

  for (const path of files) {
    if (!path.endsWith('.json')) {
      throw new Error(`Unexpected receipt filename: ${path}`);
    }

    const bytes = await readFile(path);
    const receipt = verifyReceipt(
      JSON.parse(bytes.toString('utf8')) as Receipt,
    );

    if (basename(path) !== `${receipt.id}.json`) {
      throw new Error(`Receipt filename does not match receipt ID: ${path}`);
    }

    if (!isSiteId(receipt.payload.siteId)) {
      throw new Error(`Unknown receipt site: ${receipt.payload.siteId}`);
    }

    if (basename(dirname(path)) !== receipt.payload.siteId) {
      throw new Error(`Receipt directory does not match site ID: ${path}`);
    }

    const keys = Object.keys(receipt).sort();

    if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'payload') {
      throw new Error(`Receipt has unauthenticated top-level fields: ${path}`);
    }

    if (!bytes.equals(Buffer.from(canonicalJson(receipt), 'utf8'))) {
      throw new Error(
        `Receipt does not contain exact canonical bytes: ${path}`,
      );
    }

    receipts.push(receipt);
  }

  return receipts;
}

function stylesheetPath(): string {
  return join(projectRoot(), 'sites', 'shared', 'styles.css');
}

export async function buildSites(options: {
  evidenceDirectory: string;
  outputDirectory: string;
}): Promise<void> {
  const receipts = await loadVerifiedReceipts(options.evidenceDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const outputParent = dirname(outputDirectory);
  await mkdir(outputParent, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(outputParent, `.${basename(outputDirectory)}-stage-`),
  );

  try {
    await writeSiteTree(stagingDirectory, receipts);
    await replaceOutput(stagingDirectory, outputDirectory);
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

async function writeSiteTree(
  outputDirectory: string,
  receipts: readonly Receipt[],
): Promise<void> {
  for (const site of SITE_DEFINITIONS) {
    const directory = join(outputDirectory, site.siteId);
    const acceptedReceipts = receipts.filter(
      (receipt) =>
        receipt.payload.siteId === site.siteId &&
        receipt.payload.policy.decision === 'PASS',
    );
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(
        join(directory, 'index.html'),
        renderSite(site, acceptedReceipts),
      ),
      copyFile(stylesheetPath(), join(directory, 'styles.css')),
    ]);
  }
}

function missingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function replaceOutput(
  stagingDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const backupDirectory = `${stagingDirectory}.previous`;
  let previousOutputMoved = false;

  try {
    await rename(outputDirectory, backupDirectory);
    previousOutputMoved = true;
  } catch (error) {
    if (!missingPath(error)) {
      throw error;
    }
  }

  try {
    await rename(stagingDirectory, outputDirectory);
  } catch (replacementError) {
    if (previousOutputMoved) {
      try {
        await rename(backupDirectory, outputDirectory);
      } catch (rollbackError) {
        throw new AggregateError(
          [replacementError, rollbackError],
          'Site output replacement and rollback both failed',
        );
      }
    }

    throw replacementError;
  }

  if (previousOutputMoved) {
    await rm(backupDirectory, { force: true, recursive: true });
  }
}

async function runBuild(): Promise<void> {
  const root = projectRoot();
  await buildSites({
    evidenceDirectory: join(root, 'evidence'),
    outputDirectory: join(root, 'dist', 'sites'),
  });
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runBuild().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
