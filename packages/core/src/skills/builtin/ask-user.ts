import { z } from 'zod';
import { newId, questionCard } from '@openbot/shared';
import { ok, type Skill } from '../skill.js';

const Input = z.object({
  question: z.string().min(1).describe('One clear question, in plain words.'),
  options: z
    .array(z.string())
    .default([])
    .describe(
      'Answers they can tap instead of typing. Use these whenever the choices are obvious.',
    ),
  allowFreeText: z
    .boolean()
    .default(true)
    .describe('Let them write their own answer as well as picking an option.'),
});

export const askUserSkill: Skill<z.infer<typeof Input>> = {
  id: 'ask_user',
  title: 'Ask the user',
  description:
    'Ask the person a question. It appears in their chat as something they can tap or type an answer to. Use options whenever you can, because tapping beats typing.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    await ctx.host.sendToUser({
      from: ctx.agent.id,
      text: input.question,
      cards: [
        questionCard(newId('card'), {
          question: input.question,
          options: input.options,
          allowFreeText: input.allowFreeText || input.options.length === 0,
        }),
      ],
    });
    return ok(
      'The question is now in their chat. Do not repeat it in your reply. Say one short line about what happens next, then stop.',
    );
  },
};
