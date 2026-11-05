# Glossary

Domain and module vocabulary for `cockpit-storage`. These are the names we use
in code, in commit messages, and when talking about architecture. If you
introduce a new concept, add it here.

## Domain

**Filesystem**
: A mounted filesystem that we show as usable storage. Comes from `df -Pk`
  annotated with `/proc/mounts`, with virtual filesystems and bind-mount
  duplicates removed. Always shown by its **Mount**.

**Mount**
: The path where a Filesystem is attached, e.g. `/` or `/mnt/backups`. This is
  what the user sees and picks.

**Level**
: The immediate children of one directory, plus its total, from a single
  **Scan**. `DirUsage` is the Level.

**Scan**
: One pass of `du -a -B1 -x -d 1` plus `find -mindepth 1 -maxdepth 1 -type d`
  across one directory, joined into a **Level**. A Level is `complete: false`
  when either command exited non-zero, which is how we report unreadable
  directories.

**Bytes**
: The one size unit in this module. Branded so the type system keeps it apart
  from a size in any other unit: `df -Pk` reports 1024-byte blocks, `du`
  reports bytes. Everything downstream of the parsers is Bytes, so a size that
  arrives in blocks is converted exactly once, at the parse boundary, with
  `kibToBytes`. `bytes()` passes through a count that is already bytes. Before
  this, the conversion was spelled out at three call sites in the picker and
  nothing stopped a block count reaching `formatSize`.

**Entry**
: One child of a Level: a name, a path, a size, and whether it is a directory.
  `UsageEntry`.

**Trail**
: The chain of directories the user has walked into, from the **Mount** they
  opened at the root down to the current **Level**. One trail is one drill-down
  session; it is replaced when the user opens a filesystem or leaves for the
  picker. Not the same thing as the **Filesystem** list, which is what the
  trail starts from. A step is a directory *name*, never a path — allowing a
  separator would make `back` drop two levels at once.

**Location**
: Where the user is right now: the **Mount** the trail started at, plus the
  absolute **path** being displayed. `null` while they are still choosing a
  filesystem.

**Session**
: The lifetime of one `UsageCache`. A Rescan replaces it, which is what drops
  every cached **Scan**; it lives in React state so replacing it is the event
  both loading effects depend on.

## Chart vocabulary

**ChartDatum**
: What a chart draws: a `name`, a `size`, and `navigable` — whether the user
  can descend into it by clicking. Defined once in `src/chart.ts`; the treemap
  and the ring chart both take it, so there is one datum shape rather than one
  per chart with a different field name.

**Colour slot**
: A datum's colour is its position in the chart data as given. Both charts
  resolve it through `colorSlots`, so a directory is the same colour whichever
  view you look at it with. The slot count lives in `PALETTE_SLOTS`; the colours
  themselves are CSS custom properties so the dark theme can swap them.

**Synthetic slice**
: The aggregate of everything past the slice cap, drawn as one block named
  "Other". It keeps the size it is standing in for, and is never navigable
  because there is no single directory to descend into.

## Seams

**CommandRunner**
: The seam this module gathers through. Everything that needs the outside world
  asks a runner to `run(args, options)` or `read(path)`; nothing names
  `cockpit.spawn` or `cockpit.file` directly. Two adapters exist:
  `cockpitRunner` in production, `inMemoryRunner` in tests. Command failure
  comes back as `ok: false`, never as a rejection — that is a result, and a
  bridge failure is what rejects.

**Trail (the seam)**
: `Trail` is also the seam for navigation. The page keeps one trail in state
  and calls commands on it; every command returns a new trail, so the page
  re-renders on navigation without any React API appearing in the module. The
  transition rules are therefore testable in Node.

**paths.ts**
: `joinPath`, `baseName`, `pathDepth`. The one home for "how do we build a
  child path" and "how do we take one apart"; the trail and the gatherer both
  answer through it, so the root special case exists once.

## Not used

_Reserved_: keep this list short. "service", "component" and "boundary" are not
used in this codebase; say module, module and seam.
