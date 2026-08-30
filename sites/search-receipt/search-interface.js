/* global document */

function normalized(value) {
  return value.trim().toLocaleLowerCase('en-US');
}

export function filterSearchRecords(records, query, topic) {
  const normalizedQuery = normalized(query);
  const normalizedTopic = normalized(topic);
  return records.flatMap((record, index) => {
    const searchableText = normalized(record.searchText);
    const matchesQuery =
      normalizedQuery === '' ||
      normalizedQuery
        .split(/\s+/u)
        .every((term) => searchableText.includes(term));
    const matchesTopic =
      normalizedTopic === '' || normalized(record.topic) === normalizedTopic;
    return matchesQuery && matchesTopic ? [index] : [];
  });
}

export function resultCountMessage(count, total) {
  if (count === 0) return 'No records match this query and filter.';
  return `Showing ${count} of ${total} ${total === 1 ? 'record' : 'records'}.`;
}

export function applySearchState(cards, query, topic) {
  const matches = new Set(
    filterSearchRecords(
      cards.map((card) => ({
        searchText: card.dataset.searchText ?? '',
        topic: card.dataset.searchTopic ?? '',
      })),
      query,
      topic,
    ),
  );
  cards.forEach((card, index) => {
    card.hidden = !matches.has(index);
  });
  return {
    count: matches.size,
    message: resultCountMessage(matches.size, cards.length),
  };
}

function findOrCreateResetControl(root, form) {
  const existing = root.querySelector('[data-search-reset]');
  if (existing) return existing;

  const document = form.ownerDocument;
  if (!document?.createElement || typeof form.append !== 'function')
    return null;

  const reset = document.createElement('button');
  reset.setAttribute('data-search-reset', '');
  reset.textContent = 'Clear filters';
  reset.type = 'button';
  form.append(reset);
  return reset;
}

export function initializeSearchReceipt(root) {
  const form = root.querySelector('[data-search-controls]');
  const query = root.querySelector('[data-search-query]');
  const topic = root.querySelector('[data-search-topic-filter]');
  const status = root.querySelector('[data-search-status]');
  const empty = root.querySelector('[data-search-empty]');
  const error = root.querySelector('[data-search-error]');
  const offer = root.querySelector('[data-measurement-action]');
  const offerStatus = root.querySelector('[data-offer-status]');
  const cards = [...root.querySelectorAll('[data-search-record]')];

  if (!form || !query || !topic || !status || !empty || !error) return false;
  if (form.dataset?.searchInterfaceBound === 'true') return true;

  const reset = findOrCreateResetControl(root, form);

  const apply = () => {
    try {
      const result = applySearchState(cards, query.value, topic.value);
      status.textContent = result.message;
      empty.hidden = result.count !== 0;
      error.hidden = true;
    } catch {
      error.hidden = false;
      status.textContent = 'Search is unavailable; all records remain visible.';
      empty.hidden = true;
      cards.forEach((card) => {
        card.hidden = false;
      });
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply();
  });
  query.addEventListener('input', apply);
  topic.addEventListener('change', apply);
  reset?.addEventListener('click', () => {
    query.value = '';
    topic.value = '';
    apply();
    if (typeof query.focus === 'function') query.focus();
  });
  offer?.addEventListener('click', () => {
    offer.disabled = true;
    if (offerStatus) {
      offerStatus.textContent =
        'Interest noted in this page only. No data was sent and no alert was created.';
    }
  });
  apply();
  if (form.dataset) form.dataset.searchInterfaceBound = 'true';
  return true;
}

if (typeof document !== 'undefined') initializeSearchReceipt(document);
