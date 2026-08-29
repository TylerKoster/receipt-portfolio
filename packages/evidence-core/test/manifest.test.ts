import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  manifestSha256,
  validateManifest,
  type SourceManifest,
} from '../src/index.js';

const validManifest: SourceManifest = {
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
  licenseNote: 'Local non-live placeholder fixture.',
  enabled: false,
};

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

  it('validates all disabled non-live fixture manifests', () => {
    const fixturePaths = [
      '../../../manifests/search-receipt/google-search-status.json',
      '../../../manifests/workflow-test-lab/structured-extraction.json',
      '../../../manifests/skill-ledger/example-skill-archive.json',
    ];

    for (const fixturePath of fixturePaths) {
      const manifest = validateManifest(
        JSON.parse(readFileSync(new URL(fixturePath, import.meta.url), 'utf8')),
      );

      expect(manifest.enabled).toBe(false);
      expect(manifest.endpoint).toMatch(/^https:\/\/example\.invalid\//);
    }
  });
});
