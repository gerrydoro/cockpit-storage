/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import type { FileSystem, MountCensus } from './gatherer.js';
import type { ChartDatum } from './chart.js';
import { Treemap } from './Treemap.jsx';
import { formatSize } from './format.js';
import { duplicatedBytes } from './sharing.js';
import type { Bytes } from './paths.js';
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { EmptyState } from '@patternfly/react-core/dist/esm/components/EmptyState/index.js';
import { FolderOpenIcon } from '@patternfly/react-icons/dist/esm/icons/folder-open-icon';

const _ = cockpit.gettext;

interface Props {
    fileSystems: FileSystem[];
    onSelect: (mount: string) => void;
    error?: string | null;
    /* the hard-link census of each mount, for the mounts that have one yet */
    censuses?: Map<string, MountCensus>;
    /* what each mount's files occupy, once each, for the card that shows it */
    mountFiles?: Map<string, Bytes>;
}

export const FsPicker = ({ fileSystems, onSelect, error, censuses, mountFiles }: Props) => {
    /* `navigable` is the chart vocabulary for "there is somewhere to go";
       picking a filesystem always is. */
    const data: ChartDatum[] = fileSystems.map(fs => ({
        name: fs.mount,
        size: fs.used,
        navigable: true,
    }));

    return (
        <>
            {error && (
                <Alert variant="warning" title={_("Could not enumerate filesystems")}>
                    {error}
                </Alert>
            )}
            {fileSystems.length === 0
                ? (
                    <EmptyState
                        variant="sm"
                        icon={FolderOpenIcon}
                        titleText={_("No mounted filesystems to analyze.")}
                        headingLevel="h4"
                    />
                )
                : (
                    <>
                        <Treemap data={data} onSelect={onSelect} />
                        <div className="fs-picker">
                            {fileSystems.map(fs => (
                                <Button
                                    key={fs.mount}
                                    variant="secondary"
                                    data-testid="filesystem"
                                    onClick={() => onSelect(fs.mount)}
                                    className="fs-picker-button"
                                >
                                    <span className="fs-picker-name">{fs.mount}</span>
                                    <span className="fs-picker-detail">
                                        {fs.device} — {fs.fstype}
                                    </span>
                                    <span className="fs-picker-detail">
                                        {formatSize(fs.used)} used / {formatSize(fs.blocks)} total ({fs.capacity}%)
                                    </span>
                                    {/* The mount has been walked for hard links
                                        and has some, and its files' size is
                                        known: the two numbers that make "how
                                        much of this is a second name for bytes
                                        the disk holds once" readable. */}
                                    {(() => {
                                        const census = censuses?.get(fs.mount);
                                        const files = mountFiles?.get(fs.mount);
                                        if (!census || !files || !census.shared.length)
                                            return null;
                                        const duplicated = duplicatedBytes(census);
                                        if (duplicated <= 0)
                                            return null;
                                        return (
                                            <span className="fs-picker-detail fs-picker-shared" data-testid="picker-shared">
                                                {formatSize(files)} {_("of files")} · {formatSize(duplicated)} {_("hardlinked copies")}
                                            </span>
                                        );
                                    })()}
                                </Button>
                            ))}
                        </div>
                    </>
                )}
        </>
    );
};
