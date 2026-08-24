import { useState } from 'react';
import type { QuestionCardProps } from '@openbot/shared';
import type { CardProps } from './types.js';

/**
 * A question with tappable answers. Tapping beats typing, which matters for
 * people who are not going to write a paragraph to a bot.
 */
export function QuestionCard({ card, onAnswer }: CardProps) {
  const props = card.props as unknown as QuestionCardProps;
  const [text, setText] = useState('');

  // Once answered, the person's own message sits directly below this one and
  // already says what they chose. Showing it twice is noise.
  if (card.answered) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {props.options?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {props.options.map((option) => (
            <button
              key={option}
              onClick={() => onAnswer(option)}
              className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[12.5px] hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            >
              {option}
            </button>
          ))}
        </div>
      )}
      {props.allowFreeText && (
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && text.trim()) onAnswer(text.trim());
            }}
            placeholder="Or type an answer"
            className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-field)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
          <button
            onClick={() => text.trim() && onAnswer(text.trim())}
            disabled={!text.trim()}
            className="rounded-lg bg-[var(--color-code)] px-2.5 text-[12.5px] disabled:opacity-30"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
