import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';

const File = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Where to put it, relative to the team folder, e.g. "main/voice.md" or "content/calendar.md".',
    ),
  content: z.string().min(1).describe('The file itself, in markdown.'),
});

const Input = z.object({
  goal: z
    .string()
    .optional()
    .describe('One or two sentences on what this team is for. Loaded into every bot\'s brief.'),
  handbook: z
    .string()
    .optional()
    .describe(
      'How the team works: voice, audience, rules, where files live. Loaded into every brief. Write the whole thing, not a patch.',
    ),
  folders: z
    .array(z.string())
    .optional()
    .describe(
      'Project folders to create, e.g. "content", "research". Everyone you hire can be given these. "main" already exists.',
    ),
  files: z
    .array(File)
    .optional()
    .describe(
      'Reference files to write now: voice, audience, links, a calendar. Paths under the folders you created.',
    ),
});

export const setupTeamSkill: Skill<z.infer<typeof Input>> = {
  id: 'setup_team',
  title: 'Set up the team',
  description:
    'After you know what the work is: set what the team is for, write the handbook every bot will load, make the folders the work needs, and put reference files in them. Do this before you hire.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    if (!input.goal && !input.handbook && !input.folders?.length && !input.files?.length) {
      return fail('Nothing to set up. Pass a goal, a handbook, folders, or files.');
    }
    const result = await ctx.host.setupTeam({
      agentId: ctx.agent.id,
      goal: input.goal,
      handbook: input.handbook,
      folders: input.folders,
      files: input.files,
    });
    const parts = [
      result.goal ? `The team is for: ${result.goal}` : '',
      result.handbook ? 'Handbook is in every brief.' : '',
      result.folders.length ? `Folders: ${result.folders.join(', ')}.` : '',
      result.files.length ? `Wrote ${result.files.join(', ')}.` : '',
    ].filter(Boolean);
    return ok(parts.join(' '), result);
  },
};
