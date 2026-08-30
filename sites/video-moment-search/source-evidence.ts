import { z } from 'zod';
import {
  sha256Utf8,
  validateVideoCorpus,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';

const nonBlank = z.string().refine((value) => value.trim().length > 0);
const httpsUrl = z
  .string()
  .url()
  .refine(
    (value) => value.trim().length > 0 && new URL(value).protocol === 'https:',
  );
const strictDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
});
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const CommonsSourceRightsEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceId: nonBlank,
    workTitle: nonBlank,
    attributionParty: nonBlank,
    canonicalRightsPageUrl: httpsUrl,
    immutableRightsRevisionUrl: httpsUrl,
    license: z
      .object({
        name: nonBlank,
        url: httpsUrl,
      })
      .strict(),
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
    reviewRecord: z
      .object({
        reviewer: nonBlank,
        reviewedOn: strictDate,
        finding: nonBlank,
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
  .strict();

export type CommonsSourceRightsEvidence = z.infer<
  typeof CommonsSourceRightsEvidenceSchema
>;

export interface CommonsSourceEvidenceValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

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

export function validateCommonsSourceEvidence(
  corpusValue: unknown,
  evidenceValue: unknown,
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
  const parsedCorpus = corpusValue as VideoCorpus;
  const parsedEvidence =
    CommonsSourceRightsEvidenceSchema.safeParse(evidenceValue);
  if (!parsedEvidence.success) {
    return {
      ok: false,
      diagnostics: [
        ...new Set(
          parsedEvidence.error.issues.map(
            (issue) =>
              `SOURCE_EVIDENCE_SCHEMA_INVALID:${issue.path.join('.') || '<root>'}`,
          ),
        ),
      ].sort(),
    };
  }

  const evidence = parsedEvidence.data;
  const diagnostics: string[] = [];
  const grants = parsedCorpus.rights.filter(
    (grant) => grant.reviewEvidence?.evidenceId === evidence.evidenceId,
  );
  const videos = parsedCorpus.videos.filter(
    (video) => video.reviewEvidenceId === evidence.evidenceId,
  );
  if (grants.length !== 1)
    diagnostics.push('SOURCE_EVIDENCE_GRANT_LINK_MISMATCH');
  if (videos.length !== 1)
    diagnostics.push('SOURCE_EVIDENCE_VIDEO_LINK_MISMATCH');

  const grant = grants[0];
  const video = videos[0];
  const review = grant?.reviewEvidence;
  if (review !== undefined) {
    if (review.licenseIdentifier !== evidence.license.name)
      diagnostics.push('SOURCE_EVIDENCE_LICENSE_NAME_MISMATCH');
    if (review.licenseUrl !== evidence.license.url)
      diagnostics.push('SOURCE_EVIDENCE_LICENSE_URL_MISMATCH');
    if (review.canonicalRightsPageUrl !== evidence.canonicalRightsPageUrl)
      diagnostics.push('SOURCE_EVIDENCE_CANONICAL_RIGHTS_MISMATCH');
    if (
      review.immutableRightsRevisionUrl !== evidence.immutableRightsRevisionUrl
    )
      diagnostics.push('SOURCE_EVIDENCE_IMMUTABLE_RIGHTS_MISMATCH');
    if (review.reviewer !== evidence.reviewRecord.reviewer)
      diagnostics.push('SOURCE_EVIDENCE_REVIEWER_MISMATCH');
    if (review.reviewedOn !== evidence.reviewRecord.reviewedOn)
      diagnostics.push('SOURCE_EVIDENCE_REVIEW_DATE_MISMATCH');
    if (
      !sameStrings(
        review.productBoundary.included,
        evidence.productBoundary.included,
      )
    )
      diagnostics.push('SOURCE_EVIDENCE_INCLUDED_USES_MISMATCH');
    if (
      !sameStrings(
        review.productBoundary.excluded,
        evidence.productBoundary.excluded,
      )
    )
      diagnostics.push('SOURCE_EVIDENCE_EXCLUDED_USES_MISMATCH');
  }

  if (video !== undefined && grant !== undefined) {
    if (video.title !== evidence.workTitle)
      diagnostics.push('SOURCE_EVIDENCE_WORK_TITLE_MISMATCH');
    if (video.creatorName !== evidence.attributionParty)
      diagnostics.push('SOURCE_EVIDENCE_ATTRIBUTION_MISMATCH');
    if (video.sourceUrl !== evidence.delivery.url)
      diagnostics.push('SOURCE_EVIDENCE_DELIVERY_URL_MISMATCH');
    if (Math.ceil(evidence.delivery.durationSeconds) !== video.durationSeconds)
      diagnostics.push('SOURCE_EVIDENCE_MEDIA_DURATION_MISMATCH');
    if (video.timestampStrategy !== evidence.timestamp.strategy)
      diagnostics.push('SOURCE_EVIDENCE_TIMESTAMP_STRATEGY_MISMATCH');
    if (!grant.coveredVideoIds.includes(video.id))
      diagnostics.push('SOURCE_EVIDENCE_GRANT_VIDEO_MISMATCH');
    if (!grant.coveredSourceUrls.includes(evidence.delivery.url))
      diagnostics.push('SOURCE_EVIDENCE_GRANT_SOURCE_MISMATCH');
    if (grant.revocationContact !== evidence.canonicalRightsPageUrl)
      diagnostics.push('SOURCE_EVIDENCE_GRANT_RIGHTS_PAGE_MISMATCH');

    const moments = parsedCorpus.moments.filter(
      (moment) =>
        moment.videoId === video.id &&
        moment.rightsGrantId === grant.id &&
        moment.startSeconds === evidence.timestamp.seconds,
    );
    if (moments.length !== 1)
      diagnostics.push('SOURCE_EVIDENCE_MOMENT_LINK_MISMATCH');
    const moment = moments[0];
    if (moment !== undefined && moment.excerpt !== evidence.annotation.text)
      diagnostics.push('SOURCE_EVIDENCE_EXCERPT_MISMATCH');

    const cues = parsedCorpus.cues.filter(
      (cue) =>
        cue.videoId === video.id &&
        cue.startSeconds <= evidence.timestamp.seconds &&
        cue.endSeconds > evidence.timestamp.seconds &&
        cue.evidenceKind === 'editorial-annotation' &&
        cue.text === evidence.annotation.text &&
        cue.contentSha256 === evidence.annotation.sha256,
    );
    if (cues.length !== 1)
      diagnostics.push('SOURCE_EVIDENCE_ANNOTATION_LINK_MISMATCH');
    if (!grant.coveredAnnotationHashes?.includes(evidence.annotation.sha256))
      diagnostics.push('SOURCE_EVIDENCE_GRANT_ANNOTATION_MISMATCH');
  }

  if (sha256Utf8(evidence.annotation.text) !== evidence.annotation.sha256)
    diagnostics.push('SOURCE_EVIDENCE_ANNOTATION_HASH_MISMATCH');
  const expectedFinding = `Confirmed availability under ${evidence.license.name} on the review date.`;
  if (evidence.reviewRecord.finding !== expectedFinding)
    diagnostics.push('SOURCE_EVIDENCE_REVIEW_FINDING_MISMATCH');
  if (
    timestampUrl(evidence.delivery.url, evidence.timestamp.seconds) !==
    evidence.timestamp.url
  )
    diagnostics.push('SOURCE_EVIDENCE_TIMESTAMP_URL_MISMATCH');

  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return { ok: stableDiagnostics.length === 0, diagnostics: stableDiagnostics };
}
