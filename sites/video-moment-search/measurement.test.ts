import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createMeasurementEvent,
  deliverMeasurementEvent,
  validateExperimentLedger,
} from './measurement.js';
import {
  buildSearchIndex,
  type VideoCorpus,
} from '../../packages/video-moment-core/src/index.js';
import { renderSearchShell } from './render.js';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../fixtures/video-moment-search/authorized-ai-video-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VideoCorpus;
const ledger = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/video-moment-search/experiment-ledger.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('privacy-preserving measurement contract', () => {
  it('constructs a strict allowlisted search payload without query text or personal data', () => {
    const event = createMeasurementEvent('search', {
      pageId: 'search-home',
      resultCount: 4,
      queryTokenCount: 3,
      occurredAt: '2026-08-31T12:00:00.000Z',
      query: 'agent evaluation',
      email: 'person@example.test',
      crossSiteId: 'visitor-7',
      fingerprint: 'canvas-hash',
      unknown: 'discard me',
    });

    expect(event).toEqual({
      schemaVersion: 1,
      eventType: 'search',
      pageId: 'search-home',
      resultCount: 4,
      queryTokenCount: 3,
      occurredAt: '2026-08-31T12:00:00.000Z',
    });
    expect(JSON.stringify(event)).not.toContain('agent evaluation');
    expect(JSON.stringify(event)).not.toContain('person@example.test');
  });

  it.each([
    ['search', { resultCount: 2, queryTokenCount: 2 }],
    ['zero_result', { queryTokenCount: 3 }],
    ['moment_click', { momentId: 'moment-robots-control', resultPosition: 1 }],
    ['creator_referral', { referralCampaignId: 'creator-preview-a' }],
    ['offer_click', { offerId: 'ld-pilot' }],
    ['return_session', { pageId: 'search-home' }],
  ] as const)(
    'constructs the %s event with only its approved fields',
    (eventType, payload) => {
      const event = createMeasurementEvent(eventType, {
        ...payload,
        pageId: 'search-home',
        occurredAt: '2026-08-31T12:00:00.000Z',
        rawQuery: 'robots control',
      });

      expect(event.eventType).toBe(eventType);
      expect(event.pageId).toBe('search-home');
      expect(event.occurredAt).toBe('2026-08-31T12:00:00.000Z');
      expect(JSON.stringify(event)).not.toContain('robots control');
    },
  );

  it('explicitly discards events while no approved measurement endpoint exists', () => {
    const delivery = deliverMeasurementEvent(
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
    );

    expect(delivery).toEqual({
      measurementStatus: 'not-configured',
      disposition: 'discarded',
      eventType: 'moment_click',
    });
  });

  it('rejects an unknown runtime event type without throwing or echoing it', () => {
    const untrustedType: unknown = 'browser-extension-event';

    expect(() =>
      createMeasurementEvent(untrustedType, {
        occurredAt: '2026-08-31T12:00:00.000Z',
        query: 'agent evaluation',
      }),
    ).not.toThrow();
    expect(
      createMeasurementEvent(untrustedType, {
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      schemaVersion: 1,
      eventType: 'browser-extension-event',
      occurredAt: '2026-08-31T12:00:00.000Z',
    },
    {
      schemaVersion: 1,
      eventType: 'search',
      occurredAt: '2026-08-31T12:00:00.000Z',
      query: 'agent evaluation',
    },
  ])(
    'discards fabricated delivery input without echoing its event type',
    (input) => {
      expect(deliverMeasurementEvent(input)).toEqual({
        measurementStatus: 'not-configured',
        disposition: 'discarded',
      });
    },
  );

  it.each([
    [
      'an explicitly undefined numeric field',
      createMeasurementEvent('search', {
        resultCount: 2,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'resultCount',
      undefined,
    ],
    [
      'an invalid numeric field',
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'resultPosition',
      0,
    ],
    [
      'an explicitly undefined string field',
      createMeasurementEvent('moment_click', {
        momentId: 'moment-robots-control',
        resultPosition: 1,
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'momentId',
      undefined,
    ],
    [
      'a malformed string field',
      createMeasurementEvent('creator_referral', {
        referralCampaignId: 'creator-preview-a',
        occurredAt: '2026-08-31T12:00:00.000Z',
      }),
      'referralCampaignId',
      'creator preview',
    ],
  ] as const)(
    'discards a fabricated event with %s',
    (_, event, field, value) => {
      expect(deliverMeasurementEvent({ ...event, [field]: value })).toEqual({
        measurementStatus: 'not-configured',
        disposition: 'discarded',
      });
    },
  );

  it('keeps future measurement hooks non-executing and preserves the released exact source href', () => {
    const html = renderSearchShell(
      fixture,
      buildSearchIndex(fixture),
      'https://receipt-portfolio.example/',
    );

    expect(html).toContain('data-measurement-event="search"');
    expect(html).toContain('data-measurement-status="not-configured"');
    expect(html).toContain('No measurement endpoint is configured');
    expect(html).toContain('data-measurement-event="moment_click"');
    expect(html).toContain(
      'href="https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132"',
    );
    expect(html).not.toContain('name="q"');
    expect(html).not.toContain('?q=');
  });

  it('accepts a ranked 90-day ledger with required metrics, personas, targets, stop rules, and evidence boundaries', () => {
    expect(validateExperimentLedger(ledger).diagnostics).toEqual([]);
  });

  it('rejects active experiments that lose their measurable stop rule or evidence classification', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].stopRule = '';
    invalid.experiments[1].evidenceClassification = 'measured';

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[0].stopRule');
    expect(diagnostics).toContain('experiments[1].evidenceClassification');
  });

  it('rejects an invalid rank, invalid target shape, missing required metric, and an unsupported persona assertion', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].rank = 2;
    invalid.experiments[2].target = {
      classification: 'approved-spec-gate',
      minimumPercent: '80',
    };
    invalid.requiredMetrics = invalid.requiredMetrics.filter(
      (metric: string) => metric !== 'time-to-value',
    );
    invalid.personas[1].testability = 'measured-success';

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[0].rank');
    expect(diagnostics).toContain('experiments[2].target');
    expect(diagnostics).toContain('requiredMetrics');
    expect(diagnostics).toContain('personas[1].testability');
  });

  it('rejects a reordered or substituted experiment even when its rank remains numeric', () => {
    const reordered = structuredClone(ledger);
    [reordered.experiments[0], reordered.experiments[1]] = [
      reordered.experiments[1],
      reordered.experiments[0],
    ];
    const substituted = structuredClone(ledger);
    substituted.experiments[3].id = 'alternate-routing';

    expect(
      validateExperimentLedger(reordered).diagnostics.join('\n'),
    ).toContain('experiments[0].id');
    expect(
      validateExperimentLedger(substituted).diagnostics.join('\n'),
    ).toContain('experiments[3].id');
  });

  it('binds each ranked experiment to its primary metric, required measures, and exact target gate', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[2].metric = 'exact-moment click rate';
    invalid.experiments[2].measures = invalid.experiments[2].measures.filter(
      (metric: string) => metric !== 'time-to-value',
    );
    invalid.experiments[2].target = {
      classification: 'approved-spec-gate',
      minimumPercent: 1,
    };

    const diagnostics =
      validateExperimentLedger(invalid).diagnostics.join('\n');
    expect(diagnostics).toContain('experiments[2].metric');
    expect(diagnostics).toContain('experiments[2].measures');
    expect(diagnostics).toContain('experiments[2].target');
  });

  it('rejects a conflicting legacy continuation gate as a second target source', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].continuationGate = {
      classification: 'approved-spec-gate',
      authorizedCreators: 30,
      coveredVideos: 1_000,
    };

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[0] has unsupported experiment key(s): continuationGate',
    );
  });

  it('rejects an unknown experiment-level key', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[1].operatorNote = 'Treat the target as optional';

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[1] has unsupported experiment key(s): operatorNote',
    );
  });

  it('rejects an experiment with no target', () => {
    const invalid = structuredClone(ledger);
    delete invalid.experiments[2].target;

    expect(validateExperimentLedger(invalid).diagnostics).toContain(
      'experiments[2].target must match the approved gate',
    );
  });

  it.each([
    [0, 'provisional-operator-hypothesis'],
    [4, 'approved-spec-gate'],
  ] as const)(
    'rejects the wrong approved/provisional target classification at experiment index %d',
    (index, classification) => {
      const invalid = structuredClone(ledger);
      invalid.experiments[index].target.classification = classification;

      expect(validateExperimentLedger(invalid).diagnostics).toContain(
        `experiments[${index}].target must match the approved gate`,
      );
    },
  );

  it.each([
    [
      'decimal expansion',
      2,
      { classification: 'approved-spec-gate', minimumPercent: 80.5 },
    ],
    [
      'comma-equivalent click-rate expansion',
      3,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 30000,
        denominator: 'successful-searches',
      },
    ],
    [
      'comma-equivalent impression expansion',
      4,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 100000,
        days: 90,
      },
    ],
    [
      'word expansion',
      6,
      {
        classification: 'approved-spec-gate',
        minimumCommitments: 'One hundred',
        days: 90,
      },
    ],
    [
      'prefix expansion',
      0,
      {
        classification: 'approved-spec-gate',
        authorizedCreators: 13,
        coveredVideos: 100,
      },
    ],
    [
      'suffix representation',
      2,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 80,
        suffix: '%',
      },
    ],
    [
      'negative alternate representation',
      1,
      { classification: 'approved-spec-gate', verifiedMoments: -500 },
    ],
  ] as const)('rejects a target with %s', (_, index, target) => {
    const invalid = structuredClone(ledger);
    invalid.experiments[index].target = target;

    expect(validateExperimentLedger(invalid).diagnostics.join('\n')).toContain(
      `experiments[${index}].target`,
    );
  });

  it.each([
    [
      0,
      {
        classification: 'approved-spec-gate',
        authorizedCreators: 3,
        coveredVideos: 100,
      },
    ],
    [1, { classification: 'approved-spec-gate', verifiedMoments: 500 }],
    [2, { classification: 'approved-spec-gate', minimumPercent: 80 }],
    [
      3,
      {
        classification: 'approved-spec-gate',
        minimumPercent: 30,
        denominator: 'successful-searches',
      },
    ],
    [
      4,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 100,
        days: 90,
      },
    ],
    [
      5,
      {
        classification: 'provisional-operator-hypothesis',
        observationTarget: 10,
        days: 90,
      },
    ],
    [
      6,
      {
        classification: 'approved-spec-gate',
        minimumCommitments: 1,
        days: 90,
      },
    ],
  ] as const)(
    'accepts the exact structured target for rank %d',
    (index, target) => {
      const candidate = structuredClone(ledger);
      candidate.experiments[index].target = target;

      expect(validateExperimentLedger(candidate).diagnostics).toEqual([]);
    },
  );
});
