/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core/dist/esm/components/Breadcrumb/index.js';

import type { Trail } from './trail.js';

/*
 * The crumb trail, as the user navigates by it.
 *
 * This used to take a list of pre-baked segments and a path callback, which
 * made it a pass-through: the rule for what a crumb is *called* lived in the
 * caller, so deleting this module would only have moved the JSX into the page
 * and removed nothing.
 *
 * It takes the trail instead and asks it for the crumbs, so labelling -- the
 * filesystem's mount point at the root, the directory name below it -- is the
 * trail's to answer, tested with the rest of the navigation rules. What is left
 * here is only how a crumb looks.
 */

interface Props {
    trail: Trail | null;
    onNavigate: (path: string) => void;
}

export const Breadcrumbs = ({ trail, onNavigate }: Props) => {
    if (!trail)
        return null;
    const segments = trail.segments();

    return (
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
                                        onNavigate(seg.path);
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
};
