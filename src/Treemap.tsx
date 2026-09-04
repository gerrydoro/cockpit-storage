/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import { squarify } from './layout.js';
import { formatSize } from './format.js';

const _ = cockpit.gettext;

export interface TreemapDatum {
    name: string;
    size: number;
    isDir?: boolean;
}

interface Props {
    data: TreemapDatum[];
    total: number;
    width?: number;
    height?: number;
    selected?: string | null;
    onSelect?: (name: string) => void;
}

const PALETTE = [
    '#F4A261', '#E76F51', '#2A9D8F', '#E9C46A', '#D4A0C8', '#F4845F',
    '#A8DADC', '#FFB4A2', '#B5838D', '#95D5B2', '#CDB4DB', '#FFD6A5',
    '#FCA311', '#F08080',
];

export const Treemap = ({ data, total, width = 1000, height = 560, selected, onSelect }: Props) => {
    /* order the layout by size (descending), mirroring squarify's sort */
    const sorted = data
            .filter(d => d.size > 0)
            .sort((a, b) => b.size - a.size);

    const rects = squarify(sorted.map(d => d.size), 0, 0, width, height);

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
                const idx = data.indexOf(datum);
                const fill = PALETTE[Math.abs(idx) % PALETTE.length];
                const isSel = selected === datum.name;
                return (
                    <g
key={datum.name}
                       onClick={onSelect && datum.isDir ? () => onSelect(datum.name) : undefined}
                       style={onSelect && datum.isDir ? { cursor: 'pointer' } : undefined}
                       data-testid="treemap-cell"
                    >
                        <rect
x={r.x} y={r.y} width={r.w} height={r.h}
                              fill={fill}
                              opacity={isSel ? 1 : 0.85}
                              stroke={isSel ? '#151515' : '#ffffff'}
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
x={width / 2} y={height + 20} fontSize="13" fill="#6a6e73"
                  textAnchor="middle"
            >{formatSize(total)} {_("total")}
            </text>
        </svg>
    );
};
