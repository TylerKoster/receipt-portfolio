import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchReceiptSite } from './index.js';
import { renderSearchReceiptDecisionAidDiscovery } from './render-decision-aid-discovery.js';

const discovery = JSON.parse(
  readFileSync(
    new URL('./source-bound-decision-aid-discovery.json', import.meta.url),
    'utf8',
  ),
);

describe('Search Receipt decision-aid discovery route', () => {
  it('renders an indexable source-bound choice between only the admitted resources', () => {
    const html = renderSearchReceiptDecisionAidDiscovery(
      searchReceiptSite,
      discovery,
      'https://tylerkoster.github.io/receipt-portfolio/',
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/discover/choose-google-search-guide-or-worksheet/">',
    );
    expect(html).toContain(`<title>${discovery.metadata.title}</title>`);
    expect(html).toContain(`content="${discovery.metadata.description}"`);
    expect(html).not.toContain('noindex');
    expect(html).toContain(
      '<h2 id="decision-heading">Choose your next step</h2>',
    );
    expect(html.match(/data-decision-aid-route/g)).toHaveLength(2);
    expect(html).toContain(
      'href="/receipt-portfolio/search-receipt/guides/is-google-search-down-or-my-site/"',
    );
    expect(html).toContain(
      'href="/receipt-portfolio/search-receipt/worksheets/compare-google-search-status-with-site-evidence/"',
    );
    expect(html).toContain('does not state a current status or incident');
    expect(html).toContain('does not diagnose a site change');
    expect(html).toContain('collects, transmits, or retains');
    expect(html).toContain('remains unknown');
    expect(html).toContain('Google Search Status');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).not.toContain('<script type="module"');
  });

  it('escapes admitted contract text and route labels before rendering', () => {
    const hostile = structuredClone(discovery);
    hostile.metadata.title = '<script>alert(1)</script>';
    hostile.decisionAids[0].choiceCriteria = '<img src=x onerror=alert(1)>';

    const html = renderSearchReceiptDecisionAidDiscovery(
      searchReceiptSite,
      hostile,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
