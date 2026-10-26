import { type ChildProcess, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import pc from 'picocolors';
import type { DiffVariant } from './variants';

export interface DiffOptions {
  /** Context lines, passed as --diff-unified */
  unified?: number;
  /** Only list changed files, passed as --diff-name-only */
  nameOnly?: boolean;
}

export type VersionPair = Pick<DiffVariant, 'from' | 'to'>;

/** Arguments for `npm diff` between two published versions of a package */
export function buildNpmDiffArgs(
  name: string,
  { from, to }: VersionPair,
  options: DiffOptions = {},
): string[] {
  const args = ['diff', `--diff=${name}@${from}`, `--diff=${name}@${to}`];
  if (options.unified !== undefined) {
    args.push(`--diff-unified=${options.unified}`);
  }
  if (options.nameOnly) {
    args.push('--diff-name-only');
  }
  return args;
}

/** Absolute path of the first executable called name on PATH, if any */
export async function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate, constants.X_OK);
      if ((await fs.stat(candidate)).isFile()) {
        return candidate;
      }
    } catch {
      // not here, try the next directory
    }
  }
  return undefined;
}

/**
 * Resolves with the exit code once the process has ended. The 'exit' event
 * is used rather than 'close' because a pipe left half-open by a killed
 * filter can keep 'close' from ever firing.
 */
function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    child.on('error', () => resolve(null));
    child.on('exit', (code) => resolve(code));
  });
}

function ended(stream: Readable): Promise<void> {
  return new Promise((resolve) => {
    stream.on('end', resolve);
    stream.on('close', resolve);
  });
}

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/** Block until any key is pressed, so a message stays readable */
function waitForKey(): Promise<void> {
  console.log(pc.dim('Press any key to continue'));
  return new Promise((resolve) => {
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.once('data', () => {
      stdin.setRawMode(false);
      stdin.pause();
      resolve();
    });
  });
}

/**
 * Show the diff between two published versions of a package in the pager:
 * npm diff, through diff-so-fancy when available, into less. Returns once
 * the pager is closed. Failures and empty diffs are reported and wait for
 * a key press before returning.
 */
export async function showDiff(
  dir: string,
  name: string,
  variant: VersionPair,
  options: DiffOptions = {},
): Promise<void> {
  const { from, to } = variant;
  console.log(pc.dim(`Fetching diff for ${name} ${from} → ${to} ...`));

  const [fancy, less] = await Promise.all([
    findOnPath('diff-so-fancy'),
    findOnPath('less'),
  ]);

  // Exit promises are created at spawn time; an 'exit' event that already
  // fired would never be seen by a listener added later.
  const children: ChildProcess[] = [];
  const exits: Promise<number | null>[] = [];
  const track = (child: ChildProcess): Promise<number | null> => {
    children.push(child);
    const exit = exited(child);
    exits.push(exit);
    return exit;
  };
  let killed = false;
  const killAll = () => {
    killed = true;
    for (const child of children) {
      if (isRunning(child)) {
        child.kill();
      }
    }
  };

  const npm = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    buildNpmDiffArgs(name, variant, options),
    { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  let spawnError: Error | undefined;
  npm.on('error', (err) => {
    spawnError = err;
  });
  const npmExit = track(npm);

  // npm prints a lone newline when the versions do not differ
  let hasOutput = false;
  let outputDone = false;
  npm.stdout.on('data', (chunk: Buffer) => {
    hasOutput ||= /\S/.test(chunk.toString('latin1'));
  });
  npm.stdout.on('end', () => {
    outputDone = true;
  });

  let source: Readable = npm.stdout;
  if (fancy) {
    const child = spawn(fancy, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    track(child);
    child.stdin.on('error', () => undefined);
    source.pipe(child.stdin);
    source = child.stdout;
  }

  process.on('SIGINT', killAll);
  try {
    if (less) {
      const pager = spawn(less, ['--tabs=4', '-RFX'], {
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      pager.stdin.on('error', () => undefined);
      source.pipe(pager.stdin);
      await track(pager);
    } else {
      source.pipe(process.stdout, { end: false });
      await ended(source);
    }

    // The pager may have been closed before npm finished writing
    if (!outputDone) {
      killAll();
    }
    const code = await npmExit;
    await Promise.all(exits);
    for (const child of children) {
      child.stdout?.destroy();
      child.stdin?.destroy();
    }

    if (killed) {
      return;
    }
    if (spawnError) {
      console.log(`npm diff failed: ${spawnError.message}`);
      await waitForKey();
    } else if (code !== 0) {
      console.log(`npm diff failed (exit ${code})`);
      await waitForKey();
    } else if (!hasOutput) {
      console.log(`No differences between ${name}@${from} and ${name}@${to}`);
      await waitForKey();
    }
  } finally {
    process.off('SIGINT', killAll);
  }
}
