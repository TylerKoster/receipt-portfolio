import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex,
  searchMoments,
  validateVideoCorpus,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import {
  renderCreatorPage,
  renderGuidePage,
  renderMomentPage,
  renderSearchResults,
  renderSearchShell,
  renderTopicPage,
  renderVideoMomentHome,
  renderVideoPage,
  serializePublicSearchIndex,
} from './render.js';
import {
  searchPublicIndex,
  VIDEO_MOMENT_SEARCH_CLIENT,
} from './search-client.js';
import {
  validateCommonsSourceEvidence,
  type CommonsSourceRightsEvidence,
} from './source-evidence.js';
import { videoMomentSearchSite } from './index.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;
const sourceRightsEvidence = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/commons-source-rights-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CommonsSourceRightsEvidence;
const baseUrl = 'https://receipt-portfolio.example/';
const searchIndex = buildSearchIndex(fixture);

function twoSourceFixture(): VideoCorpus {
  const firstVideo = fixture.videos[0]!;
  const firstGrant = fixture.rights[0]!;
  const firstCue = fixture.cues[0]!;
  const firstMoment = fixture.moments[0]!;
  const secondSource = 'https://video.example/independent-source';
  return {
    ...fixture,
    corpusId: 'synthetic-two-source-site-corpus',
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

type Mutable<Value> = {
  -readonly [Key in keyof Value]: Mutable<Value[Key]>;
};

type SubmitListener = (event: { preventDefault(): void }) => void;

class FakeHTMLElement {
  readonly children: FakeHTMLElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  hidden = false;
  href = '';
  textContent = '';
  failNextReplace = false;

  constructor(readonly tagName = 'div') {}

  append(...children: FakeHTMLElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeHTMLElement[]): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('controlled DOM write failure');
    }
    this.children.splice(0, this.children.length, ...children);
  }
}

class FakeHTMLFormElement extends FakeHTMLElement {
  private readonly listeners = new Map<string, SubmitListener>();

  constructor() {
    super('form');
  }

  addEventListener(type: string, listener: SubmitListener): void {
    this.listeners.set(type, listener);
  }

  submit(): void {
    this.listeners.get('submit')?.({ preventDefault() {} });
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  value = '';

  constructor() {
    super('input');
  }
}

interface ClientHarness {
  readonly error: FakeHTMLElement;
  readonly results: FakeHTMLElement;
  readonly serverResults: FakeHTMLElement;
  readonly status: FakeHTMLElement;
  failNextRender(): void;
  rejectFetch(): Promise<void>;
  resolveNonOkFetch(): Promise<void>;
  resolveIndex(value: unknown): Promise<void>;
  submit(query: string): void;
}

function descendants(
  element: FakeHTMLElement,
  tagName: string,
): FakeHTMLElement[] {
  return [
    ...(element.tagName === tagName ? [element] : []),
    ...element.children.flatMap((child) => descendants(child, tagName)),
  ];
}

async function flushClientPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function executeClientPayload(): ClientHarness {
  const form = new FakeHTMLFormElement();
  const input = new FakeHTMLInputElement();
  const status = new FakeHTMLElement('p');
  const results = new FakeHTMLElement('div');
  const error = new FakeHTMLElement('p');
  error.hidden = true;
  const serverResults = new FakeHTMLElement('section');
  serverResults.textContent = 'server-rendered initial result';
  let resolveFetch!: (response: {
    readonly ok: boolean;
    json(): Promise<unknown>;
  }) => void;
  let rejectFetch!: (error: Error) => void;
  const fetchPromise = new Promise<{
    readonly ok: boolean;
    json(): Promise<unknown>;
  }>((resolve, reject) => {
    resolveFetch = resolve;
    rejectFetch = reject;
  });
  const selectors = new Map<string, FakeHTMLElement>([
    ['[data-moment-search]', form],
    ['[data-moment-query]', input],
    ['[data-search-status]', status],
    ['[data-client-results]', results],
    ['[data-search-error]', error],
    ['[data-server-results]', serverResults],
  ]);
  const document = {
    createElement: (tagName: string) => new FakeHTMLElement(tagName),
    querySelector: (selector: string) => selectors.get(selector) ?? null,
  };

  runInNewContext(VIDEO_MOMENT_SEARCH_CLIENT, {
    document,
    fetch: () => fetchPromise,
    HTMLElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLInputElement: FakeHTMLInputElement,
    URL,
  });

  return {
    error,
    results,
    serverResults,
    status,
    failNextRender: () => {
      results.failNextReplace = true;
    },
    rejectFetch: async () => {
      rejectFetch(new Error('controlled fetch rejection'));
      await flushClientPromises();
    },
    resolveNonOkFetch: async () => {
      resolveFetch({ ok: false, json: async () => ({}) });
      await flushClientPromises();
    },
    resolveIndex: async (value: unknown) => {
      resolveFetch({ ok: true, json: async () => value });
      await flushClientPromises();
    },
    submit: (query: string) => {
      input.value = query;
      form.submit();
    },
  };
}

describe('AI Moment Index public search surface', () => {
  it('explains the audience and workflow before the enterable search form', () => {
    const html = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(html).toContain(
      '<a class="skip-link" href="#main-content">Skip to main content</a>',
    );
    expect(html).toContain('<input');
    expect(html).toContain('name="q"');
    expect(html).toContain('Search moments');
    expect(html).toContain('#t=132');
    expect(html.indexOf('<strong>For:</strong>')).toBeLessThan(
      html.indexOf('name="q"'),
    );
    expect(html.indexOf('<h3>How to use it</h3>')).toBeLessThan(
      html.indexOf('name="q"'),
    );
  });

  it('states the historical-review and external-media boundaries truthfully', () => {
    const html = renderVideoMomentHome(
      fixture,
      searchIndex,
      baseUrl,
      sourceRightsEvidence,
    );
    expect(html).toContain(
      'Source and license availability was reviewed on 2022-01-18; this is historical evidence, not current verification.',
    );
    expect(html).toContain(
      'Search queries stay in this page and are not stored or sent. Opening a result leaves this site and loads media from Wikimedia under its policies.',
    );
    expect(html).not.toContain('media download, or external communication');
  });

  it('keeps arbitrary query state out of indexable URLs and persistent state', () => {
    const html = renderSearchShell(fixture, searchIndex, baseUrl);
    expect(html).toContain('name="robots" content="index,follow"');
    expect(html).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/video-moment-search/">',
    );
    expect(html).not.toContain('?q=');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).not.toMatch(
      /localStorage|sessionStorage|pushState|replaceState|location\.search|sendBeacon|analytics/u,
    );
  });

  it('renders the fixed query with the reviewed moment first and exact source second', () => {
    const html = renderSearchResults(fixture, searchIndex, 'robots control');
    expect(
      html.indexOf('data-moment-id="moment-robots-control"'),
    ).toBeGreaterThanOrEqual(0);
    expect(html).toContain(
      'href="https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132"',
    );
    expect(searchMoments(searchIndex, 'robots control')[0]).toMatchObject({
      momentId: 'moment-robots-control',
      startSeconds: 132,
      timestampUrl:
        'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    });
  });

  it('binds the public fixture to the deterministic Commons rights evidence', () => {
    expect(
      validateCommonsSourceEvidence(fixture, sourceRightsEvidence),
    ).toEqual({
      ok: true,
      diagnostics: [],
    });
    expect(sourceRightsEvidence).toEqual({
      schemaVersion: 1,
      evidenceId: 'commons-how-can-we-keep-robots-under-control-v1',
      workTitle: 'How can we keep robots under control?',
      attributionParty: 'University of the Netherlands',
      canonicalRightsPageUrl:
        'https://commons.wikimedia.org/wiki/File:How_can_we_keep_robots_under_control.webm',
      immutableRightsRevisionUrl:
        'https://commons.wikimedia.org/w/index.php?title=File:How_can_we_keep_robots_under_control.webm&oldid=1000389530',
      license: {
        name: 'CC BY-SA 4.0 International',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
      delivery: {
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm',
        mediaType: 'video/webm',
        byteLength: 24788866,
        acceptRanges: 'bytes',
        durationSeconds: 907.299,
      },
      timestamp: {
        strategy: 'media-fragment',
        seconds: 132,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
      },
      reviewRecord: {
        reviewer: 'LicenseReviewerBot',
        reviewedOn: '2022-01-18',
        finding:
          'Confirmed availability under CC BY-SA 4.0 International on the review date.',
      },
      annotation: {
        kind: 'original-editorial',
        text: 'Timestamped review point in the lecture “How can we keep robots under control?” This original index annotation is not transcript text.',
        sha256:
          '080c1bf2566fee9fce3db83f35990d76311eb5e2c2ab22fc2d2daf9c917c5fdd',
      },
      productBoundary: {
        included: ['timestamp link', 'original editorial annotation'],
        excluded: [
          'hosting',
          'embedding',
          'media distribution',
          'transcript distribution',
          'endorsement claim',
          'inferred permission',
        ],
      },
    });
    const evidence = sourceRightsEvidence as {
      annotation: { text: string; sha256: string };
      attributionParty: string;
      delivery: { url: string };
      evidenceId: string;
      immutableRightsRevisionUrl: string;
      license: { name: string; url: string };
      productBoundary: { included: string[]; excluded: string[] };
      reviewRecord: { reviewer: string; reviewedOn: string };
      timestamp: { strategy: string; seconds: number; url: string };
      workTitle: string;
    };
    expect(fixture.videos[0]).toMatchObject({
      title: evidence.workTitle,
      creatorName: evidence.attributionParty,
      sourceUrl: evidence.delivery.url,
      timestampStrategy: evidence.timestamp.strategy,
    });
    expect(fixture.cues[0]).toMatchObject({
      startSeconds: evidence.timestamp.seconds,
      evidenceKind: 'editorial-annotation',
      text: evidence.annotation.text,
      contentSha256: evidence.annotation.sha256,
    });
    expect(fixture.moments[0]).toMatchObject({
      startSeconds: evidence.timestamp.seconds,
      excerpt: evidence.annotation.text,
    });
    expect(fixture.rights[0]).toMatchObject({
      id: 'rights-commons-robots-control',
      licenseNote:
        'CC BY-SA 4.0 International; timestamp link plus original editorial annotation only; no inferred permission or endorsement.',
      permissionVerifiedAt: '2022-01-18T00:00:00.000Z',
      reviewEvidence: {
        classification: 'reviewed-public-source',
        evidenceId: 'commons-how-can-we-keep-robots-under-control-v1',
        licenseIdentifier: 'CC BY-SA 4.0 International',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        canonicalRightsPageUrl:
          'https://commons.wikimedia.org/wiki/File:How_can_we_keep_robots_under_control.webm',
        immutableRightsRevisionUrl:
          'https://commons.wikimedia.org/w/index.php?title=File:How_can_we_keep_robots_under_control.webm&oldid=1000389530',
        reviewer: 'LicenseReviewerBot',
        reviewedOn: '2022-01-18',
        productBoundary: evidence.productBoundary,
      },
    });

    const publicEntry = serializePublicSearchIndex(fixture, searchIndex)
      .entries[0] as ReturnType<
      typeof serializePublicSearchIndex
    >['entries'][number] & {
      reviewEvidence?: unknown;
    };
    expect(publicEntry.reviewEvidence).toEqual(
      (fixture.rights[0] as { reviewEvidence?: unknown }).reviewEvidence,
    );
    expect(publicEntry.rightsStatus).toContain(evidence.license.name);
    expect(publicEntry.verificationDate).toBe(evidence.reviewRecord.reviewedOn);
    expect(publicEntry.provenance).toContain(evidence.evidenceId);
    expect(publicEntry.provenance).toContain(
      evidence.immutableRightsRevisionUrl,
    );
    expect(publicEntry.provenance).toContain(evidence.reviewRecord.reviewer);

    const html = renderSearchResults(fixture, searchIndex, 'robots control');
    for (const value of [
      evidence.evidenceId,
      evidence.license.name,
      evidence.license.url,
      evidence.immutableRightsRevisionUrl.replace('&', '&amp;'),
      evidence.reviewRecord.reviewer,
      evidence.reviewRecord.reviewedOn,
      ...evidence.productBoundary.included,
      ...evidence.productBoundary.excluded,
    ]) {
      expect(html).toContain(value);
    }
  });

  it('fails site construction when the checked-in Commons evidence drifts from reviewed content lineage', () => {
    const invalidEvidence = [
      [
        'annotation text',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.annotation.text = 'Unsupported standalone 02:12 claim.'),
      ],
      [
        'annotation hash',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.annotation.sha256 = '0'.repeat(64)),
      ],
      [
        'source linkage',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.delivery.url = 'https://example.test/drifted.webm'),
      ],
      [
        'timestamp linkage',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.timestamp.seconds = 133),
      ],
      [
        'rights linkage',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.license.name = 'CC0 1.0'),
      ],
      [
        'review finding',
        (candidate: Mutable<CommonsSourceRightsEvidence>) =>
          (candidate.reviewRecord.finding = 'Unsupported review finding.'),
      ],
    ] as const;

    for (const [name, invalidate] of invalidEvidence) {
      const candidate = structuredClone(
        sourceRightsEvidence,
      ) as Mutable<CommonsSourceRightsEvidence>;
      invalidate(candidate);
      expect(validateCommonsSourceEvidence(fixture, candidate).ok, name).toBe(
        false,
      );
      expect(
        () => serializePublicSearchIndex(fixture, searchIndex, candidate),
        name,
      ).toThrow('Invalid Commons source evidence');
      let html: string | undefined;
      expect(() => {
        html = renderVideoMomentHome(fixture, searchIndex, baseUrl, candidate);
      }, name).toThrow('Invalid Commons source evidence');
      expect(html, name).toBeUndefined();
    }
  });

  it('rejects public rights grant and review-evidence drift', () => {
    const licenseDrift = structuredClone(fixture) as Mutable<VideoCorpus>;
    licenseDrift.rights[0]!.licenseNote = 'drifted license note';
    expect(validateVideoCorpus(licenseDrift).diagnostics).toContain(
      'RIGHTS_REVIEW_LICENSE_NOTE_MISMATCH:rights-commons-robots-control',
    );

    const dateDrift = structuredClone(fixture) as Mutable<VideoCorpus>;
    dateDrift.rights[0]!.permissionVerifiedAt = '2022-01-19T00:00:00.000Z';
    expect(validateVideoCorpus(dateDrift).diagnostics).toContain(
      'RIGHTS_REVIEW_DATE_MISMATCH:rights-commons-robots-control',
    );

    const evidenceIdDrift = structuredClone(fixture) as Mutable<VideoCorpus>;
    const reviewEvidence = evidenceIdDrift.rights[0]!.reviewEvidence!;
    reviewEvidence.evidenceId = 'drifted-review-evidence';
    expect(validateVideoCorpus(evidenceIdDrift).diagnostics).toContain(
      'RIGHTS_REVIEW_EVIDENCE_NOT_BOUND:moment-robots-control',
    );
  });

  it('does not infer reviewed status from media-fragment syntax', () => {
    const unreviewedMedia = structuredClone(fixture) as Mutable<VideoCorpus>;
    delete unreviewedMedia.videos[0]!.reviewEvidenceId;
    delete unreviewedMedia.rights[0]!.reviewEvidence;
    const entry = serializePublicSearchIndex(
      unreviewedMedia,
      buildSearchIndex(unreviewedMedia),
    ).entries[0]!;
    expect(entry.timestampStrategy).toBe('media-fragment');
    expect(entry.confidenceClass).toBe(
      'Rights-validated controlled fixture match',
    );
    expect(entry.reviewEvidence).toBeUndefined();
  });

  it('keeps page-level reviewed-source claims absent when review evidence is absent', () => {
    const unreviewedMedia = structuredClone(fixture) as Mutable<VideoCorpus>;
    delete unreviewedMedia.videos[0]!.reviewEvidenceId;
    delete unreviewedMedia.rights[0]!.reviewEvidence;
    expect(validateVideoCorpus(unreviewedMedia).ok).toBe(true);

    const html = renderVideoMomentHome(
      unreviewedMedia,
      buildSearchIndex(unreviewedMedia),
      baseUrl,
    );
    expect(html.toLocaleLowerCase('en-US')).not.toMatch(
      /reviewed (?:public-)?source|commons-reviewed|reviewed commons|initial reviewed moments|search the reviewed/u,
    );

    const reviewedHtml = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(reviewedHtml).toContain('Reviewed public source');
    expect(reviewedHtml).toContain(
      'commons-how-can-we-keep-robots-under-control-v1',
    );
    expect(reviewedHtml).toContain(
      'https://commons.wikimedia.org/w/index.php?title=File:How_can_we_keep_robots_under_control.webm&amp;oldid=1000389530',
    );
  });

  it('rejects contradictory reviewed-source claims in the helper and shipped client', async () => {
    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const baseEntry = validIndex.entries[0]!;
    const contradictions: readonly [
      string,
      (entry: Mutable<typeof baseEntry>) => void,
    ][] = [
      [
        'reviewed label without evidence',
        (entry) => {
          delete entry.reviewEvidence;
        },
      ],
      [
        'reviewer drift',
        (entry) => {
          entry.reviewEvidence!.reviewer = 'ContradictoryReviewer';
        },
      ],
      [
        'review date drift',
        (entry) => {
          entry.reviewEvidence!.reviewedOn = '2022-01-19';
        },
      ],
      [
        'license drift',
        (entry) => {
          entry.reviewEvidence!.licenseIdentifier = 'Contradictory License';
        },
      ],
      [
        'evidence ID drift',
        (entry) => {
          entry.reviewEvidence!.evidenceId = 'contradictory-evidence';
        },
      ],
      [
        'provenance drift',
        (entry) => {
          entry.provenance = entry.provenance.replace(
            'commons-how-can-we-keep-robots-under-control-v1',
            'contradictory-evidence',
          );
        },
      ],
      [
        'index corpus lineage drift',
        (entry) => {
          entry.corpusId = 'contradictory-corpus';
          entry.provenance = entry.provenance.replace(
            'wikimedia-commons-ai-video-reviewed-v1',
            'contradictory-corpus',
          );
        },
      ],
    ];

    for (const [name, contradict] of contradictions) {
      const entry = structuredClone(baseEntry) as Mutable<typeof baseEntry>;
      contradict(entry);
      const hostileIndex = { ...validIndex, entries: [entry] };
      expect(searchPublicIndex(hostileIndex, 'robots control'), name).toEqual(
        [],
      );

      const harness = executeClientPayload();
      await harness.resolveIndex(hostileIndex);
      expect(harness.error.hidden, name).toBe(false);
      harness.submit('robots control');
      expect(harness.results.children, name).toEqual([]);
    }
  });

  it('rejects semantically empty or invalid review evidence in the helper and shipped client', async () => {
    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const baseEntry = validIndex.entries[0]!;
    const synchronizeClaims = (entry: Mutable<typeof baseEntry>): void => {
      const review = entry.reviewEvidence!;
      entry.rightsStatus = `${review.licenseIdentifier}; ${review.productBoundary.included.join(' plus ')} only; no inferred permission or endorsement.`;
      entry.verificationDate = review.reviewedOn;
      entry.provenance = `Corpus ${entry.corpusId}; evidence ${review.evidenceId}; immutable rights revision ${review.immutableRightsRevisionUrl}; reviewed by ${review.reviewer} on ${review.reviewedOn}; rights grant ${entry.rightsGrantId}; cue ${entry.cueIds.join(', ')}`;
    };
    const invalidEvidence: readonly [
      string,
      (entry: Mutable<typeof baseEntry>) => void,
    ][] = [
      ['empty evidence ID', (entry) => (entry.reviewEvidence!.evidenceId = '')],
      [
        'empty license identifier',
        (entry) => (entry.reviewEvidence!.licenseIdentifier = ''),
      ],
      ['empty reviewer', (entry) => (entry.reviewEvidence!.reviewer = '')],
      ['empty review date', (entry) => (entry.reviewEvidence!.reviewedOn = '')],
      [
        'malformed review date',
        (entry) => (entry.reviewEvidence!.reviewedOn = '2022-1-18'),
      ],
      [
        'impossible review date',
        (entry) => (entry.reviewEvidence!.reviewedOn = '2022-02-30'),
      ],
      [
        'empty included uses',
        (entry) => (entry.reviewEvidence!.productBoundary.included = []),
      ],
      [
        'empty excluded uses',
        (entry) => (entry.reviewEvidence!.productBoundary.excluded = []),
      ],
      [
        'whitespace-only included use',
        (entry) => (entry.reviewEvidence!.productBoundary.included = ['   ']),
      ],
      [
        'whitespace-only excluded use',
        (entry) => (entry.reviewEvidence!.productBoundary.excluded = ['\t']),
      ],
    ];

    for (const [name, invalidate] of invalidEvidence) {
      const entry = structuredClone(baseEntry) as Mutable<typeof baseEntry>;
      invalidate(entry);
      synchronizeClaims(entry);
      const hostileIndex = { ...validIndex, entries: [entry] };
      expect(searchPublicIndex(hostileIndex, 'robots control'), name).toEqual(
        [],
      );

      const harness = executeClientPayload();
      await harness.resolveIndex(hostileIndex);
      expect(harness.error.hidden, name).toBe(false);
      harness.submit('robots control');
      expect(harness.results.children, name).toEqual([]);
    }
  });

  it('rejects invalid corpus review evidence before serialization or reviewed SSR copy', () => {
    const invalidEvidence: readonly [
      string,
      (candidate: Mutable<VideoCorpus>) => void,
    ][] = [
      [
        'whitespace license',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.licenseIdentifier = '   '),
      ],
      [
        'whitespace reviewer',
        (candidate) => (candidate.rights[0]!.reviewEvidence!.reviewer = '\t'),
      ],
      [
        'whitespace included use',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.included = [
            '   ',
          ]),
      ],
      [
        'whitespace excluded use',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.productBoundary.excluded = [
            '\t',
          ]),
      ],
      [
        'impossible review date',
        (candidate) =>
          (candidate.rights[0]!.reviewEvidence!.reviewedOn = '2022-02-30'),
      ],
    ];

    for (const [name, invalidate] of invalidEvidence) {
      const candidate = structuredClone(fixture) as Mutable<VideoCorpus>;
      invalidate(candidate);
      const review = candidate.rights[0]!.reviewEvidence!;
      candidate.rights[0]!.licenseNote = `${review.licenseIdentifier}; ${review.productBoundary.included.join(' plus ')} only; no inferred permission or endorsement.`;

      expect(validateVideoCorpus(candidate).ok, name).toBe(false);
      expect(
        () => serializePublicSearchIndex(candidate, searchIndex),
        name,
      ).toThrow('Invalid video corpus');
      let html: string | undefined;
      expect(() => {
        html = renderVideoMomentHome(candidate, searchIndex, baseUrl);
      }, name).toThrow('Invalid video corpus');
      expect(html, name).toBeUndefined();
    }
  });

  it('renders every result with its own validated stored timestamp and evidence metadata', () => {
    const publicIndex = serializePublicSearchIndex(fixture, searchIndex);
    const results = searchPublicIndex(publicIndex, 'robots control');
    expect(results).not.toHaveLength(0);
    for (const result of results) {
      const timestampUrl = new URL(result.timestampUrl);
      expect(timestampUrl.hash).toBe(`#t=${result.startSeconds}`);
      expect(timestampUrl.searchParams.get('t')).toBeNull();
    }

    const html = renderSearchResults(fixture, searchIndex, 'robots control');
    for (const label of [
      'Source title',
      'Creator',
      'Excerpt',
      'Start / end',
      'Topics',
      'Confidence class',
      'Rights status',
      'Verification date',
      'Provenance',
      'Correction state',
    ]) {
      expect(html).toContain(`<dt>${label}</dt>`);
    }
    expect(html).toContain('2:12–2:13');
  });

  it('escapes hostile fixture text and leaves malformed result URLs inert', () => {
    const hostileCorpus = structuredClone(fixture) as Mutable<VideoCorpus>;
    delete hostileCorpus.videos[0]!.reviewEvidenceId;
    delete hostileCorpus.rights[0]!.reviewEvidence;
    hostileCorpus.videos[0]!.title = '<script>alert(1)</script>';
    hostileCorpus.videos[0]!.creatorName = '<img src=x onerror=alert(1)>';
    hostileCorpus.moments[0]!.excerpt =
      '<button onclick=alert(1)>open</button>';
    const hostileHtml = renderVideoMomentHome(
      hostileCorpus,
      buildSearchIndex(hostileCorpus),
      baseUrl,
    );
    expect(hostileHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(hostileHtml).toContain(
      '&lt;button onclick=alert(1)&gt;open&lt;/button&gt;',
    );
    expect(hostileHtml).not.toMatch(
      /<script>alert|<img src=x|<button onclick=/u,
    );

    const validPublicIndex = serializePublicSearchIndex(fixture, searchIndex);
    const malformedIndex = {
      ...validPublicIndex,
      entries: validPublicIndex.entries.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              sourceUrl: 'javascript:alert(1)',
              timestampUrl: 'javascript:alert(1)',
            }
          : entry,
      ),
    };
    expect(searchPublicIndex(malformedIndex, 'robots control')).toEqual([]);
  });

  it('provides deterministic empty, zero-result, and client-load recovery while retaining initial results', () => {
    expect(renderSearchResults(fixture, searchIndex, '')).toContain(
      'Enter a phrase such as “robots control”.',
    );
    expect(
      renderSearchResults(fixture, searchIndex, 'missing subject'),
    ).toContain('No moments match this phrase');
    const home = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(home).toContain('data-search-error');
    expect(home).toContain(
      'Search could not load. The initial controlled moments remain available below.',
    );
    expect(home).toContain('data-server-results');
    expect(home).toContain('moment-robots-control');
  });

  it('uses semantic accessible states and required first-viewport boundaries', () => {
    const html = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(html).toContain('<form');
    expect(html).toContain('role="search"');
    expect(html).toContain('<label for="moment-query">');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<ol>');
    for (const copy of [
      '<strong>For:</strong>',
      '<strong>Use this when:</strong>',
      'How to use it',
      '<strong>What you get:</strong>',
      '<strong>Rights boundary:</strong>',
      'reviewed Commons source',
      'timestamp link plus an original editorial annotation only',
      'does not host, embed, or distribute media or transcripts',
      'claim endorsement or inferred permission',
      'not a live creator library',
      'usability, demand, or revenue evidence',
    ]) {
      expect(html).toContain(copy);
    }
  });

  it('indexes every nonempty admitted canonical page while keeping query state out of discovery', () => {
    const search = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(search).toContain('<meta name="robots" content="index,follow">');
    expect(search).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/video-moment-search/">',
    );
    expect(search).toContain(
      'href="https://receipt-portfolio.example/video-moment-search/moments/moment-robots-control/"',
    );

    const video = renderVideoPage(
      fixture,
      searchIndex,
      'video-robots-under-control',
      baseUrl,
    );
    expect(video).toContain('How can we keep robots under control?');
    expect(video).toContain('<meta name="robots" content="index,follow">');
    expect(video).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/video-moment-search/videos/robots-under-control/">',
    );
    expect(video).not.toContain('"@type":"VideoObject"');
    expect(video).not.toContain('"@type":"Clip"');

    const moment = renderMomentPage(
      fixture,
      searchIndex,
      'moment-robots-control',
      baseUrl,
    );
    expect(moment).toContain('#t=132');
    expect(moment).toContain('<meta name="robots" content="index,follow">');
    expect(moment).toContain('"@type":"BreadcrumbList"');

    const creator = renderCreatorPage(
      fixture,
      searchIndex,
      'university-of-the-netherlands',
      baseUrl,
    );
    expect(creator).toContain('University of the Netherlands');
    expect(creator).toContain('<meta name="robots" content="index,follow">');

    for (const directPage of [video, moment, creator]) {
      expect(directPage).toContain('<strong>For:</strong>');
      expect(directPage).toContain('<strong>Use this when:</strong>');
      expect(directPage).toContain('How to use it');
      expect(directPage).toContain('Review the excerpt and evidence details.');
      expect(directPage).toContain(
        'Open the exact source-time link and confirm the surrounding context.',
      );
      expect(directPage).toContain('Search another phrase');
      expect(directPage).not.toContain(
        'Enter the idea or phrase you remember.',
      );
      expect(directPage).toContain(
        'historical evidence, not current verification',
      );
    }

    expect(
      renderTopicPage(fixture, searchIndex, 'robots-control', baseUrl),
    ).toBeNull();
    expect(renderGuidePage(fixture, searchIndex, baseUrl)).toBeNull();
    expect(videoMomentSearchSite.siteId).toBe('video-moment-search');
  });

  it('keeps empty home and unavailable video or creator variants out of the index', () => {
    const emptyCorpus: VideoCorpus = {
      corpusId: 'synthetic-empty-site-corpus',
      label: 'SYNTHETIC LOCAL-ONLY EMPTY CORPUS',
      videos: [],
      rights: [],
      cues: [],
      moments: [],
    };
    const emptyHome = renderVideoMomentHome(
      emptyCorpus,
      buildSearchIndex(emptyCorpus),
      baseUrl,
    );
    const unavailableVideo = renderVideoPage(
      fixture,
      searchIndex,
      'video-unavailable',
      baseUrl,
    );
    const unavailableCreator = renderCreatorPage(
      fixture,
      searchIndex,
      'creator-unavailable',
      baseUrl,
    );

    for (const unavailablePage of [
      emptyHome,
      unavailableVideo,
      unavailableCreator,
    ]) {
      expect(unavailablePage).toContain(
        '<meta name="robots" content="noindex,nofollow">',
      );
    }
  });

  it('renders eligible topic and guide pages with escaped original synthesis and contextual links', () => {
    const syntheticCorpus = twoSourceFixture();
    const syntheticIndex = buildSearchIndex(syntheticCorpus);
    const synthesis = {
      text: 'Project-original comparison of two sources <script>alert(1)</script> with explicit evidence limits.',
      isProjectOriginal: true,
    } as const;
    const guideSynthesis = {
      text: 'A separate project-original guide explains how to verify two sources without extending their evidence claims.',
      isProjectOriginal: true,
    } as const;
    const guideRecord = {
      id: 'guide-accepted',
      slug: 'compare-annotations',
      title: 'Compare source-bound annotations',
      summary: 'A synthetic local-only guide entry.',
      updatedAt: '2026-08-30T12:00:00.000Z',
      sourceMomentIds: syntheticCorpus.moments.map((moment) => moment.id),
      synthesis: guideSynthesis,
    } as const;
    const discovery = {
      topics: [{ slug: 'robots-control', synthesis }],
      guides: [guideRecord],
    } as const;
    const topic = renderTopicPage(
      syntheticCorpus,
      syntheticIndex,
      'robots-control',
      baseUrl,
      synthesis,
      discovery,
    );
    const guide = renderGuidePage(
      syntheticCorpus,
      syntheticIndex,
      baseUrl,
      guideRecord,
      discovery,
    );
    const canonicalPages = [
      renderVideoPage(
        syntheticCorpus,
        syntheticIndex,
        'video-independent-source',
        baseUrl,
        discovery,
      ),
      renderMomentPage(
        syntheticCorpus,
        syntheticIndex,
        'moment-independent-source',
        baseUrl,
        discovery,
      ),
      renderCreatorPage(
        syntheticCorpus,
        syntheticIndex,
        'synthetic-creator',
        baseUrl,
        discovery,
      ),
    ];
    expect(topic).toContain('<meta name="robots" content="index,follow">');
    expect(topic).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(topic).not.toContain('<script>alert(1)</script>');
    expect(topic).toContain('different source URLs');
    expect(topic).not.toContain('independently sourced');
    expect(topic).toContain('/moments/moment-independent-source/');
    expect(topic).toContain('/guides/compare-annotations/');
    expect(guide).toContain('<meta name="robots" content="index,follow">');
    expect(guide).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/video-moment-search/guides/compare-annotations/">',
    );
    expect(guide).toContain('"name":"Compare source-bound annotations"');
    expect(guide).toContain('/videos/independent-source/');
    expect(guide).toContain('/topics/robots-control/');
    for (const canonicalPage of canonicalPages) {
      expect(canonicalPage).toContain('/topics/robots-control/');
      expect(canonicalPage).toContain('/guides/compare-annotations/');
    }
  });

  it('renders topic synthesis from the shared admitted discovery record', () => {
    const syntheticCorpus = twoSourceFixture();
    const synthesis = {
      text: 'Shared project-original synthesis supplied once through discovery routes.',
      isProjectOriginal: true,
    } as const;
    const topic = renderTopicPage(
      syntheticCorpus,
      buildSearchIndex(syntheticCorpus),
      'robots-control',
      baseUrl,
      undefined,
      { topics: [{ slug: 'robots-control', synthesis }] },
    );
    expect(topic).toContain(synthesis.text);
    expect(topic).toContain('<meta name="robots" content="index,follow">');
  });

  it('fails guide page publication closed when the shared set has duplicate metadata', () => {
    const syntheticCorpus = twoSourceFixture();
    const momentIds = syntheticCorpus.moments.map((moment) => moment.id);
    const synthesis = {
      text: 'This project-original guide compares two independent source annotations and explains their separate evidence boundaries clearly.',
      isProjectOriginal: true,
    } as const;
    const guide = {
      id: 'guide-base',
      slug: 'guide-base',
      title: 'Duplicate guide title',
      summary: 'A distinct source-bound guide summary.',
      updatedAt: '2026-08-30T12:00:00.000Z',
      sourceMomentIds: momentIds,
      synthesis,
    } as const;
    const duplicate = {
      ...guide,
      id: 'guide-duplicate',
      slug: 'guide-duplicate',
      summary: 'Another distinct source-bound guide summary.',
      synthesis: {
        text: 'Independent analysis connects reviewed moments while separating provenance context limitations and verification steps carefully.',
        isProjectOriginal: true,
      },
    } as const;
    const duplicateCanonical = {
      ...duplicate,
      id: 'guide-duplicate-canonical',
      slug: guide.slug,
      title: 'A unique title with a duplicate canonical',
    } as const;
    for (const conflictingGuide of [duplicate, duplicateCanonical]) {
      expect(
        renderGuidePage(
          syntheticCorpus,
          buildSearchIndex(syntheticCorpus),
          baseUrl,
          guide,
          { guides: [guide, conflictingGuide] },
        ),
      ).toBeNull();
    }
  });

  it('executes the shipped payload and renders the fixed query as an exact ordinary anchor', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );

    harness.submit('robots control');

    const articles = descendants(harness.results, 'article');
    expect(articles.map((article) => article.dataset.momentId)).toEqual([
      'moment-robots-control',
    ]);
    expect(descendants(articles[0]!, 'a').map((anchor) => anchor.href)).toEqual(
      [
        'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
        'moments/moment-robots-control/',
      ],
    );
    expect(harness.status.textContent).toBe('Showing 1 moment.');
  });

  it('keeps shipped payload ranking equal to phrase-bonus helper ranking', async () => {
    const baseEntry = serializePublicSearchIndex(fixture, searchIndex)
      .entries[0]!;
    const exactPhrase = {
      ...baseEntry,
      momentId: 'moment-exact-phrase',
      videoId: 'video-exact-phrase',
      videoSlug: 'z-exact-phrase',
      sourceUrl: 'https://video.example/watch/exact-phrase',
      videoTitle: 'Research notes',
      startSeconds: 40,
      endSeconds: 70,
      excerpt: 'agent evaluation',
      topicSlugs: ['testing'],
      timestampUrl: 'https://video.example/watch/exact-phrase?t=40',
      timestampStrategy: 'query-parameter' as const,
    };
    const splitTokens = {
      ...baseEntry,
      momentId: 'moment-split-tokens',
      videoId: 'video-split-tokens',
      videoSlug: 'a-split-tokens',
      sourceUrl: 'https://video.example/watch/split-tokens',
      videoTitle: 'Agent systems',
      startSeconds: 20,
      endSeconds: 35,
      excerpt: 'Scoring workflow',
      topicSlugs: ['evaluation'],
      timestampUrl: 'https://video.example/watch/split-tokens?t=20',
      timestampStrategy: 'query-parameter' as const,
    };
    const publicIndex = {
      schemaVersion: 1 as const,
      corpusId: baseEntry.corpusId,
      entries: [splitTokens, exactPhrase],
    };
    const expectedOrder = searchPublicIndex(
      publicIndex,
      'agent evaluation',
    ).map((entry) => entry.momentId);
    expect(expectedOrder).toEqual([
      'moment-exact-phrase',
      'moment-split-tokens',
    ]);
    const harness = executeClientPayload();
    await harness.resolveIndex(publicIndex);

    harness.submit('agent evaluation');

    expect(
      descendants(harness.results, 'article').map(
        (article) => article.dataset.momentId,
      ),
    ).toEqual(expectedOrder);
  });

  it('keeps all shipped equal-score tie breakers equal to the helper/core order', async () => {
    const baseEntry = serializePublicSearchIndex(fixture, searchIndex)
      .entries[0]!;
    const tiedEntries = [
      {
        ...baseEntry,
        momentId: 'moment-z',
        videoId: 'video-b',
        videoSlug: 'b-video',
        sourceUrl: 'https://video.example/watch/b-video',
        videoTitle: 'Agent note',
        startSeconds: 5,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/b-video?t=5',
        timestampStrategy: 'query-parameter' as const,
      },
      {
        ...baseEntry,
        momentId: 'moment-c',
        videoId: 'video-a-later',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-later',
        videoTitle: 'Agent note',
        startSeconds: 20,
        endSeconds: 30,
        timestampUrl: 'https://video.example/watch/a-video-later?t=20',
        timestampStrategy: 'query-parameter' as const,
      },
      {
        ...baseEntry,
        momentId: 'moment-b',
        videoId: 'video-a-same-b',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-same-b',
        videoTitle: 'Agent note',
        startSeconds: 10,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/a-video-same-b?t=10',
        timestampStrategy: 'query-parameter' as const,
      },
      {
        ...baseEntry,
        momentId: 'moment-a',
        videoId: 'video-a-same-a',
        videoSlug: 'a-video',
        sourceUrl: 'https://video.example/watch/a-video-same-a',
        videoTitle: 'Agent note',
        startSeconds: 10,
        endSeconds: 15,
        timestampUrl: 'https://video.example/watch/a-video-same-a?t=10',
        timestampStrategy: 'query-parameter' as const,
      },
    ];
    const publicIndex = {
      schemaVersion: 1 as const,
      corpusId: baseEntry.corpusId,
      entries: tiedEntries,
    };
    const expectedOrder = searchPublicIndex(publicIndex, 'agent').map(
      (entry) => entry.momentId,
    );
    expect(expectedOrder).toEqual([
      'moment-a',
      'moment-b',
      'moment-c',
      'moment-z',
    ]);
    const harness = executeClientPayload();
    await harness.resolveIndex(publicIndex);

    harness.submit('agent');

    expect(
      descendants(harness.results, 'article').map(
        (article) => article.dataset.momentId,
      ),
    ).toEqual(expectedOrder);
  });

  it('routes wrong-shaped and partially malformed loaded indexes to client-error recovery', async () => {
    const wrongShape = executeClientPayload();
    await wrongShape.resolveIndex({ entries: 'not-an-array' });
    expect(wrongShape.error.hidden).toBe(false);
    expect(wrongShape.status.textContent).toContain(
      'initial controlled moments remain below',
    );
    expect(wrongShape.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const partial = executeClientPayload();
    await partial.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        topicSlugs: null,
      })),
    });
    expect(partial.error.hidden).toBe(false);
    expect(() => partial.submit('agent evaluation')).not.toThrow();
    expect(partial.status.textContent).toContain(
      'initial controlled moments remain available below',
    );
  });

  it('rejects invalid source and mismatched timestamp indexes in the shipped payload', async () => {
    const validIndex = serializePublicSearchIndex(fixture, searchIndex);
    const invalidSource = executeClientPayload();
    await invalidSource.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        sourceUrl: 'javascript:alert(1)',
        timestampUrl: 'javascript:alert(1)',
      })),
    });
    expect(invalidSource.error.hidden).toBe(false);
    expect(invalidSource.status.textContent).toContain(
      'initial controlled moments remain below',
    );

    const mismatchedTimestamp = executeClientPayload();
    await mismatchedTimestamp.resolveIndex({
      ...validIndex,
      entries: validIndex.entries.map((entry) => ({
        ...entry,
        timestampUrl: 'https://video.example/watch/agent-evals?t=133',
      })),
    });
    expect(mismatchedTimestamp.error.hidden).toBe(false);
    expect(mismatchedTimestamp.results.children).toEqual([]);
  });

  it('recovers deterministically from rejected and non-OK index fetches', async () => {
    const rejected = executeClientPayload();
    await rejected.rejectFetch();
    expect(rejected.error.hidden).toBe(false);
    expect(rejected.status.textContent).toBe(
      'Interactive search is unavailable; initial controlled moments remain below.',
    );
    expect(rejected.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    const nonOk = executeClientPayload();
    await nonOk.resolveNonOkFetch();
    expect(nonOk.error.hidden).toBe(false);
    expect(nonOk.status.textContent).toBe(
      'Interactive search is unavailable; initial controlled moments remain below.',
    );
    expect(nonOk.serverResults.textContent).toBe(
      'server-rendered initial result',
    );
  });

  it('clears a transient pre-load fallback after valid loading and completes the fixed flow', async () => {
    const harness = executeClientPayload();
    harness.submit('robots control');
    expect(harness.error.hidden).toBe(false);
    expect(harness.serverResults.textContent).toBe(
      'server-rendered initial result',
    );

    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );
    expect(harness.error.hidden).toBe(true);
    expect(harness.status.textContent).toBe(
      'Search is ready. Enter a phrase such as “robots control”.',
    );

    harness.submit('robots control');
    expect(descendants(harness.results, 'article')[0]?.dataset.momentId).toBe(
      'moment-robots-control',
    );
  });

  it('catches unexpected submit-time rendering errors into the same fallback', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );
    harness.failNextRender();

    expect(() => harness.submit('agent evaluation')).not.toThrow();
    expect(harness.error.hidden).toBe(false);
    expect(harness.status.textContent).toContain(
      'initial controlled moments remain available below',
    );
    expect(harness.serverResults.textContent).toBe(
      'server-rendered initial result',
    );
  });

  it('ships a text-only browser renderer with keyboard submit and local asset recovery', () => {
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('textContent');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('replaceChildren');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).not.toContain('innerHTML');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain('search-index.json');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).toContain("addEventListener('submit'");
  });

  it('records the bounded deterministic-route experiment without usability or demand claims', () => {
    const ledger = JSON.parse(
      readFileSync(
        new URL('./product-experiment-ledger.json', import.meta.url),
        'utf8',
      ),
    );
    expect(ledger).toMatchObject({
      siteId: 'video-moment-search',
      evidenceClassification: {
        kind: 'SIMULATED_HEURISTIC_REGRESSION_EVIDENCE',
      },
      experiment: {
        baseline: 'Production route returned 404 before this candidate.',
        target:
          '100% deterministic fixed-flow completion; expected moment appears in the top three; zero timestamp landing error.',
        stopRule:
          'Stop if any result lacks validated rights or exact source-time routing.',
        fixedFlow: {
          query: 'robots control',
          expectedFirstMomentId: 'moment-robots-control',
          expectedTimestampUrl:
            'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
        },
      },
    });
    expect(JSON.stringify(ledger)).toContain(
      'not usability or demand evidence',
    );
    expect(JSON.stringify(ledger)).not.toContain('video.example');
  });
});
