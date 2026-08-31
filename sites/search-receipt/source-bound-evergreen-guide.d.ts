export interface SourceBoundGuideManifest {
  readonly sourceId: string;
  readonly endpoint: string;
}

export interface SourceBoundGuideValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export function validateSourceBoundEvergreenGuide(
  guide: unknown,
  manifests: Readonly<Record<string, SourceBoundGuideManifest>>,
): SourceBoundGuideValidationResult;
