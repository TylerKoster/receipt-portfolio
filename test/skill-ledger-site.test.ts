import { describe, expect, it } from 'vitest';
import {
  renderSkillLedgerPublicInventory,
  skillLedgerSite,
} from '../sites/skill-ledger/index.js';
import { renderMethodology } from '../sites/shared/render.js';

describe('SkillLedger site copy', () => {
  it('states that absent static signals are not evidence of package safety', () => {
    expect(renderMethodology(skillLedgerSite)).toContain(
      'The absence of a recorded static-risk flag or declared dependency is not evidence that a package is safe.',
    );
  });

  it('labels static-risk flags as limited signals instead of a security assessment', () => {
    expect(renderMethodology(skillLedgerSite)).toContain(
      'Static-risk flags are limited signals, not a security assessment.',
    );
  });

  it('renders an accessible deployment-aware controlled inventory route', () => {
    const html = renderSkillLedgerPublicInventory(
      'https://tylerkoster.github.io/receipt-portfolio/',
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/skill-ledger/inventory/">',
    );
    expect(html.match(/data-skill-ledger-public-inventory/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Source-bound skill inventory"');
    expect(html).toContain(
      'One observation tied to a specific microsoft/skills path and commit, plus fictional controlled examples.',
    );
    expect(html).toContain(
      '<noscript><p>Interactive filtering requires JavaScript. Reload after enabling it, or use the static receipt pages.</p></noscript>',
    );
    expect(html).toContain('>Inventory</a>');
    expect(html).toContain(
      '<script type="module" src="/receipt-portfolio/skill-ledger/public-inventory-bootstrap.js"></script>',
    );
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).not.toContain('<script>');
  });
});
