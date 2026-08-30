export interface SearchRecord {
  readonly searchText: string;
  readonly topic: string;
}

export interface SearchCard {
  readonly dataset: {
    readonly searchText?: string;
    readonly searchTopic?: string;
  };
  hidden: boolean;
}

export interface SearchRoot {
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): Iterable<SearchCard>;
}

export function filterSearchRecords(
  records: readonly SearchRecord[],
  query: string,
  topic: string,
): number[];

export function resultCountMessage(count: number, total: number): string;

export function applySearchState(
  cards: SearchCard[],
  query: string,
  topic: string,
): { readonly count: number; readonly message: string };

export function initializeSearchReceipt(root: SearchRoot): boolean;
