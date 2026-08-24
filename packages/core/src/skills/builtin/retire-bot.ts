import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';

const Input = z.object({
  bot: z.string().min(1).describe('Who is leaving, by name.'),
  because: z.string().default('').describe('One line on why, for the record.'),
});

export const retireBotSkill: Skill<z.infer<typeof Input>> = {
  id: 'retire_bot',
  title: 'Retire a bot',
  description:
    'Take a colleague off the team when their job is done. Nothing is deleted: their folder, their work, and every chat stay exactly where they are, and you can still look them up.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    const target = ctx.host.getAgent(input.bot);
    if (!target) {
      const names = ctx.host
        .listAgents()
        .map((a) => a.name)
        .join(', ');
      return fail(`No bot called "${input.bot}". On the team: ${names || 'nobody yet'}.`);
    }
    if (target.id === ctx.agent.id) return fail('You cannot retire yourself.');

    await ctx.host.updateAgent(target.id, { archived: true });
    return ok(
      `${target.name} has left the team${input.because ? `: ${input.because}` : ''}. Their work is still in agents/${target.slug}/, and look_back still finds what they said.`,
    );
  },
};
