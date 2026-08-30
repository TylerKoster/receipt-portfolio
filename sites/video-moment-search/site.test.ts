import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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

type SubmitListener = (event: { preventDefault(): void }) => void;

class FakeHTMLElement {
  readonly children: FakeHTMLElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  hidden = false;
  href = '';
  textContent = '';
  failNextReplace = false;

  constructor(readonly tagName = 'div') {}

  append(...children: FakeHTMLElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeHTMLElement[]): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('controlled DOM write failure');
    }
    this.children.splice(0, this.children.length, ...children);
  }
}

class FakeHTMLFormElement extends FakeHTMLElement {
  private readonly listeners = new Map<string, SubmitListener>();

  constructor() {
    super('form');
  }

  addEventListener(type: string, listener: SubmitListener): void {
    this.listeners.set(type, listener);
  }

  submit(): void {
    this.listeners.get('submit')?.({ preventDefault() {} });
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  value = '';

  constructor() {
    super('input');
  }
}

interface ClientHarness {
  readonly error: FakeHTMLElement;
  readonly results: FakeHTMLElement;
  readonly serverResults: FakeHTMLElement;
  readonly status: FakeHTMLElement;
  failNextRender(): void;
  rejectFetch(): Promise<void>;
  resolveNonOkFetch(): Promise<void>;
  resolveIndex(value: unknown): Promise<void>;
  submit(query: string): void;
}

function descendants(
  element: FakeHTMLElement,
  tagName: string,
): FakeHTMLElement[] {
  return [
    ...(element.tagName === tagName ? [element] : []),
    ...element.children.flatMap((child) => descendants(child, tagName)),
  ];
}

async function flushClientPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function executeClientPayload(): ClientHarness {
  const form = new FakeHTMLFormElement();
  const input = new FakeHTMLInputElement();
  const status = new FakeHTMLElement('p');
  const results = new FakeHTMLElement('div');
  const error = new FakeHTMLElement('p');
  error.hidden = true;
  const serverResults = new FakeHTMLElement('section');
  serverResults.textContent = 'server-rendered initial result';
  let resolveFetch!: (response: {
    readonly ok: boolean;
    json(): Promise<unknown>;
  }) => void;
  let rejectFetch!: (error: Error) => void;
  const fetchPromise = new Promise<{
    readonly ok: boolean;
    json(): Promise<unknown>;
  }>((resolve, reject) => {
    resolveFetch = resolve;
    rejectFetch = reject;
  });
  const selectors = new Map<string, FakeHTMLElement>([
    ['[data-moment-search]', form],
    ['[data-moment-query]', input],
    ['[data-search-status]', status],
    ['[data-client-results]', results],
    ['[data-search-error]', error],
    ['[data-server-results]', serverResults],
  ]);
  const document = {
    createElement: (tagName: string) => new FakeHTMLElement(tagName),
    querySelector: (selector: string) => selectors.get(selector) ?? null,
  };

  runInNewContext(VIDEO_MOMENT_SEARCH_CLIENT, {
    document,
    fetch: () => fetchPromise,
    HTMLElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLInputElement: FakeHTMLInputElement,
    URL,
  });

  return {
    error,
    results,
    serverResults,
    status,
    failNextRender: () => {
      results.failNextReplace = true;
    },
    rejectFetch: async () => {
      rejectFetch(new Error('controlled fetch rejection'));
      await flushClientPromises();
    },
    resolveNonOkFetch: async () => {
      resolveFetch({ ok: false, json: async () => ({}) });
      await flushClientPromises();
    },
    resolveIndex: async (value: unknown) => {
      resolveFetch({ ok: true, json: async () => value });
      await flushClientPromises();
    },
    submit: (query: string) => {
      input.value = query;
      form.submit();
    },
  };
}

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

  it('executes the shipped payload and renders the fixed query as an exact ordinary anchor', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );

    harness.submit('agent evaluation');

    const articles = descendants(harness.results, 'article');
    expect(articles.map((article) => article.dataset.momentId)).toEqual([
      'moment-agent-evals',
    ]);
    expect(descendants(articles[0]!, 'a').map((anchor) => anchor.href)).toEqual(
      ['https://video.example/watch/agent-evals?t=132'],
    );
    expect(harness.status.textContent).toBe('Showing 1 moment.');
  });

  it('keeps shipped payload ranking equal to phrase-bonus helper ranking', async () => {
    const baseEntry = serializePublicSearchIndex(fixture, searchIndex).entries[0]!;
    const exactPhrase = {
      ...baseEntry,
      momentId: 'moment-exact-phrase',
      videoId: 'video-exact-phrase',
      videoSlug: 'z-exact-phrase',
      sourceUrl: 'https://video.example/watch/exact-phrase',
      videoTitle: 'Research notes',
      startSeconds: 40,
      endSeconds: 70,
      excerpt: 'agent evaluation',
      topicSlugs: ['testing'],
      timestampUrl: 'https://video.example/watch/exact-phrase?t=40',
    };
    const splitTokens = {
      ...baseEntry,
      momentId: 'moment-split-tokens',
      videoId: 'video-split-tokens',
      videoSlug: 'a-split-tokens',
      sourceUrl: 'https://video.example/watch/split-tokens',
      videoTitle: 'Agent systems',
      startSeconds: 20,
      endSeconds: 35,
      excerpt: 'Scoring workflow',
      topicSlugs: ['evaluation'],
      timestampUrl: 'https://video.example/watch/split-tokens?t=20',
    };
    const publicIndex = {
      schemaVersion: 1 as const,
      corpusId: 'phrase-parity-fixture',
      entries: [splitTokens, exactPhrase],
    };
    const expectedOrder = searchPublicIndex(
      publicIndex,
      'agent evaluation',
    ).map((entry) => entry.momentId);
    expect(expectedOrder).toEqual([
      'moment-exact-phrase',
      'moment-split-tokens',
    ]);
    const harness = executeClientPayload();
    await harness.resolveIndex(publicIndex);

    harness.submit('agent evaluation');

    expect(
      descendants(harness.results, 'article').map(
        (article) => article.dataset.momentId,
      ),
    ).toEqual(expectedOrder);
  });

  it('keeps all shipped equal-score tie breakers equal to the helper/core order', async () => {
    const baseEntry = serializePublicSearchIndex(fixture, searchIndex).entries[0]!;
    const tiedEntries = [
      {
        ...baseEntry,
        momentId: 'moment-z',
        videoId: 'video-b',
        videoSlug: 'b-video',
        sourceUrl: 'https://video.example/watch/b-video',
        videoTitle: 'Agent note',
        startSeconds: 5,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/b-video?t=5',
      },
      {
        ...baseEntry,
        momentId: 'moment-c',
        videoId: 'video-a-later',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-later',
        videoTitle: 'Agent note',
        startSeconds: 20,
        endSeconds: 30,
        timestampUrl: 'https://video.example/watch/a-video-later?t=20',
      },
      {
        ...baseEntry,
        momentId: 'moment-b',
        videoId: 'video-a-same-b',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-same-b',
        videoTitle: 'Agent note',
        startSeconds: 10,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/a-video-same-b?t=10',
      },
      {
        ...baseEntry,
        momentId: 'moment-a',
        videoId: 'video-a-same-a',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-same-a',
        videoTitle: 'Agent note',
        startSeconds: 10,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/a-video-same-a?t=10',
      },
    ];
    const publicIndex = {
      schemaVersion: 1 as const,
      corpusId: 'tie-break-parity-fixture',
      entries: tiedEntries,
    };
    const expectedOrder = searchPublicIndex(publicIndex, 'agent').map(
      (entry) => entry.momentId,
    );
    expect(expectedOrder).toEqual([
      'moment-a',
      'moment-b',
      'moment-c',
      'moment-z',
    ]);
    const harness = executeClientPayload();
    await harness.resolveIndex(publicIndex);

    harness.submit('agent');

    expect(
      descendants(harness.results, 'article').map(
        (article) => article.dataset.momentId,
      ),
    ).toEqual(expectedOrder);
  });

  it('routes wrong-shaped and partially malformed loaded indexes to client-error recovery', async () => {
    const wrongShape = executeClientPayload();
    await wrongShape.resolveIndex({ entries: 'not-an-array' });
    expect(wrongShape.error.hidden).toBe(false);
    expect(wrongShape.status.textContent).toContain(
      'initial reviewed moments remain below',
    );
    expect(wrongShape.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const partial = executeClientPayload();
    await partial.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        topicSlugs: null,
      })),
    });
    expect(partial.error.hidden).toBe(false);
    expect(() => partial.submit('agent evaluation')).not.toThrow();
    expect(partial.status.textContent).toContain(
      'initial reviewed moments remain available below',
    );
  });

  it('rejects invalid source and mismatched timestamp indexes in the shipped payload', async () => {
    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const invalidSource = executeClientPayload();
    await invalidSource.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        sourceUrl: 'javascript:alert(1)',
        timestampUrl: 'javascript:alert(1)',
      })),
    });
    expect(invalidSource.error.hidden).toBe(false);
    expect(invalidSource.status.textContent).toContain(
      'initial reviewed moments remain below',
    );

    const mismatchedTimestamp = executeClientPayload();
    await mismatchedTimestamp.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        timestampUrl: 'https://video.example/watch/agent-evals?t=133',
      })),
    });
    expect(mismatchedTimestamp.error.hidden).toBe(false);
    expect(mismatchedTimestamp.results.children).toEqual([]);
  });

  it('recovers deterministically from rejected and non-OK index fetches', async () => {
    const rejected = executeClientPayload();
    await rejected.rejectFetch();
    expect(rejected.error.hidden).toBe(false);
    expect(rejected.status.textContent).toBe(
      'Interactive search is unavailable; initial reviewed moments remain below.',
    );
    expect(rejected.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    const nonOk = executeClientPayload();
    await nonOk.resolveNonOkFetch();
    expect(nonOk.error.hidden).toBe(false);
    expect(nonOk.status.textContent).toBe(
      'Interactive search is unavailable; initial reviewed moments remain below.',
    );
    expect(nonOk.serverResults.textContent).toBe(
      'server-rendered initial result',
    );
  });

  it('clears a transient pre-load fallback after valid loading and completes the fixed flow', async () => {
    const harness = executeClientPayload();
    harness.submit('agent evaluation');
    expect(harness.error.hidden).toBe(false);
    expect(harness.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );
    expect(harness.error.hidden).toBe(true);
    expect(harness.status.textContent).toBe(
      'Search is ready. Enter a phrase such as “agent evaluation”.',
    );

    harness.submit('agent evaluation');
    expect(
      descendants(harness.results, 'article')[0]?.dataset.momentId,
    ).toBe('moment-agent-evals');
  });

  it('catches unexpected submit-time rendering errors into the same fallback', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );
    harness.failNextRender();

    expect(() => harness.submit('agent evaluation')).not.toThrow();
    expect(harness.error.hidden).toBe(false);
    expect(harness.status.textContent).toContain(
      'initial reviewed moments remain available below',
    );
    expect(harness.serverResults.textContent).toBe(
      'server-rendered initial result',
    );
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
