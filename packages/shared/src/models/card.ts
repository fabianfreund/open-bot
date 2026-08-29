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

/** One question inside a `question` card. */
export interface QuestionItem {
  question: string;
  /** Suggested answers. Empty means free text only. */
  options: string[];
  /** Whether the person may type something other than the options. */
  allowFreeText: boolean;
  /** They can pick more than one option, then send. Default true. */
  allowMultiple?: boolean;
}

/** Props for the built-in `question` card. One question or several. */
export interface QuestionCardProps {
  /** Single-question form, still understood. Prefer `questions`. */
  question?: string;
  options?: string[];
  allowFreeText?: boolean;
  allowMultiple?: boolean;
  hint?: string;
  questions?: QuestionItem[];
}

export function questionCard(id: string, props: QuestionCardProps): Card {
  const questions = normalizeQuestions(props);
  return {
    id,
    type: 'question',
    props: questions.length === 1 && props.question ? { ...props } : { questions },
    answered: false,
  };
}

export function normalizeQuestions(props: QuestionCardProps): QuestionItem[] {
  if (props.questions && props.questions.length > 0) return props.questions;
  if (props.question) {
    return [
      {
        question: props.question,
        options: props.options ?? [],
        allowFreeText: props.allowFreeText ?? true,
        allowMultiple: props.allowMultiple,
      },
    ];
  }
  return [];
}

/** One thing a person can open from the chat. */
export interface LinkItem {
  label: string;
  /** A web address, or an absolute path to a file or folder on this computer. */
  target: string;
  /** One short line about what it is. */
  note?: string;
}

/** Props for the built-in `link` card. The message body says why; this is the what. */
export interface LinkCardProps {
  items: LinkItem[];
}

export function linkCard(id: string, props: LinkCardProps): Card {
  return {
    id,
    type: 'link',
    props: { ...props },
    answered: false,
  };
}
