import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNpmDiffArgs, findOnPath } from '../diff';

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
