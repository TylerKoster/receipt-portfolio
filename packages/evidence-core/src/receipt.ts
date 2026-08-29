import { canonicalJson, sha256 } from './canonical-json.js';
import { EVIDENCE_SCHEMA_VERSION } from './index.js';
import type { GateResult } from './policy.js';

export interface ReceiptInput {
  readonly siteId: string;
  readonly sourceId: string;
  readonly observedAt: string;
  readonly sourceUrl: string;
  readonly manifestSha256: string;
  readonly rawSha256: string;
  readonly normalizedSha256: string;
  readonly predecessorReceiptId?: string;
  readonly policy: GateResult;
}

export interface ReceiptPayload extends ReceiptInput {
  readonly schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
}

export interface Receipt {
  readonly id: string;
  readonly payload: ReceiptPayload;
}

export type ReceiptIntegrityErrorCode =
  | 'RECEIPT_ID_FORMAT'
  | 'RECEIPT_SOURCE_HASH_FORMAT'
  | 'RECEIPT_PREDECESSOR_ID_FORMAT'
  | 'RECEIPT_PAYLOAD_DIGEST_MISMATCH';

export class ReceiptIntegrityError extends Error {
  readonly code: ReceiptIntegrityErrorCode;

  constructor(code: ReceiptIntegrityErrorCode, message: string) {
    super(message);
    this.name = 'ReceiptIntegrityError';
    this.code = code;
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function payloadDigest(payload: ReceiptPayload): string {
  return sha256(new TextEncoder().encode(canonicalJson(payload)));
}

export function createReceipt(input: ReceiptInput): Receipt {
  const payload: ReceiptPayload = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...input,
  };

  return { id: payloadDigest(payload), payload };
}

export function verifyReceipt(receipt: Receipt): Receipt {
  if (!SHA256_PATTERN.test(receipt.id)) {
    throw new ReceiptIntegrityError(
      'RECEIPT_ID_FORMAT',
      'Receipt ID must be a SHA-256 digest',
    );
  }

  const sourceHashes = [
    ['manifest', receipt.payload.manifestSha256],
    ['raw', receipt.payload.rawSha256],
    ['normalized', receipt.payload.normalizedSha256],
  ] as const;

  for (const [name, hash] of sourceHashes) {
    if (!SHA256_PATTERN.test(hash)) {
      throw new ReceiptIntegrityError(
        'RECEIPT_SOURCE_HASH_FORMAT',
        `${name} SHA-256 must be a lowercase hexadecimal digest`,
      );
    }
  }

  if (
    receipt.payload.predecessorReceiptId !== undefined &&
    !SHA256_PATTERN.test(receipt.payload.predecessorReceiptId)
  ) {
    throw new ReceiptIntegrityError(
      'RECEIPT_PREDECESSOR_ID_FORMAT',
      'Predecessor receipt ID must be a lowercase hexadecimal SHA-256 digest',
    );
  }

  if (receipt.id !== payloadDigest(receipt.payload)) {
    throw new ReceiptIntegrityError(
      'RECEIPT_PAYLOAD_DIGEST_MISMATCH',
      'Receipt ID does not match canonical payload digest',
    );
  }

  return receipt;
}
