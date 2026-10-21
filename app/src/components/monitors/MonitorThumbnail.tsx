/**
 * Monitor Thumbnail
 *
 * A single still frame from a monitor, used in pickers that list many
 * cameras at once. One request per mount, no streaming, no connkey: a
 * picker with 30 monitors must not open 30 MJPEG connections. `mode=single`
 * asks zms for one JPEG and closes.
 */

import { useRef, useState } from 'react';
import { getMonitorStreamUrl } from '../../lib/zm/url-builder';
import { resolveMinStreamingPort } from '../../lib/monitor/multiport';
import { useProfileById } from '../../hooks/useCurrentProfile';
import { useFreshAccessToken } from '../../hooks/useFreshAccessToken';
import { ZMS_MODES } from '../../lib/zm/zm-constants';
import { cn } from '../../lib/utils';
import { VideoOff } from 'lucide-react';
import type { ProfileId } from '../../api/types';

interface MonitorThumbnailProps {
  monitorId: string;
  profileId: ProfileId;
  className?: string;
  alt?: string;
}

export function MonitorThumbnail({
  monitorId,
  profileId,
  className,
  alt = '',
}: MonitorThumbnailProps) {
  const { profile } = useProfileById(profileId);
  const { token, isFresh } = useFreshAccessToken(profileId);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!profile || !isFresh) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/30',
          className,
        )}
        data-testid={`monitor-thumbnail-placeholder-${monitorId}`}
      >
        <VideoOff className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }

  const minStreamingPort = resolveMinStreamingPort(
    profile.minStreamingPort,
    false,
  );

  // Build the URL directly, without wrapWithImageProxy: the dev proxy only
  // handles the montage's MJPEG path, and a mode=single snapshot sent
  // through it comes back 404 in Electron.
  const src = getMonitorStreamUrl(profile.cgiUrl, monitorId, {
    mode: ZMS_MODES.single,
    token: token || undefined,
    minStreamingPort,
  });

  return (
    <div className={cn('relative overflow-hidden bg-black', className)}>
      {(!hasFrame || errored) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <VideoOff className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
        style={{ visibility: hasFrame && !errored ? 'visible' : 'hidden' }}
        onLoad={() => setHasFrame(true)}
        onError={() => setErrored(true)}
        draggable={false}
        data-testid={`monitor-thumbnail-${monitorId}`}
      />
    </div>
  );
}
