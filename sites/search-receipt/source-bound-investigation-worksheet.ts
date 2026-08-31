export interface SourceBoundInvestigationWorksheetManifest {
  readonly sourceId: string;
  readonly endpoint: string;
}

export interface SourceBoundInvestigationWorksheetValidationResult {
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

interface SourceBoundInvestigationWorksheetCandidate {
  readonly id?: string;
  readonly schemaVersion?: number;
  readonly intendedAudience?: string;
  readonly decision?: string;
  readonly metadata?: {
    readonly title?: string;
    readonly description?: string;
    readonly canonicalSlugProposal?: string;
  };
  readonly sourceBindings?: readonly SourceBindingCandidate[];
  readonly worksheet?: readonly (BoundTextCandidate & {
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
  };
}

const approvedSourceBindings: Readonly<Record<string, string>> = Object.freeze({
  'google-search-status': 'https://status.search.google.com/incidents.json',
  'google-search-central-blog': 'https://feeds.feedburner.com/blogspot/amDG',
});

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceBindingIdsAreAdmitted(
  bindingIds: readonly string[] | undefined,
  sourceBindingIds: ReadonlySet<string>,
): boolean {
  return (
    Array.isArray(bindingIds) &&
    bindingIds.length > 0 &&
    bindingIds.every(
      (bindingId) =>
        nonEmptyString(bindingId) && sourceBindingIds.has(bindingId),
    )
  );
}

function hasRequiredText(
  value: unknown,
  requiredText: readonly string[],
): boolean {
  return (
    nonEmptyString(value) && requiredText.every((text) => value.includes(text))
  );
}

export function validateSourceBoundInvestigationWorksheet(
  worksheet: unknown,
  manifests: Readonly<
    Record<string, SourceBoundInvestigationWorksheetManifest>
  >,
): SourceBoundInvestigationWorksheetValidationResult {
  const candidate = (worksheet ??
    {}) as SourceBoundInvestigationWorksheetCandidate;
  const diagnostics: string[] = [];
  const sourceBindings: readonly SourceBindingCandidate[] = Array.isArray(
    candidate.sourceBindings,
  )
    ? candidate.sourceBindings
    : [];
  const sourceBindingIds = new Set<string>();

  if (
    candidate.id !== 'source-bound-investigation-worksheet-v1' ||
    candidate.schemaVersion !== 1
  ) {
    diagnostics.push('WORKSHEET_IDENTITY_INVALID');
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
      diagnostics.push('REQUIRED_WORKSHEET_TEXT_MISSING');
      break;
    }
  }

  if (
    candidate.metadata?.canonicalSlugProposal !==
    '/worksheets/compare-google-search-status-with-site-evidence'
  ) {
    diagnostics.push('CANONICAL_SLUG_INVALID');
  }

  const worksheetSteps = Array.isArray(candidate.worksheet)
    ? candidate.worksheet
    : [];
  const expectedStepKinds = [
    'official-status-at-decision-time',
    'controlled-historical-context',
    'own-site-dated-evidence',
    'unknown-conclusion',
  ];
  if (
    worksheetSteps.length !== expectedStepKinds.length ||
    worksheetSteps.some(
      (step, index) =>
        step?.step !== index + 1 ||
        step?.kind !== expectedStepKinds[index] ||
        !nonEmptyString(step?.instruction) ||
        (index < 2 &&
          !sourceBindingIdsAreAdmitted(
            step?.sourceBindingIds,
            sourceBindingIds,
          )) ||
        (index >= 2 && step?.sourceBindingIds !== undefined),
    )
  ) {
    diagnostics.push('WORKSHEET_SEQUENCE_INVALID');
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
      'your own site evidence',
      'not establish a connection',
    ]) ||
    !hasRequiredText(boundaries?.noCausation, [
      'does not explain',
      'your own site',
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
      'does not measure',
    ])
  ) {
    diagnostics.push('PRIVACY_OR_MEASUREMENT_BOUNDARY_MISSING');
  }

  const faqs = Array.isArray(candidate.faqs) ? candidate.faqs : [];
  if (
    faqs.length < 2 ||
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
    candidate.publication?.status !== 'ROUTE_INTEGRATED_PENDING_RELEASE' ||
    candidate.publication?.adapter !==
      'coordinator-owned shared static route adapter' ||
    !nonEmptyString(candidate.publication?.coordinatorDependency)
  ) {
    diagnostics.push('ROUTE_ADAPTER_DEPENDENCY_MISSING');
  }

  return { ok: diagnostics.length === 0, diagnostics };
}
