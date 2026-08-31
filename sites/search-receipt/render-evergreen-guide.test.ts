import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchReceiptSite } from './index.js';
import { renderSearchReceiptEvergreenGuide } from './render-evergreen-guide.js';

const guide = JSON.parse(
  readFileSync(
    new URL('./source-bound-evergreen-guide.json', import.meta.url),
    'utf8',
  ),
);

describe('Search Receipt evergreen guide route', () => {
  it('renders the admitted guide as a self-canonical indexable decision page', () => {
    const html = renderSearchReceiptEvergreenGuide(
      searchReceiptSite,
      guide,
      'https://tylerkoster.github.io/receipt-portfolio/',
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/guides/is-google-search-down-or-my-site/">',
    );
    expect(html).toContain(`<title>${guide.metadata.title}</title>`);
    expect(html).toContain(`content="${guide.metadata.description}"`);
    expect(html).toContain(
      '<h2 id="guide-workflow-heading">Three evidence checks</h2>',
    );
    for (const step of guide.workflow) {
      expect(html).toContain(`<li>${step.instruction}</li>`);
    }
    expect(html).toContain(
      'This guide does not report a current status or incident.',
    );
    expect(html).toContain(
      'A matching record does not explain a change on your own site.',
    );
    expect(html).toContain('https://status.search.google.com/incidents.json');
    expect(html).toContain('https://feeds.feedburner.com/blogspot/amDG');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"mainEntity"');
  });

  it('escapes contract text before rendering it into HTML', () => {
    const hostile = structuredClone(guide);
    hostile.intendedAudience = '<img src=x onerror=alert(1)>';
    hostile.faqs[0].question = '<script>alert(1)</script>';

    const html = renderSearchReceiptEvergreenGuide(searchReceiptSite, hostile);

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
