import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateVideoCorpus, type VideoCorpus } from './index.js';

const validCorpus: VideoCorpus = {
  corpusId: 'authorized-ai-video-local-test-v1',
  label:
    'LOCAL TEST FIXTURE ONLY — NO CREATOR AUTHORIZATION, DEMAND, OR PRODUCTION MEDIA',
  videos: [
    {
      id: 'video-agent-evals',
      slug: 'agent-evals',
      title: 'Local Test: Agent Evaluation Mechanics',
      creatorId: 'local-test-creator',
      creatorName: 'Local Test Creator',
      sourceUrl: 'https://video.example/watch/agent-evals',
      durationSeconds: 300,
    },
  ],
  rights: [
    {
      id: 'rights-local-test-video',
      creatorId: 'local-test-creator',
      basis: 'explicit-license',
      coveredVideoIds: ['video-agent-evals'],
      coveredSourceUrls: ['https://video.example/watch/agent-evals'],
      coveredCaptionHashes: [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ],
      allowedUses: {
        commercialUse: true,
        excerpts: true,
        timestampLinks: true,
      },
      maxExcerptCharacters: 280,
      licenseNote:
        'LOCAL TEST LICENSE ONLY — no creator authorization, demand, or production media is asserted.',
      permissionVerifiedAt: '2026-08-30T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revocationContact: 'local-test@example.invalid',
    },
  ],
  cues: [
    {
      id: 'cue-agent-evals',
      videoId: 'video-agent-evals',
      startSeconds: 120,
      endSeconds: 200,
      text: 'Local test caption coverage for agent evaluation mechanics.',
      captionSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  ],
  moments: [
    {
      id: 'moment-agent-evals',
      videoId: 'video-agent-evals',
      startSeconds: 132,
      endSeconds: 188,
      excerpt: 'Local test excerpt for agent evaluation mechanics.',
      topicSlugs: ['agent-evaluation'],
      state: 'active',
      rightsGrantId: 'rights-local-test-video',
    },
  ],
};

type Mutable<Value> = {
  -readonly [Key in keyof Value]: Mutable<Value[Key]>;
};

function cloneValidCorpus(): Mutable<VideoCorpus> {
  return structuredClone(validCorpus) as Mutable<VideoCorpus>;
}

function cloneReviewedCorpus(): Mutable<VideoCorpus> {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/video-moment-search/authorized-ai-video-v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Mutable<VideoCorpus>;
}

describe('rights-bound video corpus contracts', () => {
  it('accepts the committed local test-only rights-cleared fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/video-moment-search/authorized-ai-video-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as unknown;

    expect(validateVideoCorpus(fixture)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('accepts a complete local test-only rights-cleared corpus', () => {
    expect(validateVideoCorpus(validCorpus)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('rejects semantically blank or impossible reviewed-source evidence', () => {
    const invalidEvidence: readonly [
      string,
      (candidate: Mutable<VideoCorpus>) => void,
    ][] = [
      [
        'blank evidence ID',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.evidenceId = '   '),
      ],
      [
        'blank license identifier',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.licenseIdentifier = '   '),
      ],
      [
        'blank reviewer',
        (candidate) => (candidate.rights[0]!.reviewEvidence!.reviewer = '\t'),
      ],
      [
        'impossible review date',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.reviewedOn = '2022-02-30'),
      ],
      [
        'empty included uses',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.included = []),
      ],
      [
        'empty excluded uses',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.excluded = []),
      ],
      [
        'blank included use',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.included = [
            '   ',
          ]),
      ],
      [
        'blank excluded use',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.excluded = [
            '\t',
          ]),
      ],
    ];

    for (const [name, invalidate] of invalidEvidence) {
      const candidate = cloneReviewedCorpus();
      invalidate(candidate);
      expect(validateVideoCorpus(candidate).ok, name).toBe(false);
    }
  });

  it('recomputes reviewed cue hashes and binds excerpts to accepted cue text', () => {
    const cueDrift = cloneReviewedCorpus();
    cueDrift.cues[0]!.text = `${cueDrift.cues[0]!.text} unsupported drift`;
    expect(validateVideoCorpus(cueDrift).diagnostics).toContain(
      'CUE_REVIEW_TEXT_HASH_MISMATCH:annotation-robots-control-132',
    );

    const excerptDrift = cloneReviewedCorpus();
    excerptDrift.moments[0]!.excerpt = 'Unsupported standalone 02:12 claim.';
    expect(validateVideoCorpus(excerptDrift).diagnostics).toContain(
      'MOMENT_REVIEW_EXCERPT_NOT_BOUND:moment-robots-control',
    );
  });

  it('rejects a moment whose exact source timestamp is not rights-covered', () => {
    const candidate = cloneValidCorpus();
    candidate.rights[0]!.allowedUses.timestampLinks = false;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'RIGHTS_TIMESTAMP_LINK_NOT_ALLOWED:moment-agent-evals',
    );
  });

  it('rejects moments outside the caption and video boundaries', () => {
    const candidate = cloneValidCorpus();
    candidate.moments[0]!.endSeconds = candidate.videos[0]!.durationSeconds + 1;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'MOMENT_OUTSIDE_VIDEO:moment-agent-evals',
    );
  });

  it('rejects an excerpt that is not licensed for commercial display', () => {
    const candidate = cloneValidCorpus();
    candidate.rights[0]!.allowedUses.commercialUse = false;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'RIGHTS_COMMERCIAL_USE_NOT_ALLOWED:moment-agent-evals',
    );
  });

  it('rejects an expired rights grant', () => {
    const candidate = cloneValidCorpus();
    candidate.rights[0]!.expiresAt = '2020-01-01T00:00:00.000Z';
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'RIGHTS_GRANT_EXPIRED:rights-local-test-video',
    );
  });

  it('rejects a rights grant that is not attributable to the source creator', () => {
    const candidate = cloneValidCorpus();
    const grant = candidate.rights[0]! as (typeof candidate.rights)[number] & {
      creatorId: string;
      permissionVerifiedAt: string;
    };
    grant.creatorId = 'unrelated-creator';
    grant.permissionVerifiedAt = '2026-08-30T00:00:00.000Z';
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'RIGHTS_CREATOR_NOT_ATTRIBUTABLE:moment-agent-evals',
    );
  });

  it('rejects a grant without a canonical permission verification timestamp', () => {
    const candidate = cloneValidCorpus();
    const grant = candidate.rights[0]! as (typeof candidate.rights)[number] & {
      creatorId: string;
      permissionVerifiedAt: string;
    };
    grant.creatorId = 'local-test-creator';
    grant.permissionVerifiedAt = 'not-a-timestamp';
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'RIGHTS_PERMISSION_VERIFICATION_INVALID:rights-local-test-video',
    );
  });

  it('rejects an excerpt beyond its granted character limit', () => {
    const candidate = cloneValidCorpus();
    candidate.rights[0]!.maxExcerptCharacters = 8;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'MOMENT_EXCERPT_EXCEEDS_RIGHTS_LIMIT:moment-agent-evals',
    );
  });

  it('rejects a moment outside its covered caption span', () => {
    const candidate = cloneValidCorpus();
    candidate.moments[0]!.startSeconds = 119;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'MOMENT_OUTSIDE_CAPTIONS:moment-agent-evals',
    );
  });

  it('rejects an invalid correction relation and duplicate moment ID', () => {
    const candidate = cloneValidCorpus();
    candidate.moments.push({
      ...candidate.moments[0]!,
      correctsMomentId: 'missing-moment',
    });
    expect(validateVideoCorpus(candidate).diagnostics).toEqual(
      expect.arrayContaining([
        'MOMENT_CORRECTION_TARGET_INVALID:moment-agent-evals',
        'MOMENT_ID_DUPLICATE:moment-agent-evals',
      ]),
    );
  });

  it('rejects an unsupported moment state', () => {
    const candidate = cloneValidCorpus();
    candidate.moments[0]!.state = 'published' as never;
    expect(validateVideoCorpus(candidate).diagnostics).toContain(
      'MOMENT_STATE_INVALID:moment-agent-evals',
    );
  });

  it('sorts and deduplicates diagnostics for a deterministic receipt boundary', () => {
    const candidate = cloneValidCorpus();
    candidate.moments[0]!.endSeconds = 120;
    candidate.moments[0]!.startSeconds = 120;
    expect(validateVideoCorpus(candidate).diagnostics).toEqual([
      'MOMENT_TIMING_INVALID:moment-agent-evals',
    ]);
  });
});
