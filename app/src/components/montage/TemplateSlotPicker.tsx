/**
 * Template Slot Picker
 *
 * Simple modal (not Radix Dialog) so a click on a camera row always reaches
 * the button. Radix Dialog's focus trap and overlay intercept clicks in a
 * way that made the first row unresponsive here; a plain fixed overlay with
 * a stopPropagation on the panel does the same job without the trap.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useScopedMonitors } from '../../hooks/useScopedMonitors';
import { useProfileScope } from '../../hooks/useProfileScope';
import { groupByOwningProfile } from '../../lib/profile/profile-sections';
import { monitorCacheKey } from '../../stores/monitors';
import { MonitorThumbnail } from '../monitors/MonitorThumbnail';
import { cn } from '../../lib/utils';
import type { MonitorRef } from '../../stores/dashboard';

interface TemplateSlotPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotId: string | null;
  currentPick: MonitorRef | null;
  otherPicks: MonitorRef[];
  onPick: (pick: MonitorRef | null) => void;
}

export function TemplateSlotPicker({
  open,
  onOpenChange,
  slotId,
  currentPick,
  otherPicks,
  onPick,
}: TemplateSlotPickerProps) {
  const { t } = useTranslation();
  const scope = useProfileScope();
  const isAggregate = scope?.mode === 'all';
  const { monitors } = useScopedMonitors({ poll: false });

  const sections = useMemo(
    () => groupByOwningProfile(monitors.map((m) => ({ ...m, profileChip: m.profileName }))),
    [monitors],
  );

  const currentKey = currentPick
    ? monitorCacheKey(currentPick.profileId, currentPick.monitorId)
    : null;
  const otherKeys = new Set(otherPicks.map((ref) => String(ref.monitorId)));

  const handleToggle = (ref: MonitorRef) => {
    const key = monitorCacheKey(ref.profileId, ref.monitorId);
    if (key === currentKey) {
      onPick(null);
    } else {
      onPick(ref);
    }
  };

  if (!open) return null;

  return (

    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onOpenChange(false);
      }}
      role="button"
      tabIndex={-1}
      aria-label={t('common.close')}
    >

      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="template-slot-picker"
      >
          
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {t('montage.template_pick_camera_title')}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-2"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">
              {t('montage.template_no_monitors')}
            </p>
          )}
          {sections.map(([profileId, { profileName, items }]) => (
            <div key={profileId} className="space-y-1 mb-2">
              {isAggregate && (
                <p className="text-xs font-semibold text-muted-foreground px-2 pt-1" title={profileName}>
                  {profileName}
                </p>
              )}
              {items.map(({ item }) => {
                const ref: MonitorRef = { profileId, monitorId: item.Monitor.Id };
                const key = monitorCacheKey(profileId, ref.monitorId);
                const checked = key === currentKey;
                const disabled = otherKeys.has(String(item.Monitor.Id));
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (!disabled) handleToggle(ref);
                    }}
                    disabled={disabled}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-2 py-2 w-full text-left min-w-0',
                      disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer',
                      checked && 'bg-primary/10 border border-primary/40',
                    )}
                    style={{ minHeight: '56px' }}
                    data-testid={`template-slot-${slotId}-monitor-button-${key}`}
                  >
                    <div className={cn(
                      'h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center',
                      checked ? 'border-primary' : 'border-muted-foreground/40',
                    )}>
                      {checked && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div className="pointer-events-none">
                      <MonitorThumbnail
                        monitorId={item.Monitor.Id}
                        profileId={profileId}
                        className="h-10 w-16 shrink-0 rounded"
                      />
                    </div>
                    <span className="text-sm font-medium truncate min-w-0 flex-1">
                      {item.Monitor.Name}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
