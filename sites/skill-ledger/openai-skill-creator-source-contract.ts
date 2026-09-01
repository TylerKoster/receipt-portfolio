export const OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY =
  'This contract admits designated static declared metadata only. It does not publish or execute the instruction body, verify currentness or provenance, or establish security, safety, runtime behavior, adoption, suitability, recommendation, endorsement, demand, conversion, revenue, or public deployment. Publisher is a repository namespace label only and is not independently verified. Coordinator-owned evidence collection and inventory wiring remain required.' as const;

const packageLicense = Object.freeze({
  name: 'Apache License 2.0',
  referenceUrl:
    'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/LICENSE.txt',
  bytes: 11358,
  sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
} as const);

const designatedRaw = Object.freeze({
  bytes: 18664,
  sha256: 'a17383bfb1448637ac1f757ad891ddb9676fa30b0eff620200f0e1cbc0cc0d50',
} as const);

const designatedDeclaredMetadata = Object.freeze({
  name: 'skill-creator',
  description:
    "Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.",
} as const);

export const OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION = Object.freeze({
  repository: 'https://github.com/openai/skills',
  commit: '49f948faa9258a0c61caceaf225e179651397431',
  path: 'skills/.system/skill-creator/SKILL.md',
  rawUrl:
    'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/SKILL.md',
  publisher: 'OpenAI',
  publisherBoundary:
    'Repository namespace only; identity and provenance are not independently verified.',
  allowedRawHost: 'raw.githubusercontent.com',
  allowedDeclaredFields: Object.freeze(['name', 'description'] as const),
  packageLicense,
  raw: designatedRaw,
  declaredMetadata: designatedDeclaredMetadata,
} as const);

export type OpenAiSkillCreatorProspectiveSource = Readonly<{
  source: Readonly<{
    repository: string;
    commit: string;
    path: string;
    rawUrl: string;
    publisher: string;
  }>;
  packageLicense: Readonly<{
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

export type OpenAiSkillCreatorSourceContractIssue =
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

export type OpenAiSkillCreatorSourceContractAssessment =
  | Readonly<{
      kind: 'ready';
      issues: readonly [];
      boundary: typeof OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY;
    }>
  | Readonly<{
      kind: 'not-ready';
      issues: readonly OpenAiSkillCreatorSourceContractIssue[];
      boundary: typeof OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY;
    }>;

export type OpenAiSkillCreatorPublicDisclosure = Readonly<{
  source: Readonly<{
    repository: string;
    path: string;
    commit: string;
    rawUrl: string;
    publisher: string;
  }>;
  packageLicense: Readonly<{
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
  boundary: typeof OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY;
}>;

export type OpenAiSkillCreatorPublicDisclosureNotReady = Readonly<{
  kind: 'not-ready';
  issues: readonly OpenAiSkillCreatorSourceContractIssue[];
  disclosure: null;
  boundary: typeof OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY;
}>;

export type OpenAiSkillCreatorPublicDisclosureResult =
  | OpenAiSkillCreatorPublicDisclosure
  | OpenAiSkillCreatorPublicDisclosureNotReady;

type UnknownRecord = Readonly<Record<string, unknown>>;

const ROOT_FIELDS = [
  'source',
  'packageLicense',
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
      url.hostname === OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.allowedRawHost &&
      value === OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl
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

export function assessOpenAiSkillCreatorProspectiveSource(
  prospectiveSource: unknown,
): OpenAiSkillCreatorSourceContractAssessment {
  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const source = recordAt(record, 'source');
  const license = recordAt(record, 'packageLicense');
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');
  const issues: OpenAiSkillCreatorSourceContractIssue[] = [];

  if (!hasExactFields(record, ROOT_FIELDS)) {
    issues.push('unknown-root-fields');
  }
  if (!hasExactFields(source, SOURCE_FIELDS)) {
    issues.push('invalid-source-fields');
  }
  if (
    source.repository !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.repository
  ) {
    issues.push('source-repository-mismatch');
  }
  if (source.commit !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.commit) {
    issues.push('source-commit-mismatch');
  }
  if (source.path !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.path) {
    issues.push('source-path-mismatch');
  }
  if (!isDesignatedRawUrl(stringAt(source, 'rawUrl'))) {
    issues.push('source-raw-url-mismatch');
  }
  if (source.publisher !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.publisher) {
    issues.push('source-publisher-mismatch');
  }
  if (!hasExactFields(license, LICENSE_FIELDS)) {
    issues.push('invalid-license-fields');
  }
  if (
    license.name !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.name
  ) {
    issues.push('license-name-mismatch');
  }
  if (
    license.referenceUrl !==
    OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.referenceUrl
  ) {
    issues.push('license-reference-mismatch');
  }
  if (
    license.bytes !==
    OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.bytes
  ) {
    issues.push('license-bytes-mismatch');
  }
  if (
    license.sha256 !==
    OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.sha256
  ) {
    issues.push('license-sha256-mismatch');
  }
  if (!isStrictUtcTimestamp(stringAt(record, 'observedAt'))) {
    issues.push('invalid-observed-at');
  }
  if (!hasExactFields(raw, RAW_FIELDS)) {
    issues.push('invalid-raw-fields');
  }
  if (raw.bytes !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.raw.bytes) {
    issues.push('raw-bytes-mismatch');
  }
  if (raw.sha256 !== OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.raw.sha256) {
    issues.push('raw-sha256-mismatch');
  }
  if (
    !hasExactFields(
      declaredMetadata,
      OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.allowedDeclaredFields,
    )
  ) {
    issues.push('invalid-declared-metadata-fields');
  }
  if (
    stringAt(declaredMetadata, 'name') !==
    OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.declaredMetadata.name
  ) {
    issues.push('declared-name-mismatch');
  }
  if (
    stringAt(declaredMetadata, 'description') !==
    OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.declaredMetadata.description
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
      boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
    };
  }

  return {
    kind: 'not-ready',
    issues,
    boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
  };
}

export function discloseOpenAiSkillCreatorProspectiveSource(
  prospectiveSource: unknown,
): OpenAiSkillCreatorPublicDisclosureResult {
  const assessment =
    assessOpenAiSkillCreatorProspectiveSource(prospectiveSource);
  if (assessment.kind === 'not-ready') {
    return {
      kind: 'not-ready',
      issues: assessment.issues,
      disclosure: null,
      boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
    };
  }

  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');

  return {
    source: {
      repository: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.repository,
      path: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.path,
      commit: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.commit,
      rawUrl: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl,
      publisher: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.publisher,
    },
    packageLicense: {
      name: OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.name,
      referenceUrl:
        OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION.packageLicense.referenceUrl,
    },
    observedAt: stringAt(record, 'observedAt'),
    hashes: {
      rawSha256: stringAt(raw, 'sha256'),
    },
    declaredMetadata: {
      name: stringAt(declaredMetadata, 'name'),
      description: stringAt(declaredMetadata, 'description'),
    },
    boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
  };
}
