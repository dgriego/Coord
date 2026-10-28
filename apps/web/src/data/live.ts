import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InvalidateEvent } from "@coord/shared";

/**
 * Listens to the studio's event stream and refetches whatever another person
 * just changed. EventSource reconnects on its own after drops; on reconnect we
 * refetch everything active, since events may have been missed meanwhile.
 */
export function useLiveUpdates(studioId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/api/events");
    let connectedOnce = false;
    source.addEventListener("ready", () => {
      if (connectedOnce) void qc.invalidateQueries();
      connectedOnce = true;
    });
    source.addEventListener("invalidate", (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as InvalidateEvent;
      for (const queryKey of event.keys) void qc.invalidateQueries({ queryKey });
    });
    return () => source.close();
  }, [qc, studioId]);
}
