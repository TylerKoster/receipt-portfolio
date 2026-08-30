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
}

export interface TimedCue {
  readonly id: string;
  readonly videoId: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
  readonly captionSha256: string;
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
  })
  .strict();

const TimedCueSchema = z
  .object({
    id: IdentifierSchema,
    videoId: IdentifierSchema,
    startSeconds: z.number(),
    endSeconds: z.number(),
    text: z.string().min(1),
    captionSha256: z.string().min(1),
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
      grant.coveredCaptionHashes.length === 0
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
  }

  for (const cue of corpus.cues) {
    addInvalidIdentifierDiagnostic(cue.id, 'CUE_ID_INVALID', diagnostics);
    const video = videosById.get(cue.videoId);
    if (!video) diagnostics.push(`CUE_VIDEO_LINK_INVALID:${cue.id}`);
    if (!validTiming(cue.startSeconds, cue.endSeconds))
      diagnostics.push(`CUE_TIMING_INVALID:${cue.id}`);
    else if (video && cue.endSeconds > video.durationSeconds)
      diagnostics.push(`CUE_OUTSIDE_VIDEO:${cue.id}`);
    if (!sha256Pattern.test(cue.captionSha256))
      diagnostics.push(`CUE_CAPTION_HASH_INVALID:${cue.id}`);
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

    const coveredCue = (cuesByVideoId.get(moment.videoId) ?? []).some(
      (cue) =>
        cue.startSeconds <= moment.startSeconds &&
        cue.endSeconds >= moment.endSeconds,
    );
    if (!coveredCue) diagnostics.push(`MOMENT_OUTSIDE_CAPTIONS:${moment.id}`);

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
    const momentCaptionHashes = (cuesByVideoId.get(moment.videoId) ?? [])
      .filter(
        (cue) =>
          cue.startSeconds <= moment.startSeconds &&
          cue.endSeconds >= moment.endSeconds,
      )
      .map((cue) => cue.captionSha256);
    if (
      momentCaptionHashes.length === 0 ||
      !momentCaptionHashes.every((hash) =>
        grant.coveredCaptionHashes.includes(hash),
      )
    ) {
      diagnostics.push(`RIGHTS_CAPTION_NOT_COVERED:${moment.id}`);
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
