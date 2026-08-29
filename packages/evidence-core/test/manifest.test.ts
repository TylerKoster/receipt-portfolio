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
