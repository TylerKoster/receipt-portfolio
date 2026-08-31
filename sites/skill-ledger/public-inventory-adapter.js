/* global URL */

export const PUBLIC_SKILL_LEDGER_BOUNDARY =
  'Source-bound observations and controlled examples support declared-metadata screening only. No safety, runtime behavior, adoption, currentness, provenance, suitability, ranking, endorsement, or recommendation conclusion is established.';

export const PUBLIC_SKILL_LEDGER_SELECTION_ERROR =
  'Select no more than two records. The existing pair was kept.';

export const CONTROLLED_PUBLIC_SKILL_RECORDS = Object.freeze([
  Object.freeze({
    receiptId: 'controlled-alpha-receipt',
    evidenceClass: 'controlled-only',
    source: Object.freeze({
      sourceId: 'controlled-alpha-source',
      url: 'https://example.invalid/controlled-alpha',
      observedAt: '2026-08-30T12:00:00.000Z',
    }),
    hashes: Object.freeze({
      manifestSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      rawSha256:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      normalizedSha256:
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    }),
    declaredMetadata: Object.freeze({
      packageId: 'controlled-alpha',
      license: 'MIT',
      manifestPresent: true,
      dependencies: Object.freeze([]),
      contentsSha256:
        'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    }),
    staticSignals: Object.freeze([]),
  }),
  Object.freeze({
    receiptId: 'controlled-beta-receipt',
    evidenceClass: 'controlled-only',
    source: Object.freeze({
      sourceId: 'controlled-beta-source',
      url: 'https://example.invalid/controlled-beta',
      observedAt: '2026-08-30T12:05:00.000Z',
    }),
    hashes: Object.freeze({
      manifestSha256:
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      rawSha256:
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      normalizedSha256:
        '1111111111111111111111111111111111111111111111111111111111111111',
    }),
    declaredMetadata: Object.freeze({
      packageId: 'controlled-beta',
      license: 'Apache-2.0',
      manifestPresent: true,
      dependencies: Object.freeze(['controlled-helper']),
      contentsSha256:
        '2222222222222222222222222222222222222222222222222222222222222222',
    }),
    staticSignals: Object.freeze(['declared-script-entry']),
  }),
]);

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US');
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function hasExactFields(value, fields) {
  if (!isObject(value) || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname !== '';
  } catch {
    return false;
  }
}

function isExactImmutableRawGithubUrl(url, pathname) {
  return (
    url.protocol === 'https:' &&
    url.hostname === 'raw.githubusercontent.com' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    url.pathname === pathname
  );
}

function isStrictObservedTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isControlledPublicSkillRecord(record) {
  return (
    isObject(record) &&
    record.evidenceClass === 'controlled-only' &&
    isNonEmptyString(record.receiptId) &&
    isObject(record.source) &&
    isNonEmptyString(record.source.sourceId) &&
    isHttpsUrl(record.source.url) &&
    isStrictObservedTimestamp(record.source.observedAt) &&
    isObject(record.hashes) &&
    isSha256(record.hashes.manifestSha256) &&
    isSha256(record.hashes.rawSha256) &&
    isSha256(record.hashes.normalizedSha256) &&
    isObject(record.declaredMetadata) &&
    isNonEmptyString(record.declaredMetadata.packageId) &&
    typeof record.declaredMetadata.license === 'string' &&
    typeof record.declaredMetadata.manifestPresent === 'boolean' &&
    Array.isArray(record.declaredMetadata.dependencies) &&
    record.declaredMetadata.dependencies.every(isNonEmptyString) &&
    isSha256(record.declaredMetadata.contentsSha256) &&
    Array.isArray(record.staticSignals) &&
    record.staticSignals.every(isNonEmptyString)
  );
}

function isSourceBoundPublicSkillRecord(record) {
  if (
    !hasExactFields(record, [
      'receiptId',
      'evidenceClass',
      'source',
      'hashes',
      'declaredMetadata',
      'inheritedLicense',
      'coverage',
      'boundary',
    ]) ||
    record.evidenceClass !== 'source-bound-observation' ||
    !isSha256(record.receiptId) ||
    !hasExactFields(record.source, [
      'sourceId',
      'url',
      'observedAt',
      'publisher',
      'repository',
      'commit',
      'path',
    ]) ||
    !hasExactFields(record.hashes, [
      'manifestSha256',
      'rawSha256',
      'normalizedSha256',
    ]) ||
    !hasExactFields(record.declaredMetadata, [
      'packageId',
      'description',
      'license',
      'contentsSha256',
    ]) ||
    !hasExactFields(record.inheritedLicense, ['url', 'sha256']) ||
    !hasExactFields(record.coverage, [
      'manifest',
      'dependencies',
      'staticSignals',
      'instructionBody',
    ])
  ) {
    return false;
  }
  let rawUrl;
  let repositoryUrl;
  let licenseUrl;
  try {
    rawUrl = new URL(record.source.url);
    repositoryUrl = new URL(record.source.repository);
    licenseUrl = new URL(record.inheritedLicense.url);
  } catch {
    return false;
  }
  return (
    record.source.sourceId === 'microsoft-skill-creator' &&
    record.source.publisher === 'Microsoft' &&
    record.source.repository === 'https://github.com/microsoft/skills' &&
    /^[a-f0-9]{40}$/u.test(record.source.commit) &&
    record.source.path === '.github/skills/skill-creator/SKILL.md' &&
    isExactImmutableRawGithubUrl(
      rawUrl,
      `/microsoft/skills/${record.source.commit}/${record.source.path}`,
    ) &&
    repositoryUrl.protocol === 'https:' &&
    isExactImmutableRawGithubUrl(
      licenseUrl,
      `/microsoft/skills/${record.source.commit}/LICENSE`,
    ) &&
    isStrictObservedTimestamp(record.source.observedAt) &&
    Object.values(record.hashes).every(isSha256) &&
    isNonEmptyString(record.declaredMetadata.packageId) &&
    isNonEmptyString(record.declaredMetadata.description) &&
    isNonEmptyString(record.declaredMetadata.license) &&
    isSha256(record.declaredMetadata.contentsSha256) &&
    isSha256(record.inheritedLicense.sha256) &&
    record.coverage.manifest === 'not-assessed' &&
    record.coverage.dependencies === 'not-assessed' &&
    record.coverage.staticSignals === 'not-assessed' &&
    record.coverage.instructionBody === 'not-published-or-executed' &&
    isNonEmptyString(record.boundary)
  );
}

function isAdmittedPublicSkillRecord(record) {
  return (
    isControlledPublicSkillRecord(record) ||
    isSourceBoundPublicSkillRecord(record)
  );
}

export function createPublicSkillLedgerFilters(overrides = {}) {
  const dependencyState =
    overrides.dependencyState === 'none' ||
    overrides.dependencyState === 'declared'
      ? overrides.dependencyState
      : '';
  const staticSignalPresence =
    overrides.staticSignalPresence === 'absent' ||
    overrides.staticSignalPresence === 'present'
      ? overrides.staticSignalPresence
      : '';

  return {
    query: String(overrides.query ?? '').trim(),
    declaredLicense: String(overrides.declaredLicense ?? '').trim(),
    dependencyState,
    staticSignalPresence,
  };
}

export function filterPublicSkillLedgerRecords(records, filters) {
  const normalizedFilters = createPublicSkillLedgerFilters(filters);
  const queryTerms = normalized(normalizedFilters.query)
    .split(/\s+/u)
    .filter(Boolean);

  return records.filter((record) => {
    const searchable = normalized(
      `${record.declaredMetadata.packageId} ${record.declaredMetadata.description ?? ''} ${record.source.sourceId} ${record.source.url} ${record.source.publisher ?? ''}`,
    );
    const matchesQuery = queryTerms.every((term) => searchable.includes(term));
    const matchesLicense =
      normalizedFilters.declaredLicense === '' ||
      record.declaredMetadata.license === normalizedFilters.declaredLicense;
    const dependencyState =
      record.evidenceClass === 'controlled-only'
        ? record.declaredMetadata.dependencies.length === 0
          ? 'none'
          : 'declared'
        : 'not-assessed';
    const matchesDependencies =
      normalizedFilters.dependencyState === '' ||
      dependencyState === normalizedFilters.dependencyState;
    const staticSignalPresence =
      record.evidenceClass === 'controlled-only'
        ? record.staticSignals.length === 0
          ? 'absent'
          : 'present'
        : 'not-assessed';
    const matchesStaticSignals =
      normalizedFilters.staticSignalPresence === '' ||
      staticSignalPresence === normalizedFilters.staticSignalPresence;

    return (
      matchesQuery &&
      matchesLicense &&
      matchesDependencies &&
      matchesStaticSignals
    );
  });
}

function recordsAreControlledOnly(records) {
  return records.every((record) => record.evidenceClass === 'controlled-only');
}

function countMessage(count, records) {
  const qualifier = recordsAreControlledOnly(records) ? 'controlled ' : '';
  return `Showing ${count} of ${records.length} ${qualifier}${records.length === 1 ? 'record' : 'records'}.`;
}

export function createPublicSkillLedgerComparison(records, receiptIds) {
  const qualifier = recordsAreControlledOnly(records) ? 'controlled ' : '';
  if (receiptIds.length !== 2 || new Set(receiptIds).size !== 2) {
    return {
      kind: 'not-ready',
      reason: `Select exactly two ${qualifier}records to compare.`,
    };
  }

  const selectedRecords = receiptIds
    .map((receiptId) =>
      records.find((record) => record.receiptId === receiptId),
    )
    .filter(Boolean);
  if (selectedRecords.length !== 2) {
    return {
      kind: 'not-ready',
      reason: `Select exactly two ${qualifier}records to compare.`,
    };
  }

  return { kind: 'ready', records: selectedRecords };
}

export function createPublicSkillLedgerInventoryState(records, options = {}) {
  const phase =
    options.phase === 'loading' || options.phase === 'error'
      ? options.phase
      : 'ready';
  const filters = createPublicSkillLedgerFilters(options.filters);
  const selectedReceiptIds = [...(options.selectedReceiptIds ?? [])];
  const visibleRecords =
    phase === 'loading'
      ? []
      : phase === 'error'
        ? [...records]
        : filterPublicSkillLedgerRecords(records, filters);
  const statusMessage =
    phase === 'loading'
      ? recordsAreControlledOnly(records)
        ? 'Loading controlled source-bound records.'
        : 'Loading source-bound observations and controlled examples.'
      : phase === 'error'
        ? recordsAreControlledOnly(records)
          ? 'Inventory controls are unavailable; all controlled records remain visible.'
          : 'Inventory controls are unavailable; all records remain visible.'
        : countMessage(visibleRecords.length, records);

  return {
    phase,
    filters,
    selectedReceiptIds,
    visibleRecords,
    count: visibleRecords.length,
    total: records.length,
    empty: phase === 'ready' && visibleRecords.length === 0,
    statusMessage,
    errorMessage: phase === 'error' ? String(options.errorMessage ?? '') : '',
    comparison: createPublicSkillLedgerComparison(records, selectedReceiptIds),
  };
}

export function updatePublicSkillLedgerSelection(
  selectedReceiptIds,
  receiptId,
  selected,
) {
  const existingPair = [...new Set(selectedReceiptIds)].slice(0, 2);
  if (!selected) {
    return {
      selectedReceiptIds: existingPair.filter((id) => id !== receiptId),
      errorMessage: '',
    };
  }
  if (existingPair.includes(receiptId)) {
    return { selectedReceiptIds: existingPair, errorMessage: '' };
  }
  if (existingPair.length === 2) {
    return {
      selectedReceiptIds: existingPair,
      errorMessage: PUBLIC_SKILL_LEDGER_SELECTION_ERROR,
    };
  }
  return {
    selectedReceiptIds: [...existingPair, receiptId],
    errorMessage: '',
  };
}

function createTextElement(documentOwner, tagName, text, attributes = {}) {
  const element = documentOwner.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.textContent = text;
  return element;
}

function createOption(documentOwner, value, label) {
  const option = createTextElement(documentOwner, 'option', label, {
    value,
  });
  option.value = value;
  return option;
}

function createLabeledControl(documentOwner, labelText, control, id) {
  const wrapper = documentOwner.createElement('div');
  const label = createTextElement(documentOwner, 'label', labelText, {
    for: id,
  });
  control.setAttribute('id', id);
  wrapper.append(label, control);
  return wrapper;
}

function appendDetail(documentOwner, list, label, value) {
  const row = documentOwner.createElement('div');
  const term = createTextElement(documentOwner, 'dt', label);
  const detail = createTextElement(documentOwner, 'dd', value);
  row.append(term, detail);
  list.append(row);
}

function appendUserInitiatedLinkDetail(
  documentOwner,
  list,
  label,
  url,
  dataAttribute,
) {
  const row = documentOwner.createElement('div');
  const term = createTextElement(documentOwner, 'dt', label);
  const detail = documentOwner.createElement('dd');
  detail.append(
    createTextElement(documentOwner, 'a', url, {
      [dataAttribute]: '',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
  );
  row.append(term, detail);
  list.append(row);
}

function dependencyText(record) {
  if (record.evidenceClass === 'source-bound-observation') {
    return 'Not assessed';
  }
  return record.declaredMetadata.dependencies.length === 0
    ? 'none declared'
    : record.declaredMetadata.dependencies.join(', ');
}

function staticSignalText(record) {
  if (record.evidenceClass === 'source-bound-observation') {
    return 'Not assessed';
  }
  return record.staticSignals.length === 0
    ? 'absent in controlled static signals'
    : `present: ${record.staticSignals.join(', ')}`;
}

function comparisonEvidenceScopeText(record) {
  return record.evidenceClass === 'source-bound-observation'
    ? record.boundary
    : 'Fictional controlled example; no real-source evidence';
}

function comparisonPublisherText(record) {
  return record.evidenceClass === 'source-bound-observation'
    ? record.source.publisher
    : 'Not applicable — fictional example';
}

function renderRecord(documentOwner, record, selectedReceiptIds, onSelection) {
  const article = documentOwner.createElement('article');
  article.setAttribute('data-skill-ledger-record', record.receiptId);
  article.append(
    createTextElement(documentOwner, 'h3', record.declaredMetadata.packageId),
  );

  const selectionId = `skill-ledger-select-${record.receiptId}`;
  const selection = documentOwner.createElement('input');
  selection.setAttribute('data-skill-ledger-record-select', record.receiptId);
  selection.setAttribute('type', 'checkbox');
  selection.setAttribute('id', selectionId);
  selection.setAttribute(
    'aria-label',
    `Select ${record.declaredMetadata.packageId} for comparison`,
  );
  selection.type = 'checkbox';
  selection.value = record.receiptId;
  selection.checked = selectedReceiptIds.includes(record.receiptId);
  selection.addEventListener('change', () => onSelection(selection, record));
  article.append(
    createLabeledControl(
      documentOwner,
      `Compare ${record.declaredMetadata.packageId}`,
      selection,
      selectionId,
    ),
  );

  const details = documentOwner.createElement('dl');
  appendDetail(documentOwner, details, 'Receipt ID', record.receiptId);
  appendDetail(documentOwner, details, 'Evidence class', record.evidenceClass);
  appendDetail(
    documentOwner,
    details,
    'Record type',
    record.evidenceClass === 'source-bound-observation'
      ? 'Source-bound observation'
      : 'Controlled example',
  );
  appendDetail(documentOwner, details, 'Source ID', record.source.sourceId);
  if (record.evidenceClass === 'source-bound-observation') {
    appendUserInitiatedLinkDetail(
      documentOwner,
      details,
      'Immutable raw source URL',
      record.source.url,
      'data-skill-ledger-original-source-link',
    );
  } else {
    appendDetail(documentOwner, details, 'Source URL', record.source.url);
  }
  appendDetail(
    documentOwner,
    details,
    'Observed timestamp',
    record.source.observedAt,
  );
  if (record.evidenceClass === 'source-bound-observation') {
    appendDetail(
      documentOwner,
      details,
      'Publisher named by source',
      record.source.publisher,
    );
    appendDetail(
      documentOwner,
      details,
      'Immutable source commit',
      record.source.commit,
    );
    appendDetail(documentOwner, details, 'Source path', record.source.path);
    appendDetail(
      documentOwner,
      details,
      'Declared description',
      record.declaredMetadata.description,
    );
  }
  appendDetail(
    documentOwner,
    details,
    'Manifest SHA-256',
    record.hashes.manifestSha256,
  );
  appendDetail(documentOwner, details, 'Raw SHA-256', record.hashes.rawSha256);
  appendDetail(
    documentOwner,
    details,
    'Normalized SHA-256',
    record.hashes.normalizedSha256,
  );
  appendDetail(
    documentOwner,
    details,
    'Contents SHA-256',
    record.declaredMetadata.contentsSha256,
  );
  appendDetail(
    documentOwner,
    details,
    'Declared license',
    record.declaredMetadata.license || 'not declared',
  );
  appendDetail(
    documentOwner,
    details,
    'Declared manifest',
    record.evidenceClass === 'source-bound-observation'
      ? 'Not assessed'
      : record.declaredMetadata.manifestPresent
        ? 'present'
        : 'not present',
  );
  appendDetail(
    documentOwner,
    details,
    'Declared dependencies',
    dependencyText(record),
  );
  appendDetail(
    documentOwner,
    details,
    'Static-signal presence',
    staticSignalText(record),
  );
  if (record.evidenceClass === 'source-bound-observation') {
    appendUserInitiatedLinkDetail(
      documentOwner,
      details,
      'License evidence URL',
      record.inheritedLicense.url,
      'data-skill-ledger-license-evidence-link',
    );
    appendDetail(
      documentOwner,
      details,
      'License SHA-256',
      record.inheritedLicense.sha256,
    );
    appendDetail(documentOwner, details, 'Evidence boundary', record.boundary);
  }
  article.append(details);
  return article;
}

function renderComparison(documentOwner, comparisonRoot, comparison) {
  comparisonRoot.textContent = '';
  if (comparison.kind !== 'ready') {
    comparisonRoot.append(
      createTextElement(documentOwner, 'p', comparison.reason),
    );
    return;
  }

  const [left, right] = comparison.records;
  comparisonRoot.append(
    createTextElement(
      documentOwner,
      'h3',
      `Ready comparison: ${left.declaredMetadata.packageId} and ${right.declaredMetadata.packageId}.`,
    ),
  );
  const details = documentOwner.createElement('dl');
  const comparisonRows = [
    [
      'Record type',
      left.evidenceClass === 'source-bound-observation'
        ? 'Source-bound observation'
        : 'Controlled example',
      right.evidenceClass === 'source-bound-observation'
        ? 'Source-bound observation'
        : 'Controlled example',
    ],
    [
      'Evidence scope',
      comparisonEvidenceScopeText(left),
      comparisonEvidenceScopeText(right),
    ],
    [
      'Publisher named by source',
      comparisonPublisherText(left),
      comparisonPublisherText(right),
    ],
    ['Source ID', left.source.sourceId, right.source.sourceId],
    ['Source URL', left.source.url, right.source.url],
    ['Observed timestamp', left.source.observedAt, right.source.observedAt],
    [
      'Manifest SHA-256',
      left.hashes.manifestSha256,
      right.hashes.manifestSha256,
    ],
    ['Raw SHA-256', left.hashes.rawSha256, right.hashes.rawSha256],
    [
      'Normalized SHA-256',
      left.hashes.normalizedSha256,
      right.hashes.normalizedSha256,
    ],
    [
      'Contents SHA-256',
      left.declaredMetadata.contentsSha256,
      right.declaredMetadata.contentsSha256,
    ],
    [
      'Declared license',
      left.declaredMetadata.license,
      right.declaredMetadata.license,
    ],
    ['Declared dependencies', dependencyText(left), dependencyText(right)],
    ['Static-signal presence', staticSignalText(left), staticSignalText(right)],
  ];
  for (const [label, leftValue, rightValue] of comparisonRows) {
    appendDetail(
      documentOwner,
      details,
      label,
      `${leftValue === rightValue ? 'Same' : 'Different'} — Left: ${leftValue}; Right: ${rightValue}`,
    );
  }
  comparisonRoot.append(details);
}

export function initializePublicSkillLedgerInventory(
  root,
  records = CONTROLLED_PUBLIC_SKILL_RECORDS,
) {
  if (!root || root.getAttribute?.('data-skill-ledger-bound') === 'true') {
    return Boolean(root);
  }
  const documentOwner = root.ownerDocument;
  if (!documentOwner?.createElement || typeof root.append !== 'function') {
    root?.setAttribute?.('data-skill-ledger-state', 'error');
    return false;
  }

  const recordsAreControlled =
    Array.isArray(records) &&
    records.every(isAdmittedPublicSkillRecord) &&
    new Set(records.map((record) => record.receiptId)).size === records.length;
  const sourceRecords = recordsAreControlled ? [...records] : [];
  const controlledOnly = recordsAreControlledOnly(sourceRecords);
  root.textContent = '';
  root.setAttribute('data-skill-ledger-public-inventory', '');
  root.setAttribute('data-skill-ledger-state', 'loading');

  const heading = createTextElement(
    documentOwner,
    'h2',
    sourceRecords.some(
      (record) => record.evidenceClass === 'source-bound-observation',
    )
      ? 'Source-bound skill inventory'
      : 'Controlled source-bound skill inventory',
  );
  const boundary = createTextElement(
    documentOwner,
    'p',
    PUBLIC_SKILL_LEDGER_BOUNDARY,
    { 'data-skill-ledger-boundary': '' },
  );
  const status = createTextElement(
    documentOwner,
    'p',
    controlledOnly
      ? 'Loading controlled source-bound records.'
      : 'Loading source-bound observations and controlled examples.',
    {
      'data-skill-ledger-status': '',
      role: 'status',
      'aria-live': 'polite',
    },
  );
  const error = createTextElement(documentOwner, 'p', '', {
    'data-skill-ledger-error': '',
    role: 'alert',
  });
  error.hidden = true;
  const empty = createTextElement(
    documentOwner,
    'p',
    controlledOnly
      ? 'No controlled records match these in-memory filters. Clear filters to restore all records.'
      : 'No records match these in-memory filters. Clear filters to restore all records.',
    { 'data-skill-ledger-empty': '' },
  );
  empty.hidden = true;

  const controls = documentOwner.createElement('form');
  controls.setAttribute('data-skill-ledger-controls', '');
  controls.setAttribute(
    'aria-label',
    controlledOnly ? 'Filter controlled skill records' : 'Filter skill records',
  );
  const query = documentOwner.createElement('input');
  query.setAttribute('data-skill-ledger-query', '');
  query.setAttribute('type', 'search');
  query.type = 'search';

  const license = documentOwner.createElement('select');
  license.setAttribute('data-skill-ledger-license-filter', '');
  license.append(createOption(documentOwner, '', 'All declared licenses'));
  for (const declaredLicense of [
    ...new Set(sourceRecords.map((record) => record.declaredMetadata.license)),
  ].sort()) {
    license.append(
      createOption(
        documentOwner,
        declaredLicense,
        declaredLicense || 'Not declared',
      ),
    );
  }

  const dependency = documentOwner.createElement('select');
  dependency.setAttribute('data-skill-ledger-dependency-filter', '');
  dependency.append(
    createOption(documentOwner, '', 'All declared dependency states'),
    createOption(documentOwner, 'none', 'No dependencies declared'),
    createOption(documentOwner, 'declared', 'Dependencies declared'),
  );

  const staticSignal = documentOwner.createElement('select');
  staticSignal.setAttribute('data-skill-ledger-static-filter', '');
  staticSignal.append(
    createOption(documentOwner, '', 'All static-signal states'),
    createOption(documentOwner, 'absent', 'No static signals present'),
    createOption(documentOwner, 'present', 'Static signals present'),
  );

  const reset = createTextElement(
    documentOwner,
    'button',
    'Clear filters and selection',
    {
      'data-skill-ledger-reset': '',
      type: 'button',
    },
  );
  reset.type = 'button';
  controls.append(
    createLabeledControl(
      documentOwner,
      'Package or source query',
      query,
      'skill-ledger-query',
    ),
    createLabeledControl(
      documentOwner,
      'Declared license',
      license,
      'skill-ledger-license-filter',
    ),
    createLabeledControl(
      documentOwner,
      'Declared dependency state',
      dependency,
      'skill-ledger-dependency-filter',
    ),
    createLabeledControl(
      documentOwner,
      'Static-signal presence',
      staticSignal,
      'skill-ledger-static-filter',
    ),
    reset,
  );

  const results = documentOwner.createElement('div');
  results.setAttribute('data-skill-ledger-results', '');
  results.setAttribute(
    'aria-label',
    controlledOnly ? 'Controlled source-bound records' : 'Skill records',
  );
  const comparison = documentOwner.createElement('section');
  comparison.setAttribute('data-skill-ledger-comparison', '');
  comparison.setAttribute('aria-label', 'Selected record comparison');
  comparison.setAttribute('aria-live', 'polite');
  root.append(
    heading,
    boundary,
    status,
    error,
    controls,
    empty,
    results,
    comparison,
  );

  let filters = createPublicSkillLedgerFilters();
  let selectedReceiptIds = [];

  const showError = (message) => {
    error.textContent = message;
    error.hidden = message === '';
  };

  const render = (phase = 'ready', errorMessage = '') => {
    let state;
    try {
      state = createPublicSkillLedgerInventoryState(sourceRecords, {
        phase,
        filters,
        selectedReceiptIds,
        errorMessage,
      });
    } catch {
      state = createPublicSkillLedgerInventoryState(sourceRecords, {
        phase: 'error',
        selectedReceiptIds,
        errorMessage: 'Filtering is unavailable.',
      });
    }

    root.setAttribute('data-skill-ledger-state', state.phase);
    status.textContent = state.statusMessage;
    empty.hidden = !state.empty;
    results.textContent = '';
    for (const record of state.visibleRecords) {
      results.append(
        renderRecord(
          documentOwner,
          record,
          selectedReceiptIds,
          (selection, selectedRecord) => {
            const selectionResult = updatePublicSkillLedgerSelection(
              selectedReceiptIds,
              selectedRecord.receiptId,
              selection.checked,
            );
            if (selectionResult.errorMessage !== '') selection.checked = false;
            selectedReceiptIds = selectionResult.selectedReceiptIds;
            showError(selectionResult.errorMessage);
            renderComparison(
              documentOwner,
              comparison,
              createPublicSkillLedgerComparison(
                sourceRecords,
                selectedReceiptIds,
              ),
            );
          },
        ),
      );
    }
    renderComparison(documentOwner, comparison, state.comparison);
    showError(state.errorMessage);
  };

  const applyFilters = () => {
    filters = createPublicSkillLedgerFilters({
      query: query.value,
      declaredLicense: license.value,
      dependencyState: dependency.value,
      staticSignalPresence: staticSignal.value,
    });
    render();
  };
  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  query.addEventListener('input', applyFilters);
  license.addEventListener('change', applyFilters);
  dependency.addEventListener('change', applyFilters);
  staticSignal.addEventListener('change', applyFilters);
  reset.addEventListener('click', () => {
    query.value = '';
    license.value = '';
    dependency.value = '';
    staticSignal.value = '';
    filters = createPublicSkillLedgerFilters();
    selectedReceiptIds = [];
    showError('');
    render();
    query.focus?.();
  });

  if (!recordsAreControlled) {
    render(
      'error',
      'Supplied records failed strict validation and were not shown.',
    );
  } else {
    render();
  }
  root.setAttribute('data-skill-ledger-bound', 'true');
  return true;
}
