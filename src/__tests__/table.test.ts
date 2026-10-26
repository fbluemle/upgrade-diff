import { createColors } from 'picocolors';
import { describe, expect, it } from 'vitest';
import type { OutdatedPackage } from '../outdated';
import { renderTable } from '../table';

const commander: OutdatedPackage = {
  name: 'commander',
  type: 'dependencies',
  range: '^11.0.0',
  current: '11.0.0',
  wanted: '11.1.0',
  latest: '14.0.3',
  homepage: 'https://github.com/tj/commander.js#readme',
};

const typescript: OutdatedPackage = {
  name: 'typescript',
  type: 'devDependencies',
  range: '^5.3.0',
  current: '5.3.3',
  wanted: '5.9.3',
  latest: '5.9.3',
  homepage: 'https://www.typescriptlang.org/',
};

const biome: OutdatedPackage = {
  name: '@biomejs/biome',
  type: 'devDependencies',
  range: '^2.0.0',
  current: '2.0.0',
  wanted: '2.0.0',
  latest: '3.0.0',
};

describe('renderTable', () => {
  it('groups by type, sorts by name, aligns columns, and marks the cursor', () => {
    const colors = createColors(false);
    expect(
      renderTable([typescript, commander, biome], {
        colors,
        active: 1,
        skipped: 2,
      }),
    ).toEqual([
      ' dependencies',
      '   name             range     from     wanted   latest   url',
      '   commander        ^11.0.0   11.0.0   11.1.0   14.0.3   https://github.com/tj/commander.js#readme',
      '',
      ' devDependencies',
      '   name             range     from     wanted   latest   url',
      ' ❯ @biomejs/biome   ^2.0.0    2.0.0    2.0.0    3.0.0',
      '   typescript       ^5.3.0    5.3.3    5.9.3    5.9.3    https://www.typescriptlang.org/',
      '',
      '  (2 packages skipped: not installed or not from a registry)',
    ]);
  });

  it('colors by bump and dims unchanged versions', () => {
    const c = createColors(true);
    const [, , row] = renderTable([commander], { colors: c });
    expect(row).toContain(c.yellow('commander'));
    expect(row).toContain(c.yellow('11.1.0'));
    expect(row).toContain(c.red('14.0.3'));
    const [, , dimmed] = renderTable([biome], { colors: c });
    expect(dimmed).toContain(c.red('@biomejs/biome'));
    expect(dimmed).toContain(c.dim('2.0.0'));
  });
});
