# Cockpit Storage

Disk and directory usage analyzer (baobab-style) for
[Cockpit](https://cockpit-project.org/). Browse real per-directory disk usage
across all mounted filesystems and drill down to find what is using your disk.

## Features

- **Filesystem picker** — treemap of every mounted filesystem, sized by used
  space; pick one to analyze.
- **Drill-down navigation** — click into directories with breadcrumb
  navigation back up the tree.
- **Two visualizations** — squarified treemap and ring/donut chart, toggleable
  per level.
- **Per-directory details** — each child's disk usage, sorted by size, with a
  usage table and item counts.
- **On-demand scanning with caching** — `du`-based (null-delimited for safe
  parsing), cached per session so revisiting a subtree is instant.
- **i18n** — user-facing strings are translatable (see `po/`).

## Installation

Build and install into the system Cockpit directory

```sh
make
make install            # installs to /usr/local/share/cockpit
```

or build RPMs with the `srpm` / `rpm` targets (`make rpm` also needs the
RPM build tools). Use `NODE_ENV=production make` to minify and compress the
bundle as in release builds.

### Development

To run the plugin straight out of the git tree, symlink the built output where
Cockpit looks for packages:

```sh
make
make devel-install      # links dist/ into ~/.local/share/cockpit/storage
```

Then open Cockpit and navigate to the **Storage** page. After changing code
and re-running `make`, reload the page.

For automatic rebuilds on every change:

```sh
make watch
```

`make devel-uninstall` removes the development symlink.

## Tests

### Unit tests

Pure helpers (parsing and formatting) are covered with QUnit, run under Node
without a browser or VM:

```sh
make check-unit
```

### Integration tests

```sh
make check              # builds an RPM, boots a test VM, runs the browser tests
```

This runs `test/check-application` against the `centos-9-stream` VM by default
(set `TEST_OS` for a different image, e.g. `TEST_OS=fedora-40`). To prepare the
VM without running the tests, or to run the test manually for debugging:

```sh
TEST_OS=centos-9-stream make prepare-check
TEST_OS=centos-9-stream test/check-application -tvs
```

Note: the browser test API is not guaranteed to be stable across Cockpit
versions; if tests break, check out `test/common` from a Cockpit tag instead
of `main` (see the `test/common` target in the `Makefile`).

### Static checks

```sh
make codecheck          # eslint, stylelint and type checks
```

## Continuous integration

Pull requests and Fedora/CentOS Stream package gating are validated with
[Packit](https://packit.dev/), wired through the
[FMF](https://github.com/teemtee/fmf)/[tmt](https://docs.fedoraproject.org/en-US/ci/tmt/)
test plans in `plans/` — see `packit.yaml` and `test/run`. NPM dependencies are
kept up to date by [dependabot](https://github.com/dependabot) (see
`.github/dependabot.yml`), and the shared Cockpit library and test containers
are refreshed by the scheduled workflows under `.github/workflows/`.

Releases are produced with Packit's COPR builds, driven from `packit.yaml`.

## Further reading

- [Cockpit Deployment and Developer documentation](https://cockpit-project.org/guide/latest/)
- [Make your project easily discoverable](https://cockpit-project.org/blog/making-a-cockpit-application.html)
