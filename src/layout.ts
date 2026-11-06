/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import type { ChartDatum } from './chart.js';

/*
 * Geometry: what a chart needs to lay itself out.
 *
 * `place` hands back the very data it was given, with coordinates attached.
 * The old interface returned rectangles carrying only a value, which left
 * matching a rectangle to the datum it belongs to in the caller's hands — the
 * caller had to repeat this module's own filter and sort, and keep them
 * identical, or every rectangle silently picked up the wrong label. The join
 * now happens in the same module that performs the sort, and is tested there.
 *
 * The ring chart's arcs are here for the same reason. They are pure
 * trigonometry with one degenerate case — a sweep covering the whole circle
 * has identical endpoints, and an SVG arc with identical endpoints draws
 * nothing — which is a rule about the shape, not about how to render it. Both
 * charts' geometry therefore runs in Node under its own tests.
 */

export interface TreemapRect {
    value: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

/* A datum with the rectangle it was placed in. */
export interface PlacedDatum extends ChartDatum {
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
 * Squarified treemap layout.
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

/*
 * Place `data` inside the box, largest first, and give each datum back its
 * rectangle. Zero-sized data is dropped rather than drawn, in both the sort and
 * the layout, so the two cannot disagree about what was placed where.
 */
export function place(
    data: ChartDatum[],
    x: number,
    y: number,
    w: number,
    h: number
): PlacedDatum[] {
    const sorted = [...data].filter(d => d.size > 0).sort((a, b) => b.size - a.size);
    const rects = squarify(sorted.map(d => d.size), x, y, w, h);

    const placed: PlacedDatum[] = [];
    for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        placed.push({ ...sorted[i], x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    }
    return placed;
}

/* ---- the ring chart's arcs ---- */

/*
 * Is `sweep` a whole circle? A slice that big cannot be drawn as an arc: its
 * end lands on its start, and SVG drops an arc whose endpoints coincide. The
 * caller draws a <circle> for that case instead.
 *
 * The epsilon is what makes the boundary a rule rather than a coincidence.
 * Sweeps are accumulated by adding each slice's share of 2π, so a full turn
 * comes back as 2π ± the last addition's own rounding error, which is rarely
 * exactly zero.
 */
export function isFullCircle(sweep: number): boolean {
    return sweep >= Math.PI * 2 - 1e-6;
}

/*
 * The SVG path for the arc swept from `start` to `end` at radius `r` around
 * (cx, cy). Angles are radians from the positive x-axis, which is where the
 * caller starts accumulating them.
 *
 * SVG has two arcs between any two points; `large-arc-flag` says which one we
 * want, and it flips exactly at a half turn. Getting it wrong draws a slice
 * that is the shape of the slice next to it.
 */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
