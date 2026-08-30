export function buildVitestDiscoveryArgv(
  vitestBin: string,
  sentinelTestPaths: readonly [string, string],
): readonly string[] {
  return [vitestBin, 'run', ...sentinelTestPaths, '--passWithNoTests'];
}
