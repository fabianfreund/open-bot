import type { ServerEvent } from '@openbot/shared';

export type Unsubscribe = () => void;

/**
 * Fan-out of runtime events to every connected client. Intentionally tiny:
 * no filtering, no replay. Clients fetch state over REST, then follow the bus.
 */
export class EventBus {
  #listeners = new Set<(event: ServerEvent) => void>();

  subscribe(listener: (event: ServerEvent) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event: ServerEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A broken client must never break a turn.
      }
    }
  }

  get size(): number {
    return this.#listeners.size;
  }
}
