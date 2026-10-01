/**
 * Montage template layouts.
 *
 * A template is a fixed arrangement: one "big" camera plus a ring of
 * identically sized small cameras that fill the rest of the grid. This is
 * a draft implementation - proportions are approximate, only the
 * top-left position with one column is built. See the issue for the
 * full template matrix.
 */

import type { Layout } from 'react-grid-layout';

/** Where the big camera sits in the grid. */
export type TemplatePosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/** A template's parameters. */
export interface TemplateConfig {
  /** Big camera position. */
  position: TemplatePosition;
  /** Number of columns the ring is split into. */
  cols: number;
  /** Number of small cameras along the bottom edge. */
  horizontal: number;
  /** Number of small cameras down the side edge. */
  vertical: number;
}

/** Draft template registry. One entry for now. */
export const TEMPLATES: Record<string, TemplateConfig> = {
  'tl-1-3-4': {
    position: 'top-left',
    cols: 1,
    horizontal: 3,
    vertical: 4,
  },
};

/**
 * Build a react-grid-layout Layout[] for a template.
 *
 * Works in grid units (columns and rows). The big camera's size is chosen so
 * that the right ring and the bottom ring end up with IDENTICAL cell sizes:
 * that is the only split where the grid is both fully filled and visually
 * symmetric. The cell shape itself depends on the container's aspect ratio -
 * on a square container the cells are square, on a wide one they are wider
 * than tall, but always uniform within the template.
 *
 * Only the top-left position is implemented in this draft.
 */
export function buildTemplateLayout(
  config: TemplateConfig,
  internalCols: number,
  totalRows: number
): Layout[] {
  const { position, cols, horizontal, vertical } = config;

  if (position !== 'top-left') {
    throw new Error(`buildTemplateLayout: position "${position}" is not implemented yet`);
  }

  // Big camera: chosen so both rings get identical cell sizes.
  // From width:  (internalCols - bigW) / cols == bigW / horizontal
  // From height: totalRows / vertical       == totalRows - bigH
  const bigW = Math.round(internalCols * horizontal / (horizontal + cols));

  // Ring cell size: width comes from the right ring's column width, height
  // from the right ring's row height. Both rings share these numbers.
  const cellW = Math.max(1, Math.floor((internalCols - bigW) / cols));
  const cellH = Math.max(1, Math.floor(totalRows / vertical));

  // Recompute bigW/bigH from the integer cell size so the layout does not
  // leave a sliver of empty track at the edges.
  const fittedBigW = internalCols - cols * cellW;
  const fittedBigH = totalRows - cellH;

  const layouts: Layout[] = [];

  layouts.push({
    i: 'big',
    x: 0,
    y: 0,
    w: fittedBigW,
    h: fittedBigH,
  });

  // Right ring: cols columns by vertical rows.
  for (let row = 0; row < vertical; row++) {
    for (let col = 0; col < cols; col++) {
      layouts.push({
        i: `right-${row * cols + col}`,
        x: fittedBigW + col * cellW,
        y: row * cellH,
        w: cellW,
        h: cellH,
      });
    }
  }

  // Bottom row: horizontal cells, shared across the big camera's width.
  const bottomCellW = Math.max(1, Math.floor(fittedBigW / horizontal));
  const fittedBottomW = bottomCellW * horizontal;

  for (let i = 0; i < horizontal; i++) {
    layouts.push({
      i: `bottom-${i}`,
      x: i * bottomCellW,
      y: fittedBigH,
      w: bottomCellW,
      h: cellH,
    });
  }

  // If fittedBottomW < fittedBigW, the last bottom cell stretches to close
  // the gap. This keeps the grid fully filled without another visible sliver.
  if (fittedBottomW < fittedBigW) {
    const last = layouts[layouts.length - 1];
    last.w += fittedBigW - fittedBottomW;
  }

  return layouts;
}
