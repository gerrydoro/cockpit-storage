/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the pure parsing / formatting helpers. These run in
 * Node, so they never talk to the cockpit bridge: they feed sample `df`,
 * `/proc/mounts` and `du` output to the exported functions and assert on the
 * parsed result.
 */

/* global QUnit */

import { parseMounts, parseDf, filterFileSystems, parseDu } from '../src/gatherer.js';
import { formatSize } from '../src/format.js';

/* ---- parseMounts ---- */

QUnit.module('parseMounts');

QUnit.test('parses mount lines with escaped spaces and fields', assert => {
    const text = [
        'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
        '/dev/nvme0n1p2 / ext4 rw,relatime 0 0',
        '/dev/sda1 /mnt/My\\040Drive ext4 rw,relatime 0 0',
        '',
    ].join('\n');

    const mounts = parseMounts(text);
    assert.equal(mounts.size, 3, 'three mounts parsed');
    assert.deepEqual(mounts.get('/proc'), { device: 'proc', fstype: 'proc' });
    assert.deepEqual(mounts.get('/'), { device: '/dev/nvme0n1p2', fstype: 'ext4' });
    assert.deepEqual(mounts.get('/mnt/My Drive'), { device: '/dev/sda1', fstype: 'ext4' },
                     '\\040 escape decoded to a space');
});

QUnit.test('ignores blank lines and malformed lines', assert => {
    /* missing the trailing dump/pass fields -> not a valid /proc/mounts record */
    const mounts = parseMounts('\nproc /proc proc rw\n\n');
    assert.equal(mounts.size, 0, 'malformed line with missing fields is dropped');
});

/* ---- parseDf ---- */

QUnit.module('parseDf');

QUnit.test('parses df -Pk output and skips the header', assert => {
    const text = [
        'Filesystem     1024-blocks    Used Available Capacity Mounted on',
        '/dev/nvme0n1p2   480531788 2345645 478702943       1% /',
        '/dev/sda1          999320    3000    960000       1% /boot',
        '',
    ].join('\n');

    const filesystems = parseDf(text);
    assert.equal(filesystems.length, 2, 'header line skipped');
    assert.deepEqual(filesystems[0], {
        device: '/dev/nvme0n1p2',
        blocks: 480531788,
        used: 2345645,
        avail: 478702943,
        capacity: 1,
        mount: '/',
        fstype: '',
    });
    assert.equal(filesystems[1].mount, '/boot');
});

/* ---- filterFileSystems ---- */

QUnit.module('filterFileSystems');

const mounts = (() => {
    const m = new Map();
    m.set('/', { device: '/dev/nvme0n1p2', fstype: 'ext4' });
    m.set('/nix/store', { device: '/dev/nvme0n1p2', fstype: 'ext4' });
    m.set('/dev/shm', { device: 'tmpfs', fstype: 'tmpfs' });
    m.set('/proc', { device: 'proc', fstype: 'proc' });
    m.set('/var/lib/docker/overlay2/abc', { device: 'overlay', fstype: 'overlay' });
    return m;
})();

QUnit.test('drops virtual filesystems and deduplicates bind mounts', assert => {
    const df = [
        { device: '/dev/nvme0n1p2', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/', fstype: '' },
        { device: '/dev/nvme0n1p2', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/nix/store', fstype: '' },
        { device: 'tmpfs', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/dev/shm', fstype: '' },
        { device: 'proc', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/proc', fstype: '' },
        { device: 'overlay', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/var/lib/docker/overlay2/abc', fstype: '' },
    ];

    const result = filterFileSystems(df, mounts);
    assert.equal(result.length, 1, 'only the real ext4 filesystem survives');
    assert.equal(result[0].mount, '/', 'the shallowest bind mount is kept');
    assert.equal(result[0].fstype, 'ext4', 'fstype annotated from /proc/mounts');
});

QUnit.test('root filesystem is sorted first', assert => {
    const df = [
        { device: '/dev/sda', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/home', fstype: '' },
        { device: '/dev/sdb', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/', fstype: '' },
    ];
    const m = new Map();
    m.set('/home', { device: '/dev/sda', fstype: 'ext4' });
    m.set('/', { device: '/dev/sdb', fstype: 'ext4' });

    const result = filterFileSystems(df, m);
    assert.equal(result[0].mount, '/', 'root mount listed first');
    assert.equal(result[1].mount, '/home');
});

/* ---- parseDu ---- */

QUnit.module('parseDu');

QUnit.test('parses newline-delimited size<TAB>path records', assert => {
    /* du -B1 -d 1 emits the directory total first, then its children */
    const text = [
        '4096\t.',
        '2048\t./docs',
        '512\t./src',
        '1024\t./a file with spaces',
        '',
    ].join('\n');

    const entries = parseDu(text);
    assert.equal(entries.length, 4, 'parses each record');
    assert.deepEqual(entries[0], { path: '.', size: 4096 });
    assert.deepEqual(entries[3], { path: './a file with spaces', size: 1024 });
});

QUnit.test('skips empty records and non-numeric sizes', assert => {
    const text = ['1234\t./x', '', 'oops\t./y', ''].join('\n');
    const entries = parseDu(text);
    assert.equal(entries.length, 1, 'empty and malformed records dropped');
    assert.deepEqual(entries[0], { path: './x', size: 1234 });
});

/* ---- formatSize ---- */

QUnit.module('formatSize');

QUnit.test('formats byte counts with appropriate units', assert => {
    assert.equal(formatSize(0), '0 B');
    assert.equal(formatSize(512), '512 B');
    assert.equal(formatSize(1024), '1.00 KiB');
    assert.equal(formatSize(1536), '1.50 KiB');
    assert.equal(formatSize(10 * 1024 * 1024), '10.0 MiB');
    assert.equal(formatSize(100 * 1024 * 1024), '100 MiB');
    assert.equal(formatSize(1024 ** 3), '1.00 GiB');
    assert.equal(formatSize(1024 ** 4), '1.00 TiB');
});

QUnit.test('handles non-finite and negative input', assert => {
    assert.equal(formatSize(-5), '0 B');
    assert.equal(formatSize(NaN), '0 B');
});
