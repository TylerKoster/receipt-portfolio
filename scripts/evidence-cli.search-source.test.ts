import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sha256,
  verifyReceipt,
  type RawFetch,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';
import {
  collectSearchSource,
  runCli,
  verifyEvidenceTree,
} from './evidence-cli.js';

const temporaryDirectories: string[] = [];
const observedAt = '2026-08-31T16:20:30.000Z';
const STATUS_BYTES = Buffer.from(
  JSON.stringify([
    {
      id: 'incident-b',
      service_name: 'Search Console',
      begin: '2026-08-31T15:00:00+00:00',
      end: null,
      modified: '2026-08-31T15:30:00+00:00',
      status_impact: 'SERVICE_DISRUPTION',
      severity: 'SERVICE_DISRUPTION',
      external_desc: '  Delayed reports.  ',
      uri: 'https://status.search.google.com/incidents/example-b',
    },
    {
      id: 'incident-a',
      service_name: 'Ranking',
      begin: '2026-08-30T12:00:00Z',
      end: '2026-08-30T13:00:00Z',
      modified: '2026-08-30T13:00:00Z',
      status_impact: 'AVAILABLE',
      severity: 'SERVICE_INFORMATION',
      external_desc: 'Resolved ranking issue.',
      uri: 'https://status.search.google.com/incidents/example-a',
    },
  ]),
);
const FEED_BYTES = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>tag:google.com,2026:second</id><title type="html">Second &amp; newer</title><link rel="alternate" href="https://developers.google.com/search/blog/second" /><published>2026-08-31T12:00:00-05:00</published><updated>2026-08-31T12:30:00-05:00</updated></entry>
  <entry><id>tag:google.com,2026:first</id><title>First</title><link href="https://developers.google.com/search/blog/first" rel="alternate" /><published>2026-08-30T10:00:00Z</published><updated>2026-08-30T10:00:00Z</updated></entry>
</feed>`);

function rawFetch(manifest: SourceManifest): RawFetch {
  const bytes =
    manifest.sourceId === 'google-search-status' ? STATUS_BYTES : FEED_BYTES;
  const mediaType =
    manifest.sourceId === 'google-search-status'
      ? 'application/json'
      : 'text/xml';
  return {
    sourceUrl: manifest.endpoint,
    observedAt,
    mediaType,
    status: 200,
    byteCount: bytes.byteLength,
    rawSha256: sha256(bytes),
    bytes,
  };
}

async function newEvidenceDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return join(directory, 'evidence');
}

async function expectNoEvidenceWrites(evidenceDirectory: string) {
  await expect(access(evidenceDirectory)).rejects.toThrow();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('bounded Search Receipt live collection', () => {
  it.each([
    [
      'google-search-status',
      'https://status.search.google.com/incidents.json',
      'search-status',
    ],
    [
      'google-search-central-blog',
      'https://feeds.feedburner.com/blogspot/amDG',
      'search-feed',
    ],
  ] as const)(
    'loads only the fixed %s manifest and persists exact fetched bytes',
    async (sourceId, endpoint, factKind) => {
      const evidenceDirectory = await newEvidenceDirectory('search-live-');
      const requested: SourceManifest[] = [];
      const result = await collectSearchSource(sourceId, {
        evidenceDirectory,
        fetchSource: async (manifest) => {
          requested.push(manifest);
          return rawFetch(manifest);
        },
      });
      expect(
        requested.map((manifest) => ({
          endpoint: manifest.endpoint,
          allowedHosts: manifest.allowedHosts,
        })),
      ).toEqual([
        {
          endpoint,
          allowedHosts: [new URL(endpoint).hostname],
        },
      ]);
      expect(result.fetch).toMatchObject({
        sourceUrl: endpoint,
        observedAt,
        status: 200,
      });
      expect(result.receipt.payload.policy).toEqual({
        decision: 'PASS',
        reasonCodes: ['SOURCE_FACTS_ONLY'],
      });
      expect(result.receipt.payload.publicFacts.kind).toBe(factKind);
      expect(verifyReceipt(result.receipt)).toEqual(result.receipt);
      expect(
        await readFile(
          join(
            evidenceDirectory,
            ...result.receipt.payload.rawObjectPath.split('/'),
          ),
        ),
      ).toEqual(Buffer.from(result.fetch.bytes));
      await verifyEvidenceTree(evidenceDirectory, {
        expectedReceiptCount: 1,
        expectedSiteIds: ['search-receipt'],
      });
    },
  );

  it('normalizes status incidents and feed entries deterministically', async () => {
    const status = await collectSearchSource('google-search-status', {
      evidenceDirectory: await newEvidenceDirectory('search-status-'),
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const feed = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-feed-'),
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    expect(status.receipt.payload.publicFacts).toEqual({
      kind: 'search-status',
      responseStatus: 200,
      mediaType: 'application/json',
      byteCount: STATUS_BYTES.byteLength,
      incidents: [
        {
          incidentId: 'incident-a',
          service: 'Ranking',
          startedAt: '2026-08-30T12:00:00.000Z',
          endedAt: '2026-08-30T13:00:00.000Z',
          updatedAt: '2026-08-30T13:00:00.000Z',
          impact: 'AVAILABLE',
          severity: 'SERVICE_INFORMATION',
          summary: 'Resolved ranking issue.',
          url: 'https://status.search.google.com/incidents/example-a',
        },
        {
          incidentId: 'incident-b',
          service: 'Search Console',
          startedAt: '2026-08-31T15:00:00.000Z',
          endedAt: null,
          updatedAt: '2026-08-31T15:30:00.000Z',
          impact: 'SERVICE_DISRUPTION',
          severity: 'SERVICE_DISRUPTION',
          summary: 'Delayed reports.',
          url: 'https://status.search.google.com/incidents/example-b',
        },
      ],
    });
    expect(feed.receipt.payload.publicFacts).toEqual({
      kind: 'search-feed',
      responseStatus: 200,
      mediaType: 'text/xml',
      byteCount: FEED_BYTES.byteLength,
      entries: [
        {
          entryId: 'tag:google.com,2026:second',
          title: 'Second & newer',
          url: 'https://developers.google.com/search/blog/second',
          publishedAt: '2026-08-31T17:00:00.000Z',
          updatedAt: '2026-08-31T17:30:00.000Z',
        },
        {
          entryId: 'tag:google.com,2026:first',
          title: 'First',
          url: 'https://developers.google.com/search/blog/first',
          publishedAt: '2026-08-30T10:00:00.000Z',
          updatedAt: '2026-08-30T10:00:00.000Z',
        },
      ],
    });
  });

  it('rejects arbitrary source or manifest injection before fetch or writes', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-inject-');
    const fetchSource = vi.fn();
    await expect(
      collectSearchSource('../other.json' as 'google-search-status', {
        evidenceDirectory,
        fetchSource,
      }),
    ).rejects.toThrow(/SEARCH_SOURCE_NOT_ADMITTED/);
    expect(fetchSource).not.toHaveBeenCalled();
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it('writes nothing when the allowed fetch fails', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-fetch-fail-');
    await expect(
      collectSearchSource('google-search-status', {
        evidenceDirectory,
        fetchSource: async () => {
          throw new Error('source unavailable');
        },
      }),
    ).rejects.toThrow('source unavailable');
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it.each([
    ['malformed status JSON', 'google-search-status', Buffer.from('{')],
    [
      'unadmitted status shape',
      'google-search-status',
      Buffer.from(JSON.stringify([{ id: 'missing-required-fields' }])),
    ],
    [
      'malformed feed XML',
      'google-search-central-blog',
      Buffer.from('<feed><entry></feed>'),
    ],
    [
      'unadmitted feed entry',
      'google-search-central-blog',
      Buffer.from('<feed><entry><title>Missing fields</title></entry></feed>'),
    ],
  ] as const)('writes nothing for %s', async (_label, sourceId, bytes) => {
    const evidenceDirectory = await newEvidenceDirectory('search-malformed-');
    await expect(
      collectSearchSource(sourceId, {
        evidenceDirectory,
        fetchSource: async (manifest) => ({
          ...rawFetch(manifest),
          byteCount: bytes.byteLength,
          rawSha256: sha256(bytes),
          bytes,
        }),
      }),
    ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED/);
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it('serializes concurrent persistence and returns one idempotent receipt', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-concurrent-');
    const collect = () =>
      collectSearchSource('google-search-status', {
        evidenceDirectory,
        fetchSource: async (manifest) => rawFetch(manifest),
      });
    const [first, second] = await Promise.all([collect(), collect()]);
    expect(first.receipt.id).toBe(second.receipt.id);
    expect(first.receipt.payload.sequence).toBe(1);
    expect(
      await readdir(join(evidenceDirectory, 'receipts', 'search-receipt')),
    ).toHaveLength(1);
    await verifyEvidenceTree(evidenceDirectory, { expectedReceiptCount: 1 });
  });

  it('refuses to fetch or append when existing receipt or object bytes are tampered', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-tamper-');
    const first = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    await writeFile(
      join(
        evidenceDirectory,
        ...first.receipt.payload.normalizedObjectPath.split('/'),
      ),
      '{}',
    );
    const fetchSource = vi.fn(async (manifest: SourceManifest) =>
      rawFetch(manifest),
    );
    await expect(
      collectSearchSource('google-search-status', {
        evidenceDirectory,
        fetchSource,
      }),
    ).rejects.toMatchObject({ code: 'OBJECT_INTEGRITY_MISMATCH' });
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it('refuses to fetch or append when existing receipt bytes are tampered', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-receipt-tamper-',
    );
    const first = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    await writeFile(first.path, `${await readFile(first.path, 'utf8')}\n`);
    const fetchSource = vi.fn(async (manifest: SourceManifest) =>
      rawFetch(manifest),
    );
    await expect(
      collectSearchSource('google-search-status', {
        evidenceDirectory,
        fetchSource,
      }),
    ).rejects.toMatchObject({ code: 'NON_CANONICAL_RECEIPT_BYTES' });
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it('exposes only the closed source selector through the CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'search-cli-'));
    temporaryDirectories.push(directory);
    const fetchSource = vi.fn(async (manifest: SourceManifest) =>
      rawFetch(manifest),
    );
    expect(
      await runCli(['collect-search', '../../manifest.json'], {
        projectDirectory: directory,
        fetchSource,
      }),
    ).toBe(1);
    expect(fetchSource).not.toHaveBeenCalled();
    await expect(access(join(directory, 'evidence'))).rejects.toThrow();
  });
});
