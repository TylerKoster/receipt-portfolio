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
      title: 'Source-bound skill inventory · SkillLedger',
      description:
        'Filter and compare one immutable source-bound skill observation with controlled examples, without installing or executing a package.',
      body: `<section class="start-here information-panel" aria-labelledby="inventory-start-heading"><p class="eyebrow">Source-bound inventory with controlled examples</p><h2 id="inventory-start-heading">Screen declared skill metadata before deeper review</h2><p><strong>For:</strong> ${skillLedgerSite.audience}</p><p><strong>Use this when:</strong> You need to decide whether a skill deserves separate security and runtime review before installation.</p><h3>How to use it</h3><ol><li>Filter by skill, publisher, source, or declared metadata.</li><li>Compare the immutable source-bound observation with a clearly labeled controlled example.</li><li>Use the result only to choose the next review step; do not treat it as evidence of safety, endorsement, or suitability.</li></ol><p><strong>What you get:</strong> One observation tied to a specific microsoft/skills path and commit, plus fictional controlled examples.</p><p class="boundary"><strong>Evidence boundary:</strong> The source-bound observation reports declared metadata at the displayed path, commit, and observation time. It does not verify currentness or provenance and is not a safety assessment, recommendation, or Microsoft endorsement. Controlled examples are fictional and are not package listings.</p></section><section data-skill-ledger-public-inventory aria-label="Source-bound skill inventory"><h2>Source-bound skill inventory</h2><p>Interactive filtering is loading.</p><noscript><p>Interactive filtering requires JavaScript. Reload after enabling it, or use the static receipt pages.</p></noscript></section>`,
      scriptPath: '/public-inventory-bootstrap.js',
    },
    publicBaseUrl,
  );
}
