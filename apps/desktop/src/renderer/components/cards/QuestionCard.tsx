import { useState } from 'react';
import { normalizeQuestions, type QuestionCardProps, type QuestionItem } from '@openbot/shared';
import type { CardProps } from './types.js';

/**
 * Tappable answers. Chips toggle; Send (or Done, for several questions)
 * submits whatever is selected, plus anything typed.
 */
export function QuestionCard({ card, onAnswer }: CardProps) {
  const props = card.props as unknown as QuestionCardProps;
  const questions = normalizeQuestions(props);
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const [drafts, setDrafts] = useState<string[]>(() => questions.map(() => ''));

  if (card.answered) return null;
  if (questions.length === 0) return null;

  const many = questions.length > 1;

  const answerAt = (index: number): string => {
    const selected = (picked[index] ?? []).join(', ');
    const extra = drafts[index]?.trim() ?? '';
    if (selected && extra) return `${selected}, ${extra}`;
    return selected || extra;
  };

  const submit = () => {
    const lines = questions.map((item, index) => {
      const value = answerAt(index);
      if (!value) return '';
      return many ? `${item.question} ${value}` : value;
    });
    const text = lines.filter(Boolean).join('\n');
    if (text) onAnswer(text);
  };

  const choose = (index: number, option: string) => {
    const item = questions[index]!;
    setPicked((current) => {
      const next = current.map((row) => [...row]);
      const row = next[index] ?? [];
      if (item.allowMultiple !== false) {
        next[index] = row.includes(option)
          ? row.filter((value) => value !== option)
          : [...row, option];
      } else {
        next[index] = row.includes(option) ? [] : [option];
      }
      return next;
    });
  };

  const ready = questions.every((_, index) => Boolean(answerAt(index)));

  return (
    <div className="mt-2.5 space-y-3">
      {questions.map((item, index) => (
        <QuestionBlock
          key={item.question}
          item={item}
          showLabel={many}
          selected={picked[index] ?? []}
          draft={drafts[index] ?? ''}
          showSend={!many}
          canSend={ready}
          onDraft={(value) =>
            setDrafts((current) => current.map((row, i) => (i === index ? value : row)))
          }
          onChoose={(option) => choose(index, option)}
          onSend={submit}
        />
      ))}
      {many && (
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!ready}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[12.5px] text-white disabled:opacity-30"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionBlock({
  item,
  showLabel,
  selected,
  draft,
  showSend,
  canSend,
  onDraft,
  onChoose,
  onSend,
}: {
  item: QuestionItem;
  showLabel: boolean;
  selected: string[];
  draft: string;
  showSend: boolean;
  canSend: boolean;
  onDraft(value: string): void;
  onChoose(option: string): void;
  onSend(): void;
}) {
  const freeText = item.allowFreeText !== false;
  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="text-[12.5px] font-medium text-[var(--color-ink)]">{item.question}</div>
      )}
      {item.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.options.map((option) => {
            const on = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChoose(option)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                  on
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                    : 'border-[var(--color-line)] hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
      {(freeText || showSend) && (
        <div className="flex gap-1.5">
          {freeText && (
            <input
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSend) onSend();
              }}
              placeholder={item.options.length > 0 ? 'Or type an answer' : 'Type an answer'}
              className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-field)] px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
            />
          )}
          {showSend && (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="rounded-lg bg-[var(--color-code)] px-2.5 text-[12.5px] disabled:opacity-30"
            >
              Send
            </button>
          )}
        </div>
      )}
    </div>
  );
}
