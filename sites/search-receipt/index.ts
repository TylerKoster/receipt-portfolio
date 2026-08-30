import type { SiteDefinition } from '../shared/render.js';

export const searchReceiptSite: SiteDefinition = {
  siteId: 'search-receipt',
  name: 'Search Receipt',
  title: 'Search Receipt · Source-bound status records',
  description:
    'Source-bound controlled examples, not current incident evidence, for search-service status records.',
  proposition:
    'Source-bound records do not establish the cause of a change on your own site; check a verified official source before investigating.',
  interpretationBoundary:
    'A receipt records fields present in one accepted source observation. It can support a decision to investigate, but it does not identify the cause of changes on a particular site.',
  unknowns:
    'No claim is made about traffic, search positions, effects on a specific site, or a recommended response.',
};
