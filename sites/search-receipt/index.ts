import type { SiteDefinition } from '../shared/render.js';

export const searchReceiptSite: SiteDefinition = {
  siteId: 'search-receipt',
  name: 'Search Receipt',
  title: 'Search Receipt · Source-bound status records',
  description:
    'Source-bound evidence receipts for observed search-service status changes.',
  proposition:
    'Inspect source-bound records of observed search-service status changes without turning them into claims about search performance.',
  interpretationBoundary:
    'A receipt records fields present in one accepted source observation. It can support a decision to investigate, but it does not identify the cause of changes on a particular site.',
  unknowns:
    'No claim is made about traffic, search positions, effects on a specific site, or a recommended response.',
};
