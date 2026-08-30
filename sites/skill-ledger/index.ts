import type { SiteDefinition } from '../shared/render.js';

export const skillLedgerSite: SiteDefinition = {
  siteId: 'skill-ledger',
  name: 'SkillLedger',
  title: 'SkillLedger · Static package metadata receipts',
  description:
    'Receipt-backed static metadata for reusable skill packages, without execution.',
  proposition:
    'Inspect receipt-backed package metadata and static flags without installing, executing, or certifying a skill.',
  interpretationBoundary:
    'A receipt records declared and statically observed metadata. It does not execute the package or determine how it behaves in another environment.',
  unknowns:
    'The absence of a recorded static-risk flag or declared dependency is not evidence that a package is safe. Runtime behavior, security posture, maintainability, and suitability for adoption remain unknown.',
};
