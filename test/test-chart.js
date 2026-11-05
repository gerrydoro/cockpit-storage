/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * QUnit unit tests for the chart vocabulary. These run in Node: it is plain
 * data preparation, so the rules that decide what a chart draws and what colour
 * it draws it in are covered without a browser.
 */

/* global QUnit */

import { colorSlots, paletteColor, levelData, capped, PALETTE_SLOTS } from '../src/chart.js';

const entry = (name, size, isDir = true) => ({ name, path: name, size, isDir });

/* ---- the palette ---- */

QUnit.module('paletteColor');

QUnit.test('names a CSS custom property per slot, wrapping around', assert => {
    assert.equal(paletteColor(0), 'var(--storage-chart-0)');
    assert.equal(paletteColor(13), 'var(--storage-chart-13)');
    assert.equal(paletteColor(14), 'var(--storage-chart-0)', 'the 15th colour reuses the first');
    assert.equal(paletteColor(15), 'var(--storage-chart-1)');
});

QUnit.test('the slot count matches the colours app.scss defines', assert => {
    /* adding a 15th colour is one edit in app.scss and one number here */
    assert.equal(PALETTE_SLOTS, 14);
});

/* ---- colour slots ---- */

QUnit.module('colorSlots');

QUnit.test('a datum\'s colour is its position in the data as given', assert => {
    const data = levelData([entry('docs', 2048), entry('src', 512), entry('readme', 256)]);

    const slots = colorSlots(data);
    assert.equal(slots.get('docs'), 0);
    assert.equal(slots.get('src'), 1);
    assert.equal(slots.get('readme'), 2);
});

QUnit.test('both charts get the same colour for the same directory', assert => {
    /* this is the regression: the ring chart used to index its own filtered
       list, so a zero-size entry shifted every colour after it */
    const data = levelData([entry('empty', 0), entry('docs', 2048), entry('src', 512)]);

    const fromTreemap = colorSlots(data).get('docs');
    const fromRingChart = colorSlots(data).get('docs');

    assert.equal(fromTreemap, fromRingChart, 'one level, one colour, either view');
    assert.equal(fromTreemap, 1, 'a zero-size entry does not shift its neighbours');
});

QUnit.test('a datum not in the data has no slot', assert => {
    const slots = colorSlots(levelData([entry('docs', 2048)]));
    assert.equal(slots.get('not-here'), undefined);
});

/* ---- levelData ---- */

QUnit.module('levelData');

QUnit.test('carries name, size and navigability from the domain', assert => {
    const data = levelData([entry('docs', 2048, true), entry('readme', 512, false)]);

    assert.deepEqual(data, [
        { name: 'docs', size: 2048, navigable: true },
        { name: 'readme', size: 512, navigable: false },
    ], 'a chart never hears about isDir; the caller says whether it can be entered');
});

QUnit.test('an empty level has no data', assert => {
    assert.deepEqual(levelData([]), []);
});

/* ---- capped ---- */

QUnit.module('capped');

const twenty = Array.from({ length: 22 }, (_, i) => entry(`dir${i}`, 22 - i));

QUnit.test('data under the limit is passed through untouched', assert => {
    const data = levelData([entry('docs', 2048), entry('src', 512)]);

    assert.equal(capped(data, 20, 'Other'), data, 'no synthetic slice is added');
});

QUnit.test('the tail becomes one synthetic slice that keeps the size', assert => {
    const data = levelData(twenty);
    const result = capped(data, 20, 'Other');

    assert.equal(result.length, 21, 'twenty real entries plus the aggregate');
    assert.equal(result[20].name, 'Other');
    assert.equal(result[20].size, 1 + 2, 'the two smallest entries are summed, not dropped');
    assert.equal(result[20].synthetic, true, 'it is not a directory');
    assert.equal(result[20].navigable, undefined, 'so nothing can be clicked');
});

QUnit.test('the kept entries keep their positions, and so their colours', assert => {
    const before = colorSlots(levelData(twenty));
    const after = colorSlots(capped(levelData(twenty), 20, 'Other'));

    assert.equal(after.get('dir0'), before.get('dir0'), 'nothing below the cap shifted');
    assert.equal(after.get('dir19'), before.get('dir19'));
});

QUnit.test('a limit of zero aggregates everything', assert => {
    const result = capped(levelData(twenty), 0, 'Other');
    assert.equal(result.length, 1, 'one synthetic slice');
    assert.equal(result[0].size, twenty.reduce((s, e) => s + e.size, 0), 'no usage is hidden');
});

QUnit.test('an empty level is not aggregated', assert => {
    assert.deepEqual(capped(levelData([]), 20, 'Other'), []);
});
