export const MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY =
  'This contract admits declared metadata only. It does not publish or execute the instruction body, verify currentness or provenance, or establish security, safety, adoption, suitability, recommendation, or endorsement.' as const;

const inheritedLicense = Object.freeze({
  name: 'MIT License',
  referenceUrl:
    'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE',
  bytes: 1140,
  sha256: 'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb',
} as const);

const designatedRaw = Object.freeze({
  bytes: 68147,
  sha256: '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
} as const);

export const MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION = Object.freeze({
  repository: 'https://github.com/microsoft/skills',
  commit: '7066b58141d8cc66f39356b2ee5bb64d428dcf17',
  path: '.github/skills/skill-creator/SKILL.md',
  rawUrl:
    'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
  publisher: 'Microsoft',
  allowedRawHost: 'raw.githubusercontent.com',
  allowedDeclaredFields: Object.freeze(['name', 'description'] as const),
  inheritedLicense,
  raw: designatedRaw,
} as const);

export type MicrosoftSkillCreatorProspectiveSource = Readonly<{
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
  normalizedSha256: string;
  contentSha256: string;
  declaredMetadata: Readonly<{
    name: string;
    description: string;
  }>;
}>;

export type MicrosoftSkillCreatorSourceContractIssue =
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
  | 'invalid-normalized-sha256'
  | 'invalid-content-sha256'
  | 'invalid-declared-metadata-fields'
  | 'missing-declared-name'
  | 'missing-declared-description';

export type MicrosoftSkillCreatorSourceContractAssessment =
  | Readonly<{
      kind: 'ready';
      issues: readonly [];
      boundary: typeof MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY;
    }>
  | Readonly<{
      kind: 'not-ready';
      issues: readonly MicrosoftSkillCreatorSourceContractIssue[];
      boundary: typeof MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY;
    }>;

export type MicrosoftSkillCreatorPublicDisclosure = Readonly<{
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
    normalizedSha256: string;
    contentSha256: string;
  }>;
  declaredMetadata: Readonly<{
    name: string;
    description: string;
  }>;
  boundary: typeof MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY;
}>;

export type MicrosoftSkillCreatorPublicDisclosureNotReady = Readonly<{
  kind: 'not-ready';
  issues: readonly MicrosoftSkillCreatorSourceContractIssue[];
  disclosure: null;
  boundary: typeof MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY;
}>;

export type MicrosoftSkillCreatorPublicDisclosureResult =
  | MicrosoftSkillCreatorPublicDisclosure
  | MicrosoftSkillCreatorPublicDisclosureNotReady;

type UnknownRecord = Readonly<Record<string, unknown>>;

const ROOT_FIELDS = [
  'source',
  'inheritedLicense',
  'observedAt',
  'raw',
  'normalizedSha256',
  'contentSha256',
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

function isLowercaseSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function isDesignatedRawUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname ===
        MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.allowedRawHost &&
      value === MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl
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

export function assessMicrosoftSkillCreatorProspectiveSource(
  prospectiveSource: unknown,
): MicrosoftSkillCreatorSourceContractAssessment {
  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const source = recordAt(record, 'source');
  const license = recordAt(record, 'inheritedLicense');
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');
  const issues: MicrosoftSkillCreatorSourceContractIssue[] = [];

  if (!hasExactFields(record, ROOT_FIELDS)) {
    issues.push('unknown-root-fields');
  }
  if (!hasExactFields(source, SOURCE_FIELDS)) {
    issues.push('invalid-source-fields');
  }
  if (
    source.repository !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.repository
  ) {
    issues.push('source-repository-mismatch');
  }
  if (source.commit !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.commit) {
    issues.push('source-commit-mismatch');
  }
  if (source.path !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.path) {
    issues.push('source-path-mismatch');
  }
  if (!isDesignatedRawUrl(stringAt(source, 'rawUrl'))) {
    issues.push('source-raw-url-mismatch');
  }
  if (
    source.publisher !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.publisher
  ) {
    issues.push('source-publisher-mismatch');
  }
  if (!hasExactFields(license, LICENSE_FIELDS)) {
    issues.push('invalid-license-fields');
  }
  if (
    license.name !==
    MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.name
  ) {
    issues.push('license-name-mismatch');
  }
  if (
    license.referenceUrl !==
    MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.referenceUrl
  ) {
    issues.push('license-reference-mismatch');
  }
  if (
    license.bytes !==
    MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.bytes
  ) {
    issues.push('license-bytes-mismatch');
  }
  if (
    license.sha256 !==
    MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.sha256
  ) {
    issues.push('license-sha256-mismatch');
  }
  if (!isStrictUtcTimestamp(stringAt(record, 'observedAt'))) {
    issues.push('invalid-observed-at');
  }
  if (!hasExactFields(raw, RAW_FIELDS)) {
    issues.push('invalid-raw-fields');
  }
  if (raw.bytes !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw.bytes) {
    issues.push('raw-bytes-mismatch');
  }
  if (raw.sha256 !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw.sha256) {
    issues.push('raw-sha256-mismatch');
  }
  if (!isLowercaseSha256(stringAt(record, 'normalizedSha256'))) {
    issues.push('invalid-normalized-sha256');
  }
  if (!isLowercaseSha256(stringAt(record, 'contentSha256'))) {
    issues.push('invalid-content-sha256');
  }
  if (
    !hasExactFields(
      declaredMetadata,
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.allowedDeclaredFields,
    )
  ) {
    issues.push('invalid-declared-metadata-fields');
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
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    };
  }

  return {
    kind: 'not-ready',
    issues,
    boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
  };
}

export function discloseMicrosoftSkillCreatorProspectiveSource(
  prospectiveSource: unknown,
): MicrosoftSkillCreatorPublicDisclosureResult {
  const assessment =
    assessMicrosoftSkillCreatorProspectiveSource(prospectiveSource);
  if (assessment.kind === 'not-ready') {
    return {
      kind: 'not-ready',
      issues: assessment.issues,
      disclosure: null,
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    };
  }

  const record = isRecord(prospectiveSource) ? prospectiveSource : {};
  const raw = recordAt(record, 'raw');
  const declaredMetadata = recordAt(record, 'declaredMetadata');

  return {
    source: {
      repository: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.repository,
      path: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.path,
      commit: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.commit,
      rawUrl: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl,
      publisher: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.publisher,
    },
    inheritedLicense: {
      name: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.name,
      referenceUrl:
        MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense
          .referenceUrl,
    },
    observedAt: stringAt(record, 'observedAt'),
    hashes: {
      rawSha256: stringAt(raw, 'sha256'),
      normalizedSha256: stringAt(record, 'normalizedSha256'),
      contentSha256: stringAt(record, 'contentSha256'),
    },
    declaredMetadata: {
      name: stringAt(declaredMetadata, 'name'),
      description: stringAt(declaredMetadata, 'description'),
    },
    boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
  };
}
