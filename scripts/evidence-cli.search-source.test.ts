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
  canonicalJson,
  createReceipt,
  sha256,
  verifyReceipt,
  type RawFetch,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';
import {
  collectAllSearchSources,
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

async function evidenceSnapshot(
  directory: string,
  root = directory,
): Promise<Readonly<Record<string, string>>> {
  const snapshot: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.locks') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      Object.assign(snapshot, await evidenceSnapshot(path, root));
    } else if (entry.isFile()) {
      snapshot[path.slice(root.length + 1).replaceAll('\\', '/')] = (
        await readFile(path)
      ).toString('base64');
    }
  }
  return snapshot;
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

  it('re-derives Search facts from raw bytes during verification', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-semantic-tamper-',
    );
    const first = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const replacementRaw = Buffer.from('[]');
    const replacementRawSha256 = sha256(replacementRaw);
    const { schemaVersion, ...receiptInput } = first.receipt.payload;
    void schemaVersion;
    const replacement = createReceipt({
      ...receiptInput,
      rawSha256: replacementRawSha256,
      rawObjectPath: `objects/raw/${replacementRawSha256}.bin`,
      gateInputs: {
        ...receiptInput.gateInputs,
        rawSha256: replacementRawSha256,
      },
    });
    await rm(
      join(
        evidenceDirectory,
        ...first.receipt.payload.rawObjectPath.split('/'),
      ),
    );
    await rm(first.path);
    await writeFile(
      join(evidenceDirectory, ...replacement.payload.rawObjectPath.split('/')),
      replacementRaw,
    );
    await writeFile(
      join(
        evidenceDirectory,
        'receipts',
        'search-receipt',
        `${replacement.id}.json`,
      ),
      canonicalJson(replacement),
    );

    await expect(verifyEvidenceTree(evidenceDirectory)).rejects.toMatchObject({
      code: 'OBJECT_INTEGRITY_MISMATCH',
    });
  });

  it('writes nothing when all-source collection has a malformed second response', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'search-all-fail-'));
    temporaryDirectories.push(directory);
    await expect(
      runCli(['collect-search', '--all'], {
        projectDirectory: directory,
        fetchSource: async (manifest) => {
          if (manifest.sourceId === 'google-search-status') {
            return rawFetch(manifest);
          }
          const bytes = Buffer.from('<feed><entry></feed>');
          return {
            ...rawFetch(manifest),
            byteCount: bytes.byteLength,
            rawSha256: sha256(bytes),
            bytes,
          };
        },
      }),
    ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED/);
    await expect(access(join(directory, 'evidence'))).rejects.toThrow();
  });

  it('preserves prior evidence byte-for-byte when all-source admission fails', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-all-prior-');
    await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const before = await evidenceSnapshot(evidenceDirectory);
    const directory = join(evidenceDirectory, '..');
    await expect(
      runCli(['collect-search', '--all'], {
        projectDirectory: directory,
        fetchSource: async (manifest) => {
          if (manifest.sourceId === 'google-search-status') {
            return rawFetch(manifest);
          }
          const bytes = Buffer.from('<feed><entry></feed>');
          return {
            ...rawFetch(manifest),
            byteCount: bytes.byteLength,
            rawSha256: sha256(bytes),
            bytes,
          };
        },
      }),
    ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED/);
    expect(await evidenceSnapshot(evidenceDirectory)).toEqual(before);
  });

  it('requires review when the complete incident set is replaced', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-large-change-',
    );
    await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const replacementBytes = Buffer.from(
      JSON.stringify([
        {
          id: 'replacement',
          service_name: 'Different service',
          begin: '2026-09-01T00:00:00Z',
          end: null,
          modified: '2026-09-01T00:30:00Z',
          status_impact: 'SERVICE_OUTAGE',
          severity: 'SERVICE_OUTAGE',
          external_desc: 'Completely different incident.',
          uri: 'https://status.search.google.com/incidents/replacement',
        },
      ]),
    );
    await expect(
      collectSearchSource('google-search-status', {
        evidenceDirectory,
        fetchSource: async (manifest) => ({
          ...rawFetch(manifest),
          observedAt: '2026-09-01T00:31:00.000Z',
          byteCount: replacementBytes.byteLength,
          rawSha256: sha256(replacementBytes),
          bytes: replacementBytes,
        }),
      }),
    ).rejects.toThrow(/SEARCH_COLLECTION_POLICY_REVIEW_REQUIRED/);
    expect(
      await readdir(join(evidenceDirectory, 'receipts', 'search-receipt')),
    ).toHaveLength(1);
  });

  it('rejects out-of-order observations before all-source persistence', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-chronology-');
    await collectAllSearchSources({
      evidenceDirectory,
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        observedAt: '2026-09-01T02:00:00.000Z',
      }),
    });
    const before = await evidenceSnapshot(evidenceDirectory);
    const changedStatus = Buffer.from(
      STATUS_BYTES.toString('utf8').replace(
        'Delayed reports.',
        'Delayed data.',
      ),
    );
    await expect(
      collectAllSearchSources({
        evidenceDirectory,
        fetchSource: async (manifest) =>
          manifest.sourceId === 'google-search-status'
            ? {
                ...rawFetch(manifest),
                observedAt: '2026-09-01T01:00:00.000Z',
                byteCount: changedStatus.byteLength,
                rawSha256: sha256(changedStatus),
                bytes: changedStatus,
              }
            : {
                ...rawFetch(manifest),
                observedAt: '2026-09-01T01:00:00.000Z',
              },
      }),
    ).rejects.toThrow(/OBSERVATION_OUT_OF_ORDER/);
    expect(await evidenceSnapshot(evidenceDirectory)).toEqual(before);
    await verifyEvidenceTree(evidenceDirectory);
  });

  it('appends an A-to-B-to-A reversion instead of collapsing to old history', async () => {
    const evidenceDirectory = await newEvidenceDirectory('search-reversion-');
    const first = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const changedBytes = Buffer.from(
      STATUS_BYTES.toString('utf8').replace(
        'Delayed reports.',
        'Delayed data.',
      ),
    );
    const second = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        observedAt: '2026-08-31T17:20:30.000Z',
        byteCount: changedBytes.byteLength,
        rawSha256: sha256(changedBytes),
        bytes: changedBytes,
      }),
    });
    const third = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        observedAt: '2026-08-31T18:20:30.000Z',
      }),
    });

    expect([
      first.receipt.payload.sequence,
      second.receipt.payload.sequence,
      third.receipt.payload.sequence,
    ]).toEqual([1, 2, 3]);
    expect(third.idempotent).toBe(false);
    expect(third.receipt.payload.predecessorReceiptId).toBe(second.receipt.id);
    expect(third.receipt.payload.observedAt).toBe('2026-08-31T18:20:30.000Z');
    await verifyEvidenceTree(evidenceDirectory, { expectedReceiptCount: 3 });
  });

  it('ignores a complete entry contained only in an XML comment', async () => {
    const bytes = Buffer.from(
      `<feed><!--<entry><id>comment</id><title>Comment</title><link href="https://developers.google.com/search/blog/comment"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry>--></feed>`,
    );
    const result = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-feed-comment-'),
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        byteCount: bytes.byteLength,
        rawSha256: sha256(bytes),
        bytes,
      }),
    });
    expect(result.receipt.payload.publicFacts).toMatchObject({
      kind: 'search-feed',
      entries: [],
    });
  });

  it('does not treat a structurally nested entry as a direct feed entry', async () => {
    const bytes = Buffer.from(
      `<feed><wrapper><entry><id>nested</id><title>Nested</title><link href="https://developers.google.com/search/blog/nested"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></wrapper></feed>`,
    );
    const result = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-feed-nested-'),
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        byteCount: bytes.byteLength,
        rawSha256: sha256(bytes),
        bytes,
      }),
    });
    expect(result.receipt.payload.publicFacts).toMatchObject({
      kind: 'search-feed',
      entries: [],
    });
  });

  it('does not admit a foreign feed entry URL', async () => {
    const bytes = Buffer.from(
      `<feed><entry><id>foreign</id><title>Foreign</title><link href="https://evil.example/phish"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    );
    const evidenceDirectory = await newEvidenceDirectory(
      'search-feed-admission-',
    );
    await expect(
      collectSearchSource('google-search-central-blog', {
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

  it.each([
    ['illegal comment', `<feed><!--bad--comment--></feed>`],
    [
      'forbidden text terminator',
      `<feed><entry><id>x</id><title>bad ]]> text</title><link href="https://developers.google.com/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    ],
    [
      'unbound namespace prefix',
      `<x:feed><x:entry><x:id>x</x:id><x:title>X</x:title><x:link href="https://developers.google.com/search/blog/x"/><x:published>2026-08-31T00:00:00Z</x:published><x:updated>2026-08-31T00:00:00Z</x:updated></x:entry></x:feed>`,
    ],
    ['empty prefixed namespace binding', `<x:feed xmlns:x=""></x:feed>`],
    [
      'rebound reserved xml prefix',
      `<feed xmlns:xml="https://evil.example/ns"></feed>`,
    ],
    ['multi-colon qualified name', `<a:b:feed xmlns:a="urn:a"></a:b:feed>`],
    [
      'reserved xmlns element prefix',
      `<xmlns:feed xmlns:xmlns="urn:x"></xmlns:feed>`,
    ],
  ] as const)('rejects malformed XML with an %s', async (_label, xml) => {
    const bytes = Buffer.from(xml);
    const evidenceDirectory = await newEvidenceDirectory('search-xml-invalid-');
    await expect(
      collectSearchSource('google-search-central-blog', {
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

  it('rejects a Search Central URL with a nondefault port', async () => {
    const bytes = Buffer.from(
      `<feed><entry><id>port</id><title>Port</title><link href="https://developers.google.com:444/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    );
    const evidenceDirectory = await newEvidenceDirectory('search-feed-port-');
    await expect(
      collectSearchSource('google-search-central-blog', {
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
