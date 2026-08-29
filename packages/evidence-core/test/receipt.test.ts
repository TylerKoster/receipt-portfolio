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

const receiptInput: ReceiptInput = {
  siteId: 'search-receipt',
  sourceId: 'google-search-status',
  observedAt: '2026-08-29T12:00:00.000Z',
  sourceUrl: 'https://status.search.google.com/incidents/example',
  manifestSha256: digest('1'),
  rawSha256: digest('2'),
  normalizedSha256: digest('3'),
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
