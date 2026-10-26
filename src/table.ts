import type { createColors } from 'picocolors';
import semver from 'semver';
import { DEP_TYPES, type DepType, type OutdatedPackage } from './outdated';
import { type Bump, classifyBump } from './variants';

export type Colors = ReturnType<typeof createColors>;

export interface TableOptions {
  colors: Colors;
  /** Display position of the row to mark with the cursor, none if omitted */
  active?: number;
  /** Number of entries left out of the list, noted below the table */
  skipped?: number;
}

export interface TableLine {
  text: string;
  /** Display position of the package on this line, absent for headers */
  row?: number;
}

const COLUMNS = ['name', 'range', 'from', 'wanted', 'latest', 'url'] as const;
const GAP = '   ';
const CURSOR = '❯ ';
const NO_CURSOR = '  ';

/** The yarn-style legend shown above the list */
export function renderLegend(c: Colors): string[] {
  return [
    'info Color legend :',
    ` ${c.red('"<red>"')}    : Major Update backward-incompatible updates`,
    ` ${c.yellow('"<yellow>"')} : Minor Update backward-compatible features`,
    ` ${c.green('"<green>"')}  : Patch Update backward-compatible bug fixes`,
  ];
}

export function bumpColor(c: Colors, bump: Bump): (text: string) => string {
  switch (bump) {
    case 'major':
      return c.red;
    case 'minor':
      return c.yellow;
    case 'patch':
      return c.green;
    default:
      return (text) => text;
  }
}

type Cells = Record<(typeof COLUMNS)[number], string>;

function cells(pkg: OutdatedPackage): Cells {
  return {
    name: pkg.name,
    range: pkg.range,
    from: pkg.current,
    wanted: pkg.wanted,
    latest: pkg.latest,
    url: pkg.homepage ?? '',
  };
}

/** Color functions per cell, applied after padding is measured */
function styles(c: Colors, pkg: OutdatedPackage): Partial<Cells> {
  const wantedBump = classifyBump(pkg.current, pkg.wanted);
  const latestBump = classifyBump(pkg.current, pkg.latest);
  const wanted = pkg.wanted === pkg.current ? c.dim : bumpColor(c, wantedBump);
  const latest = pkg.latest === pkg.wanted ? c.dim : bumpColor(c, latestBump);
  const name = semver.gt(pkg.wanted, pkg.current)
    ? bumpColor(c, wantedBump)
    : bumpColor(c, latestBump);
  const plain: Record<string, (text: string) => string> = {
    name,
    wanted,
    latest,
  };
  const styled: Partial<Cells> = {};
  for (const column of COLUMNS) {
    const value = cells(pkg)[column];
    styled[column] = plain[column] ? plain[column](value) : value;
  }
  return styled;
}

/** Packages grouped by section in display order, sorted by name within */
export function groupPackages(
  packages: OutdatedPackage[],
): { type: DepType; packages: OutdatedPackage[] }[] {
  return DEP_TYPES.map((type) => ({
    type,
    packages: packages
      .filter((pkg) => pkg.type === type)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.packages.length > 0);
}

function pad(text: string, styled: string, width: number): string {
  return styled + ' '.repeat(width - text.length);
}

/**
 * Lay out the grouped table. Column widths are shared across groups so
 * columns line up; the last column is not padded.
 */
export function layoutTable(
  packages: OutdatedPackage[],
  options: TableOptions,
): TableLine[] {
  const c = options.colors;
  const groups = groupPackages(packages);
  const widths: Record<string, number> = {};
  for (const column of COLUMNS) {
    widths[column] = Math.max(
      column.length,
      ...packages.map((pkg) => cells(pkg)[column].length),
    );
  }

  const joinCells = (plain: Cells, styled: Partial<Cells>): string =>
    COLUMNS.map((column, i) =>
      i === COLUMNS.length - 1
        ? (styled[column] ?? plain[column])
        : pad(plain[column], styled[column] ?? plain[column], widths[column]),
    )
      .join(GAP)
      .trimEnd();

  const header: Cells = {
    name: 'name',
    range: 'range',
    from: 'from',
    wanted: 'wanted',
    latest: 'latest',
    url: 'url',
  };

  const lines: TableLine[] = [];
  let row = 0;
  for (const [i, group] of groups.entries()) {
    if (i > 0) {
      lines.push({ text: '' });
    }
    lines.push({ text: ` ${c.bold(group.type)}` });
    lines.push({ text: ` ${NO_CURSOR}${c.dim(joinCells(header, {}))}` });
    for (const pkg of group.packages) {
      const prefix = row === options.active ? CURSOR : NO_CURSOR;
      lines.push({
        text: ` ${prefix}${joinCells(cells(pkg), styles(c, pkg))}`,
        row,
      });
      row++;
    }
  }

  if (options.skipped) {
    const noun = options.skipped === 1 ? 'package' : 'packages';
    lines.push({ text: '' });
    lines.push({
      text: c.dim(
        `  (${options.skipped} ${noun} skipped: not installed or not from a registry)`,
      ),
    });
  }
  return lines;
}

export function renderTable(
  packages: OutdatedPackage[],
  options: TableOptions,
): string[] {
  return layoutTable(packages, options).map((line) => line.text);
}

export const UP_TO_DATE = 'All dependencies are up to date.';

/** Legend and table for --list mode, without prompt line or cursor */
export function renderList(
  packages: OutdatedPackage[],
  skipped: number,
  colors: Colors,
): string[] {
  if (packages.length === 0) {
    return [UP_TO_DATE];
  }
  return [
    ...renderLegend(colors),
    '',
    ...renderTable(packages, { colors, skipped }),
  ];
}
