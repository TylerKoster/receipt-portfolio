export const EVIDENCE_SCHEMA_VERSION = '1.0.0' as const;

export { canonicalJson, sha256 } from './canonical-json.js';
export type { JsonValue } from './canonical-json.js';
export {
  SourceManifestSchema,
  manifestSha256,
  validateManifest,
} from './manifest.js';
export type { SourceManifest } from './manifest.js';
export { evaluatePublication } from './policy.js';
export type { Candidate, GateDecision, GateResult } from './policy.js';
export { createReceipt, verifyReceipt } from './receipt.js';
export type { Receipt, ReceiptInput, ReceiptPayload } from './receipt.js';
