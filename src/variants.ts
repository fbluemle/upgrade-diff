import semver from 'semver';
import type { OutdatedPackage } from './outdated';

export type Bump = 'major' | 'minor' | 'patch' | 'prerelease' | 'other';

export type VariantLabel = 'wanted' | 'latest' | 'wanted → latest';

export interface DiffVariant {
  from: string;
  to: string;
  label: VariantLabel;
  bump: Bump;
}

/**
 * Kind of version change between two versions. Pre-release bumps collapse
 * into the release kind they lead to; equal versions are 'other'.
 */
export function classifyBump(from: string, to: string): Bump {
  switch (semver.diff(from, to)) {
    case 'major':
    case 'premajor':
      return 'major';
    case 'minor':
    case 'preminor':
      return 'minor';
    case 'patch':
    case 'prepatch':
      return 'patch';
    case 'prerelease':
      return 'prerelease';
    default:
      return 'other';
  }
}

function variant(from: string, to: string, label: VariantLabel): DiffVariant {
  return { from, to, label, bump: classifyBump(from, to) };
}

/**
 * The diffs worth showing for a package: current to wanted, current to
 * latest, and wanted to latest, each only when it is an actual upgrade and
 * not a duplicate of another variant.
 */
export function buildVariants(
  pkg: Pick<OutdatedPackage, 'current' | 'wanted' | 'latest'>,
): DiffVariant[] {
  const { current, wanted, latest } = pkg;
  const variants: DiffVariant[] = [];
  if (semver.gt(wanted, current)) {
    variants.push(variant(current, wanted, 'wanted'));
  }
  if (semver.gt(latest, current) && latest !== wanted) {
    variants.push(variant(current, latest, 'latest'));
  }
  if (semver.gt(latest, wanted) && wanted !== current) {
    variants.push(variant(wanted, latest, 'wanted → latest'));
  }
  return variants;
}
