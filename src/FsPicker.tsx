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
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";

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
                    <p>{_("No mounted filesystems to analyze.")}</p>
                )
                : (
                    <>
                        <Treemap data={data} total={total} onSelect={onSelect} />
                        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            {fileSystems.map(fs => (
                                <button
                                    key={fs.mount}
                                    data-testid="filesystem"
                                    onClick={() => onSelect(fs.mount)}
                                    style={{
                                        background: '#f2f2f2',
                                        border: '1px solid #d2d2d2',
                                        borderRadius: 8,
                                        padding: '8px 16px',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>{fs.mount}</span>
                                    <span style={{ color: '#6a6e73', fontSize: 12 }}>
                                        {fs.device} — {fs.fstype}
                                    </span>
                                    <span style={{ color: '#6a6e73', fontSize: 12 }}>
                                        {formatSize(fs.used * 1024)} used / {formatSize(fs.blocks * 1024)} total ({fs.capacity}%)
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
        </>
    );
};
