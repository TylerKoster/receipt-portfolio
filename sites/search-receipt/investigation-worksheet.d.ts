interface WorksheetFieldLike {
  readonly value?: unknown;
}

interface WorksheetStepLike {
  querySelectorAll(selector: string): Iterable<WorksheetFieldLike>;
}

interface WorksheetRootLike {
  readonly dataset: Record<string, string | undefined>;
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): Iterable<WorksheetStepLike>;
}

export function countCompletedWorksheetSteps(
  steps: readonly WorksheetStepLike[],
): number;

export function initializeInvestigationWorksheet(
  root?: WorksheetRootLike | null,
  printPage?: () => void,
): boolean;
