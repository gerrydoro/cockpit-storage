/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

/*
 * A byte count.
 *
 * Branded so the type system can tell it apart from a size in the units some
 * other tool reports. `df -Pk` reports 1024-byte blocks; `du` reports bytes.
 * Nothing in the type system distinguished them, so passing a block count to
 * `formatSize` produced a number 1024 times too large with no error, and the
 * KiB-to-byte conversion was spelled out at three call sites in the picker.
 *
 * Branding rather than renaming keeps the arithmetic ordinary: a Bytes is a
 * number, it adds and divides like one, and it will not be accepted where a
 * raw number is expected unless it came from one of the two conversions below.
 */
export type Bytes = number & { readonly byte: unique symbol };

/* A count that is already in bytes, e.g. `du -B1`. */
export function bytes(count: number): Bytes {
    return count as Bytes;
}

/* `df -Pk` counts in 1024-byte blocks. */
export function kibToBytes(blocks: number): Bytes {
    return blocks * 1024 as Bytes;
}

/* ---- absolute paths ---- */

/*
 * Absolute-path helpers shared by the trail and the gatherer.
 *
 * These were written twice over before: path joining was spelled out in both
 * `Trail` and `buildDirUsage`, and the root special case was the part both had
 * to get right on their own. They live here so there is one answer to "how do
 * we build a child path" and one place to test it.
 *
 * An absolute path starts with `/` and ends with one only at the root, where a
 * child is `/<name>` rather than `//<name>`.
 */
export function joinPath(base: string, name: string): string {
    return base.endsWith('/') ? base + name : base + '/' + name;
}

export function baseName(path: string): string {
    if (path === '/')
        return path;
    return path.split('/').pop() ?? path;
}

/* How many segments a path has, for "which of these mounts is shallowest". */
export function pathDepth(path: string): number {
    return path.split('/').filter(Boolean).length;
}
