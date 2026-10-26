#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { InvalidArgumentError, program } from 'commander';
import pc from 'picocolors';
import { showDiff } from './diff';
import { readOutdated } from './outdated';
import { selectPackage, selectVariant } from './prompt';
import { UP_TO_DATE, renderList } from './table';
import { buildVariants } from './variants';

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
    await showDiff(dir, pick.package.name, variant, {
      unified: options.unified,
      nameOnly: options.nameOnly,
    });
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
