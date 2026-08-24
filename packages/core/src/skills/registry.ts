import { z } from 'zod';
import type { AgentDefinition, SkillInfo, SkillResult } from '@openbot/shared';
import type { Skill, SkillContext } from './skill.js';

/**
 * Holds every registered skill and decides which ones a given agent may call.
 */
export class SkillRegistry {
  #skills = new Map<string, Skill<any>>();
  #sources = new Map<string, string>();

  register(skill: Skill<any>, source = 'builtin'): void {
    if (this.#skills.has(skill.id)) throw new Error(`Skill "${skill.id}" is already registered`);
    this.#skills.set(skill.id, skill);
    this.#sources.set(skill.id, source);
  }

  registerAll(skills: Skill<any>[], source = 'builtin'): void {
    for (const skill of skills) this.register(skill, source);
  }

  get(id: string): Skill<any> | undefined {
    return this.#skills.get(id);
  }

  list(): SkillInfo[] {
    return [...this.#skills.values()].map((skill) => this.#describe(skill));
  }

  /** Resolves an agent's allow-list (`['*']` means everything). */
  forAgent(agent: AgentDefinition): SkillInfo[] {
    const allowAll = agent.skills.includes('*');
    return [...this.#skills.values()]
      .filter((skill) => allowAll || agent.skills.includes(skill.id))
      .map((skill) => this.#describe(skill));
  }

  async execute(id: string, rawInput: unknown, context: SkillContext): Promise<SkillResult> {
    const skill = this.#skills.get(id);
    if (!skill) return { ok: false, content: `There is no skill called "${id}".` };

    const allowAll = context.agent.skills.includes('*');
    if (!allowAll && !context.agent.skills.includes(id)) {
      return { ok: false, content: `${context.agent.name} is not allowed to use "${id}".` };
    }

    const parsed = skill.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        content: `Bad input for "${id}": ${issue?.path.join('.') ?? 'input'} is ${issue?.message ?? 'invalid'}`,
      };
    }

    try {
      return await skill.run(parsed.data, context);
    } catch (err) {
      return { ok: false, content: `"${id}" failed: ${(err as Error).message}` };
    }
  }

  #describe(skill: Skill<any>): SkillInfo {
    return {
      id: skill.id,
      title: skill.title,
      description: skill.description,
      inputSchema: z.toJSONSchema(skill.input, { io: 'input' }) as Record<string, unknown>,
      source: this.#sources.get(skill.id) ?? 'builtin',
      sensitive: skill.sensitive ?? false,
    };
  }
}
