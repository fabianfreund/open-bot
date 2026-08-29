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
    .default(['main'])
    .describe(
      'Project folders they may work in, besides their own. Default is main. Add any folders setup_team created that this job needs.',
    ),
  intro: z
    .string()
    .optional()
    .describe(
      'Their first message to the person, in their voice: who they are and what they can take on. Skip it and a short hello is written from their name and role.',
    ),
  tools: z
    .array(z.string())
    .optional()
    .describe(
      'What they are allowed to use. Leave this out to give them everything, or list only what the job needs. Run list_bots to see the choices.',
    ),
  pinned: z
    .boolean()
    .default(false)
    .describe(
      "Pin them at the top of the person's list. Use this for the manager, the one they should talk to about the work.",
    ),
});

export const hireBotSkill: Skill<z.infer<typeof Input>> = {
  id: 'hire_bot',
  title: 'Hire a bot',
  description:
    'Add a new bot to the team when a job needs its own owner. Give them a name, what they own, and a clear brief. Pin the manager so they sit at the top of the list.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    if (ctx.host.getAgent(input.name)) {
      return fail(`There is already a bot called "${input.name}". Pick another name.`);
    }
    if (input.tools) {
      const problem = unknownSkills(input.tools, ctx.host);
      if (problem) return fail(problem);
    }
    const created = await ctx.host.createAgent({
      name: input.name,
      role: input.role,
      instructions: input.instructions,
      sharedWorkspaces: input.sharedWorkspaces,
      ...(input.tools ? { skills: input.tools } : {}),
      createdBy: ctx.agent.id,
      pinned: input.pinned,
    });
    const intro =
      input.intro?.trim() ||
      [`Hi, I'm ${created.name}.`, created.role.trim(), "I'll be here when you need me."]
        .filter(Boolean)
        .join(' ');
    await ctx.host.sendToUser({ from: created.id, text: intro, waiting: false });
    return ok(
      `Hired ${created.name}. They said hello in their own chat. Reach them with message_bot.`,
      { id: created.id, name: created.name },
    );
  },
};
