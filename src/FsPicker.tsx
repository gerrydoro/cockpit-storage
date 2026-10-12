/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';
import type { FileSystem } from './gatherer.js';
import { Treemap } from './Treemap.jsx';
import { formatSize } from './format.js';
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { EmptyState } from '@patternfly/react-core/dist/esm/components/EmptyState/index.js';
import { FolderOpenIcon } from '@patternfly/react-icons/dist/esm/icons/folder-open-icon';

const _ = cockpit.gettext;

interface Props {
    fileSystems: FileSystem[];
    onSelect: (mount: string) => void;
    error?: string | null;
}

export const FsPicker = ({ fileSystems, onSelect, error }: Props) => {
    const data = fileSystems.map(fs => ({
        name: fs.mount,
        size: fs.used * 1024,
        isDir: true,
    }));
    const total = fileSystems.reduce((s, fs) => s + fs.used * 1024, 0);

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
                        <Treemap data={data} total={total} onSelect={onSelect} />
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
                                        {formatSize(fs.used * 1024)} used / {formatSize(fs.blocks * 1024)} total ({fs.capacity}%)
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </>
                )}
        </>
    );
};
