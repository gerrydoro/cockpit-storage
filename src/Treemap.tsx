/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import { place } from './layout.js';
import { formatSize } from './format.js';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';

const _ = cockpit.gettext;

/* The treemap scales to its container, so this is only the coordinate system
   the layout works in -- never a size a caller has to pass. */
const WIDTH = 1000;
const HEIGHT = 560;
/* Room for the caption, which is drawn below the area rather than inside it. */
const CAPTION_HEIGHT = 24;

interface Props {
    data: ChartDatum[];
    selected?: string | null;
    onSelect?: (name: string) => void;
}

export const Treemap = ({ data, selected, onSelect }: Props) => {
    /* The layout hands each datum back with its rectangle, so nothing here has
       to repeat its filter or its sort, or match a rectangle to a datum by
       position. */
    const placed = place(data, 0, 0, WIDTH, HEIGHT);

    /* Colour slots are decided by chart.js, so the treemap and the ring chart
       agree on which directory is which colour. */
    const slots = colorSlots(data);

    /* The caption reports what was actually laid out, so it cannot disagree
       with the areas it labels. */
    const drawnTotal = placed.reduce((sum, datum) => sum + datum.size, 0);

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT + CAPTION_HEIGHT}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            data-testid="treemap"
        >
            {placed.map(datum => {
                const fill = paletteColor(slots.get(datum.name) ?? 0);
                const isSel = selected === datum.name;
                const clickable = Boolean(onSelect && datum.navigable);
                const activate = () => onSelect?.(datum.name);
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
                    >
                        <rect
                            x={datum.x} y={datum.y} width={datum.w} height={datum.h}
                            fill={fill}
                            opacity={isSel ? 1 : 0.85}
                            stroke={isSel ? 'var(--pf-t--global--color--brand--default)' : '#ffffff'}
                            strokeWidth={isSel ? 2 : 1}
                        />
                        {datum.w > 60 && datum.h > 30 && (
                            <text
                                x={datum.x + 5} y={datum.y + 16}
                                fontSize="14" fill="#ffffff"
                                style={{ pointerEvents: 'none' }}
                            >{datum.name}
                            </text>
                        )}
                    </g>
                );
            })}
            <text
                x={WIDTH / 2} y={HEIGHT + 18} fontSize="13" fill="var(--ct-color-subtle-copy)"
                textAnchor="middle"
            >{formatSize(drawnTotal)} {_("total")}
            </text>
        </svg>
    );
};
