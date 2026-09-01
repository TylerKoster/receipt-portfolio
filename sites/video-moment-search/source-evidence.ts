import { z } from 'zod';
import {
  sha256Utf8,
  validateVideoCorpus,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const nonBlank = z.string().refine((value) => value.trim().length > 0);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      value.trim() === value
    );
  });
const canonicalInstant = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
});
const strictDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
});
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const namedRole = z.object({ id: identifier, name: nonBlank }).strict();

export const VideoSourceEvidenceManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    manifestId: identifier,
    corpusId: identifier,
    records: z.array(
      z
        .object({
          manifestRecordId: identifier,
          evidenceId: identifier,
          bindings: z
            .object({
              corpusId: identifier,
              videoId: identifier,
              rightsGrantId: identifier,
              momentId: identifier,
              cueId: identifier,
            })
            .strict(),
          workTitle: nonBlank,
          roles: z
            .object({
              publisher: namedRole,
              uploader: namedRole,
              attributedCreator: namedRole,
              rightsAuthority: namedRole.extend({
                relationship: z.literal('named-licensor'),
              }),
              evidenceIssuer: namedRole,
            })
            .strict(),
          canonicalSourceEvidenceUrl: httpsUrl,
          immutableSourceEvidenceUrl: httpsUrl,
          license: z.object({ name: nonBlank, url: httpsUrl }).strict(),
          delivery: z
            .object({
              url: httpsUrl,
              mediaType: z.literal('video/webm'),
              byteLength: z.number().int().positive(),
              acceptRanges: z.literal('bytes'),
              durationSeconds: z.number().positive(),
            })
            .strict(),
          timestamp: z
            .object({
              strategy: z.literal('media-fragment'),
              seconds: z.number().int().nonnegative(),
              url: httpsUrl,
            })
            .strict(),
          historicalLicenseReview: z
            .object({
              issuer: nonBlank,
              reviewer: nonBlank,
              reviewedOn: strictDate,
              finding: nonBlank,
            })
            .strict(),
          observedStatus: z
            .object({
              status: z.literal('source-record-observed'),
              precision: z.literal('date'),
              observedOn: strictDate,
              normalizedAt: canonicalInstant,
              expiresAt: canonicalInstant,
              sourcePageRevisionId: z.string().regex(/^\d+$/u),
              sourcePageRevisionUrl: httpsUrl,
              sourcePageRevisionAt: canonicalInstant,
            })
            .strict(),
          annotation: z
            .object({
              kind: z.literal('original-editorial'),
              text: nonBlank,
              sha256,
            })
            .strict(),
          productBoundary: z
            .object({
              included: z.array(nonBlank).min(1),
              excluded: z.array(nonBlank).min(1),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict();

export type VideoSourceEvidenceManifest = z.infer<
  typeof VideoSourceEvidenceManifestSchema
>;
export type VideoSourceEvidenceRecord =
  VideoSourceEvidenceManifest['records'][number];
export type CommonsSourceRightsEvidence = VideoSourceEvidenceManifest;

export interface CommonsSourceEvidenceValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export const AI_MOMENT_INDEX_PUBLICATION_BOUNDARY_V1 = Object.freeze({
  policyId: 'ai-moment-index-publication-boundary-v1',
  included: Object.freeze(['timestamp link', 'original editorial annotation']),
  excluded: Object.freeze([
    'hosting',
    'embedding',
    'media distribution',
    'transcript distribution',
    'endorsement claim',
    'inferred permission',
  ]),
});

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function timestampUrl(sourceUrl: string, seconds: number): string {
  const url = new URL(sourceUrl);
  url.hash = `t=${seconds}`;
  return url.href;
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function addSetDiagnostics(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
  diagnostics: string[],
): void {
  for (const value of [...expected].sort()) {
    if (!actual.has(value)) {
      diagnostics.push(`SOURCE_EVIDENCE_RECORD_MISSING:${value}`);
    }
  }
  for (const value of [...actual].sort()) {
    if (!expected.has(value)) {
      diagnostics.push(`SOURCE_EVIDENCE_RECORD_EXTRA:${value}`);
    }
  }
}

export function parseVideoSourceEvidenceManifest(
  value: unknown,
): VideoSourceEvidenceManifest {
  return VideoSourceEvidenceManifestSchema.parse(value);
}

export function validateCommonsSourceEvidence(
  corpusValue: unknown,
  manifestValue: unknown,
  validationNow: Date = new Date(),
): CommonsSourceEvidenceValidation {
  const corpusValidation = validateVideoCorpus(corpusValue);
  if (!corpusValidation.ok) {
    return {
      ok: false,
      diagnostics: corpusValidation.diagnostics.map(
        (diagnostic) => `SOURCE_EVIDENCE_CORPUS_INVALID:${diagnostic}`,
      ),
    };
  }
  const parsedManifest =
    VideoSourceEvidenceManifestSchema.safeParse(manifestValue);
  if (!parsedManifest.success) {
    return {
      ok: false,
      diagnostics: [
        ...new Set(
          parsedManifest.error.issues.map(
            (issue) =>
              `SOURCE_EVIDENCE_SCHEMA_INVALID:${issue.path.join('.') || '<root>'}`,
          ),
        ),
      ].sort(),
    };
  }

  const corpus = corpusValue as VideoCorpus;
  const manifest = parsedManifest.data;
  const diagnostics: string[] = [];
  const nowMs = validationNow.getTime();
  if (Number.isNaN(nowMs)) {
    diagnostics.push('SOURCE_EVIDENCE_VALIDATION_CLOCK_INVALID');
  }
  if (manifest.corpusId !== corpus.corpusId) {
    diagnostics.push('SOURCE_EVIDENCE_MANIFEST_CORPUS_MISMATCH');
  }

  const videoEvidenceIds = corpus.videos.flatMap((video) =>
    video.reviewEvidenceId === undefined ? [] : [video.reviewEvidenceId],
  );
  const grantEvidenceIds = corpus.rights.flatMap((grant) =>
    grant.reviewEvidence === undefined ? [] : [grant.reviewEvidence.evidenceId],
  );
  const expectedEvidenceIds = new Set(videoEvidenceIds);
  const grantEvidenceSet = new Set(grantEvidenceIds);
  const manifestEvidenceIds = manifest.records.map(
    (record) => record.evidenceId,
  );
  const actualEvidenceIds = new Set(manifestEvidenceIds);

  for (const evidenceId of duplicates(videoEvidenceIds)) {
    diagnostics.push(`SOURCE_EVIDENCE_CORPUS_VIDEO_ID_DUPLICATE:${evidenceId}`);
  }
  for (const evidenceId of duplicates(grantEvidenceIds)) {
    diagnostics.push(`SOURCE_EVIDENCE_CORPUS_GRANT_ID_DUPLICATE:${evidenceId}`);
  }
  if (
    expectedEvidenceIds.size !== grantEvidenceSet.size ||
    [...expectedEvidenceIds].some(
      (evidenceId) => !grantEvidenceSet.has(evidenceId),
    )
  ) {
    diagnostics.push('SOURCE_EVIDENCE_CORPUS_REVIEW_SET_MISMATCH');
  }
  for (const grant of corpus.rights) {
    const review = grant.reviewEvidence;
    if (
      review !== undefined &&
      (!sameStrings(
        review.productBoundary.included,
        AI_MOMENT_INDEX_PUBLICATION_BOUNDARY_V1.included,
      ) ||
        !sameStrings(
          review.productBoundary.excluded,
          AI_MOMENT_INDEX_PUBLICATION_BOUNDARY_V1.excluded,
        ))
    ) {
      diagnostics.push(
        `SOURCE_EVIDENCE_CORPUS_PRODUCT_BOUNDARY_POLICY_MISMATCH:${review.evidenceId}`,
      );
    }
  }
  if (manifest.records.length !== expectedEvidenceIds.size) {
    diagnostics.push(
      `SOURCE_EVIDENCE_RECORD_CARDINALITY_MISMATCH:expected=${expectedEvidenceIds.size}:actual=${manifest.records.length}`,
    );
  }
  for (const evidenceId of duplicates(manifestEvidenceIds)) {
    diagnostics.push(`SOURCE_EVIDENCE_ID_DUPLICATE:${evidenceId}`);
  }
  for (const recordId of duplicates(
    manifest.records.map((record) => record.manifestRecordId),
  )) {
    diagnostics.push(`SOURCE_EVIDENCE_MANIFEST_ID_DUPLICATE:${recordId}`);
  }
  const bindingKeys = manifest.records.map((record) =>
    [
      record.bindings.corpusId,
      record.bindings.videoId,
      record.bindings.rightsGrantId,
      record.bindings.momentId,
      record.bindings.cueId,
    ].join('|'),
  );
  const duplicateBindingKeys = new Set(duplicates(bindingKeys));
  for (const record of manifest.records) {
    const bindingKey = [
      record.bindings.corpusId,
      record.bindings.videoId,
      record.bindings.rightsGrantId,
      record.bindings.momentId,
      record.bindings.cueId,
    ].join('|');
    if (duplicateBindingKeys.has(bindingKey)) {
      diagnostics.push(
        `SOURCE_EVIDENCE_BINDING_DUPLICATE:${record.evidenceId}`,
      );
    }
  }
  addSetDiagnostics(expectedEvidenceIds, actualEvidenceIds, diagnostics);

  for (const record of manifest.records) {
    const id = record.evidenceId;
    if (
      !sameStrings(
        record.productBoundary.included,
        AI_MOMENT_INDEX_PUBLICATION_BOUNDARY_V1.included,
      ) ||
      !sameStrings(
        record.productBoundary.excluded,
        AI_MOMENT_INDEX_PUBLICATION_BOUNDARY_V1.excluded,
      )
    ) {
      diagnostics.push(
        `SOURCE_EVIDENCE_MANIFEST_PRODUCT_BOUNDARY_POLICY_MISMATCH:${id}`,
      );
    }
    const video = corpus.videos.find(
      (candidate) => candidate.id === record.bindings.videoId,
    );
    const grant = corpus.rights.find(
      (candidate) => candidate.id === record.bindings.rightsGrantId,
    );
    const moment = corpus.moments.find(
      (candidate) => candidate.id === record.bindings.momentId,
    );
    const cue = corpus.cues.find(
      (candidate) => candidate.id === record.bindings.cueId,
    );
    const review = grant?.reviewEvidence;

    if (
      record.bindings.corpusId !== corpus.corpusId ||
      record.bindings.corpusId !== manifest.corpusId
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_CORPUS_BINDING_MISMATCH:${id}`);
    }
    if (video === undefined || video.reviewEvidenceId !== id) {
      diagnostics.push(`SOURCE_EVIDENCE_VIDEO_BINDING_MISMATCH:${id}`);
    }
    if (
      grant === undefined ||
      grant.basis !== 'explicit-license' ||
      review?.evidenceId !== id
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_GRANT_BINDING_MISMATCH:${id}`);
    }
    if (
      moment === undefined ||
      moment.videoId !== record.bindings.videoId ||
      moment.rightsGrantId !== record.bindings.rightsGrantId ||
      (moment.state !== 'active' && moment.state !== 'corrected')
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_MOMENT_BINDING_MISMATCH:${id}`);
    }
    if (
      cue === undefined ||
      cue.videoId !== record.bindings.videoId ||
      cue.evidenceKind !== 'editorial-annotation'
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_CUE_BINDING_MISMATCH:${id}`);
    }

    if (video !== undefined) {
      if (video.title !== record.workTitle) {
        diagnostics.push(`SOURCE_EVIDENCE_WORK_TITLE_MISMATCH:${id}`);
      }
      if (
        video.creatorId !== record.roles.attributedCreator.id ||
        video.creatorName !== record.roles.attributedCreator.name
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_ATTRIBUTION_MISMATCH:${id}`);
      }
      if (video.sourceUrl !== record.delivery.url) {
        diagnostics.push(`SOURCE_EVIDENCE_DELIVERY_URL_MISMATCH:${id}`);
      }
      if (
        Math.ceil(record.delivery.durationSeconds) !== video.durationSeconds
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_MEDIA_DURATION_MISMATCH:${id}`);
      }
      if (video.timestampStrategy !== record.timestamp.strategy) {
        diagnostics.push(`SOURCE_EVIDENCE_TIMESTAMP_STRATEGY_MISMATCH:${id}`);
      }
    }
    if (grant !== undefined) {
      if (
        grant.creatorId !== record.roles.rightsAuthority.id ||
        !sameStrings(grant.coveredVideoIds, [record.bindings.videoId]) ||
        !sameStrings(grant.coveredSourceUrls, [record.delivery.url]) ||
        !sameStrings(grant.coveredAnnotationHashes ?? [], [
          record.annotation.sha256,
        ])
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_GRANT_RELATIONSHIP_MISMATCH:${id}`);
      }
    }
    if (review !== undefined) {
      if (
        review.licenseIdentifier !== record.license.name ||
        review.licenseUrl !== record.license.url
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_LICENSE_MISMATCH:${id}`);
      }
      if (review.canonicalRightsPageUrl !== record.canonicalSourceEvidenceUrl) {
        diagnostics.push(`SOURCE_EVIDENCE_CANONICAL_SOURCE_MISMATCH:${id}`);
      }
      if (
        review.immutableRightsRevisionUrl !== record.immutableSourceEvidenceUrl
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_IMMUTABLE_SOURCE_MISMATCH:${id}`);
      }
      if (
        review.reviewer !== record.historicalLicenseReview.reviewer ||
        review.reviewedOn !== record.historicalLicenseReview.reviewedOn ||
        record.historicalLicenseReview.issuer !==
          record.roles.evidenceIssuer.name
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_HISTORICAL_REVIEW_MISMATCH:${id}`);
      }
      if (
        !sameStrings(
          review.productBoundary.included,
          record.productBoundary.included,
        ) ||
        !sameStrings(
          review.productBoundary.excluded,
          record.productBoundary.excluded,
        )
      ) {
        diagnostics.push(`SOURCE_EVIDENCE_PRODUCT_BOUNDARY_MISMATCH:${id}`);
      }
    }
    if (
      moment === undefined ||
      moment.startSeconds !== record.timestamp.seconds ||
      moment.excerpt !== record.annotation.text
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_MOMENT_CONTENT_MISMATCH:${id}`);
    }
    if (
      cue === undefined ||
      cue.startSeconds !== record.timestamp.seconds ||
      cue.endSeconds !== moment?.endSeconds ||
      cue.text !== record.annotation.text ||
      cue.contentSha256 !== record.annotation.sha256
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_CUE_CONTENT_MISMATCH:${id}`);
    }
    if (sha256Utf8(record.annotation.text) !== record.annotation.sha256) {
      diagnostics.push(`SOURCE_EVIDENCE_ANNOTATION_HASH_MISMATCH:${id}`);
    }
    if (
      timestampUrl(record.delivery.url, record.timestamp.seconds) !==
      record.timestamp.url
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_TIMESTAMP_URL_MISMATCH:${id}`);
    }

    const normalizedMs = new Date(record.observedStatus.normalizedAt).getTime();
    const expiresMs = new Date(record.observedStatus.expiresAt).getTime();
    const revisionMs = new Date(
      record.observedStatus.sourcePageRevisionAt,
    ).getTime();
    if (
      record.observedStatus.normalizedAt !==
      `${record.observedStatus.observedOn}T00:00:00.000Z`
    ) {
      diagnostics.push(
        `SOURCE_EVIDENCE_OBSERVATION_NORMALIZATION_MISMATCH:${id}`,
      );
    }
    if (normalizedMs > nowMs) {
      diagnostics.push(`SOURCE_EVIDENCE_OBSERVATION_FUTURE:${id}`);
    }
    if (nowMs >= expiresMs) {
      diagnostics.push(`SOURCE_EVIDENCE_OBSERVATION_EXPIRED:${id}`);
    }
    if (expiresMs <= normalizedMs) {
      diagnostics.push(`SOURCE_EVIDENCE_OBSERVATION_REVERSED:${id}`);
    }
    if (expiresMs - normalizedMs > 90 * 24 * 60 * 60 * 1000) {
      diagnostics.push(`SOURCE_EVIDENCE_OBSERVATION_WINDOW_TOO_LONG:${id}`);
    }
    if (revisionMs > normalizedMs) {
      diagnostics.push(`SOURCE_EVIDENCE_REVISION_AFTER_OBSERVATION:${id}`);
    }
    const canonicalUrl = new URL(record.canonicalSourceEvidenceUrl);
    const expectedRevision = new URL('/w/index.php', canonicalUrl);
    expectedRevision.searchParams.set(
      'title',
      canonicalUrl.pathname.replace('/wiki/', ''),
    );
    expectedRevision.searchParams.set(
      'oldid',
      record.observedStatus.sourcePageRevisionId,
    );
    const observedRevision = new URL(
      record.observedStatus.sourcePageRevisionUrl,
    );
    if (
      expectedRevision.origin !== observedRevision.origin ||
      expectedRevision.pathname !== observedRevision.pathname ||
      expectedRevision.searchParams.get('title') !==
        observedRevision.searchParams.get('title') ||
      expectedRevision.searchParams.get('oldid') !==
        observedRevision.searchParams.get('oldid') ||
      observedRevision.searchParams.size !== 2 ||
      observedRevision.hash !== ''
    ) {
      diagnostics.push(`SOURCE_EVIDENCE_OBSERVED_REVISION_URL_MISMATCH:${id}`);
    }
  }

  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return { ok: stableDiagnostics.length === 0, diagnostics: stableDiagnostics };
}
