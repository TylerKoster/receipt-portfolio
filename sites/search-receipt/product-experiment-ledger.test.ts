import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ledgerPath = new URL('./product-experiment-ledger.json', import.meta.url);
const guidePath = new URL(
  './source-bound-evergreen-guide.json',
  import.meta.url,
);
const worksheetPath = new URL(
  './source-bound-investigation-worksheet.json',
  import.meta.url,
);

const observationBlocker =
  'No privacy-reviewed, authorized non-synthetic observation channel exists; absence of measurement is not failure or zero demand.';
const coordinatorReleaseEvidence = {
  releaseHead: 'dbed8d57d42a4b6b0801d386462699d0335f9e43',
  tag: 'v0.1.35',
  provenance: 'Coordinator-provided accepted release evidence.',
};
const worksheetCoordinatorReleaseEvidence = {
  releaseHead: '3f36ae7bc83ff4e16c1f7d3c2a0bfa75a80158da',
  tag: 'v0.1.39',
  provenance: 'Coordinator-provided accepted release evidence.',
};

const sessionExperimentHistory = [
  {
    id: 'retrieval-filter-offer-v1',
    rank: 1,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured filter-to-record completion after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'currentness-disclosure-v1',
    rank: 2,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured currentness-disclosure comprehension after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'evidence-to-investigation-guidance-v1',
    rank: 3,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured methodology-guidance comprehension after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'no-result-recovery-v1',
    rank: 4,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured no-result recovery after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'interaction-currentness-boundary-v1',
    rank: 5,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured interaction-boundary comprehension after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'search-scope-discoverability-v1',
    rank: 6,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured search-scope comprehension after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'offer-preview-clarity-v1',
    rank: 7,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured offer-preview limit comprehension after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'query-formulation-guidance-v1',
    rank: 8,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured query-formulation completion after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
  {
    id: 'shareable-filter-view-v1',
    rank: 9,
    status: 'OBSERVATION_BLOCKED',
    metric:
      'Unmeasured shareable-filter completion after 10 observed non-synthetic sessions.',
    target: '>=60% after 10 observed non-synthetic sessions',
    stopRule: '<30% after 10 sessions retires or reframes the experiment.',
    noDataBoundary: 'No data means no demand or revenue conclusion.',
    blockedBy: observationBlocker,
  },
];

function assertSessionExperimentsRemainObservationBlocked(
  experiments: Array<Record<string, unknown>>,
) {
  const sessionExperiments = experiments
    .filter((experiment) => {
      const rank = experiment.rank;
      return typeof rank === 'number' && rank >= 1 && rank <= 9;
    })
    .sort((left, right) => Number(left.rank) - Number(right.rank));

  expect(
    sessionExperiments.map((experiment) => ({
      id: experiment.id,
      rank: experiment.rank,
      status: experiment.status,
      metric: experiment.metric,
      target: experiment.target,
      stopRule: experiment.stopRule,
      noDataBoundary: experiment.noDataBoundary,
      blockedBy: experiment.blockedBy,
    })),
  ).toEqual(sessionExperimentHistory);
}

function assertEvergreenGuideReleaseEvidenceMatchesLedger(
  guide: Record<string, unknown>,
  ledger: Record<string, unknown>,
) {
  const publication = guide.publication as Record<string, unknown>;
  const guideReleaseEvidence = publication.coordinatorReleaseEvidence;
  const experiments = ledger.experiments as Array<Record<string, unknown>>;
  const rankTen = experiments.find((experiment) => experiment.rank === 10);

  expect(guideReleaseEvidence).toEqual(coordinatorReleaseEvidence);
  expect(rankTen).toMatchObject({
    id: 'source-bound-evergreen-guide-v1',
    rank: 10,
  });
  expect(rankTen?.coordinatorReleaseEvidence).toEqual(guideReleaseEvidence);
}

function assertWorksheetReleaseEvidenceMatchesLedger(
  worksheet: Record<string, unknown>,
  ledger: Record<string, unknown>,
) {
  const publication = worksheet.publication as Record<string, unknown>;
  const worksheetReleaseEvidence = publication.coordinatorReleaseEvidence;
  const experiments = ledger.experiments as Array<Record<string, unknown>>;
  const rankEleven = experiments.find((experiment) => experiment.rank === 11);

  expect(worksheetReleaseEvidence).toEqual(worksheetCoordinatorReleaseEvidence);
  expect(rankEleven).toMatchObject({
    id: 'source-bound-investigation-worksheet-v1',
    rank: 11,
  });
  expect(rankEleven?.coordinatorReleaseEvidence).toEqual(
    worksheetReleaseEvidence,
  );
}

describe('Search Receipt product experiment ledger', () => {
  it('records the ranked decision-aid route as integrated pending release rather than an outcome', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[11]).toMatchObject({
      id: 'source-bound-decision-aid-discovery-v1',
      rank: 12,
      status: 'ROUTE_INTEGRATED_PENDING_RELEASE',
      noDataBoundary:
        'Internal content/discoverability contract admission is not users, SEO traffic, demand, conversion, willingness to pay, revenue, or commercial-outcome evidence.',
      coordinatorDependency:
        'The coordinator-owned shared static route adapter is integrated; release and public verification remain pending and cannot be inferred from this contract.',
    });
  });

  it('preserves synthetic usability evidence and records the shipped retrieval surface without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.evidenceClassification).toEqual({
      kind: 'SYNTHETIC_HEURISTIC_USABILITY_EVIDENCE',
      limitations: expect.arrayContaining([
        'Not real users, demand, traffic, revenue, willingness-to-pay, or source truth.',
      ]),
    });
    expect(ledger.syntheticUsabilityPacket.personas).toEqual([
      {
        persona: 'agency SEO operator',
        task: 'Determine whether a current Google incident explained volatility.',
        outcome:
          'Unable to decide whether a current Google incident explained volatility.',
      },
      {
        persona: 'governance analyst',
        task: 'Inspect integrity and correction information.',
        outcome: 'Completed only the integrity/correction inspection.',
      },
      {
        persona: 'independent publisher',
        task: 'Search, filter, and subscribe.',
        outcome: 'Unable to search, filter, or subscribe.',
      },
    ]);
    expect(ledger.syntheticUsabilityPacket.outcomes).toEqual({
      completion: '1/3',
      returnIntent: '0/3',
      willingnessToPay: '0/3',
    });
    expect(ledger.syntheticUsabilityPacket.p0Findings).toEqual(
      expect.arrayContaining([
        'All public records are controlled fixtures.',
        'The example.invalid source is unreachable.',
        'There is no search input, filtering, status/date/service navigation, alert or digest CTA, offer, analytics, or conversion event.',
      ]),
    );

    expect(ledger.experiments[0]).toMatchObject({
      id: 'retrieval-filter-offer-v1',
      rank: 1,
      status: 'OBSERVATION_BLOCKED',
      firstUserOutcome:
        'Enter a query/filter over source-bound records with explicit empty and error states.',
      metric:
        'Unmeasured filter-to-record completion after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      coordinatorReleaseEvidence: {
        releaseHead: '388a3d0c113ceb2e42346315811fdfbb19b7ab86',
        tag: 'v0.1.10',
        provenance: 'Coordinator-provided accepted release evidence.',
      },
      shippedCapability: {
        retrieval:
          'Client-side query and topic filtering shipped with explicit empty and error states.',
        offer:
          'The alert/report interaction is an in-page non-operational preview: it creates no alert or report and sends or retains no data.',
        measurement:
          'No telemetry, session, or interest measurement exists; no real demand or revenue conclusion.',
      },
    });
    expect(ledger.experiments[0]).toMatchObject({
      blockedBy:
        'No privacy-reviewed, authorized non-synthetic observation channel exists; absence of measurement is not failure or zero demand.',
    });
  });

  it('records the interaction currentness boundary without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[4]).toMatchObject({
      id: 'interaction-currentness-boundary-v1',
      rank: 5,
      status: 'OBSERVATION_BLOCKED',
      hypothesis:
        'Placing a clear controlled-example/no-causation boundary at the search interaction may help visitors interpret matching records without treating them as current incident evidence or an explanation for their own site.',
      firstUserOutcome:
        'Recognize that a filtered record is a controlled example, not current incident evidence or an explanation for their own-site change.',
      metric:
        'Unmeasured interaction-boundary comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the interaction boundary under bounded observation only; no data means no demand or revenue conclusion.',
    });
    expect(
      ledger.experiments
        .slice(0, 4)
        .map((experiment: { rank: number }) => experiment.rank),
    ).toEqual([1, 2, 3, 4]);
  });

  it('records search-scope discoverability without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[5]).toMatchObject({
      id: 'search-scope-discoverability-v1',
      rank: 6,
      status: 'OBSERVATION_BLOCKED',
      hypothesis:
        'Clearly naming phrase/topic search in the visible header may help a visitor find the available retrieval action while retaining currentness/no-causation limits.',
      firstUserOutcome:
        'Recognize that they can search controlled examples by phrase or topic and that a result is not current incident evidence or proof of their own-site cause.',
      metric:
        'Unmeasured search-scope comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the header search-scope disclosure under bounded observation only; no data means no demand or revenue conclusion.',
    });
  });

  it('records offer-preview clarity without claiming retained interest or measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(
      ledger.experiments.map((experiment: { rank: number }) => experiment.rank),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ledger.experiments[6]).toMatchObject({
      id: 'offer-preview-clarity-v1',
      rank: 7,
      status: 'OBSERVATION_BLOCKED',
      hypothesis:
        'An explicit local-only preview outcome may help a visitor understand that activating the preview does not retain interest or create a service.',
      firstUserOutcome:
        'Recognize that a preview click is confirmed locally only and does not send/store data or create an alert/report.',
      metric:
        'Unmeasured offer-preview limit comprehension after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the local-only preview outcome under bounded observation only; no data means no demand or revenue conclusion.',
    });
  });

  it('records source-bound query formulation guidance without claiming measurement', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(
      ledger.experiments.map((experiment: { rank: number }) => experiment.rank),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ledger.experiments[7]).toMatchObject({
      id: 'query-formulation-guidance-v1',
      rank: 8,
      status: 'OBSERVATION_BLOCKED',
      hypothesis:
        'Naming the indexed source, topic, publisher, status, service, interpretation, and stated unknowns as source-bound query inputs may help visitors formulate a retrieval query and refine it by topic without treating a match as current evidence or a causal explanation.',
      firstUserOutcome:
        'Formulate a source-bound query using the source, topic, publisher, status, service, interpretation, or stated unknowns in a record, then refine it by topic.',
      metric:
        'Unmeasured query-formulation completion after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
      nextSafeAction:
        'Keep the source-bound query guidance under bounded observation only; no data means no demand or revenue conclusion.',
    });
  });

  it('records a shareable filtered view without claiming measurement or demand', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(
      ledger.experiments.map((experiment: { rank: number }) => experiment.rank),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ledger.experiments[8]).toMatchObject({
      id: 'shareable-filter-view-v1',
      rank: 9,
      status: 'OBSERVATION_BLOCKED',
      metric:
        'Unmeasured shareable-filter completion after 10 observed non-synthetic sessions.',
      target: '>=60% after 10 observed non-synthetic sessions',
      stopRule: '<30% after 10 sessions retires or reframes the experiment.',
      noDataBoundary: 'No data means no demand or revenue conclusion.',
    });
  });

  it('marks session-dependent experiments observation-blocked without treating missing measurement as failure', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const mutatedLedger = structuredClone(ledger);
    const rankFive = mutatedLedger.experiments.find(
      (experiment: { rank: number }) => experiment.rank === 5,
    );

    rankFive.status = 'ACTIVE_NO_MEASUREMENT';

    assertSessionExperimentsRemainObservationBlocked(ledger.experiments);
    expect(() =>
      assertSessionExperimentsRemainObservationBlocked(
        mutatedLedger.experiments,
      ),
    ).toThrow();
    expect(ledger.experiments[9]).toMatchObject({
      id: 'source-bound-evergreen-guide-v1',
      rank: 10,
      status: 'ROUTE_RELEASE_VERIFIED',
      metric:
        'Deterministic admission of every required guide-contract element and source binding.',
      target: '100% deterministic admission before any public-route proposal.',
      stopRule:
        'Stop publication preparation if a required boundary or source binding cannot be admitted.',
      noDataBoundary:
        'Internal content-quality completion is not SEO traffic, demand, conversion, revenue, or commercial-outcome evidence.',
      coordinatorDependency:
        'The coordinator-owned shared-static-guide-v1 adapter remains the public-route owner; release and public verification are recorded only from coordinator-provided accepted release evidence.',
      coordinatorReleaseEvidence,
      nextSafeAction:
        'Maintain admitted source bindings and guide boundaries; do not claim traffic, demand, conversion, revenue, or another commercial outcome.',
    });
  });

  it('fails closed when a historical session experiment metric drifts', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const mutatedLedger = structuredClone(ledger);
    const rankFive = mutatedLedger.experiments.find(
      (experiment: { rank: number }) => experiment.rank === 5,
    );

    rankFive.metric = 'A replacement metric that must not rewrite history.';

    expect(() =>
      assertSessionExperimentsRemainObservationBlocked(
        mutatedLedger.experiments,
      ),
    ).toThrow();
  });

  it('keeps the guide and rank-ten ledger release evidence in one accepted contract', () => {
    const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    assertEvergreenGuideReleaseEvidenceMatchesLedger(guide, ledger);
  });

  it('rejects a rank-ten ledger release-evidence mutation', () => {
    const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const mutatedLedger = structuredClone(ledger);
    const rankTen = mutatedLedger.experiments.find(
      (experiment: { rank: number }) => experiment.rank === 10,
    );

    rankTen.coordinatorReleaseEvidence.releaseHead = 'stale-release-head';

    expect(() =>
      assertEvergreenGuideReleaseEvidenceMatchesLedger(guide, mutatedLedger),
    ).toThrow();
  });

  it('records the verified worksheet release without claiming an outcome', () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    expect(ledger.experiments[10]).toMatchObject({
      id: 'source-bound-investigation-worksheet-v1',
      rank: 11,
      status: 'ROUTE_RELEASE_VERIFIED',
      metric:
        'Deterministic admission of every required worksheet-contract element and admitted source binding.',
      target:
        '100% deterministic admission and privacy-bounded worksheet behavior before release; coordinator-provided release evidence records the accepted public verification.',
      stopRule:
        'Stop source-bound maintenance if a required boundary or source binding cannot be admitted, the route is unreachable, or worksheet input is transmitted or retained.',
      noDataBoundary:
        'Internal content-quality completion is not SEO traffic, demand, conversion, revenue, or commercial-outcome evidence.',
      coordinatorDependency:
        'The coordinator-owned shared static route adapter remains the public-route owner; release and public verification are recorded only from coordinator-provided accepted release evidence.',
      coordinatorReleaseEvidence: worksheetCoordinatorReleaseEvidence,
      nextSafeAction:
        'Maintain admitted source bindings and worksheet boundaries; do not claim traffic, demand, conversion, revenue, or another commercial outcome.',
    });
  });

  it('keeps the worksheet and rank-eleven ledger release evidence in one accepted contract', () => {
    const worksheet = JSON.parse(readFileSync(worksheetPath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

    assertWorksheetReleaseEvidenceMatchesLedger(worksheet, ledger);
  });

  it('rejects a rank-eleven ledger release-evidence mutation', () => {
    const worksheet = JSON.parse(readFileSync(worksheetPath, 'utf8'));
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const mutatedLedger = structuredClone(ledger);
    const rankEleven = mutatedLedger.experiments.find(
      (experiment: { rank: number }) => experiment.rank === 11,
    );

    rankEleven.coordinatorReleaseEvidence = {
      ...worksheetCoordinatorReleaseEvidence,
      releaseHead: 'stale-release-head',
    };

    expect(() =>
      assertWorksheetReleaseEvidenceMatchesLedger(worksheet, mutatedLedger),
    ).toThrow();
  });
});
