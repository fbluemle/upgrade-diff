import { describe, expect, it } from 'vitest';
import { buildVariants, classifyBump } from '../variants';

describe('classifyBump', () => {
  it('maps release and pre-release bumps', () => {
    expect(classifyBump('1.0.0', '2.0.0')).toBe('major');
    expect(classifyBump('1.0.0', '1.1.0-rc.1')).toBe('minor');
    expect(classifyBump('1.0.0', '1.0.1')).toBe('patch');
    expect(classifyBump('2.0.0-beta.1', '2.0.0-beta.2')).toBe('prerelease');
    expect(classifyBump('1.0.0', '1.0.0')).toBe('other');
  });
});

describe('buildVariants', () => {
  it('offers the diffs that are actual upgrades', () => {
    const pairs = (current: string, wanted: string, latest: string) =>
      buildVariants({ current, wanted, latest }).map(
        (v) => `${v.from}→${v.to} ${v.label} ${v.bump}`,
      );
    expect(pairs('11.0.0', '11.1.0', '14.0.3')).toEqual([
      '11.0.0→11.1.0 wanted minor',
      '11.0.0→14.0.3 latest major',
      '11.1.0→14.0.3 wanted → latest major',
    ]);
    expect(pairs('5.3.3', '5.9.3', '5.9.3')).toEqual([
      '5.3.3→5.9.3 wanted minor',
    ]);
    expect(pairs('2.0.0', '2.0.0', '3.0.0')).toEqual([
      '2.0.0→3.0.0 latest major',
    ]);
    expect(pairs('3.1.0', '3.1.0', '3.1.0')).toEqual([]);
    expect(pairs('4.0.0-beta.1', '3.9.0', '3.9.0')).toEqual([]);
  });
});
