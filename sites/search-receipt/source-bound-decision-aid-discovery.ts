export interface SourceBoundDecisionAidDiscoveryManifest {
  readonly sourceId: string;
  readonly endpoint: string;
}

export interface SourceBoundDecisionAidDiscoveryValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

interface SourceBindingCandidate {
  readonly sourceId?: string;
  readonly endpoint?: string;
  readonly purpose?: string;
  readonly citation?: string;
}

interface RouteBindingCandidate {
  readonly id?: string;
  readonly route?: string;
  readonly purpose?: string;
}

interface SourceBoundDecisionAidDiscoveryCandidate {
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
  readonly routeBindings?: readonly RouteBindingCandidate[];
  readonly decisionAids?: readonly {
    readonly id?: string;
    readonly route?: string;
    readonly choiceCriteria?: string;
    readonly result?: string;
  }[];
  readonly boundaries?: {
    readonly currentOfficialStatus?: string;
    readonly noCausation?: string;
    readonly privacyAndMeasurement?: string;
    readonly unknowns?: readonly string[];
  };
  readonly faqs?: readonly {
    readonly question?: string;
    readonly answer?: string;
    readonly routeBindingIds?: readonly string[];
  }[];
  readonly correctionAndCurrentnessPolicy?: string;
  readonly publication?: {
    readonly status?: string;
    readonly adapter?: string;
    readonly coordinatorDependency?: string;
    readonly route?: string;
  };
}

const approvedSourceBindings: Readonly<Record<string, string>> = Object.freeze({
  'google-search-status': 'https://status.search.google.com/incidents.json',
});

const admittedRouteBindings: Readonly<Record<string, string>> = Object.freeze({
  guide: '/guides/is-google-search-down-or-my-site/',
  worksheet: '/worksheets/compare-google-search-status-with-site-evidence',
});

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasRequiredText(value: unknown, required: readonly string[]): boolean {
  return (
    nonEmptyString(value) && required.every((text) => value.includes(text))
  );
}

function routeBindingIdsAreAdmitted(
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

export function validateSourceBoundDecisionAidDiscovery(
  discovery: unknown,
  manifests: Readonly<Record<string, SourceBoundDecisionAidDiscoveryManifest>>,
): SourceBoundDecisionAidDiscoveryValidationResult {
  const candidate = (discovery ??
    {}) as SourceBoundDecisionAidDiscoveryCandidate;
  const diagnostics: string[] = [];
  const sourceBindings = Array.isArray(candidate.sourceBindings)
    ? candidate.sourceBindings
    : [];
  const routeBindings = Array.isArray(candidate.routeBindings)
    ? candidate.routeBindings
    : [];
  const admittedRouteBindingIds = new Set<string>();

  if (
    candidate.id !== 'source-bound-decision-aid-discovery-v1' ||
    candidate.schemaVersion !== 1
  ) {
    diagnostics.push('DISCOVERY_IDENTITY_INVALID');
  }

  if (
    sourceBindings.length !== 1 ||
    sourceBindings.some((binding) => {
      const expectedEndpoint =
        binding.sourceId === undefined
          ? undefined
          : approvedSourceBindings[binding.sourceId];
      const manifest =
        binding.sourceId === undefined
          ? undefined
          : manifests[binding.sourceId];
      return (
        !nonEmptyString(binding.sourceId) ||
        binding.endpoint !== expectedEndpoint ||
        !nonEmptyString(binding.purpose) ||
        !nonEmptyString(binding.citation) ||
        manifest?.sourceId !== binding.sourceId ||
        manifest?.endpoint !== expectedEndpoint
      );
    })
  ) {
    diagnostics.push('SOURCE_BINDINGS_INVALID');
  }

  for (const binding of routeBindings) {
    const expectedRoute =
      binding.id === undefined ? undefined : admittedRouteBindings[binding.id];
    if (
      !nonEmptyString(binding.id) ||
      binding.route !== expectedRoute ||
      !nonEmptyString(binding.purpose)
    ) {
      diagnostics.push('ROUTE_BINDINGS_INVALID');
      continue;
    }
    admittedRouteBindingIds.add(binding.id);
  }
  if (
    routeBindings.length !== Object.keys(admittedRouteBindings).length ||
    admittedRouteBindingIds.size !== Object.keys(admittedRouteBindings).length
  ) {
    diagnostics.push('ROUTE_BINDINGS_INVALID');
  }

  for (const field of [
    candidate.intendedAudience,
    candidate.decision,
    candidate.metadata?.title,
    candidate.metadata?.description,
    candidate.metadata?.canonicalSlugProposal,
  ]) {
    if (!nonEmptyString(field)) {
      diagnostics.push('REQUIRED_DISCOVERY_TEXT_MISSING');
      break;
    }
  }
  if (
    candidate.metadata?.canonicalSlugProposal !==
    '/discover/choose-google-search-guide-or-worksheet'
  ) {
    diagnostics.push('CANONICAL_SLUG_INVALID');
  }

  const decisionAids = Array.isArray(candidate.decisionAids)
    ? candidate.decisionAids
    : [];
  const expectedAids = [
    {
      id: 'guide-first',
      route: admittedRouteBindings.guide,
      criterion: 'before you have dated own-site evidence',
    },
    {
      id: 'worksheet-after-own-site-evidence',
      route: admittedRouteBindings.worksheet,
      criterion: 'after you have dated own-site evidence',
    },
  ];
  if (
    decisionAids.length !== expectedAids.length ||
    decisionAids.some((aid, index) => {
      const expected = expectedAids[index];
      return (
        aid?.id !== expected.id ||
        aid?.route !== expected.route ||
        !hasRequiredText(aid?.choiceCriteria, [expected.criterion]) ||
        !nonEmptyString(aid?.result)
      );
    })
  ) {
    diagnostics.push('DECISION_AID_ROUTE_INVALID');
  }

  const boundaries = candidate.boundaries;
  if (
    !hasRequiredText(boundaries?.currentOfficialStatus, [
      'directly at decision time',
      'does not state a current status or incident',
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
      'collects, transmits, or retains',
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
        !nonEmptyString(faq.question) ||
        !nonEmptyString(faq.answer) ||
        !routeBindingIdsAreAdmitted(
          faq.routeBindingIds,
          admittedRouteBindingIds,
        ),
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
    !nonEmptyString(candidate.publication?.coordinatorDependency) ||
    candidate.publication?.route !==
      '/discover/choose-google-search-guide-or-worksheet/'
  ) {
    diagnostics.push('PUBLIC_ROUTE_INTEGRATION_INVALID');
  }

  return { ok: diagnostics.length === 0, diagnostics };
}
