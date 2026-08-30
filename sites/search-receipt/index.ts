import type { SiteDefinition } from '../shared/render.js';

export const searchReceiptSite: SiteDefinition = {
  siteId: 'search-receipt',
  name: 'Search Receipt',
  title: 'Search Receipt · Source-bound status records',
  description:
    'Search source-bound controlled examples by phrase or topic. They are not current incident evidence and do not explain a change on your own site.',
  proposition:
    'Search source-bound controlled examples by phrase or topic. They do not establish the cause of a change on your own site; check a verified official source before investigating.',
  audience:
    'A site owner, SEO practitioner, or support specialist investigating an unexplained search visibility change.',
  useCase:
    'Investigating a search visibility change and deciding what evidence to check before consulting a verified official source and your own site evidence.',
  howTo: [
    'Enter a phrase from the symptom or select a topic.',
    'Open a matching example and note how it separates source facts, interpretation, and unknowns.',
    'Independently check a current official source and your own site evidence; keep the cause unknown unless those facts connect.',
  ],
  outcome:
    'A short list of relevant controlled examples and a safer evidence checklist for the next investigation step.',
  primaryAction: {
    label: 'Search the example records',
    targetId: 'search-controls',
  },
  interpretationBoundary:
    "A receipt captures one admitted observation; it does not prove a current incident or cause for a site change. Before investigating, compare a verified official source's timestamp/status with one's own site evidence; retain uncertainty if that does not establish a connection.",
  unknowns:
    'No claim is made about traffic, search positions, effects on a specific site, or a recommended response.',
};
