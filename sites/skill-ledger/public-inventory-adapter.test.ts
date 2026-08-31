import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_PUBLIC_SKILL_RECORDS,
  PUBLIC_SKILL_LEDGER_BOUNDARY,
  createPublicSkillLedgerFilters,
  createPublicSkillLedgerInventoryState,
  filterPublicSkillLedgerRecords,
  initializePublicSkillLedgerInventory,
  updatePublicSkillLedgerSelection,
  type PublicSkillLedgerRecord,
  type PublicSkillLedgerRoot,
} from './public-inventory-adapter.js';

type Listener = (event: {
  preventDefault(): void;
  target: FakeElement;
}) => void;

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  readonly textHistory: string[] = [];
  checked = false;
  disabled = false;
  hidden = false;
  id = '';
  ownerDocument: FakeDocument;
  type = '';
  value = '';
  private ownText = '';

  constructor(
    readonly tagName: string,
    document: FakeDocument,
  ) {
    this.ownerDocument = document;
  }

  get textContent(): string {
    return (
      this.ownText + this.children.map((child) => child.textContent).join('')
    );
  }

  set textContent(value: string) {
    this.ownText = String(value);
    this.children.splice(0);
    this.textHistory.push(this.ownText);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault() {}, target: this });
    }
  }

  focus(): void {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches = (element: FakeElement) => {
      const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/u);
      if (attribute) {
        const actual = element.attributes.get(attribute[1]);
        return (
          actual !== undefined &&
          (attribute[2] === undefined || actual === attribute[2])
        );
      }
      if (selector.startsWith('#')) return element.id === selector.slice(1);
      return element.tagName === selector.toLowerCase();
    };
    const descendants = (element: FakeElement): FakeElement[] =>
      element.children.flatMap((child) => [child, ...descendants(child)]);
    return descendants(this).filter(matches);
  }

  setAttribute(name: string, value: string): void {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name.startsWith('data-')) {
      const key = name
        .slice('data-'.length)
        .replace(/-([a-z])/gu, (_match, letter: string) =>
          letter.toUpperCase(),
        );
      this.dataset[key] = normalized;
    }
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toLowerCase(), this);
  }
}

function controlledRecord(
  receiptId: string,
  packageId: string,
  license: string,
  dependencies: readonly string[],
  staticSignals: readonly string[],
): PublicSkillLedgerRecord {
  const character =
    receiptId === 'receipt-a' ? 'a' : receiptId === 'receipt-b' ? 'b' : 'c';
  return {
    receiptId,
    evidenceClass: 'controlled-only',
    source: {
      sourceId: `${packageId}-source`,
      url: `https://example.invalid/${packageId}`,
      observedAt: '2026-08-30T12:00:00.000Z',
    },
    hashes: {
      manifestSha256: character.repeat(64),
      rawSha256: character.repeat(64),
      normalizedSha256: character.repeat(64),
    },
    declaredMetadata: {
      packageId,
      license,
      manifestPresent: true,
      dependencies,
      contentsSha256: character.repeat(64),
    },
    staticSignals,
  };
}

const records = [
  controlledRecord('receipt-a', 'alpha-package', 'MIT', [], []),
  controlledRecord(
    'receipt-b',
    'beta-package',
    'Apache-2.0',
    ['declared-helper'],
    ['declared-script'],
  ),
  controlledRecord('receipt-c', 'gamma-package', 'MIT', [], []),
] as const;

function typeCheckBrowserRoot(root: HTMLElement): boolean {
  return initializePublicSkillLedgerInventory(root);
}

void typeCheckBrowserRoot;

describe('SkillLedger public inventory adapter', () => {
  it('filters package and source text with declared-only facets in memory', () => {
    expect(
      filterPublicSkillLedgerRecords(
        records,
        createPublicSkillLedgerFilters({ query: '  BETA-PACKAGE-SOURCE  ' }),
      ).map((record) => record.receiptId),
    ).toEqual(['receipt-b']);
    expect(
      filterPublicSkillLedgerRecords(
        records,
        createPublicSkillLedgerFilters({
          declaredLicense: 'MIT',
          dependencyState: 'none',
          staticSignalPresence: 'absent',
        }),
      ).map((record) => record.receiptId),
    ).toEqual(['receipt-a', 'receipt-c']);
    expect(
      filterPublicSkillLedgerRecords(
        records,
        createPublicSkillLedgerFilters({
          dependencyState: 'declared',
          staticSignalPresence: 'present',
        }),
      ).map((record) => record.receiptId),
    ).toEqual(['receipt-b']);
  });

  it('constructs deterministic loading, ready, empty, and error states', () => {
    expect(
      createPublicSkillLedgerInventoryState(records, { phase: 'loading' }),
    ).toMatchObject({
      phase: 'loading',
      count: 0,
      total: 3,
      statusMessage: 'Loading controlled source-bound records.',
      visibleRecords: [],
    });
    expect(createPublicSkillLedgerInventoryState(records)).toMatchObject({
      phase: 'ready',
      count: 3,
      total: 3,
      empty: false,
      statusMessage: 'Showing 3 of 3 controlled records.',
    });
    expect(
      createPublicSkillLedgerInventoryState(records, {
        filters: createPublicSkillLedgerFilters({ query: 'missing' }),
      }),
    ).toMatchObject({
      phase: 'ready',
      count: 0,
      total: 3,
      empty: true,
      statusMessage: 'Showing 0 of 3 controlled records.',
    });
    expect(
      createPublicSkillLedgerInventoryState(records, {
        phase: 'error',
        errorMessage: 'Controlled records are temporarily unavailable.',
      }),
    ).toMatchObject({
      phase: 'error',
      count: 3,
      total: 3,
      empty: false,
      statusMessage:
        'Inventory controls are unavailable; all controlled records remain visible.',
      errorMessage: 'Controlled records are temporarily unavailable.',
      visibleRecords: records,
    });
  });

  it('keeps an existing pair intact when a third record is selected', () => {
    const pair = updatePublicSkillLedgerSelection([], 'receipt-a', true);
    const readyPair = updatePublicSkillLedgerSelection(
      pair.selectedReceiptIds,
      'receipt-b',
      true,
    );
    expect(
      updatePublicSkillLedgerSelection(
        readyPair.selectedReceiptIds,
        'receipt-c',
        true,
      ),
    ).toEqual({
      selectedReceiptIds: ['receipt-a', 'receipt-b'],
      errorMessage:
        'Select no more than two controlled records. The existing pair was kept.',
    });
  });

  it('renders accessible controls and every source-bound field with text nodes', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');

    expect(
      initializePublicSkillLedgerInventory(
        root as unknown as PublicSkillLedgerRoot,
      ),
    ).toBe(true);
    expect(CONTROLLED_PUBLIC_SKILL_RECORDS).toHaveLength(2);
    expect(
      CONTROLLED_PUBLIC_SKILL_RECORDS.every(
        (record) => record.evidenceClass === 'controlled-only',
      ),
    ).toBe(true);
    expect(
      root
        .querySelector('[data-skill-ledger-query]')
        ?.attributes.get('aria-label'),
    ).toBeUndefined();
    expect(
      root.querySelector('[data-skill-ledger-license-filter]')?.tagName,
    ).toBe('select');
    expect(
      root.querySelector('[data-skill-ledger-dependency-filter]')?.tagName,
    ).toBe('select');
    expect(
      root.querySelector('[data-skill-ledger-static-filter]')?.tagName,
    ).toBe('select');
    expect(root.textContent).toContain(
      'https://example.invalid/controlled-alpha',
    );
    expect(root.textContent).toContain('2026-08-30T12:00:00.000Z');
    expect(root.textContent).toContain('Manifest SHA-256');
    expect(root.textContent).toContain('Raw SHA-256');
    expect(root.textContent).toContain('Normalized SHA-256');
    expect(root.textContent).toContain('Contents SHA-256');
    expect(root.textContent).toContain('Receipt IDcontrolled-alpha-receipt');
    expect(root.textContent).toContain('Declared license');
    expect(root.textContent).toContain('Declared dependencies');
    expect(root.textContent).toContain('Static-signal presence');
    expect(root.textContent).toContain(PUBLIC_SKILL_LEDGER_BOUNDARY);
    expect(root.textContent).toContain(
      'No safety, runtime behavior, adoption, currentness, provenance, suitability, ranking, or recommendation conclusion is established.',
    );
    const status = root.querySelector('[data-skill-ledger-status]');
    expect(status?.attributes.get('role')).toBe('status');
    expect(status?.attributes.get('aria-live')).toBe('polite');
    expect(status?.textHistory).toContain(
      'Loading controlled source-bound records.',
    );
    expect(status?.textContent).toBe('Showing 2 of 2 controlled records.');
  });

  it('binds filters, empty recovery, exactly-two comparison, and reset', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');
    initializePublicSkillLedgerInventory(
      root as unknown as PublicSkillLedgerRoot,
      records,
    );

    const query = root.querySelector('[data-skill-ledger-query]');
    if (!query) throw new Error('expected query control');
    query.value = 'missing';
    query.dispatch('input');
    expect(root.querySelector('[data-skill-ledger-status]')?.textContent).toBe(
      'Showing 0 of 3 controlled records.',
    );
    expect(root.querySelector('[data-skill-ledger-empty]')?.hidden).toBe(false);
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(0);

    query.value = '';
    query.dispatch('input');
    const selections = root.querySelectorAll(
      '[data-skill-ledger-record-select]',
    );
    selections[0].checked = true;
    selections[0].dispatch('change');
    selections[1].checked = true;
    selections[1].dispatch('change');
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain('Ready comparison: alpha-package and beta-package.');
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain('Source URL');
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain(
      'Different — Left: https://example.invalid/alpha-package; Right:',
    );
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain(
      'Same — Left: 2026-08-30T12:00:00.000Z; Right: 2026-08-30T12:00:00.000Z',
    );

    selections[2].checked = true;
    selections[2].dispatch('change');
    expect(selections[2].checked).toBe(false);
    expect(root.querySelector('[data-skill-ledger-error]')?.textContent).toBe(
      'Select no more than two controlled records. The existing pair was kept.',
    );
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain('Ready comparison: alpha-package and beta-package.');

    root.querySelector('[data-skill-ledger-reset]')?.dispatch('click');
    expect(query.value).toBe('');
    expect(
      root.querySelector('[data-skill-ledger-license-filter]')?.value,
    ).toBe('');
    expect(
      root.querySelector('[data-skill-ledger-dependency-filter]')?.value,
    ).toBe('');
    expect(root.querySelector('[data-skill-ledger-static-filter]')?.value).toBe(
      '',
    );
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(3);
    expect(
      root
        .querySelectorAll('[data-skill-ledger-record-select]')
        .every((selection) => !selection.checked),
    ).toBe(true);
    expect(
      root.querySelector('[data-skill-ledger-comparison]')?.textContent,
    ).toContain('Select exactly two controlled records to compare.');
    expect(root.querySelector('[data-skill-ledger-error]')?.hidden).toBe(true);
  });

  it('exposes an error state without suppressing controlled records', () => {
    const state = createPublicSkillLedgerInventoryState(records, {
      phase: 'error',
      filters: createPublicSkillLedgerFilters({ query: 'missing' }),
      errorMessage: 'Filtering is unavailable.',
    });
    expect(state.visibleRecords).toEqual(records);
    expect(state.count).toBe(3);
    expect(state.empty).toBe(false);
  });

  it('fails closed instead of rendering a supplied uncontrolled record', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');
    const uncontrolled = {
      ...records[0],
      evidenceClass: 'uncontrolled',
    } as unknown as PublicSkillLedgerRecord;

    expect(
      initializePublicSkillLedgerInventory(
        root as unknown as PublicSkillLedgerRoot,
        [uncontrolled],
      ),
    ).toBe(true);
    expect(root.attributes.get('data-skill-ledger-state')).toBe('error');
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(0);
    expect(root.textContent).not.toContain('alpha-package');
    expect(root.querySelector('[data-skill-ledger-error]')?.textContent).toBe(
      'Supplied records failed controlled-only validation and were not shown.',
    );
  });

  it('renders a visible error instead of throwing for malformed supplied data', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');
    const malformed = {
      receiptId: 'incomplete-record',
    } as unknown as PublicSkillLedgerRecord;

    expect(() =>
      initializePublicSkillLedgerInventory(
        root as unknown as PublicSkillLedgerRoot,
        [malformed],
      ),
    ).not.toThrow();
    expect(root.attributes.get('data-skill-ledger-state')).toBe('error');
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(0);
    expect(root.querySelector('[data-skill-ledger-error]')?.hidden).toBe(false);
  });

  it('rejects a supplied HTTPS-looking source URL without a valid host', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');
    const malformedUrl = {
      ...records[0],
      source: { ...records[0].source, url: 'https://?' },
    };

    initializePublicSkillLedgerInventory(
      root as unknown as PublicSkillLedgerRoot,
      [malformedUrl],
    );
    expect(root.attributes.get('data-skill-ledger-state')).toBe('error');
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(0);
    expect(root.textContent).not.toContain('https://?');
  });

  it('fails closed when supplied controlled records share a receipt identity', () => {
    const document = new FakeDocument();
    const root = document.createElement('section');
    const duplicateIdentityRecords = [
      records[0],
      { ...records[1], receiptId: 'receipt-a' },
    ];

    initializePublicSkillLedgerInventory(
      root as unknown as PublicSkillLedgerRoot,
      duplicateIdentityRecords,
    );
    expect(root.attributes.get('data-skill-ledger-state')).toBe('error');
    expect(root.querySelectorAll('[data-skill-ledger-record]')).toHaveLength(0);
    expect(root.querySelector('[data-skill-ledger-error]')?.hidden).toBe(false);
    expect(root.querySelector('[data-skill-ledger-error]')?.textContent).toBe(
      'Supplied records failed controlled-only validation and were not shown.',
    );
  });

  it('contains no network, persistence, navigation, telemetry, or HTML-string sinks', async () => {
    const source = await readFile(
      join(
        process.cwd(),
        'sites',
        'skill-ledger',
        'public-inventory-adapter.js',
      ),
      'utf8',
    );
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|cookie\s*=|history\.|innerHTML|insertAdjacentHTML/u,
    );
    expect(source).not.toMatch(
      /WebSocket|EventSource|indexedDB|caches\.|window\.location|navigator\.|\bimport\s*\(|\brequire\s*\(|\binstall\b|\btelemetry\b|\baccount\b|\bauth(?:entication|orization)?\b/iu,
    );
    expect(source).not.toMatch(
      /(?:^|\n)\s*import(?:\s+[\w*{]|\s*['"])|(?:^|[^\w.])location\.(?:assign|replace|href)/mu,
    );
  });
});
