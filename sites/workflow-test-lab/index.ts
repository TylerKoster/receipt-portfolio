import type { SiteDefinition } from '../shared/render.js';

export const workflowTestLabSite: SiteDefinition = {
  siteId: 'workflow-test-lab',
  name: 'Workflow Test Lab',
  title: 'Workflow Test Lab · Bounded workflow receipts',
  description:
    'Receipt-backed records for a narrow, fixture-tested workflow library.',
  proposition:
    'Review receipt-backed workflow fixture records and their explicit limits before deciding whether to investigate a method.',
  audience:
    'A workflow designer, product operator, or team lead deciding whether a method deserves a bounded test.',
  useCase:
    'Planning a bounded test for a workflow method without treating a fixture result as proof it will work for your team.',
  howTo: [
    'Open the workflow example that is closest to the task you are considering.',
    'Review its expected fields, negative constraints, and stated unknowns.',
    'Use those boundaries to design a small test in your own environment before adoption.',
  ],
  outcome:
    'A testable workflow hypothesis with explicit constraints and no implied production-readiness claim.',
  primaryAction: {
    label: 'Review the workflow example',
    targetId: 'receipts-heading',
  },
  interpretationBoundary:
    'A receipt describes one stored fixture observation and its evidence metadata. It does not extend the observation beyond the stated fixture and task family.',
  unknowns:
    'No claim is made about other fixtures, models, configurations, task families, or operational outcomes.',
};
