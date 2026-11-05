/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import type { UsageEntry } from './gatherer.js';
import { bytes, type Bytes } from './paths.js';

/*
 * What a chart draws, and the one rule for colouring it.
 *
 * Before this module existed, the treemap and the ring chart each declared
 * their own datum type, their own copy of the palette, and their own rule for
 * picking a colour slot -- indexing the treemap by position in the data as
 * given, and the ring chart by position in its filtered list. The same
 * directory could therefore change colour when the view toggled, and adding a
 * fifteenth colour meant editing two components and two blocks of CSS.
 */

/* One datum shape. `navigable` is for charts what `isDir` is for the domain:
   the caller says whether there is a directory to descend into, rather than
   the chart re-deriving it from a name it knows nothing about. */
export interface ChartDatum {
    name: string;
    size: Bytes;
    /* the chart makes it clickable only when this is set */
    navigable?: boolean;
    /* aggregated rather than a real entry, e.g. the tail past the slice cap */
    synthetic?: boolean;
}

/* How many chart colours app.scss defines under --storage-chart-N. The count
   lives here; the values stay in the CSS so the dark theme can swap them. */
export const PALETTE_SLOTS = 14;

export function paletteColor(index: number): string {
    return `var(--storage-chart-${index % PALETTE_SLOTS})`;
}

/*
 * Colour slot for each datum, by position in the data as given.
 *
 * Both charts call this with the same list, so one level is the same colour
 * whichever view you look through it with. A datum's colour does not change
 * when a view filters or sorts what it is drawing.
 */
export function colorSlots(data: ChartDatum[]): Map<string, number> {
    return new Map(data.map((datum, i) => [datum.name, i]));
}

/* The entries of a level, in the order the charts will draw them. */
export function levelData(entries: UsageEntry[]): ChartDatum[] {
    return entries.map(entry => ({
        name: entry.name,
        size: entry.size,
        navigable: entry.isDir,
    }));
}

/*
 * Aggregate everything past `limit` into one synthetic slice, so a chart never
 * hides usage it is too small to draw. The tail keeps its size and therefore
 * its share of the picture; it loses the ability to be clicked, because there
 * is no single directory to descend into.
 */
export function capped(data: ChartDatum[], limit: number, otherLabel: string): ChartDatum[] {
    if (data.length <= limit)
        return data;
    const tail = data.slice(limit);
    return [
        ...data.slice(0, limit),
        {
            name: otherLabel,
            size: bytes(tail.reduce((sum, datum) => sum + datum.size, 0)),
            synthetic: true,
        },
    ];
}
