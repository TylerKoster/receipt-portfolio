import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applySearchState,
  filterSearchRecords,
  initializeSearchReceipt,
  resultCountMessage,
  type SearchRoot,
} from './search-interface.js';
import { searchReceiptSite } from './index.js';
import type { Receipt } from '../../packages/evidence-core/src/index.js';
import {
  renderMethodology,
  renderSite,
  renderSiteAssetPolicy,
} from '../shared/render.js';
import { workflowTestLabSite } from '../workflow-test-lab/index.js';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const receipt = (overrides: Partial<Receipt['payload']> = {}): Receipt => ({
  id: 'a'.repeat(64),
  payload: {
    correction: { kind: 'original' },
    gateInputs: {
      ambiguous: false,
      diffRatio: 0,
      enabled: true,
      evidenceClass: 'live-source',
      manifestValid: true,
      normalizedSha256: 'd'.repeat(64),
      publicationMode: 'auto-facts-only',
      rawSha256: 'c'.repeat(64),
    },
    manifestSha256: 'b'.repeat(64),
    normalizedObjectPath: `objects/normalized/${'d'.repeat(64)}.json`,
    normalizedSha256: 'd'.repeat(64),
    observedAt: '2026-08-30T00:00:00.000Z',
    policy: { decision: 'PASS', reasonCodes: [] },
    provenance: {
      evidenceClass: 'live-source',
      diffStrategyId: 'event-list-v1',
      extractionContractId: 'search-status-events-v1',
      extractionSelector: '$[*]',
      normalizerId: 'status-json-v1',
      publicationMode: 'auto-facts-only',
      publisherName: 'Google Search Central',
      schemaId: 'search-status-public-v1',
      sourceClass: 'official-primary',
    },
    publicFacts: {
      eventId: 'indexing-incident',
      kind: 'search-status',
      service: 'Crawling',
      startedAt: '2026-08-30T00:00:00.000Z',
      status: 'resolved',
      summary: 'Delayed indexing was reported and later resolved.',
    },
    rawObjectPath: `objects/raw/${'c'.repeat(64)}.bin`,
    rawSha256: 'c'.repeat(64),
    schemaVersion: '2.0.0',
    sequence: 1,
    siteId: 'search-receipt',
    sourceId: 'google-search-status',
    sourceUrl: 'https://status.search.google.com/',
    topicSlug: 'search-status',
    interpretation: 'This source reported a resolved crawling incident.',
    unknowns: ['No cause is established for any particular website.'],
    ...overrides,
  },
});

describe('Search Receipt query and offer adapter', () => {
  it('renders an accessible query and topic filter over source-bound records', () => {
    const html = renderSite(searchReceiptSite, [receipt()]);

    expect(html).toContain('<form class="search-controls" role="search"');
    expect(html).toContain('<label for="receipt-query">Search records</label>');
    expect(html).toContain('id="receipt-query" name="receipt-query"');
    expect(html).toContain(
      '<label for="receipt-topic">Filter by topic</label>',
    );
    expect(html).toContain(
      '<option value="search-status">search-status</option>',
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(
      'data-search-error>Interactive filtering is not active',
    );
    expect(html).toContain('<button type="submit">Apply filters</button>');
    expect(html).toContain('data-search-record');
    expect(html).toContain('data-search-text=');
    expect(html).toContain('data-search-topic="search-status"');
    expect(html).toContain(
      '<script type="module" src="/search-receipt/search-interface.js"></script>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/search-receipt/search-interface.css">',
    );
  });

  it('filters case-insensitively by query and exact topic with an explicit empty result', () => {
    const records = [
      { searchText: 'google crawling resolved', topic: 'search-status' },
      { searchText: 'central blog robots guidance', topic: 'guidance' },
    ];

    expect(filterSearchRecords(records, 'CRAWLING', '')).toEqual([0]);
    expect(filterSearchRecords(records, 'google resolved', '')).toEqual([0]);
    expect(filterSearchRecords(records, '', 'guidance')).toEqual([1]);
    expect(filterSearchRecords(records, 'missing', '')).toEqual([]);
    expect(resultCountMessage(0, 2)).toBe('Showing 0 of 2 records.');
    expect(resultCountMessage(1, 2)).toBe('Showing 1 of 2 records.');
  });

  it('updates card visibility without replacing record markup', () => {
    const cards = [
      {
        dataset: {
          searchText: 'google crawling resolved',
          searchTopic: 'search-status',
        },
        hidden: false,
      },
      {
        dataset: {
          searchText: 'central blog robots guidance',
          searchTopic: 'guidance',
        },
        hidden: false,
      },
    ];

    expect(applySearchState(cards, 'robots', 'guidance')).toEqual({
      count: 1,
      message: 'Showing 1 of 2 records.',
    });
    expect(cards.map((card) => card.hidden)).toEqual([true, false]);
  });

  it('initializes the emitted controls and handles the native form submit path', () => {
    type Listener = (event: { preventDefault(): void }) => void;
    const element = () => ({
      addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, listener);
      },
      disabled: false,
      hidden: false,
      listeners: new Map<string, Listener>(),
      textContent: '',
      value: '',
    });
    const form = element();
    const query = element();
    const topic = element();
    const status = element();
    const empty = element();
    const error = element();
    const offer = element();
    const offerStatus = element();
    const cards = [
      {
        dataset: {
          searchText: 'google crawling resolved',
          searchTopic: 'search-status',
        },
        hidden: false,
      },
      {
        dataset: {
          searchText: 'central blog robots guidance',
          searchTopic: 'guidance',
        },
        hidden: false,
      },
    ];
    const elements = new Map([
      ['[data-search-controls]', form],
      ['[data-search-query]', query],
      ['[data-search-topic-filter]', topic],
      ['[data-search-status]', status],
      ['[data-search-empty]', empty],
      ['[data-search-error]', error],
      ['[data-measurement-action]', offer],
      ['[data-offer-status]', offerStatus],
    ]);
    const root = {
      querySelector: (selector: string) => elements.get(selector) ?? null,
      querySelectorAll: () => cards,
    } as unknown as SearchRoot;

    expect(initializeSearchReceipt(root)).toBe(true);
    expect(error.hidden).toBe(true);
    query.value = 'robots';
    topic.value = 'guidance';
    let prevented = false;
    form.listeners.get('submit')?.({
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(cards.map((card) => card.hidden)).toEqual([true, false]);
    expect(status.textContent).toBe('Showing 1 of 2 records.');
  });

  it('adds a visible clear-filters recovery action after a no-match without retaining or sending input', () => {
    type Listener = (event: { preventDefault(): void }) => void;
    interface FakeElement {
      addEventListener(type: string, listener: Listener): void;
      append(child: FakeElement): void;
      appendCount: number;
      dataset: Record<string, string>;
      disabled: boolean;
      focus(): void;
      focusCount: number;
      focused: boolean;
      hidden: boolean;
      listeners: Map<string, Listener[]>;
      setAttribute(): void;
      textContent: string;
      type: string;
      value: string;
    }
    const elements = new Map<string, FakeElement>();
    const element = (): FakeElement => ({
      addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [
          ...(this.listeners.get(type) ?? []),
          listener,
        ]);
      },
      append(child: FakeElement) {
        this.appendCount += 1;
        elements.set('[data-search-reset]', child);
      },
      appendCount: 0,
      dataset: {},
      disabled: false,
      focus() {
        this.focusCount += 1;
        this.focused = true;
      },
      focusCount: 0,
      focused: false,
      hidden: false,
      listeners: new Map<string, Listener[]>(),
      setAttribute() {},
      textContent: '',
      type: '',
      value: '',
    });
    const form = element();
    Object.assign(form, {
      ownerDocument: { createElement: () => element() },
    });
    const query = element();
    const topic = element();
    const status = element();
    const empty = element();
    empty.textContent = 'No records match this query and filter.';
    const error = element();
    const cards = [
      {
        dataset: {
          searchText: 'google crawling resolved',
          searchTopic: 'search-status',
        },
        hidden: false,
      },
      {
        dataset: {
          searchText: 'central blog robots guidance',
          searchTopic: 'guidance',
        },
        hidden: false,
      },
    ];
    const root = {
      querySelector: (selector: string) => {
        const values = new Map([
          ['[data-search-controls]', form],
          ['[data-search-query]', query],
          ['[data-search-topic-filter]', topic],
          ['[data-search-status]', status],
          ['[data-search-empty]', empty],
          ['[data-search-error]', error],
        ]);
        return values.get(selector) ?? elements.get(selector) ?? null;
      },
      querySelectorAll: () => cards,
    } as unknown as SearchRoot;

    expect(initializeSearchReceipt(root)).toBe(true);
    query.value = 'missing';
    topic.value = 'guidance';
    form.listeners
      .get('submit')
      ?.forEach((listener) => listener({ preventDefault() {} }));
    expect(status.textContent).toBe('Showing 0 of 2 records.');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No records match this query and filter.');
    expect(cards.map((card) => card.hidden)).toEqual([true, true]);

    const reset = elements.get('[data-search-reset]');
    expect(reset?.textContent).toBe('Clear filters');
    expect(initializeSearchReceipt(root)).toBe(true);
    expect(form.appendCount).toBe(1);
    expect(reset?.listeners.get('click')).toHaveLength(1);
    reset?.listeners
      .get('click')
      ?.forEach((listener) => listener({ preventDefault() {} }));
    expect(query.value).toBe('');
    expect(topic.value).toBe('');
    expect(status.textContent).toBe('Showing 2 of 2 records.');
    expect(cards.map((card) => card.hidden)).toEqual([false, false]);
    expect(query.focused).toBe(true);
    expect(query.focusCount).toBe(1);
  });

  it('keeps a visible fallback when initialization cannot bind required controls', () => {
    const html = renderSite(searchReceiptSite, [receipt()]);
    expect(html).toContain(
      'Interactive filtering is not active; all records remain visible.',
    );
    expect(
      initializeSearchReceipt({
        querySelector: () => null,
        querySelectorAll: () => [],
      }),
    ).toBe(false);
  });

  it('does not reflect raw query text or perform storage, analytics, or network calls', async () => {
    expect(resultCountMessage(0, 1)).toBe('Showing 0 of 1 record.');

    const source = await readFile(
      join(projectRoot, 'sites', 'search-receipt', 'search-interface.js'),
      'utf8',
    );
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|sendBeacon/);
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(source).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });

  it('labels the offer as non-operational and avoids causal or revenue claims', () => {
    const html = renderSite(searchReceiptSite, [receipt()]);

    expect(html).toContain('Preview interest action');
    expect(html).toContain(
      'does not create an alert, send data, or start a report',
    );
    expect(html).toContain('data-measurement-action="alert-report-interest"');
    expect(html).not.toMatch(
      /improve(?:s|d)? rankings|increase(?:s|d)? traffic/i,
    );
    expect(html).not.toMatch(/customers|revenue generated|conversion rate/i);
  });

  it('escapes searchable attributes and preserves other product rendering and CSP', () => {
    const hostile = receipt({
      sourceId: '"><script>alert(1)</script>',
      topicSlug: '" onfocus="alert(1)',
    });
    const searchHtml = renderSite(searchReceiptSite, [hostile]);
    expect(searchHtml).not.toContain('<script>alert(1)</script>');
    expect(searchHtml).not.toContain('onfocus="alert(1)');
    expect(searchHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    const workflowHtml = renderSite(workflowTestLabSite, [
      receipt({
        siteId: 'workflow-test-lab',
        publicFacts: {
          expectedFields: ['title'],
          experimentId: 'fixture',
          fixtureId: 'fixture-v1',
          kind: 'workflow-experiment',
          negativeConstraints: ['not production'],
          taskFamily: 'structured extraction',
        },
      }),
    ]);
    expect(workflowHtml).not.toContain('search-controls');
    expect(workflowHtml).not.toContain('search-interface.js');
    expect(workflowHtml).toContain("script-src 'none'");
    expect(renderSiteAssetPolicy(workflowTestLabSite)).toEqual({
      scriptPath: undefined,
      scriptPolicy: "'none'",
      stylePath: undefined,
    });
    const nestedSearchPage = renderMethodology(searchReceiptSite);
    expect(nestedSearchPage).toContain("script-src 'none'");
    expect(nestedSearchPage).not.toContain('search-interface.js');
  });
});
