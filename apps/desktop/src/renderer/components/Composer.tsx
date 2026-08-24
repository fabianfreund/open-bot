import { useRef, useState } from 'react';

interface Props {
  placeholder: string;
  busy: boolean;
  onSend(text: string): void;
  onStop(): void;
}

export function Composer({ placeholder, busy, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  return (
    <div className="px-6 pt-1 pb-5">
      <div className="mx-auto flex max-w-[720px] items-end gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            setText(event.target.value);
            const el = event.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-[180px] flex-1 resize-none bg-transparent py-1 text-[13.5px] outline-none placeholder:text-[var(--color-muted)]"
        />
        {busy ? (
          <button
            onClick={onStop}
            className="mb-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-code)] text-[var(--color-ink)] hover:opacity-80"
            title="Stop"
          >
            <span className="size-2.5 rounded-[2px] bg-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="mb-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-white disabled:opacity-30"
            title="Send"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
