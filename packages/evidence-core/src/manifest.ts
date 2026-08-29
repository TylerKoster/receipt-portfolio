import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EVIDENCE_SCHEMA_VERSION } from './index.js';

export const SourceManifestSchema = z
  .object({
    siteId: z.enum(['search-receipt', 'workflow-test-lab', 'skill-ledger']),
    sourceId: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(['rss', 'json', 'fixture', 'archive-fixture']),
    endpoint: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:', {
        message: 'endpoint must use HTTPS',
      }),
    allowedHosts: z.array(z.string().min(1)).min(1),
    maxBytes: z.number().int().positive().max(5_000_000),
    timeoutMs: z.number().int().min(100).max(30_000),
    normalizerId: z.enum([
      'status-json-v1',
      'workflow-fixture-v1',
      'archive-fixture-v1',
    ]),
    diffStrategyId: z.enum([
      'event-list-v1',
      'fixture-record-v1',
      'inventory-v1',
    ]),
    publicationMode: z.enum(['auto-facts-only', 'hold-only']),
    licenseNote: z.string().min(1),
    enabled: z.boolean(),
  })
  .strict();

export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export function validateManifest(input: unknown): SourceManifest {
  const result = SourceManifestSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  }

  if (!result.data.allowedHosts.includes(new URL(result.data.endpoint).host)) {
    throw new Error(
      `endpoint host must be included in allowedHosts for evidence schema ${EVIDENCE_SCHEMA_VERSION}`,
    );
  }

  return result.data;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

export function manifestSha256(manifest: SourceManifest): string {
  return createHash('sha256')
    .update(EVIDENCE_SCHEMA_VERSION)
    .update('\n')
    .update(JSON.stringify(canonicalize(manifest)))
    .digest('hex');
}
