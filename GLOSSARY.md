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

**Entry**
: One child of a Level: a name, a path, a size, and whether it is a directory.
  `UsageEntry`.

**Trail**
: The stack of directories the user has descended through, from the Mount they
  started at down to the current Level. Distinct from the Filesystem list: a
  Trail is one drill-down session.

## Seams

**CommandRunner**
: The seam this module gathers through. Everything that needs the outside world
  asks a runner to `run(args, options)` or `read(path)`; nothing names
  `cockpit.spawn` or `cockpit.file` directly. Two adapters exist:
  `cockpitRunner` in production, `inMemoryRunner` in tests. Command failure
  comes back as `ok: false`, never as a rejection — that is a result, and a
  bridge failure is what rejects.

## Not used

_Reserved_: keep this list short. "service", "component" and "boundary" are not
used in this codebase; say module, module and seam.
