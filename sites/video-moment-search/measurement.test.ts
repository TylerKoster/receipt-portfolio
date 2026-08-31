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

  it('rejects an invalid rank, nonnumeric target, missing required metric, and an unsupported persona assertion', () => {
    const invalid = structuredClone(ledger);
    invalid.experiments[0].rank = 2;
    invalid.experiments[2].target = 'improve relevance later';
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
});
