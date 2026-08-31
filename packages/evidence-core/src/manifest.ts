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
  'text/plain',
]);

const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const CompanionSourceSchema = z
  .object({
    role: z.literal('inherited-license'),
    endpoint: z.string().url(),
    allowedHosts: z.array(z.string().min(1)).min(1),
    allowedMediaTypes: z.array(MediaTypeSchema).min(1),
    maxBytes: z.number().int().positive().max(MAX_RESPONSE_BYTES),
    expectedBytes: z.number().int().positive().max(MAX_RESPONSE_BYTES),
    expectedSha256: SHA256Schema,
  })
  .strict();

export const SourceManifestSchema = z
  .object({
    siteId: z.enum(['search-receipt', 'workflow-test-lab', 'skill-ledger']),
    sourceId: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(['rss', 'json', 'fixture', 'archive-fixture', 'text']),
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
    expectedBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_RESPONSE_BYTES)
      .optional(),
    expectedSha256: SHA256Schema.optional(),
    companionSources: z.array(CompanionSourceSchema).max(1).optional(),
    publisherName: z.string().min(1),
    sourceClass: z.enum(['official-primary', 'project-original-fixture']),
    extractionSelector: z.string().min(1),
    extractionContractId: z.enum([
      'search-status-events-v1',
      'search-feed-items-v1',
      'workflow-experiment-v1',
      'skill-inventory-v1',
      'skill-declared-metadata-v1',
    ]),
    cadence: z.enum(['hourly', 'daily', 'weekly', 'fixture-only']),
    noiseExclusions: z.array(z.string().min(1)),
    normalizerId: z.enum([
      'status-json-v1',
      'search-feed-v1',
      'workflow-fixture-v1',
      'archive-fixture-v1',
      'skill-source-observation-v1',
    ]),
    diffStrategyId: z.enum([
      'event-list-v1',
      'feed-item-v1',
      'fixture-record-v1',
      'inventory-v1',
      'source-record-v1',
    ]),
    schemaId: z.enum([
      'search-status-public-v1',
      'search-feed-public-v1',
      'workflow-experiment-public-v1',
      'skill-inventory-public-v1',
      'skill-source-metadata-public-v1',
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
              [
                'text',
                'skill-declared-metadata-v1',
                'skill-source-observation-v1',
                'source-record-v1',
                'skill-source-metadata-public-v1',
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
          : manifest.kind === 'text'
            ? mediaType !== 'text/plain'
            : mediaType !== 'application/json',
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['allowedMediaTypes'],
        message: 'allowedMediaTypes are incompatible with source kind',
      });
    }

    const liveSkillSource =
      manifest.siteId === 'skill-ledger' && manifest.kind === 'text';
    if (liveSkillSource) {
      const companion = manifest.companionSources?.[0];
      const sourceUrl = new URL(manifest.endpoint);
      const sourceCommit = sourceUrl.pathname.match(
        /^\/microsoft\/skills\/([a-f0-9]{40})\//,
      )?.[1];
      let companionCommit: string | undefined;
      if (companion !== undefined) {
        const companionUrl = new URL(companion.endpoint);
        companionCommit = companionUrl.pathname.match(
          /^\/microsoft\/skills\/([a-f0-9]{40})\//,
        )?.[1];
        if (
          companionUrl.protocol !== 'https:' ||
          companionUrl.username !== '' ||
          companionUrl.password !== '' ||
          companionUrl.search !== '' ||
          companionUrl.hash !== '' ||
          !companion.allowedHosts.includes(companionUrl.hostname) ||
          companion.allowedMediaTypes.length !== 1 ||
          companion.allowedMediaTypes[0] !== 'text/plain'
        ) {
          context.addIssue({
            code: 'custom',
            path: ['companionSources'],
            message: 'Skill source companion is not safely allowlisted',
          });
        }
      }
      if (
        manifest.expectedBytes === undefined ||
        manifest.expectedSha256 === undefined ||
        manifest.companionSources?.length !== 1 ||
        sourceUrl.hostname !== 'raw.githubusercontent.com' ||
        sourceUrl.search !== '' ||
        sourceUrl.hash !== '' ||
        sourceCommit === undefined ||
        companionCommit !== sourceCommit
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Live SkillLedger text source requires one same-commit allowlisted companion and exact expected bytes and hashes',
        });
      }
      if (
        manifest.sourceId !== 'microsoft-skill-creator' ||
        manifest.endpoint !==
          'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/.github/skills/skill-creator/SKILL.md' ||
        manifest.publisherName !== 'Microsoft' ||
        manifest.expectedBytes !== 68_147 ||
        manifest.expectedSha256 !==
          '15ce951aec071c813150e6794628664725c164223108792e15bd3db18e959da0' ||
        manifest.allowedHosts.length !== 1 ||
        manifest.allowedHosts[0] !== 'raw.githubusercontent.com' ||
        companion?.endpoint !==
          'https://raw.githubusercontent.com/microsoft/skills/7066b58141d8cc66f39356b2ee5bb64d428dcf17/LICENSE' ||
        companion.expectedBytes !== 1_140 ||
        companion.expectedSha256 !==
          'd9a1b1e30d633d5732ea18e3cba9538d293ebc53e1a9e4e96ab739e0c5c4f1cb' ||
        companion.allowedHosts.length !== 1 ||
        companion.allowedHosts[0] !== 'raw.githubusercontent.com'
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Live SkillLedger source must match the exact designated Microsoft source and license tuple',
        });
      }
    } else if (
      manifest.expectedBytes !== undefined ||
      manifest.expectedSha256 !== undefined ||
      manifest.companionSources !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Expected source bytes and companion configuration are limited to the live SkillLedger text source',
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
