import {
  ExitPromptError,
  type KeypressEvent,
  createPrompt,
  isDownKey,
  isEnterKey,
  isUpKey,
  useKeypress,
  usePagination,
  usePrefix,
  useState,
} from '@inquirer/core';
import pc from 'picocolors';
import type { VersionPair } from './diff';
import type { FileGroup } from './files';
import type { OutdatedPackage } from './outdated';
import {
  type Colors,
  bumpColor,
  groupPackages,
  layoutTable,
  renderLegend,
} from './table';
import type { DiffVariant } from './variants';

export interface PackagePick {
  /** Display position of the package, to restore the cursor later */
  index: number;
  package: OutdatedPackage;
}

const PACKAGE_MESSAGE =
  'Choose a package to diff (↑/↓ or j/k move, enter select, q quit)';
const CURSOR = '❯ ';
const NO_CURSOR = '  ';

/** Lines available for the list, keeping legend and prompt line visible */
function pageSize(): number {
  return Math.max(5, (process.stdout.rows || 24) - 8);
}

function isQuitKey(key: KeypressEvent): boolean {
  return key.name === 'q' || key.name === 'escape';
}

function isPrevKey(key: KeypressEvent): boolean {
  return isUpKey(key) || key.name === 'k';
}

function isNextKey(key: KeypressEvent): boolean {
  return isDownKey(key) || key.name === 'j';
}

interface PackagePromptConfig {
  packages: OutdatedPackage[];
  cursor: number;
  skipped: number;
  colors: Colors;
}

const packagePrompt = createPrompt<PackagePick | null, PackagePromptConfig>(
  (config, done) => {
    const { packages, colors } = config;
    const order = groupPackages(packages).flatMap((group) => group.packages);
    const last = order.length - 1;
    const [cursor, setCursor] = useState(
      Math.max(0, Math.min(config.cursor, last)),
    );
    const prefix = usePrefix({});

    useKeypress((key) => {
      if (isEnterKey(key)) {
        done({ index: cursor, package: order[cursor] });
      } else if (isQuitKey(key)) {
        done(null);
      } else if (isPrevKey(key)) {
        setCursor(Math.max(0, cursor - 1));
      } else if (isNextKey(key)) {
        setCursor(Math.min(last, cursor + 1));
      }
    });

    const lines = layoutTable(packages, {
      colors,
      active: cursor,
      skipped: config.skipped,
    });
    const page = usePagination({
      items: lines,
      active: lines.findIndex((line) => line.row === cursor),
      renderItem: ({ item }) => item.text,
      pageSize: pageSize(),
      loop: false,
    });

    return [
      ...renderLegend(colors),
      `${prefix} ${colors.bold(PACKAGE_MESSAGE)}`,
      '',
      page,
    ].join('\n');
  },
);

/**
 * Let the user pick a package from the grouped list. Resolves with null on
 * q, escape, or ctrl-c. The terminal is back in normal mode when the
 * promise settles.
 */
export async function selectPackage(
  packages: OutdatedPackage[],
  cursor: number,
  skipped = 0,
): Promise<PackagePick | null> {
  try {
    return await packagePrompt(
      { packages, cursor, skipped, colors: pc },
      { clearPromptOnDone: true },
    );
  } catch (err) {
    if (err instanceof ExitPromptError) {
      return null;
    }
    throw err;
  }
}

interface VariantPromptConfig {
  pkg: OutdatedPackage;
  variants: DiffVariant[];
  colors: Colors;
}

const variantPrompt = createPrompt<DiffVariant | null, VariantPromptConfig>(
  (config, done) => {
    const { pkg, variants, colors: c } = config;
    const [cursor, setCursor] = useState(0);
    const prefix = usePrefix({});
    const backIndex = variants.length;

    useKeypress((key) => {
      if (isEnterKey(key)) {
        done(cursor === backIndex ? null : variants[cursor]);
      } else if (isQuitKey(key)) {
        done(null);
      } else if (isPrevKey(key)) {
        setCursor(Math.max(0, cursor - 1));
      } else if (isNextKey(key)) {
        setCursor(Math.min(backIndex, cursor + 1));
      }
    });

    const arrows = variants.map((v) => `${v.from} → ${v.to}`);
    const arrowWidth = Math.max(...arrows.map((a) => a.length));
    const labelWidth = Math.max(...variants.map((v) => v.label.length));
    const lines = variants.map((v, i) => {
      const pointer = i === cursor ? CURSOR : NO_CURSOR;
      const arrow = bumpColor(
        c,
        v.bump,
      )(arrows[i]).padEnd(
        arrowWidth +
          (bumpColor(c, v.bump)(arrows[i]).length - arrows[i].length),
      );
      const label = v.label.padEnd(labelWidth);
      return `${pointer}${arrow}   ${label}   ${c.dim(`(${v.bump})`)}`;
    });
    lines.push(`${cursor === backIndex ? CURSOR : NO_CURSOR}← back`);

    return [
      `${prefix} ${c.bold(`${pkg.name} ${pkg.current}: choose a diff`)}`,
      ...lines,
    ].join('\n');
  },
);

/**
 * Let the user pick one of the diffs of a package. Resolves with null on
 * back, q, escape, or ctrl-c.
 */
export async function selectVariant(
  pkg: OutdatedPackage,
  variants: DiffVariant[],
): Promise<DiffVariant | null> {
  try {
    return await variantPrompt(
      { pkg, variants, colors: pc },
      { clearPromptOnDone: true },
    );
  } catch (err) {
    if (err instanceof ExitPromptError) {
      return null;
    }
    throw err;
  }
}

export interface FileGroupPick {
  /** Position of the group, to restore the cursor later */
  index: number;
  group: FileGroup;
}

/** Top-level files named in the group note before it is cut short */
const MAX_NAMED_FILES = 3;

function groupNote(group: FileGroup): string {
  switch (group.kind) {
    case 'types':
      return '(types only)';
    case 'top': {
      const names = group.files.slice(0, MAX_NAMED_FILES).join(', ');
      return group.files.length > MAX_NAMED_FILES
        ? `(${names}, ...)`
        : `(${names})`;
    }
    default:
      return '';
  }
}

/** Menu rows for the file groups, without the cursor column */
export function renderFileGroups(groups: FileGroup[], c: Colors): string[] {
  const labelWidth = Math.max(...groups.map((g) => g.label.length));
  const countWidth = Math.max(
    ...groups.map((g) => String(g.files.length).length),
  );
  return groups.map((group) => {
    const n = group.files.length;
    const count = `${String(n).padStart(countWidth)} ${n === 1 ? 'file ' : 'files'}`;
    const note = groupNote(group);
    const row = `${group.label.padEnd(labelWidth)}   ${count}`;
    return note ? `${row}   ${c.dim(note)}` : row.trimEnd();
  });
}

interface FileGroupPromptConfig {
  title: string;
  groups: FileGroup[];
  cursor: number;
  colors: Colors;
}

const fileGroupPrompt = createPrompt<
  FileGroupPick | null,
  FileGroupPromptConfig
>((config, done) => {
  const { groups, colors: c } = config;
  const backIndex = groups.length;
  const [cursor, setCursor] = useState(
    Math.max(0, Math.min(config.cursor, backIndex)),
  );
  const prefix = usePrefix({});

  useKeypress((key) => {
    if (isEnterKey(key)) {
      done(
        cursor === backIndex ? null : { index: cursor, group: groups[cursor] },
      );
    } else if (isQuitKey(key)) {
      done(null);
    } else if (isPrevKey(key)) {
      setCursor(Math.max(0, cursor - 1));
    } else if (isNextKey(key)) {
      setCursor(Math.min(backIndex, cursor + 1));
    }
  });

  const rows = renderFileGroups(groups, c).map(
    (row, i) => `${i === cursor ? CURSOR : NO_CURSOR}${row}`,
  );
  rows.push(`${cursor === backIndex ? CURSOR : NO_CURSOR}← back`);
  const page = usePagination({
    items: rows,
    active: cursor,
    renderItem: ({ item }) => item,
    pageSize: pageSize(),
    loop: false,
  });

  return `${prefix} ${c.bold(config.title)}\n${page}`;
});

/**
 * Let the user pick which changed files of a diff to show. Resolves with
 * null on back, q, escape, or ctrl-c.
 */
export async function selectFileGroup(
  name: string,
  { from, to }: VersionPair,
  groups: FileGroup[],
  cursor = 0,
): Promise<FileGroupPick | null> {
  try {
    return await fileGroupPrompt(
      {
        title: `${name} ${from} → ${to}: choose files`,
        groups,
        cursor,
        colors: pc,
      },
      { clearPromptOnDone: true },
    );
  } catch (err) {
    if (err instanceof ExitPromptError) {
      return null;
    }
    throw err;
  }
}
