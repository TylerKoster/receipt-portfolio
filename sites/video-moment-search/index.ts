import type { SiteDefinition } from '../shared/render.js';

export const videoMomentSearchSite: SiteDefinition = {
  siteId: 'video-moment-search',
  name: 'AI Moment Index',
  title: 'AI Moment Index · Recover a specific explanation',
  description:
    'Search a controlled explicit local-test-license fixture for exact moments in long AI tutorials, webinars, and interviews.',
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
    'A ranked, rights-validated fixture result with an exact source-time link and visible evidence limits.',
  primaryAction: {
    label: 'Search moments',
    targetId: 'moment-search-controls',
  },
  interpretationBoundary:
    'This route demonstrates deterministic retrieval over a controlled fixture. It does not establish a live library, creator permission, usability, demand, or revenue.',
  unknowns:
    'No live creator corpus, public availability, user outcome, demand, or revenue is claimed.',
};
