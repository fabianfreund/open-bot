import { z } from 'zod';
import { ok, type Skill } from '../skill.js';

const Input = z.object({
  note: z
    .string()
    .min(1)
    .describe(
      'What the team should keep, in plain sentences. Say the thing itself, not that you are noting it. It is shortened and tagged for you.',
    ),
});

export const rememberSkill: Skill<z.infer<typeof Input>> = {
  id: 'remember',
  title: 'Write a team note',
  description:
    'Keep something for the whole team: a decision and why, a fact about the client or the work, a rule you have to work within, or something that went wrong. Not progress, not what you are about to do. It is filed against every note already on record, so you are told if it is new, if it corrected an older note, or if it was already covered.',
  input: Input,
  async run(input, ctx) {
    const outcome = await ctx.host.rememberNote({ agentId: ctx.agent.id, text: input.note });

    if (outcome.action === 'skipped') {
      return ok(`Not kept. ${outcome.reason} Nothing to do; carry on.`, outcome);
    }
    if (outcome.action === 'updated') {
      return ok(
        `Note ${outcome.replaced} was out of date, so it now reads: "${outcome.note.summary}" (note ${outcome.note.id}).`,
        outcome,
      );
    }
    return ok(`Kept as note ${outcome.note.id}: "${outcome.note.summary}".`, outcome);
  },
};
