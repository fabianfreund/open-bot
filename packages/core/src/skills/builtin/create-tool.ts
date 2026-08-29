import path from 'node:path';
import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';
import { toolIdFromName } from '../team/parse.js';
import { writeTeamTool } from '../team/write.js';

const Field = z.object({
  name: z
    .string()
    .min(1)
    .describe('Lowercase with underscores. Becomes an argument the caller must pass.'),
  description: z.string().min(1).describe('What this argument is, in a short phrase.'),
});

const Input = z.object({
  name: z
    .string()
    .min(1)
    .describe('Short id, lowercase with underscores, e.g. "send_invoice".'),
  title: z.string().min(1).describe('A few words, as it should appear in the list.'),
  description: z
    .string()
    .min(1)
    .describe('When to use it, in one or two sentences. This is what a colleague reads first.'),
  instructions: z
    .string()
    .min(1)
    .describe('The playbook: steps, what to avoid, what a script expects. Keep it short.'),
  fields: z
    .array(Field)
    .optional()
    .describe('Named arguments. Leave out if a single blob of text is enough.'),
  script: z
    .string()
    .optional()
    .describe(
      'Optional JavaScript for scripts/run.js. Reads JSON on stdin, writes the result to stdout. The team folder is OPENBOT_PROJECT.',
    ),
});

export const createToolSkill: Skill<z.infer<typeof Input>> = {
  id: 'create_tool',
  title: 'Create a tool',
  description:
    'Add a tool to the team, or replace one that already exists. A tool is a named job with a playbook and an optional script. Read how_to_create_a_tool if you have not written one before.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    const id = toolIdFromName(input.name);
    if (!id) {
      return fail(
        `"${input.name}" is not a usable id. Use lowercase letters, numbers, and underscores, starting with a letter.`,
      );
    }

    const existing = ctx.host.listSkills().find((skill) => skill.id === id);
    if (existing && existing.source !== 'team') {
      return fail(`"${id}" is a built-in tool. Pick another name.`);
    }

    const fields = (input.fields ?? [])
      .map((field) => ({
        name: toolIdFromName(field.name) ?? '',
        description: field.description.trim(),
      }))
      .filter((field) => field.name);
    const badField = (input.fields ?? []).find((field) => !toolIdFromName(field.name));
    if (badField) {
      return fail(
        `"${badField.name}" is not a usable field name. Use lowercase letters, numbers, and underscores.`,
      );
    }

    await writeTeamTool({
      toolsDir: path.join(ctx.host.projectRoot, 'tools'),
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      instructions: input.instructions,
      fields,
      script: input.script,
    });
    await ctx.host.reloadTools();

    const title = input.title.trim();
    return existing
      ? ok(`Updated ${title} (\`${id}\`). It is live on the next turn.`, { id })
      : ok(`Added ${title} (\`${id}\`). Everyone with all tools can use it.`, { id });
  },
};
