import { z } from 'zod';
import { ok, type Skill } from '../skill.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Input = z.object({
  about: z
    .string()
    .default('')
    .describe('Words to look for, e.g. "brand colours". Leave empty to see the most recent notes.'),
  tags: z
    .array(z.string())
    .default([])
    .describe('Only notes carrying all of these tags, e.g. ["brand"].'),
  since: z.string().optional().describe('Earliest day to look at, as YYYY-MM-DD.'),
  until: z.string().optional().describe('Latest day to look at, as YYYY-MM-DD.'),
  limit: z.number().int().min(1).max(50).default(12).describe('How many notes to bring back.'),
});

export const recallSkill: Skill<z.infer<typeof Input>> = {
  id: 'recall',
  title: 'Search the team notes',
  description:
    'Look through everything the team has written down: decisions, client facts, rules, things that went wrong. You get one line per note, so this is cheap. Use it before starting anything you have not done before, and whenever someone refers to something the team settled earlier. Notes marked (+) have more than the sentence shown; read_notes opens as many of them as you like in one call.',
  input: Input,
  async run(input, ctx) {
    for (const [field, value] of [
      ['since', input.since],
      ['until', input.until],
    ] as const) {
      if (value && !DATE.test(value)) {
        return ok(`"${value}" is not a date. Write ${field} as YYYY-MM-DD, e.g. 2026-03-14.`);
      }
    }

    const notes = await ctx.host.recallNotes({
      text: input.about,
      tags: input.tags,
      ...(input.since ? { since: input.since } : {}),
      ...(input.until ? { until: input.until } : {}),
      limit: input.limit,
    });

    const what = [
      input.about.trim() ? `"${input.about.trim()}"` : '',
      input.tags.length ? `tagged ${input.tags.join(', ')}` : '',
      input.since ? `since ${input.since}` : '',
      input.until ? `up to ${input.until}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (notes.length === 0) {
      const tags = await ctx.host.noteTags();
      const shelf = tags.length ? ` Tags in use: ${tags.slice(0, 20).join(', ')}.` : '';
      return ok(
        `Nothing in the team notes${what ? ` matching ${what}` : ''}.${shelf} If you learn it now, remember it.`,
        notes,
      );
    }

    // The (+) is the whole point of the marker: without it a bot spends a call
    // fetching a body that was never there.
    const lines = notes.map(
      (note) =>
        `${note.id}.${note.body.trim() ? ' (+)' : ''} ${note.createdAt.slice(0, 10)}${
          note.tags.length ? ` [${note.tags.join(' ')}]` : ''
        } ${note.summary}`,
    );
    const longer = notes.filter((note) => note.body.trim()).map((note) => note.id);
    const footer = longer.length
      ? `read_notes with the numbers marked (+), all in one call: [${longer.join(', ')}].`
      : 'That is all of them in full; none has more than the sentence shown.';

    return ok(
      [what ? `Team notes matching ${what}:` : 'Most recent team notes:', ...lines, footer].join(
        '\n',
      ),
      notes,
    );
  },
};
