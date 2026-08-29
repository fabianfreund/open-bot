import type { ProviderHealth, ProviderInfo } from '@openbot/shared';
import type { Provider } from './provider.js';

/** Providers keyed by id. Register at startup; look up per turn. */
export class ProviderRegistry {
  #providers = new Map<string, Provider>();

  register(provider: Provider): void {
    if (this.#providers.has(provider.info.id)) {
      throw new Error(`Provider "${provider.info.id}" is already registered`);
    }
    this.#providers.set(provider.info.id, provider);
  }

  registerAll(providers: Provider[]): void {
    for (const provider of providers) this.register(provider);
  }

  get(id: string): Provider {
    const provider = this.#providers.get(id);
    if (!provider) {
      throw new Error(
        `Unknown provider "${id}". Registered: ${[...this.#providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }

  has(id: string): boolean {
    return this.#providers.has(id);
  }

  list(): ProviderInfo[] {
    return [...this.#providers.values()].map((p) => p.info);
  }

  async health(): Promise<ProviderHealth[]> {
    return Promise.all([...this.#providers.values()].map((p) => p.health()));
  }

  /** Tells every provider to drop a cached session for this bot, or one chat. */
  release(agentId?: string, conversationId?: string): void {
    for (const provider of this.#providers.values()) {
      provider.release?.(agentId, conversationId);
    }
  }
}
