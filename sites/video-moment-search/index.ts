import type { SiteDefinition } from '../shared/render.js';

export const videoMomentSearchSite: SiteDefinition = {
  siteId: 'video-moment-search',
  name: 'AI Moment Index',
  title: 'AI Moment Index · Recover a specific explanation',
  description:
    'Search a controlled source fixture for an exact timestamp in a long AI lecture.',
  proposition:
    'Recover a specific explanation and follow its evidence-bound link to the exact stored second.',
  audience:
    'Developers, product practitioners, and AI educators revisiting a long AI tutorial, webinar, or interview.',
  useCase:
    'You remember an explanation or phrase but not where it appeared in a long video.',
  howTo: [
    'Enter the idea or phrase you remember.',
    'Inspect the ranked moment, rights, provenance, and correction details.',
    'Open the exact source-time link and independently confirm the surrounding context.',
  ],
  outcome:
    'A ranked result with an exact source-time link, source annotation, and visible evidence limits.',
  primaryAction: {
    label: 'Search moments',
    targetId: 'moment-search-controls',
  },
  interpretationBoundary:
    'This route demonstrates deterministic retrieval over one controlled fixture. Review status is displayed only when validated evidence is present; the route does not host media or transcripts or establish a live library, endorsement, usability, demand, or revenue.',
  unknowns:
    'No live creator corpus, user outcome, demand, or revenue is claimed.',
};
