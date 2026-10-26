import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import semver from 'semver';

export type DepType =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

/** Dependency sections in display order */
export const DEP_TYPES: readonly DepType[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

export interface OutdatedPackage {
  name: string;
  type: DepType;
  /** Range declared in package.json, '' if not found */
  range: string;
  current: string;
  wanted: string;
  latest: string;
  homepage?: string;
}

export interface OutdatedResult {
  packages: OutdatedPackage[];
  /** Entries left out: not installed, not semver, or aliased */
  skipped: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Runs npm with the given arguments in cwd, never rejects on exit code */
export type Runner = (args: string[], cwd: string) => Promise<RunResult>;

export const runNpm: Runner = (args, cwd) =>
  new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error('npm is required but was not found')
          : err,
      );
    });
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });

export type Ranges = Partial<Record<DepType, Record<string, string>>>;

/** Dependency ranges declared in the package.json of dir, keyed by section */
export function readRanges(dir: string): Ranges {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
  );
  const ranges: Ranges = {};
  for (const type of DEP_TYPES) {
    const section = manifest[type];
    if (section && typeof section === 'object') {
      ranges[type] = section;
    }
  }
  return ranges;
}

function isDepType(value: unknown): value is DepType {
  return (DEP_TYPES as readonly unknown[]).includes(value);
}

interface RawEntry {
  current?: string;
  wanted?: string;
  latest?: string;
  type?: string;
  homepage?: string;
}

function toPackage(
  name: string,
  raw: RawEntry,
  ranges: Ranges,
): OutdatedPackage | undefined {
  const { current, wanted, latest } = raw;
  if (
    !semver.valid(current) ||
    !semver.valid(wanted) ||
    !semver.valid(latest)
  ) {
    return undefined;
  }
  const type = isDepType(raw.type) ? raw.type : 'dependencies';
  const range = ranges[type]?.[name] ?? '';
  if (range.startsWith('npm:')) {
    return undefined;
  }
  const pkg: OutdatedPackage = {
    name,
    type,
    range,
    current: current as string,
    wanted: wanted as string,
    latest: latest as string,
  };
  if (typeof raw.homepage === 'string' && raw.homepage) {
    pkg.homepage = raw.homepage;
  }
  return pkg;
}

/**
 * Parse the stdout of `npm outdated --json --long`. Throws when the output
 * is not JSON or npm reported an error object.
 */
export function parseOutdated(stdout: string, ranges: Ranges): OutdatedResult {
  let data: unknown;
  try {
    data = JSON.parse(stdout.trim() || '{}');
  } catch {
    throw new Error('npm outdated did not produce JSON output');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('npm outdated did not produce JSON output');
  }
  const entries = data as Record<string, unknown>;
  if ('error' in entries) {
    const error = entries.error as { summary?: string; detail?: string };
    throw new Error(
      [error?.summary, error?.detail].filter(Boolean).join('\n') ||
        'npm outdated failed',
    );
  }

  const packages: OutdatedPackage[] = [];
  let skipped = 0;
  for (const [name, value] of Object.entries(entries)) {
    const raw = (Array.isArray(value) ? value[0] : value) as
      | RawEntry
      | undefined;
    const pkg = raw ? toPackage(name, raw, ranges) : undefined;
    if (pkg) {
      packages.push(pkg);
    } else {
      skipped++;
    }
  }
  return { packages, skipped };
}

/**
 * Run `npm outdated --json --long` in dir and parse the result. The exit
 * code is ignored because npm exits 1 whenever anything is outdated; failure
 * is detected from the output instead.
 */
export async function readOutdated(
  dir: string,
  runner: Runner = runNpm,
): Promise<OutdatedResult> {
  const ranges = readRanges(dir);
  const result = await runner(['outdated', '--json', '--long'], dir);
  try {
    return parseOutdated(result.stdout, ranges);
  } catch (err) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || (err as Error).message);
  }
}
