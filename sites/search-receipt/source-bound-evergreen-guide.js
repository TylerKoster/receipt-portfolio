const approvedSourceBindings = Object.freeze({
  'google-search-status': 'https://status.search.google.com/incidents.json',
  'google-search-central-blog': 'https://feeds.feedburner.com/blogspot/amDG',
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceBindingIdsAreAdmitted(bindingIds, sourceBindingIds) {
  return (
    Array.isArray(bindingIds) &&
    bindingIds.length > 0 &&
    bindingIds.every(
      (bindingId) =>
        nonEmptyString(bindingId) && sourceBindingIds.has(bindingId),
    )
  );
}

function hasRequiredText(value, requiredText) {
  return (
    nonEmptyString(value) && requiredText.every((text) => value.includes(text))
  );
}

export function validateSourceBoundEvergreenGuide(guide, manifests) {
  const diagnostics = [];
  const sourceBindings = Array.isArray(guide?.sourceBindings)
    ? guide.sourceBindings
    : [];
  const sourceBindingIds = new Set();

  if (
    guide?.id !== 'source-bound-evergreen-guide-v1' ||
    guide?.schemaVersion !== 1
  ) {
    diagnostics.push('GUIDE_IDENTITY_INVALID');
  }

  for (const binding of sourceBindings) {
    const expectedEndpoint = approvedSourceBindings[binding?.sourceId];
    const manifest = manifests?.[binding?.sourceId];
    if (
      !nonEmptyString(binding?.sourceId) ||
      !expectedEndpoint ||
      binding.endpoint !== expectedEndpoint ||
      manifest?.sourceId !== binding.sourceId ||
      manifest?.endpoint !== expectedEndpoint
    ) {
      diagnostics.push(
        `SOURCE_BINDING_INVALID:${binding?.sourceId ?? 'missing'}`,
      );
      continue;
    }
    sourceBindingIds.add(binding.sourceId);
  }

  if (sourceBindingIds.size !== Object.keys(approvedSourceBindings).length) {
    diagnostics.push('SOURCE_BINDINGS_INCOMPLETE');
  }

  for (const field of [
    guide?.intendedAudience,
    guide?.decision,
    guide?.metadata?.title,
    guide?.metadata?.description,
    guide?.metadata?.canonicalSlugProposal,
  ]) {
    if (!nonEmptyString(field)) {
      diagnostics.push('REQUIRED_GUIDE_TEXT_MISSING');
      break;
    }
  }

  if (
    !/^\/guides\/[a-z0-9-]+$/u.test(
      guide?.metadata?.canonicalSlugProposal ?? '',
    )
  ) {
    diagnostics.push('CANONICAL_SLUG_INVALID');
  }

  const workflow = Array.isArray(guide?.workflow) ? guide.workflow : [];
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

  const factualStatements = Array.isArray(guide?.factualStatements)
    ? guide.factualStatements
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

  const boundaries = guide?.boundaries;
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

  const faqs = Array.isArray(guide?.faqs) ? guide.faqs : [];
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
    !hasRequiredText(guide?.correctionAndCurrentnessPolicy, [
      'directly at decision time',
      'correction',
    ])
  ) {
    diagnostics.push('CORRECTION_AND_CURRENTNESS_POLICY_MISSING');
  }

  if (
    guide?.publication?.status !== 'ROUTE_UNPUBLISHED' ||
    guide?.publication?.coordinatorDependency !==
      'A shared public-route adapter is coordinator-owned; this lane does not publish the guide.'
  ) {
    diagnostics.push('ROUTE_ADAPTER_DEPENDENCY_MISSING');
  }

  return { ok: diagnostics.length === 0, diagnostics };
}
