import type { InvalidateEvent } from "@coord/shared";
import type { PubSub } from "./db/client.ts";

type Listener = (event: InvalidateEvent) => void;

/**
 * Pub/sub of cache invalidations, one channel per studio.
 * Events carry query keys only, never data, so they're safe to send to every
 * member: each client refetches through permission-checked routes.
 */
export interface Bus {
  subscribe(studioId: string, listener: Listener): () => void;
  invalidate(studioId: string, ...keys: string[][]): void;
}

/** Single-process bus: local dev, tests, and one long-running server. */
export class EventBus implements Bus {
  private channels = new Map<string, Set<Listener>>();

  subscribe(studioId: string, listener: Listener): () => void {
    let set = this.channels.get(studioId);
    if (!set) this.channels.set(studioId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.channels.delete(studioId);
    };
  }

  invalidate(studioId: string, ...keys: string[][]) {
    this.deliver(studioId, { type: "invalidate", keys });
  }

  deliver(studioId: string, event: InvalidateEvent) {
    for (const listener of this.channels.get(studioId) ?? []) listener(event);
  }
}

const CHANNEL = "studio_events";

/**
 * Multi-instance bus over Postgres LISTEN/NOTIFY, for serverless hosts like
 * Vercel where the request that writes and the stream that should hear it
 * run in different instances. Each instance listens once and fans out locally.
 */
export class PostgresBus implements Bus {
  private local = new EventBus();
  private listening: Promise<unknown> | null = null;

  constructor(private pubsub: PubSub) {}

  subscribe(studioId: string, listener: Listener): () => void {
    this.listening ??= this.pubsub
      .listen(CHANNEL, (payload) => {
        try {
          const { studioId: id, keys } = JSON.parse(payload) as { studioId: string; keys: string[][] };
          this.local.deliver(id, { type: "invalidate", keys });
        } catch {
          // Ignore malformed notifications.
        }
      })
      .catch((err) => {
        this.listening = null;
        console.error("Event bus failed to listen", err);
      });
    return this.local.subscribe(studioId, listener);
  }

  invalidate(studioId: string, ...keys: string[][]) {
    // NOTIFY payloads max out near 8 KB; query keys are tiny.
    void this.pubsub.notify(CHANNEL, JSON.stringify({ studioId, keys })).catch((err) => {
      console.error("Event bus failed to notify", err);
    });
  }
}
