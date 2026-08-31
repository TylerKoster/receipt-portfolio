export interface SourceBoundGuideManifest {
  readonly sourceId: string;
  readonly endpoint: string;
}

export interface SourceBoundGuideValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

interface SourceBindingCandidate {
  readonly sourceId?: string;
  readonly endpoint?: string;
  readonly purpose?: string;
}

interface BoundTextCandidate {
  readonly sourceBindingIds?: readonly string[];
}

interface SourceBoundGuideCandidate {
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
  readonly workflow?: readonly (BoundTextCandidate & {
    readonly step?: number;
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
  };
  readonly faqs?: readonly (BoundTextCandidate & {
    readonly question?: string;
    readonly answer?: string;
  })[];
  readonly correctionAndCurrentnessPolicy?: string;
  readonly publication?: {
    readonly status?: string;
    readonly route?: string;
    readonly adapter?: string;
    readonly coordinatorReleaseEvidence?: {
      readonly releaseHead?: string;
      readonly tag?: string;
      readonly provenance?: string;
    };
  };
}

const approvedSourceBindings: Readonly<Record<string, string>> = Object.freeze({
  'google-search-status': 'https://status.search.google.com/incidents.json',
  'google-search-central-blog': 'https://feeds.feedburner.com/blogspot/amDG',
});
const acceptedCoordinatorReleaseEvidence = Object.freeze({
  releaseHead: 'dbed8d57d42a4b6b0801d386462699d0335f9e43',
  tag: 'v0.1.35',
  provenance: 'Coordinator-provided accepted release evidence.',
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

export function validateSourceBoundEvergreenGuide(
  guide: unknown,
  manifests: Readonly<Record<string, SourceBoundGuideManifest>>,
): SourceBoundGuideValidationResult {
  const candidate = (guide ?? {}) as SourceBoundGuideCandidate;
  const diagnostics: string[] = [];
  const sourceBindings: readonly SourceBindingCandidate[] = Array.isArray(
    candidate.sourceBindings,
  )
    ? candidate.sourceBindings
    : [];
  const sourceBindingIds = new Set<string>();

  if (
    candidate.id !== 'source-bound-evergreen-guide-v1' ||
    candidate.schemaVersion !== 1
  ) {
    diagnostics.push('GUIDE_IDENTITY_INVALID');
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
      manifest?.sourceId !== binding.sourceId ||
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
      diagnostics.push('REQUIRED_GUIDE_TEXT_MISSING');
      break;
    }
  }

  if (
    !/^\/guides\/[a-z0-9-]+$/u.test(
      candidate.metadata?.canonicalSlugProposal ?? '',
    )
  ) {
    diagnostics.push('CANONICAL_SLUG_INVALID');
  }

  const workflow = Array.isArray(candidate.workflow) ? candidate.workflow : [];
  if (
    workflow.length !== 3 ||
    workflow.some(
      (step, index) =>
        step?.step !== index + 1 ||
        !nonEmptyString(step?.instruction) ||
        !sourceBindingIdsAreAdmitted(step?.sourceBindingIds, sourceBindingIds),
    )
  ) {
    diagnostics.push('WORKFLOW_NOT_THREE_ADMITTED_STEPS');
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
      'controlled historical examples',
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
    candidate.publication?.status !== 'ROUTE_RELEASE_VERIFIED' ||
    candidate.publication?.route !==
      `${candidate.metadata?.canonicalSlugProposal ?? ''}/` ||
    candidate.publication?.adapter !== 'shared-static-guide-v1'
  ) {
    diagnostics.push('ROUTE_ADAPTER_DEPENDENCY_MISSING');
  }

  if (
    candidate.publication?.coordinatorReleaseEvidence?.releaseHead !==
      acceptedCoordinatorReleaseEvidence.releaseHead ||
    candidate.publication?.coordinatorReleaseEvidence?.tag !==
      acceptedCoordinatorReleaseEvidence.tag ||
    candidate.publication?.coordinatorReleaseEvidence?.provenance !==
      acceptedCoordinatorReleaseEvidence.provenance
  ) {
    diagnostics.push('COORDINATOR_RELEASE_EVIDENCE_INVALID');
  }

  return { ok: diagnostics.length === 0, diagnostics };
}
