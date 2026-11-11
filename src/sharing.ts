/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import type { MountCensus, SharedInode } from './gatherer.js';
import { bytes, type Bytes } from './paths.js';

/*
 * What a mount's hard links mean for the directories inside it.
 *
 * A directory's `du` size is the space it occupies, and that is the number the
 * module has always shown. It is also a number that cannot be added up: two
 * folders holding the same film both report it in full, so their sum claims
 * more than the disk holds, and a folder's share of its mount depends on
 * whether the film's other name happens to be inside it. The only way to say
 * which part of a folder would still be there if the rest of the mount
 * disappeared is to know where its inodes are also linked from -- which is
 * what the census is for.
 *
 * Everything here is arithmetic over that census: no bridge, no React, and
 * nothing that cannot be exercised under Node. The one thing that has to be
 * gathered is the census itself.
 */

/*
 * Marks the sharing that is with paths the census did not walk.
 *
 * A hard link cannot cross filesystems, so a link outside the mount lives on
 * the same device at a path the scan never reached -- another subvolume of a
 * btrfs filesystem, most often. It is as much a copy as one inside the mount,
 * and folding it into the shared part is the difference between "exclusive to
 * this folder" being true and merely plausible.
 */
export const ELSEWHERE = '*';

export interface Counterpart {
    /* the other folder the bytes also live in, relative to the mount, or
       ELSEWHERE for links the census did not walk */
    name: string;
    bytes: Bytes;
    files: number;
}

export interface Sharing {
    /* the part of the directory's size that no other path in this mount reaches */
    exclusive: Bytes;
    /* the part that also lives elsewhere: the disk holds it once, but a sum of
       folder sizes counts it again */
    sharedWithElsewhere: Bytes;
    /* where the shared part also lives. The same bytes can appear under more
       than one counterpart, so these do not partition `sharedWithElsewhere` */
    counterparts: Counterpart[];
}

/* Bytes that exist more than once inside the mount: what adding up the folders
   by hand counts a second time. */
export function duplicatedBytes(census: MountCensus): Bytes {
    let total = 0;
    for (const inode of census.shared)
        total += (inode.paths.length - 1) * inode.bytes;
    return bytes(total);
}

/* What the mount's files would occupy if every hard link were counted -- what
   `du -l` reports, and what a reader of the folder sizes would assume.
   `uniqueBytes` is what `du` reports: each inode once. */
export function linkCountedBytes(uniqueBytes: Bytes, census: MountCensus): Bytes {
    return bytes(uniqueBytes + duplicatedBytes(census));
}

/* The folder to name for a link outside `relDirectory`: where the two paths
   part company, and one step further along the other one. A sibling of the
   directory is named as that sibling; a link deeper inside the same parent is
   named by its own branch. Naming the shared parent instead would tell the
   user "this is also in a" when it is in a/y, and naming the directory itself
   would tell them a folder shares bytes with itself. */
function counterpartName(relPath: string, relDirectory: string): string {
    const dirParts = relDirectory === '' ? [] : relDirectory.split('/');
    const parts = relPath.split('/');
    let shared = 0;
    while (shared < dirParts.length && shared < parts.length - 1 && dirParts[shared] === parts[shared])
        shared += 1;
    return parts.slice(0, shared + 1).join('/');
}

/* A path relative to the mount, so counterpart names are short and stable. */
function relativeTo(path: string, mount: string): string {
    if (mount === '/')
        return path.replace(/^\//, '');
    return path.startsWith(mount + '/') ? path.slice(mount.length + 1) : path;
}

/* Is `path` the directory itself or inside it? */
function within(path: string, directory: string): boolean {
    return path === directory || path.startsWith(directory === '/' ? '/' : directory + '/');
}

/*
 * The hard-link picture of one directory inside a mount.
 *
 * An inode reachable from the directory counts towards `sharedWithElsewhere`
 * when any of its links is also outside it, and towards `exclusive` otherwise
 * -- which is what makes the two add up to the directory's size, the way `du`
 * measured it. Inodes the directory cannot reach are none of its business,
 * however many links they have.
 */
export function sharingUnder(census: MountCensus, directory: string, size: Bytes): Sharing {
    const relDirectory = relativeTo(directory, census.mount);
    const byName = new Map<string, Counterpart>();
    let shared = 0;

    const add = (name: string, inode: SharedInode) => {
        const seen = byName.get(name);
        if (seen) {
            seen.bytes = bytes(seen.bytes + inode.bytes);
            seen.files += 1;
            return;
        }
        byName.set(name, { name, bytes: inode.bytes, files: 1 });
    };

    for (const inode of census.shared) {
        let inside = 0;
        const outside: string[] = [];
        for (const path of inode.paths) {
            if (within(path, directory))
                inside += 1;
            else
                outside.push(path);
        }
        if (inside === 0 || outside.length + Math.max(0, inode.links - inode.paths.length) === 0)
            continue;

        shared += inode.bytes;
        for (const path of outside)
            add(counterpartName(relativeTo(path, census.mount), relDirectory), inode);
        /* Links the kernel knows about that this walk never reached. */
        if (inode.links > inode.paths.length)
            add(ELSEWHERE, inode);
    }

    return {
        exclusive: bytes(size - shared),
        sharedWithElsewhere: bytes(shared),
        counterparts: [...byName.values()].sort((a, b) => b.bytes - a.bytes),
    };
}
