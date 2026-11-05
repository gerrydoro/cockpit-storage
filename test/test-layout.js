/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the treemap layout. These run in Node: the layout is
 * plain geometry, so the mapping between a rectangle and the datum it belongs
 * to is covered without a browser.
 */

/* global QUnit */

import { squarify, place } from '../src/layout.js';
import { colorSlots, levelData } from '../src/chart.js';

/* ---- squarify: the geometry ---- */

QUnit.module('squarify');

QUnit.test('lays rectangles that fill the area in size order', assert => {
    const rects = squarify([100, 50, 25, 25], 0, 0, 100, 100);

    assert.equal(rects.length, 4, 'one rectangle per positive value');
    assert.deepEqual(rects.map(r => r.value), [100, 50, 25, 25], 'values stay in descending order');

    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    assert.ok(Math.abs(area - 100 * 100) < 1e-6, 'rectangles cover the whole area');

    for (const r of rects) {
        assert.ok(r.x >= 0 && r.y >= 0, 'rectangles stay inside the origin');
        assert.ok(r.x + r.w <= 100.000001 && r.y + r.h <= 100.000001, 'rectangles stay inside the bounds');
        assert.ok(r.w > 0 && r.h > 0, 'rectangles have a positive size');
    }
});

QUnit.test('drops non-positive values and handles empty input', assert => {
    assert.equal(squarify([], 0, 0, 100, 100).length, 0, 'empty input produces no rectangles');
    assert.equal(squarify([0, 0], 0, 0, 100, 100).length, 0, 'zero-sized values are ignored');
    assert.equal(squarify([10], 0, 0, 0, 100).length, 0, 'a zero-width area produces nothing');
});

/* ---- place: the datum-to-rectangle mapping ---- */

QUnit.module('place');

const data = levelData([
    { name: 'docs', path: '/docs', size: 2048, isDir: true },
    { name: 'readme.txt', path: '/readme.txt', size: 1024, isDir: false },
    { name: 'z-file', path: '/z-file', size: 256, isDir: true },
]);

QUnit.test('hands back the data it was given, with a rectangle on each', assert => {
    const placed = place(data, 0, 0, 100, 100);

    assert.equal(placed.length, 3, 'one placed datum per positive size');

    assert.deepEqual(placed.map(d => d.name), ['docs', 'readme.txt', 'z-file'],
                     'the names survive the layout, in size order');
    assert.deepEqual(placed.map(d => d.navigable), [true, false, true],
                     'so does navigability, which the layout knows nothing about');

    for (const d of placed) {
        assert.ok(d.x >= 0 && d.y >= 0, 'stays inside the origin');
        assert.ok(d.x + d.w <= 100.000001 && d.y + d.h <= 100.000001, 'stays inside the bounds');
        assert.ok(d.w > 0 && d.h > 0, 'has a positive extent');
    }
});

QUnit.test('a rectangle\'s area is the datum\'s share of the whole', assert => {
    const placed = place(data, 0, 0, 1000, 1000);
    const total = 2048 + 1024 + 256;

    for (const d of placed)
        assert.ok(Math.abs(d.w * d.h - (d.size / total) * 1000 * 1000) < 1e-6,
                  `${d.name} takes its share of the area`);
});

QUnit.test('the mapping cannot be shifted by a caller filtering its own data', assert => {
    /* this is the regression: the join used to live in the caller, which had to
       repeat place's filter and sort to stay aligned */
    const placed = place(data, 0, 0, 100, 100);

    assert.equal(placed[0].name, 'docs', 'the biggest datum is where the biggest rectangle is');
    assert.equal(placed[2].name, 'z-file', 'the smallest datum is where the smallest rectangle is');
});

QUnit.test('drops zero-sized data rather than drawing an empty rectangle', assert => {
    const withEmpty = levelData([
        { name: 'empty', path: '/empty', size: 0, isDir: true },
        { name: 'docs', path: '/docs', size: 2048, isDir: true },
    ]);

    const placed = place(withEmpty, 0, 0, 100, 100);

    assert.deepEqual(placed.map(d => d.name), ['docs']);
    assert.ok(Math.abs(placed[0].w - 100) < 1e-6, 'docs fills the width it is entitled to');
});

QUnit.test('colours still resolve after the data has been placed', assert => {
    /* slots come from the data as given; placement reorders it for drawing, and
       the colour must not follow the reorder */
    const slots = colorSlots(data);
    const placed = place(data, 0, 0, 100, 100);

    assert.equal(slots.get('docs'), 0);
    assert.deepEqual(placed.map(d => slots.get(d.name)), [0, 1, 2]);
});

QUnit.test('an empty or unusable box places nothing', assert => {
    assert.deepEqual(place(data, 0, 0, 100, 0), [], 'a zero-height area');
    assert.deepEqual(place([], 0, 0, 100, 100), [], 'no data');
});

QUnit.test('the caller\'s data is left untouched', assert => {
    const before = data.map(d => ({ ...d }));
    place(data, 0, 0, 100, 100);
    assert.deepEqual(data, before, 'placement copies rather than sorting in place');
});
