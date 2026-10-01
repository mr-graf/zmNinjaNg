/**
 * Hook for Montage grid layout management
 *
 * Uses a fixed 12-column internal grid. The user's "display columns" setting
 * (1–5) controls the default item width (12/displayCols). Items can be resized
 * to any width 1–12 for mixed sizes; vertical compaction reflows items.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { GRID_LAYOUT, MONTAGE_GRID } from '../../../lib/zmninja-ng-constants';
import { useSettingsStore, DEFAULT_MONTAGE_GROUP_LAYOUT } from '../../../stores/settings';
import { getMonitorAspectRatio } from '../../../lib/monitor/monitor-rotation';
import { monitorCacheKey } from '../../../stores/monitors';
import { TEMPLATES, buildTemplateLayout } from '../templates';
import type { Layout } from 'react-grid-layout';
import type { Monitor, MonitorData, ProfileId } from '../../../api/types';
import type { ProfileSettings } from '../../../stores/settings';

export type MontageTileMonitorData = MonitorData & { profileId?: ProfileId };

export const tileIdFor = (item: MontageTileMonitorData): string =>
  monitorCacheKey(item.profileId, item.Monitor.Id);

export const COL_SUBDIVISION = MONTAGE_GRID.colSubdivision;

export const internalColsForCols = (displayCols: number): number =>
  Math.max(1, Math.round(displayCols)) * COL_SUBDIVISION;

const parseAspectRatioValue = (monitor: Monitor): number => {
  const ratio = getMonitorAspectRatio(monitor.Width, monitor.Height, monitor.Orientation);
  if (!ratio) return 9 / 16;
  const match = ratio.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return 9 / 16;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 9 / 16;
  }
  return height / width;
};

const calculateHeightUnits = (
  monitorMap: Map<string, Monitor>,
  monitorId: string,
  widthUnits: number,
  gridWidth: number,
  margin: number,
  internalCols: number,
  headerPx: number
): number => {
  const monitor = monitorMap.get(monitorId);
  if (!monitor) return 200;

  const aspectRatio = parseAspectRatioValue(monitor);
  const columnWidth = (gridWidth - margin * (internalCols - 1)) / internalCols;
  const itemWidth = columnWidth * widthUnits + margin * (widthUnits - 1);
  const videoPx = itemWidth * aspectRatio;
  const heightPx = videoPx + headerPx;
  const unit = (heightPx + margin) / (GRID_LAYOUT.montageRowHeight + margin);

  return Math.max(2, Math.ceil(unit));
};

export const isLegacyLayout = (stored: Layout[], displayCols: number): boolean => {
  if (stored.length === 0) return false;
  if (displayCols < 2) return false;
  const maxRight = Math.max(...stored.map((item) => item.x + item.w));
  return maxRight <= COL_SUBDIVISION;
};

const areLayoutsEqual = (a: Layout[], b: Layout[]): boolean => {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((item) => [item.i, item]));
  for (const item of b) {
    const match = map.get(item.i);
    if (!match) return false;
    if (match.x !== item.x || match.y !== item.y || match.w !== item.w || match.h !== item.h) {
      return false;
    }
  }
  return true;
};

interface UseMontageGridOptions {
  monitors: MontageTileMonitorData[];
  profileId: ProfileId | null;
  settings: ProfileSettings;
  isEditMode: boolean;
  groupKey: string;
  tileHeaderPx?: number;
  /** DRAFT: active template id, or null for the normal free-form mode. */
  activeTemplate?: string | null;
}

interface UseMontageGridReturn {
  layout: Layout[];
  gridCols: number;
  currentWidthRef: React.MutableRefObject<number>;
  handleApplyGridLayout: (cols: number) => void;
  handleLoadSavedLayout: (savedLayout: Layout[], displayCols: number) => void;
  handleLayoutChange: (nextLayout: Layout[]) => void;
  handleResizeStop: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
  handleWidthChange: (width: number) => void;
  handleDragStop: (layout: Layout[], oldItem: Layout, newItem: Layout) => void;
  handleFillWidth: () => void;
  togglePinMonitor: (monitorId: string) => void;
  isMonitorPinned: (monitorId: string) => boolean;
}

export function useMontageGrid({
  monitors,
  profileId,
  settings,
  isEditMode,
  groupKey,
  tileHeaderPx = MONTAGE_GRID.cardHeaderHeightPx,
  activeTemplate = null,
}: UseMontageGridOptions): UseMontageGridReturn {
  const { t } = useTranslation();
  const updateMontageGroupLayout = useSettingsStore(
    (state) => state.updateMontageGroupLayout
  );

  const bucketGridCols =
    settings.montageByGroup?.[groupKey]?.gridCols ?? DEFAULT_MONTAGE_GROUP_LAYOUT.gridCols;
  const [displayCols, setDisplayCols] = useState<number>(bucketGridCols);
  const displayColsRef = useRef(bucketGridCols);
  useEffect(() => { displayColsRef.current = displayCols; }, [displayCols]);
  const [layout, setLayout] = useState<Layout[]>([]);
  const [hasWidth, setHasWidth] = useState(false);
  const initializedRef = useRef(false);
  const skipRestoreRef = useRef(false);

  const currentWidthRef = useRef(0);
  const lastCalcWidthRef = useRef(0);

  const monitorMapRef = useRef<Map<string, Monitor>>(new Map());
  const isEditModeRef = useRef(isEditMode);
  const profileIdRef = useRef(profileId);
  const settingsRef = useRef(settings);

  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  useEffect(() => { profileIdRef.current = profileId; }, [profileId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const groupKeyRef = useRef(groupKey);
  useEffect(() => { groupKeyRef.current = groupKey; }, [groupKey]);

  const tileHeaderPxRef = useRef(tileHeaderPx);

  const monitorMap = useMemo(() => {
    return new Map(monitors.map((item) => [tileIdFor(item), item.Monitor]));
  }, [monitors]);

  useEffect(() => { monitorMapRef.current = monitorMap; }, [monitorMap]);

  const buildDefaultLayout = useCallback(
    (monitorList: MontageTileMonitorData[], cols: number, gridWidth: number): Layout[] => {
      const w = COL_SUBDIVISION;
      const perRow = Math.max(1, Math.round(cols));
      const internalCols = internalColsForCols(cols);
      const map = monitorMapRef.current;
      return monitorList.map((item, index) => {
        const id = tileIdFor(item);
        const h = calculateHeightUnits(map, id, w, gridWidth, 0, internalCols, tileHeaderPxRef.current);
        return {
          i: id,
          x: (index % perRow) * w,
          y: Math.floor(index / perRow) * h,
          w,
          h,
          minW: 1,
          minH: 50,
        };
      });
    },
    []
  );

  const recalcHeights = useCallback(
    (current: Layout[], gridWidth: number, cols: number): Layout[] => {
      const map = monitorMapRef.current;
      const internalCols = internalColsForCols(cols);
      return current.map((item) => ({
        ...item,
        w: Math.min(item.w, internalCols),
        x: Math.min(item.x, internalCols - item.w),
        h: calculateHeightUnits(map, item.i, item.w, gridWidth, 0, internalCols, tileHeaderPxRef.current),
      }));
    },
    []
  );

  useEffect(() => {
    if (tileHeaderPxRef.current === tileHeaderPx) return;
    tileHeaderPxRef.current = tileHeaderPx;
    if (currentWidthRef.current === 0) return;
    // DRAFT: template layout is independent of the header height.
    if (activeTemplate) return;
    setLayout((prev) => recalcHeights(prev, currentWidthRef.current, displayColsRef.current));
  }, [tileHeaderPx, recalcHeights, activeTemplate]);

  useEffect(() => {
    setDisplayCols(bucketGridCols);
  }, [profileId, groupKey, bucketGridCols]);

  // DRAFT: when a template is active, build its layout with placeholder ids.
  // MontageGridSections renders matching placeholder children for these ids.
  useEffect(() => {
    if (!activeTemplate) return;
    if (!hasWidth || currentWidthRef.current === 0) return;

    const config = TEMPLATES[activeTemplate];
    if (!config) return;

    const internalCols = internalColsForCols(displayColsRef.current);

    // Fixed generous row count for the draft; exact pixel geometry comes later.
    //const totalRows = Math.max(20, internalCols);

    // Fixed row count for the draft; the geometry does not depend on it.
    const totalRows = 60;
    
    const templateLayout = buildTemplateLayout(config, internalCols, totalRows);

    initializedRef.current = true;
    setLayout(templateLayout);
  }, [activeTemplate, hasWidth, monitors.length]);


  useEffect(() => {
    // DRAFT: an active template owns the layout; the normal path stays out.
    if (activeTemplate) return;
    if (monitors.length === 0) return;
    if (!hasWidth || currentWidthRef.current === 0) return;

    if (skipRestoreRef.current) {
      skipRestoreRef.current = false;
      initializedRef.current = true;
      return;
    }

    const stored = settingsRef.current.montageByGroup?.[groupKeyRef.current]?.workingLayout;
    let nextLayout: Layout[];
    const legacy = !!stored && isLegacyLayout(stored, displayCols);

    if (stored && stored.length > 0 && !legacy) {
      const existingIds = new Set(monitors.map(tileIdFor));
      const filtered = stored.filter((item) => existingIds.has(item.i));
      const presentIds = new Set(filtered.map((item) => item.i));
      const missing = monitors.filter((item) => !presentIds.has(tileIdFor(item)));
      const defaults = buildDefaultLayout(missing, displayCols, currentWidthRef.current);
      nextLayout = [...filtered, ...defaults];
    } else {
      nextLayout = buildDefaultLayout(monitors, displayCols, currentWidthRef.current);
    }

    const normalized = recalcHeights(nextLayout, currentWidthRef.current, displayCols);
    setLayout((prev) => (areLayoutsEqual(prev, normalized) ? prev : normalized));
    if (legacy && profileIdRef.current) {
      updateMontageGroupLayout(profileIdRef.current, groupKeyRef.current, {
        workingLayout: normalized,
      });
    }
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCols, hasWidth, groupKey, activeTemplate]);

  useEffect(() => {
    if (activeTemplate) return;
    if (!initializedRef.current) return;
    if (monitors.length === 0) return;

    setLayout((prev) => {
      const existingIds = new Set(prev.map((item) => item.i));
      const newMonitors = monitors.filter((m) => !existingIds.has(tileIdFor(m)));
      if (newMonitors.length === 0) {
        const currentIds = new Set(monitors.map(tileIdFor));
        const filtered = prev.filter((item) => currentIds.has(item.i));
        return filtered.length === prev.length ? prev : filtered;
      }
      const defaults = buildDefaultLayout(newMonitors, displayCols, currentWidthRef.current);
      return [...prev, ...defaults];
    });
  }, [monitors, displayCols, buildDefaultLayout, activeTemplate]);

  const handleApplyGridLayout = useCallback(
    (cols: number) => {
      const profileId = profileIdRef.current;
      if (!profileId) return;

      const nextLayout = buildDefaultLayout(monitors, cols, currentWidthRef.current);

      skipRestoreRef.current = true;
      setDisplayCols(cols);
      setLayout(nextLayout);

      updateMontageGroupLayout(profileId, groupKeyRef.current, {
        gridCols: cols,
        workingLayout: nextLayout,
      });

      toast.success(t('montage.grid_applied', { columns: cols }));
    },
    [monitors, updateMontageGroupLayout, buildDefaultLayout, t]
  );

  const handleLoadSavedLayout = useCallback(
    (savedLayout: Layout[], cols: number) => {
      const profileId = profileIdRef.current;
      if (!profileId) return;

      skipRestoreRef.current = true;
      const normalized = recalcHeights(savedLayout, currentWidthRef.current, cols);
      setDisplayCols(cols);
      setLayout(normalized);

      updateMontageGroupLayout(profileId, groupKeyRef.current, {
        gridCols: cols,
        workingLayout: normalized,
      });
    },
    [updateMontageGroupLayout, recalcHeights]
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      const isFirstMeasurement = lastCalcWidthRef.current === 0;
      currentWidthRef.current = width;

      if (isFirstMeasurement) {
        lastCalcWidthRef.current = width;
        setHasWidth(true);
        return;
      }

      // DRAFT: the template owns its layout; recalculating heights here would
      // overwrite the template's slot ids with the default 200-row fallback,
      // because those ids are not real monitors in monitorMapRef.
      if (activeTemplate) return;

      lastCalcWidthRef.current = width;
      setLayout((prev) => recalcHeights(prev, width, displayColsRef.current));
    },
    [recalcHeights, activeTemplate]
  );
  
  const handleLayoutChange = useCallback(
    (_nextLayout: Layout[]) => { /* no-op */ },
    []
  );

  const handleDragStop = useCallback(
    (nextLayout: Layout[]) => {
      const profileId = profileIdRef.current;
      if (!isEditModeRef.current || !profileId) return;
      setLayout(nextLayout);
      updateMontageGroupLayout(profileId, groupKeyRef.current, {
        workingLayout: nextLayout,
      });
    },
    [updateMontageGroupLayout]
  );

  const handleResizeStop = useCallback(
    (_layout: Layout[], _oldItem: Layout, newItem: Layout) => {
      if (!profileIdRef.current) return;
      const map = monitorMapRef.current;
      const adjustedHeight = calculateHeightUnits(
        map,
        newItem.i,
        newItem.w,
        currentWidthRef.current,
        0,
        internalColsForCols(displayColsRef.current),
        tileHeaderPxRef.current
      );

      setLayout((prev) => {
        const nextLayout = prev.map((item) =>
          item.i === newItem.i ? { ...item, h: adjustedHeight, w: newItem.w } : item
        );
        if (isEditModeRef.current && profileIdRef.current) {
          updateMontageGroupLayout(profileIdRef.current, groupKeyRef.current, {
            workingLayout: nextLayout,
          });
        }
        return areLayoutsEqual(prev, nextLayout) ? prev : nextLayout;
      });
    },
    [updateMontageGroupLayout]
  );

  const handleFillWidth = useCallback(() => {
    const profileId = profileIdRef.current;
    if (!profileId) return;

    const cols = displayColsRef.current;
    const internalCols = internalColsForCols(cols);
    setLayout((prev) => {
      const maxRight = Math.max(...prev.map((item) => item.x + item.w));
      if (maxRight <= 0 || maxRight === internalCols) return prev;

      const scale = internalCols / maxRight;

      const nextLayout = prev.map((item) => ({
        ...item,
        x: Math.round(item.x * scale),
        w: Math.max(1, Math.round(item.w * scale)),
      }));

      const recalculated = recalcHeights(nextLayout, currentWidthRef.current, cols);

      updateMontageGroupLayout(profileId, groupKeyRef.current, {
        workingLayout: recalculated,
      });

      return recalculated;
    });
  }, [recalcHeights, updateMontageGroupLayout]);

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const togglePinMonitor = useCallback((monitorId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(monitorId)) next.delete(monitorId);
      else next.add(monitorId);
      return next;
    });
  }, []);

  const isMonitorPinned = useCallback((monitorId: string) => {
    return pinnedIds.has(monitorId);
  }, [pinnedIds]);

  return {
    layout,
    gridCols: displayCols,
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
  };
}
