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
      uri: 'incidents/incident-b',
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
      uri: 'incidents/incident-a',
    },
  ]),
);
const FEED_BYTES = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Google Search Central Blog</title>
    <link>https://developers.google.com/search/blog/</link>
    <description>Official Search Central articles.</description>
    <item><title>Second &amp; newer</title><link>https://developers.google.com/search/blog/second</link><description><![CDATA[<p>Untrusted article body.</p>]]></description><pubDate>Mon, 31 Aug 2026 17:00:00 +0000</pubDate><guid isPermaLink="false">tag:google.com,2026:second</guid></item>
    <item><title>First</title><link>https://developers.google.com/search/blog/first</link><description><![CDATA[This body is not a published fact.]]></description><pubDate>Sun, 30 Aug 2026 10:00:00 GMT</pubDate><guid isPermaLink="false">tag:google.com,2026:first</guid></item>
  </channel>
</rss>`);

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
          url: 'https://status.search.google.com/incidents/incident-a',
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
          url: 'https://status.search.google.com/incidents/incident-b',
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
          updatedAt: '2026-08-31T17:00:00.000Z',
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

  it('retains deterministic Atom support under the existing feed contract', async () => {
    const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>tag:google.com,2026:atom</id><title>Atom entry</title><link rel="alternate" href="https://developers.google.com/search/blog/atom-entry"/><published>2026-08-31T17:00:00Z</published><updated>2026-08-31T17:30:00Z</updated></entry>
</feed>`);
    const result = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-feed-atom-'),
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        byteCount: bytes.byteLength,
        rawSha256: sha256(bytes),
        bytes,
      }),
    });
    expect(result.receipt.payload.publicFacts).toMatchObject({
      kind: 'search-feed',
      entries: [
        {
          entryId: 'tag:google.com,2026:atom',
          title: 'Atom entry',
          url: 'https://developers.google.com/search/blog/atom-entry',
          publishedAt: '2026-08-31T17:00:00.000Z',
          updatedAt: '2026-08-31T17:30:00.000Z',
        },
      ],
    });
  });

  it('never promotes RSS descriptions or CDATA bodies into public facts', async () => {
    const result = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-feed-body-'),
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const serializedFacts = canonicalJson(result.receipt.payload.publicFacts);
    expect(serializedFacts).not.toContain('Untrusted article body');
    expect(serializedFacts).not.toContain('not a published fact');
  });

  it.each([
    'https://developers.google.com/search/blog',
    'https://developers.google.com:443/search/blog/',
    'https://user@developers.google.com/search/blog/',
    'https://developers.google.com/search/blog/?view=1',
    'https://developers.google.com/search/blog/#latest',
    ' https://developers.google.com/search/blog/',
    'https://developers.google.com/search/%62log/',
  ])(
    'rejects the noncanonical RSS channel link %s without writing evidence',
    async (channelLink) => {
      const bytes = Buffer.from(
        FEED_BYTES.toString('utf8').replace(
          'https://developers.google.com/search/blog/</link>',
          `${channelLink}</link>`,
        ),
      );
      const evidenceDirectory = await newEvidenceDirectory(
        'search-rss-channel-link-',
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
      ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED: RSS channel link/);
      await expectNoEvidenceWrites(evidenceDirectory);
    },
  );

  it('rejects the channel root as an RSS item link without writing evidence', async () => {
    const bytes = Buffer.from(
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com/search/blog/</link>',
      ),
    );
    const evidenceDirectory = await newEvidenceDirectory(
      'search-rss-root-item-link-',
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
    ).rejects.toThrow(
      'SOURCE_DATA_NOT_ADMITTED: item[0].link destination is not admitted',
    );
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it('canonicalizes positive and negative RFC822 offsets across UTC date boundaries', async () => {
    const bytes = Buffer.from(
      FEED_BYTES.toString('utf8')
        .replace(
          'Mon, 31 Aug 2026 17:00:00 +0000',
          'Mon, 31 Aug 2026 12:00:00 -0500',
        )
        .replace(
          'Sun, 30 Aug 2026 10:00:00 GMT',
          'Tue, 01 Sep 2026 00:30:00 +0530',
        ),
    );
    const result = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory: await newEvidenceDirectory('search-rss-offsets-'),
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        byteCount: bytes.byteLength,
        rawSha256: sha256(bytes),
        bytes,
      }),
    });
    expect(result.receipt.payload.publicFacts).toMatchObject({
      entries: [
        {
          entryId: 'tag:google.com,2026:first',
          publishedAt: '2026-08-31T19:00:00.000Z',
          updatedAt: '2026-08-31T19:00:00.000Z',
        },
        {
          entryId: 'tag:google.com,2026:second',
          publishedAt: '2026-08-31T17:00:00.000Z',
          updatedAt: '2026-08-31T17:00:00.000Z',
        },
      ],
    });
  });

  it.each([
    [
      'wrong RSS version',
      FEED_BYTES.toString('utf8').replace('version="2.0"', 'version="2.1"'),
    ],
    ['missing channel', '<rss version="2.0"></rss>'],
    [
      'missing channel title',
      FEED_BYTES.toString('utf8').replace(
        '<title>Google Search Central Blog</title>',
        '',
      ),
    ],
    [
      'duplicate channel description',
      FEED_BYTES.toString('utf8').replace(
        '<description>Official Search Central articles.</description>',
        '<description>Official Search Central articles.</description><description>Impersonator</description>',
      ),
    ],
    [
      'duplicate channel',
      '<rss version="2.0"><channel><item/></channel><channel><item/></channel></rss>',
    ],
    [
      'prefixed RSS root',
      '<x:rss xmlns:x="urn:rss" version="2.0"><x:channel/></x:rss>',
    ],
    [
      'foreign namespace item',
      '<rss version="2.0"><channel><x:item xmlns:x="urn:not-rss"><x:title>X</x:title></x:item></channel></rss>',
    ],
    [
      'nested fake item',
      '<rss version="2.0"><channel><wrapper><item><title>X</title><link>https://developers.google.com/search/blog/x</link><pubDate>Mon, 31 Aug 2026 00:00:00 GMT</pubDate><guid isPermaLink="false">x</guid></item></wrapper></channel></rss>',
    ],
    [
      'duplicate item title',
      FEED_BYTES.toString('utf8').replace(
        '<title>Second &amp; newer</title>',
        '<title>Second</title><title>Impersonator</title>',
      ),
    ],
    [
      'missing item GUID',
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '',
      ),
    ],
    [
      'duplicate item GUID',
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '<guid isPermaLink="false">tag:google.com,2026:second</guid><guid isPermaLink="false">duplicate</guid>',
      ),
    ],
    [
      'GUID xml:base attribute',
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '<guid xml:base="https://evil.example/">tag:google.com,2026:second</guid>',
      ),
    ],
    [
      'GUID foreign namespaced attribute',
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '<guid xmlns:evil="urn:evil" evil:mode="unsafe">tag:google.com,2026:second</guid>',
      ),
    ],
    [
      'GUID unknown unqualified attribute',
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '<guid mode="unsafe">tag:google.com,2026:second</guid>',
      ),
    ],
    [
      'foreign namespace title impersonation',
      FEED_BYTES.toString('utf8').replace(
        '<title>Second &amp; newer</title>',
        '<evil:title xmlns:evil="urn:not-rss">Second</evil:title>',
      ),
    ],
    [
      'nested title extension',
      FEED_BYTES.toString('utf8').replace(
        '<title>Second &amp; newer</title>',
        '<title><evil:value xmlns:evil="urn:x">Second</evil:value></title>',
      ),
    ],
    [
      'invalid RFC822 date',
      FEED_BYTES.toString('utf8').replace(
        'Mon, 31 Aug 2026 17:00:00 +0000',
        'Mon, 31 Feb 2026 17:00:00 +0000',
      ),
    ],
    [
      'incorrect RFC822 weekday',
      FEED_BYTES.toString('utf8').replace(
        'Mon, 31 Aug 2026 17:00:00 +0000',
        'Sun, 31 Aug 2026 17:00:00 +0000',
      ),
    ],
    [
      'out-of-range RFC822 hour offset',
      FEED_BYTES.toString('utf8').replace('+0000', '+2400'),
    ],
    [
      'out-of-range RFC822 minute offset',
      FEED_BYTES.toString('utf8').replace('+0000', '+0060'),
    ],
    [
      'query-bearing item URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com/search/blog/second?view=1</link>',
      ),
    ],
    [
      'fragment-bearing item URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com/search/blog/second#details</link>',
      ),
    ],
    [
      'explicit default port URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com:443/search/blog/second</link>',
      ),
    ],
    [
      'encoded noncanonical URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com/search/blog/%73econd</link>',
      ),
    ],
    [
      'credential-bearing URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://user@developers.google.com/search/blog/second</link>',
      ),
    ],
    [
      'surrounding-whitespace URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        ' https://developers.google.com/search/blog/second</link>',
      ),
    ],
    [
      'same-origin non-blog URL',
      FEED_BYTES.toString('utf8').replace(
        'https://developers.google.com/search/blog/second</link>',
        'https://developers.google.com/search/docs/second</link>',
      ),
    ],
    [
      'DTD declaration',
      '<!DOCTYPE rss [<!ENTITY x "unsafe">]><rss version="2.0"><channel><item><title>&x;</title></item></channel></rss>',
    ],
  ] as const)(
    'rejects RSS 2.0 with a %s without writing evidence',
    async (_label, xml) => {
      const bytes = Buffer.from(xml);
      const evidenceDirectory = await newEvidenceDirectory(
        'search-rss-invalid-',
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
    },
  );

  it('preserves all prior evidence when a structurally valid RSS response fails field admission under --all', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-all-rss-field-fail-',
    );
    await collectAllSearchSources({
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const before = await evidenceSnapshot(evidenceDirectory);
    const invalidFeed = Buffer.from(
      FEED_BYTES.toString('utf8').replace(
        '<guid isPermaLink="false">tag:google.com,2026:second</guid>',
        '',
      ),
    );
    await expect(
      runCli(['collect-search', '--all'], {
        projectDirectory: join(evidenceDirectory, '..'),
        fetchSource: async (manifest) =>
          manifest.sourceId === 'google-search-status'
            ? rawFetch(manifest)
            : {
                ...rawFetch(manifest),
                observedAt: '2026-09-01T00:00:00.000Z',
                byteCount: invalidFeed.byteLength,
                rawSha256: sha256(invalidFeed),
                bytes: invalidFeed,
              },
      }),
    ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED/);
    expect(await evidenceSnapshot(evidenceDirectory)).toEqual(before);
    await verifyEvidenceTree(evidenceDirectory);
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
    '',
    ' incident-b',
    'incident-b ',
    'incident/b',
    'incident\\b',
    'incident.b',
    '%69ncident-b',
  ])(
    'rejects a noncanonical status incident id %s without writing evidence',
    async (incidentId) => {
      const parsed = JSON.parse(STATUS_BYTES.toString('utf8')) as Array<
        Record<string, unknown>
      >;
      parsed[0]!.id = incidentId;
      const bytes = Buffer.from(JSON.stringify(parsed));
      const evidenceDirectory = await newEvidenceDirectory(
        'search-status-id-invalid-',
      );
      await expect(
        collectSearchSource('google-search-status', {
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
    },
  );

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

  it('re-derives RSS facts from raw bytes even when replacement receipt hashes are internally consistent', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-rss-semantic-tamper-',
    );
    const first = await collectSearchSource('google-search-central-blog', {
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const replacementRaw = Buffer.from(
      FEED_BYTES.toString('utf8').replace(
        'Second &amp; newer',
        'Changed but consistently re-keyed',
      ),
    );
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

  it('rolls back every new canonical file when second-source persistence fails', async () => {
    const evidenceDirectory = await newEvidenceDirectory(
      'search-all-persist-fail-',
    );
    await collectAllSearchSources({
      evidenceDirectory,
      fetchSource: async (manifest) => rawFetch(manifest),
    });
    const before = await evidenceSnapshot(evidenceDirectory);
    const changedStatus = Buffer.from(
      STATUS_BYTES.toString('utf8').replace(
        'Delayed reports.',
        'Late reports.',
      ),
    );
    const changedFeed = Buffer.from(
      FEED_BYTES.toString('utf8').replace(
        'Second &amp; newer',
        'Second updated',
      ),
    );
    await expect(
      collectAllSearchSources({
        evidenceDirectory,
        fetchSource: async (manifest) => {
          const bytes =
            manifest.sourceId === 'google-search-status'
              ? changedStatus
              : changedFeed;
          return {
            ...rawFetch(manifest),
            observedAt: '2026-09-01T00:00:00.000Z',
            byteCount: bytes.byteLength,
            rawSha256: sha256(bytes),
            bytes,
          };
        },
        failPersistSearchPlanAtIndex: 1,
      }),
    ).rejects.toThrow(/INJECTED_SEARCH_PERSISTENCE_FAILURE/);
    expect(await evidenceSnapshot(evidenceDirectory)).toEqual(before);
    await expect(
      verifyEvidenceTree(evidenceDirectory),
    ).resolves.toBeUndefined();
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
      `<feed xmlns="http://www.w3.org/2005/Atom"><!--<entry><id>comment</id><title>Comment</title><link href="https://developers.google.com/search/blog/comment"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry>--></feed>`,
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
      `<feed xmlns="http://www.w3.org/2005/Atom"><wrapper><entry><id>nested</id><title>Nested</title><link href="https://developers.google.com/search/blog/nested"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></wrapper></feed>`,
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
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>foreign</id><title>Foreign</title><link href="https://evil.example/phish"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
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
    ).rejects.toThrow(
      'SOURCE_DATA_NOT_ADMITTED: entry[0].link destination is not admitted',
    );
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it('admits the exact absolute status incident URL bound to its record id', async () => {
    const bytes = Buffer.from(
      STATUS_BYTES.toString('utf8').replace(
        'incidents/incident-b',
        'https://status.search.google.com/incidents/incident-b',
      ),
    );
    const evidenceDirectory = await newEvidenceDirectory(
      'search-status-absolute-url-',
    );
    const result = await collectSearchSource('google-search-status', {
      evidenceDirectory,
      fetchSource: async (manifest) => ({
        ...rawFetch(manifest),
        byteCount: bytes.byteLength,
        rawSha256: sha256(bytes),
        bytes,
      }),
    });
    expect(result.receipt.payload.publicFacts).toMatchObject({
      incidents: [
        { url: 'https://status.search.google.com/incidents/incident-a' },
        { url: 'https://status.search.google.com/incidents/incident-b' },
      ],
    });
  });

  it.each([
    [
      'nondefault port',
      'https://status.search.google.com:444/incidents/incident-b',
    ],
    ['non-incident path', 'https://status.search.google.com/not-an-incident'],
    ['mismatched relative id', 'incidents/incident-a'],
    ['relative traversal', 'incidents/../incident-b'],
    ['relative query', 'incidents/incident-b?view=1'],
    ['relative fragment', 'incidents/incident-b#details'],
    ['relative backslash', 'incidents\\incident-b'],
    ['encoded separator', 'incidents%2Fincident-b'],
    ['encoded path segment', 'incidents/%69ncident-b'],
    ['surrounding whitespace', ' incidents/incident-b'],
    ['leading slash', '/incidents/incident-b'],
    ['trailing slash', 'incidents/incident-b/'],
    [
      'absolute mismatched id',
      'https://status.search.google.com/incidents/not-incident-b',
    ],
    [
      'absolute query',
      'https://status.search.google.com/incidents/incident-b?view=1',
    ],
    [
      'absolute fragment',
      'https://status.search.google.com/incidents/incident-b#details',
    ],
    [
      'absolute credentials',
      'https://user@status.search.google.com/incidents/incident-b',
    ],
    [
      'absolute password credentials',
      'https://user:pass@status.search.google.com/incidents/incident-b',
    ],
    ['foreign origin', 'https://evil.example/incidents/incident-b'],
    [
      'non-HTTPS scheme',
      'http://status.search.google.com/incidents/incident-b',
    ],
    [
      'explicit default port',
      'https://status.search.google.com:443/incidents/incident-b',
    ],
    [
      'absolute backslash',
      'https://status.search.google.com/incidents\\incident-b',
    ],
    [
      'absolute encoded separator',
      'https://status.search.google.com/incidents%2Fincident-b',
    ],
  ] as const)(
    'rejects a status incident URL with a %s',
    async (_label, url) => {
      const bytes = Buffer.from(
        STATUS_BYTES.toString('utf8').replace('incidents/incident-b', url),
      );
      const evidenceDirectory = await newEvidenceDirectory(
        'search-status-url-invalid-',
      );
      await expect(
        collectSearchSource('google-search-status', {
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
    },
  );

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
    [
      'foreign namespace impersonating Atom',
      `<evil:feed xmlns:evil="urn:not-atom"><evil:entry><evil:id>x</evil:id><evil:title>X</evil:title><evil:link href="https://developers.google.com/search/blog/x"/><evil:published>2026-08-31T00:00:00Z</evil:published><evil:updated>2026-08-31T00:00:00Z</evil:updated></evil:entry></evil:feed>`,
    ],
    [
      'duplicate expanded attribute name',
      `<feed xmlns:a="urn:same" xmlns:b="urn:same" a:x="1" b:x="2"></feed>`,
    ],
    ['raw less-than in an attribute', `<feed title="bad < value"></feed>`],
    [
      'reserved xml-like prefix',
      `<feed xmlns:xmlfoo="urn:x"><xmlfoo:entry/></feed>`,
    ],
    [
      'case-changed Atom element',
      `<Feed xmlns="http://www.w3.org/2005/Atom"><Entry><ID>x</ID></Entry></Feed>`,
    ],
    [
      'namespace-less Atom shape',
      `<feed><entry><id>x</id><title>X</title><link href="https://developers.google.com/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    ],
    [
      'invalid numeric character reference',
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id><title>&#0;</title><link href="https://developers.google.com/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    ],
    [
      'invalid raw control character',
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id><title>bad \u0001</title></entry></feed>`,
    ],
    [
      'malformed XML declaration',
      `<?xml?><feed xmlns="http://www.w3.org/2005/Atom"/>`,
    ],
    [
      'non-UTF-8 XML declaration',
      `<?xml version="1.0" encoding="ISO-8859-1"?><feed xmlns="http://www.w3.org/2005/Atom"/>`,
    ],
    [
      'misplaced XML declaration',
      `<feed xmlns="http://www.w3.org/2005/Atom"><?xml version="1.0"?></feed>`,
    ],
    [
      'CDATA outside its root',
      `<![CDATA[]]><feed xmlns="http://www.w3.org/2005/Atom"/>`,
    ],
    [
      'namespace prefix with mismatched case',
      `<atom:feed xmlns:Atom="http://www.w3.org/2005/Atom"></atom:feed>`,
    ],
    [
      'uppercase default namespace pseudo-attribute',
      `<feed XMLNS="http://www.w3.org/2005/Atom"></feed>`,
    ],
    [
      'uppercase Atom link attribute',
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id><title>X</title><link HREF="https://developers.google.com/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
    ],
    [
      'above-Unicode numeric character reference',
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>x</id><title>&#x110000;</title></entry></feed>`,
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
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>port</id><title>Port</title><link href="https://developers.google.com:444/search/blog/x"/><published>2026-08-31T00:00:00Z</published><updated>2026-08-31T00:00:00Z</updated></entry></feed>`,
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
    ).rejects.toThrow(
      'SOURCE_DATA_NOT_ADMITTED: entry[0].link destination is not admitted',
    );
    await expectNoEvidenceWrites(evidenceDirectory);
  });

  it.each([
    ['status summary', 'google-search-status'],
    ['Atom title', 'google-search-central-blog'],
  ] as const)(
    'rejects malformed UTF-8 in a %s and preserves prior evidence byte-for-byte',
    async (_label, sourceId) => {
      const evidenceDirectory = await newEvidenceDirectory(
        'search-invalid-utf8-',
      );
      await collectSearchSource(sourceId, {
        evidenceDirectory,
        fetchSource: async (manifest) => rawFetch(manifest),
      });
      const before = await evidenceSnapshot(evidenceDirectory);
      const validBytes =
        sourceId === 'google-search-status' ? STATUS_BYTES : FEED_BYTES;
      const marker =
        sourceId === 'google-search-status'
          ? Buffer.from('Delayed reports.')
          : Buffer.from('Second &amp; newer');
      const markerOffset = validBytes.indexOf(marker);
      expect(markerOffset).toBeGreaterThanOrEqual(0);
      const bytes = Buffer.concat([
        validBytes.subarray(0, markerOffset),
        Buffer.from([0xc3, 0x28]),
        validBytes.subarray(markerOffset + marker.byteLength),
      ]);

      await expect(
        collectSearchSource(sourceId, {
          evidenceDirectory,
          fetchSource: async (manifest) => ({
            ...rawFetch(manifest),
            observedAt: '2026-09-01T00:00:00.000Z',
            byteCount: bytes.byteLength,
            rawSha256: sha256(bytes),
            bytes,
          }),
        }),
      ).rejects.toThrow(/SOURCE_DATA_NOT_ADMITTED/);
      expect(await evidenceSnapshot(evidenceDirectory)).toEqual(before);
      await verifyEvidenceTree(evidenceDirectory, { expectedReceiptCount: 1 });
    },
  );

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
