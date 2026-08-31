import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { searchReceiptSite } from './index.js';
import {
  renderSearchReceiptInvestigationHandoff,
  type SourceBoundInvestigationHandoff,
} from './render-investigation-handoff.js';

const handoff = JSON.parse(
  readFileSync(
    new URL('./source-bound-investigation-handoff.json', import.meta.url),
    'utf8',
  ),
) as SourceBoundInvestigationHandoff;

describe('Search Receipt investigation handoff route', () => {
  it('renders the admitted contract as a canonical four-step manual checklist', () => {
    const html = renderSearchReceiptInvestigationHandoff(
      searchReceiptSite,
      handoff,
      'https://tylerkoster.github.io/receipt-portfolio/',
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/checklists/record-before-escalating-google-search-change/">',
    );
    expect(html).toContain(`<title>${handoff.metadata.title}</title>`);
    expect(html).toContain(`<strong>For:</strong> ${handoff.intendedAudience}`);
    expect(html).toContain(`<strong>Decision:</strong> ${handoff.decision}`);
    expect(html).toContain('data-investigation-handoff');
    for (const item of handoff.checklist) {
      expect(html).toContain(`<h3>Step ${item.step}</h3>`);
      expect(html).toContain(item.instruction);
    }
    for (const source of handoff.sourceBindings) {
      expect(html).toContain(`href="${source.endpoint}"`);
      expect(html).toContain(source.citation);
    }
    expect(html).toContain(handoff.boundaries.currentOfficialStatus);
    expect(html).toContain(handoff.boundaries.noCausation);
    expect(html).toContain(handoff.boundaries.privacyAndMeasurement);
    expect(html).toContain('"@type":"HowTo"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<script type="module"');
  });

  it('escapes contract text and refuses any non-adapter-pending contract', () => {
    const hostile = structuredClone(handoff);
    (hostile as { intendedAudience: string }).intendedAudience =
      '<img src=x onerror=alert(1)>';
    (hostile.faqs[0] as { question: string }).question =
      '<script>alert(1)</script>';

    const html = renderSearchReceiptInvestigationHandoff(
      searchReceiptSite,
      hostile,
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');

    const unsupported = structuredClone(handoff);
    (unsupported.publication as { status: string }).status =
      'ROUTE_RELEASE_VERIFIED';
    expect(() =>
      renderSearchReceiptInvestigationHandoff(searchReceiptSite, unsupported),
    ).toThrow(/adapter-pending contract/i);
  });
});
