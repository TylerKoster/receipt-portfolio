import {
  cp,
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  parse,
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
  ReceiptIntegrityError,
  safeSourceDisplayUrl,
  sha256,
  validateManifest,
  verifyReceipt,
  type JsonValue,
  type RawFetch,
  type Receipt,
  type ReceiptIntegrityErrorCode,
  type ReceiptPublicFacts,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';
import {
  admitMicrosoftSkillCreatorObservation,
  createMicrosoftSkillCreatorObservationFromFetches,
  type MicrosoftSkillCreatorPublicFacts,
} from '../sites/skill-ledger/microsoft-skill-creator-source-observation.js';
import { normalizeSearchFetch } from './search-evidence-normalizer.js';

const USAGE =
  'Usage: evidence <collect-fixtures|verify --all> | evidence collect-search <google-search-status|google-search-central-blog|--all> | evidence test-mutation | evidence dry-run-live [--output <artifacts/*.json>]';
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
          kind: 'search-status',
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
          kind: 'workflow-experiment',
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
          kind: 'skill-inventory',
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
        'google-search-status-example.json',
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

async function loadMicrosoftSkillCreatorManifest(): Promise<SourceManifest> {
  const manifest = validateManifest(
    JSON.parse(
      await readFile(
        join(
          projectRoot(),
          'manifests',
          'skill-ledger',
          'microsoft-skill-creator.json',
        ),
        'utf8',
      ),
    ),
  );
  if (
    manifest.siteId !== 'skill-ledger' ||
    manifest.extractionContractId !== 'skill-declared-metadata-v1'
  ) {
    throw new Error('Microsoft skill source manifest is not admitted');
  }
  return manifest;
}

export const SEARCH_SOURCE_IDS = [
  'google-search-status',
  'google-search-central-blog',
] as const;

export type SearchSourceId = (typeof SEARCH_SOURCE_IDS)[number];

function isSearchSourceId(value: string): value is SearchSourceId {
  return SEARCH_SOURCE_IDS.includes(value as SearchSourceId);
}

async function loadSearchManifest(
  sourceId: SearchSourceId,
): Promise<SourceManifest> {
  const manifest = validateManifest(
    JSON.parse(
      await readFile(
        join(projectRoot(), 'manifests', 'search-receipt', `${sourceId}.json`),
        'utf8',
      ),
    ),
  );
  const expectedEndpoint =
    sourceId === 'google-search-status'
      ? 'https://status.search.google.com/incidents.json'
      : 'https://feeds.feedburner.com/blogspot/amDG';
  const expectedContract =
    sourceId === 'google-search-status'
      ? 'search-status-events-v1'
      : 'search-feed-items-v1';
  if (
    manifest.siteId !== 'search-receipt' ||
    manifest.sourceId !== sourceId ||
    manifest.endpoint !== expectedEndpoint ||
    manifest.extractionContractId !== expectedContract ||
    manifest.publicationMode !== 'auto-facts-only' ||
    manifest.sourceClass !== 'official-primary' ||
    !manifest.enabled
  ) {
    throw new Error(`SEARCH_SOURCE_NOT_ADMITTED: ${sourceId}`);
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
): Promise<
  NormalizedFixture & {
    readonly rawSha256: string;
    readonly rawBytes: Uint8Array;
    readonly normalizedBytes: Uint8Array;
  }
> {
  const rawBytes = await readFile(fixturePath(siteId, fixtureName));
  const rawSha256 = sha256(rawBytes);

  if (rawBytes.byteLength > maxBytes) {
    throw new Error(`Fixture exceeds manifest maxBytes: ${fixtureName}`);
  }

  const normalized = normalizeFixture(
    siteId,
    JSON.parse(rawBytes.toString('utf8')),
  );

  const normalizedBytes = new TextEncoder().encode(
    canonicalJson(normalized.record),
  );
  return { ...normalized, rawSha256, rawBytes, normalizedBytes };
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

function missingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function ensureRealDirectoryPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;

  for (const segment of absolute
    .slice(root.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (!missingPath(error)) throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (!(
          mkdirError instanceof Error &&
          'code' in mkdirError &&
          mkdirError.code === 'EEXIST'
        )) {
          throw mkdirError;
        }
      }
      stats = await lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Evidence path must use real directories: ${current}`);
    }
  }
  return absolute;
}

async function persistImmutable(
  path: string,
  bytes: Uint8Array,
  collisionCode: string,
): Promise<void> {
  await ensureRealDirectoryPath(dirname(path));
  try {
    await writeFile(path, bytes, { flag: 'wx' });
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'EEXIST'
    )) {
      throw error;
    }
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(
        `${collisionCode}: existing target is not a regular file`,
      );
    }
    const existingBytes = await readFile(path);
    if (!existingBytes.equals(Buffer.from(bytes))) {
      throw new Error(`${collisionCode}: ${path}`);
    }
  }
}

async function persistReceipt(
  receipt: Receipt,
  evidenceDirectory: string,
): Promise<string> {
  const path = join(
    evidenceDirectory,
    'receipts',
    receipt.payload.siteId,
    `${receipt.id}.json`,
  );
  await persistImmutable(
    path,
    Buffer.from(canonicalJson(receipt), 'utf8'),
    'RECEIPT_COLLISION',
  );
  return path;
}

const EVIDENCE_LOCK_WAIT_MS = 25;
const EVIDENCE_LOCK_TIMEOUT_MS = 10_000;
const EVIDENCE_LOCK_STALE_MS = 60_000;

export async function withEvidenceSourceLock<T>(
  evidenceDirectory: string,
  sourceId: string,
  action: () => Promise<T>,
): Promise<T> {
  const lockDirectory = await ensureRealDirectoryPath(
    join(evidenceDirectory, '.locks'),
  );
  const lockPath = join(lockDirectory, `${sourceId}.lock`);
  const token = randomUUID();
  const deadline = Date.now() + EVIDENCE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await writeFile(lockPath, token, { flag: 'wx' });
      break;
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      )) {
        throw error;
      }
      const stats = await lstat(lockPath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error('Evidence source lock must be a regular file');
      }
      if (Date.now() - stats.mtimeMs > EVIDENCE_LOCK_STALE_MS) {
        await unlink(lockPath);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Evidence source lock timed out: ${sourceId}`);
      }
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, EVIDENCE_LOCK_WAIT_MS),
      );
    }
  }

  let result: T | undefined;
  let actionError: unknown;
  try {
    result = await action();
  } catch (error) {
    actionError = error;
  }
  let releaseError: unknown;
  try {
    if ((await readFile(lockPath, 'utf8')) === token) {
      await unlink(lockPath);
    }
  } catch (error) {
    if (!missingPath(error)) releaseError = error;
  }
  if (actionError !== undefined) throw actionError;
  if (releaseError !== undefined) throw releaseError;
  return result as T;
}

function fixturePresentation(siteId: SourceManifest['siteId']): {
  readonly topicSlug: string;
  readonly interpretation: string;
  readonly unknowns: readonly string[];
} {
  switch (siteId) {
    case 'search-receipt':
      return {
        topicSlug: 'search-status',
        interpretation:
          'This controlled example demonstrates a source-status receipt shape; it is not a live Google incident observation.',
        unknowns: [
          'No live source was fetched.',
          'No claim is made about search traffic or rankings.',
        ],
      };
    case 'workflow-test-lab':
      return {
        topicSlug: 'structured-extraction',
        interpretation:
          'This controlled example records one locally authored workflow fixture and its declared constraints.',
        unknowns: [
          'No model run or universal benchmark result is established.',
          'Performance on other fixtures is unknown.',
        ],
      };
    case 'skill-ledger':
      return {
        topicSlug: 'package-metadata',
        interpretation:
          'This controlled example records static package metadata without installing or executing the package.',
        unknowns: [
          'Runtime behavior and security posture are not established.',
          'Suitability for adoption remains unknown.',
        ],
      };
  }
}

function createFixtureReceipt(
  manifest: SourceManifest,
  fixture: NormalizedFixture & {
    readonly rawSha256: string;
    readonly normalizedBytes: Uint8Array;
  },
  previousRecord: NormalizedRecord | undefined,
  predecessorReceiptId: string | undefined,
  sequence: number,
): Receipt {
  const normalizedSha256 = sha256(fixture.normalizedBytes);
  const gateInputs = {
    manifestValid: true,
    enabled: manifest.enabled,
    publicationMode: manifest.publicationMode,
    evidenceClass: 'controlled-example' as const,
    rawSha256: fixture.rawSha256,
    normalizedSha256,
    ambiguous: false,
    diffRatio: diffRatio(previousRecord, fixture.record),
  };
  const presentation = fixturePresentation(manifest.siteId);

  return createReceipt({
    siteId: manifest.siteId,
    sourceId: manifest.sourceId,
    observedAt: fixture.observedAt,
    sourceUrl: manifest.endpoint,
    manifestSha256: manifestSha256(manifest),
    rawSha256: fixture.rawSha256,
    normalizedSha256,
    rawObjectPath: `objects/raw/${fixture.rawSha256}.bin`,
    normalizedObjectPath: `objects/normalized/${normalizedSha256}.json`,
    sequence,
    ...(predecessorReceiptId === undefined ? {} : { predecessorReceiptId }),
    topicSlug: presentation.topicSlug,
    provenance: {
      evidenceClass: 'controlled-example',
      publicationMode: manifest.publicationMode,
      publisherName: manifest.publisherName,
      sourceClass: manifest.sourceClass,
      extractionSelector: manifest.extractionSelector,
      extractionContractId: manifest.extractionContractId,
      normalizerId: manifest.normalizerId,
      diffStrategyId: manifest.diffStrategyId,
      schemaId: manifest.schemaId,
    },
    publicFacts: fixture.record as ReceiptPublicFacts,
    interpretation: presentation.interpretation,
    unknowns: [...presentation.unknowns],
    correction: { kind: 'original' },
    gateInputs,
    policy: (() => {
      const result = evaluatePublication(gateInputs);
      return {
        decision: result.decision,
        reasonCodes: [...result.reasonCodes],
      };
    })(),
  });
}

async function persistFixtureEvidence(
  receipt: Receipt,
  fixture: {
    readonly rawBytes: Uint8Array;
    readonly normalizedBytes: Uint8Array;
  },
  manifest: SourceManifest,
  evidenceDirectory: string,
): Promise<string> {
  await persistImmutable(
    join(evidenceDirectory, receipt.payload.rawObjectPath),
    fixture.rawBytes,
    'RAW_OBJECT_COLLISION',
  );
  await persistImmutable(
    join(evidenceDirectory, receipt.payload.normalizedObjectPath),
    fixture.normalizedBytes,
    'NORMALIZED_OBJECT_COLLISION',
  );
  await persistImmutable(
    join(
      evidenceDirectory,
      'manifests',
      `${receipt.payload.manifestSha256}.json`,
    ),
    Buffer.from(canonicalJson(manifest), 'utf8'),
    'MANIFEST_SNAPSHOT_COLLISION',
  );
  return persistReceipt(receipt, evidenceDirectory);
}

export async function collectFixturePair(
  siteId: SourceManifest['siteId'],
  previousFixtureName: string | undefined,
  currentFixtureName: string,
  options: { evidenceDirectory: string },
): Promise<{ receipt: Receipt; path: string }> {
  const manifest = await loadManifest(siteId);
  if (
    !manifest.enabled ||
    manifest.publicationMode !== 'fixture-example' ||
    manifest.sourceClass !== 'project-original-fixture'
  ) {
    throw new Error(
      `Manifest is not admitted for controlled fixture collection: ${siteId}`,
    );
  }
  let previousFixture: Awaited<ReturnType<typeof loadFixture>> | undefined;
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
      1,
    );
    await persistFixtureEvidence(
      previousReceipt,
      previousFixture,
      manifest,
      options.evidenceDirectory,
    );
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
    previousFixture === undefined ? 1 : 2,
  );
  const path = await persistFixtureEvidence(
    receipt,
    currentFixture,
    manifest,
    options.evidenceDirectory,
  );

  return { receipt, path };
}

export async function collectMicrosoftSkillCreatorObservation(options: {
  evidenceDirectory: string;
  fetchSource?: (manifest: SourceManifest) => Promise<RawFetch>;
}): Promise<{ receipt: Receipt; path: string }> {
  const manifest = await loadMicrosoftSkillCreatorManifest();
  const companion = manifest.companionSources?.[0];
  if (companion === undefined) {
    throw new Error('Microsoft skill source companion is missing');
  }
  return withEvidenceSourceLock(
    options.evidenceDirectory,
    manifest.sourceId,
    async () => {
      const existingReceiptPaths = await receiptFiles(
        join(options.evidenceDirectory, 'receipts'),
      );
      const verifiedReceipts =
        existingReceiptPaths.length === 0
          ? []
          : await loadVerifiedReceipts(options.evidenceDirectory);
      const fetchSource = options.fetchSource ?? fetchAllowedSource;
      const companionManifest = {
        ...manifest,
        sourceId: `${manifest.sourceId}-license`,
        endpoint: companion.endpoint,
        allowedHosts: companion.allowedHosts,
        allowedMediaTypes: companion.allowedMediaTypes,
        maxBytes: companion.maxBytes,
        expectedBytes: companion.expectedBytes,
        expectedSha256: companion.expectedSha256,
        companionSources: undefined,
      } as SourceManifest;
      const [sourceFetch, licenseFetch] = await Promise.all([
        fetchSource(manifest),
        fetchSource(companionManifest),
      ]);
      const observation = createMicrosoftSkillCreatorObservationFromFetches(
        sourceFetch,
        licenseFetch,
      );
      const publicFacts = admitMicrosoftSkillCreatorObservation(observation);
      const rawBytes = new TextEncoder().encode(canonicalJson(observation));
      const normalizedBytes = new TextEncoder().encode(
        canonicalJson(publicFacts),
      );
      const rawSha256 = sha256(rawBytes);
      const normalizedSha256 = sha256(normalizedBytes);
      const timestamp = observation.observedAt;
      const gateInputs = {
        manifestValid: true,
        enabled: manifest.enabled,
        publicationMode: manifest.publicationMode,
        evidenceClass: 'live-source' as const,
        rawSha256,
        normalizedSha256,
        ambiguous: false,
        diffRatio: 0,
      };
      const policy = evaluatePublication(gateInputs);
      const existingSourceReceipts = verifiedReceipts
        .filter(
          (existing) =>
            existing.payload.siteId === 'skill-ledger' &&
            existing.payload.sourceId === manifest.sourceId,
        )
        .sort((left, right) => left.payload.sequence - right.payload.sequence);
      for (const [index, existing] of existingSourceReceipts.entries()) {
        const expectedPredecessor =
          index === 0 ? undefined : existingSourceReceipts[index - 1]?.id;
        if (
          existing.payload.sequence !== index + 1 ||
          existing.payload.predecessorReceiptId !== expectedPredecessor
        ) {
          throw new Error(
            'Microsoft skill source receipt history is branched or out of sequence',
          );
        }
      }
      const predecessor = existingSourceReceipts.at(-1);
      const receipt = createReceipt({
        siteId: 'skill-ledger',
        sourceId: manifest.sourceId,
        observedAt: timestamp,
        sourceUrl: manifest.endpoint,
        manifestSha256: manifestSha256(manifest),
        rawSha256,
        normalizedSha256,
        rawObjectPath: `objects/raw/${rawSha256}.bin`,
        normalizedObjectPath: `objects/normalized/${normalizedSha256}.json`,
        sequence: (predecessor?.payload.sequence ?? 0) + 1,
        ...(predecessor === undefined
          ? {}
          : { predecessorReceiptId: predecessor.id }),
        topicSlug: 'skill-creator',
        provenance: {
          evidenceClass: 'live-source',
          publicationMode: manifest.publicationMode,
          publisherName: manifest.publisherName,
          sourceClass: manifest.sourceClass,
          extractionSelector: manifest.extractionSelector,
          extractionContractId: manifest.extractionContractId,
          normalizerId: manifest.normalizerId,
          diffStrategyId: manifest.diffStrategyId,
          schemaId: manifest.schemaId,
        },
        publicFacts,
        interpretation:
          'This source-bound observation reports only the declared name and description from one immutable repository path and its same-commit inherited license evidence.',
        unknowns: [
          'The instruction body was not retained, published, installed, imported, or executed.',
          'Currentness, provenance, security, safety, runtime behavior, adoption, endorsement, and suitability remain unknown.',
        ],
        correction: { kind: 'original' },
        gateInputs,
        policy: {
          decision: policy.decision,
          reasonCodes: [...policy.reasonCodes],
        },
      });
      const path = await persistFixtureEvidence(
        receipt,
        { rawBytes, normalizedBytes },
        manifest,
        options.evidenceDirectory,
      );
      return { receipt, path };
    },
  );
}

export interface CollectSearchSourceOptions {
  readonly evidenceDirectory: string;
  readonly fetchSource?: (manifest: SourceManifest) => Promise<RawFetch>;
}

export interface SearchCollectionResult {
  readonly receipt: Receipt;
  readonly path: string;
  readonly fetch: RawFetch;
  readonly idempotent: boolean;
}

function searchPresentation(sourceId: SearchSourceId): {
  readonly topicSlug: string;
  readonly interpretation: string;
  readonly unknowns: readonly string[];
} {
  return sourceId === 'google-search-status'
    ? {
        topicSlug: 'search-status',
        interpretation:
          'This observation records the incident facts exposed by the official Google Search Status response. It does not establish cause or impact for any individual website.',
        unknowns: [
          'Traffic, ranking, indexing, and site-specific effects are not established by this source alone.',
          'A listed incident does not establish that every site or query was affected.',
        ],
      }
    : {
        topicSlug: 'search-guidance',
        interpretation:
          'This observation records only entry identifiers, titles, links, and timestamps exposed by the official Google Search Central feed.',
        unknowns: [
          'The linked article bodies were not fetched, copied, interpreted, or endorsed.',
          'No claim is made about how any guidance applies to a specific website.',
        ],
      };
}

function sourceHistory(
  receipts: readonly Receipt[],
  sourceId: SearchSourceId,
): Receipt[] {
  const history = receipts
    .filter(
      (receipt) =>
        receipt.payload.siteId === 'search-receipt' &&
        receipt.payload.sourceId === sourceId,
    )
    .sort((left, right) => left.payload.sequence - right.payload.sequence);
  for (const [index, receipt] of history.entries()) {
    const expectedPredecessor =
      index === 0 ? undefined : history[index - 1]?.id;
    if (
      receipt.payload.sequence !== index + 1 ||
      receipt.payload.predecessorReceiptId !== expectedPredecessor
    ) {
      throw new Error(
        `Search source receipt history is branched or out of sequence: ${sourceId}`,
      );
    }
  }
  return history;
}

async function existingVerifiedReceipts(
  evidenceDirectory: string,
): Promise<Receipt[]> {
  const paths = await receiptFiles(join(evidenceDirectory, 'receipts'));
  return paths.length === 0 ? [] : loadVerifiedReceipts(evidenceDirectory);
}

export async function collectSearchSource(
  sourceIdInput: SearchSourceId,
  options: CollectSearchSourceOptions,
): Promise<SearchCollectionResult> {
  if (!isSearchSourceId(sourceIdInput)) {
    throw new Error(`SEARCH_SOURCE_NOT_ADMITTED: ${String(sourceIdInput)}`);
  }
  const sourceId = sourceIdInput;
  const manifest = await loadSearchManifest(sourceId);

  // Existing evidence is authenticated before network access. A corrupt tree
  // cannot be hidden by appending another otherwise-valid receipt.
  await existingVerifiedReceipts(options.evidenceDirectory);
  const fetched = await (options.fetchSource ?? fetchAllowedSource)(manifest);
  const publicFacts = normalizeSearchFetch(manifest, fetched);
  const normalizedBytes = new TextEncoder().encode(canonicalJson(publicFacts));
  const normalizedSha256 = sha256(normalizedBytes);

  return withEvidenceSourceLock(
    options.evidenceDirectory,
    manifest.sourceId,
    async () => {
      const verifiedReceipts = await existingVerifiedReceipts(
        options.evidenceDirectory,
      );
      const history = sourceHistory(verifiedReceipts, sourceId);
      const manifestDigest = manifestSha256(manifest);
      const existing = history.find(
        (receipt) =>
          receipt.payload.manifestSha256 === manifestDigest &&
          receipt.payload.rawSha256 === fetched.rawSha256 &&
          receipt.payload.normalizedSha256 === normalizedSha256,
      );
      if (existing !== undefined) {
        return {
          receipt: existing,
          path: join(
            options.evidenceDirectory,
            'receipts',
            existing.payload.siteId,
            `${existing.id}.json`,
          ),
          fetch: fetched,
          idempotent: true,
        };
      }

      const predecessor = history.at(-1);
      const gateInputs = {
        manifestValid: true,
        enabled: manifest.enabled,
        publicationMode: manifest.publicationMode,
        evidenceClass: 'live-source' as const,
        rawSha256: fetched.rawSha256,
        normalizedSha256,
        ambiguous: false,
        diffRatio: diffRatio(
          predecessor?.payload.publicFacts as NormalizedRecord | undefined,
          publicFacts as NormalizedRecord,
        ),
      };
      const policy = evaluatePublication(gateInputs);
      if (policy.decision !== 'PASS') {
        throw new Error(
          `SEARCH_COLLECTION_POLICY_${policy.decision}: ${policy.reasonCodes.join(',')}`,
        );
      }
      const presentation = searchPresentation(sourceId);
      const receipt = verifyReceipt(
        createReceipt({
          siteId: 'search-receipt',
          sourceId,
          observedAt: fetched.observedAt,
          sourceUrl: manifest.endpoint,
          manifestSha256: manifestDigest,
          rawSha256: fetched.rawSha256,
          normalizedSha256,
          rawObjectPath: `objects/raw/${fetched.rawSha256}.bin`,
          normalizedObjectPath: `objects/normalized/${normalizedSha256}.json`,
          sequence: (predecessor?.payload.sequence ?? 0) + 1,
          ...(predecessor === undefined
            ? {}
            : { predecessorReceiptId: predecessor.id }),
          topicSlug: presentation.topicSlug,
          provenance: {
            evidenceClass: 'live-source',
            publicationMode: manifest.publicationMode,
            publisherName: manifest.publisherName,
            sourceClass: manifest.sourceClass,
            extractionSelector: manifest.extractionSelector,
            extractionContractId: manifest.extractionContractId,
            normalizerId: manifest.normalizerId,
            diffStrategyId: manifest.diffStrategyId,
            schemaId: manifest.schemaId,
          },
          publicFacts,
          interpretation: presentation.interpretation,
          unknowns: [...presentation.unknowns],
          correction: { kind: 'original' },
          gateInputs,
          policy: {
            decision: policy.decision,
            reasonCodes: [...policy.reasonCodes],
          },
        }),
      );
      const path = await persistFixtureEvidence(
        receipt,
        { rawBytes: fetched.bytes, normalizedBytes },
        manifest,
        options.evidenceDirectory,
      );
      await verifyEvidenceTree(options.evidenceDirectory);
      return { receipt, path, fetch: fetched, idempotent: false };
    },
  );
}

const SITE_IDS = [
  'search-receipt',
  'workflow-test-lab',
  'skill-ledger',
] as const;

async function requireIntegrityDirectory(
  path: string,
  label: string,
): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new EvidenceIntegrityError(
      'SYMBOLIC_EVIDENCE_ENTRY',
      `${label} must be a real regular directory: ${path}`,
    );
  }
}

async function requireRegularFile(path: string, label: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new EvidenceIntegrityError(
      'SYMBOLIC_EVIDENCE_ENTRY',
      `${label} must be a regular non-symbolic file: ${path}`,
    );
  }
}

async function receiptFiles(directory: string): Promise<string[]> {
  try {
    await requireIntegrityDirectory(directory, 'Receipt root');
  } catch (error) {
    if (missingPath(error)) return [];
    throw error;
  }

  const files: string[] = [];
  const siteEntries = await readdir(directory, { withFileTypes: true });
  for (const siteEntry of siteEntries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const sitePath = join(directory, siteEntry.name);
    if (
      siteEntry.isSymbolicLink() ||
      !siteEntry.isDirectory() ||
      !SITE_IDS.includes(siteEntry.name as (typeof SITE_IDS)[number])
    ) {
      throw new EvidenceIntegrityError(
        'RECEIPT_PATH_MISMATCH',
        `Receipt root contains a linked, non-directory, or unknown site path: ${sitePath}`,
      );
    }
    await requireIntegrityDirectory(sitePath, 'Receipt site root');
    const entries = await readdir(sitePath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(sitePath, entry.name);
      if (entry.isSymbolicLink()) {
        throw new EvidenceIntegrityError(
          'SYMBOLIC_EVIDENCE_ENTRY',
          `Receipt entry must not be symbolic or linked: ${path}`,
        );
      }
      if (!entry.isFile()) {
        throw new EvidenceIntegrityError(
          'RECEIPT_PATH_MISMATCH',
          `Receipt must use the exact receipts/<siteId>/<id>.json path: ${path}`,
        );
      }
      files.push(path);
    }
  }
  return files;
}

export type EvidenceIntegrityErrorCode =
  | ReceiptIntegrityErrorCode
  | 'UNEXPECTED_RECEIPT_FILENAME'
  | 'RECEIPT_JSON_INVALID'
  | 'RECEIPT_FILENAME_MISMATCH'
  | 'UNAUTHENTICATED_RECEIPT_FIELDS'
  | 'NON_CANONICAL_RECEIPT_BYTES'
  | 'EMPTY_EVIDENCE'
  | 'SYMBOLIC_EVIDENCE_ENTRY'
  | 'RECEIPT_PATH_MISMATCH'
  | 'DUPLICATE_RECEIPT_ID'
  | 'MANIFEST_NOT_ADMITTED'
  | 'MANIFEST_BINDING_MISMATCH'
  | 'OBJECT_INTEGRITY_MISMATCH'
  | 'PREDECESSOR_INTEGRITY_MISMATCH'
  | 'CORRECTION_INTEGRITY_MISMATCH';

export class EvidenceIntegrityError extends Error {
  readonly code: EvidenceIntegrityErrorCode;

  constructor(
    code: EvidenceIntegrityErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EvidenceIntegrityError';
    this.code = code;
  }
}

export interface VerifyEvidenceTreeOptions {
  readonly manifestDirectory?: string;
  readonly requireNonEmpty?: boolean;
  readonly expectedReceiptCount?: number;
  readonly expectedSiteIds?: readonly SourceManifest['siteId'][];
}

async function admittedManifests(
  manifestDirectory: string,
): Promise<Map<string, SourceManifest>> {
  await requireIntegrityDirectory(
    manifestDirectory,
    'Configured manifest root',
  );
  const admitted = new Map<string, SourceManifest>();
  const siteEntries = await readdir(manifestDirectory, { withFileTypes: true });
  for (const siteEntry of siteEntries) {
    const sitePath = join(manifestDirectory, siteEntry.name);
    if (
      siteEntry.isSymbolicLink() ||
      !siteEntry.isDirectory() ||
      !SITE_IDS.includes(siteEntry.name as (typeof SITE_IDS)[number])
    ) {
      throw new EvidenceIntegrityError(
        'MANIFEST_NOT_ADMITTED',
        `Configured manifest root contains an invalid entry: ${sitePath}`,
      );
    }
    await requireIntegrityDirectory(sitePath, 'Configured manifest site root');
    for (const entry of await readdir(sitePath, { withFileTypes: true })) {
      const path = join(sitePath, entry.name);
      if (
        entry.isSymbolicLink() ||
        !entry.isFile() ||
        !entry.name.endsWith('.json')
      ) {
        throw new EvidenceIntegrityError(
          'MANIFEST_NOT_ADMITTED',
          `Configured manifest must be a regular JSON file: ${path}`,
        );
      }
      const manifest = validateManifest(
        JSON.parse(await readFile(path, 'utf8')),
      );
      if (manifest.siteId !== siteEntry.name) {
        throw new EvidenceIntegrityError(
          'MANIFEST_NOT_ADMITTED',
          `Configured manifest site does not match its path: ${path}`,
        );
      }
      const digest = manifestSha256(manifest);
      if (admitted.has(digest)) {
        throw new EvidenceIntegrityError(
          'MANIFEST_NOT_ADMITTED',
          `Configured manifest digest is duplicated: ${digest}`,
        );
      }
      admitted.set(digest, manifest);
    }
  }
  return admitted;
}

async function verifyObject(
  evidenceDirectory: string,
  objectPath: string,
  expectedSha256: string,
  expectedCanonicalValue?: unknown,
): Promise<void> {
  const path = join(evidenceDirectory, ...objectPath.split('/'));
  await requireIntegrityDirectory(
    join(evidenceDirectory, 'objects'),
    'Object root',
  );
  await requireIntegrityDirectory(dirname(path), 'Object namespace');
  await requireRegularFile(path, 'Content-addressed object');
  const bytes = await readFile(path);
  if (sha256(bytes) !== expectedSha256) {
    throw new EvidenceIntegrityError(
      'OBJECT_INTEGRITY_MISMATCH',
      `Object bytes do not match the receipt hash: ${path}`,
    );
  }
  if (
    expectedCanonicalValue !== undefined &&
    !bytes.equals(
      Buffer.from(canonicalJson(expectedCanonicalValue as JsonValue), 'utf8'),
    )
  ) {
    throw new EvidenceIntegrityError(
      'OBJECT_INTEGRITY_MISMATCH',
      `Normalized object does not match authenticated public facts: ${path}`,
    );
  }
}

async function verifyExactRegularInventory(
  directory: string,
  expectedNames: ReadonlySet<string>,
  errorCode: 'OBJECT_INTEGRITY_MISMATCH' | 'MANIFEST_BINDING_MISMATCH',
): Promise<void> {
  await requireIntegrityDirectory(directory, 'Content-addressed namespace');
  const entries = await readdir(directory, { withFileTypes: true });
  const actualNames = new Set<string>();
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new EvidenceIntegrityError(
        errorCode,
        `Content-addressed namespace contains a linked or non-file entry: ${path}`,
      );
    }
    actualNames.add(entry.name);
  }
  if (
    actualNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !actualNames.has(name))
  ) {
    throw new EvidenceIntegrityError(
      errorCode,
      `Content-addressed namespace inventory does not exactly match receipt bindings: ${directory}`,
    );
  }
}

async function verifyEvidenceTreeInternal(
  evidenceDirectory: string,
  options: VerifyEvidenceTreeOptions = {},
): Promise<Receipt[]> {
  await requireIntegrityDirectory(evidenceDirectory, 'Evidence root');
  const files = await receiptFiles(join(evidenceDirectory, 'receipts'));
  if ((options.requireNonEmpty ?? true) && files.length === 0) {
    throw new EvidenceIntegrityError(
      'EMPTY_EVIDENCE',
      'Evidence verification requires at least one receipt',
    );
  }
  if (
    options.expectedReceiptCount !== undefined &&
    files.length !== options.expectedReceiptCount
  ) {
    throw new EvidenceIntegrityError(
      'EMPTY_EVIDENCE',
      `Evidence receipt inventory mismatch: expected ${options.expectedReceiptCount}, found ${files.length}`,
    );
  }
  const manifests = await admittedManifests(
    options.manifestDirectory ?? join(projectRoot(), 'manifests'),
  );
  const receipts: Receipt[] = [];
  const receiptById = new Map<string, Receipt>();

  for (const path of files) {
    if (!path.endsWith('.json')) {
      throw new EvidenceIntegrityError(
        'UNEXPECTED_RECEIPT_FILENAME',
        `Unexpected receipt filename: ${path}`,
      );
    }

    const bytes = await readFile(path);
    let parsed: unknown;

    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new EvidenceIntegrityError(
        'RECEIPT_JSON_INVALID',
        `Receipt JSON is invalid: ${path}`,
        { cause: error },
      );
    }

    try {
      parsed = verifyReceipt(parsed);
    } catch (error) {
      if (error instanceof ReceiptIntegrityError) {
        throw new EvidenceIntegrityError(error.code, error.message, {
          cause: error,
        });
      }

      throw error;
    }

    const receipt = parsed as Receipt;
    if (receiptById.has(receipt.id)) {
      throw new EvidenceIntegrityError(
        'DUPLICATE_RECEIPT_ID',
        `Duplicate receipt ID occurs more than once: ${receipt.id}`,
      );
    }
    if (basename(path) !== `${receipt.id}.json`) {
      throw new EvidenceIntegrityError(
        'RECEIPT_FILENAME_MISMATCH',
        `Receipt filename does not match its authenticated ID: ${path}`,
      );
    }
    if (basename(dirname(path)) !== receipt.payload.siteId) {
      throw new EvidenceIntegrityError(
        'RECEIPT_PATH_MISMATCH',
        `Receipt path does not match its authenticated site and ID: ${path}`,
      );
    }

    const keys = Object.keys(receipt).sort();

    if (keys.length !== 2 || keys[0] !== 'id' || keys[1] !== 'payload') {
      throw new EvidenceIntegrityError(
        'UNAUTHENTICATED_RECEIPT_FIELDS',
        `Receipt has unauthenticated top-level fields: ${path}`,
      );
    }

    const canonicalBytes = Buffer.from(canonicalJson(receipt), 'utf8');

    if (!bytes.equals(canonicalBytes)) {
      throw new EvidenceIntegrityError(
        'NON_CANONICAL_RECEIPT_BYTES',
        `Receipt does not contain exact canonical bytes: ${path}`,
      );
    }

    const manifest = manifests.get(receipt.payload.manifestSha256);
    if (manifest === undefined) {
      throw new EvidenceIntegrityError(
        'MANIFEST_NOT_ADMITTED',
        `Receipt manifest digest is not admitted: ${receipt.payload.manifestSha256}`,
      );
    }
    const manifestSnapshotPath = join(
      evidenceDirectory,
      'manifests',
      `${receipt.payload.manifestSha256}.json`,
    );
    await requireIntegrityDirectory(
      join(evidenceDirectory, 'manifests'),
      'Manifest snapshot root',
    );
    await requireRegularFile(manifestSnapshotPath, 'Manifest snapshot');
    const manifestSnapshot = await readFile(manifestSnapshotPath);
    if (
      !manifestSnapshot.equals(Buffer.from(canonicalJson(manifest), 'utf8'))
    ) {
      throw new EvidenceIntegrityError(
        'MANIFEST_BINDING_MISMATCH',
        `Manifest snapshot is not the admitted canonical manifest: ${manifestSnapshotPath}`,
      );
    }
    const evidenceClass =
      manifest.publicationMode === 'fixture-example'
        ? 'controlled-example'
        : 'live-source';
    const bindings = [
      receipt.payload.siteId === manifest.siteId,
      receipt.payload.sourceId === manifest.sourceId,
      receipt.payload.sourceUrl === manifest.endpoint,
      receipt.payload.provenance.publisherName === manifest.publisherName,
      receipt.payload.provenance.sourceClass === manifest.sourceClass,
      receipt.payload.provenance.publicationMode === manifest.publicationMode,
      receipt.payload.provenance.evidenceClass === evidenceClass,
      receipt.payload.provenance.extractionSelector ===
        manifest.extractionSelector,
      receipt.payload.provenance.extractionContractId ===
        manifest.extractionContractId,
      receipt.payload.provenance.normalizerId === manifest.normalizerId,
      receipt.payload.provenance.diffStrategyId === manifest.diffStrategyId,
      receipt.payload.provenance.schemaId === manifest.schemaId,
      receipt.payload.gateInputs.enabled === manifest.enabled,
    ];
    if (bindings.includes(false)) {
      throw new EvidenceIntegrityError(
        'MANIFEST_BINDING_MISMATCH',
        `Receipt provenance does not match its admitted manifest: ${receipt.id}`,
      );
    }
    await verifyObject(
      evidenceDirectory,
      receipt.payload.rawObjectPath,
      receipt.payload.rawSha256,
    );
    await verifyObject(
      evidenceDirectory,
      receipt.payload.normalizedObjectPath,
      receipt.payload.normalizedSha256,
      receipt.payload.publicFacts,
    );
    if (manifest.extractionContractId === 'skill-declared-metadata-v1') {
      const observationBytes = await readFile(
        join(evidenceDirectory, receipt.payload.rawObjectPath),
      );
      let admittedFacts: MicrosoftSkillCreatorPublicFacts;
      try {
        admittedFacts = admitMicrosoftSkillCreatorObservation(
          JSON.parse(observationBytes.toString('utf8')),
        );
      } catch (error) {
        throw new EvidenceIntegrityError(
          'OBJECT_INTEGRITY_MISMATCH',
          'Microsoft skill source observation is not admitted',
          { cause: error },
        );
      }
      if (
        canonicalJson(admittedFacts) !==
        canonicalJson(receipt.payload.publicFacts)
      ) {
        throw new EvidenceIntegrityError(
          'OBJECT_INTEGRITY_MISMATCH',
          'Microsoft skill source observation does not match public facts',
        );
      }
    }
    receiptById.set(receipt.id, receipt);
    receipts.push(receipt);
  }

  const successorByPredecessor = new Set<string>();
  const sequenceKeys = new Set<string>();
  for (const receipt of receipts) {
    const sequenceKey = `${receipt.payload.siteId}\0${receipt.payload.sourceId}\0${receipt.payload.sequence}`;
    if (sequenceKeys.has(sequenceKey)) {
      throw new EvidenceIntegrityError(
        'PREDECESSOR_INTEGRITY_MISMATCH',
        `Receipt sequence is duplicated for one source: ${receipt.id}`,
      );
    }
    sequenceKeys.add(sequenceKey);
    const predecessorId = receipt.payload.predecessorReceiptId;
    if (predecessorId !== undefined) {
      const predecessor = receiptById.get(predecessorId);
      if (
        predecessor === undefined ||
        predecessor.payload.siteId !== receipt.payload.siteId ||
        predecessor.payload.sourceId !== receipt.payload.sourceId ||
        predecessor.payload.sequence + 1 !== receipt.payload.sequence ||
        predecessor.payload.observedAt > receipt.payload.observedAt ||
        successorByPredecessor.has(predecessorId)
      ) {
        throw new EvidenceIntegrityError(
          'PREDECESSOR_INTEGRITY_MISMATCH',
          `Receipt predecessor is missing, cross-source, branched, or out of sequence: ${receipt.id}`,
        );
      }
      successorByPredecessor.add(predecessorId);
    }
    if (receipt.payload.correction.kind === 'correction') {
      const corrected = receiptById.get(
        receipt.payload.correction.correctsReceiptId,
      );
      if (
        corrected === undefined ||
        corrected.payload.siteId !== receipt.payload.siteId ||
        corrected.payload.sourceId !== receipt.payload.sourceId ||
        corrected.payload.sequence >= receipt.payload.sequence
      ) {
        throw new EvidenceIntegrityError(
          'CORRECTION_INTEGRITY_MISMATCH',
          `Correction target is missing, cross-source, or not older: ${receipt.id}`,
        );
      }
    }
  }
  if (
    options.expectedSiteIds !== undefined &&
    options.expectedSiteIds.some(
      (siteId) =>
        !receipts.some((receipt) => receipt.payload.siteId === siteId),
    )
  ) {
    throw new EvidenceIntegrityError(
      'EMPTY_EVIDENCE',
      'Evidence inventory is missing an expected portfolio site',
    );
  }
  const objectRoot = join(evidenceDirectory, 'objects');
  await requireIntegrityDirectory(objectRoot, 'Object root');
  const objectNamespaces = await readdir(objectRoot, { withFileTypes: true });
  if (
    objectNamespaces.length !== 2 ||
    objectNamespaces.some(
      (entry) =>
        entry.isSymbolicLink() ||
        !entry.isDirectory() ||
        !['normalized', 'raw'].includes(entry.name),
    )
  ) {
    throw new EvidenceIntegrityError(
      'OBJECT_INTEGRITY_MISMATCH',
      'Object root must contain exactly the real raw and normalized namespaces',
    );
  }
  await verifyExactRegularInventory(
    join(objectRoot, 'raw'),
    new Set(receipts.map((receipt) => `${receipt.payload.rawSha256}.bin`)),
    'OBJECT_INTEGRITY_MISMATCH',
  );
  await verifyExactRegularInventory(
    join(objectRoot, 'normalized'),
    new Set(
      receipts.map((receipt) => `${receipt.payload.normalizedSha256}.json`),
    ),
    'OBJECT_INTEGRITY_MISMATCH',
  );
  await verifyExactRegularInventory(
    join(evidenceDirectory, 'manifests'),
    new Set(
      receipts.map((receipt) => `${receipt.payload.manifestSha256}.json`),
    ),
    'MANIFEST_BINDING_MISMATCH',
  );
  return receipts.sort((left, right) => left.id.localeCompare(right.id));
}

export async function verifyEvidenceTree(
  evidenceDirectory: string,
  options: VerifyEvidenceTreeOptions = {},
): Promise<void> {
  await verifyEvidenceTreeInternal(evidenceDirectory, options);
}

export async function loadVerifiedReceipts(
  evidenceDirectory: string,
  options: VerifyEvidenceTreeOptions = {},
): Promise<Receipt[]> {
  return verifyEvidenceTreeInternal(evidenceDirectory, options);
}

const MUTATION_NAMES = ['byte-content', 'predecessor', 'filename'] as const;

type MutationName = (typeof MUTATION_NAMES)[number];

const EXPECTED_MUTATION_FAILURE: Readonly<
  Record<MutationName, EvidenceIntegrityErrorCode>
> = {
  'byte-content': 'NON_CANONICAL_RECEIPT_BYTES',
  predecessor: 'RECEIPT_PAYLOAD_DIGEST_MISMATCH',
  filename: 'RECEIPT_FILENAME_MISMATCH',
};

export interface EvidenceMutationCheckResult {
  readonly detected: readonly MutationName[];
  readonly escaped: readonly MutationName[];
  readonly exitCode: 0 | 1;
  readonly output: string;
}

interface EvidenceMutationCheckOptions {
  readonly verifyTree?: (evidenceDirectory: string) => Promise<void>;
}

async function mutateCopiedEvidence(
  evidenceDirectory: string,
  mutation: MutationName,
): Promise<void> {
  const files = await receiptFiles(join(evidenceDirectory, 'receipts'));
  const firstPath = files[0];

  if (firstPath === undefined) {
    throw new Error('Mutation check requires at least one receipt');
  }

  switch (mutation) {
    case 'byte-content':
      await writeFile(firstPath, `${await readFile(firstPath, 'utf8')}\n`);
      return;
    case 'filename':
      await rename(firstPath, join(dirname(firstPath), 'mutated-receipt.json'));
      return;
    case 'predecessor': {
      let predecessorPath: string | undefined;
      let predecessorReceipt: Receipt | undefined;

      for (const path of files) {
        const receipt = JSON.parse(await readFile(path, 'utf8')) as Receipt;

        if (receipt.payload.predecessorReceiptId !== undefined) {
          predecessorPath = path;
          predecessorReceipt = receipt;
          break;
        }
      }

      if (predecessorPath === undefined || predecessorReceipt === undefined) {
        throw new Error('Mutation check requires a receipt with a predecessor');
      }

      const currentPredecessor =
        predecessorReceipt.payload.predecessorReceiptId;
      const mutatedPredecessor =
        currentPredecessor === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
      await writeFile(
        predecessorPath,
        canonicalJson({
          ...predecessorReceipt,
          payload: {
            ...predecessorReceipt.payload,
            predecessorReceiptId: mutatedPredecessor,
          },
        }),
      );
    }
  }
}

export async function runEvidenceMutationCheck(
  evidenceDirectory: string,
  options: EvidenceMutationCheckOptions = {},
): Promise<EvidenceMutationCheckResult> {
  const verifyTree = options.verifyTree ?? verifyEvidenceTree;
  const detected: MutationName[] = [];
  const escaped: MutationName[] = [];

  for (const mutation of MUTATION_NAMES) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'receipt-mutation-'));
    const copiedEvidenceDirectory = join(temporaryRoot, 'evidence');

    try {
      await cp(evidenceDirectory, copiedEvidenceDirectory, {
        errorOnExist: true,
        recursive: true,
      });
      await verifyTree(copiedEvidenceDirectory);
      await mutateCopiedEvidence(copiedEvidenceDirectory, mutation);

      try {
        await verifyTree(copiedEvidenceDirectory);
        escaped.push(mutation);
      } catch (error) {
        if (
          error instanceof EvidenceIntegrityError &&
          error.code === EXPECTED_MUTATION_FAILURE[mutation]
        ) {
          detected.push(mutation);
        } else {
          throw error;
        }
      }
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }

  const exitCode = escaped.length === 0 ? 0 : 1;
  const output =
    exitCode === 0
      ? `MUTATION_CHECK PASS detected=${detected.length}/${MUTATION_NAMES.length} ${detected.join(',')} canonical=unchanged`
      : `MUTATION_CHECK FAIL detected=${detected.length}/${MUTATION_NAMES.length} escaped=${escaped.join(',')} canonical=unchanged`;

  return { detected, escaped, exitCode, output };
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
  await collectMicrosoftSkillCreatorObservation({ evidenceDirectory });
}

interface DryRunSuccess {
  readonly manifestId: string;
  readonly siteId: SourceManifest['siteId'];
  readonly sourceId: string;
  readonly sourceUrl?: string;
  readonly status: 'SUCCESS';
  readonly observedAt: string;
  readonly mediaType: string;
  readonly responseStatus: number;
  readonly byteCount: number;
  readonly rawSha256: string;
}

interface DryRunSourceFailure {
  readonly manifestId: string;
  readonly siteId: SourceManifest['siteId'];
  readonly sourceId: string;
  readonly sourceUrl?: string;
  readonly status: 'FAILED';
  readonly errorCode: string;
  readonly message: string;
}

interface DryRunSkipped {
  readonly manifestId: string;
  readonly siteId: SourceManifest['siteId'];
  readonly sourceId: string;
  readonly sourceUrl?: string;
  readonly status: 'SKIPPED';
  readonly reasonCode: 'NOT_LIVE_COLLECTION_MODE';
  readonly message: string;
}

interface DryRunManifestFailure {
  readonly manifestId: string;
  readonly sourceUrl?: string;
  readonly status: 'FAILED';
  readonly errorCode:
    | 'MANIFEST_READ_FAILED'
    | 'MANIFEST_JSON_INVALID'
    | 'MANIFEST_SCHEMA_INVALID';
  readonly message: string;
}

type DryRunResult =
  DryRunSuccess | DryRunSourceFailure | DryRunManifestFailure | DryRunSkipped;

interface DryRunReport {
  readonly reportType: 'LIVE_SOURCE_DRY_RUN';
  readonly publicationAttempted: false;
  readonly evidenceMutated: false;
  readonly results: readonly DryRunResult[];
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
  ENDPOINT_IP_FORBIDDEN:
    'Source endpoint uses or resolves to a forbidden address',
  ENDPOINT_RESOLUTION_FAILED: 'Source endpoint hostname could not be resolved',
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

interface ValidManifestCandidate {
  readonly kind: 'VALID';
  readonly manifestId: string;
  readonly manifest: SourceManifest;
}

interface InvalidManifestCandidate {
  readonly kind: 'INVALID';
  readonly manifestId: string;
  readonly sourceUrl?: string;
  readonly errorCode: DryRunManifestFailure['errorCode'];
  readonly message: string;
}

type ManifestCandidate = ValidManifestCandidate | InvalidManifestCandidate;

function manifestDisplayUrl(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  try {
    return safeSourceDisplayUrl(
      (input as { readonly endpoint?: unknown }).endpoint,
    );
  } catch {
    return undefined;
  }
}

function sourceUrlField(sourceUrl: string | undefined): {
  readonly sourceUrl?: string;
} {
  return sourceUrl === undefined ? {} : { sourceUrl };
}

function manifestIdentifier(projectDirectory: string, path: string): string {
  return relative(projectDirectory, path).split(sep).join('/');
}

function injectedManifestCandidate(
  manifest: SourceManifest,
  index: number,
): ManifestCandidate {
  try {
    const validated = validateManifest(manifest);
    return {
      kind: 'VALID',
      manifestId: `manifests/${validated.siteId}/${validated.sourceId}.json`,
      manifest: validated,
    };
  } catch {
    return {
      kind: 'INVALID',
      manifestId: `provided-manifests/${String(index).padStart(3, '0')}.json`,
      ...sourceUrlField(manifestDisplayUrl(manifest)),
      errorCode: 'MANIFEST_SCHEMA_INVALID',
      message: 'Manifest schema is invalid',
    };
  }
}

async function configuredManifestCandidates(
  projectDirectory: string,
): Promise<readonly ManifestCandidate[]> {
  const files = (await receiptFiles(join(projectDirectory, 'manifests')))
    .filter((path) => path.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
  const candidates: ManifestCandidate[] = [];

  for (const path of files) {
    const manifestId = manifestIdentifier(projectDirectory, path);
    let bytes: string;

    try {
      bytes = await readFile(path, 'utf8');
    } catch {
      candidates.push({
        kind: 'INVALID',
        manifestId,
        errorCode: 'MANIFEST_READ_FAILED',
        message: 'Manifest file could not be read',
      });
      continue;
    }

    let input: unknown;

    try {
      input = JSON.parse(bytes);
    } catch {
      candidates.push({
        kind: 'INVALID',
        manifestId,
        errorCode: 'MANIFEST_JSON_INVALID',
        message: 'Manifest JSON is invalid',
      });
      continue;
    }

    try {
      candidates.push({
        kind: 'VALID',
        manifestId,
        manifest: validateManifest(input),
      });
    } catch {
      candidates.push({
        kind: 'INVALID',
        manifestId,
        ...sourceUrlField(manifestDisplayUrl(input)),
        errorCode: 'MANIFEST_SCHEMA_INVALID',
        message: 'Manifest schema is invalid',
      });
    }
  }

  return candidates;
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
  const candidates = [
    ...(options.manifests === undefined
      ? await configuredManifestCandidates(projectDirectory)
      : options.manifests.map(injectedManifestCandidate)),
  ].sort((left, right) => left.manifestId.localeCompare(right.manifestId));
  const fetchSource =
    options.fetchSource ??
    ((sourceManifest: SourceManifest) => fetchAllowedSource(sourceManifest));
  const results: DryRunResult[] = [];

  for (const candidate of candidates) {
    if (candidate.kind === 'INVALID') {
      results.push({
        manifestId: candidate.manifestId,
        ...sourceUrlField(candidate.sourceUrl),
        status: 'FAILED',
        errorCode: candidate.errorCode,
        message: candidate.message,
      });
      continue;
    }

    const { manifest, manifestId } = candidate;
    const sourceUrl = safeSourceDisplayUrl(manifest.endpoint);

    if (!manifest.enabled) {
      results.push({
        manifestId,
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        ...sourceUrlField(sourceUrl),
        status: 'FAILED',
        errorCode: 'SOURCE_DISABLED',
        message: SAFE_FETCH_MESSAGES.SOURCE_DISABLED ?? 'Source is disabled',
      });
      continue;
    }

    if (manifest.publicationMode !== 'auto-facts-only') {
      results.push({
        manifestId,
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        ...sourceUrlField(sourceUrl),
        status: 'SKIPPED',
        reasonCode: 'NOT_LIVE_COLLECTION_MODE',
        message: 'Manifest mode is excluded from scheduled live collection',
      });
      continue;
    }

    try {
      const fetched = await fetchSource(manifest);
      results.push({
        manifestId,
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        ...sourceUrlField(sourceUrl),
        status: 'SUCCESS',
        observedAt: fetched.observedAt,
        mediaType: fetched.mediaType,
        responseStatus: fetched.status,
        byteCount: fetched.byteCount,
        rawSha256: fetched.rawSha256,
      });
    } catch (error) {
      results.push({
        manifestId,
        siteId: manifest.siteId,
        sourceId: manifest.sourceId,
        ...sourceUrlField(sourceUrl),
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
    arguments_[0] === 'collect-search' &&
    (arguments_[1] === '--all' || isSearchSourceId(arguments_[1] ?? ''))
  ) {
    const requested =
      arguments_[1] === '--all'
        ? SEARCH_SOURCE_IDS
        : [arguments_[1] as SearchSourceId];
    for (const sourceId of requested) {
      const result = await collectSearchSource(sourceId, {
        evidenceDirectory,
        ...(dependencies.fetchSource === undefined
          ? {}
          : { fetchSource: dependencies.fetchSource }),
      });
      console.log(
        canonicalJson({
          sourceId,
          sourceUrl: result.fetch.sourceUrl,
          observedAt: result.fetch.observedAt,
          responseStatus: result.fetch.status,
          mediaType: result.fetch.mediaType,
          byteCount: result.fetch.byteCount,
          rawSha256: result.fetch.rawSha256,
          manifestSha256: result.receipt.payload.manifestSha256,
          normalizedSha256: result.receipt.payload.normalizedSha256,
          receiptId: result.receipt.id,
          sequence: result.receipt.payload.sequence,
          idempotent: result.idempotent,
          policy: result.receipt.payload.policy.decision,
        }),
      );
    }
    return 0;
  }

  if (
    arguments_.length === 2 &&
    arguments_[0] === 'verify' &&
    arguments_[1] === '--all'
  ) {
    await verifyEvidenceTree(evidenceDirectory, {
      expectedSiteIds: [...SITE_IDS],
    });
    return 0;
  }

  if (arguments_.length === 1 && arguments_[0] === 'test-mutation') {
    const result = await runEvidenceMutationCheck(evidenceDirectory);
    console.log(result.output);
    return result.exitCode;
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
