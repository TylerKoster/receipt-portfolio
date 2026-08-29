export const EVIDENCE_SCHEMA_VERSION = '1.0.0' as const;

export {
  SourceManifestSchema,
  manifestSha256,
  validateManifest,
} from './manifest.js';
export type { SourceManifest } from './manifest.js';
