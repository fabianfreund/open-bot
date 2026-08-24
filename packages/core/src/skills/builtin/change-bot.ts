import { z } from 'zod';
import { fail, ok, unknownSkills, type Skill } from '../skill.js';

const Input = z.object({
  bot: z.string().min(1).describe('Who to change, by name.'),
  name: z
    .string()
    .optional()
    .describe('A new name. Their chat and their work stay where they are.'),
  role: z.string().optional().describe('One line on what they own.'),
  instructions: z
    .string()
    .optional()
    .describe('Replaces their standing brief. Write the whole brief, not a change to it.'),
  sharedWorkspaces: z
    .array(z.string())
    .optional()
    .describe('Project folders they may work in, besides their own.'),
  skills: z
    .array(z.string())
    .optional()
    .describe(
      'What they are allowed to use. Use ["*"] for everything. Run list_bots to see the choices.',
    ),
});

export const changeBotSkill: Skill<z.infer<typeof Input>> = {
  id: 'change_bot',
  title: 'Change a bot',
  description:
    'Rename a colleague, rewrite what they own or how they work, or change what they are allowed to use. Use this instead of hiring a second bot for the same job.',
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

    if (input.name && input.name.trim() !== target.name) {
      const clash = ctx.host.getAgent(input.name);
      if (clash && clash.id !== target.id) {
        return fail(`There is already a bot called "${input.name}". Pick another name.`);
      }
    }

    if (input.skills) {
      if (target.id === ctx.agent.id) {
        return fail('You cannot change what you yourself are allowed to use.');
      }
      const problem = unknownSkills(input.skills, ctx.host);
      if (problem) return fail(problem);
    }

    const updated = await ctx.host.updateAgent(target.id, {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.sharedWorkspaces ? { sharedWorkspaces: input.sharedWorkspaces } : {}),
      ...(input.skills ? { skills: input.skills } : {}),
    });

    const changed = [
      input.name ? 'name' : '',
      input.role !== undefined ? 'what they own' : '',
      input.instructions !== undefined ? 'their brief' : '',
      input.sharedWorkspaces ? 'their folders' : '',
      input.skills ? 'what they may use' : '',
    ].filter(Boolean);

    return changed.length === 0
      ? ok(`Nothing to change on ${updated.name}.`)
      : ok(`Updated ${updated.name}: ${changed.join(', ')}.`, {
          id: updated.id,
          name: updated.name,
        });
  },
};
