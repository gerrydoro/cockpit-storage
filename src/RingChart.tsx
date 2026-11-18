/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import { arcPath, isFullCircle } from './layout.js';
import { colorSlots, paletteColor, type ChartDatum } from './chart.js';
import { useElementSize } from './useElementSize.js';

const _ = cockpit.gettext;

interface Props {
    data: ChartDatum[];
    centerLabel: string;
    centerSub?: string;
}

/* The ring's stroke is a share of its diameter rather than a number of pixels,
   so the ring reads the same at any size it is drawn -- the page sizes it,
   which is not this module's to decide. */
const THICKNESS_RATIO = 40 / 260;

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

    /* A ring is a circle, so the shorter side of the box it is given is its
        diameter -- the box is whatever the legend below it leaves free, which
        is why the ring is measured on its own rather than as part of a box
        that also holds the legend's rows. */
    const { ref, box } = useElementSize<HTMLDivElement>();
    const size = Math.min(box.width, box.height);
    const thickness = Math.round(size * THICKNESS_RATIO);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - thickness / 2;
    const ariaLabel = total > 0
        ? `${centerLabel}${centerSub ? `, ${centerSub}` : ''}`
        : centerLabel;

    let angle = -Math.PI / 2;

    return (
        <div className="ring-chart">
            <div className="ring-chart__ring" ref={ref}>
                {size > 0 && (
                    <svg
                        width={size}
                        height={size}
                        viewBox={`0 0 ${size} ${size}`}
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
                                /* A slice that sweeps the whole circle becomes a ring:
                                    an arc with identical endpoints renders nothing. */
                                if (isFullCircle(sweep)) {
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
                )}
            </div>
            {total > 0 && (
                <ul className="ring-chart__legend">
                    {usable.map(d => (
                        <li key={d.name} data-shared={d.shared ? String(Math.round(d.shared / d.size * 100)) : undefined}>
                            <span className="ring-chart__swatch" style={{ background: colorOf(d) }} aria-hidden="true" />
                            <span className="ring-chart__name">{d.name}</span>
                            {/* A ring cannot hatch a fraction of an arc the way a
                                rectangle can, so the shared part of a slice is
                                named here rather than drawn. */}
                            {d.shared
                                ? (
                                    <span className="ring-chart__shared">
                                        {' '}{Math.round(d.shared / d.size * 100)}% {_("shared")}
                                    </span>
                                )
                                : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
