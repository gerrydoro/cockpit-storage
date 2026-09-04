/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React, { useEffect, useState, useRef } from 'react';
import { Page } from '@patternfly/react-core/dist/esm/components/Page/index.js';
import { Spinner } from '@patternfly/react-core/dist/esm/components/Spinner/Spinner.js';
import { Switch } from '@patternfly/react-core/dist/esm/components/Switch/Switch.js';
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Card, CardBody, CardTitle } from '@patternfly/react-core/dist/esm/components/Card/index.js';

import cockpit from 'cockpit';

import type { FileSystem, DirUsage, UsageEntry } from './gatherer.js';
import { UsageCache } from './gatherer.js';
import { Treemap } from './Treemap.jsx';
import { RingChart } from './RingChart.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';
import { FsPicker } from './FsPicker.jsx';
import { formatSize } from './format.js';

const _ = cockpit.gettext;

interface HistoryEntry {
    mount: string;
    path: string;
}

export const Application = () => {
    const cache = useRef(new UsageCache());
    const [fileSystems, setFileSystems] = useState<FileSystem[]>([]);
    const [fsLoading, setFsLoading] = useState(true);
    const [fsError, setFsError] = useState<string | null>(null);

    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [dirUsage, setDirUsage] = useState<DirUsage | null>(null);
    const [dirLoading, setDirLoading] = useState(false);
    const [dirError, setDirError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<'treemap' | 'donut'>('treemap');
    const [selected, setSelected] = useState<string | null>(null);

    const current = history.length > 0 ? history[history.length - 1] : null;
    const currentPath = current?.path ?? null;

    /* load filesystem list on mount */
    useEffect(() => {
        cache.current.getFileSystems()
                .then(fs => {
                    setFileSystems(fs);
                    setFsLoading(false);
                })
                .catch(err => {
                    setFsError(String(err));
                    setFsLoading(false);
                });
    }, []);

    /* load directory usage when current path changes */
    useEffect(() => {
        if (!currentPath) {
            setDirUsage(null);
            return;
        }
        setDirLoading(true);
        setDirError(null);
        setSelected(null);
        cache.current.getDirectory(currentPath)
                .then(usage => {
                    setDirUsage(usage);
                    setDirLoading(false);
                    if (!usage.complete)
                        setDirError('Some directories could not be read.');
                })
                .catch(err => {
                    setDirError(String(err));
                    setDirLoading(false);
                });
    }, [currentPath]);

    const enterFs = (mount: string) => {
        setHistory([{ mount, path: mount }]);
    };

    const enterChild = (name: string) => {
        if (!current)
            return;
        const childPath = current.path === '/' ? '/' + name : current.path + '/' + name;
        setHistory([...history, { mount: current.mount, path: childPath }]);
    };

    const navigateTo = (targetPath: string) => {
        if (!current)
            return;
        const idx = history.findIndex(h => h.path === targetPath);
        if (idx >= 0)
            setHistory(history.slice(0, idx + 1));
        else
            setHistory([...history, { mount: current.mount, path: targetPath }]);
    };

    const goBack = () => setHistory(h => h.slice(0, -1));

    const breadcrumbSegments = current
        ? history.map(h => ({
            label: h.path === h.mount
                ? h.mount
                : h.path.split('/').pop() ?? h.path,
            path: h.path,
        }))
        : [];

    const entries: UsageEntry[] = dirUsage?.entries ?? [];
    const totalSize = dirUsage?.size ?? 0;

    const donutData = entries.slice(0, 20).map(e => ({ name: e.name, value: e.size }));

    return (
        <Page className='pf-m-no-sidebar'>
            <Card>
                <CardTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{current ? current.path : _("Disk Usage")}</span>
                    {current && (
                        <button
onClick={goBack} style={{
    background: 'none',
    border: '1px solid #d2d2d2',
    borderRadius: 6,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 13,
}}
                        >
                            {'\u2190'} {_("Back")}
                        </button>
                    )}
                </CardTitle>
                <CardBody>
                    {fsLoading && <Spinner size="lg" />}

                    {!fsLoading && !current && (
                        <>
                            <p style={{ marginBottom: 16, color: '#6a6e73' }}>
                                {_("Select a filesystem to analyze its disk usage.")}
                            </p>
                            <FsPicker
fileSystems={fileSystems}
                                      onSelect={enterFs}
                                      error={fsError}
                            />
                        </>
                    )}

                    {current && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                                <Breadcrumbs segments={breadcrumbSegments} onNavigate={navigateTo} />
                                <Switch
                                    id="view-mode-toggle"
                                    label={_("Donut view")}
                                    aria-label={_("Toggle treemap / donut view")}
                                    isChecked={viewMode === 'donut'}
                                    onChange={(_, checked) => setViewMode(checked ? 'donut' : 'treemap')}
                                />
                            </div>

                            {dirLoading && <Spinner size="lg" />}

                            {dirError && (
                                <Alert variant="warning" title={_("Scan issue")}>
                                    {dirError}
                                </Alert>
                            )}

                            {!dirLoading && dirUsage && (
                                viewMode === 'treemap'
                                    ? (
                                        <Treemap
                                        data={entries.map(e => ({
                                            name: e.name,
                                            size: e.size,
                                            isDir: e.isDir,
                                        }))}
                                        total={totalSize}
                                        selected={selected}
                                        onSelect={(name) => {
                                            const entry = entries.find(e => e.name === name);
                                            if (entry?.isDir) {
                                                enterChild(name);
                                            } else {
                                                setSelected(name === selected ? null : name);
                                            }
                                        }}
                                        />
                                    )
                                    : (
                                        <RingChart
                                        data={donutData}
                                        centerLabel={formatSize(totalSize)}
                                        centerSub={cockpit.ngettext("$0 item", "$0 items", entries.length).replace('$0', String(entries.length))}
                                        />
                                    )
                            )}

                            {!dirLoading && entries.length > 0 && (
                                <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #d2d2d2' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>{_("Name")}</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>{_("Size")}</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>{_("% of total")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.slice(0, 30).map(e => (
                                            <tr
key={e.name}
                                                style={{ borderBottom: '1px solid #f2f2f2', cursor: e.isDir ? 'pointer' : 'default' }}
                                                onClick={e.isDir ? () => enterChild(e.name) : undefined}
                                            >
                                                <td style={{ padding: '4px 8px' }}>
                                                    {e.isDir ? '\u{1F4C1} ' : '\u{1F4C4} '}
                                                    {e.name}
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                                                    {formatSize(e.size)}
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                                                    {totalSize > 0 ? (e.size / totalSize * 100).toFixed(1) : 0}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </CardBody>
            </Card>
        </Page>
    );
};
