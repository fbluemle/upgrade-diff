import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { filterDiff, groupFiles, headerFile, parseNameOnly } from '../files';

describe('parseNameOnly', () => {
  it('reads one file per line and ignores blank output', () => {
    expect(parseNameOnly('lib/a.js\nREADME.md\n')).toEqual([
      'lib/a.js',
      'README.md',
    ]);
    expect(parseNameOnly('\n')).toEqual([]);
  });
});

describe('groupFiles', () => {
  it('groups by top-level directory, types, and root files', () => {
    const files = [
      'package.json',
      'lib/index.js',
      'dist/index.js',
      'dist/index.d.ts',
      'dist/esm/index.d.mts',
      'README.md',
    ];
    expect(
      groupFiles(files).map((g) => `${g.label} ${g.files.length}`),
    ).toEqual(['all 6', 'dist/ 3', 'lib/ 1', '*.d.ts 2', 'top-level files 2']);
  });

  it('leaves out empty groups', () => {
    const labels = (files: string[]) => groupFiles(files).map((g) => g.label);
    expect(labels(['index.js'])).toEqual(['all', 'top-level files']);
    expect(labels([])).toEqual(['all']);
  });
});

describe('headerFile', () => {
  it('reads the file name from a diff header', () => {
    expect(headerFile('diff --git a/lib/a.js b/lib/a.js\n')).toBe('lib/a.js');
    expect(headerFile('diff --git a/my file b/my file')).toBe('my file');
    expect(headerFile('\x1b[34mdiff --git a/x b/x\x1b[39m\n')).toBe('x');
    expect(headerFile('--- a/lib/a.js\n')).toBeUndefined();
    expect(headerFile('diff --git a/x b/y\n')).toBeUndefined();
  });
});

async function collect(stream: NodeJS.ReadableStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) {
    out += chunk.toString();
  }
  return out;
}

describe('filterDiff', () => {
  const section = (file: string) =>
    [
      `diff --git a/${file} b/${file}`,
      'index v1..v2 100644',
      `--- a/${file}`,
      `+++ b/${file}`,
      '@@ -1 +1 @@',
      '-old',
      '+new ✓',
      '',
    ].join('\n');

  it('keeps only the sections of the given files', async () => {
    const diff = section('lib/a.js') + section('dist/a.js') + section('b.js');
    // split into small chunks, also inside multi-byte characters
    const bytes = Buffer.from(diff);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 7) {
      chunks.push(bytes.subarray(i, i + 7));
    }
    const out = await collect(
      Readable.from(chunks).pipe(filterDiff(['lib/a.js', 'b.js'])),
    );
    expect(out).toBe(section('lib/a.js') + section('b.js'));
  });
});
