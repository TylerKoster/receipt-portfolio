import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  searchMoments,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import {
  renderCreatorPage,
  renderGuidePage,
  renderMomentPage,
  renderSearchResults,
  renderSearchShell,
  renderTopicPage,
  renderVideoMomentHome,
  renderVideoPage,
  serializePublicSearchIndex,
} from './render.js';
import {
  searchPublicIndex,
  VIDEO_MOMENT_SEARCH_CLIENT,
} from './search-client.js';
import { videoMomentSearchSite } from './index.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;
const baseUrl = 'https://receipt-portfolio.example/';
const searchIndex = buildSearchIndex(fixture);

describe('AI Moment Index public search surface', () => {
  it('puts an enterable search form and exact timestamped initial results first', () => {
    const html = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(html).toContain('<input');
    expect(html).toContain('name="q"');
    expect(html).toContain('Search moments');
    expect(html).toContain('?t=132');
    expect(html.indexOf('name="q"')).toBeLessThan(html.indexOf('<strong>For:</strong>'));
  });

  it('keeps arbitrary query state out of indexable URLs and persistent state', () => {
    expect(renderSearchShell(fixture, searchIndex, baseUrl)).toContain(
      'name="robots" content="noindex,nofollow"',
    );
    expect(VIDEO_MOMENT_SEARCH_CLIENT).not.toMatch(
      /localStorage|sessionStorage|pushState|replaceState|location\.search|sendBeacon|analytics/u,
    );
  });

  it('renders the fixed query with the reviewed moment first and exact source second', () => {
    const html = renderSearchResults(fixture, searchIndex, 'agent evaluation');
    expect(html.indexOf('data-moment-id="moment-agent-evals"')).toBeGreaterThanOrEqual(0);
    expect(html).toContain(
      'href="https://video.example/watch/agent-evals?t=132"',
    );
    expect(searchMoments(searchIndex, 'agent evaluation')[0]).toMatchObject({
      momentId: 'moment-agent-evals',
      startSeconds: 132,
      timestampUrl: 'https://video.example/watch/agent-evals?t=132',
    });
  });

  it('renders every result with its own validated stored timestamp and evidence metadata', () => {
    const publicIndex = serializePublicSearchIndex(fixture, searchIndex);
    const results = searchPublicIndex(publicIndex, 'agent evaluation');
    expect(results).not.toHaveLength(0);
    for (const result of results) {
      const timestamp = new URL(result.timestampUrl).searchParams.get('t');
      expect(timestamp).toBe(String(result.startSeconds));
      expect(result.timestampUrl).toBe(
        `${result.sourceUrl}?t=${result.startSeconds}`,
      );
    }

    const html = renderSearchResults(fixture, searchIndex, 'agent evaluation');
    for (const label of [
      'Source title',
      'Creator',
      'Excerpt',
      'Start / end',
      'Topics',
      'Confidence class',
      'Rights status',
      'Verification date',
      'Provenance',
      'Correction state',
    ]) {
      expect(html).toContain(`<dt>${label}</dt>`);
    }
    expect(html).toContain('2:12–3:08');
  });

  it('escapes hostile fixture text and leaves malformed result URLs inert', () => {
    const hostileCorpus: VideoCorpus = {
      ...fixture,
      videos: fixture.videos.map((video) => ({
        ...video,
        title: '<script>alert(1)</script>',
        creatorName: '<img src=x onerror=alert(1)>',
      })),
      moments: fixture.moments.map((moment) => ({
        ...moment,
        excerpt: '<button onclick=alert(1)>open</button>',
      })),
    };
    const hostileHtml = renderVideoMomentHome(
      hostileCorpus,
      buildSearchIndex(hostileCorpus),
      baseUrl,
    );
    expect(hostileHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(hostileHtml).toContain(
      '&lt;button onclick=alert(1)&gt;open&lt;/button&gt;',
    );
    expect(hostileHtml).not.toMatch(/<script>alert|<img src=x|<button onclick=/u);

    const validPublicIndex = serializePublicSearchIndex(fixture, searchIndex);
    const malformedIndex = {
      ...validPublicIndex,
      entries: validPublicIndex.entries.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              sourceUrl: 'javascript:alert(1)',
              timestampUrl: 'javascript:alert(1)',
            }
          : entry,
      ),
    };
    expect(searchPublicIndex(malformedIndex, 'agent evaluation')).toEqual([]);
  });

  it('provides deterministic empty, zero-result, and client-load recovery while retaining initial results', () => {
    expect(renderSearchResults(fixture, searchIndex, '')).toContain(
      'Enter a phrase such as “agent evaluation”.',
    );
    expect(
      renderSearchResults(fixture, searchIndex, 'missing subject'),
    ).toContain('No moments match this phrase');
    const home = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(home).toContain('data-search-error');
    expect(home).toContain(
      'Search could not load. The initial reviewed moments remain available below.',
    );
    expect(home).toContain('data-server-results');
    expect(home).toContain('moment-agent-evals');
  });

  it('uses semantic accessible states and required first-viewport boundaries', () => {
    const html = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(html).toContain('<form');
    expect(html).toContain('role="search"');
    expect(html).toContain('<label for="moment-query">');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<ol>');
    for (const copy of [
      '<strong>For:</strong>',
      '<strong>Use this when:</strong>',
      'How to use it',
      '<strong>What you get:</strong>',
      '<strong>Rights boundary:</strong>',
      'controlled explicit local-test-license fixture',
      'not a live creator library',
      'not user evidence',
      'not a permission claim',
      'not a usability result',
      'not demand or revenue evidence',
    ]) {
      expect(html).toContain(copy);
    }
  });

  it('exposes bounded video, moment, topic, creator, and guide pages', () => {
    expect(renderVideoPage(fixture, searchIndex, 'video-agent-evals', baseUrl)).toContain(
      'Local Test: Agent Evaluation Mechanics',
    );
    expect(renderMomentPage(fixture, searchIndex, 'moment-agent-evals', baseUrl)).toContain(
      '?t=132',
    );
    expect(renderTopicPage(fixture, searchIndex, 'agent-evaluation', baseUrl)).toContain(
      'moment-agent-evals',
    );
    expect(renderCreatorPage(fixture, searchIndex, 'local-test-creator', baseUrl)).toContain(
      'Local Test Creator',
    );
    expect(renderGuidePage(baseUrl)).toContain('How to recover a moment');
    expect(videoMomentSearchSite.siteId).toBe('video-moment-search');
  });

  it('ships a text-only browser renderer with keyboard submit and local asset recovery', () => {
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('textContent');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('replaceChildren');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).not.toContain('innerHTML');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('search-index.json');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain("addEventListener('submit'");
  });

  it('records the bounded deterministic-route experiment without usability or demand claims', () => {
    const ledger = JSON.parse(
      readFileSync(new URL('./product-experiment-ledger.json', import.meta.url), 'utf8'),
    );
    expect(ledger).toMatchObject({
      siteId: 'video-moment-search',
      evidenceClassification: {
        kind: 'SIMULATED_HEURISTIC_REGRESSION_EVIDENCE',
      },
      experiment: {
        baseline: 'Production route returned 404 before this candidate.',
        target:
          '100% deterministic fixed-flow completion; expected moment appears in the top three; zero timestamp landing error.',
        stopRule:
          'Stop if any result lacks validated rights or exact source-time routing.',
      },
    });
    expect(JSON.stringify(ledger)).toContain('not usability or demand evidence');
  });
});
