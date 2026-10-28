import { createColors } from 'picocolors';
import { describe, expect, it } from 'vitest';
import { groupFiles } from '../files';
import { renderFileGroups } from '../prompt';

describe('renderFileGroups', () => {
  it('aligns labels and counts and notes types and root files', () => {
    const files = [
      'lib/index.js',
      'dist/index.js',
      'dist/index.d.ts',
      'package.json',
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
    ];
    expect(renderFileGroups(groupFiles(files), createColors(false))).toEqual([
      'all               7 files',
      'dist/             2 files',
      'lib/              1 file',
      '*.d.ts            1 file    (types only)',
      'top-level files   4 files   (package.json, README.md, LICENSE, ...)',
    ]);
  });
});
