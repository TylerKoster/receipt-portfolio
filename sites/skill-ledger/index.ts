import { renderStaticPage, type SiteDefinition } from '../shared/render.js';

export const skillLedgerSite: SiteDefinition = {
  siteId: 'skill-ledger',
  name: 'SkillLedger',
  title: 'SkillLedger · Static package metadata receipts',
  description:
    'Receipt-backed static metadata for reusable skill packages, without execution.',
  proposition:
    'Inspect receipt-backed package metadata and static flags without installing, executing, or certifying a skill.',
  audience:
    'A team lead, developer, or automation owner screening a skill package before deciding whether it deserves deeper review.',
  useCase:
    'Screening declared package metadata and static signals before you install or execute anything.',
  howTo: [
    'Open the package example and confirm the source binding and observed timestamp.',
    'Review declared license, dependencies, hashes, and static-signal presence.',
    'Treat the record as a screening input, then perform separate security and runtime evaluation before adoption.',
  ],
  outcome:
    'A source-bound metadata checklist for deciding whether to continue, hold, or reject deeper package evaluation.',
  primaryAction: {
    label: 'Open the interactive inventory',
    targetId: 'receipts-heading',
    path: '/inventory/',
  },
  interpretationBoundary:
    'A receipt records declared and statically observed metadata. Static-risk flags are limited signals, not a security assessment. It does not execute the package or determine how it behaves in another environment.',
  unknowns:
    'The absence of a recorded static-risk flag or declared dependency is not evidence that a package is safe. Runtime behavior, security posture, maintainability, and suitability for adoption remain unknown.',
};

export function renderSkillLedgerPublicInventory(
  publicBaseUrl?: string,
): string {
  return renderStaticPage(
    skillLedgerSite,
    {
      path: '/inventory/',
      title: 'Controlled skill inventory · SkillLedger',
      description:
        'Filter and compare controlled source-bound skill package metadata without installing or executing a package.',
      body: `<section class="start-here information-panel" aria-labelledby="inventory-start-heading"><p class="eyebrow">Interactive controlled preview</p><h2 id="inventory-start-heading">Screen source-bound package metadata</h2><p><strong>For:</strong> ${skillLedgerSite.audience}</p><p><strong>Use this when:</strong> ${skillLedgerSite.useCase}</p><h3>How to use it</h3><ol><li>Enter a package or source phrase and apply declared-metadata filters.</li><li>Select up to two records to compare their source bindings, hashes, and static signals.</li><li>Use the result only to decide what deserves separate security and runtime review.</li></ol><p><strong>What you get:</strong> An in-page comparison of two controlled source-bound examples.</p><p class="boundary"><strong>Evidence boundary:</strong> The records are controlled examples. They are not current package listings, recommendations, safety assessments, adoption evidence, or revenue evidence.</p></section><section data-skill-ledger-public-inventory aria-label="Controlled source-bound skill inventory"><h2>Controlled source-bound skill inventory</h2><p>Interactive filtering is loading. The records are controlled examples.</p><noscript><p>Interactive filtering requires JavaScript. Reload after enabling it, or use the static receipt pages.</p></noscript></section>`,
      scriptPath: '/public-inventory-adapter.js',
    },
    publicBaseUrl,
  );
}
