import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type VideoCorpus } from '../../packages/video-moment-core/src/index.js';
import {
  isDiscoveryPageEligible,
  renderAtomFeed as renderAtomFeedRaw,
  renderSitemap as renderSitemapRaw,
  renderSitemapIndex,
  validateUniqueSeoDocuments,
} from './seo.js';
import type { VideoSourceEvidenceManifest } from './source-evidence.js';

const corpus = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;
const evidenceManifest = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/video-source-evidence-manifest-v2.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoSourceEvidenceManifest;
const baseUrl = 'https://receipt-portfolio.example/';
const validationNow = new Date('2026-09-01T12:00:00.000Z');

function manifestFor(candidate: VideoCorpus): VideoSourceEvidenceManifest {
  const manifest = structuredClone(evidenceManifest);
  const reviewedEvidenceIds = new Set(
    candidate.videos.flatMap((video) =>
      video.reviewEvidenceId === undefined ? [] : [video.reviewEvidenceId],
    ),
  );
  manifest.records = manifest.records.filter((record) =>
    reviewedEvidenceIds.has(record.evidenceId),
  );
  manifest.corpusId = candidate.corpusId;
  for (const record of manifest.records) {
    record.bindings.corpusId = candidate.corpusId;
  }
  return manifest;
}

function renderSitemap(
  ...args: Parameters<typeof renderSitemapRaw>
): ReturnType<typeof renderSitemapRaw> {
  args[4] ??= manifestFor(args[0]);
  args[5] ??= validationNow;
  return renderSitemapRaw(...args);
}

function renderAtomFeed(
  ...args: Parameters<typeof renderAtomFeedRaw>
): ReturnType<typeof renderAtomFeedRaw> {
  args[3] ??= manifestFor(args[0]);
  args[4] ??= validationNow;
  return renderAtomFeedRaw(...args);
}

function twoSourceCorpus(): VideoCorpus {
  const firstVideo = corpus.videos[0]!;
  const firstGrant = corpus.rights[0]!;
  const firstCue = corpus.cues[0]!;
  const firstMoment = corpus.moments[0]!;
  const secondSource = 'https://video.example/independent-source';
  return {
    ...corpus,
    corpusId: 'synthetic-two-source-corpus',
    videos: [
      firstVideo,
      {
        id: 'video-independent-source',
        slug: 'independent-source',
        title: 'Independent controlled source',
        creatorId: 'synthetic-creator',
        creatorName: 'Synthetic Creator',
        sourceUrl: secondSource,
        durationSeconds: 300,
      },
    ],
    rights: [
      firstGrant,
      {
        id: 'rights-independent-source',
        creatorId: 'synthetic-creator',
        basis: 'creator-supplied',
        coveredVideoIds: ['video-independent-source'],
        coveredSourceUrls: [secondSource],
        coveredCaptionHashes: [],
        coveredAnnotationHashes: [firstCue.contentSha256!],
        allowedUses: {
          commercialUse: true,
          excerpts: true,
          timestampLinks: true,
        },
        maxExcerptCharacters: 280,
        licenseNote: 'Synthetic local-only creator-supplied fixture.',
        permissionVerifiedAt: '2026-08-30T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        revocationContact: 'https://video.example/rights',
      },
    ],
    cues: [
      firstCue,
      {
        ...firstCue,
        id: 'annotation-independent-source-45',
        videoId: 'video-independent-source',
        startSeconds: 45,
        endSeconds: 46,
      },
    ],
    moments: [
      firstMoment,
      {
        ...firstMoment,
        id: 'moment-independent-source',
        videoId: 'video-independent-source',
        startSeconds: 45,
        endSeconds: 46,
        topicSlugs: ['robots-control'],
        rightsGrantId: 'rights-independent-source',
      },
    ],
  };
}

describe('video moment search SEO', () => {
  it('indexes every evidence-safe canonical route without query or unsupported video discovery URLs', () => {
    const sitemap = renderSitemap(corpus, baseUrl);
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/video-moment-search/</loc>',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/video-moment-search/videos/robots-under-control/</loc>',
    );
    expect(sitemap).toContain('/moments/moment-robots-control/');
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/video-moment-search/creators/university-of-the-netherlands/</loc>',
    );
    expect(sitemap).not.toContain('?q=');
    expect(sitemap).not.toContain('video-sitemap.xml');
    expect(sitemap).not.toContain('thumbnail');
    expect(sitemap).not.toContain('player');
    const feed = renderAtomFeed(corpus, baseUrl);
    expect(feed).toContain('#t=132');
    expect(feed).toContain('<updated>2026-02-04T14:54:21.000Z</updated>');
    expect(feed).not.toContain('<updated>2026-08-31T00:00:00.000Z</updated>');
    expect(feed).not.toContain('<updated>2022-01-18T00:00:00.000Z</updated>');
  });

  it('keeps validated shared additions inside the AI Moment Index namespace', () => {
    const sitemap = renderSitemap(corpus, baseUrl, {}, [
      '/blog/',
      '/blog/evidence-bound-post/',
    ]);

    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/video-moment-search/blog/</loc>',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/video-moment-search/blog/evidence-bound-post/</loc>',
    );
    expect(sitemap).not.toContain(
      '<loc>https://receipt-portfolio.example/blog/',
    );
  });

  it('includes only eligible project-original guides in the Atom feed', () => {
    const syntheticCorpus = twoSourceCorpus();
    const momentIds = syntheticCorpus.moments.map((moment) => moment.id);
    const feed = renderAtomFeed(syntheticCorpus, baseUrl, [
      {
        id: 'guide-accepted',
        slug: 'compare-annotations',
        title: 'Compare source-bound annotations',
        summary: 'A synthetic local-only guide entry.',
        updatedAt: '2026-08-30T12:00:00.000Z',
        sourceMomentIds: momentIds,
        synthesis: {
          text: 'This project-original comparison distinguishes the two independent source annotations and their evidence limits.',
          isProjectOriginal: true,
        },
      },
      {
        id: 'guide-rejected',
        slug: 'one-source-only',
        title: 'One source only',
        summary: 'This must not be published.',
        updatedAt: '2026-08-30T13:00:00.000Z',
        sourceMomentIds: [momentIds[0]!],
        synthesis: {
          text: 'This has only one source moment.',
          isProjectOriginal: true,
        },
      },
      {
        id: 'guide-invalid-date',
        slug: 'invalid-date',
        title: 'Invalid update evidence',
        summary: 'This must not be published.',
        updatedAt: 'not-a-date',
        sourceMomentIds: momentIds,
        synthesis: {
          text: 'This otherwise eligible synthesis has no valid publication timestamp.',
          isProjectOriginal: true,
        },
      },
    ]);
    expect(feed).toContain('/guides/compare-annotations/');
    expect(feed).not.toContain('one-source-only');
    expect(feed).not.toContain('invalid-date');
  });

  it('lists eligible topic and guide canonicals in the normal sitemap', () => {
    const syntheticCorpus = twoSourceCorpus();
    const synthesis = {
      text: 'This project-original comparison distinguishes the two independent source annotations and their evidence limits.',
      isProjectOriginal: true,
    } as const;
    const guideSynthesis = {
      text: 'This separate project-original guide explains a verification workflow for the independently sourced annotations and their boundaries.',
      isProjectOriginal: true,
    } as const;
    const xml = renderSitemap(syntheticCorpus, baseUrl, {
      topics: [
        { slug: 'robots-control', synthesis },
        { slug: 'missing-topic', synthesis },
      ],
      guides: [
        {
          id: 'guide-accepted',
          slug: 'compare-annotations',
          title: 'Compare source-bound annotations',
          summary: 'A synthetic local-only guide entry.',
          updatedAt: '2026-08-30T12:00:00.000Z',
          sourceMomentIds: syntheticCorpus.moments.map((moment) => moment.id),
          synthesis: guideSynthesis,
        },
        {
          id: 'guide-one-source',
          slug: 'one-source-only',
          title: 'One source only',
          summary: 'This ineligible route must remain out of discovery.',
          updatedAt: '2026-08-30T12:00:00.000Z',
          sourceMomentIds: [syntheticCorpus.moments[0]!.id],
          synthesis: guideSynthesis,
        },
      ],
    });
    expect(xml).toContain('/topics/robots-control/');
    expect(xml).toContain('/guides/compare-annotations/');
    expect(xml).not.toContain('/topics/missing-topic/');
    expect(xml).not.toContain('/guides/one-source-only/');
  });

  it('fails closed instead of fabricating an update date for an empty feed', () => {
    const emptyCorpus: VideoCorpus = {
      corpusId: 'synthetic-empty-corpus',
      label: 'SYNTHETIC LOCAL-ONLY EMPTY CORPUS',
      videos: [],
      rights: [],
      cues: [],
      moments: [],
    };
    expect(() => renderAtomFeed(emptyCorpus, baseUrl)).toThrow(
      'No verified feed entries',
    );
  });

  it('renders a stable sitemap index without inventing query URLs', () => {
    const xml = renderSitemapIndex(baseUrl);
    expect(xml).toContain('/sitemap.xml');
    expect(xml).not.toContain('/video-sitemap.xml');
    expect(xml).not.toContain('?q=');
  });

  it('admits discovery pages only with two distinct source moments and attested original synthesis', () => {
    const syntheticCorpus = twoSourceCorpus();
    const momentIds = syntheticCorpus.moments.map((moment) => moment.id);
    expect(
      isDiscoveryPageEligible(syntheticCorpus, momentIds, {
        text: 'This project-original comparison explains what the two independently sourced annotations contribute and where their evidence stops.',
        isProjectOriginal: true,
      }),
    ).toBe(true);
    expect(
      isDiscoveryPageEligible(corpus, [corpus.moments[0]!.id], {
        text: 'One source is not enough.',
        isProjectOriginal: true,
      }),
    ).toBe(false);
    expect(
      isDiscoveryPageEligible(syntheticCorpus, momentIds, {
        text: 'Unattested synthesis is rejected.',
        isProjectOriginal: false,
      }),
    ).toBe(false);
  });

  it('rejects punctuation-only and trivial synthesis before publication', () => {
    const syntheticCorpus = twoSourceCorpus();
    const momentIds = syntheticCorpus.moments.map((moment) => moment.id);
    for (const text of ['!!! ... ---', 'Original thoughts.']) {
      expect(
        isDiscoveryPageEligible(syntheticCorpus, momentIds, {
          text,
          isProjectOriginal: true,
        }),
      ).toBe(false);
    }
  });

  it('rejects two video records that resolve to the same source URL', () => {
    const syntheticCorpus = twoSourceCorpus();
    const sharedSource = syntheticCorpus.videos[0]!.sourceUrl;
    const sameSourceCorpus: VideoCorpus = {
      ...syntheticCorpus,
      videos: syntheticCorpus.videos.map((candidate, index) =>
        index === 1 ? { ...candidate, sourceUrl: sharedSource } : candidate,
      ),
      rights: syntheticCorpus.rights.map((grant, index) =>
        index === 1 ? { ...grant, coveredSourceUrls: [sharedSource] } : grant,
      ),
    };
    expect(
      isDiscoveryPageEligible(
        sameSourceCorpus,
        sameSourceCorpus.moments.map((moment) => moment.id),
        {
          text: 'This attested synthesis must still fail because both records share one source URL.',
          isProjectOriginal: true,
        },
      ),
    ).toBe(false);
  });

  it('rejects duplicate metadata and substantially identical bodies', () => {
    const result = validateUniqueSeoDocuments([
      {
        title: 'First page',
        description: 'A unique first description.',
        canonical: 'https://receipt-portfolio.example/video-moment-search/a/',
        body: '<p>Compare the two reviewed moments and explain their limits.</p>',
      },
      {
        title: 'Second page',
        description: 'A unique second description.',
        canonical: 'https://receipt-portfolio.example/video-moment-search/b/',
        body: '<article>Compare the two reviewed moments, and explain their limits!</article>',
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain('SEO_BODY_SUBSTANTIALLY_DUPLICATE:1');
  });

  it('rejects duplicate discovery sets from sitemap and feed publication', () => {
    const syntheticCorpus = twoSourceCorpus();
    const momentIds = syntheticCorpus.moments.map((moment) => moment.id);
    const baseGuide = {
      id: 'guide-base',
      slug: 'guide-base',
      title: 'Compare independent source annotations',
      summary: 'A distinct summary about evidence boundaries and verification.',
      updatedAt: '2026-08-30T12:00:00.000Z',
      sourceMomentIds: momentIds,
      synthesis: {
        text: 'This project-original guide compares two independent source annotations and explains their separate evidence boundaries clearly.',
        isProjectOriginal: true,
      },
    } as const;
    const distinct = {
      id: 'guide-distinct',
      slug: 'guide-distinct',
      title: 'Trace provenance across reviewed moments',
      summary: 'A separate summary about context, provenance, and limitations.',
      updatedAt: '2026-08-30T13:00:00.000Z',
      sourceMomentIds: momentIds,
      synthesis: {
        text: 'Independent analysis connects the reviewed moments while separating provenance context limitations and verification steps.',
        isProjectOriginal: true,
      },
    } as const;
    const duplicateCases = [
      { ...distinct, title: baseGuide.title },
      { ...distinct, summary: baseGuide.summary },
      { ...distinct, slug: baseGuide.slug },
      { ...distinct, synthesis: baseGuide.synthesis },
      { ...distinct, id: baseGuide.id },
    ];

    for (const duplicate of duplicateCases) {
      const guides = [baseGuide, duplicate];
      expect(renderSitemap(syntheticCorpus, baseUrl, { guides })).not.toContain(
        '/guides/',
      );
      expect(renderAtomFeed(syntheticCorpus, baseUrl, guides)).not.toContain(
        '/guides/',
      );
    }
  });
});
