import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSearchIndex,
  searchMoments,
  validateVideoCorpus,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import {
  renderCreatorPage as renderCreatorPageRaw,
  renderGuidePage as renderGuidePageRaw,
  renderMomentPage as renderMomentPageRaw,
  renderSearchResults as renderSearchResultsRaw,
  renderSearchShell as renderSearchShellRaw,
  renderTopicPage as renderTopicPageRaw,
  renderVideoMomentHome as renderVideoMomentHomeRaw,
  renderVideoPage as renderVideoPageRaw,
  serializePublicSearchIndex as serializePublicSearchIndexRaw,
} from './render.js';
import {
  buildVideoMomentSearchClient,
  searchPublicIndex as searchPublicIndexRaw,
  VIDEO_MOMENT_SEARCH_CLIENT,
} from './search-client.js';
import {
  validateCommonsSourceEvidence,
  type VideoSourceEvidenceManifest,
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
const sourceEvidenceManifest = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/video-source-evidence-manifest-v2.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoSourceEvidenceManifest;
const sourceRightsEvidence = sourceEvidenceManifest.records[0]!;
const baseUrl = 'https://receipt-portfolio.example/';
const searchIndex = buildSearchIndex(fixture);
const validationNow = new Date('2026-08-31T12:00:00.000Z');

function searchPublicIndex(
  index: Parameters<typeof searchPublicIndexRaw>[0],
  query: string,
): ReturnType<typeof searchPublicIndexRaw> {
  return searchPublicIndexRaw(index, query, validationNow);
}

function manifestFor(
  corpus: VideoCorpus,
): VideoSourceEvidenceManifest | undefined {
  const reviewed = corpus.videos.some(
    (video) => video.reviewEvidenceId !== undefined,
  );
  if (!reviewed) return undefined;
  const manifest = structuredClone(sourceEvidenceManifest);
  manifest.corpusId = corpus.corpusId;
  for (const record of manifest.records) {
    record.bindings.corpusId = corpus.corpusId;
  }
  return manifest;
}

function serializePublicSearchIndex(
  ...args: Parameters<typeof serializePublicSearchIndexRaw>
): ReturnType<typeof serializePublicSearchIndexRaw> {
  args[2] ??= manifestFor(args[0]);
  args[3] ??= validationNow;
  return serializePublicSearchIndexRaw(...args);
}

function renderSearchResults(
  ...args: Parameters<typeof renderSearchResultsRaw>
): ReturnType<typeof renderSearchResultsRaw> {
  args[3] ??= manifestFor(args[0]);
  args[4] ??= validationNow;
  return renderSearchResultsRaw(...args);
}

function renderSearchShell(
  ...args: Parameters<typeof renderSearchShellRaw>
): ReturnType<typeof renderSearchShellRaw> {
  args[3] ??= manifestFor(args[0]);
  args[4] ??= validationNow;
  return renderSearchShellRaw(...args);
}

function renderVideoMomentHome(
  ...args: Parameters<typeof renderVideoMomentHomeRaw>
): ReturnType<typeof renderVideoMomentHomeRaw> {
  args[3] ??= manifestFor(args[0]);
  args[4] ??= validationNow;
  return renderVideoMomentHomeRaw(...args);
}

function renderVideoPage(
  ...args: Parameters<typeof renderVideoPageRaw>
): ReturnType<typeof renderVideoPageRaw> {
  args[5] ??= manifestFor(args[0]);
  args[6] ??= validationNow;
  return renderVideoPageRaw(...args);
}

function renderMomentPage(
  ...args: Parameters<typeof renderMomentPageRaw>
): ReturnType<typeof renderMomentPageRaw> {
  args[5] ??= manifestFor(args[0]);
  args[6] ??= validationNow;
  return renderMomentPageRaw(...args);
}

function renderTopicPage(
  ...args: Parameters<typeof renderTopicPageRaw>
): ReturnType<typeof renderTopicPageRaw> {
  args[6] ??= manifestFor(args[0]);
  args[7] ??= validationNow;
  return renderTopicPageRaw(...args);
}

function renderCreatorPage(
  ...args: Parameters<typeof renderCreatorPageRaw>
): ReturnType<typeof renderCreatorPageRaw> {
  args[5] ??= manifestFor(args[0]);
  args[6] ??= validationNow;
  return renderCreatorPageRaw(...args);
}

function renderGuidePage(
  ...args: Parameters<typeof renderGuidePageRaw>
): ReturnType<typeof renderGuidePageRaw> {
  args[5] ??= manifestFor(args[0]);
  args[6] ??= validationNow;
  return renderGuidePageRaw(...args);
}

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

function twoReviewedPublication(): {
  corpus: VideoCorpus;
  manifest: VideoSourceEvidenceManifest;
} {
  const corpus = structuredClone(twoSourceFixture()) as Mutable<VideoCorpus>;
  const evidenceId = 'commons-independent-source-v1';
  const canonical =
    'https://commons.wikimedia.org/wiki/File:Independent_source.webm';
  corpus.videos[1]!.reviewEvidenceId = evidenceId;
  corpus.videos[1]!.timestampStrategy = 'media-fragment';
  corpus.rights[1]!.basis = 'explicit-license';
  corpus.rights[1]!.licenseNote =
    'Synthetic Explicit License 1.0; timestamp link plus original editorial annotation only; no inferred permission or endorsement.';
  corpus.rights[1]!.permissionVerifiedAt = '2026-08-30T00:00:00.000Z';
  corpus.rights[1]!.revocationContact = canonical;
  corpus.rights[1]!.reviewEvidence = {
    classification: 'reviewed-public-source',
    evidenceId,
    licenseIdentifier: 'Synthetic Explicit License 1.0',
    licenseUrl: 'https://license.example/synthetic-1.0',
    canonicalRightsPageUrl: canonical,
    immutableRightsRevisionUrl:
      'https://commons.wikimedia.org/w/index.php?title=File:Independent_source.webm&oldid=1',
    reviewer: 'SyntheticReviewer',
    reviewedOn: '2026-08-30',
    productBoundary: structuredClone(sourceRightsEvidence.productBoundary),
  };

  const manifest = manifestFor(corpus)!;
  const secondRecord = structuredClone(manifest.records[0]!);
  secondRecord.manifestRecordId = 'independent-source-evidence-record-v2';
  secondRecord.evidenceId = evidenceId;
  secondRecord.bindings = {
    corpusId: corpus.corpusId,
    videoId: 'video-independent-source',
    rightsGrantId: 'rights-independent-source',
    momentId: 'moment-independent-source',
    cueId: 'annotation-independent-source-45',
  };
  secondRecord.workTitle = 'Independent controlled source';
  secondRecord.roles = {
    publisher: { id: 'synthetic-creator', name: 'Synthetic Creator' },
    uploader: { id: 'synthetic-uploader', name: 'Synthetic Uploader' },
    attributedCreator: {
      id: 'synthetic-creator',
      name: 'Synthetic Creator',
    },
    rightsAuthority: {
      id: 'synthetic-creator',
      name: 'Synthetic Creator',
      relationship: 'named-licensor',
    },
    evidenceIssuer: {
      id: 'wikimedia-commons',
      name: 'Wikimedia Commons',
    },
  };
  secondRecord.canonicalSourceEvidenceUrl = canonical;
  secondRecord.immutableSourceEvidenceUrl =
    'https://commons.wikimedia.org/w/index.php?title=File:Independent_source.webm&oldid=1';
  secondRecord.license = {
    name: 'Synthetic Explicit License 1.0',
    url: 'https://license.example/synthetic-1.0',
  };
  secondRecord.delivery = {
    url: 'https://video.example/independent-source',
    mediaType: 'video/webm',
    byteLength: 1,
    acceptRanges: 'bytes',
    durationSeconds: 299.5,
  };
  secondRecord.timestamp = {
    strategy: 'media-fragment',
    seconds: 45,
    url: 'https://video.example/independent-source#t=45',
  };
  secondRecord.historicalLicenseReview = {
    issuer: 'Wikimedia Commons',
    reviewer: 'SyntheticReviewer',
    reviewedOn: '2026-08-30',
    finding: 'Synthetic reviewer recorded the explicit license.',
  };
  secondRecord.observedStatus = {
    status: 'source-record-observed',
    observedAt: '2026-08-31T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    sourcePageRevisionId: '2',
    sourcePageRevisionUrl:
      'https://commons.wikimedia.org/w/index.php?title=File:Independent_source.webm&oldid=2',
    sourcePageRevisionAt: '2026-08-30T12:00:00.000Z',
  };
  manifest.records.push(secondRecord);
  return { corpus, manifest };
}

type Mutable<Value> = {
  -readonly [Key in keyof Value]: Mutable<Value[Key]>;
};

type SearchIndexEntry = (typeof searchIndex.entries)[number];
type MutableSearchIndex = {
  entries: Array<
    Omit<SearchIndexEntry, 'moment' | 'video'> & {
      moment: Mutable<SearchIndexEntry['moment']>;
      video: Mutable<SearchIndexEntry['video']>;
    }
  >;
};

type SubmitListener = (event: { preventDefault(): void }) => void;

class FakeHTMLElement {
  static activeElement: FakeHTMLElement | null = null;
  readonly children: FakeHTMLElement[] = [];
  readonly dataset: Record<string, string> = {};
  private readonly clickListeners = new Map<string, (() => void)[]>();
  private elementValue = '';
  className = '';
  disabled = false;
  hidden = false;
  href = '';
  isConnected = false;
  parentElement: FakeHTMLElement | null = null;
  readOnly = false;
  textContent = '';
  type = '';
  focusCount = 0;
  failNextReplace = false;

  constructor(readonly tagName = 'div') {}

  append(...children: FakeHTMLElement[]): void {
    children.forEach((child) => {
      child.parentElement = this;
      child.setConnected(this.isConnected);
    });
    this.children.push(...children);
  }

  replaceChildren(...children: FakeHTMLElement[]): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error('controlled DOM write failure');
    }
    this.children.forEach((child) => {
      child.parentElement = null;
      child.setConnected(false);
    });
    children.forEach((child) => {
      child.parentElement = this;
      child.setConnected(this.isConnected);
    });
    this.children.splice(0, this.children.length, ...children);
  }

  setConnected(isConnected: boolean): void {
    this.isConnected = isConnected;
    this.children.forEach((child) => child.setConnected(isConnected));
  }

  addEventListener(type: string, listener: () => void): void {
    this.clickListeners.set(type, [
      ...(this.clickListeners.get(type) ?? []),
      listener,
    ]);
  }

  click(): void {
    if (!this.disabled)
      this.clickListeners.get('click')?.forEach((listener) => listener());
  }

  focus(): void {
    this.focusCount += 1;
    if (this.isConnected) FakeHTMLElement.activeElement = this;
  }

  get value(): string {
    return this.elementValue;
  }

  set value(value: string) {
    this.elementValue = value;
  }
}

class FakeHTMLFormElement extends FakeHTMLElement {
  private readonly listeners = new Map<string, SubmitListener>();
  private submissionActive = false;
  readonly initializationOrder: string[];
  readonly lastSubmissionOrder: string[] = [];
  lastSubmissionPrevented = false;
  nativeSubmissionCount = 0;

  constructor(initializationOrder: string[] = []) {
    super('form');
    this.initializationOrder = initializationOrder;
  }

  addEventListener(type: string, listener: SubmitListener): void {
    if (type === 'submit') {
      this.initializationOrder.push('submit-listener-installed');
    }
    this.listeners.set(type, listener);
  }

  recordSubmissionEvent(event: string): void {
    if (this.submissionActive) this.lastSubmissionOrder.push(event);
  }

  submit(): void {
    this.lastSubmissionOrder.splice(0);
    this.lastSubmissionPrevented = false;
    this.submissionActive = true;
    this.listeners.get('submit')?.({
      preventDefault: () => {
        this.lastSubmissionPrevented = true;
        this.lastSubmissionOrder.push('preventDefault');
      },
    });
    this.submissionActive = false;
    if (!this.lastSubmissionPrevented) this.nativeSubmissionCount += 1;
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  private controlName = '';
  private controlValue = '';

  constructor(
    private readonly initializationOrder: string[] = [],
    private readonly recordRead: () => void = () => {},
  ) {
    super('input');
  }

  get name(): string {
    return this.controlName;
  }

  set name(value: string) {
    this.controlName = value;
    this.initializationOrder.push(`input-name:${value}`);
  }

  get value(): string {
    this.recordRead();
    return this.controlValue;
  }

  set value(value: string) {
    this.controlValue = value;
  }
}

interface ClientHarness {
  readonly clear: FakeHTMLElement;
  readonly copy: FakeHTMLElement;
  readonly error: FakeHTMLElement;
  readonly form: FakeHTMLFormElement;
  readonly handoffList: FakeHTMLElement;
  readonly handoffStatus: FakeHTMLElement;
  readonly handoffText: FakeHTMLElement;
  readonly initializationOrder: readonly string[];
  readonly input: FakeHTMLInputElement;
  readonly indexRequests: readonly {
    readonly input: string;
    readonly options: unknown;
  }[];
  readonly results: FakeHTMLElement;
  readonly serverResults: FakeHTMLElement;
  readonly status: FakeHTMLElement;
  failNextRender(): void;
  failCopy(): void;
  deferCopy(): void;
  resolveCopy(): void;
  rejectCopy(): void;
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

function byText(
  element: FakeHTMLElement,
  tagName: string,
  text: string,
): FakeHTMLElement | undefined {
  return descendants(element, tagName).find(
    (candidate) => candidate.textContent === text,
  );
}

async function flushClientPromises(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function executeClientPayload(
  payload = buildVideoMomentSearchClient(validationNow),
  runtimeNowMs?: number,
): ClientHarness {
  FakeHTMLElement.activeElement = null;
  const initializationOrder: string[] = [];
  const form = new FakeHTMLFormElement(initializationOrder);
  const input = new FakeHTMLInputElement(initializationOrder, () =>
    form.recordSubmissionEvent('input-value-read'),
  );
  const status = new FakeHTMLElement('p');
  const results = new FakeHTMLElement('div');
  const error = new FakeHTMLElement('p');
  error.hidden = true;
  const handoffList = new FakeHTMLElement('ol');
  const handoffText = new FakeHTMLElement('textarea');
  const handoffStatus = new FakeHTMLElement('p');
  const copy = new FakeHTMLElement('button');
  const clear = new FakeHTMLElement('button');
  const handoff = new FakeHTMLElement('section');
  handoff.dataset.momentPageBase =
    'https://receipt-portfolio.example/video-moment-search/moments/';
  [
    form,
    input,
    status,
    results,
    error,
    handoffList,
    handoffText,
    handoffStatus,
    copy,
    clear,
    handoff,
  ].forEach((element) => element.setConnected(true));
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
  const indexRequests: { input: string; options: unknown }[] = [];
  const selectors = new Map<string, FakeHTMLElement>([
    ['[data-moment-search]', form],
    ['[data-moment-query]', input],
    ['[data-search-status]', status],
    ['[data-client-results]', results],
    ['[data-search-error]', error],
    ['[data-server-results]', serverResults],
    ['[data-moment-page-base]', handoff],
    ['[data-selected-moments]', handoffList],
    ['[data-handoff-text]', handoffText],
    ['[data-handoff-status]', handoffStatus],
    ['[data-copy-handoff]', copy],
    ['[data-clear-handoff]', clear],
  ]);
  let copyFails = false;
  let copyDeferred = false;
  let resolveCopy!: () => void;
  let rejectCopy!: (error: Error) => void;
  const document = {
    createElement: (tagName: string) => new FakeHTMLElement(tagName),
    querySelector: (selector: string) => selectors.get(selector) ?? null,
  };

  const ContextDate =
    runtimeNowMs === undefined
      ? Date
      : class extends Date {
          static override now(): number {
            return runtimeNowMs;
          }
        };
  runInNewContext(payload, {
    document,
    fetch: (input: string, options: unknown) => {
      initializationOrder.push('fetch-started');
      indexRequests.push({ input, options });
      return fetchPromise;
    },
    HTMLElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLFormElement,
    HTMLInputElement: FakeHTMLInputElement,
    isSecureContext: true,
    navigator: {
      clipboard: {
        writeText: () =>
          copyDeferred
            ? new Promise<void>((resolve, reject) => {
                resolveCopy = resolve;
                rejectCopy = reject;
              })
            : copyFails
              ? Promise.reject(new Error('controlled clipboard failure'))
              : Promise.resolve(),
      },
    },
    Date: ContextDate,
    URL,
  });

  return {
    clear,
    copy,
    error,
    form,
    handoffList,
    handoffStatus,
    handoffText,
    initializationOrder,
    input,
    indexRequests,
    results,
    serverResults,
    status,
    failNextRender: () => {
      results.failNextReplace = true;
    },
    failCopy: () => {
      copyFails = true;
    },
    deferCopy: () => {
      copyDeferred = true;
    },
    resolveCopy: () => {
      resolveCopy();
    },
    rejectCopy: () => {
      rejectCopy(new Error('controlled clipboard failure'));
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
  it('admits a complete versioned evidence manifest with exact record bindings and explicit roles', () => {
    expect(
      validateCommonsSourceEvidence(
        fixture,
        sourceEvidenceManifest,
        new Date('2026-08-31T12:00:00.000Z'),
      ),
    ).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects missing, duplicate, orphaned, and stale reviewed evidence sets deterministically', () => {
    expect(() => serializePublicSearchIndexRaw(fixture, searchIndex)).toThrow(
      'Evidence manifest is required for reviewed corpus records',
    );

    const duplicate = structuredClone(sourceEvidenceManifest);
    duplicate.records.push(structuredClone(duplicate.records[0]!));
    expect(
      validateCommonsSourceEvidence(
        fixture,
        duplicate,
        new Date('2026-08-31T12:00:00.000Z'),
      ).diagnostics,
    ).toEqual([
      'SOURCE_EVIDENCE_BINDING_DUPLICATE:commons-how-can-we-keep-robots-under-control-v1',
      'SOURCE_EVIDENCE_ID_DUPLICATE:commons-how-can-we-keep-robots-under-control-v1',
      'SOURCE_EVIDENCE_MANIFEST_ID_DUPLICATE:robots-control-evidence-record-v2',
      'SOURCE_EVIDENCE_RECORD_CARDINALITY_MISMATCH:expected=1:actual=2',
    ]);

    const orphan = structuredClone(sourceEvidenceManifest);
    orphan.records[0]!.bindings.videoId = 'video-orphan';
    expect(
      validateCommonsSourceEvidence(
        fixture,
        orphan,
        new Date('2026-08-31T12:00:00.000Z'),
      ).diagnostics,
    ).toContain(
      'SOURCE_EVIDENCE_VIDEO_BINDING_MISMATCH:commons-how-can-we-keep-robots-under-control-v1',
    );

    const stale = structuredClone(sourceEvidenceManifest);
    stale.records[0]!.observedStatus.expiresAt = '2026-08-31T12:00:00.000Z';
    expect(
      validateCommonsSourceEvidence(
        fixture,
        stale,
        new Date('2026-08-31T12:00:00.000Z'),
      ).diagnostics,
    ).toContain(
      'SOURCE_EVIDENCE_OBSERVATION_EXPIRED:commons-how-can-we-keep-robots-under-control-v1',
    );

    const clockCases = [
      [
        'future',
        (candidate: Mutable<VideoSourceEvidenceManifest>) => {
          candidate.records[0]!.observedStatus.observedAt =
            '2026-08-31T13:00:00.000Z';
        },
        'SOURCE_EVIDENCE_OBSERVATION_FUTURE:commons-how-can-we-keep-robots-under-control-v1',
      ],
      [
        'reversed',
        (candidate: Mutable<VideoSourceEvidenceManifest>) => {
          candidate.records[0]!.observedStatus.expiresAt =
            '2026-08-30T00:00:00.000Z';
        },
        'SOURCE_EVIDENCE_OBSERVATION_REVERSED:commons-how-can-we-keep-robots-under-control-v1',
      ],
      [
        'overlong',
        (candidate: Mutable<VideoSourceEvidenceManifest>) => {
          candidate.records[0]!.observedStatus.expiresAt =
            '2026-12-01T00:00:00.000Z';
        },
        'SOURCE_EVIDENCE_OBSERVATION_WINDOW_TOO_LONG:commons-how-can-we-keep-robots-under-control-v1',
      ],
      [
        'ill-formed',
        (candidate: Mutable<VideoSourceEvidenceManifest>) => {
          candidate.records[0]!.observedStatus.observedAt = '2026-08-31';
        },
        'SOURCE_EVIDENCE_SCHEMA_INVALID:records.0.observedStatus.observedAt',
      ],
    ] as const;
    for (const [name, mutate, diagnostic] of clockCases) {
      const candidate = structuredClone(
        sourceEvidenceManifest,
      ) as Mutable<VideoSourceEvidenceManifest>;
      mutate(candidate);
      expect(
        validateCommonsSourceEvidence(
          fixture,
          candidate,
          new Date('2026-08-31T12:00:00.000Z'),
        ).diagnostics,
        name,
      ).toContain(diagnostic);
    }
  });

  it('validates every record in a multi-record set and rejects swapped or partially invalid bindings', () => {
    const { corpus, manifest } = twoReviewedPublication();
    const now = new Date('2026-08-31T12:00:00.000Z');
    expect(validateCommonsSourceEvidence(corpus, manifest, now)).toEqual({
      ok: true,
      diagnostics: [],
    });

    const swapped = structuredClone(manifest);
    [
      swapped.records[0]!.bindings.videoId,
      swapped.records[1]!.bindings.videoId,
    ] = [
      swapped.records[1]!.bindings.videoId,
      swapped.records[0]!.bindings.videoId,
    ];
    expect(validateCommonsSourceEvidence(corpus, swapped, now).ok).toBe(false);
    expect(
      validateCommonsSourceEvidence(corpus, swapped, now).diagnostics,
    ).toEqual(
      expect.arrayContaining([
        'SOURCE_EVIDENCE_VIDEO_BINDING_MISMATCH:commons-how-can-we-keep-robots-under-control-v1',
        'SOURCE_EVIDENCE_VIDEO_BINDING_MISMATCH:commons-independent-source-v1',
      ]),
    );

    const partial = structuredClone(manifest);
    partial.records[1]!.timestamp.url =
      'https://video.example/independent-source#t=46';
    expect(
      validateCommonsSourceEvidence(corpus, partial, now).diagnostics,
    ).toContain(
      'SOURCE_EVIDENCE_TIMESTAMP_URL_MISMATCH:commons-independent-source-v1',
    );

    const extraGrantCoverage = structuredClone(corpus) as Mutable<VideoCorpus>;
    extraGrantCoverage.rights[0]!.coveredVideoIds.push(
      'video-independent-source',
    );
    expect(
      validateCommonsSourceEvidence(extraGrantCoverage, manifest, now)
        .diagnostics,
    ).toContain(
      'SOURCE_EVIDENCE_GRANT_RELATIONSHIP_MISMATCH:commons-how-can-we-keep-robots-under-control-v1',
    );
  });

  it('requires the manifest on every reviewed rendering path', () => {
    for (const render of [
      () => renderSearchResultsRaw(fixture, searchIndex, 'robots control'),
      () => renderSearchResultsRaw(fixture, searchIndex, '   '),
      () => renderSearchShellRaw(fixture, searchIndex, baseUrl),
      () => renderVideoMomentHomeRaw(fixture, searchIndex, baseUrl),
      () =>
        renderVideoPageRaw(
          fixture,
          searchIndex,
          'video-robots-under-control',
          baseUrl,
        ),
      () =>
        renderMomentPageRaw(
          fixture,
          searchIndex,
          'moment-robots-control',
          baseUrl,
        ),
      () =>
        renderCreatorPageRaw(
          fixture,
          searchIndex,
          'university-of-the-netherlands',
          baseUrl,
        ),
      () => renderGuidePageRaw(fixture, searchIndex, baseUrl),
    ]) {
      expect(render).toThrow(
        'Evidence manifest is required for reviewed corpus records',
      );
    }
  });

  it('rejects stale or forged search indexes before reviewed publication produces output', () => {
    const mutations: readonly [
      string,
      (candidate: MutableSearchIndex) => void,
    ][] = [
      [
        'source URL',
        (candidate) => {
          candidate.entries[0]!.video.sourceUrl =
            'https://attacker.invalid/stale-source.webm';
        },
      ],
      [
        'timestamp',
        (candidate) => {
          candidate.entries[0]!.moment.startSeconds = 131;
        },
      ],
      [
        'title',
        (candidate) => {
          candidate.entries[0]!.video.title = 'Stale title';
        },
      ],
      [
        'creator',
        (candidate) => {
          candidate.entries[0]!.video.creatorName = 'Forged creator';
        },
      ],
      [
        'annotation content',
        (candidate) => {
          candidate.entries[0]!.moment.excerpt = 'Forged annotation';
        },
      ],
    ];

    for (const [name, mutate] of mutations) {
      const candidate = structuredClone(
        searchIndex,
      ) as unknown as MutableSearchIndex;
      mutate(candidate);
      expect(
        () =>
          serializePublicSearchIndexRaw(
            fixture,
            candidate,
            sourceEvidenceManifest,
            validationNow,
          ),
        name,
      ).toThrow('Search index does not match validated corpus');
      let html: string | undefined;
      expect(() => {
        html = renderVideoMomentHomeRaw(
          fixture,
          candidate,
          baseUrl,
          sourceEvidenceManifest,
          validationNow,
        );
      }, name).toThrow('Search index does not match validated corpus');
      expect(html, name).toBeUndefined();
    }
  });

  it('injects deterministic client clocks after expiry while the production adapter reads runtime time', async () => {
    const validIndex = serializePublicSearchIndex(
      fixture,
      searchIndex,
      sourceEvidenceManifest,
      validationNow,
    );
    const afterExpiry = new Date('2026-10-01T00:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(afterExpiry);
    try {
      expect(
        searchPublicIndexRaw(validIndex, 'robots control', validationNow),
      ).not.toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }

    const deterministicHarness = executeClientPayload(
      buildVideoMomentSearchClient(validationNow),
      afterExpiry.getTime(),
    );
    await deterministicHarness.resolveIndex(validIndex);
    expect(deterministicHarness.error.hidden).toBe(true);
    deterministicHarness.submit('robots control');
    expect(deterministicHarness.results.children).not.toHaveLength(0);

    const productionHarness = executeClientPayload(
      buildVideoMomentSearchClient(),
      afterExpiry.getTime(),
    );
    await productionHarness.resolveIndex(validIndex);
    expect(productionHarness.error.hidden).toBe(false);
    productionHarness.submit('robots control');
    expect(productionHarness.results.children).toEqual([]);
  });

  it('preserves exact source, annotation, and product boundaries without network access', () => {
    const serialized = serializePublicSearchIndex(
      fixture,
      searchIndex,
      sourceEvidenceManifest,
      new Date('2026-08-31T12:00:00.000Z'),
    ).entries[0]!;
    expect(serialized.timestampUrl).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    );
    expect(serialized.reviewEvidence).toMatchObject({
      annotationSha256:
        '080c1bf2566fee9fce3db83f35990d76311eb5e2c2ab22fc2d2daf9c917c5fdd',
      observedStatus: {
        status: 'source-record-observed',
        observedAt: '2026-08-31T00:00:00.000Z',
        expiresAt: '2026-09-30T00:00:00.000Z',
      },
      roles: sourceEvidenceManifest.records[0]!.roles,
      productBoundary: sourceRightsEvidence.productBoundary,
    });
  });

  it('renders historical review and fresh observation as different non-permission facts', () => {
    const html = renderVideoMomentHome(
      fixture,
      searchIndex,
      baseUrl,
      sourceEvidenceManifest,
      new Date('2026-08-31T12:00:00.000Z'),
    );
    expect(html).toContain('Historical license review');
    expect(html).toContain('LicenseReviewerBot · 2022-01-18');
    expect(html).toContain('Observed source record');
    expect(html).toContain('2026-08-31T00:00:00.000Z');
    expect(html).not.toMatch(/current (?:permission|availability)/iu);
    expect(html).not.toContain('Source and license availability was reviewed');
    for (const boundary of [
      'hosting',
      'embedding',
      'media distribution',
      'transcript distribution',
      'endorsement claim',
      'inferred permission',
    ]) {
      expect(html).toContain(boundary);
    }
  });

  it('explains the audience and workflow before the enterable search form', () => {
    const html = renderVideoMomentHome(fixture, searchIndex, baseUrl);
    expect(html).toContain(
      '<a class="skip-link" href="#main-content">Skip to main content</a>',
    );
    expect(html).toContain('<input');
    expect(html).not.toContain('name="q"');
    expect(html).toContain('method="get"');
    expect(html).toContain(
      'action="https://receipt-portfolio.example/video-moment-search/"',
    );
    expect(html).toContain(
      'Interactive search requires JavaScript; the admitted initial moments remain available below without sending your query.',
    );
    expect(html).toContain('Search moments');
    expect(html).toContain('<link rel="icon" href="/favicon.ico">');
    expect(html).toContain('#t=132');
    expect(html.indexOf('<strong>For:</strong>')).toBeLessThan(
      html.indexOf('data-moment-query'),
    );
    expect(html.indexOf('<h3>How to use it</h3>')).toBeLessThan(
      html.indexOf('data-moment-query'),
    );
  });

  it('states the historical-review and external-media boundaries truthfully', () => {
    const html = renderVideoMomentHome(
      fixture,
      searchIndex,
      baseUrl,
      sourceEvidenceManifest,
    );
    expect(html).toContain(
      'Historical license review dates: 2022-01-18. Fresh source-record observation windows: 2026-08-31T00:00:00.000Z through 2026-09-30T00:00:00.000Z.',
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
    expect(html).not.toContain('name="q"');
    expect(VIDEO_MOMENT_SEARCH_CLIENT).not.toMatch(
      /localStorage|sessionStorage|pushState|replaceState|location\.search|sendBeacon|analytics/u,
    );
  });

  it('renders the fixed query with the reviewed moment first and exact source second', () => {
    const html = renderSearchResults(
      fixture,
      searchIndex,
      'robots control',
      sourceEvidenceManifest,
    );
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
      validateCommonsSourceEvidence(
        fixture,
        sourceEvidenceManifest,
        validationNow,
      ),
    ).toEqual({
      ok: true,
      diagnostics: [],
    });
    expect(sourceRightsEvidence).toMatchObject({
      manifestRecordId: 'robots-control-evidence-record-v2',
      evidenceId: 'commons-how-can-we-keep-robots-under-control-v1',
      workTitle: 'How can we keep robots under control?',
      roles: {
        publisher: { name: 'University of the Netherlands' },
        uploader: { name: 'PJ Geest' },
        attributedCreator: { name: 'University of the Netherlands' },
        rightsAuthority: {
          name: 'University of the Netherlands',
          relationship: 'named-licensor',
        },
        evidenceIssuer: { name: 'Wikimedia Commons' },
      },
      canonicalSourceEvidenceUrl:
        'https://commons.wikimedia.org/wiki/File:How_can_we_keep_robots_under_control.webm',
      immutableSourceEvidenceUrl:
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
      historicalLicenseReview: {
        issuer: 'Wikimedia Commons',
        reviewer: 'LicenseReviewerBot',
        reviewedOn: '2022-01-18',
      },
      observedStatus: {
        status: 'source-record-observed',
        observedAt: '2026-08-31T00:00:00.000Z',
        expiresAt: '2026-09-30T00:00:00.000Z',
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
    const evidence = sourceRightsEvidence;
    expect(fixture.videos[0]).toMatchObject({
      title: evidence.workTitle,
      creatorName: evidence.roles.attributedCreator.name,
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

    const publicEntry = serializePublicSearchIndex(
      fixture,
      searchIndex,
      sourceEvidenceManifest,
    ).entries[0] as ReturnType<
      typeof serializePublicSearchIndex
    >['entries'][number] & {
      reviewEvidence?: unknown;
    };
    expect(publicEntry.reviewEvidence).toMatchObject({
      evidenceId: evidence.evidenceId,
      roles: evidence.roles,
      observedStatus: evidence.observedStatus,
    });
    expect(publicEntry.rightsStatus).toContain(evidence.license.name);
    expect(publicEntry.verificationDate).toBe(
      evidence.observedStatus.observedAt,
    );
    expect(publicEntry.provenance).toContain(evidence.evidenceId);
    expect(publicEntry.provenance).toContain(
      evidence.immutableSourceEvidenceUrl,
    );
    expect(publicEntry.provenance).toContain(
      evidence.historicalLicenseReview.reviewer,
    );

    const html = renderSearchResults(
      fixture,
      searchIndex,
      'robots control',
      sourceEvidenceManifest,
    );
    for (const value of [
      evidence.evidenceId,
      evidence.license.name,
      evidence.license.url,
      evidence.immutableSourceEvidenceUrl.replace('&', '&amp;'),
      evidence.historicalLicenseReview.reviewer,
      evidence.historicalLicenseReview.reviewedOn,
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
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.annotation.text =
            'Unsupported standalone 02:12 claim.'),
      ],
      [
        'annotation hash',
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.annotation.sha256 = '0'.repeat(64)),
      ],
      [
        'source linkage',
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.delivery.url =
            'https://example.test/drifted.webm'),
      ],
      [
        'timestamp linkage',
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.timestamp.seconds = 133),
      ],
      [
        'rights linkage',
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.license.name = 'CC0 1.0'),
      ],
      [
        'binding relationship',
        (candidate: Mutable<VideoSourceEvidenceManifest>) =>
          (candidate.records[0]!.bindings.cueId = 'unsupported-cue'),
      ],
    ] as const;

    for (const [name, invalidate] of invalidEvidence) {
      const candidate = structuredClone(
        sourceEvidenceManifest,
      ) as Mutable<VideoSourceEvidenceManifest>;
      invalidate(candidate);
      expect(
        validateCommonsSourceEvidence(fixture, candidate, validationNow).ok,
        name,
      ).toBe(false);
      expect(
        () => serializePublicSearchIndex(fixture, searchIndex, candidate),
        name,
      ).toThrow('Invalid evidence manifest');
      let html: string | undefined;
      expect(() => {
        html = renderVideoMomentHome(fixture, searchIndex, baseUrl, candidate);
      }, name).toThrow('Invalid evidence manifest');
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
      entry.verificationDate = review.observedStatus.observedAt;
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
      [
        'empty publisher identity',
        (entry) => (entry.reviewEvidence!.roles.publisher.name = ''),
      ],
      [
        'malformed observed timestamp',
        (entry) => {
          entry.reviewEvidence!.observedStatus.observedAt = '2026-08-31';
        },
      ],
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
      ).toThrow('Invalid evidence manifest');
      let html: string | undefined;
      expect(() => {
        html = renderVideoMomentHome(candidate, searchIndex, baseUrl);
      }, name).toThrow('Invalid evidence manifest');
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
      'Observed at',
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
        'Historical license review dates: 2022-01-18',
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
    expect(harness.initializationOrder).toEqual([
      'submit-listener-installed',
      'input-name:q',
      'fetch-started',
    ]);
    expect(harness.input.name).toBe('q');
    expect(harness.indexRequests).toEqual([
      { input: 'search-index.json', options: { credentials: 'omit' } },
    ]);
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex),
    );

    harness.submit('robots control');
    expect(harness.form.lastSubmissionOrder.slice(0, 2)).toEqual([
      'preventDefault',
      'input-value-read',
    ]);
    expect(harness.form.lastSubmissionPrevented).toBe(true);
    expect(harness.form.nativeSubmissionCount).toBe(0);

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

  it('keeps one reviewed fixed-flow moment in a page-memory-only timestamp and rights handoff', async () => {
    const harness = executeClientPayload();
    expect(harness.handoffList.children).toEqual([]);
    expect(harness.handoffText.readOnly).toBe(true);
    expect(harness.copy.disabled).toBe(true);
    expect(harness.clear.disabled).toBe(true);

    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex, sourceEvidenceManifest),
    );
    harness.submit('robots control');
    const result = descendants(harness.results, 'article')[0]!;
    expect(result.dataset.momentId).toBe('moment-robots-control');
    const add = byText(result, 'button', 'Add to temporary handoff');
    expect(add?.disabled).toBe(false);
    add?.click();

    expect(harness.handoffList.children).toHaveLength(1);
    expect(harness.handoffList.children[0]?.textContent).toContain(
      'How can we keep robots under control?',
    );
    expect(harness.handoffList.children[0]?.dataset).toEqual({});
    expect(harness.copy.disabled).toBe(false);
    expect(harness.clear.disabled).toBe(false);
    expect(harness.handoffText.value).toContain(
      'Source title: How can we keep robots under control?',
    );
    expect(harness.handoffText.value).toContain(
      'Creator: University of the Netherlands',
    );
    expect(harness.handoffText.value).toContain('Stored interval: 2:12–2:13');
    expect(harness.handoffText.value).toContain(
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132',
    );
    expect(harness.handoffText.value).toContain(
      'https://receipt-portfolio.example/video-moment-search/moments/moment-robots-control/',
    );
    expect(harness.handoffText.value).toContain(
      'Evidence ID: commons-how-can-we-keep-robots-under-control-v1',
    );
    expect(harness.handoffText.value).toContain(
      'License: CC BY-SA 4.0 International',
    );
    expect(harness.handoffText.value).toContain(
      'Immutable rights revision: https://commons.wikimedia.org/w/index.php?title=File:How_can_we_keep_robots_under_control.webm&oldid=1000389530',
    );
    expect(harness.handoffText.value).toContain(
      'Historical review date: 2022-01-18',
    );
    expect(harness.handoffText.value).toContain(
      'Included: timestamp link, original editorial annotation',
    );
    expect(harness.handoffText.value).toContain(
      'Excluded: hosting, embedding, media distribution, transcript distribution, endorsement claim, inferred permission',
    );
    expect(harness.handoffText.value).toContain('Correction state: active');
    expect(harness.handoffText.value).not.toContain('robots control');

    harness.submit('robots control');
    expect(
      byText(
        descendants(harness.results, 'article')[0]!,
        'button',
        'Add to temporary handoff',
      ),
    ).toBeUndefined();
    expect(harness.handoffList.children).toHaveLength(1);
    harness.failCopy();
    harness.copy.click();
    await flushClientPromises();
    expect(harness.handoffText.value).toContain('Evidence ID:');
    expect(harness.handoffStatus.textContent).toContain('manual copying');

    harness.clear.click();
    expect(harness.handoffList.children).toEqual([]);
    expect(harness.handoffText.value).toBe('');
    expect(harness.clear.disabled).toBe(true);
    expect(harness.handoffStatus.textContent).toContain('cleared');
    expect(harness.handoffStatus.focusCount).toBeGreaterThan(0);
    expect(executeClientPayload().handoffList.children).toEqual([]);
  });

  it('keeps Clear authoritative when a deferred clipboard copy resolves afterward', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex, sourceEvidenceManifest),
    );
    harness.submit('robots control');
    byText(
      descendants(harness.results, 'article')[0]!,
      'button',
      'Add to temporary handoff',
    )?.click();
    harness.deferCopy();
    harness.copy.click();
    harness.clear.click();

    harness.resolveCopy();
    await flushClientPromises();

    expect(harness.handoffStatus.textContent).toBe(
      'Temporary handoff cleared.',
    );
    expect(harness.handoffList.children).toEqual([]);
    expect(harness.handoffText.value).toBe('');
    expect(harness.clear.disabled).toBe(true);
    expect(FakeHTMLElement.activeElement).toBe(harness.handoffStatus);
  });

  it('keeps Clear authoritative when a deferred clipboard copy rejects afterward', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex, sourceEvidenceManifest),
    );
    harness.submit('robots control');
    byText(
      descendants(harness.results, 'article')[0]!,
      'button',
      'Add to temporary handoff',
    )?.click();
    harness.deferCopy();
    harness.copy.click();
    harness.clear.click();

    harness.rejectCopy();
    await flushClientPromises();

    expect(harness.handoffStatus.textContent).toBe(
      'Temporary handoff cleared.',
    );
    expect(harness.handoffList.children).toEqual([]);
    expect(harness.handoffText.value).toBe('');
    expect(harness.clear.disabled).toBe(true);
    expect(FakeHTMLElement.activeElement).toBe(harness.handoffStatus);
  });

  it('updates the focused handoff control in place for add and remove', async () => {
    const harness = executeClientPayload();
    await harness.resolveIndex(
      serializePublicSearchIndex(fixture, searchIndex, sourceEvidenceManifest),
    );
    harness.submit('robots control');
    const control = byText(
      descendants(harness.results, 'article')[0]!,
      'button',
      'Add to temporary handoff',
    );
    expect(control).toBeDefined();
    if (control === undefined) throw new Error('expected the handoff control');

    control.focus();
    expect(FakeHTMLElement.activeElement).toBe(control);
    control.click();
    expect(control.isConnected).toBe(true);
    expect(FakeHTMLElement.activeElement).toBe(control);
    expect(control.textContent).toBe('Remove from temporary handoff');
    expect(harness.handoffList.children).toHaveLength(1);

    control.click();
    expect(harness.handoffList.children).toEqual([]);
    expect(harness.handoffText.value).toBe('');
    expect(control.isConnected).toBe(true);
    expect(FakeHTMLElement.activeElement).toBe(control);
    expect(control.textContent).toBe('Add to temporary handoff');
  });

  it('does not expose a handoff add control for unreviewed or malformed public-index entries', async () => {
    const unreviewedCorpus = twoSourceFixture();
    const unreviewed = executeClientPayload();
    await unreviewed.resolveIndex(
      serializePublicSearchIndex(
        unreviewedCorpus,
        buildSearchIndex(unreviewedCorpus),
      ),
    );
    unreviewed.submit('independent source');
    expect(
      byText(
        descendants(unreviewed.results, 'article')[0]!,
        'button',
        'Add to temporary handoff',
      ),
    ).toBeUndefined();
    expect(unreviewed.handoffList.children).toEqual([]);

    const malformed = executeClientPayload();
    const valid = serializePublicSearchIndex(
      fixture,
      searchIndex,
      sourceEvidenceManifest,
    );
    await malformed.resolveIndex({
      ...valid,
      entries: valid.entries.map((entry) => ({
        ...entry,
        reviewEvidence: { ...entry.reviewEvidence, reviewedOn: 'not-a-date' },
      })),
    });
    malformed.submit('robots control');
    expect(malformed.results.children).toEqual([]);
    expect(malformed.handoffList.children).toEqual([]);
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
