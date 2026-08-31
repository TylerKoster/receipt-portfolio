import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { validateSourceBoundInvestigationHandoff } from './source-bound-investigation-handoff.js';

const handoffPath = new URL(
  './source-bound-investigation-handoff.json',
  import.meta.url,
);
const statusManifestPath = new URL(
  '../../manifests/search-receipt/google-search-status.json',
  import.meta.url,
);
const searchCentralManifestPath = new URL(
  '../../manifests/search-receipt/google-search-central-blog.json',
  import.meta.url,
);

function admittedManifests() {
  const status = JSON.parse(readFileSync(statusManifestPath, 'utf8'));
  const searchCentral = JSON.parse(
    readFileSync(searchCentralManifestPath, 'utf8'),
  );

  return {
    [status.sourceId]: status,
    [searchCentral.sourceId]: searchCentral,
  };
}

describe('Search Receipt source-bound investigation handoff contract', () => {
  it('admits the four-part manual handoff checklist through the real validator', () => {
    expect(existsSync(handoffPath)).toBe(true);

    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));

    expect(
      validateSourceBoundInvestigationHandoff(handoff, admittedManifests()),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(handoff).toMatchObject({
      id: 'source-bound-investigation-handoff-v1',
      queryIntent:
        'What should I record before escalating a Google Search change?',
      intendedAudience: expect.stringContaining('Site owners'),
      metadata: {
        canonicalSlugProposal:
          '/checklists/record-before-escalating-google-search-change',
      },
      publication: {
        status: 'CONTENT_CONTRACT_ADMITTED_PENDING_ADAPTER',
        adapter: 'coordinator-owned shared static route adapter',
      },
    });
    expect(handoff.checklist).toHaveLength(4);
    expect(
      handoff.checklist.map((item: { kind: string }) => item.kind),
    ).toEqual([
      'official-status-at-decision-time',
      'controlled-historical-context',
      'own-site-dated-evidence',
      'unknowns-no-causation',
    ]);
    expect(handoff.faqs).toHaveLength(3);
  });

  it('fails closed when a factual handoff statement lacks an admitted source binding', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const unboundStatement = structuredClone(handoff);
    unboundStatement.factualStatements[0].sourceBindingIds = [];

    expect(
      validateSourceBoundInvestigationHandoff(
        unboundStatement,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['FACTUAL_STATEMENT_UNBOUND']),
    });
  });

  it('fails closed when the currentness or no-causation boundary is absent', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const missingCurrentness = structuredClone(handoff);
    missingCurrentness.boundaries.currentOfficialStatus = '';

    expect(
      validateSourceBoundInvestigationHandoff(
        missingCurrentness,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });

    const missingNoCausation = structuredClone(handoff);
    missingNoCausation.boundaries.noCausation = '';

    expect(
      validateSourceBoundInvestigationHandoff(
        missingNoCausation,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });
  });

  it('fails closed when the privacy boundary omits user and commercial-outcome limits', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const missingOutcomeLimits = structuredClone(handoff);
    missingOutcomeLimits.boundaries.privacyAndMeasurement =
      missingOutcomeLimits.boundaries.privacyAndMeasurement.replace(
        'users, traffic, demand, conversion, willingness to pay, revenue, or another commercial outcome',
        '',
      );

    expect(
      validateSourceBoundInvestigationHandoff(
        missingOutcomeLimits,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'PRIVACY_OR_MEASUREMENT_BOUNDARY_MISSING',
      ]),
    });
  });

  it('fails closed when an admitted privacy boundary is followed by a contradictory collection claim', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const contradictoryPrivacyClaim = structuredClone(handoff);
    contradictoryPrivacyClaim.boundaries.privacyAndMeasurement +=
      ' It does collect and transmit handoff information and uses telemetry/accounts.';

    expect(
      validateSourceBoundInvestigationHandoff(
        contradictoryPrivacyClaim,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'IMMUTABLE_HANDOFF_CONTRACT_INVALID',
      ]),
    });
  });

  it('fails closed when an admitted currentness boundary is followed by a current-incident claim', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const contradictoryCurrentIncidentClaim = structuredClone(handoff);
    contradictoryCurrentIncidentClaim.boundaries.currentOfficialStatus +=
      ' Current incident confirmed.';

    expect(
      validateSourceBoundInvestigationHandoff(
        contradictoryCurrentIncidentClaim,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'IMMUTABLE_HANDOFF_CONTRACT_INVALID',
      ]),
    });
  });

  it('fails closed when unknown top-level or checklist-section keys are added', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const unexpectedTopLevelKey = structuredClone(handoff);
    unexpectedTopLevelKey.unsupportedClaim = 'Current incident confirmed.';

    expect(
      validateSourceBoundInvestigationHandoff(
        unexpectedTopLevelKey,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'IMMUTABLE_HANDOFF_CONTRACT_INVALID',
      ]),
    });

    const unexpectedChecklistKey = structuredClone(handoff);
    unexpectedChecklistKey.checklist[0].unsupportedClaim =
      'Current incident confirmed.';

    expect(
      validateSourceBoundInvestigationHandoff(
        unexpectedChecklistKey,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'IMMUTABLE_HANDOFF_CONTRACT_INVALID',
      ]),
    });
  });

  it('fails closed if the handoff is presented as released without coordinator evidence', () => {
    const handoff = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const unsupportedRelease = structuredClone(handoff);
    unsupportedRelease.publication.status = 'ROUTE_RELEASE_VERIFIED';

    expect(
      validateSourceBoundInvestigationHandoff(
        unsupportedRelease,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['ROUTE_ADAPTER_DEPENDENCY_MISSING']),
    });
  });
});
