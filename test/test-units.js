/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the byte unit. These run in Node. The point of the
 * brand is that it is checked at compile time, so what is covered here is the
 * behaviour of the conversion and the arithmetic flowing through it; the
 * rejection of a raw number is covered by tsc, which the CI runs.
 */

/* global QUnit */

import { bytes, kibToBytes } from '../src/paths.js';
import { formatSize } from '../src/format.js';
import { parseDf, buildDirUsage } from '../src/gatherer.js';
import './type-assertions.ts';

QUnit.module('kibToBytes');

QUnit.test('converts df 1024-byte blocks to bytes', assert => {
    assert.equal(kibToBytes(0), 0);
    assert.equal(kibToBytes(1), 1024);
    assert.equal(kibToBytes(100), 102400);
    assert.equal(kibToBytes(480531788), 480531788 * 1024);
});

QUnit.test('is idempotent-friendly: brand survives arithmetic unchanged', assert => {
    /* a branded byte count is a number; only accepting it where a byte count
       is expected is restricted */
    const total = kibToBytes(2) + kibToBytes(3);
    assert.equal(total, 5 * 1024, 'two brandees add as ordinary numbers');
    assert.equal(formatSize(total), '5.00 KiB');
});

QUnit.module('bytes');

QUnit.test('passes a count that is already in bytes through', assert => {
    assert.equal(bytes(1024), 1024);
    assert.equal(formatSize(bytes(1024)), '1.00 KiB');
});

/* ---- conversions happen at the parse boundary ---- */

const DF = [
    'Filesystem     1024-blocks    Used Available Capacity Mounted on',
    '/dev/nvme0n1p2   480531788 2345645 478702943       1% /',
    '',
].join('\n');

QUnit.module('parseDf units');

QUnit.test('df blocks are converted once, at the boundary', assert => {
    const [fs] = parseDf(DF);

    /* before the brand, each of these three numbers was a raw count that the
       caller had to multiply by 1024 itself */
    assert.equal(fs.used, 2345645 * 1024, 'used is bytes, not blocks');
    assert.equal(fs.avail, 478702943 * 1024, 'as is avail');
    assert.equal(fs.blocks, 480531788 * 1024, 'as is size');
    assert.equal(fs.capacity, 1, 'capacity stays a percentage, never converted');
});

QUnit.test('the numbers format as the sizes they mean', assert => {
    const [fs] = parseDf(DF);
    assert.equal(formatSize(fs.used), '2.24 GiB', 'not 2.24 TiB');
});

/* ---- du reports bytes, so nothing is converted ---- */

const DU = [
    '1073741824\t.',
    '536870912\t./docs',
    '268435456\t./readme.txt',
    '',
].join('\n');

QUnit.module('buildDirUsage units');

QUnit.test('a level and its entries come out in bytes', assert => {
    const usage = buildDirUsage(DU, 'docs\n', true);

    assert.equal(usage.size, 1073741824, 'one GiB, as du reported it');
    assert.equal(usage.entries[0].size, 536870912, 'half a GiB');
    assert.equal(formatSize(usage.size), '1.00 GiB', 'formatted without a caller conversion');
});

QUnit.test('the fallback sum is still in bytes', assert => {
    const noTotal = ['536870912\t./docs', '268435456\t./readme.txt', ''].join('\n');
    const usage = buildDirUsage(noTotal, 'docs\n', true);

    assert.equal(usage.size, 805306368, 'the children sum without being mis-scaled');
});
