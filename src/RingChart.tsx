/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';

interface Props {
    data: ChartDatum[];
    centerLabel: string;
    centerSub?: string;
    size?: number;
    thickness?: number;
}

/* Colour slots are decided by chart.js, so the treemap and the ring chart
   agree on which directory is which colour. */

/* Two points closer than this are treated as identical; an SVG arc whose
   endpoints coincide is dropped entirely, so a 100% slice needs a <circle>. */
const FULL_CIRCLE_EPSILON = 1e-6;

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export const RingChart = ({ data, centerLabel, centerSub, size = 260, thickness = 40 }: Props) => {
    /* Slots come from the data as given, exactly as the treemap takes them:
       a zero-size datum is skipped here but does not shift anyone else's
       colour. */
    const slots = colorSlots(data);
    const colorOf = (datum: ChartDatum) => paletteColor(slots.get(datum.name) ?? 0);
    const usable = data.filter(d => d.size > 0);
    const total = usable.reduce((s, d) => s + d.size, 0);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - thickness / 2;
    const ariaLabel = total > 0
        ? `${centerLabel}${centerSub ? `, ${centerSub}` : ''}`
        : centerLabel;

    let angle = -Math.PI / 2;

    return (
        <div style={{ textAlign: 'center' }}>
            <svg
                viewBox={`0 0 ${size} ${size}`}
                style={{ width: '100%', maxWidth: size, height: 'auto' }}
                role="img"
                aria-label={ariaLabel}
                data-testid="donut"
            >
                {total <= 0
                    ? (
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth={thickness} />
                    )
                    : usable.map((d) => {
                        const start = angle;
                        const sweep = (d.size / total) * Math.PI * 2;
                        angle += sweep;
                        /* A single slice sweeps the full circle; an arc with
                           identical endpoints renders nothing, so draw a ring. */
                        if (sweep >= Math.PI * 2 - FULL_CIRCLE_EPSILON) {
                            return (
                                <circle
                                    key={d.name}
                                    cx={cx} cy={cy} r={r}
                                    fill="none"
                                    stroke={colorOf(d)}
                                    strokeWidth={thickness}
                                />
                            );
                        }
                        return (
                            <path
                                key={d.name}
                                d={arcPath(cx, cy, r, start, angle)}
                                fill="none"
                                stroke={colorOf(d)}
                                strokeWidth={thickness}
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
