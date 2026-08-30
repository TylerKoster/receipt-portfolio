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
    "A receipt captures one admitted observation; it does not prove a current incident or cause for a site change. Before investigating, compare a verified official source's timestamp/status with one's own site evidence; retain uncertainty if that does not establish a connection.",
  unknowns:
    'No claim is made about traffic, search positions, effects on a specific site, or a recommended response.',
};
