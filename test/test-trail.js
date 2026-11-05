/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the navigation rules. These run in Node: the trail is
 * plain data with no React and no bridge, so every transition the page makes
 * is a function call here.
 */

/* global QUnit */

import { Trail } from '../src/trail.js';
import { joinPath, baseName, pathDepth } from '../src/paths.js';

/* ---- paths ---- */

QUnit.module('joinPath');

QUnit.test('joins without doubling the root separator', assert => {
    assert.equal(joinPath('/', 'docs'), '/docs', 'not //docs');
    assert.equal(joinPath('/home/user', 'docs'), '/home/user/docs');
    assert.equal(joinPath('/mnt/backups', 'docs'), '/mnt/backups/docs');
});

QUnit.test('baseName takes the last segment', assert => {
    assert.equal(baseName('/home/user/docs'), 'docs');
    assert.equal(baseName('/docs'), 'docs');
    assert.equal(baseName('/'), '/', 'the root is its own name');
    assert.equal(baseName('docs'), 'docs', 'an already-relative name is unchanged');
});

QUnit.test('pathDepth counts segments, not characters', assert => {
    assert.equal(pathDepth('/'), 0);
    assert.equal(pathDepth('/docs'), 1);
    assert.equal(pathDepth('/home/user/docs'), 3);
    assert.equal(pathDepth('/verylongname'), 1);
});

/* ---- Trail ---- */

QUnit.module('Trail');

QUnit.test('a new trail is at the picker, with no crumbs', assert => {
    const trail = new Trail();

    assert.equal(trail.current(), null, 'no filesystem chosen yet');
    assert.deepEqual(trail.segments(), [], 'nothing to navigate by');
});

QUnit.test('opening a filesystem lands on its mount point', assert => {
    const trail = Trail.open('/mnt/backups');

    assert.deepEqual(trail.current(), { mount: '/mnt/backups', path: '/mnt/backups' });
    assert.deepEqual(trail.segments(), [
        { label: '/mnt/backups', path: '/mnt/backups' },
    ], 'one crumb, labelled with the mount itself');
});

QUnit.test('opening a child descends without doubling the separator', assert => {
    const trail = Trail.open('/').openChild('docs');

    assert.deepEqual(trail.current(), { mount: '/', path: '/docs' });
    assert.deepEqual(trail.segments(), [
        { label: '/', path: '/' },
        { label: 'docs', path: '/docs' },
    ]);
});

QUnit.test('descending keeps every level on the crumb trail', assert => {
    const trail = Trail.open('/').openChild('home').openChild('user').openChild('docs');

    assert.deepEqual(trail.current(), { mount: '/', path: '/home/user/docs' });
    assert.deepEqual(trail.segments().map(s => s.path), ['/', '/home', '/home/user', '/home/user/docs']);
    assert.deepEqual(trail.segments().map(s => s.label), ['/', 'home', 'user', 'docs']);
});

QUnit.test('a step must be a name, never a path', assert => {
    assert.throws(() => new Trail('/', ['../etc']),
                  /a trail step must be a name, not a path/,
                  'a step holding two levels would break back()');
});

QUnit.test('commands on the picker trail leave it alone', assert => {
    const empty = new Trail();

    assert.deepEqual(empty.openChild('docs').current(), null);
    assert.deepEqual(empty.back().current(), null);
    const nowhere = Trail.open('/').segments()[0];
    assert.deepEqual(empty.goTo(nowhere).current(), null, 'a crumb from another trail does nothing');
});

QUnit.test('back ascends one level at a time', assert => {
    let trail = Trail.open('/mnt/backups').openChild('docs').openChild('images');

    trail = trail.back();
    assert.equal(trail.current()?.path, '/mnt/backups/docs', 'up one directory');

    trail = trail.back();
    assert.equal(trail.current()?.path, '/mnt/backups', 'and back to the mount');

    trail = trail.back();
    assert.equal(trail.current(), null, 'leaving the filesystem returns to the picker');
    assert.deepEqual(trail.segments(), [], 'so there are no crumbs left');

    assert.deepEqual(trail.back().current(), null, 'back at the picker is a no-op');
});

QUnit.test('a crumb click moves to that ancestor, dropping nothing before it', assert => {
    const trail = Trail.open('/').openChild('home').openChild('user').openChild('docs');
    const segments = trail.segments();

    const jumped = trail.goTo(segments[1]);
    assert.deepEqual(jumped.current(), { mount: '/', path: '/home' });
    assert.deepEqual(jumped.segments().map(s => s.path),
                     ['/', '/home'], 'the trail below the target is gone');

    const root = trail.goTo(segments[0]);
    assert.deepEqual(root.current(), { mount: '/', path: '/' });
    assert.deepEqual(root.segments().map(s => s.path), ['/']);
});

QUnit.test('clicking the crumb you are already on changes nothing', assert => {
    const trail = Trail.open('/mnt/backups').openChild('docs');
    const here = trail.goTo(trail.segments()[1]);

    assert.deepEqual(here.current(), trail.current(), 'still where you were');
    assert.deepEqual(here.segments(), trail.segments());
});

QUnit.test('every command returns a new trail, so the page re-renders', assert => {
    const trail = Trail.open('/').openChild('docs');

    assert.notEqual(trail.openChild('x'), trail);
    assert.notEqual(trail.back(), trail);
    assert.notEqual(trail.goTo(trail.segments()[0]), trail);
    assert.notEqual(Trail.open('/'), trail);
});

QUnit.test('the trail is not affected by a second one opened from it', assert => {
    const here = Trail.open('/').openChild('home');
    const elsewhere = Trail.open('/mnt/backups').openChild('docs');

    assert.deepEqual(here.current(), { mount: '/', path: '/home' },
                     'opening another filesystem cannot reach back');
    assert.deepEqual(elsewhere.current(), { mount: '/mnt/backups', path: '/mnt/backups/docs' });
});
