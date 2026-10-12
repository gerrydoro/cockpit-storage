/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import cockpit from 'cockpit';
import type { SpawnOptions } from 'cockpit';

/*
 * Data gathering for the disk-usage analyzer.
 *
 * The filesystem overview is derived from `df -Pk` plus `/proc/mounts`
 * (for device/fstype and to filter out virtual filesystems, following the
 * same heuristic baobab uses). Directory usage is gathered on demand with
 * `du` so that drilling into a directory is instant for already-visited
 * subtrees, which are cached per session.
 */

/* Fictional/virtual filesystems we never want to present as usable storage. */
const VIRTUAL_FSTYPES = new Set([
    'proc',
    'sysfs',
    'devtmpfs',
    'devpts',
    'cgroup',
    'cgroup2',
    'tmpfs',
    'ramfs',
    'squashfs',
    'overlay',
    'overlayfs',
    'aufs',
    'fuse.portal',
    'nfsd',
    'rpc_pipefs',
    'securityfs',
    'debugfs',
    'tracefs',
    'pstore',
    'hugetlbfs',
    'mqueue',
    'fusectl',
    'configfs',
    'none',
    'efivarfs',
]);

export interface FileSystem {
    device: string;
    mount: string;
    fstype: string;
    /* sizes reported by df in 1024-byte blocks */
    blocks: number;
    used: number;
    avail: number;
    capacity: number; // percentage 0-100
}

export interface UsageEntry {
    name: string;
    path: string;
    size: number; // disk usage in bytes
    isDir: boolean;
}

export interface DirUsage {
    path: string;
    size: number; // total disk usage of this directory in bytes
    entries: UsageEntry[];
    complete: boolean; // false if `du` errored (e.g. unreadable subdirectories)
}

/* ---- pure parsing helpers (unit-testable) ---- */

/* /proc/mounts octal-escapes space, tab, newline and backslash (`\040`, ...). */
function unescapeMount(field: string): string {
    return field.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

export function parseMounts(text: string): Map<string, { device: string; fstype: string }> {
    const result = new Map<string, { device: string; fstype: string }>();
    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;
        /* device mount fstype options dump pass -- spaces are escaped */
        const m = line.match(/^(\S+)\s+(.+?)\s+(\S+)\s+\S+\s+\d+\s+\d+$/);
        if (m) {
            const mount = unescapeMount(m[2]);
            result.set(mount, { device: unescapeMount(m[1]), fstype: m[3] });
        }
    }
    return result;
}

export function parseDf(text: string): FileSystem[] {
    const result: FileSystem[] = [];
    const lines = text.split('\n');
    /* skip the header line */
    const re = /^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/;
    for (const line of lines) {
        const m = line.match(re);
        if (m)
            result.push({
                device: m[1],
                blocks: Number(m[2]),
                used: Number(m[3]),
                avail: Number(m[4]),
                capacity: Number(m[5]),
                mount: m[6].trim(),
                fstype: '',
            });
    }
    return result;
}

/* Combine `df` mounts with `/proc/mounts`, dropping virtual/bind-duplicate filesystems. */
export function filterFileSystems(df: FileSystem[], mounts: Map<string, { device: string; fstype: string }>): FileSystem[] {
    /* annotate each df entry with its fstype and drop virtual filesystems */
    const candidates: FileSystem[] = [];
    for (const fs of df) {
        const info = mounts.get(fs.mount);
        if (!info)
            continue; // not in /proc/mounts, skip
        if (VIRTUAL_FSTYPES.has(info.fstype))
            continue;
        candidates.push({ ...fs, device: info.device, fstype: info.fstype });
    }

    /* Bind mounts reuse the same device at several paths (e.g. / and /nix/store
     * both on /dev/nvme0n1p2). For each distinct device keep only the primary
     * (shallowest) mount, which is the filesystem's canonical mount point. */
    const byDevice = new Map<string, FileSystem[]>();
    for (const fs of candidates) {
        let list = byDevice.get(fs.device);
        if (!list) {
            list = [];
            byDevice.set(fs.device, list);
        }
        list.push(fs);
    }

    /* Path depth, not string length: `/srv/data` (9 chars) is shallower than
     * `/media/pics` (11 chars) even though the shorter string wins on length. */
    const depth = (mount: string) => mount.split('/').filter(Boolean).length;
    const result: FileSystem[] = [];
    for (const group of byDevice.values()) {
        group.sort((a, b) => depth(a.mount) - depth(b.mount) || a.mount.length - b.mount.length);
        result.push(group[0]);
    }
    result.sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));

    return result;
}

export interface RawDuEntry { path: string; size: number; }

/*
 * Parse `du -B1 -d 1` output (newline-delimited records of `size\tpath`).
 *
 * Note: we deliberately avoid `du -0`. Cockpit's spawn streams the child's
 * stdout as a UTF-8 *text* channel to the browser, and embedded NUL bytes
 * (the `-0` delimiter) are rejected there ("invalid non-UTF8 @data ..."),
 * which makes the whole command fail silently. Newline delimiters are
 * fine for cockpit, and embedded newlines in filenames are rare enough
 * that this trade-off is acceptable for a disk-usage analyzer.
 */
export function parseDu(text: string): RawDuEntry[] {
    const result: RawDuEntry[] = [];
    for (const record of text.split('\n')) {
        if (!record)
            continue;
        const tab = record.indexOf('\t');
        if (tab < 0)
            continue;
        const size = Number(record.slice(0, tab));
        if (Number.isNaN(size))
            continue;
        result.push({ path: record.slice(tab + 1), size });
    }
    return result;
}

/* ---- command runners ---- */

type TextSpawnOptions = Omit<SpawnOptions, 'binary'>;

function collectSpawn(args: string[], options?: TextSpawnOptions): Promise<{ output: string; ok: boolean }> {
    return new Promise(resolve => {
        let output = '';
        const proc = options ? cockpit.spawn(args, options) : cockpit.spawn(args);
        proc.stream(chunk => { output += chunk });
        proc.done(() => resolve({ output, ok: true }));
        proc.fail(() => resolve({ output, ok: false }));
    });
}

/* Enumerate usable mounted filesystems with usage. */
export async function listFileSystems(): Promise<FileSystem[]> {
    const [mountsText, df] = await Promise.all([
        cockpit.file('/proc/mounts').read(),
        collectSpawn(['df', '-Pk']),
    ]);

    const mounts = parseMounts(mountsText);
    const dfFs = parseDf(df.output);
    return filterFileSystems(dfFs, mounts);
}

/*
 * Build the direct children of `path` from `du -a -B1 -d 1` output plus the
 * set of subdirectory names reported by `find`. Split out from
 * `scanDirectory` so the path/total/isDir logic can be unit-tested without a
 * cockpit bridge.
 *
 * `complete` is false when either command errored (e.g. unreadable
 * subdirectories), which the UI surfaces as a warning.
 */
export function buildDirUsage(path: string, duText: string, subdirText: string, complete: boolean): DirUsage {
    const entries = parseDu(duText);
    const subdirs = new Set(subdirText.split('\n').filter(Boolean));

    const children: UsageEntry[] = [];
    let total = 0;
    for (const entry of entries) {
        /* `du` emits the directory total first, as a bare `.` record. */
        if (entry.path === '.') {
            total = entry.size;
            continue;
        }
        const name = entry.path.replace(/^\.\//, '');
        if (name === '' || name.startsWith('../'))
            continue;
        children.push({
            name,
            path: path === '/' ? '/' + name : path + '/' + name,
            size: entry.size,
            isDir: subdirs.has(name),
        });
    }

    children.sort((a, b) => b.size - a.size);
    /* Fall back to summing the children if `du` omitted the `.` total. */
    return { path, size: total || children.reduce((s, c) => s + c.size, 0), entries: children, complete };
}

/*
 * Scan the immediate children of `path` with `du`. Returns each child's
 * total disk usage; unreadable subtrees produce `complete: false`.
 */
export async function scanDirectory(path: string): Promise<DirUsage> {
    const [duResult, findResult] = await Promise.all([
        collectSpawn(['du', '-a', '-B1', '-x', '-d', '1', '.'], { directory: path }),
        collectSpawn(['find', '.', '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '-printf', '%f\n'], { directory: path }),
    ]);

    return buildDirUsage(path, duResult.output, findResult.output, duResult.ok && findResult.ok);
}

export class UsageCache {
    private dirs = new Map<string, Promise<DirUsage>>();
    private fileSystems: Promise<FileSystem[]> | null = null;

    getFileSystems(): Promise<FileSystem[]> {
        if (!this.fileSystems)
            this.fileSystems = listFileSystems();
        return this.fileSystems;
    }

    getDirectory(path: string): Promise<DirUsage> {
        if (!this.dirs.has(path))
            this.dirs.set(path, scanDirectory(path));
        return this.dirs.get(path)!;
    }

    clear(): void {
        this.dirs.clear();
        this.fileSystems = null;
    }
}
