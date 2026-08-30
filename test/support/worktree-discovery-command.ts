import { execFile } from 'node:child_process';

export function buildVitestDiscoveryArgv(
  vitestBin: string,
  sentinelTestPaths: readonly [string, string],
): readonly string[] {
  return [vitestBin, 'run', ...sentinelTestPaths, '--passWithNoTests'];
}

export interface DiscoveryProbeResult {
  readonly stderr: string;
  readonly stdout: string;
}

export type DiscoveryProbeExecutor = (
  executable: string,
  argv: readonly string[],
  options: {
    readonly cwd: string;
    readonly maxBuffer: number;
    readonly timeout: number;
  },
) => Promise<DiscoveryProbeResult>;

const executeDiscoveryProbe: DiscoveryProbeExecutor = (
  executable,
  argv,
  options,
) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      [...argv],
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error !== null) {
          Object.assign(error, { stderr, stdout });
          reject(error);
          return;
        }
        resolve({ stderr, stdout });
      },
    );
  });

export async function runVitestDiscoveryProbe(
  vitestBin: string,
  sentinelTestPaths: readonly [string, string],
  cwd: string,
  executor: DiscoveryProbeExecutor = executeDiscoveryProbe,
): Promise<DiscoveryProbeResult> {
  return executor(
    process.execPath,
    buildVitestDiscoveryArgv(vitestBin, sentinelTestPaths),
    { cwd, maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
  );
}
