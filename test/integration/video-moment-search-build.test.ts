import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  await collectFixturePair('search-receipt', 'status-v1.json', 'status-v2.json', {
    evidenceDirectory,
  });
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
  it('keeps direct legacy callers on the three receipt sites by default', async () => {
    await buildSites({ evidenceDirectory, outputDirectory });
    expect(
      (await readdir(outputDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['search-receipt', 'skill-ledger', 'workflow-test-lab']);
  });

  it('atomically emits the enterable route and exact query-to-timestamp assets when enabled', async () => {
    await mkdir(outputDirectory, { recursive: true });
    await buildSites({
      evidenceDirectory,
      outputDirectory,
      includeVideoMomentSearch: true,
    });

    const routeDirectory = join(outputDirectory, 'video-moment-search');
    const [html, indexJson, client, styles] = await Promise.all([
      readFile(join(routeDirectory, 'index.html'), 'utf8'),
      readFile(join(routeDirectory, 'search-index.json'), 'utf8'),
      readFile(join(routeDirectory, 'search-client.js'), 'utf8'),
      readFile(join(routeDirectory, 'styles.css'), 'utf8'),
    ]);
    expect(html).toContain('name="q"');
    expect(html).toContain('Search moments');
    expect(client).toContain('textContent');
    expect(styles).toContain(':focus-visible');

    const results = searchPublicIndex(JSON.parse(indexJson), 'robots control');
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
  });
});
