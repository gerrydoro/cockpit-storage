/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';

interface BreadcrumbSegment {
    label: string;
    path: string;
}

interface Props {
    segments: BreadcrumbSegment[];
    onNavigate: (path: string) => void;
}

export const Breadcrumbs = ({ segments, onNavigate }: Props) => (
    <nav aria-label="breadcrumb" style={{ marginBottom: 16 }}>
        <ol style={{ display: 'flex', flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0, gap: 4 }}>
            {segments.map((seg, i) => {
                const isLast = i === segments.length - 1;
                return (
                    <li key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {i > 0 && <span aria-hidden="true" style={{ color: '#6a6e73' }}>/</span>}
                        {isLast
                            ? (
                                <span aria-current="page" style={{ fontWeight: 600, color: '#151515' }}>
                                    {seg.label}
                                </span>
                            )
                            : (
                                <a
href="#" onClick={(e) => { e.preventDefault(); onNavigate(seg.path) }}
                               style={{ color: '#0066cc', textDecoration: 'none' }}
                                >
                                    {seg.label}
                                </a>
                            )}
                    </li>
                );
            })}
        </ol>
    </nav>
);
