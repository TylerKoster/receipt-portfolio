import {
  mkdir,
  lstat,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalJson,
  createReceipt,
  evaluatePublication,
  FetchBoundaryError,
  fetchAllowedSource,
  manifestSha256,
  sha256,
  validateManifest,
  verifyReceipt,
  type JsonValue,
  type RawFetch,
  type Receipt,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';

const USAGE =
  'Usage: evidence <collect-fixtures|verify --all> | evidence dry-run-live [--output <artifacts/*.json>]';
const DEFAULT_DRY_RUN_OUTPUT = 'artifacts/dry-run-live-report.json';

type NormalizedRecord = { readonly [key: string]: JsonValue };

interface NormalizedFixture {
  readonly observedAt: string;
  readonly record: NormalizedRecord;
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

interface DryRunSuccess {
  readonly siteId: SourceManifest['siteId'];
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly status: 'SUCCESS';
  readonly observedAt: string;
  readonly mediaType: string;
  readonly responseStatus: number;
  readonly byteCount: number;
  readonly rawSha256: string;
}

interface DryRunFailure {
  readonly siteId: SourceManifest['siteId'];
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly status: 'FAILED';
  readonly errorCode: string;
  readonly message: string;
}

interface DryRunReport {
  readonly reportType: 'LIVE_SOURCE_DRY_RUN';
  readonly publicationAttempted: false;
  readonly evidenceMutated: false;
  readonly results: readonly (DryRunSuccess | DryRunFailure)[];
}

type FetchSource = (manifest: SourceManifest) => Promise<RawFetch>;

export interface RunDryRunLiveOptions {
  readonly projectDirectory?: string;
  readonly output?: string;
  readonly manifests?: readonly SourceManifest[];
  readonly fetchSource?: FetchSource;
}

export interface RunDryRunLiveResult {
  readonly exitCode: 0 | 1;
  readonly outputPath: string;
  readonly report: DryRunReport;
}

const SAFE_FETCH_MESSAGES: Readonly<Record<string, string>> = {
  ENDPOINT_INVALID: 'Source endpoint must be an absolute URL',
  ENDPOINT_HTTPS_REQUIRED: 'Source endpoint must use HTTPS',
  ENDPOINT_USERINFO_FORBIDDEN:
    'Source endpoint must not contain user information',
  ENDPOINT_HOST_NOT_ALLOWED: 'Source endpoint host is not allowlisted',
  ENDPOINT_IP_FORBIDDEN: 'Source endpoint uses a forbidden IP literal',
  INVALID_TIMEOUT: 'Manifest timeout must be a bounded positive integer',
  INVALID_MAX_BYTES: 'Manifest maxBytes must be a bounded positive integer',
  REDIRECT_REJECTED: 'Source redirect was rejected',
  FETCH_TIMEOUT: 'Source fetch exceeded the manifest timeout',
  FETCH_FAILED: 'Source fetch failed',
  HTTP_STATUS_REJECTED: 'Source response status was outside 200-299',
  MEDIA_TYPE_REJECTED: 'Response media type is not configured for this source',
  CONTENT_LENGTH_INVALID: 'Response content-length is invalid',
  MAX_BYTES_EXCEEDED: 'Response exceeds manifest maxBytes',
  RESPONSE_BODY_INVALID: 'Response body yielded an invalid byte chunk',
  SOURCE_DISABLED: 'Source manifest is disabled',
};

function compareManifests(left: SourceManifest, right: SourceManifest): number {
  return (
    left.siteId.localeCompare(right.siteId) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.endpoint.localeCompare(right.endpoint)
  );
}

async function configuredManifests(
  projectDirectory: string,
): Promise<readonly SourceManifest[]> {
  const files = (await receiptFiles(join(projectDirectory, 'manifests')))
    .filter((path) => path.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
  const manifests: SourceManifest[] = [];

  for (const path of files) {
    manifests.push(validateManifest(JSON.parse(await readFile(path, 'utf8'))));
  }

  return manifests.sort(compareManifests);
}

export function resolveDryRunOutputPath(
  projectDirectory: string,
  output = DEFAULT_DRY_RUN_OUTPUT,
): string {
  if (isAbsolute(output)) {
    throw new Error('Dry-run output path must not be absolute');
  }

  if (output.split(/[\\/]/).includes('..')) {
    throw new Error('Dry-run output path must not contain traversal');
  }

  if (extname(output) !== '.json') {
    throw new Error('Dry-run output must use the .json extension');
  }

  const artifactsDirectory = resolve(projectDirectory, 'artifacts');
  const outputPath = resolve(projectDirectory, output);
  const relativePath = relative(artifactsDirectory, outputPath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..' ||
    isAbsolute(relativePath)
  ) {
    throw new Error('Dry-run output must stay under the artifacts directory');
  }

  return outputPath;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function requireRealDirectory(path: string): Promise<void> {
  let entry;

  try {
    entry = await lstat(path);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    await mkdir(path);
    entry = await lstat(path);
  }

  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error('Dry-run output directory boundary must not be symbolic');
  }
}

async function prepareOutputDirectory(
  projectDirectory: string,
  outputPath: string,
): Promise<void> {
  const artifactsDirectory = resolve(projectDirectory, 'artifacts');
  const outputDirectory = dirname(outputPath);
  await requireRealDirectory(artifactsDirectory);
  const nestedPath = relative(artifactsDirectory, outputDirectory);
  let currentPath = artifactsDirectory;

  for (const segment of nestedPath.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    await requireRealDirectory(currentPath);
  }

  try {
    const outputEntry = await lstat(outputPath);

    if (outputEntry.isSymbolicLink() || !outputEntry.isFile()) {
      throw new Error('Dry-run output target must be a regular file');
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function writeAtomicJson(
  path: string,
  value: JsonValue,
  projectDirectory: string,
): Promise<void> {
  await prepareOutputDirectory(projectDirectory, path);
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, canonicalJson(value), {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (!(
        cleanupError instanceof Error &&
        'code' in cleanupError &&
        cleanupError.code === 'ENOENT'
      )) {
        throw cleanupError;
      }
    }

    throw error;
  }
}

function sanitizedFetchFailure(error: unknown): {
  readonly errorCode: string;
  readonly message: string;
} {
  if (error instanceof FetchBoundaryError) {
    return {
      errorCode: error.code,
      message: SAFE_FETCH_MESSAGES[error.code] ?? 'Source fetch failed',
    };
  }

  return { errorCode: 'FETCH_FAILED', message: 'Source fetch failed' };
}

export async function runDryRunLive(
  options: RunDryRunLiveOptions = {},
): Promise<RunDryRunLiveResult> {
  const projectDirectory = options.projectDirectory ?? projectRoot();
  const outputPath = resolveDryRunOutputPath(projectDirectory, options.output);
  const manifests = [
    ...(options.manifests ?? (await configuredManifests(projectDirectory))),
  ].sort(compareManifests);
  const fetchSource =
    options.fetchSource ??
    ((sourceManifest: SourceManifest) => fetchAllowedSource(sourceManifest));
  const results: (DryRunSuccess | DryRunFailure)[] = [];

  for (const manifest of manifests) {
    if (!manifest.enabled) {
      results.push({
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        sourceUrl: manifest.endpoint,
        status: 'FAILED',
        errorCode: 'SOURCE_DISABLED',
        message: SAFE_FETCH_MESSAGES.SOURCE_DISABLED ?? 'Source is disabled',
      });
      continue;
    }

    try {
      const fetched = await fetchSource(manifest);
      results.push({
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        sourceUrl: fetched.sourceUrl,
        status: 'SUCCESS',
        observedAt: fetched.observedAt,
        mediaType: fetched.mediaType,
        responseStatus: fetched.status,
        byteCount: fetched.byteCount,
        rawSha256: fetched.rawSha256,
      });
    } catch (error) {
      results.push({
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        sourceUrl: manifest.endpoint,
        status: 'FAILED',
        ...sanitizedFetchFailure(error),
      });
    }
  }

  const report: DryRunReport = {
    reportType: 'LIVE_SOURCE_DRY_RUN',
    publicationAttempted: false,
    evidenceMutated: false,
    results,
  };
  await writeAtomicJson(
    outputPath,
    report as unknown as JsonValue,
    projectDirectory,
  );

  return {
    exitCode: results.some((result) => result.status === 'FAILED') ? 1 : 0,
    outputPath,
    report,
  };
}

export interface EvidenceCliDependencies {
  readonly projectDirectory?: string;
  readonly fetchSource?: FetchSource;
}

function dryRunOutputArgument(
  arguments_: readonly string[],
): string | undefined | null {
  if (arguments_.length === 1 && arguments_[0] === 'dry-run-live') {
    return undefined;
  }

  if (
    arguments_.length === 3 &&
    arguments_[0] === 'dry-run-live' &&
    arguments_[1] === '--output'
  ) {
    return arguments_[2] ?? null;
  }

  return null;
}

export async function runCli(
  arguments_: readonly string[],
  dependencies: EvidenceCliDependencies = {},
): Promise<0 | 1> {
  const rootDirectory = dependencies.projectDirectory ?? projectRoot();
  const evidenceDirectory = join(rootDirectory, 'evidence');

  if (arguments_.length === 1 && arguments_[0] === 'collect-fixtures') {
    await collectDefaultFixtures(evidenceDirectory);
    return 0;
  }

  if (
    arguments_.length === 2 &&
    arguments_[0] === 'verify' &&
    arguments_[1] === '--all'
  ) {
    await verifyEvidenceTree(evidenceDirectory);
    return 0;
  }

  const output = dryRunOutputArgument(arguments_);

  if (output !== null) {
    const result = await runDryRunLive({
      projectDirectory: rootDirectory,
      ...(output === undefined ? {} : { output }),
      ...(dependencies.fetchSource === undefined
        ? {}
        : { fetchSource: dependencies.fetchSource }),
    });
    return result.exitCode;
  }

  console.error(USAGE);
  return 1;
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
