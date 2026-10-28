import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNpmDiffArgs, findOnPath, listChangedFiles } from '../diff';
import type { Runner } from '../outdated';

describe('buildNpmDiffArgs', () => {
  it('diffs two published versions with the requested options', () => {
    const pair = { from: '11.0.0', to: '11.1.0' };
    expect(buildNpmDiffArgs('@types/node', pair)).toEqual([
      'diff',
      '--diff=@types/node@11.0.0',
      '--diff=@types/node@11.1.0',
    ]);
    expect(
      buildNpmDiffArgs('commander', pair, { unified: 0, nameOnly: true }),
    ).toEqual([
      'diff',
      '--diff=commander@11.0.0',
      '--diff=commander@11.1.0',
      '--diff-unified=0',
      '--diff-name-only',
    ]);
  });
});

describe('findOnPath', () => {
  it('finds the first executable file in PATH order', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-diff-'));
    try {
      const a = path.join(dir, 'a');
      const b = path.join(dir, 'b');
      fs.mkdirSync(a);
      fs.mkdirSync(b);
      fs.writeFileSync(path.join(a, 'tool'), '', { mode: 0o644 });
      fs.writeFileSync(path.join(b, 'tool'), '', { mode: 0o755 });
      const env = { PATH: ['', a, b].join(path.delimiter) };
      expect(await findOnPath('tool', env)).toBe(path.join(b, 'tool'));
      expect(await findOnPath('other', env)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('listChangedFiles', () => {
  it('lists the changed files from npm diff --diff-name-only', async () => {
    const calls: string[][] = [];
    const run: Runner = async (args) => {
      calls.push(args);
      return { stdout: 'lib/a.js\nREADME.md\n', stderr: '', code: 0 };
    };
    const pair = { from: '1.0.0', to: '2.0.0' };
    expect(await listChangedFiles('/x', 'pkg', pair, run)).toEqual([
      'lib/a.js',
      'README.md',
    ]);
    expect(calls).toEqual([
      ['diff', '--diff=pkg@1.0.0', '--diff=pkg@2.0.0', '--diff-name-only'],
    ]);
  });

  it('rejects when npm diff fails', async () => {
    const run: Runner = async () => ({ stdout: '', stderr: 'E404', code: 1 });
    await expect(
      listChangedFiles('/x', 'pkg', { from: '1.0.0', to: '2.0.0' }, run),
    ).rejects.toThrow('E404');
  });
});
