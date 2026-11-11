/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import React from 'react';
import cockpit from 'cockpit';

import type { Counterpart, Sharing } from './sharing.js';
import { ELSEWHERE } from './sharing.js';
import type { FileSystem } from './gatherer.js';
import { formatSize } from './format.js';
import { bytes, type Bytes } from './paths.js';

const _ = cockpit.gettext;

/*
 * What a folder costs on disk, and which part of it is a second name for
 * bytes that are already there.
 *
 * `du` reports the space a folder occupies, which is the number the charts
 * draw. Two folders holding the same file each report it in full, so those
 * numbers add up to more than the disk holds -- and the only way to see it is
 * to split the number into the part nothing else reaches and the part that
 * also lives under another name. This strip is where that split is read off;
 * the arithmetic is in sharing.ts, the names come from the census.
 *
 * On a filesystem there is a second question the strip answers: what the
 * filesystem says it has allocated, next to what its files account for. Those
 * are different numbers on every filesystem here, and the difference has
 * ordinary causes (metadata, reserved blocks, other subvolumes on the same
 * device) that are worth one honest line rather than a silent mismatch.
 */

interface Props {
    /* the filesystem this directory is, when it is one: `df` only has an
       opinion about a whole filesystem, never about a directory */
    fileSystem?: FileSystem | null;
    /* what `du` reports for the directory being shown */
    size: Bytes;
    /* the hard-link picture of that directory, once the census has it */
    sharing: Sharing | null;
    /* bytes that exist more than once inside the mount, for the mount's own bar */
    duplicated?: Bytes | undefined;
    /* the census is still walking */
    pending?: boolean;
    /* the census could not read everything, so sharing is unknown, not zero */
    incomplete?: boolean;
}

/* How to name the counterpart the census could not place in a folder. */
const elsewhereName = () => _("elsewhere on this device");

const counterpartLabel = (counterpart: Counterpart): string =>
    counterpart.name === ELSEWHERE ? elsewhereName() : counterpart.name;

const counterpartList = (counterparts: Counterpart[]): string =>
    counterparts.slice(0, 3).map(counterpartLabel)
            .join(', ') +
    (counterparts.length > 3 ? `, +${counterparts.length - 3}` : '');

export const Breakdown = ({ fileSystem, size, sharing, duplicated, pending, incomplete }: Props) => {
    /* On a filesystem the bar is "counted once" against "every copy": that is
       the difference between what the folders add up to and what the disk
       holds. Anywhere else it is "only here" against "also linked elsewhere",
       which is what the folder would free if it were deleted. */
    const extra = fileSystem && duplicated ? duplicated : sharing?.sharedWithElsewhere ?? bytes(0);
    const base = bytes(size - extra);
    const baseLabel = fileSystem && duplicated
        ? _("of files, counted once")
        : _("only here");
    const residual = fileSystem ? bytes(fileSystem.used - size) : bytes(0);
    /* What the filesystem reports as used, next to what its files account for.
       The difference is ordinary on every filesystem here: metadata and
       reserved blocks the files do not cover, and on a btrfs device whatever
       else is stored on it. Shown as an amount with the direction in the label,
       because formatSize reports a negative count as 0 B. */
    const residualLabel = residual > 0 ? _("not attributable to files") : _("more than the filesystem reports");
    const hasSharing = extra > 0;
    const showBar = hasSharing && sharing !== null;

    return (
        <div className="breakdown" data-testid="breakdown">
            {fileSystem && (
                <div className="breakdown-head">
                    <span className="breakdown-number" data-testid="breakdown-allocated">
                        {formatSize(fileSystem.used)}
                    </span>
                    <span className="breakdown-label">{_("allocated on disk")}</span>
                    <span className="breakdown-sep" aria-hidden="true">·</span>
                    <span className="breakdown-number" data-testid="breakdown-files">
                        {formatSize(size)}
                    </span>
                    <span className="breakdown-label">{_("of files")}</span>
                    {residual !== 0 && (
                        <>
                            <span className="breakdown-sep" aria-hidden="true">·</span>
                            <span className="breakdown-number breakdown-muted" data-testid="breakdown-residual">
                                {formatSize(bytes(Math.abs(residual)))}
                            </span>
                            <span className="breakdown-label breakdown-muted">{residualLabel}</span>
                        </>
                    )}
                </div>
            )}

            {pending && (
                <div className="breakdown-note" data-testid="breakdown-pending">
                    {_("Measuring hard links…")}
                </div>
            )}

            {!pending && incomplete && (
                <div className="breakdown-note" data-testid="breakdown-incomplete">
                    {_("Hard links could not be measured everywhere, so the split below may understate sharing.")}
                </div>
            )}

            {showBar && (
                <>
                    <div className="breakdown-bar" role="presentation">
                        <div
                            className="breakdown-bar-base"
                            style={{ inlineSize: `${(base / size * 100).toFixed(2)}%` }}
                            data-testid="breakdown-base"
                            data-bytes={String(Math.round(base))}
                        />
                        <div
                            className="breakdown-bar-extra"
                            style={{ inlineSize: `${(extra / size * 100).toFixed(2)}%` }}
                            data-testid="breakdown-extra"
                            data-bytes={String(Math.round(extra))}
                            data-counterparts={counterpartList(sharing?.counterparts ?? [])}
                        />
                    </div>
                    <div className="breakdown-legend">
                        <span>
                            <span className="breakdown-swatch breakdown-swatch-base" aria-hidden="true" />
                            {formatSize(base)} {baseLabel}
                        </span>
                        <span>
                            <span className="breakdown-swatch breakdown-swatch-extra" aria-hidden="true" />
                            {formatSize(extra)}{' '}
                            {fileSystem && duplicated
                                ? _("hardlinked copies, occupying the disk once")
                                : _("also linked elsewhere")}
                            {sharing && sharing.counterparts.length > 0 && (
                                <span className="breakdown-muted">
                                    {' '}({counterpartList(sharing.counterparts)})
                                </span>
                            )}
                        </span>
                    </div>
                </>
            )}

            {!pending && !showBar && !fileSystem && (
                <div className="breakdown-note" data-testid="breakdown-clean">
                    {_("Nothing here is also linked from outside this folder.")}
                </div>
            )}
        </div>
    );
};
