import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  createReceipt,
  EVIDENCE_SCHEMA_VERSION,
  sha256,
  verifyReceipt,
  type ReceiptInput,
} from '../src/index.js';

const digest = (character: string): string => character.repeat(64);
const execFileAsync = promisify(execFile);

const receiptInput: ReceiptInput = {
  siteId: 'search-receipt',
  sourceId: 'google-search-status',
  observedAt: '2026-08-29T12:00:00.000Z',
  sourceUrl: 'https://status.search.google.com/incidents/example',
  manifestSha256: digest('1'),
  rawSha256: digest('2'),
  normalizedSha256: digest('3'),
  rawObjectPath: `objects/raw/${digest('2')}.bin`,
  normalizedObjectPath: `objects/normalized/${digest('3')}.json`,
  sequence: 1,
  topicSlug: 'search-status',
  provenance: {
    evidenceClass: 'live-source',
    publicationMode: 'auto-facts-only',
    publisherName: 'Google Search',
    sourceClass: 'official-primary',
    extractionSelector: '$[*]',
    extractionContractId: 'search-status-events-v1',
    normalizerId: 'status-json-v1',
    diffStrategyId: 'event-list-v1',
    schemaId: 'search-status-public-v1',
  },
  publicFacts: {
    kind: 'search-status',
    eventId: 'incident-1',
    service: 'Search availability',
    startedAt: '2026-08-29T11:00:00.000Z',
    status: 'resolved',
    summary: 'Official status summary.',
  },
  interpretation: 'The source records this status.',
  unknowns: ['Downstream effects are unknown.'],
  correction: { kind: 'original' },
  gateInputs: {
    manifestValid: true,
    enabled: true,
    publicationMode: 'auto-facts-only',
    evidenceClass: 'live-source',
    rawSha256: digest('2'),
    normalizedSha256: digest('3'),
    ambiguous: false,
    diffRatio: 0.1,
  },
  policy: {
    decision: 'PASS',
    reasonCodes: ['SOURCE_FACTS_ONLY'],
  },
};

describe('canonical evidence bytes', () => {
  it('changes the raw digest when one input byte changes', () => {
    expect(sha256(new Uint8Array([1]))).not.toBe(sha256(new Uint8Array([2])));
  });

  it('sorts object keys recursively without reordering arrays', () => {
    expect(
      canonicalJson({
        zebra: [{ second: 2, first: 1 }, 'last'],
        alpha: true,
      }),
    ).toBe('{"alpha":true,"zebra":[{"first":1,"second":2},"last"]}');
  });

  it('rejects arrays with a custom prototype', () => {
    class PrototypeBearingArray extends Array<number> {}

    expect(() => canonicalJson(new PrototypeBearingArray(1, 2))).toThrow(
      /array prototype/i,
    );
  });

  it('rejects arrays with a non-enumerable non-index property', () => {
    const array = [1, 2];
    Object.defineProperty(array, 'hidden', {
      value: true,
      enumerable: false,
    });

    expect(() => canonicalJson(array)).toThrow(/array properties/i);
  });

  it('rejects sparse arrays', () => {
    const sparse = new Array<number>(2);
    sparse[1] = 2;

    expect(() => canonicalJson(sparse)).toThrow(/array properties/i);
  });

  it('promptly rejects the largest sparse array', async () => {
    const moduleUrl = new URL('../src/canonical-json.ts', import.meta.url).href;
    const script = `
      import { canonicalJson } from ${JSON.stringify(moduleUrl)};

      try {
        canonicalJson(new Array(4_294_967_295));
        process.stdout.write('DID_NOT_THROW');
      } catch (error) {
        process.stdout.write(error instanceof Error ? error.message : String(error));
      }
    `;

    let executionError: unknown;
    let stdout = '';

    try {
      ({ stdout } = await execFileAsync(
        process.execPath,
        ['--max-old-space-size=32', '--input-type=module', '--eval', script],
        { encoding: 'utf8', timeout: 1_000, windowsHide: true },
      ));
    } catch (error) {
      executionError = error;
    }

    expect(executionError).toBeUndefined();
    expect(stdout).toMatch(/array properties/i);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non-finite canonical JSON value %s',
    (value) => {
      expect(() => canonicalJson({ value })).toThrow(/finite/i);
    },
  );

  it('rejects values that JSON cannot represent', () => {
    expect(() =>
      canonicalJson({ value: undefined } as unknown as never),
    ).toThrow(/unsupported/i);
  });

  it('rejects duplicate semantic object keys', () => {
    expect(() => canonicalJson({ '\u00e9': 1, 'e\u0301': 2 })).toThrow(
      /duplicate semantic key/i,
    );
  });

  it('rejects objects with custom prototypes', () => {
    const prototypeBearing = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    prototypeBearing.own = true;

    expect(() => canonicalJson(prototypeBearing as never)).toThrow(
      /plain object/i,
    );
  });
});

describe('append-only receipts', () => {
  it('creates a deterministic ID from canonical payload bytes', () => {
    const receipt = createReceipt(receiptInput);

    expect(receipt.payload.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
    expect(receipt.id).toBe(
      sha256(new TextEncoder().encode(canonicalJson(receipt.payload))),
    );
    expect(verifyReceipt(receipt)).toEqual(receipt);
  });

  it('rejects a receipt whose file key is not its payload digest', () => {
    const receipt = createReceipt(receiptInput);

    expect(() => verifyReceipt({ ...receipt, id: '0'.repeat(64) })).toThrow(
      /digest/i,
    );
  });

  it('rejects an invalid predecessor receipt ID', () => {
    const receipt = createReceipt({
      ...receiptInput,
      predecessorReceiptId: 'not-a-sha-256',
    });

    expect(() => verifyReceipt(receipt)).toThrow(/predecessor/i);
  });

  it('accepts a valid predecessor receipt ID', () => {
    const predecessor = createReceipt(receiptInput);
    const receipt = createReceipt({
      ...receiptInput,
      observedAt: '2026-08-29T13:00:00.000Z',
      predecessorReceiptId: predecessor.id,
      sequence: 2,
    });

    expect(verifyReceipt(receipt)).toEqual(receipt);
  });

  it('detects an altered payload', () => {
    const receipt = createReceipt(receiptInput);

    expect(() =>
      verifyReceipt({
        ...receipt,
        payload: { ...receipt.payload, sourceId: 'altered-source' },
      }),
    ).toThrow(/digest/i);
  });

  it.each([
    ['manifestSha256', /manifest sha-256/i],
    ['rawSha256', /raw sha-256/i],
    ['normalizedSha256', /normalized sha-256/i],
  ] as const)('detects an altered %s source hash', (field, message) => {
    const receipt = createReceipt(receiptInput);

    expect(() =>
      verifyReceipt({
        ...receipt,
        payload: { ...receipt.payload, [field]: 'altered' },
      }),
    ).toThrow(message);
  });
});
