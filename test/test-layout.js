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

import { squarify, place, arcPath, isFullCircle } from '../src/layout.js';
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
    { name: 'docs', size: 2048, isDir: true },
    { name: 'readme.txt', size: 1024, isDir: false },
    { name: 'z-file', size: 256, isDir: true },
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
        { name: 'empty', size: 0, isDir: true },
        { name: 'docs', size: 2048, isDir: true },
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

/* ---- arcPath: the ring chart's geometry ---- */

QUnit.module('arcPath');

/* the ring chart starts accumulating angles at twelve o'clock and sweeps
   clockwise, so a slice's arc begins where the previous slice's ended */
const endpoints = (path) => {
    const m = path.match(/^M (\S+) (\S+) A \S+ \S+ 0 [01] 1 (\S+) (\S+)$/);
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
};

QUnit.test('draws one arc from the start angle to the end angle', assert => {
    /* a quarter turn from twelve o'clock, on a 40-radius ring centred at
       (100, 100): up to twelve, across to three */
    assert.equal(arcPath(100, 100, 40, -Math.PI / 2, 0), 'M 100 60 A 40 40 0 0 1 140 100');
});

QUnit.test('goes the long way round only past a half turn', assert => {
    /* the regression: SVG takes the short arc between two points unless told
       otherwise, so a slice wider than a half turn would be drawn as its
       complement -- the shape of the slice next to it */
    const half = arcPath(100, 100, 40, 0, Math.PI);
    assert.ok(half.includes('A 40 40 0 0 1'), 'a half turn is the short arc');

    const wider = arcPath(100, 100, 40, 0, Math.PI + 0.1);
    assert.ok(wider.includes('A 40 40 0 1 1'), 'past a half turn the flag flips');

    const [x1, y1, x2, y2] = endpoints(half);
    assert.equal(x1, 140, 'the arc starts at three o\'clock');
    assert.equal(y1, 100, 'level with the centre');
    assert.equal(x2, 60, 'and ends level on the far side');
    assert.equal(y2, 100, 'having gone the short way, through six o\'clock');
});

QUnit.test('slices meet end to end, so the ring closes', assert => {
    /* a gap or an overlap between two arcs leaves a visible seam between two
       colours, and the flags only mean anything if each arc continues the last */
    const shares = [0.5, 0.25, 0.125, 0.125];
    let angle = -Math.PI / 2;
    let previous = null;

    for (const share of shares) {
        const start = angle;
        angle += share * Math.PI * 2;
        const [x1, y1, x2, y2] = endpoints(arcPath(100, 100, 40, start, angle));

        if (previous)
            assert.deepEqual([x1, y1], previous, `${share} of the ring starts where the previous ended`);
        else
            assert.ok(Math.abs(x1 - 100) < 1e-9 && Math.abs(y1 - 60) < 1e-9,
                      'the ring is opened at twelve o\'clock');

        previous = [x2, y2];
    }

    assert.ok(Math.abs(previous[0] - 100) < 1e-9 && Math.abs(previous[1] - 60) < 1e-9,
              'and the last slice closes it');
});

QUnit.test('a slice owning the whole ring degenerates to a point', assert => {
    /* this is why one slice has to be drawn as a <circle>: an arc whose start
       and end coincide is dropped by SVG, so a directory holding everything
       would render as nothing at all */
    const [x1, y1, x2, y2] = endpoints(arcPath(100, 100, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2));

    assert.ok(Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9,
              'the endpoints coincide');
});

/* ---- isFullCircle ---- */

QUnit.module('isFullCircle');

QUnit.test('a turn built from shares still reads as a whole circle', assert => {
    /* a full turn is the sum of the slices' shares, and those shares add to
       one only as well as floating point allows -- so the comparison is a
       tolerance rather than an equality with two pi */
    const shares = [0.5, 0.25, 0.125, 0.125];
    const sweep = shares.reduce((total, share) => total + share * Math.PI * 2, 0);

    assert.equal(isFullCircle(sweep), true, 'one slice owning the directory is a ring');
    assert.equal(isFullCircle(Math.PI * 2 - 1e-9), true, 'a hair short of two pi still counts');
    assert.equal(isFullCircle(Math.PI * 2 - 1e-3), false, 'but a visible shortfall does not');
});

QUnit.test('anything short of a whole circle is an arc', assert => {
    assert.equal(isFullCircle(Math.PI), false, 'a half turn is the biggest arc');
    assert.equal(isFullCircle(Math.PI * 2 - 1e-3), false, 'a visible shortfall of the ring');
    assert.equal(isFullCircle(0), false, 'no slice at all');
});
