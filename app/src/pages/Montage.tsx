/**
 * Montage Page
 *
 * Displays a customizable grid of live monitor streams.
 * Supports drag-and-drop layout, resizing, and fullscreen mode.
 */

import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useProfileScope } from '../hooks/useProfileScope';
import { useScopedMonitors } from '../hooks/useScopedMonitors';
import { useMonitorNewEvents, useScopedMonitorNewEvents, scopedMonitorEventKey } from '../hooks/useMonitorNewEvents';
import { useAuthSlice } from '../stores/auth';
import { useProfileStore } from '../stores/profile';
import { useSettingsStore } from '../stores/settings';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTvKeyHandler } from '../hooks/useTvKeyHandler';
import { useTvMode } from '../hooks/useTvMode';
import { Button } from '../components/ui/button';
import { Video, Maximize, Pencil, ArrowLeftRight, Layers, LayoutTemplate } from 'lucide-react';
import { RefreshButton } from '../components/common/RefreshButton';
import { ErrorBanner } from '../components/ui/query-state';
import { resolveQueryError } from '../lib/query/query-error';
import { EmptyState } from '../components/ui/empty-state';
import { filterMonitorsByGroup, countMonitorsByProfile } from '../lib/monitor/filters';
import { allocateStreamBudget } from '../lib/monitor/stream-budget';
import { useMonitorPaging } from '../hooks/useMonitorPaging';
import { MonitorPageControls } from '../components/monitors/MonitorPageControls';
import { useHiddenPause } from '../hooks/useHiddenPause';
import { useIdleAfter } from '../hooks/useIdleAfter';
import { useViewportGating } from '../hooks/useViewportGating';
import { MONITOR_PAGING, MONTAGE_GRID } from '../lib/zmninja-ng-constants';
import { useGroupFilter } from '../hooks/useGroupFilter';
import { useSkipOfflineMonitors } from '../hooks/useSkipOfflineMonitors';
import { useMontageGroupState } from '../hooks/useMontageGroupState';
import { GroupFilterSelect } from '../components/filters/GroupFilterSelect';
import { cn } from '../lib/utils';
import { groupByOwningProfile } from '../lib/profile/profile-sections';
import { useTranslation } from 'react-i18next';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { useInsomnia } from '../hooks/useInsomnia';
import { NotificationBadge } from '../components/NotificationBadge';
import type { Layout } from 'react-grid-layout';
import type { Profile, MonitorData, ProfileId } from '../api/types';

// Extracted hooks and components
import {
  GridLayoutControls,
  FullscreenControls,
  MontageKebabMenu,
  MontageErrorStrips,
  MontageGridSections,
  useMontageGrid,
  useContainerResize,
  useMontageVisibilityItems,
  type MontageTileItem,
  type MontageGroupedSections,
} from '../components/montage';
import { ScrollPad } from '../components/ui/scroll-pad';
import { NinjiiToolbarButton } from '../components/assistant/NinjiiToolbarButton';
import { useScrollPad } from '../hooks/useScrollPad';
import { useFullscreenMode } from '../hooks/useFullscreenMode';
import { tileIdFor } from '../components/montage/hooks/useMontageGrid';

export default function Montage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentProfile, settings, isAllMode } = useCurrentProfile();
  const authSlice = useAuthSlice(currentProfile?.id ?? null);
  const accessToken = authSlice.accessToken;
  const currentProfileId = useProfileStore((state) => state.currentProfileId);

  const scope = useProfileScope();
  const profilesById = useMemo(
    () => new Map((scope?.profiles ?? []).map((p) => [p.id, p])),
    [scope]
  );

  const {
    monitors: scopedMonitors,
    errors: profileErrors,
    isLoading: scopedLoading,
    refetchProfile,
  } = useScopedMonitors();

  const updateSettings = useSettingsStore((state) => state.updateProfileSettings);
  const { isFilterActive, filteredMonitorIds, isFilterReady } = useGroupFilter();
  const { groupKey, bucket, update: updateGroupLayout } = useMontageGroupState();

  useInsomnia({ enabled: settings.insomnia });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const hiddenSet = useMemo(
    () => new Set(bucket.hiddenMonitorIds),
    [bucket.hiddenMonitorIds]
  );

  const monitorCountByProfile = useMemo(() => countMonitorsByProfile(scopedMonitors), [scopedMonitors]);

  const keepMonitor = useSkipOfflineMonitors();
  const streamableMonitors = useMemo(
    () => scopedMonitors.filter((s) => keepMonitor(s.item)),
    [scopedMonitors, keepMonitor]
  );

  const visibilityItems = useMontageVisibilityItems(streamableMonitors, isAllMode);

  const monitors = useMemo((): MontageTileItem[] => {
    if (isAllMode) {
      return streamableMonitors.map((s) => ({
        Monitor: s.item.Monitor,
        Monitor_Status: s.item.Monitor_Status,
        profileId: s.profileId,
        profileChip: s.profileName,
      }));
    }
    let list: MonitorData[] = streamableMonitors.map((s) => ({ Monitor: s.item.Monitor, Monitor_Status: s.item.Monitor_Status }));
    if (isFilterActive) {
      list = filteredMonitorIds.length > 0
        ? filterMonitorsByGroup(list, filteredMonitorIds)
        : [];
    }
    return list;
  }, [isAllMode, streamableMonitors, isFilterActive, filteredMonitorIds]);

  const visibleMonitors = useMemo(
    () => (hiddenSet.size > 0 ? monitors.filter((m) => !hiddenSet.has(tileIdFor(m))) : monitors),
    [monitors, hiddenSet]
  );

  const [isEditMode, setIsEditMode] = useState(false);

  const activeTemplate = bucket.activeTemplate ?? null;
  const templateSlots = bucket.templateSlots ?? {};

  const setActiveTemplate = useCallback((next: string | null) => {
    updateGroupLayout({ activeTemplate: next });
  }, [updateGroupLayout]);

  const setTemplateSlots = useCallback((next: Record<string, string>) => {
    updateGroupLayout({ templateSlots: next });
  }, [updateGroupLayout]);

  const [scrollRect, setScrollRect] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const paging = useMonitorPaging({
    items: visibleMonitors,
    pageSize: isEditMode ? MONITOR_PAGING.off : settings.monitorsPerPage,
    resetKey: `${currentProfileId ?? ''}:${groupKey}`,
  });

  const maxStreams = settings.allModeMaxStreams;
  const overflowCount = isAllMode && paging.items.length > maxStreams
    ? paging.items.length - maxStreams
    : 0;
  const cappedMonitors = useMemo(
    () =>
      overflowCount > 0
        ? allocateStreamBudget(paging.items, maxStreams, (m) => m.profileId ?? '')
        : paging.items,
    [overflowCount, paging.items, maxStreams]
  );

  const reduceStream = isAllMode && settings.allModeStreamTuning === 'reduced';

  const paused = useHiddenPause(
    isAllMode && settings.allModePauseHidden,
    MONTAGE_GRID.pauseHiddenGraceMs
  );

  const isIdle = useIdleAfter(
    isAllMode ? settings.allModeIdleMinutes : 0,
    MONTAGE_GRID.idleActivityThrottleMs
  );

  const monitorIds = useMemo(
    () => (isAllMode ? [] : cappedMonitors.map(({ Monitor }) => Monitor.Id)),
    [isAllMode, cappedMonitors]
  );
  const { counts: newEventCounts, newest: newestEventAt } = useMonitorNewEvents(monitorIds);

  const scopedMonitorRefs = useMemo(
    () =>
      isAllMode
        ? cappedMonitors
            .filter((item): item is MontageTileItem & { profileId: ProfileId } => item.profileId !== undefined)
            .map(({ Monitor, profileId }) => ({ profileId, monitorId: Monitor.Id }))
        : [],
    [isAllMode, cappedMonitors]
  );
  const { counts: scopedNewEventCounts, newest: scopedNewestEventAt } =
    useScopedMonitorNewEvents(scopedMonitorRefs);

  const [showScrollPad, toggleScrollPad] = useScrollPad(isEditMode);

  const activeLayoutName = bucket.activeLayoutName;

  const [showMonitorLabels, setShowMonitorLabels] = useState(false);

  const showToolbar = settings.montageShowToolbar;

  const { isFullscreen, handleToggleFullscreen } =
    useFullscreenMode({
      profileId: currentProfileId,
      settings,
      settingKey: 'montageIsFullscreen',
    });

  const {
    layout,
    gridCols,
    currentWidthRef,
    handleApplyGridLayout,
    handleLoadSavedLayout,
    handleLayoutChange,
    handleDragStop,
    handleFillWidth,
    handleResizeStop,
    handleWidthChange,
    togglePinMonitor,
    isMonitorPinned,
  } = useMontageGrid({
    monitors: cappedMonitors,
    profileId: currentProfileId,
    settings,
    isEditMode,
    groupKey,
    tileHeaderPx: isFullscreen
      ? 0
      : settings.displayMode === 'compact'
        ? MONTAGE_GRID.cardHeaderHeightCompactPx
        : MONTAGE_GRID.cardHeaderHeightPx,
    activeTemplate,
  });

  const resolveOwnerProfile = useCallback(
    (profileId: ProfileId | undefined): Profile | null =>
      profileId ? profilesById.get(profileId) ?? null : currentProfile,
    [profilesById, currentProfile]
  );
  const resolveNewEventCount = useCallback(
    (item: MontageTileItem): number | undefined =>
      item.profileId
        ? scopedNewEventCounts[scopedMonitorEventKey(item.profileId, item.Monitor.Id)]
        : newEventCounts[item.Monitor.Id],
    [scopedNewEventCounts, newEventCounts]
  );
  const resolveNewestEventAt = useCallback(
    (item: MontageTileItem): string | null | undefined =>
      item.profileId
        ? scopedNewestEventAt[scopedMonitorEventKey(item.profileId, item.Monitor.Id)]
        : newestEventAt[item.Monitor.Id],
    [scopedNewestEventAt, newestEventAt]
  );

  const { containerRef } = useContainerResize({
    onWidthChange: handleWidthChange,
    currentWidthRef,
  });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, setScrollContainerEl] = useState<HTMLDivElement | null>(null);

  const setScrollContainer = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollContainerEl(element);
      containerRef(element);
    },
    [containerRef]
  );

  useEffect(() => {
    scrollContainerRef.current = scrollContainer;
  }, [scrollContainer]);

  useEffect(() => {
    if (!scrollContainer) return;
    const update = () => {
      const r = scrollContainer.getBoundingClientRect();
      // In fullscreen the toolbar is a fixed overlay drawn on top of the scroll
      // container. scrollRect must start below it, or the template grid covers
      // the toolbar's buttons and its own top row is unclickable. The toolbar
      // publishes its own testid.
      const fullscreenToolbarPx = isFullscreen
        ? (document.querySelector('[data-testid="montage-fullscreen-toolbar"]') as HTMLElement | null)?.offsetHeight ?? 48
        : 0;
      setScrollRect({
        top: r.top + fullscreenToolbarPx,
        left: r.left,
        width: r.width,
        height: r.height - fullscreenToolbarPx,
      });
    };
    update();
    window.addEventListener('resize', update);
    const interval = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(interval);
    };
  }, [scrollContainer, isFullscreen]);

  const { isTileGated, registerTile } = useViewportGating({
    enabled: isAllMode && settings.allModeViewportGating,
    root: scrollContainer,
    rootMargin: MONTAGE_GRID.viewportGatingRootMargin,
    lingerMs: MONTAGE_GRID.viewportGatingLingerMs,
  });

  const { isTvMode } = useTvMode();
  const [focusedMonitorIndex, setFocusedMonitorIndex] = useState(0);

  const estimatedCols = gridCols;

  const handleDpadNav = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      setFocusedMonitorIndex((prev) => {
        const total = cappedMonitors.length;
        if (total === 0) return 0;
        let next = prev;
        switch (direction) {
          case 'left':
            next = prev - 1;
            break;
          case 'right':
            next = prev + 1;
            break;
          case 'up':
            next = prev - estimatedCols;
            break;
          case 'down':
            next = prev + estimatedCols;
            break;
        }
        return Math.max(0, Math.min(total - 1, next));
      });
    },
    [cappedMonitors.length, estimatedCols]
  );

  const handleDpadEnter = useCallback(() => {
    const mon = cappedMonitors[focusedMonitorIndex];
    if (mon) {
      navigate(
        mon.profileId ? `/all/monitors/${mon.profileId}/${mon.Monitor.Id}` : `/monitors/${mon.Monitor.Id}`,
        { state: { from: '/montage' } }
      );
    }
  }, [cappedMonitors, focusedMonitorIndex, navigate]);

  useTvKeyHandler({
    ArrowLeft: () => handleDpadNav('left'),
    ArrowRight: () => handleDpadNav('right'),
    ArrowUp: () => handleDpadNav('up'),
    ArrowDown: () => handleDpadNav('down'),
    Enter: handleDpadEnter,
  });

  useEffect(() => {
    if (!isTvMode || cappedMonitors.length === 0) return;
    const focused = cappedMonitors[focusedMonitorIndex];
    if (!focused) return;
    const el = document.querySelector(
      `[data-testid="montage-monitor-${tileIdFor(focused)}"]`
    ) as HTMLElement | null;
    el?.focus();
  }, [isTvMode, focusedMonitorIndex, cappedMonitors]);

  const pinchZoom = usePinchZoom({
    minScale: 0.5,
    maxScale: 3,
    initialScale: 1,
    enabled: !isFullscreen,
  });

  const handleApplyGridLayoutWithClear = (cols: number) => {
    handleApplyGridLayout(cols);
    updateGroupLayout({ activeLayoutName: null });
  };

  const handleFeedFitChange = (value: string) => {
    if (!currentProfileId) return;
    updateSettings(currentProfileId, {
      montageFeedFit: value as typeof settings.montageFeedFit,
    });
  };

  const handleSaveLayout = (name: string) => {
    const entry = { name, layout: [...layout], displayCols: gridCols };
    updateGroupLayout({
      savedLayouts: [...bucket.savedLayouts, entry],
      activeLayoutName: name,
    });
  };

  const handleLoadLayout = (saved: { name: string; layout: Layout[]; displayCols: number }) => {
    handleLoadSavedLayout(saved.layout, saved.displayCols);
    updateGroupLayout({ activeLayoutName: saved.name });
  };

  const handleDeleteLayout = (index: number) => {
    const saved = [...bucket.savedLayouts];
    saved.splice(index, 1);
    updateGroupLayout({ savedLayouts: saved });
  };

  const handleToggleMonitorVisibility = useCallback(
    (id: string) => {
      const current = bucket.hiddenMonitorIds;
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      updateGroupLayout({ hiddenMonitorIds: next });
    },
    [bucket.hiddenMonitorIds, updateGroupLayout]
  );

  const handleEditModeToggle = () => {
    setIsEditMode((prev) => !prev);
  };

  const stillWaiting = scopedLoading && profileErrors.length === 0;
  if (stillWaiting || (!isAllMode && !isFilterReady)) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-video bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAllMode && profileErrors.length > 0 && scopedLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold tracking-tight">{t('montage.title')}</h1>
        </div>
        <ErrorBanner message={resolveQueryError(profileErrors[0].error, t)} />
      </div>
    );
  }

  if (monitors.length === 0 && !activeTemplate) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold tracking-tight">{t('montage.title')}</h1>
          <RefreshButton size="sm" />
        </div>
        <EmptyState icon={Video} title={t('montage.no_monitors')} />
      </div>
    );
  }

  const visibleErrors = isAllMode
    ? profileErrors.filter((err) => (monitorCountByProfile.get(err.profileId) ?? 0) === 0)
    : [];

  const groupedSections: MontageGroupedSections | null = isAllMode && settings.monitorsGroupByServer
    ? groupByOwningProfile(cappedMonitors)
    : null;

  return (
    <div
      key={currentProfileId ?? 'no-profile'}
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-40 bg-black flex flex-col'
          : 'flex flex-col bg-background relative h-[calc(100dvh-var(--sai-top,0px))] overflow-hidden'
      )}
    >

      {!isFullscreen && (
        <>
          {showToolbar && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap p-2 sm:p-3 border-b bg-card/50 backdrop-blur-sm shrink-0 z-10">
              {isAllMode ? (
                <Button
                  variant={settings.monitorsGroupByServer ? 'default' : 'outline'}
                  size="icon"
                  className="h-8 sm:h-9 w-8 sm:w-9"
                  aria-pressed={settings.monitorsGroupByServer}
                  title={t('monitors.group_by_server')}
                  aria-label={t('monitors.group_by_server')}
                  onClick={() => {
                    if (!currentProfileId) return;
                    updateSettings(currentProfileId, {
                      monitorsGroupByServer: !settings.monitorsGroupByServer,
                    });
                  }}
                  data-testid="montage-group-by-server"
                >
                  <Layers className="h-4 w-4" />
                </Button>
              ) : (
                <GroupFilterSelect />
              )}
              <GridLayoutControls
                isMobile={isMobile}
                gridCols={gridCols}
                activeLayoutName={activeLayoutName}
                onApplyGridLayout={handleApplyGridLayoutWithClear}
                savedLayouts={bucket.savedLayouts}
                onSaveLayout={handleSaveLayout}
                onLoadLayout={handleLoadLayout}
                onDeleteLayout={handleDeleteLayout}
              />
              <Button
                variant={activeTemplate ? 'default' : 'outline'}
                size="sm"
                className="h-8 sm:h-9"
                aria-pressed={!!activeTemplate}
                title={t('montage.template')}
                aria-label={t('montage.template')}
                onClick={() => setActiveTemplate(activeTemplate ? null : 'tl-1-3-4')}
                data-testid="montage-template-toggle"
              >
                <LayoutTemplate className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {t('montage.template')}
                </span>
              </Button>
              <Button
                onClick={handleEditModeToggle}
                variant={isEditMode ? 'default' : 'outline'}
                aria-pressed={isEditMode}
                size="sm"
                className="h-8 sm:h-9"
                title={isEditMode ? t('montage.done_editing') : t('montage.edit_layout')}
                data-testid="montage-edit-toggle"
              >
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {isEditMode ? t('montage.done_editing') : t('montage.edit_layout')}
                </span>
              </Button>
              {isEditMode && (
                <Button
                  onClick={handleFillWidth}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 sm:h-9 sm:w-9"
                  title={t('montage.fill_width', 'Fill Width')}
                  aria-label={t('montage.fill_width', 'Fill Width')}
                  data-testid="montage-fill-width"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
              )}
              <Button
                onClick={() => handleToggleFullscreen(true)}
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                title={t('montage.fullscreen')}
                aria-label={t('montage.fullscreen')}
                data-testid="montage-fullscreen-button"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <NinjiiToolbarButton />
              {paging.isPaged && (
                <MonitorPageControls
                  page={paging.page}
                  pages={paging.pages}
                  onGoToPage={paging.goToPage}
                  testIdPrefix="montage"
                />
              )}
              <RefreshButton size="sm" className="h-8 sm:h-9" data-testid="montage-refresh-button" />
              <MontageKebabMenu
                items={visibilityItems}
                hiddenMonitorIds={bucket.hiddenMonitorIds}
                onToggleVisibility={handleToggleMonitorVisibility}
                scrollPadOn={showScrollPad}
                onToggleScrollPad={toggleScrollPad}
                feedFit={settings.montageFeedFit}
                onFeedFitChange={handleFeedFitChange}
              />
              <NotificationBadge />
            </div>
          )}
        </>
      )}

      {isFullscreen && (
        <FullscreenControls
          onExitFullscreen={() => handleToggleFullscreen(false)}
          showLabels={showMonitorLabels}
          onToggleLabels={() => setShowMonitorLabels((prev) => !prev)}
        />
      )}

      {!isFullscreen && <MontageErrorStrips errors={visibleErrors} onRetry={refetchProfile} />}

      <div
        ref={setScrollContainer}
        {...pinchZoom.bind()}
        className={cn(
          'flex-1 relative bg-muted/10 min-h-0',
          activeTemplate ? 'overflow-hidden' : 'overflow-auto',
          isFullscreen
            ? 'pt-[calc(var(--fullscreen-toolbar-h)+var(--sai-top,env(safe-area-inset-top)))] overscroll-contain'
            : 'touch-pan-y'
        )}
      >
        <div
          className={activeTemplate ? 'absolute inset-0' : undefined}
          style={activeTemplate ? undefined : {
            transform: `scale(${pinchZoom.scale})`,
            transformOrigin: 'top left',
            transition: pinchZoom.isPinching ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {cappedMonitors.length === 0 && !isFullscreen && !activeTemplate && (
            <div data-testid="montage-all-hidden">
              <EmptyState
                icon={Video}
                title={t('montage.all_hidden', { label: t('montage.menu_show_monitors') })}
              />
            </div>
          )}
          <MontageGridSections
            cappedMonitors={cappedMonitors}
            allMonitors={scopedMonitors}
            groupedSections={groupedSections}
            scopeId={currentProfileId}
            activeTemplate={activeTemplate}
            templateSlots={templateSlots}
            onTemplateSlotsChange={setTemplateSlots}
            scrollRect={scrollRect}
            layout={layout}
            gridCols={gridCols}
            isEditMode={isEditMode}
            overflowCount={overflowCount}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleDragStop}
            onResizeStop={handleResizeStop}
            navigate={navigate}
            isFullscreen={isFullscreen}
            isTvMode={isTvMode}
            focusedMonitorIndex={focusedMonitorIndex}
            showMonitorLabels={showMonitorLabels}
            objectFit={settings.montageFeedFit}
            accessToken={accessToken}
            isMonitorPinned={isMonitorPinned}
            onPinToggle={togglePinMonitor}
            resolveOwnerProfile={resolveOwnerProfile}
            resolveNewEventCount={resolveNewEventCount}
            resolveNewestEventAt={resolveNewestEventAt}
            reduceStream={reduceStream}
            paused={paused}
            isTileGated={isTileGated}
            registerTile={registerTile}
            forceViewMode={isIdle ? 'snapshot' : undefined}
          />
        </div>
      </div>

      {showScrollPad && !isFullscreen && <ScrollPad targetRef={scrollContainerRef} />}
    </div>
  );
}
