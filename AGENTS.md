# AGENTS.md

Cockpit web plugin (React 19 + PatternFly 6) that displays disk usage, derived
from the [Cockpit starter-kit](https://github.com/cockpit-project/starter-kit).
The page lives at `/storage` (`src/manifest.json` `tools.index`). The cockpit-bridge
runs `df`/`du`/`find` as the logged-in user; all data gathering is in `src/gatherer.ts`.

## Build

`make` is the real build entrypoint — not `npm run build`. It:

1. checks out `pkg/lib`, `test/common`, `tools/node-modules` from a **pinned
   Cockpit commit** (`COCKPIT_REPO_COMMIT` in the `Makefile`) via `git archive`,
2. runs `build.js` (esbuild) into `dist/`.

Commands:

- `make` — build; `NODE_ENV=production make` for minified/compressed release
- `make devel-install` — symlink `dist/` to `~/.local/share/cockpit/storage`
- `make watch` — rebuild on change; `make devel-uninstall` — remove the symlink
- `make codecheck` — eslint + stylelint + Python checks (`test/common/static-code`)
- `make check-unit` — QUnit unit tests in Node, no VM
- `make po/storage.pot` — regenerate the translation template from `src/`

## Gotchas

- **Never edit vendored files**: `pkg/lib/`, `test/common/`, `tools/`, `bots/`
  are gitignored and overwritten from the pinned Cockpit commit on every build.
  Changes there are silently lost. To update them, bump `COCKPIT_REPO_COMMIT`,
  or run `make bots; bots/cockpit-lib-update` (used by CI).
- **Avoid bare `npm install`**: the Makefile's `package-lock.json` target
  *deletes* the lockfile then reinstalls (`--ignore-scripts`, up to 3 retries,
  can hang for minutes). Use `make` (which triggers it) or edit
  `package.json`/`package-lock.json` by hand.
- `dist/`, `metafile.json`, `runtime-npm-modules.txt`, `test/unit-tests.js`,
  `po/*.pot` are generated and gitignored.
- `docs/` is excluded from git via `.git/info/exclude` — untracked working notes.
- File imports use the output extension, not the real one: `src/index.tsx`
  imports `./app.jsx` and `app.tsx` imports `./gatherer.js`. `build.js` declares
  entry `./src/index.js`, which esbuild resolves to `index.tsx`. Keep this.

## Source layout

- `src/index.tsx` — entry; `src/app.tsx` — page state/history/navigation
- `src/gatherer.ts` — pure parsers (`parseMounts`, `parseDf`,
  `filterFileSystems`, `parseDu`) + `cockpit.spawn`/`cockpit.file` runners +
  `UsageCache` (per-session `du` cache)
- `src/format.ts` — `formatSize`; `src/{Treemap,RingChart,Breadcrumbs,FsPicker}.tsx` — UI
- Pure parsing functions live in `.ts` files so they can be unit-tested in Node;
  keep parsers free of `cockpit.*` calls. Formatting is 4-space indent
  (eslint overrides the standard config's default).

## Tests

- **Unit** (`make check-unit`): `test/build-tests.js` esbuild-bundles
  `test/test-gatherer.js` with the src helpers, aliasing `cockpit` →
  `test/mock-cockpit.js`, into gitignored `test/unit-tests.js`, then runs QUnit.
  Add tests to `test/test-gatherer.js`; never hand-edit `unit-tests.js`.
- **Integration** (`make check`): builds an RPM, boots a test VM
  (`TEST_OS=centos-9-stream` default; e.g. `TEST_OS=fedora-40`), runs
  `test/check-application`. To prep without running: `TEST_OS=... make prepare-check`.
  Run a single case: `TEST_OS=... test/check-application -tvs TestApplication.testBasic`.
  Tests are nondestructive and assert on `data-testid` / `.pf-v6-*` selectors.
- The browser-test API is not stable across Cockpit versions; if `test/common`
  breaks, check it out from a Cockpit release tag (see the README).

## CI

`test/run` is the Cockpit CI entry: `make codecheck`, `make check-unit`,
`make check`, `make po/storage.pot`. Packit (`packit.yaml`) runs PR tests on
Fedora/CentOS Stream; the `.cockpit-ci/container` file pins the tasks container.
`nix-build.yml` makes the flake build on every push/PR.

## Nix

The flake (`flake.nix`, `nix/package.nix`) builds with no `npmDepsHash`:
`importNpmLock` reads `package-lock.json` directly, so dependency bumps
(dependabot included) need no Nix changes. Supports `x86_64-linux` and
`aarch64-linux`. Local builds: `nix build .#cockpit-storage` (outputs
`result/share/cockpit/storage/`), or `nix run .#` to open it in Cockpit.