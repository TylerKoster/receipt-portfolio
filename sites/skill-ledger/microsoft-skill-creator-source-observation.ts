import {
  canonicalJson,
  sha256,
  type RawFetch,
} from '../../packages/evidence-core/src/index.js';
import {
  MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
  MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION,
  discloseMicrosoftSkillCreatorProspectiveSource,
} from './microsoft-skill-creator-source-contract.js';

export { MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION };

export interface MicrosoftSkillCreatorObservation {
  readonly observedAt: string;
  readonly source: {
    readonly repository: string;
    readonly commit: string;
    readonly path: string;
    readonly rawUrl: string;
    readonly publisher: string;
  };
  readonly inheritedLicense: {
    readonly name: string;
    readonly referenceUrl: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly raw: {
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly declaredMetadata: {
    readonly name: string;
    readonly description: string;
  };
}

export interface MicrosoftSkillCreatorPublicFacts {
  readonly kind: 'skill-source-metadata';
  readonly packageId: string;
  readonly description: string;
  readonly declaredLicense: string;
  readonly contentsSha256: string;
  readonly sourceRepository: string;
  readonly sourceCommit: string;
  readonly sourcePath: string;
  readonly inheritedLicenseUrl: string;
  readonly inheritedLicenseSha256: string;
  readonly boundary: typeof MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactFields(
  value: unknown,
  expectedFields: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
}

function sourceObservationError(): never {
  throw new Error('SOURCE_OBSERVATION_NOT_ADMITTED');
}

function strictTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function decodeDeclaredFrontmatter(bytes: Uint8Array): {
  readonly name: string;
  readonly description: string;
} {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return sourceObservationError();
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) return sourceObservationError();
  const lines = (match[1] ?? '').split(/\r?\n/u);
  if (lines.length !== 2) return sourceObservationError();
  const fields = new Map<string, string>();
  for (const line of lines) {
    const field = line.match(/^([a-z]+): ([^\r\n]+)$/u);
    if (!field || fields.has(field[1] ?? '')) return sourceObservationError();
    fields.set(field[1] ?? '', field[2] ?? '');
  }
  if (fields.size !== 2 || !fields.has('name') || !fields.has('description')) {
    return sourceObservationError();
  }
  return {
    name: fields.get('name') ?? '',
    description: fields.get('description') ?? '',
  };
}

export function createMicrosoftSkillCreatorObservationFromFetches(
  sourceFetch: RawFetch,
  licenseFetch: RawFetch,
): MicrosoftSkillCreatorObservation {
  const sourceSha256 = sha256(sourceFetch.bytes);
  const licenseSha256 = sha256(licenseFetch.bytes);
  if (
    sourceFetch.sourceUrl !==
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl ||
    licenseFetch.sourceUrl !==
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense
        .referenceUrl ||
    sourceFetch.bytes.byteLength !==
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw.bytes ||
    sourceFetch.byteCount !== sourceFetch.bytes.byteLength ||
    sourceFetch.rawSha256 !== sourceSha256 ||
    sourceSha256 !== MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw.sha256 ||
    licenseFetch.bytes.byteLength !==
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.bytes ||
    licenseFetch.byteCount !== licenseFetch.bytes.byteLength ||
    licenseFetch.rawSha256 !== licenseSha256 ||
    licenseSha256 !==
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.sha256 ||
    !strictTimestamp(sourceFetch.observedAt) ||
    !strictTimestamp(licenseFetch.observedAt)
  ) {
    return sourceObservationError();
  }
  const declaredMetadata = decodeDeclaredFrontmatter(sourceFetch.bytes);
  const observedAt =
    sourceFetch.observedAt > licenseFetch.observedAt
      ? sourceFetch.observedAt
      : licenseFetch.observedAt;
  const observation: MicrosoftSkillCreatorObservation = {
    observedAt,
    source: {
      repository: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.repository,
      commit: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.commit,
      path: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.path,
      rawUrl: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl,
      publisher: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.publisher,
    },
    inheritedLicense: {
      ...MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense,
    },
    raw: { ...MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw },
    declaredMetadata,
  };
  admitMicrosoftSkillCreatorObservation(observation);
  return observation;
}

export function admitMicrosoftSkillCreatorObservation(
  input: unknown,
): MicrosoftSkillCreatorPublicFacts {
  if (
    !hasExactFields(input, [
      'observedAt',
      'source',
      'inheritedLicense',
      'raw',
      'declaredMetadata',
    ]) ||
    !hasExactFields(input.source, [
      'repository',
      'commit',
      'path',
      'rawUrl',
      'publisher',
    ]) ||
    !hasExactFields(input.inheritedLicense, [
      'name',
      'referenceUrl',
      'bytes',
      'sha256',
    ]) ||
    !hasExactFields(input.raw, ['bytes', 'sha256']) ||
    !hasExactFields(input.declaredMetadata, ['name', 'description'])
  ) {
    return sourceObservationError();
  }

  const normalizedDisclosure = {
    source: input.source,
    inheritedLicense: input.inheritedLicense,
    declaredMetadata: input.declaredMetadata,
  };
  const normalizedSha256 = sha256(
    new TextEncoder().encode(canonicalJson(normalizedDisclosure)),
  );
  const prospectiveSource = {
    source: input.source,
    inheritedLicense: input.inheritedLicense,
    observedAt: input.observedAt,
    raw: input.raw,
    normalizedSha256,
    contentSha256: input.raw.sha256,
    declaredMetadata: input.declaredMetadata,
  };
  const disclosure =
    discloseMicrosoftSkillCreatorProspectiveSource(prospectiveSource);
  if ('disclosure' in disclosure) {
    return sourceObservationError();
  }

  return {
    kind: 'skill-source-metadata',
    packageId: disclosure.declaredMetadata.name,
    description: disclosure.declaredMetadata.description,
    declaredLicense: disclosure.inheritedLicense.name,
    contentsSha256: disclosure.hashes.contentSha256,
    sourceRepository: disclosure.source.repository,
    sourceCommit: disclosure.source.commit,
    sourcePath: disclosure.source.path,
    inheritedLicenseUrl: disclosure.inheritedLicense.referenceUrl,
    inheritedLicenseSha256: input.inheritedLicense.sha256 as string,
    boundary: disclosure.boundary,
  };
}
