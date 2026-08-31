import { describe, expect, it } from 'vitest';
import {
  MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION,
  admitMicrosoftSkillCreatorObservation,
} from './microsoft-skill-creator-source-observation.js';

const observation = {
  observedAt: '2026-08-31T04:15:00.000Z',
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
    sha256: 'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb',
  },
  raw: {
    bytes: 68147,
    sha256: '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
  },
  declaredMetadata: {
    name: 'skill-creator',
    description:
      'Guide for creating effective skills for AI coding agents working with Azure SDKs and Microsoft Foundry services. Use when creating new skills or updating existing skills.',
  },
} as const;

describe('Microsoft skill creator source observation admission', () => {
  it('admits exact source-derived metadata without retaining instruction content', () => {
    const admitted = admitMicrosoftSkillCreatorObservation(observation);

    expect(admitted).toMatchObject({
      kind: 'skill-source-metadata',
      packageId: 'skill-creator',
      description: observation.declaredMetadata.description,
      declaredLicense: 'MIT License',
      sourceRepository: observation.source.repository,
      sourceCommit: observation.source.commit,
      sourcePath: observation.source.path,
      inheritedLicenseUrl: observation.inheritedLicense.referenceUrl,
      contentsSha256: observation.raw.sha256,
    });
    expect(admitted).not.toHaveProperty('instructionBody');
    expect(admitted).not.toHaveProperty('body');
    expect(admitted.boundary).toContain('declared metadata only');
  });

  it.each([
    ['raw hash', { raw: { ...observation.raw, sha256: 'a'.repeat(64) } }],
    [
      'license hash',
      {
        inheritedLicense: {
          ...observation.inheritedLicense,
          sha256: 'b'.repeat(64),
        },
      },
    ],
    [
      'unknown metadata',
      {
        declaredMetadata: {
          ...observation.declaredMetadata,
          instructions: 'do not admit',
        },
      },
    ],
  ])('rejects %s drift', (_label, mutation) => {
    expect(() =>
      admitMicrosoftSkillCreatorObservation({
        ...observation,
        ...mutation,
      }),
    ).toThrow(/SOURCE_OBSERVATION_NOT_ADMITTED/);
  });

  it('exports the exact immutable designation used by admission', () => {
    expect(MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw.sha256).toBe(
      observation.raw.sha256,
    );
  });
});
