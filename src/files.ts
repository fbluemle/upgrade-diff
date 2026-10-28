import { Transform, type TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export type FileGroupKind = 'all' | 'dir' | 'types' | 'top';

export interface FileGroup {
  kind: FileGroupKind;
  /** Display name: 'all', 'lib/', '*.d.ts', or 'top-level files' */
  label: string;
  /** Changed files in the group, as npm diff names them */
  files: string[];
}

const TYPES_PATTERN = /\.d\.[cm]?ts$/;

/** File names from `npm diff --diff-name-only` output */
export function parseNameOnly(output: string): string[] {
  return output.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Ways to narrow a diff down: all files, each top-level directory, type
 * declarations only, and the files at the package root. Groups without
 * files are left out.
 */
export function groupFiles(files: string[]): FileGroup[] {
  const dirs = new Map<string, string[]>();
  const top: string[] = [];
  for (const file of files) {
    const slash = file.indexOf('/');
    if (slash === -1) {
      top.push(file);
    } else {
      const dir = file.slice(0, slash + 1);
      dirs.set(dir, [...(dirs.get(dir) ?? []), file]);
    }
  }

  const groups: FileGroup[] = [{ kind: 'all', label: 'all', files }];
  for (const dir of [...dirs.keys()].sort()) {
    groups.push({ kind: 'dir', label: dir, files: dirs.get(dir) ?? [] });
  }
  const types = files.filter((file) => TYPES_PATTERN.test(file));
  if (types.length > 0) {
    groups.push({ kind: 'types', label: '*.d.ts', files: types });
  }
  if (top.length > 0) {
    groups.push({ kind: 'top', label: 'top-level files', files: top });
  }
  return groups;
}

/** Whether any group narrows the diff, so that offering a choice helps */
export function hasChoice(groups: FileGroup[]): boolean {
  const total = groups[0]?.files.length ?? 0;
  return groups.some((group) => group.files.length < total);
}

// Built from a string: biome rejects control characters in regex literals
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const HEADER = 'diff --git a/';

/**
 * File name from a `diff --git a/<file> b/<file>` header line, undefined
 * for any other line. Both sides name the same file, so the name is
 * recovered from the length even when it contains spaces.
 */
export function headerFile(line: string): string | undefined {
  const plain = line.replace(ANSI, '').replace(/\r?\n$/, '');
  if (!plain.startsWith(HEADER)) {
    return undefined;
  }
  // a/<file> b/<file>
  const names = plain.slice('diff --git '.length);
  const length = (names.length - 5) / 2;
  if (!Number.isInteger(length) || length <= 0) {
    return undefined;
  }
  const file = names.slice(2, 2 + length);
  return names === `a/${file} b/${file}` ? file : undefined;
}

/**
 * Transform stream that keeps only the sections of a diff that belong to
 * the given files. Lines before the first file header are kept.
 */
export function filterDiff(files: Iterable<string>): Transform {
  const keep = new Set(files);
  let keeping = true;
  let rest = '';
  const decoder = new StringDecoder('utf8');
  const push = (stream: Transform, line: string) => {
    const file = headerFile(line);
    if (file !== undefined) {
      keeping = keep.has(file);
    }
    if (keeping) {
      stream.push(line);
    }
  };
  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      const lines = (rest + decoder.write(chunk)).split(/(?<=\n)/);
      rest = lines.at(-1)?.endsWith('\n') ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        push(this, line);
      }
      callback();
    },
    flush(callback: TransformCallback) {
      rest += decoder.end();
      if (rest) {
        push(this, rest);
      }
      callback();
    },
  });
}
