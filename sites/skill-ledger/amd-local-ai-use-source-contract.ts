export const AMD_LOCAL_AI_USE_SOURCE_BOUNDARY =
  'This contract admits designated static declared metadata only. It does not publish or execute the instruction body, verify currentness or provenance, or establish security, safety, runtime behavior, adoption, suitability, recommendation, endorsement, demand, conversion, revenue, or public deployment. Coordinator-owned evidence collection and inventory wiring remain required.' as const;

const inheritedLicense = Object.freeze({
  name: 'MIT License',
  referenceUrl:
    'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/LICENSE',
  bytes: 1106,
  sha256: '6a86faf98a4909cc6341592da475f17fc2f9e18d21b59f30a5a62314c6a8c216',
} as const);

const designatedRaw = Object.freeze({
  bytes: 18207,
  sha256: '61f11302b346130f8a676f4ff3d28734857beb8a09362d797fc43ffc9b014755',
} as const);

const designatedDeclaredMetadata = Object.freeze({
  name: 'local-ai-use',
  description:
    "Makes this agent generate images, transcribe audio, and synthesize speech on the user's own machine through a local Lemonade Server instead of a paid cloud API. Use it above all to change that routing persistently, from now on — keep generating pictures locally while chat stays on the cloud; set this workspace up to make images on my own machine — even when the user asks for no image or file in the same breath. Also use it for a single request the user wants done locally, offline, on-device, or kept private: transcribe this recording, make this picture, read this text aloud. Applies in Claude, Cursor, Codex, or any agent harness. Use when the user wants to cut cost or tokens on image, audio, or voice API calls, or to drop DALL-E, hosted Whisper, ElevenLabs, or other paid multimodal APIs; or mentions Lemonade Server, OmniRouter, SD-Turbo, kokoro, Ryzen AI, or NPU/iGPU/dGPU inference. Changes no application source code; do not use it if the user is adding local AI to an app they ship.",
} as const);

export const AMD_LOCAL_AI_USE_SOURCE_DESIGNATION = Object.freeze({
  repository: 'https://github.com/amd/skills',
  commit: 'e867fa4ae4516f644221cb04dcdf24008a43cb99',
  path: 'skills/local-ai-use/SKILL.md',
  rawUrl:
    'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/skills/local-ai-use/SKILL.md',
  publisher: 'AMD',
  allowedRawHost: 'raw.githubusercontent.com',
  allowedDeclaredFields: Object.freeze(['name', 'description'] as const),
  inheritedLicense,
  raw: designatedRaw,
  declaredMetadata: designatedDeclaredMetadata,
} as const);

export type AmdLocalAiUseProspectiveSource = Readonly<{
  source: Readonly<{
    repository: string;
    commit: string;
    path: string;
    rawUrl: string;
    publisher: string;
  }>;
  inheritedLicense: Readonly<{
    name: string;
    referenceUrl: string;
    bytes: number;
    sha256: string;
  }>;
  observedAt: string;
  raw: Readonly<{
    bytes: number;
    sha256: string;
  }>;
  declaredMetadata: Readonly<{
    name: string;
    description: string;
  }>;
}>;

export type AmdLocalAiUseSourceContractIssue =
  | 'unknown-root-fields'
  | 'invalid-source-fields'
  | 'source-repository-mismatch'
  | 'source-commit-mismatch'
  | 'source-path-mismatch'
  | 'source-raw-url-mismatch'
  | 'source-publisher-mismatch'
  | 'invalid-license-fields'
  | 'license-name-mismatch'
  | 'license-reference-mismatch'
  | 'license-bytes-mismatch'
  | 'license-sha256-mismatch'
  | 'invalid-observed-at'
  | 'invalid-raw-fields'
  | 'raw-bytes-mismatch'
  | 'raw-sha256-mismatch'
  | 'invalid-declared-metadata-fields'
  | 'declared-name-mismatch'
  | 'declared-description-mismatch'
  | 'missing-declared-name'
  | 'missing-declared-description';

export type AmdLocalAiUseSourceContractAssessment =
  | Readonly<{
      kind: 'ready';
      issues: readonly [];
      boundary: typeof AMD_LOCAL_AI_USE_SOURCE_BOUNDARY;
    }>
  | Readonly<{
      kind: 'not-ready';
      issues: readonly AmdLocalAiUseSourceContractIssue[];
      boundary: typeof AMD_LOCAL_AI_USE_SOURCE_BOUNDARY;
    }>;

export type AmdLocalAiUsePublicDisclosure = Readonly<{
  source: Readonly<{
    repository: string;
    path: string;
    commit: string;
    rawUrl: string;
    publisher: string;
  }>;
  inheritedLicense: Readonly<{
    name: string;
    referenceUrl: string;
  }>;
  observedAt: string;
  hashes: Readonly<{
    rawSha256: string;
  }>;
  declaredMetadata: Readonly<{
    name: string;
    description: string;
  }>;
  boundary: typeof AMD_LOCAL_AI_USE_SOURCE_BOUNDARY;
}>;

export type AmdLocalAiUsePublicDisclosureNotReady = Readonly<{
  kind: 'not-ready';
  issues: readonly AmdLocalAiUseSourceContractIssue[];
  disclosure: null;
  boundary: typeof AMD_LOCAL_AI_USE_SOURCE_BOUNDARY;
}>;

export type AmdLocalAiUsePublicDisclosureResult =
  AmdLocalAiUsePublicDisclosure | AmdLocalAiUsePublicDisclosureNotReady;

type UnknownRecord = Readonly<Record<string, unknown>>;

const ROOT_FIELDS = [
  'source',
  'inheritedLicense',
  'observedAt',
  'raw',
  'declaredMetadata',
] as const;

const SOURCE_FIELDS = [
  'repository',
  'commit',
  'path',
  'rawUrl',
  'publisher',
] as const;

const LICENSE_FIELDS = ['name', 'referenceUrl', 'bytes', 'sha256'] as const;

const RAW_FIELDS = ['bytes', 'sha256'] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordAt(record: UnknownRecord, field: string): UnknownRecord {
  const value = record[field];
  return isRecord(value) ? value : {};
}

function stringAt(record: UnknownRecord, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value : '';
}

function isStrictUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isDesignatedRawUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.allowedRawHost &&
      value === AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.rawUrl
    );
  } catch {
    return false;
  }
}

function hasExactFields(
  record: UnknownRecord,
  fields: readonly string[],
): boolean {
  const expected = [...fields].sort();
  const actual = Object.keys(record).sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
}

export function assessAmdLocalAiUseProspectiveSource(
  prospectiveSource: unknown,
): AmdLocalAiUseSourceContractAssessment {
  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const source = recordAt(record, 'source');
  const license = recordAt(record, 'inheritedLicense');
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');
  const issues: AmdLocalAiUseSourceContractIssue[] = [];

  if (!hasExactFields(record, ROOT_FIELDS)) {
    issues.push('unknown-root-fields');
  }
  if (!hasExactFields(source, SOURCE_FIELDS)) {
    issues.push('invalid-source-fields');
  }
  if (source.repository !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.repository) {
    issues.push('source-repository-mismatch');
  }
  if (source.commit !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.commit) {
    issues.push('source-commit-mismatch');
  }
  if (source.path !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.path) {
    issues.push('source-path-mismatch');
  }
  if (!isDesignatedRawUrl(stringAt(source, 'rawUrl'))) {
    issues.push('source-raw-url-mismatch');
  }
  if (source.publisher !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.publisher) {
    issues.push('source-publisher-mismatch');
  }
  if (!hasExactFields(license, LICENSE_FIELDS)) {
    issues.push('invalid-license-fields');
  }
  if (
    license.name !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.name
  ) {
    issues.push('license-name-mismatch');
  }
  if (
    license.referenceUrl !==
    AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.referenceUrl
  ) {
    issues.push('license-reference-mismatch');
  }
  if (
    license.bytes !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.bytes
  ) {
    issues.push('license-bytes-mismatch');
  }
  if (
    license.sha256 !==
    AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.sha256
  ) {
    issues.push('license-sha256-mismatch');
  }
  if (!isStrictUtcTimestamp(stringAt(record, 'observedAt'))) {
    issues.push('invalid-observed-at');
  }
  if (!hasExactFields(raw, RAW_FIELDS)) {
    issues.push('invalid-raw-fields');
  }
  if (raw.bytes !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.raw.bytes) {
    issues.push('raw-bytes-mismatch');
  }
  if (raw.sha256 !== AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.raw.sha256) {
    issues.push('raw-sha256-mismatch');
  }
  if (
    !hasExactFields(
      declaredMetadata,
      AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.allowedDeclaredFields,
    )
  ) {
    issues.push('invalid-declared-metadata-fields');
  }
  if (
    stringAt(declaredMetadata, 'name') !==
    AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.declaredMetadata.name
  ) {
    issues.push('declared-name-mismatch');
  }
  if (
    stringAt(declaredMetadata, 'description') !==
    AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.declaredMetadata.description
  ) {
    issues.push('declared-description-mismatch');
  }
  if (stringAt(declaredMetadata, 'name').trim() === '') {
    issues.push('missing-declared-name');
  }
  if (stringAt(declaredMetadata, 'description').trim() === '') {
    issues.push('missing-declared-description');
  }

  if (issues.length === 0) {
    return {
      kind: 'ready',
      issues: [],
      boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
    };
  }

  return {
    kind: 'not-ready',
    issues,
    boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
  };
}

export function discloseAmdLocalAiUseProspectiveSource(
  prospectiveSource: unknown,
): AmdLocalAiUsePublicDisclosureResult {
  const assessment = assessAmdLocalAiUseProspectiveSource(prospectiveSource);
  if (assessment.kind === 'not-ready') {
    return {
      kind: 'not-ready',
      issues: assessment.issues,
      disclosure: null,
      boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
    };
  }

  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');

  return {
    source: {
      repository: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.repository,
      path: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.path,
      commit: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.commit,
      rawUrl: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.rawUrl,
      publisher: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.publisher,
    },
    inheritedLicense: {
      name: AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.name,
      referenceUrl:
        AMD_LOCAL_AI_USE_SOURCE_DESIGNATION.inheritedLicense.referenceUrl,
    },
    observedAt: stringAt(record, 'observedAt'),
    hashes: {
      rawSha256: stringAt(raw, 'sha256'),
    },
    declaredMetadata: {
      name: stringAt(declaredMetadata, 'name'),
      description: stringAt(declaredMetadata, 'description'),
    },
    boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
  };
}
