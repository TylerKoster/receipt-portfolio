import type { SiteDefinition } from '../shared/render.js';

export const workflowTestLabSite: SiteDefinition = {
  siteId: 'workflow-test-lab',
  name: 'Workflow Test Lab',
  title: 'Workflow Test Lab · Bounded workflow receipts',
  description:
    'Receipt-backed records for a narrow, fixture-tested workflow library.',
  proposition:
    'Review receipt-backed workflow fixture records and their explicit limits before deciding whether to investigate a method.',
  interpretationBoundary:
    'A receipt describes one stored fixture observation and its evidence metadata. It does not extend the observation beyond the stated fixture and task family.',
  unknowns:
    'No claim is made about other fixtures, models, configurations, task families, or operational outcomes.',
};
