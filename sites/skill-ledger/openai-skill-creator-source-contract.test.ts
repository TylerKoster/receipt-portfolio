import { describe, expect, it } from 'vitest';
import {
  OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
  OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION,
  assessOpenAiSkillCreatorProspectiveSource,
  discloseOpenAiSkillCreatorProspectiveSource,
  type OpenAiSkillCreatorProspectiveSource,
} from './openai-skill-creator-source-contract.js';

function controlledProspectiveSource(): OpenAiSkillCreatorProspectiveSource {
  return {
    source: {
      repository: 'https://github.com/openai/skills',
      commit: '49f948faa9258a0c61caceaf225e179651397431',
      path: 'skills/.system/skill-creator/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/SKILL.md',
      publisher: 'OpenAI',
    },
    packageLicense: {
      name: 'Apache License 2.0',
      referenceUrl:
        'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/LICENSE.txt',
      bytes: 11358,
      sha256:
        'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
    },
    observedAt: '2026-09-01T10:11:12.123Z',
    raw: {
      bytes: 18664,
      sha256:
        'a17383bfb1448637ac1f757ad891ddb9676fa30b0eff620200f0e1cbc0cc0d50',
    },
    declaredMetadata: {
      name: 'skill-creator',
      description:
        "Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.",
    },
  };
}

describe('OpenAI skill-creator designated source contract', () => {
  it('exposes only the fixed static designation and explicit boundary', () => {
    expect(OPENAI_SKILL_CREATOR_SOURCE_DESIGNATION).toEqual({
      repository: 'https://github.com/openai/skills',
      commit: '49f948faa9258a0c61caceaf225e179651397431',
      path: 'skills/.system/skill-creator/SKILL.md',
      rawUrl:
        'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/SKILL.md',
      publisher: 'OpenAI',
      publisherBoundary:
        'Repository namespace only; identity and provenance are not independently verified.',
      allowedRawHost: 'raw.githubusercontent.com',
      allowedDeclaredFields: ['name', 'description'],
      packageLicense: {
        name: 'Apache License 2.0',
        referenceUrl:
          'https://raw.githubusercontent.com/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/LICENSE.txt',
        bytes: 11358,
        sha256:
          'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
      },
      raw: {
        bytes: 18664,
        sha256:
          'a17383bfb1448637ac1f757ad891ddb9676fa30b0eff620200f0e1cbc0cc0d50',
      },
      declaredMetadata: {
        name: 'skill-creator',
        description:
          "Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations.",
      },
    });
    expect(OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY).toContain(
      'does not publish or execute the instruction body',
    );
    expect(OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY).toContain('recommendation');
  });

  it('admits the exact static controlled source and discloses only the allowlist', () => {
    const record = controlledProspectiveSource();

    expect(assessOpenAiSkillCreatorProspectiveSource(record)).toEqual({
      kind: 'ready',
      issues: [],
      boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
    expect(discloseOpenAiSkillCreatorProspectiveSource(record)).toEqual({
      source: record.source,
      packageLicense: {
        name: record.packageLicense.name,
        referenceUrl: record.packageLicense.referenceUrl,
      },
      observedAt: record.observedAt,
      hashes: { rawSha256: record.raw.sha256 },
      declaredMetadata: record.declaredMetadata,
      boundary: OPENAI_SKILL_CREATOR_SOURCE_BOUNDARY,
    });
  });

  it.each([
    [
      'source repository',
      ['source', 'repository'],
      'https://github.com/example/skills',
      'source-repository-mismatch',
    ],
    [
      'source commit',
      ['source', 'commit'],
      'other-commit',
      'source-commit-mismatch',
    ],
    ['source path', ['source', 'path'], 'README.md', 'source-path-mismatch'],
    [
      'source raw URL',
      ['source', 'rawUrl'],
      'https://example.invalid/SKILL.md',
      'source-raw-url-mismatch',
    ],
    [
      'source publisher',
      ['source', 'publisher'],
      'Not OpenAI',
      'source-publisher-mismatch',
    ],
    [
      'license name',
      ['packageLicense', 'name'],
      'MIT License',
      'license-name-mismatch',
    ],
    [
      'license reference',
      ['packageLicense', 'referenceUrl'],
      'https://example.invalid/LICENSE.txt',
      'license-reference-mismatch',
    ],
    [
      'license byte length',
      ['packageLicense', 'bytes'],
      1,
      'license-bytes-mismatch',
    ],
    [
      'license hash',
      ['packageLicense', 'sha256'],
      'a'.repeat(64),
      'license-sha256-mismatch',
    ],
    ['raw byte length', ['raw', 'bytes'], 1, 'raw-bytes-mismatch'],
    ['raw hash', ['raw', 'sha256'], 'b'.repeat(64), 'raw-sha256-mismatch'],
    [
      'declared name',
      ['declaredMetadata', 'name'],
      'different',
      'declared-name-mismatch',
    ],
    [
      'declared description',
      ['declaredMetadata', 'description'],
      'different',
      'declared-description-mismatch',
    ],
  ] as const)(
    'fails closed for a changed %s',
    (_label, [section, field], value, issue) => {
      const record = controlledProspectiveSource();
      const result = discloseOpenAiSkillCreatorProspectiveSource({
        ...record,
        [section]: { ...record[section], [field]: value },
      });

      expect(result).toMatchObject({
        kind: 'not-ready',
        issues: [issue],
        disclosure: null,
      });
    },
  );

  it.each([
    [
      'an invalid observed timestamp',
      { observedAt: 'not-a-timestamp' },
      'invalid-observed-at',
    ],
    [
      'a malformed raw URL',
      {
        source: {
          ...controlledProspectiveSource().source,
          rawUrl: 'not a URL',
        },
      },
      'source-raw-url-mismatch',
    ],
    [
      'a raw host alias',
      {
        source: {
          ...controlledProspectiveSource().source,
          rawUrl:
            'https://raw.githubusercontent.com.example.invalid/openai/skills/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator/SKILL.md',
        },
      },
      'source-raw-url-mismatch',
    ],
    [
      'extra upstream metadata',
      { upstream: { shortDescription: 'must not be admitted' } },
      'unknown-root-fields',
    ],
    [
      'the upstream metadata.short-description field',
      { metadata: { 'short-description': 'must not be admitted' } },
      'unknown-root-fields',
    ],
    [
      'an instruction body',
      { instructionBody: 'must not be admitted' },
      'unknown-root-fields',
    ],
  ] as const)('returns null disclosure for %s', (_label, mutation, issue) => {
    const result = discloseOpenAiSkillCreatorProspectiveSource({
      ...controlledProspectiveSource(),
      ...mutation,
    });

    expect(result).toMatchObject({
      kind: 'not-ready',
      issues: [issue],
      disclosure: null,
    });
    expect(JSON.stringify(result)).not.toContain('must not be admitted');
  });
});
