import { posix, win32 } from 'node:path';

export interface LiveSourceFacts {
  readonly status: number;
  readonly finalUrl: string;
  readonly contentType: string | null;
  readonly acceptRanges: string | null;
  readonly contentLength: string | null;
  readonly contentRange: string | null;
}

export interface BrowserJourneyFacts {
  readonly query: string;
  readonly visibleResultCount: number;
  readonly firstMomentId: string;
  readonly anchorHref: string;
  readonly activatedBy: string;
  readonly locationHref: string;
  readonly currentSrc: string;
  readonly currentTime: number;
  readonly duration: number;
  readonly seeking: boolean;
  readonly readyState: number;
  readonly paused: boolean;
  readonly error: string | null;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly mediaResponseStatus: number;
  readonly mediaResponseContentRange: string | null;
  readonly mediaResponseAcceptRanges: string | null;
  readonly mediaResponseContentType: string | null;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
}

export const PINNED_PLAYWRIGHT_CLI_VERSION = '0.1.18';

export function playwrightCliInvocation(
  platform: NodeJS.Platform,
  nodeExecutable: string,
  projectDirectory = '.',
): {
  readonly executable: string;
  readonly leadingArguments: readonly string[];
} {
  const path = platform === 'win32' ? win32 : posix;
  return {
    executable: nodeExecutable,
    leadingArguments: [
      path.join(
        projectDirectory,
        'node_modules',
        '@playwright',
        'cli',
        'playwright-cli.js',
      ),
    ],
  };
}

export function validatePlaywrightCliPackage(value: unknown): ValidationResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, diagnostics: ['PLAYWRIGHT_CLI_PACKAGE_INVALID'] };
  }
  const diagnostics: string[] = [];
  const packageRecord = value as {
    name?: unknown;
    version?: unknown;
    bin?: unknown;
  };
  if (packageRecord.name !== '@playwright/cli')
    diagnostics.push('PLAYWRIGHT_CLI_NAME_MISMATCH');
  if (packageRecord.version !== PINNED_PLAYWRIGHT_CLI_VERSION)
    diagnostics.push('PLAYWRIGHT_CLI_VERSION_MISMATCH');
  if (
    typeof packageRecord.bin !== 'object' ||
    packageRecord.bin === null ||
    (packageRecord.bin as Record<string, unknown>)['playwright-cli'] !==
      'playwright-cli.js'
  ) {
    diagnostics.push('PLAYWRIGHT_CLI_BIN_MISMATCH');
  }
  diagnostics.sort();
  return { ok: diagnostics.length === 0, diagnostics };
}

export function playwrightPageFunction(body: string): string {
  return `async (page) => { ${body} }`;
}

export const VIDEO_MOMENT_SOURCE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm';
export const VIDEO_MOMENT_TIMESTAMP_URL = `${VIDEO_MOMENT_SOURCE_URL}#t=132`;
export const VIDEO_MOMENT_QUERY = 'robots control';
export const VIDEO_MOMENT_ID = 'moment-robots-control';
const EXPECTED_SOURCE_BYTES = 24_788_866;
const EXPECTED_DURATION_SECONDS = 907.299;

export function validateLiveSourceFacts(
  facts: LiveSourceFacts,
): ValidationResult {
  const diagnostics: string[] = [];
  if (facts.status !== 206) diagnostics.push('LIVE_SOURCE_STATUS_MISMATCH');
  if (facts.finalUrl !== VIDEO_MOMENT_SOURCE_URL)
    diagnostics.push('LIVE_SOURCE_URL_MISMATCH');
  if (
    facts.contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'video/webm'
  )
    diagnostics.push('LIVE_SOURCE_CONTENT_TYPE_MISMATCH');
  if (facts.acceptRanges?.trim().toLowerCase() !== 'bytes')
    diagnostics.push('LIVE_SOURCE_ACCEPT_RANGES_MISMATCH');
  if (facts.contentLength !== '1')
    diagnostics.push('LIVE_SOURCE_CONTENT_LENGTH_MISMATCH');
  if (facts.contentRange !== `bytes 0-0/${EXPECTED_SOURCE_BYTES}`)
    diagnostics.push('LIVE_SOURCE_CONTENT_RANGE_MISMATCH');
  diagnostics.sort();
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateBrowserJourneyFacts(
  facts: BrowserJourneyFacts,
  toleranceSeconds = 1,
): ValidationResult {
  const diagnostics: string[] = [];
  if (facts.query !== VIDEO_MOMENT_QUERY)
    diagnostics.push('BROWSER_QUERY_MISMATCH');
  if (facts.visibleResultCount < 1)
    diagnostics.push('BROWSER_VISIBLE_RESULTS_MISSING');
  if (facts.firstMomentId !== VIDEO_MOMENT_ID)
    diagnostics.push('BROWSER_FIRST_RESULT_MISMATCH');
  if (facts.anchorHref !== VIDEO_MOMENT_TIMESTAMP_URL)
    diagnostics.push('BROWSER_ANCHOR_MISMATCH');
  if (facts.activatedBy !== 'normal-anchor-click')
    diagnostics.push('BROWSER_ACTIVATION_NOT_NORMAL_ANCHOR');
  if (
    facts.locationHref !== VIDEO_MOMENT_TIMESTAMP_URL ||
    facts.currentSrc !== VIDEO_MOMENT_TIMESTAMP_URL
  ) {
    diagnostics.push('BROWSER_DESTINATION_MISMATCH');
  }
  if (
    !Number.isFinite(toleranceSeconds) ||
    toleranceSeconds < 0 ||
    !Number.isFinite(facts.currentTime) ||
    Math.abs(facts.currentTime - 132) > toleranceSeconds
  ) {
    diagnostics.push('BROWSER_TIMESTAMP_OUT_OF_TOLERANCE');
  }
  if (
    !Number.isFinite(facts.duration) ||
    Math.abs(facts.duration - EXPECTED_DURATION_SECONDS) > 0.01
  ) {
    diagnostics.push('BROWSER_DURATION_MISMATCH');
  }
  if (facts.seeking) diagnostics.push('BROWSER_STILL_SEEKING');
  if (facts.readyState < 2) diagnostics.push('BROWSER_MEDIA_NOT_READY');
  if (!facts.paused) diagnostics.push('BROWSER_MEDIA_NOT_PAUSED');
  if (facts.error !== null) diagnostics.push('BROWSER_MEDIA_ERROR');
  if (facts.videoWidth <= 0 || facts.videoHeight <= 0)
    diagnostics.push('BROWSER_MEDIA_DIMENSIONS_MISSING');
  if (facts.mediaResponseStatus !== 206)
    diagnostics.push('BROWSER_MEDIA_RESPONSE_STATUS_MISMATCH');
  const rangeMatch = facts.mediaResponseContentRange?.match(
    /^bytes (\d+)-(\d+)\/(\d+)$/u,
  );
  const rangeValues = rangeMatch?.slice(1).map(Number);
  if (
    rangeValues === undefined ||
    rangeValues.length !== 3 ||
    !rangeValues.every(Number.isSafeInteger) ||
    rangeValues[0]! < 0 ||
    rangeValues[0]! > rangeValues[1]! ||
    rangeValues[2] !== EXPECTED_SOURCE_BYTES ||
    rangeValues[1]! >= rangeValues[2]!
  ) {
    diagnostics.push('BROWSER_MEDIA_CONTENT_RANGE_MISMATCH');
  }
  if (facts.mediaResponseAcceptRanges?.toLowerCase() !== 'bytes')
    diagnostics.push('BROWSER_MEDIA_ACCEPT_RANGES_MISMATCH');
  if (
    facts.mediaResponseContentType?.split(';', 1)[0]?.trim().toLowerCase() !==
    'video/webm'
  ) {
    diagnostics.push('BROWSER_MEDIA_CONTENT_TYPE_MISMATCH');
  }
  diagnostics.sort();
  return { ok: diagnostics.length === 0, diagnostics };
}
