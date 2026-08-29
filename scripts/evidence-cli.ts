import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalJson,
  createReceipt,
  evaluatePublication,
  manifestSha256,
  sha256,
  validateManifest,
  verifyReceipt,
  type JsonValue,
  type Receipt,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';

const USAGE = 'Usage: evidence <collect-fixtures|verify --all>';

type NormalizedRecord = { readonly [key: string]: JsonValue };

interface NormalizedFixture {
  readonly observedAt: string;
  readonly record: NormalizedRecord;
}

function projectRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const parentDirectory = dirname(moduleDirectory);

  return basename(parentDirectory) === 'dist'
    ? dirname(parentDirectory)
    : parentDirectory;
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${name} must be a plain JSON object`);
  }

  return value as Record<string, unknown>;
}

function stringValue(object: Record<string, unknown>, key: string): string {
  const value = object[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

function booleanValue(object: Record<string, unknown>, key: string): boolean {
  const value = object[key];

  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }

  return value;
}

function stringArray(
  object: Record<string, unknown>,
  key: string,
): readonly string[] {
  const value = object[key];

  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(`${key} must be an array of strings`);
  }

  return value;
}

function observedAt(document: Record<string, unknown>): string {
  const value = stringValue(document, 'observedAt');

  if (new Date(value).toISOString() !== value) {
    throw new Error('observedAt must be a canonical ISO timestamp');
  }

  return value;
}

function normalizeFixture(
  siteId: SourceManifest['siteId'],
  input: unknown,
): NormalizedFixture {
  const document = objectValue(input, 'fixture');
  const timestamp = observedAt(document);

  switch (siteId) {
    case 'search-receipt': {
      const event = objectValue(document.event, 'event');

      return {
        observedAt: timestamp,
        record: {
          eventId: stringValue(event, 'eventId'),
          service: stringValue(event, 'service'),
          startedAt: stringValue(event, 'startedAt'),
          status: stringValue(event, 'status'),
          summary: stringValue(event, 'summary'),
        },
      };
    }

    case 'workflow-test-lab': {
      const experiment = objectValue(document.experiment, 'experiment');

      return {
        observedAt: timestamp,
        record: {
          expectedFields: stringArray(experiment, 'expectedFields'),
          experimentId: stringValue(experiment, 'experimentId'),
          fixtureId: stringValue(experiment, 'fixtureId'),
          negativeConstraints: stringArray(experiment, 'negativeConstraints'),
          taskFamily: stringValue(experiment, 'taskFamily'),
        },
      };
    }

    case 'skill-ledger': {
      const inventory = objectValue(document.inventory, 'inventory');

      return {
        observedAt: timestamp,
        record: {
          contentsSha256: stringValue(inventory, 'contentsSha256'),
          declaredDependencies: stringArray(inventory, 'declaredDependencies'),
          declaredLicense: stringValue(inventory, 'declaredLicense'),
          manifestPresent: booleanValue(inventory, 'manifestPresent'),
          packageId: stringValue(inventory, 'packageId'),
          staticRiskFlags: stringArray(inventory, 'staticRiskFlags'),
        },
      };
    }
  }
}

function manifestPath(siteId: SourceManifest['siteId']): string {
  switch (siteId) {
    case 'search-receipt':
      return join(
        projectRoot(),
        'manifests',
        siteId,
        'google-search-status.json',
      );
    case 'workflow-test-lab':
      return join(
        projectRoot(),
        'manifests',
        siteId,
        'structured-extraction.json',
      );
    case 'skill-ledger':
      return join(
        projectRoot(),
        'manifests',
        siteId,
        'example-skill-archive.json',
      );
  }
}

async function loadManifest(
  siteId: SourceManifest['siteId'],
): Promise<SourceManifest> {
  const manifest = validateManifest(
    JSON.parse(await readFile(manifestPath(siteId), 'utf8')),
  );

  if (manifest.siteId !== siteId) {
    throw new Error(`Manifest site does not match ${siteId}`);
  }

  return manifest;
}

function fixturePath(
  siteId: SourceManifest['siteId'],
  fixtureName: string,
): string {
  if (basename(fixtureName) !== fixtureName || !fixtureName.endsWith('.json')) {
    throw new Error('Fixture name must be a local JSON filename');
  }

  return join(projectRoot(), 'fixtures', siteId, fixtureName);
}

async function loadFixture(
  siteId: SourceManifest['siteId'],
  fixtureName: string,
  maxBytes: number,
): Promise<NormalizedFixture & { readonly rawSha256: string }> {
  const rawBytes = await readFile(fixturePath(siteId, fixtureName));
  const rawSha256 = sha256(rawBytes);

  if (rawBytes.byteLength > maxBytes) {
    throw new Error(`Fixture exceeds manifest maxBytes: ${fixtureName}`);
  }

  const normalized = normalizeFixture(
    siteId,
    JSON.parse(rawBytes.toString('utf8')),
  );

  return { ...normalized, rawSha256 };
}

function diffRatio(
  previous: NormalizedRecord | undefined,
  current: NormalizedRecord,
): number {
  if (previous === undefined) {
    return 0;
  }

  const keys = [
    ...new Set([...Object.keys(previous), ...Object.keys(current)]),
  ].sort();

  if (keys.length === 0) {
    return 0;
  }

  const changedFields = keys.filter(
    (key) =>
      canonicalJson(previous[key] ?? null) !==
      canonicalJson(current[key] ?? null),
  ).length;

  return changedFields / keys.length;
}

async function persistReceipt(
  receipt: Receipt,
  evidenceDirectory: string,
): Promise<string> {
  const directory = join(evidenceDirectory, 'receipts', receipt.payload.siteId);
  const path = join(directory, `${receipt.id}.json`);
  const canonicalBytes = Buffer.from(canonicalJson(receipt), 'utf8');
  await mkdir(directory, { recursive: true });

  try {
    await writeFile(path, canonicalBytes, { flag: 'wx' });
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'EEXIST'
    )) {
      throw error;
    }

    const existingBytes = await readFile(path);

    if (!existingBytes.equals(canonicalBytes)) {
      throw new Error(`RECEIPT_COLLISION: ${path}`);
    }
  }

  return path;
}

function createFixtureReceipt(
  manifest: SourceManifest,
  fixture: NormalizedFixture & { readonly rawSha256: string },
  previousRecord: NormalizedRecord | undefined,
  predecessorReceiptId: string | undefined,
): Receipt {
  const normalizedSha256 = sha256(
    new TextEncoder().encode(canonicalJson(fixture.record)),
  );
  const policy = evaluatePublication({
    manifestValid: true,
    rawSha256: fixture.rawSha256,
    normalizedSha256,
    ambiguous: false,
    diffRatio: diffRatio(previousRecord, fixture.record),
  });

  return createReceipt({
    siteId: manifest.siteId,
    sourceId: manifest.sourceId,
    observedAt: fixture.observedAt,
    sourceUrl: manifest.endpoint,
    manifestSha256: manifestSha256(manifest),
    rawSha256: fixture.rawSha256,
    normalizedSha256,
    ...(predecessorReceiptId === undefined ? {} : { predecessorReceiptId }),
    policy,
  });
}

export async function collectFixturePair(
  siteId: SourceManifest['siteId'],
  previousFixtureName: string | undefined,
  currentFixtureName: string,
  options: { evidenceDirectory: string },
): Promise<{ receipt: Receipt; path: string }> {
  const manifest = await loadManifest(siteId);
  let previousFixture:
    (NormalizedFixture & { readonly rawSha256: string }) | undefined;
  let predecessorReceiptId: string | undefined;

  if (previousFixtureName !== undefined) {
    previousFixture = await loadFixture(
      siteId,
      previousFixtureName,
      manifest.maxBytes,
    );
    const previousReceipt = createFixtureReceipt(
      manifest,
      previousFixture,
      undefined,
      undefined,
    );
    await persistReceipt(previousReceipt, options.evidenceDirectory);
    predecessorReceiptId = previousReceipt.id;
  }

  const currentFixture = await loadFixture(
    siteId,
    currentFixtureName,
    manifest.maxBytes,
  );
  const receipt = createFixtureReceipt(
    manifest,
    currentFixture,
    previousFixture?.record,
    predecessorReceiptId,
  );
  const path = await persistReceipt(receipt, options.evidenceDirectory);

  return { receipt, path };
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

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
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

export async function verifyEvidenceTree(
  evidenceDirectory: string,
): Promise<void> {
  const files = await receiptFiles(join(evidenceDirectory, 'receipts'));

  for (const path of files) {
    if (!path.endsWith('.json')) {
      throw new Error(`Unexpected receipt filename: ${path}`);
    }

    const bytes = await readFile(path);
    const receipt = JSON.parse(bytes.toString('utf8')) as Receipt;
    verifyReceipt(receipt);

    if (basename(path) !== `${receipt.id}.json`) {
      throw new Error(`Receipt filename does not match receipt ID: ${path}`);
    }

    const keys = Object.keys(receipt).sort();

    if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'payload') {
      throw new Error(`Receipt has unauthenticated top-level fields: ${path}`);
    }

    const canonicalBytes = Buffer.from(canonicalJson(receipt), 'utf8');

    if (!bytes.equals(canonicalBytes)) {
      throw new Error(
        `Receipt does not contain exact canonical bytes: ${path}`,
      );
    }
  }
}

async function collectDefaultFixtures(
  evidenceDirectory: string,
): Promise<void> {
  await collectFixturePair(
    'search-receipt',
    'status-v1.json',
    'status-v2.json',
    { evidenceDirectory },
  );
  await collectFixturePair(
    'workflow-test-lab',
    undefined,
    'structured-extraction-v1.json',
    { evidenceDirectory },
  );
  await collectFixturePair(
    'skill-ledger',
    undefined,
    'skill-inventory-v1.json',
    { evidenceDirectory },
  );
}

async function runCli(arguments_: readonly string[]): Promise<void> {
  const evidenceDirectory = join(projectRoot(), 'evidence');

  if (arguments_.length === 1 && arguments_[0] === 'collect-fixtures') {
    await collectDefaultFixtures(evidenceDirectory);
    return;
  }

  if (
    arguments_.length === 2 &&
    arguments_[0] === 'verify' &&
    arguments_[1] === '--all'
  ) {
    await verifyEvidenceTree(evidenceDirectory);
    return;
  }

  console.error(USAGE);
  process.exitCode = 1;
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
