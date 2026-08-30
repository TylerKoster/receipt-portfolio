import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const discoveryTestPath = fileURLToPath(
  new URL('./worktree-discovery.test.ts', import.meta.url),
);

describe('worktree discovery regression-test contract', () => {
  it('routes its only child process through the bounded argv builder', async () => {
    const source = await readFile(discoveryTestPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      discoveryTestPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const childCalls: ts.CallExpression[] = [];

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'execFileAsync'
      ) {
        childCalls.push(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    expect(childCalls).toHaveLength(1);
    const [executable, arguments_] = childCalls[0]!.arguments;
    expect(executable?.getText(sourceFile)).toBe('process.execPath');
    expect(ts.isIdentifier(arguments_!) && arguments_.text === 'childArgv').toBe(
      true,
    );
  });
});
