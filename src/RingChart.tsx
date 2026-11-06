/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import { arcPath, isFullCircle } from './layout.js';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';

interface Props {
    data: ChartDatum[];
    centerLabel: string;
    centerSub?: string;
}

/* The ring scales to its container, so these are only the coordinate system
   the arcs are computed in -- never sizes a caller has to pass. */
const SIZE = 260;
const THICKNESS = 40;

/* Colour slots are decided by chart.js, so the treemap and the ring chart
   agree on which directory is which colour. */

export const RingChart = ({ data, centerLabel, centerSub }: Props) => {
    /* Slots come from the data as given, exactly as the treemap takes them:
       a zero-size datum is skipped here but does not shift anyone else's
       colour. */
    const slots = colorSlots(data);
    const colorOf = (datum: ChartDatum) => paletteColor(slots.get(datum.name) ?? 0);
    const usable = data.filter(d => d.size > 0);
    const total = usable.reduce((s, d) => s + d.size, 0);
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE / 2 - THICKNESS / 2;
    const ariaLabel = total > 0
        ? `${centerLabel}${centerSub ? `, ${centerSub}` : ''}`
        : centerLabel;

    let angle = -Math.PI / 2;

    return (
        <div style={{ textAlign: 'center' }}>
            <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                style={{ width: '100%', maxWidth: SIZE, height: 'auto' }}
                role="img"
                aria-label={ariaLabel}
                data-testid="donut"
            >
                {total <= 0
                    ? (
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth={THICKNESS} />
                    )
                    : usable.map((d) => {
                        const start = angle;
                        const sweep = (d.size / total) * Math.PI * 2;
                        angle += sweep;
                        /* A slice that sweeps the whole circle becomes a ring:
                           an arc with identical endpoints renders nothing. */
                        if (isFullCircle(sweep)) {
                            return (
                                <circle
                                    key={d.name}
                                    cx={cx} cy={cy} r={r}
                                    fill="none"
                                    stroke={colorOf(d)}
                                    strokeWidth={THICKNESS}
                                />
                            );
                        }
                        return (
                            <path
                                key={d.name}
                                d={arcPath(cx, cy, r, start, angle)}
                                fill="none"
                                stroke={colorOf(d)}
                                strokeWidth={THICKNESS}
                            />
                        );
                    })}
                <text
                    x={cx} y={cy - (centerSub ? 2 : 6)} textAnchor="middle" fontSize="18"
                    fontWeight="bold" fill="var(--ct-color-text)"
                >{centerLabel}
                </text>
                {centerSub && (
                    <text x={cx} y={cy + 16} textAnchor="middle" fontSize="12" fill="var(--ct-color-subtle-copy)">{centerSub}</text>
                )}
            </svg>
            {total > 0 && (
                <div style={{ marginTop: 16 }}>
                    {usable.map(d => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 12,
                                    height: 12,
                                    background: colorOf(d),
                                    display: 'inline-block'
                                }}
                            />
                            <span>{d.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
