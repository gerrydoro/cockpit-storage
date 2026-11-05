/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core/dist/esm/components/Breadcrumb/index.js';

import type { TrailSegment } from './trail.js';

interface Props {
    segments: TrailSegment[];
    onNavigate: (segment: TrailSegment) => void;
}

export const Breadcrumbs = ({ segments, onNavigate }: Props) => (
    <Breadcrumb>
        {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
                <BreadcrumbItem
                    key={seg.path}
                    render={({ className, ariaCurrent }) => isLast
                        ? <span className={className} aria-current={ariaCurrent}>{seg.label}</span>
                        : (
                            <a
                                className={className}
                                href="#"
                                onClick={e => {
                                    e.preventDefault();
                                    onNavigate(seg);
                                }}
                            >
                                {seg.label}
                            </a>
                        )}
                />
            );
        })}
    </Breadcrumb>
);
