import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const discoveryTestPath = fileURLToPath(
  new URL('./worktree-discovery.test.ts', import.meta.url),
);

describe('worktree discovery regression-test contract', () => {
  it('passes the exact constructed sentinels to the encapsulated probe', async () => {
    const source = await readFile(discoveryTestPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      discoveryTestPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const probeCalls: ts.CallExpression[] = [];
    const rawChildCalls: ts.CallExpression[] = [];

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'runVitestDiscoveryProbe'
      ) {
        probeCalls.push(node);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^(?:execFile|execFileAsync)$/.test(node.expression.text)
      ) {
        rawChildCalls.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    expect(rawChildCalls).toEqual([]);
    expect(probeCalls).toHaveLength(1);
    const arguments_ = probeCalls[0]!.arguments;
    expect(arguments_.map((argument) => argument.getText(sourceFile))).toEqual([
      'vitestBin',
      'sentinelTestPaths',
      'projectRoot',
    ]);
  });
});
