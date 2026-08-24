import { z } from 'zod';
import { ok, type Skill } from '../skill.js';

const Input = z.object({});

export const listBotsSkill: Skill<z.infer<typeof Input>> = {
  id: 'list_bots',
  title: 'List the team',
  description:
    'See every bot on the team, what they do, what they are allowed to use, and how to reach them.',
  input: Input,
  async run(_input, ctx) {
    const others = ctx.host.listAgents().filter((a) => a.id !== ctx.agent.id);
    const available = `Skills you can hand out: ${ctx.host
      .listSkills()
      .map((s) => s.id)
      .join(', ')}.`;

    if (others.length === 0) {
      return ok(
        `You are the only bot on the team right now. Use hire_bot to add a colleague.\n\n${available}`,
      );
    }

    const lines = others.map((a) => {
      const limited = a.skills.includes('*') ? '' : ` (limited to: ${a.skills.join(', ')})`;
      return `- ${a.name}${a.role ? `, ${a.role}` : ''}${limited}`;
    });
    return ok(
      ['Your colleagues:', ...lines, '', available].join('\n'),
      others.map((a) => ({ id: a.id, name: a.name, role: a.role, skills: a.skills })),
    );
  },
};
