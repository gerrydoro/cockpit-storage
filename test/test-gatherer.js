/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the pure parsing / formatting helpers, and for the
 * gathering layer behind the `CommandRunner` seam. These run in Node, so they
 * never talk to the cockpit bridge: the parsing tests feed sample `df`,
 * `/proc/mounts` and `du` output to the pure functions, and the gathering
 * tests hand the runners an `inMemoryRunner` printed with canned output.
 */

/* global QUnit */

import { parseMounts, parseDf, filterFileSystems, parseDu, buildDirUsage,
         listFileSystems, scanDirectory, UsageCache } from '../src/gatherer.js';
import { inMemoryRunner } from './mock-cockpit.js';
import { formatSize } from '../src/format.js';

/* Registers the navigation rules, the chart vocabulary, the layout and the byte
   unit; QUnit collects modules at import time. */
import './test-trail.js';
import './test-chart.js';
import './test-layout.js';
import './test-units.js';

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

QUnit.test('decodes all octal escapes, not just spaces', assert => {
    const text = [
        '/dev/disk\\040by-id /mnt/tab\\011name ext4 rw,relatime 0 0',
        '/dev/sdb1 /mnt/back\\134slash ext4 rw,relatime 0 0',
        '',
    ].join('\n');

    const mounts = parseMounts(text);
    assert.deepEqual(mounts.get('/mnt/tab\tname'), { device: '/dev/disk by-id', fstype: 'ext4' },
                     '\\011 decoded to a tab and \\040 in the device decoded');
    assert.deepEqual(mounts.get('/mnt/back\\slash'), { device: '/dev/sdb1', fstype: 'ext4' },
                     '\\134 decoded to a backslash');
});

/* ---- parseDf ---- */

QUnit.module('parseDf');

QUnit.test('converts df blocks to bytes and skips the header', assert => {
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
        blocks: 480531788 * 1024,
        used: 2345645 * 1024,
        avail: 478702943 * 1024,
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

QUnit.test('keeps the shallowest mount by path depth, not string length', assert => {
    /* /a/b/c is deeper but shorter in characters than /verylongname; the old
       string-length heuristic would have picked the deeper mount */
    const df = [
        { device: '/dev/sdc', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/a/b/c', fstype: '' },
        { device: '/dev/sdc', blocks: 100, used: 50, avail: 50, capacity: 50, mount: '/verylongname', fstype: '' },
    ];
    const m = new Map();
    m.set('/a/b/c', { device: '/dev/sdc', fstype: 'ext4' });
    m.set('/verylongname', { device: '/dev/sdc', fstype: 'ext4' });

    const result = filterFileSystems(df, m);
    assert.equal(result.length, 1, 'bind mounts of one device collapse to one entry');
    assert.equal(result[0].mount, '/verylongname', 'the shallower path wins even though it is longer');
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

/* ---- buildDirUsage ---- */

QUnit.module('buildDirUsage');

const DU = [
    '4096\t.',
    '2048\t./docs',
    '1024\t./readme.txt',
    '256\t./z-file',
    '',
].join('\n');

QUnit.test('builds children, marks directories and reads the total', assert => {
    const usage = buildDirUsage('/', DU, 'docs\n', true);

    assert.equal(usage.path, '/', 'path is preserved');
    assert.equal(usage.size, 4096, 'directory total comes from the `.` record');
    assert.equal(usage.complete, true);
    assert.deepEqual(usage.entries.map(e => e.name), ['docs', 'readme.txt', 'z-file'],
                     'children are sorted by size descending');

    const docs = usage.entries.find(e => e.name === 'docs');
    assert.equal(docs.isDir, true, 'subdirectory from find is flagged as a directory');
    assert.equal(docs.path, '/docs', 'child path is joined onto the parent');
    assert.equal(docs.size, 2048);

    const readme = usage.entries.find(e => e.name === 'readme.txt');
    assert.equal(readme.isDir, false, 'plain file is not a directory');
    assert.equal(readme.path, '/readme.txt');
});

QUnit.test('joins nested paths without doubling separators', assert => {
    const usage = buildDirUsage('/home/user', DU, 'docs\n', true);
    const docs = usage.entries.find(e => e.name === 'docs');
    assert.equal(docs.path, '/home/user/docs');
});

QUnit.test('falls back to summing children when du omits the total', assert => {
    const du = ['2048\t./docs', '1024\t./readme.txt', ''].join('\n');
    const usage = buildDirUsage('/', du, 'docs\n', true);
    assert.equal(usage.size, 3072, 'total is the sum of the children');
});

QUnit.test('propagates the complete flag from the command runners', assert => {
    const usage = buildDirUsage('/', DU, 'docs\n', false);
    assert.equal(usage.complete, false, 'a failed command is surfaced to the UI');
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

/* ---- listFileSystems ---- */

QUnit.module('listFileSystems');

const MOUNTS = [
    'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
    '/dev/nvme0n1p2 / ext4 rw,relatime 0 0',
    '/dev/sdb1 /mnt/backups ext4 rw,relatime 0 0',
    '/dev/nvme0n1p2 /nix/store ext4 rw,relatime 0 0',
    'tmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0',
    '',
].join('\n');

const DF = [
    'Filesystem     1024-blocks    Used Available Capacity Mounted on',
    '/dev/nvme0n1p2   480531788 2345645 478702943       1% /',
    '/dev/sdb1       999999999 5000000 994999999       1% /mnt/backups',
    'tmpfs              8192000        0   8192000       0% /dev/shm',
    '/dev/nvme0n1p2   480531788 2345645 478702943       1% /nix/store',
    '',
].join('\n');

function runnerWith(df = DF, mounts = MOUNTS, dirs = {}) {
    return inMemoryRunner({ mounts, df, dirs });
}

QUnit.test('combines /proc/mounts with df and drops virtual filesystems', async assert => {
    const filesystems = await listFileSystems(runnerWith());

    assert.equal(filesystems.length, 2, 'tmpfs dropped, bind mount collapsed');
    assert.deepEqual(filesystems.map(fs => fs.mount), ['/', '/mnt/backups']);

    const root = filesystems[0];
    assert.equal(root.device, '/dev/nvme0n1p2', 'device taken from /proc/mounts');
    assert.equal(root.fstype, 'ext4', 'fstype annotated from /proc/mounts');
    assert.equal(root.used, 2345645 * 1024, 'sizes still come from df, in bytes');
    assert.equal(root.capacity, 1);
    assert.equal(root.blocks, 480531788 * 1024, 'sizes are bytes by the time they leave df');
});

QUnit.test('rejects when the runner cannot read /proc/mounts', async assert => {
    const runner = inMemoryRunner({ mounts: '', df: DF });
    runner.read = () => Promise.reject(new Error('bridge went away'));

    await assert.rejects(listFileSystems(runner), /bridge went away/,
                         'the failure is not swallowed into an empty filesystem list');
});

/* ---- scanDirectory ---- */

QUnit.module('scanDirectory');

const ROOT_DU = [
    '4096\t.',
    '2048\t./docs',
    '1024\t./readme.txt',
    '256\t./z-file',
    '',
].join('\n');

QUnit.test('runs du and find, then joins the output into a level', async assert => {
    const runner = runnerWith(DF, MOUNTS, {
        '/': { du: ROOT_DU, find: 'docs\n' },
    });

    const usage = await scanDirectory('/', runner);
    assert.equal(usage.path, '/');
    assert.equal(usage.size, 4096, 'total from the `.` record');
    assert.equal(usage.complete, true);

    assert.deepEqual(usage.entries.map(e => e.name), ['docs', 'readme.txt', 'z-file']);
    const docs = usage.entries.find(e => e.name === 'docs');
    assert.equal(docs.isDir, true, 'find marked it as a directory');
    assert.equal(docs.path, '/docs', 'du output is relative, so the path is rejoined');

    const readme = usage.entries.find(e => e.name === 'readme.txt');
    assert.equal(readme.isDir, false, 'a file reported by du but not by find');
    assert.equal(readme.path, '/readme.txt');
});

QUnit.test('scans the directory it is asked to, not the working directory', async assert => {
    const seen = {};
    const runner = runnerWith(DF, MOUNTS, {
        '/home/user': {
            du: '2048\t.\n1024\t./big\n',
            find: 'big\n',
        },
    });
    const inner = runner.run;
    runner.run = (args, options) => {
        seen[args[0]] = options?.directory;
        return inner(args, options);
    };

    await scanDirectory('/home/user', runner);

    assert.equal(seen.du, '/home/user', 'du is given the target as its working directory');
    assert.equal(seen.find, '/home/user', 'find likewise, and in parallel with du');
});

QUnit.test('reports complete: false when du fails but still returns children', async assert => {
    const runner = runnerWith(DF, MOUNTS, {
        '/root/locked': { du: null, find: 'docs\n' },
    });

    const usage = await scanDirectory('/root/locked', runner);
    assert.equal(usage.complete, false, 'a failed du is surfaced to the UI');
    assert.equal(usage.size, 0, 'nothing was read');
    assert.equal(usage.entries.length, 0);
});

QUnit.test('reports complete: false when find fails', async assert => {
    const runner = runnerWith(DF, MOUNTS, {
        '/': { du: ROOT_DU, find: null },
    });

    const usage = await scanDirectory('/', runner);
    assert.equal(usage.complete, false, 'complete is the AND of both commands');
    assert.equal(usage.size, 4096, 'du output is still used');
    assert.equal(usage.entries.find(e => e.name === 'docs').isDir, false,
                 'without find, no child can be marked as a directory');
});

QUnit.test('falls back to summing children when du omits the total', async assert => {
    const du = ['1024\t./a', '512\t./b', ''].join('\n');
    const usage = await scanDirectory('/', runnerWith(DF, MOUNTS, {
        '/': { du, find: 'a\nb\n' },
    }));

    assert.equal(usage.size, 1536, 'the `.` record was missing');
});

QUnit.test('does not double the root separator when joining', async assert => {
    const runner = runnerWith(DF, MOUNTS, {
        '/': { du: '2048\t.\n1024\t./docs\n', find: 'docs\n' },
    });
    const usage = await scanDirectory('/', runner);
    assert.equal(usage.entries[0].path, '/docs', 'not //docs');
});

/* ---- UsageCache ---- */

QUnit.module('UsageCache');

QUnit.test('scans each directory once per session', async assert => {
    let duCalls = 0;
    const runner = runnerWith(DF, MOUNTS, {
        '/': { du: ROOT_DU, find: 'docs\n' },
    });
    const inner = runner.run;
    runner.run = (args, options) => {
        if (args[0] === 'du')
            duCalls += 1;
        return inner(args, options);
    };

    const cache = new UsageCache(runner);
    const first = await cache.getDirectory('/');
    const second = await cache.getDirectory('/');

    assert.deepEqual(second, first, 'the same level comes back, not a fresh scan');
    assert.equal(duCalls, 1, 'a second visit does not run du again');
});

QUnit.test('re-scans after clear()', async assert => {
    let duCalls = 0;
    const runner = runnerWith(DF, MOUNTS, {
        '/': { du: ROOT_DU, find: 'docs\n' },
    });
    const inner = runner.run;
    runner.run = (args, options) => {
        if (args[0] === 'du')
            duCalls += 1;
        return inner(args, options);
    };

    const cache = new UsageCache(runner);
    await cache.getDirectory('/');
    cache.clear();
    await cache.getDirectory('/');

    assert.equal(duCalls, 2, 'Rescan really does drop the cached scan');
});

QUnit.test('lists the filesystems once, and again after clear()', async assert => {
    let reads = 0;
    const runner = runnerWith();
    const inner = runner.read;
    runner.read = path => {
        reads += 1;
        return inner(path);
    };

    const cache = new UsageCache(runner);
    await cache.getFileSystems();
    await cache.getFileSystems();
    assert.equal(reads, 1, 'the filesystem list is memoised');

    cache.clear();
    await cache.getFileSystems();
    assert.equal(reads, 2, 'and dropped on clear()');
});

QUnit.test('a rejected scan is not cached, so a retry can succeed', async assert => {
    /* this is the case that used to poison a path for the whole session */
    const runner = runnerWith(DF, MOUNTS, {
        '/unreadable': { du: ROOT_DU, find: 'docs\n' },
    });

    const cache = new UsageCache(runner);
    const policy = runner.run;
    let attempts = 0;
    let bridgeDown = true;
    runner.run = (args, options) => {
        attempts += 1;
        if (bridgeDown)
            return Promise.reject(new Error('bridge went away'));
        return policy(args, options);
    };

    await assert.rejects(cache.getDirectory('/unreadable'), /bridge went away/,
                         'the scan itself rejected');
    assert.equal(attempts, 2, 'both commands of the scan were attempted');

    bridgeDown = false;
    attempts = 0;
    const usage = await cache.getDirectory('/unreadable');
    assert.equal(usage.size, 4096, 'the retry succeeded instead of returning the poisoning');
    assert.equal(usage.complete, true);
    assert.equal(attempts, 2, 'a second scan really ran, rather than a rejection being replayed');
});

QUnit.test('an incomplete scan is cached, because it is a result and not a failure', async assert => {
    let duCalls = 0;
    const runner = runnerWith(DF, MOUNTS, {
        '/locked': { du: null, find: 'docs\n' },
    });
    const inner = runner.run;
    runner.run = (args, options) => {
        if (args[0] === 'du')
            duCalls += 1;
        return inner(args, options);
    };

    const cache = new UsageCache(runner);
    const first = await cache.getDirectory('/locked');
    const second = await cache.getDirectory('/locked');

    assert.equal(first.complete, false, 'unreadable directories are reported, not retried');
    assert.equal(second, first);
    assert.equal(duCalls, 1, 'Rescan is the way to retry, not revisiting the directory');
});
