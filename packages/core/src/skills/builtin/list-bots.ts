import { z } from 'zod';
import { ok, type Skill } from '../skill.js';

const Input = z.object({});

export const listBotsSkill: Skill<z.infer<typeof Input>> = {
  id: 'list_bots',
  title: 'List the team',
  description: 'See every bot on the team, what they do, and how to reach them.',
  input: Input,
  async run(_input, ctx) {
    const others = ctx.host.listAgents().filter((a) => a.id !== ctx.agent.id);
    if (others.length === 0) {
      return ok('You are the only bot on the team right now. Use hire_bot to add a colleague.');
    }
    const lines = others.map((a) => `- ${a.name}${a.role ? `, ${a.role}` : ''}`);
    return ok(['Your colleagues:', ...lines].join('\n'), others.map((a) => ({ id: a.id, name: a.name, role: a.role })));
  },
};
