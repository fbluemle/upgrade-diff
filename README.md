# upgrade-diff

Interactive diff viewer for outdated npm dependencies.

[![ci][1]][2]

## What it does

Lists the outdated dependencies of a project the way `yarn upgrade-interactive`
does, but instead of upgrading anything it shows the code diff between two
published versions of the selected package, straight from the registry. It
never writes to `package.json`, the lockfile, or `node_modules`.

```
$ npx upgrade-diff
info Color legend :
 "<red>"    : Major Update backward-incompatible updates
 "<yellow>" : Minor Update backward-compatible features
 "<green>"  : Patch Update backward-compatible bug fixes
? Choose a package to diff (↑/↓ or j/k move, enter select, q quit)

 dependencies
   name         range     from     wanted   latest   url
 ❯ commander    ^11.0.0   11.0.0   11.1.0   14.0.3   https://github.com/tj/commander.js#readme

 devDependencies
   name         range     from     wanted   latest   url
   typescript   ^5.3.0    5.3.3    5.9.3    5.9.3    https://www.typescriptlang.org/
```

Selecting a package offers up to three diffs, depending on which versions
differ:

```
? commander 11.0.0: choose a diff
❯ 11.0.0 → 11.1.0   wanted            (minor)
  11.0.0 → 14.0.3   latest            (major)
  11.1.0 → 14.0.3   wanted → latest   (major)
  ← back
```

The diff opens in `less`. Quit the pager and the list is back with the
cursor where it was; press `q` to leave.

## Usage

```bash
npx upgrade-diff [options] [dir]
```

Works in any project with a `package.json` and an installed `node_modules`,
whichever package manager installed it. The outdated list comes from
`npm outdated` and the diffs from `npm diff`, so the npm configuration of
the project (registry, auth, scoped registries) applies as is.

The exit status is 0 whenever the tool ran, including when packages are
outdated; it is an information tool, not a check. When stdout or stdin is
not a terminal, the list is printed as with `--list`.

### Options

| Option              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `[dir]`             | Project directory (default: current directory) |
| `-l, --list`        | Print the list and exit without prompting      |
| `-u, --unified <n>` | Number of context lines in the diff            |
| `--name-only`       | Show only the names of changed files           |

### Keys

| Key                  | Action                              |
| -------------------- | ----------------------------------- |
| `↑`, `k`             | Previous package                    |
| `↓`, `j`             | Next package                        |
| `enter`              | Select                              |
| `q`, `esc`, `ctrl-c` | Back, or quit from the package list |

## Requirements

- Node.js 20 or newer and `npm` on `PATH`.
- `less` for paging. Without it, the diff is written to stdout.
- [diff-so-fancy](https://github.com/so-fancy/diff-so-fancy) is used
  automatically when found on `PATH`.

## Limitations

- Workspaces are not handled; run it in the package directory.
- Dependencies that are not installed, not from a registry (git, file,
  link), or aliased (`"foo": "npm:bar@1"`) are skipped and counted in a
  note below the list.

## License

MIT

[1]: https://github.com/fbluemle/upgrade-diff/actions/workflows/ci.yml/badge.svg
[2]: https://github.com/fbluemle/upgrade-diff/actions/workflows/ci.yml
