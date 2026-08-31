import { describe, expect, it } from 'vitest';
import {
  MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
  MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION,
  assessMicrosoftSkillCreatorProspectiveSource,
  discloseMicrosoftSkillCreatorProspectiveSource,
  type MicrosoftSkillCreatorProspectiveSource,
} from './microsoft-skill-creator-source-contract.js';

function controlledProspectiveSource(): MicrosoftSkillCreatorProspectiveSource {
  return {
    source: {
      repository: 'https://github.com/microsoft/skills',
      commit: '7066b58141d8cc66f39356b2ee5bb64d428dcf17',
      path: '.github/skills/skill-creator/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
      publisher: 'Microsoft',
    },
    inheritedLicense: {
      name: 'MIT License',
      referenceUrl:
        'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE',
      bytes: 1140,
      sha256:
        'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb',
    },
    observedAt: '2026-08-30T12:34:56.789Z',
    raw: {
      bytes: 68147,
      sha256:
        '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
    },
    normalizedSha256:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    contentSha256:
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    declaredMetadata: {
      name: 'controlled prospective name',
      description: 'Controlled prospective description for contract testing.',
    },
  };
}

describe('Microsoft skill-creator designated source contract', () => {
  it('exposes the exact coordinator-designated immutable contract', () => {
    expect(MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION).toEqual({
      repository: 'https://github.com/microsoft/skills',
      commit: '7066b58141d8cc66f39356b2ee5bb64d428dcf17',
      path: '.github/skills/skill-creator/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
      publisher: 'Microsoft',
      allowedRawHost: 'raw.githubusercontent.com',
      allowedDeclaredFields: ['name', 'description'],
      inheritedLicense: {
        name: 'MIT License',
        referenceUrl:
          'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE',
        bytes: 1140,
        sha256:
          'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb',
      },
      raw: {
        bytes: 68147,
        sha256:
          '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
      },
    });
    expect(MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY).toBe(
      'This contract admits declared metadata only. It does not publish or execute the instruction body, verify currentness or provenance, or establish security, safety, adoption, suitability, recommendation, or endorsement.',
    );
  });

  it('admits a controlled prospective record without asserting upstream frontmatter facts', () => {
    expect(
      assessMicrosoftSkillCreatorProspectiveSource(
        controlledProspectiveSource(),
      ),
    ).toEqual({
      kind: 'ready',
      issues: [],
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
  });

  it('returns every failure class in deterministic contract order', () => {
    expect(
      assessMicrosoftSkillCreatorProspectiveSource({
        source: {
          repository: 'https://example.invalid/not-designated',
          commit: 'not-designated',
          path: 'README.md',
          rawUrl: 'https://example.invalid/SKILL.md',
          publisher: 'Not designated',
        },
        inheritedLicense: {
          name: 'Not designated',
          referenceUrl: 'https://example.invalid/LICENSE',
          bytes: 0,
          sha256: 'A'.repeat(64),
        },
        observedAt: '2026-08-30T12:34:56Z',
        raw: { bytes: 0, sha256: 'B'.repeat(64) },
        normalizedSha256: 'C'.repeat(64),
        contentSha256: 'not-a-hash',
        declaredMetadata: { extra: 'not allowed' },
        instructionBody: 'must never be admitted',
      }),
    ).toEqual({
      kind: 'not-ready',
      issues: [
        'unknown-root-fields',
        'source-repository-mismatch',
        'source-commit-mismatch',
        'source-path-mismatch',
        'source-raw-url-mismatch',
        'source-publisher-mismatch',
        'license-name-mismatch',
        'license-reference-mismatch',
        'license-bytes-mismatch',
        'license-sha256-mismatch',
        'invalid-observed-at',
        'raw-bytes-mismatch',
        'raw-sha256-mismatch',
        'invalid-normalized-sha256',
        'invalid-content-sha256',
        'invalid-declared-metadata-fields',
        'missing-declared-name',
        'missing-declared-description',
      ],
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
  });

  it.each([
    'not a URL',
    'https://raw.githubusercontent.com.example.invalid/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
  ])('rejects malformed or non-allowlisted raw endpoint %s', (rawUrl) => {
    const record = controlledProspectiveSource();

    expect(
      assessMicrosoftSkillCreatorProspectiveSource({
        ...record,
        source: { ...record.source, rawUrl },
      }),
    ).toMatchObject({
      kind: 'not-ready',
      issues: ['source-raw-url-mismatch'],
    });
  });

  it('rejects extra declared fields and an instruction-body root field', () => {
    const record = controlledProspectiveSource();

    expect(
      assessMicrosoftSkillCreatorProspectiveSource({
        ...record,
        declaredMetadata: {
          ...record.declaredMetadata,
          instructions: 'not permitted',
        },
        body: 'not permitted',
      }),
    ).toEqual({
      kind: 'not-ready',
      issues: ['unknown-root-fields', 'invalid-declared-metadata-fields'],
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
  });

  it('returns only the public disclosure allowlist, even for hostile cast input', () => {
    const record = {
      ...controlledProspectiveSource(),
      instructionBody: 'secret instruction body',
      scripts: ['never disclose'],
      declaredMetadata: {
        ...controlledProspectiveSource().declaredMetadata,
        body: 'nested secret body',
      },
    } as unknown as MicrosoftSkillCreatorProspectiveSource;

    const disclosure = discloseMicrosoftSkillCreatorProspectiveSource(record);

    expect(disclosure).toEqual({
      source: {
        repository: 'https://github.com/microsoft/skills',
        path: '.github/skills/skill-creator/SKILL.md',
        commit: '7066b58141d8cc66f39356b2ee5bb64d428dcf17',
        rawUrl:
          'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
        publisher: 'Microsoft',
      },
      inheritedLicense: {
        name: 'MIT License',
        referenceUrl:
          'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE',
      },
      observedAt: '2026-08-30T12:34:56.789Z',
      hashes: {
        rawSha256:
          '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
        normalizedSha256:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        contentSha256:
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      },
      declaredMetadata: {
        name: 'controlled prospective name',
        description: 'Controlled prospective description for contract testing.',
      },
      boundary: MICROSOFT_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
    expect(JSON.stringify(disclosure)).not.toMatch(
      /secret instruction body|nested secret body|instructionBody|scripts/,
    );
  });

  it('does not mutate prospective records during assessment or disclosure', () => {
    const record = controlledProspectiveSource();
    const before = structuredClone(record);

    assessMicrosoftSkillCreatorProspectiveSource(record);
    discloseMicrosoftSkillCreatorProspectiveSource(record);

    expect(record).toEqual(before);
  });
});
