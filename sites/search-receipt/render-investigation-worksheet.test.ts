import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchReceiptSite } from './index.js';
import {
  renderSearchReceiptInvestigationWorksheet,
  type SourceBoundInvestigationWorksheet,
} from './render-investigation-worksheet.js';

const worksheet = JSON.parse(
  readFileSync(
    new URL('./source-bound-investigation-worksheet.json', import.meta.url),
    'utf8',
  ),
) as SourceBoundInvestigationWorksheet;

describe('Search Receipt investigation worksheet route', () => {
  it('renders an indexable, enterable, privacy-bounded worksheet', () => {
    const html = renderSearchReceiptInvestigationWorksheet(
      searchReceiptSite,
      worksheet,
      'https://tylerkoster.github.io/receipt-portfolio/',
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/worksheets/compare-google-search-status-with-site-evidence/">',
    );
    expect(html).toContain('data-investigation-worksheet');
    expect(html).toContain('data-worksheet-field');
    expect(html).toContain('<strong>Use this when:</strong>');
    expect(html).toContain('<h3>How to use it</h3><ol>');
    expect(html).toContain('Record what the official source showed');
    expect(html).toContain('Record dated evidence from your own site');
    expect(html).toContain('Keep the conclusion unknown');
    expect(html).toContain('does not collect, transmit, or retain');
    expect(html).toContain(
      '<script type="module" src="/receipt-portfolio/search-receipt/investigation-worksheet.js"></script>',
    );
    expect(html).toContain('"@type":"HowTo"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain(
      '<button type="button" data-worksheet-clear disabled>Clear worksheet</button>',
    );
    expect(html.indexOf('<noscript>')).toBeLessThan(
      html.indexOf('<form class="worksheet-form"'),
    );
  });

  it('escapes contract content before rendering it', () => {
    const hostile = structuredClone(worksheet);
    (hostile.metadata as { title: string }).title = '<script>alert(1)</script>';
    const html = renderSearchReceiptInvestigationWorksheet(
      searchReceiptSite,
      hostile,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
