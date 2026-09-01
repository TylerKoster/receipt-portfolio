import { describe, expect, it } from 'vitest';
import {
  AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
  AMD_LOCAL_AI_USE_SOURCE_DESIGNATION,
  assessAmdLocalAiUseProspectiveSource,
  discloseAmdLocalAiUseProspectiveSource,
  type AmdLocalAiUseProspectiveSource,
} from './amd-local-ai-use-source-contract.js';

function controlledProspectiveSource(): AmdLocalAiUseProspectiveSource {
  return {
    source: {
      repository: 'https://github.com/amd/skills',
      commit: 'e867fa4ae4516f644221cb04dcdf24008a43cb99',
      path: 'skills/local-ai-use/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/skills/local-ai-use/SKILL.md',
      publisher: 'AMD',
    },
    inheritedLicense: {
      name: 'MIT License',
      referenceUrl:
        'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/LICENSE',
      bytes: 1106,
      sha256:
        '6a86faf98a4909cc6341592da475f17fc2f9e18d21b59f30a5a62314c6a8c216',
    },
    observedAt: '2026-08-31T04:12:34.567Z',
    raw: {
      bytes: 18207,
      sha256:
        '61f11302b346130f8a676f4ff3d28734857beb8a09362d797fc43ffc9b014755',
    },
    normalizedSha256:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    contentSha256:
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    declaredMetadata: {
      name: 'local-ai-use',
      description:
        'Controlled declared description fixture; no recommendation.',
    },
  };
}

describe('AMD local-ai-use designated source contract', () => {
  it('exposes only the exact immutable static designation and explicit boundary', () => {
    expect(AMD_LOCAL_AI_USE_SOURCE_DESIGNATION).toEqual({
      repository: 'https://github.com/amd/skills',
      commit: 'e867fa4ae4516f644221cb04dcdf24008a43cb99',
      path: 'skills/local-ai-use/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/skills/local-ai-use/SKILL.md',
      publisher: 'AMD',
      allowedRawHost: 'raw.githubusercontent.com',
      allowedDeclaredFields: ['name', 'description'],
      inheritedLicense: {
        name: 'MIT License',
        referenceUrl:
          'https://raw.githubusercontent.com/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/LICENSE',
        bytes: 1106,
        sha256:
          '6a86faf98a4909cc6341592da475f17fc2f9e18d21b59f30a5a62314c6a8c216',
      },
      raw: {
        bytes: 18207,
        sha256:
          '61f11302b346130f8a676f4ff3d28734857beb8a09362d797fc43ffc9b014755',
      },
    });
    expect(AMD_LOCAL_AI_USE_SOURCE_BOUNDARY).toBe(
      'This contract admits designated static declared metadata only. It does not publish or execute the instruction body, verify currentness or provenance, or establish security, safety, runtime behavior, adoption, suitability, recommendation, endorsement, demand, conversion, revenue, or public deployment. Coordinator-owned evidence collection and inventory wiring remain required.',
    );
  });

  it('admits a controlled record and discloses only the public allowlist', () => {
    const record = controlledProspectiveSource();

    expect(assessAmdLocalAiUseProspectiveSource(record)).toEqual({
      kind: 'ready',
      issues: [],
      boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
    });
    expect(discloseAmdLocalAiUseProspectiveSource(record)).toEqual({
      source: record.source,
      inheritedLicense: {
        name: record.inheritedLicense.name,
        referenceUrl: record.inheritedLicense.referenceUrl,
      },
      observedAt: record.observedAt,
      hashes: {
        rawSha256: record.raw.sha256,
        normalizedSha256: record.normalizedSha256,
        contentSha256: record.contentSha256,
      },
      declaredMetadata: record.declaredMetadata,
      boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
    });
  });

  it('rejects altered coordinates, hashes, license, and unallowlisted fields without disclosure', () => {
    const record = controlledProspectiveSource();
    const result = discloseAmdLocalAiUseProspectiveSource({
      ...record,
      source: {
        ...record.source,
        rawUrl: 'https://example.invalid/skill.md',
        extra: 'not permitted',
      },
      inheritedLicense: { ...record.inheritedLicense, sha256: 'a'.repeat(64) },
      raw: { ...record.raw, sha256: 'b'.repeat(64) },
      declaredMetadata: {
        ...record.declaredMetadata,
        instructionBody: 'must never be admitted',
      },
      body: 'must never be admitted',
    });

    expect(result).toEqual({
      kind: 'not-ready',
      issues: [
        'unknown-root-fields',
        'invalid-source-fields',
        'source-raw-url-mismatch',
        'license-sha256-mismatch',
        'raw-sha256-mismatch',
        'invalid-declared-metadata-fields',
      ],
      disclosure: null,
      boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
    });
    expect(JSON.stringify(result)).not.toContain('must never be admitted');
  });

  it.each([
    [
      'repository',
      'https://github.com/example/skills',
      'source-repository-mismatch',
    ],
    ['commit', 'not-the-designated-commit', 'source-commit-mismatch'],
    ['path', 'README.md', 'source-path-mismatch'],
    ['publisher', 'Not AMD', 'source-publisher-mismatch'],
  ] as const)(
    'rejects an altered source %s coordinate',
    (field, value, issue) => {
      const record = controlledProspectiveSource();

      expect(
        assessAmdLocalAiUseProspectiveSource({
          ...record,
          source: { ...record.source, [field]: value },
        }),
      ).toMatchObject({ kind: 'not-ready', issues: [issue] });
    },
  );
});
