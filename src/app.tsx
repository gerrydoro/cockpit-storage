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

import type { FileSystem, DirUsage, UsageEntry, MountCensus } from './gatherer.js';
import { UsageCache, cockpitRunner } from './gatherer.js';
import { Trail } from './trail.js';

import { Treemap } from './Treemap.jsx';
import { RingChart } from './RingChart.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';
import { FsPicker } from './FsPicker.jsx';
import { Breakdown } from './Breakdown.jsx';
import { formatSize } from './format.js';
import { capped, levelData } from './chart.js';
import { duplicatedBytes, sharingUnder, type Sharing } from './sharing.js';
import { bytes, joinPath, type Bytes } from './paths.js';

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

    /* One census per mount, shared by the picker's cards and by every
       directory inside the mount. The picker's effect walks the mounts one at
       a time -- a hard-link walk is a full traversal, and running them all at
       once on a spinning disk is slower than running them in turn. */
    const [censuses, setCensuses] = useState<Map<string, MountCensus>>(new Map());
    /* What the mount's files occupy, once each, for the card that shows it. */
    const [mountFiles, setMountFiles] = useState<Map<string, Bytes>>(new Map());
    const [censusPending, setCensusPending] = useState(false);

    const current = trail.current();
    const currentPath = current?.path ?? null;
    const currentMount = current?.mount ?? null;

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

    /* Load directory usage when the current path changes. The `active` flag
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

    /* Walk the opened mount for its hard links, so the breakdown can say which
       part of each folder is a second name for bytes already on the disk. */
    useEffect(() => {
        if (!currentMount)
            return;
        let active = true;
        setCensusPending(!censuses.has(currentMount));
        session.getCensus(currentMount)
                .then(census => {
                    if (!active)
                        return;
                    setCensuses(prev => new Map(prev).set(currentMount, census));
                    setCensusPending(false);
                })
                .catch(() => {
                    if (!active)
                        return;
                    setCensusPending(false);
                });
        return () => { active = false };
    }, [currentMount, session, censuses]);

    /* While the picker is showing, walk every mount in turn so each card can
       say how much of its usage is a hard-link copy. Entering a mount later
       reads the same walk, so this is the only place the cost is paid. */
    useEffect(() => {
        if (currentPath || fileSystems.length === 0)
            return;
        let active = true;
        setCensusPending(true);
        (async () => {
            for (const fs of fileSystems) {
                if (!active)
                    return;
                const haveCensus = censuses.has(fs.mount);
                const haveFiles = mountFiles.has(fs.mount);
                if (haveCensus && haveFiles)
                    continue;
                try {
                    /* The census and the mount's own total: the two numbers a
                       card needs to say what its files occupy once each and
                       what the copies add. Both are cached per session, and
                       the level a card leads to is scanned from them. */
                    const [census, usage] = await Promise.all([
                        session.getCensus(fs.mount),
                        session.getDirectory(fs.mount),
                    ]);
                    if (!active)
                        return;
                    setCensuses(prev => new Map(prev).set(fs.mount, census));
                    setMountFiles(prev => new Map(prev).set(fs.mount, usage.size));
                } catch {
                    /* leave this card without its hard-link line: an
                       unreadable mount is the scan's problem, not the card's */
                }
            }
            if (active)
                setCensusPending(false);
        })();
        return () => { active = false };
    }, [currentPath, fileSystems, session, censuses, mountFiles]);

    /* Rescan drops every cached scan and reloads the visible level. */
    const refresh = () => setSession(newSession());

    const enterFs = (mount: string) => setTrail(Trail.open(mount));
    const enterChild = (name: string) => setTrail(trail.openChild(name));
    const navigateTo = (path: string) => setTrail(trail.goTo(path));

    const goBack = () => setTrail(trail.back());

    const entries: UsageEntry[] = dirUsage?.entries ?? [];
    const totalSize: Bytes = dirUsage?.size ?? bytes(0);

    /* The hard-link picture of the directory being shown, and of each of its
       entries: what is reachable only from here, and what is a second name for
       bytes that also live elsewhere in the mount. */
    const census = currentMount ? censuses.get(currentMount) ?? null : null;
    const entryList = entries;
    const entrySharing: Map<string, Sharing> | null = React.useMemo(() => {
        if (!census || !currentPath)
            return null;
        const map = new Map<string, Sharing>();
        for (const entry of entryList)
            map.set(entry.name, sharingUnder(census, joinPath(currentPath, entry.name), entry.size));
        return map;
    }, [census, currentPath, entryList]);
    const directorySharing: Sharing | null = React.useMemo(() => {
        if (!census || !currentPath || !dirUsage)
            return null;
        return sharingUnder(census, currentPath, totalSize);
    }, [census, currentPath, dirUsage, totalSize]);

    /* The mount this directory belongs to, when the directory is one: `df` has
       an opinion about a whole filesystem and none about a directory in it. */
    const currentFileSystem: FileSystem | null = currentPath && currentPath === currentMount
        ? fileSystems.find(fs => fs.mount === currentMount) ?? null
        : null;

    /* Both charts draw the same prepared list, so one level is one set of
       colours and one aggregate whichever view you are in. */
    const chartData = capped(levelData(entries, entrySharing ?? undefined), DONUT_SLICES, _("Other"));

    const itemCount = cockpit.ngettext("$0 item", "$0 items", entries.length).replace('$0', String(entries.length));
    const percent = (size: number) => (totalSize > 0 ? `${(size / totalSize * 100).toFixed(1)}%` : '0%');
    /* The shared part of an entry's size: zero while the census is missing, so
       a folder whose links have not been measured reads as none rather than as
       something the module does not know. */
    const sharedFor = (name: string): Bytes => entrySharing?.get(name)?.sharedWithElsewhere ?? bytes(0);

    return (
        <Page>
            {/* the page's frame fills the sheet (see .ct-page-fill in index.html)
                and the card fills the frame, so the room left over is the
                chart's: the charts lay themselves out in the box their area is
                measured at, and the table keeps its own height */}
            <Card isFullHeight className="storage-card">
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
                <CardBody className="storage-body">
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
                                censuses={censuses}
                                mountFiles={mountFiles}
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

                            {/* What the folder costs on disk, and which part of
                                that is a second name for bytes already counted.
                                It reads the same census the charts hatch. */}
                            {(dirUsage || censusPending) && (
                                <Breakdown
                                    fileSystem={currentFileSystem}
                                    size={totalSize}
                                    sharing={directorySharing}
                                    duplicated={census && currentFileSystem ? duplicatedBytes(census) : undefined}
                                    pending={censusPending}
                                    incomplete={Boolean(census && !census.complete)}
                                />
                            )}

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
                                <div className="storage-table">
                                    <table className="pf-v6-c-table pf-m-compact" data-testid="usage-table">
                                        <caption className="pf-v6-c-table__caption pf-v6-screen-reader">
                                            {_("Directory contents")}
                                        </caption>
                                        <thead className="pf-v6-c-table__thead">
                                            <tr className="pf-v6-c-table__tr">
                                                <th className="pf-v6-c-table__th" scope="col">{_("Name")}</th>
                                                <th className="pf-v6-c-table__th pf-m-width-20" scope="col" style={{ textAlign: 'right' }}>{_("Size")}</th>
                                                <th className="pf-v6-c-table__th pf-m-width-20" scope="col" style={{ textAlign: 'right' }} title={_("Part of this folder's size that also lives under another name in the same mount")}>
                                                    {_("Shared")}
                                                </th>
                                                <th className="pf-v6-c-table__th pf-m-width-20" scope="col" style={{ textAlign: 'right' }}>{_("% of total")}</th>
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
                                                    <td className="pf-v6-c-table__td" style={{ textAlign: 'right' }} data-testid="shared-cell">
                                                        {sharedFor(e.name) > 0 ? formatSize(sharedFor(e.name)) : '—'}
                                                    </td>
                                                    <td className="pf-v6-c-table__td" style={{ textAlign: 'right' }}>
                                                        {percent(e.size)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {entries.length > TABLE_ROWS && (
                                                <tr className="pf-v6-c-table__tr" data-testid="table-more">
                                                    <td className="pf-v6-c-table__td" colSpan={4}>
                                                        {cockpit.ngettext("…and $0 more item", "…and $0 more items", entries.length - TABLE_ROWS)
                                                                .replace('$0', String(entries.length - TABLE_ROWS))}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </CardBody>
            </Card>
        </Page>
    );
};
