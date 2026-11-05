/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Minimal stub for the `cockpit` browser module so that src/gatherer.ts can be
 * bundled and unit-tested under Node. It provides two things:
 *
 *  - `spawn`/`file` that throw, so a test that accidentally reaches for the
 *    real bridge fails loudly instead of hanging.
 *  - `inMemoryRunner`, an adapter for the `CommandRunner` seam, which lets the
 *    whole gathering layer (listFileSystems, scanDirectory, UsageCache) be
 *    exercised under Node without a bridge.
 */

function spawn() {
    throw new Error('cockpit.spawn is not available in unit tests');
}

function file() {
    throw new Error('cockpit.file is not available in unit tests');
}

const cockpit = {
    spawn,
    file,
    gettext: str => str,
    C_(_context, str) { return str },
};

/*
 * An in-memory CommandRunner for the gatherer.
 *
 * `mounts` and `df` are canned text for `/proc/mounts` and `df -Pk`.
 * `dirs` maps a directory path to the canned output of the two commands
 * `scanDirectory` runs in it:
 *
 *     { '/': { du: '4096\t.\n...', find: 'docs\n' } }
 *
 * A `du` or `find` value of null means that command failed (ok: false), which
 * is how an unreadable-directory scan is simulated. An unknown directory
 * reports empty output for both commands.
 */
export function inMemoryRunner({ mounts = '', df = '', dirs = {} } = {}) {
    const commandFor = (dir, name) => {
        const spec = dirs[dir];
        if (spec && name in spec && spec[name] === null)
            return { output: '', ok: false };
        return { output: spec?.[name] ?? '', ok: true };
    };

    return {
        async run(args, options) {
            const dir = options?.directory ?? '';
            switch (args[0]) {
                case 'df':
                    return { output: df, ok: true };
                case 'du':
                    return commandFor(dir, 'du');
                case 'find':
                    return commandFor(dir, 'find');
                default:
                    throw new Error(`inMemoryRunner: no canned output for ${args.join(' ')}`);
            }
        },

        async read(path) {
            if (path === '/proc/mounts')
                return mounts;
            throw new Error(`inMemoryRunner: no canned file for ${path}`);
        },
    };
}

export default cockpit;
