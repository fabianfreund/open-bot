import { z } from 'zod';
import { newId, questionCard } from '@openbot/shared';
import { fail, ok, type Skill } from '../skill.js';

const Item = z.object({
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
  allowMultiple: z
    .boolean()
    .default(true)
    .describe('They can pick more than one option, then send. Turn off only when one answer is required.'),
});

const Input = z.object({
  intro: z
    .string()
    .optional()
    .describe(
      'Said above the questions. A thank you, or why you are asking. Skip it if the questions are enough.',
    ),
  questions: z
    .array(Item)
    .min(1)
    .max(6)
    .optional()
    .describe('Several questions in one card. Use this when you need a few facts at once.'),
  question: z.string().min(1).optional().describe('A single question. Prefer `questions` for more than one.'),
  options: z.array(z.string()).default([]),
  allowFreeText: z.boolean().default(true),
  allowMultiple: z.boolean().default(true),
});

export const askUserSkill: Skill<z.infer<typeof Input>> = {
  id: 'ask_user',
  title: 'Ask the user',
  description:
    'Ask the person one question or several at once. They appear in their chat as things they can tap. Use options whenever you can. Several questions in one call when they belong together, so they are not answering you all afternoon.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    const questions = input.questions?.length
      ? input.questions
      : input.question
        ? [
            {
              question: input.question,
              options: input.options,
              allowFreeText: input.allowFreeText || input.options.length === 0,
              allowMultiple: input.allowMultiple,
            },
          ]
        : [];
    if (questions.length === 0) return fail('Ask at least one question.');

    const body =
      input.intro?.trim() ||
      (questions.length === 1 ? questions[0]!.question : 'A few things would help.');

    await ctx.host.sendToUser({
      from: ctx.agent.id,
      text: body,
      cards: [
        questionCard(newId('card'), {
          questions: questions.map((item) => ({
            question: item.question,
            options: item.options,
            allowFreeText: item.allowFreeText || item.options.length === 0,
            allowMultiple: item.allowMultiple,
          })),
        }),
      ],
    });
    return ok(
      questions.length === 1
        ? 'The question is now in their chat. Do not repeat it in your reply. Say one short line about what happens next, then stop.'
        : 'The questions are now in their chat. Do not repeat them in your reply. Say one short line about what happens next, then stop.',
    );
  },
};
