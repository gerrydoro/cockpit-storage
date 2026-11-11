/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import { place } from './layout.js';
import { formatSize } from './format.js';
import { bytes } from './paths.js';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';
import { useElementSize } from './useElementSize.js';

const _ = cockpit.gettext;

/* Room for the caption, which is drawn below the area rather than inside it.
   That is the only constant left here: the treemap's own size comes from the
   box the page gives it, because the layout is done in the pixels it is drawn
   in rather than into a fixed coordinate system that is then scaled. */
const CAPTION_HEIGHT = 24;

/* Hatch the shared part of a cell with, so "this much is also linked
   elsewhere" reads without a number being printed on the rectangle. The
   stripes are drawn in the cell's own colour rather than white so they read as
   the same entry, not as a different one laid over it. */
const HATCH_ID = 'treemap-shared-hatch';

interface Props {
    data: ChartDatum[];
    selected?: string | null;
    onSelect?: (name: string) => void;
}

export const Treemap = ({ data, selected, onSelect }: Props) => {
    /* The box this treemap fills, measured from the element the page sized in
       CSS. It is zero on the first pass, and a box of zero draws nothing. */
    const { ref, box } = useElementSize<HTMLDivElement>();
    const width = box.width;
    const height = box.height;

    /* The layout hands each datum back with its rectangle, so nothing here has
       to repeat its filter or its sort, or match a rectangle to a datum by
       position. */
    const placed = place(data, 0, 0, width, Math.max(0, height - CAPTION_HEIGHT));

    /* Colour slots are decided by chart.js, so the treemap and the ring chart
       agree on which directory is which colour. */
    const slots = colorSlots(data);

    /* The caption reports what was actually laid out, so it cannot disagree
       with the areas it labels. */
    const drawnTotal: number = placed.reduce((sum, datum) => sum + datum.size, 0);

    return (
        <div className="treemap" ref={ref}>
            {width > 0 && height > 0 && (
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ display: 'block' }}
                    data-testid="treemap"
                >
                    <defs>
                        <pattern
                            id={HATCH_ID}
                            patternUnits="userSpaceOnUse"
                            width="7"
                            height="7"
                            patternTransform="rotate(45)"
                        >
                            <rect width="7" height="7" fill="transparent" />
                            <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeWidth="2.5" opacity="0.5" />
                        </pattern>
                    </defs>
                    {placed.map(datum => {
                        const fill = paletteColor(slots.get(datum.name) ?? 0);
                        const isSel = selected === datum.name;
                        const clickable = Boolean(onSelect && datum.navigable);
                        const activate = () => onSelect?.(datum.name);

                        /* A cell's area is its size, so the part of it that is
                           a second name for bytes counted elsewhere is a
                           fraction of its width: the stripes cover exactly the
                           share of the cell that would not be freed by
                           deleting the folder. */
                        const shared = datum.shared ?? 0;
                        const share = datum.size > 0 ? shared / datum.size : 0;
                        const sharedW = share > 0 ? Math.round(datum.w * share) : 0;

                        return (
                            <g
                                key={datum.name}
                                role={clickable ? 'button' : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                aria-label={`${datum.name}, ${formatSize(datum.size)}`}
                                onClick={clickable ? activate : undefined}
                                onKeyDown={clickable
                                    ? e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            activate();
                                        }
                                    }
                                    : undefined}
                                style={clickable ? { cursor: 'pointer' } : undefined}
                                data-testid="treemap-cell"
                                data-shared={sharedW > 0 ? String(Math.round(share * 100)) : undefined}
                            >
                                <rect
                                    x={datum.x} y={datum.y} width={datum.w} height={datum.h}
                                    fill={fill}
                                    opacity={isSel ? 1 : 0.85}
                                    stroke={isSel ? 'var(--pf-t--global--color--brand--default)' : '#ffffff'}
                                    strokeWidth={isSel ? 2 : 1}
                                />
                                {sharedW > 0 && (
                                    <rect
                                        x={datum.x} y={datum.y} width={sharedW} height={datum.h}
                                        fill={`url(#${HATCH_ID})`}
                                        pointerEvents="none"
                                    />
                                )}
                                {datum.w > 60 && datum.h > 30 && (
                                    <text
                                        x={datum.x + 5} y={datum.y + 16} fontSize="14" fill="#ffffff"
                                        style={{ pointerEvents: 'none' }}
                                    >{datum.name}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    <text
                        x={width / 2} y={height - 6} fontSize="13" fill="var(--ct-color-subtle-copy)"
                        textAnchor="middle"
                    >{formatSize(bytes(drawnTotal))} {_("total")}
                    </text>
                </svg>
            )}
        </div>
    );
};
