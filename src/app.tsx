/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React, { useEffect, useState } from 'react';
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
import { UsageCache, cockpitRunner } from './gatherer.js';
import { Trail } from './trail.js';

import { Treemap } from './Treemap.jsx';
import { RingChart } from './RingChart.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';
import { FsPicker } from './FsPicker.jsx';
import { formatSize } from './format.js';
import { capped, levelData } from './chart.js';
import { bytes, type Bytes } from './paths.js';

const _ = cockpit.gettext;

/* Cap the visualisations so huge directories stay readable; the aggregate
   beyond these limits is summarised rather than silently dropped. */
const DONUT_SLICES = 20;
const TABLE_ROWS = 30;

/* The per-session scan cache lives in state so that replacing it is what
   reloads the effects below; the effect reads the value it depends on, so the
   "reload" a Rescan causes is visible to React and to the hooks lint. */
const newSession = () => new UsageCache(cockpitRunner());

export const Application = () => {
    const [session, setSession] = useState(newSession);
    const [fileSystems, setFileSystems] = useState<FileSystem[]>([]);
    const [fsLoading, setFsLoading] = useState(true);
    const [fsError, setFsError] = useState<string | null>(null);

    const [trail, setTrail] = useState(() => new Trail());
    const [dirUsage, setDirUsage] = useState<DirUsage | null>(null);
    const [dirLoading, setDirLoading] = useState(false);
    const [dirError, setDirError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<'treemap' | 'donut'>('treemap');
    const [selected, setSelected] = useState<string | null>(null);

    const current = trail.current();
    const currentPath = current?.path ?? null;

    /* load filesystem list on mount and whenever the cache is replaced */
    useEffect(() => {
        let active = true;
        setFsLoading(true);
        session.getFileSystems()
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
    }, [session]);

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
        session.getDirectory(currentPath)
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
    }, [currentPath, session]);

    /* Rescan drops every cached scan and reloads the visible level. */
    const refresh = () => setSession(newSession());

    const enterFs = (mount: string) => setTrail(Trail.open(mount));
    const enterChild = (name: string) => setTrail(trail.openChild(name));
    const navigateTo = (path: string) => setTrail(trail.goTo(path));

    const goBack = () => setTrail(trail.back());

    const entries: UsageEntry[] = dirUsage?.entries ?? [];
    const totalSize: Bytes = dirUsage?.size ?? bytes(0);

    /* Both charts draw the same prepared list, so one level is one set of
       colours and one aggregate whichever view you are in. */
    const chartData = capped(levelData(entries), DONUT_SLICES, _("Other"));

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
                                <Breadcrumbs
                                    trail={current ? trail : null}
                                    onNavigate={navigateTo}
                                />
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
                                            data={chartData}
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
                                            data={chartData}
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
