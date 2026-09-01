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
    declaredMetadata: {
      name: 'local-ai-use',
      description:
        "Makes this agent generate images, transcribe audio, and synthesize speech on the user's own machine through a local Lemonade Server instead of a paid cloud API. Use it above all to change that routing persistently, from now on — keep generating pictures locally while chat stays on the cloud; set this workspace up to make images on my own machine — even when the user asks for no image or file in the same breath. Also use it for a single request the user wants done locally, offline, on-device, or kept private: transcribe this recording, make this picture, read this text aloud. Applies in Claude, Cursor, Codex, or any agent harness. Use when the user wants to cut cost or tokens on image, audio, or voice API calls, or to drop DALL-E, hosted Whisper, ElevenLabs, or other paid multimodal APIs; or mentions Lemonade Server, OmniRouter, SD-Turbo, kokoro, Ryzen AI, or NPU/iGPU/dGPU inference. Changes no application source code; do not use it if the user is adding local AI to an app they ship.",
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
      declaredMetadata: {
        name: 'local-ai-use',
        description:
          "Makes this agent generate images, transcribe audio, and synthesize speech on the user's own machine through a local Lemonade Server instead of a paid cloud API. Use it above all to change that routing persistently, from now on — keep generating pictures locally while chat stays on the cloud; set this workspace up to make images on my own machine — even when the user asks for no image or file in the same breath. Also use it for a single request the user wants done locally, offline, on-device, or kept private: transcribe this recording, make this picture, read this text aloud. Applies in Claude, Cursor, Codex, or any agent harness. Use when the user wants to cut cost or tokens on image, audio, or voice API calls, or to drop DALL-E, hosted Whisper, ElevenLabs, or other paid multimodal APIs; or mentions Lemonade Server, OmniRouter, SD-Turbo, kokoro, Ryzen AI, or NPU/iGPU/dGPU inference. Changes no application source code; do not use it if the user is adding local AI to an app they ship.",
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

  it('rejects declared metadata altered from the designated static observation', () => {
    const record = controlledProspectiveSource();

    expect(
      assessAmdLocalAiUseProspectiveSource({
        ...record,
        declaredMetadata: {
          ...record.declaredMetadata,
          description: 'Not the designated declared description.',
        },
      }),
    ).toMatchObject({
      kind: 'not-ready',
      issues: ['declared-description-mismatch'],
    });
  });

  it('rejects unbound derived hashes instead of disclosing them', () => {
    const record = controlledProspectiveSource();

    expect(
      discloseAmdLocalAiUseProspectiveSource({
        ...record,
        normalizedSha256: 'a'.repeat(64),
        contentSha256: 'b'.repeat(64),
      }),
    ).toMatchObject({
      kind: 'not-ready',
      issues: ['unknown-root-fields'],
      disclosure: null,
    });
  });

  it.each([
    [
      'an invalid observed timestamp',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        observedAt: '2026-02-30T04:12:34.567Z',
      }),
      ['invalid-observed-at'],
    ],
    [
      'a changed license name',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        inheritedLicense: { ...record.inheritedLicense, name: 'Apache-2.0' },
      }),
      ['license-name-mismatch'],
    ],
    [
      'a changed license reference',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        inheritedLicense: {
          ...record.inheritedLicense,
          referenceUrl: 'https://example.invalid/LICENSE',
        },
      }),
      ['license-reference-mismatch'],
    ],
    [
      'a changed license byte length',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        inheritedLicense: { ...record.inheritedLicense, bytes: 1105 },
      }),
      ['license-bytes-mismatch'],
    ],
    [
      'a changed raw byte length',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        raw: { ...record.raw, bytes: 18206 },
      }),
      ['raw-bytes-mismatch'],
    ],
    [
      'a changed declared name',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        declaredMetadata: { ...record.declaredMetadata, name: 'different' },
      }),
      ['declared-name-mismatch'],
    ],
    [
      'a malformed raw URL',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        source: { ...record.source, rawUrl: 'not a URL' },
      }),
      ['source-raw-url-mismatch'],
    ],
    [
      'a raw-host alias',
      (record: AmdLocalAiUseProspectiveSource) => ({
        ...record,
        source: {
          ...record.source,
          rawUrl:
            'https://raw.githubusercontent.com.example.invalid/amd/skills/e867fa4ae4516f644221cb04dcdf24008a43cb99/skills/local-ai-use/SKILL.md',
        },
      }),
      ['source-raw-url-mismatch'],
    ],
  ] as const)(
    'returns no disclosure for %s',
    (_label, mutate, expectedIssues) => {
      const result = discloseAmdLocalAiUseProspectiveSource(
        mutate(controlledProspectiveSource()),
      );

      expect(result).toEqual({
        kind: 'not-ready',
        issues: expectedIssues,
        disclosure: null,
        boundary: AMD_LOCAL_AI_USE_SOURCE_BOUNDARY,
      });
    },
  );
});
