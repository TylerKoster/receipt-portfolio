export interface SourceBoundInvestigationHandoffManifest {
  readonly sourceId: string;
  readonly endpoint: string;
}

export interface SourceBoundInvestigationHandoffValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

interface SourceBindingCandidate {
  readonly sourceId?: string;
  readonly endpoint?: string;
  readonly purpose?: string;
  readonly citation?: string;
}

interface BoundTextCandidate {
  readonly sourceBindingIds?: readonly string[];
}

interface SourceBoundInvestigationHandoffCandidate {
  readonly id?: string;
  readonly schemaVersion?: number;
  readonly queryIntent?: string;
  readonly intendedAudience?: string;
  readonly decision?: string;
  readonly metadata?: {
    readonly title?: string;
    readonly description?: string;
    readonly canonicalSlugProposal?: string;
  };
  readonly sourceBindings?: readonly SourceBindingCandidate[];
  readonly checklist?: readonly (BoundTextCandidate & {
    readonly step?: number;
    readonly kind?: string;
    readonly instruction?: string;
  })[];
  readonly factualStatements?: readonly (BoundTextCandidate & {
    readonly text?: string;
  })[];
  readonly boundaries?: {
    readonly currentOfficialStatus?: string;
    readonly historicalControlledExamples?: string;
    readonly ownSiteEvidence?: string;
    readonly noCausation?: string;
    readonly unknowns?: readonly string[];
    readonly privacyAndMeasurement?: string;
  };
  readonly faqs?: readonly (BoundTextCandidate & {
    readonly question?: string;
    readonly answer?: string;
  })[];
  readonly correctionAndCurrentnessPolicy?: string;
  readonly publication?: {
    readonly status?: string;
    readonly adapter?: string;
    readonly coordinatorDependency?: string;
    readonly route?: string;
    readonly coordinatorReleaseEvidence?: unknown;
  };
}

const approvedSourceBindings: Readonly<Record<string, string>> = Object.freeze({
  'google-search-status': 'https://status.search.google.com/incidents.json',
  'google-search-central-blog': 'https://feeds.feedburner.com/blogspot/amDG',
});

const approvedHandoffContract = {
  schemaVersion: 1,
  id: 'source-bound-investigation-handoff-v1',
  queryIntent: 'What should I record before escalating a Google Search change?',
  intendedAudience:
    'Site owners and team members preparing a manual, evidence-bounded handoff before escalating an unexplained Google Search change.',
  decision:
    'Decide what to record before escalating a Google Search change, while keeping a decision-time official observation, controlled historical context, dated own-site evidence, and unknowns separate rather than presenting a diagnosis or causal explanation.',
  metadata: {
    title: 'What should I record before escalating a Google Search change?',
    description:
      'A source-bound four-part manual handoff checklist for recording official status, controlled historical context, dated own-site evidence, and unknowns before escalation without stating current status or cause.',
    canonicalSlugProposal:
      '/checklists/record-before-escalating-google-search-change',
  },
  sourceBindings: [
    {
      sourceId: 'google-search-status',
      endpoint: 'https://status.search.google.com/incidents.json',
      purpose:
        'Official Google Search Status source to inspect directly at the decision time recorded in a handoff.',
      citation: 'Google Search Status',
    },
    {
      sourceId: 'google-search-central-blog',
      endpoint: 'https://feeds.feedburner.com/blogspot/amDG',
      purpose:
        'Official Google Search Central source material for bounded historical and operational context.',
      citation: 'Google Search Central',
    },
  ],
  factualStatements: [
    {
      text: 'The official-status entry is bound to the admitted Google Search Status endpoint for a decision-time observation.',
      sourceBindingIds: ['google-search-status'],
    },
    {
      text: 'Controlled historical context is kept distinct from a decision-time official-status observation.',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
    {
      text: 'The checklist records dated own-site evidence separately from the admitted official sources.',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
  ],
  checklist: [
    {
      step: 1,
      kind: 'official-status-at-decision-time',
      instruction:
        'Record the date and time, then record exactly what the admitted official Google Search Status source shows directly at decision time.',
      sourceBindingIds: ['google-search-status'],
    },
    {
      step: 2,
      kind: 'controlled-historical-context',
      instruction:
        'Record any relevant controlled historical context separately; it is not current incident evidence.',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
    {
      step: 3,
      kind: 'own-site-dated-evidence',
      instruction:
        'Record dated own-site evidence separately, including what changed and when it was observed.',
    },
    {
      step: 4,
      kind: 'unknowns-no-causation',
      instruction:
        'State what remains unknown and that the recorded observations do not establish cause before escalating.',
    },
  ],
  boundaries: {
    currentOfficialStatus:
      'Check the admitted official Google Search Status source directly at decision time; this handoff contract does not report a current status or incident.',
    historicalControlledExamples:
      'controlled historical context is not current incident evidence and must remain separate from the decision-time official observation.',
    ownSiteEvidence:
      'dated own-site evidence is separate from official-status and controlled historical context, and it remains evidence to review rather than a diagnosis.',
    noCausation:
      'This handoff contract does not diagnose a Google Search change and does not establish cause from a status observation, controlled context, or own-site evidence.',
    unknowns: [
      'The checklist cannot determine whether Google Search is currently down.',
      'The checklist cannot establish the cause of a change on an own site.',
      'A relationship between an official-status observation and own-site evidence remains unknown without independently reviewed evidence.',
    ],
    privacyAndMeasurement:
      'This content contract does not collect, transmit, or retain handoff information, does not use telemetry or accounts, and does not measure users, traffic, demand, conversion, willingness to pay, revenue, or another commercial outcome.',
  },
  faqs: [
    {
      question: 'What official information should be recorded first?',
      answer:
        'Record what the admitted Google Search Status source shows directly at decision time, including the time of observation rather than a claim about its present result.',
      sourceBindingIds: ['google-search-status'],
    },
    {
      question:
        'Should historical examples be included in an escalation handoff?',
      answer:
        'They may be recorded only as controlled historical context and not as current incident evidence or an explanation for an own-site change.',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
    {
      question: 'Does this checklist diagnose the change before escalation?',
      answer:
        'No. Keep dated own-site evidence and unknowns separate because the checklist does not establish cause from the recorded observations.',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
  ],
  correctionAndCurrentnessPolicy:
    'Inspect the admitted official source directly at decision time and make a correction to this contract before any route proposal if a source binding, citation, checklist instruction, or boundary is inaccurate; do not convert controlled historical context into current incident evidence.',
  publication: {
    status: 'CONTENT_CONTRACT_ADMITTED_PENDING_ADAPTER',
    adapter: 'coordinator-owned shared static route adapter',
    coordinatorDependency:
      'A coordinator-owned shared static route adapter is required before any public route can render this handoff contract.',
  },
} as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyExpectedEnumerableArrayEntries(
  value: readonly unknown[],
  expectedLength: number,
): boolean {
  const enumerableKeys = Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
  if (enumerableKeys.length !== expectedLength) {
    return false;
  }

  for (let index = 0; index < expectedLength; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return false;
    }
  }

  return true;
}

function exactValueMatches(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (
      !Array.isArray(value) ||
      value.length !== expected.length ||
      !hasOnlyExpectedEnumerableArrayEntries(value, expected.length)
    ) {
      return false;
    }

    for (let index = 0; index < expected.length; index += 1) {
      if (!exactValueMatches(value[index], expected[index])) {
        return false;
      }
    }

    return true;
  }

  if (isRecord(expected)) {
    if (!isRecord(value)) {
      return false;
    }
    const expectedKeys = Object.keys(expected);
    const valueKeys = Object.keys(value);
    return (
      valueKeys.length === expectedKeys.length &&
      expectedKeys.every(
        (key) =>
          Object.hasOwn(value, key) &&
          exactValueMatches(value[key], expected[key]),
      )
    );
  }

  return value === expected;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasRequiredText(value: unknown, required: readonly string[]): boolean {
  return (
    nonEmptyString(value) && required.every((text) => value.includes(text))
  );
}

function sourceBindingIdsAreAdmitted(
  bindingIds: readonly string[] | undefined,
  admittedBindingIds: ReadonlySet<string>,
): boolean {
  return (
    Array.isArray(bindingIds) &&
    bindingIds.length > 0 &&
    bindingIds.every(
      (bindingId) =>
        nonEmptyString(bindingId) && admittedBindingIds.has(bindingId),
    )
  );
}

function sourceBindingIdsMatch(
  bindingIds: readonly string[] | undefined,
  expectedBindingIds: readonly string[],
): boolean {
  return (
    Array.isArray(bindingIds) &&
    bindingIds.length === expectedBindingIds.length &&
    bindingIds.every(
      (bindingId, index) => bindingId === expectedBindingIds[index],
    )
  );
}

export function validateSourceBoundInvestigationHandoff(
  handoff: unknown,
  manifests: Readonly<Record<string, SourceBoundInvestigationHandoffManifest>>,
): SourceBoundInvestigationHandoffValidationResult {
  const candidate = (handoff ?? {}) as SourceBoundInvestigationHandoffCandidate;
  const diagnostics: string[] = [];
  const sourceBindings: readonly SourceBindingCandidate[] = Array.isArray(
    candidate.sourceBindings,
  )
    ? candidate.sourceBindings
    : [];
  const sourceBindingIds = new Set<string>();

  if (!exactValueMatches(candidate, approvedHandoffContract)) {
    diagnostics.push('IMMUTABLE_HANDOFF_CONTRACT_INVALID');
  }

  if (
    candidate.id !== 'source-bound-investigation-handoff-v1' ||
    candidate.schemaVersion !== 1 ||
    candidate.queryIntent !==
      'What should I record before escalating a Google Search change?'
  ) {
    diagnostics.push('HANDOFF_IDENTITY_INVALID');
  }

  for (let index = 0; index < sourceBindings.length; index += 1) {
    const binding = sourceBindings[index];
    if (!Object.hasOwn(sourceBindings, index) || !isRecord(binding)) {
      diagnostics.push(`SOURCE_BINDING_INVALID:${index}`);
      continue;
    }
    const sourceBinding = binding as SourceBindingCandidate;
    const sourceId = sourceBinding.sourceId;
    const expectedEndpoint =
      sourceId === undefined ? undefined : approvedSourceBindings[sourceId];
    const manifest = sourceId === undefined ? undefined : manifests[sourceId];
    if (
      !nonEmptyString(sourceId) ||
      !expectedEndpoint ||
      sourceBinding.endpoint !== expectedEndpoint ||
      !nonEmptyString(sourceBinding.purpose) ||
      !nonEmptyString(sourceBinding.citation) ||
      manifest?.sourceId !== sourceId ||
      manifest?.endpoint !== expectedEndpoint
    ) {
      diagnostics.push(`SOURCE_BINDING_INVALID:${sourceId ?? 'missing'}`);
      continue;
    }
    sourceBindingIds.add(sourceId);
  }
  if (
    sourceBindings.length !== Object.keys(approvedSourceBindings).length ||
    sourceBindingIds.size !== Object.keys(approvedSourceBindings).length
  ) {
    diagnostics.push('SOURCE_BINDINGS_INCOMPLETE');
  }

  for (const field of [
    candidate.intendedAudience,
    candidate.decision,
    candidate.metadata?.title,
    candidate.metadata?.description,
    candidate.metadata?.canonicalSlugProposal,
  ]) {
    if (!nonEmptyString(field)) {
      diagnostics.push('REQUIRED_HANDOFF_TEXT_MISSING');
      break;
    }
  }
  if (
    candidate.metadata?.canonicalSlugProposal !==
    '/checklists/record-before-escalating-google-search-change'
  ) {
    diagnostics.push('CANONICAL_SLUG_INVALID');
  }

  const checklist = Array.isArray(candidate.checklist)
    ? candidate.checklist
    : [];
  const expectedChecklist = [
    {
      kind: 'official-status-at-decision-time',
      sourceBindingIds: ['google-search-status'],
    },
    {
      kind: 'controlled-historical-context',
      sourceBindingIds: ['google-search-status', 'google-search-central-blog'],
    },
    { kind: 'own-site-dated-evidence', sourceBindingIds: undefined },
    { kind: 'unknowns-no-causation', sourceBindingIds: undefined },
  ];
  let checklistInvalid = checklist.length !== expectedChecklist.length;
  for (let index = 0; index < expectedChecklist.length; index += 1) {
    const expected = expectedChecklist[index];
    const item = checklist[index];
    if (
      !Object.hasOwn(checklist, index) ||
      item?.step !== index + 1 ||
      item?.kind !== expected.kind ||
      !nonEmptyString(item?.instruction) ||
      (expected.sourceBindingIds === undefined
        ? item?.sourceBindingIds !== undefined
        : !sourceBindingIdsMatch(
            item?.sourceBindingIds,
            expected.sourceBindingIds,
          ))
    ) {
      checklistInvalid = true;
      break;
    }
  }
  if (checklistInvalid) {
    diagnostics.push('HANDOFF_CHECKLIST_INVALID');
  }

  const factualStatements = Array.isArray(candidate.factualStatements)
    ? candidate.factualStatements
    : [];
  if (
    factualStatements.length === 0 ||
    factualStatements.some(
      (statement) =>
        !nonEmptyString(statement?.text) ||
        !sourceBindingIdsAreAdmitted(
          statement?.sourceBindingIds,
          sourceBindingIds,
        ),
    )
  ) {
    diagnostics.push('FACTUAL_STATEMENT_UNBOUND');
  }

  const boundaries = candidate.boundaries;
  if (
    !hasRequiredText(boundaries?.currentOfficialStatus, [
      'directly at decision time',
      'does not report a current status or incident',
    ]) ||
    !hasRequiredText(boundaries?.historicalControlledExamples, [
      'controlled historical context',
      'not current incident evidence',
    ]) ||
    !hasRequiredText(boundaries?.ownSiteEvidence, [
      'dated own-site evidence',
      'separate',
    ]) ||
    !hasRequiredText(boundaries?.noCausation, [
      'does not diagnose',
      'does not establish cause',
    ]) ||
    !Array.isArray(boundaries?.unknowns) ||
    boundaries.unknowns.length === 0 ||
    boundaries.unknowns.some((unknown) => !nonEmptyString(unknown))
  ) {
    diagnostics.push('CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING');
  }
  if (
    !hasRequiredText(boundaries?.privacyAndMeasurement, [
      'does not collect, transmit, or retain',
      'does not use telemetry or accounts',
      'does not measure users, traffic, demand, conversion, willingness to pay, revenue, or another commercial outcome',
    ])
  ) {
    diagnostics.push('PRIVACY_OR_MEASUREMENT_BOUNDARY_MISSING');
  }

  const faqs = Array.isArray(candidate.faqs) ? candidate.faqs : [];
  if (
    faqs.length < 3 ||
    faqs.some(
      (faq) =>
        !nonEmptyString(faq?.question) ||
        !nonEmptyString(faq?.answer) ||
        !sourceBindingIdsAreAdmitted(faq?.sourceBindingIds, sourceBindingIds),
    )
  ) {
    diagnostics.push('FAQ_NOT_ADMITTED');
  }

  if (
    !hasRequiredText(candidate.correctionAndCurrentnessPolicy, [
      'directly at decision time',
      'correction',
    ])
  ) {
    diagnostics.push('CORRECTION_AND_CURRENTNESS_POLICY_MISSING');
  }

  if (
    candidate.publication?.status !==
      'CONTENT_CONTRACT_ADMITTED_PENDING_ADAPTER' ||
    candidate.publication?.adapter !==
      'coordinator-owned shared static route adapter' ||
    !nonEmptyString(candidate.publication?.coordinatorDependency) ||
    candidate.publication?.route !== undefined ||
    candidate.publication?.coordinatorReleaseEvidence !== undefined
  ) {
    diagnostics.push('ROUTE_ADAPTER_DEPENDENCY_MISSING');
  }

  return { ok: diagnostics.length === 0, diagnostics };
}
