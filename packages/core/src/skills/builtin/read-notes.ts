import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';

/** Past this, a bot is reading the shelf rather than the notes it needs. */
const MAX = 10;

const Input = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX)
    .describe('The numbers recall gave you, all of them at once, e.g. [3, 7, 12].'),
});

export const readNotesSkill: Skill<z.infer<typeof Input>> = {
  id: 'read_notes',
  title: 'Read team notes in full',
  description:
    'Open team notes in full, by the numbers recall gave you. Ask for every one you need in a single call rather than one at a time. Only the notes recall marked (+) have anything beyond the sentence you already have.',
  input: Input,
  async run(input, ctx) {
    const ids = [...new Set(input.ids)];
    const notes = await ctx.host.readNotes(ids);

    if (notes.length === 0) {
      return fail(`No note numbered ${ids.join(', ')}. Use recall to see what there is.`);
    }

    const blocks = notes.map((note) => {
      const header = `Note ${note.id}, written by ${note.author} on ${note.createdAt.slice(0, 10)}${
        note.tags.length ? `, tagged ${note.tags.join(', ')}` : ''
      }.`;
      const replaced = note.supersededBy
        ? `This one is out of date. Note ${note.supersededBy} replaced it.`
        : '';
      return [header, note.summary, note.body.trim(), replaced].filter(Boolean).join('\n\n');
    });

    const found = new Set(notes.map((note) => note.id));
    const missing = ids.filter((id) => !found.has(id));
    // A wrong number in the list must not cost the caller the other nine.
    if (missing.length > 0) {
      blocks.push(`There is no note ${missing.join(', ')}.`);
    }

    return ok(blocks.join('\n\n---\n\n'), notes);
  },
};
