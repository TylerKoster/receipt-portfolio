import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EVIDENCE_SCHEMA_VERSION } from './schema-version.js';

export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 5_000_000;

const MediaTypeSchema = z.enum([
  'application/json',
  'application/atom+xml',
  'application/rss+xml',
  'application/xml',
  'text/xml',
]);

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
      })
      .refine(
        (value) => {
          const endpoint = new URL(value);
          return (
            endpoint.username.length === 0 && endpoint.password.length === 0
          );
        },
        { message: 'endpoint must not contain user information' },
      ),
    allowedHosts: z.array(z.string().min(1)).min(1),
    allowedMediaTypes: z.array(MediaTypeSchema).min(1),
    maxBytes: z.number().int().positive().max(MAX_RESPONSE_BYTES),
    timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS),
    publisherName: z.string().min(1),
    sourceClass: z.enum(['official-primary', 'project-original-fixture']),
    extractionSelector: z.string().min(1),
    extractionContractId: z.enum([
      'search-status-events-v1',
      'search-feed-items-v1',
      'workflow-experiment-v1',
      'skill-inventory-v1',
    ]),
    cadence: z.enum(['hourly', 'daily', 'weekly', 'fixture-only']),
    noiseExclusions: z.array(z.string().min(1)),
    normalizerId: z.enum([
      'status-json-v1',
      'search-feed-v1',
      'workflow-fixture-v1',
      'archive-fixture-v1',
    ]),
    diffStrategyId: z.enum([
      'event-list-v1',
      'feed-item-v1',
      'fixture-record-v1',
      'inventory-v1',
    ]),
    schemaId: z.enum([
      'search-status-public-v1',
      'search-feed-public-v1',
      'workflow-experiment-public-v1',
      'skill-inventory-public-v1',
    ]),
    publicationMode: z.enum([
      'auto-facts-only',
      'hold-only',
      'fixture-example',
    ]),
    licenseNote: z.string().min(1),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const endpoint = new URL(manifest.endpoint);
    if (!manifest.allowedHosts.includes(endpoint.hostname)) {
      context.addIssue({
        code: 'custom',
        path: ['allowedHosts'],
        message: 'endpoint hostname must be included in allowedHosts',
      });
    }
    if (new Set(manifest.allowedHosts).size !== manifest.allowedHosts.length) {
      context.addIssue({
        code: 'custom',
        path: ['allowedHosts'],
        message: 'allowedHosts must not contain duplicates',
      });
    }
    if (
      new Set(manifest.allowedMediaTypes).size !==
      manifest.allowedMediaTypes.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['allowedMediaTypes'],
        message: 'allowedMediaTypes must not contain duplicates',
      });
    }

    const fixtureMode = manifest.publicationMode === 'fixture-example';
    const fixtureKind =
      manifest.kind === 'fixture' || manifest.kind === 'archive-fixture';
    if (
      fixtureMode !== fixtureKind ||
      fixtureMode !== (manifest.sourceClass === 'project-original-fixture') ||
      fixtureMode !== (manifest.cadence === 'fixture-only')
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'fixture-example mode requires a project-original fixture kind and fixture-only cadence',
      });
    }
    if (fixtureMode && !manifest.enabled) {
      context.addIssue({
        code: 'custom',
        path: ['enabled'],
        message: 'fixture-example manifests must be explicitly enabled',
      });
    }

    const compatible =
      manifest.siteId === 'search-receipt'
        ? [
            [
              'json',
              'search-status-events-v1',
              'status-json-v1',
              'event-list-v1',
              'search-status-public-v1',
            ],
            [
              'fixture',
              'search-status-events-v1',
              'status-json-v1',
              'event-list-v1',
              'search-status-public-v1',
            ],
            [
              'rss',
              'search-feed-items-v1',
              'search-feed-v1',
              'feed-item-v1',
              'search-feed-public-v1',
            ],
          ]
        : manifest.siteId === 'workflow-test-lab'
          ? [
              [
                'fixture',
                'workflow-experiment-v1',
                'workflow-fixture-v1',
                'fixture-record-v1',
                'workflow-experiment-public-v1',
              ],
            ]
          : [
              [
                'archive-fixture',
                'skill-inventory-v1',
                'archive-fixture-v1',
                'inventory-v1',
                'skill-inventory-public-v1',
              ],
            ];
    if (
      !compatible.some(
        ([kind, extractionContract, normalizer, diff, schema]) =>
          manifest.kind === kind &&
          manifest.extractionContractId === extractionContract &&
          manifest.normalizerId === normalizer &&
          manifest.diffStrategyId === diff &&
          manifest.schemaId === schema,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'manifest parser, diff, and schema identities are incompatible',
      });
    }

    const feedMediaTypes = new Set([
      'application/atom+xml',
      'application/rss+xml',
      'application/xml',
      'text/xml',
    ]);
    if (
      manifest.allowedMediaTypes.some((mediaType) =>
        manifest.kind === 'rss'
          ? !feedMediaTypes.has(mediaType)
          : mediaType !== 'application/json',
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['allowedMediaTypes'],
        message: 'allowedMediaTypes are incompatible with source kind',
      });
    }
  });

export type SourceManifest = z.infer<typeof SourceManifestSchema>;

export function safeSourceDisplayUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const endpoint = new URL(value);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username.length > 0 ||
      endpoint.password.length > 0
    ) {
      return undefined;
    }
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint.href;
  } catch {
    return undefined;
  }
}

export function validateManifest(input: unknown): SourceManifest {
  const result = SourceManifestSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      result.error.issues.map((issue) => issue.message).join('; '),
    );
  }
  return result.data;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
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
