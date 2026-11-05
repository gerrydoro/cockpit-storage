/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

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
