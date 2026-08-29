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
    'No claim is made about runtime behavior, security posture, maintainability, or suitability for adoption.',
};
