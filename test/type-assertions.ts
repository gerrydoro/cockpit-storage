/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

/*
 * Compile-time assertions for the byte brand.
 *
 * The point of branding Bytes is that a raw byte count is rejected where a byte
 * count is expected, and there is no way to assert that in a test that runs:
 * the rejection has to be observed by the type checker. These statements never
 * execute -- importing this file is enough, tsc checks it as part of
 * `make codecheck`.
 *
 * If a later change weakens the brand, say by making Bytes an alias for number
 * again, each `@ts-expect-error` line stops being an error, tsc complains that
 * there was nothing to expect, and the build fails. That is the point.
 */

import { formatSize } from '../src/format.js';
import { parseDf } from '../src/gatherer.js';
import { bytes, kibToBytes } from '../src/paths.js';

const [filesystem] = parseDf('/dev/nvme0n1p2 100 50 50 1% /');

if (filesystem) {
    /* @ts-expect-error a block count is not a byte count */
    formatSize(filesystem.used / 1024 + 1024);

    /* @ts-expect-error nor is a raw number, however plausible it looks */
    formatSize(480531788);

    /* and the conversions are the way through */
    formatSize(kibToBytes(filesystem.used / 1024));
    formatSize(bytes(4096));
}

export {};
