import type { SiteDefinition } from '../shared/render.js';

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
    label: 'Inspect the package example',
    targetId: 'receipts-heading',
  },
  interpretationBoundary:
    'A receipt records declared and statically observed metadata. Static-risk flags are limited signals, not a security assessment. It does not execute the package or determine how it behaves in another environment.',
  unknowns:
    'The absence of a recorded static-risk flag or declared dependency is not evidence that a package is safe. Runtime behavior, security posture, maintainability, and suitability for adoption remain unknown.',
};
