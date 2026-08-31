import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  manifestSha256,
  validateManifest,
  type SourceManifest,
} from '../src/index.js';

const validManifest = {
  siteId: 'search-receipt',
  sourceId: 'google-search-status',
  kind: 'json',
  endpoint: 'https://example.invalid/search-receipt/google-search-status.json',
  allowedHosts: ['example.invalid'],
  maxBytes: 50_000,
  timeoutMs: 5_000,
  normalizerId: 'status-json-v1',
  diffStrategyId: 'event-list-v1',
  publicationMode: 'hold-only',
  publisherName: 'Example Publisher',
  sourceClass: 'official-primary',
  extractionSelector: '$.events[*]',
  extractionContractId: 'search-status-events-v1',
  cadence: 'daily',
  noiseExclusions: [],
  schemaId: 'search-status-public-v1',
  allowedMediaTypes: ['application/json'],
  licenseNote: 'Local non-live placeholder fixture.',
  enabled: false,
} as unknown as SourceManifest;

describe('source manifests', () => {
  it('admits only the exact compound SkillLedger source tuple', () => {
    const source = validateManifest({
      siteId: 'skill-ledger',
      sourceId: 'microsoft-skill-creator',
      kind: 'text',
      endpoint:
        'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md',
      allowedHosts: ['raw.githubusercontent.com'],
      allowedMediaTypes: ['text/plain'],
      maxBytes: 70_000,
      timeoutMs: 10_000,
      expectedBytes: 68_147,
      expectedSha256:
        '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0',
      companionSources: [
        {
          role: 'inherited-license',
          endpoint:
            'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE',
          allowedHosts: ['raw.githubusercontent.com'],
          allowedMediaTypes: ['text/plain'],
          maxBytes: 2_000,
          expectedBytes: 1_140,
          expectedSha256:
            'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb',
        },
      ],
      publisherName: 'Microsoft',
      sourceClass: 'official-primary',
      extractionSelector: 'yaml-frontmatter.name,description',
      extractionContractId: 'skill-declared-metadata-v1',
      cadence: 'weekly',
      noiseExclusions: ['instruction-body', 'scripts', 'references', 'assets'],
      normalizerId: 'skill-source-observation-v1',
      diffStrategyId: 'source-record-v1',
      schemaId: 'skill-source-metadata-public-v1',
      publicationMode: 'auto-facts-only',
      licenseNote:
        'MIT license inherited from the same immutable repository commit.',
      enabled: true,
    });

    expect(source.kind).toBe('text');
    expect(source.companionSources).toHaveLength(1);
    expect(() => validateManifest({ ...source, companionSources: [] })).toThrow(
      /companion/i,
    );
    expect(() =>
      validateManifest({
        ...source,
        endpoint: source.endpoint.replace(
          '7066b58141d8cc66f39356b2ee5bb64d428dcf17',
          'main',
        ),
      }),
    ).toThrow();
    const companion = source.companionSources?.[0];
    if (companion === undefined) throw new Error('expected companion source');
    const mutations: readonly SourceManifest[] = [
      { ...source, sourceId: 'another-skill' },
      { ...source, publisherName: 'Another publisher' },
      { ...source, expectedBytes: 68_146 },
      { ...source, expectedSha256: 'a'.repeat(64) },
      { ...source, allowedHosts: ['example.com'] },
      {
        ...source,
        endpoint: source.endpoint.replace('SKILL.md', 'OTHER.md'),
      },
      {
        ...source,
        companionSources: [
          {
            ...companion,
            endpoint: companion.endpoint.replace('LICENSE', 'NOTICE'),
          },
        ],
      },
      {
        ...source,
        companionSources: [{ ...companion, expectedBytes: 1_139 }],
      },
      {
        ...source,
        companionSources: [{ ...companion, expectedSha256: 'b'.repeat(64) }],
      },
      {
        ...source,
        companionSources: [{ ...companion, allowedHosts: ['example.com'] }],
      },
    ];
    for (const mutation of mutations) {
      expect(() => validateManifest(mutation)).toThrow(
        /exact designated Microsoft source|allowlisted/i,
      );
    }
  });

  it('rejects a manifest whose endpoint is not allowlisted HTTPS', () => {
    expect(() => validateManifest({ endpoint: 'http://127.0.0.1/a' })).toThrow(
      /https/i,
    );
  });

  it('rejects an unknown manifest key', () => {
    expect(() =>
      validateManifest({ ...validManifest, untrusted: true }),
    ).toThrow(/unrecognized key/i);
  });

  it('rejects an oversized byte limit', () => {
    expect(() =>
      validateManifest({ ...validManifest, maxBytes: 5_000_001 }),
    ).toThrow(/5000000/i);
  });

  it('rejects an endpoint host absent from the allowed hosts', () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        endpoint: 'https://not-allowed.example/path',
      }),
    ).toThrow(/allowedHosts/i);
  });

  it('rejects an extraction contract incompatible with the source parser tuple', () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        extractionContractId: 'skill-inventory-v1',
      }),
    ).toThrow(/incompatible/i);
  });

  it.each([true, false])(
    'rejects endpoint user information when enabled is %s',
    (enabled) => {
      expect(() =>
        validateManifest({
          ...validManifest,
          endpoint:
            'https://review-user:review-password@example.invalid/status.json',
          enabled,
        }),
      ).toThrow(/user information/i);
    },
  );

  it('creates a stable digest regardless of object key order', () => {
    expect(manifestSha256(validManifest)).toBe(
      manifestSha256({ ...validManifest }),
    );
  });

  it('creates a stable digest when nested object keys have different order', () => {
    const first = {
      ...validManifest,
      nested: { beta: 2, alpha: 1 },
    } as unknown as SourceManifest;
    const second = {
      nested: { alpha: 1, beta: 2 },
      ...validManifest,
    } as unknown as SourceManifest;

    expect(manifestSha256(first)).toBe(manifestSha256(second));
  });

  it('creates a distinct manifest digest when an allowlist array is reordered', () => {
    const first = {
      ...validManifest,
      allowedHosts: ['example.invalid', 'mirror.example.invalid'],
    };
    const second = {
      ...first,
      allowedHosts: [...first.allowedHosts].reverse(),
    };

    expect(manifestSha256(first)).not.toBe(manifestSha256(second));
  });

  it.each([
    [99, false],
    [100, true],
    [30_000, true],
    [30_001, false],
  ] as const)(
    'enforces the shared timeout boundary at %i',
    (timeoutMs, valid) => {
      const result = () => validateManifest({ ...validManifest, timeoutMs });
      if (valid) expect(result).not.toThrow();
      else expect(result).toThrow(/timeout|100|30000/i);
    },
  );

  it('admits enabled official Search sources and explicit controlled examples', () => {
    const fixturePaths = [
      '../../../manifests/search-receipt/google-search-status.json',
      '../../../manifests/search-receipt/google-search-status-example.json',
      '../../../manifests/search-receipt/google-search-central-blog.json',
      '../../../manifests/workflow-test-lab/structured-extraction.json',
      '../../../manifests/skill-ledger/example-skill-archive.json',
    ];

    const manifests = fixturePaths.map(
      (fixturePath) =>
        validateManifest(
          JSON.parse(
            readFileSync(new URL(fixturePath, import.meta.url), 'utf8'),
          ),
        ) as unknown as {
          readonly siteId: string;
          readonly enabled: boolean;
          readonly endpoint: string;
          readonly publicationMode: string;
          readonly sourceClass?: string;
        },
    );

    expect(
      manifests.some(
        (manifest) =>
          manifest.siteId === 'search-receipt' &&
          manifest.enabled &&
          manifest.publicationMode === 'auto-facts-only' &&
          manifest.sourceClass === 'official-primary' &&
          new URL(manifest.endpoint).hostname.endsWith('google.com'),
      ),
    ).toBe(true);

    for (const manifest of manifests.filter(
      (candidate) => candidate.publicationMode === 'fixture-example',
    )) {
      expect(manifest.enabled).toBe(true);
      expect(manifest.sourceClass).toBe('project-original-fixture');
      expect(manifest.endpoint).toMatch(/^https:\/\/example\.invalid\//);
    }
  });
});
