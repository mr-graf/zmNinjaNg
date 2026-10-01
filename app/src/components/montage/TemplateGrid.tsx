/**
 * DRAFT: renders a template layout as CSS Grid slots.
 *
 * Positioned fixed relative to the viewport so it never depends on the
 * parent height chain - that chain does not resolve to a usable height in
 * the normal (non-fullscreen) montage layout.
 */

import { useTranslation } from 'react-i18next';
import type { Layout } from 'react-grid-layout';
import { cn } from '../../lib/utils';

interface TemplateGridProps {
  layout: Layout[];
  internalCols: number;
  totalRows: number;
  /** True when the app is in fullscreen montage mode; changes the insets. */
  isFullscreen?: boolean;
  onSlotContextMenu?: (slotId: string, event: React.MouseEvent) => void;
  className?: string;
}

export function TemplateGrid({
  layout,
  internalCols,
  totalRows,
  isFullscreen = false,
  onSlotContextMenu,
  className,
}: TemplateGridProps) {
  const { t } = useTranslation();

  // The sidebar is 180px expanded / 60px collapsed on md+, 0 on mobile.
  // Rather than read that state here, we inset from the left by a CSS
  // variable the sidebar publishes... but it does not publish one. So the
  // insets below are a fixed approximation; the parent div supplies the
  // real offset via its own style prop.
  return (
    <div
      className={cn('grid absolute inset-0', className)}
      style={{
        gridTemplateColumns: `repeat(${internalCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
      }}
      data-testid="montage-template-grid"
    >
      {layout.map((item) => (
        
        <div
          key={item.i}
          className={cn(
            'flex items-center justify-center border border-dashed',
            isFullscreen
              ? 'bg-white/5 border-white/30'
              : 'bg-muted/30 border-muted-foreground/30'
          )}
          style={{
            gridColumn: `${item.x + 1} / span ${item.w}`,
            gridRow: `${item.y + 1} / span ${item.h}`,
          }}
          data-testid={`montage-template-slot-${item.i}`}
          onContextMenu={(e) => {
            e.preventDefault();
            onSlotContextMenu?.(item.i, e);
          }}
        >
          <span
            className={cn(
              'text-xs text-center leading-tight',
              isFullscreen ? 'text-white/70' : 'text-muted-foreground'
            )}
          >
            {t('montage.template_pick_camera')}
          </span>
        </div>
        
      ))}
    </div>
  );
}
