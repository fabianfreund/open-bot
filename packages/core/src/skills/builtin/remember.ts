import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { slugify } from '@openbot/shared';
import { ok, type Skill } from '../skill.js';

const Input = z.object({
  title: z.string().min(1).describe('Short title, e.g. "Brand voice".'),
  note: z.string().min(1).describe('What the team should remember. Markdown is fine.'),
});

export const rememberSkill: Skill<z.infer<typeof Input>> = {
  id: 'remember',
  title: 'Write a team note',
  description:
    'Save something the whole team should know. Notes live in memory/ and every bot can read them.',
  input: Input,
  async run(input, ctx) {
    const dir = path.join(ctx.host.projectRoot, 'memory');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${slugify(input.title)}.md`);
    const body = `# ${input.title}\n\n${input.note.trim()}\n\n_${ctx.agent.name}, ${new Date().toISOString().slice(0, 10)}_\n`;
    await fs.writeFile(file, body, 'utf8');
    return ok(`Saved to memory/${path.basename(file)}.`);
  },
};
