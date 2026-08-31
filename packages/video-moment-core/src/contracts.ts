import { createHash } from 'node:crypto';
import { z } from 'zod';

const identifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const canonicalTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface VideoMoment {
  readonly id: string;
  readonly videoId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly excerpt: string;
  readonly topicSlugs: readonly string[];
  readonly state: 'active' | 'corrected' | 'removed' | 'quarantined';
  readonly rightsGrantId: string;
  readonly correctsMomentId?: string;
}

export interface VideoRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly sourceUrl: string;
  readonly durationSeconds: number;
  readonly timestampStrategy?: 'query-parameter' | 'media-fragment';
  readonly reviewEvidenceId?: string;
}

export interface ReviewedSourceEvidence {
  readonly classification: 'reviewed-public-source';
  readonly evidenceId: string;
  readonly licenseIdentifier: string;
  readonly licenseUrl: string;
  readonly canonicalRightsPageUrl: string;
  readonly immutableRightsRevisionUrl: string;
  readonly reviewer: string;
  readonly reviewedOn: string;
  readonly productBoundary: {
    readonly included: readonly string[];
    readonly excluded: readonly string[];
  };
}

function nonBlankText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isStrictCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function isReviewedSourceEvidenceSubstantive(
  value: unknown,
): value is ReviewedSourceEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Partial<ReviewedSourceEvidence>;
  return (
    review.classification === 'reviewed-public-source' &&
    nonBlankText(review.evidenceId) &&
    nonBlankText(review.licenseIdentifier) &&
    nonBlankText(review.licenseUrl) &&
    nonBlankText(review.canonicalRightsPageUrl) &&
    nonBlankText(review.immutableRightsRevisionUrl) &&
    nonBlankText(review.reviewer) &&
    isStrictCalendarDate(review.reviewedOn) &&
    typeof review.productBoundary === 'object' &&
    review.productBoundary !== null &&
    Array.isArray(review.productBoundary.included) &&
    Array.isArray(review.productBoundary.excluded) &&
    review.productBoundary.included.length > 0 &&
    review.productBoundary.excluded.length > 0 &&
    review.productBoundary.included.every(nonBlankText) &&
    review.productBoundary.excluded.every(nonBlankText)
  );
}

export interface RightsGrant {
  readonly id: string;
  readonly creatorId: string;
  readonly basis:
    | 'creator-supplied'
    | 'creator-authorized'
    | 'public-domain'
    | 'explicit-license';
  readonly coveredVideoIds: readonly string[];
  readonly coveredSourceUrls: readonly string[];
  readonly coveredCaptionHashes: readonly string[];
  readonly coveredAnnotationHashes?: readonly string[];
  readonly allowedUses: {
    commercialUse: boolean;
    excerpts: boolean;
    timestampLinks: boolean;
  };
  readonly maxExcerptCharacters: number;
  readonly licenseNote: string;
  readonly permissionVerifiedAt: string;
  readonly expiresAt: string;
  readonly revocationContact: string;
  readonly reviewEvidence?: ReviewedSourceEvidence;
}

export interface TimedCue {
  readonly id: string;
  readonly videoId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
  readonly evidenceKind?: 'caption' | 'editorial-annotation';
  readonly captionSha256?: string;
  readonly contentSha256?: string;
}

export interface VideoCorpus {
  readonly corpusId: string;
  readonly label: string;
  readonly videos: readonly VideoRecord[];
  readonly rights: readonly RightsGrant[];
  readonly cues: readonly TimedCue[];
  readonly moments: readonly VideoMoment[];
}

export interface VideoCorpusValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

const IdentifierSchema = z.string().min(1);
const VideoRecordSchema = z
  .object({
    id: IdentifierSchema,
    slug: IdentifierSchema,
    title: z.string().min(1),
    creatorId: IdentifierSchema,
    creatorName: z.string().min(1),
    sourceUrl: z.string().min(1),
    durationSeconds: z.number(),
    timestampStrategy: z.enum(['query-parameter', 'media-fragment']).optional(),
    reviewEvidenceId: IdentifierSchema.optional(),
  })
  .strict();

const RightsGrantSchema = z
  .object({
    id: IdentifierSchema,
    creatorId: IdentifierSchema,
    basis: z.string(),
    coveredVideoIds: z.array(IdentifierSchema),
    coveredSourceUrls: z.array(z.string().min(1)),
    coveredCaptionHashes: z.array(z.string().min(1)),
    coveredAnnotationHashes: z.array(z.string().min(1)).optional(),
    allowedUses: z
      .object({
        commercialUse: z.boolean(),
        excerpts: z.boolean(),
        timestampLinks: z.boolean(),
      })
      .strict(),
    maxExcerptCharacters: z.number(),
    licenseNote: z.string().min(1),
    permissionVerifiedAt: z.string().min(1),
    expiresAt: z.string().min(1),
    revocationContact: z.string().min(1),
    reviewEvidence: z
      .object({
        classification: z.literal('reviewed-public-source'),
        evidenceId: IdentifierSchema,
        licenseIdentifier: z.string().min(1),
        licenseUrl: z.string().min(1),
        canonicalRightsPageUrl: z.string().min(1),
        immutableRightsRevisionUrl: z.string().min(1),
        reviewer: z.string().min(1),
        reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        productBoundary: z
          .object({
            included: z.array(z.string().min(1)).min(1),
            excluded: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      })
      .strict()
      .refine(isReviewedSourceEvidenceSubstantive)
      .optional(),
  })
  .strict();

const TimedCueSchema = z
  .object({
    id: IdentifierSchema,
    videoId: IdentifierSchema,
    startSeconds: z.number(),
    endSeconds: z.number(),
    text: z.string().min(1),
    evidenceKind: z.enum(['caption', 'editorial-annotation']).optional(),
    captionSha256: z.string().min(1).optional(),
    contentSha256: z.string().min(1).optional(),
  })
  .strict();

const VideoMomentSchema = z
  .object({
    id: IdentifierSchema,
    videoId: IdentifierSchema,
    startSeconds: z.number(),
    endSeconds: z.number(),
    excerpt: z.string().min(1),
    topicSlugs: z.array(IdentifierSchema).min(1),
    state: z.string(),
    rightsGrantId: IdentifierSchema,
    correctsMomentId: IdentifierSchema.optional(),
  })
  .strict();

export const VideoCorpusSchema = z
  .object({
    corpusId: IdentifierSchema,
    label: z.string().min(1),
    videos: z.array(VideoRecordSchema),
    rights: z.array(RightsGrantSchema),
    cues: z.array(TimedCueSchema),
    moments: z.array(VideoMomentSchema),
  })
  .strict();

function isIdentifier(value: string): boolean {
  return identifierPattern.test(value);
}

function isCanonicalSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.href === value
    );
  } catch {
    return false;
  }
}

function isCanonicalTimestamp(value: string): boolean {
  if (!canonicalTimestampPattern.test(value)) return false;
  return new Date(value).toISOString() === value;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function validTiming(startSeconds: number, endSeconds: number): boolean {
  return (
    Number.isInteger(startSeconds) &&
    Number.isInteger(endSeconds) &&
    startSeconds >= 0 &&
    endSeconds >= 0 &&
    startSeconds < endSeconds
  );
}

function addDuplicateDiagnostic(
  values: readonly { readonly id: string }[],
  prefix: string,
  diagnostics: string[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) diagnostics.push(`${prefix}:${value.id}`);
    else seen.add(value.id);
  }
}

function addInvalidIdentifierDiagnostic(
  value: string,
  prefix: string,
  diagnostics: string[],
): void {
  if (!isIdentifier(value)) diagnostics.push(`${prefix}:${value}`);
}

export function validateVideoCorpus(value: unknown): VideoCorpusValidation {
  const parsed = VideoCorpusSchema.safeParse(value);
  if (!parsed.success) {
    const diagnostics = [
      ...new Set(
        parsed.error.issues.map(
          (issue) =>
            `CORPUS_SCHEMA_INVALID:${issue.path.join('.') || '<root>'}`,
        ),
      ),
    ].sort();
    return { ok: false, diagnostics };
  }

  const corpus = parsed.data;
  const diagnostics: string[] = [];
  addInvalidIdentifierDiagnostic(
    corpus.corpusId,
    'CORPUS_ID_INVALID',
    diagnostics,
  );
  addDuplicateDiagnostic(corpus.videos, 'VIDEO_ID_DUPLICATE', diagnostics);
  addDuplicateDiagnostic(
    corpus.videos.map((video) => ({ id: video.slug })),
    'VIDEO_SLUG_DUPLICATE',
    diagnostics,
  );
  addDuplicateDiagnostic(corpus.rights, 'RIGHTS_ID_DUPLICATE', diagnostics);
  addDuplicateDiagnostic(corpus.cues, 'CUE_ID_DUPLICATE', diagnostics);
  addDuplicateDiagnostic(corpus.moments, 'MOMENT_ID_DUPLICATE', diagnostics);

  const videosById = new Map(corpus.videos.map((video) => [video.id, video]));
  const rightsById = new Map(corpus.rights.map((grant) => [grant.id, grant]));
  const momentsById = new Map(
    corpus.moments.map((moment) => [moment.id, moment]),
  );
  const cuesByVideoId = new Map<string, TimedCue[]>();

  for (const video of corpus.videos) {
    addInvalidIdentifierDiagnostic(video.id, 'VIDEO_ID_INVALID', diagnostics);
    addInvalidIdentifierDiagnostic(
      video.slug,
      'VIDEO_SLUG_INVALID',
      diagnostics,
    );
    addInvalidIdentifierDiagnostic(
      video.creatorId,
      'VIDEO_CREATOR_ID_INVALID',
      diagnostics,
    );
    if (!isCanonicalSourceUrl(video.sourceUrl))
      diagnostics.push(`VIDEO_SOURCE_URL_INVALID:${video.id}`);
    if (
      !Number.isInteger(video.durationSeconds) ||
      video.durationSeconds <= 0
    ) {
      diagnostics.push(`VIDEO_DURATION_INVALID:${video.id}`);
    }
    if (video.reviewEvidenceId !== undefined) {
      addInvalidIdentifierDiagnostic(
        video.reviewEvidenceId,
        'VIDEO_REVIEW_EVIDENCE_ID_INVALID',
        diagnostics,
      );
    }
  }

  for (const grant of corpus.rights) {
    addInvalidIdentifierDiagnostic(grant.id, 'RIGHTS_ID_INVALID', diagnostics);
    addInvalidIdentifierDiagnostic(
      grant.creatorId,
      'RIGHTS_CREATOR_ID_INVALID',
      diagnostics,
    );
    if (
      ![
        'creator-supplied',
        'creator-authorized',
        'public-domain',
        'explicit-license',
      ].includes(grant.basis)
    ) {
      diagnostics.push(`RIGHTS_BASIS_INVALID:${grant.id}`);
    }
    if (
      grant.coveredVideoIds.length === 0 ||
      grant.coveredSourceUrls.length === 0 ||
      (grant.coveredCaptionHashes.length === 0 &&
        (grant.coveredAnnotationHashes?.length ?? 0) === 0)
    ) {
      diagnostics.push(`RIGHTS_COVERAGE_INVALID:${grant.id}`);
    }
    if (
      !Number.isInteger(grant.maxExcerptCharacters) ||
      grant.maxExcerptCharacters <= 0
    ) {
      diagnostics.push(`RIGHTS_EXCERPT_LIMIT_INVALID:${grant.id}`);
    }
    if (!isCanonicalTimestamp(grant.expiresAt))
      diagnostics.push(`RIGHTS_EXPIRY_INVALID:${grant.id}`);
    else if (new Date(grant.expiresAt).getTime() <= Date.now())
      diagnostics.push(`RIGHTS_GRANT_EXPIRED:${grant.id}`);
    if (!isCanonicalTimestamp(grant.permissionVerifiedAt))
      diagnostics.push(`RIGHTS_PERMISSION_VERIFICATION_INVALID:${grant.id}`);
    for (const sourceUrl of grant.coveredSourceUrls) {
      if (!isCanonicalSourceUrl(sourceUrl))
        diagnostics.push(`RIGHTS_SOURCE_URL_INVALID:${grant.id}`);
    }
    for (const captionHash of grant.coveredCaptionHashes) {
      if (!sha256Pattern.test(captionHash))
        diagnostics.push(`RIGHTS_CAPTION_HASH_INVALID:${grant.id}`);
    }
    for (const annotationHash of grant.coveredAnnotationHashes ?? []) {
      if (!sha256Pattern.test(annotationHash))
        diagnostics.push(`RIGHTS_ANNOTATION_HASH_INVALID:${grant.id}`);
    }
    if (grant.reviewEvidence !== undefined) {
      const review = grant.reviewEvidence;
      addInvalidIdentifierDiagnostic(
        review.evidenceId,
        'RIGHTS_REVIEW_EVIDENCE_ID_INVALID',
        diagnostics,
      );
      for (const [label, url] of [
        ['LICENSE_URL', review.licenseUrl],
        ['CANONICAL_RIGHTS_URL', review.canonicalRightsPageUrl],
        ['IMMUTABLE_RIGHTS_URL', review.immutableRightsRevisionUrl],
      ] as const) {
        if (!isHttpsUrl(url))
          diagnostics.push(`RIGHTS_REVIEW_${label}_INVALID:${grant.id}`);
      }
      const expectedLicenseNote = `${review.licenseIdentifier}; ${review.productBoundary.included.join(' plus ')} only; no inferred permission or endorsement.`;
      if (grant.licenseNote !== expectedLicenseNote) {
        diagnostics.push(`RIGHTS_REVIEW_LICENSE_NOTE_MISMATCH:${grant.id}`);
      }
      if (!grant.permissionVerifiedAt.startsWith(`${review.reviewedOn}T`)) {
        diagnostics.push(`RIGHTS_REVIEW_DATE_MISMATCH:${grant.id}`);
      }
    }
  }

  for (const cue of corpus.cues) {
    addInvalidIdentifierDiagnostic(cue.id, 'CUE_ID_INVALID', diagnostics);
    const video = videosById.get(cue.videoId);
    if (!video) diagnostics.push(`CUE_VIDEO_LINK_INVALID:${cue.id}`);
    if (!validTiming(cue.startSeconds, cue.endSeconds))
      diagnostics.push(`CUE_TIMING_INVALID:${cue.id}`);
    else if (video && cue.endSeconds > video.durationSeconds)
      diagnostics.push(`CUE_OUTSIDE_VIDEO:${cue.id}`);
    const evidenceKind = cue.evidenceKind ?? 'caption';
    if (evidenceKind === 'caption') {
      if (
        cue.captionSha256 === undefined ||
        !sha256Pattern.test(cue.captionSha256)
      ) {
        diagnostics.push(`CUE_CAPTION_HASH_INVALID:${cue.id}`);
      }
      if (cue.contentSha256 !== undefined)
        diagnostics.push(`CUE_EVIDENCE_FIELDS_INVALID:${cue.id}`);
    } else {
      if (
        cue.contentSha256 === undefined ||
        !sha256Pattern.test(cue.contentSha256)
      ) {
        diagnostics.push(`CUE_ANNOTATION_HASH_INVALID:${cue.id}`);
      }
      if (cue.captionSha256 !== undefined)
        diagnostics.push(`CUE_EVIDENCE_FIELDS_INVALID:${cue.id}`);
    }
    const videoCues = cuesByVideoId.get(cue.videoId) ?? [];
    videoCues.push(cue);
    cuesByVideoId.set(cue.videoId, videoCues);
  }

  for (const moment of corpus.moments) {
    addInvalidIdentifierDiagnostic(moment.id, 'MOMENT_ID_INVALID', diagnostics);
    const video = videosById.get(moment.videoId);
    if (!video) diagnostics.push(`MOMENT_VIDEO_LINK_INVALID:${moment.id}`);
    if (!validTiming(moment.startSeconds, moment.endSeconds))
      diagnostics.push(`MOMENT_TIMING_INVALID:${moment.id}`);
    else if (video && moment.endSeconds > video.durationSeconds)
      diagnostics.push(`MOMENT_OUTSIDE_VIDEO:${moment.id}`);

    if (new Set(moment.topicSlugs).size !== moment.topicSlugs.length)
      diagnostics.push(`MOMENT_TOPIC_DUPLICATE:${moment.id}`);
    for (const topicSlug of moment.topicSlugs) {
      addInvalidIdentifierDiagnostic(
        topicSlug,
        'MOMENT_TOPIC_INVALID',
        diagnostics,
      );
    }
    if (
      !['active', 'corrected', 'removed', 'quarantined'].includes(moment.state)
    )
      diagnostics.push(`MOMENT_STATE_INVALID:${moment.id}`);

    if (moment.state === 'corrected' && !moment.correctsMomentId)
      diagnostics.push(`MOMENT_CORRECTION_TARGET_REQUIRED:${moment.id}`);
    if (moment.state !== 'corrected' && moment.correctsMomentId)
      diagnostics.push(`MOMENT_CORRECTION_RELATION_INVALID:${moment.id}`);
    if (
      moment.correctsMomentId &&
      (moment.correctsMomentId === moment.id ||
        !momentsById.has(moment.correctsMomentId))
    ) {
      diagnostics.push(`MOMENT_CORRECTION_TARGET_INVALID:${moment.id}`);
    }

    const coveringCues = (cuesByVideoId.get(moment.videoId) ?? []).filter(
      (cue) =>
        cue.startSeconds <= moment.startSeconds &&
        cue.endSeconds >= moment.endSeconds,
    );
    if (coveringCues.length === 0)
      diagnostics.push(`MOMENT_OUTSIDE_CAPTIONS:${moment.id}`);

    const grant = rightsById.get(moment.rightsGrantId);
    if (!grant) {
      diagnostics.push(`MOMENT_RIGHTS_GRANT_INVALID:${moment.id}`);
      continue;
    }
    if (!grant.coveredVideoIds.includes(moment.videoId))
      diagnostics.push(`RIGHTS_VIDEO_NOT_COVERED:${moment.id}`);
    if (video && grant.creatorId !== video.creatorId)
      diagnostics.push(`RIGHTS_CREATOR_NOT_ATTRIBUTABLE:${moment.id}`);
    if (video && !grant.coveredSourceUrls.includes(video.sourceUrl))
      diagnostics.push(`RIGHTS_SOURCE_URL_NOT_COVERED:${moment.id}`);
    if (
      video &&
      (video.reviewEvidenceId !== undefined ||
        grant.reviewEvidence !== undefined) &&
      video.reviewEvidenceId !== grant.reviewEvidence?.evidenceId
    ) {
      diagnostics.push(`RIGHTS_REVIEW_EVIDENCE_NOT_BOUND:${moment.id}`);
    }
    const momentEvidence = coveringCues.map((cue) => ({
      hash:
        (cue.evidenceKind ?? 'caption') === 'caption'
          ? cue.captionSha256
          : cue.contentSha256,
      kind: cue.evidenceKind ?? 'caption',
      cue,
    }));
    if (
      momentEvidence.length === 0 ||
      !momentEvidence.every(
        (evidence) =>
          evidence.hash !== undefined &&
          (evidence.kind === 'caption'
            ? grant.coveredCaptionHashes.includes(evidence.hash)
            : (grant.coveredAnnotationHashes ?? []).includes(evidence.hash)),
      )
    ) {
      diagnostics.push(`RIGHTS_EVIDENCE_NOT_COVERED:${moment.id}`);
    }
    if (grant.reviewEvidence !== undefined) {
      for (const evidence of momentEvidence) {
        if (evidence.hash !== sha256Utf8(evidence.cue.text)) {
          diagnostics.push(`CUE_REVIEW_TEXT_HASH_MISMATCH:${evidence.cue.id}`);
        }
      }
      const excerptIsBound = momentEvidence.some(
        (evidence) =>
          evidence.hash === sha256Utf8(evidence.cue.text) &&
          evidence.cue.text === moment.excerpt &&
          (evidence.kind === 'caption'
            ? grant.coveredCaptionHashes.includes(evidence.hash)
            : (grant.coveredAnnotationHashes ?? []).includes(evidence.hash)),
      );
      if (!excerptIsBound) {
        diagnostics.push(`MOMENT_REVIEW_EXCERPT_NOT_BOUND:${moment.id}`);
      }
    }
    if (!grant.allowedUses.commercialUse)
      diagnostics.push(`RIGHTS_COMMERCIAL_USE_NOT_ALLOWED:${moment.id}`);
    if (!grant.allowedUses.excerpts)
      diagnostics.push(`RIGHTS_EXCERPT_NOT_ALLOWED:${moment.id}`);
    if (!grant.allowedUses.timestampLinks)
      diagnostics.push(`RIGHTS_TIMESTAMP_LINK_NOT_ALLOWED:${moment.id}`);
    if (moment.excerpt.length > grant.maxExcerptCharacters)
      diagnostics.push(`MOMENT_EXCERPT_EXCEEDS_RIGHTS_LIMIT:${moment.id}`);
  }

  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return { ok: stableDiagnostics.length === 0, diagnostics: stableDiagnostics };
}
