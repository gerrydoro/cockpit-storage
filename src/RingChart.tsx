/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';

export interface RingChartDatum {
    name: string;
    value: number;
}

interface Props {
    data: RingChartDatum[];
    centerLabel: string;
    centerSub?: string;
    size?: number;
    thickness?: number;
}

/* Colors are CSS custom properties defined in app.scss, so the dark theme
   swaps in darker shades while the labels keep using theme-aware colors. */
const PALETTE = Array.from({ length: 14 }, (_, i) => `var(--storage-chart-${i})`);

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export const RingChart = ({ data, centerLabel, centerSub, size = 260, thickness = 40 }: Props) => {
    const usable = data.filter(d => d.value > 0);
    const total = usable.reduce((s, d) => s + d.value, 0);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - thickness / 2;

    let angle = -Math.PI / 2;

    return (
        <div style={{ textAlign: 'center' }}>
            <svg
viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size, height: 'auto' }}
                 data-testid="donut"
            >
                {total <= 0
                    ? (
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--pf-t--global--border--color--default)" strokeWidth={thickness} />
                    )
                    : usable.map((d, i) => {
                        const start = angle;
                        const sweep = (d.value / total) * Math.PI * 2;
                        angle += sweep;
                        return (
                            <path
key={d.name}
                              d={arcPath(cx, cy, r, start, angle)}
                              fill="none"
                              stroke={PALETTE[i % PALETTE.length]}
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
                    {usable.map((d, i) => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                            <span style={{
                                width: 12,
                                height: 12,
                                background: PALETTE[i % PALETTE.length],
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
