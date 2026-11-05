/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import type { Bytes } from './paths.js';

/* Large human readable byte count: bytes -> KiB/MiB/GiB/TiB. */
export function formatSize(size: Bytes): string {
    if (!Number.isFinite(size) || size <= 0)
        return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    let value: number = size;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[unit]}`;
}
