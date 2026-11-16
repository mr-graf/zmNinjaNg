/**
 * DRAFT: renders a template layout as CSS Grid slots.
 *
 * Positioned fixed relative to the viewport so it never depends on the
 * parent height chain - that chain does not resolve to a usable height in
 * the normal (non-fullscreen) montage layout.
 */

import { useTranslation } from 'react-i18next';
import type { Layout } from 'react-grid-layout';
import { MoreVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface TemplateGridProps {
  layout: Layout[];
  internalCols: number;
  totalRows: number;
  isFullscreen?: boolean;
  templateSlots?: Record<string, string>;
  onPickSlot?: (slotId: string) => void;
  renderSlot?: (slotId: string, cacheKey: string) => React.ReactNode | null;
  onSlotContextMenu?: (slotId: string, event: React.MouseEvent) => void;
  /** DRAFT: swap the cameras in two slots. Called when a tile is dropped on
   *  another slot. */
  onSwapSlots?: (fromSlotId: string, toSlotId: string) => void;
  className?: string;
}

export function TemplateGrid({
  layout,
  internalCols,
  totalRows,
  isFullscreen = false,
  templateSlots = {},
  onPickSlot,
  renderSlot,
  onSlotContextMenu,
  className,
  onSwapSlots,
}: TemplateGridProps) {
  const { t } = useTranslation();

  console.log('[TemplateGrid props]', {
    internalCols,
    layoutLen: layout.length,
    firstItem: layout[0] ? { x: layout[0].x, w: layout[0].w, y: layout[0].y, h: layout[0].h } : null,
  });

  return (
    <div
      className={cn('grid absolute inset-0', className)}
      style={{
        gridTemplateColumns: `repeat(${internalCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
      }}
      data-testid="montage-template-grid"
    >
      {layout.map((item) => {
        const slotId = item.i;
        const monitorId = templateSlots[slotId];
        const rendered = renderSlot?.(slotId, monitorId ?? '');

        return (
          <div
            key={slotId}
            className={cn(
              'relative flex border border-dashed',
              rendered ? '' : 'items-center justify-center',
              isFullscreen
                ? 'bg-white/5 border-white/30'
                : 'bg-muted/30 border-muted-foreground/30'
            )}
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
            }}

            data-testid={`montage-template-slot-${slotId}`}
            data-monitor-id={monitorId ?? ''}
            onContextMenu={(e) => {
              e.preventDefault();
              onSlotContextMenu?.(slotId, e);
            }}
            onDragOver={(e) => {
              if (!onSwapSlots) return;
              if (e.dataTransfer.types.includes('text/slot-id')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(e) => {
              if (!onSwapSlots) return;
              const fromSlotId = e.dataTransfer.getData('text/slot-id');
              if (!fromSlotId || fromSlotId === slotId) return;
              e.preventDefault();
              onSwapSlots(fromSlotId, slotId);
            }}
          >
            {rendered ? (
              <div className="w-full h-full">
                {rendered}
              </div>
            ) : (
               <div className="w-full h-full flex items-center justify-center">
                <span
                  className={cn(
                    'text-xs text-center leading-tight px-6',
                    isFullscreen ? 'text-white/70' : 'text-muted-foreground'
                  )}
                >
                  {t('montage.template_pick_camera')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'absolute top-1 right-1 h-6 w-6',
                    isFullscreen
                      ? 'text-white hover:bg-white/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickSlot?.(slotId);
                  }}
                  title={t('montage.template_pick_camera_button')}
                  aria-label={t('montage.template_pick_camera_button')}
                  data-testid={`montage-template-slot-pick-${slotId}`}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}