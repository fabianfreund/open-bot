import type { ServerEvent } from '@openbot/shared';

export interface EventStreamHandlers {
  onEvent(event: ServerEvent): void;
  onStatus?(status: 'connecting' | 'open' | 'closed'): void;
  /**
   * The host rejected the token, which means it is serving a different team
   * now. Retrying cannot fix that, so the app re-reads where it should be.
   */
  onUnauthorized?(): void;
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

/** Matches the close code the server sends for a bad token. */
const UNAUTHORIZED_CODE = 4401;

/**
 * A reconnecting socket. Over a tailnet the link drops when a laptop sleeps,
 * so reconnecting is the normal case, not an error path.
 */
export class EventStream {
  #socket?: WebSocket;
  #attempt = 0;
  #closed = false;
  #timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly url: string,
    private readonly handlers: EventStreamHandlers,
  ) {
    this.#open();
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#socket?.close();
    this.handlers.onStatus?.('closed');
  }

  #open(): void {
    if (this.#closed) return;
    this.handlers.onStatus?.('connecting');
    const socket = new WebSocket(this.url);
    this.#socket = socket;

    socket.onopen = () => {
      this.#attempt = 0;
      this.handlers.onStatus?.('open');
    };
    socket.onmessage = (event) => {
      try {
        this.handlers.onEvent(JSON.parse(String(event.data)) as ServerEvent);
      } catch {
        // Ignore a frame we cannot parse rather than tearing down the stream.
      }
    };
    socket.onclose = (event) => {
      if (this.#closed) return;
      if (event.code === UNAUTHORIZED_CODE) {
        this.#closed = true;
        this.handlers.onUnauthorized?.();
        return;
      }
      this.handlers.onStatus?.('closed');
      const delay = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)] ?? 8000;
      this.#attempt += 1;
      this.#timer = setTimeout(() => this.#open(), delay);
    };
    socket.onerror = () => socket.close();
  }
}
