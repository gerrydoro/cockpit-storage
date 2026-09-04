#!/usr/bin/env node
/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Bundle the QUnit unit tests into a single self-contained file that Node can
 * run. The src code imports the browser `cockpit` module, which is replaced by
 * a local mock so the pure helpers can run without a bridge.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
    bundle: true,
    entryPoints: [path.join(here, 'test-gatherer.js')],
    outfile: path.join(here, 'unit-tests.js'),
    format: 'cjs',
    platform: 'node',
    target: ['node18'],
    sourcemap: 'inline',
    alias: {
        cockpit: path.join(here, 'mock-cockpit.js'),
    },
    logLevel: 'warning',
});
