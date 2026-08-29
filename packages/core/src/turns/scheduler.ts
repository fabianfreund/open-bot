import type { Logger } from '../logger.js';

/** How long close() waits for in-flight turns after aborting them. */
const CLOSE_WAIT_MS = 8_000;

/**
 * Cap on provider turns running at once. Must stay above the delegation
 * depth so a bot waiting on a colleague does not stall the colleague.
 * `0` means no cap.
 */
const MAX_IN_FLIGHT: number = 8;

export interface ActiveTurn {
  controller: AbortController;
  depth: number;
  agentId: string;
}

/**
 * When work runs, and when it is cancelled. One conversation and one bot
 * never overlap. Changing the turn flow starts here, not in the runtime.
 */
export class TurnScheduler {
  #turns = new Map<string, ActiveTurn>();
  #queues = new Map<string, Promise<unknown>>();
  /** Child conversation -> the chat that asked it to work. */
  #originOf = new Map<string, string>();
  /** Bumped when a chat is stopped, so queued follow-ups no-op. */
  #epoch = new Map<string, number>();
  #inFlight = 0;
  #waiters: Array<() => void> = [];
  #closing = false;

  constructor(private readonly log?: Logger) {}

  get closing(): boolean {
    return this.#closing;
  }

  epoch(conversationId: string): number {
    return this.#epoch.get(conversationId) ?? 0;
  }

  cancelled(conversationId: string, epoch: number): boolean {
    return this.#closing || epoch !== this.epoch(conversationId);
  }

  turn(conversationId: string): ActiveTurn | undefined {
    return this.#turns.get(conversationId);
  }

  hasTurn(conversationId: string): boolean {
    return this.#turns.has(conversationId);
  }

  workingAgentIds(): Set<string> {
    return new Set([...this.#turns.values()].map((turn) => turn.agentId));
  }

  /**
   * One turn at a time per conversation and per bot. Two chats with the same
   * bot queue rather than sharing a workspace.
   */
  enqueue<T>(conversationId: string, agentId: string, task: () => Promise<T>): Promise<T> {
    const convKey = `c:${conversationId}`;
    const agentKey = `a:${agentId}`;
    const previous = Promise.all([
      this.#queues.get(convKey) ?? Promise.resolve(),
      this.#queues.get(agentKey) ?? Promise.resolve(),
    ]);
    const next = previous.then(task, task);
    this.#track(convKey, next);
    this.#track(agentKey, next);
    return next;
  }

  link(childConversationId: string, originConversationId: string): void {
    this.#originOf.set(childConversationId, originConversationId);
  }

  unlink(childConversationId: string): void {
    this.#originOf.delete(childConversationId);
  }

  /**
   * Reserves a slot for a turn. Returns the controller, or `undefined` if
   * this work was stopped while it waited.
   */
  async begin(options: {
    conversationId: string;
    agentId: string;
    depth: number;
    epoch: number;
  }): Promise<AbortController | undefined> {
    if (this.cancelled(options.conversationId, options.epoch)) return undefined;
    if (!(await this.#acquire())) return undefined;
    if (this.cancelled(options.conversationId, options.epoch)) {
      this.#release();
      return undefined;
    }

    const controller = new AbortController();
    this.#turns.set(options.conversationId, {
      controller,
      depth: options.depth,
      agentId: options.agentId,
    });
    if (this.cancelled(options.conversationId, options.epoch) || controller.signal.aborted) {
      this.#turns.delete(options.conversationId);
      this.#release();
      return undefined;
    }
    return controller;
  }

  end(conversationId: string): void {
    if (!this.#turns.delete(conversationId)) return;
    this.#release();
  }

  /**
   * Stops this chat, this bot, and any colleague still working because of it.
   * Queued follow-ups from the stopped work are dropped rather than run.
   */
  abort(conversationId: string, agentId?: string): boolean {
    const targets = this.#abortTargets(conversationId, agentId);
    let any = false;
    for (const id of targets) {
      this.#epoch.set(id, this.epoch(id) + 1);
      const turn = this.#turns.get(id);
      if (!turn) continue;
      turn.controller.abort();
      any = true;
    }
    return any;
  }

  async close(): Promise<void> {
    this.#closing = true;
    for (const turn of this.#turns.values()) turn.controller.abort();
    for (const wake of this.#waiters) wake();
    this.#waiters = [];

    const draining = Promise.allSettled([...this.#queues.values()]).then(() => undefined);
    let timedOut = false;
    await Promise.race([
      draining,
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, CLOSE_WAIT_MS);
        timer.unref?.();
      }),
    ]);
    if (timedOut) this.log?.warn('Turns did not stop in time; closing anyway');
  }

  #track(key: string, work: Promise<unknown>): void {
    const settled = work.catch(() => undefined);
    this.#queues.set(key, settled);
    void settled.then(() => {
      if (this.#queues.get(key) === settled) this.#queues.delete(key);
    });
  }

  #abortTargets(root: string, agentId?: string): Set<string> {
    const targets = new Set<string>([root]);
    if (agentId) {
      for (const [id, turn] of this.#turns) {
        if (turn.agentId === agentId) targets.add(id);
      }
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const [child, parent] of this.#originOf) {
        if (targets.has(parent) && !targets.has(child)) {
          targets.add(child);
          grew = true;
        }
      }
    }
    return targets;
  }

  async #acquire(): Promise<boolean> {
    if (MAX_IN_FLIGHT === 0) return !this.#closing;
    while (this.#inFlight >= MAX_IN_FLIGHT && !this.#closing) {
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
    if (this.#closing) return false;
    this.#inFlight += 1;
    return true;
  }

  #release(): void {
    if (MAX_IN_FLIGHT === 0) return;
    this.#inFlight = Math.max(0, this.#inFlight - 1);
    const wake = this.#waiters.shift();
    wake?.();
  }
}
