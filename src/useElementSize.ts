/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2026 Red Hat, Inc.
 */

import { useEffect, useRef, useState } from 'react';

/*
 * The box an element actually occupies, in whole pixels.
 *
 * A chart draws into whatever box it is given: `place` tiles a rectangle and
 * the ring's arcs are a function of a circle, both of them pure geometry that
 * runs in Node. The one thing a chart cannot work out for itself is how big
 * that rectangle is -- a treemap scaled by its viewBox is a different shape
 * from a treemap laid out in the pixels it is drawn in. This is where that
 * answer comes from, and it is the only place in the module that looks at how
 * big the page is: the page sizes the chart's box in CSS, and this reports what
 * the browser made of it. It reports again whenever the box changes size, so a
 * window resize or a card whose room depends on how many rows the table has
 * re-lays-out the charts rather than leaving them at their old proportions.
 *
 * The box is zero until the first measurement lands. A chart that has not been
 * given a box yet has nothing to draw, and returning the element's previous
 * size instead would lay it out against a size it is about to be told to
 * forget.
 */

export interface Box {
    width: number;
    height: number;
}

export function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [box, setBox] = useState<Box>({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element)
            return;

        /* Same size is the same box: a resize that does not change this
           rectangle must not re-render the charts over it. */
        const measure = (width: number, height: number) =>
            setBox(current => (current.width === width && current.height === height
                ? current
                : { width, height }));

        const observer = new ResizeObserver(entries => {
            const rect = entries[entries.length - 1].contentRect;
            measure(Math.round(rect.width), Math.round(rect.height));
        });
        observer.observe(element);
        measure(Math.round(element.clientWidth), Math.round(element.clientHeight));

        return () => observer.disconnect();
    }, []);

    return { ref, box };
}
