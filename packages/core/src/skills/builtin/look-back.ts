import { z } from 'zod';
import { ok, type Skill } from '../skill.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const Input = z.object({
  about: z
    .string()
    .default('')
    .describe('Words to look for, e.g. "brand colours". Leave empty to just go by date.'),
  since: z.string().optional().describe('Earliest day to look at, as YYYY-MM-DD.'),
  until: z.string().optional().describe('Latest day to look at, as YYYY-MM-DD.'),
  limit: z.number().int().min(1).max(50).default(12).describe('How many messages to bring back.'),
});

export const lookBackSkill: Skill<z.infer<typeof Input>> = {
  id: 'look_back',
  title: 'Look back over old chats',
  description:
    'Read older messages from your chats, by words or by date, including from before this session started. Use this whenever someone refers to something you cannot see any more, instead of guessing or saying you have forgotten.',
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

    const hits = await ctx.host.searchHistory({
      agentId: ctx.agent.id,
      ...(input.about.trim() ? { query: input.about.trim() } : {}),
      ...(input.since ? { since: input.since } : {}),
      ...(input.until ? { until: input.until } : {}),
      limit: input.limit,
    });

    const what = [
      input.about.trim() ? `"${input.about.trim()}"` : 'anything',
      input.since ? `since ${input.since}` : '',
      input.until ? `up to ${input.until}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (hits.length === 0) {
      return ok(
        `Nothing matching ${what} in any chat you have been part of. Team notes live in memory/ if it was written down instead.`,
      );
    }

    const lines = hits.map(
      (hit) => `- ${hit.at.slice(0, 10)}, ${hit.author} ${hit.where}: ${hit.excerpt}`,
    );
    return ok([`Older messages matching ${what}, newest first:`, ...lines].join('\n'), hits);
  },
};
