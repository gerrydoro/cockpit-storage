/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Minimal stub for the `cockpit` browser module so that pure data-gathering
 * functions in src/gatherer.ts can be bundled and unit-tested under Node.
 * Only the surface actually exercised by the pure helpers is provided; the
 * command-runners (spawn/file) are intentionally not backed by a real bridge.
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

export default cockpit;
