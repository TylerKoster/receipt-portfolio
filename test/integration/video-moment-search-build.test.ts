import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSites } from '../../scripts/build-sites.js';
import { collectFixturePair } from '../../scripts/evidence-cli.js';
import { searchPublicIndex } from '../../sites/video-moment-search/search-client.js';

const temporaryDirectories: string[] = [];
let evidenceDirectory: string;
let outputDirectory: string;

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-moment-search-build-'));
  temporaryDirectories.push(directory);
  evidenceDirectory = join(directory, 'evidence');
  outputDirectory = join(directory, 'sites');
  await collectFixturePair(
    'search-receipt',
    'status-v1.json',
    'status-v2.json',
    {
      evidenceDirectory,
    },
  );
  await collectFixturePair(
    'workflow-test-lab',
    undefined,
    'structured-extraction-v1.json',
    { evidenceDirectory },
  );
  await collectFixturePair(
    'skill-ledger',
    undefined,
    'skill-inventory-v1.json',
    { evidenceDirectory },
  );
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('atomic AI Moment Index build', () => {
  it('rejects tandem publication-boundary removal before output or staging residue', async () => {
    const [corpus, manifest] = await Promise.all(
      [
        '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
        '../../fixtures/video-moment-search/video-source-evidence-manifest-v2.json',
      ].map(async (path) =>
        JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')),
      ),
    );
    const evidenceId = 'commons-how-can-we-keep-robots-under-control-v1';
    const review = corpus.rights.find(
      (grant: { reviewEvidence?: { evidenceId: string } }) =>
        grant.reviewEvidence?.evidenceId === evidenceId,
    )?.reviewEvidence;
    const record = manifest.records.find(
      (candidate: { evidenceId: string }) =>
        candidate.evidenceId === evidenceId,
    );
    expect(review).toBeDefined();
    expect(record).toBeDefined();
    if (review === undefined || record === undefined) return;
    review.productBoundary.excluded = review.productBoundary.excluded.filter(
      (value: string) => value !== 'hosting',
    );
    record.productBoundary.excluded = record.productBoundary.excluded.filter(
      (value: string) => value !== 'hosting',
    );

    const corpusPath = join(dirname(outputDirectory), 'invalid-corpus.json');
    const manifestPath = join(
      dirname(outputDirectory),
      'invalid-boundary-manifest.json',
    );
    await Promise.all([
      writeFile(corpusPath, JSON.stringify(corpus)),
      writeFile(manifestPath, JSON.stringify(manifest)),
    ]);

    await expect(
      buildSites({
        evidenceDirectory,
        outputDirectory,
        includeVideoMomentSearch: true,
        videoMomentCorpusPath: corpusPath,
        videoMomentEvidenceManifestPath: manifestPath,
        videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'SOURCE_EVIDENCE_CORPUS_PRODUCT_BOUNDARY_POLICY_MISMATCH:commons-how-can-we-keep-robots-under-control-v1, SOURCE_EVIDENCE_MANIFEST_PRODUCT_BOUNDARY_POLICY_MISMATCH:commons-how-can-we-keep-robots-under-control-v1',
    );
    await expect(readdir(outputDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.includes('.sites-stage-'),
      ),
    ).toEqual([]);
  });

  it('blocks every reviewed output when one new admitted record is invalid', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL(
          '../../fixtures/video-moment-search/video-source-evidence-manifest-v2.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      records: Array<{
        evidenceId: string;
        timestamp: { url: string };
      }>;
    };
    expect(manifest.records).toHaveLength(3);
    const wefRecord = manifest.records.find(
      ({ evidenceId }) =>
        evidenceId === 'commons-davos-2016-state-of-artificial-intelligence-v1',
    );
    expect(wefRecord).toBeDefined();
    if (wefRecord === undefined) return;
    wefRecord.timestamp.url =
      'https://upload.wikimedia.org/wikipedia/commons/a/a5/Davos_2016_-_The_State_of_Artificial_Intelligence.webm#t=76';
    const manifestPath = join(dirname(outputDirectory), 'invalid-wef.json');
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(
      buildSites({
        evidenceDirectory,
        outputDirectory,
        includeVideoMomentSearch: true,
        videoMomentEvidenceManifestPath: manifestPath,
        videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'SOURCE_EVIDENCE_TIMESTAMP_URL_MISMATCH:commons-davos-2016-state-of-artificial-intelligence-v1',
    );
    await expect(readdir(outputDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.includes('.sites-stage-'),
      ),
    ).toEqual([]);
  });

  it('rejects an invalid manifest before creating any output or staging residue', async () => {
    const manifestPath = join(dirname(outputDirectory), 'invalid.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 2,
        manifestId: 'invalid-empty-manifest',
        corpusId: 'wikimedia-commons-ai-video-reviewed-v1',
        records: [],
      }),
    );

    await expect(
      buildSites({
        evidenceDirectory,
        outputDirectory,
        includeVideoMomentSearch: true,
        videoMomentEvidenceManifestPath: manifestPath,
        videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
      }),
    ).rejects.toThrow(
      /SOURCE_EVIDENCE_RECORD_CARDINALITY_MISMATCH.*SOURCE_EVIDENCE_RECORD_MISSING/iu,
    );
    await expect(readdir(outputDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.includes('.sites-stage-'),
      ),
    ).toEqual([]);
  });

  it('keeps direct legacy callers on the three receipt sites by default', async () => {
    await buildSites({ evidenceDirectory, outputDirectory });
    expect(
      (await readdir(outputDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['search-receipt', 'skill-ledger', 'workflow-test-lab']);

    const [robots, sitemap] = await Promise.all([
      readFile(join(outputDirectory, 'robots.txt'), 'utf8'),
      readFile(join(outputDirectory, 'sitemap.xml'), 'utf8'),
    ]);
    expect(robots).toContain(
      'Sitemap: https://receipt-portfolio.example/sitemap.xml',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/search-receipt/sitemap.xml</loc>',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/skill-ledger/sitemap.xml</loc>',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/workflow-test-lab/sitemap.xml</loc>',
    );
    expect(sitemap).not.toContain('video-moment-search/sitemap.xml');
  });

  it('atomically emits the enterable route and exact query-to-timestamp assets when enabled', async () => {
    await mkdir(outputDirectory, { recursive: true });
    await buildSites({
      evidenceDirectory,
      outputDirectory,
      includeVideoMomentSearch: true,
      videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
    });

    const routeDirectory = join(outputDirectory, 'video-moment-search');
    const [html, indexJson, client, styles, robots, rootSitemap] =
      await Promise.all([
        readFile(join(routeDirectory, 'index.html'), 'utf8'),
        readFile(join(routeDirectory, 'search-index.json'), 'utf8'),
        readFile(join(routeDirectory, 'search-client.js'), 'utf8'),
        readFile(join(routeDirectory, 'styles.css'), 'utf8'),
        readFile(join(outputDirectory, 'robots.txt'), 'utf8'),
        readFile(join(outputDirectory, 'sitemap.xml'), 'utf8'),
      ]);
    expect(html).not.toContain('name="q"');
    expect(html).toContain('method="get"');
    expect(html).toContain(
      'action="https://receipt-portfolio.example/video-moment-search/"',
    );
    expect(html).not.toContain('?q=');
    expect(html).toContain('data-server-results');
    expect(html).toContain('data-selected-moments');
    expect(html).toContain('data-handoff-text');
    expect(html).toContain('data-copy-handoff');
    expect(html).toContain('data-clear-handoff');
    expect(html).toContain('Temporary timestamp and rights handoff');
    expect(html).toContain('moment-robots-control');
    expect(html).toContain('Search moments');
    expect(client).toContain("input.name = 'q'");
    expect(client).toContain('textContent');
    expect(client).toContain('navigator.clipboard.writeText');
    expect(client).toContain(
      "fetch('search-index.json', { credentials: 'omit' })",
    );
    expect(client).not.toContain("credentials: 'same-origin'");
    expect(client).not.toContain("credentials: 'include'");
    expect(client).not.toContain('localStorage');
    expect(client).not.toContain('sessionStorage');
    expect(styles).toContain(':focus-visible');

    const results = searchPublicIndex(
      JSON.parse(indexJson),
      'robots control',
      new Date('2026-08-31T12:00:00.000Z'),
    );
    expect(results[0]).toMatchObject({
      momentId: 'moment-robots-control',
      startSeconds: 132,
      timestampStrategy: 'media-fragment',
      timestampUrl:
        'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    });
    expect(new URL(results[0]!.timestampUrl).hash).toBe('#t=132');
    expect(new URL(results[0]!.timestampUrl).searchParams.get('t')).toBeNull();

    const hub = await readFile(join(outputDirectory, 'index.html'), 'utf8');
    expect(hub).toContain('AI Moment Index');
    expect(hub).toContain('/video-moment-search/#moment-search-controls');
    expect(hub).toContain(
      'This portfolio hub is a deployment shell, not an additional evidence product.',
    );
    expect(hub).not.toContain('not a fourth evidence product');
    expect(robots).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://receipt-portfolio.example/sitemap.xml\n',
    );
    for (const product of [
      'search-receipt',
      'skill-ledger',
      'video-moment-search',
      'workflow-test-lab',
    ]) {
      expect(rootSitemap).toContain(
        `<loc>https://receipt-portfolio.example/${product}/sitemap.xml</loc>`,
      );
    }
    expect(rootSitemap).not.toContain('video-sitemap.xml');
    expect(rootSitemap).not.toContain('?q=');
  });

  it('emits only evidence-admitted canonical discovery pages and exact-moment feeds', async () => {
    await buildSites({
      evidenceDirectory,
      outputDirectory,
      includeVideoMomentSearch: true,
      videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
      publicBaseUrl: 'https://tylerkoster.github.io/receipt-portfolio/',
    });

    const routeDirectory = join(outputDirectory, 'video-moment-search');
    const [home, video, moment, creator, sitemap, sitemapIndex, feed] =
      await Promise.all([
        readFile(join(routeDirectory, 'index.html'), 'utf8'),
        readFile(
          join(routeDirectory, 'videos', 'robots-under-control', 'index.html'),
          'utf8',
        ),
        readFile(
          join(
            routeDirectory,
            'moments',
            'moment-robots-control',
            'index.html',
          ),
          'utf8',
        ),
        readFile(
          join(
            routeDirectory,
            'creators',
            'university-of-the-netherlands',
            'index.html',
          ),
          'utf8',
        ),
        readFile(join(routeDirectory, 'sitemap.xml'), 'utf8'),
        readFile(join(routeDirectory, 'sitemap-index.xml'), 'utf8'),
        readFile(join(routeDirectory, 'feed.xml'), 'utf8'),
      ]);

    expect(video).toContain(
      'rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/video-moment-search/videos/robots-under-control/"',
    );
    expect(home).toContain(
      '<link rel="icon" href="/receipt-portfolio/favicon.ico">',
    );
    expect(video).not.toContain('"@type":"VideoObject"');
    expect(video).not.toContain('"@type":"Clip"');
    expect(video).not.toContain('"contentUrl"');
    expect(moment).toContain(
      'How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    );
    expect(creator).toContain(
      'rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/video-moment-search/creators/university-of-the-netherlands/"',
    );
    for (const [location, page] of [
      [
        'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/',
        home,
      ],
      [
        'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/videos/robots-under-control/',
        video,
      ],
      [
        'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/moments/moment-robots-control/',
        moment,
      ],
      [
        'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/creators/university-of-the-netherlands/',
        creator,
      ],
    ] as const) {
      expect(sitemap).toContain(`<loc>${location}</loc>`);
      expect(page).toContain('<meta name="robots" content="index,follow">');
    }
    expect(sitemap).not.toContain('?q=');
    expect(sitemapIndex).not.toContain('video-sitemap.xml');
    expect(feed).toContain(
      '<link rel="related" href="https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132"/>',
    );
    await expect(
      readFile(join(routeDirectory, 'video-sitemap.xml'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(join(routeDirectory, 'topics'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    await expect(readdir(join(routeDirectory, 'guides'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
  });
});
