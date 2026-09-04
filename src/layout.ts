/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

export interface TreemapRect {
    value: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Space {
    x: number;
    y: number;
    w: number;
    h: number;
}

/*
 * Squarified treemap layout (Bruls, Huizing, van Wijk).
 * Places rectangles with low aspect ratio, sorted by size descending.
 */
export function squarify(
    values: number[],
    x: number,
    y: number,
    w: number,
    h: number
): TreemapRect[] {
    const sorted = values.filter(v => v > 0).sort((a, b) => b - a);
    const total = sorted.reduce((s, v) => s + v, 0);
    if (total <= 0 || w <= 0 || h <= 0)
        return [];

    const rects: TreemapRect[] = [];
    const area = w * h;
    const space: Space = { x, y, w, h };

    /* worst aspect ratio if `row` is laid in a strip of width `side` */
    const worst = (row: number[], side: number): number => {
        let sum = 0;
        let max = 0;
        let min = Infinity;
        for (const v of row) {
            sum += v;
            if (v > max)
                max = v;
            if (v < min)
                min = v;
        }
        if (sum === 0)
            return Infinity;
        const s2 = side * side;
        const r1 = (s2 * max) / (sum * sum);
        const r2 = (sum * sum) / (s2 * min);
        return Math.max(r1, r2);
    };

    /* lay out one row against the current smaller dimension */
    const layRow = (row: number[]) => {
        const rowSum = row.reduce((s, v) => s + v, 0);
        if (rowSum <= 0 || row.length === 0)
            return;
        if (space.w >= space.h) {
            const rowW = (rowSum / total) * area / space.h;
            let cy = space.y;
            for (const v of row) {
                const rh = (v / rowSum) * space.h;
                rects.push({ value: v, x: space.x, y: cy, w: rowW, h: rh });
                cy += rh;
            }
            space.x += rowW;
            space.w -= rowW;
        } else {
            const rowH = (rowSum / total) * area / space.w;
            let cx = space.x;
            for (const v of row) {
                const rw = (v / rowSum) * space.w;
                rects.push({ value: v, x: cx, y: space.y, w: rw, h: rowH });
                cx += rw;
            }
            space.y += rowH;
            space.h -= rowH;
        }
    };

    let i = 0;
    while (i < sorted.length) {
        if (space.w <= 0 || space.h <= 0)
            break;
        const side = Math.min(space.w, space.h);
        let prevWorst = Infinity;
        const row: number[] = [];
        let j = i;
        while (j < sorted.length) {
            const candidate = row.concat([sorted[j]]);
            const wc = worst(candidate, side);
            if (wc > prevWorst && row.length > 0)
                break;
            prevWorst = wc;
            row.push(sorted[j]);
            j++;
        }
        layRow(row);
        i = j;
    }

    return rects;
}
