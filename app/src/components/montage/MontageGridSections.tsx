/**
 * Montage grid rendering: All-mode per-profile error strips, and the
 * grouped/ungrouped tile grid with its stream-cap overflow message.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { NavigateFunction } from 'react-router-dom';
import GridLayout from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { Profile, ProfileId } from '../../api/types';
import type { ProfileError } from '../../api/scoped-types';
import type { MonitorFeedFit } from '../../stores/settings';
import { Button } from '../ui/button';
import { ErrorBanner } from '../ui/query-state';
import { resolveQueryError } from '../../lib/query/query-error';
import { handleKeyClick } from '../../lib/tv/tv-a11y';
import { cn } from '../../lib/utils';
import { GRID_LAYOUT } from '../../lib/zmninja-ng-constants';
import { MontageMonitor } from '../monitors/MontageMonitor';
import { MontageTileErrorBoundary } from './MontageTileErrorBoundary';
import { ProfileSectionList } from '../profiles/ProfileSectionList';
import { internalColsForCols, tileIdFor, type MontageTileMonitorData } from './hooks/useMontageGrid';
import { TemplateGrid } from './TemplateGrid';
import { TemplateSlotPicker } from './TemplateSlotPicker';
import { monitorCacheKey } from '../../stores/monitors';
import type { MonitorRef } from '../../stores/dashboard';


export interface MontageTileItem extends MontageTileMonitorData {
  profileChip?: string;
}

export type MontageGroupedSections = Array<
  [ProfileId, { profileName: string; items: MontageTileItem[] }]
>;

interface MontageErrorStripsProps {
  errors: ProfileError[];
  onRetry: (profileId: ProfileId) => void;
}

export function MontageErrorStrips({ errors, onRetry }: MontageErrorStripsProps) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;
  return (
    <div className="space-y-2 px-2 pt-2 sm:px-3">
      {errors.map((err) => (
        <div
          key={err.profileId}
          className="flex items-center gap-2"
          data-testid={`profile-error-strip-${err.profileId}`}
        >
          <ErrorBanner
            className="flex-1"
            message={`${err.profileName}: ${resolveQueryError(err.error, t, { fallbackKey: 'monitors.failed_to_load' })}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetry(err.profileId)}
            data-testid={`profile-error-strip-retry-${err.profileId}`}
          >
            {t('common.retry')}
          </Button>
        </div>
      ))}
    </div>
  );
}

interface MontageGridSectionsProps {
  cappedMonitors: MontageTileItem[];
  groupedSections: MontageGroupedSections | null;
  scopeId: ProfileId | null;
  allMonitors?: Array<{ profileId?: ProfileId; item: MontageTileMonitorData }>;
  activeTemplate?: string | null;
  templateSlots?: Record<string, string>;
  onTemplateSlotsChange?: (next: Record<string, string>) => void;
  scrollRect?: { top: number; left: number; width: number; height: number };
  layout: Layout[];
  gridCols: number;
  isEditMode: boolean;
  overflowCount: number;
  onLayoutChange: (nextLayout: Layout[]) => void;
  onDragStop: (nextLayout: Layout[], oldItem: Layout, newItem: Layout) => void;
  onResizeStop: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
  navigate: NavigateFunction;
  isFullscreen: boolean;
  isTvMode: boolean;
  focusedMonitorIndex: number;
  showMonitorLabels: boolean;
  objectFit: MonitorFeedFit;
  accessToken: string | null;
  isMonitorPinned: (tileId: string) => boolean;
  onPinToggle: (tileId: string) => void;
  resolveOwnerProfile: (profileId: ProfileId | undefined) => Profile | null;
  resolveNewEventCount: (item: MontageTileItem) => number | undefined;
  resolveNewestEventAt: (item: MontageTileItem) => string | null | undefined;
  reduceStream: boolean;
  paused: boolean;
  isTileGated: (tileId: string) => boolean;
  registerTile: (tileId: string) => (el: HTMLElement | null) => void;
  forceViewMode?: 'streaming' | 'snapshot';
}

export function MontageGridSections({
  cappedMonitors,
  groupedSections,
  scopeId,
  activeTemplate,
  templateSlots,
  onTemplateSlotsChange,
  scrollRect,
  layout,
  gridCols,
  isEditMode,
  overflowCount,
  onLayoutChange,
  onDragStop,
  onResizeStop,
  navigate,
  isFullscreen,
  isTvMode,
  focusedMonitorIndex,
  showMonitorLabels,
  objectFit,
  accessToken,
  isMonitorPinned,
  onPinToggle,
  resolveOwnerProfile,
  resolveNewEventCount,
  resolveNewestEventAt,
  reduceStream,
  paused,
  isTileGated,
  registerTile,
  forceViewMode,
  allMonitors,
}: MontageGridSectionsProps) {
  const { t } = useTranslation();

  const [pickingSlotId, setPickingSlotId] = useState<string | null>(null);

  const layoutByTileId = new Map(layout.map((item) => [item.i, item]));

  const pickedRefs: MonitorRef[] = Object.entries(templateSlots ?? {}).map(
    ([, cacheKey]) => {
      const tile = cappedMonitors.find((m) => String(m.Monitor.Id) === cacheKey);
      if (tile) {
        return { profileId: tile.profileId as MonitorRef['profileId'], monitorId: tile.Monitor.Id };
      }
      const idx = cacheKey.indexOf(':');
      if (idx === -1) {
        return { profileId: (scopeId ?? '') as MonitorRef['profileId'], monitorId: cacheKey };
      }
      return {
        profileId: cacheKey.slice(0, idx) as MonitorRef['profileId'],
        monitorId: cacheKey.slice(idx + 1),
      };
    },
  );

  const liveSlots = templateSlots ?? {};

  const currentPick = pickingSlotId && templateSlots?.[pickingSlotId]
    ? pickedRefs.find(
        (ref) => monitorCacheKey(ref.profileId, ref.monitorId) === templateSlots[pickingSlotId],
      ) ?? null
    : null;

  // Every pick except the current slot's own: those are the monitors the
  // picker must disable, since a template slot holds one camera. Compare by
  // monitor id alone, the same key the slot map stores, because in single
  // mode monitorCacheKey would prepend a profileId the slot map never has.
  const otherPicks = Object.entries(templateSlots ?? {})
    .filter(([slotId]) => slotId !== pickingSlotId)
    .map(([, cacheKey]) => {
      const idx = cacheKey.indexOf(':');
      return idx === -1
        ? { profileId: (scopeId ?? '') as MonitorRef['profileId'], monitorId: cacheKey }
        : {
            profileId: cacheKey.slice(0, idx) as MonitorRef['profileId'],
            monitorId: cacheKey.slice(idx + 1),
          };
    });

  const handleSwapSlots = (fromSlotId: string, toSlotId: string) => {
    const fromKey = templateSlots?.[fromSlotId];
    const toKey = templateSlots?.[toSlotId];
    const next = { ...(templateSlots ?? {}) };
    if (toKey) {
      next[fromSlotId] = toKey;
    } else {
      delete next[fromSlotId];
    }
    if (fromKey) {
      next[toSlotId] = fromKey;
    } else {
      delete next[toSlotId];
    }
    onTemplateSlotsChange?.(next);
  };

  const handlePick = (pick: MonitorRef | null) => {
    if (!pickingSlotId) return;
    const next = { ...(templateSlots ?? {}) };
    if (pick) {
      const newKey = pick.profileId === (scopeId ?? '')
        ? String(pick.monitorId)
        : monitorCacheKey(pick.profileId, pick.monitorId);
      next[pickingSlotId] = newKey;
    } else {
      delete next[pickingSlotId];
    }
    onTemplateSlotsChange?.(next);
    setPickingSlotId(null);
  };

  const globalIndexByTileId = new Map(cappedMonitors.map((item, i) => [tileIdFor(item), i]));
  
  console.log('[MontageGridSections] render, scopeId:', scopeId, 'gridCols:', gridCols, 'internalCols:', internalColsForCols(gridCols));
  const sharedGridLayoutProps = {
    cols: internalColsForCols(gridCols),
    rowHeight: GRID_LAYOUT.montageRowHeight,
    margin: [0, 0] as [number, number],
    containerPadding: [0, 0] as [number, number],
    compactType: activeTemplate ? ('horizontal' as const) : ('vertical' as const),
    preventCollision: true,
    isResizable: isEditMode,
    isDraggable: isEditMode,
    resizeHandles: ['se', 'sw', 'ne', 'nw'] as Array<'s' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne'>,
    draggableCancel: '.pin-locked,.no-drag',
    onLayoutChange,
    onDragStop,
    onResizeStop,
  };

  const renderTile = (item: MontageTileItem): ReactNode => {
  console.log('[renderTile] scopeId:', scopeId, 'tileId:', tileIdFor(item));
    const { Monitor, Monitor_Status, profileId, profileChip } = item;
    const tileId = tileIdFor(item);
    const idx = globalIndexByTileId.get(tileId) ?? -1;
    const ownerProfile = resolveOwnerProfile(profileId);
    return (
      <div
	key={`${scopeId}-${tileId}`}
        className={cn(
          "relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isMonitorPinned(tileId) && "pin-locked",
          isTvMode && idx === focusedMonitorIndex && "ring-2 ring-primary"
        )}
        role="button"
        aria-label={Monitor.Name}
        data-testid={`montage-monitor-${tileId}`}
        tabIndex={isEditMode ? -1 : 0}
        onClick={() => !isEditMode && navigate(
          profileId ? `/all/monitors/${profileId}/${Monitor.Id}` : `/monitors/${Monitor.Id}`,
          { state: { from: '/montage' } }
        )}
        onKeyDown={handleKeyClick}
      >
        <div ref={registerTile(tileId)} className="w-full h-full">
          <MontageTileErrorBoundary monitorId={Monitor.Id} monitorName={Monitor.Name}>
            <MontageMonitor
              monitor={Monitor}
              status={Monitor_Status}
              currentProfile={ownerProfile}
              accessToken={accessToken}
              navigate={navigate}
              profileId={profileId}
              profileChip={profileChip}
              isFullscreen={isFullscreen}
              isEditing={isEditMode}
              isPinned={isMonitorPinned(tileId)}
              onPinToggle={() => onPinToggle(tileId)}
              objectFit={objectFit}
              showOverlay={showMonitorLabels}
              newEventCount={resolveNewEventCount(item)}
              newestEventAt={resolveNewestEventAt(item)}
              reduceStream={reduceStream}
              paused={paused || isTileGated(tileId)}
              forceViewMode={forceViewMode}
            />
          </MontageTileErrorBoundary>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className={cn(
          'w-full',
          activeTemplate && 'relative flex-1',
          isFullscreen && 'pl-[var(--sai-left,env(safe-area-inset-left))] pr-[var(--sai-right,env(safe-area-inset-right))]'
        )}
        data-testid="montage-grid"
      >
        {groupedSections && scopeId ? (
          <ProfileSectionList
            sections={groupedSections}
            surface="montage-group"
            scopeId={scopeId}
            className="space-y-6"
            renderItems={(items) => {
              const sectionLayout = items
                .map((item) => layoutByTileId.get(tileIdFor(item)))
                .filter((item): item is Layout => !!item);
              return (
                <GridLayout layout={sectionLayout} {...sharedGridLayoutProps}>
                  {items.map(renderTile)}
                </GridLayout>
              );
            }}
          />
        ) : activeTemplate && scrollRect ? (
          <div
            className="fixed z-30"
            style={{
              top: scrollRect.top,
              left: scrollRect.left,
              right: 0,
              bottom: 0,
            }}
          >
            <TemplateGrid
              layout={layout}
              internalCols={internalColsForCols(gridCols)}
              totalRows={60}
              isFullscreen={isFullscreen}
              templateSlots={liveSlots}
              onPickSlot={(slotId) => setPickingSlotId(slotId)}
              renderSlot={(slotId, cacheKey) => {
              console.log('[renderSlot] slotId:', slotId, 'cacheKey:', cacheKey, 'scopeId:', scopeId);
                const tile = cappedMonitors.find((m) => String(m.Monitor.Id) === cacheKey);
                if (!tile) {
                  const full = allMonitors?.find((m) => String(m.item.Monitor.Id) === cacheKey);
                  if (!full) return null;
                  const ownerProfile = resolveOwnerProfile(full.profileId);
                  return (
                    <MontageMonitor
                      key={`${scopeId}-${slotId}-${full.item.Monitor.Id}`}
                      monitor={full.item.Monitor}
                      status={full.item.Monitor_Status}
                      currentProfile={ownerProfile}
                      accessToken={accessToken}
                      navigate={navigate}
                      profileId={full.profileId ?? scopeId ?? undefined}
                      isFullscreen={isFullscreen}
                      isEditing={isEditMode}
                      objectFit={objectFit}
                      showOverlay={showMonitorLabels}
                      reduceStream={reduceStream}
                      paused={paused}
                      forceViewMode={forceViewMode}
                      onChangeCamera={() => setPickingSlotId(slotId)}
                      dragHandleProps={
                        isEditMode ? {
                          draggable: true,
                          onDragStart: (e) => {
                            e.dataTransfer.setData('text/slot-id', slotId);
                            e.dataTransfer.effectAllowed = 'move';
                          },
                        } : undefined
                      }
                    />
                  );
                }
                const ownerProfile = resolveOwnerProfile(tile.profileId);
                return (
                  <MontageMonitor
                    key={`${scopeId}-${slotId}-${tile.Monitor.Id}`}                    
                    monitor={tile.Monitor}
                    status={tile.Monitor_Status}
                    currentProfile={ownerProfile}
                    accessToken={accessToken}
                    navigate={navigate}
                    profileId={tile.profileId ?? scopeId ?? undefined}
                    profileChip={tile.profileChip}
                    isFullscreen={isFullscreen}
                    isEditing={isEditMode}
                    objectFit={objectFit}
                    showOverlay={showMonitorLabels}
                    newEventCount={resolveNewEventCount(tile)}
                    newestEventAt={resolveNewestEventAt(tile)}
                    reduceStream={reduceStream}
                    paused={paused}
                    forceViewMode={forceViewMode}
                    onChangeCamera={() => setPickingSlotId(slotId)}
                    dragHandleProps={
                      isEditMode ? {
                        draggable: true,
                        onDragStart: (e) => {
                          e.dataTransfer.setData('text/slot-id', slotId);
                          e.dataTransfer.effectAllowed = 'move';
                        },
                      } : undefined
                    }
                  />
                );
              }}
              onSlotContextMenu={(_slotId) => {
                // TODO: open camera picker on right-click
              }}
              onSwapSlots={handleSwapSlots}
            />
          </div>
        ) : (
          <>
            <GridLayout layout={layout} {...sharedGridLayoutProps}>
              {cappedMonitors.map(renderTile)}
            </GridLayout>
          </>
        )}

      </div>
      {overflowCount > 0 && (
        <p className="text-sm text-muted-foreground mt-3 px-1" data-testid="montage-stream-cap-overflow">
          {t('montage.stream_cap_overflow', { count: overflowCount })}
        </p>
      )}
      <TemplateSlotPicker
        open={pickingSlotId !== null}
        onOpenChange={(open) => {
          if (!open) setPickingSlotId(null);
        }}
        slotId={pickingSlotId}
        currentPick={currentPick}
        otherPicks={otherPicks}
        onPick={handlePick}
      />
    </>
  );
}
