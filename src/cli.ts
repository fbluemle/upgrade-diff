#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvalidArgumentError, program } from 'commander';
import pc from 'picocolors';
import { type DiffOptions, listChangedFiles, showDiff } from './diff';
import { groupFiles, hasChoice } from './files';
import { readOutdated } from './outdated';
import { selectFileGroup, selectPackage, selectVariant } from './prompt';
import { UP_TO_DATE, renderList } from './table';
import { type DiffVariant, buildVariants } from './variants';

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
);

function parseContext(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('must be a non-negative integer');
  }
  return Number(value);
}

interface CliOptions {
  list?: boolean;
  unified?: number;
  nameOnly?: boolean;
}

program
  .name('upgrade-diff')
  .description(packageJson.description)
  .version(packageJson.version, '-V, --version')
  .argument('[dir]', 'project directory', process.cwd())
  .option('-l, --list', 'print the list of outdated packages and exit')
  .option(
    '-u, --unified <n>',
    'number of context lines in the diff',
    parseContext,
  )
  .option('--name-only', 'show only the names of changed files')
  .parse();

/**
 * Offer the changed files of a diff grouped by directory, and show the
 * chosen group until the user goes back. Diffs without a useful choice
 * are shown right away.
 */
async function browseDiff(
  dir: string,
  name: string,
  variant: DiffVariant,
  options: DiffOptions,
): Promise<void> {
  const { from, to } = variant;
  console.log(pc.dim(`Fetching file list for ${name} ${from} → ${to} ...`));
  let files: string[];
  try {
    files = await listChangedFiles(dir, name, variant);
  } catch {
    // the full diff reports the failure
    await showDiff(dir, name, variant, options);
    return;
  }

  const groups = groupFiles(files);
  if (!hasChoice(groups)) {
    await showDiff(dir, name, variant, options);
    return;
  }
  let cursor = 0;
  for (;;) {
    const pick = await selectFileGroup(name, variant, groups, cursor);
    if (!pick) {
      return;
    }
    cursor = pick.index;
    await showDiff(dir, name, variant, {
      ...options,
      files: pick.group.kind === 'all' ? undefined : pick.group.files,
    });
  }
}

async function main(): Promise<void> {
  const options = program.opts<CliOptions>();
  const dir = path.resolve(program.args[0] ?? process.cwd());

  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`No package.json found in ${dir}`);
  }
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    throw new Error(`No node_modules in ${dir}, install first`);
  }

  const { packages: outdated, skipped } = await readOutdated(dir);
  const packages = outdated.filter((pkg) => buildVariants(pkg).length > 0);

  const listOnly =
    options.list || !process.stdout.isTTY || !process.stdin.isTTY;
  if (listOnly) {
    console.log(renderList(packages, skipped, pc).join('\n'));
    return;
  }
  if (packages.length === 0) {
    console.log(UP_TO_DATE);
    return;
  }

  let cursor = 0;
  for (;;) {
    const pick = await selectPackage(packages, cursor, skipped);
    if (!pick) {
      return;
    }
    cursor = pick.index;
    const variants = buildVariants(pick.package);
    const variant =
      variants.length === 1
        ? variants[0]
        : await selectVariant(pick.package, variants);
    if (!variant) {
      continue;
    }
    if (options.nameOnly) {
      await showDiff(dir, pick.package.name, variant, { nameOnly: true });
    } else {
      await browseDiff(dir, pick.package.name, variant, {
        unified: options.unified,
      });
    }
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
