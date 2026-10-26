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
