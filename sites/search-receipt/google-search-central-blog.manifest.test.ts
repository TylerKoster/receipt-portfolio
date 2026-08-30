import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../packages/evidence-core/src/index.js';

const manifestPath = new URL(
  '../../manifests/search-receipt/google-search-central-blog.json',
  import.meta.url,
);

describe('Google Search Central Blog source manifest', () => {
  it('uses the official-page-linked FeedBurner endpoint and allowlisted host', () => {
    const manifest = validateManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
    );

    expect(manifest.endpoint).toBe(
      'https://feeds.feedburner.com/blogspot/amDG',
    );
    expect(manifest.allowedHosts).toEqual(['feeds.feedburner.com']);
  });
});
