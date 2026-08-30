import { describe, expect, it } from 'vitest';
import type { Receipt } from '../../packages/evidence-core/src/index.js';
import { searchReceiptSite } from '../search-receipt/index.js';
import { skillLedgerSite } from '../skill-ledger/index.js';
import { workflowTestLabSite } from '../workflow-test-lab/index.js';
import {
  renderPortfolioHub,
  renderSite,
  type SiteDefinition,
} from './render.js';

const sites = [
  searchReceiptSite,
  workflowTestLabSite,
  skillLedgerSite,
] as const;

const controlledReceipt = (): Receipt => ({
  id: 'a'.repeat(64),
  payload: {
    correction: { kind: 'original' },
    gateInputs: {
      ambiguous: false,
      diffRatio: 0,
      enabled: true,
      evidenceClass: 'controlled-example',
      manifestValid: true,
      normalizedSha256: 'd'.repeat(64),
      publicationMode: 'fixture-example',
      rawSha256: 'c'.repeat(64),
    },
    manifestSha256: 'b'.repeat(64),
    normalizedObjectPath: `objects/normalized/${'d'.repeat(64)}.json`,
    normalizedSha256: 'd'.repeat(64),
    observedAt: '2026-08-30T00:00:00.000Z',
    policy: { decision: 'PASS', reasonCodes: [] },
    provenance: {
      evidenceClass: 'controlled-example',
      diffStrategyId: 'event-list-v1',
      extractionContractId: 'search-status-events-v1',
      extractionSelector: '$[*]',
      normalizerId: 'status-json-v1',
      publicationMode: 'fixture-example',
      publisherName: 'Controlled fixture publisher',
      schemaId: 'search-status-public-v1',
      sourceClass: 'project-original-fixture',
    },
    publicFacts: {
      eventId: 'controlled-incident',
      kind: 'search-status',
      service: 'Crawling',
      startedAt: '2026-08-30T00:00:00.000Z',
      status: 'resolved',
      summary: 'A controlled example.',
    },
    rawObjectPath: `objects/raw/${'c'.repeat(64)}.bin`,
    rawSha256: 'c'.repeat(64),
    schemaVersion: '2.0.0',
    sequence: 1,
    siteId: 'search-receipt',
    sourceId: 'controlled-search-example',
    sourceUrl: 'https://example.invalid/status',
    topicSlug: 'search-status',
    interpretation: 'This is a controlled example.',
    unknowns: ['No current condition is established.'],
  },
});

describe('user-first product orientation', () => {
  it('requires every product to declare an audience, use case, three steps, outcome, and safe CTA', () => {
    for (const site of sites) {
      expect(site.audience.length).toBeGreaterThan(0);
      expect(site.useCase.length).toBeGreaterThan(0);
      expect(site.howTo).toHaveLength(3);
      expect(site.howTo.every((step) => step.length > 0)).toBe(true);
      expect(site.outcome.length).toBeGreaterThan(0);
      expect(site.primaryAction.label.length).toBeGreaterThan(0);
      expect(['search-controls', 'receipts-heading']).toContain(
        site.primaryAction.targetId,
      );
    }
  });

  it('puts an accessible Start here guide and working primary action before technical records', () => {
    for (const site of sites) {
      const html = renderSite(site, []);
      const startIndex = html.indexOf('id="start-here-heading"');
      const recordsIndex = html.indexOf('id="receipts-heading"');

      expect(startIndex).toBeGreaterThan(-1);
      expect(startIndex).toBeLessThan(recordsIndex);
      expect(html).toContain(`<strong>For:</strong> ${site.audience}`);
      expect(html).toContain(`<strong>Use this when:</strong> ${site.useCase}`);
      expect(html).toContain('<h3>How to use it</h3><ol>');
      expect(html).toContain(`<strong>What you get:</strong> ${site.outcome}`);
      expect(html).toContain(
        `class="primary-action" href="#${site.primaryAction.targetId}"`,
      );
      expect(html).toContain(`>${site.primaryAction.label}</a>`);
    }
  });

  it('gives each product a specific truthful job and next action', () => {
    expect(searchReceiptSite.audience).toContain('site owner');
    expect(searchReceiptSite.useCase).toContain('search visibility');
    expect(searchReceiptSite.primaryAction).toEqual({
      label: 'Search the example records',
      targetId: 'search-controls',
    });

    expect(workflowTestLabSite.audience).toContain('workflow designer');
    expect(workflowTestLabSite.useCase).toContain('bounded test');
    expect(workflowTestLabSite.primaryAction).toEqual({
      label: 'Review the workflow example',
      targetId: 'receipts-heading',
    });

    expect(skillLedgerSite.audience).toContain('team lead');
    expect(skillLedgerSite.useCase).toContain('install');
    expect(skillLedgerSite.primaryAction).toEqual({
      label: 'Inspect the package example',
      targetId: 'receipts-heading',
    });
  });

  it('does not imply that a controlled Search example contains a working official-source link', () => {
    const html = renderSite(searchReceiptSite, [controlledReceipt()]);

    expect(html).not.toContain('Use the official source link');
    expect(html).toContain('Independently check a current official source');
  });

  it('escapes onboarding copy and keeps CTA targets constrained to known page anchors', () => {
    const hostile: SiteDefinition = {
      ...searchReceiptSite,
      audience: '<img src=x onerror=alert(1)>',
      useCase: '<script>alert(1)</script>',
      howTo: ['<b>one</b>', 'two & three', '"four"'] as const,
      outcome: "one's result",
      primaryAction: {
        label: '<svg onload=alert(1)>',
        targetId: 'search-controls',
      },
    };

    const html = renderSite(hostile, []);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('two &amp; three');
    expect(html).toContain('href="#search-controls"');
  });

  it('derives task-oriented hub cards from the supplied definitions in supplied order', () => {
    const ordered = [skillLedgerSite, searchReceiptSite] as const;
    const html = renderPortfolioHub(ordered, 'https://example.com/tools/');

    expect(html.indexOf('SkillLedger')).toBeLessThan(
      html.indexOf('Search Receipt'),
    );
    for (const site of ordered) {
      expect(html).toContain(site.name);
      expect(html).toContain(`<strong>For:</strong> ${site.audience}`);
      expect(html).toContain(`<strong>Use it to:</strong> ${site.useCase}`);
      expect(html).toContain(`href="/tools/${site.siteId}/"`);
    }
    expect(html).not.toContain('Workflow Test Lab');
    expect(html).toContain(
      '<meta name="description" content="2 task-oriented evidence products with explicit limits.">',
    );
  });

  it('renders controlled fixture URLs as labeled inert text rather than dead links', () => {
    const html = renderSite(searchReceiptSite, [controlledReceipt()]);

    expect(html).toContain(
      '<span class="fixture-source">Controlled fixture URL: https://example.invalid/status (not a live destination)</span>',
    );
    expect(html).not.toContain('href="https://example.invalid/status"');
  });
});
