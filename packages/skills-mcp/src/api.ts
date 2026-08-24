import type { SkillInfo, SkillResult } from '@openbot/shared';
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
      body: JSON.stringify({
        agentId: this.config.agentId,
        conversationId: this.config.conversationId,
        input: input ?? {},
      }),
    });
    return (await res.json()) as SkillResult;
  }

  async #fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.config.serverUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.token}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`OpenBot ${path} responded ${res.status}: ${await res.text()}`);
    }
    return res;
  }
}
