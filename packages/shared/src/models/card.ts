import { z } from 'zod';

/**
 * Cards are interactive blocks rendered inline in the chat, a question with
 * options, a confirmation, a summary. They are how a bot asks for something
 * without making the person type a sentence.
 *
 * The shape is deliberately open: `type` selects a renderer and `props` is
 * whatever that renderer needs. Adding a card means adding a renderer in the
 * app and a builder in core, nothing here changes.
 */
export const CardSchema = z.object({
  id: z.string(),
  /** Selects the renderer, e.g. `question`. Unknown types render as plain text. */
  type: z.string(),
  props: z.record(z.string(), z.unknown()).default({}),
  /** Cards stay in the transcript after use, showing what was chosen. */
  answered: z.boolean().default(false),
  answer: z.string().optional(),
});
export type Card = z.infer<typeof CardSchema>;

/** Props for the built-in `question` card. */
export interface QuestionCardProps {
  question: string;
  /** Suggested answers. Empty means free text only. */
  options: string[];
  /** Whether the person may type something other than the options. */
  allowFreeText: boolean;
  /** Optional label above the options, e.g. "Pick one". */
  hint?: string;
}

export function questionCard(id: string, props: QuestionCardProps): Card {
  return {
    id,
    type: 'question',
    props: { ...props },
    answered: false,
  };
}
