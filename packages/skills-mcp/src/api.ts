import { authedFetch, HttpError, type SkillInfo, type SkillResult } from '@openbot/shared';
import type { BridgeConfig } from './config.js';

/** Thin client for the two endpoints the bridge needs. */
export class OpenBotApi {
  constructor(private readonly config: BridgeConfig) {}

  async listSkills(): Promise<SkillInfo[]> {
    const res = await this.#fetch(`/api/agents/${this.config.agentId}/skills`);
    return (await res.json()) as SkillInfo[];
  }

  async invoke(skillId: string, input: unknown): Promise<SkillResult> {
    const res = await this.#fetch(`/api/skills/${skillId}/invoke`, {
      method: 'POST',
      body: {
        agentId: this.config.agentId,
        conversationId: this.config.conversationId,
        input: input ?? {},
      },
    });
    return (await res.json()) as SkillResult;
  }

  async #fetch(path: string, options: { method?: string; body?: unknown } = {}): Promise<Response> {
    try {
      return await authedFetch({
        baseUrl: this.config.serverUrl,
        token: this.config.token,
        path,
        method: options.method,
        body: options.body,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        throw new Error(`OpenBot ${path} responded ${err.status}: ${err.detail}`);
      }
      throw err;
    }
  }
}
