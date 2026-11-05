/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import { baseName, joinPath } from './paths.js';

/*
 * The trail: the filesystem the user opened, plus the chain of directories
 * they have walked into since.
 *
 * The page keeps one trail in state. Every command returns a new trail, so
 * navigating produces a fresh value for React to render, and no React API
 * appears here. That is what makes the navigation rules testable without a
 * VM: does opening a child double the slash, does going back from a mount
 * return to the picker, does a crumb click move the user or truncate the
 * trail.
 *
 * Steps hold *names*, not paths. Keeping the mount in one place instead of
 * repeating it on every step is what lets a segment tell it is the first
 * crumb from where it sits, rather than from a field every entry had to carry.
 */

export interface Location {
    /* the filesystem this trail started at */
    mount: string;
    /* the directory being shown right now, as an absolute path */
    path: string;
}

export interface TrailSegment {
    label: string;
    path: string;
}

export class Trail {
    constructor(
        private readonly mount: string | null = null,
        private readonly steps: readonly string[] = [],
    ) {
        /* A step is a directory name, never a path. One carrying `/` would still
           render correctly, but would then be a single step holding two levels:
           `back` would drop the whole thing instead of the last directory, and
           a crumb would skip a level it never actually visited. */
        for (const step of steps) {
            if (step.includes('/'))
                throw new Error(`a trail step must be a name, not a path: ${step}`);
        }
    }

    /* Start a trail at a filesystem's mount point. */
    static open(mount: string): Trail {
        return new Trail(mount);
    }

    /* Where the user is, or null while they are still choosing a filesystem. */
    current(): Location | null {
        if (this.mount === null)
            return null;
        return { mount: this.mount, path: this.absolutePath() };
    }

    /* Crumbs for the whole trail: the filesystem first, this directory last. */
    segments(): TrailSegment[] {
        return this.paths().map((path, i) => ({
            label: i === 0 ? path : baseName(path),
            path,
        }));
    }

    /* Descend into a child of the directory being shown. */
    openChild(name: string): Trail {
        if (this.mount === null)
            return this;
        return new Trail(this.mount, [...this.steps, name]);
    }

    /* Ascend one level. From the mount this leaves for the picker. */
    back(): Trail {
        if (this.mount === null)
            return this;
        if (this.steps.length === 0)
            return new Trail();
        return new Trail(this.mount, this.steps.slice(0, -1));
    }

    /*
     * Jump to a crumb.
     *
     * Takes the segment rather than a path string, so the call site can only
     * name a crumb that is actually on this trail. The previous interface took
     * any path and grew a branch for "target not visited", which no caller
     * could ever reach -- an unvisited directory has no listing to descend
     * into, only one this user already walked.
     */
    goTo(segment: TrailSegment): Trail {
        const index = this.paths().indexOf(segment.path);
        if (index < 0)
            return this;
        return new Trail(this.mount, this.steps.slice(0, index));
    }

    /* Absolute path of every crumb, the filesystem first and this one last. */
    private paths(): string[] {
        const mount = this.mount;
        if (mount === null)
            return [];
        const paths = [mount];
        for (const step of this.steps)
            paths.push(joinPath(paths[paths.length - 1], step));
        return paths;
    }

    private absolutePath(): string {
        return this.steps.reduce((path, step) => joinPath(path, step), this.mount ?? '');
    }
}
