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
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { Content } from '@patternfly/react-core/dist/esm/components/Content/index.js';
import { SyncIcon } from '@patternfly/react-icons/dist/esm/icons/sync-icon';
import { AngleLeftIcon } from '@patternfly/react-icons/dist/esm/icons/angle-left-icon';
import { FolderIcon } from '@patternfly/react-icons/dist/esm/icons/folder-icon';
import { FileIcon } from '@patternfly/react-icons/dist/esm/icons/file-icon';
/* Table ships in @patternfly/react-table, which is not a dependency; pull in
   the compiled table styles and use the plain pf-v6-c-table classes instead. */
import '@patternfly/react-styles/css/components/Table/table.css';

import cockpit from 'cockpit';

import type { FileSystem, DirUsage, UsageEntry } from './gatherer.js';
import { UsageCache } from './gatherer.js';
import { Treemap } from './Treemap.jsx';
import { RingChart } from './RingChart.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';
import { FsPicker } from './FsPicker.jsx';
import { formatSize } from './format.js';

const _ = cockpit.gettext;

/* Cap the visualisations so huge directories stay readable; the aggregate
   beyond these limits is summarised rather than silently dropped. */
const DONUT_SLICES = 20;
const TABLE_ROWS = 30;

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
    const [reloadKey, setReloadKey] = useState(0);

    const current = history.length > 0 ? history[history.length - 1] : null;
    const currentPath = current?.path ?? null;

    /* load filesystem list on mount and whenever the cache is invalidated */
    useEffect(() => {
        let active = true;
        setFsLoading(true);
        cache.current.getFileSystems()
                .then(fs => {
                    if (!active)
                        return;
                    setFileSystems(fs);
                    setFsError(null);
                    setFsLoading(false);
                })
                .catch(err => {
                    if (!active)
                        return;
                    setFsError(String(err));
                    setFsLoading(false);
                });
        return () => { active = false };
    }, [reloadKey]);

    /* load directory usage when the current path changes. The `active` flag
       discards late responses so a slow scan of a previous directory cannot
       overwrite the directory the user is now looking at. */
    useEffect(() => {
        if (!currentPath) {
            setDirUsage(null);
            setDirLoading(false);
            setDirError(null);
            return;
        }
        let active = true;
        setDirLoading(true);
        setDirError(null);
        setSelected(null);
        cache.current.getDirectory(currentPath)
                .then(usage => {
                    if (!active)
                        return;
                    setDirUsage(usage);
                    setDirLoading(false);
                    if (!usage.complete)
                        setDirError(_("Some directories could not be read."));
                })
                .catch(err => {
                    if (!active)
                        return;
                    setDirError(String(err));
                    setDirLoading(false);
                });
        return () => { active = false };
    }, [currentPath, reloadKey]);

    /* Rescan drops every cached scan and reloads the visible level. */
    const refresh = () => {
        cache.current.clear();
        setReloadKey(k => k + 1);
    };

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

    /* aggregate everything past the slice cap into an "Other" slice so no
       usage is hidden in the donut */
    const donutData = entries.length > DONUT_SLICES
        ? [
            ...entries.slice(0, DONUT_SLICES).map(e => ({ name: e.name, value: e.size })),
            { name: _("Other"), value: entries.slice(DONUT_SLICES).reduce((s, e) => s + e.size, 0) },
        ]
        : entries.map(e => ({ name: e.name, value: e.size }));

    const itemCount = cockpit.ngettext("$0 item", "$0 items", entries.length).replace('$0', String(entries.length));
    const percent = (size: number) => (totalSize > 0 ? `${(size / totalSize * 100).toFixed(1)}%` : '0%');

    return (
        <Page>
            <Card>
                <CardTitle>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <span data-testid="storage-title">{current ? current.path : _("Disk Usage")}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                                variant="secondary"
                                icon={<SyncIcon />}
                                onClick={refresh}
                                isDisabled={fsLoading || dirLoading}
                                data-testid="rescan"
                            >
                                {_("Rescan")}
                            </Button>
                            {current && (
                                <Button
                                    variant="secondary"
                                    icon={<AngleLeftIcon />}
                                    onClick={goBack}
                                >
                                    {_("Back")}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardTitle>
                <CardBody>
                    {fsLoading && <Spinner size="lg" />}

                    {!fsLoading && !current && (
                        <>
                            <Content component="p" style={{ marginBottom: 16, color: 'var(--ct-color-subtle-copy)' }}>
                                {_("Select a filesystem to analyze its disk usage.")}
                            </Content>
                            <FsPicker
                                fileSystems={fileSystems}
                                onSelect={enterFs}
                                error={fsError}
                            />
                        </>
                    )}

                    {current && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
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
                                <Alert variant="warning" title={_("Scan issue")} data-testid="scan-issue">
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
                                            centerSub={itemCount}
                                        />
                                    )
                            )}

                            {!dirLoading && entries.length > 0 && (
                                <table className="pf-v6-c-table pf-m-compact" data-testid="usage-table">
                                    <caption className="pf-v6-c-table__caption pf-v6-screen-reader">
                                        {_("Directory contents")}
                                    </caption>
                                    <thead className="pf-v6-c-table__thead">
                                        <tr className="pf-v6-c-table__tr">
                                            <th className="pf-v6-c-table__th" scope="col">{_("Name")}</th>
                                            <th className="pf-v6-c-table__th pf-m-width-20" scope="col">{_("Size")}</th>
                                            <th className="pf-v6-c-table__th pf-m-width-20" scope="col">{_("% of total")}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="pf-v6-c-table__tbody">
                                        {entries.slice(0, TABLE_ROWS).map(e => (
                                            <tr className="pf-v6-c-table__tr" key={e.name}>
                                                <td className="pf-v6-c-table__td">
                                                    {e.isDir
                                                        ? (
                                                            <Button
                                                                variant="link"
                                                                isInline
                                                                icon={<FolderIcon />}
                                                                onClick={() => enterChild(e.name)}
                                                            >
                                                                {e.name}
                                                            </Button>
                                                        )
                                                        : (
                                                            <span><FileIcon /> {e.name}</span>
                                                        )}
                                                </td>
                                                <td className="pf-v6-c-table__td" style={{ textAlign: 'right' }}>
                                                    {formatSize(e.size)}
                                                </td>
                                                <td className="pf-v6-c-table__td" style={{ textAlign: 'right' }}>
                                                    {percent(e.size)}
                                                </td>
                                            </tr>
                                        ))}
                                        {entries.length > TABLE_ROWS && (
                                            <tr className="pf-v6-c-table__tr" data-testid="table-more">
                                                <td className="pf-v6-c-table__td" colSpan={3}>
                                                    {cockpit.ngettext("…and $0 more item", "…and $0 more items", entries.length - TABLE_ROWS)
                                                            .replace('$0', String(entries.length - TABLE_ROWS))}
                                                </td>
                                            </tr>
                                        )}
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
