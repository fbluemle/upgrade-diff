import { describe, expect, it } from 'vitest';
import { parseOutdated } from '../outdated';

const ranges = {
  dependencies: { commander: '^11.0.0', alias: 'npm:real-name@^1.0.0' },
  devDependencies: { typescript: '^5.3.0' },
};

describe('parseOutdated', () => {
  it('reads entries, ranges by type, and the first of array values', () => {
    const output = {
      commander: {
        current: '11.0.0',
        wanted: '11.1.0',
        latest: '14.0.3',
        type: 'dependencies',
        homepage: 'https://github.com/tj/commander.js#readme',
      },
      typescript: [
        {
          current: '5.3.3',
          wanted: '5.9.3',
          latest: '5.9.3',
          type: 'devDependencies',
        },
        {
          current: '5.0.0',
          wanted: '5.9.3',
          latest: '5.9.3',
          type: 'devDependencies',
        },
      ],
    };
    expect(parseOutdated(JSON.stringify(output), ranges)).toEqual({
      packages: [
        {
          name: 'commander',
          type: 'dependencies',
          range: '^11.0.0',
          current: '11.0.0',
          wanted: '11.1.0',
          latest: '14.0.3',
          homepage: 'https://github.com/tj/commander.js#readme',
        },
        {
          name: 'typescript',
          type: 'devDependencies',
          range: '^5.3.0',
          current: '5.3.3',
          wanted: '5.9.3',
          latest: '5.9.3',
        },
      ],
      skipped: 0,
    });
  });

  it('skips entries that are not installed, not semver, or aliased', () => {
    const output = {
      missing: { wanted: '1.0.0', latest: '1.0.0', type: 'dependencies' },
      gitdep: { current: 'git', wanted: 'git', latest: 'git' },
      alias: { current: '1.0.0', wanted: '1.1.0', latest: '2.0.0' },
    };
    expect(parseOutdated(JSON.stringify(output), ranges)).toEqual({
      packages: [],
      skipped: 3,
    });
  });

  it('throws on non-JSON output and on an error object', () => {
    expect(() => parseOutdated('npm ERR! boom', ranges)).toThrow(
      'did not produce JSON',
    );
    const error = { error: { summary: 'Could not read package.json' } };
    expect(() => parseOutdated(JSON.stringify(error), ranges)).toThrow(
      'Could not read package.json',
    );
  });
});
