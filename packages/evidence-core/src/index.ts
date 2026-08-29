export { EVIDENCE_SCHEMA_VERSION } from './schema-version.js';

export { canonicalJson, sha256 } from './canonical-json.js';
export type { JsonValue } from './canonical-json.js';
export { FetchBoundaryError, fetchAllowedSource } from './fetch.js';
export type {
  FetchAllowedSourceOptions,
  FetchErrorCode,
  FetchImplementation,
  HostResolver,
  PinnedConnectionImplementation,
  RawFetch,
  ResolvedAddress,
} from './fetch.js';
export {
  MAX_RESPONSE_BYTES,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  SourceManifestSchema,
  manifestSha256,
  safeSourceDisplayUrl,
  validateManifest,
} from './manifest.js';
export type { SourceManifest } from './manifest.js';
export { evaluatePublication } from './policy.js';
export type {
  Candidate,
  EvidenceClass,
  GateDecision,
  GateResult,
} from './policy.js';
export {
  ReceiptPayloadSchema,
  ReceiptSchema,
  ReceiptIntegrityError,
  createReceipt,
  verifyReceipt,
} from './receipt.js';
export type {
  Receipt,
  ReceiptInput,
  ReceiptIntegrityErrorCode,
  ReceiptPayload,
  ReceiptProvenance,
  ReceiptPublicFacts,
} from './receipt.js';
