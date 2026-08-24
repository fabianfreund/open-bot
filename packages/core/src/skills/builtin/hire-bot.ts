import { z } from 'zod';
import { fail, ok, unknownSkills, type Skill } from '../skill.js';

const Input = z.object({
  name: z.string().min(1).describe('What the new bot is called, e.g. "Research".'),
  role: z.string().default('').describe('One line on what they own.'),
  instructions: z
    .string()
    .default('')
    .describe('Their standing brief: what to do, how to work, what to avoid.'),
  sharedWorkspaces: z
    .array(z.string())
    .default([])
    .describe('Project folders they may work in, besides their own.'),
  skills: z
    .array(z.string())
    .optional()
    .describe(
      'What they are allowed to use. Leave this out to give them everything, or list only what the job needs. Run list_bots to see the choices.',
    ),
});

export const hireBotSkill: Skill<z.infer<typeof Input>> = {
  id: 'hire_bot',
  title: 'Hire a bot',
  description:
    'Add a new bot to the team when a job needs its own owner. Give them a name, what they own, and a clear brief.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    if (ctx.host.getAgent(input.name)) {
      return fail(`There is already a bot called "${input.name}". Pick another name.`);
    }
    if (input.skills) {
      const problem = unknownSkills(input.skills, ctx.host);
      if (problem) return fail(problem);
    }
    const created = await ctx.host.createAgent({
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      sharedWorkspaces: input.sharedWorkspaces,
      ...(input.skills ? { skills: input.skills } : {}),
      createdBy: ctx.agent.id,
    });
    return ok(
      `Hired ${created.name}. They have their own folder and can be reached with message_bot.`,
      { id: created.id, name: created.name },
    );
  },
};
