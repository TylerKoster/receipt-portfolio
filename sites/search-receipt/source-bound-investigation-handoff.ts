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

  if (
    candidate.id !== 'source-bound-investigation-handoff-v1' ||
    candidate.schemaVersion !== 1 ||
    candidate.queryIntent !==
      'What should I record before escalating a Google Search change?'
  ) {
    diagnostics.push('HANDOFF_IDENTITY_INVALID');
  }

  for (const binding of sourceBindings) {
    const sourceId = binding.sourceId;
    const expectedEndpoint =
      sourceId === undefined ? undefined : approvedSourceBindings[sourceId];
    const manifest = sourceId === undefined ? undefined : manifests[sourceId];
    if (
      !nonEmptyString(sourceId) ||
      !expectedEndpoint ||
      binding.endpoint !== expectedEndpoint ||
      !nonEmptyString(binding.purpose) ||
      !nonEmptyString(binding.citation) ||
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
  if (
    checklist.length !== expectedChecklist.length ||
    checklist.some((item, index) => {
      const expected = expectedChecklist[index];
      return (
        item?.step !== index + 1 ||
        item?.kind !== expected.kind ||
        !nonEmptyString(item?.instruction) ||
        (expected.sourceBindingIds === undefined
          ? item?.sourceBindingIds !== undefined
          : !sourceBindingIdsMatch(
              item?.sourceBindingIds,
              expected.sourceBindingIds,
            ))
      );
    })
  ) {
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
