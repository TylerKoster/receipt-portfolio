import { z } from 'zod';
import { canonicalJson, sha256 } from './canonical-json.js';
import { evaluatePublication } from './policy.js';
import { EVIDENCE_SCHEMA_VERSION } from './schema-version.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SHA256 = z.string().regex(SHA256_PATTERN);
const SiteId = z.enum(['search-receipt', 'workflow-test-lab', 'skill-ledger']);
const PublicationMode = z.enum([
  'auto-facts-only',
  'hold-only',
  'fixture-example',
]);
const EvidenceClass = z.enum(['live-source', 'controlled-example']);

const GateResultSchema = z
  .object({
    decision: z.enum(['PASS', 'REVIEW_REQUIRED', 'REJECTED']),
    reasonCodes: z.array(z.string().min(1)).min(1),
  })
  .strict();

const GateInputsSchema = z
  .object({
    manifestValid: z.boolean(),
    enabled: z.boolean(),
    publicationMode: PublicationMode,
    evidenceClass: EvidenceClass,
    rawSha256: SHA256,
    normalizedSha256: SHA256,
    ambiguous: z.boolean(),
    diffRatio: z.number().min(0).max(1),
  })
  .strict();

const ProvenanceSchema = z
  .object({
    evidenceClass: EvidenceClass,
    publicationMode: PublicationMode,
    publisherName: z.string().min(1),
    sourceClass: z.enum(['official-primary', 'project-original-fixture']),
    extractionSelector: z.string().min(1),
    extractionContractId: z.string().regex(/^[a-z0-9-]+$/),
    normalizerId: z.string().regex(/^[a-z0-9-]+$/),
    diffStrategyId: z.string().regex(/^[a-z0-9-]+$/),
    schemaId: z.string().regex(/^[a-z0-9-]+$/),
  })
  .strict();

const SearchFactsSchema = z
  .object({
    kind: z.literal('search-status'),
    eventId: z.string().min(1),
    service: z.string().min(1),
    startedAt: z.string().min(1),
    status: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();
const WorkflowFactsSchema = z
  .object({
    kind: z.literal('workflow-experiment'),
    experimentId: z.string().min(1),
    taskFamily: z.string().min(1),
    fixtureId: z.string().min(1),
    expectedFields: z.array(z.string().min(1)),
    negativeConstraints: z.array(z.string().min(1)),
  })
  .strict();
const SkillFactsSchema = z
  .object({
    kind: z.literal('skill-inventory'),
    packageId: z.string().min(1),
    declaredLicense: z.string().min(1),
    manifestPresent: z.boolean(),
    declaredDependencies: z.array(z.string().min(1)),
    contentsSha256: SHA256,
    staticRiskFlags: z.array(z.string().min(1)),
  })
  .strict();
const PublicFactsSchema = z.discriminatedUnion('kind', [
  SearchFactsSchema,
  WorkflowFactsSchema,
  SkillFactsSchema,
]);

const CorrectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('original') }).strict(),
  z
    .object({ kind: z.literal('correction'), correctsReceiptId: SHA256 })
    .strict(),
]);

export const ReceiptPayloadSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
    siteId: SiteId,
    sourceId: z.string().regex(/^[a-z0-9-]+$/),
    observedAt: z.string().refine((value) => {
      try {
        return new Date(value).toISOString() === value;
      } catch {
        return false;
      }
    }, 'observedAt must be a canonical ISO timestamp'),
    sourceUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === 'https:'),
    manifestSha256: SHA256,
    rawSha256: SHA256,
    normalizedSha256: SHA256,
    rawObjectPath: z.string(),
    normalizedObjectPath: z.string(),
    sequence: z.number().int().positive(),
    predecessorReceiptId: SHA256.optional(),
    topicSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    provenance: ProvenanceSchema,
    publicFacts: PublicFactsSchema,
    interpretation: z.string().min(1),
    unknowns: z.array(z.string().min(1)).min(1),
    correction: CorrectionSchema,
    gateInputs: GateInputsSchema,
    policy: GateResultSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (
      payload.rawObjectPath !== `objects/raw/${payload.rawSha256}.bin` ||
      payload.normalizedObjectPath !==
        `objects/normalized/${payload.normalizedSha256}.json`
    ) {
      context.addIssue({
        code: 'custom',
        message: 'object paths must be content-addressed by their bound hashes',
      });
    }
    if (
      payload.gateInputs.rawSha256 !== payload.rawSha256 ||
      payload.gateInputs.normalizedSha256 !== payload.normalizedSha256 ||
      payload.gateInputs.publicationMode !==
        payload.provenance.publicationMode ||
      payload.gateInputs.evidenceClass !== payload.provenance.evidenceClass
    ) {
      context.addIssue({
        code: 'custom',
        message: 'receipt gate inputs do not match authenticated provenance',
      });
    }
    if (
      (payload.sequence === 1) !==
      (payload.predecessorReceiptId === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'sequence one must have no predecessor and later sequences must have one',
      });
    }
    const expectedFactKind = {
      'search-receipt': 'search-status',
      'workflow-test-lab': 'workflow-experiment',
      'skill-ledger': 'skill-inventory',
    } as const;
    if (payload.publicFacts.kind !== expectedFactKind[payload.siteId]) {
      context.addIssue({
        code: 'custom',
        message: 'public fact schema does not match receipt site',
      });
    }
    const controlled =
      payload.provenance.evidenceClass === 'controlled-example';
    if (
      controlled !==
        (payload.provenance.publicationMode === 'fixture-example') ||
      controlled !==
        (payload.provenance.sourceClass === 'project-original-fixture')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'controlled example provenance is internally inconsistent',
      });
    }
  });

export const ReceiptSchema = z
  .object({ id: SHA256, payload: ReceiptPayloadSchema })
  .strict();

export type ReceiptPayload = z.infer<typeof ReceiptPayloadSchema>;
export type ReceiptInput = Omit<ReceiptPayload, 'schemaVersion'>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type ReceiptPublicFacts = z.infer<typeof PublicFactsSchema>;
export type ReceiptProvenance = z.infer<typeof ProvenanceSchema>;

export type ReceiptIntegrityErrorCode =
  | 'RECEIPT_ID_FORMAT'
  | 'RECEIPT_SOURCE_HASH_FORMAT'
  | 'RECEIPT_PREDECESSOR_ID_FORMAT'
  | 'RECEIPT_SCHEMA_INVALID'
  | 'RECEIPT_BINDING_MISMATCH'
  | 'RECEIPT_POLICY_MISMATCH'
  | 'RECEIPT_PAYLOAD_DIGEST_MISMATCH';

export class ReceiptIntegrityError extends Error {
  readonly code: ReceiptIntegrityErrorCode;

  constructor(code: ReceiptIntegrityErrorCode, message: string) {
    super(message);
    this.name = 'ReceiptIntegrityError';
    this.code = code;
  }
}

function payloadDigest(payload: ReceiptPayload): string {
  return sha256(new TextEncoder().encode(canonicalJson(payload)));
}

export function createReceipt(input: ReceiptInput): Receipt {
  const payload = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    ...input,
  } as ReceiptPayload;
  return { id: payloadDigest(payload), payload };
}

export function verifyReceipt(input: unknown): Receipt {
  const result = ReceiptSchema.safeParse(input);
  if (!result.success) {
    const issuePaths = result.error.issues.map((issue) => issue.path.join('.'));
    if (issuePaths.some((path) => path === 'id')) {
      throw new ReceiptIntegrityError(
        'RECEIPT_ID_FORMAT',
        'Receipt ID must be a SHA-256 digest',
      );
    }
    if (issuePaths.some((path) => path.includes('predecessorReceiptId'))) {
      throw new ReceiptIntegrityError(
        'RECEIPT_PREDECESSOR_ID_FORMAT',
        'Predecessor receipt ID must be a lowercase hexadecimal SHA-256 digest',
      );
    }
    const sourceHashField = [
      'manifestSha256',
      'rawSha256',
      'normalizedSha256',
    ].find((field) => issuePaths.some((path) => path.endsWith(field)));
    if (sourceHashField !== undefined) {
      throw new ReceiptIntegrityError(
        'RECEIPT_SOURCE_HASH_FORMAT',
        `${sourceHashField.replace('Sha256', '')} SHA-256 must be a lowercase hexadecimal digest`,
      );
    }
    throw new ReceiptIntegrityError(
      'RECEIPT_SCHEMA_INVALID',
      `Receipt schema is invalid: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const receipt = result.data;
  const recomputedPolicy = evaluatePublication(receipt.payload.gateInputs);
  if (
    canonicalJson(recomputedPolicy) !== canonicalJson(receipt.payload.policy)
  ) {
    throw new ReceiptIntegrityError(
      'RECEIPT_POLICY_MISMATCH',
      'Receipt policy does not match recomputed gate inputs',
    );
  }
  if (
    receipt.payload.correction.kind === 'correction' &&
    receipt.payload.correction.correctsReceiptId === receipt.id
  ) {
    throw new ReceiptIntegrityError(
      'RECEIPT_BINDING_MISMATCH',
      'Receipt correction cannot refer to itself',
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
