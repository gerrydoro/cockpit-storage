/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import { squarify } from './layout.js';
import { formatSize } from './format.js';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';

const _ = cockpit.gettext;

interface Props {
    data: ChartDatum[];
    total: number;
    width?: number;
    height?: number;
    selected?: string | null;
    onSelect?: (name: string) => void;
}

/* Colour slots are decided by chart.js, so the treemap and the ring chart
   agree on which directory is which colour. */

export const Treemap = ({ data, total, width = 1000, height = 560, selected, onSelect }: Props) => {
    /* order the layout by size (descending), mirroring squarify's sort */
    const sorted = data
            .filter(d => d.size > 0)
            .sort((a, b) => b.size - a.size);

    const rects = squarify(sorted.map(d => d.size), 0, 0, width, height);

    const slots = colorSlots(data);

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            data-testid="treemap"
        >
            {rects.map((r, i) => {
                const datum = sorted[i];
                if (!datum)
                    return null;
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
                            x={r.x} y={r.y} width={r.w} height={r.h}
                            fill={fill}
                            opacity={isSel ? 1 : 0.85}
                            stroke={isSel ? 'var(--pf-t--global--color--brand--default)' : '#ffffff'}
                            strokeWidth={isSel ? 2 : 1}
                        />
                        {r.w > 60 && r.h > 30 && (
                            <text
                                x={r.x + 5} y={r.y + 16}
                                fontSize="14" fill="#ffffff"
                                style={{ pointerEvents: 'none' }}
                            >{datum.name}
                            </text>
                        )}
                    </g>
                );
            })}
            <text
                x={width / 2} y={height + 20} fontSize="13" fill="var(--ct-color-subtle-copy)"
                textAnchor="middle"
            >{formatSize(total)} {_("total")}
            </text>
        </svg>
    );
};
